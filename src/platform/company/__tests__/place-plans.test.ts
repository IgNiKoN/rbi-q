/// <reference types="node" />
/** P2-0057: разбор имён PDF-планов и сопоставление с этажами / квартирами объекта. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchPlanFiles, parsePlanName, pinsText, placeNum, plansByPlace, planSlots, sizeText } from '../place-plans.ts';
import type { PlaceNode, PlacePlan } from '../../core/projects.service.ts';

const P = (id: string, parent: string | null, type: string, name: string, build: string | null = null): PlaceNode =>
  ({ id, parent_id: parent, node_type: type, object_kind: null, name, build_no: build, bti_no: null, sort_order: 0, depth: 0, path: name,
     child_count: 0, apartment_count: null } as unknown as PlaceNode);

test('parsePlanName: этаж, квартира, секция, минус-этаж, только число, без номера', () => {
  assert.deepEqual(parsePlanName('Этаж 3.pdf'), { kind: 'floor', num: 3, section: null });
  assert.deepEqual(parsePlanName('3 этаж.PDF'), { kind: 'floor', num: 3, section: null });
  assert.deepEqual(parsePlanName('3-й этаж.pdf'), { kind: 'floor', num: 3, section: null });
  assert.deepEqual(parsePlanName('эт.-1.pdf'), { kind: 'floor', num: -1, section: null });
  assert.deepEqual(parsePlanName('План_эт_12.pdf'), { kind: 'floor', num: 12, section: null });
  assert.deepEqual(parsePlanName('кв 45.pdf'), { kind: 'apartment', num: 45, section: null });
  assert.deepEqual(parsePlanName('Квартира №7.pdf'), { kind: 'apartment', num: 7, section: null });
  assert.deepEqual(parsePlanName('Секция 2 этаж 5.pdf'), { kind: 'floor', num: 5, section: 2 });
  assert.deepEqual(parsePlanName('с1 эт 5.pdf'), { kind: 'floor', num: 5, section: 1 });
  assert.deepEqual(parsePlanName('5.pdf'), { kind: null, num: 5, section: null });
  assert.deepEqual(parsePlanName('Общий план.pdf'), { kind: null, num: null, section: null });
  assert.equal(placeNum('эт. -1'), -1);
  assert.equal(placeNum('Секция'), null);
});

// Корпус: Секция 1 (эт. 1–3, кв. 1–6), Секция 2 (эт. 1–2, кв. 101–104); квартира с номером из стр. №
const K = P('k', null, 'object', 'Корпус 1');
const S1 = P('s1', 'k', 'section', 'Секция 1'), S2 = P('s2', 'k', 'section', 'Секция 2');
const kids: Record<string, PlaceNode[]> = {
  k: [S1, S2],
  s1: [1, 2, 3].map((n) => P('s1f' + n, 's1', 'floor', 'эт. ' + n)),
  s2: [1, 2].map((n) => P('s2f' + n, 's2', 'floor', 'эт. ' + n)),
  s1f1: [P('a1', 's1f1', 'apartment', 'кв. 1'), P('a2', 's1f1', 'apartment', 'кв. 2')],
  s2f1: [P('a101', 's2f1', 'apartment', 'кв. 101'), P('a102', 's2f1', 'apartment', 'Помещение', '102')]
};

test('planSlots: этажи и квартиры объекта с секцией и подписью', () => {
  const s = planSlots(K, kids);
  assert.deepEqual(s.map((x) => x.place.id), ['s1f1', 'a1', 'a2', 's1f2', 's1f3', 's2f1', 'a101', 'a102', 's2f2']);
  assert.equal(s.find((x) => x.place.id === 'a101')!.label, 'Секция 2 · эт. 1 · кв. 101');
  assert.equal(s.find((x) => x.place.id === 'a101')!.section!.id, 's2');
  assert.deepEqual(planSlots(S2, kids).map((x) => x.place.id), ['s2f1', 'a101', 'a102', 's2f2']);
});

test('matchPlanFiles: этажи по номеру (во все секции), секция в имени сужает, квартиры по номеру и стр. №, нет — выберите', () => {
  const m = matchPlanFiles(['Этаж 3.pdf', 'Этаж 1.pdf', 'Секция 2 эт 2.pdf', 'кв 2.pdf', 'кв 102.pdf', 'Этаж 9.pdf', 'Общий.pdf'], planSlots(K, kids));
  assert.deepEqual(m.map((x) => x.targets), [['s1f3'], ['s1f1', 's2f1'], ['s2f2'], ['a2'], ['a102'], [], []]);
  assert.deepEqual(m[1].options, [['s1f1', 's2f1'], ['s1f1'], ['s2f1']]);
  assert.match(m[5].reason, /Не нашлось/);
  assert.match(m[6].reason, /нет номера/);
});

test('matchPlanFiles: два файла на одно место — второй ждёт выбора; брошено на секцию — только её места', () => {
  const m = matchPlanFiles(['Этаж 2.pdf', '2 этаж (новый).pdf'], planSlots(S1, kids));
  assert.deepEqual(m.map((x) => x.targets), [['s1f2'], []]);
  assert.match(m[1].reason, /уже есть файл/);
  const dup = { ...kids, s2f2: [P('a2b', 's2f2', 'apartment', 'кв. 2')] };
  const q = matchPlanFiles(['кв 2.pdf'], planSlots(K, dup));
  assert.deepEqual(q[0].targets, []);
  assert.deepEqual(q[0].options, [['a2'], ['a2b']]);
});

test('plansByPlace, sizeText, pinsText', () => {
  const v = (id: string, loc: string, no: number, cur: boolean): PlacePlan => ({ id, location_id: loc, version_no: no, is_current: cur, file_name: id + '.pdf',
    file_size: 1, file_url: 'u', created_by: null, author: '', created_at: '2026-10-31T10:00:00Z' });
  const g = plansByPlace([v('d1', 'f1', 1, false), v('d2', 'f1', 2, true), v('d3', 'f2', 1, false)]);
  assert.equal(g.f1.current!.id, 'd2');
  assert.deepEqual(g.f1.versions.map((x) => x.version_no), [2, 1]);
  assert.equal(g.f2.current, null);
  assert.equal(sizeText(1288490), '1,2 МБ');
  assert.equal(sizeText(340 * 1024), '340 КБ');
  assert.equal(pinsText(0), '');
  assert.equal(pinsText(1), 'На этом плане 1 замечание — точки останутся на тех же местах листа.');
  assert.match(pinsText(3), /3 замечания/);
  assert.match(pinsText(11), /11 замечаний/);
});
