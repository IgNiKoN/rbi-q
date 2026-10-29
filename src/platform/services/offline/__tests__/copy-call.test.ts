/// <reference types="node" />
/** P2-0060 этап 3: службы модулей через copyCall — чтения из списка через копию, запись без сети не отправляется; объект чтения
 *  (для удаления копии без доступа) по прежним ответам; «держать без сети» и «пора заранее»; заранее «мои проекты» (prefetchPlanfact). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyCall, keepOffline, lastPrefetch, markPrefetched, offlineReader, placePath, prefetchDue, projectOf, setKeepOffline } from '../copy.ts';
import { NEED_INTERNET_INPUT } from '../offline-read.ts';
import { prefetchPlanfact } from '../../../../modules/planfact/prefetch.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const st: N = { mode: 'email', email: 'pr@alfa.test', companyId: 'c-1', offline: false };
const mem = new Map<string, string>();
const g = globalThis as N;
g.window = { RBI: { platform2: { getState: () => st }, moduleLoader: { getById: (id: string) => (id === 'planfact' ? { offline: { view: true, input: [] } } : null) } } };
g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); }, removeItem: (k: string) => { mem.delete(k); } };
const READS = new Set(['pf_fact_positions', 'pf_vor_list_imports', 'pf_fact_history']);

test('чтение из списка — через копию; без сети — копия; запись без сети не отправляется («Нужен интернет»), с сетью — как раньше', async () => {
  st.offline = false;
  let sent = 0;
  const r1 = await copyCall('planfact', READS, 'pf_fact_positions', { p_project: 'p-1', p_location: null }, async () => { sent++; return { ok: true, value: [{ position_id: 'pos-1' }] }; });
  assert.ok(r1.ok);
  st.offline = true;
  const r2 = await copyCall('planfact', READS, 'pf_fact_positions', { p_location: null, p_project: 'p-1' }, async () => { sent++; return { ok: true, value: [] }; });
  assert.deepEqual(r2.ok && r2.value, [{ position_id: 'pos-1' }], 'тот же ключ при другом порядке аргументов');
  const w = await copyCall('planfact', READS, 'pf_fact_add', { p_position: 'pos-1' }, async () => { sent++; return { ok: true, value: null }; });
  assert.deepEqual(w, { ok: false, message: NEED_INTERNET_INPUT });
  assert.equal(sent, 1, 'без сети ни чтение, ни запись на сервер не ушли');
  st.offline = false;
  assert.ok((await copyCall('planfact', READS, 'pf_fact_add', {}, async () => { sent++; return { ok: true, value: null }; })).ok);
  assert.equal(sent, 2);
});

test('объект чтения: p_project или ранее увиденная запись объекта — копию истории позиции удалит потеря доступа к объекту', async () => {
  st.offline = false;
  await copyCall('planfact', READS, 'pf_fact_positions', { p_project: 'p-2' }, async () => ({ ok: true, value: [{ position_id: 'pos-9' }] }));
  assert.equal(projectOf({ p_position: 'pos-9' }), 'p-2');
  await copyCall('planfact', READS, 'pf_fact_history', { p_position: 'pos-9' }, async () => ({ ok: true, value: [{ id: 'e-1' }] }));
  assert.ok(await offlineReader().size('planfact', 'p-2') > 0);
  await offlineReader().pruneProjects('planfact', ['p-1']);
  assert.equal(await offlineReader().size('planfact', 'p-2'), 0, 'доступа к p-2 нет — его копии (и история позиции) удалены');
});

test('«держать без сети»: по умолчанию у модуля с view — да; выбор человека — у «компания + пользователь»; «пора заранее» — раз в сутки', () => {
  st.offline = false;
  assert.equal(keepOffline('planfact'), true);
  assert.equal(keepOffline('nooffline'), false, 'модуль без поля offline — не держим');
  const now = Date.parse('2026-10-29T12:00:00Z');
  assert.equal(prefetchDue('planfact', now), true);
  markPrefetched('planfact', { reads: 3 }, now);
  assert.equal(prefetchDue('planfact', now + 3600e3), false, 'через час — рано');
  assert.equal(prefetchDue('planfact', now + 25 * 3600e3), true, 'через сутки — пора');
  assert.deepEqual(lastPrefetch('planfact')!.stats, { reads: 3 });
  st.checking = true;
  assert.equal(prefetchDue('planfact', now + 25 * 3600e3), false, 'сервер ещё не подтвердил вход — не качаем');
  st.checking = false;
  setKeepOffline('planfact', false);
  assert.equal(prefetchDue('planfact', now + 25 * 3600e3), false, 'выключил — заранее не качается');
  st.companyId = 'c-2';
  assert.equal(keepOffline('planfact'), true, 'в другой компании выбор свой');
  st.companyId = 'c-1';
  setKeepOffline('planfact', true);
});

test('заранее «мои проекты» (почти всё): Сводка, Входящие, ВОР со строками, Факт с журналом, шахматка, КС-2 и сметы — по праву; без сети — ничего', async () => {
  st.offline = false;
  const calls: string[] = [];
  const r = <T>(name: string, v: T) => async (..._a: unknown[]) => { calls.push(name); return v; };
  const res = <T>(name: string, v: T) => async (..._a: unknown[]) => { calls.push(name); return { ok: true as const, value: v }; };
  const deps: N = {
    summary: { portfolio: res('portfolio', []), inbox: res('inbox', []), weekly: res('weekly', []), places: res('places', []), workTypes: res('worktypes', []), positions: res('spositions', []),
      ks2Gap: res('ks2gap', []), attention: res('attention', null) },
    vor: { listProjects: r('projects', [{ id: 'p-1', company_id: 'c-1' }, { id: 'p-2', company_id: 'c-1' }]),
      permissions: async (p: string) => { calls.push('perms:' + p); return p === 'p-1' ? ['planfact.fact.view', 'planfact.ks2.view'] : ['planfact.vor.manage', 'planfact.estimate.manage']; },
      listImports: r('imports', []), listProfiles: r('profiles', []), positions: r('vpositions', [{ import_id: 'imp-1' }, { import_id: 'imp-1' }]), importRows: r('importrows', []) },
    fact: { pending: res('pending', []), positions: res('fpositions', []), listBrigades: r('brigades', []),
      journal: async (_p: string, from: string, to: string) => { calls.push('journal:' + from + '..' + to); return { ok: true, value: [] }; } },
    ks2: { settings: res('ks2settings', null), acts: res('ks2acts', []) },
    estimate: { listEstimates: r('estimates', []) },
    today: '2026-10-29',
    projects: { listLocations: async (_p: string, parent: string | null) => { calls.push('loc:' + (parent || '')); return parent ? [] : [{ id: 'b-1', child_count: 0 }]; } }
  };
  const stats = await prefetchPlanfact(deps);
  assert.equal(stats.projects, 2);
  assert.ok(calls.includes('weekly') && calls.includes('fpositions') && calls.includes('loc:'), 'объект с fact.view: Сводка, Факт, шахматка');
  assert.equal(calls.filter((c) => c === 'weekly').length, 1, 'Сводка — только по объекту с fact.view');
  assert.equal(calls.filter((c) => c === 'imports').length, 2, 'ВОР — по обоим');
  assert.equal(calls.filter((c) => c === 'brigades').length, 1, 'бригады — раз на компанию');
  assert.equal(calls.filter((c) => c === 'importrows').length, 2, 'строки загрузки — по разу на загрузку в каждом объекте');
  assert.ok(calls.includes('inbox') && calls.includes('journal:2026-09-30..2026-10-29'), 'Входящие и журнал 30 дней — тем же ключом, что экран');
  assert.deepEqual([calls.includes('ks2acts'), calls.includes('estimates')], [true, true], 'КС-2 и сметы — по праву');
  assert.equal(calls.filter((c) => c === 'ks2acts').length, 1, 'КС-2 — только где есть право');
  assert.equal(stats.reads, calls.length);
  st.offline = true;
  assert.equal((await prefetchPlanfact(deps)).stopped, 'нет связи');
  st.offline = false;
});

test('чтения нет в копии, а экран собирает его из других копий (позиции места — из всех позиций проекта): ответ без «Нужен интернет»', async () => {
  st.offline = false;
  const LOC = new Set(['pf_list_locations', 'pf_fact_positions']);
  await copyCall('company', LOC, 'pf_list_locations', { p_project: 'p-1', p_parent: 's-1' }, async () => ({ ok: true, value: [{ id: 'f-2', node_type: 'floor', path: 'К1 · С1 · Этаж 2' }] }));
  assert.equal(placePath('f-2'), 'К1 · С1 · Этаж 2');
  st.offline = true;
  const r = await copyCall('planfact', LOC, 'pf_fact_positions', { p_project: 'p-1', p_location: 'f-2' }, async () => ({ ok: true, value: [] }), undefined,
    async () => ({ ok: true, value: ['из всех позиций'] }));
  assert.deepEqual(r.ok && r.value, ['из всех позиций']);
  assert.equal(offlineReader().status('planfact')?.missed || 0, 0, 'не пропуск — пометка «Нужен интернет» не зажигается');
  const none = await copyCall('planfact', LOC, 'pf_fact_positions', { p_project: 'p-1', p_location: 'f-9' }, async () => ({ ok: true, value: [] }), undefined, async () => null);
  assert.equal(none.ok, false, 'собрать не из чего — «Нужен интернет»');
  st.offline = false;
});

test('охват фото сейчас: роль экрана Качества → правило; выбор человека важнее; «держать без сети» выключено — не качать', async () => {
  const { currentFilesScope, exposeOfflineFiles, setFilesChoice } = await import('../copy.ts');
  st.offline = false;
  g.window.RBI.moduleLoader.getById = (id: string) => (id === 'planfact' || id === 'quality' ? { offline: { view: true, input: [] } } : null);
  g.window.RBI.qualitySync = { role: 'engineer' };
  assert.equal(currentFilesScope(), 'mine30');
  g.window.RBI.qualitySync = { role: 'manager' };
  assert.equal(currentFilesScope(), 'none');
  setFilesChoice('quality', 'all30');
  assert.equal(currentFilesScope(), 'all30', 'руководитель сам выбрал «Все за 30 дней»');
  setKeepOffline('quality', false);
  assert.equal(currentFilesScope(), 'none', 'Качество не держать без сети — фото заранее не качаются');
  setKeepOffline('quality', true); setFilesChoice('quality', null);
  exposeOfflineFiles();   // в браузере — при загрузке модуля
  assert.equal(typeof g.window.RBI.offlineFiles.scope, 'function', 'движку синхронизации — window.RBI.offlineFiles');
});
