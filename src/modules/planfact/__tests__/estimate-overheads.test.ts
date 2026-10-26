/// <reference types="node" />
/** Блок «Расчёт» сметы (P2-0006c, этап 5) на подставном сервере: флажок «в итог» пересчитывает итог, правка множителей,
 *  «Сохранить расчёт» пишет в смету (шаблон не трогается), «Сохранить как шаблон компании» — с подтверждением, цикл — ошибка. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import type { EstimateApi, OverheadLine } from '../estimate/estimate.service.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { createElement } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { EstimateOverheads, parseFactors } = await import('../estimate/OverheadsEditor.ts');

const tick = (): Promise<void> => settle();
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const L = (p: Partial<OverheadLine> & Pick<OverheadLine, 'key' | 'section' | 'method'>): OverheadLine => ({ name: p.key, comment: null, base: {}, params: {}, in_total: true, ...p });
const LINES = [
  L({ key: 'mat', section: 'materials', name: 'Материалы', method: 'percent_of', base: { totals: ['material'] }, params: { percent: 100 } }),
  L({ key: 'smr', section: 'fot_smr', name: 'СМР', method: 'percent_of', base: { totals: ['labor'] }, params: { percent: 100 } }),
  L({ key: 'hh', section: 'household', name: 'Бытовки', method: 'qty_rate', params: { factors: [100, 2] } }),
  L({ key: 'sil', section: 'household', name: 'Силомат', method: 'qty_rate', params: { factors: [1000] }, in_total: false }),
  L({ key: 'vat', section: 'vat', name: 'НДС', method: 'percent_of', base: { sections: ['household'] }, params: { percent: 10 } })];

function setup() {
  const saved: OverheadLine[][] = [], tpl: OverheadLine[][] = [];
  const api = {
    async overheads() { return { ok: true, value: LINES.map((l) => ({ ...l })) }; },
    async saveOverheads(_e: string, lines: OverheadLine[]) { saved.push(lines); return { ok: true, value: lines.length }; },
    async saveTemplate(_c: string, lines: OverheadLine[]) { tpl.push(lines); return { ok: true, value: lines.length }; },
    async template() { return { ok: true, value: LINES.map((l) => ({ ...l })) }; }
  } as unknown as EstimateApi;
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  flushSync(() => createRoot(el as unknown as HTMLElement).render(createElement(EstimateOverheads, { api, estimateId: 'e1', companyId: 'c1', base: { labor: 1000, material: 500 }, area: 10 } as N)));
  return { el: el as N, saved, tpl };
}
const num = (el: N, id: string) => Number(el.querySelector(`[data-testid="${id}"]`).textContent.replace(/[\s ]/g, '').replace(',', '.'));

test('parseFactors', () => {
  assert.deepEqual(parseFactors('5 500 × 24 x 8*12'), [5500, 24, 8, 12]);
  assert.deepEqual(parseFactors('6364,17 × 250'), [6364.17, 250]);
  assert.equal(parseFactors('abc'), null);
  assert.equal(parseFactors(''), null);
});

test('«в итог» у силомата: итог растёт на силомат и НДС от него; сохранить — в смету, шаблон не трогается', async () => {
  const s = setup();
  await tick(); await tick();
  assert.equal(num(s.el, 'oh-total'), 1720, '500 + 1000 + 200 + НДС 20');
  assert.equal(num(s.el, 'oh-perm2'), 172);
  s.el.querySelector('[data-key="sil"] [data-testid="oh-intotal"]').click(); await tick();
  assert.equal(num(s.el, 'oh-total'), 1720 + 1000 + 100);
  s.el.querySelector('[data-testid="oh-save"]').click(); await tick(); await tick();
  assert.equal(s.saved.length, 1);
  assert.equal(s.saved[0].find((l) => l.key === 'sil')!.in_total, true);
  assert.equal(s.tpl.length, 0);
  s.el.querySelector('[data-testid="oh-to-tpl"]').click(); await tick();
  assert.equal(s.tpl.length, 0, 'шаблон — только после подтверждения');
  s.el.querySelector('[data-testid="oh-to-tpl-yes"]').click(); await tick(); await tick();
  assert.equal(s.tpl.length, 1);
});

test('правка множителей пересчитывает; база по кругу — ошибка и «Сохранить» недоступно', async () => {
  const s = setup();
  await tick(); await tick();
  const f = s.el.querySelector('[data-key="hh"] [data-testid="oh-factors"]');
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(f, '100 × 3');
  f.dispatchEvent(new win.Event('input', { bubbles: true }));
  f.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true })); await tick();
  assert.equal(num(s.el, 'oh-sec-household'), 300);
  s.el.querySelector('[data-key="vat"] [data-testid="oh-basebtn"]').click(); await tick();
  const vatBox = [...s.el.querySelectorAll('[data-key="vat"] [data-testid="oh-base"] label')].find((n: N) => n.textContent === 'НДС');
  assert.ok(vatBox, 'в базе можно выбрать раздел «НДС»');
  vatBox.querySelector('input').click(); await tick();
  assert.match(s.el.querySelector('[data-testid="oh-error"]').textContent, /по кругу/);
  assert.equal(s.el.querySelector('[data-testid="oh-save"]').disabled, true);
});
