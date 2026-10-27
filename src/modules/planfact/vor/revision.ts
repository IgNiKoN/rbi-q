/**
 * Новая редакция ВОР (P2-0006b, этап 2). Чистые функции, без сервера.
 *
 * compareRevision — строки действующей редакции (с позициями и фактом, pf_vor_revision_base) ↔ строки нового файла.
 *  Одна и та же строка — по ключу «название + ЕИ + место» (решение владельца 27.10.2026): название — canonName (то же правило,
 *  что словарь и сервер), ЕИ — unitKey («м2» = «м²»), место — по контексту строки (корпус / секция / этаж + пометка этажей
 *  и квартир); номер строки заказчика — не ключ (он сдвигается при вставке), только подсказка порядка у дублей.
 *  Группы: добавлено / удалено / изменился объём / без изменений.
 *  🟡 — ПТО подтверждает: дубль ключа (одинаковые строки в одном месте — пара по порядку), похожее название (сходство ≥ SIMILARITY,
 *       та же ЕИ и место), то же название в том же месте, но другой вид работ / место дерева.
 *  🔴 — факт без плана (строку удалили, факт есть) — решение «перенести на…» / «оставить»; факт больше нового объёма — предупреждение.
 *
 * rowErrors — ошибки разбора с номером строки (PTO-01): нет ЕИ, объём 0 или пусто, место не найдено, итог не сходится.
 */
import { canonName, unitKey, similarity, SIMILARITY } from './matching.ts';
import { placeOf, placeNote } from './places.ts';
import type { ParsedRow, RowContext, SumCheck, KvrCheck } from './parse.ts';

/** Строка действующей редакции (pf_vor_revision_base). */
export interface BaseRow {
  source_row_id: string; row_no: number; number: string | null; name: string; unit_text: string | null; qty: number | null;
  context: RowContext | null; location_id: string | null; work_type_id: string | null; unit_id: string | null;
  position_id: string | null; position_qty: number | null; fact_qty: number; pending_qty: number;
}
/** Строка-работа нового файла (черновик после разбора мест и видов работ). */
export interface NextRow {
  row_no: number; number: string | null; name: string; unit_text: string | null; qty: number | null; context: RowContext | null;
  location_id: string | null; work_type_id: string | null; unit_id: string | null;
}

export type Group = 'added' | 'removed' | 'changed' | 'same';
export type Yellow = 'duplicate' | 'similar' | 'attrs';
export type Red = 'fact_without_plan' | 'fact_over_qty';
export interface CompareItem {
  key: string;            // устойчивый ключ элемента (для решений ПТО)
  group: Group;
  base: BaseRow | null;
  next: NextRow | null;
  yellow: Yellow | null;  // нужно подтверждение ПТО
  red: Red | null;
}
export interface Counts { added: number; removed: number; changed: number; same: number; yellow: number; red: number }
export interface Comparison { items: CompareItem[]; counts: Counts }

const EPS = 1e-9;
const num = (v: number | null | undefined): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const ctxOf = (c: RowContext | null): RowContext => c || {};

/** Место строки для ключа: контекст файла (корпус / секция / этаж) + пометка диапазона этажей и квартир. */
export function placeKey(ctx: RowContext | null): string {
  const c = ctxOf(ctx);
  return placeOf(c).key + '|' + (placeNote(c) || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
/** Ключ «название + ЕИ + место». */
export function rowKey(r: { name: string; unit_text: string | null; context: RowContext | null }): string {
  return canonName(r.name) + '|' + unitKey(r.unit_text) + '|' + placeKey(r.context);
}

/** Атрибуты позиции совпадают (место дерева, вид работ, ЕИ — то, что проверит сервер). Неизвестное с одной стороны не мешает. */
function sameAttrs(b: BaseRow, n: NextRow): boolean {
  const eq = (x: string | null, y: string | null): boolean => !x || !y || x === y;
  return eq(b.location_id, n.location_id) && eq(b.work_type_id, n.work_type_id) && eq(b.unit_id, n.unit_id);
}

function pairItem(b: BaseRow, n: NextRow, yellow: Yellow | null): CompareItem {
  const changed = Math.abs(num(b.qty) - num(n.qty)) > EPS || (b.qty === null) !== (n.qty === null);
  const fact = num(b.fact_qty) + num(b.pending_qty);
  return {
    key: `m:${b.source_row_id}:${n.row_no}`, group: changed ? 'changed' : 'same', base: b, next: n,
    yellow: yellow || (sameAttrs(b, n) ? null : 'attrs'),
    red: b.position_id && fact > num(n.qty) + EPS ? 'fact_over_qty' : null
  };
}

export function compareRevision(base: BaseRow[], next: NextRow[]): Comparison {
  const byKey = <T extends { row_no: number }>(rows: T[], key: (r: T) => string): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const r of [...rows].sort((a, b) => a.row_no - b.row_no)) { const k = key(r); (m.get(k) || m.set(k, []).get(k)!).push(r); }
    return m;
  };
  const bMap = byKey(base, rowKey), nMap = byKey(next, rowKey);
  const items: CompareItem[] = [];
  const usedB = new Set<BaseRow>(), usedN = new Set<NextRow>();

  // 1. Тот же ключ: одна пара — совпадение; несколько одинаковых строк — пары по порядку, 🟡 «дубль».
  for (const [k, ns] of nMap) {
    const bs = bMap.get(k);
    if (!bs) continue;
    const dup = bs.length > 1 || ns.length > 1;
    // при дублях сначала пары с тем же объёмом, затем по порядку строк
    const freeB = [...bs];
    const pairs: [BaseRow, NextRow][] = [];
    for (const n of ns) {
      const i = freeB.findIndex((b) => Math.abs(num(b.qty) - num(n.qty)) <= EPS);
      if (i >= 0) pairs.push([freeB.splice(i, 1)[0], n]);
    }
    for (const n of ns) if (!pairs.some((p) => p[1] === n) && freeB.length) pairs.push([freeB.shift()!, n]);
    for (const [b, n] of pairs) { items.push(pairItem(b, n, dup ? 'duplicate' : null)); usedB.add(b); usedN.add(n); }
  }

  // 2. Похожее название (та же ЕИ и место) — кандидат, 🟡.
  const restB = base.filter((b) => !usedB.has(b));
  for (const n of [...next].sort((a, b) => a.row_no - b.row_no)) {
    if (usedN.has(n)) continue;
    const nk = unitKey(n.unit_text) + '|' + placeKey(n.context);
    let best: BaseRow | null = null, score = 0;
    for (const b of restB) {
      if (usedB.has(b) || unitKey(b.unit_text) + '|' + placeKey(b.context) !== nk) continue;
      const s = similarity(b.name, n.name);
      if (s >= SIMILARITY && s > score) { best = b; score = s; }
    }
    if (best) { items.push(pairItem(best, n, 'similar')); usedB.add(best); usedN.add(n); }
  }

  // 3. Остальное: добавлено / удалено (с фактом — 🔴 «факт без плана»).
  for (const n of next) if (!usedN.has(n)) items.push({ key: `a:${n.row_no}`, group: 'added', base: null, next: n, yellow: null, red: null });
  for (const b of base) {
    if (usedB.has(b)) continue;
    const fact = num(b.fact_qty) + num(b.pending_qty);
    items.push({ key: `r:${b.source_row_id}`, group: 'removed', base: b, next: null, yellow: null,
      red: b.position_id && fact > EPS ? 'fact_without_plan' : null });
  }
  items.sort((x, y) => (x.next?.row_no ?? x.base!.row_no + 0.5) - (y.next?.row_no ?? y.base!.row_no + 0.5));
  return { items, counts: countOf(items) };
}

function countOf(items: CompareItem[]): Counts {
  const c: Counts = { added: 0, removed: 0, changed: 0, same: 0, yellow: 0, red: 0 };
  for (const i of items) { c[i.group]++; if (i.yellow) c.yellow++; if (i.red) c.red++; }
  return c;
}

/** Решения ПТО. yellow: элемент 🟡 → 'same' (та же строка, позиция сохраняется) или 'split' (разные: удалена + добавлена).
 *  red: удалённая позиция с фактом → 'keep' (оставить на снятой) или перенос на позицию / новую строку. */
export interface Decisions {
  yellow: Record<string, 'same' | 'split'>;
  red: Record<string, { action: 'keep' } | { action: 'move'; toPositionId?: string; toRowNo?: number }>;
}

/** Применить решения по 🟡: «разные» — пара распадается на «удалено» + «добавлено» (у удалённой с фактом появится 🔴). */
export function applyYellow(cmp: Comparison, yellow: Decisions['yellow']): Comparison {
  const out: CompareItem[] = [];
  for (const i of cmp.items) {
    if (!i.yellow || yellow[i.key] !== 'split' || !i.base || !i.next) { out.push(i); continue; }
    const fact = num(i.base.fact_qty) + num(i.base.pending_qty);
    out.push({ key: `a:${i.next.row_no}`, group: 'added', base: null, next: i.next, yellow: null, red: null });
    out.push({ key: `r:${i.base.source_row_id}`, group: 'removed', base: i.base, next: null, yellow: null,
      red: i.base.position_id && fact > EPS ? 'fact_without_plan' : null });
  }
  return { items: out, counts: countOf(out) };
}

/** Что ещё мешает «Принять»: нерешённые 🟡, 🔴 «факт без плана» без решения, пары с другими атрибутами («та же» нельзя). */
export function blockers(cmp: Comparison, d: Decisions): string[] {
  const out: string[] = [];
  const y = cmp.items.filter((i) => i.yellow && !d.yellow[i.key]);
  if (y.length) out.push(`Не подтверждено 🟡: ${y.length}`);
  const bad = cmp.items.filter((i) => i.yellow === 'attrs' && d.yellow[i.key] === 'same');
  if (bad.length) out.push(`Место, вид работ или ЕИ другие — «та же строка» нельзя: ${bad.map((i) => 'стр. ' + i.next!.row_no).join(', ')}`);
  const r = cmp.items.filter((i) => i.red === 'fact_without_plan' && !d.red[i.key]);
  if (r.length) out.push(`Факт без плана — нужно решение: ${r.length}`);
  return out;
}

/** Данные для pf_vor_accept_revision: по строке — позиция (та же) или null (новая); по снятой с фактом — решение. */
export function acceptPayload(cmp: Comparison, d: Decisions): { items: { row_no: number; position_id: string | null }[];
  red: { position_id: string; action: 'keep' | 'move'; to_position_id?: string; to_row_no?: number }[] } {
  const final = applyYellow(cmp, d.yellow);
  const items = final.items.filter((i) => i.next).map((i) => ({ row_no: i.next!.row_no,
    position_id: i.base && i.base.position_id ? i.base.position_id : null }));
  const red = final.items.filter((i) => i.red === 'fact_without_plan' && i.base?.position_id).map((i) => {
    const x = d.red[i.key];
    const pos = i.base!.position_id!;
    if (!x || x.action === 'keep') return { position_id: pos, action: 'keep' as const };
    return { position_id: pos, action: 'move' as const, ...(x.toPositionId ? { to_position_id: x.toPositionId } : { to_row_no: x.toRowNo }) };
  });
  return { items, red };
}

/** Ошибка разбора строки (PTO-01): номер строки Excel и причина. */
export interface RowError { rowNo: number; reason: string }

/** Ошибки с номером строки после разбора любой загрузки: работы без ЕИ / без объёма, место не найдено (placeMissing —
 *  номера строк, чьё место не нашлось в дереве), итоги и КВР не сходятся. По номеру строки. */
export function rowErrors(rows: ParsedRow[], checks: SumCheck[] = [], kvr: KvrCheck[] = [], placeMissing: number[] = []): RowError[] {
  const out: RowError[] = [];
  const fmt = (v: number): string => v.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
  for (const r of rows) {
    if (r.kind !== 'work') continue;
    if (!unitKey(r.unitText)) out.push({ rowNo: r.rowNo, reason: 'нет ЕИ' });
    if (r.qty === null || Math.abs(r.qty) <= EPS) out.push({ rowNo: r.rowNo, reason: 'объём 0 или пусто' });
    else if (r.qty < 0) out.push({ rowNo: r.rowNo, reason: 'объём меньше нуля' });
  }
  const missing = new Set(placeMissing);
  for (const n of missing) out.push({ rowNo: n, reason: 'место не найдено' });
  for (const c of checks) if (!c.ok) out.push({ rowNo: c.rowNo, reason: `итог «${c.label}» ${fmt(c.expected)} ≠ сумме строк ${fmt(c.actual)}` });
  for (const c of kvr) if (!c.ok) out.push({ rowNo: c.kvrRowNo, reason: `сумма позиций ${fmt(c.actual)} ≠ объёму строки ${fmt(c.expected)} (${c.unit})` });
  return out.sort((a, b) => a.rowNo - b.rowNo || a.reason.localeCompare(b.reason));
}
