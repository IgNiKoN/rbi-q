/// <reference types="node" />
/** P2-0057, этап 1: планы мест — файл в закрытый бакет ядра, затем версия на сервере; проверки файла; ответы RPC. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectsService, planChange } from '../projects.service.ts';
import { checkPlanFile, placePlanPath, PLAN_MAX_BYTES } from '../../services/files/core-files.ts';

type Call = { fn: string; args: Record<string, unknown> };
const calls: Call[] = [];
const uploads: { bucket: string; path: string; opts: unknown }[] = [];
let reply: { data: unknown; error: { message: string; code?: string } | null } = { data: null, error: null };
let uploadError: { message: string } | null = null;
(globalThis as Record<string, unknown>).__platform2SupabaseClient = {
  rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return reply; },
  storage: {
    from: (bucket: string) => ({
      upload: async (path: string, _f: unknown, opts: unknown) => { uploads.push({ bucket, path, opts }); return { error: uploadError }; },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://api.test/storage/v1/object/public/${bucket}/${path}` } })
    })
  }
};
const api = createProjectsService()!;
const pdf = (name: string, size = 1000, type = 'application/pdf') => ({ name, size, type }) as unknown as File;
const T = { id: 'L1', projectId: 'P1', companyId: 'C1' };

test('checkPlanFile: PDF по типу или имени; пустой, больше 50 МБ, не PDF — понятный отказ', () => {
  assert.deepEqual(checkPlanFile({ name: 'Этаж 3.pdf', type: '', size: 10 }), { ok: true });
  assert.deepEqual(checkPlanFile({ name: 'scan', type: 'application/pdf', size: 10 }), { ok: true });
  assert.match((checkPlanFile({ name: 'план.dwg', type: '', size: 10 }) as { message: string }).message, /не PDF/);
  assert.match((checkPlanFile({ name: 'a.pdf', type: 'application/pdf', size: 0 }) as { message: string }).message, /пустой/);
  assert.match((checkPlanFile({ name: 'a.pdf', type: 'application/pdf', size: PLAN_MAX_BYTES + 1 }) as { message: string }).message, /50 МБ/);
  assert.equal(placePlanPath('C', 'P', 'L', 'D'), 'C/P/L/D.pdf');
});

test('uploadPlacePlan: файл → core-place-plans/<компания>/<проект>/<место>/<id>.pdf без перезаписи → pf_add_place_plan', async () => {
  calls.length = 0; uploads.length = 0; uploadError = null;
  reply = { data: { id: 'D1', version_no: 2, previous: 'D0', repeat: false }, error: null };
  const r = await api.uploadPlacePlan!(T, pdf('Этаж 1.pdf', 1234), 'D1');
  assert.deepEqual(uploads, [{ bucket: 'core-place-plans', path: 'C1/P1/L1/D1.pdf', opts: { upsert: false, contentType: 'application/pdf' } }]);
  assert.deepEqual(calls, [{ fn: 'pf_add_place_plan', args: { p_location: 'L1', p_id: 'D1',
    p_url: 'https://api.test/storage/v1/object/public/core-place-plans/C1/P1/L1/D1.pdf', p_name: 'Этаж 1.pdf', p_size: 1234 } }]);
  assert.deepEqual(r, { ok: true, value: { id: 'D1', versionNo: 2, previousId: 'D0' } });
});

test('uploadPlacePlan: не PDF — ни файла, ни вызова; отказ Storage — понятно; файл уже есть (повтор) — версия записывается', async () => {
  calls.length = 0; uploads.length = 0;
  const bad = await api.uploadPlacePlan!(T, pdf('план.png', 10, 'image/png'));
  assert.equal(bad.ok, false);
  assert.equal(uploads.length + calls.length, 0);
  uploadError = { message: 'new row violates row-level security policy' };
  const denied = await api.uploadPlacePlan!(T, pdf('a.pdf'));
  assert.deepEqual(denied, { ok: false, message: 'Нет права загружать планы этого проекта' });
  assert.equal(calls.length, 0);
  uploadError = { message: 'The resource already exists' };
  reply = { data: { id: 'D2', version_no: 1, previous: null, repeat: true }, error: null };
  const again = await api.uploadPlacePlan!(T, pdf('a.pdf'), 'D2');
  assert.deepEqual(again, { ok: true, value: { id: 'D2', versionNo: 1, previousId: null } });
  uploadError = null;
});

test('uploadPlacePlan: отказ сервера — его текстом', async () => {
  reply = { data: null, error: { message: 'Ссылка не на файл плана этого места', code: '22023' } };
  assert.deepEqual(await api.uploadPlacePlan!(T, pdf('a.pdf'), 'D3'), { ok: false, message: 'Ссылка не на файл плана этого места' });
});

test('placePlans / setPlacePlan / removePlacePlan / placePins — аргументы и ответы', async () => {
  calls.length = 0;
  reply = { data: [{ id: 'D1', location_id: 'L1', version_no: 1, is_current: true }], error: null };
  const list = await api.placePlans!('P1');
  assert.ok(list.ok && list.value.length === 1);
  reply = { data: { id: 'D1', version_no: 1, previous: 'D2' }, error: null };
  assert.deepEqual(await api.setPlacePlan!('D1'), { ok: true, value: { id: 'D1', versionNo: 1, previousId: 'D2' } });
  reply = { data: { previous: 'D1' }, error: null };
  assert.deepEqual(await api.removePlacePlan!('L1'), { ok: true, value: { id: null, versionNo: null, previousId: 'D1' } });
  reply = { data: 3, error: null };
  assert.equal(await api.placePins!('L1'), 3);
  reply = { data: null, error: { message: 'Нет доступа к проекту' } };
  assert.equal(await api.placePins!('L1'), 0);
  assert.deepEqual(calls.map((c) => [c.fn, c.args]), [
    ['pf_place_plans', { p_project: 'P1' }], ['pf_set_place_plan', { p_id: 'D1' }], ['pf_remove_place_plan', { p_location: 'L1' }],
    ['pf_place_pins', { p_location: 'L1' }], ['pf_place_pins', { p_location: 'L1' }]]);
  assert.deepEqual(planChange(null), { id: null, versionNo: null, previousId: null });
});
