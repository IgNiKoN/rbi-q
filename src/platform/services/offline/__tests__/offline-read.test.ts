/// <reference types="node" />
/** P2-0060 этап 2: копия для просмотра — ключ «компания + пользователь», права (estimate), копия объекта без доступа удаляется,
 *  14 дней, «сервер не ответил» ≠ «сервер отказал», пометка «данные на …», вводы без сети. Стенд — tests/offline/view.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryCopyStore } from '../copy-store.ts';
import { copyMarkText, createOfflineReader, inputBlocked, isStale, NEED_INTERNET_TEXT, NO_CONNECTION_TEXT, offlineOf, SILENT_MS } from '../offline-read.ts';
import type { Result } from '../offline-read.ts';

const NOW = Date.parse('2026-10-29T11:32:00Z');
const DAY = 24 * 3600 * 1000;
function setup(slot: string | null = 'c1:u1') {
  const store = memoryCopyStore();
  const env = { slot, offline: false, now: NOW };
  const reader = createOfflineReader({ store, slot: () => env.slot, offline: () => env.offline, now: () => env.now, waitMs: 20 });
  return { store, env, reader };
}
const ok = <T>(value: T) => async (): Promise<Result<T>> => ({ ok: true, value });
const noNet = async (): Promise<Result<never>> => ({ ok: false, message: NO_CONNECTION_TEXT });

test('с сетью — ответ сервера и копия; без сети — та же копия с временем; копии нет — «Нужен интернет»', async () => {
  const { env, reader, store } = setup();
  const r1 = await reader.read('planfact', 'summary:portfolio', ok([{ id: 'p-1', pct: 42 }]));
  assert.ok(r1.ok && r1.meta && r1.meta.from === 'server');
  assert.equal(store.size(), 1);
  env.offline = true;
  let calls = 0;
  const r2 = await reader.read('planfact', 'summary:portfolio', async () => { calls++; return { ok: true, value: [] }; });
  assert.equal(calls, 0, 'без сети сервер не спрашиваем');
  assert.ok(r2.ok);
  assert.deepEqual(r2.ok && r2.value, [{ id: 'p-1', pct: 42 }]);
  assert.equal(r2.ok && r2.meta!.from, 'copy');
  assert.equal(r2.ok && r2.meta!.at, new Date(NOW).toISOString());
  const r3 = await reader.read('planfact', 'summary:weekly:p-1:8', ok([1]));
  assert.deepEqual(r3, { ok: false, message: NEED_INTERNET_TEXT, offline: true });
});

test('другой пользователь / другая компания на том же телефоне чужую копию не видят; не вошёл — копии нет', async () => {
  const { env, reader } = setup('c1:u1');
  await reader.read('planfact', 'summary:portfolio', ok(['цифры первого']));
  env.offline = true;
  env.slot = 'c1:u2';
  assert.equal((await reader.read('planfact', 'summary:portfolio', ok(['x']))).ok, false, 'другой пользователь — «Нужен интернет»');
  env.slot = 'c2:u1';
  assert.equal((await reader.read('planfact', 'summary:portfolio', ok(['x']))).ok, false, 'та же учётка в другой компании — тоже');
  env.slot = 'c1:u1';
  assert.ok((await reader.read('planfact', 'summary:portfolio', ok(['x']))).ok, 'свой вход — своя копия');
  env.slot = null; env.offline = false;
  const anon = setup(null);
  await anon.reader.read('planfact', 'summary:portfolio', ok(['демо']));
  assert.equal(anon.store.size(), 0, 'без входа копия не пишется');
});

test('права: без права (например, estimate — цены) в копию не кладётся, прежняя удаляется; без сети — «Нужен интернет»', async () => {
  const { env, reader, store } = setup();
  await reader.read('planfact', 'estimate:p-1', ok({ price: 100 }), { project: 'p-1', allowed: true });
  assert.equal(store.size(), 1);
  const r = await reader.read('planfact', 'estimate:p-1', ok({ price: 100 }), { project: 'p-1', allowed: false });
  assert.ok(r.ok, 'с сетью ответ сервера показывается (сервер сам решает, что отдать)');
  assert.equal(store.size(), 0, 'право отняли — копия цен удалена');
  env.offline = true;
  assert.equal((await reader.read('planfact', 'estimate:p-1', ok({}), { project: 'p-1', allowed: false })).ok, false);
});

test('с сетью выяснилось, что доступа к объекту больше нет, — копии этого объекта удаляются; общие и других модулей — нет', async () => {
  const { reader, store } = setup();
  await reader.read('planfact', 'summary:portfolio', ok([1]));
  await reader.read('planfact', 'summary:weekly:p-1:8', ok([1]), { project: 'p-1' });
  await reader.read('planfact', 'summary:weekly:p-2:8', ok([2]), { project: 'p-2' });
  await reader.read('company', 'places:p-2', ok([3]), { project: 'p-2' });
  assert.equal(await reader.pruneProjects('planfact', ['p-1']), 1);
  const left = (await store.list('c1:u1')).map((r) => r.key).sort();
  assert.deepEqual(left, ['places:p-2', 'summary:portfolio', 'summary:weekly:p-1:8']);
});

test('сервер не ответил (обрыв / молчит дольше ожидания) — копия; сервер отказал — его ответ, копия не подменяет', async () => {
  const { reader, env } = setup();
  await reader.read('planfact', 'k', ok('копия'));
  const cut = await reader.read('planfact', 'k', noNet);
  assert.ok(cut.ok && cut.value === 'копия' && cut.meta!.from === 'copy', 'обрыв связи');
  const silent = await reader.read('planfact', 'k', () => new Promise<Result<string>>(() => { /* молчит */ }));
  assert.ok(silent.ok && silent.meta!.from === 'copy', 'сервер молчит');
  env.now += SILENT_MS + 1;   // минута тишины прошла — снова спрашиваем сервер
  const thrown = await reader.read('planfact', 'k', async () => { throw new Error('Load failed'); });
  assert.ok(thrown.ok && thrown.meta!.from === 'copy', 'исключение запроса — тоже обрыв');
  const denied = await reader.read('planfact', 'k', async () => ({ ok: false, message: 'Нет права на это действие' }));
  assert.deepEqual(denied, { ok: false, message: 'Нет права на это действие' });
  const none = setup();
  assert.deepEqual(await none.reader.read('planfact', 'k', noNet), { ok: false, message: NEED_INTERNET_TEXT, offline: true });
});

test('пустой ответ с keepEmpty: false прежнюю копию не заменяет (сервисы отдают [] и при сбое); по умолчанию — заменяет', async () => {
  const { env, reader } = setup();
  await reader.read('planfact', 'access:companies', ok(['Альфа']), { keepEmpty: false });
  await reader.read('planfact', 'access:companies', ok([]), { keepEmpty: false });
  env.offline = true;
  const r = await reader.read('planfact', 'access:companies', ok([]), { keepEmpty: false });
  assert.deepEqual(r.ok && r.value, ['Альфа']);
  env.offline = false;
  await reader.read('planfact', 'summary:portfolio', ok([1]));
  await reader.read('planfact', 'summary:portfolio', ok([]));
  env.offline = true;
  const p = await reader.read('planfact', 'summary:portfolio', ok([9]));
  assert.deepEqual(p.ok && p.value, [], 'сервер сказал «пусто» — это ответ');
});

test('пометка: «данные на 14:32» сегодня, с датой — раньше; старше 14 дней — «данные могли устареть»; всё с сервера — нет пометки', async () => {
  const at = new Date(2026, 9, 29, 14, 32).getTime();
  assert.equal(copyMarkText({ at: new Date(at).toISOString(), stale: false, missed: 0 }, at + 3600e3), 'Без сети · данные на 14:32');
  assert.equal(copyMarkText({ at: new Date(at).toISOString(), stale: false, missed: 0 }, at + 2 * DAY), 'Без сети · данные на 14:32, 29.10');
  assert.equal(isStale(new Date(NOW - 15 * DAY).toISOString(), NOW), true);
  assert.equal(isStale(new Date(NOW - 13 * DAY).toISOString(), NOW), false);
  const { env, reader } = setup();
  let seen = 0;
  reader.subscribe(() => { seen++; });
  env.now = NOW - 15 * DAY;
  await reader.read('planfact', 'a', ok(1));
  env.now = NOW;
  await reader.read('planfact', 'b', ok(2));
  assert.equal(reader.status('planfact'), null, 'всё с сервера — без пометки');
  env.offline = true;
  await reader.read('planfact', 'a', ok(0));
  await reader.read('planfact', 'b', ok(0));
  const st = reader.status('planfact')!;
  assert.equal(st.at, new Date(NOW - 15 * DAY).toISOString(), 'показано время самой старой из показанных копий');
  assert.equal(st.stale, true);
  assert.ok(copyMarkText(st, NOW).endsWith('· данные могли устареть'));
  assert.ok(seen >= 1, 'пометка узнаёт об изменении');
  env.offline = false;
  await reader.read('planfact', 'a', ok(1));
  await reader.read('planfact', 'b', ok(2));
  assert.equal(reader.status('planfact'), null, 'связь вернулась — пометка снята');
});

test('размер копии модуля и «Очистить скачанное» — только этот человек и этот модуль', async () => {
  const { env, reader, store } = setup();
  await reader.read('planfact', 'a', ok('x'.repeat(98)));
  await reader.read('company', 'b', ok([1, 2]));
  assert.equal(await reader.size('planfact'), 100);
  env.slot = 'c1:u2';
  await reader.read('planfact', 'a', ok('чужое'));
  assert.equal(await reader.size('planfact'), JSON.stringify('чужое').length);
  env.slot = 'c1:u1';
  assert.equal(await reader.clear('planfact'), 1);
  assert.equal(store.size(), 2, 'копия «Компании» и копия другого пользователя целы');
});

test('манифест: поле offline; без поля — «Только онлайн»; ввод без сети — только объявленный', () => {
  assert.equal(offlineOf({}), null);
  assert.deepEqual(offlineOf({ offline: { view: true, input: [], files: false } }), { view: true, input: [], files: false });
  const pf = offlineOf({ offline: { view: true, input: [] } });
  assert.equal(inputBlocked(pf, 'dates', true), true, 'План/Факт: вводы без сети не объявлены');
  assert.equal(inputBlocked(pf, 'dates', false), false, 'с сетью — можно');
  assert.equal(inputBlocked(offlineOf({ offline: { view: true, input: ['*'] } }), 'inspection', true), false, 'Качество — свой движок');
  assert.equal(inputBlocked(null, 'x', true), true, 'модуль без поля — только онлайн');
});

test('служебные чтения (права, доступ) пометку «данные на …» не зажигают', async () => {
  const { env, reader } = setup();
  await reader.read('planfact', 'access:companies', ok(['Альфа']), { quiet: true });
  env.offline = true;
  const r = await reader.read('planfact', 'access:companies', ok([]), { quiet: true });
  assert.ok(r.ok && r.meta!.from === 'copy');
  assert.equal(reader.status('planfact'), null);
});

test('сервер отказал по правам («Нет права…») — копия этого чтения удаляется; другая ошибка сервера — копия остаётся', async () => {
  const { env, reader, store } = setup();
  await reader.read('planfact', 'pf_price_list:{}', ok([{ price: 100 }]));
  await reader.read('planfact', 'pf_price_list:{}', async () => ({ ok: false, message: 'Не удалось выполнить. Попробуйте ещё раз' }));
  assert.equal(store.size(), 1, 'сбой сервера — копия цела');
  await reader.read('planfact', 'pf_price_list:{}', async () => ({ ok: false, message: 'Нет права на это действие' }));
  assert.equal(store.size(), 0, 'право отняли — цен на телефоне нет');
  env.offline = true;
  assert.equal((await reader.read('planfact', 'pf_price_list:{}', ok([]))).ok, false);
});

test('без сети экрана нет в копии — пометка «Нужен интернет для этого экрана»; часть есть — «часть данных не скачана»; новый экран — заново', async () => {
  const { env, reader } = setup();
  await reader.read('company', 'pf_list_company_roles', ok([1]));
  env.offline = true;
  await reader.read('company', 'pf_list_company_members', ok([]));
  let st = reader.status('company')!;
  assert.equal(st.at, null);
  assert.equal(st.missed, 1);
  assert.equal(copyMarkText(st, NOW), 'Без сети · Нужен интернет для этого экрана — его ещё не открывали с интернетом');
  await reader.read('company', 'pf_list_company_roles', ok([]));
  st = reader.status('company')!;
  assert.ok(copyMarkText(st, NOW).startsWith('Без сети · Нужен интернет для части экрана · данные на '));
  reader.resetMissed('company');
  assert.equal(reader.status('company')!.missed, 0);
  await reader.read('company', 'x', ok(1), { quiet: true });
  assert.equal(reader.status('company')!.missed, 0, 'служебные чтения пропуском не считаются');
});

test('сервер промолчал дольше ожидания — минуту новые чтения сразу из копии (не держим соединения); ответил — снова спрашиваем', async () => {
  const { env, reader } = setup();
  await reader.read('planfact', 'summary:portfolio', ok(['было']));
  const hang = (): Promise<Result<string[]>> => new Promise(() => {});
  const r1 = await reader.read('planfact', 'summary:portfolio', hang);
  assert.equal(r1.ok && r1.meta!.from, 'copy');
  assert.equal(reader.serverSilent(), true);
  let calls = 0;
  const r2 = await reader.read('planfact', 'summary:portfolio', async () => { calls++; return { ok: true, value: ['новое'] }; });
  assert.equal(calls, 0, 'пока сервер молчит — к нему не идём');
  assert.equal(r2.ok && r2.meta!.from, 'copy');
  env.now = NOW + SILENT_MS + 1;
  assert.equal(reader.serverSilent(), false);
  const r3 = await reader.read('planfact', 'summary:portfolio', async () => { calls++; return { ok: true, value: ['новое'] }; });
  assert.equal(calls, 1);
  assert.deepEqual(r3.ok && r3.value, ['новое']);
});
