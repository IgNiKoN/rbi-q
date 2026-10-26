/// <reference types="node" />
/** P2-0009: «Сводка» — страница по умолчанию и вместо раздела без права (прораб по ссылке на «Смету»/«КС-2»);
 *  шапка оболочки показывает вошедшего в План/Факт, после выхода — прежнего пользователя (находка К4). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { settle } from '../../../test-utils/settle.ts';
import { makeFakeSummary, PTO_PROJECT } from './summary-fake.ts';
import type { AuthApi } from '../../../platform/auth/auth.service.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { createElement } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { PlanfactApp } = await import('../PlanfactApp.ts');
const { showShellUser, restoreShellUser } = await import('../../../platform/auth/shell-user.ts');
const tick = (): Promise<void> => settle();
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

function auth(): AuthApi & { out: () => void } {
  let signed = true;
  return { async signIn() { return { ok: true }; }, async signOut() { signed = false; }, async getEmail() { return signed ? 'foreman@demo.invalid' : null; },
    async getAccess() { return [{ company: 'Демо-компания', role: 'Прораб / мастер', projectId: null }]; }, out: () => { signed = false; } };
}
/** Доступ к одной компании без права на сметы (как у прораба): PlanfactApp спрашивает только myAccess. */
const projects = (): N => ({ async myAccess() { return [{ company_id: 'c1', company_name: 'Демо-компания', can_manage_projects: false, can_manage_units: false, can_manage_roles: false }]; } });
function mount(hash: string, a: AuthApi): N {
  win.location.hash = hash;
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const summary = makeFakeSummary([{ ...PTO_PROJECT }]).api;
  flushSync(() => createRoot(el as unknown as HTMLElement).render(createElement(PlanfactApp, { auth: a, data: { works: [] } as N, projects: projects(), summary } as N)));
  return el;
}
function shell(): { calls: { name: string; role: string }[] } {
  win.document.body.innerHTML = '<span id="desk-user-name">Инженер</span><span id="desk-user-avatar">ИН</span><div id="header-user-block">Инженер · engineer</div>';
  const calls: { name: string; role: string }[] = [];
  (win as N).RBI = { services: { shell: { renderUserBlock: (u: { name: string; role: string }) => {
    calls.push(u);
    win.document.getElementById('desk-user-name')!.textContent = u.name;
    win.document.getElementById('header-user-block')!.textContent = `${u.name} · ${u.role}`;
  } } } };
  return { calls };
}

test('#/planfact и адрес раздела без права (Смета без planfact.estimate.manage) → «Сводка», не старая таблица', async () => {
  for (const hash of ['#/planfact', '#/planfact/estimate', '#/planfact/ks2']) {
    const el = mount(hash, auth()); await tick();
    assert.match(el.textContent || '', /Сводка — готовность объектов/, hash);
    assert.ok(el.querySelector('[data-testid="sm-portfolio"], [data-project-id]') || /ЖК/.test(el.textContent || ''), `${hash}: портфель на экране`);
    assert.ok(!el.querySelector('[data-work-id]'), `${hash}: без старой демо-таблицы`);
  }
});

test('вход → шапка оболочки «почта · роль»; выход → прежний пользователь', async () => {
  const s = shell();
  const el = mount('#/planfact', auth()); await tick();
  assert.deepEqual(s.calls[s.calls.length - 1], { name: 'foreman@demo.invalid', role: 'Прораб / мастер' });
  assert.equal(win.document.getElementById('header-user-block')!.textContent, 'foreman@demo.invalid · Прораб / мастер');
  const out = Array.from(el.querySelectorAll('button') as N[]).find((b: N) => b.textContent === 'Выйти') as N;
  out.dispatchEvent(new win.Event('click', { bubbles: true })); await tick();
  assert.equal(win.document.getElementById('desk-user-name')!.textContent, 'Инженер');
  assert.equal(win.document.getElementById('desk-user-avatar')!.textContent, 'ИН');
  assert.equal(win.document.getElementById('header-user-block')!.textContent, 'Инженер · engineer');
});

test('шапка без оболочки (нет RBI.services.shell) — ничего не ломается; повторный вход не теряет исходного пользователя', () => {
  (win as N).RBI = undefined;
  showShellUser('a@b.c', 'ПТО'); restoreShellUser();
  const s = shell();
  showShellUser('a@b.c', 'ПТО'); showShellUser('d@e.f', 'РП');
  assert.equal(s.calls.length, 2);
  restoreShellUser();
  assert.equal(win.document.getElementById('desk-user-name')!.textContent, 'Инженер');
});
