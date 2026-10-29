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

export interface CopyStore {
  get(id: string): Promise<CopyRecord | null>;
  put(r: CopyRecord): Promise<void>;
  delete(id: string): Promise<void>;
  /** Все записи «компания + пользователь» (по модулю — если задан). */
  list(slot: string, module?: string): Promise<CopyRecord[]>;
}

export const copyId = (slot: string, module: string, key: string): string => slot + '|' + module + '|' + key;

/** Для тестов и браузера без IndexedDB (приватный режим): копия живёт до закрытия страницы. */
export function memoryCopyStore(): CopyStore & { size(): number } {
  const m = new Map<string, CopyRecord>();
  return {
    size: () => m.size,
    async get(id) { return m.get(id) || null; },
    async put(r) { m.set(r.id, r); },
    async delete(id) { m.delete(id); },
    async list(slot, module) { return [...m.values()].filter((r) => r.slot === slot && (!module || r.module === module)); }
  };
}

export const COPY_DB = 'platform2_offline_copy';
const STORE = 'reads';

/** IndexedDB устройства: база COPY_DB, хранилище reads (ключ id, индекс slot). Ошибка базы — как «копии нет». */
export function idbCopyStore(idb: IDBFactory): CopyStore {
  let opened: Promise<IDBDatabase> | null = null;
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
  return {
    async get(id) { try { return (await tx('readonly', (s) => s.get(id))) as CopyRecord || null; } catch { return null; } },
    async put(r) { try { await tx('readwrite', (s) => s.put(r)); } catch { /* места нет / приватный режим — без копии */ } },
    async delete(id) { try { await tx('readwrite', (s) => s.delete(id)); } catch { /* нечего удалять */ } },
    async list(slot, module) {
      try {
        const all = (await tx('readonly', (s) => s.index('slot').getAll(slot))) as CopyRecord[];
        return module ? all.filter((r) => r.module === module) : all;
      } catch { return []; }
    }
  };
}
