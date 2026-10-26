/// <reference types="node" />
/** P2-0013 этап 4: неположенный модуль не скачивается и не хранится в кэше приложения (sw.js — правила P2_SW_ALLOWLIST;
 *  обёртка «Компании» — бандл только при праве). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { loadSw } from './sw-harness.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const BASE = 'https://ignikon.github.io/platform-2-core';

test('sw.js: до решения входа файлы модулей можно кэшировать; после — только положенные', async () => {
  const sw = loadSw([]);
  assert.equal(sw.ctx.mayCachePut(`${BASE}/js/dist/planfact/planfact.js`), true);
  await sw.message({ type: 'P2_SW_ALLOWLIST', modules: ['planfact'] });
  assert.equal(sw.ctx.mayCachePut(`${BASE}/js/dist/planfact/planfact.js`), true);
  assert.equal(sw.ctx.mayCachePut(`${BASE}/js/dist/planfact/chunks/exceljs.min-x.js`), true);
  assert.equal(sw.ctx.mayCachePut(`${BASE}/js/dist/company/company.js`), false, 'прорабу «Компания» не кэшируется');
  assert.equal(sw.ctx.mayCachePut(`${BASE}/js/dist/platform-admin/platform-admin.js`), false);
  assert.equal(sw.ctx.mayCachePut(`${BASE}/js/dist/platform/platform.js`), true, 'вход платформы — всем');
});

test('sw.js: модуль выключили / вышли — его файлы удаляются из кэша, остальное остаётся', async () => {
  const urls = [`${BASE}/js/dist/planfact/planfact.js`, `${BASE}/js/dist/planfact/chunks/xlsx-reader-a.js`, `${BASE}/js/dist/company/company.js`,
    `${BASE}/js/dist/platform/platform.js`, `${BASE}/index.html`, `${BASE}/js/modules/quality/index.js`];
  const sw = loadSw(urls);
  await sw.message({ type: 'P2_SW_ALLOWLIST', modules: ['company'] });
  assert.deepEqual([...sw.store.keys()], [`${BASE}/js/dist/company/company.js`, `${BASE}/js/dist/platform/platform.js`, `${BASE}/index.html`, `${BASE}/js/modules/quality/index.js`]);
  await sw.message({ type: 'P2_SW_ALLOWLIST', modules: [] });
  assert.deepEqual([...sw.store.keys()], [`${BASE}/js/dist/platform/platform.js`, `${BASE}/index.html`, `${BASE}/js/modules/quality/index.js`]);
});

test('«Компания» без права: подраздел зарегистрирован, но бандл не запрашивается', async () => {
  const win: N = new Window({ url: 'http://localhost/#/settings' });
  const g = globalThis as N;
  const saved = { window: g.window, location: g.location };
  g.window = win; g.location = win.location;
  win.RBI = { platformMenuAccess: { company: false } };
  try {
    const url = new URL('../../../../js/modules/company/index.js', import.meta.url).href;
    const mod: N = await import(url);
    mod.init();
    assert.equal(typeof win.RBI.platformPanels.company.mount, 'function');
    const el = win.document.createElement('div'); win.document.body.appendChild(el);
    await mod.mount(el);
    assert.equal(mod.isMounted(), false);
    assert.equal(el.childNodes.length, 0);
  } finally {
    g.window = saved.window; g.location = saved.location;
  }
});
