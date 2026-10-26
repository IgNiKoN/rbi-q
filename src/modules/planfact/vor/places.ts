/**
 * Места ВОР → узлы дерева объекта (P2-0006, этап 4). Чистые функции + обход дерева через переданный загрузчик детей
 * (тот же pf_list_locations, что у «Справочники → Объекты»; второго дерева нет).
 *
 * Правила:
 *  - контекст строки «Корпус 7 · Секция 1 · Этаж 2» → цепочка шагов building → section → floor; узел ищется среди детей
 *    по типу и номеру в названии («Этаж 2» = «эт. 2» из генератора P2-0005), иначе — по точному названию;
 *  - корпуса в контексте нет, а в корне проекта ровно один корпус — секция ищется в нём;
 *  - «Этажи 4–12» (диапазон) — позиция на уровне секции, диапазон уходит в пометку позиции («эт. 4–12»);
 *  - «кв. 3, 16…» — позиция на ближайшем узле (секция/этаж), список квартир — в пометке;
 *  - строки без места — на узел «Весь объект» в корне (решение владельца 21.10.2026), а если ПТО выбрал «корпус листа»
 *    (P2-0009, К1; по умолчанию угадывается по названию листа «… корп. 1.1») — на этот корпус; корпус листа подставляется
 *    и строкам с секцией/этажом без корпуса;
 *  - «блок N» (корпус в файле не указан, номера секций пошли заново) — ПТО выбирает корпус блока; до выбора место не привязано.
 */
import type { RowContext } from './parse.ts';

export type PlaceType = 'building' | 'section' | 'floor' | 'other';
export interface TreeNode { id: string; parent_id: string | null; node_type: string; name: string; path: string }
export interface PlaceStep { type: PlaceType; value: string; name: string }
export interface Place { key: string; label: string; steps: PlaceStep[]; pendingBlock?: number }
export interface Binding { key: string; nodeId: string | null; path: string | null; missing: PlaceStep[]; missingParent: string | null; pendingBlock?: number }
/** Корпус, выбранный ПТО для блока: номер и название (как у узла дерева или нового узла). */
export interface BlockChoice { value: string; name: string }
export type LoadChildren = (parentId: string | null) => Promise<TreeNode[]>;

export const WHOLE_OBJECT = 'Весь объект';
const NONE_KEY = '∅';

/** Шаги места по контексту строки. Диапазон этажей не даёт шага (позиция — на секции). Пустой контекст → «Весь объект».
 *  Блок без корпуса: корпус берётся из выбора ПТО (blocks), иначе место ждёт выбора (pendingBlock). */
export function placeOf(ctx: RowContext, blocks?: Record<number, BlockChoice>, sheet?: BlockChoice | null): Place {
  const steps: PlaceStep[] = [];
  const chosen = !ctx.building && ctx.block ? (blocks || {})[ctx.block] : !ctx.building && sheet ? sheet : undefined;
  if (ctx.building) steps.push({ type: 'building', value: ctx.building, name: `Корпус ${ctx.building}` });
  else if (chosen) steps.push({ type: 'building', value: chosen.value, name: chosen.name });
  if (ctx.section) steps.push({ type: 'section', value: ctx.section, name: `Секция ${ctx.section}` });
  if (ctx.floor && ctx.floor.from === ctx.floor.to) steps.push({ type: 'floor', value: String(ctx.floor.from), name: `Этаж ${ctx.floor.from}` });
  if (!ctx.building && ctx.block && !chosen) {
    return { key: `block:${ctx.block}/` + steps.map((s) => `${s.type}:${s.value.toLowerCase()}`).join('/'),
      label: [`Блок ${ctx.block} (корпус не указан)`, ...steps.map((s) => s.name)].join(' · '), steps, pendingBlock: ctx.block };
  }
  if (!steps.length) return { key: NONE_KEY, label: 'Без указания места', steps: [{ type: 'other', value: '', name: WHOLE_OBJECT }] };
  return { key: steps.map((s) => `${s.type}:${s.value.toLowerCase()}`).join('/'), label: steps.map((s) => s.name).join(' · '), steps };
}

/** Пометка позиции: диапазон этажей и список квартир («эт. 4–12 · кв. 3, 16»). */
export function placeNote(ctx: RowContext): string | null {
  const parts: string[] = [];
  if (ctx.floor && ctx.floor.from !== ctx.floor.to) parts.push(`эт. ${ctx.floor.from}–${ctx.floor.to}`);
  if (ctx.apartments) parts.push(ctx.apartments);
  return parts.length ? parts.join(' · ') : null;
}

/** Номер в названии узла: «Секция 2» → «2», «эт. 7» → «7», «Корпус 1А» → «1а», «Корпус 1.1» → «1.1». */
export function nodeNumber(name: string): string | null {
  const m = String(name).match(/(\d+(?:\.\d+)*[\p{L}]?)/u);
  return m ? m[1].toLowerCase() : null;
}

/** Корпус по названию листа заказчика: «себес уч.2 корп. 1.1» → Корпус 1.1; «Корпус 3А» → Корпус 3А; иначе null. */
export function sheetBuilding(sheetName: string): BlockChoice | null {
  const m = String(sheetName || '').match(/корп(?:ус)?\.?\s*№?\s*(\d+(?:[.,]\d+)*[\p{L}]?)/iu);
  if (!m) return null;
  const value = m[1].replace(',', '.');
  return { value: value.toLowerCase(), name: `Корпус ${value}` };
}

const canon = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Узел шага среди детей: тип + номер, иначе точное название. */
export function matchChild(children: TreeNode[], step: PlaceStep): TreeNode | null {
  const byName = children.find((c) => canon(c.name) === canon(step.name));
  if (step.type === 'other') return byName || null;
  const same = children.filter((c) => c.node_type === step.type);
  return same.find((c) => nodeNumber(c.name) === step.value.toLowerCase()) || byName || null;
}

/** Привязка мест к дереву. Загрузчик детей вызывается один раз на узел (кэш). */
export async function bindPlaces(places: Place[], load: LoadChildren): Promise<Binding[]> {
  const cache = new Map<string, Promise<TreeNode[]>>();
  const kids = (p: string | null): Promise<TreeNode[]> => {
    const k = p || '';
    if (!cache.has(k)) cache.set(k, load(p));
    return cache.get(k) as Promise<TreeNode[]>;
  };
  const out: Binding[] = [];
  for (const pl of places) {
    if (pl.pendingBlock) { out.push({ key: pl.key, nodeId: null, path: null, missing: [], missingParent: null, pendingBlock: pl.pendingBlock }); continue; }
    let parent: string | null = null;
    let node: TreeNode | null = null;
    let i = 0;
    for (; i < pl.steps.length; i++) {
      const step = pl.steps[i];
      let found = matchChild(await kids(parent), step);
      if (!found && parent === null && step.type === 'section') {
        const buildings = (await kids(null)).filter((c) => c.node_type === 'building');
        if (buildings.length === 1) { parent = buildings[0].id; node = buildings[0]; found = matchChild(await kids(parent), step); }
      }
      if (!found) break;
      node = found; parent = found.id;
    }
    const done = i === pl.steps.length;
    out.push({ key: pl.key, nodeId: done && node ? node.id : null, path: done && node ? node.path : null,
      missing: done ? [] : pl.steps.slice(i), missingParent: done ? null : parent });
  }
  return out;
}

/** Список недостающих узлов без повторов: «Корпус 7 → Секция 1». */
export function missingList(bindings: Binding[], places: Place[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of bindings) {
    if (b.nodeId || b.pendingBlock) continue;
    const pl = places.find((p) => p.key === b.key);
    if (!pl) continue;
    const have = pl.steps.slice(0, pl.steps.length - b.missing.length).map((s) => s.name);
    const label = [...have, ...b.missing.map((s) => s.name)].join(' → ');
    if (!seen.has(label)) { seen.add(label); out.push(label); }
  }
  return out;
}

/** Создать недостающие узлы (по шагам, без дублей): add(parent, type, name) → id. Возвращает число созданных. */
export async function createMissing(bindings: Binding[], places: Place[], add: (parent: string | null, type: PlaceType, name: string) => Promise<string>): Promise<number> {
  const made = new Map<string, string>();   // «родитель|тип:значение» → id созданного
  let n = 0;
  for (const b of bindings) {
    if (b.nodeId || b.pendingBlock) continue;
    const pl = places.find((p) => p.key === b.key);
    if (!pl) continue;
    let parent = b.missingParent;
    for (const step of b.missing) {
      const k = `${parent || ''}|${step.type}:${step.value.toLowerCase()}:${canon(step.name)}`;
      let id = made.get(k);
      if (!id) { id = await add(parent, step.type, step.name); made.set(k, id); n++; }
      parent = id;
    }
  }
  return n;
}
