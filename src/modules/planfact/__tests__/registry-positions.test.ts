/// <reference types="node" />
/** «ВОР → Позиции» на реестре (P2-0019, этап 4): positionStatus (не начато / в работе / выполнено / ждёт РП / отклонено;
 *  просрочено по темпу; срок прошёл; нет срока; нет темпа), экран на подставном сервере — 600 позиций, группы по корпусу,
 *  «Только просроченные», карточка с историей, вид из адреса, сверка чисел со «Сводкой». */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/#/planfact/vor/positions' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
g.KeyboardEvent = win.KeyboardEvent;
const { createElement: h } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { positionStatus } = await import('../summary/model.ts');
const { PositionsRegistry, corpOf, historyItem } = await import('../vor/PositionsRegistry.ts');
const { makeStand, standPositions } = await import('./registry-fake.ts');
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const tick = () => new Promise((r) => setTimeout(r, 0));
async function mount(el: N): Promise<N> {
  const box = win.document.createElement('div');
  win.document.body.appendChild(box);
  flushSync(() => createRoot(box as unknown as HTMLElement).render(el));
  for (let i = 0; i < 4; i++) await tick();
  return box;
}
const click = (el: N) => flushSync(() => { el.click(); });
const qa = (box: N, sel: string): N[] => Array.from(box.querySelectorAll(sel));

const T = '2026-10-24';
const ctx = (finish: string | null) => ({ today: T, plannedFinish: finish });
const P = (o: Partial<{ plan_qty: number; fact_qty: number; fact14: number; pending_qty: number; pending_count: number; last_rejected_note: string | null }>) =>
  ({ plan_qty: 100, fact_qty: 0, fact14: 0, pending_qty: 0, ...o });

test('positionStatus: статусы и шаги процесса', () => {
  const s = (o: N, f: string | null = '2027-06-01') => positionStatus(P(o), ctx(f));
  assert.deepEqual([s({}).state, s({}).step, s({}).tone], ['not_started', 'not_started', 'grey']);
  assert.deepEqual([s({ fact_qty: 10, fact14: 10 }).state, s({ fact_qty: 10, fact14: 10 }).tone], ['in_work', 'yellow']);
  assert.deepEqual([s({ fact_qty: 100 }).state, s({ fact_qty: 100 }).step, s({ fact_qty: 100 }).tone, s({ fact_qty: 100 }).overdue], ['done', 'done', 'green', false]);
  assert.deepEqual([s({ fact_qty: 120 }).state, s({ fact_qty: 120 }).label], ['done', 'Выполнено'], 'перебор — выполнено');
  const pen = s({ fact_qty: 40, pending_qty: 60, pending_count: 1 });
  assert.deepEqual([pen.state, pen.step, pen.pending, pen.tone, pen.label], ['pending', 'in_work', true, 'blue', 'Ждёт РП'], 'ждёт РП — отдельно от шага');
  const rej = s({ fact_qty: 40, fact14: 40, last_rejected_note: 'не выполнено' });
  assert.deepEqual([rej.state, rej.tone, rej.label], ['rejected', 'red', 'Отклонено']);
  assert.equal(s({ fact_qty: 100, last_rejected_note: 'x' }).state, 'done', 'выполненная — не «отклонено»');
});

test('positionStatus: «просрочено» по темпу 14 дней к сроку объекта; срок прошёл; нет срока; нет темпа', () => {
  // 60 дней до срока, остаток 90: темп 14 дней = 14 → 1/день → нужно 90 дн. > 60 → просрочено
  const late = positionStatus(P({ fact_qty: 10, fact14: 14 }), ctx('2026-12-23'));
  assert.deepEqual([late.overdue, late.pace, late.tone], [true, 'late', 'red']);
  assert.match(late.paceText, /нужно ещё 90 дн\., до срока 60 дн\./);
  // тот же остаток, темп 28 → 2/день → 45 дн. ≤ 60 → успевает
  const ok = positionStatus(P({ fact_qty: 10, fact14: 28 }), ctx('2026-12-23'));
  assert.deepEqual([ok.overdue, ok.pace, ok.tone], [false, 'ok', 'yellow']);
  // ровно успевает: нужно 60 дн., до срока 60
  assert.equal(positionStatus(P({ fact_qty: 40, fact14: 14 }), ctx('2026-12-23')).overdue, false);
  // срок прошёл, не выполнено
  const past = positionStatus(P({ fact_qty: 99, fact14: 50 }), ctx('2026-10-23'));
  assert.deepEqual([past.overdue, past.pace], [true, 'past']);
  assert.match(past.paceText, /Срок объекта прошёл \(23\.10\.2026\)/);
  // срок прошёл, выполнено — не просрочено
  assert.equal(positionStatus(P({ fact_qty: 100 }), ctx('2026-10-01')).overdue, false);
  // срок сегодня: остаток есть, темп есть → нужно > 0 дн. → просрочено
  assert.equal(positionStatus(P({ fact_qty: 10, fact14: 140 }), ctx(T)).overdue, true);
  // нет срока объекта
  const nf = positionStatus(P({ fact_qty: 10, fact14: 14 }), ctx(null));
  assert.deepEqual([nf.overdue, nf.pace], [false, 'no_finish']);
  // темп 0: до срока < 14 дней — просрочено; ≥ 14 — «нет темпа»
  assert.deepEqual([positionStatus(P({}), ctx('2026-11-06')).overdue, positionStatus(P({}), ctx('2026-11-06')).pace], [true, 'late'], '13 дней');
  const np = positionStatus(P({}), ctx('2026-11-07'));
  assert.deepEqual([np.overdue, np.pace, np.tone], [false, 'no_pace', 'grey'], '14 дней');
  // ждёт РП и просрочено: тон синий (действие РП), признак «просрочено» — отдельно
  const pl = positionStatus(P({ fact_qty: 10, pending_qty: 5, pending_count: 1 }), ctx('2026-10-01'));
  assert.deepEqual([pl.state, pl.tone, pl.overdue], ['pending', 'blue', true]);
});

test('корпус из пути; строка истории — «было → стало»', () => {
  assert.equal(corpOf('Корпус 2 · 5 этаж · Кв. 1'), 'Корпус 2');
  assert.equal(corpOf(''), 'Без места');
  const base = { id: 'e1', qty: 5, work_date: '2026-10-20', brigade_name: 'Иванов', workers: null, man_hours: null, corrects_id: null, correction_reason: null, batch_id: null,
    created_by_email: 'f@x', created_at: '2026-10-20T08:00:00Z', decided_by_email: null, decided_at: null, decision_note: null, note: null };
  const a = historyItem({ ...base, status: 'accepted' } as N, 'м²');
  assert.deepEqual([a.from, a.to.label, a.who, a.when], [null, 'Принято', 'f@x', '20.10.2026']);
  assert.match(a.text, /^5 м² · Иванов · за 20\.10\.2026$/);
  assert.match(historyItem({ ...base, status: 'accepted', period_from: '2026-10-07' } as N, 'м²').text, /^5 м² · Иванов · за период 07\.10–20\.10$/, 'P2-0022: запись «за период»');
  const ap = historyItem({ ...base, status: 'accepted', decided_by_email: 'rp@x', decided_at: '2026-10-21T09:00:00Z', decision_note: 'ок', note: 'Закрытие через РП' } as N, 'м²');
  assert.deepEqual([ap.from!.label, ap.to.label, ap.to.tone, ap.who, ap.when, ap.note], ['Ждёт РП', 'Принято', 'green', 'rp@x', '21.10.2026', 'Решение: ок']);
  assert.match(ap.text, /Закрытие через РП/);
  const rj = historyItem({ ...base, status: 'rejected', decided_at: '2026-10-21T09:00:00Z', decided_by_email: 'rp@x' } as N, 'м²');
  assert.deepEqual([rj.from!.tone, rj.to.tone], ['blue', 'red']);
  const sp = historyItem({ ...base, status: 'superseded', decided_at: '2026-10-21T09:00:00Z', correction_reason: null } as N, 'м²');
  assert.deepEqual([sp.from!.label, sp.to.label], ['Принято', 'Заменено']);
  assert.equal(historyItem({ ...base, status: 'pending_approval' } as N, 'м²').to.tone, 'blue');
});

test('экран на подставном сервере: 600 позиций, группы по корпусу со счётчиками, просроченные — быстро, числа = «Сводка»', async () => {
  win.history.replaceState(null, '', '#/planfact/vor/positions');
  const stand = makeStand(standPositions(), { finish: '2026-12-23' });
  stand.add('p1-1-1', 100);                      // выполнено
  stand.add('p1-1-2', 10, stand.minus(T, 3));    // в работе, темп 10/14 — не успевает
  stand.add('p1-1-3', 60, stand.minus(T, 3));    // в работе, темп 60/14 — успевает
  stand.add('p2-1-1', 50, T, 'pending_approval'); // ждёт РП
  const r = stand.add('p3-1-1', 20, T, 'pending_approval'); stand.decide(r.id, false, 'не выполнено');   // отклонено
  const box = await mount(h(PositionsRegistry, { fact: stand.fact, summary: stand.summary, projectId: 'pr1', companyId: 'c1', user: 'pto@x', today: T }));
  assert.match(box.querySelector('[data-testid="p2-reg-shown"]').textContent, /Показано: 600 из 600/);
  const groups = qa(box, 'tbody[data-group]');
  assert.deepEqual(groups.map((x) => x.getAttribute('data-group')), ['Корпус 1', 'Корпус 2', 'Корпус 3']);
  assert.match(groups[0].querySelector('[data-testid="p2-reg-group"]').textContent, /Всего: 200/);
  const counts = (gr: N) => qa(gr, '[data-testid="p2-reg-count"]').map((b) => `${b.getAttribute('data-status')}:${b.textContent}`);
  // темп 0 и до срока 60 дн. → «нет темпа» (серый), не просрочено
  assert.deepEqual(counts(groups[0]), ['red:1', 'yellow:1', 'green:1', 'grey:197']);
  assert.deepEqual(counts(groups[1]), ['blue:1', 'grey:199']);
  assert.deepEqual(counts(groups[2]), ['red:1', 'grey:199']);

  const t0 = Date.now();
  click(box.querySelector('[data-testid="p2-reg-overdue"]'));
  const dt = Date.now() - t0;
  assert.ok(dt < 1500, `«Только просроченные» на 600 позициях: ${dt} мс`);
  assert.deepEqual(qa(box, 'tr[data-row]').map((x) => x.getAttribute('data-row')), ['p1-1-2']);
  assert.match(win.location.hash, /^#\/planfact\/vor\/positions\?overdue=1$/, 'вид в адресе');
  assert.ok(box.querySelector('tr[data-row="p1-1-2"] [data-testid="vr-overdue"]'), 'бейдж «Просрочено»');
  click(box.querySelector('[data-testid="p2-reg-overdue"]'));

  // сверка со «Сводкой»: план, факт, %, остаток — те же числа pf_summary_positions
  const sum = (await stand.summary.positions('pr1', null) as N).value.find((p: N) => p.position_id === 'p1-1-3');
  const row = box.querySelector('tr[data-row="p1-1-3"]');
  const cell = (c: string) => row.querySelector(`td[data-col="${c}"]`).textContent;
  assert.deepEqual([cell('plan'), cell('fact'), cell('pct'), cell('rest')], [String(sum.plan_qty), String(sum.fact_qty), `${sum.pct} %`, String(sum.rest_qty)]);
  assert.equal(cell('status'), 'В работе');

  // фильтр-чип по статусу через панель
  click(box.querySelector('[data-testid="p2-reg-filter"]'));
  click(box.querySelector('[data-filter="status"] input[data-value="pending"]'));
  click(box.querySelector('[data-testid="p2-reg-panel-apply"]'));
  assert.deepEqual(qa(box, 'tr[data-row]').map((x) => x.getAttribute('data-row')), ['p2-1-1']);
  assert.equal(qa(box, '[data-testid="p2-reg-chip"]')[0].textContent.replace('×', ''), 'Статус: Ждёт РП');
  assert.equal(win.location.hash, '#/planfact/vor/positions?f.status=pending');
});

test('карточка позиции: пред./след. по списку, шаги, «Ждёт РП», история из pf_fact_history', async () => {
  win.history.replaceState(null, '', '#/planfact/vor/positions?f.corp=' + encodeURIComponent('Корпус 2'));
  const stand = makeStand(standPositions(3, 1, 3), { finish: '2026-12-31' });
  stand.add('p2-1-1', 40, stand.minus(T, 2));
  const e = stand.add('p2-1-1', 60, T, 'pending_approval', 'Закрытие через РП');
  void e;
  const box = await mount(h(PositionsRegistry, { fact: stand.fact, summary: stand.summary, projectId: 'pr1', companyId: 'c1', user: 'pto@x', today: T }));
  assert.deepEqual(qa(box, 'tr[data-row]').map((x) => x.getAttribute('data-row')), ['p2-1-1', 'p2-1-2', 'p2-1-3'], 'вид открыт из адреса');
  click(box.querySelector('tr[data-row="p2-1-1"] [data-testid="p2-reg-open"]'));
  for (let i = 0; i < 3; i++) await tick();
  const side = box.querySelector('[data-testid="p2-side"]');
  assert.equal(side.querySelector('.p2-side__title').textContent, 'Работа 1');
  assert.equal(box.querySelector('[data-testid="p2-side-pos"]').textContent, '1 из 3');
  assert.equal(box.querySelector('[data-step="in_work"]').getAttribute('aria-current'), 'step');
  assert.match(box.querySelector('[data-testid="p2-steps-side"]').textContent, /Ждёт РП: 60 м²/);
  const items = qa(box, '.p2-history__item');
  assert.equal(items.length, 2);
  assert.match(items[0].textContent, /Закрытие через РП/);
  assert.equal(items[0].querySelector('[data-testid="p2-history-to"]').getAttribute('data-status'), 'blue');
  assert.equal(items[1].querySelector('[data-testid="p2-history-to"]').getAttribute('data-status'), 'green');
  click(box.querySelector('[data-testid="p2-side-next"]'));
  for (let i = 0; i < 3; i++) await tick();
  assert.equal(box.querySelector('.p2-side__title').textContent, 'Работа 2');
  assert.equal(box.querySelector('[data-testid="p2-history-empty"]').textContent, 'Факта по позиции ещё нет');
  assert.equal(box.querySelector('tr[data-row="p2-1-2"]').className.includes('p2-reg__row--open'), true, 'открытая строка отмечена');
  click(box.querySelector('[data-testid="p2-side-close"]'));
  assert.equal(box.querySelector('[data-testid="p2-side"]'), null);
});

test('нет срока объекта: «Только просроченные» недоступна, подсказка; пустой проект — пустое состояние', async () => {
  win.history.replaceState(null, '', '#/planfact/vor/positions');
  const stand = makeStand(standPositions(1, 1, 2), { finish: null });
  const box = await mount(h(PositionsRegistry, { fact: stand.fact, summary: stand.summary, projectId: 'pr1', companyId: 'c1', user: 'pto@x', today: T }));
  assert.equal(box.querySelector('[data-testid="p2-reg-overdue"]').disabled, true);
  assert.match(box.querySelector('[data-testid="p2-reg-overdue-hint"]').textContent, /Нет срока объекта/);
  const empty = await mount(h(PositionsRegistry, { fact: makeStand([]).fact, summary: makeStand([]).summary, projectId: 'pr1', companyId: 'c1', user: 'pto@x', today: T }));
  assert.match(empty.querySelector('[data-testid="p2-reg-empty"]').textContent, /Позиций пока нет/);
});

test('адреса: #/planfact/vor/positions[?вид] — «Позиции», неизвестная подвкладка ВОР → «Загрузка»', async () => {
  const { canonicalHash, vorSubFromHash, routeFromHash } = await import('../PlanfactApp.ts');
  const all = { company: true, estimate: true, ks2: true, fact: true, brigades: true };
  assert.equal(canonicalHash('#/planfact/vor/positions', all), null);
  assert.equal(canonicalHash('#/planfact/vor/positions?overdue=1&f.corp=%D0%9A', all), null);
  assert.equal(canonicalHash('#/planfact/vor/xyz', all), '#/planfact/vor');
  assert.equal(routeFromHash('#/planfact/vor/positions?overdue=1').page, 'vor');
  assert.equal(vorSubFromHash('#/planfact/vor/positions?overdue=1'), 'positions');
  assert.equal(vorSubFromHash('#/planfact/vor'), 'load');
});

test('вкладка ВОР: «Позиции» — реестр; «Загрузка» — подсказка вместо старого списка; счётчик позиций', async () => {
  const { VorTab } = await import('../vor/VorTab.ts');
  const stand = makeStand(standPositions(1, 1, 3), { finish: '2026-12-31' });
  const no = async () => ({ ok: false as const, message: '-' });
  const vor: N = { async listProjects() { return [{ id: 'pr1', name: 'ЖК', company_id: 'c1' }]; }, async permissions() { return ['planfact.fact.view']; },
    async listImports() { return [{ id: 'i1', file_name: 'в.xlsx', sheet_name: 'Л', status: 'confirmed', row_count: 3, works: 3, positions: 3, created_at: '2026-10-21T10:00:00Z', created_by_email: null, confirmed_at: null, profile_id: null }]; },
    async listProfiles() { return []; }, async importRows() { return []; }, async positions() { return []; }, saveDraft: no, deleteImport: no, saveProfile: no };
  let count: number | null = -1;
  win.history.replaceState(null, '', '#/planfact/vor/positions');
  const box = await mount(h(VorTab, { api: vor, sub: 'positions', fact: stand.fact, summary: stand.summary, user: 'pto@x', onCount: (n: number | null) => { count = n; } }));
  for (let i = 0; i < 4; i++) await tick();
  assert.ok(box.querySelector('[data-testid="vor-registry"]'), 'реестр');
  assert.equal(qa(box, 'tr[data-row]').length, 3);
  assert.equal(count, 3, 'счётчик «Позиции (N)»');
  const load = await mount(h(VorTab, { api: vor, sub: 'load', fact: stand.fact, summary: stand.summary, user: 'pto@x' }));
  for (let i = 0; i < 4; i++) await tick();
  assert.ok(load.querySelector('[data-testid="vor-positions-hint"]'));
  assert.equal(load.querySelector('[data-testid="vor-positions"]'), null);
  const old = await mount(h(VorTab, { api: vor, sub: 'positions' }));
  for (let i = 0; i < 4; i++) await tick();
  assert.ok(old.querySelector('[data-testid="vor-positions"]'), 'без факта и сводки — прежний список');
});

test('P2-0022: карточка позиции — блок «Прогноз»: прогноз окончания (позже финиша — красная рамка), план % на сегодня, факт %, отклонение, темп 14 дней', async () => {
  win.history.replaceState(null, '', '#/planfact/vor/positions');
  const stand = makeStand(standPositions(1, 1, 2), { finish: '2026-11-10', planPctToday: 40 });
  stand.add('p1-1-1', 28, stand.minus(T, 3));   // темп 28 за 14 дн. → остаток 72 · 14 / 28 = 36 дн. → 29.11.2026, на 19 дн. позже финиша
  const box = await mount(h(PositionsRegistry, { fact: stand.fact, summary: stand.summary, projectId: 'pr1', companyId: 'c1', user: 'pto@x', today: T }));
  click(box.querySelector('tr[data-row="p1-1-1"] [data-testid="p2-reg-open"]'));
  for (let i = 0; i < 3; i++) await tick();
  const fc = box.querySelector('[data-testid="p2-side"] [data-testid="vr-forecast"]');
  assert.ok(fc, 'блок «Прогноз» в карточке');
  const tile = (m: string) => fc.querySelector(`[data-metric="${m}"]`);
  const val = (m: string) => tile(m).querySelector('[data-testid="p2-kpi-value"]').textContent;
  assert.equal(val('forecast'), '29.11.2026');
  assert.ok(tile('forecast').className.includes('p2-kpi--red'), 'позже финиша объекта — красная рамка');
  assert.match(tile('forecast').textContent, /на 19 дн\. позже финиша/);
  assert.equal(val('plan_pct'), '40 %');
  assert.equal(val('fact_pct'), '28 %');
  assert.equal(val('dev'), 'отставание 12 %');
  assert.ok(tile('dev').className.includes('p2-kpi--red'), '12 п.п. > красного порога 10');
  assert.equal(val('pace14'), '28 м²');
  click(box.querySelector('[data-testid="p2-side-next"]'));
  for (let i = 0; i < 3; i++) await tick();
  const fc2 = box.querySelector('[data-testid="vr-forecast"]');
  assert.equal(fc2.querySelector('[data-metric="forecast"] [data-testid="p2-kpi-value"]').textContent, 'нет темпа');
  assert.match(fc2.querySelector('[data-metric="pace14"]').textContent, /нет темпа — прогноз не считается/);
});
