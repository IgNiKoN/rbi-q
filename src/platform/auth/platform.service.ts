/**
 * Один вход Platform 2.0 (P2-0013, ADR-064): кто вошёл и как, мои компании и доступные модули — по ответу сервера pf_my_platform.
 * Способы входа: почта + пароль (сессия Supabase, auth.service — единственное хранилище сессии), старый PIN Quality
 * (свой код sync-*.js, здесь только «вошёл ли»), демо без входа (выбор запоминается на устройстве).
 * Права здесь не решаются: модули и признаки приходят с сервера; меню и экраны только читают это состояние.
 */
import type { AuthApi, SignInResult } from './auth.service.ts';

export type EntryMode = 'none' | 'email' | 'pin' | 'demo';

export interface PlatformCompany {
  id: string;
  name: string;
  is_test: boolean;
  roles: string[];
  modules: string[];
  can_manage_company: boolean;
}

export interface PlatformState {
  mode: EntryMode;
  email: string | null;
  isPlatformAdmin: boolean;
  companies: PlatformCompany[];
  companyId: string | null;
  /** P2-0028: ФИО вошедшего (ядро, pf_my_profile) и «сначала придумайте свой пароль» (временный пароль от администратора). */
  fullName?: string | null;
  mustChangePassword?: boolean;
  userId?: string | null;
}

/** Флаги для меню и Настроек (window.RBI.platformMenuAccess): модули выбранной компании, «Компания», «Администрирование платформы». */
export type PlatformAccess = Record<string, boolean>;

export interface PlatformDeps {
  auth: AuthApi | null;
  rpc: ((fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>) | null;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  /** Вошёл ли человек по старому PIN-входу Quality (облако Quality включено и подключено). */
  pinActive: () => boolean;
}

/** Ключи устройства — только свои (platform2_*); ключи старого Quality не читаются и не пишутся. */
export const ENTRY_KEY = 'platform2_entry';
export const COMPANY_KEY = 'platform2_company';

const EMPTY: PlatformState = { mode: 'none', email: null, isPlatformAdmin: false, companies: [], companyId: null };

function safeGet(s: PlatformDeps['storage'], k: string): string | null {
  try { return s ? s.getItem(k) : null; } catch { return null; }
}
function safeSet(s: PlatformDeps['storage'], k: string, v: string | null): void {
  try { if (!s) return; if (v === null) s.removeItem(k); else s.setItem(k, v); } catch { /* приватный режим — без запоминания */ }
}

export function parsePlatform(data: unknown): { isPlatformAdmin: boolean; companies: PlatformCompany[] } {
  const d = (data && typeof data === 'object' ? data : {}) as { is_platform_admin?: unknown; companies?: unknown };
  const list = Array.isArray(d.companies) ? d.companies : [];
  return {
    isPlatformAdmin: d.is_platform_admin === true,
    companies: list.map((c: Record<string, unknown>) => ({
      id: String(c.id), name: String(c.name || ''), is_test: c.is_test === true,
      roles: Array.isArray(c.roles) ? c.roles.map(String) : [],
      modules: Array.isArray(c.modules) ? c.modules.map(String) : [],
      can_manage_company: c.can_manage_company === true
    }))
  };
}

export function parseProfile(data: unknown): { fullName: string | null; mustChangePassword: boolean; userId: string | null } {
  const d = (data && typeof data === 'object' ? data : {}) as { full_name?: unknown; must_change_password?: unknown; user_id?: unknown };
  return { fullName: typeof d.full_name === 'string' && d.full_name ? d.full_name : null, mustChangePassword: d.must_change_password === true,
    userId: typeof d.user_id === 'string' ? d.user_id : null };
}

export function accessFor(st: PlatformState): PlatformAccess {
  const cur = st.companies.find((c) => c.id === st.companyId) || null;
  const a: PlatformAccess = {
    company: st.mode === 'email' && st.companies.some((c) => c.can_manage_company),
    platformAdmin: st.mode === 'email' && st.isPlatformAdmin
  };
  if (st.mode === 'email' && cur) for (const m of cur.modules) a[m] = true;
  return a;
}

/** Ключ роутера оболочки (js/core/router.js): последний экран модуля, Настройки туда не пишутся. */
export const LAST_MODULE_HASH_KEY = 'rbi_last_module_hash';

/**
 * P2-0030: куда вести после входа почтой — последний открытый модуль, если он ещё доступен у компании;
 * иначе как раньше: План/Факт, без него — Настройки.
 */
export function homePathFor(a: PlatformAccess, lastHash: string | null): string {
  const h = String(lastHash || '');
  const modules: Array<[RegExp, string]> = [[/^#\/planfact(\/|$)/, 'planfact'], [/^#\/quality(\/|$)/, 'quality'], [/^#\/construction(-v2)?(\/|$)/, 'construction']];
  for (const [re, id] of modules) if (re.test(h) && a[id] === true) return h;
  return a.planfact ? '#/planfact' : '#/settings';
}

export interface Platform {
  boot(): Promise<PlatformState>;
  refresh(): Promise<PlatformState>;
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  /** P2-0028: сменить свой пароль (Auth) и снять флаг на сервере (pf_password_changed). */
  changePassword(password: string): Promise<SignInResult>;
  /** P2-0028: своё ФИО (pf_set_full_name; сервер переписывает имя в моих записях Качества). */
  setFullName(name: string): Promise<SignInResult>;
  chooseDemo(): void;
  setCompany(id: string): void;
  getState(): PlatformState;
  access(): PlatformAccess;
  subscribe(cb: (st: PlatformState) => void): () => void;
}

export function createPlatform(deps: PlatformDeps): Platform {
  let state: PlatformState = { ...EMPTY };
  const subs = new Set<(st: PlatformState) => void>();
  const emit = (): void => { for (const cb of subs) cb(state); };

  async function loadEmail(email: string): Promise<PlatformState> {
    let parsed = { isPlatformAdmin: false, companies: [] as PlatformCompany[] };
    let profile = { fullName: null as string | null, mustChangePassword: false, userId: null as string | null };
    if (deps.rpc) {
      const [pl, pr] = await Promise.all([deps.rpc('pf_my_platform'), deps.rpc('pf_my_profile')]);
      if (!pl.error) parsed = parsePlatform(pl.data);
      if (!pr.error) profile = parseProfile(pr.data);
    }
    const saved = safeGet(deps.storage, COMPANY_KEY);
    const companyId = parsed.companies.some((c) => c.id === saved) ? saved
      : (parsed.companies.find((c) => c.modules.length > 0) || parsed.companies[0] || null)?.id || null;
    return { mode: 'email', email, isPlatformAdmin: parsed.isPlatformAdmin, companies: parsed.companies, companyId, ...profile };
  }

  async function refresh(): Promise<PlatformState> {
    const email = deps.auth ? await deps.auth.getEmail() : null;
    if (email) {
      state = await loadEmail(email);
      safeSet(deps.storage, ENTRY_KEY, null);
    } else if (deps.pinActive()) {
      state = { ...EMPTY, mode: 'pin' };
    } else if (safeGet(deps.storage, ENTRY_KEY) === 'demo') {
      state = { ...EMPTY, mode: 'demo' };
    } else {
      state = { ...EMPTY };
    }
    emit();
    return state;
  }

  return {
    boot: refresh,
    refresh,
    async signIn(email, password) {
      if (!deps.auth) return { ok: false, message: 'Сервер не настроен — вход недоступен' };
      if (!email.trim() || !password) return { ok: false, message: 'Введите почту и пароль' };
      const res = await deps.auth.signIn(email, password);
      if (res.ok) await refresh();
      return res;
    },
    async signOut() {
      if (deps.auth) await deps.auth.signOut();
      safeSet(deps.storage, ENTRY_KEY, null);
      safeSet(deps.storage, COMPANY_KEY, null);
      state = { ...EMPTY };
      emit();
    },
    async changePassword(password) {
      if (!deps.auth || !deps.auth.changePassword || !deps.rpc) return { ok: false, message: 'Сервер не настроен' };
      const res = await deps.auth.changePassword(password);
      if (!res.ok) return res;
      const { error } = await deps.rpc('pf_password_changed');
      if (error) return { ok: false, message: 'Пароль сменён, но сервер не принял отметку — войдите заново новым паролем' };
      await refresh();
      return { ok: true };
    },
    async setFullName(name) {
      if (!deps.rpc || state.mode !== 'email' || !state.userId) return { ok: false, message: 'Сервер не настроен' };
      const { error } = await deps.rpc('pf_set_full_name', { p_user: state.userId, p_full_name: name });
      if (error) {
        const m = String((error as { message?: unknown }).message || '');
        return { ok: false, message: /[А-Яа-яЁё]/.test(m) ? m : 'Не удалось сохранить ФИО. Попробуйте ещё раз' };
      }
      await refresh();
      return { ok: true };
    },
    chooseDemo() {
      safeSet(deps.storage, ENTRY_KEY, 'demo');
      state = { ...EMPTY, mode: 'demo' };
      emit();
    },
    setCompany(id) {
      if (state.mode !== 'email' || !state.companies.some((c) => c.id === id) || state.companyId === id) return;
      safeSet(deps.storage, COMPANY_KEY, id);
      state = { ...state, companyId: id };
      emit();
    },
    getState: () => state,
    access: () => accessFor(state),
    subscribe(cb) { subs.add(cb); return () => { subs.delete(cb); }; }
  };
}
