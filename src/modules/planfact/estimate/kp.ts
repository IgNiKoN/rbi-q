/**
 * КП в форме заказчика (P2-0006c, этап 6): чистые функции — колонки формы для записи, снимок редакции (из calc.ts),
 * ячейки для записи в лист по row_no, отличия двух редакций. Запись в файл — vor/xlsx-writer.ts (формулы заказчика не трогаются).
 */
import type { EstimateRow, OverheadLine } from './estimate.service.ts';
import { calcOverheads, calcRows, calcTotals, kop } from './calc.ts';
import type { CellWrite } from '../vor/xlsx-writer.ts';

/** Колонки формы: цена за единицу (работа / материал / всего) и стоимость (работа / материал / всего) — индексы с 0. */
export interface KpColumns { unitLabor: number | null; unitMaterial: number | null; unitTotal: number | null; sumLabor: number | null; sumMaterial: number | null; sumTotal: number | null }
export const KP_ROLES: { id: keyof KpColumns; label: string }[] = [
  { id: 'unitLabor', label: 'Цена за ед. — работа' }, { id: 'unitMaterial', label: 'Цена за ед. — материал' }, { id: 'unitTotal', label: 'Цена за ед. — всего' },
  { id: 'sumLabor', label: 'Стоимость — работа' }, { id: 'sumMaterial', label: 'Стоимость — материал' }, { id: 'sumTotal', label: 'Стоимость — всего' }];
export const emptyKpColumns = (): KpColumns => ({ unitLabor: null, unitMaterial: null, unitTotal: null, sumLabor: null, sumMaterial: null, sumTotal: null });

/** По подписям колонок цен формы: «… ед… / Работа» → цена за единицу; «Стоимость (всего), … / Работа» → стоимость. */
export function guessKpColumns(prices: { label: string; col: number }[]): KpColumns {
  const out = emptyKpColumns();
  for (const p of prices) {
    const i = p.label.lastIndexOf('/');
    const head = (i >= 0 ? p.label.slice(0, i) : p.label).toLowerCase(), tail = (i >= 0 ? p.label.slice(i + 1) : p.label).toLowerCase();
    const unit = /(ед\.|ед-|единиц|за ед|цена)/.test(head) && !/всего/.test(head);
    const sum = !unit && /(стоимость|сумма|всего)/.test(head);
    if (!unit && !sum) continue;
    const kind = /(работ|смр)/.test(tail) ? 'Labor' : /материал/.test(tail) ? 'Material' : /(всего|итого)/.test(tail) ? 'Total' : null;
    if (!kind) continue;
    const key = ((unit ? 'unit' : 'sum') + kind) as keyof KpColumns;
    if (out[key] === null) out[key] = p.col;
  }
  return out;
}

export interface SnapRow { import_id: string; row_no: number; kind: 'work' | 'material'; name: string; qty: number | null; price_labor: number | null; price_material: number | null; labor: number; material: number }
export interface KpSnapshot {
  version: 1;
  estimate: { id: string; name: string; area_m2: number | null };
  rows: SnapRow[];
  totals: { labor: number; material: number; total: number; unpriced: number };
  overheads: { lines: { key: string; name: string; section: string; value: number; in_total: boolean }[]; direct: number; total: number; per_m2: number | null } | null;
}

/** Снимок редакции: цены и суммы строк (до копеек), итоги по ВОР, надбавки и итог расчёта. */
export function buildSnapshot(est: { id: string; name: string; area_m2: number | null }, rows: EstimateRow[], lines: OverheadLine[] | null): KpSnapshot {
  const calc = calcRows(rows);
  const t = calcTotals(rows, calc).all;
  const snapRows: SnapRow[] = [];
  for (const r of rows) {
    const c = calc.get(r.source_row_id);
    if (!c || (r.kind !== 'work' && r.kind !== 'material')) continue;
    snapRows.push({ import_id: r.import_id, row_no: r.row_no, kind: r.kind, name: r.name, qty: c.qty,
      price_labor: r.kind === 'work' && r.price_labor !== null ? kop(r.price_labor) : null,
      price_material: r.price_material !== null ? kop(r.price_material) : null, labor: kop(c.labor), material: kop(c.material) });
  }
  let overheads: KpSnapshot['overheads'] = null;
  if (lines && lines.length) {
    const o = calcOverheads(lines, { labor: t.labor, material: t.material }, est.area_m2);
    overheads = { lines: lines.map((l) => ({ key: l.key, name: l.name, section: l.section, value: kop(o.values.get(l.key) || 0), in_total: l.in_total })),
      direct: kop(o.direct), total: kop(o.total), per_m2: o.perM2 === null ? null : kop(o.perM2) };
  }
  return { version: 1, estimate: { ...est }, rows: snapRows, totals: { labor: kop(t.labor), material: kop(t.material), total: kop(t.total), unpriced: t.unpriced }, overheads };
}

/** Ячейки для записи в лист одной загрузки (по row_no = номер строки Excel). Строки без цены не пишутся. */
export function kpWrites(snap: KpSnapshot, importId: string, cols: KpColumns): CellWrite[] {
  const out: CellWrite[] = [];
  const put = (rowNo: number, col: number | null, v: number | null): void => { if (col !== null && v !== null) out.push({ rowNo, col, value: v }); };
  for (const r of snap.rows) {
    if (r.import_id !== importId || (r.price_labor === null && r.price_material === null)) continue;
    put(r.row_no, cols.unitLabor, r.kind === 'work' ? r.price_labor : null);
    put(r.row_no, cols.unitMaterial, r.price_material);
    put(r.row_no, cols.unitTotal, kop((r.price_labor || 0) + (r.price_material || 0)));
    put(r.row_no, cols.sumLabor, r.kind === 'work' && r.price_labor !== null ? r.labor : null);
    put(r.row_no, cols.sumMaterial, r.price_material !== null ? r.material : null);
    put(r.row_no, cols.sumTotal, kop(r.labor + r.material));
  }
  return out;
}

export interface RevDiff { key: string; import_id: string; row_no: number; name: string; a: SnapRow | null; b: SnapRow | null }
/** Отличия редакций: строки, где изменились цены или суммы; разница итогов (по ВОР и расчёта). */
export function diffSnapshots(a: KpSnapshot, b: KpSnapshot): { rows: RevDiff[]; direct: number; total: number | null } {
  const key = (r: SnapRow): string => `${r.import_id}:${r.row_no}`;
  const am = new Map(a.rows.map((r) => [key(r), r])), bm = new Map(b.rows.map((r) => [key(r), r]));
  const rows: RevDiff[] = [];
  for (const k of new Set([...am.keys(), ...bm.keys()])) {
    const x = am.get(k) || null, y = bm.get(k) || null;
    if (x && y && x.price_labor === y.price_labor && x.price_material === y.price_material && x.labor === y.labor && x.material === y.material) continue;
    const s = (y || x)!;
    rows.push({ key: k, import_id: s.import_id, row_no: s.row_no, name: s.name, a: x, b: y });
  }
  rows.sort((p, q) => (p.import_id === q.import_id ? p.row_no - q.row_no : p.import_id.localeCompare(q.import_id)));
  return { rows, direct: kop(b.totals.total - a.totals.total), total: a.overheads && b.overheads ? kop(b.overheads.total - a.overheads.total) : null };
}

/** Имя файла КП: «<имя без .xlsx>_КП_ред<N>.xlsx». */
export function kpFileName(source: string, revision: number): string {
  return `${source.replace(/\.xlsx$/i, '')}_КП_ред${revision}.xlsx`;
}
