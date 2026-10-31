/// <reference types="node" />
/** P2-0078: права План/Факта всех моих объектов — одним вызовом; 30 с без повторов; без сети / без функции — прежний вызов по объекту. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPermsBatch, PERMS_TTL_MS } from '../vor/permissions-batch.ts';

function fake(rows: Array<{ project_id: string; actions: string[] | null }> | null, ids = ['p1', 'p2', 'p3']) {
  const calls = { all: 0, projects: 0 };
  let t = 1000; let offline = false;
  const b = createPermsBatch({
    now: () => t, offline: () => offline,
    myProjects: async () => { calls.projects++; return ids; },
    fetchAll: async (list) => { calls.all++; assert.deepEqual(list, ids); return rows; }
  });
  return { b, calls, tick: (ms: number) => { t += ms; }, goOffline: () => { offline = true; } };
}

test('права всех объектов — один вызов, объекты подряд берут из ответа', async () => {
  const f = fake([{ project_id: 'p1', actions: ['planfact.fact.view'] }, { project_id: 'p2', actions: ['planfact.fact.view', 'planfact.vor.manage'] }]);
  assert.deepEqual(await f.b.get('p1'), ['planfact.fact.view']);
  assert.deepEqual(await f.b.get('p2'), ['planfact.fact.view', 'planfact.vor.manage']);
  assert.deepEqual(await f.b.get('p3'), [], 'объект без модуля План/Факта сервер не вернул — прав нет (как «{}»)');
  assert.equal(f.calls.all, 1);
  assert.equal(await f.b.get('чужой'), null, 'объекта нет в моём списке — прежний вызов по объекту');
});

test('одновременные запросы — один вызов; через 30 с и после сброса — заново', async () => {
  const f = fake([{ project_id: 'p1', actions: ['a'] }]);
  await Promise.all([f.b.get('p1'), f.b.get('p2'), f.b.get('p3')]);
  assert.equal(f.calls.all, 1);
  f.tick(PERMS_TTL_MS - 1); await f.b.get('p1'); assert.equal(f.calls.all, 1);
  f.tick(2); await f.b.get('p1'); assert.equal(f.calls.all, 2);
  f.b.reset(); await f.b.get('p1'); assert.equal(f.calls.all, 3, 'смена прав / компании — сброс');
});

test('сервер без функции (до 059) или ошибка — null (прежний вызов), не повторяет 30 с', async () => {
  const f = fake(null);
  assert.equal(await f.b.get('p1'), null);
  assert.equal(await f.b.get('p2'), null);
  assert.equal(f.calls.all, 1);
});

test('без сети — null сразу (права объекта — из копии прежним вызовом), сервер не спрашивается', async () => {
  const f = fake([{ project_id: 'p1', actions: ['a'] }]);
  f.goOffline();
  assert.equal(await f.b.get('p1'), null);
  assert.equal(f.calls.all + f.calls.projects, 0);
});

test('нет моих объектов — без вызова', async () => {
  const f = fake([], []);
  assert.equal(await f.b.get('p1'), null);
  assert.equal(f.calls.all, 0);
});
