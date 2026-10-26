/// <reference types="node" />
/** Дизайн-система Platform 2.0 (P2-0010, этап 2): токены графиков и статусов (светлая и тёмная, контраст подписей бейджей ≥ 4,5:1),
 *  KpiTile, ProgressBar, StatusBadge (слово + иконка), Legend (только при ≥ 2 сериях), ChartCard (таблица-альтернатива),
 *  LineChart (отметка «сегодня», подсказка при наведении и фокусе), BarChart (линия «нужно», тренд, подсказка). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { createElement: h } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const ui = await import('../../../platform/ui/index.ts');
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

function mount(el: N): N {
  const box = win.document.createElement('div');
  win.document.body.appendChild(box);
  flushSync(() => createRoot(box as unknown as HTMLElement).render(el));
  return box;
}
const fire = (el: N, type: string) => flushSync(() => { el.dispatchEvent(new win.Event(type, { bubbles: true })); });

// WCAG: относительная яркость и контраст; rgba смешивается с поверхностью
function rgb(c: string, over: number[] = [255, 255, 255]): number[] {
  const m = c.match(/rgba\(([^)]+)\)/);
  if (m) { const [r, gg, b, a] = m[1].split(',').map(Number); return [r, gg, b].map((v, i) => v * a + over[i] * (1 - a)); }
  return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
}
const lum = (c: number[]) => { const [r, gg, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * gg + 0.0722 * b; };
const contrast = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const tok = (block: string, name: string) => (block.match(new RegExp(`--${name}:([^;]+);`)) || [])[1];

test('токены: светлая и тёмная реализация для всех тёмных тем оболочки; подписи бейджей читаются (≥ 4,5:1)', () => {
  const css = ui.P2_UI_CSS;
  const [light, dark] = [css.slice(css.indexOf(':root{'), css.indexOf('}')), css.slice(css.indexOf('html[data-theme="dark"]'))];
  for (const t of ui.P2_DARK_THEMES) assert.ok(css.includes(`html[data-theme="${t}"]`), t);
  for (const n of ['p2-chart-fact', 'p2-chart-plan', 'p2-chart-grid', 'p2-chart-muted', 'p2-chart-track']) {
    assert.ok(tok(light, n), `светлая ${n}`); assert.ok(tok(dark, n), `тёмная ${n}`);
  }
  assert.equal(tok(light, 'p2-chart-fact'), '#2a6f9e'); assert.equal(tok(light, 'p2-chart-plan'), '#b9741f');
  assert.equal(tok(dark, 'p2-chart-fact'), '#4f93c9'); assert.equal(tok(dark, 'p2-chart-plan'), '#b98235');
  for (const s of ['green', 'yellow', 'red', 'grey']) {
    const lc = contrast(rgb(tok(light, `p2-status-${s}-fg`)), rgb(tok(light, `p2-status-${s}-bg`)));
    assert.ok(lc >= 4.5, `светлая ${s}: ${lc.toFixed(2)}`);
    for (const surf of [[23, 35, 49], [30, 41, 59], [28, 43, 57]]) {   // #172331, #1e293b, #1c2b39
      const dc = contrast(rgb(tok(dark, `p2-status-${s}-fg`), surf), rgb(tok(dark, `p2-status-${s}-bg`), surf));
      assert.ok(dc >= 4.5, `тёмная ${s}: ${dc.toFixed(2)}`);
    }
  }
});

test('KpiTile, ProgressBar (отметка плана), StatusBadge — слово и иконка', () => {
  const box = mount(h('div', null,
    h(ui.KpiTile, { label: 'Сделано', value: '1,57 млн ₽', hint: 'по плану 16,9 %', tone: 'red', metric: 'done' },
      h(ui.ProgressBar, { value: 1.7, marker: 16.9, label: 'Готовность', markerLabel: 'по плану сегодня' })),
    h(ui.StatusBadge, { status: 'red', label: 'Отставание' }),
    h(ui.ProgressBar, { value: null, label: 'Нет данных' })));
  const tile = box.querySelector('[data-metric="done"]');
  assert.ok(tile.className.includes('p2-kpi--red'));
  assert.equal(tile.querySelector('[data-testid="p2-kpi-value"]').textContent, '1,57 млн ₽');
  const bars = box.querySelectorAll('[role="progressbar"]');
  assert.equal(bars[0].getAttribute('aria-valuenow'), '1.7');
  assert.equal(bars[0].querySelector('[data-testid="p2-progress-marker"]').getAttribute('style'), 'left: 16.9%;');
  assert.equal(bars[1].getAttribute('aria-valuetext'), 'нет данных');
  const badge = box.querySelector('[data-testid="p2-badge"]');
  assert.equal(badge.textContent, 'Отставание');
  assert.ok(badge.querySelector('svg[aria-hidden="true"]'));
  assert.equal(badge.getAttribute('data-status'), 'red');
});

test('Legend — только при ≥ 2 сериях; ChartCard — таблица-альтернатива', () => {
  const one = mount(h(ui.Legend, { items: [{ label: 'Факт', kind: 'fact' }] }));
  assert.equal(one.querySelector('[data-testid="p2-legend"]'), null);
  const box = mount(h(ui.ChartCard, { title: 'План и факт', testId: 'card', legend: [{ label: 'План', kind: 'plan', mark: 'dash' }, { label: 'Факт', kind: 'fact' }],
    table: { head: ['Неделя', 'Сделано'], rows: [['19.10', '156 658 ₽']] }, note: 'равномерно' }, h('div', { 'data-testid': 'chart' })));
  assert.equal(box.querySelectorAll('[data-testid="p2-legend"] li').length, 2);
  assert.ok(box.querySelector('[data-testid="chart"]'));
  const btn = box.querySelector('[data-testid="p2-chart-toggle"]');
  assert.equal(btn.textContent, 'Таблица');
  fire(btn, 'click');
  assert.equal(box.querySelector('[data-testid="chart"]'), null);
  assert.equal(box.querySelector('[data-testid="p2-chart-table"] td:last-child').textContent, '156 658 ₽');
  assert.equal(btn.getAttribute('aria-pressed'), 'true');
});

test('LineChart: серии, «сегодня», подсказка при наведении и фокусе', () => {
  const box = mount(h(ui.LineChart, { ariaLabel: 'План и факт', start: '2026-09-01', end: '2027-06-30', today: '2026-10-22',
    series: [{ id: 'plan', label: 'План', kind: 'plan', dashed: true, points: [{ x: '2026-09-01', y: 0 }, { x: '2027-06-30', y: 91834896 }] },
      { id: 'fact', label: 'Факт', kind: 'fact', points: [{ x: '2026-10-15', y: 1408494 }, { x: '2026-10-22', y: 1565152 }] }],
    yFormat: ui.compactNumber, hoverX: ['2026-10-15', '2026-10-22'], tipAt: (x: string) => `на ${x}: факт`, defaultTip: 'наведите на график' }));
  assert.equal(box.querySelectorAll('polyline').length, 2);
  assert.equal(box.querySelector('polyline[data-series="plan"]').getAttribute('stroke'), 'var(--p2-chart-plan)');
  assert.match(box.querySelector('[data-testid="p2-line-today"]').textContent, /сегодня 22\.10/);
  assert.equal(box.querySelector('[data-testid="p2-chart-tip"]').textContent, 'наведите на график');
  const hit = box.querySelector('[data-x="2026-10-22"]');
  fire(hit, 'click');
  assert.equal(box.querySelector('[data-testid="p2-chart-tip"]').textContent, 'на 2026-10-22: факт');
  assert.ok(box.querySelector('circle'));
  assert.equal(hit.getAttribute('tabindex'), '0');
  assert.ok([...box.querySelectorAll('svg text')].some((t: N) => t.textContent === 'янв 27'), 'подпись месяца с годом');
});

test('BarChart: столбцы, линия «нужно», тренд, подсказка', () => {
  const bars = [['28.09', 488526], ['05.10', 567018], ['12.10', 352951], ['19.10', 156658]].map(([l, v]) => ({ key: String(l), label: String(l), value: Number(v), tip: `${l}: ${v}` }));
  const box = mount(h(ui.BarChart, { ariaLabel: 'По неделям', bars, yFormat: ui.compactNumber, reference: { value: 2517480, label: 'нужно 2,52 млн' }, trend: true }));
  assert.equal(box.querySelectorAll('path[data-bar]').length, 4);
  assert.match(box.querySelector('[data-testid="p2-bars-reference"]').textContent, /нужно 2,52 млн/);
  const trend = box.querySelector('[data-testid="p2-bars-trend"]');
  assert.ok(Number(trend.getAttribute('y2')) > Number(trend.getAttribute('y1')), 'тренд вниз: столбцы убывают');
  fire(box.querySelector('[data-hit="05.10"]'), 'focusin');
  assert.equal(box.querySelector('[data-testid="p2-chart-tip"]').textContent, '05.10: 567018');
  const zero = mount(h(ui.BarChart, { ariaLabel: 'нет', bars: [{ key: 'a', label: 'a', value: 0, tip: '0' }], yFormat: ui.compactNumber }));
  assert.equal(zero.querySelectorAll('path[data-bar]').length, 0, 'нулевой столбец не рисуется');
});

test('форматы подписей', () => {
  assert.equal(ui.compactNumber(1565152.29), '1,57 млн');
  assert.equal(ui.compactNumber(156658), '157 тыс.');
  assert.equal(ui.compactNumber(950), '950');
  assert.equal(ui.compactRub(null), '—');
  assert.equal(ui.daysBetween('2026-09-01', '2027-06-29'), 301);
  assert.equal(ui.niceStep(91834896, 4), 25000000);
});
