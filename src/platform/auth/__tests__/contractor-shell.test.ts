/// <reference types="node" />
/** P2-0044: оболочка для представителя подрядчика — вкладки «Осмотр»/«Инженер» скрыты, модуль Стройконтроля 2.0 называется
 *  «Кабинет подрядчика», вход с «Осмотра» — сразу в кабинет; инженер — как раньше (js/core/app-shell.js в happy-dom). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
function shell(role: string, hash: string): { win: N; modes: string[] } {
  const win: N = new Window({ url: 'http://localhost/' + hash });
  win.document.body.innerHTML = '<div id="app-sidebar"></div><div class="mobile-module-menu-wrap"><div id="mobile-module-menu" class="hidden"></div></div>' +
    '<nav id="main-bottom-nav"><div class="nav-item" data-path="#/quality/audit"></div><div class="nav-item" data-path="#/quality/engineer"></div>' +
    '<div class="nav-item" data-path="#/quality/analytics"></div></nav>';
  const modes: string[] = [];
  win.AppRouter = { navigate: (p: string) => { modes.push(p); } };
  win.RBI = {
    moduleLoader: { getMenuItems: () => [], getById: () => null },
    platform2: { getState: () => ({ mode: 'email' }) },
    platformMenuAccess: { quality: true, construction: true },
    qualitySync: {},
    services: { permissions: { getAllowedModules: () => ['quality', 'construction', 'knowledge'], getCurrentRole: () => role } }
  };
  const code = readFileSync(new URL('../../../../js/core/app-shell.js', import.meta.url), 'utf8');
  runInNewContext(code, { window: win, document: win.document, location: win.location, localStorage: win.localStorage, navigator: win.navigator, console });
  return { win, modes };
}

test('подрядчик: вкладки «Осмотр» и «Инженер» скрыты, «Кабинет подрядчика», вход — в кабинет', () => {
  const { win, modes } = shell('contractor', '#/quality/audit');
  assert.equal(win.document.body.classList.contains('rbi-role-contractor'), true);
  const css = win.document.getElementById('shell-contractor-style')?.textContent || '';
  assert.match(css, /#\/quality\/audit/);
  assert.match(css, /#\/quality\/engineer/);
  assert.doesNotMatch(css, /analytics/);
  assert.deepEqual(modes, ['#/construction-v2/cabinet']);
  assert.match(win.document.getElementById('app-sidebar').innerHTML, /Кабинет подрядчика/);
});

test('подрядчик на другом экране (аналитика) — без перехода', () => {
  const { modes } = shell('contractor', '#/quality/analytics');
  assert.deepEqual(modes, []);
});

test('инженер — как раньше: вкладки видны, модуль «Стройконтроль в2 (тест)», без перехода', () => {
  const { win, modes } = shell('engineer', '#/quality/audit');
  assert.equal(win.document.body.classList.contains('rbi-role-contractor'), false);
  assert.equal(win.document.getElementById('shell-contractor-style'), null);
  assert.deepEqual(modes, []);
  assert.doesNotMatch(win.document.getElementById('app-sidebar').innerHTML, /Кабинет подрядчика/);
});
