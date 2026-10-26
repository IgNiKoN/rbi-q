/**
 * P2-0016 (ADR-068). Качество и Стройконтроль при входе почтой: старые экраны и синхронизация без изменений логики,
 * меняется только «куда» и «кто»:
 *  - клиент синхронизации (window.supabaseClient) — раздел quality сервера, заголовок x-company-id = текущая компания,
 *    токен — сессия платформы (одна сессия, свой Auth не создаётся);
 *  - код проекта синхронизации = объект ядра (список — объекты компании), имя инженера = почта;
 *  - роль экрана Качества — из прав компании (quality.my_access), а не из профиля PIN;
 *  - локальная база на устройстве — своя у каждой компании (имя базы читает storage-db.core.js из QUALITY_COMPANY_KEY);
 *    состояние синхронизации (ключи rbi_*) при смене компании откладывается и восстанавливается, страница перезагружается.
 * Старое приложение РБИ (вход по PIN, раздел public) — отдельный код, здесь не участвует.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformState } from './platform.service.ts';

export const QUALITY_COMPANY_KEY = 'platform2_quality_company';
const STASH_PREFIX = 'platform2_quality_state_';
const PROJECT_PREFIX = 'platform2_quality_project_';

/** Ключи устройства со состоянием синхронизации Качества — у каждой компании свои. */
export const SYNC_STATE_KEYS = [
  'rbi_sync_config', 'rbi_cloud_dirty', 'rbi_force_full_pull', 'rbi_force_remote_poll',
  'rbi_sync_last_pull_at', 'rbi_sync_last_push_at', 'rbi_sync_last_remote_check_at', 'rbi_last_approved_pull_done',
  'rbi_first_full_offline_cache_done', 'rbi_first_full_offline_cache_started_at', 'rbi_need_full_offline_cache',
  'rbi_last_bg_cache_at', 'rbi_settings_backup'
];

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Компания, для которой работает Качество: вход почтой и у текущей компании включено Качество или Стройконтроль. */
export function qualityCompanyFor(st: PlatformState): string | null {
  if (st.mode !== 'email' || !st.companyId) return null;
  const cur = st.companies.find((c) => c.id === st.companyId);
  return cur && (cur.modules.includes('quality') || cur.modules.includes('construction')) ? cur.id : null;
}

export const QUALITY_USER_KEY = 'platform2_quality_user';
/** Старая общая база компании (до P2-0018), которую удалить после перезагрузки; её владелец — пока в ней неотправленное. */
export const QUALITY_DROP_DB_KEY = 'platform2_quality_drop_db';
export const QUALITY_LEGACY_OWNER_KEY = 'platform2_quality_legacy_owner';

/** Ключ пользователя для имени локальной базы (без почты в имени): 16 hex-знаков от почты (FNV-1a, два прохода). */
export function deviceUserKey(email: string): string {
  const e = email.trim().toLowerCase();
  const fnv = (seed: number): string => {
    let h = seed >>> 0;
    for (let i = 0; i < e.length; i++) { h ^= e.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  };
  return fnv(0x811c9dc5) + fnv(0x2f2e1d0c);
}

/** Переключить устройство на базу и состояние синхронизации «компания + пользователь» (P2-0018: у каждого вошедшего
 *  своя локальная база PLATFORM2_DB_<компания>_<пользователь>; null — без компании). true → нужна перезагрузка.
 *  Старая общая база компании (до P2-0018): с неотправленными изменениями (rbi_cloud_dirty) остаётся первому вошедшему,
 *  пока он их не отправит; иначе — удаляется после перезагрузки (её данные заново придут с сервера по правам вошедшего). */
export function switchDeviceCompany(store: Store, next: string | null, user = ''): boolean {
  const curC = store.getItem(QUALITY_COMPANY_KEY) || '';
  const curU = curC ? store.getItem(QUALITY_USER_KEY) || '' : '';   // пользователь без компании — не база
  const nxtC = next || '';
  const nxtU = nxtC ? user : '';
  if (curC === nxtC && curU === nxtU) return false;
  const legacy = !!curC && !curU && curC === nxtC && !!nxtU;
  if (legacy) {
    const owner = store.getItem(QUALITY_LEGACY_OWNER_KEY);
    if (store.getItem('rbi_cloud_dirty') === '1' && (!owner || owner === nxtU)) {
      store.setItem(QUALITY_LEGACY_OWNER_KEY, nxtU);   // сначала отправить неотправленное — база этого пользователя
      return false;
    }
    if (store.getItem('rbi_cloud_dirty') !== '1' || owner === null) store.setItem(QUALITY_DROP_DB_KEY, curC);
  }
  const slot = (c: string, u: string): string => (u ? c + ':' + u : c);
  const saved: Record<string, string> = {};
  for (const k of SYNC_STATE_KEYS) {
    const v = store.getItem(k);
    if (v !== null) saved[k] = v;
    store.removeItem(k);
  }
  if (legacy && store.getItem(QUALITY_DROP_DB_KEY) === curC) store.removeItem(STASH_PREFIX + curC);
  else store.setItem(STASH_PREFIX + slot(curC, curU), JSON.stringify(saved));
  let restore: Record<string, string> = {};
  try { restore = JSON.parse(store.getItem(STASH_PREFIX + slot(nxtC, nxtU)) || '{}') as Record<string, string>; } catch { restore = {}; }
  for (const k of SYNC_STATE_KEYS) if (typeof restore[k] === 'string') store.setItem(k, restore[k]);
  store.removeItem(STASH_PREFIX + slot(nxtC, nxtU));
  if (nxtC) store.setItem(QUALITY_COMPANY_KEY, nxtC); else store.removeItem(QUALITY_COMPANY_KEY);
  if (nxtU) store.setItem(QUALITY_USER_KEY, nxtU); else store.removeItem(QUALITY_USER_KEY);
  return true;
}

/** Роль экрана Качества по правам компании (ROLE_MATRIX permission.service.js). Область записей держит сервер (020,
 *  quality.row_visible); экрану — роль с тем же разрезом или шире, чтобы его фильтры не прятали то, что отдал сервер:
 *  manage → «Админ»; своя фирма → «Подрядчик»; правка Качества → «Инженер СК» (свои записи); остальной просмотр
 *  (Руководство, РП, Прораб, ПТО, Заказчик) → «Директор» — только просмотр, объекты ограничивает сервер
 *  (решение владельца 23.10.2026: у «РП» старого экрана фильтр по стройобъектам, а не по объектам компании). */
export function roleFor(actions: string[]): string {
  const has = (a: string): boolean => actions.includes(a);
  if (has('quality.manage') || has('construction.manage')) return 'manager';
  if (has('quality.scope.contractor')) return 'contractor';
  if (has('quality.edit')) return 'engineer';
  if (has('quality.view') || has('construction.view') || has('construction.edit')) return 'director';
  return 'guest';
}

/** Доступ из quality.my_access: projects — назначенные объекты ядра (null — вся компания), contractor — фирма назначения,
 *  objects — ключи закреплённых объектов Качества (P2-0033, 033; null — все объекты). */
export interface QualityAccess { actions: string[]; templates: string[]; projects: string[] | null; contractor: string; objects: string[] | null; container: string | null }
export function parseAccess(data: unknown): QualityAccess {
  const d = (data && typeof data === 'object' ? data : {}) as { actions?: unknown; templates?: unknown; projects?: unknown; contractor?: unknown; objects?: unknown; container?: unknown };
  const c = (d.contractor && typeof d.contractor === 'object' ? d.contractor : {}) as { name?: unknown };
  return {
    actions: Array.isArray(d.actions) ? d.actions.map(String) : [],
    templates: Array.isArray(d.templates) ? d.templates.map(String) : [],
    projects: Array.isArray(d.projects) ? d.projects.map(String) : null,
    contractor: typeof c.name === 'string' ? c.name : '',
    objects: Array.isArray(d.objects)
      ? d.objects.map((o) => (o && typeof o === 'object' ? String((o as { key?: unknown }).key ?? '') : '')).filter(Boolean) : null,
    // P2-0035 (039b): служебный объект-контейнер компании (как «Объекты RBI») — Качество работает в нём
    container: typeof d.container === 'string' && d.container ? d.container : null
  };
}

/** Поля доступа экрана Качества при входе почтой — только из моста: загрузка сохранённых на устройстве настроек
 *  (Object.assign из user_prefs — в т.ч. прошлого пользователя) их не перетирает; чтение и сохранение — как обычно. */
export function pinAccess(settings: Record<string, unknown>, values: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(values)) {
    Object.defineProperty(settings, k, { configurable: true, enumerable: true, get: () => v, set: () => { /* значение держит мост */ } });
  }
}

type CreateClient = (url: string, key: string, opts: Record<string, unknown>) => SupabaseClient;

/** Клиент раздела quality: токен — сессия платформы; .auth — Auth платформы (старый код вызывает auth.getUser). */
export function createQualityClient(createClient: CreateClient, cfg: { url: string; anonKey: string }, companyId: string,
  platformClient: SupabaseClient): SupabaseClient {
  const qc = createClient(cfg.url, cfg.anonKey, {
    accessToken: async () => (await platformClient.auth.getSession()).data.session?.access_token ?? null,
    db: { schema: 'quality' },
    global: { headers: { 'x-company-id': companyId } }
  });
  const storage = companyStorage(qc.storage as unknown as StorageLike, companyId);
  return new Proxy(qc, {
    get(target, prop, receiver) {
      if (prop === 'auth') return platformClient.auth;
      if (prop === 'storage') return storage;
      if (prop === 'from') return (table: string) => companyKeys(target.from(table) as unknown as Record<string, unknown>);
      return Reflect.get(target, prop, receiver);
    }
  });
}

/** Цель upsert с компанией: ключи записей Качества — (core_company_id, …) (021); компанию строки ставит сервер. */
export function companyConflict(onConflict: string | undefined): string | undefined {
  if (!onConflict) return onConflict;
  const cols = onConflict.split(',').map((c) => c.trim()).filter(Boolean);
  return (cols.includes('core_company_id') ? cols : ['core_company_id', ...cols]).join(',');
}
/** Таблица Качества: старый код пишет upsert(…, { onConflict: 'id' }) — уходит onConflict 'core_company_id,id'. */
function companyKeys<T extends Record<string, unknown>>(builder: T): T {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (prop !== 'upsert' || typeof v !== 'function') return v;
      return (values: unknown, opts?: { onConflict?: string } & Record<string, unknown>) =>
        v.call(target, values, opts?.onConflict ? { ...opts, onConflict: companyConflict(opts.onConflict) } : opts);
    }
  });
}

/** Бакет компании для бакета РБИ: файлы компаний — в закрытых quality-<бакет> (018d). */
export function companyBucket(bucket: string): string {
  return bucket.startsWith('quality-') ? bucket : 'quality-' + bucket;
}
/** Путь файла компании: всегда начинается с id компании (правила Storage 018d берут компанию из первой папки). */
export function companyPath(companyId: string, path: string): string {
  const p = String(path || '').replace(/^\/+/, '');
  return p === companyId || p.startsWith(companyId + '/') ? p : companyId + '/' + p;
}

type BucketApi = Record<string, (...args: unknown[]) => unknown>;
interface StorageLike { from(bucket: string): BucketApi }
/** Методы бакета: какие аргументы — пути (первый; у move/copy — два; у remove/createSignedUrls — массив). */
const PATH_ARGS: Record<string, 'first' | 'two' | 'list'> = {
  upload: 'first', update: 'first', download: 'first', getPublicUrl: 'first', createSignedUrl: 'first',
  createSignedUploadUrl: 'first', uploadToSignedUrl: 'first', info: 'first', exists: 'first', list: 'first',
  move: 'two', copy: 'two', remove: 'list', createSignedUrls: 'list'
};

/** Обёртка Storage: старый код пишет «inspection-photos», «reports»… — файл уходит в бакет и папку компании. */
export function companyStorage(storage: StorageLike, companyId: string): StorageLike {
  return {
    from(bucket: string): BucketApi {
      const api = storage.from(companyBucket(bucket));
      return new Proxy(api, {
        get(target, prop, receiver) {
          const v = Reflect.get(target, prop, receiver);
          const kind = typeof prop === 'string' ? PATH_ARGS[prop] : undefined;
          if (typeof v !== 'function' || !kind) return typeof v === 'function' ? v.bind(target) : v;
          return (...args: unknown[]) => {
            const a = args.slice();
            if (kind === 'list') a[0] = Array.isArray(a[0]) ? (a[0] as string[]).map((p) => companyPath(companyId, p)) : a[0];
            else {
              a[0] = companyPath(companyId, (a[0] as string) ?? '');
              if (kind === 'two') a[1] = companyPath(companyId, a[1] as string);
            }
            return (v as (...x: unknown[]) => unknown).apply(target, a);
          };
        }
      });
    }
  };
}

/** P2-0037: права компании в Качестве пришли / сменились (RBI.qualitySync.actions) — Настройки перечитывают «Админ Качества». */
export const QUALITY_ACCESS_EVENT = 'rbi:quality-access';

export interface QualityProject { id: string; name: string }
export interface QualitySync {
  active: true;
  companyId: string;
  companyName: string;
  email: string;
  projects: QualityProject[];
  projectId: string | null;
  role: string;
  actions: string[];
  /** P2-0028: имя инженера в записях Качества — ФИО учётки (без ФИО — почта). */
  engineerName?: string;
  selectProject(id: string): Promise<void>;
}

interface SyncWin {
  supabaseClient?: unknown;
  syncConfig?: { enabled?: boolean; engineerName?: string; projectCode?: string; pinHash?: string | null; syncMode?: string };
  appSettings?: Record<string, unknown>;
  applySyncConnect?: (name: string, code: string, pin: string | null) => Promise<void>;
  initSync?: () => Promise<void>;
  renderSyncUI?: () => void;
  RBI?: Record<string, unknown>;
}

export interface BridgeDeps {
  win: SyncWin;
  store: Store;
  reload: () => void;
  platformClient: SupabaseClient | null;
  cfg: { url: string; anonKey: string } | null;
  createClient: CreateClient;
  /** Объекты компании (pf_company_projects) — от имени вошедшего, клиентом платформы. */
  listProjects: (companyId: string) => Promise<QualityProject[]>;
  /** Удалить локальную базу IndexedDB по имени (старая общая база компании, P2-0018). */
  dropDatabase?: (name: string) => void;
  /** Кэш приложения (navigator.serviceWorker): ему — токен для закрытых файлов компании (sw.js, P2_STORAGE_TOKEN). */
  serviceWorker?: { controller: { postMessage(m: unknown): void } | null; addEventListener(t: 'message', cb: (e: { data: unknown }) => void): void } | null;
}

let swWired = false;
/** Токен вошедшего — кэшу приложения: сразу, при обновлении сессии и по запросу кэша (после его перезапуска). */
function wireStorageToken(deps: BridgeDeps): void {
  const sw = deps.serviceWorker;
  const pc = deps.platformClient;
  if (!sw || !pc || swWired) return;
  swWired = true;
  const post = async (): Promise<void> => {
    const token = (await pc.auth.getSession()).data.session?.access_token ?? null;
    if (sw.controller) sw.controller.postMessage({ type: 'P2_STORAGE_TOKEN', token });
  };
  sw.addEventListener('message', (e) => {
    const d = e.data as { type?: string } | null;
    if (d && d.type === 'P2_STORAGE_TOKEN_REQUEST') void post();
  });
  pc.auth.onAuthStateChange(() => { void post(); });
  void post();
}

/** Применить состояние платформы к Качеству. Возвращает активный мост или null. */
export async function applyQualityBridge(st: PlatformState, deps: BridgeDeps): Promise<QualitySync | null> {
  if (st.mode === 'none' && !deps.store.getItem(QUALITY_COMPANY_KEY)) return null;
  const company = qualityCompanyFor(st);
  if (switchDeviceCompany(deps.store, company, company && st.email ? deviceUserKey(st.email) : '')) { deps.reload(); return null; }
  // Старая общая база компании (до P2-0018) — удалить: эта страница уже открыла базу пользователя.
  const drop = deps.store.getItem(QUALITY_DROP_DB_KEY);
  if (drop && deps.dropDatabase) {
    const base = (deps.win as { APP_CONFIG?: { LOCAL_DB_NAME?: string } }).APP_CONFIG?.LOCAL_DB_NAME || 'PLATFORM2_DB';
    deps.dropDatabase(base + '_' + drop);
    deps.store.removeItem(QUALITY_DROP_DB_KEY);
    if (deps.store.getItem(QUALITY_LEGACY_OWNER_KEY) !== null && deps.store.getItem(QUALITY_COMPANY_KEY) === drop) deps.store.removeItem(QUALITY_LEGACY_OWNER_KEY);
  }
  const rbi = (deps.win.RBI = deps.win.RBI || {});
  if (!company || !deps.platformClient || !deps.cfg || !st.email) { rbi.qualitySync = null; return null; }
  const prev = rbi.qualitySync as QualitySync | null | undefined;
  if (prev && prev.companyId === company) {
    // P2-0028: ФИО сменили (Мой профиль / администратор) — новые записи сразу подписываются новым ФИО
    const nm = (st.fullName || '').trim() || st.email;
    if (prev.engineerName !== nm) {
      prev.engineerName = nm;
      const c = deps.win.syncConfig;
      if (c) { c.engineerName = nm; deps.store.setItem('rbi_sync_config', JSON.stringify(c)); }
      if (deps.win.appSettings) pinAccess(deps.win.appSettings, { engineerName: nm });
    }
    return prev;
  }

  wireStorageToken(deps);
  const client = createQualityClient(deps.createClient, deps.cfg, company, deps.platformClient);
  deps.win.supabaseClient = client;
  const loadAccess = async (pid: string | null): Promise<QualityAccess> => {
    const { data, error } = await client.rpc('my_access', { p_project: pid });
    return parseAccess(error ? null : data);
  };
  // «Синхронизация команды» — только свои объекты (назначения роли); вся компания — все объекты.
  const first = await loadAccess(null);
  const scope = first.projects;
  const cur = st.companies.find((c) => c.id === company);
  // P2-0035: у компании с контейнером объекты ЖК — внутри него; список объектов ядра контейнера не содержит
  const projects = first.container ? [{ id: first.container, name: cur ? cur.name : '' }]
    : (await deps.listProjects(company).catch(() => [] as QualityProject[])).filter((p) => scope === null || scope.includes(p.id));
  const savedProject = deps.store.getItem(PROJECT_PREFIX + company);
  const projectId = first.container ? first.container
    : projects.some((p) => p.id === savedProject) ? savedProject
    : projects.length === 1 ? projects[0].id : null;
  const email = st.email;
  // P2-0028: имя инженера в записях Качества — ФИО учётки (ядро); без ФИО — почта, как раньше.
  const engineerName = (st.fullName || '').trim() || email;

  const applyRole = (a: QualityAccess): void => {
    sync.actions = a.actions;
    sync.role = roleFor(a.actions);
    // Фирма подрядчика — из назначения роли (020). Закреплённые объекты Качества (033) — экрану ключами объектов, как в старом
    // профиле (assignedProjects): старые фильтры и выбор объекта работают как раньше; что видно — решает сервер. Все объекты — [].
    const assigned = a.objects || [];
    if (deps.win.appSettings) pinAccess(deps.win.appSettings, { userRole: sync.role, cloudStatus: 'approved', engineerName,
      contractorName: a.contractor, assignedContractor: a.contractor, assignedProjects: assigned, assigned_projects: assigned });
    // Руководящим ролям экрана (Админ, Директор) — режим «Вся команда», как делал профиль старого Качества (sync-engine).
    const c = deps.win.syncConfig;
    if (c && (sync.role === 'manager' || sync.role === 'director') && c.syncMode !== 'full') {
      c.syncMode = 'full';
      deps.store.setItem('rbi_sync_config', JSON.stringify(c));
    }
    const ev = (deps.win as { dispatchEvent?: (e: Event) => boolean }).dispatchEvent;
    if (typeof ev === 'function') ev.call(deps.win, new Event(QUALITY_ACCESS_EVENT));
  };
  const writeConfig = (pid: string | null): void => {
    const c = (deps.win.syncConfig = deps.win.syncConfig || {});
    c.enabled = !!pid;
    c.engineerName = engineerName;
    c.projectCode = pid || '';
    c.pinHash = null;
    if (!c.syncMode) c.syncMode = 'personal';
    deps.store.setItem('rbi_sync_config', JSON.stringify(c));
  };

  const sync: QualitySync = {
    active: true,
    companyId: company,
    companyName: cur ? cur.name : '',
    email,
    engineerName,
    projects,
    projectId,
    role: 'guest',
    actions: [],
    async selectProject(id: string) {
      if (!projects.some((p) => p.id === id) || id === sync.projectId) return;
      deps.store.setItem(PROJECT_PREFIX + company, id);
      sync.projectId = id;
      applyRole(await loadAccess(id));
      // Прежний путь подключения (очистка данных старого объекта по подтверждению, полный pull) — без PIN.
      if (deps.win.applySyncConnect) await deps.win.applySyncConnect(engineerName, id, null);
      else writeConfig(id);
      if (deps.win.initSync) await deps.win.initSync();
    }
  };
  rbi.qualitySync = sync;
  writeConfig(projectId);
  applyRole(await loadAccess(projectId));
  if (deps.win.initSync) await deps.win.initSync();
  if (deps.win.renderSyncUI) deps.win.renderSyncUI();
  return sync;
}
