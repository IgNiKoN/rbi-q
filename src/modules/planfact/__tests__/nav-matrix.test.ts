/// <reference types="node" />
/** P2-0011: матрица переходов «адрес → что подсвечено / что открыто». Оболочка (js/core/router.js, updateNavHighlight) — в happy-dom,
 *  ровно один пункт на уровень (боковое меню; подвкладки = нижний таббар + nav2); План/Факт — canonicalHash (адрес без права →
 *  открытый экран); «Компания» — вкладка из адреса #/settings/company/<вкладка>. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';
import { canonicalHash, routeFromHash } from '../PlanfactApp.ts';
import type { RouteAccess } from '../PlanfactApp.ts';
import { tabFromHash } from '../../../platform/company/CompanyApp.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const PF = ['#/planfact', '#/planfact/vor', '#/planfact/fact', '#/planfact/estimate', '#/planfact/ks2', '#/planfact/directories'];
const PF_LABELS = ['Сводка', 'ВОР', 'Факт', 'Смета', 'КС-2', 'Справочники'];
const Q = ['#/quality/audit', '#/quality/engineer', '#/quality/analytics', '#/quality/reference'];

/** Оболочка с боковым меню, nav2 и нижним таббаром; router.js исполняется как в браузере. */
function shell(subPaths: string[], labels: string[], platformNav: boolean): { win: N; router: N } {
  const win: N = new Window({ url: 'http://localhost/' });
  const d = win.document;
  const side = ['<button data-sidebar-module-id="quality" title="Качество"></button>', '<button data-sidebar-module-id="construction" title="Стройконтроль"></button>',
    '<button data-sidebar-module-id="planfact" data-path="#/planfact" title="План/Факт"></button>',
    '<button data-path="#/settings" data-sidebar-settings="1" title="Настройки"></button>'].join('');
  const items = (cls: string) => subPaths.map((p, i) => `<div class="${cls}" data-path="${p}">${labels[i]}</div>`).join('');
  d.body.innerHTML = `<div id="app-sidebar">${side}</div><nav id="app-nav2">${items('app-nav2-item')}</nav>`
    + `<nav id="main-bottom-nav">${items('nav-item')}<div class="nav-item" data-path="#/settings">Настройки</div></nav>`;
  win.AppModeManager = { currentMode: 'quality' };
  win.RBI = { platformNav: platformNav ? { id: 'planfact', title: 'План/Факт', items: [] } : null };
  const code = readFileSync(new URL('../../../../js/core/router.js', import.meta.url), 'utf8');
  runInNewContext(code, { window: win, document: d, location: win.location, history: win.history, localStorage: win.localStorage,
    console, setTimeout, queueMicrotask, CustomEvent: win.CustomEvent });
  return { win, router: win.AppRouter };
}
const active = (win: N, sel: string): string[] => Array.from(win.document.querySelectorAll(sel)).filter((e: N) => e.classList.contains('active'))
  .map((e: N) => e.getAttribute('title') || e.textContent.trim());
const level = (win: N): string[] => Array.from(new Set(active(win, '#app-nav2 .app-nav2-item, #main-bottom-nav .nav-item')));

test('оболочка: План/Факт — в боковом меню подсвечен «План/Факт» (не «Качество»), в подвкладках — ровно открытая', () => {
  const rows: [string, string][] = [['#/planfact', 'Сводка'], ['#/planfact/summary', 'Сводка'], ['#/planfact/vor', 'ВОР'], ['#/planfact/fact', 'Факт'],
    ['#/planfact/estimate', 'Смета'], ['#/planfact/ks2', 'КС-2'], ['#/planfact/directories', 'Справочники'], ['#/planfact/directories/units', 'Справочники'],
    ['#/planfact/directories/prices', 'Справочники']];
  const { win, router } = shell(PF, PF_LABELS, true);
  for (const [path, sub] of rows) {
    router.updateNavHighlight(path);
    assert.deepEqual(active(win, '#app-sidebar [data-sidebar-module-id], #app-sidebar [data-path]'), ['План/Факт'], path + ': боковое меню');
    assert.deepEqual(level(win), [sub], path + ': подвкладки');
  }
});

test('оболочка: Настройки из План/Факт — текущий модуль «План/Факт» + Настройки; из Качества — «Качество» + Настройки', () => {
  const a = shell(PF, PF_LABELS, true);
  for (const path of ['#/settings/platform', '#/settings/company', '#/settings/company/members']) {
    a.router.updateNavHighlight(path);
    assert.deepEqual(active(a.win, '#app-sidebar button'), ['План/Факт', 'Настройки'], path);
    assert.deepEqual(level(a.win), ['Настройки'], path + ': в таббаре — Настройки');
  }
  const b = shell(Q, ['Осмотр', 'Инженер', 'Аналитика', 'База знаний'], false);
  b.router.updateNavHighlight('#/settings/company/audit');
  assert.deepEqual(active(b.win, '#app-sidebar button'), ['Качество', 'Настройки']);
});

test('оболочка: Качество — подсвечены «Качество» и открытая подвкладка, пункт «План/Факт» погашен', () => {
  const { win, router } = shell(Q, ['Осмотр', 'Инженер', 'Аналитика', 'База знаний'], false);
  for (const [path, sub] of [['#/quality/audit', 'Осмотр'], ['#/quality/engineer/tasks', 'Инженер'], ['#/quality/analytics/sk', 'Аналитика']]) {
    router.updateNavHighlight(path);
    assert.deepEqual(active(win, '#app-sidebar button'), ['Качество'], path);
    assert.deepEqual(level(win), [sub], path);
  }
});

test('оболочка: после показа маршрута роутер шлёт rbi:route (модуль платформы убирает свои подвкладки)', () => {
  const { win, router } = shell(PF, PF_LABELS, true);
  const seen: string[] = [];
  router.addRoute('#/quality/audit', () => {});
  win.addEventListener('rbi:route', (e: N) => seen.push(e.detail.path));
  router.navigate('#/quality/audit');
  assert.deepEqual(seen, ['#/quality/audit']);
});

const ALL: RouteAccess = { company: true, estimate: true, ks2: true, fact: true, brigades: true };
test('План/Факт: адрес = открытый экран (раздел без права, неизвестный адрес, вкладка справочников без права)', () => {
  const rows: [string, Partial<RouteAccess>, string | null][] = [
    ['#/planfact', {}, null], ['#/planfact/summary', {}, null], ['#/planfact/vor', {}, null], ['#/planfact/directories', {}, null],
    ['#/planfact/directories/units', {}, null], ['#/planfact/ks2', {}, null], ['#/planfact/ks2', { ks2: false }, '#/planfact'],
    ['#/planfact/estimate', { estimate: false }, '#/planfact'], ['#/planfact/fact', { fact: false }, '#/planfact'],
    ['#/planfact/что-то', {}, '#/planfact'], ['#/planfact/directories/prices', { estimate: false }, '#/planfact/directories/objects'],
    ['#/planfact/directories/overheads', { estimate: false }, '#/planfact/directories/objects'], ['#/planfact/directories/prices', {}, null],
    ['#/planfact/directories/brigades', { brigades: false }, '#/planfact/directories/objects'], ['#/planfact/directories/xyz', {}, '#/planfact/directories/objects'],
    ['#/planfact/ks2', { company: false, ks2: false }, null],            // нет доступа к компании — экран-подсказка, адрес не трогаем
    ['#/settings/company/members', { ks2: false }, null], ['#/quality/audit', {}, null]   // чужие адреса — никогда
  ];
  for (const [hash, a, want] of rows) assert.equal(canonicalHash(hash, { ...ALL, ...a }), want, hash + ' ' + JSON.stringify(a));
  assert.deepEqual(routeFromHash('#/planfact/directories/units'), { page: 'directories', sub: 'units' });
});

test('Компания: вкладка — из адреса #/settings/company/<вкладка>', () => {
  assert.equal(tabFromHash('#/settings/company'), 'roles');
  assert.equal(tabFromHash('#/settings/company/'), 'roles');
  assert.equal(tabFromHash('#/settings/company/members'), 'members');
  assert.equal(tabFromHash('#/settings/company/audit'), 'audit');
  assert.equal(tabFromHash('#/settings/company/чужое'), 'roles');
  assert.equal(tabFromHash('#/settings/platform'), 'roles');
});
