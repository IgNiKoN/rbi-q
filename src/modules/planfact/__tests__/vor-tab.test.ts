/// <reference types="node" />
/** Экран «ВОР» (P2-0006, этап 1): выбор файла → лист-ВОР выбран сам, счётчики, фильтр по типу, «не похоже на ВОР», ошибка чтения. DOM — happy-dom. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { VorTab } from '../vor/VorTab.ts';
import type { LoadedFile } from '../vor/VorTab.ts';
import type { VorApi, VorImport, VorProfile } from '../vor/vor.service.ts';
import { chunks, toServerRow } from '../vor/vor.service.ts';
import { routeFromHash } from '../PlanfactApp.ts';
import { settle, until } from '../../../test-utils/settle.ts';
import { kvrSheet } from './kvr-fixture.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
before(() => {
  g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
  g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
});
const tick = (): Promise<void> => settle();
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const BOOK: LoadedFile = { name: 'вор.xlsx', sha256: 'a'.repeat(64), sheets: [
  { name: 'График', rows: [[null, '№', 'Наименование работ', 'Ед. изм.', 'Количество', 'Норма выработки']] },
  { name: 'ВОР', hidden: true, rows: [
    ['№', 'Наименование работ', 'Ед. изм.', 'Норма расхода', 'Объём'],
    [1, 'Секция 1'],
    [2, 'Устройство пола «Альфа»', 'м2', null, 10],
    [3, 'Смесь «Бета»', 'кг', 7.5, 75]
  ] }
] };

function mount(load: (f: File) => Promise<LoadedFile>, api: VorApi | null = null) {
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  const root = createRoot(el as unknown as HTMLElement);
  flushSync(() => root.render(createElement(VorTab, { load, api })));
  return el as N;
}

/** Подставной сервер ВОР: права по проекту, хранилище загрузок, порции строк. */
function fakeApi(perms: string[], opts: { saveError?: string } = {}) {
  const store: VorImport[] = [];
  const saved: { rows: number; sheet: string; sha: string; profileId?: string | null }[] = [];
  const profiles: VorProfile[] = [];
  const no = async () => ({ ok: false as const, message: 'не нужно в этом тесте' });
  const api: VorApi = {
    async listProjects() { return [{ id: 'p1', name: 'ЖК Альфа', company_id: 'c' }]; },
    async permissions() { return perms; },
    async listImports() { return store.slice(); },
    async importRows() { return []; },
    async saveDraft(p, rows, onProgress) {
      if (opts.saveError) return { ok: false, message: opts.saveError };
      saved.push({ rows: rows.length, sheet: p.sheet, sha: p.sha256, profileId: p.profileId });
      if (onProgress) onProgress(rows.length);
      store.push({ id: 'i' + store.length, file_name: p.fileName, sheet_name: p.sheet, status: 'draft', row_count: rows.length, works: 1, positions: 0,
        created_at: '2026-10-21T10:00:00Z', created_by_email: 'pto@test.invalid', confirmed_at: null, profile_id: null });
      return { ok: true, value: 'i' + (store.length - 1) };
    },
    async deleteImport(id) { const k = store.findIndex((x) => x.id === id); if (k >= 0) store.splice(k, 1); return { ok: true, value: null }; },
    async listProfiles() { return profiles.slice(); },
    async saveProfile(_p, name, signature, map) {
      const old = profiles.find((x) => x.signature === signature);
      if (old) { old.name = name; old.column_map = map; return { ok: true, value: old.id }; }
      profiles.push({ id: 'f' + profiles.length, name, signature, column_map: map, rules: {}, updated_at: '' });
      return { ok: true, value: 'f' + (profiles.length - 1) };
    },
    async listWorkTypes() { return []; }, addWorkType: no, addWorkTypes: no,
    async dictionary() { return []; }, learn: no, resolveRows: no, confirm: no, async positions() { return []; }
  };
  return { api, store, saved, profiles };
}

async function choose(el: N, name: string) {
  const input = el.querySelector('[data-testid="vor-file"]');
  const file = new win.File(['x'], name);
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
  await until(() => el.querySelector('[data-testid="vor-sheet"]') || el.querySelector('.pf-error'));
}

test('маршрут #/planfact/vor → страница «ВОР»; #/planfact — «Сводка» (P2-0009)', () => {
  assert.equal(routeFromHash('#/planfact/vor').page, 'vor');
  assert.equal(routeFromHash('#/planfact').page, 'summary');
});

test('файл выбран → открыт лист-ВОР (даже скрытый), график помечен «не похоже на ВОР», счётчики и строки с местом', async () => {
  const el = mount(async () => BOOK);
  await choose(el, 'вор.xlsx');
  const sel = el.querySelector('[data-testid="vor-sheet"]');
  assert.equal(sel.value, 'ВОР');
  assert.match(sel.textContent, /График — не похоже на ВОР/);
  assert.match(sel.textContent, /ВОР \(скрытый\)/);
  assert.match(el.querySelector('[data-testid="vor-summary"]').textContent, /1 работ.*1 материалов/);
  const work = el.querySelector('[data-kind="work"]');
  assert.match(work.textContent, /Устройство пола «Альфа»/);
  assert.match(work.textContent, /Секция 1/);
  // фильтр «Материалы»
  const tab = Array.from(el.querySelectorAll('.vor-filter button') as N[]).find((b: N) => b.textContent === 'Материалы') as N;
  tab.click(); await tick();
  assert.equal(el.querySelectorAll('[data-kind="work"]').length, 0);
  assert.equal(el.querySelectorAll('[data-kind="material"]').length, 1);
  // переключение на график → понятная причина
  sel.value = 'График';
  sel.dispatchEvent(new win.Event('change', { bubbles: true })); await tick();
  assert.match(el.querySelector('[data-testid="vor-notvor"]').textContent, /не похож на ВОР/);
});

test('файл с КВР / Номенклатурой (P2-0012): 41 работа, 16 групп, «сверка с КВР: 25 сходятся, расхождений 1», жёлтые строки и пояснения', async () => {
  const el = mount(async () => ({ name: 'оферта.xlsx', sha256: 'b'.repeat(64), sheets: [kvrSheet()] }));
  await choose(el, 'оферта.xlsx');
  assert.match(el.querySelector('[data-testid="vor-summary"]').textContent, /41 работ.*16 групп/);
  assert.match(el.querySelector('[data-testid="vor-kvr-checks"]').textContent, /25 сходятся, расхождений 1/);
  const warn = Array.from(el.querySelectorAll('[data-warn="1"]') as N[]);
  assert.equal(warn.length, 2); // строка Номенклатуры и её КВР
  assert.match(warn.map((w: N) => w.textContent).join(' '), /не сходится с КВР \(стр\. \d+\): Работа «Вид 23» — по работам 13,08 м2, в КВР 1\s061,1 м2/);
  assert.match(el.querySelector('[data-kind="work"]').textContent, /Пояснение 1/);
});

test('не .xlsx и повреждённый файл → понятная ошибка, без падения', async () => {
  const el = mount(async () => { throw new Error('Файл повреждён или это не .xlsx — открыть не удалось.'); });
  await choose(el, 'смета.xls');
  assert.match(el.querySelector('[role="alert"]').textContent, /Нужен файл Excel \.xlsx/);
  await choose(el, 'битый.xlsx');
  assert.match(el.querySelector('[role="alert"]').textContent, /повреждён/);
});

test('ПТО: проект → «Сохранить черновик» → загрузка в списке проекта; удаление черновика с подтверждением', async () => {
  const { api, saved, store } = fakeApi(['planfact.vor.manage']);
  const el = mount(async () => BOOK, api);
  await tick();
  assert.equal(el.querySelector('[data-testid="vor-project"]').value, 'p1');
  assert.ok(el.querySelector('[data-testid="vor-imports-empty"]'));
  await choose(el, 'вор.xlsx');
  el.querySelector('[data-testid="vor-save"]').click(); await tick();
  assert.deepEqual(saved, [{ rows: 3, sheet: 'ВОР', sha: 'a'.repeat(64), profileId: 'f0' }]);
  assert.ok(el.querySelector('[data-testid="vor-draft"]'), 'после сохранения открыт черновик');
  el.querySelector('[data-testid="vor-back"]').click(); await tick();
  assert.match(el.querySelector('[data-testid="vor-notice"]').textContent, /Черновик сохранён: 3 строк/);
  assert.match(el.querySelector('[data-testid="vor-imports"]').textContent, /вор\.xlsx.*лист «ВОР».*Черновик/);
  el.querySelector('[data-testid="vor-delete"]').click(); await tick();
  el.querySelector('[data-testid="vor-delete-yes"]').click(); await tick();
  assert.equal(store.length, 0);
  assert.ok(el.querySelector('[data-testid="vor-imports-empty"]'));
});

test('прораб (без planfact.vor.manage): видит загрузки, загрузки файла и «Сохранить» нет', async () => {
  const { api } = fakeApi(['planfact.works.view']);
  const el = mount(async () => BOOK, api);
  await tick();
  assert.ok(el.querySelector('[data-testid="vor-readonly"]'));
  assert.equal(el.querySelector('[data-testid="vor-file"]'), null);
  assert.equal(el.querySelector('[data-testid="vor-save"]'), null);
});

test('ошибка сервера при сохранении показана, без падения', async () => {
  const { api } = fakeApi(['planfact.vor.manage'], { saveError: 'Нет права загружать ВОР' });
  const el = mount(async () => BOOK, api);
  await tick();
  await choose(el, 'вор.xlsx');
  el.querySelector('[data-testid="vor-save"]').click(); await tick();
  assert.match(el.querySelector('[role="alert"]').textContent, /Нет права загружать ВОР/);
});

test('порции по 1 000 и строка для сервера', () => {
  assert.deepEqual(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.equal(chunks(Array.from({ length: 2500 }, (_, i) => i), 1000).length, 3);
  const r = toServerRow({ rowNo: 13, kind: 'material', number: '6', name: 'Смесь', unitText: 'кг', qty: 75, norm: 7.5, prices: {}, context: { section: '1' }, parentRowNo: 12, raw: [6, 'Смесь'] });
  assert.deepEqual(r, { row_no: 13, kind: 'material', number: '6', name: 'Смесь', unit_text: 'кг', qty: 75, norm: 7.5, prices: {}, context: { section: '1' }, parent_row_no: 12, raw: [6, 'Смесь'] });
});

/** Две «формы» одного заказчика: лист 142 (Объём) и лист 141 (Кол-во, другая формулировка) + одна правка колонки. */
const TWO: LoadedFile = { name: 'ФКП.xlsx', sha256: 'b'.repeat(64), sheets: [
  { name: '142', rows: [['№', 'Наименование работ', 'Ед. изм.', 'Объём', 'Примечание'], [1, 'Пол «Альфа»', 'м2', 10, 'x'], [2, 'Стены «Бета»', 'м2', 20, 'y']] },
  { name: '141', rows: [['№', 'Наименование работ', 'Ед.изм.', 'Кол-во', 'Примечание'], [1, 'Пол «Альфа»', 'м2', 5, 'x']] }
] };

test('профиль формы: правка колонки сразу меняет разбор; сохранение запоминает форму; второй лист той же формы узнан без правки', async () => {
  const { api, profiles, saved } = fakeApi(['planfact.vor.manage']);
  const el = mount(async () => TWO, api);
  await tick();
  await choose(el, 'ФКП.xlsx');
  assert.match(el.querySelector('[data-testid="vor-profile-status"]').textContent, /Новая форма/);
  // Правка: «Наименование» → колонка «Примечание» (E) — разбор сразу другой
  const nameSel = el.querySelector('select[data-role="name"]');
  nameSel.value = '4'; nameSel.dispatchEvent(new win.Event('change', { bubbles: true })); await tick();
  const w0 = el.querySelector('[data-kind="work"]').textContent;
  assert.ok(w0.includes('x') && !w0.includes('Пол'), w0);
  assert.match(el.querySelector('[data-testid="vor-profile-status"]').textContent, /изменена вручную/);
  el.querySelector('[data-testid="vor-cols-reset"]').click(); await tick();
  assert.match(el.querySelector('[data-kind="work"]').textContent, /Пол «Альфа»/);
  // Правка ЕИ → нет; название формы; сохранение
  const unitSel = el.querySelector('select[data-role="unit"]');
  unitSel.value = ''; unitSel.dispatchEvent(new win.Event('change', { bubbles: true })); await tick();
  const nm = el.querySelector('[data-testid="vor-profile-name"]');
  // react-dom загружен до подставного window → считает «input» неподдерживаемым и следит за полем через focusin + keyup
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
  nm.dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }));
  setter.call(nm, 'Заказчик — ФКП'); nm.dispatchEvent(new win.KeyboardEvent('keyup', { bubbles: true })); await tick();
  el.querySelector('[data-testid="vor-save"]').click(); await tick();
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].name, 'Заказчик — ФКП');
  assert.equal((profiles[0].column_map as { unit: unknown }).unit, null);
  assert.equal(saved[0].profileId, 'f0');
  el.querySelector('[data-testid="vor-back"]').click(); await tick();
  // Лист 141 — та же форма: узнан, ЕИ «нет» из профиля, без правки
  const sel = el.querySelector('[data-testid="vor-sheet"]');
  sel.value = '141'; sel.dispatchEvent(new win.Event('change', { bubbles: true })); await tick();
  assert.match(el.querySelector('[data-testid="vor-profile-status"]').textContent, /Форма узнана: «Заказчик — ФКП»/);
  assert.equal(el.querySelector('select[data-role="unit"]').value, '');
  el.querySelector('[data-testid="vor-save"]').click(); await tick();
  el.querySelector('[data-testid="vor-back"]').click(); await tick();
  assert.equal(profiles.length, 1, 'узнанная форма не создаёт второй профиль');
  assert.equal(saved[1].profileId, 'f0');
});
