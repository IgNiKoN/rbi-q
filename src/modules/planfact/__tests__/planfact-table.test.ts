/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanfactTable } from '../PlanfactTable.ts';
import { completionPercent, formatPercent } from '../model.ts';
import type { PlanfactDemo } from '../model.ts';
import demo from '../demo-data.json' with { type: 'json' };

const data = demo as PlanfactDemo;

test('completionPercent: факт/план, план 0 → null', () => {
  assert.equal(completionPercent(420, 315), 75);
  assert.equal(completionPercent(960, 1010), 105.2);
  assert.equal(completionPercent(0, 10), null);
  assert.equal(formatPercent(null), '—');
});

test('демо-данные: 5–8 работ, у каждой есть ед. и план', () => {
  assert.ok(data.works.length >= 5 && data.works.length <= 8);
  for (const w of data.works) {
    assert.ok(w.name && w.unit && w.plan > 0);
  }
});

test('PlanfactTable рендерит строку на каждую работу и колонки План/Факт/%', () => {
  const html = renderToStaticMarkup(createElement(PlanfactTable, { data }));
  assert.equal((html.match(/data-work-id=/g) || []).length, data.works.length);
  for (const col of ['Наименование работ', 'Ед.', 'План', 'Факт', '%']) {
    assert.ok(html.includes(`>${col}</th>`), col);
  }
  assert.ok(html.includes('Монолитные перекрытия'));
  assert.ok(html.includes('100 %'));
});

test('стили — только CSS-переменные оболочки, без своих цветов', async () => {
  const { PLANFACT_CSS } = await import('../PlanfactTable.ts');
  assert.ok(!/#[0-9a-f]{3,6}\b|rgb\(/i.test(PLANFACT_CSS));
});
