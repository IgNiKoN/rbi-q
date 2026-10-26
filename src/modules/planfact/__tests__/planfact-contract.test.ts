/// <reference types="node" />
/**
 * Контракт модуля planfact: mount/unmount повторяемы без утечек DOM; enabled:false выключает модуль.
 * DOM — happy-dom (только в тестах).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;

before(() => {
  g.window = win;
  g.document = win.document;
  g.HTMLElement = win.HTMLElement;
  g.Node = win.Node;
  g.location = win.location;
  g.IS_REACT_ACT_ENVIRONMENT = false;
  (win as unknown as Record<string, unknown>).RBI = {};
});

after(async () => {
  await win.happyDOM.close();
});

test('mount → unmount → mount ×3: один экран, после unmount контейнер пуст, стиль один', async () => {
  const mod = await import('../index.ts');
  const el = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.appendChild(el as never);
  const bodyBefore = win.document.body.childNodes.length;

  for (let i = 0; i < 3; i++) {
    mod.mount(el);
    assert.equal(mod.isMounted(), true);
    // P2-0009: без входа — подсказка вместо старой демо-таблицы «Работы»
    assert.equal(el.querySelectorAll('[data-testid="pf-hint"]').length, 1, `mount #${i + 1}`);
    assert.equal(el.querySelectorAll('tr[data-work-id]').length, 0);
    mod.unmount();
    assert.equal(mod.isMounted(), false);
    assert.equal(el.childNodes.length, 0, `unmount #${i + 1}: контейнер пуст`);
  }
  assert.equal(win.document.querySelectorAll('#planfact-style').length, 1);
  assert.equal(win.document.body.childNodes.length, bodyBefore, 'body без лишних узлов');
});

test('повторный mount без unmount не дублирует экран; повторный unmount безопасен', async () => {
  const mod = await import('../index.ts');
  const el = win.document.createElement('div') as unknown as HTMLElement;
  mod.mount(el);
  mod.mount(el);
  assert.equal(el.querySelectorAll('[data-testid="pf-hint"]').length, 1);
  mod.unmount();
  mod.unmount();
  assert.equal(el.childNodes.length, 0);
});

test('enabled:false → нет пункта меню и loadModule отказывает', async () => {
  // Ядро оболочки — JS без типов: импорт по строке (any), чтобы tsc не требовал .d.ts
  const importJs = (rel: string) => import(new URL(rel, import.meta.url).href);
  const { PlanfactManifest } = await importJs('../../../../js/modules/planfact/planfact.manifest.js');
  const { isModuleEnabled } = await importJs('../../../../js/modules/modules.manifest.js');
  await importJs('../../../../js/core/module-loader.js');
  const loader = (win as unknown as { RBI: { moduleLoader: {
    getMenuItems: () => Array<{ id: string }>;
    loadModule: (id: string) => Promise<unknown>;
  } } }).RBI.moduleLoader;

  assert.equal(isModuleEnabled(PlanfactManifest), true);
  assert.ok(loader.getMenuItems().some((m) => m.id === 'planfact'));

  PlanfactManifest.enabled = false;
  try {
    assert.equal(isModuleEnabled(PlanfactManifest), false);
    assert.ok(!loader.getMenuItems().some((m) => m.id === 'planfact'));
    await assert.rejects(loader.loadModule('planfact'), /module disabled/);
  } finally {
    PlanfactManifest.enabled = true;
  }
});
