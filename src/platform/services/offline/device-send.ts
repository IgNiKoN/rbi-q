/**
 * P2-0064: отправка записей устройства в браузере — одна на страницу (разделы — отдельные бандлы, общий держатель на globalThis).
 * Когда: сразу после сохранения записи, при появлении связи, когда сервер снова ответил, по таймеру (пока есть неотправленное;
 * после обрыва — с нарастающей паузой) и по «Отправить снова» / «Проверить связь» в «Данные на устройстве → Отправка».
 * Замок — Web Locks на все вкладки (без них — один проход в этой вкладке). Журнал — общий журнал синхронизации (P2-0059).
 * Для стенда и «Данные на устройстве»: window.RBI.deviceSend.
 */
import { ModulesManifest } from '../../../../js/modules/modules.manifest.js';
import type { ModuleManifestLike } from '../../../../js/modules/modules.manifest.js';
import { getClient } from '../../auth/auth.service.ts';
import { currentSlot, offlineNow } from './copy.ts';
import { idbRecordStore, memoryRecordStore } from './device-records.ts';
import type { DeviceRecord, DeviceRecordStore } from './device-records.ts';
import { createSender, retryDelay, sendKindsFrom } from './send.ts';
import { DEMO_READONLY } from '../../demo/demo-mode.ts';
import type { PassResult, RpcAnswer, SendKind, Sender } from './send.ts';

export const DEVICE_RECORDS_EVENT = 'rbi:device-records';
const LOCK = 'p2-device-records';

type St = { mode?: string; email?: string | null; companyId?: string | null; userId?: string | null; companies?: { id: string; modules?: string[]; is_demo?: boolean }[] };
type W = { RBI?: { platform2?: { getState?: () => St }; deviceSend?: unknown }; RbiSyncJournal?: { add: (e: Record<string, unknown>) => void } };
const win = (): W | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as W));
const state = (): St | undefined => win()?.RBI?.platform2?.getState?.();
/** P2-0053: выбрана демо-компания (кнопка «Демо») — только просмотр. */
const inDemoCompany = (): boolean => { const st = state(); return !!st?.companies?.find((x) => x.id === st.companyId)?.is_demo; };

interface Holder { store: DeviceRecordStore; kinds: Record<string, SendKind>; sender: Sender; fails: number; timer: ReturnType<typeof setTimeout> | null; running: Promise<PassResult> | null; again: boolean; wired: boolean }
const KEY = '__platform2DeviceSend';

function holder(): Holder {
  const g = globalThis as unknown as Record<string, Holder | undefined>;
  if (g[KEY]) return g[KEY]!;
  const store = typeof indexedDB !== 'undefined' ? idbRecordStore(indexedDB) : memoryRecordStore();
  const kinds = sendKindsFrom(ModulesManifest as ModuleManifestLike[] as never);
  const sender = createSender({
    store,
    kinds,
    slot: currentSlot,
    modules: () => { const st = state(); const c = st?.companies?.find((x) => x.id === st.companyId); return c && Array.isArray(c.modules) ? c.modules : null; },
    async call(fn, args): Promise<RpcAnswer> {
      const c = getClient();
      if (!c) throw new Error('network');
      const { data, error, status } = await c.rpc(fn, args);
      return { data, error: error ? { message: error.message, code: error.code } : null, status };
    },
    now: () => Date.now(),
    lock: async (run) => {
      const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
      if (!locks || typeof locks.request !== 'function') { await run(); return true; }
      return locks.request(LOCK, { ifAvailable: true }, async (l) => { if (!l) return false; await run(); return true; });
    },
    journal: (e) => { try { win()?.RbiSyncJournal?.add(e); } catch { /* журнала нет — без него */ } },
    changed: () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(DEVICE_RECORDS_EVENT)); }
  });
  g[KEY] = { store, kinds, sender, fails: 0, timer: null, running: null, again: false, wired: false };
  return g[KEY]!;
}

function schedule(ms: number): void {
  const H = holder();
  if (H.timer) clearTimeout(H.timer);
  H.timer = setTimeout(() => { H.timer = null; void sendNow('silent'); }, ms);
}

/** Отправить сейчас всё, что ждёт (без сети — ничего не начинает; идёт проход — после него ещё один). */
export async function sendNow(mode = 'silent'): Promise<PassResult | null> {
  const H = holder();
  if (offlineNow() || !currentSlot()) return null;
  if (H.running) { H.again = true; return H.running; }
  H.running = H.sender.run(mode);
  try {
    const r = await H.running;
    if (r.net) { H.fails++; schedule(retryDelay(H.fails)); }
    else { H.fails = 0; if (r.busy || r.left) schedule(30000); }
    return r;
  } catch {
    H.fails++; schedule(retryDelay(H.fails));
    return null;
  } finally {
    H.running = null;
    if (H.again) { H.again = false; void sendNow(mode); }
  }
}

export interface SubmitInput { module: string; kind: string; project: string | null; payload: Record<string, unknown>; view: Record<string, unknown> }
export type SubmitResult = { state: 'sent'; id: string; result: unknown } | { state: 'saved'; id: string } | { state: 'rejected'; id: string; message: string };

function uuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
}

/**
 * Записать на устройстве и сразу отправить. Ушла — ответ сервера; нет связи (или обрыв) — запись на телефоне, уйдёт сама;
 * сервер отклонил сразу (со связью) — запись удаляется с телефона и экран показывает причину, как до P2-0064.
 * Сохранить на телефоне не удалось — ошибка (запись не потеряна молча).
 */
export async function submitDeviceRecord(i: SubmitInput): Promise<SubmitResult> {
  // P2-0053: в демо-компании записи не сохраняются и не уходят — сразу понятный отказ (сервер всё равно откажет)
  if (inDemoCompany()) return { state: 'rejected', id: '', message: DEMO_READONLY };
  const H = holder();
  const slot = currentSlot();
  if (!slot) throw new Error('Нужно войти');
  const st = state();
  const rec: DeviceRecord = { id: uuid(), slot, module: i.module, kind: i.kind, project: i.project, createdAt: new Date().toISOString(),
    authorId: String(st?.userId || ''), payload: i.payload, view: i.view, source: 'local', syncStatus: 'not_synced', tries: 0 };
  await H.store.put(rec);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DEVICE_RECORDS_EVENT));
  await sendNow('manual');
  if (H.running) await H.running.catch(() => null);   // шёл чужой проход — запись ушла следующим
  const now = (await H.store.get(rec.id)) || rec;
  if (now.syncStatus === 'synced') return { state: 'sent', id: rec.id, result: now.result };
  if (now.syncServerRejected) {
    if (now.tries === 1) {
      await H.store.delete(rec.id);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(DEVICE_RECORDS_EVENT));
    }
    return { state: 'rejected', id: rec.id, message: String(now.syncBlockReason || '').replace(/^Сервер отклонил:\s*/, '') };
  }
  return { state: 'saved', id: rec.id };
}

export const pendingDeviceRecords = (module?: string): Promise<DeviceRecord[]> => holder().sender.pending(module);
export const resetDeviceRejected = (): Promise<number> => holder().sender.resetRejected();
/** Строки «Данные на устройстве → Отправка»: подпись — вид записи и то, что человек узнаёт (работа, место, объём). */
export async function deviceRows(): Promise<{ store: string; rec: Record<string, unknown>; rejected: boolean }[]> {
  const kinds = holder().kinds;
  return (await pendingDeviceRecords().catch(() => [] as DeviceRecord[])).map((r) => ({ store: 'device_records', rejected: r.syncStatus === 'blocked',
    rec: { ...r, date: r.createdAt, p2Title: [kinds[r.kind]?.title || r.kind, String(r.view.title || '')].filter(Boolean).join(' · ') } }));
}

/** Запуск один раз на страницу (оболочка, entry.ts): связь появилась, сервер ответил, таймер. */
export function startDeviceSend(): void {
  const H = holder();
  if (H.wired || typeof window === 'undefined') return;
  H.wired = true;
  window.addEventListener('online', () => { H.fails = 0; void sendNow(); });
  window.addEventListener('rbi:platform-net', () => { void sendNow(); });
  window.addEventListener('rbi:platform-access', () => { void sendNow(); });
  const w = win();
  if (w) (w.RBI = w.RBI || {}).deviceSend = { run: sendNow, pending: pendingDeviceRecords, reset: resetDeviceRejected };
  setInterval(() => { void pendingDeviceRecords().then((p) => { if (p.some((r) => !r.syncServerRejected) && !H.timer) void sendNow(); }); }, 60000);
  void sendNow();
}
