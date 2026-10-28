/// <reference types="node" />
/** P2-0056, этап 1: вызовы сервера загрузки списка помещений, отмены загрузки, площади и комнат. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectsService, importResult, type ImportRow } from '../projects.service.ts';

type Call = { fn: string; args: Record<string, unknown> };
const calls: Call[] = [];
let reply: { data: unknown; error: { message: string; code?: string } | null } = { data: null, error: null };
(globalThis as Record<string, unknown>).__platform2SupabaseClient = {
  rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return reply; }
};
const api = createProjectsService()!;
const row: ImportRow = { row_no: 2, object: 'Корпус 1', section: 'Секция 1', floor: 'эт. 3', name: 'кв. 45',
  build_no: '45', bti_no: null, area: '54,3', rooms: '2' };

test('importPlaces — аргументы (предпросмотр) и разбор ответа', async () => {
  calls.length = 0;
  reply = { data: { ok: true, dry_run: true, created: { objects: 0, sections: 1, floors: 12, apartments: 96 }, existing_rows: [1, 3],
    differs: [{ row_no: 4, name: 'кв. 4', fields: [{ field: 'area', now: null, file: 40.5 }] }], errors: [], roots: [] }, error: null };
  const r = await api.importPlaces!('p1', 'b1', [row], true);
  assert.deepEqual(calls, [{ fn: 'pf_import_places', args: { p_project: 'p1', p_batch: 'b1', p_rows: [row], p_dry_run: true } }]);
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.value, { ok: true, dryRun: true, repeat: false, created: { objects: 0, sections: 1, floors: 12, apartments: 96 },
    existingRows: [1, 3], differs: [{ row_no: 4, name: 'кв. 4', fields: [{ field: 'area', now: null, file: 40.5 }] }], errors: [], roots: [] });
});

test('importPlaces — отказ сервера показывается его текстом', async () => {
  reply = { data: null, error: { message: 'Слишком много строк (максимум 5000)', code: '22023' } };
  assert.deepEqual(await api.importPlaces!('p1', 'b1', [row], false), { ok: false, message: 'Слишком много строк (максимум 5000)' });
});

test('importResult — пустой и неполный ответ не ломает экран', () => {
  assert.deepEqual(importResult({}), { ok: false, dryRun: false, repeat: false, created: { objects: 0, sections: 0, floors: 0, apartments: 0 },
    existingRows: [], differs: [], errors: [], roots: [] });
  assert.equal(importResult({ repeat: true, ok: true }).repeat, true);
});

test('importUndo и savePlaceInfo — аргументы', async () => {
  calls.length = 0; reply = { data: 12, error: null };
  assert.deepEqual(await api.importUndo!('b1'), { ok: true, value: 12 });
  reply = { data: 'a1', error: null };
  await api.savePlaceInfo!('a1', 54.3, null);
  assert.deepEqual(calls, [{ fn: 'pf_import_undo', args: { p_batch: 'b1' } },
    { fn: 'pf_save_place_info', args: { p_location: 'a1', p_area: 54.3, p_rooms: null } }]);
});
