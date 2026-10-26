/** Расчёт шахматки факта (P2-0017, этап 1): квартира → этаж, «не разнесено», % по объёму только в одной ЕИ, «X из Y» для смеси ЕИ
 *  и «все виды», статусы и значки, Σ факта по ЕИ без потерь, 5 000 позиций ≤ 100 мс. Наименования вымышленные. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildingsOf, cellKey, cellPositions, cellValue, indexPlaces, isClosed, loadPlaces, placePositions, sectionGrid, sectionsOf, unplacedIn, workGrid, workTypesOf } from '../fact/chessboard.ts';
import type { FactPosition } from '../fact/fact.service.ts';
import type { LocationNode } from '../../../platform/core/projects.service.ts';

let seq = 0;
function node(parent: LocationNode | null, type: LocationNode['node_type'], name: string, order: number, childCount = 1): LocationNode {
  return { id: `n${++seq}`, parent_id: parent ? parent.id : null, node_type: type, name, sort_order: order, area: null, depth: parent ? parent.depth + 1 : 1,
    path: parent ? `${parent.path} · ${name}` : name, child_count: childCount };
}
function pos(at: { id: string; path: string }, type: string, work: string, unit: string, plan: number, fact = 0, extra: Partial<FactPosition> = {}): FactPosition {
  return { position_id: `p${++seq}`, location_id: at.id, location_path: at.path, location_type: type, work_type_id: `w:${work}`, work_name: work, unit_code: unit,
    plan_qty: plan, fact_qty: fact, pending_qty: 0, pending_count: 0, last_rejected_note: null, ...extra };
}

/** Генератор корпуса как в 006: корпус → секции → «эт. N» → «кв. N». Квартиры в дерево не попадают (их не грузим). */
function building(name: string, sections: number, floors: number, apts: number) {
  const b = node(null, 'building', name, 1, sections);
  const nodes: LocationNode[] = [b]; const floorNodes: LocationNode[] = []; const aptRefs: { id: string; path: string; floor: LocationNode }[] = [];
  let kv = 0;
  for (let s = 1; s <= sections; s++) {
    const sec = node(b, 'section', `Секция ${s}`, s, floors); nodes.push(sec);
    for (let f = 1; f <= floors; f++) {
      const fl = node(sec, 'floor', `эт. ${f}`, f, apts); nodes.push(fl); floorNodes.push(fl);
      for (let a = 1; a <= apts; a++) aptRefs.push({ id: `a${++seq}`, path: `${fl.path} · кв. ${++kv}`, floor: fl });
    }
  }
  return { b, nodes, floorNodes, aptRefs };
}

test('isClosed: факт ≥ план; ровно план — закрыта; хвост округления не мешает', () => {
  const p = pos({ id: 'x', path: 'x' }, 'floor', 'Стяжка', 'м²', 10, 10);
  assert.equal(isClosed(p), true);
  assert.equal(isClosed({ ...p, fact_qty: 9.999 }), false);
  assert.equal(isClosed({ ...p, fact_qty: 0.1 + 0.2, plan_qty: 0.3 }), true);
  assert.equal(isClosed({ ...p, fact_qty: 12 }), true, 'перебор — тоже закрыта');
});

test('cellValue: один вид в одной ЕИ — % по объёму; смесь ЕИ — «закрыто X из Y»; «все виды» — «X из Y»; статусы и значки', () => {
  const at = { id: 'f', path: 'К · эт. 1' };
  const a = pos(at, 'floor', 'Штукатурка', 'м²', 100, 50);
  const b = pos(at, 'floor', 'Штукатурка', 'м²', 100, 100);
  const vol = cellValue([a, b], true);
  assert.equal(vol.kind, 'volume'); assert.equal(vol.pct, 75); assert.equal(vol.plan, 200); assert.equal(vol.fact, 150); assert.equal(vol.unit, 'м²');
  assert.equal(vol.state, 'progress'); assert.equal(vol.closed, 1); assert.equal(vol.total, 2);

  const c = pos(at, 'floor', 'Штукатурка', 'м³', 5, 5);
  const mixed = cellValue([a, b, c], true);
  assert.equal(mixed.kind, 'count', 'разные ЕИ не складываются');
  assert.equal(mixed.plan, 0); assert.equal(mixed.unit, '');
  assert.equal(mixed.closed, 2); assert.equal(mixed.total, 3); assert.equal(mixed.pct, 66.7);

  const all = cellValue([a, b], false);
  assert.equal(all.kind, 'count', '«все виды» — всегда X из Y'); assert.equal(all.pct, 50);

  assert.equal(cellValue([], true).kind, 'empty'); assert.equal(cellValue([], true).state, 'none');
  assert.equal(cellValue([pos(at, 'floor', 'Х', 'шт', 3)], true).state, 'todo');
  assert.equal(cellValue([b], true).state, 'done');

  const pend = pos(at, 'floor', 'Х', 'шт', 3, 3, { pending_count: 2, pending_qty: 1.5 });
  const rej = pos(at, 'floor', 'Х', 'шт', 3, 0, { last_rejected_note: 'не тот объём' });
  const flags = cellValue([pend, rej], true);
  assert.equal(flags.pending, 1); assert.equal(flags.pendingQty, 1.5); assert.equal(flags.rejected, 1);
  assert.equal(flags.fact, 3, 'ждущий подтверждения объём в факт не входит');
});

test('2 корпуса × 3 секции × 10 этажей × 4 кв.: квартиры поднимаются до этажа, корпус — «не разнесено», Σ по ЕИ сходится', () => {
  const k1 = building('Корпус 1', 3, 10, 4);
  const k2 = building('Корпус 2', 3, 10, 4);
  const idx = indexPlaces([...k1.nodes, ...k2.nodes]);
  assert.equal(idx.floors.length, 60);
  assert.deepEqual(buildingsOf(idx).map((b) => b.name), ['Корпус 1', 'Корпус 2']);
  assert.deepEqual(sectionsOf(idx, k1.b.id).map((s) => s.name), ['Секция 1', 'Секция 2', 'Секция 3']);

  const list: FactPosition[] = [];
  for (const ap of [...k1.aptRefs, ...k2.aptRefs]) list.push(pos(ap, 'apartment', 'Окраска стен', 'м²', 20, ap.floor.name === 'эт. 1' ? 20 : 0));
  for (const fl of [...k1.floorNodes, ...k2.floorNodes]) list.push(pos(fl, 'floor', 'Стяжка', 'м²', 100, 40), pos(fl, 'floor', 'Двери', 'шт', 8, 8));
  list.push(pos(k1.b, 'building', 'Кровля', 'м²', 500, 100), pos(k1.b, 'building', 'Фасад', 'м²', 900));
  const sec1 = k1.nodes.find((n) => n.node_type === 'section')!;
  list.push(pos(sec1, 'section', 'Лифт', 'шт', 1));

  const pl = placePositions(list, idx);
  assert.equal(pl.unplaced.length, 3);
  assert.equal(pl.placed.filter((x) => x.apartment).length, 240);
  assert.equal(unplacedIn(idx, pl, k1.b.id, null).length, 3);
  assert.equal(unplacedIn(idx, pl, k2.b.id, null).length, 0);
  assert.equal(unplacedIn(idx, pl, k1.b.id, 'w:Кровля').length, 1);

  // Σ факта и плана по ЕИ: разнесено + не разнесено = всё (ничего не теряется и не задваивается).
  const sum = (ps: FactPosition[], unit: string, k: 'plan_qty' | 'fact_qty') => ps.filter((p) => p.unit_code === unit).reduce((s, p) => s + p[k], 0);
  for (const u of ['м²', 'шт']) for (const k of ['plan_qty', 'fact_qty'] as const) {
    assert.equal(sum(pl.placed.map((x) => x.pos), u, k) + sum(pl.unplaced, u, k), sum(list, u, k), `${u} ${k}`);
  }

  const g = sectionGrid(idx, pl, k1.b.id, 'w:Окраска стен');
  assert.deepEqual(g.rows.map((r) => r.label).slice(0, 2), ['эт. 10', 'эт. 9'], 'этажи сверху вниз');
  assert.equal(g.rows.length, 10); assert.equal(g.cols.length, 3);
  const c1 = g.cells.get(cellKey('эт. 1', sec1.id))!;
  assert.equal(c1.kind, 'volume'); assert.equal(c1.total, 4); assert.equal(c1.pct, 100); assert.equal(c1.state, 'done');
  assert.equal(g.cells.get(cellKey('эт. 5', sec1.id))!.state, 'todo');

  const ga = sectionGrid(idx, pl, k1.b.id, null);
  const all1 = ga.cells.get(cellKey('эт. 1', sec1.id))!;
  assert.equal(all1.kind, 'count'); assert.equal(all1.total, 6); assert.equal(all1.closed, 5, '4 кв. + двери закрыты, стяжка нет');
  // Σ позиций по ячейкам корпуса = разнесённые позиции корпуса.
  let cnt = 0; for (const v of ga.cells.values()) cnt += v.total;
  assert.equal(cnt, pl.placed.filter((x) => x.floor.building?.id === k1.b.id).length);

  const w = workGrid(idx, pl, k1.b.id, null);
  assert.deepEqual(w.cols.map((c) => c.name), ['Двери', 'Окраска стен', 'Стяжка']);
  const top = w.rows[0];
  assert.equal(top.label, 'эт. 10'); assert.equal(top.childCount, 12, '3 секции × 4 кв.');
  assert.match(w.rows[1].label, /^Секция \d · кв\. \d+$/, 'при нескольких секциях у квартиры видна секция');
  assert.equal(w.rows[1].parent, top.key);
  const floorDoors = w.cells.get(cellKey(top.key, 'w:Двери'))!;
  assert.equal(floorDoors.kind, 'volume'); assert.equal(floorDoors.total, 3); assert.equal(floorDoors.unit, 'шт');
  const aptDoors = w.cells.get(cellKey(w.rows[1].key, 'w:Двери'))!;
  assert.equal(aptDoors.kind, 'empty', 'двери — на этаже, не в квартире');
  const ws = workGrid(idx, pl, k1.b.id, sec1.id);
  assert.equal(ws.rows[0].childCount, 4);
  assert.doesNotMatch(ws.rows[1].label, /Секция/);

  const cp = cellPositions(list, c1);
  assert.equal(cp.length, 4); assert.ok(cp.every((p) => p.location_type === 'apartment'));
  assert.equal(workTypesOf(list).length, 6);
});

test('«Спутник»-подобный объект: позиции только на корпусе → сетка пустая, всё в «не разнесено»', () => {
  const b = node(null, 'building', 'Корпус А', 1, 0);
  const idx = indexPlaces([b]);
  const list = [pos(b, 'building', 'Бетон', 'м³', 300, 10), pos(b, 'building', 'Арматура', 'т', 20)];
  const pl = placePositions(list, idx);
  assert.equal(pl.placed.length, 0); assert.equal(pl.unplaced.length, 2);
  assert.deepEqual(buildingsOf(idx), [], 'корпус без этажей — сетки нет');
  assert.equal(unplacedIn(idx, pl, b.id, null).length, 2);
});

test('нестандартные места: этажи прямо в корпусе — колонка «Без секции»; этажи без корпуса — «Без корпуса»', () => {
  const b = node(null, 'building', 'Корпус Б', 1, 2);
  const f1 = node(b, 'floor', '1 этаж', 1, 0), f2 = node(b, 'floor', '2 этаж', 2, 0);
  const loose = node(null, 'floor', 'Подвал', 0, 0);
  const idx = indexPlaces([b, f1, f2, loose]);
  assert.deepEqual(sectionsOf(idx, b.id).map((s) => s.name), ['Без секции']);
  assert.deepEqual(buildingsOf(idx).map((x) => x.name), ['Корпус Б', 'Без корпуса']);
  const pl = placePositions([pos(f2, 'floor', 'Стяжка', 'м²', 10, 3)], idx);
  const g = sectionGrid(idx, pl, b.id, null);
  assert.deepEqual(g.rows.map((r) => r.label), ['2 этаж', '1 этаж']);
  assert.equal(g.cells.get(cellKey('2 этаж', ''))!.state, 'progress');
});

test('loadPlaces: дерево по уровням до этажей, квартиры не запрашиваются', async () => {
  const k = building('Корпус 1', 2, 3, 2);
  const asked: (string | null)[] = [];
  const nodes = await loadPlaces(async (parent) => { asked.push(parent); return k.nodes.filter((n) => n.parent_id === parent); });
  assert.equal(nodes.length, 1 + 2 + 6);
  assert.equal(asked.length, 1 + 1 + 2, 'корень, корпус, две секции — этажи не раскрываются');
});

test('замер: 5 000 позиций — разнесение и обе сетки ≤ 100 мс', () => {
  const k = building('Корпус 1', 4, 25, 10);  // 100 этажей, 1 000 квартир
  const idx = indexPlaces(k.nodes);
  const works = ['Штукатурка', 'Окраска', 'Стяжка', 'Плитка', 'Двери'];
  const list: FactPosition[] = [];
  k.aptRefs.forEach((ap, i) => { for (let j = 0; j < 5; j++) list.push(pos(ap, 'apartment', works[j], j === 4 ? 'шт' : 'м²', 30, (i * 7 + j) % 40)); });
  assert.equal(list.length, 5000);
  const t0 = performance.now();
  const pl = placePositions(list, idx);
  const g1 = sectionGrid(idx, pl, k.b.id, null);
  const g2 = sectionGrid(idx, pl, k.b.id, 'w:Штукатурка');
  const g3 = workGrid(idx, pl, k.b.id, null);
  const ms = performance.now() - t0;
  assert.equal(pl.placed.length, 5000);
  assert.equal(g1.rows.length, 25); assert.equal(g2.cols.length, 4); assert.equal(g3.rows.length, 25 + 1000);
  assert.ok(ms <= 100, `расчёт ${ms.toFixed(1)} мс`);
  console.log(`  замер: 5 000 позиций → ${ms.toFixed(1)} мс`);
});
