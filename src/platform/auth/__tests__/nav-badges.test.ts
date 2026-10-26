/// <reference types="node" />
/** P2-0021 этап 2: число на пункте меню (js/core/app-shell.js + app-shell.desktop.js в happy-dom): боковое меню, мобильное меню модулей,
 *  нижний таббар и nav2; 0 — без точки; > 99 — «99+»; без чисел меню прежнее; убрать — setNavBadges(scope, null). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const MENU = [{ id: 'planfact', label: 'План/Факт', section: 'platform', order: 50, path: '#/planfact', requiresAccess: false, demo: true }];
const TABS = '<div class="nav-item" data-path="#/planfact"><span class="nav-text">Сводка</span></div>' +
  '<div class="nav-item" data-path="#/planfact/fact"><span class="nav-text">Факт</span></div>' +
  '<div class="nav-item" data-path="#/planfact/ks2"><span class="nav-text">КС-2</span></div>' +
  '<div class="nav-item" data-path="#/settings"><span class="nav-text">Настройки</span></div>';

function shell(): N {
  const win: N = new Window({ url: 'http://localhost/#/planfact' });
  win.document.body.innerHTML = '<div id="app-sidebar"></div><div class="mobile-module-menu-wrap"><div id="mobile-module-menu" class="hidden"></div></div>' +
    '<nav id="main-bottom-nav"></nav><aside id="app-nav2" hidden></aside>';
  win.RBI = {
    moduleLoader: { getMenuItems: () => MENU, getById: (id: string) => ({ id, menu: MENU.find((m) => m.id === id) }) },
    platform2: { getState: () => ({ mode: 'email' }) },
    platformMenuAccess: { planfact: true },
    services: { permissions: { getAllowedModules: () => [] } }
  };
  const ctx = { window: win, document: win.document, location: win.location, localStorage: win.localStorage, navigator: win.navigator, console, getComputedStyle: win.getComputedStyle.bind(win) };
  runInNewContext(readFileSync(new URL('../../../../js/core/app-shell.js', import.meta.url), 'utf8'), ctx);
  runInNewContext(readFileSync(new URL('../../../../js/core/app-shell.desktop.js', import.meta.url), 'utf8'), ctx);
  // как AppModeManager.renderBottomNav: таббар, затем nav2 из той же разметки
  win.renderTabs = () => { win.document.getElementById('main-bottom-nav').innerHTML = TABS; win.RBI.shellDesktop.fillNav2(TABS, 'platform'); };
  win.renderTabs();
  return win;
}
const badge = (win: N, sel: string): string | null => { const el = win.document.querySelector(sel); const b = el && el.querySelector('.shell-nav-badge'); return b ? b.textContent : null; };
const all = (win: N): number => win.document.querySelectorAll('.shell-nav-badge').length;

test('без чисел меню прежнее: точек нет, стиль не добавлен', () => {
  const win = shell();
  assert.equal(all(win), 0);
  assert.equal(win.document.getElementById('shell-nav-badge-style'), null);
  assert.equal(win.document.querySelector('#app-sidebar [data-sidebar-module-id="planfact"]').textContent.trim(), 'План/Факт');
});

test('числа: боковое меню (модуль), мобильное меню, нижний таббар и nav2; 0 — без точки', () => {
  const win = shell();
  win.RBI.services.shell.renderMobileModuleMenu();
  win.RBI.services.shell.setNavBadges('planfact', { '#/planfact/fact': 3, '#/planfact/ks2': 0, 'module:planfact': 3 });
  assert.equal(badge(win, '#app-sidebar [data-sidebar-module-id="planfact"]'), '3', 'боковое меню — сумма модуля');
  assert.equal(badge(win, '#mobile-module-menu [data-menu-module-id="planfact"]'), '3', 'мобильное меню модулей');
  assert.equal(badge(win, '#main-bottom-nav [data-path="#/planfact/fact"]'), '3', 'нижний таббар');
  assert.equal(badge(win, '#app-nav2 [data-path="#/planfact/fact"]'), '3', 'nav2');
  assert.equal(badge(win, '#main-bottom-nav [data-path="#/planfact/ks2"]'), null, '0 — без точки');
  assert.equal(badge(win, '#main-bottom-nav [data-path="#/planfact"]'), null, '«Сводка» (#/planfact) — не путать с пунктом модуля');
  assert.equal(badge(win, '#app-nav2 [data-path="#/planfact"]'), null);
  assert.ok(win.document.getElementById('shell-nav-badge-style'), 'стиль точки — один раз');
  assert.equal(win.document.querySelector('#main-bottom-nav [data-path="#/planfact/fact"] .shell-nav-badge').getAttribute('aria-label'), 'Требует участия: 3');
});

test('> 99 — «99+»; перерисовка меню сохраняет точки; повторная установка не дублирует', () => {
  const win = shell();
  win.RBI.services.shell.setNavBadges('planfact', { '#/planfact/ks2': 150, 'module:planfact': 150 });
  assert.equal(badge(win, '#main-bottom-nav [data-path="#/planfact/ks2"]'), '99+');
  win.renderTabs();
  win.RBI.services.shell.renderSidebar();
  assert.equal(badge(win, '#main-bottom-nav [data-path="#/planfact/ks2"]'), '99+', 'после перерисовки таббара');
  assert.equal(badge(win, '#app-nav2 [data-path="#/planfact/ks2"]'), '99+', 'после перерисовки nav2');
  assert.equal(badge(win, '#app-sidebar [data-sidebar-module-id="planfact"]'), '99+', 'после перерисовки бокового меню');
  win.RBI.services.shell.setNavBadges('planfact', { '#/planfact/ks2': 2, 'module:planfact': 2 });
  assert.equal(win.document.querySelectorAll('#main-bottom-nav [data-path="#/planfact/ks2"] .shell-nav-badge').length, 1);
  assert.equal(badge(win, '#main-bottom-nav [data-path="#/planfact/ks2"]'), '2');
});

test('убрать числа модуля (выход) — точек нет; мусор в числах не рисуется', () => {
  const win = shell();
  win.RBI.services.shell.setNavBadges('planfact', { '#/planfact/fact': 4, 'module:planfact': 4 });
  win.RBI.services.shell.setNavBadges('planfact', null);
  assert.equal(all(win), 0);
  win.RBI.services.shell.setNavBadges('planfact', { '#/planfact/fact': 'x', '#/planfact/ks2': -3, 'module:planfact': NaN });
  assert.equal(all(win), 0);
  assert.ok(!win.document.querySelector('.has-shell-nav-badge'));
});
