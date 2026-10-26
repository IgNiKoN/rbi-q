/// <reference types="node" />
/** Места ВОР → дерево объекта (P2-0006, этап 4): номера в названиях, дерево генератора, недостающие узлы без дублей, «Этажи N–M», квартиры. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeOf, placeNote, nodeNumber, matchChild, bindPlaces, missingList, createMissing, sheetBuilding, WHOLE_OBJECT } from '../vor/places.ts';
import type { TreeNode, PlaceType } from '../vor/places.ts';

/** Дерево в памяти + загрузчик детей (как pf_list_locations) + счётчик вызовов. */
function tree(nodes: TreeNode[]) {
  const calls: (string | null)[] = [];
  const load = async (p: string | null) => { calls.push(p); return nodes.filter((n) => n.parent_id === p); };
  let seq = 0;
  const add = async (parent: string | null, type: PlaceType, name: string) => {
    const id = 'new' + (++seq);
    const pp = nodes.find((n) => n.id === parent);
    nodes.push({ id, parent_id: parent, node_type: type, name, path: pp ? `${pp.path} · ${name}` : name });
    return id;
  };
  return { nodes, load, add, calls };
}
const N = (id: string, parent: string | null, type: string, name: string, path: string): TreeNode => ({ id, parent_id: parent, node_type: type, name, path });

test('место строки: шаги корпус → секция → этаж; диапазон этажей — без шага этажа; пусто → «Весь объект»', () => {
  assert.deepEqual(placeOf({ building: '7', section: '1', apartments: 'кв. 3' }).steps.map((s) => s.name), ['Корпус 7', 'Секция 1']);
  assert.equal(placeOf({ section: '1', floor: { from: 2, to: 2 } }).label, 'Секция 1 · Этаж 2');
  assert.deepEqual(placeOf({ section: '4', floor: { from: 4, to: 12 } }).steps.map((s) => s.type), ['section']);
  assert.deepEqual(placeOf({}).steps, [{ type: 'other', value: '', name: WHOLE_OBJECT }]);
  assert.equal(placeOf({ building: '7', section: '1' }).key, placeOf({ building: '7', section: '1', apartments: 'кв. 9' }).key, 'квартиры не делят место');
  assert.equal(placeNote({ section: '4', floor: { from: 4, to: 12 }, apartments: 'кв. 3, 16' }), 'эт. 4–12 · кв. 3, 16');
  assert.equal(placeNote({ section: '1', floor: { from: 2, to: 2 } }), null);
});

test('узел по типу и номеру: «Этаж 2» = «эт. 2» (генератор), «Секция 1» ≠ «Секция 10»', () => {
  assert.equal(nodeNumber('эт. 2'), '2'); assert.equal(nodeNumber('Корпус 1А'), '1а'); assert.equal(nodeNumber('Весь объект'), null);
  const kids = [N('s1', null, 'section', 'Секция 10', 'Секция 10'), N('s2', null, 'section', 'Секция 1', 'Секция 1'), N('f', null, 'floor', 'эт. 2', 'эт. 2')];
  assert.equal(matchChild(kids, { type: 'section', value: '1', name: 'Секция 1' })?.id, 's2');
  assert.equal(matchChild(kids, { type: 'floor', value: '2', name: 'Этаж 2' })?.id, 'f');
  assert.equal(matchChild(kids, { type: 'floor', value: '3', name: 'Этаж 3' }), null);
});

test('дерево генератора P2-0005 (Корпус 1 / Секция 1 / эт. 2): привязка без создания; корпуса нет в файле — единственный корпус', async () => {
  const t = tree([N('b', null, 'building', 'Корпус 1', 'Корпус 1'), N('s', 'b', 'section', 'Секция 1', 'Корпус 1 · Секция 1'),
    N('f', 's', 'floor', 'эт. 2', 'Корпус 1 · Секция 1 · эт. 2')]);
  const places = [placeOf({ section: '1', floor: { from: 2, to: 2 } }), placeOf({ building: '1', section: '1' })];
  const b = await bindPlaces(places, t.load);
  assert.deepEqual(b.map((x) => x.path), ['Корпус 1 · Секция 1 · эт. 2', 'Корпус 1 · Секция 1']);
  assert.deepEqual(missingList(b, places), []);
  assert.equal(t.calls.filter((c) => c === null).length, 1, 'дети каждого узла грузятся один раз');
});

test('пустое дерево: список недостающих без повторов → «Создать» → повторная привязка 100 %, дублей нет', async () => {
  const t = tree([]);
  const places = [placeOf({ building: '7', section: '1' }), placeOf({ building: '7', section: '2' }), placeOf({ building: '8', section: '1' }), placeOf({})];
  const b1 = await bindPlaces(places, t.load);
  assert.deepEqual(missingList(b1, places), ['Корпус 7 → Секция 1', 'Корпус 7 → Секция 2', 'Корпус 8 → Секция 1', WHOLE_OBJECT]);
  const n = await createMissing(b1, places, t.add);
  assert.equal(n, 6, 'Корпус 7 — один раз');
  assert.equal(t.nodes.filter((x) => x.name === 'Корпус 7').length, 1);
  const b2 = await bindPlaces(places, t.load);
  assert.ok(b2.every((x) => x.nodeId), 'все места привязаны');
  assert.equal(b2[1].path, 'Корпус 7 · Секция 2');
  assert.equal(await createMissing(b2, places, t.add), 0, 'повторно ничего не создаётся');
});

test('частично есть: создаётся только недостающий хвост под найденным узлом', async () => {
  const t = tree([N('b', null, 'building', 'Корпус 1', 'Корпус 1'), N('s', 'b', 'section', 'Секция 4', 'Корпус 1 · Секция 4')]);
  const places = [placeOf({ building: '1', section: '4', floor: { from: 13, to: 13 } })];
  const b = await bindPlaces(places, t.load);
  assert.deepEqual(missingList(b, places), ['Корпус 1 → Секция 4 → Этаж 13']);
  assert.equal(b[0].missingParent, 's');
  assert.equal(await createMissing(b, places, t.add), 1);
  assert.equal((await bindPlaces(places, t.load))[0].path, 'Корпус 1 · Секция 4 · Этаж 13');
});

test('блок без корпуса: ждёт выбора ПТО (не создаётся и не сливается); после выбора — привязка к секции выбранного корпуса', async () => {
  const t = tree([N('b7', null, 'building', 'Корпус 7', 'Корпус 7'), N('b8', null, 'building', 'Корпус 8', 'Корпус 8'),
    N('s72', 'b7', 'section', 'Секция 2', 'Корпус 7 · Секция 2'), N('s82', 'b8', 'section', 'Секция 2', 'Корпус 8 · Секция 2')]);
  const p1 = placeOf({ block: 1, section: '2' }), p2 = placeOf({ block: 2, section: '2' });
  assert.notEqual(p1.key, p2.key, 'секции разных блоков — разные места');
  const b = await bindPlaces([p1, p2], t.load);
  assert.deepEqual(b.map((x) => [x.nodeId, x.pendingBlock]), [[null, 1], [null, 2]]);
  assert.deepEqual(missingList(b, [p1, p2]), [], 'в «недостающие» не попадают');
  assert.equal(await createMissing(b, [p1, p2], t.add), 0);
  const q1 = placeOf({ block: 1, section: '2' }, { 1: { value: '7', name: 'Корпус 7' }, 2: { value: '8', name: 'Корпус 8' } });
  const q2 = placeOf({ block: 2, section: '2' }, { 1: { value: '7', name: 'Корпус 7' }, 2: { value: '8', name: 'Корпус 8' } });
  assert.deepEqual((await bindPlaces([q1, q2], t.load)).map((x) => x.path), ['Корпус 7 · Секция 2', 'Корпус 8 · Секция 2']);
});

test('корпус листа (P2-0009, К1): угадывается по названию листа; строки без места — на корпус, а не на «Весь объект»', async () => {
  assert.deepEqual(sheetBuilding('себес уч.2 корп. 1.1'), { value: '1.1', name: 'Корпус 1.1' });
  assert.deepEqual(sheetBuilding('себес. уч.2 корп. 1.2'), { value: '1.2', name: 'Корпус 1.2' });
  assert.deepEqual(sheetBuilding('Корпус 3А'), { value: '3а', name: 'Корпус 3А' });
  assert.equal(sheetBuilding('ЛОС жК Новогорелово'), null);
  assert.equal(nodeNumber('Корпус 1.1'), '1.1');
  const t = tree([N('b11', null, 'building', 'Корпус 1.1', 'Корпус 1.1'), N('b12', null, 'building', 'Корпус 1.2', 'Корпус 1.2'),
    N('s1', 'b11', 'section', 'Секция 1', 'Корпус 1.1 · Секция 1')]);
  const sh = sheetBuilding('себес уч.2 корп. 1.1');
  const empty = placeOf({}, {}, sh), sec = placeOf({ section: '1' }, {}, sh), own = placeOf({ building: '1.2' }, {}, sh);
  assert.deepEqual((await bindPlaces([empty, sec, own], t.load)).map((b) => b.path), ['Корпус 1.1', 'Корпус 1.1 · Секция 1', 'Корпус 1.2'],
    'без места — корпус листа; секция без корпуса — в корпусе листа; свой корпус в строке важнее листа');
  assert.equal(placeOf({}, {}, null).steps[0].name, WHOLE_OBJECT, 'корпус листа не выбран — по-старому «Весь объект»');
  const missing = await bindPlaces([placeOf({}, {}, { value: '2', name: 'Корпус 2' })], t.load);
  assert.deepEqual(missingList(missing, [placeOf({}, {}, { value: '2', name: 'Корпус 2' })]), ['Корпус 2'], 'корпуса нет в дереве — в «недостающие»');
});
