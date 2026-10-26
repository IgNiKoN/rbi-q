/**
 * Расчёт шахматки факта (P2-0017): ячейки «этаж × секция» и «этаж/квартира × вид работ» из позиций pf_fact_positions и дерева мест
 * ядра. Своих данных нет — только представление: план, факт и «ждёт подтверждения» приходят с сервера (единый расчёт 009).
 *  · позиция квартиры поднимается до её этажа, позиция этажа остаётся на нём; выше этажа (корпус, секция, other) — «не разнесено»;
 *  · один вид работ в одной ЕИ — % по объёму (Σ факт / Σ план); смесь ЕИ или «все виды» — «закрыто X из Y позиций» (ЕИ не складываем, §9);
 *  · правило «позиция закрыта» — только здесь: факт ≥ план.
 * Чистые функции — без обращения к серверу и DOM (кроме loadPlaces, которой передают функцию загрузки уровня).
 */
import type { FactPosition } from './fact.service.ts';
import type { LocationNode } from '../../../platform/core/projects.service.ts';
import { percent, round3 } from './fact.ts';

export type CellState = 'none' | 'todo' | 'progress' | 'done';
export interface CellValue {
  /** volume — % по объёму в одной ЕИ; count — «закрыто X из Y»; empty — позиций нет. */
  kind: 'empty' | 'volume' | 'count';
  state: CellState;
  total: number; closed: number;
  /** Только для volume. */
  plan: number; fact: number; unit: string;
  /** volume — % по объёму; count — доля закрытых позиций. */
  pct: number;
  pending: number; pendingQty: number; rejected: number;
  ids: string[];
}
export interface Ref { id: string; name: string }
export interface FloorRef { id: string; name: string; path: string; key: string; order: number; building: Ref | null; section: Ref | null }
export interface PlaceIndex { buildings: (Ref & { path: string })[]; floors: FloorRef[]; floorByPath: Map<string, FloorRef> }
export interface Placed { pos: FactPosition; floor: FloorRef; apartment: Ref | null }
export interface Placement { placed: Placed[]; unplaced: FactPosition[] }
export interface Row { key: string; label: string; parent?: string; childCount?: number }
export interface Grid { rows: Row[]; cols: Ref[]; cells: Map<string, CellValue> }

export const NO_SECTION: Ref = { id: '', name: 'Без секции' };
export const NO_BUILDING = '';
const SEP = ' · ';
export const cellKey = (row: string, col: string): string => `${row}|${col}`;

/** Позиция закрыта: накопленный (принятый) факт не меньше плана. Единственное место этого правила. */
export const isClosed = (p: FactPosition): boolean => round3(p.fact_qty) >= round3(p.plan_qty);

/** Значение ячейки. byVolume — выбран один вид работ: % по объёму, если у позиций одна ЕИ, иначе «X из Y». */
export function cellValue(list: FactPosition[], byVolume: boolean): CellValue {
  const units = new Set(list.map((p) => p.unit_code));
  const volume = byVolume && units.size === 1;
  let plan = 0, fact = 0, closed = 0, pending = 0, pendingQty = 0, rejected = 0, started = false;
  for (const p of list) {
    if (volume) { plan += p.plan_qty; fact += p.fact_qty; }
    if (isClosed(p)) closed++;
    if (p.fact_qty > 0) started = true;
    if (p.pending_count > 0) { pending++; pendingQty += p.pending_qty; }
    if (p.last_rejected_note) rejected++;
  }
  const total = list.length;
  const state: CellState = !total ? 'none' : closed === total ? 'done' : started ? 'progress' : 'todo';
  return {
    kind: !total ? 'empty' : volume ? 'volume' : 'count', state, total, closed,
    plan: round3(plan), fact: round3(fact), unit: volume ? list[0].unit_code : '',
    pct: !total ? 0 : volume ? percent(fact, plan) : Math.round((closed / total) * 1000) / 10,
    pending, pendingQty: round3(pendingQty), rejected, ids: list.map((p) => p.position_id)
  };
}

/** Номер этажа для порядка строк: число из названия («эт. 12», «-1 этаж»), иначе порядок узла. */
function floorOrder(n: LocationNode): number {
  const m = /-?\d+/.exec(n.name);
  return m ? Number(m[0]) : n.sort_order;
}
const floorKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** Индекс мест: корпуса и этажи с их корпусом и секцией (ближайшие предки). Квартиры не нужны — их позиции поднимаются по пути. */
export function indexPlaces(nodes: LocationNode[]): PlaceIndex {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const up = (n: LocationNode, type: string): Ref | null => {
    for (let cur = n.parent_id ? byId.get(n.parent_id) : undefined; cur; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) {
      if (cur.node_type === type) return { id: cur.id, name: cur.name };
    }
    return null;
  };
  const floors: FloorRef[] = nodes.filter((n) => n.node_type === 'floor').map((n) => ({
    id: n.id, name: n.name, path: n.path, key: floorKey(n.name), order: floorOrder(n), building: up(n, 'building'), section: up(n, 'section') }));
  return {
    buildings: nodes.filter((n) => n.node_type === 'building').map((n) => ({ id: n.id, name: n.name, path: n.path })),
    floors, floorByPath: new Map(floors.map((f) => [f.path, f]))
  };
}

/** Разнести позиции по этажам. Квартира → её этаж (по пути места); этаж → он сам; всё прочее — «не разнесено». */
export function placePositions(positions: FactPosition[], idx: PlaceIndex): Placement {
  const placed: Placed[] = []; const unplaced: FactPosition[] = [];
  for (const pos of positions) {
    let floor: FloorRef | undefined; let apartment: Ref | null = null;
    if (pos.location_type === 'floor') floor = idx.floorByPath.get(pos.location_path);
    else if (pos.location_type === 'apartment') {
      const cut = pos.location_path.lastIndexOf(SEP);
      floor = cut > 0 ? idx.floorByPath.get(pos.location_path.slice(0, cut)) : undefined;
      apartment = { id: pos.location_id, name: cut > 0 ? pos.location_path.slice(cut + SEP.length) : pos.location_path };
    }
    if (floor) placed.push({ pos, floor, apartment }); else unplaced.push(pos);
  }
  return { placed, unplaced };
}

const inBuilding = (f: FloorRef, building: string): boolean => (f.building ? f.building.id : NO_BUILDING) === building;
const byWork = (p: FactPosition, work: string | null): boolean => work === null || p.work_type_id === work;
const sortRefs = (a: Ref, b: Ref): number => a.name.localeCompare(b.name, 'ru', { numeric: true });

/** Корпуса для выбора: те, где есть этажи, плюс «без корпуса», если этажи вне корпусов. */
export function buildingsOf(idx: PlaceIndex): Ref[] {
  const out: Ref[] = idx.buildings.filter((b) => idx.floors.some((f) => f.building?.id === b.id)).map((b) => ({ id: b.id, name: b.name }));
  if (idx.floors.some((f) => !f.building)) out.push({ id: NO_BUILDING, name: 'Без корпуса' });
  return out;
}
/** Секции корпуса (по этажам); этажи прямо в корпусе — колонка «Без секции». */
export function sectionsOf(idx: PlaceIndex, building: string): Ref[] {
  const m = new Map<string, Ref>();
  for (const f of idx.floors) if (inBuilding(f, building)) m.set(f.section ? f.section.id : '', f.section || NO_SECTION);
  return [...m.values()].sort((a, b) => (a.id === '' ? 1 : b.id === '' ? -1 : sortRefs(a, b)));
}
/** Виды работ проекта (из позиций), по названию. */
export function workTypesOf(positions: FactPosition[]): Ref[] {
  const m = new Map<string, Ref>();
  for (const p of positions) if (!m.has(p.work_type_id)) m.set(p.work_type_id, { id: p.work_type_id, name: p.work_name });
  return [...m.values()].sort(sortRefs);
}

/** Строки-этажи корпуса сверху вниз (одноимённые этажи разных секций — одна строка). */
function floorRows(idx: PlaceIndex, building: string, section: string | null): Row[] {
  const m = new Map<string, { label: string; order: number }>();
  for (const f of idx.floors) {
    if (!inBuilding(f, building) || (section !== null && (f.section ? f.section.id : '') !== section)) continue;
    const cur = m.get(f.key);
    if (!cur || f.order > cur.order) m.set(f.key, { label: f.name, order: f.order });
  }
  return [...m.entries()].sort((a, b) => b[1].order - a[1].order || a[1].label.localeCompare(b[1].label, 'ru')).map(([key, v]) => ({ key, label: v.label }));
}

function collect(map: Map<string, FactPosition[]>, key: string, pos: FactPosition): void {
  const list = map.get(key);
  if (list) list.push(pos); else map.set(key, [pos]);
}

/** «Этажи × секции»: строка — этаж, столбец — секция; work — один вид работ или null («все виды»). */
export function sectionGrid(idx: PlaceIndex, pl: Placement, building: string, work: string | null): Grid {
  const rows = floorRows(idx, building, null);
  const cols = sectionsOf(idx, building);
  const groups = new Map<string, FactPosition[]>();
  for (const it of pl.placed) {
    if (!inBuilding(it.floor, building) || !byWork(it.pos, work)) continue;
    collect(groups, cellKey(it.floor.key, it.floor.section ? it.floor.section.id : ''), it.pos);
  }
  const cells = new Map<string, CellValue>();
  for (const r of rows) for (const c of cols) cells.set(cellKey(r.key, c.id), cellValue(groups.get(cellKey(r.key, c.id)) || [], work !== null));
  return { rows, cols, cells };
}

/** «Этажи/квартиры × виды работ»: строка — этаж (и под ним его квартиры), столбец — вид работ; section — одна секция или null (все). */
export function workGrid(idx: PlaceIndex, pl: Placement, building: string, section: string | null): Grid {
  const floors = floorRows(idx, building, section);
  const items = pl.placed.filter((it) => inBuilding(it.floor, building) && (section === null || (it.floor.section ? it.floor.section.id : '') === section));
  const cols = workTypesOf(items.map((it) => it.pos));
  const manySections = section === null && sectionsOf(idx, building).length > 1;
  const groups = new Map<string, FactPosition[]>();
  const apts = new Map<string, Map<string, string>>();
  for (const it of items) {
    collect(groups, cellKey(it.floor.key, it.pos.work_type_id), it.pos);
    if (!it.apartment) continue;
    const rk = `${it.floor.key}/${it.apartment.id}`;
    collect(groups, cellKey(rk, it.pos.work_type_id), it.pos);
    const label = manySections && it.floor.section ? `${it.floor.section.name}${SEP}${it.apartment.name}` : it.apartment.name;
    const fa = apts.get(it.floor.key) || new Map<string, string>();
    fa.set(rk, label); apts.set(it.floor.key, fa);
  }
  const rows: Row[] = [];
  for (const f of floors) {
    const children = [...(apts.get(f.key) || new Map<string, string>()).entries()].sort((a, b) => a[1].localeCompare(b[1], 'ru', { numeric: true }));
    rows.push({ ...f, childCount: children.length });
    for (const [key, label] of children) rows.push({ key, label, parent: f.key });
  }
  const cells = new Map<string, CellValue>();
  for (const r of rows) for (const c of cols) cells.set(cellKey(r.key, c.id), cellValue(groups.get(cellKey(r.key, c.id)) || [], true));
  return { rows, cols, cells };
}

/** «Не разнесено по этажам» в корпусе: позиции на корпусе, секции, other (и вне известных этажей); work — фильтр вида. */
export function unplacedIn(idx: PlaceIndex, pl: Placement, building: string, work: string | null): FactPosition[] {
  const b = idx.buildings.find((x) => x.id === building);
  return pl.unplaced.filter((p) => byWork(p, work) && (b ? p.location_path === b.path || p.location_path.startsWith(b.path + SEP) : true));
}

/** Позиции ячейки (для панели быстрого ввода) — в порядке пути места и названия работы. */
export function cellPositions(positions: FactPosition[], cell: CellValue): FactPosition[] {
  const ids = new Set(cell.ids);
  return positions.filter((p) => ids.has(p.position_id))
    .sort((a, b) => a.location_path.localeCompare(b.location_path, 'ru', { numeric: true }) || a.work_name.localeCompare(b.work_name, 'ru'));
}

/** Дерево мест до этажей включительно — по уровням, параллельно (квартиры не грузим: их позиции поднимаются по пути). */
export async function loadPlaces(listLevel: (parent: string | null) => Promise<LocationNode[]>): Promise<LocationNode[]> {
  const all: LocationNode[] = [];
  let level = await listLevel(null);
  while (level.length) {
    all.push(...level);
    const next = level.filter((n) => n.node_type !== 'floor' && n.node_type !== 'apartment' && n.child_count > 0);
    level = (await Promise.all(next.map((n) => listLevel(n.id)))).flat();
  }
  return all;
}
