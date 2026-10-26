/**
 * КС-2 в файл оферты заказчика (P2-0012, этап 4; решение владельца 22.10.2026 — «в файл оферты»): тот же .xlsx, что и КП
 * (исходный или уже с ценами КП). В «Кол-во» строк акта пишется объём акта; исключённая строка и строки-работы листа,
 * которых нет в акте, — 0 (иначе Excel сложил бы в КВР объём всего ВОР); цены, «Цена»/«Сумма»
 * с формулами и строки КВР не трогаются — суммы КВР и итог пересчитывает Excel. Запись — vor/xlsx-writer.ts (только ячейки
 * без формулы). Строка акта ищется на листе по номеру строки Excel и наименованию: не нашлась — это другой файл.
 */
import { parseSheet } from '../vor/parse.ts';
import type { SheetData } from '../vor/parse.ts';
import type { CellWrite } from '../vor/xlsx-writer.ts';
import { guessKpColumns } from '../estimate/kp.ts';
import { kop } from '../estimate/calc.ts';
import type { Ks2Snapshot } from './form.ts';

export interface OfferSheetPlan { sheet: string; writes: CellWrite[]; rows: number; zero: number }
export interface OfferPlan {
  sheets: OfferSheetPlan[];
  /** Строки акта, которых нет в файле (номер строки + наименование), — файл не тот. */
  missing: string[];
  /** Строки, где цена акта отличается от цены в файле (или в файле цены нет). */
  priceDiff: string[];
}

const same = (a: string, b: string): boolean => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

/** План записи акта в листы файла. Лист без колонки объёма не используется. */
export function planOffer(sheets: SheetData[], snap: Ks2Snapshot): OfferPlan {
  const parsed = sheets.map((s) => parseSheet(s)).filter((p) => p.isVor && p.columns && p.columns.qty !== null);
  const plans = new Map<string, OfferSheetPlan>();
  const done = new Map<string, Set<number>>();
  const missing: string[] = [], priceDiff: string[] = [];
  for (const r of snap.rows) {
    const hits = parsed.filter((p) => p.rows.some((x) => x.rowNo === r.row_no && (x.kind === 'work' || x.kind === 'material') && same(x.name, r.name)));
    if (hits.length !== 1) { missing.push(`стр. ${r.row_no} «${r.name}»${hits.length > 1 ? ' (на нескольких листах)' : ''}`); continue; }
    const p = hits[0];
    const src = p.rows.find((x) => x.rowNo === r.row_no)!;
    let plan = plans.get(p.sheet);
    if (!plan) { plan = { sheet: p.sheet, writes: [], rows: 0, zero: 0 }; plans.set(p.sheet, plan); }
    const qty = r.excluded ? 0 : r.qty;
    plan.writes.push({ rowNo: r.row_no, col: p.columns!.qty as number, value: qty });
    if (!done.has(p.sheet)) done.set(p.sheet, new Set());
    done.get(p.sheet)!.add(r.row_no);
    plan.rows++;
    if (qty === 0) { plan.zero++; continue; }
    // Цена в файле: «за ед. всего» или материал + работа (цены КП, вписанные в этот файл).
    const cols = guessKpColumns(p.columns!.prices);
    const val = (c: number | null): number | null => { const pc = c === null ? undefined : p.columns!.prices.find((x) => x.col === c); return pc ? src.prices[pc.label] ?? null : null; };
    const total = val(cols.unitTotal);
    const lab = val(cols.unitLabor), mat = val(cols.unitMaterial);
    const filePrice = total !== null ? total : lab === null && mat === null ? null : kop((lab || 0) + (mat || 0));
    if (r.price !== null && (filePrice === null || Math.abs(filePrice - r.price) > 0.005)) priceDiff.push(`стр. ${r.row_no} «${r.name}»`);
  }
  // Строки-работы и материалы листа акта, которых нет в акте, — объём 0.
  for (const p of parsed) {
    const plan = plans.get(p.sheet);
    if (!plan) continue;
    for (const x of p.rows) {
      if ((x.kind !== 'work' && x.kind !== 'material') || done.get(p.sheet)!.has(x.rowNo)) continue;
      plan.writes.push({ rowNo: x.rowNo, col: p.columns!.qty as number, value: 0 });
      plan.rows++; plan.zero++;
    }
  }
  return { sheets: Array.from(plans.values()), missing, priceDiff };
}

/** Имя файла: «<имя без .xlsx>_КС-2_<№ акта>_ред<N>.xlsx». */
export function offerFileName(source: string, actNo: string, revision: number): string {
  const no = String(actNo || '').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return `${source.replace(/\.xlsx$/i, '')}_КС-2${no ? '_' + no : ''}_ред${revision}.xlsx`;
}
