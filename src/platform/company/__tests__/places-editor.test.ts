/// <reference types="node" />
/** P2-0055: логика редактора мест без экрана — названия «+» по уровням, вставка (что и куда, с причиной), «Выше / Ниже»,
 *  место при перетаскивании, стек «Отменить», сетка шахматки. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlaceNode } from '../../core/projects.service.ts';
import { buildChess, clipSummary, dropPlace, MOVE_OTHER_OBJECT, nextChildName, pasteCheck, pasteName, pushUndo, stepBefore, UNDO_LIMIT } from '../places-editor.ts';

const P = (id: string, parent: string | null, type: string, name: string, extra: Partial<PlaceNode> = {}): PlaceNode => ({
  id, parent_id: parent, node_type: type as PlaceNode['node_type'], object_kind: type === 'object' ? 'building' : null, name, build_no: null, bti_no: null,
  sort_order: 0, depth: 1, path: name, child_count: 0, apartment_count: null, ...extra });

test('«+»: следующее название по уровню и образцу соседей', () => {
  assert.equal(nextChildName([P('a', 'o', 'section', 'Секция 1'), P('b', 'o', 'section', 'Секция 2')], 'section'), 'Секция 3');
  assert.equal(nextChildName([P('a', 's', 'floor', 'эт. 1'), P('b', 's', 'floor', 'эт. 12'), P('c', 's', 'floor', 'Подвал')], 'floor'), 'эт. 13');
  assert.equal(nextChildName([P('a', 's', 'floor', '5 этаж'), P('b', 's', 'floor', '4 этаж')], 'floor'), '6 этаж', 'номер впереди');
  assert.equal(nextChildName([], 'section'), 'Секция 1');
  assert.equal(nextChildName([], 'floor'), 'эт. 1');
  assert.equal(nextChildName([P('a', 'f', 'apartment', 'Кв. 5', { build_no: '5' })], 'apartment', 21), 'Кв. 21', 'помещение — со строительным номером объекта');
  assert.equal(nextChildName([], 'apartment', 7), 'кв. 7');
  assert.equal(nextChildName([P('a', 'o', 'section', 'Секция 1'), P('b', 'o', 'other', 'секция 2')], 'section'), 'Секция 3', 'занятое название не выдаёт');
});

test('название копии на новом уровне: прежнее или следующее по номеру', () => {
  assert.equal(pasteName([P('x', 'k2', 'section', 'Секция 1')], P('s', 'k1', 'section', 'Секция 1')), 'Секция 2');
  assert.equal(pasteName([], P('s', 'k1', 'section', 'Секция 1')), 'Секция 1');
  assert.equal(pasteName([P('x', 'k2', 'other', 'Кровля')], P('s', 'k1', 'other', 'Кровля')), 'Кровля (2)');
  assert.equal(clipSummary(P('s', 'k1', 'section', 'Секция 1', { child_count: 5, apartment_count: 20 })), 'Секция 1 — 5 эт., 20 кв.');
});

test('вставка: тип, своя ветка, перенос только внутри объекта — с текстом причины', () => {
  const sec = P('s1', 'k1', 'section', 'Секция 1'), fl = P('f1', 's1', 'floor', 'эт. 1'), apt = P('a1', 'f1', 'apartment', 'кв. 1');
  const k1 = P('k1', null, 'object', 'Корпус 1'), k2 = P('k2', null, 'object', 'Корпус 2'), s2 = P('s2', 'k1', 'section', 'Секция 2'), k2s = P('k2s', 'k2', 'section', 'Секция 1');
  assert.deepEqual(pasteCheck({ mode: 'copy', node: sec, objectId: 'k1' }, k2, ['k2'], 'k2'), { ok: true }, 'копия секции в другой корпус');
  assert.deepEqual(pasteCheck({ mode: 'cut', node: sec, objectId: 'k1' }, k2, ['k2'], 'k2'), { ok: false, reason: MOVE_OTHER_OBJECT });
  assert.deepEqual(pasteCheck({ mode: 'cut', node: fl, objectId: 'k1' }, k2s, ['k2s', 'k2'], 'k2'), { ok: false, reason: MOVE_OTHER_OBJECT });
  assert.deepEqual(pasteCheck({ mode: 'cut', node: fl, objectId: 'k1' }, s2, ['s2', 'k1'], 'k1'), { ok: true }, 'этаж в другую секцию того же корпуса');
  assert.equal((pasteCheck({ mode: 'copy', node: sec, objectId: 'k1' }, fl, ['f1', 's1', 'k1'], 'k1') as { reason: string }).reason, 'Нельзя вставить место внутрь самого себя');
  assert.equal((pasteCheck({ mode: 'copy', node: sec, objectId: 'k1' }, s2, ['s2', 'k1'], 'k1') as { reason: string }).reason, 'Секцию можно вставить только в объект');
  assert.equal((pasteCheck({ mode: 'copy', node: apt, objectId: 'k1' }, k1, ['k1'], 'k1') as { reason: string }).reason, 'Помещение — в этаж или секцию');
  assert.equal((pasteCheck({ mode: 'copy', node: fl, objectId: 'k1' }, P('a9', 'f9', 'apartment', 'кв. 9'), ['a9', 'f9', 's2', 'k1'], 'k1') as { reason: string }).reason, 'В помещение вставить нельзя');
  assert.equal((pasteCheck({ mode: 'cut', node: fl, objectId: 'k1' }, sec, ['s1', 'k1'], 'k1') as { reason: string }).reason, 'Место уже здесь — порядок меняют «Выше / Ниже»');
  assert.equal(pasteCheck({ mode: 'copy', node: k1, objectId: 'k1' }, k2, ['k2'], 'k2').ok, false, 'объект не копируется');
});

test('«Выше / Ниже» и место при перетаскивании', () => {
  const sibs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(stepBefore(sibs, 'a', -1), null);
  assert.deepEqual(stepBefore(sibs, 'b', -1), { before: 'a' });
  assert.deepEqual(stepBefore(sibs, 'a', 1), { before: 'c' });
  assert.deepEqual(stepBefore(sibs, 'b', 1), { before: null }, 'предпоследний вниз — в конец');
  assert.equal(stepBefore(sibs, 'c', 1), null);
  const over = P('b', 'f', 'apartment', 'кв. 2');
  assert.deepEqual(dropPlace(over, 'before', sibs, 'x'), { parent: 'f', before: 'b' });
  assert.deepEqual(dropPlace(over, 'after', sibs, 'x'), { parent: 'f', before: 'c' });
  assert.deepEqual(dropPlace(P('c', 'f', 'apartment', 'кв. 3'), 'after', sibs, 'x'), { parent: 'f', before: null });
  assert.deepEqual(dropPlace(over, 'after', sibs, 'c'), { parent: 'f', before: null }, 'перетаскиваемое не считается соседом');
  assert.deepEqual(dropPlace(over, 'inside', sibs, 'x'), { parent: 'b', before: null });
});

test('стек «Отменить»: по порядку, не больше UNDO_LIMIT', () => {
  let l: ReturnType<typeof pushUndo> = [];
  for (let i = 1; i <= UNDO_LIMIT + 5; i++) l = pushUndo(l, { id: i, label: 'д' + i, undo: async () => ({ ok: true }) });
  assert.equal(l.length, UNDO_LIMIT);
  assert.equal(l[l.length - 1].id, UNDO_LIMIT + 5, 'последнее — сверху');
  assert.equal(l[0].id, 6);
});

test('шахматка: секции разной высоты, пустой этаж, подвал внизу, кровля сверху; нестандартная структура — недоступна', () => {
  const s1 = P('s1', 'k', 'section', 'Секция 1'), s2 = P('s2', 'k', 'section', 'Секция 2');
  const floors = {
    s1: [P('b1', 's1', 'floor', 'Подвал'), P('f11', 's1', 'floor', 'эт. 1'), P('f12', 's1', 'floor', 'эт. 2'), P('f13', 's1', 'floor', 'эт. 3'), P('r1', 's1', 'other', 'Кровля')],
    s2: [P('f21', 's2', 'floor', 'эт. 1'), P('f22', 's2', 'floor', 'эт. 2')]
  };
  const places = { f11: [P('a1', 'f11', 'apartment', 'кв. 1'), P('a2', 'f11', 'apartment', 'кв. 2')], f12: [P('a3', 'f12', 'apartment', 'кв. 3')], f13: [],
    f21: [P('a4', 'f21', 'apartment', 'кв. 4')], f22: [P('a5', 'f22', 'apartment', 'кв. 5')] };
  const g = buildChess([s1, s2], floors, places);
  assert.ok(g.ok);
  if (!g.ok) return;
  assert.deepEqual(g.rows.map((r) => r.label), ['Кровля', 'эт. 3', 'эт. 2', 'эт. 1', 'Подвал']);
  assert.equal(g.cols[0].cells['эт. 3']!.places.length, 0, 'пустой этаж — пустая строка, но есть');
  assert.equal(g.cols[1].cells['эт. 3'], undefined, 'у низкой секции клетки этажа нет');
  assert.deepEqual(g.cols[0].cells['эт. 1']!.places.map((p) => p.name), ['кв. 1', 'кв. 2']);
  assert.equal(buildChess([P('o', 'k', 'floor', 'эт. 1')], {}, {}).ok, false, 'под объектом не секции');
  assert.equal(buildChess([s1], { s1: [P('f', 's1', 'floor', 'эт. 1')] }, { f: [P('x', 'f', 'floor', 'антресоль')] }).ok, false, 'в этаже не помещения');
  assert.equal(buildChess([], {}, {}).ok, false);
});
