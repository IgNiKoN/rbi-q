/// <reference types="node" />
/** P2-0021 этап 3: страница «Требует моего участия» (#/planfact/inbox): группы по объектам, только виды по правам (null — нет строки)
 *  и с чем-то внутри; переходы открывают готовый список с видом и объектом (p=…): «Ждёт подтверждения», «Журнал» с «Отклонено» +
 *  «Внёс: я» и периодом с самой ранней записи, КС-2 «Черновик», «Сводка → Требует внимания»; пусто — «Всё сделано»; после своего
 *  действия — перечитать; разделы принимают объект из перехода (КС-2, Журнал — период и фильтры). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { settle } from '../../../test-utils/settle.ts';
import { makeFakeSummary, PTO_PROJECT } from './summary-fake.ts';
import { makeFakeKs2 } from './ks2-fake.ts';
import { makeFakeFact } from './fact-fake.ts';
import type { InboxRow } from '../summary/summary.service.ts';
import type { AuthApi } from '../../../platform/auth/auth.service.ts';

const win = new Window({ url: 'http://localhost/#/planfact/inbox' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.KeyboardEvent = win.KeyboardEvent;
const { createElement: h } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { InboxTab, inboxItems, inboxLink } = await import('../inbox/InboxTab.ts');
const { INBOX_CHANGED_EVENT } = await import('../inbox/inbox.ts');
const { hashParam, initialProjectId } = await import('../ProjectPicker.ts');
const { PlanfactApp, canonicalHash, routeFromHash } = await import('../PlanfactApp.ts');
const { Ks2Tab } = await import('../ks2/Ks2Tab.ts');
const { FactJournal } = await import('../fact/FactJournal.ts');
const { queryOf, queryToState } = await import('../../../platform/ui/index.ts');
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const tick = (): Promise<void> => settle();
const row = (o: Partial<InboxRow>): InboxRow => ({ project_id: 'p', name: 'ЖК', code: null, pending: null, my_rejected: null, my_rejected_from: null,
  ks2_drafts: null, ks2_gap: null, ks2_gap_money: null, stale: null, stale_days: null, ...o });
async function mount(el: N): Promise<N> {
  const box = win.document.createElement('div'); win.document.body.appendChild(box);
  flushSync(() => createRoot(box as unknown as HTMLElement).render(el));
  await tick(); await tick();
  return box;
}
const qa = (box: N, sel: string): N[] => Array.from(box.querySelectorAll(sel));
const click = (el: N): void => flushSync(() => { el.click(); });

const PM = row({ project_id: 'a', name: 'ЖК «Альфа»', code: 'A', pending: 8, ks2_drafts: 1, ks2_gap: 12, ks2_gap_money: 345000, stale: 30, stale_days: 14 });
const FOREMAN = row({ project_id: 'b', name: 'ЖК «Бета»', my_rejected: 2, my_rejected_from: '2026-09-01' });

test('строки объекта: только виды с правом (не null) и > 0; сначала дела, потом сведения; ₽ — только если пришли', () => {
  assert.deepEqual(inboxItems(PM).map((i) => i.kind), ['pending', 'ks2_drafts', 'ks2_gap', 'stale']);
  assert.deepEqual(inboxItems(FOREMAN).map((i) => i.kind), ['my_rejected']);
  assert.deepEqual(inboxItems(row({ pending: 0, my_rejected: 0, ks2_drafts: 0, ks2_gap: 0, stale: 0 })), []);
  assert.match(inboxItems(PM).find((i) => i.kind === 'ks2_gap')!.hint, /345/);
  assert.equal(inboxItems(row({ ks2_gap: 3, ks2_gap_money: null })).find((i) => i.kind === 'ks2_gap')!.hint, 'строк сметы', 'без money.view — без ₽');
  assert.equal(inboxItems(PM).find((i) => i.kind === 'pending')!.tone, 'blue', 'палитра факта: ждёт РП');
  assert.equal(inboxItems(FOREMAN)[0].tone, 'red', 'палитра факта: отклонено');
});

test('переходы: готовый список с видом в адресе и объектом', () => {
  assert.equal(inboxLink('pending', PM, 'pm@x.invalid'), '#/planfact/fact/pending?p=a');
  const j = inboxLink('my_rejected', FOREMAN, 'ivanov@x.invalid');
  assert.equal(j.split('?')[0], '#/planfact/fact/journal');
  const st = queryToState(queryOf(j));
  assert.deepEqual(st.f, { author: ['ivanov@x.invalid'], status: ['rejected'] }, 'вид реестра: «Отклонено» + «Внёс: я»');
  assert.equal(hashParam(j, 'from'), '2026-09-01');
  assert.equal(hashParam(j, 'p'), 'b');
  const k = inboxLink('ks2_drafts', PM, '');
  assert.equal(k.split('?')[0], '#/planfact/ks2');
  assert.deepEqual(queryToState(queryOf(k)).f, { status: ['draft'] });
  assert.equal(inboxLink('ks2_gap', PM, ''), '#/planfact/summary?p=a&focus=attention');
  assert.equal(inboxLink('stale', PM, ''), '#/planfact/summary?p=a&focus=attention');
  for (const l of [j, k, '#/planfact/fact/pending?p=a', '#/planfact/summary?p=a&focus=attention'])
    assert.equal(canonicalHash(l, { company: true, estimate: false, ks2: true, fact: true, brigades: true }), null, `${l}: адрес не сбрасывается`);
});

test('страница: группы по объектам, плитки с числом; нажатие — переход; объект без дел и сведений не показан', async () => {
  const { api } = makeFakeSummary([], { inbox: [PM, FOREMAN, row({ project_id: 'z', name: 'Пусто', pending: 0, ks2_gap: 0 })] });
  const went: string[] = [];
  const box = await mount(h(InboxTab, { api, me: 'ivanov@x.invalid', go: (p: string) => went.push(p) }));
  assert.deepEqual(qa(box, '[data-testid="ib-group"]').map((x) => x.getAttribute('data-project-id')), ['a', 'b']);
  assert.equal(box.querySelector('[data-testid="ib-total"]').textContent, 'Дел: 11 · объектов: 2');
  const alpha = box.querySelector('[data-project-id="a"]');
  assert.deepEqual(qa(alpha, '[data-testid="ib-count"]').map((x) => x.textContent), ['8', '1', '12 поз.', '30 поз.']);
  assert.equal(alpha.querySelector('[data-testid="ib-group-tasks"]').textContent, 'Дел: 9');
  assert.match(alpha.textContent, /Стоят больше 14 дней/);
  click(box.querySelector('[data-project-id="b"] [data-kind="my_rejected"]'));
  click(alpha.querySelector('[data-kind="pending"]'));
  assert.equal(went[1], '#/planfact/fact/pending?p=a');
  assert.match(went[0], /^#\/planfact\/fact\/journal\?.*f\.status=rejected/);
  assert.equal(box.querySelector('[data-testid="ib-empty"]'), null);
});

test('пусто — «Всё сделано»; после своего действия — перечитать; ошибка сервера — сообщение', async () => {
  const f = makeFakeSummary([], { inbox: [] });
  const box = await mount(h(InboxTab, { api: f.api, me: '', go: () => {} }));
  assert.match(box.querySelector('[data-testid="ib-empty"]').textContent, /Всё сделано/);
  const n = f.calls.filter((c) => c === 'inbox').length;
  win.dispatchEvent(new win.Event(INBOX_CHANGED_EVENT)); await tick(); await tick();
  assert.equal(f.calls.filter((c) => c === 'inbox').length, n + 1);
  const bad = makeFakeSummary([], { inbox: 'Нет связи с сервером' });
  const b2 = await mount(h(InboxTab, { api: bad.api, me: '', go: () => {} }));
  assert.match(b2.querySelector('[role="alert"]').textContent, /Нет связи/);
});

test('маршрут #/planfact/inbox: заголовок и страница; объект из перехода — правило выбора', async () => {
  assert.equal(routeFromHash('#/planfact/inbox').page, 'inbox');
  assert.equal(canonicalHash('#/planfact/inbox', { company: true, estimate: false, ks2: false, fact: true, brigades: true }), null);
  win.history.replaceState(null, '', '#/planfact/inbox');
  const auth: AuthApi = { async signIn() { return { ok: true }; }, async signOut() {}, async getEmail() { return 'pm@x.invalid'; },
    async getAccess() { return [{ company: 'Демо', role: 'РП', projectId: null }]; } } as N;
  const projects = { async myAccess() { return [{ company_id: 'c1', company_name: 'Демо', can_manage_projects: false, can_manage_units: false, can_manage_roles: false }]; } };
  const summary = makeFakeSummary([{ ...PTO_PROJECT }], { inbox: [PM] }).api;
  const box = await mount(h(PlanfactApp, { auth, data: { works: [] } as N, projects, summary } as N));
  await tick();
  assert.match(box.textContent, /Требует моего участия/);
  assert.ok(box.querySelector('[data-testid="ib-tab"]'));
  const list = [{ id: 'x', name: 'X', archived_at: '2026-01-01' }, { id: 'y', name: 'Y' }, { id: 'z', name: 'Z' }];
  assert.equal(initialProjectId(list, '#/planfact/ks2?p=z'), 'z');
  assert.equal(initialProjectId(list, '#/planfact/ks2?p=x'), 'x', 'архивный из перехода — тоже (только просмотр)');
  assert.equal(initialProjectId(list, '#/planfact/ks2?p=нет'), 'y', 'нет в списке — первый действующий');
  assert.equal(initialProjectId(list, '#/planfact/ks2'), 'y');
  assert.equal(hashParam('#/planfact?p=%D0%B0&focus=attention', 'p'), 'а');
  assert.equal(hashParam('#/planfact?p=%E0', 'p'), '', 'битое кодирование — пусто');
});

test('КС-2 из перехода: выбран объект p=…, список — только черновики (вид из адреса)', async () => {
  win.history.replaceState(null, '', '#/planfact/ks2?f.status=draft&p=pr2');
  const f = makeFakeKs2([{ id: 's12', row_no: 12, number: '1.1', name: 'Штукатурка', unit: 'м2', kind: 'work', price: 300 }], [{ src: 's12', date: '2026-10-05', qty: 10 }], { contract: true });
  await f.api.createAct('pr2', '1', '2026-10-31', '2026-10-01', '2026-10-31');
  const vor = { async listProjects() { return [{ id: 'pr1', name: 'ЖК Первый', company_id: 'c1' }, { id: 'pr2', name: 'ЖК Второй', company_id: 'c1' }]; },
    async permissions() { return ['planfact.ks2.edit', 'planfact.money.view']; } } as N;
  const box = await mount(h(Ks2Tab, { api: f.api, vor, me: 'pto@x.invalid' } as N));
  await tick(); await tick();
  assert.equal(box.querySelector('[data-testid="k2-project"]').value, 'pr2', 'объект из перехода');
  assert.ok(box.querySelector('[data-testid="k2-registry"]'));
  assert.match(box.textContent, /Черновик/i, 'фильтр «Черновик» из адреса');
});

test('Журнал из перехода «Мои отклонённые»: период с самой ранней записи, «Отклонено» + «Внёс: я»', async () => {
  win.history.replaceState(null, '', '#/planfact/fact/journal?f.author=ivanov%40x.invalid&f.status=rejected&from=2026-08-15&p=pr1');
  const f = makeFakeFact([{ id: 'a5', ancestors: [], location_id: 'f5', location_path: 'Корпус 1 · 5 этаж', location_type: 'floor', work: 'Штукатурка стен', unit: 'м²', plan: 100 }] as N);
  const add = (id: string, status: string, by: string, date: string) => f.entries.push({ id, position_id: 'a5', status, qty: 10, work_date: date, brigade_name: 'Иванов', workers: 1,
    man_hours: 8, note: null, corrects_id: null, correction_reason: null, batch_id: null, created_by_email: by, created_at: `${date}T08:00:00Z`,
    decided_by_email: 'pm@x.invalid', decided_at: `${date}T10:00:00Z`, decision_note: 'перемерить' } as N);
  add('r1', 'rejected', 'ivanov@x.invalid', '2026-08-20'); add('r2', 'rejected', 'petrov@x.invalid', '2026-10-20'); add('a1', 'accepted', 'ivanov@x.invalid', '2026-10-21');
  const box = await mount(h(FactJournal, { api: f.api, projectId: 'pr1', companyId: 'c1', user: 'ivanov@x.invalid', today: '2026-10-24' } as N));
  await tick();
  assert.deepEqual(f.calls.filter((c: N) => c.fn === 'journal')[0].args, { from: '2026-08-15', to: '2026-10-24', limit: 2000 }, 'период захватывает запись 20.08');
  assert.deepEqual(qa(box, '[data-testid="fj-table"] tr[data-row]').map((r) => r.getAttribute('data-row')), ['r1']);
  // дата позже 30 дней назад — период по умолчанию (30 дней)
  win.history.replaceState(null, '', '#/planfact/fact/journal?from=2026-10-20');
  const f2 = makeFakeFact([] as N);
  await mount(h(FactJournal, { api: f2.api, projectId: 'pr1', companyId: 'c1', user: '', today: '2026-10-24' } as N));
  assert.equal((f2.calls.filter((c: N) => c.fn === 'journal')[0].args as N).from, '2026-09-25');
});
