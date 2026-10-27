/// <reference types="node" />
/** P2-0046: «Сводка → Все объекты» по утверждённому макету — «Требует внимания» из строк портфеля (просрочка и красный светофор,
 *  не выставлено в КС-2, ждёт РП) с переходами; без права на КС-2 кнопки нет; без ₽ — плиток денег нет. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { createElement: h } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { portfolioAttention, PortfolioHead } = await import('../summary/Portfolio.ts');
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const base: N = { code: null, planned_start: '2026-01-01', planned_finish: '2027-01-01', can_money: true, can_manage: false, has_kp: true, plan_money: 100, done_money: 40, issued_money: 30,
  gap_money: 0, pct_money: 40, pace7: null, pace14: null, need_pace: null, days_left: 10, forecast_finish: null, light: 'green', light_reason: 'ok', unpriced_rows: 0, positions: 10,
  pending: 0, plan_pct_today: 40, lag_pp: 0, lag_days: 0, pace_verdict: null, work_days_left: 5, light_yellow_pp: 3, light_red_pp: 10, light_overdue_days: 3, can_thresholds: false };
const LATE: N = { ...base, project_id: 'a', name: 'ЖК А', light: 'red', light_reason: 'overdue', pct_money: 73.5, lag_days: 21, pace_verdict: 'slower', done_money: 160, plan_money: 200 };
const GAP: N = { ...base, project_id: 'b', name: 'ЖК Б', light: 'yellow', light_reason: 'lag_yellow', gap_money: 5550300, pending: 8 };

test('порядок: сначала красные, затем невыставленное, затем ждёт РП; подписи и переходы', () => {
  const went: string[] = []; const opened: string[] = [];
  const items = portfolioAttention([GAP, LATE], { to: (p: string) => went.push(p) }, (id: string) => opened.push(id));
  assert.deepEqual(items.map((i) => i.id), ['light:a', 'gap:b', 'pending:b']);
  assert.equal(items[0].title, 'ЖК А: срок окончания прошёл');
  assert.match(items[0].detail, /Выполнено 73,5 % · отстаёт на 21 дн\. · темп: замедляемся/);
  assert.match(items[1].detail, /ЖК Б · 5\s550\s300,00\s₽/);
  assert.equal(items[2].detail, 'ЖК Б · 8 записей');
  items.forEach((i) => i.action!.run());
  assert.deepEqual(opened, ['a']);
  assert.deepEqual(went, ['ks2?p=b', 'fact/pending?p=b']);
});

test('без права на КС-2 — пункт есть, кнопки «К КС-2» нет; без ссылок — только «Открыть»', () => {
  const items = portfolioAttention([GAP], { to: () => {}, can: { ks2: false } }, () => {});
  assert.equal(items.find((i) => i.id === 'gap:b')!.action, undefined);
  assert.ok(items.find((i) => i.id === 'pending:b')!.action);
  assert.equal(portfolioAttention([GAP], undefined, () => {}).every((i) => !i.action), true);
});

test('плитки: сумма сделанного и % от договора, отстающие «2 из 2», без права на ₽ — плиток денег нет', () => {
  const box = win.document.createElement('div'); win.document.body.appendChild(box);
  flushSync(() => createRoot(box as unknown as HTMLElement).render(h(PortfolioHead as N, { list: [LATE, GAP], open: () => {} })));
  const val = (m: string): string => box.querySelector(`[data-metric="${m}"] [data-testid="p2-kpi-value"]`)!.textContent!;
  assert.equal(val('pt-lag'), '2 из 2');
  assert.equal(val('pt-pending'), '8 записей');
  assert.match(box.querySelector('[data-metric="pt-done"]')!.textContent!, /66,7 % от/);
  const box2 = win.document.createElement('div'); win.document.body.appendChild(box2);
  flushSync(() => createRoot(box2 as unknown as HTMLElement).render(h(PortfolioHead as N, { list: [{ ...GAP, can_money: false, gap_money: null }], open: () => {} })));
  assert.equal(box2.querySelector('[data-metric="pt-done"]'), null);
  assert.equal(box2.querySelector('[data-metric="pt-gap"]'), null);
});
