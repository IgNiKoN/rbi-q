/**
 * Общие примитивы дизайн-системы Platform 2.0 (P2-0010): плитка показателя, полоса прогресса, бейдж статуса, легенда.
 * Тонкие React-обёртки над классами `p2-*` (src/platform/ui/tokens.ts). Бизнес-API не вызывают, чисел не считают — только показывают.
 */
import { createElement as h } from 'react';
import type { ReactElement, ReactNode } from 'react';

/** P2-0019: blue — «ждёт подтверждения» (палитра реестра). */
export type Status = 'green' | 'yellow' | 'red' | 'grey' | 'blue';

/** Плитка показателя: подпись, значение, подсказка; tone — рамка статуса (red / yellow), дополнительное содержимое (прогресс, бейдж). */
export function KpiTile(props: { label: string; value: string; hint?: ReactNode; tone?: Status; metric?: string; children?: ReactNode }): ReactElement {
  const { label, value, hint, tone, metric, children } = props;
  return h('div', { className: 'p2-kpi' + (tone === 'red' || tone === 'yellow' ? ` p2-kpi--${tone}` : ''), 'data-metric': metric },
    h('span', { className: 'p2-kpi__label' }, label),
    h('span', { className: 'p2-kpi__value', 'data-testid': 'p2-kpi-value' }, value),
    children,
    hint ? h('span', { className: 'p2-kpi__hint' }, hint) : null);
}

/** Полоса прогресса 0…100 %; marker — отметка (например, «по плану сегодня»). value = null — пустая полоса. */
export function ProgressBar(props: { value: number | null; label: string; marker?: number | null; markerLabel?: string }): ReactElement {
  const { value, label, marker, markerLabel } = props;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const m = marker === null || marker === undefined ? null : Math.max(0, Math.min(100, marker));
  return h('div', { className: 'p2-progress', role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100,
      'aria-valuenow': value === null ? undefined : v, 'aria-valuetext': value === null ? 'нет данных' : undefined },
    h('div', { className: 'p2-progress__fill' + (v === 0 ? ' p2-progress__fill--zero' : ''), style: { width: `${v}%` } }),
    m !== null ? h('div', { className: 'p2-progress__marker', style: { left: `${m}%` }, title: markerLabel, 'data-testid': 'p2-progress-marker' }) : null);
}

const ICON: Record<Status, ReactElement> = {
  green: h('path', { d: 'M5 12.5l4.5 4.5L19 7.5' }),
  yellow: h('path', { d: 'M12 4l9 16H3zM12 10v4M12 17.5h.01' }),
  red: h('g', null, h('circle', { cx: 12, cy: 12, r: 9 }), h('path', { d: 'M12 7.5v5.5M12 16.5h.01' })),
  grey: h('path', { d: 'M6 12h12' }),
  blue: h('g', null, h('circle', { cx: 12, cy: 12, r: 9 }), h('path', { d: 'M12 7v5l3 2' })),
};

/** Бейдж статуса: всегда слово + иконка + цвет (не только цвет). */
export function StatusBadge(props: { status: Status; label: string; title?: string; testId?: string }): ReactElement {
  const { status, label, title, testId } = props;
  return h('span', { className: `p2-badge p2-badge--${status}`, title, 'data-status': status, 'data-testid': testId || 'p2-badge' },
    h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, ICON[status]),
    label);
}

export type SeriesKind = 'fact' | 'plan' | 'reference' | 'muted';
export interface LegendItem { label: string; kind: SeriesKind; mark?: 'line' | 'dash' | 'bar' }
const STROKE: Record<SeriesKind, string> = { fact: 'var(--p2-chart-fact)', plan: 'var(--p2-chart-plan)', reference: 'var(--p2-chart-reference)', muted: 'var(--p2-chart-muted)' };
export const seriesColor = (k: SeriesKind): string => STROKE[k];

/** Легенда: показывается только при ≥ 2 сериях (одну серию называет заголовок). */
export function Legend(props: { items: LegendItem[] }): ReactElement | null {
  const { items } = props;
  if (items.length < 2) return null;
  return h('ul', { className: 'p2-legend', 'data-testid': 'p2-legend' },
    items.map((it) => h('li', { key: it.label, className: 'p2-legend__item' },
      h('svg', { width: 18, height: 10, 'aria-hidden': 'true' },
        it.mark === 'bar'
          ? h('rect', { x: 2, y: 1, width: 14, height: 8, rx: 2, fill: STROKE[it.kind] })
          : h('line', { x1: 0, y1: 5, x2: 18, y2: 5, stroke: STROKE[it.kind], strokeWidth: 2, strokeDasharray: it.mark === 'dash' ? '4 3' : undefined })),
      it.label)));
}
