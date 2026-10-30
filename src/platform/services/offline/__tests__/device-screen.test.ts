/// <reference types="node" />
/** P2-0073: «Данные на устройстве → Офлайн по модулям» рисуется сразу — до подсчётов («считаем…» или прежние цифры с временем),
 *  переключатели работают сразу; подсчёты идут в фоне параллельно и каждый обновляет свою часть, не пересоздавая выбор.
 *  Занятый канал (опись версии sw.js не отвечает) не держит остальные цифры. DOM — happy-dom, подсчёты — управляемые обещания. */
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { COUNTING_TEXT, renderOfflineModules } from '../device-modules.ts';
import { currentSlot, keepOffline } from '../copy.ts';
import type { OfflineReader } from '../offline-read.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const later = <T>() => { let done!: (v: T) => void; const p = new Promise<T>((r) => { done = r; }); return { p, done }; };
const tick = () => new Promise((r) => setTimeout(r, 0));

let est = later<{ usage: number; quota: number }>();
let reg = later<unknown[]>();
let copy = later<number>();
before(() => {
  g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.localStorage = win.localStorage;
  g.fetch = () => new Promise(() => { /* канал занят: опись версии не приходит */ });
  (navigator as N).storage = { estimate: () => est.p };
  (win as N).RBI = {
    platform2: { getState: () => ({ mode: 'email', email: 'eng@x', companyId: 'c1' }) },
    services: { shell: { isPlatformModuleAllowed: () => true, legacyModuleAllowed: (id: string) => id === 'quality' } },
    platformMenuAccess: { company: true },
    moduleLoader: { getById: (id: string) => ({ offline: { view: true, input: id === 'quality' ? ['*'] : [], files: id === 'quality' } }) }
  };
  (win as N).STORES = { FILE_REGISTRY: 'file_registry_cache' };
  (win as N).dbGetAll = () => reg.p;
  g.__platform2OfflineReader = { size: () => copy.p, clear: async () => 0 } as unknown as OfflineReader;
});
beforeEach(() => { est = later(); reg = later(); copy = later(); });

const sizeOf = (el: Element, mod: string): string => (el.querySelector(`[data-testid=p2o-size-${mod}]`) as N)?.textContent || '';
const totalOf = (el: Element): string => (el.querySelector('[data-testid=p2o-total]') as N)?.textContent || '';

test('блок виден сразу: модули, «считаем…» вместо цифр, переключатель работает до конца подсчёта', async () => {
  const slot = win.document.createElement('div') as N;
  win.document.body.appendChild(slot);
  const run = renderOfflineModules(slot, true);
  // до любого подсчёта — блок уже нарисован
  assert.ok(slot.querySelector('[data-testid=p2-offline-modules]'), 'блок нарисован без ожидания');
  assert.deepEqual([...slot.querySelectorAll('[data-testid^=p2o-mod-]')].map((e: N) => e.dataset.mod), ['quality', 'planfact', 'company']);
  assert.match(totalOf(slot), new RegExp(COUNTING_TEXT));
  assert.match(sizeOf(slot, 'planfact'), /Данные считаем…/);
  assert.match(sizeOf(slot, 'quality'), /Фото и PDF считаем…/);
  // «Держать без сети» — включается и выключается сразу (включение без подтверждения)
  const box = slot.querySelector('#p2o-keep-planfact') as N;
  const was = keepOffline('planfact');
  box.checked = !was; box.dispatchEvent(new win.Event('change', { bubbles: true }));
  if (!was) assert.equal(keepOffline('planfact'), true, 'включено сразу, подсчёт ещё идёт');
  else assert.ok(win.document.querySelector('[data-testid=p2o-confirm]'), 'выключение — подтверждение сразу');
  win.document.querySelector('[data-testid=p2o-confirm] [data-no]')?.dispatchEvent(new win.Event('click', { bubbles: true }));
  const select = slot.querySelector('#p2o-scope-quality');
  // память ответила первой — итог обновился, остальное ещё «считаем…»
  est.done({ usage: 50 * 1048576, quota: 1050 * 1048576 }); await tick();
  assert.match(totalOf(slot), /На телефоне 50 МБ · свободно 1000 МБ/);
  assert.match(sizeOf(slot, 'planfact'), /Данные считаем…/);
  // копия и реестр — каждый своё; выпадающий список тот же элемент (выбор человека не сбрасывается)
  copy.done(20 * 1048576); await tick();
  assert.match(sizeOf(slot, 'planfact'), /Данные 20 МБ/);
  reg.done([{ cache_status: 'cached_cloud', size_bytes: 3 * 1048576, entity_type: 'inspection_photo' }]); await tick();
  assert.match(sizeOf(slot, 'quality'), /Фото и PDF 3,0 МБ/);
  assert.equal(slot.querySelector('#p2o-scope-quality'), select, 'частичное обновление не пересоздаёт выбор');
  // опись версии так и не пришла (канал занят) — код «считаем…», остальное на месте
  assert.match(sizeOf(slot, 'planfact'), /Код считаем…/);
  void run;
});

test('второе открытие: сразу прежние цифры с временем подсчёта; новые — по мере готовности', async () => {
  const at = new Date(2026, 9, 30, 14, 32).getTime();
  // другой человек на том же телефоне — свои цифры (слот «компания + пользователь»), прежние лежат на устройстве
  (win as N).RBI.platform2.getState = () => ({ mode: 'email', email: 'pto@x', companyId: 'c1' });
  win.localStorage.setItem('platform2_offline_figures:' + currentSlot(), JSON.stringify({ code: { planfact: 3 * 1048576 }, copy: { planfact: 7 * 1048576, company: 2048 },
    files: { quality: 1048576, knowledge: 0 }, used: 60 * 1048576, free: 900 * 1048576, at }));
  const slot = win.document.createElement('div') as N;
  win.document.body.appendChild(slot);
  void renderOfflineModules(slot, true);
  assert.match(totalOf(slot), /На телефоне 60 МБ · свободно 900 МБ · на 14:32/, 'сразу — прежние цифры с временем подсчёта');
  assert.match(sizeOf(slot, 'planfact'), /Код 3,0 МБ.*Данные 7,0 МБ/);
  assert.match(sizeOf(slot, 'quality'), /Фото и PDF 1,0 МБ/);
  est.done({ usage: 61 * 1048576, quota: 961 * 1048576 }); await tick();
  assert.match(totalOf(slot), /На телефоне 61 МБ · свободно 900 МБ$/, 'память пересчитана — без «на …»');
});
