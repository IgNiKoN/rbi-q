/**
 * P2-0060: копия для просмотра без сети — хранилище на устройстве (сервис платформы «Офлайн и синхронизация», MODULES.md раздел 3).
 * Одна база IndexedDB на устройство; каждая запись — под «компания + пользователь» (slot), модулем и ключом чтения.
 * Модули своих баз не заводят. Неотправленное здесь не лежит (только ответы сервера) — очистка его не трогает.
 */

export interface CopyRecord {
  /** slot + '|' + module + '|' + key */
  id: string;
  slot: string;
  module: string;
  key: string;
  /** объект (проект), к которому относится чтение; null — общее для модуля */
  project: string | null;
  /** когда сервер отдал (ISO) */
  at: string;
  /** размер ответа, байт (для «Офлайн по модулям») */
  bytes: number;
  data: unknown;
}

/** Опись копии без содержимого (P2-0073): размер и объект записи — для «Офлайн по модулям», очистки и отбора по объектам. */
export type CopyMeta = Pick<CopyRecord, 'id' | 'module' | 'project' | 'bytes'>;

export interface CopyStore {
  get(id: string): Promise<CopyRecord | null>;
  put(r: CopyRecord): Promise<void>;
  delete(id: string): Promise<void>;
  /** Все записи «компания + пользователь» (по модулю — если задан). */
  list(slot: string, module?: string): Promise<CopyRecord[]>;
  /** Опись «компания + пользователь» без содержимого (по модулю — если задан). */
  meta(slot: string, module?: string): Promise<CopyMeta[]>;
}

const toMeta = (r: CopyRecord): CopyMeta => ({ id: r.id, module: r.module, project: r.project, bytes: r.bytes || 0 });

export const copyId = (slot: string, module: string, key: string): string => slot + '|' + module + '|' + key;

/** Для тестов и браузера без IndexedDB (приватный режим): копия живёт до закрытия страницы. */
export function memoryCopyStore(): CopyStore & { size(): number } {
  const m = new Map<string, CopyRecord>();
  return {
    size: () => m.size,
    async get(id) { return m.get(id) || null; },
    async put(r) { m.set(r.id, r); },
    async delete(id) { m.delete(id); },
    async list(slot, module) { return [...m.values()].filter((r) => r.slot === slot && (!module || r.module === module)); },
    async meta(slot, module) { return [...m.values()].filter((r) => r.slot === slot && (!module || r.module === module)).map(toMeta); }
  };
}

export const COPY_DB = 'platform2_offline_copy';
/** Опись копии перечитывается не реже чем раз в 30 мин (на случай записи другой вкладкой того же размера). */
const META_MS = 30 * 60000;
const STORE = 'reads';

/** IndexedDB устройства: база COPY_DB, хранилище reads (ключ id, индекс slot). Ошибка базы — как «копии нет».
 *  P2-0073: опись (meta) читает содержимое один раз на вкладку — дальше ведётся при записи и удалении (версия базы та же). */
export function idbCopyStore(idb: IDBFactory): CopyStore {
  let opened: Promise<IDBDatabase> | null = null;
  const metas = new Map<string, Promise<Map<string, CopyMeta>>>();   // slot → опись
  const built = new Map<string, number>();   // slot → когда опись прочитана
  /** Запись или удаление прошли — опись обновляется после того, как достроится (порядок изменений сохраняется). */
  const note = (slot: string, id: string, m: CopyMeta | null): void => {
    const p = metas.get(slot);
    if (p) void p.then((map) => { if (m) map.set(id, m); else map.delete(id); });
  };
  const slotOf = (id: string): string => id.slice(0, id.indexOf('|'));
  const db = (): Promise<IDBDatabase> => opened || (opened = new Promise((res, rej) => {
    const rq = idb.open(COPY_DB, 1);
    rq.onupgradeneeded = () => {
      const s = rq.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('slot', 'slot', { unique: false });
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => { opened = null; rej(rq.error); };
  }));
  const tx = async <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const d = await db();
    return new Promise<T>((res, rej) => {
      const rq = run(d.transaction(STORE, mode).objectStore(STORE));
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  };
  const list = async (slot: string, module?: string): Promise<CopyRecord[]> => {
    try {
      const all = (await tx('readonly', (s) => s.index('slot').getAll(slot))) as CopyRecord[];
      return module ? all.filter((r) => r.module === module) : all;
    } catch { return []; }
  };
  return {
    async get(id) { try { return (await tx('readonly', (s) => s.get(id))) as CopyRecord || null; } catch { return null; } },
    async put(r) { try { await tx('readwrite', (s) => s.put(r)); note(r.slot, r.id, toMeta(r)); } catch { /* места нет / приватный режим — без копии */ } },
    async delete(id) { try { await tx('readwrite', (s) => s.delete(id)); note(slotOf(id), id, null); } catch { /* нечего удалять */ } },
    list,
    async meta(slot, module) {
      let p = metas.get(slot);
      if (p) {
        // копию могла записать или очистить другая вкладка: записей другое число (без чтения содержимого) или опись старше META_MS — перестроить
        const [map, n] = await Promise.all([p, tx('readonly', (s) => s.index('slot').count(slot)).catch(() => -1)]);
        if ((n >= 0 && n !== map.size) || Date.now() - (built.get(slot) || 0) > META_MS) p = undefined;
      }
      if (!p) {
        p = list(slot).then((all) => new Map(all.map((r) => [r.id, toMeta(r)])));
        metas.set(slot, p); built.set(slot, Date.now());
      }
      const all = [...(await p).values()];
      return module ? all.filter((r) => r.module === module) : all;
    }
  };
}
