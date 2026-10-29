/**
 * P2-0060: копия для просмотра — одна обёртка чтения для любого модуля (сервис платформы «Офлайн и синхронизация»).
 * offlineRead(module, key, fetcher): с сетью — ответ сервера и его копия на устройстве (со временем); без сети / сервер не ответил —
 * копия с пометкой «данные на …»; копии нет — «Нужен интернет для этого экрана». Копия — под «компания + пользователь»:
 * другой человек на том же телефоне её не видит. В копию попадает только то, что сервер отдал этому человеку; правка копии
 * без сети не делается (ввод без сети — только через очередь, P2-0064).
 */
import { copyId } from './copy-store.ts';
import type { CopyStore } from './copy-store.ts';

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };
export interface CopyMeta { from: 'server' | 'copy'; at: string; stale: boolean }
/** Пометка модуля: самая старая показанная копия (null — копий не показано) и сколько чтений экрана без сети не нашлось в копии. */
export interface CopyStatus { at: string | null; stale: boolean; missed: number }
export type OfflineResult<T> = { ok: true; value: T; meta: CopyMeta | null } | { ok: false; message: string; offline?: boolean };

/** Что модуль умеет без сети — поле offline манифеста (MODULES.md, сервис «Офлайн и синхронизация»). Нет поля — «Только онлайн». */
export interface ModuleOffline {
  /** смотреть без сети (копия для просмотра) */
  view: boolean;
  /** вводы без сети: '*' — все (свой движок, Качество / СК); пусто — ни одного */
  input: string[];
  /** есть фото и PDF для выбора «заранее» */
  files: boolean;
}

export const NEED_INTERNET_TEXT = 'Нужен интернет для этого экрана';
/** Текст платформенных сервисов при обрыве связи (mapCompanyError) — признак «сервер не ответил». */
export const NO_CONNECTION_TEXT = 'Нет связи с сервером. Попробуйте позже';
export const NEED_INTERNET_INPUT = 'Нужен интернет';
/** Копия старше срока входа без связи (P2-0058) — с предупреждением «данные могли устареть». */
export const COPY_DAYS = 14;
/** Сколько ждать ответа сервера на чтение, если есть копия (дальше — копия). */
export const READ_WAIT_MS = 8000;
/** Сервер принял чтение и промолчал дольше READ_WAIT_MS — столько новых чтений к нему не шлём (копия сразу): каждый висящий запрос держит
 *  соединение, а их у браузера к одному серверу 6 — иначе синхронизация Качества осталась бы без связи (как погода hang, P2-0059). */
export const SILENT_MS = 60000;
const DAY_MS = 24 * 3600 * 1000;

export function offlineOf(manifest: { offline?: unknown } | null | undefined): ModuleOffline | null {
  const o = manifest && manifest.offline as Partial<ModuleOffline> | undefined;
  if (!o || typeof o !== 'object') return null;
  return { view: o.view === true, input: Array.isArray(o.input) ? o.input.map(String) : [], files: o.files === true };
}

/** Ввод без сети недоступен: нет связи, а модуль этот ввод без сети не объявил. */
export function inputBlocked(m: ModuleOffline | null, input: string, offline: boolean): boolean {
  return offline && !(m && (m.input.includes('*') || m.input.includes(input)));
}

export const isStale = (at: string, now: number): boolean => now - Date.parse(at) > COPY_DAYS * DAY_MS;

export interface ReaderDeps {
  store: CopyStore;
  /** «компания + пользователь» вошедшего почтой; null — не вошёл (копия не пишется и не читается) */
  slot(): string | null;
  /** связи нет (браузер без сети или сервер не отвечает — вход «без связи») */
  offline(): boolean;
  now?(): number;
  waitMs?: number;
}
export interface ReadOpts {
  /** объект, к которому относится чтение: доступ к нему отняли — копия удаляется (pruneProjects) */
  project?: string | null;
  /** право на эти данные (например, estimate — цены и сметы); false — в копию не кладётся, прежняя удаляется */
  allowed?: boolean;
  /** false — пустой список не заменяет прежнюю копию (сервис отдаёт [] и при сбое связи — не отличить от «пусто») */
  keepEmpty?: boolean;
  /** служебное чтение (права, доступ) — в пометку «данные на …» не идёт: она — про данные экрана */
  quiet?: boolean;
}

export interface OfflineReader {
  read<T>(module: string, key: string, fetcher: () => Promise<Result<T>>, opts?: ReadOpts): Promise<OfflineResult<T>>;
  /** С сетью выяснилось, к каким объектам есть доступ: копии остальных объектов модуля удаляются. */
  pruneProjects(module: string, allowed: string[]): Promise<number>;
  /** Пометка модуля: самая старая показанная копия и пропуски копии на экране; null — всё с сервера. */
  status(module: string): CopyStatus | null;
  /** Экран модуля сменился — пропуски прежнего экрана не в счёт. */
  resetMissed(module: string): void;
  /** Какие чтения экрана без сети не нашлись в копии (для «Данные на устройстве» и проверки). */
  missedKeys(module: string): string[];
  /** Чтения нет в копии, но экран собрал его из других копий (позиции места — из всех позиций проекта) — не пропуск. */
  resolveMiss(module: string, key: string): void;
  subscribe(cb: () => void): () => void;
  /** Байт копии модуля у этого человека («Офлайн по модулям»); с project — только этого объекта. */
  size(module: string, project?: string): Promise<number>;
  /** «Очистить скачанное»: копии модуля (или всех модулей) этого человека. */
  clear(module?: string): Promise<number>;
  /** Сервер недавно промолчал (SILENT_MS) — новые чтения идут сразу в копию; «заранее» останавливается. */
  serverSilent(): boolean;
}

const TIMEOUT = Symbol('timeout');
/** Отказ сервера по правам (mapCompanyError: 42501 / permission denied → «Нет права на это действие»). */
const DENIED = /нет права|нет доступа/i;

export function createOfflineReader(deps: ReaderDeps): OfflineReader {
  const now = (): number => (deps.now ? deps.now() : Date.now());
  let silentUntil = 0;
  /** модуль → ключ чтения → время показанной копии */
  const shown = new Map<string, Map<string, string>>();
  /** модуль → чтения без сети, которых нет в копии (экран не открывали с интернетом) */
  const missed = new Map<string, Set<string>>();
  const miss = (module: string, key: string, on: boolean): void => {
    let m = missed.get(module);
    if (!m) { if (!on) return; m = new Set(); missed.set(module, m); }
    const had = m.has(key);
    if (on) m.add(key); else m.delete(key);
    if (had !== on) emit();
  };
  const subs = new Set<() => void>();
  const emit = (): void => { for (const cb of subs) cb(); };
  const note = (module: string, key: string, at: string | null): void => {
    let m = shown.get(module);
    if (!m) { if (at === null) return; m = new Map(); shown.set(module, m); }
    const was = m.get(key) ?? null;
    if (at === null) m.delete(key); else m.set(key, at);
    if (was !== at) emit();
  };

  async function fromCopy<T>(module: string, key: string, id: string, quiet = false): Promise<OfflineResult<T>> {
    const c = await deps.store.get(id);
    if (!c) { if (!quiet) miss(module, key, true); return { ok: false, message: NEED_INTERNET_TEXT, offline: true }; }
    if (!quiet) { note(module, key, c.at); miss(module, key, false); }
    return { ok: true, value: c.data as T, meta: { from: 'copy', at: c.at, stale: isStale(c.at, now()) } };
  }

  return {
    async read<T>(module: string, key: string, fetcher: () => Promise<Result<T>>, opts: ReadOpts = {}): Promise<OfflineResult<T>> {
      const slot = deps.slot();
      if (!slot) { const r = await fetcher(); return r.ok ? { ok: true, value: r.value, meta: null } : r; }
      const id = copyId(slot, module, key);
      if (opts.allowed === false) {
        await deps.store.delete(id);
        if (deps.offline()) return { ok: false, message: NEED_INTERNET_TEXT, offline: true };
        const r = await fetcher();
        return r.ok ? { ok: true, value: r.value, meta: null } : r;
      }
      if (deps.offline() || now() < silentUntil) return fromCopy<T>(module, key, id, opts.quiet);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const r = await Promise.race([fetcher().catch((): Result<T> => ({ ok: false, message: NO_CONNECTION_TEXT })),
        new Promise<typeof TIMEOUT>((res) => { timer = setTimeout(() => res(TIMEOUT), deps.waitMs ?? READ_WAIT_MS); })]);
      clearTimeout(timer);
      if (r === TIMEOUT) silentUntil = now() + SILENT_MS;
      if (r === TIMEOUT || (!r.ok && r.message === NO_CONNECTION_TEXT)) return fromCopy<T>(module, key, id, opts.quiet);
      silentUntil = 0;
      // сервер отказал по правам — у человека больше нет этих данных: копия удаляется (цены и сметы без права estimate и т. п.)
      if (!r.ok) { if (DENIED.test(r.message)) { await deps.store.delete(id); note(module, key, null); } return r; }
      const at = new Date(now()).toISOString();
      let bytes = 0;
      try { bytes = JSON.stringify(r.value ?? null).length; } catch { /* не сериализуется — не в копию */ }
      const emptyList = Array.isArray(r.value) && r.value.length === 0;
      if (bytes && !(emptyList && opts.keepEmpty === false)) await deps.store.put({ id, slot, module, key, project: opts.project ?? null, at, bytes, data: r.value });
      note(module, key, null);
      miss(module, key, false);
      return { ok: true, value: r.value, meta: { from: 'server', at, stale: false } };
    },
    async pruneProjects(module, allowed) {
      const slot = deps.slot();
      if (!slot) return 0;
      const gone = (await deps.store.list(slot, module)).filter((r) => r.project !== null && !allowed.includes(r.project));
      for (const r of gone) await deps.store.delete(r.id);
      return gone.length;
    },
    status(module) {
      const m = shown.get(module);
      const n = missed.get(module)?.size || 0;
      if ((!m || !m.size) && !n) return null;
      const at = m && m.size ? [...m.values()].sort()[0] : null;
      return { at, stale: at !== null && isStale(at, now()), missed: n };
    },
    resetMissed(module) { if (missed.get(module)?.size) { missed.delete(module); emit(); } },
    resolveMiss(module, key) { miss(module, key, false); },
    missedKeys(module) { return [...(missed.get(module) || [])]; },
    subscribe(cb) { subs.add(cb); return () => { subs.delete(cb); }; },
    serverSilent: () => now() < silentUntil,
    async size(module, project) {
      const slot = deps.slot();
      return slot ? (await deps.store.list(slot, module)).filter((r) => project === undefined || r.project === project).reduce((a, r) => a + (r.bytes || 0), 0) : 0;
    },
    async clear(module) {
      const slot = deps.slot();
      if (!slot) return 0;
      const all = await deps.store.list(slot, module);
      for (const r of all) await deps.store.delete(r.id);
      shown.clear(); missed.clear(); emit();
      return all.length;
    }
  };
}

/** Пометка: «Без сети · данные на 14:32» (сегодня) или «… на 14:32, 27.10»; старше 14 дней — «данные могли устареть»;
 *  чтений экрана нет в копии — «Нужен интернет для этого экрана» (его не открывали с интернетом). */
export function copyMarkText(meta: CopyStatus, now: number): string {
  if (meta.at === null) return 'Без сети · ' + NEED_INTERNET_TEXT + ' — его ещё не открывали с интернетом';
  const d = new Date(meta.at), t = new Date(now);
  const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const same = d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  const day = same ? '' : ', ' + String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
  if (meta.missed) return 'Без сети · Нужен интернет для части экрана · данные на ' + hm + day + (meta.stale ? ' · могли устареть' : '');
  return 'Без сети · данные на ' + hm + day + (meta.stale ? ' · данные могли устареть' : '');
}
