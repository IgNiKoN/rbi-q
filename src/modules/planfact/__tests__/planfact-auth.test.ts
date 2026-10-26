/// <reference types="node" />
/** Шапка и выход экрана «План/Факт» с подставным AuthApi (без сети); вход — общий экран платформы (P2-0013). DOM — happy-dom. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { PlanfactApp } from '../PlanfactApp.ts';
import { mapAuthError } from '../../../platform/auth/auth.service.ts';
import type { AuthApi } from '../../../platform/auth/auth.service.ts';
import type { PlanfactDemo } from '../model.ts';
import demo from '../demo-data.json' with { type: 'json' };
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
before(() => {
  g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
  g.HTMLInputElement = win.HTMLInputElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
});
const tick = (): Promise<void> => settle();

function fakeAuth(opts: { password: string; signedIn?: boolean }): AuthApi & { calls: string[] } {
  let signed = !!opts.signedIn;
  const calls: string[] = [];
  return {
    calls,
    async signIn(email, password) { calls.push('signIn'); if (password === opts.password) { signed = true; return { ok: true }; } return { ok: false, message: 'Неверная почта или пароль' }; },
    async signOut() { calls.push('signOut'); signed = false; },
    async getEmail() { return signed ? 'pto@test.invalid' : null; },
    async getAccess() { return [{ company: 'Альфа', role: 'Инженер ПТО', projectId: null }]; }
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
function setValue(el: N, value: string): void {
  el.value = value;
}
function click(el: N): void { el.dispatchEvent(new win.Event("click", { bubbles: true })); }
function mount(auth: AuthApi | null) {
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const root = createRoot(el as unknown as HTMLElement);
  flushSync(() => root.render(createElement(PlanfactApp, { auth, data: demo as PlanfactDemo })));
  return { el, root };
}

test('без настроек сервера — сразу локальный режим: подсказка и разбор ВОР, без старой таблицы', () => {
  const { el } = mount(null);
  assert.match(el.querySelector('[data-testid="pf-hint"]')?.textContent || '', /Сервер не настроен/);
  assert.ok(el.querySelector('[data-testid="pf-hint-vor"]'));
  assert.ok(!el.querySelector('[data-work-id]'));
  assert.ok(!el.querySelector('[data-testid="pf-login"]'));
});

test('есть сервер, нет сессии → своей формы входа нет: подсказка «Войдите», «Войти» открывает общий экран «Вход»', async () => {
  let opened = 0;
  (win as N).RBI = { platform2: { showLogin: () => { opened++; } } };
  const { el } = mount(fakeAuth({ password: 'ok' }));
  await tick();
  assert.ok(!el.querySelector('[data-testid="pf-login"]') && !el.querySelector('input[type=password]'));
  assert.match(el.querySelector('[data-testid="pf-hint"]')?.textContent || '', /Войдите/);
  assert.ok(!el.querySelector('[data-work-id]'));
  click(Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'Войти')!);
  assert.equal(opened, 1);
  delete (win as N).RBI;
});

test('вошёл → полоса «почта · компания · роль»; «Выйти» — общий выход платформы, данные скрыты', async () => {
  const auth = fakeAuth({ password: 'ok', signedIn: true });
  let out = 0;
  (win as N).RBI = { platform2: { signOut: async () => { out++; await auth.signOut(); } } };
  const { el } = mount(auth);
  await tick();
  const bar = el.querySelector('[data-testid="pf-user"]');
  assert.ok(bar && /pto@test\.invalid/.test(bar.textContent || '') && /Альфа · Инженер ПТО/.test(bar.textContent || ''));
  assert.match(el.querySelector('[data-testid="pf-hint"]')?.textContent || '', /Нет доступных объектов/);
  click(Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'Выйти')!);
  await tick();
  assert.equal(out, 1);
  assert.match(el.querySelector('[data-testid="pf-hint"]')?.textContent || '', /Войдите/);
  assert.ok(!el.querySelector('[data-testid="pf-user"]'));
  delete (win as N).RBI;
});

test('без оболочки «Выйти» завершает сессию сервиса входа', async () => {
  const auth = fakeAuth({ password: 'ok', signedIn: true });
  const { el } = mount(auth);
  await tick();
  click(Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'Выйти')!);
  await tick();
  assert.ok(auth.calls.includes('signOut'));
});

test('mapAuthError: понятные сообщения', () => {
  assert.equal(mapAuthError('Invalid login credentials'), 'Неверная почта или пароль');
  assert.match(mapAuthError('Failed to fetch'), /Нет связи/);
});
