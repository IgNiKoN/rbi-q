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
  /** P2-0060: права и меню — из копии на устройстве, ответ сервера ещё не пришёл (запуск; не «без связи»). */
  checking?: boolean;
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
  /** P2-0060: сохранённый на устройстве вход (без сети) — чтобы при запуске построить меню по копии прав, не дожидаясь сервера. */
  storedSession?: () => { email: string | null; issuedAt: number | null } | null;
  /** P2-0060: сколько ждать ответа сервера о правах, если на устройстве есть их копия (по умолчанию SERVER_WAIT_MS). */
  serverWaitMs?: number;
}

/** Ключи устройства — только свои (platform2_*); ключи старого Quality не читаются и не пишутся. */
export const ENTRY_KEY = 'platform2_entry';
export const COMPANY_KEY = 'platform2_company';

/** P2-0058: копия последнего ответа сервера (pf_my_platform + pf_my_profile) — у каждого вошедшего своя (ключ без почты). */
export const DEVICE_ACCESS_PREFIX = 'platform2_device_access_';
/** «Вошёл без связи» — не дольше 14 дней с последнего подтверждения сервером (решение владельца 28.10.2026). */
export const OFFLINE_DAYS = 14;
const DAY_MS = 24 * 3600 * 1000;
/** P2-0060: ответ сервера о правах ждём не дольше — дальше работа по копии, повтор раз в минуту (решение владельца 29.10.2026). */
export const SERVER_WAIT_MS = 5000;

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

/** P2-0060: меню и права при запуске — по копии последнего ответа сервера этому человеку, если она есть и не старше 14 дней;
 *  иначе ждать сервер (экран загрузки). Сервер затем проверяется в фоне. */
export function startFromCopy(copy: DeviceCopy | null, issuedAtSec: number | null, now: number): boolean {
  return !!copy && !offlineExpired(lastConfirmed(copy, issuedAtSec), now);
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

/** P2-0060: отличается ли то, что видит человек (меню, модули, компания, профиль), — признаки «проверяется / без связи» не в счёт. */
export function accessChanged(a: PlatformState, b: PlatformState): boolean {
  const view = (s: PlatformState): string => JSON.stringify([s.mode, s.email, s.isPlatformAdmin, s.companyId, s.companies, s.fullName || null,
    !!s.mustChangePassword, s.userId || null, s.loginReason || null]);
  return view(a) !== view(b);
}

/** P2-0060: разделам перечитать данные (событие rbi:platform-access) — права изменились или сервер снова ответил после молчания;
 *  только «связь пропала» — нет: их запросы к молчащему серверу повисли бы и заняли соединения синхронизации Качества. */
export function shouldNotifyAccess(prev: PlatformState | null, next: PlatformState): boolean {
  return !prev || accessChanged(prev, next) || (!!prev.offline && !next.offline);
}

/** P2-0060: модуль экрана по адресу (для «раздел отозван»); null — экран не модуля (Настройки, главная). */
export function moduleOfHash(hash: string): string | null {
  const h = String(hash || '');
  if (/^#\/planfact(\/|$)/.test(h)) return 'planfact';
  if (/^#\/quality\/settings(\/|$)/.test(h)) return null;
  if (/^#\/quality(\/|$)/.test(h)) return 'quality';
  if (/^#\/construction(-v2)?(\/|$)/.test(h)) return 'construction';
  return null;
}

/** P2-0060: ответ сервера отнял модуль открытого экрана (по прежним правам был, по новым нет) — уйти на главную с подсказкой. */
export function revokedHere(prev: PlatformAccess | null, next: PlatformAccess, hash: string): boolean {
  const m = moduleOfHash(hash);
  return !!prev && !!m && prev[m] === true && next[m] !== true;
}

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

  type Answer = { data: unknown; error: unknown; status?: number };
  let asking: Promise<Answer[]> | null = null;
  async function loadEmail(email: string, issuedAt: number | null): Promise<PlatformState> {
    if (!deps.rpc) return fromParts(email, { isPlatformAdmin: false, companies: [] }, { fullName: null, mustChangePassword: false, userId: null });
    // P2-0058: запрос не дошёл или сервер недоступен (нет HTTP-ответа / 5xx) — не ответ «компаний нет»: копия последнего ответа
    // сервера; сервер ответил ошибкой (4xx) — как раньше, по ответу
    // P2-0060: прежний запрос ещё висит (сервер принял и молчит) — ждём его же, а не шлём новый: каждый висящий запрос держит
    // соединение, а их у браузера к одному серверу 6 — синхронизация Качества осталась бы без связи и после того, как сервер ожил
    const rpc = deps.rpc;
    const ask = asking || (asking = Promise.all([rpc('pf_my_platform'), rpc('pf_my_profile')]
      .map((q) => q.catch((e: unknown): Answer => ({ data: null, error: e || 'network', status: 0 }))))
      .finally(() => { asking = null; }));
    // P2-0060: есть копия прав — сервер, который принял запрос и молчит, ждём не дольше SERVER_WAIT_MS (как «нет связи»);
    // копии нет — ждём ответа (экран загрузки), иначе меню строить не из чего
    let timer: ReturnType<typeof setTimeout> | undefined;
    const silent: Answer = { data: null, error: 'timeout', status: 0 };
    const [pl, pr] = readDeviceCopy(deps.storage, email)
      ? await Promise.race([ask, new Promise<Answer[]>((r) => { timer = setTimeout(() => r([silent, silent]), deps.serverWaitMs ?? SERVER_WAIT_MS); })])
      : await ask;
    clearTimeout(timer);
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

  let booted = false;
  async function refresh(): Promise<PlatformState> {
    // P2-0060: при запуске — сразу меню по копии прав этого человека (сервер не ждём), ответ сервера в фоне её заменит
    if (!booted) {
      booted = true;
      const stored = deps.storedSession ? deps.storedSession() : null;
      const copy = stored && stored.email ? readDeviceCopy(deps.storage, stored.email) : null;
      if (stored && stored.email && startFromCopy(copy, stored.issuedAt, now())) {
        state = { ...fromDevice(stored.email, stored.issuedAt), offline: false, checking: true };
        emit();
      }
    }
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
