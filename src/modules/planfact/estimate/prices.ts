/**
 * Справочник цен (P2-0006c): чистые функции — угадывание колонок цен ВОР, предпросмотр «Взять цены из загруженного ВОР»
 * (новые / изменятся / без изменений / конфликт), старые цены. Ключи совпадают с сервером: работа — вид работ;
 * материал — canon_name + ЕИ строки (lower(btrim)).
 */
import { canonName } from '../vor/matching.ts';
import { kop } from './calc.ts';
import type { VorRow } from '../vor/vor.service.ts';
import type { PriceInput, PriceItem } from './estimate.service.ts';

/** Цена старше стольких дней подсвечивается как «старая». */
export const STALE_DAYS = 90;

export function isStale(priceDate: string, now: Date = new Date(), days: number = STALE_DAYS): boolean {
  const d = new Date(priceDate + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return false;
  return (now.getTime() - d.getTime()) / 86400000 > days;
}

export const unitKey = (u: string | null | undefined): string => String(u || '').trim().toLowerCase();
export function priceKey(kind: 'work' | 'material', workTypeId: string | null, name: string, unit: string | null): string {
  return kind === 'work' ? `w:${workTypeId}` : `m:${canonName(name)}|${unitKey(unit)}`;
}

export interface PriceColumns { labor: string | null; material: string | null }

/** Колонки цены за единицу по подписям ВОР: «… ед…/за ед. … / Работа|СМР» и «… / Материал(ы)»; «всего»/суммы — не цена. */
export function guessPriceColumns(labels: string[]): PriceColumns {
  const out: PriceColumns = { labor: null, material: null };
  for (const l of labels) {
    const i = l.lastIndexOf('/');
    const head = (i >= 0 ? l.slice(0, i) : l).toLowerCase(), tail = (i >= 0 ? l.slice(i + 1) : l).toLowerCase();
    const unit = /(ед\.|ед-|единиц|за ед|цена)/.test(head) && !/всего/.test(head);
    if (!unit) continue;
    if (!out.labor && /(работ|смр)/.test(tail)) out.labor = l;
    else if (!out.material && /материал/.test(tail)) out.material = l;
  }
  return out;
}

/** Колонки сумм строки («Стоимость всего … / Работа|СМР», «… / Материал(ы)») — для цены = сумма ÷ объём (P2-0009, К2). */
export function guessTotalColumns(labels: string[]): PriceColumns {
  const out: PriceColumns = { labor: null, material: null };
  for (const l of labels) {
    const i = l.lastIndexOf('/');
    if (i < 0) continue;
    const head = l.slice(0, i).toLowerCase(), tail = l.slice(i + 1).toLowerCase();
    if (!/(всего|сумма|стоимость)/.test(head) || /(ед\.|ед-|единиц|за ед|цена)/.test(head)) continue;
    if (!out.labor && /(работ|смр)/.test(tail)) out.labor = l;
    else if (!out.material && /материал/.test(tail)) out.material = l;
  }
  return out;
}

/** Цена за единицу: из колонки цены, а если её нет — сумма строки ÷ объём (до копеек). В файле заказчика бывает сумма без цены. */
export function unitPrice(price: number | null | undefined, total: number | null | undefined, qty: number | null | undefined): number | null {
  if (typeof price === 'number' && Number.isFinite(price)) return price;
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0 || typeof qty !== 'number' || !(qty > 0)) return null;
  return kop(total / qty);
}

export interface ImportSource { importId: string; label: string; rows: VorRow[]; columns: PriceColumns }
export interface Candidate { labor: number | null; material: number | null; importId: string; rowNo: number }
export type PreviewStatus = 'new' | 'changed' | 'same' | 'conflict';
export interface PreviewItem {
  key: string; kind: 'work' | 'material'; name: string; unit: string; work_type_id: string | null;
  candidates: Candidate[];      // разные значения цены (одинаковые схлопнуты)
  current: PriceItem | null;
  status: PreviewStatus;
}

const pos = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const eq = (a: number | null, b: number | null): boolean => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9);

/** Предпросмотр: строки работ (с видом работ) и материалов с ценой > 0 из выбранных загрузок против текущего справочника. */
export function buildImportPreview(sources: ImportSource[], current: PriceItem[], workTypeName: (id: string) => string | null): PreviewItem[] {
  const cur = new Map<string, PriceItem>();
  for (const p of current) cur.set(priceKey(p.kind, p.work_type_id, p.name, p.unit_text), p);
  const map = new Map<string, PreviewItem>();
  for (const s of sources) {
    for (const r of s.rows) {
      if (r.kind !== 'work' && r.kind !== 'material') continue;
      if (r.kind === 'work' && !r.work_type_id) continue;
      const labor = r.kind === 'work' && s.columns.labor ? pos(r.prices[s.columns.labor]) : null;
      const material = s.columns.material ? pos(r.prices[s.columns.material]) : null;
      if (labor === null && material === null) continue;
      const key = priceKey(r.kind, r.work_type_id, r.name, r.unit_text);
      let it = map.get(key);
      if (!it) {
        it = { key, kind: r.kind, name: r.kind === 'work' ? (workTypeName(r.work_type_id!) || r.name) : r.name.trim().replace(/\s+/g, ' '),
          unit: r.kind === 'work' ? '' : unitKey(r.unit_text), work_type_id: r.kind === 'work' ? r.work_type_id : null,
          candidates: [], current: cur.get(key) || null, status: 'new' };
        map.set(key, it);
      }
      if (!it.candidates.some((c) => eq(c.labor, labor) && eq(c.material, material))) it.candidates.push({ labor, material, importId: s.importId, rowNo: r.row_no });
    }
  }
  for (const it of map.values()) {
    const c = it.candidates[0];
    it.status = it.candidates.length > 1 ? 'conflict'
      : !it.current ? 'new'
      : (c.labor === null || eq(c.labor, it.current.price_labor)) && (c.material === null || eq(c.material, it.current.price_material)) ? 'same' : 'changed';
  }
  return Array.from(map.values()).sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'ru') : a.kind === 'work' ? -1 : 1));
}

export function previewCounts(items: PreviewItem[]): Record<PreviewStatus, number> {
  const out: Record<PreviewStatus, number> = { new: 0, changed: 0, same: 0, conflict: 0 };
  for (const i of items) out[i.status]++;
  return out;
}

/** Что записать: новые и изменившиеся + конфликты по выбору ПТО (choice: key → индекс кандидата; без выбора конфликт пропускается).
 *  Группировка по загрузке-источнику (источник цены в истории — import:<id>). */
export function applyItems(items: PreviewItem[], choice: Record<string, number>): Map<string, PriceInput[]> {
  const out = new Map<string, PriceInput[]>();
  for (const it of items) {
    if (it.status === 'same') continue;
    const idx = it.status === 'conflict' ? choice[it.key] : 0;
    const c = idx === undefined ? undefined : it.candidates[idx];
    if (!c) continue;
    if (it.current && (c.labor === null || eq(c.labor, it.current.price_labor)) && (c.material === null || eq(c.material, it.current.price_material))) continue;
    const arr = out.get(c.importId) || [];
    arr.push(it.kind === 'work'
      ? { kind: 'work', work_type_id: it.work_type_id, price_labor: c.labor, price_material: c.material }
      : { kind: 'material', name: it.name, unit_text: it.unit, price_material: c.material });
    out.set(c.importId, arr);
  }
  return out;
}

/** Ввод цены: «1 234,5» → 1234.5; пусто → null; отрицательное/нечисло → NaN (ошибка ввода). */
export function parsePriceInput(s: string): number | null {
  const t = s.replace(/[\s  ]/g, '').replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  return Number(t);
}

export const money = (n: number | null | undefined): string =>
  n === null || n === undefined ? '' : kop(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
