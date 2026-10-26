/// <reference types="node" />
/** Экран «Сводка» (P2-0008; P2-0010 — дашборд руководителя) на подставном сервере: плитки, отставание в днях и светофор ТЗ 8.2, графики,
 *  места, таблица объектов по отставанию, ₽ только при праве (сервер присылает null — экран не показывает рублёвых показателей),
 *  даты проекта (проверка «начало ≤ окончания», сохранение, обновление). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { settle } from '../../../test-utils/settle.ts';
import type { SummaryProject } from '../summary/summary.service.ts';
import { ATTENTION, GAP, makeFakeSummary, PLACES, POSITIONS, PTO_PROJECT } from './summary-fake.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { createElement } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { SummaryTab } = await import('../summary/SummaryTab.ts');
const tick = (): Promise<void> => settle();
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

function mount(api: N): N {
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  flushSync(() => createRoot(el as unknown as HTMLElement).render(createElement(SummaryTab, { api } as N)));
  return el;
}
function typeIn(input: N, value: string): void {
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
}
const submit = (f: N) => f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
const metric = (t: N) => String(t?.querySelector('[data-testid="p2-kpi-value"]')?.textContent || '').replace(/\s/g, ' ').replace(/ ₽$/, '');

const tile = (el: N, id: string) => el.querySelector(`[data-metric="${id}"]`);

test('ПТО, один объект: дашборд сразу — плитки, отставание в днях и светофор по ТЗ 8.2, графики, места, крупнейшие не начатые', async () => {
  const f = makeFakeSummary([PTO_PROJECT]);
  const el = mount(f.api);
  await tick();
  const d = el.querySelector('[data-testid="sm-dashboard"]');
  assert.ok(d, 'один объект — дашборд открыт сразу');
  assert.equal(el.querySelector('[data-testid="sm-back"]'), null, 'кнопки «Все объекты» нет');
  assert.equal(el.querySelector('[data-testid="sm-objects"]'), null, 'таблицы объектов из одного нет');
  assert.equal(metric(tile(d, 'plan')), '53 тыс.');
  assert.match(tile(d, 'plan').textContent, /53\s250,00 ₽ · 3 позиций/);
  assert.equal(el.querySelector('[data-testid="sm-pct"]').textContent, '14,5 % готовности · по плану сегодня 20 %');
  assert.equal(tile(d, 'done').querySelector('[data-testid="p2-progress-marker"]').getAttribute('style'), 'left: 20%;');
  assert.equal(metric(tile(d, 'lag')), '8 дн.');
  assert.match(tile(d, 'lag').textContent, /5,5 п\.п\. от плана на сегодня/);
  assert.ok(tile(d, 'lag').className.includes('p2-kpi--yellow'));
  assert.equal(d.querySelector('[data-testid="sm-light"]').textContent, 'Риск');
  assert.match(d.querySelector('[data-testid="sm-why"]').textContent, /5,5 п\.п\. — между порогами 3 и 10 п\.п\./);
  assert.equal(metric(tile(d, 'forecast')), '03.02.2027');
  assert.equal(metric(tile(d, 'gap')), '300');
  assert.ok(f.calls.some((c) => c.startsWith('weekly:pr1:')), 'недели запрошены');
  assert.ok(f.calls.includes('places:pr1:null'));
  const pf = d.querySelector('[data-testid="sm-chart-pf"]');
  assert.equal(pf.querySelectorAll('polyline').length, 2, 'план и факт');
  assert.match(pf.textContent, /равномерно от 21\.09\.2026 до 18\.02\.2027 \(графика работ ещё нет/);
  const wk = d.querySelector('[data-testid="sm-chart-weeks"]');
  assert.equal(wk.querySelectorAll('path[data-bar]').length, 3);
  assert.match(wk.querySelector('[data-testid="p2-bars-reference"]').textContent, /нужно 2\s656 в неделю/);
  assert.match(wk.querySelector('[data-testid="sm-verdict"]').textContent, /^Ускоряемся · за 7 дней 691,07 ₽\/дн\., за 14 дней 433,93 ₽\/дн\., нужно 379,38 ₽\/дн\./);
  wk.querySelector('[data-testid="p2-chart-toggle"]').click(); await tick();
  assert.match(wk.querySelector('[data-testid="p2-chart-table"]').textContent, /14\.10\.2026 — 20\.10\.2026.*4\s837,50.*3 м², 3 шт\./);
  const pl = d.querySelector('[data-location-id="b1"]');
  assert.match(pl.textContent, /Корпус 1.*14,5 %/);
  const ns = d.querySelector('[data-testid="sm-not-started"]');
  assert.match(ns.textContent, /Все виды работ начаты|Грунтовка/);
});

test('недели для графика: от плановой даты начала до сегодня, не меньше периода, не больше 52', async () => {
  const { weeksFor } = await import('../summary/Dashboard.ts');
  assert.equal(weeksFor({ planned_start: '2026-09-01' }, '2026-10-22', 8), 8);
  assert.equal(weeksFor({ planned_start: '2026-06-01' }, '2026-10-22', 8), 21);
  assert.equal(weeksFor({ planned_start: '2024-01-01' }, '2026-10-22', 4), 52);
  assert.equal(weeksFor({ planned_start: null }, '2026-10-22', 12), 12);
});

test('прораб: ₽, % и отставание не приходят — рублёвых плиток и графиков нет; светофор, план на сегодня, сроки, объёмы недель есть', async () => {
  const fore: SummaryProject = { ...PTO_PROJECT, can_money: false, can_manage: false, can_thresholds: false, plan_money: null, done_money: null, issued_money: null,
    gap_money: null, pct_money: null, pace7: null, pace14: null, need_pace: null, forecast_finish: null, lag_pp: null, lag_days: null };
  const el = mount(makeFakeSummary([fore], { places: { root: PLACES.map((x) => ({ ...x, plan_money: null, done_money: null, pct_money: null })) },
    attention: { ...ATTENTION, counts: { ...ATTENTION.counts, gap_money: null }, gap: ATTENTION.gap.map((g) => ({ ...g, money: null })) } }).api);
  await tick();
  const d = el.querySelector('[data-testid="sm-dashboard"]');
  for (const id of ['plan', 'done', 'issued', 'gap', 'lag', 'forecast']) assert.equal(tile(d, id), null, id);
  assert.equal(el.querySelector('[data-testid="sm-pct"]'), null);
  assert.equal(d.querySelector('[data-testid="sm-chart-pf"]'), null);
  assert.equal(d.querySelector('[data-testid="sm-chart-weeks"]'), null);
  assert.ok(!/₽/.test(d.textContent), 'на дашборде прораба нет рублей');
  assert.equal(d.querySelector('[data-testid="sm-light"]').textContent, 'Риск');
  assert.match(d.querySelector('[data-testid="sm-why"]').textContent, /между порогами 3 и 10/);
  assert.equal(metric(tile(d, 'plan-today')), '20 %');
  assert.equal(metric(tile(d, 'dates')), '21.09.2026 — 18.02.2027');
  assert.equal(metric(tile(d, 'verdict')), 'Ускоряемся');
  assert.match(d.querySelector('[data-testid="sm-weeks-volume"]').textContent, /3 м², 3 шт\./);
  assert.match(d.querySelector('[data-location-id="b1"]').textContent, /10 из 150 м² · 3 из 10 шт\./);
  assert.ok(el.querySelector('[data-testid="sm-nomoney"]'));
  assert.equal(el.querySelector('[data-testid="sm-dates-btn"]'), null, 'прораб не правит даты');
});

test('серый светофор: без договорной КП — причина и подсказка, куда идти', async () => {
  const el = mount(makeFakeSummary([{ ...PTO_PROJECT, light: 'grey', light_reason: 'no_kp', has_kp: false, pct_money: null, plan_money: null, done_money: null,
    lag_pp: null, lag_days: null, pace_verdict: null }]).api);
  await tick();
  assert.equal(el.querySelector('[data-testid="sm-light"]').textContent, 'Нет данных');
  assert.match(el.querySelector('[data-testid="sm-why"]').textContent, /Нет договорной КП.*КС-2/);
  assert.equal(metric(tile(el, 'lag')), '—');
});

test('несколько объектов: таблица по отставанию (сверху самые отстающие), выбор объекта чипом и из таблицы, период', async () => {
  const a: SummaryProject = { ...PTO_PROJECT, project_id: 'a', name: 'ЖК А', lag_days: 2, light: 'green', light_reason: 'on_track' };
  const b: SummaryProject = { ...PTO_PROJECT, project_id: 'b', name: 'ЖК Б', lag_days: 45.9, light: 'red', light_reason: 'lag_red' };
  const c: SummaryProject = { ...PTO_PROJECT, project_id: 'c', name: 'ЖК В', lag_days: null, light: 'grey', light_reason: 'no_dates' };
  const f = makeFakeSummary([a, c, b]);
  const el = mount(f.api);
  await tick();
  assert.equal(el.querySelector('[data-testid="sm-dashboard"]'), null, '«Все объекты» — без дашборда');
  assert.deepEqual([...el.querySelectorAll('[data-testid="sm-objects"] tbody tr')].map((r: N) => r.getAttribute('data-project-id')), ['b', 'a', 'c']);
  assert.equal(el.querySelector('[data-project-id="b"] [data-testid="sm-olag"]').textContent, '46 дн.');
  assert.equal(el.querySelector('[data-project-id="b"] [data-testid="sm-olight"]').textContent, 'Отставание');
  assert.equal(el.querySelector('[data-testid="sm-chip-all"]').textContent, 'Все объекты (3)');
  el.querySelector('[data-project-id="b"] [data-testid="sm-open"]').click(); await tick();
  assert.equal(el.querySelector('[data-testid="sm-dashboard"]').getAttribute('data-project-id'), 'b');
  assert.ok(f.calls.includes('weekly:b:8'));
  [...el.querySelectorAll('[data-testid="sm-chip-period"]')].find((x: N) => x.textContent === '12 недель').click(); await tick();
  assert.ok(f.calls.includes('weekly:b:12'), 'период 12 недель — новый запрос');
  [...el.querySelectorAll('[data-testid="sm-chip-project"]')].find((x: N) => x.textContent === 'ЖК А').click(); await tick();
  assert.equal(el.querySelector('[data-testid="sm-dashboard"]').getAttribute('data-project-id'), 'a');
  el.querySelector('[data-testid="sm-back"]').click(); await tick();
  assert.equal(el.querySelector('[data-testid="sm-dashboard"]'), null);
});

test('даты проекта: начало позже окончания — отказ без запроса; сохранение — запрос и обновление сводки', async () => {
  const f = makeFakeSummary([PTO_PROJECT]);
  const el = mount(f.api);
  await tick();
  el.querySelector('[data-testid="sm-dates-btn"]').click(); await tick();
  const form = el.querySelector('[data-testid="sm-dates-form"]');
  typeIn(form.querySelector('[name="start"]'), '2027-03-01');
  typeIn(form.querySelector('[name="finish"]'), '2027-02-01');
  submit(form); await tick();
  assert.match(el.querySelector('[role="alert"]').textContent, /позже/);
  assert.ok(!f.calls.some((c) => c.startsWith('setDates')));
  typeIn(form.querySelector('[name="start"]'), '2026-09-21');
  typeIn(form.querySelector('[name="finish"]'), '2027-01-15');
  submit(form); await tick(); await tick();
  assert.ok(f.calls.includes(`setDates:${PTO_PROJECT.project_id}:2026-09-21:2027-01-15`));
  assert.equal(f.calls.filter((c) => c === 'portfolio').length, 2, 'после сохранения сводка перечитана с сервера');
  assert.equal(el.querySelector('[data-testid="sm-dates-form"]'), null);
});

test('ошибка сервера и пустой портфель — понятные сообщения', async () => {
  const f = makeFakeSummary([]);
  const el = mount(f.api);
  await tick();
  assert.ok(el.querySelector('[data-testid="sm-empty"]'));
  const bad = makeFakeSummary([], { fail: 'Нет связи с сервером. Попробуйте позже' });
  const el2 = mount(bad.api);
  await tick();
  assert.match(el2.querySelector('[role="alert"]').textContent, /Нет связи/);
});

test('объект → виды работ: 10 из 100 м² = 10 %, 3 из 10 шт. = 30 %, общий % — по деньгам, ЕИ не смешаны', async () => {
  const f = makeFakeSummary([PTO_PROJECT]);
  const el = mount(f.api);
  await tick();
  assert.ok(el.querySelector('[data-testid="sm-project"]'));
  assert.match(el.querySelector('[data-testid="sm-pct"]').textContent, /^14,5 % готовности/, 'общий % объекта — по деньгам КП');
  const plas = el.querySelector('[data-wt="wt1"]');
  assert.equal(plas.querySelector('[data-testid="sm-unit-fact"]').textContent, 'факт 10 из 100 м²');
  assert.equal(plas.querySelector('[data-testid="sm-unit-pct"]').textContent, '10 %');
  assert.match(plas.querySelector('[data-testid="sm-unit-pace"]').textContent, /за 7 дн\. 3 · за 14 дн\. 6/);
  assert.match(plas.querySelector('[data-testid="sm-wt-money"]').textContent, /4\s125,00 ₽ из 41\s250,00 ₽ · 10 %/);
  const door = el.querySelector('[data-wt="wt3"]');
  assert.equal(door.querySelector('[data-testid="sm-unit-fact"]').textContent, 'факт 3 из 10 шт.');
  assert.equal(door.querySelector('[data-testid="sm-unit-pct"]').textContent, '30 %');
  assert.ok(el.querySelector('[data-wt="wt4"] [data-testid="sm-wt-unpriced"]'), 'вид без цены — предупреждение');
  door.querySelector('[data-testid="sm-wt-toggle"]').click(); await tick(); await tick();
  assert.ok(f.calls.includes('positions:pr1:wt3'));
  const pos = door.querySelector('[data-position-id="p14"]');
  assert.match(pos.textContent, /5 этаж · Кв\. 1/);
  assert.equal(pos.querySelector('[data-testid="sm-pos-pct"]').textContent, '30 %');
});

test('вид работ в двух ЕИ — две строки, без суммы; без права — ₽ вида работ не показаны', async () => {
  const fc = { forecast_finish: null, delta_days: null, dev_pp: null };
  const two = [{ work_type_id: 'wt1', work_name: 'Штукатурка стен', positions: 2, plan_money: null, done_money: null, pct_money: null, unpriced_rows: 0, plan_pct_today: null,
    units: [{ unit: 'м²', plan: 100, fact: 10, pct: 10, rest: 90, fact7: 3, fact14: 6, pending: 0, ...fc }, { unit: 'шт.', plan: 5, fact: 0, pct: 0, rest: 5, fact7: 0, fact14: 0, pending: 0, ...fc }] }];
  const fore: SummaryProject = { ...PTO_PROJECT, can_money: false, plan_money: null, done_money: null, pct_money: null };
  const el = mount(makeFakeSummary([fore], { workTypes: two }).api);
  await tick();
  const wt = el.querySelector('[data-wt="wt1"]');
  assert.equal(wt.querySelectorAll('[data-unit]').length, 2);
  assert.deepEqual([...wt.querySelectorAll('[data-testid="sm-unit-fact"]')].map((x: N) => x.textContent), ['факт 10 из 100 м²', 'факт 0 из 5 шт.']);
  assert.equal(wt.querySelector('[data-testid="sm-wt-money"]'), null);
  assert.ok(!/₽/.test(el.querySelector('[data-testid="sm-worktypes"]').textContent));
});

async function openGap(el: N): Promise<void> {
  el.querySelector('[data-view="ks2"]').click(); await tick(); await tick();
}

test('«Сделано ↔ КС-2»: сделано 10, выставлено 9 → разрыв 1 (300 ₽); фильтр «только с разрывом»; итог объекта — из сводки', async () => {
  const f = makeFakeSummary([PTO_PROJECT]);
  const el = mount(f.api);
  await tick();
  await openGap(el);
  assert.ok(f.calls.includes('ks2Gap:pr1'));
  assert.match(el.querySelector('[data-testid="sm-gap-total"]').textContent, /не выставлено в КС-2: 300,00 ₽.*сделано 7\s725,00 ₽ · выставлено 7\s425,00 ₽/);
  assert.deepEqual([...el.querySelectorAll('[data-row]')].map((r: N) => r.getAttribute('data-row')), ['12']);
  const r12 = el.querySelector('[data-row="12"]');
  assert.equal(r12.querySelector('[data-testid="sm-gap-qty"]').textContent, '1');
  assert.equal(r12.querySelector('[data-testid="sm-gap-money"]').textContent, '300,00');
  el.querySelector('[data-testid="sm-gap-only"]').click(); await tick();
  assert.equal(el.querySelectorAll('[data-row]').length, 3);
});

test('«Сделано ↔ КС-2» у прораба: объёмы есть, колонок ₽ нет; без договорной КП — сообщение сервера', async () => {
  const fore: SummaryProject = { ...PTO_PROJECT, can_money: false, plan_money: null, done_money: null, issued_money: null, gap_money: null, pct_money: null };
  const rows = GAP.map((r) => ({ ...r, price: null, done_money: null, issued_money: null, gap_money: null }));
  const el = mount(makeFakeSummary([fore], { gap: rows }).api);
  await tick();
  await openGap(el);
  assert.equal(el.querySelector('[data-testid="sm-gap-total"]'), null);
  assert.equal(el.querySelector('[data-row="12"] [data-testid="sm-gap-qty"]').textContent, '1');
  assert.equal(el.querySelector('[data-testid="sm-gap-money"]'), null);
  assert.ok(!/₽/.test(el.querySelector('[data-testid="sm-gap"]').textContent));
  const el2 = mount(makeFakeSummary([PTO_PROJECT], { gap: 'Выберите договорную редакцию КП проекта' }).api);
  await tick();
  await openGap(el2);
  assert.match(el2.querySelector('[data-testid="sm-gap"] [role="alert"]').textContent, /договорную редакцию КП/);
});

test('«Скачать Excel»: берёт с сервера виды работ, все позиции и разрыв КС-2 и отдаёт файл', async () => {
  const f = makeFakeSummary([PTO_PROJECT]);
  const saved: { n: string; size: number }[] = [];
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  flushSync(() => createRoot(el as unknown as HTMLElement).render(createElement(SummaryTab, { api: f.api, save: (b: Uint8Array, n: string) => saved.push({ n, size: b.length }) } as N)));
  await tick();
  (el as N).querySelector('[data-testid="sm-xlsx"]').click();
  for (let i = 0; i < 20 && !saved.length; i++) await tick();
  assert.equal(saved.length, 1);
  assert.match(saved[0].n, /^Сводка ЖК Сводка \d\d\.\d\d\.\d{4}\.xlsx$/);
  assert.ok(saved[0].size > 1000);
  assert.ok(f.calls.includes('positions:pr1:null'));
});

test('«Требует внимания»: строки с сервера, переход в КС-2 / Смету / Факт, даты — открывают форму; полнота данных', async () => {
  const f = makeFakeSummary([PTO_PROJECT], { attention: { ...ATTENTION, counts: { ...ATTENTION.counts, no_dates: true, pending_entries: 2 } } });
  const went: string[] = [];
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  flushSync(() => createRoot(el as unknown as HTMLElement).render(createElement(SummaryTab, { api: f.api, links: { go: (pg: string) => went.push(pg), can: { ks2: true, estimate: false, fact: true } } } as N)));
  await tick();
  const at = (el as N).querySelector('[data-testid="sm-attention"]');
  assert.ok(f.calls.includes('attention:pr1'));
  const ids = [...at.querySelectorAll('[data-attention]')].map((x: N) => x.getAttribute('data-attention'));
  assert.deepEqual(ids, ['no_dates', 'gap', 'unpriced', 'stale', 'pending']);
  assert.match(at.querySelector('[data-attention="gap"]').textContent, /Сделано, не выставлено в КС-2 на 300,00 ₽ — строк: 1/);
  assert.match(at.querySelector('[data-attention="gap"] details').textContent, /1\.1 Штукатурка стен — 1 м2 · 300,00 ₽/);
  at.querySelector('[data-attention="gap"] [data-testid="sm-attention-go"]').click();
  at.querySelector('[data-attention="stale"] [data-testid="sm-attention-go"]').click();
  assert.deepEqual(went, ['ks2', 'fact']);
  assert.equal(at.querySelector('[data-attention="unpriced"] [data-testid="sm-attention-go"]'), null, 'без доступа к смете — без кнопки');
  at.querySelector('[data-attention="no_dates"] [data-testid="sm-attention-go"]').click(); await tick();
  assert.ok((el as N).querySelector('[data-testid="sm-dates-form"]'), '«Указать даты» открывает форму дат');
  const full = (el as N).querySelector('[data-testid="sm-completeness"]');
  assert.match(full.querySelector('[data-full="priced"]').textContent, /75 %.*3 из 4/);
  assert.match(full.querySelector('[data-full="placed"]').textContent, /100 %.*3 из 3/);
});

test('прораб: «требует внимания» без ₽, счётчики есть; замечаний нет — понятное сообщение', async () => {
  const fore: SummaryProject = { ...PTO_PROJECT, can_money: false, can_manage: false, plan_money: null, done_money: null, pct_money: null, lag_pp: null, lag_days: null };
  const el = mount(makeFakeSummary([fore], { attention: { ...ATTENTION, counts: { ...ATTENTION.counts, gap_money: null }, gap: ATTENTION.gap.map((g) => ({ ...g, money: null })) } }).api);
  await tick();
  const at = el.querySelector('[data-testid="sm-attention"]');
  assert.match(at.querySelector('[data-attention="gap"]').textContent, /строк: 1/);
  assert.ok(!/₽/.test(at.textContent));
  const ok = mount(makeFakeSummary([PTO_PROJECT], { attention: { ...ATTENTION, counts: { no_kp: false, no_dates: false, gap_rows: 0, gap_money: 0, unpriced_rows: 0, stale_positions: 0, pending_entries: 0 } } }).api);
  await tick();
  assert.ok(ok.querySelector('[data-testid="sm-attention-ok"]'));
});

test('проваливание: корпус → секция → этаж → позиции; позиции на корпусе — подсказка «не разнесено по этажам»', async () => {
  const pl = (id: string, name: string, node_type: string, children: number, here: number, positions = 1) =>
    ({ ...PLACES[0], location_id: id, name, node_type, children, here_positions: here, positions });
  const places = { root: [pl('b1', 'Корпус 1', 'building', 1, 1, 3)], b1: [pl('s1', 'Секция 1', 'section', 1, 0, 2)], s1: [pl('f1', 'Этаж 5', 'floor', 0, 1)], f1: [] };
  const positions = [{ ...POSITIONS[0], location_id: 'b1' }, { ...POSITIONS[1], location_id: 'f1' }];
  const f = makeFakeSummary([PTO_PROJECT], { places, positions });
  const el = mount(f.api);
  await tick();
  const panel = () => el.querySelector('[data-testid="sm-places"]');
  panel().querySelector('[data-location-id="b1"] [data-testid="sm-place-open"]').click(); await tick();
  assert.ok(f.calls.includes('places:pr1:b1'));
  assert.match(panel().querySelector('[data-testid="sm-crumbs"]').textContent, /Все › Корпус 1/);
  assert.ok(panel().querySelector('[data-location-id="s1"]'));
  assert.match(panel().querySelector('[data-testid="sm-not-split"]').textContent, /не разнесены по этажам: 1 поз\./);
  assert.match(panel().querySelector('[data-testid="sm-place-positions"]').textContent, /Штукатурка стен.*10 из 100 м²/);
  panel().querySelector('[data-location-id="s1"] [data-testid="sm-place-open"]').click(); await tick();
  panel().querySelector('[data-location-id="f1"] [data-testid="sm-place-open"]').click(); await tick();
  assert.match(panel().querySelector('[data-testid="sm-crumbs"]').textContent, /Все › Корпус 1 › Секция 1 › Этаж 5/);
  assert.equal(panel().querySelector('[data-testid="sm-not-split"]'), null, 'этаж — без подсказки');
  assert.ok(panel().querySelector('[data-position-id="p14"]'));
  [...panel().querySelectorAll('[data-testid="sm-crumbs"] button')].find((b: N) => b.textContent === 'Все').click(); await tick();
  assert.ok(panel().querySelector('[data-location-id="b1"]'));
});

test('пороги светофора: только с правом; проверка до запроса; сохранение — запрос и перечитанная сводка', async () => {
  const f = makeFakeSummary([PTO_PROJECT]);
  const el = mount(f.api);
  await tick();
  el.querySelector('[data-testid="sm-th-btn"]').click(); await tick();
  const form = el.querySelector('[data-testid="sm-th-form"]');
  assert.equal(form.querySelector('[name="yellow"]').value, '3');
  typeIn(form.querySelector('[name="yellow"]'), '12');
  submit(form); await tick();
  assert.match(form.querySelector('[role="alert"]').textContent, /жёлтый < красный/);
  assert.ok(!f.calls.some((c) => c.startsWith('setThresholds')));
  typeIn(form.querySelector('[name="yellow"]'), '5');
  typeIn(form.querySelector('[name="red"]'), '25');
  typeIn(form.querySelector('[name="days"]'), '7');
  submit(form); await tick(); await tick();
  assert.ok(f.calls.includes('setThresholds:pr1:5:25:7'));
  assert.equal(f.calls.filter((c) => c === 'portfolio').length, 2, 'светофор перечитан с сервера');
  assert.equal(el.querySelector('[data-testid="sm-th-form"]'), null);
  const el2 = mount(makeFakeSummary([{ ...PTO_PROJECT, can_thresholds: false }]).api);
  await tick();
  assert.equal(el2.querySelector('[data-testid="sm-th-btn"]'), null, 'без права — кнопки нет');
});

// P2-0022: прогноз окончания по видам работ и позициям — числа с сервера (030), здесь только подписи и цвет.
test('P2-0022: «Виды работ» — прогноз окончания, Δ к финишу (позже — красным), % отклонения с заливкой по порогам; нет темпа; позиция — прогноз', async () => {
  const f = makeFakeSummary([PTO_PROJECT]);
  const el = mount(f.api);
  await tick();
  const fc = (wt: string) => el.querySelector(`[data-wt="${wt}"] [data-testid="sm-unit-fc"]`);
  const q = (root: N, id: string) => root.querySelector(`[data-testid="${id}"]`);
  // wt1: 21.05.2027, +141 (позже финиша — красным), отставание 25 % > красного порога 10 → красная заливка
  assert.equal(q(fc('wt1'), 'sm-fc-finish').textContent, '21.05.2027');
  assert.equal(q(fc('wt1'), 'sm-fc-delta').textContent, '+141');
  assert.ok(q(fc('wt1'), 'sm-fc-delta').className.includes('sm-fc-late'));
  assert.equal(q(fc('wt1'), 'sm-fc-dev').getAttribute('data-status'), 'red');
  assert.match(q(fc('wt1'), 'sm-fc-dev').textContent, /отставание 25 %/);
  // wt3: раньше финиша — не красным; отставание 5 % между порогами 3 и 10 → жёлтая
  assert.equal(q(fc('wt3'), 'sm-fc-delta').textContent, '−35');
  assert.ok(!q(fc('wt3'), 'sm-fc-delta').className.includes('sm-fc-late'));
  assert.equal(q(fc('wt3'), 'sm-fc-dev').getAttribute('data-status'), 'yellow');
  // wt4: нет факта за 14 дней — «нет темпа», Δ нет
  assert.equal(q(fc('wt4'), 'sm-fc-finish').textContent, 'нет темпа');
  assert.equal(q(fc('wt4'), 'sm-fc-delta').textContent, '—');
  // позиции вида
  el.querySelector('[data-wt="wt1"] [data-testid="sm-wt-toggle"]').click(); await tick(); await tick();
  assert.match(el.querySelector('[data-position-id="p12"] [data-testid="sm-pos-fc"]').textContent, /^21\.05\.2027 \(\+141 дн\.\)$/);
});

test('P2-0022: подписи прогноза — выполнено / нет темпа / без дат; заливка отклонения только выше порогов объекта', async () => {
  const { forecastView } = await import('../summary/model.ts');
  const th = { yellow: 3, red: 10 };
  assert.deepEqual(forecastView({ plan: 100, fact: 100, forecast_finish: '2026-10-24', delta_days: null, dev_pp: -60 }, th),
    { finish: 'выполнено', noPace: false, delta: '—', late: false, dev: 'опережение 60 %', devTone: null });
  assert.equal(forecastView({ plan: 100, fact: 30, forecast_finish: null, delta_days: null, dev_pp: 3 }, th).finish, 'нет темпа');
  assert.equal(forecastView({ plan: 100, fact: 30, forecast_finish: null, delta_days: null, dev_pp: 3 }, th).devTone, null, 'ровно порог — без заливки');
  assert.equal(forecastView({ plan: 100, fact: 30, forecast_finish: '2026-12-01', delta_days: 0, dev_pp: 10 }, th).devTone, 'yellow', 'ровно красный порог — жёлтая');
  assert.equal(forecastView({ plan: 100, fact: 30, forecast_finish: '2026-12-01', delta_days: 0, dev_pp: 10.1 }, th).devTone, 'red');
  assert.equal(forecastView({ plan: 100, fact: 30, forecast_finish: '2026-12-01', delta_days: null, dev_pp: null }, th).dev, '—', 'без дат объекта — отклонения нет');
  assert.equal(forecastView({ plan: 0, fact: 0, forecast_finish: null, delta_days: null, dev_pp: null }, th).finish, '—');
});
