/**
 * КС-2 (P2-0008b): снимок акта и запись по унифицированной форме № КС-2 (ОКУД 0322005).
 * Снимок — то, что хранится в редакции акта: шапка + строки заказчика с предложением системы и итогом ПТО рядом.
 * В Excel идут только итог ПТО и неисключённые строки; суммы — до копеек (kop из расчёта сметы), итог = сумме строк.
 * Excel (exceljs) подгружается лениво, как в «ВОР» и «Смета/КП».
 */
import { kop } from '../estimate/calc.ts';

export interface Ks2Header {
  investor: string; customer: string; contractor: string; construction: string; object: string;
  contract_no: string; contract_date: string; // дата — ГГГГ-ММ-ДД или ''
  act_no: string; act_date: string; period_from: string; period_to: string;
  customer_signer: string; contractor_signer: string; // «должность, ФИО» для подписей «Принял»/«Сдал»
}

export interface Ks2Row {
  source_row_id: string; row_no: number; number: string; name: string; unit: string; kind: 'work' | 'material';
  sys_qty: number; sys_price: number | null; // предложение системы
  qty: number; price: number | null; excluded: boolean; // итог ПТО
  total_qty: number; prev_qty: number; // «с начала работ», «выставлено ранее»
}

export interface Ks2Snapshot { header: Ks2Header; rows: Ks2Row[] }

export const emptyKs2Header = (): Ks2Header => ({
  investor: '', customer: '', contractor: '', construction: '', object: '', contract_no: '', contract_date: '',
  act_no: '', act_date: '', period_from: '', period_to: '', customer_signer: '', contractor_signer: '',
});

/** Строки, идущие в акт: не исключены и с ненулевым объёмом. */
export const actRows = (s: Ks2Snapshot): Ks2Row[] => s.rows.filter((r) => !r.excluded && r.qty > 0);
export const rowCost = (r: Ks2Row): number => kop(r.qty * (r.price ?? 0));
export const actTotal = (s: Ks2Snapshot): number => kop(actRows(s).reduce((a, r) => a + rowCost(r), 0));
/** Правка ПТО отличается от предложения системы. */
export const isEdited = (r: Ks2Row): boolean => r.excluded || r.qty !== r.sys_qty || r.price !== r.sys_price;

/** Почему акт нельзя выдать/скачать (пусто — можно). */
export function ks2Problems(s: Ks2Snapshot): string[] {
  const rows = actRows(s);
  const out: string[] = [];
  if (!rows.length) out.push('В акте нет ни одной строки с объёмом.');
  const noPrice = rows.filter((r) => r.price === null);
  if (noPrice.length) out.push(`Нет цены у ${noPrice.length} строк(и): ${noPrice.slice(0, 3).map((r) => r.name).join('; ')}${noPrice.length > 3 ? '…' : ''}`);
  return out;
}

/** ГГГГ-ММ-ДД (или ISO-время с такой датой в начале) → ДД.ММ.ГГГГ (прочее — как есть). */
export function ruDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(d ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (d ?? '');
}

export function ks2FileName(actNo: string, revision: number): string {
  const no = (actNo || 'б-н').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return `КС-2 № ${no} (ред. ${revision}).xlsx`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadExcel(): Promise<{ Workbook: new () => any }> {
  const mod: any = await import('exceljs');
  return mod.default && mod.default.Workbook ? mod.default : mod;
}

const MONEY = '#,##0.00';
/** Формат количества без висящей запятой: столько знаков после запятой, сколько есть (до 3). */
const qtyFmt = (q: number): string => {
  const d = (String(Math.round(q * 1000) / 1000).split('.')[1] ?? '').length;
  return d ? `#,##0.${'0'.repeat(d)}` : '#,##0';
};
const thin = { style: 'thin' as const };
const box = { top: thin, left: thin, bottom: thin, right: thin };

/** Унифицированная форма КС-2 → .xlsx. Отказ, если в акте нет строк. */
export async function writeUnifiedKs2(s: Ks2Snapshot): Promise<Uint8Array> {
  const rows = actRows(s);
  if (!rows.length) throw new Error('В акте нет ни одной строки с объёмом — файл не формируется.');
  const h = s.header;
  const Excel = await loadExcel();
  const wb = new Excel.Workbook();
  const ws = wb.addWorksheet('КС-2', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });
  // A: № п/п, B: № по смете, C: наименование, D: № расценки, E: ЕИ, F: количество, G: цена, H: стоимость
  ws.columns = [{ width: 7 }, { width: 10 }, { width: 58 }, { width: 11 }, { width: 10 }, { width: 13 }, { width: 15 }, { width: 17 }];
  const font = { name: 'Arial', size: 9 };
  const put = (ref: string, v: unknown, st: Record<string, unknown> = {}) => {
    const c = ws.getCell(ref); c.value = v; c.font = { ...font, ...(st.font as object ?? {}) };
    if (st.align) c.alignment = st.align; if (st.border) c.border = st.border; if (st.numFmt) c.numFmt = st.numFmt;
    return c;
  };
  const right = { horizontal: 'right', vertical: 'middle' };
  const center = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const under = { bottom: thin };

  put('H1', 'Унифицированная форма № КС-2', { align: right, font: { size: 8 } });
  put('H2', 'Утверждена постановлением Госкомстата России от 11.11.99 № 100', { align: right, font: { size: 8 } });
  put('H4', 'Код', { align: center, border: box });
  put('G5', 'Форма по ОКУД', { align: right }); put('H5', '0322005', { align: center, border: box });

  const party = (row: number, label: string, value: string, code = 'по ОКПО') => {
    ws.mergeCells(`A${row}:B${row}`); put(`A${row}`, label, { align: { vertical: 'middle', wrapText: true } });
    if (label.length > 16) ws.getRow(row).height = 24;
    ws.mergeCells(`C${row}:F${row}`);
    put(`C${row}`, value, { border: under, align: { vertical: 'middle', wrapText: true } });
    if (code) put(`G${row}`, code, { align: right });
    put(`H${row}`, '', { border: box });
  };
  party(6, 'Инвестор', h.investor);
  party(7, 'Заказчик (Генподрядчик)', h.customer);
  party(8, 'Подрядчик (Субподрядчик)', h.contractor);
  party(9, 'Стройка', h.construction, '');
  party(10, 'Объект', h.object, '');
  put('G11', 'Вид деятельности по ОКДП', { align: right }); put('H11', '', { border: box });
  put('F12', 'Договор подряда (контракт)', { align: right }); put('G12', 'номер', { align: right }); put('H12', h.contract_no, { align: center, border: box });
  put('G13', 'дата', { align: right }); put('H13', ruDate(h.contract_date), { align: center, border: box });
  put('G14', 'Вид операции', { align: right }); put('H14', '', { border: box });

  // Номер, дата, отчётный период
  ws.mergeCells('E16:E17'); put('E16', 'Номер документа', { align: center, border: box });
  ws.mergeCells('F16:F17'); put('F16', 'Дата составления', { align: center, border: box });
  ws.mergeCells('G16:H16'); put('G16', 'Отчётный период', { align: center, border: box });
  put('G17', 'с', { align: center, border: box }); put('H17', 'по', { align: center, border: box });
  put('E18', h.act_no, { align: center, border: box, font: { bold: true } });
  put('F18', ruDate(h.act_date), { align: center, border: box });
  put('G18', ruDate(h.period_from), { align: center, border: box });
  put('H18', ruDate(h.period_to), { align: center, border: box });
  put('D18', 'АКТ', { align: { horizontal: 'right', vertical: 'middle' }, font: { bold: true, size: 12 } });
  ws.mergeCells('A19:H19');
  put('A19', 'О ПРИЁМКЕ ВЫПОЛНЕННЫХ РАБОТ', { align: { horizontal: 'center' }, font: { bold: true, size: 12 } });

  const total = actTotal(s);
  put('A21', 'Сметная (договорная) стоимость в соответствии с договором подряда (субподряда)');
  put('G21', total, { numFmt: MONEY, border: under, align: right });
  put('H21', 'руб.');

  // Шапка таблицы
  const t0 = 23;
  ws.mergeCells(`A${t0}:B${t0}`); put(`A${t0}`, 'Номер', { align: center, border: box });
  ws.mergeCells(`F${t0}:H${t0}`); put(`F${t0}`, 'Выполнено работ', { align: center, border: box });
  for (const [c, text] of [['C', 'Наименование работ'], ['D', 'Номер единичной расценки'], ['E', 'Единица измерения']] as const) {
    ws.mergeCells(`${c}${t0}:${c}${t0 + 1}`); put(`${c}${t0}`, text, { align: center, border: box });
  }
  for (const [c, text] of [['A', 'по порядку'], ['B', 'позиции по смете'], ['F', 'количество'], ['G', 'цена за единицу, руб.'], ['H', 'стоимость, руб.']] as const) {
    put(`${c}${t0 + 1}`, text, { align: center, border: box });
  }
  ws.getRow(t0 + 1).height = 30;
  'ABCDEFGH'.split('').forEach((c, i) => put(`${c}${t0 + 2}`, i + 1, { align: center, border: box }));

  let r = t0 + 3;
  rows.forEach((row, i) => {
    put(`A${r}`, i + 1, { align: center, border: box });
    put(`B${r}`, row.number || String(row.row_no), { align: center, border: box });
    put(`C${r}`, row.name, { align: { vertical: 'top', wrapText: true }, border: box });
    put(`D${r}`, '', { border: box });
    put(`E${r}`, row.unit, { align: center, border: box });
    put(`F${r}`, row.qty, { numFmt: qtyFmt(row.qty), align: right, border: box });
    put(`G${r}`, kop(row.price ?? 0), { numFmt: MONEY, align: right, border: box });
    put(`H${r}`, rowCost(row), { numFmt: MONEY, align: right, border: box });
    // ~58 знаков в строке колонки C при ширине 58 и шрифте 9
    const lines = Math.max(1, Math.ceil(row.name.length / 62));
    if (lines > 1) ws.getRow(r).height = Math.min(409, 12 * lines + 2);
    r++;
  });
  ws.mergeCells(`A${r}:G${r}`);
  put(`A${r}`, 'Итого', { align: { horizontal: 'right' }, font: { bold: true }, border: box });
  put(`H${r}`, total, { numFmt: MONEY, align: right, border: box, font: { bold: true } });

  r += 3;
  const sign = (row: number, label: string, who: string) => {
    put(`A${row}`, label, { font: { bold: true } });
    ws.mergeCells(`B${row}:C${row}`); put(`B${row}`, who, { border: under });
    put(`D${row}`, '', { border: under }); ws.mergeCells(`E${row}:G${row}`); put(`E${row}`, '', { border: under });
    put(`B${row + 1}`, '(должность)', { align: { horizontal: 'center' }, font: { size: 7 } });
    put(`D${row + 1}`, '(подпись)', { align: { horizontal: 'center' }, font: { size: 7 } });
    put(`E${row + 1}`, '(расшифровка подписи)', { font: { size: 7 } });
  };
  sign(r, 'Сдал', h.contractor_signer);
  put(`H${r + 2}`, 'М. П.');
  sign(r + 4, 'Принял', h.customer_signer);
  put(`H${r + 6}`, 'М. П.');

  ws.pageSetup.printArea = `A1:H${r + 6}`;
  ws.pageSetup.printTitlesRow = `${t0}:${t0 + 2}`;
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
