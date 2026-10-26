/// <reference types="node" />
/** КС-2 в файл оферты (P2-0012, этап 4): объём акта — в «Кол-во» строк Номенклатуры (исключённая — 0); формулы «Цена»/«Сумма»
 *  и строки КВР не тронуты; чужой файл — понятный отказ; цена акта ≠ цене файла — предупреждение. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { Window } from 'happy-dom';
import { planOffer, offerFileName } from '../ks2/offer.ts';
import { emptyKs2Header, type Ks2Row, type Ks2Snapshot } from '../ks2/form.ts';
import { patchXlsx, colLetters } from '../vor/xlsx-writer.ts';
import { readWorkbook } from '../vor/xlsx-reader.ts';
import { parseSheet } from '../vor/parse.ts';
import { KVR_COL, kvrOfferXlsx } from './kvr-fixture.ts';
import { makeFakeKs2 } from './ks2-fake.ts';
import type { FakeSrc } from './ks2-fake.ts';
import { settle } from '../../../test-utils/settle.ts';

const L = colLetters;
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** Файл оферты с ценами КП: материал 10, работа 100 у каждой строки Номенклатуры. */
async function offerWithKp(): Promise<{ bytes: Uint8Array; works: { rowNo: number; name: string; qty: number }[] }> {
  const src = await kvrOfferXlsx();
  const parsed = parseSheet((await readWorkbook(src)).sheets[0]);
  const works = parsed.rows.filter((r) => r.kind === 'work').map((r) => ({ rowNo: r.rowNo, name: r.name, qty: r.qty as number }));
  const res = await patchXlsx(src, 'Шаблон Excel', works.flatMap((w) => [{ rowNo: w.rowNo, col: KVR_COL.mat, value: 10 }, { rowNo: w.rowNo, col: KVR_COL.lab, value: 100 }]));
  return { bytes: res.bytes, works };
}
const row = (p: Partial<Ks2Row>): Ks2Row => ({ source_row_id: crypto.randomUUID(), row_no: 1, number: '', name: '', unit: 'м2', kind: 'work',
  sys_qty: 1, sys_price: 110, qty: 1, price: 110, excluded: false, total_qty: 1, prev_qty: 0, ...p });

test('план записи: все строки акта найдены, объём — в «Кол-во», исключённая — 0, цены совпали с КП в файле', async () => {
  const { bytes, works } = await offerWithKp();
  const rows = works.map((w, k) => row({ row_no: w.rowNo, name: w.name, qty: Math.round(w.qty / 2 * 100) / 100, excluded: k === 0 }));
  const snap: Ks2Snapshot = { header: { ...emptyKs2Header(), act_no: '1' }, rows };
  const plan = planOffer((await readWorkbook(bytes)).sheets, snap);
  assert.deepEqual(plan.missing, []);
  assert.deepEqual(plan.priceDiff, []);
  assert.equal(plan.sheets.length, 1);
  assert.equal(plan.sheets[0].rows, 41);
  assert.equal(plan.sheets[0].zero, 1);
  assert.ok(plan.sheets[0].writes.every((w) => w.col === KVR_COL.qty));

  const res = await patchXlsx(bytes, plan.sheets[0].sheet, plan.sheets[0].writes);
  assert.equal(res.written.length, 41);
  assert.deepEqual(res.skippedFormula, []);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.bytes.slice().buffer as ArrayBuffer);
  const ws = wb.getWorksheet('Шаблон Excel')!;
  assert.equal(ws.getCell(L(KVR_COL.qty) + works[0].rowNo).value, 0, 'исключённая строка — 0');
  assert.equal(ws.getCell(L(KVR_COL.qty) + works[1].rowNo).value, rows[1].qty);
  const after = parseSheet((await readWorkbook(res.bytes)).sheets[0]);
  for (const g of after.rows.filter((r) => r.kind === 'group')) {
    assert.equal((ws.getCell(L(KVR_COL.sum) + g.rowNo).value as { formula?: string }).formula?.startsWith('SUMIF('), true, 'КВР — формула заказчика');
  }
  const before = parseSheet((await readWorkbook(bytes)).sheets[0]);
  assert.deepEqual(after.rows.filter((r) => r.kind === 'group').map((r) => r.qty), before.rows.filter((r) => r.kind === 'group').map((r) => r.qty), 'объём КВР не тронут');
  for (const w of works) assert.ok((ws.getCell(L(KVR_COL.price) + w.rowNo).value as { formula?: string }).formula, 'Цена — формула');
  assert.equal(offerFileName('оферта.xlsx', '7/1', 2), 'оферта_КС-2_7-1_ред2.xlsx');
});

test('чужой файл → строки акта не найдены; файл без цен КП → предупреждение о ценах', async () => {
  const { bytes, works } = await offerWithKp();
  const snap: Ks2Snapshot = { header: emptyKs2Header(), rows: [row({ row_no: works[0].rowNo, name: 'Не та работа', qty: 1 })] };
  const plan = planOffer((await readWorkbook(bytes)).sheets, snap);
  assert.equal(plan.missing.length, 1);
  assert.equal(plan.sheets.length, 0);
  const raw = await kvrOfferXlsx();
  const snap2: Ks2Snapshot = { header: emptyKs2Header(), rows: [row({ row_no: works[0].rowNo, name: works[0].name, qty: 1 })] };
  const p2 = planOffer((await readWorkbook(raw)).sheets, snap2);
  assert.deepEqual(p2.missing, []);
  assert.equal(p2.priceDiff.length, 1);
});

test('экран акта: «В файл оферты» → выбрать файл → скачан файл оферты с объёмами акта', async () => {
  const win = new Window({ url: 'http://localhost/' });
  const g = globalThis as Record<string, unknown>;
  g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
  g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
  const { createElement } = await import('react');
  const { flushSync } = await import('react-dom');
  const { createRoot } = await import('react-dom/client');
  const { Ks2Act } = await import('../ks2/Ks2Act.ts');
  const { bytes, works } = await offerWithKp();
  const SRC: FakeSrc[] = works.slice(0, 3).map((w, k) => ({ id: 's' + k, row_no: w.rowNo, number: '', name: w.name, unit: 'м2', kind: 'work' as const, price: 110 }));
  const f = makeFakeKs2(SRC, [{ src: 's0', date: '2026-10-05', qty: 2 }], {});
  const actId = (await f.api.createAct('pr1', '5', '2026-10-31', '2026-10-01', '2026-10-31') as N).value;
  const saved: { bytes: Uint8Array; name: string }[] = [];
  const el = win.document.createElement('div') as N;
  win.document.body.appendChild(el);
  flushSync(() => createRoot(el).render(createElement(Ks2Act, { api: f.api, actId, canEdit: true, onBack: () => {}, save: (b: Uint8Array, n: string) => saved.push({ bytes: b, name: n }) } as N)));
  await settle(); await settle();
  el.querySelector('[data-testid="k2-save"]').click(); await settle(); await settle();
  el.querySelector('[data-testid="k2-form-offer"]').click(); await settle();
  el.querySelector('[data-testid="k2-download"]').click(); await settle();
  const input = el.querySelector('[data-testid="k2-offer-file"]');
  assert.ok(input, 'появился выбор файла оферты');
  const file = { name: 'оферта.xlsx', arrayBuffer: async () => bytes.slice().buffer } as unknown as File;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
  for (let i = 0; i < 20 && !saved.length; i++) await settle();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'оферта_КС-2_5_ред1.xlsx');
  assert.match(String(el.querySelector('[data-testid="k2-notice"]')?.textContent), /объём вписан в 41 строк \(из них 40 — 0, нет в акте\)/);
  const out = parseSheet((await readWorkbook(saved[0].bytes)).sheets[0]);
  const q = out.rows.filter((r) => r.kind === 'work').map((r) => r.qty);
  assert.equal(q[0], 2);
  assert.ok(q.slice(1).every((v) => v === 0), 'строки не из акта — 0');
});
