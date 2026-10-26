/**
 * Графики дизайн-системы Platform 2.0 (P2-0010) без внешних библиотек: карточка графика (заголовок, легенда, подсказка,
 * таблица-альтернатива), линейный график нарастающим итогом с отметкой «сегодня», столбцы по неделям с линией «нужно» и трендом.
 * Цвета — только токены `--p2-chart-*`; подписи — цветом текста. Подсказка при наведении / фокусе / нажатии — строка под графиком
 * (aria-live), цели наведения больше самих отметок. Ширина рисунка = ширина карточки (подписи 11 px и на телефоне, без сжатия).
 * Чисел не считают: точки и подписи приходят от вызывающего экрана (с сервера).
 */
import { createElement as h, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Legend, seriesColor } from './primitives.ts';
import type { LegendItem, SeriesKind } from './primitives.ts';
import { dayMonth, daysBetween, monthLabel, niceStep } from './format.ts';

export interface ChartTable { head: string[]; rows: string[][] }

/** Карточка графика: заголовок, легенда (≥ 2 серий), переключатель «Таблица / График», пояснение. */
export function ChartCard(props: { title: string; legend?: LegendItem[]; table?: ChartTable; note?: ReactNode; testId?: string; children?: ReactNode }): ReactElement {
  const { title, legend, table, note, testId, children } = props;
  const [asTable, setAsTable] = useState(false);
  return h('section', { className: 'p2-chart', 'data-testid': testId, 'aria-label': title },
    h('div', { className: 'p2-chart__head' },
      h('h2', { className: 'p2-chart__title' }, title),
      h('div', { className: 'p2-chart__tools' },
        legend ? h(Legend, { items: legend }) : null,
        table ? h('button', { type: 'button', className: 'p2-chart__toggle', 'aria-pressed': asTable, 'data-testid': 'p2-chart-toggle',
          onClick: () => setAsTable(!asTable) }, asTable ? 'График' : 'Таблица') : null)),
    asTable && table
      ? h('div', { className: 'p2-chart__body' }, h('table', { className: 'p2-chart__table', 'data-testid': 'p2-chart-table' },
          h('thead', null, h('tr', null, table.head.map((c) => h('th', { key: c, scope: 'col' }, c)))),
          h('tbody', null, table.rows.map((r, i) => h('tr', { key: i }, r.map((c, j) => h('td', { key: j }, c)))))))
      : children,
    note ? h('p', { className: 'p2-chart__note' }, note) : null);
}

const H = 260, R = 16, T = 18, B = 28, PH = H - T - B;
interface Geo { W: number; L: number; PW: number }
const geo = (w: number): Geo => { const W = Math.max(280, Math.round(w)); const L = W < 520 ? 48 : 72; return { W, L, PW: W - L - R }; };

/** Ширина контейнера рисунка (ResizeObserver; без него — 760). */
function useWidth(): [ReturnType<typeof useRef<HTMLDivElement | null>>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(760);
  useEffect(() => {
    const el = ref.current;
    const RO = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (!el || !RO) return;
    const set = (): void => { const x = el.clientWidth; if (x > 0) setW(x); };
    set();
    const ro = new RO(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function yAxis(max: number, fmt: (v: number) => string): { yMax: number; ticks: { v: number; y: number; label: string }[] } {
  const step = niceStep(max, 4);
  const yMax = Math.max(step, Math.ceil(max / step) * step);
  const ticks = [];
  for (let v = 0; v <= yMax + step / 2; v += step) ticks.push({ v, y: T + PH * (1 - v / yMax), label: v === 0 ? '0' : fmt(v) });
  return { yMax, ticks };
}
const grid = (g: Geo, ticks: { y: number; label: string }[]) => ticks.map((t) => h('g', { key: `g${t.y}` },
  h('line', { x1: g.L, x2: g.W - R, y1: t.y, y2: t.y, stroke: 'var(--p2-chart-grid)', strokeWidth: 1 }),
  h('text', { x: g.L - 6, y: t.y + 4, textAnchor: 'end' }, t.label)));

function Tip(props: { text: string }): ReactElement {
  return h('div', { className: 'p2-chart__tip', 'aria-live': 'polite', 'data-testid': 'p2-chart-tip' }, props.text);
}

export interface LineSeries { id: string; label: string; kind: SeriesKind; dashed?: boolean; points: { x: string; y: number }[] }

/** Линейный график по датам (ось X — от start до end), отметка «сегодня»; hover — по датам hoverX, текст подсказки даёт tipAt. */
export function LineChart(props: { ariaLabel: string; start: string; end: string; today?: string | null; series: LineSeries[]; yFormat: (v: number) => string;
  hoverX: string[]; tipAt: (x: string) => string; defaultTip?: string }): ReactElement {
  const { ariaLabel, start, end, today, series, yFormat, hoverX, tipAt, defaultTip } = props;
  const [active, setActive] = useState<string | null>(null);
  const [ref, width] = useWidth();
  const g = geo(width); const { W, L, PW } = g;
  const span = Math.max(1, daysBetween(start, end));
  const X = (d: string): number => L + PW * Math.max(0, Math.min(1, daysBetween(start, d) / span));
  const max = Math.max(0, ...series.flatMap((s) => s.points.map((p) => p.y)));
  const { yMax, ticks } = yAxis(max, yFormat);
  const Y = (v: number): number => T + PH * (1 - v / yMax);
  // подписи месяцев: первое число каждого месяца, не больше 7 подписей
  const months: string[] = [];
  const d0 = new Date(Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, 1));
  for (let d = d0; d.toISOString().slice(0, 10) <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const iso = d.toISOString().slice(0, 10);
    if (iso >= start) months.push(iso);
  }
  const every = Math.max(1, Math.ceil(months.length / Math.max(2, Math.floor(PW / 64))));
  const xs = [...hoverX].sort();
  const half = (i: number): number => (i < xs.length - 1 ? (X(xs[i + 1]) - X(xs[i])) / 2 : 10);
  return h('div', null,
    h('div', { className: 'p2-chart__body', ref },
      h('svg', { className: 'p2-chart__svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': ariaLabel, 'data-testid': 'p2-line' },
        grid(g, ticks),
        months.filter((_, i) => i % every === 0).map((m) => h('text', { key: m, x: X(m), y: H - 8, textAnchor: 'middle' }, monthLabel(m))),
        today && today >= start && today <= end
          ? h('g', { 'data-testid': 'p2-line-today' },
              h('line', { x1: X(today), x2: X(today), y1: T, y2: T + PH, stroke: 'var(--p2-chart-reference)', strokeWidth: 1, strokeDasharray: '2 3' }),
              h('text', { x: X(today) > W - 90 ? X(today) - 6 : X(today) + 6, y: T + 10, textAnchor: X(today) > W - 90 ? 'end' : 'start', className: 'p2-chart__strong' }, `сегодня ${dayMonth(today)}`))
          : null,
        series.map((s) => h('polyline', { key: s.id, 'data-series': s.id, fill: 'none', stroke: seriesColor(s.kind), strokeWidth: 2, strokeLinejoin: 'round',
          strokeDasharray: s.dashed ? '6 4' : undefined, points: s.points.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ') })),
        active ? h('line', { x1: X(active), x2: X(active), y1: T, y2: T + PH, stroke: 'var(--p2-chart-muted)', strokeWidth: 1 }) : null,
        active ? series.map((s) => {
          const p = s.points.find((q) => q.x === active);
          return p ? h('circle', { key: `a${s.id}`, cx: X(p.x), cy: Y(p.y), r: 4, fill: seriesColor(s.kind), stroke: 'var(--p2-chart-surface)', strokeWidth: 2 }) : null;
        }) : null,
        xs.map((x, i) => h('rect', { key: `h${x}`, className: 'p2-chart__hit', 'data-x': x, x: X(x) - (i ? half(i - 1) : 10), y: T, width: (i ? half(i - 1) : 10) + half(i), height: PH,
          tabIndex: 0, 'aria-label': tipAt(x), onMouseEnter: () => setActive(x), onFocus: () => setActive(x), onClick: () => setActive(x),
          onMouseLeave: () => setActive(null), onBlur: () => setActive(null) })))),
    h(Tip, { text: active ? tipAt(active) : defaultTip || '' }));
}

export interface Bar { key: string; label: string; value: number; tip: string }

/** Столбцы (например, сделано за неделю): линия «нужно» (reference), линия тренда (наименьшие квадраты по столбцам). */
export function BarChart(props: { ariaLabel: string; bars: Bar[]; yFormat: (v: number) => string; reference?: { value: number; label: string } | null;
  trend?: boolean; defaultTip?: string }): ReactElement {
  const { ariaLabel, bars, yFormat, reference, trend, defaultTip } = props;
  const [active, setActive] = useState<string | null>(null);
  const [ref, width] = useWidth();
  const g = geo(width); const { W, L, PW } = g;
  const max = Math.max(0, reference ? reference.value : 0, ...bars.map((b) => b.value));
  const { yMax, ticks } = yAxis(max, yFormat);
  const Y = (v: number): number => T + PH * (1 - Math.max(0, v) / yMax);
  const slot = PW / Math.max(1, bars.length);
  const bw = Math.min(44, slot * 0.62);
  const labelEvery = slot < 40 ? Math.ceil(40 / slot) : 1;
  const cx = (i: number): number => L + slot * (i + 0.5);
  let tr: { y1: number; y2: number } | null = null;
  if (trend && bars.length >= 3) {
    const n = bars.length, mx = (n - 1) / 2, my = bars.reduce((s, b) => s + b.value, 0) / n;
    let num = 0, den = 0;
    bars.forEach((b, i) => { num += (i - mx) * (b.value - my); den += (i - mx) * (i - mx); });
    const k = den ? num / den : 0;
    tr = { y1: Y(my - k * mx), y2: Y(my + k * (n - 1 - mx)) };
  }
  const bar = (b: Bar, i: number): ReactElement => {
    const x = cx(i) - bw / 2, y = Y(b.value), y0 = T + PH, r = Math.min(4, bw / 2, Math.max(0, y0 - y));
    const d = y0 - y < 0.5 ? '' : `M${x},${y0} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y0} Z`;
    return h('g', { key: b.key },
      d ? h('path', { d, fill: active && active !== b.key ? 'var(--p2-chart-muted)' : 'var(--p2-chart-fact)', 'data-bar': b.key }) : null,
      (bars.length - 1 - i) % labelEvery === 0 ? h('text', { x: cx(i), y: H - 8, textAnchor: 'middle' }, b.label) : null,
      h('rect', { className: 'p2-chart__hit', x: cx(i) - slot / 2, y: T, width: slot, height: PH, tabIndex: 0, 'aria-label': b.tip, 'data-hit': b.key,
        onMouseEnter: () => setActive(b.key), onFocus: () => setActive(b.key), onClick: () => setActive(b.key),
        onMouseLeave: () => setActive(null), onBlur: () => setActive(null) }));
  };
  const cur = bars.find((b) => b.key === active);
  return h('div', null,
    h('div', { className: 'p2-chart__body', ref },
      h('svg', { className: 'p2-chart__svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': ariaLabel, 'data-testid': 'p2-bars' },
        grid(g, ticks),
        bars.map(bar),
        reference && reference.value > 0
          ? h('g', { 'data-testid': 'p2-bars-reference' },
              h('line', { x1: L, x2: W - R, y1: Y(reference.value), y2: Y(reference.value), stroke: 'var(--p2-chart-plan)', strokeWidth: 2, strokeDasharray: '6 4' }),
              h('text', { x: W - R, y: Y(reference.value) - 6, textAnchor: 'end', className: 'p2-chart__strong' }, reference.label))
          : null,
        tr ? h('line', { 'data-testid': 'p2-bars-trend', x1: cx(0), x2: cx(bars.length - 1), y1: tr.y1, y2: tr.y2, stroke: 'var(--p2-chart-reference)', strokeWidth: 1.5,
          strokeDasharray: '2 4', opacity: 0.7 }) : null)),
    h(Tip, { text: cur ? cur.tip : defaultTip || '' }));
}
