/// <reference types="node" />
/** P2-0030: телефон, экран без шапки (План/Факт, Настройки…) — та же кнопка «☰» и список модулей переезжают в строку
 *  #mobile-module-strip над содержимым (оболочка js/core/app-shell.js в happy-dom); шапка видна — «☰» снова в ней. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const MENU = [{ id: 'planfact', label: 'План/Факт', section: 'platform', order: 50, path: '#/planfact', requiresAccess: false, demo: true }];

function shell(hash: string): N {
  const win: N = new Window({ url: 'http://localhost/' + hash });
  win.document.body.innerHTML =
    '<header id="main-header"><div id="header-left"><div class="mobile-module-menu-wrap"><button id="mobile-module-menu-btn"></button>' +
    '<div id="mobile-module-menu" class="hidden"></div></div><div id="header-brand-icon"></div></div></header>' +
    '<main id="app-root"><div id="mobile-module-strip" class="mobile-module-strip"><span class="mobile-module-strip-label"></span></div>' +
    '<div id="app-content"></div></main><div id="app-sidebar"></div>';
  win.AppModeManager = { currentMode: 'quality' };
  win.RBI = {
    moduleLoader: { getMenuItems: () => MENU, getById: (id: string) => ({ id, menu: MENU.find((m) => m.id === id) }) },
    platform2: { getState: () => ({ mode: 'email' }) },
    platformMenuAccess: { planfact: true, quality: true },
    qualitySync: { active: true },
    services: { permissions: { getAllowedModules: () => ['quality', 'construction', 'knowledge'] } }
  };
  const code = readFileSync(new URL('../../../../js/core/app-shell.js', import.meta.url), 'utf8');
  runInNewContext(code, { window: win, document: win.document, location: win.location, localStorage: win.localStorage, navigator: win.navigator, console });
  return win;
}
const sync = (win: N): void => win.RBI.services.shell.syncMobileModuleStrip();
const wrapHost = (win: N): string => win.document.querySelector('.mobile-module-menu-wrap').parentNode.id;
const label = (win: N): string => win.document.querySelector('.mobile-module-strip-label').textContent;
const active = (win: N): string[] => {
  win.RBI.services.shell.renderMobileModuleMenu();
  return Array.from(win.document.querySelectorAll('#mobile-module-menu button'))
    .filter((b: N) => b.textContent.includes('●')).map((b: N) => b.querySelector('span').textContent.trim());
};

test('шапка скрыта (План/Факт): «☰» в строке над содержимым, подпись и отметка — «План/Факт»', () => {
  const win = shell('#/planfact/inbox');
  win.document.getElementById('main-header').style.display = 'none';
  sync(win);
  assert.equal(wrapHost(win), 'mobile-module-strip');
  assert.ok(win.document.getElementById('mobile-module-strip').classList.contains('is-on'));
  assert.equal(label(win), 'План/Факт');
  assert.deepEqual(active(win), ['План/Факт'], 'отмечен План/Факт, а не режим Качества');
});

test('шапка снова видна: «☰» возвращается на прежнее место в шапке, строка выключена', () => {
  const win = shell('#/planfact');
  const header = win.document.getElementById('main-header');
  header.style.display = 'none';
  sync(win);
  header.style.display = 'block';
  win.location.hash = '#/quality/audit';
  sync(win);
  assert.equal(wrapHost(win), 'header-left');
  assert.equal(win.document.querySelector('#header-left').firstElementChild.className, 'mobile-module-menu-wrap', 'на прежнем месте — перед значком');
  assert.ok(!win.document.getElementById('mobile-module-strip').classList.contains('is-on'));
  assert.deepEqual(active(win), ['Качество']);
});

test('Настройки — служебный раздел модуля: из План/Факта подпись остаётся «План/Факт», из Качества — «Качество»', () => {
  const win = shell('#/planfact/fact');
  win.document.getElementById('main-header').style.display = 'none';
  sync(win);
  win.location.hash = '#/settings/platform';
  sync(win);
  assert.equal(label(win), 'План/Факт');
  win.location.hash = '#/quality/analytics';
  sync(win);
  assert.equal(label(win), 'Качество');
  win.location.hash = '#/settings/platform';
  sync(win);
  assert.equal(label(win), 'Качество');
});

test('открытый список закрывается при переезде «☰» (не остаётся висеть на чужом экране)', () => {
  const win = shell('#/quality/audit');
  win.RBI.services.shell.toggleMobileModuleMenu();
  assert.ok(!win.document.getElementById('mobile-module-menu').classList.contains('hidden'));
  win.document.getElementById('main-header').style.display = 'none';
  sync(win);
  assert.ok(win.document.getElementById('mobile-module-menu').classList.contains('hidden'));
});
