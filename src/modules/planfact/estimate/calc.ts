/**
 * Расчёт тендерной сметы (P2-0006c) — единственная функция расчёта: экран сметы, КП и снимок редакции КП считают только ею.
 * Работа: объём × расценка (+ объём × «материалы в составе работы», если задано).
 * Материал: объём строки материала × цена; объём — из файла (vor_source_rows.qty, как в 0_СЕБЕС: F материала = F работы × норма),
 * если его нет — объём работы-родителя × норма. Без округления; до копеек — только при выводе и в снимке КП.
 */
import type { EstimateRow, OverheadLine, OverheadSection } from './estimate.service.ts';

export interface RowCalc { qty: number | null; labor: number; material: number; priced: boolean }
export interface Sums { labor: number; material: number; total: number; rows: number; unpriced: number }

/** Объём строки для расчёта: свой; у материала без своего — объём работы × норма. */
export function rowQty(r: Pick<EstimateRow, 'kind' | 'qty' | 'norm'>, parentQty: number | null): number | null {
  if (r.qty !== null && r.qty !== undefined) return r.qty;
  if (r.kind === 'material' && parentQty !== null && r.norm !== null && r.norm !== undefined) return parentQty * r.norm;
  return null;
}

/** Суммы строк сметы: key = source_row_id. Группы и места — без сумм. */
export function calcRows(rows: EstimateRow[]): Map<string, RowCalc> {
  const qtyOf = new Map<string, number | null>();
  for (const r of rows) if (r.kind === 'work') qtyOf.set(`${r.import_id}:${r.row_no}`, r.qty);
  const out = new Map<string, RowCalc>();
  for (const r of rows) {
    if (r.kind !== 'work' && r.kind !== 'material') continue;
    const parent = r.parent_row_no !== null ? qtyOf.get(`${r.import_id}:${r.parent_row_no}`) ?? null : null;
    const q = rowQty(r, parent);
    const pl = r.kind === 'work' ? r.price_labor : null;
    const pm = r.price_material;
    out.set(r.source_row_id, {
      qty: q,
      labor: q !== null && pl !== null ? q * pl : 0,
      material: q !== null && pm !== null ? q * pm : 0,
      priced: pl !== null || pm !== null
    });
  }
  return out;
}

const empty = (): Sums => ({ labor: 0, material: 0, total: 0, rows: 0, unpriced: 0 });

/** Итоги по загрузкам (листам) и всего. */
export function calcTotals(rows: EstimateRow[], calc: Map<string, RowCalc> = calcRows(rows)): { byImport: Map<string, Sums>; all: Sums } {
  const byImport = new Map<string, Sums>();
  const all = empty();
  for (const r of rows) {
    const c = calc.get(r.source_row_id);
    if (!c) continue;
    const s = byImport.get(r.import_id) || empty();
    for (const t of [s, all]) {
      t.labor += c.labor; t.material += c.material; t.total += c.labor + c.material; t.rows++;
      if (!c.priced) t.unpriced++;
    }
    byImport.set(r.import_id, s);
  }
  return { byImport, all };
}

/** До копеек (для вывода и снимка КП). Как Excel: сначала 15 значащих цифр (снимает хвосты двоичной арифметики: 29499.005·100 = 2949900.4999…), потом округление. */
export const kop = (n: number): number => Math.round(Number((n * 100).toPrecision(15))) / 100;

// ---------- Надбавки («Расчёт»): закрытый список способов, без произвольных формул (как check_overhead_lines на сервере) ----------

export const SECTIONS: { id: OverheadSection; label: string; direct: boolean }[] = [
  { id: 'materials', label: 'Материалы', direct: true }, { id: 'fot_smr', label: 'ФОТ СМР', direct: true },
  { id: 'fot_itr', label: 'ФОТ ИТР', direct: true }, { id: 'household', label: 'Хоз-быт. нужды', direct: true },
  { id: 'other', label: 'Прочие прямые', direct: true }, { id: 'profit', label: 'Сметная прибыль', direct: false },
  { id: 'office', label: 'Офис', direct: false }, { id: 'vat', label: 'НДС', direct: false }
];

export interface OverheadResult {
  values: Map<string, number>;                       // значение каждой строки (и «не в итог» тоже)
  sections: Record<OverheadSection, number>;         // Σ строк раздела с флажком «в итог»
  direct: number;                                    // «Всего прямые затраты»
  total: number;                                     // ИТОГО
  perM2: number | null;                              // ₽/м² (при S > 0)
}

/** Расчёт надбавок от итогов сметы (Σ работ и материалов по ВОР). Циклическая база или ссылка на несуществующую строку — ошибка. */
export function calcOverheads(lines: OverheadLine[], base: { labor: number; material: number }, area: number | null): OverheadResult {
  const byKey = new Map(lines.map((l) => [l.key, l]));
  const values = new Map<string, number>();
  const visiting = new Set<string>();
  const sectionSum = (sec: OverheadSection): number => lines.filter((l) => l.section === sec && l.in_total).reduce((a, l) => a + value(l.key), 0);
  function baseSum(l: OverheadLine): number {
    let s = 0;
    for (const t of l.base.totals || []) s += t === 'labor' ? base.labor : base.material;
    for (const sec of l.base.sections || []) s += sectionSum(sec);
    for (const k of l.base.lines || []) {
      if (!byKey.has(k)) throw new Error(`Строка «${l.name}» ссылается на несуществующую строку`);
      s += value(k);
    }
    return s;
  }
  function value(key: string): number {
    const v0 = values.get(key);
    if (v0 !== undefined) return v0;
    const l = byKey.get(key)!;
    if (visiting.has(key)) throw new Error(`Строки надбавок ссылаются друг на друга по кругу (в т. ч. через свой раздел) — проверьте базу строки «${l.name}»`);
    visiting.add(key);
    const p = l.params || {};
    let v = 0;
    if (l.method === 'percent_of') v = baseSum(l) * (p.percent ?? 0) / 100;
    else if (l.method === 'qty_rate') v = (p.factors || []).reduce((a, f) => a * f, (p.factors || []).length ? 1 : 0);
    else if (l.method === 'fixed') v = p.amount ?? 0;
    else if (l.method === 'gross_up') { const b = baseSum(l); v = p.share ? b / p.share * 100 - b : 0; }
    visiting.delete(key);
    values.set(key, v);
    return v;
  }
  for (const l of lines) value(l.key);
  const sections = Object.fromEntries(SECTIONS.map((s) => [s.id, sectionSum(s.id)])) as Record<OverheadSection, number>;
  const direct = SECTIONS.filter((s) => s.direct).reduce((a, s) => a + sections[s.id], 0);
  const total = SECTIONS.reduce((a, s) => a + sections[s.id], 0);
  return { values, sections, direct, total, perM2: area && area > 0 ? total / area : null };
}
