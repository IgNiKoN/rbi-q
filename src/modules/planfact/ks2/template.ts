/**
 * Свой бланк КС-2 проекта (P2-0008b, этап 5): .xlsx заказчика с метками в ячейках.
 * Шапка — {акт_номер} {акт_дата} {период_с} {период_по} {заказчик} {подрядчик} {объект} {договор} {итого} (в любых ячейках, любых листах);
 * таблица — одна строка-образец с метками {№} {номер} {наименование} {ЕИ} {количество} {цена} {стоимость}: размножается по строкам акта
 * с её оформлением (шрифты, рамки, форматы чисел, высота, объединения ячеек). Объединения ниже образца сдвигаются вручную —
 * exceljs при вставке строк их не сдвигает. Формулы ниже образца не поддерживаются (не пересчитались бы) — отказ при проверке.
 * Ячейка ровно с одной числовой меткой получает число (формат ячейки сохраняется), иначе метка заменяется текстом.
 */
import { kop } from '../estimate/calc.ts';
import { actRows, actTotal, rowCost, ruDate, type Ks2Snapshot } from './form.ts';

export const TEMPLATE_MAX_BYTES = 2 * 1024 * 1024;
export const HEADER_TAGS = ['акт_номер', 'акт_дата', 'период_с', 'период_по', 'заказчик', 'подрядчик', 'объект', 'договор', 'итого'] as const;
export const ROW_TAGS = ['№', 'номер', 'наименование', 'ЕИ', 'количество', 'цена', 'стоимость'] as const;
const KNOWN = new Set<string>([...HEADER_TAGS, ...ROW_TAGS]);
const ROW = new Set<string>(ROW_TAGS);
const TAG = /\{([^{}\n]{1,40})\}/g;

export interface TemplateCheck { ok: boolean; errors: string[]; unknown: string[]; tags: string[]; sheet: string | null; sampleRow: number | null }

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadExcel(): Promise<{ Workbook: new () => any }> {
  const mod: any = await import('exceljs');
  return mod.default && mod.default.Workbook ? mod.default : mod;
}

/** Текст ячейки (строка или rich text) — только в нём ищутся метки. */
function cellText(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && Array.isArray((v as { richText?: unknown }).richText)) return ((v as { richText: { text: string }[] }).richText).map((t) => t.text).join('');
  return null;
}
const isFormula = (v: unknown): boolean => !!v && typeof v === 'object' && ('formula' in (v as object) || 'sharedFormula' in (v as object));
const tagsIn = (s: string): string[] => Array.from(s.matchAll(TAG), (m) => m[1].trim());

interface Scan { wb: any; errors: string[]; unknown: string[]; tags: string[]; ws: any; row: number | null }

async function scan(bytes: Uint8Array): Promise<Scan> {
  const out: Scan = { wb: null, errors: [], unknown: [], tags: [], ws: null, row: null };
  if (bytes.length > TEMPLATE_MAX_BYTES) { out.errors.push('Бланк больше 2 МБ.'); return out; }
  const Excel = await loadExcel();
  const wb = new Excel.Workbook();
  try { await wb.xlsx.load(bytes); } catch { out.errors.push('Файл не читается как Excel (.xlsx). Сохраните бланк в Excel в формате .xlsx.'); return out; }
  out.wb = wb;
  const tags = new Set<string>(); const unknown = new Set<string>();
  const samples: { ws: any; row: number }[] = [];
  wb.eachSheet((ws: any) => {
    const merged = new Set<string>();
    for (const m of (ws.model.merges || []) as string[]) { const [a] = m.split(':'); merged.add(a); }
    ws.eachRow({ includeEmpty: false }, (row: any, r: number) => {
      let rowHasRowTag = false;
      row.eachCell({ includeEmpty: false }, (cell: any) => {
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) return; // подчинённая ячейка объединения
        const t = cellText(cell.value);
        if (!t) return;
        for (const tag of tagsIn(t)) { if (KNOWN.has(tag)) tags.add(tag); else unknown.add(tag); if (ROW.has(tag)) rowHasRowTag = true; }
      });
      if (rowHasRowTag) samples.push({ ws, row: r });
    });
  });
  out.tags = [...tags]; out.unknown = [...unknown];
  if (unknown.size) out.errors.push(`Неизвестные метки: ${[...unknown].map((t) => `{${t}}`).join(', ')}.`);
  if (!samples.length) out.errors.push('Нет строки-образца таблицы: в одной строке бланка должны быть метки строк акта, например {наименование}, {количество}, {стоимость}.');
  if (samples.length > 1) out.errors.push(`Строка-образец должна быть одна, а метки строк есть в нескольких строках: ${samples.map((s) => `«${s.ws.name}» стр. ${s.row}`).join(', ')}.`);
  if (samples.length === 1) {
    const { ws, row } = samples[0];
    out.ws = ws; out.row = row;
    for (const m of (ws.model.merges || []) as string[]) {
      const [top, bottom] = mergeRows(m);
      if (top <= row && bottom >= row && bottom > top) out.errors.push(`Строка-образец (${row}) входит в объединение ячеек по вертикали (${m}) — объединяйте ячейки только внутри строки.`);
    }
    const f: string[] = [];
    ws.eachRow({ includeEmpty: false }, (r: any, n: number) => { if (n >= row) r.eachCell({ includeEmpty: false }, (c: any) => { if (isFormula(c.value)) f.push(c.address); }); });
    if (f.length) out.errors.push(`На листе с таблицей ниже строки-образца есть формулы (${f.slice(0, 5).join(', ')}${f.length > 5 ? '…' : ''}) — они не пересчитаются; замените сумму меткой {итого}.`);
  }
  return out;
}

const mergeRows = (m: string): [number, number] => {
  const [a, b] = m.split(':');
  const row = (ref: string): number => Number(/(\d+)$/.exec(ref)![1]);
  return [row(a), row(b || a)];
};
const shiftRef = (ref: string, by: number): string => ref.replace(/(\d+)$/, (d) => String(Number(d) + by));
const shiftMerge = (m: string, by: number): string => m.split(':').map((x) => shiftRef(x, by)).join(':');

/** Проверка бланка при загрузке: читается, одна строка-образец, нет неизвестных меток, нет формул ниже образца. */
export async function checkTemplate(bytes: Uint8Array): Promise<TemplateCheck> {
  const s = await scan(bytes);
  return { ok: !s.errors.length, errors: s.errors, unknown: s.unknown, tags: s.tags, sheet: s.ws ? s.ws.name : null, sampleRow: s.row };
}

const fmt = (n: number, d = 2): string => n.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtQ = (n: number): string => n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });

/** Заменить метки в ячейке: ровно одна метка с числом — число; иначе текст. */
function fillCell(cell: any, values: Record<string, string | number>): void {
  const t = cellText(cell.value);
  if (!t || !TAG.test(t)) { TAG.lastIndex = 0; return; }
  TAG.lastIndex = 0;
  const only = /^\s*\{([^{}\n]{1,40})\}\s*$/.exec(t);
  if (only && typeof values[only[1].trim()] === 'number') { cell.value = values[only[1].trim()]; return; }
  cell.value = t.replace(TAG, (all, tag: string) => {
    const v = values[tag.trim()];
    if (v === undefined) return all;
    return typeof v === 'number' ? (tag.trim() === 'количество' ? fmtQ(v) : tag.trim() === '№' ? String(v) : fmt(v)) : v;
  });
}

/** Заполнить бланк проекта снимком акта. Ошибки проверки → исключение с понятным текстом (файл не формируется). */
export async function fillTemplate(bytes: Uint8Array, snap: Ks2Snapshot): Promise<Uint8Array> {
  const rows = actRows(snap);
  if (!rows.length) throw new Error('В акте нет ни одной строки с объёмом — файл не формируется.');
  const s = await scan(bytes);
  if (s.errors.length) throw new Error('Бланк проекта не подходит: ' + s.errors.join(' '));
  const { wb, ws } = s; const r = s.row!;
  const n = rows.length;
  const h = snap.header;
  const head: Record<string, string | number> = {
    акт_номер: h.act_no, акт_дата: ruDate(h.act_date), период_с: ruDate(h.period_from), период_по: ruDate(h.period_to),
    заказчик: h.customer, подрядчик: h.contractor, объект: h.object,
    договор: [h.contract_no ? `№ ${h.contract_no}` : '', h.contract_date ? `от ${ruDate(h.contract_date)}` : ''].filter(Boolean).join(' '),
    итого: actTotal(snap),
  };
  // 1) объединения ниже образца и в нём — снять, размножить строку, вернуть со сдвигом
  const merges: string[] = [...(ws.model.merges || [])];
  const below = merges.filter((m) => mergeRows(m)[0] > r), inRow = merges.filter((m) => { const [a, b] = mergeRows(m); return a === r && b === r; });
  for (const m of [...below, ...inRow]) ws.unMergeCells(m);
  if (n > 1) ws.duplicateRow(r, n - 1, true);
  for (const m of below) ws.mergeCells(shiftMerge(m, n - 1));
  for (let i = 0; i < n; i++) for (const m of inRow) ws.mergeCells(shiftMerge(m, i));
  // область печати, если задана и захватывает таблицу
  const pa = ws.pageSetup && ws.pageSetup.printArea;
  if (typeof pa === 'string' && /^\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+$/.test(pa) && mergeRows(pa.replace(/\$/g, ''))[1] >= r) {
    const [a, b] = pa.replace(/\$/g, '').split(':');
    ws.pageSetup.printArea = `${a}:${shiftRef(b, n - 1)}`;
  }
  // 2) строки акта
  rows.forEach((row, i) => {
    const vals: Record<string, string | number> = { '№': i + 1, номер: row.number || String(row.row_no), наименование: row.name, ЕИ: row.unit,
      количество: row.qty, цена: kop(row.price ?? 0), стоимость: rowCost(row) };
    ws.getRow(r + i).eachCell({ includeEmpty: false }, (c: any) => fillCell(c, vals));
  });
  // 3) шапка — во всех листах
  wb.eachSheet((sh: any) => sh.eachRow({ includeEmpty: false }, (row: any) => row.eachCell({ includeEmpty: false }, (c: any) => fillCell(c, head))));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Байты ↔ base64 (бланк хранится на сервере в bytea, передаётся base64). */
export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
