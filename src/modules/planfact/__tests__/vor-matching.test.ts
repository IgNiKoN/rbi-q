/// <reference types="node" />
/** Светофор видов работ (P2-0006, этап 5): 🟢 словарь, 🟡 похожее, 🔴 нет вариантов / неизвестная ЕИ; «м2» = «м²»; canonName = canon_name сервера. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonName, unitKey, findUnit, similarity, classify, workTypeName, buildIdf, distinctObjects, SIMILARITY } from '../vor/matching.ts';

const UNITS = [{ id: 'm2', code: 'м²' }, { id: 'mp', code: 'м.п.' }, { id: 'sht', code: 'шт.' }, { id: 'kg', code: 'кг' }, { id: 'kompl', code: 'компл.' }];
const WT = [
  { id: 'w1', name: 'Устройство финишной отделки пола линолеумом', unit_id: 'm2' },
  { id: 'w2', name: 'Окраска стен в 2 слоя', unit_id: 'm2' },
  { id: 'w3', name: 'Установка плинтуса ПВХ', unit_id: 'mp' }
];

test('canonName — то же правило, что planfact.canon_name (образцы как в SQL-тесте 16c)', () => {
  assert.equal(['  Устройство   ПОЛА ', 'Окраска\tстен  в 2 слоя', 'Ёмкость Ё'].map(canonName).join('|'), 'устройство пола|окраска стен в 2 слоя|ёмкость ё');
});

test('ЕИ: «м2» = «м²» = «кв.м», «м.п» = «м.п.» = «пог.м», «шт» = «шт.»; неизвестная — не найдена', () => {
  assert.equal(unitKey('м2'), 'м²'); assert.equal(unitKey('М²'), 'м²'); assert.equal(unitKey('кв. м'), 'м²');
  assert.equal(unitKey('м.п'), 'м.п.'); assert.equal(unitKey('пог.м'), 'м.п.'); assert.equal(unitKey('мп'), 'м.п.');
  assert.equal(unitKey('шт. '), 'шт.'); assert.equal(unitKey('компл.'), 'компл.');
  assert.equal(findUnit('м2', UNITS)?.id, 'm2');
  assert.equal(findUnit('шт', UNITS)?.id, 'sht');
  assert.equal(findUnit('мл', UNITS), null);
  assert.equal(findUnit('', UNITS), null);
});

test('сходство по основам слов: окончания не мешают; разные работы — ниже порога', () => {
  assert.ok(similarity('Устройство финишной отделки пола линолеумом', 'Устройство финишной отделки полов линолеумом:') >= SIMILARITY);
  assert.ok(similarity('Окраска стен в 2 слоя', 'Окраска потолков в 2 слоя') < SIMILARITY);
  assert.equal(similarity('', 'x'), 0);
});

test('🟢 точное совпадение в словаре (canon + ЕИ) → вид работ подставлен', () => {
  const v = classify('  Окраска стен  в 2 слоя', 'м2', UNITS, WT, [{ canon_name: 'окраска стен в 2 слоя', unit_text: 'м²', work_type_id: 'w2' }]);
  assert.deepEqual(v, { light: 'green', workTypeId: 'w2', unitId: 'm2', score: 1, reason: 'dictionary' });
});

test('🟡 похожее → предложение; 🔴 чужое → вариантов нет; та же ЕИ обязательна', () => {
  const y = classify('Устройство финишной отделки полов линолеумом: с подготовкой', 'м2', UNITS, WT, []);
  assert.equal(y.light, 'yellow'); assert.equal(y.workTypeId, 'w1');
  const r = classify('Монтаж ревизионных лючков', 'шт.', UNITS, WT, []);
  assert.deepEqual([r.light, r.reason, r.unitId], ['red', 'none', 'sht']);
  const u = classify('Установка плинтуса ПВХ', 'м2', UNITS, WT, []);
  assert.equal(u.light, 'red', 'плинтус в м² не предлагается виду работ в м.п.');
});

test('🔴 неизвестная ЕИ → красный с причиной «unit»', () => {
  assert.deepEqual(classify('Окраска стен в 2 слоя', 'мл', UNITS, WT, []), { light: 'red', workTypeId: null, unitId: null, score: 0, reason: 'unit' });
  assert.equal(classify('Монтаж дверей', null, UNITS, WT, []).reason, 'unit');
});

test('словарь компании А не подставляется, если вида работ нет в справочнике (чужая компания / удалён)', () => {
  const v = classify('Окраска стен в 2 слоя', 'м2', UNITS, [], [{ canon_name: 'окраска стен в 2 слоя', unit_text: 'м²', work_type_id: 'чужой' }]);
  assert.equal(v.light, 'red');
});

test('наименование нового вида работ из строки: без хвостового двоеточия и лишних пробелов', () => {
  assert.equal(workTypeName('  Установка плинтуса из ПВХ на клею,  высотой 55 мм: '), 'Установка плинтуса из ПВХ на клею, высотой 55 мм');
});

test('разные предметы работы при общем хвосте — не «похоже»: «…стен…» ≠ «…порогов балконов…»; верные пары проходят', () => {
  const a = 'Оштукатуривание поверхности стен смесями на цементной основе (ср. толщ. слоя 15 мм), с подготовкой основания';
  const b = 'Оштукатуривание поверхности порогов балконов смесями на цементной основе (ср. толщ. слоя 15 мм), с подготовкой основания';
  assert.ok(similarity(a, b) >= SIMILARITY, 'по словам — почти одно и то же');
  assert.equal(distinctObjects(a, b), true);
  assert.equal(classify(a, 'м2', UNITS, [{ id: 'wb', name: b, unit_id: 'm2' }], []).light, 'red');
  assert.equal(distinctObjects('Монтаж ревизионных пластиковых лючков в с/у', 'Монтаж ревизионных лючков в с/у'), false);
  assert.equal(distinctObjects('Устройство натяжного ПВХ потолка', 'Устройство натяжных потолков'), false);
  const corpus = ['Монтаж ревизионных лючков в с/у', 'Монтаж подоконных досок из ПВХ', 'Устройство натяжных потолков', 'Окраска стен в 2 слоя'];
  assert.equal(classify('Монтаж ревизионных пластиковых лючков в с/у', 'шт', UNITS, [{ id: 'wl', name: corpus[0], unit_id: 'sht' }], [], buildIdf(corpus)).light, 'yellow');
});

test('пустая ЕИ в файле: 🔴 «unit»; после решения ПТО (словарь «без ЕИ») — 🟢 с ЕИ вида работ', () => {
  assert.equal(classify('Монтаж межкомнатных дверей', null, UNITS, WT, []).reason, 'unit');
  const types = [...WT, { id: 'w9', name: 'Монтаж межкомнатных дверей', unit_id: 'sht' }];
  const v = classify('Монтаж межкомнатных  дверей', '', UNITS, types, [{ canon_name: 'монтаж межкомнатных дверей', unit_text: '', work_type_id: 'w9' }]);
  assert.deepEqual([v.light, v.workTypeId, v.unitId], ['green', 'w9', 'sht']);
});
