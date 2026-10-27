/// <reference types="node" />
/** Экраны редакций ВОР (P2-0006b, этап 4): «Загрузить новую редакцию» к действующей, прежние редакции, ошибки с номером строки,
 *  «Что изменилось» — 🟡 / 🔴, «Принять» недоступна до решений, данные принятия. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { VorTab } from '../vor/VorTab.ts';
import type { LoadedFile } from '../vor/VorTab.ts';
import { VorRevision, moveTargets } from '../vor/VorRevision.ts';
import { compareRevision, applyYellow } from '../vor/revision.ts';
import type { BaseRow } from '../vor/revision.ts';
import type { AcceptResult, VorApi, VorImport, VorRow } from '../vor/vor.service.ts';
import { settle, until } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
before(() => {
  g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
  g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
});
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const BOOK: LoadedFile = { name: 'вор ред2.xlsx', sha256: 'c'.repeat(64), sheets: [
  { name: 'ВОР', rows: [
    ['№', 'Наименование работ', 'Ед. изм.', 'Объём'],
    [1, 'Секция 1'],
    [2, 'Штукатурка стен', 'м2', 100],
    [3, 'Монтаж лючков', null, 4],
    [4, 'Окраска стен', 'м2', 0]
  ] }] };

const imp = (o: Partial<VorImport>): VorImport => ({ id: 'i1', file_name: 'вор ред1.xlsx', sheet_name: 'ВОР', status: 'confirmed', row_count: 10, works: 3, positions: 3,
  created_at: '2026-10-01T10:00:00Z', created_by_email: 'pto@test.invalid', confirmed_at: '2026-10-01T11:00:00Z', profile_id: null,
  revision_no: 1, previous_import_id: null, root_import_id: 'i1', is_current: true, confirmed_by_email: 'pto@test.invalid', ...o });

function fakeApi(store: VorImport[], base: BaseRow[] = []) {
  const saved: { previousId?: string | null }[] = [];
  const accepted: { items: unknown; red: unknown }[] = [];
  const no = async () => ({ ok: false as const, message: 'не нужно в этом тесте' });
  const api: VorApi = {
    async listProjects() { return [{ id: 'p1', name: 'ЖК Альфа', company_id: 'c' }]; },
    async permissions() { return ['planfact.vor.manage']; },
    async listImports() { return store.slice(); },
    async importRows() { return []; },
    async saveDraft(p) { saved.push({ previousId: p.previousId }); return { ok: true, value: 'i9' }; },
    deleteImport: no, async listProfiles() { return []; }, saveProfile: async () => ({ ok: true, value: 'f1' }),
    async listWorkTypes() { return []; }, addWorkType: no, addWorkTypes: no,
    async dictionary() { return []; }, learn: no, resolveRows: no, confirm: no, async positions() { return []; },
    async revisionBase() { return { ok: true, value: base }; },
    async acceptRevision(_i, items, red) {
      accepted.push({ items, red });
      return { ok: true, value: { revision_no: 2, added: 1, unchanged: 1, qty_changed: 0, withdrawn: 1, fact_kept: 1, fact_moved_entries: 0 } };
    },
    async revisionChanges() { return []; }
  };
  return { api, saved, accepted };
}

function mount(node: ReturnType<typeof createElement>) {
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  const root = createRoot(el as unknown as HTMLElement);
  flushSync(() => root.render(node));
  return el as N;
}
async function choose(el: N, testId: string) {
  const input = el.querySelector(`[data-testid="${testId}"]`);
  Object.defineProperty(input, 'files', { value: [new win.File(['x'], 'вор ред2.xlsx')], configurable: true });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
  await until(() => el.querySelector('[data-testid="vor-sheet"]'));
}

test('есть действующая редакция → «Загрузить новую редакцию» (главное) и «Отдельная ВОР»; черновик — к действующей №1', async () => {
  const { api, saved } = fakeApi([imp({})]);
  const el = mount(createElement(VorTab, { api, load: async () => BOOK }));
  await until(() => el.querySelector('[data-testid="vor-file-revision"]'));
  assert.ok(el.querySelector('[data-testid="vor-file-separate"]'), 'отдельная ВОР — второстепенная кнопка');
  assert.equal(el.querySelector('[data-testid="vor-file"]'), null);
  assert.match(el.querySelector('[data-testid="vor-imports"]').textContent, /Действующая · №1/);
  assert.match(el.querySelector('[data-testid="vor-steps"]').textContent, /Загрузить новую редакцию/);
  await choose(el, 'vor-file-revision');
  assert.match(el.querySelector('[data-testid="vor-rev-target"]').textContent, /Новая редакция №2.*заменит действующую №1/);
  // ошибки с номером строки: нет ЕИ (стр. 4), объём 0 (стр. 5); нажатие — к строке
  const errs = el.querySelector('[data-testid="vor-errors"]');
  assert.match(errs.textContent, /Ошибки в файле: 2/);
  assert.match(errs.textContent, /Строка 4нет ЕИ.*Строка 5объём 0 или пусто/);
  let scrolled = 0;
  (win.HTMLElement.prototype as N).scrollIntoView = function () { scrolled++; };
  errs.querySelector('[data-row-error="4"]').click();
  await until(() => scrolled > 0 || null);
  assert.ok(el.querySelector('[data-row="4"]').classList.contains('vor-row--flash'));
  el.querySelector('[data-testid="vor-save"]').click();
  await until(() => saved.length || null);
  assert.equal(saved[0].previousId, 'i1');
});

test('отдельная ВОР — без предыдущей; заменённая редакция — «Прежние редакции», только просмотр', async () => {
  const { api, saved } = fakeApi([imp({ id: 'i2', file_name: 'вор ред2.xlsx', revision_no: 2, previous_import_id: 'i1', root_import_id: 'i1' }),
    imp({ is_current: false })]);
  const el = mount(createElement(VorTab, { api, load: async () => BOOK }));
  await until(() => el.querySelector('[data-testid="vor-old-revisions"]'));
  const list = el.querySelector('[data-testid="vor-imports"]').textContent;
  assert.match(list, /вор ред2\.xlsx.*Действующая · №2.*Прежние редакции.*вор ред1\.xlsx.*№1 · заменена/);
  await choose(el, 'vor-file-separate');
  assert.equal(el.querySelector('[data-testid="vor-rev-target"]'), null);
  el.querySelector('[data-testid="vor-save"]').click();
  await until(() => saved.length || null);
  assert.equal(saved[0].previousId, null);
});

const row = (row_no: number, name: string, qty: number, o: Partial<VorRow> = {}): VorRow => ({ id: 'n' + row_no, row_no, kind: 'work', number: null, name, unit_text: 'м2',
  qty, norm: null, prices: {}, context: { section: '1' }, parent_row_no: null, location_id: 'L1', work_type_id: 'W:' + name, unit_id: 'm2', match: 'green', ...o });
const brow = (row_no: number, name: string, qty: number, o: Partial<BaseRow> = {}): BaseRow => ({ source_row_id: 's' + row_no, row_no, number: null, name, unit_text: 'м2', qty,
  context: { section: '1' }, location_id: 'L1', work_type_id: 'W:' + name, unit_id: 'm2', position_id: 'p' + row_no, position_qty: qty, fact_qty: 0, pending_qty: 0, ...o });

test('«Что изменилось»: сначала то, что решить; «Принять» недоступна до решения 🔴; «Оставить» → принятие с решением', async () => {
  const base = [brow(1, 'Штукатурка стен', 100), brow(2, 'Стяжка пола', 30, { fact_qty: 5 })];
  const rows = [row(1, 'Грунтовка стен', 10), row(2, 'Штукатурка стен', 100)];
  const { api, accepted } = fakeApi([], base);
  let done: AcceptResult | null = null;
  const el = mount(createElement(VorRevision, { api, imp: imp({ id: 'i2', status: 'draft', revision_no: 2, previous_import_id: 'i1', is_current: false }), rows, canManage: true,
    onBack: () => {}, onAccepted: (r: AcceptResult) => { done = r; } }));
  await until(() => el.querySelector('[data-testid="vor-revision"]'));
  const tabs = el.querySelector('.vor-rev-filter').textContent;
  assert.match(tabs, /Все 3.*Решить 1.*Добавлено 1.*Удалено 1.*Объём 0.*Без изменений 1/);
  const shown = Array.from(el.querySelectorAll('[data-testid="vor-rev-row"]') as N[]);
  assert.equal(shown.length, 1);
  assert.match(shown[0].textContent, /Факт без плана.*Стяжка пола/);
  const accept = el.querySelector('[data-testid="vor-rev-accept"]');
  assert.equal(accept.disabled, true);
  assert.match(el.querySelector('[data-testid="vor-rev-left"]').textContent, /Факт без плана — нужно решение: 1/);
  el.querySelector('[data-testid="vor-rev-decide"]').click(); await settle();
  assert.match(el.querySelector('[data-testid="vor-rev-move-to"]').textContent, /Грунтовка стен.*новая строка 1/);
  el.querySelector('[data-testid="vor-rev-keep"]').click(); await settle();
  assert.equal(el.querySelector('[data-testid="vor-rev-accept"]').disabled, false);
  el.querySelector('[data-testid="vor-rev-accept"]').click();
  await until(() => done);
  assert.deepEqual(accepted[0], { items: [{ row_no: 1, position_id: null }, { row_no: 2, position_id: 'p1' }], red: [{ position_id: 'p2', action: 'keep' }] });
});

test('🟡 похожее название: «Та же строка» сохраняет позицию; без права — кнопок решения и «Принять» нет', async () => {
  const base = [brow(1, 'Монтаж ревизионных пластиковых лючков в с/у', 12, { work_type_id: 'W1' })];
  const rows = [row(1, 'Монтаж ревизионных лючков в с/у', 12, { work_type_id: 'W1' })];
  const { api, accepted } = fakeApi([], base);
  const el = mount(createElement(VorRevision, { api, imp: imp({ id: 'i2', status: 'draft', revision_no: 2, previous_import_id: 'i1' }), rows, canManage: true,
    onBack: () => {}, onAccepted: () => {} }));
  await until(() => el.querySelector('[data-testid="vor-rev-same"]'));
  assert.match(el.querySelector('[data-testid="vor-rev-row"]').textContent, /было: Монтаж ревизионных пластиковых.*Похожее название/);
  assert.equal(el.querySelector('[data-testid="vor-rev-accept"]').disabled, true);
  el.querySelector('[data-testid="vor-rev-same"]').click(); await settle();
  el.querySelector('[data-testid="vor-rev-accept"]').click();
  await until(() => accepted.length || null);
  assert.deepEqual(accepted[0], { items: [{ row_no: 1, position_id: 'p1' }], red: [] });
  const ro = mount(createElement(VorRevision, { api, imp: imp({ id: 'i2', status: 'draft', revision_no: 2, previous_import_id: 'i1' }), rows, canManage: false,
    onBack: () => {}, onAccepted: () => {} }));
  await until(() => ro.querySelector('[data-testid="vor-rev-bar"]'));
  assert.equal(ro.querySelector('[data-testid="vor-rev-accept"]'), null);
  assert.equal(ro.querySelector('[data-testid="vor-rev-same"]').disabled, true);
});

test('куда перенести факт: только та же ЕИ; сначала похожая строка в том же месте', () => {
  const base = [brow(1, 'Стяжка пола', 30, { fact_qty: 5 }), brow(2, 'Окраска стен', 20)];
  const next = [row(1, 'Окраска стен', 20), row(2, 'Стяжка пола цементная', 30), row(3, 'Монтаж лючков', 4, { unit_text: 'шт', unit_id: 'sht' })];
  // «Стяжка пола цементная» похожа на «Стяжка пола» (🟡); ПТО выбрал «Разные строки» — строка стала новой
  const cmp = compareRevision(base, next.map((r) => ({ ...r, qty: r.qty })));
  const sim = cmp.items.find((i) => !!i.yellow)!;
  assert.deepEqual(moveTargets(cmp.items, base[0]).map((x) => x.value), ['p:p2'], 'сама на себя — нельзя');
  const t = moveTargets(applyYellow(cmp, { [sim.key]: 'split' }).items, base[0]);
  assert.deepEqual(t.map((x) => x.value), ['r:2', 'p:p2']);
});

test('реестр позиций: снятая в новой редакции — «Снята», не «Выполнено»; факт больше объёма — отдельная пометка', async () => {
  const { loadPositionRows, POSITION_COLUMNS } = await import('../vor/PositionsRegistry.ts');
  const sp = (id: string, plan: number, fact: number, withdrawn = false) => ({ position_id: id, location_id: 'L', location_path: 'Корпус 1 · 2 этаж', work_type_id: 'w', work_name: 'Работа ' + id,
    unit_code: 'м²', plan_qty: plan, fact_qty: fact, pct: plan ? fact / plan * 100 : null, rest_qty: Math.max(plan - fact, 0), fact7: 0, fact14: 0, pending_qty: 0,
    forecast_finish: null, delta_days: null, plan_pct_today: null, dev_pp: null, withdrawn });
  const summary = { positions: async () => ({ ok: true, value: [sp('a', 0, 40, true), sp('b', 90, 120), sp('c', 100, 50)] }), portfolio: async () => ({ ok: true, value: [] }) } as N;
  const fact = { positions: async () => ({ ok: true, value: [] }) } as N;
  const r = await loadPositionRows(summary, fact, 'p1', '2026-10-27');
  assert.ok(r.ok);
  const status = POSITION_COLUMNS.find((c) => c.id === 'status')!;
  const text = (r as N).rows.map((x: N) => status.value(x));
  assert.equal(text[0], 'Снята в новой редакции ВОР');
  assert.match(text[1], /факт больше объёма/);
  assert.doesNotMatch(text[2], /факт больше|Снята/);
});
