/**
 * Один вход Platform 2.0 (P2-0013, ADR-064): кто вошёл и как, мои компании и доступные модули — по ответу сервера pf_my_platform.
 * Способы входа: почта + пароль (сессия Supabase, auth.service — единственное хранилище сессии), старый PIN Quality
 * (свой код sync-*.js, здесь только «вошёл ли»), демо без входа (выбор запоминается на устройстве).
 * Права здесь не решаются: модули и признаки приходят с сервера; меню и экраны только читают это состояние.
 */
import type { AuthApi, SessionState, SignInResult } from './auth.service.ts';
import { deviceUserKey } from './quality-bridge.ts';

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
  /** P2-0058: сервер не ответил (нет связи / недоступен) — компании и права из копии последнего ответа сервера на устройстве
   *  (только для меню, выбора базы и кэша; права при отправке проверяет сервер); мост не меняет базу Качества. */
  offline?: boolean;
  /** P2-0058: когда сервер последний раз подтвердил вход и права (ISO). */
  confirmedAt?: string | null;
  /** P2-0058: экран «Вход» показан не потому, что не входили: 'stale' — без связи больше 14 дней (данные на устройстве целы). */
  loginReason?: 'stale';
}

/** Флаги для меню и Настроек (window.RBI.platformMenuAccess): модули выбранной компании, «Компания», «Администрирование платформы». */
export type PlatformAccess = Record<string, boolean>;

export interface PlatformDeps {
  auth: AuthApi | null;
  /** status — HTTP-ответ сервера (0 / нет — запрос не дошёл): «нет связи» отличается от ответа сервера с ошибкой. */
  rpc: ((fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown; status?: number }>) | null;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  /** Вошёл ли человек по старому PIN-входу Quality (облако Quality включено и подключено). */
  pinActive: () => boolean;
  now?: () => number;
}

/** Ключи устройства — только свои (platform2_*); ключи старого Quality не читаются и не пишутся. */
export const ENTRY_KEY = 'platform2_entry';
export const COMPANY_KEY = 'platform2_company';

/** P2-0058: копия последнего ответа сервера (pf_my_platform + pf_my_profile) — у каждого вошедшего своя (ключ без почты). */
export const DEVICE_ACCESS_PREFIX = 'platform2_device_access_';
/** «Вошёл без связи» — не дольше 14 дней с последнего подтверждения сервером (решение владельца 28.10.2026). */
export const OFFLINE_DAYS = 14;
const DAY_MS = 24 * 3600 * 1000;

interface DeviceCopy { at: string; platform: unknown; profile: unknown }
export function readDeviceCopy(s: PlatformDeps['storage'], email: string): DeviceCopy | null {
  try {
    const c = JSON.parse(safeGet(s, DEVICE_ACCESS_PREFIX + deviceUserKey(email)) || 'null') as DeviceCopy | null;
    return c && typeof c.at === 'string' ? c : null;
  } catch { return null; }
}

/** Последнее подтверждение сервером: копия ответа или выдача входа (кто входил до P2-0058 — копии ещё нет). */
export function lastConfirmed(copy: DeviceCopy | null, issuedAtSec: number | null): number | null {
  const a = copy ? Date.parse(copy.at) : NaN;
  const b = issuedAtSec ? issuedAtSec * 1000 : NaN;
  const best = Math.max(Number.isNaN(a) ? -Infinity : a, Number.isNaN(b) ? -Infinity : b);
  return Number.isFinite(best) ? best : null;
}
/** Нет ответа сервера: запрос не дошёл (статуса нет / 0) или сервер недоступен (5xx). Ответ 4xx — это ответ. */
export function noAnswer(r: { error: unknown; status?: number }): boolean {
  return !!r.error && (!r.status || r.status >= 500);
}
export function offlineExpired(confirmed: number | null, now: number): boolean {
  return confirmed === null || now - confirmed > OFFLINE_DAYS * DAY_MS;
}

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

  const now = (): number => (deps.now ? deps.now() : Date.now());

  function fromParts(email: string, parsed: { isPlatformAdmin: boolean; companies: PlatformCompany[] },
    profile: { fullName: string | null; mustChangePassword: boolean; userId: string | null }): PlatformState {
    const saved = safeGet(deps.storage, COMPANY_KEY);
    const companyId = parsed.companies.some((c) => c.id === saved) ? saved
      : (parsed.companies.find((c) => c.modules.length > 0) || parsed.companies[0] || null)?.id || null;
    return { mode: 'email', email, isPlatformAdmin: parsed.isPlatformAdmin, companies: parsed.companies, companyId, ...profile };
  }

  /** Без ответа сервера: копия последнего ответа этого человека (нет копии — без компаний). */
  function fromDevice(email: string, issuedAt: number | null): PlatformState {
    const copy = readDeviceCopy(deps.storage, email);
    const confirmed = lastConfirmed(copy, issuedAt);
    const base = copy ? fromParts(email, parsePlatform(copy.platform), parseProfile(copy.profile))
      : fromParts(email, { isPlatformAdmin: false, companies: [] }, { fullName: null, mustChangePassword: false, userId: null });
    return { ...base, offline: true, confirmedAt: confirmed === null ? null : new Date(confirmed).toISOString() };
  }

  async function loadEmail(email: string, issuedAt: number | null): Promise<PlatformState> {
    if (!deps.rpc) return fromParts(email, { isPlatformAdmin: false, companies: [] }, { fullName: null, mustChangePassword: false, userId: null });
    // P2-0058: запрос не дошёл или сервер недоступен (нет HTTP-ответа / 5xx) — не ответ «компаний нет»: копия последнего ответа
    // сервера; сервер ответил ошибкой (4xx) — как раньше, по ответу
    const [pl, pr] = await Promise.all([deps.rpc('pf_my_platform'), deps.rpc('pf_my_profile')]
      .map((q) => q.catch((e: unknown): { data: unknown; error: unknown; status?: number } => ({ data: null, error: e || 'network', status: 0 }))));
    if (noAnswer(pl) || noAnswer(pr)) return fromDevice(email, issuedAt);
    if (pl.error || pr.error) {
      return fromParts(email, pl.error ? { isPlatformAdmin: false, companies: [] } : parsePlatform(pl.data),
        pr.error ? { fullName: null, mustChangePassword: false, userId: null } : parseProfile(pr.data));
    }
    const at = new Date(now()).toISOString();
    safeSet(deps.storage, DEVICE_ACCESS_PREFIX + deviceUserKey(email), JSON.stringify({ at, platform: pl.data, profile: pr.data }));
    return { ...fromParts(email, parsePlatform(pl.data), parseProfile(pr.data)), confirmedAt: at };
  }

  async function session(): Promise<SessionState> {
    if (!deps.auth) return { email: null, offline: false, issuedAt: null };
    if (deps.auth.getSessionState) return deps.auth.getSessionState();
    return { email: await deps.auth.getEmail(), offline: false, issuedAt: null };
  }

  async function refresh(): Promise<PlatformState> {
    const ses = await session();
    if (ses.email) {
      // вход не подтверждён сервером (нет связи): сервер не спрашиваем; дольше 14 дней — экран «Вход», данные не трогаем
      state = ses.offline ? fromDevice(ses.email, ses.issuedAt) : await loadEmail(ses.email, ses.issuedAt);
      // действующий (не истёкший) вход — уже подтверждение сервера; правило 14 дней — только для устаревшего входа без связи
      if (ses.offline && offlineExpired(state.confirmedAt ? Date.parse(state.confirmedAt) : null, now())) {
        state = { ...EMPTY, offline: true, loginReason: 'stale' };
      }
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
      if (state.email) safeSet(deps.storage, DEVICE_ACCESS_PREFIX + deviceUserKey(state.email), null);   // P2-0058: копию прав — стереть
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
