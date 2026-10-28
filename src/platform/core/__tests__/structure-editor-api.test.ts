/// <reference types="node" />
/** P2-0055, этап 1: вызовы сервера редактора структуры — перенос, восстановление, копия в выбранное место; прежняя копия — те же аргументы. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectsService } from '../projects.service.ts';

type Call = { fn: string; args: Record<string, unknown> };
const calls: Call[] = [];
let reply: { data: unknown; error: { message: string; code?: string } | null } = { data: null, error: null };
(globalThis as Record<string, unknown>).__platform2SupabaseClient = {
  rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return reply; }
};
const api = createProjectsService()!;

test('copyPlace без места вставки — прежний вызов (3 аргумента, без p_target_parent)', async () => {
  calls.length = 0; reply = { data: 'n1', error: null };
  const r = await api.copyPlace!('s1', 'n1', 'Секция 3');
  assert.deepEqual(calls, [{ fn: 'pf_copy_place', args: { p_source: 's1', p_new_id: 'n1', p_name: 'Секция 3' } }]);
  assert.deepEqual(r, { ok: true, value: 'n1' });
});

test('copyPlace в другой корпус — p_target_parent', async () => {
  calls.length = 0; reply = { data: 'n2', error: null };
  await api.copyPlace!('s1', 'n2', 'Секция 2', 'k2');
  assert.deepEqual(calls[0].args, { p_source: 's1', p_new_id: 'n2', p_name: 'Секция 2', p_target_parent: 'k2' });
});

test('movePlace — аргументы и прежнее положение для «Отменить»', async () => {
  calls.length = 0; reply = { data: { changed: true, old_parent: 'f1', old_before: 'a2' }, error: null };
  const r = await api.movePlace!('a1', 'f2', 'a3');
  assert.deepEqual(calls[0], { fn: 'pf_move_place', args: { p_location: 'a1', p_new_parent: 'f2', p_before: 'a3' } });
  assert.deepEqual(r, { ok: true, value: { changed: true, oldParentId: 'f1', oldBeforeId: 'a2' } });
  reply = { data: { changed: false, old_parent: null, old_before: null }, error: null };
  assert.deepEqual(await api.movePlace!('k3', null, null), { ok: true, value: { changed: false, oldParentId: null, oldBeforeId: null } });
});

test('movePlace — отказ сервера показывается его текстом', async () => {
  reply = { data: null, error: { message: 'Переносить можно только внутри объекта; в другой объект — копировать и вставить', code: '22023' } };
  const r = await api.movePlace!('a1', 'x', null);
  assert.deepEqual(r, { ok: false, message: 'Переносить можно только внутри объекта; в другой объект — копировать и вставить' });
  reply = { data: null, error: { message: 'permission denied for function pf_move_place', code: '42501' } };
  assert.deepEqual(await api.movePlace!('a1', 'x', null), { ok: false, message: 'Нет права на это действие' });
});

test('restorePlace — pf_restore_place и число вернувшихся мест', async () => {
  calls.length = 0; reply = { data: 2, error: null };
  assert.deepEqual(await api.restorePlace!('f1'), { ok: true, value: 2 });
  assert.deepEqual(calls[0], { fn: 'pf_restore_place', args: { p_location: 'f1' } });
});
