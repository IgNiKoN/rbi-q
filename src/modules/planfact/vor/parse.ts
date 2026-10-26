/**
 * Разбор листа ВОР любой формы (P2-0006, этап 1). Чистые функции, без DOM и без библиотеки Excel:
 * на входе — лист как таблица значений (см. xlsx-reader.ts), на выходе — шапка, карта колонок, строки с типом и местом.
 *
 * Правила (подобраны по трём формам владельца: ФКП, себестоимость Г/Р/М, ведомость договорной цены):
 *  - шапка — первая строка (в первых 40) с колонкой «Наименование» и «Ед. изм.»/«Кол-во/Объём»; следующие строки шапки
 *    (повтор объединённых ячеек, подзаголовки «Работа / Материал / Итого») склеиваются в подпись «верх / низ»;
 *    строка нумерации колонок «1, 2, 3…» пропускается;
 *  - тип строки: колонка Г/Р/М (если есть) → group/work/material; колонка «Вид» КВР/Номенклатура (P2-0012, форма «Шаблон оферты СМР»)
 *    → КВР — group (итог вида работ заказчика: объём и ЕИ — только для сверки), Номенклатура — work со ссылкой на свою КВР
 *    (context.kvr) и пояснением из «Комментарий»/«Характеристика» (context.note); иначе: есть ЕИ → работа, а если заполнена
 *    «Норма расхода» — материал (дочерняя строка последней работы); нет ЕИ и объёма → группа;
 *  - место: «Корпус N», «Секция N», «Этаж N», «Этажи N-M» (можно через запятую: «Секция 1, Этаж 3») — стек наследуется
 *    строками ниже до заголовка того же или старшего уровня; «кв. 3, 16…» в любой ячейке строки — список квартир;
 *    «Итого Корпус N» дописывает корпус строкам выше, где корпус не был указан;
 *  - итоги («Итого», «Всего», «в т.ч. НДС») и всё после последней работы (подписи, реквизиты) — skip.
 */

export type Cell = string | number | null;
export interface SheetData { name: string; rows: Cell[][]; hidden?: boolean }

export type RowKind = 'group' | 'work' | 'material' | 'context' | 'skip';
export type ColumnRole = 'number' | 'name' | 'unit' | 'qty' | 'norm' | 'type' | 'price' | 'ignore';

export interface ColumnMap {
  number: number | null;
  name: number;
  unit: number | null;
  qty: number | null;
  norm: number | null;
  type: number | null;
  /** ЕИ всей таблицы, если колонки ЕИ нет, а единица указана в подписи колонки объёма («Количество изделий, шт»). */
  unitDefault: string | null;
  /** Колонки цен/стоимостей: подпись из шапки → номер колонки (0-based). */
  prices: { label: string; col: number }[];
  /** Колонки пояснения строки («Комментарий», «Характеристика») — в context.note (P2-0012). Нет в старом профиле — берутся из шапки. */
  notes?: number[];
}

export interface FloorRange { from: number; to: number }
export interface RowContext {
  building?: string;
  section?: string;
  floor?: FloorRange;
  apartments?: string;
  /** Корпус в файле не указан, а номера секций пошли заново («Секция 1…6», затем снова «Секция 2») — это другой корпус:
   *  номер блока по порядку (1, 2, …). ПТО выбирает корпус для блока на шаге «Места»; молча секции не сливаются. */
  block?: number;
  /** Пояснение строки-работы из «Комментарий» / «Характеристика» (P2-0012): различает одноимённые работы. */
  note?: string;
  /** Номер строки Excel КВР, под которой стоит строка Номенклатуры (P2-0012). */
  kvr?: number;
}

export interface ParsedRow {
  rowNo: number;          // номер строки Excel (1-based)
  kind: RowKind;
  number: string | null;
  name: string;
  unitText: string | null;
  qty: number | null;
  norm: number | null;
  prices: Record<string, number | null>;
  context: RowContext;
  parentRowNo: number | null; // материал → строка его работы
  isTotal?: boolean;
  raw: Cell[];
}

export interface SumCheck { rowNo: number; label: string; expected: number; actual: number; ok: boolean }
/** Сверка КВР (P2-0012): Σ объёмов Номенклатуры одного названия и той же ЕИ под КВР = объём КВР (допуск 0,01). */
export interface KvrCheck { kvrRowNo: number; kvrName: string; name: string; unit: string; expected: number; actual: number; ok: boolean; rowNos: number[] }

export interface ParseResult {
  sheet: string;
  isVor: boolean;
  reason: string | null;      // почему «не похоже на ВОР»
  headerRows: number[];        // 1-based строки шапки
  labels: string[];            // подпись каждой колонки (склеенная шапка)
  signature: string;           // подпись формы для профиля (см. headerSignature)
  columns: ColumnMap | null;
  rows: ParsedRow[];
  checks: SumCheck[];
  kvrChecks: KvrCheck[];
  stats: { total: number; works: number; materials: number; groups: number; context: number; worksWithUnit: number; worksWithQty: number };
}

export const MAX_ROWS = 10000;
const HEADER_SCAN = 40;

/** Число из ячейки: 12.6, «0,1», «1 234,56», «12,6 » → number; иначе null. */
export function parseNum(v: Cell | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? round6(v) : null;
  const s = String(v).replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return round6(Number(s));
}

/** Хвосты двоичной арифметики Excel (83.32999999999998) → 83.33; 6 знаков хватает и объёмам, и деньгам. */
function round6(n: number): number { return Math.round(n * 1e6) / 1e6; }

export function cellText(v: Cell | undefined): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\s ]+/g, ' ').trim();
}

const low = (s: string): string => s.toLowerCase().replace(/ё/g, 'е');

/** Роль колонки по подписи шапки (склеенной из нескольких строк). */
export function roleFromLabel(label: string): ColumnRole {
  const s = low(label);
  if (!s) return 'ignore';
  if (/норма\s*расхода/.test(s)) return 'norm';
  // «Стоимость материала на ед. изм.» (P2-0012) — цена, а не ЕИ.
  if (/^(цена|стоимост)/.test(s)) return 'price';
  if (/ед\.?\s*изм|единиц[аы]\s*измер/.test(s)) return 'unit';
  if (/наименование/.test(s)) return 'name';
  if (/(^|\s)№|n\s*п\/п|^п\/п|№\s*пп/.test(s)) return 'number';
  if (/цена|стоимост|сумма/.test(s)) return 'price';
  if (/кол-?во|количество|объ[её]м/.test(s)) return 'qty';
  return 'ignore';
}

function isNumberingRow(row: Cell[]): boolean {
  const vals = row.map(cellText).filter(Boolean);
  if (vals.length < 3) return false;
  const nums = vals.map((v) => parseNum(v));
  if (nums.some((n) => n === null || !Number.isInteger(n))) return false;
  let asc = 0;
  for (let i = 1; i < nums.length; i++) if ((nums[i] as number) === (nums[i - 1] as number) + 1) asc++;
  return asc >= vals.length - 2 && (nums[0] as number) <= 2;
}

/** Признак графика работ (ГПР): много колонок-дат («1-3», «5-10», месяцы) или «норма выработки». */
const MONTHS = /^(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)/;
function scheduleScore(labels: string[]): number {
  let dates = 0;
  for (const l of labels) {
    const s = low(l);
    if (/выработк/.test(s)) return 99;
    const parts = s.split(' / ');
    if (parts.some((p) => /^\d{1,2}\s*-\s*\d{1,2}$/.test(p.trim()) || MONTHS.test(p.trim()))) dates++;
  }
  return dates;
}

function headerScore(row: Cell[]): { name: number; unit: number; qty: number; any: number } {
  let name = -1, unit = -1, qty = -1, any = 0;
  row.forEach((c, i) => {
    const r = roleFromLabel(cellText(c));
    if (r === 'name' && name < 0) name = i;
    if (r === 'unit' && unit < 0) unit = i;
    if (r === 'qty' && qty < 0) qty = i;
    if (r !== 'ignore') any++;
  });
  return { name, unit, qty, any };
}

interface Header { rows: number[]; labels: string[]; dataStart: number }

/** Поиск шапки: индекс строк (0-based) и склеенные подписи колонок. */
export function findHeader(rows: Cell[][]): Header | null {
  const lim = Math.min(rows.length, HEADER_SCAN);
  for (let i = 0; i < lim; i++) {
    const sc = headerScore(rows[i] || []);
    if (sc.name < 0 || (sc.unit < 0 && sc.qty < 0)) continue;
    const hdr = [i];
    let j = i + 1;
    // Продолжение шапки: строка без чисел-объёмов, где есть подпись над/под колонками (Работа / Материал / Итого / СМР…).
    while (j < rows.length && j < i + 3) {
      const r = rows[j] || [];
      if (isNumberingRow(r)) break;
      const texts = r.map(cellText);
      const filled = texts.filter(Boolean);
      if (!filled.length) break;
      const numeric = filled.filter((t) => parseNum(t) !== null).length;
      const sameAsTop = texts[sc.name] && texts[sc.name] === cellText(rows[i][sc.name]);
      const subWords = filled.filter((t) => /^(работа|работы|материал|материалы|итого|всего|смр|оборудование)$/i.test(t)).length;
      if (numeric === 0 && (sameAsTop || subWords >= 2)) { hdr.push(j); j++; continue; }
      break;
    }
    if (j < rows.length && isNumberingRow(rows[j] || [])) j++;
    const width = Math.max(...hdr.map((k) => (rows[k] || []).length));
    const labels: string[] = [];
    for (let c = 0; c < width; c++) {
      const parts: string[] = [];
      for (const k of hdr) { const t = cellText((rows[k] || [])[c]); if (t && !parts.includes(t)) parts.push(t); }
      labels.push(parts.join(' / '));
    }
    return { rows: hdr, labels, dataStart: j };
  }
  return null;
}

/** Значение колонки «Вид» формы КВР/Номенклатура (по началу слова: «кВР», «Номенклатура работ»). */
export function kvrMark(text: string): 'group' | 'work' | null {
  const t = low(cellText(text));
  if (/^квр(?!\p{L})/u.test(t)) return 'group';
  if (/^номенклатур/.test(t)) return 'work';
  return null;
}

/** Колонка типа: ≥ 50 % непустых значений в данных — одна буква Г, Р или М либо КВР / Номенклатура. */
function findTypeColumn(rows: Cell[][], from: number, width: number): number | null {
  const counts: number[] = new Array(width).fill(0);
  const filled: number[] = new Array(width).fill(0);
  const to = Math.min(rows.length, from + 400);
  for (let i = from; i < to; i++) {
    const r = rows[i] || [];
    for (let c = 0; c < width; c++) {
      const t = cellText(r[c]);
      if (!t) continue;
      filled[c]++;
      if (/^[ГРМгрм]$/.test(t) || kvrMark(t)) counts[c]++;
    }
  }
  let best: number | null = null;
  for (let c = 0; c < width; c++) if (counts[c] >= 3 && counts[c] / filled[c] >= 0.5 && (best === null || counts[c] > counts[best])) best = c;
  return best;
}

/** Подпись формы — её структура: роль каждой колонки шапки по порядку («№ | наименование | ЕИ | норма | объём | цена:работа…»).
 *  Не зависит от формулировок («Кол-во» = «Объём», «НДС 20 %» = «НДС»), поэтому листы одной формы узнаются одним профилем.
 *  Колонка с подписью без роли — «·», пустая — пусто; хвостовые пустые отбрасываются. */
export function headerSignature(labels: string[]): string {
  const parts = labels.map((l) => {
    const r = roleFromLabel(l);
    if (r === 'price') {
      const sub = low(l.split(' / ').pop() || '').replace(/[^\p{L}]+/gu, '');
      return 'цена:' + (sub && !/цена|стоимост|сумма/.test(sub) ? sub.slice(0, 12) : '');
    }
    if (r === 'ignore') return cellText(l) ? '·' : '';
    return r;
  });
  while (parts.length && !parts[parts.length - 1]) parts.pop();
  return parts.join('|').slice(0, 2000);
}

/** Карта колонок из профиля (jsonb с сервера) → ColumnMap; неверная — null. */
export function columnMapFrom(v: unknown): ColumnMap | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const col = (k: string): number | null => (typeof o[k] === 'number' && Number.isInteger(o[k]) && (o[k] as number) >= 0 ? o[k] as number : null);
  const name = col('name');
  if (name === null) return null;
  const prices = Array.isArray(o.prices) ? (o.prices as { label?: unknown; col?: unknown }[])
    .filter((p) => typeof p.label === 'string' && typeof p.col === 'number').map((p) => ({ label: p.label as string, col: p.col as number })) : [];
  const out: ColumnMap = { number: col('number'), name, unit: col('unit'), qty: col('qty'), norm: col('norm'), type: col('type'),
    unitDefault: typeof o.unitDefault === 'string' ? o.unitDefault : null, prices };
  if (Array.isArray(o.notes)) out.notes = (o.notes as unknown[]).filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0);
  return out;
}

export type EditableRole = 'number' | 'name' | 'unit' | 'qty' | 'norm' | 'type';
/** Ручная правка карты колонок: роль → колонка (null — нет). Одна колонка — одна роль (прежняя роль колонки снимается);
 *  колонка уходит из цен; ЕИ по подписи объёма пересчитывается. «Наименование» снять нельзя. */
export function editColumn(map: ColumnMap, labels: string[], role: EditableRole, col: number | null): ColumnMap {
  if (role === 'name' && col === null) return map;
  const next: ColumnMap = { ...map, prices: map.prices.filter((p) => p.col !== col) };
  if (col !== null) for (const r of ['number', 'unit', 'qty', 'norm', 'type'] as const) if (r !== role && next[r] === col) next[r] = null;
  if (col !== null && role !== 'name' && next.name === col) return map;
  if (role === 'name') next.name = col as number; else next[role] = col;
  next.unitDefault = null;
  if (next.unit === null && next.qty !== null) {
    const m = (labels[next.qty] || '').split(' / ')[0].match(/,\s*([^,]{1,12})$/);
    if (m) next.unitDefault = m[1].trim();
  }
  return next;
}

/** Карта колонок по подписям шапки (первая подходящая колонка каждой роли; цены — все). */
export function columnsFromLabels(labels: string[], typeCol: number | null): ColumnMap | null {
  const map: ColumnMap = { number: null, name: -1, unit: null, qty: null, norm: null, type: typeCol, unitDefault: null, prices: [] };
  labels.forEach((l, c) => {
    if (c === typeCol) return;
    const r = roleFromLabel(l);
    if (r === 'price') map.prices.push({ label: l, col: c });
    else if (r === 'name' && map.name < 0) map.name = c;
    else if (r !== 'ignore' && r !== 'name' && map[r] === null) map[r] = c;
  });
  if (map.name < 0) return null;
  if (map.unit === null && map.qty !== null) {
    const m = labels[map.qty].split(' / ')[0].match(/,\s*([^,]{1,12})$/);
    if (m) map.unitDefault = m[1].trim();
  }
  map.notes = noteColumns(labels);
  return map;
}

/** Колонки пояснения строки: «Комментарий», «Характеристика» (P2-0012). Роль колонки в подписи формы не меняют. */
export function noteColumns(labels: string[]): number[] {
  const out: number[] = [];
  labels.forEach((l, c) => { if (/^(комментари|характеристик)/.test(low(cellText(l)))) out.push(c); });
  return out;
}

/** Похоже на ЕИ: короткий текст (м2, шт., пог.м, компл.); длинный текст — это растянутая объединённая ячейка, а не ЕИ. */
export function asUnit(text: string, name: string): string | null {
  const t = cellText(text);
  if (!t || t.length > 12 || t === name || /\d{3,}/.test(t)) return null;
  return t;
}

/** Текст строки для заголовков места/групп, если колонка «Наименование» пуста (форма держит «Секция 1» в колонке «Поз.»). */
function altTitle(r: Cell[], columns: ColumnMap): string {
  const stop = Math.min(...[columns.unit, columns.qty, columns.norm].filter((c): c is number => c !== null), r.length);
  for (let c = 0; c < stop; c++) {
    if (c === columns.number || c === columns.type) continue;
    const t = cellText(r[c]);
    if (t && parseNum(t) === null) return t;
  }
  return '';
}

const TOTAL_RE = /^(итого|всего|в\s*т\.?\s*ч\.?|в\s+том\s+числе)/i;
const FOOTER_RE = /^(руководитель|генеральный директор|_{3,}|должность|м\.?п\.?$|печать)/i;
const BUILDING_TOTAL_RE = /итого\s+(?:по\s+)?корпус[уа]?\s+№?\s*(\d[\p{L}\d.-]*)/iu;
const APARTMENTS_RE = /^к(?:в)?\.?\s*\d/i;

/** Заголовок места: «Корпус 1», «Секция 4», «Этаж 2», «Этажи 4-12», «Секция 1, Этаж 3». null — не заголовок места. */
export function parseContextTitle(text: string): RowContext | null {
  const s = cellText(text);
  if (!s || s.length > 60) return null;
  const parts = s.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  const ctx: RowContext = {};
  for (const p of parts) {
    let m: RegExpMatchArray | null;
    if ((m = p.match(/^корпус\s*№?\s*([\p{L}\d.-]+)$/iu))) ctx.building = m[1];
    else if ((m = p.match(/^секци[яи]\s*№?\s*(\d+[\p{L}]?)$/iu))) ctx.section = m[1];
    else if ((m = p.match(/^этаж[и]?\s*№?\s*(-?\d+)\s*[-–—]\s*(-?\d+)$/iu))) ctx.floor = { from: Number(m[1]), to: Number(m[2]) };
    else if ((m = p.match(/^этаж\s*№?\s*(-?\d+)$/iu))) ctx.floor = { from: Number(m[1]), to: Number(m[1]) };
    else return null;
  }
  return Object.keys(ctx).length ? ctx : null;
}

/** Список квартир из строки: первая ячейка вида «кв. 3, 16, 24…» (форма ФКП держит её справа от таблицы). */
export function findApartments(row: Cell[]): string | null {
  for (const c of row) {
    const t = cellText(c);
    if (t && APARTMENTS_RE.test(t)) return t;
  }
  return null;
}

/** Применить заголовок места к стеку: старший уровень сбрасывает младшие и список квартир. */
function applyContext(cur: RowContext, add: RowContext): RowContext {
  const next: RowContext = { ...cur };
  if (add.building !== undefined) { next.building = add.building; delete next.section; delete next.floor; delete next.apartments; }
  if (add.section !== undefined) { next.section = add.section; delete next.floor; delete next.apartments; }
  if (add.floor !== undefined) { next.floor = add.floor; delete next.apartments; }
  return next;
}

/** Разбор листа. columnsOverride — ручная правка карты колонок (профиль формы, этап 3). */
export function parseSheet(sheet: SheetData, columnsOverride?: ColumnMap | null): ParseResult {
  const base: ParseResult = { sheet: sheet.name, isVor: false, reason: null, headerRows: [], labels: [], signature: '', columns: null, rows: [], checks: [], kvrChecks: [],
    stats: { total: 0, works: 0, materials: 0, groups: 0, context: 0, worksWithUnit: 0, worksWithQty: 0 } };
  const rows = sheet.rows;
  if (rows.length > MAX_ROWS) return { ...base, reason: `В листе ${rows.length} строк — больше предела ${MAX_ROWS}. Разделите файл на части.` };
  const hdr = findHeader(rows);
  if (!hdr) return { ...base, reason: 'Не найдена шапка: нет колонок «Наименование» и «Ед. изм.» / «Количество».' };
  const sched = scheduleScore(hdr.labels);
  const signature = headerSignature(hdr.labels);
  if (sched >= 6) return { ...base, headerRows: hdr.rows.map((r) => r + 1), labels: hdr.labels, signature, reason: 'Похоже на график работ (колонки-даты), а не на ВОР.' };
  const width = Math.max(hdr.labels.length, ...rows.slice(hdr.dataStart, hdr.dataStart + 50).map((r) => (r || []).length));
  const typeCol = findTypeColumn(rows, hdr.dataStart, width);
  let columns = columnsOverride || columnsFromLabels(hdr.labels, typeCol);
  // Профиль, сохранённый до P2-0012, не знает колонку «Вид» КВР/Номенклатура и колонки пояснения — дополнить по файлу.
  if (columns && columnsOverride) {
    const used = [columns.number, columns.name, columns.unit, columns.qty, columns.norm, ...columns.prices.map((p) => p.col)];
    const kvrType = typeCol !== null && rows.slice(hdr.dataStart, hdr.dataStart + 400).some((r) => kvrMark(cellText((r || [])[typeCol])));
    if (columns.type === null && kvrType && !used.includes(typeCol)) columns = { ...columns, type: typeCol };
    if (!columns.notes) columns = { ...columns, notes: noteColumns(hdr.labels) };
  }
  if (!columns) return { ...base, headerRows: hdr.rows.map((r) => r + 1), labels: hdr.labels, signature, reason: 'Не найдена колонка «Наименование».' };

  const out: ParsedRow[] = [];
  let ctx: RowContext = {};
  let lastWork: number | null = null;
  let blockStart = 0; // начало строк корпуса — для «Итого Корпус N»
  let block = 1, lastSection: number | null = null, restarted = false; // повтор номеров секций без корпуса → новый блок
  let kvr: number | null = null; // текущая КВР (P2-0012)
  for (let i = hdr.dataStart; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = cellText(r[columns.name]) || altTitle(r, columns);
    const unitCell = columns.unit !== null ? asUnit(cellText(r[columns.unit]), name) : null;
    const unitText = unitCell || (columns.unitDefault && (parseNum(r[columns.qty as number]) !== null) ? columns.unitDefault : null);
    const qty = columns.qty !== null ? parseNum(r[columns.qty]) : null;
    const norm = columns.norm !== null ? parseNum(r[columns.norm]) : null;
    const number = columns.number !== null ? cellText(r[columns.number]) || null : null;
    const typeText = columns.type !== null ? cellText(r[columns.type]) : '';
    const typeMark = typeText.toUpperCase();
    const kvrKind = typeText ? kvrMark(typeText) : null;
    const prices: Record<string, number | null> = {};
    for (const p of columns.prices) prices[p.label] = parseNum(r[p.col]);
    const row: ParsedRow = { rowNo: i + 1, kind: 'skip', number, name, unitText, qty, norm, prices, context: {}, parentRowNo: null, raw: r.slice(0, width) };
    const apartments = findApartments(r.filter((_, c) => c !== columns.name));
    const ctxTitle = !unitText && qty === null ? parseContextTitle(name) : null;

    if (!name) row.kind = 'skip';
    else if (TOTAL_RE.test(name)) {
      row.kind = 'skip'; row.isTotal = true;
      const m = name.match(BUILDING_TOTAL_RE);
      if (m) {
        for (let k = blockStart; k < out.length; k++) if (out[k].kind !== 'skip' && out[k].context.building === undefined) out[k].context = { building: m[1], ...out[k].context };
        blockStart = out.length + 1;
        ctx = {};
        lastSection = null;
      }
    } else if (FOOTER_RE.test(name)) row.kind = 'skip';
    else if (ctxTitle) {
      row.kind = 'context';
      if (ctxTitle.building !== undefined) lastSection = null;
      if (ctxTitle.section !== undefined && ctxTitle.building === undefined) {
        const n = parseInt(ctxTitle.section, 10);
        if (lastSection !== null && Number.isFinite(n) && n <= lastSection) { block++; restarted = true; }
        if (Number.isFinite(n)) lastSection = n;
      }
      ctx = applyContext(ctx, ctxTitle);
      ctx.block = block;
      if (ctxTitle.building !== undefined) blockStart = out.length;
      if (apartments) ctx = { ...ctx, apartments };
    } else if (kvrKind) row.kind = kvrKind;
    else if (typeMark === 'Г') row.kind = 'group';
    else if (typeMark === 'Р') row.kind = 'work';
    else if (typeMark === 'М') row.kind = 'material';
    else if (columns.type !== null && !typeMark && !unitText && qty === null) row.kind = 'group';
    else if (unitText || qty !== null) row.kind = columns.norm !== null && norm !== null && lastWork !== null ? 'material' : 'work';
    else row.kind = 'group';

    if (row.kind === 'group' && apartments) ctx = { ...ctx, apartments };
    if (row.kind === 'work') lastWork = row.rowNo;
    if (row.kind === 'material') row.parentRowNo = lastWork;
    if (row.kind !== 'skip') row.context = { ...ctx };
    if (kvrKind === 'group') kvr = row.rowNo;
    if (kvrKind === 'work') {
      if (kvr !== null) row.context.kvr = kvr;
      const note = rowNote(r, columns, name);
      if (note) row.context.note = note;
    }
    out.push(row);
  }

  // Блоки нужны, только если номера секций начинались заново и корпус не известен (ни из заголовка, ни из «Итого Корпус N»).
  for (const r of out) if (r.context.block !== undefined && (!restarted || r.context.building !== undefined)) delete r.context.block;

  // Подписи, реквизиты и прочее после последней работы/материала — не данные.
  let lastData = -1;
  out.forEach((r, k) => { if (r.kind === 'work' || r.kind === 'material') lastData = k; });
  for (let k = lastData + 1; k < out.length; k++) if (out[k].kind !== 'skip') { out[k].kind = 'skip'; out[k].context = {}; }

  const checks = sumChecks(out, columns);
  const kvrChecks = kvrCheck(out);
  const stats = { total: out.length, works: 0, materials: 0, groups: 0, context: 0, worksWithUnit: 0, worksWithQty: 0 };
  for (const r of out) {
    if (r.kind === 'work') { stats.works++; if (r.unitText) stats.worksWithUnit++; if (r.qty !== null) stats.worksWithQty++; }
    else if (r.kind === 'material') stats.materials++;
    else if (r.kind === 'group') stats.groups++;
    else if (r.kind === 'context') stats.context++;
  }
  const isVor = stats.works > 0;
  return { sheet: sheet.name, isVor, reason: isVor ? null : 'В листе не найдено ни одной строки-работы.', headerRows: hdr.rows.map((r) => r + 1), labels: hdr.labels, signature, columns, rows: out, checks, kvrChecks, stats };
}

/** Пояснение строки: непустые «Комментарий» / «Характеристика» без повторов и без копии наименования. */
function rowNote(r: Cell[], columns: ColumnMap, name: string): string {
  const parts: string[] = [];
  for (const c of columns.notes || []) {
    const t = cellText(r[c]);
    if (t && t !== name && !parts.includes(t)) parts.push(t);
  }
  return parts.join(' · ').slice(0, 1000);
}

const nameKey = (s: string): string => low(cellText(s)).replace(/[.,;:]+$/, '');
const unitNorm = (s: string | null): string => low(cellText(s)).replace(/²/g, '2').replace(/³/g, '3').replace(/[\s.]/g, '');

/** Минимум строки для сверки КВР: и строка разбора, и строка черновика с сервера (row_no / unit_text). */
export interface KvrRowLike { rowNo: number; kind: RowKind; name: string; unitText: string | null; qty: number | null; context: RowContext }

/** Сверка КВР: для каждой КВР — работы под ней по (название, ЕИ); ЕИ, отличная от ЕИ КВР, не сверяется (пог. м под м²). */
export function kvrCheck(rows: KvrRowLike[]): KvrCheck[] {
  const groups = new Map<number, KvrRowLike>();
  for (const r of rows) if (r.kind === 'group') groups.set(r.rowNo, r);
  const sets = new Map<string, KvrCheck>();
  for (const r of rows) {
    if (r.kind !== 'work' || r.context.kvr === undefined) continue;
    const g = groups.get(r.context.kvr);
    if (!g || g.qty === null || unitNorm(r.unitText) !== unitNorm(g.unitText)) continue;
    const key = g.rowNo + '|' + nameKey(r.name);
    let c = sets.get(key);
    if (!c) { c = { kvrRowNo: g.rowNo, kvrName: g.name, name: r.name, unit: g.unitText || '', expected: g.qty, actual: 0, ok: false, rowNos: [] }; sets.set(key, c); }
    c.actual = round6(c.actual + (r.qty || 0));
    c.rowNos.push(r.rowNo);
  }
  const out = Array.from(sets.values());
  for (const c of out) c.ok = Math.abs(c.actual - c.expected) <= 0.01;
  return out;
}

/** Сверка итогов: число в колонке цены у строки «Итого» = сумма этой колонки по работам и материалам выше
 *  (от предыдущего итога; если не сошлось — от начала таблицы: «ИТОГО по корпусам»). Итоги без значения (формула без кэша) не проверяются. */
export function sumChecks(rows: ParsedRow[], columns: ColumnMap): SumCheck[] {
  const checks: SumCheck[] = [];
  let segStart = 0;
  rows.forEach((r, k) => {
    if (!r.isTotal || /^в\s*т\.?\s*ч|^в\s+том\s+числе/i.test(r.name)) return;
    for (const p of columns.prices) {
      const expected = r.prices[p.label];
      if (expected === null || expected === undefined) continue;
      const sum = (from: number): number => rows.slice(from, k).reduce((a, x) => a + ((x.kind === 'work' || x.kind === 'material') ? (x.prices[p.label] || 0) : 0), 0);
      let actual = sum(segStart);
      const close = (a: number): boolean => Math.abs(a - expected) <= Math.max(0.01, Math.abs(expected) * 1e-9);
      if (!close(actual)) { const all = sum(0); if (close(all)) actual = all; }
      checks.push({ rowNo: r.rowNo, label: p.label, expected, actual: Math.round(actual * 100) / 100, ok: close(actual) });
    }
    if (rows.slice(segStart, k).some((x) => x.kind === 'work')) segStart = k + 1;
  });
  return checks;
}

/** Подпись места строки для экрана: «Корп. 7 · Секция 1 · Этаж 2 · кв. 3, 16…». */
export function contextLabel(c: RowContext): string {
  const parts: string[] = [];
  if (c.building) parts.push(`Корпус ${c.building}`);
  else if (c.block) parts.push(`Блок ${c.block} (корпус не указан)`);
  if (c.section) parts.push(`Секция ${c.section}`);
  if (c.floor) parts.push(c.floor.from === c.floor.to ? `Этаж ${c.floor.from}` : `Этажи ${c.floor.from}–${c.floor.to}`);
  if (c.apartments) parts.push(c.apartments);
  return parts.join(' · ');
}
