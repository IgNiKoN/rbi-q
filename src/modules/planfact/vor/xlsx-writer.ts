/**
 * Точечная запись чисел в .xlsx заказчика — для КП (P2-0006c). Решение владельца 21.10.2026: exceljs при пересохранении
 * теряет части файла (внешние ссылки формул, настройки печати, номера листов), поэтому файл не пересобирается.
 * .xlsx — zip-архив: меняется только XML нужного листа (ячейки цен) и флаг «пересчитать при открытии» в workbook.xml;
 * все прочие части копируются байт-в-байт. Ячейки с формулой не перезаписываются (возвращаются в skippedFormula).
 * Лист с ценами делается видимым и открывается первым (заказчики скрывают листы ФКП); прочие листы — как были.
 * Без библиотек: CompressionStream/DecompressionStream ('deflate-raw') есть в браузерах и Node ≥ 18.
 */
import { sha256Hex } from './xlsx-reader.ts';

/** Запись: rowNo — номер строки Excel (1…), col — индекс колонки с 0 (как в ColumnMap), value — число. */
export interface CellWrite { rowNo: number; col: number; value: number }
export interface PatchResult {
  bytes: Uint8Array;
  /** Ячейки, где значение записано (адреса A1). */
  written: string[];
  /** Ячейки с формулой заказчика — не тронуты. */
  skippedFormula: string[];
}

// ---------- zip ----------

interface ZipEntry {
  name: string; flags: number; method: number; crc: number; compSize: number; size: number;
  localOffset: number; cdStart: number; cdEnd: number;
}
interface Zip { buf: Uint8Array; entries: ZipEntry[]; cdOffset: number; eocdStart: number }

const dec = new TextDecoder();
const enc = new TextEncoder();
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
function w16(b: Uint8Array, o: number, v: number) { b[o] = v & 0xff; b[o + 1] = (v >>> 8) & 0xff; }
function w32(b: Uint8Array, o: number, v: number) { w16(b, o, v & 0xffff); w16(b, o + 2, v >>> 16); }

const BAD = 'Файл повреждён или это не .xlsx — записать цены не удалось.';

function readZip(buf: Uint8Array): Zip {
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (u32(buf, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error(BAD);
  const count = u16(buf, e + 10);
  const cdOffset = u32(buf, e + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new Error('Файл слишком большой (zip64) — такая форма пока не поддерживается.');
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let k = 0; k < count; k++) {
    if (u32(buf, p) !== 0x02014b50) throw new Error(BAD);
    const nameLen = u16(buf, p + 28), extraLen = u16(buf, p + 30), commentLen = u16(buf, p + 32);
    const flags = u16(buf, p + 8);
    if (flags & 1) throw new Error('Файл защищён паролем — снимите защиту и выберите файл снова.');
    entries.push({
      name: dec.decode(buf.subarray(p + 46, p + 46 + nameLen)), flags, method: u16(buf, p + 10),
      crc: u32(buf, p + 16), compSize: u32(buf, p + 20), size: u32(buf, p + 24), localOffset: u32(buf, p + 42),
      cdStart: p, cdEnd: p + 46 + nameLen + extraLen + commentLen,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { buf, entries, cdOffset, eocdStart: e };
}

function dataStart(z: Zip, en: ZipEntry): number {
  const o = en.localOffset;
  if (u32(z.buf, o) !== 0x04034b50) throw new Error(BAD);
  return o + 30 + u16(z.buf, o + 26) + u16(z.buf, o + 28);
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

async function entryData(z: Zip, en: ZipEntry): Promise<Uint8Array> {
  const s = dataStart(z, en);
  const raw = z.buf.subarray(s, s + en.compSize);
  if (en.method === 0) return raw;
  if (en.method === 8) return pipe(raw, new DecompressionStream('deflate-raw'));
  throw new Error(BAD);
}

let crcTable: Uint32Array | null = null;
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Собрать архив заново: изменённые части — сжатые заново, остальные — исходные байты (заголовок + данные). */
async function writeZip(z: Zip, changed: Map<string, Uint8Array>): Promise<Uint8Array> {
  const byOffset = [...z.entries].sort((a, b) => a.localOffset - b.localOffset);
  const endOf = new Map<ZipEntry, number>();
  byOffset.forEach((en, i) => endOf.set(en, i + 1 < byOffset.length ? byOffset[i + 1].localOffset : z.cdOffset));
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let off = 0;
  for (const en of z.entries) {
    const cd = z.buf.slice(en.cdStart, en.cdEnd);
    w32(cd, 42, off);
    const data = changed.get(en.name);
    if (!data) {
      const chunk = z.buf.subarray(en.localOffset, endOf.get(en)!);
      parts.push(chunk); off += chunk.length;
    } else {
      const comp = await pipe(data, new CompressionStream('deflate-raw'));
      const crc = crc32(data);
      const name = z.buf.subarray(en.localOffset + 30, en.localOffset + 30 + u16(z.buf, en.localOffset + 26));
      const lh = new Uint8Array(30 + name.length);
      lh.set(z.buf.subarray(en.localOffset, en.localOffset + 30));
      const flags = en.flags & ~0x0008; // без дескриптора данных: размеры в заголовке
      w16(lh, 6, flags); w16(lh, 8, 8); w32(lh, 14, crc); w32(lh, 18, comp.length); w32(lh, 22, data.length); w16(lh, 28, 0);
      lh.set(name, 30);
      w16(cd, 8, flags); w16(cd, 10, 8); w32(cd, 16, crc); w32(cd, 20, comp.length); w32(cd, 24, data.length);
      parts.push(lh, comp); off += lh.length + comp.length;
    }
    central.push(cd);
  }
  const cdOffset = off;
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const eocd = z.buf.slice(z.eocdStart);
  w32(eocd, 12, cdSize); w32(eocd, 16, cdOffset);
  const out = new Uint8Array(cdOffset + cdSize + eocd.length);
  let p = 0;
  for (const c of [...parts, ...central, eocd]) { out.set(c, p); p += c.length; }
  return out;
}

// ---------- xml ----------

const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name.replace(':', '\\:')}="([^"]*)"`).exec(tag);
  return m ? unesc(m[1]) : null;
}
function relsPath(part: string): string { const i = part.lastIndexOf('/'); return `${part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels`; }
function resolve(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const t of target.split('/')) { if (t === '..') parts.pop(); else if (t !== '.') parts.push(t); }
  return parts.join('/');
}
function relTarget(rels: string, pred: (rel: string) => boolean): string | null {
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) if (pred(m[0])) return attr(m[0], 'Target');
  return null;
}

export function colLetters(col: number): string {
  let n = col + 1, s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function numText(v: number): string {
  if (!Number.isFinite(v)) throw new Error('Цена должна быть числом.');
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

/** Стиль колонки из <cols> (чтобы новая ячейка выглядела как соседние). */
function colStyles(xml: string): (col: number) => string | null {
  const list: { min: number; max: number; style: string }[] = [];
  for (const m of xml.matchAll(/<col\b[^>]*>/g)) {
    const st = attr(m[0], 'style');
    if (st) list.push({ min: Number(attr(m[0], 'min')) - 1, max: Number(attr(m[0], 'max')) - 1, style: st });
  }
  return (c) => list.find((x) => c >= x.min && c <= x.max)?.style ?? null;
}

/** Вписать числа в XML листа. Чистая функция (тестируется отдельно). */
export function patchSheetXml(xml: string, writes: CellWrite[]): { xml: string; written: string[]; skippedFormula: string[] } {
  if (!/<sheetData\b/.test(xml)) throw new Error('Лист в файле устроен необычно (нет таблицы ячеек) — записать цены нельзя.');
  const written: string[] = [], skippedFormula: string[] = [];
  const byRow = new Map<number, CellWrite[]>();
  for (const w of writes) {
    if (!Number.isInteger(w.rowNo) || w.rowNo < 1 || !Number.isInteger(w.col) || w.col < 0) throw new Error('Неверный адрес ячейки.');
    numText(w.value);
    const arr = byRow.get(w.rowNo) ?? [];
    arr.push(w); byRow.set(w.rowNo, arr);
  }
  const styleOf = colStyles(xml);
  const sd = /<sheetData\s*\/>/.exec(xml);
  if (sd) xml = xml.slice(0, sd.index) + '<sheetData></sheetData>' + xml.slice(sd.index + sd[0].length);
  const open = /<sheetData\b[^>]*>/.exec(xml)!;
  const bodyStart = open.index + open[0].length;
  const bodyEnd = xml.indexOf('</sheetData>', bodyStart);
  if (bodyEnd < 0) throw new Error(BAD);
  const body = xml.slice(bodyStart, bodyEnd);

  const rowRe = /<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
  const rows: { r: number; start: number; end: number; text: string }[] = [];
  for (const m of body.matchAll(rowRe)) {
    const head = /^<row\b[^>]*?\/?>/.exec(m[0])![0];
    const r = Number(attr(head, 'r'));
    if (!r) throw new Error('В листе есть строки без номера — такой файл пока не поддерживается.');
    rows.push({ r, start: m.index!, end: m.index! + m[0].length, text: m[0] });
  }

  const cellXml = (ref: string, attrs: string, v: number) => `<c r="${ref}"${attrs}><v>${numText(v)}</v></c>`;
  const patchRow = (rowText: string, rowNo: number, ws: CellWrite[]): string => {
    const selfClose = /^<row\b[^>]*?\/>$/.test(rowText);
    const head = /^<row\b[^>]*?\/?>/.exec(rowText)![0];
    let inner = selfClose ? '' : rowText.slice(head.length, rowText.length - '</row>'.length);
    const rowStyle = attr(head, 'customFormat') === '1' ? attr(head, 's') : null;
    for (const w of [...ws].sort((a, b) => a.col - b.col)) {
      const ref = colLetters(w.col) + rowNo;
      const cells = [...inner.matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)];
      const hit = cells.find((c) => attr(/^<c\b[^>]*?\/?>/.exec(c[0])![0], 'r') === ref);
      if (hit) {
        const ctag = /^<c\b[^>]*?\/?>/.exec(hit[0])![0];
        if (/<f[\s>/]/.test(hit[0])) { skippedFormula.push(ref); continue; }
        const keep = ctag.replace(/^<c\b/, '').replace(/\/?>$/, '').replace(/\s(r|t|vm|cm)="[^"]*"/g, '');
        inner = inner.slice(0, hit.index!) + cellXml(ref, keep, w.value) + inner.slice(hit.index! + hit[0].length);
      } else {
        if (cells.some((c) => !attr(/^<c\b[^>]*?\/?>/.exec(c[0])![0], 'r'))) throw new Error('В листе есть ячейки без адреса — такой файл пока не поддерживается.');
        const st = rowStyle ?? styleOf(w.col);
        const nc = cellXml(ref, st ? ` s="${st}"` : '', w.value);
        const after = cells.find((c) => colIndex(attr(/^<c\b[^>]*?\/?>/.exec(c[0])![0], 'r')!) > w.col);
        const at = after ? after.index! : inner.length;
        inner = inner.slice(0, at) + nc + inner.slice(at);
      }
      written.push(ref);
    }
    const openTag = selfClose ? head.replace(/\s*\/>$/, '>') : head;
    return `${openTag}${inner}</row>`;
  };

  let out = '';
  let pos = 0;
  const pending = new Map(byRow);
  for (const row of rows) {
    // строки, которых нет в файле и которые идут раньше этой, — вставить перед ней
    for (const rn of [...pending.keys()].sort((a, b) => a - b)) {
      if (rn >= row.r) break;
      if (!rows.some((x) => x.r === rn)) { out += body.slice(pos, row.start); pos = row.start; out += patchRow(`<row r="${rn}"/>`, rn, pending.get(rn)!); pending.delete(rn); }
    }
    const ws = pending.get(row.r);
    if (!ws) continue;
    out += body.slice(pos, row.start) + patchRow(row.text, row.r, ws);
    pos = row.end;
    pending.delete(row.r);
  }
  out += body.slice(pos);
  for (const rn of [...pending.keys()].sort((a, b) => a - b)) out += patchRow(`<row r="${rn}"/>`, rn, pending.get(rn)!);
  return { xml: xml.slice(0, bodyStart) + out + xml.slice(bodyEnd), written, skippedFormula };
}

/** Флаг «полностью пересчитать при открытии» — чтобы формулы заказчика (суммы, итоги) учли новые цены. */
export function setFullCalcOnLoad(wbXml: string): string {
  const m = /<calcPr\b[^>]*?\/?>/.exec(wbXml);
  if (m) {
    const tag = /\sfullCalcOnLoad="[^"]*"/.test(m[0])
      ? m[0].replace(/\sfullCalcOnLoad="[^"]*"/, ' fullCalcOnLoad="1"')
      : m[0].replace(/\s*(\/?>)$/, ' fullCalcOnLoad="1"$1');
    return wbXml.slice(0, m.index) + tag + wbXml.slice(m.index + m[0].length);
  }
  const next = /<(oleSize|customWorkbookViews|pivotCaches|smartTagPr|smartTagTypes|webPublishing|fileRecoveryPr|webPublishObjects|extLst)\b|<\/workbook>/.exec(wbXml);
  if (!next) throw new Error(BAD);
  return wbXml.slice(0, next.index) + '<calcPr fullCalcOnLoad="1"/>' + wbXml.slice(next.index);
}

/** Лист с ценами — видимый и открывается первым (решение владельца 21.10.2026: заказчик скрывает листы ФКП).
 *  Прочие скрытые листы остаются скрытыми; содержимое не меняется, только настройки вида книги. */
export function showAndActivate(wbXml: string, sheetName: string): string {
  const tags = [...wbXml.matchAll(/<sheet\b[^>]*>/g)];
  const idx = tags.findIndex((m) => attr(m[0], 'name') === sheetName);
  if (idx < 0) throw new Error(BAD);
  const t = tags[idx];
  const shown = t[0].replace(/\sstate="[^"]*"/, '');
  let out = wbXml.slice(0, t.index) + shown + wbXml.slice(t.index! + t[0].length);
  const v = /<workbookView\b[^>]*?\/?>/.exec(out);
  if (v) {
    let tag = /\sactiveTab="[^"]*"/.test(v[0]) ? v[0].replace(/\sactiveTab="[^"]*"/, ` activeTab="${idx}"`) : v[0].replace(/\s*(\/?>)$/, ` activeTab="${idx}"$1`);
    const first = Number(attr(tag, 'firstSheet') ?? 0);
    if (first > idx) tag = tag.replace(/\sfirstSheet="[^"]*"/, ` firstSheet="${idx}"`);
    out = out.slice(0, v.index) + tag + out.slice(v.index + v[0].length);
  }
  return out;
}

/** Признак «выбранная вкладка» у листа: ровно один выбранный лист, иначе Excel откроет группу листов. */
export function setTabSelected(sheetXml: string, on: boolean): string {
  const v = /<sheetView\b[^>]*?\/?>/.exec(sheetXml);
  if (!v) {
    if (!on || /<sheetViews\b/.test(sheetXml)) return sheetXml;
    const at = /<(sheetFormatPr|cols|sheetData)\b/.exec(sheetXml); // порядок элементов листа: sheetViews — перед ними
    if (!at) return sheetXml;
    return sheetXml.slice(0, at.index) + '<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>' + sheetXml.slice(at.index);
  }
  let tag = v[0].replace(/\stabSelected="[^"]*"/, '');
  if (on) tag = tag.replace(/^<sheetView\b/, '<sheetView tabSelected="1"');
  return sheetXml.slice(0, v.index) + tag + sheetXml.slice(v.index + v[0].length);
}

/** Листы книги (имя → путь части) и путь workbook.xml. */
async function sheetParts(read: (name: string) => Promise<string | null>): Promise<{ wbPath: string; wb: string; sheets: { name: string; path: string | null }[] }> {
  const root = await read('_rels/.rels');
  const wbPath = (root && relTarget(root, (r) => /\/officeDocument"/.test(r)))?.replace(/^\//, '') ?? 'xl/workbook.xml';
  const wb = await read(wbPath);
  const rels = await read(relsPath(wbPath));
  if (!wb || !rels) throw new Error(BAD);
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const id = /\s[\w.-]+:id="([^"]*)"/.exec(m[0])?.[1];
    const target = id ? relTarget(rels, (r) => attr(r, 'Id') === id) : null;
    return { name: attr(m[0], 'name') ?? '', path: target ? resolve(wbPath, target) : null };
  });
  return { wbPath, wb, sheets };
}

/** Вписать числа в лист файла заказчика. Остальные части файла не меняются
 *  (кроме настроек вида: лист с ценами показывается и открывается первым). */
export async function patchXlsx(file: ArrayBuffer | Uint8Array, sheetName: string, writes: CellWrite[]): Promise<PatchResult> {
  const buf = file instanceof Uint8Array ? file : new Uint8Array(file);
  const z = readZip(buf);
  const byName = new Map(z.entries.map((e) => [e.name, e]));
  const read = async (name: string) => { const en = byName.get(name); return en ? dec.decode(await entryData(z, en)) : null; };
  const { wbPath, wb, sheets } = await sheetParts(read);
  const sheetPath = sheets.find((s) => s.name === sheetName)?.path ?? null;
  if (!sheetPath || !byName.has(sheetPath)) throw new Error(`В файле нет листа «${sheetName}» — выберите исходный файл заказчика.`);
  const sheet = await read(sheetPath);
  const res = patchSheetXml(sheet!, writes);
  const changed = new Map<string, Uint8Array>();
  if (res.written.length) {
    changed.set(sheetPath, enc.encode(setTabSelected(res.xml, true)));
    changed.set(wbPath, enc.encode(showAndActivate(setFullCalcOnLoad(wb), sheetName)));
    for (const s of sheets) {
      if (!s.path || s.path === sheetPath || !byName.has(s.path)) continue;
      const x = await read(s.path);
      if (x && /<sheetView\b[^>]*\stabSelected="1"/.test(x)) changed.set(s.path, enc.encode(setTabSelected(x, false)));
    }
  }
  const bytes = changed.size ? await writeZip(z, changed) : buf.slice();
  return { bytes, written: res.written, skippedFormula: res.skippedFormula };
}

/** Тот ли это файл, что был загружен как ВОР (сверка SHA-256). Другой файл — понятный отказ. */
export async function assertSameFile(file: ArrayBuffer | Uint8Array, expectedSha256: string): Promise<void> {
  const sha = await sha256Hex(file);
  if (sha !== expectedSha256.toLowerCase()) {
    throw new Error('Это другой файл: он не совпадает с загруженным ВОР. Выберите тот же файл заказчика, по которому загружен ВОР.');
  }
}

/** Части архива и их содержимое (для проверок «прочее без изменений»). */
export async function listParts(file: ArrayBuffer | Uint8Array): Promise<Map<string, Uint8Array>> {
  const buf = file instanceof Uint8Array ? file : new Uint8Array(file);
  const z = readZip(buf);
  const out = new Map<string, Uint8Array>();
  for (const en of z.entries) out.set(en.name, await entryData(z, en));
  return out;
}
