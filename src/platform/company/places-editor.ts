/**
 * Логика редактора «Объекты и места» (P2-0055) без экрана: название для «+», что можно вставить и куда, положение при
 * «Выше / Ниже» и перетаскивании, стек «Отменить», сетка шахматки. Правила те же, что проверяет сервер (049) — экран лишь
 * заранее показывает, что нельзя, и почему.
 */
import type { PlaceNode } from '../core/projects.service.ts';
import type { PlanNodeType } from '../../services/locations/types.ts';

/** Что создаёт «+» у места: у объекта — секция, у секции — этаж, у этажа — помещение; у помещения «+» нет. */
export const CHILD_TYPE: Record<string, PlanNodeType | null> = { object: 'section', section: 'floor', floor: 'apartment', apartment: null, other: 'other' };
const DEFAULT_NAME: Record<string, string> = { section: 'Секция', floor: 'эт.', apartment: 'кв.', other: 'Место' };
const canon = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');
/** Последнее число в названии: «эт. 12» → { pre: 'эт. ', num: 12, post: '' }, «5 этаж» → { pre: '', num: 5, post: ' этаж' }. */
function split(name: string): { pre: string; num: number; post: string } | null {
  const m = String(name).match(/^(.*?)(\d+)(\D*)$/);
  return m ? { pre: m[1], num: Number(m[2]), post: m[3] } : null;
}

/**
 * Название нового места вида type среди соседей: следующий номер по образцу соседа того же вида с наибольшим номером
 * («эт. 5» → «эт. 6», «5 этаж» → «6 этаж»); без соседей — «Секция 1», «эт. 1». no — номер помещения (строительный).
 * Занятое название не выдаёт.
 */
export function nextChildName(siblings: { name: string; node_type: string }[], type: string, no?: number | null): string {
  let best: { pre: string; num: number; post: string } | null = null;
  for (const s of siblings) {
    if (s.node_type !== type) continue;
    const p = split(s.name);
    if (p && (!best || p.num >= best.num)) best = p;
  }
  const taken = new Set(siblings.map((s) => canon(s.name)));
  let n = no ?? (best ? best.num + 1 : 1);
  const make = (k: number): string => (best ? `${best.pre}${k}${best.post}` : `${DEFAULT_NAME[type] || 'Место'} ${k}`);
  while (taken.has(canon(make(n)))) n++;
  return make(n);
}

/** Название копии на новом уровне: прежнее, а если занято — следующее по номеру («Секция 1» в корпусе с «Секция 1» → «Секция 2»). */
export function pasteName(kids: { name: string; node_type: string }[], source: { name: string; node_type: string }): string {
  if (!kids.some((k) => canon(k.name) === canon(source.name))) return source.name;
  if (split(source.name)) return nextChildName(kids.concat([source]), source.node_type);
  let i = 2;
  while (kids.some((k) => canon(k.name) === canon(`${source.name} (${i})`))) i++;
  return `${source.name} (${i})`;
}

/** Буфер «Копировать / Вырезать»: место, его объект и строка сводки для подсказки («Секция 1 — 5 эт., 20 кв.»). */
export interface Clip { mode: 'copy' | 'cut'; node: PlaceNode; objectId: string }
export function clipSummary(n: PlaceNode): string {
  if (n.node_type === 'section') return `${n.name} — ${n.child_count} эт., ${n.apartment_count ?? 0} кв.`;
  if (n.node_type === 'floor') return `${n.name} — мест ${n.child_count}`;
  if (n.node_type === 'apartment') return n.build_no ? `${n.name} (стр. № ${n.build_no})` : n.name;
  return n.child_count ? `${n.name} — мест ${n.child_count}` : n.name;
}

const PARENTS: Record<string, string[]> = { section: ['object'], floor: ['object', 'section'], apartment: ['floor', 'section', 'other'], other: ['object', 'section', 'floor', 'other'] };
const WHERE: Record<string, string> = { section: 'Секцию можно вставить только в объект', floor: 'Этаж — только в объект или секцию', apartment: 'Помещение — в этаж или секцию', other: 'Сюда вставить нельзя' };
export const MOVE_OTHER_OBJECT = 'Переносить можно только внутри объекта; в другой объект — копировать и вставить';
export type Check = { ok: true } | { ok: false; reason: string };

/**
 * Можно ли вставить буфер в место target. lineage — id мест от target вверх до объекта (включая target), targetObjectId — объект target.
 * Вырезанное — только внутри своего объекта (решение владельца 28.10); в себя и свою ветку — нельзя.
 */
export function pasteCheck(clip: Clip, target: PlaceNode, lineage: string[], targetObjectId: string): Check {
  const n = clip.node;
  if (n.node_type === 'object') return { ok: false, reason: 'Объект не копируется — копируются секция, этаж, помещение' };
  if (target.id === n.id || lineage.includes(n.id)) return { ok: false, reason: 'Нельзя вставить место внутрь самого себя' };
  if (clip.mode === 'cut' && targetObjectId !== clip.objectId) return { ok: false, reason: MOVE_OTHER_OBJECT };
  if (target.node_type === 'apartment') return { ok: false, reason: 'В помещение вставить нельзя' };
  if (!(PARENTS[n.node_type] || []).includes(target.node_type)) return { ok: false, reason: WHERE[n.node_type] || 'Сюда вставить нельзя' };
  if (clip.mode === 'cut' && n.parent_id === target.id) return { ok: false, reason: 'Место уже здесь — порядок меняют «Выше / Ниже»' };
  return { ok: true };
}

/** Порядок среди соседей: «Выше» — встать перед предыдущим; «Ниже» — перед тем, что через одного (или в конец). null — край. */
export function stepBefore(siblings: { id: string }[], id: string, dir: -1 | 1): { before: string | null } | null {
  const i = siblings.findIndex((s) => s.id === id);
  if (i < 0) return null;
  if (dir < 0) return i === 0 ? null : { before: siblings[i - 1].id };
  if (i === siblings.length - 1) return null;
  return { before: i + 2 < siblings.length ? siblings[i + 2].id : null };
}

/** Куда встанет перетаскиваемое: перед / после строки over (тот же родитель) или внутрь неё. */
export function dropPlace(over: PlaceNode, where: 'before' | 'after' | 'inside', siblingsOfOver: { id: string }[], draggedId: string): { parent: string | null; before: string | null } {
  if (where === 'inside') return { parent: over.id, before: null };
  if (where === 'before') return { parent: over.parent_id, before: over.id };
  const rest = siblingsOfOver.filter((s) => s.id !== draggedId);
  const i = rest.findIndex((s) => s.id === over.id);
  return { parent: over.parent_id, before: i >= 0 && i + 1 < rest.length ? rest[i + 1].id : null };
}

/** Стек «Отменить»: последние действия этой вкладки (в памяти), отмена — обратное действие на сервере. */
export interface UndoEntry { id: number; label: string; undo: () => Promise<{ ok: boolean; message?: string }> }
export const UNDO_LIMIT = 20;
export function pushUndo(list: UndoEntry[], e: UndoEntry): UndoEntry[] { return [...list, e].slice(-UNDO_LIMIT); }

// ---------- шахматка ----------
export interface ChessRow { key: string; label: string }
export interface ChessColumn { section: PlaceNode; cells: Record<string, { floor: PlaceNode; places: PlaceNode[] } | undefined> }
export type ChessGrid = { ok: true; rows: ChessRow[]; cols: ChessColumn[] } | { ok: false };
const rank = (name: string): number => {
  const p = split(name.replace(/^-/, ''));
  if (/подвал|цокол|паркинг/i.test(name)) return -1000;
  if (p) return /^\s*-|минус/i.test(name) ? -p.num : p.num;
  return 1000;
};
/**
 * Сетка «секции × этажи»: столбцы — секции по порядку, строки — этажи по номеру (верхний сверху; подвал внизу, кровля сверху),
 * клетки — помещения этажа. Структура не «объект → секция → этаж → помещение» — { ok: false }.
 */
export function buildChess(sections: PlaceNode[], floorsOf: Record<string, PlaceNode[] | undefined>, placesOf: Record<string, PlaceNode[] | undefined>): ChessGrid {
  if (!sections.length || sections.some((s) => s.node_type !== 'section')) return { ok: false };
  const rows = new Map<string, ChessRow & { r: number }>();
  const cols: ChessColumn[] = [];
  for (const s of sections) {
    const col: ChessColumn = { section: s, cells: {} };
    for (const f of floorsOf[s.id] || []) {
      if (f.node_type !== 'floor' && f.node_type !== 'other') return { ok: false };
      const places = placesOf[f.id] || [];
      if (places.some((p) => p.node_type !== 'apartment' && p.node_type !== 'other')) return { ok: false };
      if (f.node_type === 'other' && places.length) return { ok: false };
      const key = canon(f.name);
      if (!rows.has(key)) rows.set(key, { key, label: f.name, r: rank(f.name) });
      col.cells[key] = { floor: f, places };
    }
    cols.push(col);
  }
  const list = [...rows.values()].sort((a, b) => b.r - a.r || a.label.localeCompare(b.label, 'ru')).map(({ key, label }) => ({ key, label }));
  return { ok: true, rows: list, cols };
}
