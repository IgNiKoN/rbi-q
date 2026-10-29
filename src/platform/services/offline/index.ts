/**
 * P2-0060: сервис платформы «Офлайн и синхронизация» — копия для просмотра без сети, общая для всех модулей страницы
 * (одна на страницу: разделы — отдельные бандлы). Модуль: offlineRead(module, key, fetcher) вместо прямого чтения,
 * <OfflineMark module> в шапке, useInputBlocked(module, input) — ввод без сети недоступен, если модуль его не объявил.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { idbCopyStore, memoryCopyStore } from './copy-store.ts';
import { copyMarkText, createOfflineReader, inputBlocked, NO_CONNECTION_TEXT, offlineOf } from './offline-read.ts';
import type { ModuleOffline, OfflineReader, OfflineResult, ReadOpts, Result } from './offline-read.ts';
import { isOfflineEntry, useOfflineEntry } from '../../auth/need-internet.ts';
import { deviceUserKey } from '../../auth/quality-bridge.ts';
import { getClient } from '../../auth/auth.service.ts';

export { NEED_INTERNET_TEXT, NEED_INTERNET_INPUT } from './offline-read.ts';
export type { CopyMeta, OfflineResult, Result } from './offline-read.ts';

type P2 = { getState?: () => { mode?: string; email?: string | null; companyId?: string | null } };
type Loader = { getById?: (id: string) => { offline?: unknown } | null };
const rbi = (): { platform2?: P2; moduleLoader?: Loader } | undefined =>
  (typeof window === 'undefined' ? undefined : (window as unknown as { RBI?: { platform2?: P2; moduleLoader?: Loader } }).RBI);

/** «Компания + пользователь» вошедшего почтой (как слот закрытых файлов, P2-0018); не вошёл — null. */
export function currentSlot(): string | null {
  const st = rbi()?.platform2?.getState?.();
  return st && st.mode === 'email' && st.email && st.companyId ? st.companyId + ':' + deviceUserKey(st.email) : null;
}

const HOLDER = '__platform2OfflineReader';
/** Одна копия на страницу (План/Факт и «Компания» — разные бандлы, копия и пометка общие). */
export function offlineReader(): OfflineReader {
  const g = globalThis as unknown as Record<string, OfflineReader | undefined>;
  if (!g[HOLDER]) {
    const store = typeof indexedDB !== 'undefined' ? idbCopyStore(indexedDB) : memoryCopyStore();
    g[HOLDER] = createOfflineReader({ store, slot: currentSlot, offline: isOfflineEntry });
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

/** Ввод недоступен без сети (кнопка неактивна, подсказка «Нужен интернет»). */
export function useInputBlocked(module: string, input: string): boolean {
  const off = useOfflineEntry();
  return inputBlocked(moduleOffline(module), input, off);
}

const CSS_ID = 'p2-offline-mark-style';
export const OFFLINE_MARK_CSS = `
.p2-offline-mark{display:inline-flex;align-items:center;gap:6px;max-width:100%;font-size:12px;font-weight:700;line-height:1.3;padding:6px 10px;
border-radius:999px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-muted)}
.p2-offline-mark--stale{color:var(--color-red, var(--text-main));border-color:currentColor}
.p2-offline-mark svg{flex:0 0 auto;width:14px;height:14px}`;
function ensureCss(): void {
  if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
  const s = document.createElement('style'); s.id = CSS_ID; s.textContent = OFFLINE_MARK_CSS; document.head.appendChild(s);
}

/** Пометка в шапке модуля: показывает самое старое из показанных без сети данных; всё с сервера — ничего. */
export function OfflineMark(props: { module: string }): ReactElement | null {
  const r = offlineReader();
  const [meta, setMeta] = useState(() => r.status(props.module));
  useEffect(() => r.subscribe(() => setMeta(r.status(props.module))), [props.module]);
  if (!meta) return null;
  ensureCss();
  return h('span', { className: 'p2-offline-mark' + (meta.stale ? ' p2-offline-mark--stale' : ''), role: 'status', 'data-testid': 'p2-offline-mark' },
    h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true },
      h('path', { d: 'M3 3l18 18M8.5 8.6A5 5 0 0 0 6 18h11m3.2-2.4A4 4 0 0 0 17 9h-.5A6 6 0 0 0 10.7 5' })),
    copyMarkText(meta, Date.now()));
}
