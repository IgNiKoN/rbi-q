/// <reference types="node" />
/** ВОР с подпозициями КВР / Номенклатура (P2-0012, этап 1): разбор, пояснения, сверка, написания «Вида», старый профиль. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheet, columnMapFrom, kvrMark, kvrCheck, roleFromLabel } from '../vor/parse.ts';
import { kvrSheet, KVR_FIRST_ROW } from './kvr-fixture.ts';

test('КВР → группа, Номенклатура → работа: 16 / 41, объёмы не задвоены (Σ 160 015,28)', () => {
  const r = parseSheet(kvrSheet());
  assert.equal(r.isVor, true);
  assert.equal(r.stats.groups, 16);
  assert.equal(r.stats.works, 41);
  assert.equal(r.stats.materials, 0);
  const works = r.rows.filter((x) => x.kind === 'work');
  assert.equal(Math.round(works.reduce((a, x) => a + (x.qty || 0), 0) * 100) / 100, 160015.28);
  // КВР хранит свой объём и ЕИ — для сверки.
  const g = r.rows.find((x) => x.kind === 'group' && x.name === 'КВР-группа 14');
  assert.equal(g?.qty, 1061.1); assert.equal(g?.unitText, 'м2');
  // Итог и подпись после таблицы — skip.
  assert.ok(r.rows.filter((x) => x.kind === 'skip').length >= 1);
});

test('связь с КВР и пояснение: Номенклатура знает свою КВР (context.kvr), «Комментарий» — в context.note', () => {
  const r = parseSheet(kvrSheet());
  const works = r.rows.filter((x) => x.kind === 'work');
  assert.ok(works.every((x) => typeof x.context.kvr === 'number'));
  const first = works[0];
  assert.equal(first.context.kvr, KVR_FIRST_ROW);
  assert.equal(first.context.note, 'Пояснение 1');
  // Две одноимённые работы под одной КВР различаются пояснением.
  const twins = works.filter((x) => x.name === 'Работа «Вид 13»');
  assert.equal(twins.length, 2);
  assert.notEqual(twins[0].context.note, twins[1].context.note);
  // Без пояснения — ключа нет; КВР ключей kvr/note не получает.
  assert.equal(works.find((x) => x.name === 'Работа «Вид 9»')?.context.note, undefined);
  assert.ok(r.rows.filter((x) => x.kind === 'group').every((x) => x.context.kvr === undefined && x.context.note === undefined));
  // Колонки «Стоимость материала / работ на ед. изм.» — цены, а не ЕИ.
  assert.equal(r.columns?.unit, 7);
  assert.deepEqual(r.columns?.prices.map((p) => p.col), [8, 9, 11, 12]);
});

test('сверка КВР: 26 пар «название + ЕИ», 25 сходятся, 1 расхождение (Вид 23: 13,08 из 1 061,1); другая ЕИ не сверяется', () => {
  const r = parseSheet(kvrSheet());
  assert.equal(r.kvrChecks.length, 26);
  const bad = r.kvrChecks.filter((c) => !c.ok);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].name, 'Работа «Вид 23»');
  assert.equal(bad[0].expected, 1061.1);
  assert.equal(bad[0].actual, 13.08);
  // Две строки одного названия суммируются: 32 673,3 + 8 739,4 = 41 412,7.
  const sum = r.kvrChecks.find((c) => c.name === 'Работа «Вид 13»');
  assert.equal(sum?.ok, true); assert.equal(sum?.rowNos.length, 2);
  // «пог. м» под КВР в м² и «компл» под м² — не сверяются.
  assert.equal(r.kvrChecks.some((c) => c.name === 'Работа «Вид 11»' || c.name === 'Работа «Вид 1»'), false);
  // Допуск 0,01.
  const rows = [
    { rowNo: 1, kind: 'group' as const, name: 'К', unitText: 'м²', qty: 10, context: {} },
    { rowNo: 2, kind: 'work' as const, name: 'А', unitText: 'м2', qty: 10.005, context: { kvr: 1 } }
  ];
  assert.equal(kvrCheck(rows)[0].ok, true);
});

test('написания «Вида»: «кВР», «Номенклатура работ» — распознаются; прочее — нет', () => {
  assert.equal(kvrMark('кВР'), 'group');
  assert.equal(kvrMark(' КВР '), 'group');
  assert.equal(kvrMark('Номенклатура работ'), 'work');
  assert.equal(kvrMark('КВРТ'), null);
  assert.equal(kvrMark('Работа'), null);
  const r = parseSheet(kvrSheet('кВР', 'Номенклатура работ'));
  assert.equal(r.stats.groups, 16); assert.equal(r.stats.works, 41);
});

test('профиль формы, сохранённый до P2-0012 (без колонки «Вид» и пояснений), — КВР всё равно распознаётся', () => {
  const auto = parseSheet(kvrSheet());
  const old = { ...auto.columns, type: null } as Record<string, unknown>;
  delete old.notes;
  const map = columnMapFrom(old);
  assert.ok(map);
  assert.equal(map?.notes, undefined);
  const r = parseSheet(kvrSheet(), map);
  assert.equal(r.stats.works, 41); assert.equal(r.stats.groups, 16);
  assert.equal(r.rows.find((x) => x.kind === 'work')?.context.note, 'Пояснение 1');
  // Новый профиль хранит notes и восстанавливает их.
  assert.deepEqual(columnMapFrom({ ...auto.columns })?.notes, [2, 5]);
});

test('роль колонки: «Стоимость … на ед. изм.» — цена; «Ед. изм.» — ЕИ; «Цена за ед.» — цена', () => {
  assert.equal(roleFromLabel('Стоимость материала на ед. изм., руб в т.ч. НДС'), 'price');
  assert.equal(roleFromLabel('Ед.изм.'), 'unit');
  assert.equal(roleFromLabel('Цена за ед., руб.'), 'price');
  assert.equal(roleFromLabel('Наименование работ и затрат'), 'name');
});
