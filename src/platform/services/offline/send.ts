/**
 * P2-0064: отправка записей, сделанных на устройстве, — общая для модулей, у которых ввод на сервере — функция (описание `sync`
 * с `rpc`, standards/SYNC_AND_ACCESS.md). Правила P2-0059 / P2-0061: один проход за раз на все вкладки (замок), по порядку
 * создания, ограничение времени прохода, обрыв связи — остановка и повтор позже с паузой, отказ сервера — «Сервер отклонил: …»
 * с причиной (сама не уйдёт до «Отправить снова»), модуль выключен у компании — «Не отправлено: …» (перепроверяется каждый проход).
 * Права проверяет сервер; повтор той же записи (тот же id) — прежний ответ, без дубля. Чистые функции и зависимости — снаружи
 * (unit — __tests__/device-send.test.ts); браузер — device-send.ts.
 */
import type { DeviceRecord, DeviceRecordStore } from './device-records.ts';
import { isWaiting } from './device-records.ts';

/** Вид записи, уходящий функцией сервера: из описания `sync` манифеста (поле rpc). */
export interface SendKind { kind: string; module: string; rpc: string; title: string; store?: string }
type ManifestLike = { id: string; title?: string; sync?: { kind?: string; rpc?: string; title?: string; store?: string }[] };
export function sendKindsFrom(manifests: ManifestLike[]): Record<string, SendKind> {
  const out: Record<string, SendKind> = {};
  for (const m of manifests || []) for (const k of m.sync || []) {
    if (k && k.kind && k.rpc && !out[k.kind]) out[k.kind] = { kind: k.kind, module: m.id, rpc: k.rpc, title: k.title || k.kind, store: k.store };
  }
  return out;
}

export type RpcAnswer = { data?: unknown; error?: { message?: string; code?: string } | null; status?: number };
export type Outcome = { kind: 'ok'; value: unknown } | { kind: 'net' } | { kind: 'rejected'; message: string };

const NET_RE = /failed to fetch|networkerror|network|load failed|aborted|timeout|fetch/i;
/** Ответ сервера → принято / нет связи (повторить позже) / отклонено (с текстом сервера, если он по-русски). */
export function classify(a: RpcAnswer | null | undefined, thrown?: unknown): Outcome {
  if (thrown !== undefined || !a) return { kind: 'net' };
  if (!a.error) return { kind: 'ok', value: a.data ?? null };
  const st = Number(a.status || 0);
  const m = String(a.error.message || '');
  // нет ответа, сервер упал, вход истёк (обновится сам) — это связь, а не отказ
  if (!st || st >= 500 || st === 401 || st === 408 || st === 429 || (NET_RE.test(m) && !/[А-Яа-яЁё]/.test(m))) return { kind: 'net' };
  return { kind: 'rejected', message: /[А-Яа-яЁё]/.test(m) ? m.replace(/^\s*ERROR:\s*/i, '').slice(0, 300) : 'отказ сервера' + (a.error.code ? ' (' + a.error.code + ')' : '') };
}

export const MODULE_TITLES: Record<string, string> = { planfact: 'План/Факт', quality: 'Качество', construction: 'Стройконтроль' };
export const REJECT_HINT = 'Исправьте условие (бригада, позиция, права) и нажмите «Отправить снова»';
/** Пауза перед повтором после обрыва: 30 с, 1, 2, 5 мин (дальше — 5 мин). */
export function retryDelay(fails: number): number { return [30000, 60000, 120000, 300000][Math.min(Math.max(fails, 1), 4) - 1]; }
/** Ушедшие записи на устройстве не копятся: сервер их уже отдаёт в журнале. */
export const KEEP_SYNCED_MS = 3 * 24 * 3600 * 1000;

export interface SendDeps {
  store: DeviceRecordStore;
  kinds: Record<string, SendKind>;
  slot(): string | null;
  /** модули компании вошедшего (null — неизвестно: решает сервер) */
  modules(): string[] | null;
  call(fn: string, args: Record<string, unknown>): Promise<RpcAnswer>;
  now(): number;
  /** проход целиком под замком (все вкладки); занят — false */
  lock?(run: () => Promise<void>): Promise<boolean>;
  journal?(ev: Record<string, unknown>): void;
  changed?(): void;
  /** ограничение одного запроса и прохода, мс */
  callMs?: number;
  passMs?: number;
}
export interface PassResult { sent: number; rejected: number; blocked: number; left: number; net: boolean; busy: boolean }

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

export function createSender(deps: SendDeps) {
  const callMs = deps.callMs ?? 20000;
  const passMs = deps.passMs ?? 45000;
  /** Отправить одну запись (под замком прохода). */
  async function sendOne(r: DeviceRecord, kind: SendKind): Promise<Outcome> {
    let ans: RpcAnswer | null = null; let thrown: unknown;
    try { ans = await withTimeout(deps.call(kind.rpc, { p_client_id: r.id, p_entry: r.payload }), callMs); } catch (e) { thrown = e ?? 'error'; }
    return classify(ans, thrown);
  }
  async function pass(mode: string, out: PassResult): Promise<void> {
    const slot = deps.slot();
    if (!slot) return;
    const t0 = deps.now();
    const all = await deps.store.list(slot);
    const mods = deps.modules();
    let started = false;
    for (const r of all) {
      if (r.syncStatus === 'synced') {
        if (t0 - Date.parse(r.sentAt || r.createdAt) > KEEP_SYNCED_MS) await deps.store.delete(r.id);
        continue;
      }
      if (!isWaiting(r)) { out.rejected++; continue; }
      const kind = deps.kinds[r.kind];
      if (!kind) { out.left++; continue; }   // вид из новой версии приложения — дождётся её
      if (mods && !mods.includes(kind.module)) {
        const reason = 'Не отправлено: модуль «' + (MODULE_TITLES[kind.module] || kind.module) + '» выключен у компании';
        if (r.syncStatus !== 'blocked' || r.syncBlockReason !== reason) {
          await deps.store.put({ ...r, syncStatus: 'blocked', syncBlockReason: reason, syncBlockHint: 'Запись сохранена на телефоне; уйдёт, когда администратор компании включит модуль' });
          deps.changed?.();
        }
        out.blocked++; continue;
      }
      if (out.net || deps.now() - t0 > passMs) { out.left++; continue; }
      if (!started) { started = true; deps.journal?.({ k: 'start', mode, why: 'device_records' }); }
      const o = await sendOne(r, kind);
      const cur = (await deps.store.get(r.id)) || r;
      if (o.kind === 'ok') {
        await deps.store.put({ ...cur, syncStatus: 'synced', result: o.value, sentAt: new Date(deps.now()).toISOString(), syncBlockReason: '', syncBlockHint: '', syncServerRejected: false, tries: (cur.tries || 0) + 1 });
        out.sent++;
      } else if (o.kind === 'rejected') {
        await deps.store.put({ ...cur, syncStatus: 'blocked', syncServerRejected: true, syncBlockReason: 'Сервер отклонил: ' + o.message, syncBlockHint: REJECT_HINT, tries: (cur.tries || 0) + 1 });
        out.rejected++;
      } else {
        await deps.store.put({ ...cur, syncStatus: 'not_synced', syncBlockReason: '', tries: (cur.tries || 0) + 1 });
        out.net = true; out.left++;
      }
      deps.changed?.();
    }
    if (started) deps.journal?.({ k: 'end', mode, why: 'device_records', ok: !out.net, pushed: out.sent, rejected: out.rejected, unsent: out.left, ms: deps.now() - t0, ...(out.net ? { err: 'нет связи' } : {}) });
  }
  return {
    /** Один проход: всё, что ждёт отправки у вошедшего. */
    async run(mode = 'silent'): Promise<PassResult> {
      const out: PassResult = { sent: 0, rejected: 0, blocked: 0, left: 0, net: false, busy: false };
      const job = (): Promise<void> => pass(mode, out);
      if (deps.lock) { const got = await deps.lock(job); if (!got) out.busy = true; }
      else await job();
      return out;
    },
    /** «Отправить снова»: отклонённые сервером и «Не отправлено» — снова в отправку (id тот же — дубля нет). Возвращает число. */
    async resetRejected(): Promise<number> {
      const slot = deps.slot();
      if (!slot) return 0;
      let n = 0;
      for (const r of await deps.store.list(slot)) {
        if (r.syncStatus !== 'blocked') continue;
        await deps.store.put({ ...r, syncStatus: 'not_synced', syncServerRejected: false, syncBlockReason: '', syncBlockHint: '' });
        n++;
      }
      if (n) deps.changed?.();
      return n;
    },
    /** Не ушедшие записи вошедшего (ждут и отклонённые) — для счётчика, «Отправка» и пометок модуля. */
    async pending(module?: string): Promise<DeviceRecord[]> {
      const slot = deps.slot();
      return slot ? (await deps.store.list(slot, module)).filter((r) => r.syncStatus !== 'synced') : [];
    }
  };
}
export type Sender = ReturnType<typeof createSender>;
