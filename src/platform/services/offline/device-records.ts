/**
 * P2-0064: записи, сделанные на устройстве без сети, — хранилище сервиса платформы «Офлайн и синхронизация» (MODULES.md, решение 7.9).
 * Модуль, у которого на сервере ввод — функция (План/Факт: pf_fact_submit), описывает вид записи в поле `sync` манифеста
 * с `rpc` (standards/SYNC_AND_ACCESS.md); запись живёт здесь со статусом в самой записи (как sync_status P2-0059), отдельной
 * очереди-копии нет. Работает в любой компании — с Качеством и без (база Качества «компания + пользователь» есть только при нём).
 * Одна база IndexedDB на устройство; каждая запись — под «компания + пользователь» (slot). id записи создаётся на устройстве
 * (правило 1 раздела 9): повтор отправки не создаёт дубль — сервер вернёт прежний ответ.
 */

export type DeviceStatus = 'not_synced' | 'synced' | 'blocked';
export interface DeviceRecord {
  /** id с устройства (uuid) — p_client_id на сервере */
  id: string;
  slot: string;
  module: string;
  /** вид записи из описания `sync` манифеста (kind) */
  kind: string;
  project: string | null;
  createdAt: string;
  /** id учётной записи автора (подпись — в view) */
  authorId: string;
  /** что уходит на сервер (p_entry) */
  payload: Record<string, unknown>;
  /** подписи для экрана и списка «не отправлено»: работа, место, единица, бригада, объём, дата */
  view: Record<string, unknown>;
  source: 'local';
  syncStatus: DeviceStatus;
  syncBlockReason?: string;
  syncBlockHint?: string;
  syncServerRejected?: boolean;
  /** ответ сервера (принято / на проверке) */
  result?: unknown;
  sentAt?: string;
  tries?: number;
}

export interface DeviceRecordStore {
  get(id: string): Promise<DeviceRecord | null>;
  put(r: DeviceRecord): Promise<void>;
  delete(id: string): Promise<void>;
  /** Все записи «компания + пользователь» (по модулю — если задан), по времени создания. */
  list(slot: string, module?: string): Promise<DeviceRecord[]>;
}

const byTime = (a: DeviceRecord, b: DeviceRecord): number => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1);

/** Для тестов и браузера без IndexedDB: записи живут до закрытия страницы. */
export function memoryRecordStore(): DeviceRecordStore & { size(): number } {
  const m = new Map<string, DeviceRecord>();
  return {
    size: () => m.size,
    async get(id) { return m.get(id) ? { ...m.get(id)! } : null; },
    async put(r) { m.set(r.id, { ...r }); },
    async delete(id) { m.delete(id); },
    async list(slot, module) { return [...m.values()].filter((r) => r.slot === slot && (!module || r.module === module)).map((r) => ({ ...r })).sort(byTime); }
  };
}

/** Отдельная база (не база копии для просмотра): очистка копии и смена её версии неотправленное не трогают. */
export const RECORDS_DB = 'platform2_device_records';
const STORE = 'records';

export function idbRecordStore(idb: IDBFactory): DeviceRecordStore {
  let opened: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => opened || (opened = new Promise((res, rej) => {
    const rq = idb.open(RECORDS_DB, 1);
    rq.onupgradeneeded = () => {
      const s = rq.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('slot', 'slot', { unique: false });
    };
    rq.onsuccess = () => { const d = rq.result; d.onversionchange = () => { d.close(); opened = null; }; res(d); };
    rq.onerror = () => { opened = null; rej(rq.error); };
  }));
  const tx = async <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const d = await db();
    return new Promise<T>((res, rej) => {
      const t = d.transaction(STORE, mode);
      const rq = run(t.objectStore(STORE));
      // запись — только когда транзакция завершилась (запись на диске), чтение — по ответу
      if (mode === 'readwrite') { t.oncomplete = () => res(rq.result); t.onerror = () => rej(t.error); }
      else { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }
    });
  };
  return {
    async get(id) { try { return ((await tx('readonly', (s) => s.get(id))) as DeviceRecord) || null; } catch { return null; } },
    // ошибку записи не глотаем: экран должен узнать, что факт на телефоне не сохранился
    async put(r) { await tx('readwrite', (s) => s.put(r)); },
    async delete(id) { try { await tx('readwrite', (s) => s.delete(id)); } catch { /* нечего удалять */ } },
    async list(slot, module) {
      try {
        const all = (await tx('readonly', (s) => s.index('slot').getAll(slot))) as DeviceRecord[];
        return (module ? all.filter((r) => r.module === module) : all).sort(byTime);
      } catch { return []; }
    }
  };
}

/** Ждёт отправки: не ушла и не отклонена (отклонённая сервером — сама не уйдёт, в счётчик «не отправлено» не входит). */
export const isWaiting = (r: DeviceRecord): boolean => r.syncStatus !== 'synced' && !r.syncServerRejected;
/** Не отправлено или отклонено — видно в «Отправка» и в журнале модуля с пометкой. */
export const isUnsentOrRejected = (r: DeviceRecord): boolean => r.syncStatus !== 'synced';
