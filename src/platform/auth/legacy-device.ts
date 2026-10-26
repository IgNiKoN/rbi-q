/**
 * P2-0032: разовый переход устройства со старого приложения РБИ (тот же адрес) на Платформу 2.0.
 * Старая локальная база (RBI_QUALITY_DB) удаляется один раз; после успеха —
 * отметка LEGACY_CLEANUP_KEY, при следующих открытиях ничего не делается. Не удалось (база занята другой вкладкой,
 * ошибка) — отметки нет, повтор при следующем открытии. Старые черновики и очередь не читаются и не отправляются
 * (решение владельца 25.10.2026). Новая база (PLATFORM2_DB*) — другое имя, не затрагивается.
 * Кэш старого приложения (rbi-quality-*) удаляет кэш приложения (sw.js) при включении: по нему он узнаёт переход со
 * старого приложения и включается сразу — удалить его здесь раньше значило бы оставить старый кэш приложения главным.
 */
import { QUALITY_COMPANY_KEY, SYNC_STATE_KEYS } from './quality-bridge.ts';

export const LEGACY_CLEANUP_KEY = 'platform2_legacy_cleanup_v1';
export const LEGACY_DB_NAME = 'RBI_QUALITY_DB';
/** Отложенное состояние синхронизации «без компании» (quality-bridge.ts) — на старом устройстве это состояние старого приложения. */
const EMPTY_SLOT_STASH = 'platform2_quality_state_';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface LegacyDeviceDeps {
  store: Store | null;
  /** Удалить базу устройства; resolve — удалена (или её не было), reject — не удалось. */
  deleteDatabase: ((name: string) => Promise<void>) | null;
  now?: () => string;
}

/** 'skipped' — уже выполнено; 'done' — выполнено сейчас; 'retry' — не удалось, повтор при следующем открытии. */
export type LegacyCleanupResult = 'skipped' | 'done' | 'retry';

export async function cleanupLegacyDevice(deps: LegacyDeviceDeps): Promise<LegacyCleanupResult> {
  const s = deps.store;
  if (!s) return 'retry';   // нет хранилища (приватный режим) — нечем отметить, нечего чистить надёжно
  try { if (s.getItem(LEGACY_CLEANUP_KEY)) return 'skipped'; } catch { return 'retry'; }
  // Устройство ещё не входило в Платформу 2.0 почтой: ключи синхронизации rbi_* принадлежат старому приложению —
  // убрать, чтобы новая база загрузилась полностью, а не «с момента последней загрузки» старого приложения.
  try {
    if (!s.getItem(QUALITY_COMPANY_KEY)) {
      for (const k of SYNC_STATE_KEYS) s.removeItem(k);
      s.removeItem(EMPTY_SLOT_STASH);
    }
  } catch { return 'retry'; }
  try {
    if (deps.deleteDatabase) await deps.deleteDatabase(LEGACY_DB_NAME);
  } catch { return 'retry'; }
  try { s.setItem(LEGACY_CLEANUP_KEY, deps.now ? deps.now() : new Date().toISOString()); } catch { return 'retry'; }
  return 'done';
}

/** Удаление базы браузера как обещание: «занята» (onblocked) — ждём не дольше timeoutMs, затем повтор в следующий раз. */
export function deleteIndexedDb(idb: IDBFactory, name: string, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try { req = idb.deleteDatabase(name); } catch (e) { reject(e); return; }
    const t = setTimeout(() => reject(new Error('blocked')), timeoutMs);
    req.onsuccess = () => { clearTimeout(t); resolve(); };
    req.onerror = () => { clearTimeout(t); reject(req.error || new Error('error')); };
  });
}
