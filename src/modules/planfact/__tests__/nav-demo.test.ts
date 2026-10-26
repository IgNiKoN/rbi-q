/// <reference types="node" />
/** P2-0026: подвкладки План/Факта в меню оболочки — с входом по доступу, в демо (без входа) — все; PlanfactApp сообщает о демо. DOM — happy-dom. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { visibleNavItems } from '../nav-items.ts';
import { PlanfactApp } from '../PlanfactApp.ts';
import type { AuthApi } from '../../../platform/auth/auth.service.ts';
import type { PlanfactDemo } from '../model.ts';
import demo from '../demo-data.json' with { type: 'json' };
import { settle } from '../../../test-utils/settle.ts';

const ITEMS = [
  { id: 'summary', label: 'Сводка', path: '#/planfact', requiresAccess: true },
  { id: 'vor', label: 'ВОР', path: '#/planfact/vor', requiresAccess: true },
  { id: 'estimate', label: 'Смета', path: '#/planfact/estimate', requiresAccess: 'estimate' as const },
  { id: 'ks2', label: 'КС-2', path: '#/planfact/ks2', requiresAccess: 'ks2' as const }
];
const ids = (a: { id: string }[]): string => a.map((i) => i.id).join(',');

test('с входом — по доступу; без доступа — пусто; в демо — все разделы', () => {
  assert.equal(ids(visibleNavItems(ITEMS, { directories: true, estimate: false, ks2: true, demo: false })), 'summary,vor,ks2');
  assert.equal(ids(visibleNavItems(ITEMS, { directories: false, estimate: false, ks2: false, demo: false })), '');
  assert.equal(ids(visibleNavItems(ITEMS, { directories: false, estimate: false, ks2: false, demo: true })), 'summary,vor,estimate,ks2');
});

const win = new Window({ url: 'http://localhost/#/planfact/fact' });
const g = globalThis as Record<string, unknown>;
before(() => {
  g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
  g.HTMLInputElement = win.HTMLInputElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
});

function auth(signed: boolean): AuthApi {
  return {
    async signIn() { return { ok: true }; }, async signOut() { /* */ },
    async getEmail() { return signed ? 'pto@test.invalid' : null; },
    async getAccess() { return [{ company: 'Альфа', role: 'Инженер ПТО', projectId: null }]; }
  };
}
async function demoFlags(a: AuthApi | null): Promise<{ flags: boolean[]; text: string }> {
  const flags: boolean[] = [];
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const root = createRoot(el as unknown as HTMLElement);
  flushSync(() => root.render(createElement(PlanfactApp, { auth: a, data: demo as PlanfactDemo, onDemo: (d: boolean) => flags.push(d) })));
  await settle();
  const text = String(el.textContent);
  root.unmount(); el.remove();
  return { flags, text };
}

test('PlanfactApp: без входа — демо (раздел «Факт» — подсказка «Войдите»); с входом — не демо', async () => {
  const off = await demoFlags(auth(false));
  assert.equal(off.flags[off.flags.length - 1], true);
  assert.match(off.text, /Войдите, чтобы увидеть/);
  const none = await demoFlags(null);
  assert.equal(none.flags[none.flags.length - 1], true);
  const on = await demoFlags(auth(true));
  assert.equal(on.flags[on.flags.length - 1], false);
});
