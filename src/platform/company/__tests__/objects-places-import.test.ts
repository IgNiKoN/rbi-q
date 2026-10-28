/// <reference types="node" />
/** P2-0056, этап 3: «Объекты и места» — список помещений из Excel: «⋯ → Загрузить из Excel / Скачать шаблон», брошенный файл →
 *  лист предпросмотра (столбцы узнаны, итог, строки «светофором», правка столбца → новый предпросмотр), «Создать» той же меткой,
 *  плашка «Отменить» → снятие загрузки; ошибки — «Создать» недоступна; PDF и не-Excel — подсказки; без сети меню нет;
 *  площадь и комнаты в карточке квартиры. Подставной сервер. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import ExcelJS from 'exceljs';
import type { ImportResult, ImportRow, PlaceNode, ProjectCard, ProjectsApi } from '../../core/projects.service.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { ObjectsPlaces } = await import('../ObjectsPlaces.ts');
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const click = (b: N) => b.dispatchEvent(new win.Event('click', { bubbles: true }));
const tick = (): Promise<void> => settle();
async function until(cond: () => boolean, ms = 4000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error('не дождались'); await new Promise((r) => setTimeout(r, 20)); }
  await tick();
}
function setValue(el: N, value: string): void {
  const proto = el.tagName === 'SELECT' ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new win.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}
/** Бросить файл на элемент: drop с dataTransfer (типы и файлы), как браузер. */
function drop(el: N, file: N): void {
  const ev: N = new win.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', { value: { types: ['Files'], files: [file] } });
  el.dispatchEvent(ev);
}
async function xlsx(rows: (string | number | null)[][]): Promise<N> {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Лист1'); rows.forEach((r) => ws.addRow(r));
  const buf = new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer);
  return new win.File([buf as N], 'spisok.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
const FILE = [['Корпус', 'Секция', 'Этаж', 'Квартира', 'Площадь общая', 'Площадь жилая', 'Комнат'],
  ['Корпус 1', 1, 1, 1, 38.4, 20, '1к'], [null, null, null, 2, '61,2', 35, 2], [null, null, 2, 3, 40, 22, 'студия']];

const PROJECT: ProjectCard = { id: 'p1', name: 'ЖК Тест', code: null, archived_at: null, created_at: '', can_manage: true, division_id: null, division_name: null,
  address: null, planned_start: null, planned_finish: null, manager_user_id: null, manager_name: null, stage: 'construction', our_role: null,
  timezone: 'Europe/Moscow', country: 'RU', object_count: 0, place_count: 0, places_led_by_quality: false };
const KINDS = [{ code: 'building', name: 'Корпус', sort_order: 1 }];

function fakeServer(opts: { errors?: ImportResult['errors'] } = {}) {
  const calls: { fn: string; args: unknown[] }[] = [];
  const objs: PlaceNode[] = [{ id: 'k1', parent_id: null, node_type: 'object', object_kind: 'building', name: 'Корпус 1', build_no: null, bti_no: null,
    sort_order: 1, depth: 1, path: 'Корпус 1', child_count: 1, apartment_count: 1 }];
  const apt: PlaceNode = { id: 'a1', parent_id: 'k1', node_type: 'apartment', object_kind: null, name: 'кв. 1', build_no: '1', bti_no: null,
    sort_order: 1, depth: 2, path: 'Корпус 1 · кв. 1', child_count: 0, apartment_count: null, area: 38.4, rooms: 1 };
  const res = (rows: ImportRow[], dry: boolean): ImportResult => ({ ok: !opts.errors, dryRun: dry, repeat: false,
    created: { objects: 0, sections: 1, floors: 2, apartments: rows.length - 1 }, existingRows: [3], differs: [], errors: opts.errors || [], roots: dry ? [] : ['s1'] });
  const api = {
    async projectPlaces(_p: string, parent: string | null) { return parent === null ? objs : parent === 'k1' ? [{ ...apt }] : []; },
    async savePlace() { return { ok: true, value: 'x' }; },
    async importPlaces(p: string, batch: string, rows: ImportRow[], dry: boolean) { calls.push({ fn: 'import', args: [p, batch, rows, dry] }); return { ok: true, value: res(rows, dry) }; },
    async importUndo(batch: string) { calls.push({ fn: 'undo', args: [batch] }); return { ok: true, value: 4 }; },
    async savePlaceInfo(id: string, area: number | null, rooms: number | null) {
      calls.push({ fn: 'info', args: [id, area, rooms] }); Object.assign(apt, { area, rooms }); return { ok: true, value: id }; }
  } as unknown as ProjectsApi;
  return { api, calls, apt };
}
function mount(api: ProjectsApi) {
  const el: N = win.document.createElement('div'); win.document.body.appendChild(el);
  const root = createRoot(el);
  flushSync(() => root.render(createElement(ObjectsPlaces, { api, project: PROJECT, kinds: KINDS })));
  return { el, root };
}
const q = (el: N, id: string): N => el.querySelector(`[data-testid="${id}"]`) || win.document.querySelector(`[data-testid="${id}"]`);

test('«⋯» у «+ Объект»: «Загрузить из Excel…» и «Скачать шаблон»; поле выбора файла — только .xlsx', async () => {
  const s = fakeServer(); const { el, root } = mount(s.api); await tick();
  click(q(el, 'op-head-more')); await tick();
  const items = [...el.querySelectorAll('.p2-more__item')].map((x: N) => x.textContent);
  assert.ok(items.some((t) => /Загрузить из Excel/.test(t)) && items.some((t) => /Скачать шаблон/.test(t)), items.join(' | '));
  assert.match(q(el, 'op-import-file').getAttribute('accept'), /\.xlsx/);
  root.unmount();
});

test('брошенный Excel: лист предпросмотра, столбцы узнаны, итог и строки; «Создать» той же меткой; «Отменить» снимает загрузку', async () => {
  const s = fakeServer(); const { el, root } = mount(s.api); await tick();
  drop(q(el, 'op-root'), await xlsx(FILE));
  await until(() => !!q(el, 'op-imp-sum'));
  const roles = [...win.document.querySelectorAll('[data-testid="op-imp-role"]')].map((x: N) => x.value);
  assert.deepEqual(roles, ['object', 'section', 'floor', 'name', 'area', 'ignore', 'rooms'], 'общая площадь — площадь, жилая — «не брать»');
  const dry = s.calls.filter((c) => c.fn === 'import');
  assert.equal(dry.length, 1); assert.equal(dry[0].args[3], true, 'предпросмотр — без записи');
  const rows = dry[0].args[2] as ImportRow[];
  assert.deepEqual(rows.map((r) => [r.row_no, r.object, r.section, r.floor, r.name, r.build_no, r.area, r.rooms]), [
    [2, 'Корпус 1', 'Секция 1', 'эт. 1', 'кв. 1', '1', '38.4', '1'], [3, 'Корпус 1', 'Секция 1', 'эт. 1', 'кв. 2', '2', '61,2', '2'],
    [4, 'Корпус 1', 'Секция 1', 'эт. 2', 'кв. 3', '3', '40', '0']]);
  assert.match(q(el, 'op-imp-sum').textContent, /Будет создано: 1 секция, 2 этажа, 2 помещения/);
  assert.deepEqual([...win.document.querySelectorAll('[data-testid="op-imp-rows"] tbody tr')].map((x: N) => x.dataset.status), ['new', 'exists', 'new']);
  assert.match(q(el, 'op-imp-go').textContent, /Создать 5 мест/);
  // поправить столбец: жилая площадь вместо общей → новый предпросмотр с другими площадями
  setValue(win.document.querySelectorAll('[data-testid="op-imp-role"]')[5], 'area');
  await until(() => s.calls.filter((c) => c.fn === 'import').length === 2);
  assert.equal((s.calls[1].args[2] as ImportRow[])[0].area, '20', 'площадь — из «жилой»');
  setValue(win.document.querySelectorAll('[data-testid="op-imp-role"]')[4], 'area');
  await until(() => s.calls.filter((c) => c.fn === 'import').length === 3);
  click(q(el, 'op-imp-go'));
  await until(() => !q(el, 'op-import'));
  const go = s.calls.filter((c) => c.fn === 'import')[3];
  assert.equal(go.args[3], false); assert.equal(go.args[1], dry[0].args[1], 'та же метка загрузки, что у предпросмотра');
  assert.match(q(el, 'op-toast').textContent, /Создано 5: 1 секция, 2 этажа, 2 помещения/);
  click(q(el, 'op-undo')); await until(() => s.calls.some((c) => c.fn === 'undo'));
  assert.deepEqual(s.calls.find((c) => c.fn === 'undo')!.args, [dry[0].args[1]]);
  root.unmount();
});

test('ошибки в строках: «Создать» недоступна, подсказка какие строки исправить; закрыть — ничего не создано', async () => {
  const s = fakeServer({ errors: [{ row_no: 3, msg: 'Площадь — положительное число меньше 100 000 м²' }] });
  const { el, root } = mount(s.api); await tick();
  drop(q(el, 'op-root'), await xlsx(FILE));
  await until(() => !!q(el, 'op-imp-sum'));
  assert.match(q(el, 'op-imp-sum').textContent, /Создать пока нельзя.*ошибок 1.*Исправьте в файле строку 3/s);
  assert.equal(q(el, 'op-imp-go').disabled, true);
  assert.match((win.document.querySelector('tr.is-error') as N).textContent, /Площадь — положительное/);
  click(q(el, 'op-import-close')); await tick();
  assert.ok(!q(el, 'op-import'));
  assert.ok(s.calls.every((c) => c.fn !== 'import' || c.args[3] === true), 'только предпросмотр');
  root.unmount();
});

test('PDF — «в следующем обновлении», .docx и старый .xls — «нужен .xlsx»; лист не открывается', async () => {
  const s = fakeServer(); const { el, root } = mount(s.api); await tick();
  drop(q(el, 'op-root'), new win.File(['%PDF'], 'plan.pdf', { type: 'application/pdf' })); await tick();
  assert.match(q(el, 'op-notice').textContent, /PDF-планы/);
  drop(q(el, 'op-root'), new win.File(['x'], 'spisok.docx', { type: 'application/msword' })); await tick();
  assert.match(el.querySelector('.pf-error').textContent, /Нужен файл Excel \(\.xlsx\)/);
  drop(q(el, 'op-root'), new win.File(['x'], 'old.xls', { type: 'application/vnd.ms-excel' })); await tick();
  assert.match(el.querySelector('.pf-error').textContent, /сохраните файл как \.xlsx/);
  assert.ok(!q(el, 'op-import') && s.calls.length === 0);
  root.unmount();
});

test('без сети: загрузки из Excel нет (только просмотр), брошенный файл не открывается', async () => {
  const nav = globalThis.navigator as N; const desc = Object.getOwnPropertyDescriptor(nav, 'onLine');
  Object.defineProperty(nav, 'onLine', { configurable: true, get: () => false });
  const s = fakeServer(); const { el, root } = mount(s.api); await tick();
  assert.ok(!q(el, 'op-head-more'));
  drop(q(el, 'op-root'), await xlsx(FILE)); await tick();
  assert.ok(!q(el, 'op-import'));
  root.unmount();
  if (desc) Object.defineProperty(nav, 'onLine', desc); else delete nav.onLine;
});

test('карточка квартиры: площадь и комнаты; «54,3» → 54.3; неверная площадь — ошибка без запроса; комнаты списком; «Отменить» возвращает', async () => {
  const s = fakeServer(); const { el, root } = mount(s.api); await tick(); await tick();
  const row = [...el.querySelectorAll('[data-node-id]')].find((n: N) => n.querySelector('.p2-tree__name b')?.textContent === 'кв. 1');
  assert.match(row.textContent, /38,4 м² · 1к/, 'в строке дерева — площадь и комнаты');
  click(row.querySelector('[data-testid="p2-tree-open"]')); await tick();
  const area = q(el, 'op-c-area');
  assert.equal(area.value, '38,4'); assert.equal(q(el, 'op-c-rooms').value, '1');
  setValue(area, 'много'); area.dispatchEvent(new win.Event('blur', { bubbles: false })); area.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true })); await tick();
  assert.match(el.querySelector('.pf-error').textContent, /Площадь — число больше нуля/);
  assert.ok(!s.calls.some((c) => c.fn === 'info'));
  setValue(q(el, 'op-c-area'), '54,3'); q(el, 'op-c-area').dispatchEvent(new win.FocusEvent('focusout', { bubbles: true })); await tick(); await tick();
  assert.deepEqual(s.calls.filter((c) => c.fn === 'info')[0].args, ['a1', 54.3, 1]);
  setValue(q(el, 'op-c-rooms'), '0'); await tick(); await tick();
  assert.deepEqual(s.calls.filter((c) => c.fn === 'info')[1].args, ['a1', 54.3, 0], 'студия = 0');
  click(q(el, 'op-undo')); await tick(); await tick();
  assert.deepEqual(s.calls.filter((c) => c.fn === 'info')[2].args, ['a1', 54.3, 1], '«Отменить» — прежние комнаты');
  root.unmount();
});
