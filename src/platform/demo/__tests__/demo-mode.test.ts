/// <reference types="node" />
/** P2-0053: кнопка «Демо» — вход ролью (первый вход переключает компанию, смена роли — перезапуск), выход в свою компанию,
 *  без сети — понятный отказ, демо-компании нет в переключателе компаний, плашка «Демо · роль · Выйти», экран ролей. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { DEMO_BODY_CLASS, DEMO_GO_KEY, DEMO_RETURN_PREFIX, demoCompanyOf, demoHomeFor, demoRoleTitle, enterDemo, leaveDemo, loadDemoRoles,
  renderDemoScreen, returnCompany, syncDemoChip, takeDemoGo, withoutDemo } from '../demo-mode.ts';
import type { DemoDeps, DemoStateView } from '../demo-mode.ts';

const OWN = { id: 'own', name: 'Песочница', roles: ['Администратор компании'], modules: ['planfact'] };
const DEMO = { id: 'demo', name: 'Девелопмент Демо', is_demo: true, roles: ['Прораб — демо'], modules: ['planfact', 'quality'] };

function deps(st: DemoStateView, answers: Record<string, { data: unknown; error: { message: string } | null }> = {}, online = true) {
  const log: string[] = [];
  const mem = new Map<string, string>();
  const d: DemoDeps = {
    getState: () => st,
    refresh: async () => { log.push('refresh'); },
    setCompany: (id) => log.push('company ' + id),
    rpc: async (fn, args) => { log.push('rpc ' + fn + (args ? ' ' + JSON.stringify(args) : '')); return answers[fn] || { data: null, error: null }; },
    go: (p) => log.push('go ' + p),
    reload: () => log.push('reload'),
    toast: (t) => log.push('toast ' + t),
    online: () => online,
    storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); }, removeItem: (k) => { mem.delete(k); } },
    userKey: (e) => e.replace(/\W/g, '_')
  };
  return { d, log, mem };
}

test('демо-компания — только выбранная и с признаком; роль без «— демо»', () => {
  assert.equal(demoCompanyOf({ mode: 'email', email: 'a@b', companyId: 'demo', companies: [OWN, DEMO] })?.id, 'demo');
  assert.equal(demoCompanyOf({ mode: 'email', email: 'a@b', companyId: 'own', companies: [OWN, DEMO] }), null);
  assert.equal(demoCompanyOf({ mode: 'demo', email: null, companyId: 'demo', companies: [DEMO] }), null);
  assert.equal(demoRoleTitle(DEMO), 'Прораб');
  assert.deepEqual(withoutDemo([OWN, DEMO], 'own').map((c) => c.id), ['own']);
  assert.deepEqual(withoutDemo([OWN, DEMO], 'demo').map((c) => c.id), ['own', 'demo']);
  assert.equal(demoHomeFor('foreman'), '#/planfact');
  assert.equal(demoHomeFor('contractor_rep'), '#/construction-v2');
});

test('первый вход: запоминает свою компанию, экран роли, переключает компанию; смена роли — перезапуск', async () => {
  const st: DemoStateView = { mode: 'email', email: 'k@x.ru', companyId: 'own', companies: [OWN] };
  const { d, log, mem } = deps(st, { pf_demo_enter: { data: { company_id: 'demo', role: 'foreman' }, error: null } });
  assert.equal(await enterDemo(d, 'foreman'), null);
  assert.deepEqual(log, ['rpc pf_demo_enter {"p_role":"foreman"}', 'refresh', 'go #/planfact', 'company demo']);
  assert.equal(mem.get(DEMO_RETURN_PREFIX + 'k_x_ru'), 'own');
  assert.equal(takeDemoGo(d), '#/planfact');
  assert.equal(takeDemoGo(d), null);
  const st2: DemoStateView = { mode: 'email', email: 'k@x.ru', companyId: 'demo', companies: [OWN, DEMO] };
  const b = deps(st2, { pf_demo_enter: { data: { company_id: 'demo', role: 'qc_engineer' }, error: null } });
  b.mem.set(DEMO_RETURN_PREFIX + 'k_x_ru', 'own');
  assert.equal(await enterDemo(b.d, 'qc_engineer'), null);
  assert.deepEqual(b.log.slice(-2), ['go #/construction-v2', 'reload']);
  assert.equal(b.mem.get(DEMO_RETURN_PREFIX + 'k_x_ru'), 'own', 'смена роли не затирает компанию возврата');
  assert.equal(b.mem.get(DEMO_GO_KEY), '#/construction-v2');
});

test('без сети и с ошибкой сервера — понятный текст, ничего не переключается', async () => {
  const st: DemoStateView = { mode: 'email', email: 'k@x.ru', companyId: 'own', companies: [OWN] };
  const off = deps(st, {}, false);
  assert.match(String(await enterDemo(off.d, 'foreman')), /интернет/);
  assert.deepEqual(off.log, []);
  assert.match((await loadDemoRoles(off.d)).error || '', /интернет/);
  const bad = deps(st, { pf_demo_enter: { data: null, error: { message: 'Демо пока не готово или нет такой роли' } } });
  assert.equal(await enterDemo(bad.d, 'x'), 'Демо пока не готово или нет такой роли');
  assert.ok(!bad.log.some((l) => l.startsWith('company')));
  const raw = deps(st, { pf_demo_roles: { data: null, error: { message: 'permission denied for function' } } });
  assert.equal((await loadDemoRoles(raw.d)).error, 'Не удалось загрузить демо. Попробуйте позже');
  const empty = deps(st, { pf_demo_roles: { data: [], error: null } });
  assert.match((await loadDemoRoles(empty.d)).error || '', /не готово/);
  const anon = deps({ mode: 'none', email: null, companyId: null, companies: [] });
  assert.match(String(await enterDemo(anon.d, 'foreman')), /Войдите/);
});

test('выход: в запомненную компанию; её нет — первая своя с разделами', async () => {
  const st: DemoStateView = { mode: 'email', email: 'k@x.ru', companyId: 'demo', companies: [OWN, DEMO] };
  const a = deps(st, { pf_demo_leave: { data: true, error: null } });
  a.mem.set(DEMO_RETURN_PREFIX + 'k_x_ru', 'own');
  assert.equal(await leaveDemo(a.d), null);
  assert.deepEqual(a.log, ['rpc pf_demo_leave', 'refresh', 'go #/welcome', 'company own']);
  assert.equal(a.mem.has(DEMO_RETURN_PREFIX + 'k_x_ru'), false);
  const other = { id: 'b', name: 'Б', roles: [], modules: [] };
  assert.equal(returnCompany({ ...st, companies: [other, OWN, DEMO] }, 'gone'), 'own');
  assert.equal(returnCompany({ ...st, companies: [DEMO] }, null), null);
  const off = deps(st, {}, false);
  assert.match(String(await leaveDemo(off.d)), /нужна сеть/);
});

test('плашка «Демо · роль · Выйти» и экран ролей', () => {
  const win = new Window({ url: 'http://localhost/#/demo' });
  const doc = win.document as unknown as Document;
  const acts: string[] = [];
  syncDemoChip(doc, { role: 'Прораб' }, { pick: () => acts.push('pick'), leave: () => acts.push('leave') });
  assert.ok(doc.body.classList.contains(DEMO_BODY_CLASS));
  assert.match(doc.getElementById('p2-demo-chip')!.textContent || '', /Демо.*Прораб.*Выйти/);
  (doc.querySelector('[data-testid=p2-demo-chip-role]') as HTMLElement).click();
  (doc.querySelector('[data-testid=p2-demo-chip-exit]') as HTMLElement).click();
  assert.deepEqual(acts, ['pick', 'leave']);
  syncDemoChip(doc, { role: 'ПТО' }, { pick: () => {}, leave: () => {} });
  assert.equal(doc.querySelectorAll('#p2-demo-chip').length, 1);
  syncDemoChip(doc, null, { pick: () => {}, leave: () => {} });
  assert.equal(doc.getElementById('p2-demo-chip'), null);
  assert.ok(!doc.body.classList.contains(DEMO_BODY_CLASS));

  const host = doc.createElement('div');
  const chosen: string[] = [];
  renderDemoScreen(host as unknown as HTMLElement, { roles: [
    { code: 'foreman', title: 'Прораб', hint: 'Свой участок', sort: 40, area: 'Корпус 2 · Секция 1', current: true, company_id: 'demo', company_name: 'Девелопмент Демо' },
    { code: 'pto', title: 'Инженер <ПТО>', hint: null, sort: 30, area: 'весь объект', current: false, company_id: 'demo', company_name: 'Девелопмент Демо' }
  ], error: null, inDemo: true, choose: (r) => chosen.push(r), leave: () => chosen.push('leave'), back: () => chosen.push('back') });
  assert.equal(host.querySelectorAll('[data-testid=p2-demo-role]').length, 2);
  assert.ok(host.innerHTML.includes('Инженер &lt;ПТО&gt;'), 'текст экранирован');
  assert.equal(host.querySelector('[aria-current=true]')!.getAttribute('data-role'), 'foreman');
  (host.querySelector('[data-role=pto]') as HTMLElement).click();
  (host.querySelector('[data-testid=p2-demo-leave]') as HTMLElement).click();
  assert.deepEqual(chosen, ['pto', 'leave']);
  renderDemoScreen(host as unknown as HTMLElement, { roles: [], error: 'Демо открывается только с интернетом', inDemo: false, choose: () => {}, leave: () => {}, back: () => {} });
  assert.match(host.querySelector('[data-testid=p2-demo-error]')!.textContent || '', /интернет/);
});
