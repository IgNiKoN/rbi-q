/**
 * Чтение .xlsx → листы как таблицы значений (P2-0006). Единственное место, где используется библиотека Excel (exceljs, MIT);
 * она подгружается лениво — только при открытии файла на экране «ВОР», в оболочку не попадает.
 * Значения формул берутся из кэша файла (result); формула без кэша → null. Объединённые ячейки: значение главной ячейки.
 * Скрытые листы тоже читаются (в образцах заказчиков нужный лист бывает скрыт) — с пометкой hidden.
 */
import type { Cell, SheetData } from './parse.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type ExcelNs = { Workbook: new () => any };

async function loadExcel(): Promise<ExcelNs> {
  const mod: any = await import('exceljs');
  return (mod.default && mod.default.Workbook ? mod.default : mod) as ExcelNs;
}

/** Значение ячейки exceljs → строка/число/null. */
export function cellValue(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return cellValue(o.result);
    if ('formula' in o || 'sharedFormula' in o) return null;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join('');
    if ('text' in o) return cellValue(o.text);
    if ('error' in o) return null;
  }
  return null;
}

export interface Workbook { sheets: SheetData[] }

/** Признак файла Excel (.xlsx — zip, начинается с «PK»). */
export function looksLikeXlsx(buf: ArrayBuffer | Uint8Array): boolean {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b;
}

export async function readWorkbook(buf: ArrayBuffer | Uint8Array): Promise<Workbook> {
  if (!looksLikeXlsx(buf)) throw new Error('Это не файл Excel .xlsx (старый .xls сохраните как .xlsx).');
  const Excel = await loadExcel();
  const wb = new Excel.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    throw new Error('Файл повреждён или это не .xlsx — открыть не удалось.');
  }
  const sheets: SheetData[] = [];
  for (const ws of wb.worksheets as any[]) {
    const rows: Cell[][] = [];
    const count: number = ws.rowCount || 0;
    for (let r = 1; r <= count; r++) {
      const row = ws.getRow(r);
      const vals: Cell[] = [];
      row.eachCell({ includeEmpty: false }, (c: any, n: number) => { vals[n - 1] = cellValue(c.value); });
      for (let i = 0; i < vals.length; i++) if (vals[i] === undefined) vals[i] = null;
      rows.push(vals);
    }
    while (rows.length && rows[rows.length - 1].every((v) => v === null || v === '')) rows.pop();
    sheets.push({ name: String(ws.name), rows, hidden: !!ws.state && ws.state !== 'visible' });
  }
  return { sheets };
}

/** SHA-256 файла (hex) — для отметки загрузки (сам файл в этом блоке не хранится). */
export async function sha256Hex(buf: ArrayBuffer | Uint8Array): Promise<string> {
  const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
