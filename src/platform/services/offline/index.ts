/**
 * P2-0060: сервис платформы «Офлайн и синхронизация» для экранов модулей — ядро (copy.ts) и общие части экрана:
 * <OfflineMark module> в шапке («Без сети · данные на …»), useInputBlocked(module, input) — ввод без сети недоступен,
 * если модуль его не объявил в манифесте (offline.input).
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { copyMarkText, inputBlocked } from './offline-read.ts';
import { moduleOffline, offlineReader } from './copy.ts';
import { useOfflineEntry } from '../../auth/need-internet.ts';

export { NEED_INTERNET_TEXT, NEED_INTERNET_INPUT } from './offline-read.ts';

/** Подсказка под шапкой раздела без сети (План/Факт, «Компания»). */
export const OFFLINE_HINT = 'Без сети — только просмотр. Внести или изменить — когда появится интернет.';
export type { CopyMeta, CopyStatus, OfflineResult, Result } from './offline-read.ts';
export { copyCall, currentSlot, moduleOffline, offlineNow, offlineRead, offlineReader, rpcRead } from './copy.ts';

/** Экран модуля сменился — пропуски копии прежнего экрана в пометку не идут. */
export function useScreenChange(module: string, screen: string): void {
  useEffect(() => { offlineReader().resetMissed(module); }, [module, screen]);
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
.p2-offline-mark--missing{color:var(--text-main);border-color:currentColor}
.p2-offline-mark svg{flex:0 0 auto;width:14px;height:14px}`;
function ensureCss(): void {
  if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
  const s = document.createElement('style'); s.id = CSS_ID; s.textContent = OFFLINE_MARK_CSS; document.head.appendChild(s);
}

/** Пометка в шапке модуля: самое старое из показанных без сети данных; экрана нет в копии — «Нужен интернет для этого экрана»;
 *  всё с сервера — ничего. */
export function OfflineMark(props: { module: string }): ReactElement | null {
  const r = offlineReader();
  const [meta, setMeta] = useState(() => r.status(props.module));
  useEffect(() => r.subscribe(() => setMeta(r.status(props.module))), [props.module]);
  if (!meta) return null;
  ensureCss();
  return h('span', { className: 'p2-offline-mark' + (meta.stale ? ' p2-offline-mark--stale' : '') + (meta.at === null ? ' p2-offline-mark--missing' : ''),
    role: 'status', 'data-testid': 'p2-offline-mark', 'data-missed': meta.missed || undefined },
    h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true },
      h('path', { d: 'M3 3l18 18M8.5 8.6A5 5 0 0 0 6 18h11m3.2-2.4A4 4 0 0 0 17 9h-.5A6 6 0 0 0 10.7 5' })),
    copyMarkText(meta, Date.now()));
}
