/// <reference types="node" />
/** Блок «КП» (P2-0006c, этап 6) на подставном сервере и синтетическом файле: колонки угаданы, «Сформировать» → запись в файл,
 *  редакция с SHA-256 файла, скачивание «_КП_ред1»; файл без листов сметы — отказ; «Скачать ещё раз» другим файлом — отказ. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import ExcelJS from 'exceljs';
import type { EstimateApi, EstimateRow, KpRevision } from '../estimate/estimate.service.ts';
import type { VorApi } from '../vor/vor.service.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { createElement } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { KpBlock } = await import('../estimate/KpBlock.ts');
const { sha256Hex, readWorkbook } = await import('../vor/xlsx-reader.ts');

const tick = (ms?: number): Promise<void> => (ms ? new Promise((r) => setTimeout(r, ms)) : settle());
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

async function form(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet('ФКП');
  s.getRow(1).values = ['№', 'Наименование работ', 'Ед. изм.', 'Объём', 'Цена за ед., руб.', 'Цена за ед., руб.'];
  s.getRow(2).values = ['№', 'Наименование работ', 'Ед. изм.', 'Объём', 'Работа', 'Материал'];
  s.getRow(3).values = [1, 'Пол «Альфа»', 'м2', 10];
  s.getRow(4).values = [2, 'Окраска «Гамма»', 'м2', 5];
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
const ROWS: EstimateRow[] = [3, 4].map((n) => ({ source_row_id: 's' + n, import_id: 'imp1', row_no: n, kind: 'work', number: null, name: 'р' + n, unit_text: 'м2', qty: n === 3 ? 10 : 5,
  norm: null, parent_row_no: null, work_type_id: 'wt', price_labor: n === 3 ? 100 : null, price_material: null, price_source: 'manual', ref_item_id: null, ref_labor: null, ref_material: null, ref_date: null }));

async function setup() {
  const file = await form();
  const sha = await sha256Hex(file);
  const revs: KpRevision[] = [];
  const created: { sha: string; total: number }[] = [];
  const saved: { name: string; bytes: Uint8Array }[] = [];
  const api = {
    async listKp() { return revs.slice().reverse(); },
    async overheads() { return { ok: true, value: [] }; },
    async createKp(_e: string, s: string, _snap: unknown, total: number) {
      if (s !== sha) return { ok: false, message: 'Файл не совпадает ни с одной загрузкой ВОР этой сметы' };
      created.push({ sha: s, total }); revs.push({ id: 'k' + revs.length, revision_no: revs.length + 1, total, file_sha256: s, note: null, created_at: new Date().toISOString(), created_by_email: null });
      return { ok: true, value: { id: 'k' + (revs.length - 1), revision_no: revs.length } };
    },
    async getKp(id: string) { return { ok: true, value: { id, revision_no: 1, total: 1000, file_sha256: sha, note: null, created_at: '', snapshot: { version: 1, rows: [{ import_id: 'imp1', row_no: 3, kind: 'work', name: '', qty: 10, price_labor: 90, price_material: null, labor: 900, material: 0 }], totals: { labor: 900, material: 0, total: 900, unpriced: 0 }, overheads: null, estimate: { id: 'e1', name: '', area_m2: null } } } }; }
  } as unknown as EstimateApi;
  const vor = { async listProfiles() { return []; }, async saveProfile() { return { ok: true, value: 'p' }; } } as unknown as VorApi;
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  const estimate = { id: 'e1', name: 'Смета', import_ids: ['imp1'], area_m2: null, rows: 2, unpriced: 1, revisions: 0, created_at: '', created_by_email: null, updated_at: '' };
  const imports = [{ id: 'imp1', file_name: 'форма.xlsx', sheet_name: 'ФКП', status: 'confirmed', row_count: 4, works: 2, positions: 2, created_at: '', created_by_email: null, confirmed_at: '', profile_id: null }];
  flushSync(() => createRoot(el as unknown as HTMLElement).render(createElement(KpBlock, { api, vor, estimate, imports, projectId: 'p1', rows: ROWS, save: (bytes: Uint8Array, name: string) => saved.push({ name, bytes }) } as N)));
  return { el: el as N, file, created, saved };
}
async function pick(el: N, testid: string, bytes: Uint8Array, name: string): Promise<void> {
  const input = el.querySelector(`[data-testid="${testid}"] input[type=file]`);
  const f = new win.File([bytes as N], name);
  Object.defineProperty(input, 'files', { value: [f], configurable: true });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
  for (let i = 0; i < 40 && !el.querySelector('[data-testid="kp-plan"]') && !el.querySelector('[role=alert]'); i++) await tick(50);
}

test('«Сформировать КП»: колонки угаданы, цены вписаны, редакция с SHA файла, имя _КП_ред1, без цены — предупреждение', async () => {
  const s = await setup();
  await tick();
  assert.match(s.el.textContent, /Без цены строк: 1/);
  await pick(s.el, 'kp-new', s.file, 'форма.xlsx');
  assert.equal(s.el.querySelector('[data-testid="kp-col-unitLabor"]').value, '4');
  assert.equal(s.el.querySelector('[data-testid="kp-col-unitMaterial"]').value, '5');
  s.el.querySelector('[data-testid="kp-generate"]').click();
  for (let i = 0; i < 40 && !s.saved.length; i++) await tick(50);
  assert.equal(s.created.length, 1);
  assert.equal(s.created[0].total, 1000);
  assert.equal(s.saved[0].name, 'форма_КП_ред1.xlsx');
  const rows = (await readWorkbook(s.saved[0].bytes)).sheets[0].rows;
  assert.equal(rows[2][4], 100);
  assert.equal(rows[3][4] ?? null, null, 'строка без цены осталась пустой');
  await tick();
  assert.match(s.el.querySelector('[role=status]').textContent, /редакция 1/);
  assert.ok(s.el.querySelector('[data-rev="1"]'));
});

test('файл без листов сметы — отказ; «Скачать ещё раз» другим файлом — отказ, тем же — цены редакции', async () => {
  const s = await setup();
  await tick();
  const wb = new ExcelJS.Workbook(); wb.addWorksheet('Другой');
  await pick(s.el, 'kp-new', new Uint8Array(await wb.xlsx.writeBuffer()), 'другой.xlsx');
  assert.match(s.el.querySelector('[role=alert]').textContent, /нет листов этой сметы/);
  // редакция 1 и «Скачать ещё раз»
  await pick(s.el, 'kp-new', s.file, 'форма.xlsx');
  s.el.querySelector('[data-testid="kp-generate"]').click();
  for (let i = 0; i < 40 && !s.saved.length; i++) await tick(50);
  await tick();
  s.el.querySelector('[data-rev="1"] [data-testid="kp-again"]').click(); await tick();
  await pick(s.el, 'kp-again-file', new Uint8Array(await (async () => { const w = new ExcelJS.Workbook(); w.addWorksheet('ФКП').getCell('A1').value = 'x'; return w.xlsx.writeBuffer(); })()), 'форма.xlsx');
  assert.match(s.el.querySelector('[role=alert]').textContent, /другой файл/);
  s.el.querySelector('[data-rev="1"] [data-testid="kp-again"]')?.click(); await tick();
  await pick(s.el, 'kp-again-file', s.file, 'форма.xlsx');
  s.el.querySelector('[data-testid="kp-generate"]').click();
  for (let i = 0; i < 40 && s.saved.length < 2; i++) await tick(50);
  assert.equal(s.saved[1].name, 'форма_КП_ред1.xlsx');
  assert.equal((await readWorkbook(s.saved[1].bytes)).sheets[0].rows[2][4], 90, 'цены из снимка редакции, а не текущие');
  assert.equal(s.created.length, 1, 'повторное скачивание не создаёт редакцию');
});
