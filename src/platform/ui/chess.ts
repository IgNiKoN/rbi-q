/**
 * Ячейка и шкала шахматки (P2-0017): общие примитивы дизайн-системы — шахматка факта, позже шахматка замечаний.
 * Цвет — токены статусов (светлая и тёмная тема), смысл всегда продублирован числом и значком. Чисел не считают — только показывают.
 */
import { createElement as h } from 'react';
import type { ReactElement } from 'react';

/** none — нет работ; todo — не начато; progress — в работе; done — сделано. */
export type ChessState = 'none' | 'todo' | 'progress' | 'done';
export const CHESS_STATE_LABEL: Record<ChessState, string> = { none: 'Нет работ', todo: 'Не начато', progress: 'В работе', done: 'Сделано' };

const MARK = {
  pending: h('g', null, h('circle', { cx: 12, cy: 12, r: 8.5 }), h('path', { d: 'M12 7.5V12l3 2' })),
  rejected: h('g', null, h('circle', { cx: 12, cy: 12, r: 8.5 }), h('path', { d: 'M12 7.5v5.5M12 16.5h.01' }))
};
function mark(kind: 'pending' | 'rejected', title: string): ReactElement {
  return h('span', { className: `p2-chess__mark p2-chess__mark--${kind}`, title, 'data-mark': kind },
    h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, MARK[kind]));
}

/** Ячейка: главное число (%, «3/5»), подпись под ним, значки «ждёт подтверждения» / «отклонено»; hot — подсветка строки/столбца. */
export function ChessCell(props: {
  state: ChessState; main: string; sub?: string; pending?: number; rejected?: number; selected?: boolean; hot?: boolean;
  label: string; onClick?: () => void; testId?: string;
}): ReactElement {
  const { state, main, sub, pending, rejected, selected, hot, label, onClick, testId } = props;
  const cls = `p2-chess__cell p2-chess__cell--${state}` + (selected ? ' p2-chess__cell--sel' : '') + (hot ? ' p2-chess__cell--hot' : '');
  const body = [
    h('span', { key: 'm', className: 'p2-chess__main' }, main),
    sub ? h('span', { key: 's', className: 'p2-chess__sub' }, sub) : null,
    pending || rejected ? h('span', { key: 'k', className: 'p2-chess__marks' },
      pending ? mark('pending', `Ждёт подтверждения: ${pending}`) : null,
      rejected ? mark('rejected', `Отклонено: ${rejected}`) : null) : null
  ];
  return state === 'none' || !onClick
    ? h('span', { className: cls, title: label, 'data-state': state, 'data-testid': testId || 'p2-chess-cell' }, body)
    : h('button', { type: 'button', className: cls, title: label, 'aria-label': label, 'aria-pressed': !!selected, 'data-state': state, 'data-testid': testId || 'p2-chess-cell', onClick }, body);
}

/** Шкала: что значат цвета и значки шахматки. */
export function ChessScale(): ReactElement {
  return h('ul', { className: 'p2-legend p2-chess__scale', 'data-testid': 'p2-chess-scale' },
    (['todo', 'progress', 'done'] as ChessState[]).map((s) => h('li', { key: s, className: 'p2-legend__item' },
      h('span', { className: `p2-chess__swatch p2-chess__cell--${s}`, 'aria-hidden': 'true' }), CHESS_STATE_LABEL[s])),
    h('li', { className: 'p2-legend__item' }, mark('pending', 'Ждёт подтверждения'), 'ждёт подтверждения РП'),
    h('li', { className: 'p2-legend__item' }, mark('rejected', 'Отклонено'), 'отклонено РП'));
}

export const P2_CHESS_CSS = `
.p2-chess{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%;border:1px solid var(--card-border);border-radius:var(--rbi-radius-md,8px);background:var(--card-bg)}
.p2-chess__table{border-collapse:separate;border-spacing:0;font-size:13px;font-variant-numeric:tabular-nums;min-width:100%}
.p2-chess__table th,.p2-chess__table td{padding:3px;border-bottom:1px solid var(--card-border);text-align:center;vertical-align:middle}
.p2-chess__table thead th{font-size:12px;font-weight:600;color:var(--text-muted);padding:8px 6px;background:var(--card-bg);min-width:64px;max-width:140px;vertical-align:bottom;overflow-wrap:anywhere;line-height:1.2}
.p2-chess__table th[scope=row]{position:sticky;left:0;z-index:1;background:var(--card-bg);text-align:left;font-weight:600;color:var(--text-main);padding:6px 10px;white-space:nowrap;border-right:1px solid var(--card-border)}
.p2-chess__table thead th:first-child{position:sticky;left:0;z-index:2;text-align:left}
.p2-chess__hot{background:var(--hover-bg)!important}
.p2-chess__cell{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:100%;min-width:64px;min-height:44px;padding:4px 6px;border-radius:6px;border:1px solid transparent;font:inherit;line-height:1.15;cursor:default;box-sizing:border-box}
button.p2-chess__cell{cursor:pointer}
button.p2-chess__cell:focus-visible{outline:2px solid var(--p2-chart-fact);outline-offset:1px}
.p2-chess__cell--none{background:transparent;border:1px dashed var(--card-border);color:var(--text-muted)}
.p2-chess__cell--todo{background:var(--p2-status-grey-bg);color:var(--p2-status-grey-fg)}
.p2-chess__cell--progress{background:var(--p2-status-yellow-bg);color:var(--p2-status-yellow-fg)}
.p2-chess__cell--done{background:var(--p2-status-green-bg);color:var(--p2-status-green-fg)}
.p2-chess__cell--hot{border-color:var(--card-border)}
.p2-chess__cell--sel{border-color:var(--p2-chart-fact);box-shadow:0 0 0 1px var(--p2-chart-fact) inset}
.p2-chess__main{font-weight:700;font-size:13px}
.p2-chess__sub{font-size:10px;opacity:.85;white-space:nowrap}
.p2-chess__marks{display:inline-flex;gap:3px}
.p2-chess__mark{display:inline-flex}
.p2-chess__mark--pending{color:var(--p2-status-yellow-fg)}
.p2-chess__mark--rejected{color:var(--p2-status-red-fg)}
.p2-legend__item .p2-chess__mark--pending,.p2-legend__item .p2-chess__mark--rejected{padding:2px;border-radius:999px;background:var(--p2-status-grey-bg)}
.p2-chess__swatch{display:inline-block;width:14px;height:14px;border-radius:4px}
`;
