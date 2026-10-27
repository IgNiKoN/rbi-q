/// <reference types="node" />
/** P2-0046: нижняя панель модуля Платформы на телефоне — не больше 5 пунктов: больше — первые 4 видны, остальные в «Ещё»
 *  (оболочка js/core/app-shell.js в happy-dom). Пункты остаются в панели — подсветка и адреса прежние; число на «Ещё» — сумма
 *  чисел ушедших пунктов. Старое Качество и Стройконтроль (нет window.RBI.platformNav) — панель как была. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

function shell(): N {
  const win: N = new Window({ url: 'http://localhost/#/planfact' });
  win.document.body.innerHTML = '<nav id="main-bottom-nav" class="bottom-nav"></nav><div id="app-sidebar"></div>';
  win.AppModeManager = { currentMode: 'quality' };
  win.RBI = {
    moduleLoader: { getMenuItems: () => [], getById: () => null },
    platform2: { getState: () => ({ mode: 'demo' }) },
    services: { permissions: { getAllowedModules: () => ['quality'] } }
  };
  const code = readFileSync(new URL('../../../../js/core/app-shell.js', import.meta.url), 'utf8');
  runInNewContext(code, { window: win, document: win.document, location: win.location, localStorage: win.localStorage, navigator: win.navigator, console });
  return win;
}

function fill(win: N, paths: string[], platform = true): N {
  win.RBI.platformNav = platform ? { id: 'planfact', title: 'План/Факт', items: paths.map((p) => ({ path: p, label: p })) } : null;
  const nav = win.document.getElementById('main-bottom-nav');
  nav.innerHTML = paths.map((p) => '<div class="nav-item" data-path="' + p + '"><svg></svg><span class="nav-text">' + p.split('/').pop() + '</span></div>').join('');
  win.RBI.services.shell.fitBottomNav(nav);
  return nav;
}
const overflow = (nav: N): string[] => Array.from(nav.querySelectorAll('.nav-item--overflow')).map((e: N) => e.getAttribute('data-path'));
const PF = ['#/planfact', '#/planfact/inbox', '#/planfact/vor', '#/planfact/fact', '#/planfact/estimate', '#/planfact/ks2', '#/planfact/directories', '#/settings'];

test('Качество и Стройконтроль (не модуль Платформы): панель как была — без класса платформы и без «Ещё» даже при 7 пунктах', () => {
  const win = shell();
  const nav = fill(win, ['#/construction-v2', '#/construction-v2/defects', '#/construction-v2/acceptance', '#/construction-v2/transfer',
    '#/construction-v2/metrics', '#/construction-v2/cabinet', '#/settings'], false);
  assert.equal(nav.classList.contains('bottom-nav--platform'), false);
  assert.equal(nav.querySelector('.nav-item--more'), null);
  assert.deepEqual(overflow(nav), []);
});

test('модуль Платформы, 5 пунктов и меньше — все видны, «Ещё» нет', () => {
  const win = shell();
  const nav = fill(win, ['#/planfact', '#/planfact/inbox', '#/planfact/vor', '#/planfact/fact', '#/settings']);
  assert.equal(nav.querySelector('.nav-item--more'), null);
  assert.deepEqual(overflow(nav), []);
  assert.equal(nav.querySelectorAll('.nav-item[data-path]').length, 5);
});

test('8 пунктов (План/Факт): видны первые 4 + «Ещё», остальные 4 — в списке, все пункты остаются в панели', () => {
  const win = shell();
  const nav = fill(win, PF);
  assert.ok(nav.classList.contains('bottom-nav--platform'));
  assert.deepEqual(overflow(nav), ['#/planfact/estimate', '#/planfact/ks2', '#/planfact/directories', '#/settings']);
  const more = nav.querySelector('.nav-item--more');
  assert.ok(more, 'есть «Ещё»');
  assert.equal(more.querySelector('.nav-text').textContent, 'Ещё');
  assert.equal(more.getAttribute('data-path'), null, '«Ещё» не уводит роутер');
  assert.equal(nav.querySelectorAll('.nav-item[data-path]').length, 8);
});

test('«Ещё» открывает список ушедших пунктов с теми же адресами; повторное нажатие и Escape закрывают', () => {
  const win = shell();
  const nav = fill(win, PF);
  nav.querySelector('[data-path="#/planfact/ks2"]').classList.add('active');
  const more = nav.querySelector('.nav-item--more');
  more.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const sheet = win.document.getElementById('shell-more-sheet');
  assert.ok(sheet, 'список открыт');
  assert.deepEqual(Array.from(sheet.querySelectorAll('[data-path]')).map((e: N) => e.getAttribute('data-path')), overflow(nav));
  assert.ok(sheet.querySelector('[data-path="#/planfact/ks2"]').classList.contains('active'), 'открытый раздел отмечен');
  assert.equal(more.getAttribute('aria-expanded'), 'true');
  more.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.equal(win.document.getElementById('shell-more-sheet'), null, 'повторное нажатие закрывает');
  more.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(win.document.getElementById('shell-more-sheet'), null, 'Escape закрывает');
});

test('нажатие вне «Ещё» закрывает список; новая отрисовка панели — тоже', () => {
  const win = shell();
  const nav = fill(win, PF);
  nav.querySelector('.nav-item--more').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  win.document.body.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.equal(win.document.getElementById('shell-more-sheet'), null);
  nav.querySelector('.nav-item--more').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  fill(win, PF);
  assert.equal(win.document.getElementById('shell-more-sheet'), null);
  assert.equal(nav.querySelectorAll('.nav-item--more').length, 1, 'одна кнопка «Ещё» после перерисовки');
});

test('пункт, скрытый правилом роли (display:none), не считается: 6 пунктов, один скрыт — «Ещё» нет', () => {
  const win = shell();
  const st = win.document.createElement('style');
  st.textContent = '#main-bottom-nav .nav-item[data-path="#/x/hidden"]{display:none}';
  win.document.head.appendChild(st);
  const nav = fill(win, ['#/x/a', '#/x/hidden', '#/x/b', '#/x/c', '#/x/d', '#/settings']);
  assert.equal(nav.querySelector('.nav-item--more'), null);
});

test('число на «Ещё» — сумма чисел пунктов в списке; видимые пункты свои числа держат сами', () => {
  const win = shell();
  const nav = fill(win, PF);
  win.RBI.services.shell.setNavBadges('planfact', { '#/planfact/inbox': 9, '#/planfact/ks2': 1, '#/planfact/estimate': 2 });
  assert.equal(nav.querySelector('.nav-item--more .shell-nav-badge').textContent, '3');
  assert.equal(nav.querySelector('[data-path="#/planfact/inbox"] .shell-nav-badge').textContent, '9');
  win.RBI.services.shell.setNavBadges('planfact', null);
  assert.equal(nav.querySelector('.nav-item--more .shell-nav-badge'), null, 'числа убраны — и на «Ещё»');
});
