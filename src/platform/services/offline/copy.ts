/**
 * P2-0060: ядро сервиса «Офлайн и синхронизация» без экрана (его подключают и службы входа платформы — без React).
 * Одна копия для просмотра на страницу (разделы — отдельные бандлы). Службы модулей читают через copyCall: функция из списка чтений —
 * через копию (offlineRead), остальные (запись) — без сети не отправляются: «Нужен интернет» (ввод без сети — только очередь, P2-0064).
 */
import { idbCopyStore, memoryCopyStore } from './copy-store.ts';
import { createOfflineReader, NEED_INTERNET_INPUT, NO_CONNECTION_TEXT, offlineOf } from './offline-read.ts';
import type { ModuleOffline, OfflineReader, OfflineResult, ReadOpts, Result } from './offline-read.ts';
import { deviceUserKey } from '../../auth/quality-bridge.ts';
import { getClient } from '../../auth/auth.service.ts';

type St = { mode?: string; email?: string | null; companyId?: string | null; offline?: boolean };
type Loader = { getById?: (id: string) => { offline?: unknown } | null };
const rbi = (): { platform2?: { getState?: () => St }; moduleLoader?: Loader } | undefined =>
  (typeof window === 'undefined' ? undefined : (window as unknown as { RBI?: { platform2?: { getState?: () => St }; moduleLoader?: Loader } }).RBI);

/** «Компания + пользователь» вошедшего почтой (как слот закрытых файлов, P2-0018); не вошёл — null. */
export function currentSlot(): string | null {
  const st = rbi()?.platform2?.getState?.();
  return st && st.mode === 'email' && st.email && st.companyId ? st.companyId + ':' + deviceUserKey(st.email) : null;
}

/** Вошёл почтой, а связи нет (браузер без сети или сервер не отвечает — вход «без связи»); как isOfflineEntry (need-internet.ts). */
export function offlineNow(): boolean {
  const st = rbi()?.platform2?.getState?.();
  return !!st && st.mode === 'email' && (!!st.offline || (typeof navigator !== 'undefined' && navigator.onLine === false));
}

const HOLDER = '__platform2OfflineReader';
/** Для проверки на стенде и «Данные на устройстве»: window.RBI.offlineCopy — то же, что offlineReader(). */
function expose(r: OfflineReader): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { RBI?: Record<string, unknown> };
  (w.RBI = w.RBI || {}).offlineCopy = r;
}
export function offlineReader(): OfflineReader {
  const g = globalThis as unknown as Record<string, OfflineReader | undefined>;
  if (!g[HOLDER]) {
    const store = typeof indexedDB !== 'undefined' ? idbCopyStore(indexedDB) : memoryCopyStore();
    g[HOLDER] = createOfflineReader({ store, slot: currentSlot, offline: offlineNow });
    expose(g[HOLDER]!);
  }
  return g[HOLDER]!;
}

export function offlineRead<T>(module: string, key: string, fetcher: () => Promise<Result<T>>, opts?: ReadOpts): Promise<OfflineResult<T>> {
  return offlineReader().read(module, key, fetcher, opts);
}

/** Чтение функции сервера как Result: обрыв связи отличается от ответа сервера (иначе пустой ответ затёр бы копию). */
export async function rpcRead<T>(fn: string, args: Record<string, unknown> = {}): Promise<Result<T>> {
  const c = getClient();
  if (!c) return { ok: false, message: 'Сервер не настроен' };
  try {
    const { data, error, status } = await c.rpc(fn, args);
    if (!error) return { ok: true, value: (data ?? null) as T };
    const m = String(error.message || '');
    return { ok: false, message: !status || status >= 500 || /failed to fetch|network|load failed/i.test(m) ? NO_CONNECTION_TEXT : (/[А-Яа-яЁё]/.test(m) ? m : 'Не удалось загрузить') };
  } catch {
    return { ok: false, message: NO_CONNECTION_TEXT };
  }
}

/** Поле offline манифеста модуля (js/modules/<id>/<id>.manifest.js). */
export function moduleOffline(id: string): ModuleOffline | null {
  const l = rbi()?.moduleLoader;
  return offlineOf(l && typeof l.getById === 'function' ? l.getById(id) : null);
}

/** Чтения прав и доступа модулей: в пометку «данные на …» не идут (она — про данные экрана). Доступ ядра — служба ядра передаёт сама (quiet). */
export const ACCESS_READS: ReadonlySet<string> = new Set(['pf_my_permissions', 'pf_my_area', 'pf_my_admin_companies', 'pf_permission_catalog', 'pf_my_context']);

/** Проверка прав чтением данных (например, «есть ли цены» — pf_price_list): в пометку экрана не идёт. */
let quietDepth = 0;
export async function quietly<T>(f: () => Promise<T>): Promise<T> {
  quietDepth++;
  try { return await f(); } finally { quietDepth--; }
}

/** Объект (проект) чтения: p_project или ранее увиденная запись этого объекта (импорт ВОР, позиция, место, акт…). */
const memo = new Map<string, string>();
const paths = new Map<string, string>();
const leaves = new Set<string>();
const REF_ARGS = ['p_import', 'p_position', 'p_location', 'p_act', 'p_revision', 'p_estimate', 'p_object', 'p_parent'];
const REF_FIELDS = ['id', 'import_id', 'position_id', 'location_id', 'act_id', 'estimate_id', 'revision_id'];
export function projectOf(args: Record<string, unknown> | undefined): string | null {
  const a = args || {};
  if (typeof a.p_project === 'string') return a.p_project;
  for (const k of REF_ARGS) { const v = a[k]; if (typeof v === 'string' && memo.has(v)) return memo.get(v)!; }
  return null;
}
function remember(project: string | null, value: unknown): void {
  for (const r of Array.isArray(value) ? value : [value]) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id === 'string' && typeof o.path === 'string' && typeof o.node_type === 'string') {
      paths.set(o.id, o.path);
      if (Number(o.child_count) === 0) leaves.add(o.id); else leaves.delete(o.id);
    }
    if (project) for (const k of REF_FIELDS) { const v = o[k]; if (typeof v === 'string') memo.set(v, project); }
  }
}
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));

/**
 * Вызов функции сервера службой модуля: из списка чтений — через копию для просмотра (ключ — функция и её аргументы, объект — для
 * удаления копии без доступа); остальное — запись: без сети не отправляется (ничего не начато — ничего не теряется).
 */
export async function copyCall<T>(module: string, reads: ReadonlySet<string>, fn: string, args: Record<string, unknown> | undefined,
  run: () => Promise<Result<T>>, quietReads?: ReadonlySet<string>, fromOther?: () => Promise<Result<T> | null>): Promise<Result<T>> {
  if (!reads.has(fn)) return offlineNow() ? { ok: false, message: NEED_INTERNET_INPUT } : run();
  const project = projectOf(args);
  const quiet = quietDepth > 0 || ACCESS_READS.has(fn) || !!(quietReads && quietReads.has(fn));
  const key = fn + ':' + stable(args || {});
  const r = await offlineRead(module, key, run, { project, quiet });
  if (r.ok) { remember(project, r.value); return r; }
  // этого чтения в копии нет, а экран может собрать его из других копий (fromOther) — без новых запросов
  if ((r as { offline?: boolean }).offline && fromOther) {
    const o = await fromOther();
    if (o && o.ok) { offlineReader().resolveMiss(module, key); return o; }
  }
  return r;
}

/** Место без вложенных (по прочитанному дереву) — его «вложенные места» без сети известны: пусто. */
export function isLeafPlace(id: string): boolean { return leaves.has(id); }

/** Путь места («Корпус 1 · Секция 1 · Этаж 2») по id — из прочитанных деревьев мест (для позиций места без сети). */
export function placePath(id: string): string | null { return paths.get(id) ?? null; }

/** «Держать без сети» и «заранее» — настройки устройства у «компания + пользователь» (localStorage, без данных — только флаги и время). */
const KEEP_KEY = 'platform2_offline_keep:';
const PREFETCH_KEY = 'platform2_offline_prefetch:';
/** Время последнего «заранее» модуля на устройстве (любой вход; + ':' + модуль) — обёртка модуля решает, грузить ли код (раз в сутки). */
export const PREFETCH_DEVICE_KEY = 'platform2_offline_prefetch_last:';
export const PREFETCH_EVERY_MS = 24 * 3600 * 1000;
const ls = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
const readJson = <T>(k: string, d: T): T => { try { return JSON.parse(ls()?.getItem(k) || 'null') ?? d; } catch { return d; } };
const writeJson = (k: string, v: unknown): void => { try { ls()?.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } };

/** «Держать без сети»: выбор человека; пока не выбирал — по умолчанию у модулей с view включено (правило по роли — этап 4). */
export function keepOffline(module: string): boolean {
  const slot = currentSlot();
  if (!slot) return false;
  const v = readJson<Record<string, boolean>>(KEEP_KEY + slot, {})[module];
  return typeof v === 'boolean' ? v : !!moduleOffline(module)?.view;
}
export function setKeepOffline(module: string, on: boolean): void {
  const slot = currentSlot();
  if (!slot) return;
  writeJson(KEEP_KEY + slot, { ...readJson<Record<string, boolean>>(KEEP_KEY + slot, {}), [module]: on });
}
export interface PrefetchRun { at: string; stats: unknown }
export function lastPrefetch(module: string): PrefetchRun | null {
  const slot = currentSlot();
  return slot ? readJson<Record<string, PrefetchRun>>(PREFETCH_KEY + slot, {})[module] || null : null;
}
/** Пора скачать заранее: связь подтверждена сервером, «держать без сети» включено, прошлый раз — больше суток назад. */
export function prefetchDue(module: string, now: number): boolean {
  const st = rbi()?.platform2?.getState?.() as (St & { checking?: boolean }) | undefined;
  if (!st || st.mode !== 'email' || st.checking || offlineNow() || !keepOffline(module)) return false;
  const last = lastPrefetch(module);
  return !last || now - Date.parse(last.at) >= PREFETCH_EVERY_MS;
}
export function markPrefetched(module: string, stats: unknown, now: number): void {
  const slot = currentSlot();
  if (!slot) return;
  writeJson(PREFETCH_KEY + slot, { ...readJson<Record<string, PrefetchRun>>(PREFETCH_KEY + slot, {}), [module]: { at: new Date(now).toISOString(), stats } });
  try { ls()?.setItem(PREFETCH_DEVICE_KEY + module, String(now)); } catch { /* приватный режим */ }
}

/** С сетью сервер назвал мои объекты (pf_my_projects): копии остальных объектов у этого человека удаляются во всех модулях. */
export async function pruneToMyProjects(ids: string[], modules: string[]): Promise<void> {
  for (const m of modules) await offlineReader().pruneProjects(m, ids);
}
