/// <reference types="node" />
/** Реестр оболочки (P2-0019, этапы 2–3): фильтры и их сочетание, чипы с «×», панель «Фильтрация» (Сбросить / Применить),
 *  «Только просроченные», выбор строк и «Выбрано: N», снять всё, группы со счётчиками статусов, сортировка, колонки, пустое состояние;
 *  палитра — только токены (сторож), синий статус читается в обеих темах. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { createElement: h, useState } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const ui = await import('../../../platform/ui/index.ts');
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

interface Row { id: string; corp: string; work: string; st: 'grey' | 'yellow' | 'green' | 'blue' | 'red'; qty: number; late: boolean }
const ROWS: Row[] = [
  { id: 'a', corp: 'Корпус 10', work: 'Штукатурка', st: 'grey', qty: 5, late: false },
  { id: 'b', corp: 'Корпус 2', work: 'Окраска', st: 'yellow', qty: 30, late: true },
  { id: 'c', corp: 'Корпус 2', work: 'Штукатурка', st: 'green', qty: 12, late: false },
  { id: 'd', corp: 'Корпус 10', work: 'Окраска', st: 'blue', qty: 7, late: true },
];
const COLS: N[] = [
  { id: 'work', label: 'Работа', value: (r: Row) => r.work, fixed: true },
  { id: 'corp', label: 'Корпус', value: (r: Row) => r.corp },
  { id: 'qty', label: 'Объём', value: (r: Row) => r.qty, align: 'right' },
  { id: 'note', label: 'Пометка', value: () => null, hidden: true },
];
const FILTERS: N[] = [
  { id: 'corp', label: 'Корпус', get: (r: Row) => r.corp },
  { id: 'work', label: 'Вид работ', get: (r: Row) => r.work },
];

function mount(el: N): N {
  const box = win.document.createElement('div');
  win.document.body.appendChild(box);
  flushSync(() => createRoot(box as unknown as HTMLElement).render(el));
  return box;
}
const click = (el: N) => flushSync(() => { el.click(); });
const qa = (box: N, sel: string): N[] => Array.from(box.querySelectorAll(sel));
const rowsShown = (box: N): string[] => qa(box, 'tr[data-row]').map((r) => r.getAttribute('data-row'));

let lastState: N = null;
function Harness(props: { rows?: Row[]; initial?: N; group?: boolean; overdueHint?: string; actions?: boolean }): N {
  const [state, setState] = useState(props.initial || { ...ui.EMPTY_STATE, group: !!props.group });
  const [sel, setSel] = useState(new Set<string>());
  lastState = state;
  return h(ui.RegistryTable as N, {
    testId: 'reg', rows: props.rows || ROWS, rowKey: (r: Row) => r.id, columns: COLS, filters: FILTERS, state, onState: setState,
    isOverdue: (r: Row) => r.late, overdueHint: props.overdueHint, groupBy: { label: 'Корпус', key: (r: Row) => r.corp },
    toneOf: (r: Row) => r.st, toneLabel: { grey: 'не начато' }, selected: sel, onSelect: setSel, empty: 'Позиций нет',
    actions: props.actions ? (rs: Row[]) => h('span', { 'data-testid': 'act' }, rs.map((r) => r.id).join(',')) : undefined,
  });
}

test('модель: фильтры — «или» внутри, «и» между; просроченные; сортировка по-русски с номерами; группы по номеру', () => {
  const s = { ...ui.EMPTY_STATE, f: { corp: ['Корпус 2', 'Корпус 10'], work: ['Окраска'] } };
  assert.deepEqual(ui.filterRows(ROWS, FILTERS, s).map((r: Row) => r.id), ['b', 'd']);
  assert.deepEqual(ui.filterRows(ROWS, FILTERS, { ...ui.EMPTY_STATE, overdue: true }, (r: Row) => r.late).map((r: Row) => r.id), ['b', 'd']);
  assert.deepEqual(ui.filterRows(ROWS, FILTERS, { ...ui.EMPTY_STATE, overdue: true }).map((r: Row) => r.id), [], 'без признака — ничего не просрочено');
  assert.deepEqual(ui.sortRows(ROWS, COLS, { id: 'corp', dir: 'asc' }).map((r: Row) => r.corp), ['Корпус 2', 'Корпус 2', 'Корпус 10', 'Корпус 10']);
  assert.deepEqual(ui.sortRows(ROWS, COLS, { id: 'qty', dir: 'desc' }).map((r: Row) => r.qty), [30, 12, 7, 5]);
  assert.deepEqual(ui.groupRows(ROWS, (r: Row) => r.corp).map((x: N) => [x.key, x.rows.length]), [['Корпус 2', 2], ['Корпус 10', 2]]);
  assert.deepEqual(ui.countTones(ROWS, (r: Row) => r.st), { grey: 1, yellow: 1, green: 1, blue: 1 });
  assert.deepEqual(ui.filterOptions(ROWS, FILTERS[0]).map((o: N) => `${o.label}:${o.count}`), ['Корпус 2:2', 'Корпус 10:2']);
  assert.deepEqual(ui.chipsOf(s, FILTERS).map((c: N) => c.label), ['Корпус: Корпус 2', 'Корпус: Корпус 10', 'Вид работ: Окраска']);
  assert.deepEqual(ui.visibleColumns(COLS, ui.EMPTY_STATE).map((c: N) => c.id), ['work', 'corp', 'qty']);
  assert.deepEqual(ui.visibleColumns(COLS, { ...ui.EMPTY_STATE, cols: ['note'] }).map((c: N) => c.id), ['work', 'note'], 'закреплённая колонка не скрывается');
});

test('вид ↔ адрес: туда и обратно без потерь, кириллица и запятые экранируются, мусор пропускается', () => {
  const s = { f: { corp: ['Корпус 2', 'А,Б'], status: ['done'] }, overdue: true, sort: { id: 'qty', dir: 'desc' as const }, cols: ['corp', 'qty'], group: false };
  const q = ui.stateToQuery(s);
  assert.ok(!/[А-я ]/.test(q), q);
  assert.deepEqual(ui.queryToState(q), s);
  assert.equal(ui.stateToQuery(ui.EMPTY_STATE), '');
  assert.deepEqual(ui.queryToState('x=1&sort=qty:up&f.corp=%E0%A4%A&group=1&cols='), ui.EMPTY_STATE);
  assert.equal(ui.linkFor('#/planfact/vor/positions', { ...ui.EMPTY_STATE, overdue: true }), '#/planfact/vor/positions?overdue=1');
  assert.equal(ui.queryOf('#/planfact/vor/positions?overdue=1'), 'overdue=1');
  assert.equal(ui.queryOf('#/planfact/vor/positions'), '');
});

test('экран: чипы с «×», панель «Фильтрация» — Применить и Сбросить, «Сбросить всё», счётчик «Показано»', () => {
  const box = mount(h(Harness, {}));
  assert.deepEqual(rowsShown(box), ['a', 'b', 'c', 'd']);
  click(box.querySelector('[data-testid="p2-reg-filter"]'));
  const panel = box.querySelector('[data-testid="p2-reg-panel"]');
  assert.ok(panel, 'панель открыта');
  const opt = (f: string, v: string) => panel.querySelector(`[data-filter="${f}"] input[data-value="${v}"]`);
  click(opt('corp', 'Корпус 2')); click(opt('work', 'Окраска'));
  assert.deepEqual(rowsShown(box), ['a', 'b', 'c', 'd'], 'до «Применить» список не меняется');
  click(box.querySelector('[data-testid="p2-reg-panel-apply"]'));
  assert.equal(box.querySelector('[data-testid="p2-reg-panel"]'), null);
  assert.deepEqual(rowsShown(box), ['b']);
  assert.deepEqual(qa(box, '[data-testid="p2-reg-chip"]').map((c) => c.textContent.replace('×', '')), ['Корпус: Корпус 2', 'Вид работ: Окраска']);
  assert.match(box.querySelector('[data-testid="p2-reg-shown"]').textContent, /Показано: 1 из 4/);
  assert.match(box.querySelector('[data-testid="p2-reg-filter"]').textContent, /2$/, 'на кнопке — число фильтров');
  click(qa(box, '[data-testid="p2-reg-chip-x"]')[1]);
  assert.deepEqual(rowsShown(box), ['b', 'c'], '«×» снимает один фильтр');
  click(box.querySelector('[data-testid="p2-reg-filter"]'));
  click(box.querySelector('[data-testid="p2-reg-panel-reset"]'));
  click(box.querySelector('[data-testid="p2-reg-panel-apply"]'));
  assert.deepEqual(rowsShown(box), ['a', 'b', 'c', 'd'], '«Сбросить» в панели');
  click(box.querySelector('[data-testid="p2-reg-filter"]'));
  click(box.querySelector('[data-filter="corp"] input[data-value="Корпус 10"]'));
  click(box.querySelector('[data-testid="p2-reg-panel-apply"]'));
  click(box.querySelector('[data-testid="p2-reg-overdue"]'));
  assert.deepEqual(rowsShown(box), ['d'], 'фильтр + только просроченные');
  assert.equal(box.querySelector('[data-testid="p2-reg-overdue"]').getAttribute('aria-pressed'), 'true');
  click(box.querySelector('[data-testid="p2-reg-reset"]'));
  assert.deepEqual(rowsShown(box), ['a', 'b', 'c', 'd'], '«Сбросить всё»');
  assert.equal(lastState.overdue, false);
});

test('экран: выбор строк, «Выбрано: N» с действиями, выбрать все отфильтрованные, снять выбор', () => {
  const box = mount(h(Harness, { actions: true }));
  assert.equal(box.querySelector('[data-testid="p2-reg-selbar"]'), null);
  const boxes = qa(box, '[data-testid="p2-reg-select"]');
  click(boxes[1]); click(boxes[3]);
  assert.match(box.querySelector('[data-testid="p2-reg-selected"]').textContent, /Выбрано: 2/);
  assert.equal(box.querySelector('[data-testid="act"]').textContent, 'b,d', 'действия получают выбранные строки по порядку экрана');
  click(box.querySelector('[data-testid="p2-reg-unselect"]'));
  assert.equal(box.querySelector('[data-testid="p2-reg-selbar"]'), null);
  click(box.querySelector('[data-testid="p2-reg-overdue"]'));
  click(box.querySelector('[data-testid="p2-reg-select-all"]'));
  assert.match(box.querySelector('[data-testid="p2-reg-selected"]').textContent, /Выбрано: 2/, 'выбрать все — только видимые после фильтра');
  click(box.querySelector('[data-testid="p2-reg-select-all"]'));
  assert.equal(box.querySelector('[data-testid="p2-reg-selbar"]'), null, 'повторно — снять все');
});

test('экран: группы-аккордеоны «Всего: N» с мини-счётчиками статусов, свернуть / развернуть; сортировка заголовком', () => {
  const box = mount(h(Harness, { group: true }));
  const groups = qa(box, 'tbody[data-group]');
  assert.deepEqual(groups.map((x) => x.getAttribute('data-group')), ['Корпус 2', 'Корпус 10']);
  assert.match(groups[0].querySelector('[data-testid="p2-reg-group"]').textContent, /Всего: 2/);
  const counts = qa(groups[1], '[data-testid="p2-reg-count"]').map((b) => `${b.getAttribute('data-status')}:${b.textContent}`);
  assert.deepEqual(counts, ['blue:1', 'grey:1'], 'счётчики по палитре: порядок красный → оранжевый → синий → зелёный → серый');
  assert.equal(qa(groups[1], '[data-testid="p2-reg-count"]')[1].getAttribute('title'), 'не начато');
  click(groups[0].querySelector('[data-testid="p2-reg-group"]'));
  assert.deepEqual(rowsShown(box), ['a', 'd'], 'группа свёрнута');
  assert.equal(groups[0].querySelector('[data-testid="p2-reg-group"]').getAttribute('aria-expanded'), 'false');
  click(box.querySelector('[data-testid="p2-reg-groupby"]'));
  const sort = (col: string) => box.querySelector(`[data-testid="p2-reg-sort"][data-col="${col}"]`);
  click(sort('qty'));
  assert.deepEqual(rowsShown(box), ['a', 'd', 'c', 'b'], 'по возрастанию');
  click(sort('qty'));
  assert.deepEqual(rowsShown(box), ['b', 'c', 'd', 'a'], 'по убыванию');
  assert.equal(sort('qty').closest('th').getAttribute('aria-sort'), 'descending');
  click(sort('qty'));
  assert.deepEqual(rowsShown(box), ['a', 'b', 'c', 'd'], 'третье нажатие — без сортировки');
});

test('экран: выбор колонок (закреплённая не скрывается), «Как было»; пустое состояние; «просроченные» недоступны с подсказкой', () => {
  const box = mount(h(Harness, {}));
  const heads = () => qa(box, 'th [data-testid="p2-reg-sort"]').map((b) => b.getAttribute('data-col'));
  assert.deepEqual(heads(), ['work', 'corp', 'qty']);
  click(box.querySelector('[data-testid="p2-reg-cols-open"]'));
  const pop = box.querySelector('[data-testid="p2-reg-cols"]');
  assert.equal(pop.querySelector('input[data-col="work"]'), null, 'закреплённой колонки в списке нет');
  click(pop.querySelector('input[data-col="corp"]')); click(pop.querySelector('input[data-col="note"]'));
  assert.deepEqual(heads(), ['work', 'qty', 'note']);
  assert.equal(box.querySelector('td[data-col="note"]').textContent, '—');
  click(qa(pop, 'button').find((b) => b.textContent === 'Как было'));
  assert.deepEqual(heads(), ['work', 'corp', 'qty']);

  const empty = mount(h(Harness, { rows: [] }));
  assert.equal(empty.querySelector('[data-testid="p2-reg-empty"]').textContent, 'Позиций нет');
  const none = mount(h(Harness, { initial: { ...ui.EMPTY_STATE, f: { corp: ['Корпус 99'] } } }));
  assert.match(none.querySelector('[data-testid="p2-reg-empty"]').textContent, /Ничего не найдено/);
  const hint = mount(h(Harness, { overdueHint: 'Нет срока объекта' }));
  assert.equal(hint.querySelector('[data-testid="p2-reg-overdue"]').disabled, true);
  assert.equal(hint.querySelector('[data-testid="p2-reg-overdue-hint"]').textContent, 'Нет срока объекта');
});

// Сторож палитры: в реестре нет своих цветов — только переменные оболочки и токены --p2-*.
test('палитра: реестр без своих цветов; синий статус — в обеих темах, подпись читается (≥ 4,5:1)', () => {
  const dir = new URL('../../../platform/ui/registry/', import.meta.url);
  for (const f of ['styles.ts', 'RegistryTable.ts', 'SideCard.ts', 'model.ts', 'views.ts', 'export.ts']) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src), `${f}: шестнадцатеричный цвет`);
    assert.ok(!/\brgba?\(/.test(src), `${f}: rgb()/rgba()`);
    assert.ok(!/\bhsla?\(/.test(src), `${f}: hsl()`);
  }
  const css = ui.P2_UI_CSS;
  assert.ok(css.includes('.p2-reg{'), 'стили реестра входят в P2_UI_CSS');
  assert.ok(css.includes('.p2-badge--blue{'), 'бейдж синего статуса');
  const tok = (block: string, name: string) => (block.match(new RegExp(`--${name}:([^;]+);`)) || [])[1];
  const light = css.slice(css.indexOf(':root{'), css.indexOf('}'));
  const dark = css.slice(css.indexOf('html[data-theme="dark"]'));
  const rgb = (c: string, over: number[] = [255, 255, 255]): number[] => {
    const m = c.match(/rgba\(([^)]+)\)/);
    if (m) { const [r, gg, b, a] = m[1].split(',').map(Number); return [r, gg, b].map((v, i) => v * a + over[i] * (1 - a)); }
    return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  };
  const lum = (c: number[]) => { const [r, gg, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * gg + 0.0722 * b; };
  const contrast = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  assert.ok(contrast(rgb(tok(light, 'p2-status-blue-fg')), rgb(tok(light, 'p2-status-blue-bg'))) >= 4.5, 'светлая');
  for (const surf of [[23, 35, 49], [30, 41, 59], [28, 43, 57]]) {
    const c = contrast(rgb(tok(dark, 'p2-status-blue-fg'), surf), rgb(tok(dark, 'p2-status-blue-bg'), surf));
    assert.ok(c >= 4.5, `тёмная: ${c.toFixed(2)}`);
  }
  for (const n of ['p2-overlay', 'p2-shadow']) { assert.ok(tok(light, n), n); assert.ok(tok(dark, n), n); }
  const badge = mount(h(ui.StatusBadge, { status: 'blue', label: 'Ждёт РП' }));
  assert.equal(badge.querySelector('.p2-badge--blue svg') !== null, true, 'синий бейдж — слово + иконка');
});

// ── Этап 3: виды и ссылка, выгрузка, боковая карточка ──
test('виды: сохраняются и открываются по компании и пользователю; чужой пользователь их не видит; ссылка → те же фильтры', async () => {
  win.localStorage.clear();
  const scope = { registry: 'vor-positions', company: 'c1', user: 'pto@x' };
  const s = { ...ui.EMPTY_STATE, f: { corp: ['Корпус 2'] }, overdue: true, sort: { id: 'qty', dir: 'desc' as const } };
  assert.equal(ui.saveView(scope, '  Мой вид  ', s), true);
  assert.equal(ui.saveView(scope, '', s), false, 'пустое имя');
  assert.deepEqual(ui.listViews(scope).map((v: N) => v.name), ['Мой вид']);
  assert.deepEqual(ui.viewState(ui.listViews(scope)[0]), s);
  assert.deepEqual(ui.listViews({ ...scope, user: 'other@x' }), [], 'другой пользователь');
  assert.deepEqual(ui.listViews({ ...scope, company: 'c2' }), [], 'другая компания');
  ui.saveView(scope, 'Мой вид', ui.EMPTY_STATE);
  assert.equal(ui.listViews(scope).length, 1, 'то же имя заменяет');
  ui.deleteView(scope, 'Мой вид');
  assert.deepEqual(ui.listViews(scope), []);

  let copied = '';
  function ViewHarness(): N {
    const [state, setState] = useState(ui.EMPTY_STATE);
    lastState = state;
    return h(ui.RegistryTable as N, { testId: 'reg', rows: ROWS, rowKey: (r: Row) => r.id, columns: COLS, filters: FILTERS, state, onState: setState,
      isOverdue: (r: Row) => r.late, selected: new Set(), onSelect: () => {}, empty: '-', views: scope, linkBase: '#/planfact/vor/positions',
      copy: async (t: string) => { copied = t; return true; } });
  }
  const box = mount(h(ViewHarness));
  click(box.querySelector('[data-testid="p2-reg-overdue"]'));
  click(box.querySelector('[data-testid="p2-reg-views-open"]'));
  const name = box.querySelector('[data-testid="p2-reg-view-name"]');
  flushSync(() => { const set = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!; set.call(name, 'Просроченные'); name.dispatchEvent(new win.Event('input', { bubbles: true })); });
  click(box.querySelector('[data-testid="p2-reg-view-save"]'));
  assert.match(box.querySelector('[data-testid="p2-reg-notice"]').textContent, /сохранён на этом устройстве/);
  assert.deepEqual(ui.listViews(scope).map((v: N) => v.name), ['Просроченные']);
  click(box.querySelector('[data-testid="p2-reg-reset"]'));
  assert.equal(lastState.overdue, false);
  click(box.querySelector('[data-testid="p2-reg-view"]'));
  assert.equal(lastState.overdue, true, 'вид открылся');
  assert.deepEqual(rowsShown(box), ['b', 'd']);
  click(box.querySelector('[data-testid="p2-reg-share"]'));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(copied, 'http://localhost/#/planfact/vor/positions?overdue=1');
  assert.deepEqual(ui.queryToState(ui.queryOf(copied)), lastState, 'по ссылке — тот же вид');
  // без хранилища — пусто, без ошибок
  g.window = { get localStorage() { throw new Error('blocked'); } };
  try {
    assert.deepEqual(ui.listViews(scope), []);
    assert.equal(ui.saveView(scope, 'X', ui.EMPTY_STATE), false);
  } finally { g.window = win; }
});

test('выгрузка в Excel: видимые колонки и переданные строки (файл читается ExcelJS)', async () => {
  const ExcelJS: N = (await import('exceljs')).default;
  const cols = ui.visibleColumns(COLS, { ...ui.EMPTY_STATE, cols: ['qty'] });
  const bytes = await ui.buildRegistryXlsx('Позиции ВОР', cols, [ROWS[1], ROWS[3]]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const ws = wb.worksheets[0];
  assert.equal(ws.name, 'Позиции ВОР');
  const vals = (i: number) => (ws.getRow(i).values as N[]).slice(1);
  assert.deepEqual(vals(1), ['Работа', 'Объём']);
  assert.deepEqual(vals(2), ['Окраска', 30]);
  assert.deepEqual(vals(3), ['Окраска', 7]);
  assert.equal(ws.rowCount, 3);
  assert.equal(ui.registryFileName('Позиции «ЖК»: А/Б', '24.10.2026'), 'Позиции ЖК А Б 24.10.2026.xlsx');
});

test('боковая карточка: «пред. / след.» по списку, шаги процесса, лента истории «было → стало», Esc закрывает', () => {
  function CardHarness(): N {
    const list = ui.registryRows(ROWS, { filters: FILTERS, columns: COLS, state: { ...ui.EMPTY_STATE, overdue: true }, isOverdue: (r: Row) => r.late });
    const [i, setI] = useState(0);
    const [open, setOpen] = useState(true);
    if (!open) return h('div', { 'data-testid': 'closed' });
    const r = list[i];
    return h(ui.SideCard, { title: r.work, subtitle: r.corp, index: i, total: list.length, onPrev: () => setI(i - 1), onNext: () => setI(i + 1), onClose: () => setOpen(false),
      head: h(ui.Steps, { steps: [{ id: 'not_started', label: 'Не начато' }, { id: 'in_work', label: 'В работе' }, { id: 'done', label: 'Выполнено' }], current: 'in_work', side: { label: 'Ждёт РП', tone: 'blue' } }) },
      h(ui.HistoryFeed, { items: [
        { id: 'e2', when: '23.10.2026', who: 'rp@x', text: '+5 м²', from: { label: 'Ждёт РП', tone: 'blue' }, to: { label: 'Принято', tone: 'green' }, note: 'ок' },
        { id: 'e1', when: '22.10.2026', who: 'foreman@x', text: '+5 м²', to: { label: 'Ждёт РП', tone: 'blue' } }] }));
  }
  const box = mount(h(CardHarness));
  const side = () => box.querySelector('[data-testid="p2-side"]');
  assert.equal(side().querySelector('.p2-side__title').textContent, 'Окраска');
  assert.equal(box.querySelector('[data-testid="p2-side-pos"]').textContent, '1 из 2', 'навигация — по отфильтрованному списку');
  assert.equal(box.querySelector('[data-testid="p2-side-prev"]').disabled, true);
  click(box.querySelector('[data-testid="p2-side-next"]'));
  assert.equal(side().querySelector('.p2-side__title').textContent + ' · ' + side().querySelector('.p2-side__head .p2-reg__muted').textContent, 'Окраска · Корпус 10');
  assert.equal(box.querySelector('[data-testid="p2-side-next"]').disabled, true);
  const steps = qa(box, '[data-step]');
  assert.deepEqual(steps.map((s) => s.className.replace('p2-steps__item', '').trim()), ['p2-steps__item--done', 'p2-steps__item--cur', '']);
  assert.equal(steps[1].getAttribute('aria-current'), 'step');
  assert.equal(box.querySelector('[data-testid="p2-steps-side"]').textContent, 'Ждёт РП');
  const items = qa(box, '.p2-history__item');
  assert.equal(items.length, 2);
  assert.deepEqual(['p2-history-from', 'p2-history-to'].map((t) => items[0].querySelector(`[data-testid="${t}"]`).getAttribute('data-status')), ['blue', 'green'], 'было → стало цветными бейджами');
  assert.equal(items[1].querySelector('[data-testid="p2-history-from"]'), null, 'первая запись — без «было»');
  flushSync(() => { win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' })); });
  assert.ok(box.querySelector('[data-testid="closed"]'), 'Esc закрывает карточку');
  const empty = mount(h(ui.HistoryFeed, { items: [], empty: 'Факта ещё нет' }));
  assert.equal(empty.textContent, 'Факта ещё нет');
});

test('P2-0020: вид → адрес своего реестра (replaceState); чужой адрес не трогается; пустой вид — база без «?»', () => {
  const s = { ...ui.EMPTY_STATE, f: { corp: ['Корпус 1'] } };
  win.history.replaceState(null, '', '#/planfact/fact/pending');
  ui.syncRegistryAddress('#/planfact/fact/pending', s);
  assert.equal(win.location.hash, '#/planfact/fact/pending?f.corp=%D0%9A%D0%BE%D1%80%D0%BF%D1%83%D1%81%201');
  ui.syncRegistryAddress('#/planfact/fact/pending', ui.EMPTY_STATE);
  assert.equal(win.location.hash, '#/planfact/fact/pending');
  win.history.replaceState(null, '', '#/planfact/fact/pendingx');
  ui.syncRegistryAddress('#/planfact/fact/pending', s);
  assert.equal(win.location.hash, '#/planfact/fact/pendingx', 'похожий, но другой адрес');
  win.history.replaceState(null, '', '#/planfact/summary');
  ui.syncRegistryAddress('#/planfact/fact/pending', s);
  assert.equal(win.location.hash, '#/planfact/summary', 'ушли в другой раздел — адрес не меняется');
});
