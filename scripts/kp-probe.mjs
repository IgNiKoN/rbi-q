// Локальная проверка записи цен КП (P2-0006c, этап 1) на реальных файлах — файлы в репозиторий НЕ кладутся.
// Запуск: node scripts/kp-probe.mjs "<путь к .xlsx>" [--out "<путь для файла КП>"] [--value 111.11] [--sheet "<лист>"] [--cols F,G]
// По каждому листу-ВОР вписывает тестовое число во все колонки цен у строк работ/материалов (ячейки с формулой не трогаются),
// лист с ценами делается видимым и открывается первым; затем сверяет: части архива те же, все ячейки всех листов те же, кроме вписанных; объединения, ширины, скрытые строки — те же.
import { readFile, writeFile } from 'node:fs/promises';
import { readWorkbook } from '../src/modules/planfact/vor/xlsx-reader.ts';
import { parseSheet } from '../src/modules/planfact/vor/parse.ts';
import { patchXlsx, listParts, colLetters } from '../src/modules/planfact/vor/xlsx-writer.ts';

const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const file = args.find((a, i) => !a.startsWith('--') && !['--out', '--value', '--sheet', '--cols'].includes(args[i - 1]));
if (!file) { console.error('Укажите путь к .xlsx'); process.exit(2); }
const value = Number(opt('--value') ?? 111.11);
const onlySheet = opt('--sheet');
const onlyCols = opt('--cols') ? opt('--cols').split(',').map((x) => x.trim().toUpperCase()) : null;

let bytes = new Uint8Array(await readFile(file));
const before = await readWorkbook(bytes);
const expected = new Map(); // "лист!A1" → число
let total = 0, skipped = 0;
const writtenSheets = new Set();
for (const sh of before.sheets) {
  const r = parseSheet(sh);
  if (!r.isVor || !r.columns.prices.length || (onlySheet && sh.name !== onlySheet)) continue;
  const writes = [];
  for (const row of r.rows) {
    if (row.kind !== 'work' && row.kind !== 'material') continue;
    for (const p of r.columns.prices) if (!onlyCols || onlyCols.includes(colLetters(p.col))) writes.push({ rowNo: row.rowNo, col: p.col, value });
  }
  const res = await patchXlsx(bytes, sh.name, writes);
  bytes = res.bytes;
  for (const ref of res.written) expected.set(`${sh.name}!${ref}`, value);
  if (res.written.length) writtenSheets.add(sh.name);
  total += res.written.length; skipped += res.skippedFormula.length;
  console.log(`[${sh.name}] колонки цен: ${r.columns.prices.map((p) => `${colLetters(p.col)} «${p.label}»`).join(', ')}; вписано ${res.written.length}, формул заказчика не тронуто ${res.skippedFormula.length}`);
}
if (!total) console.log('Листов-ВОР с колонками цен нет — запись не требуется.');

const after = await readWorkbook(bytes);
const problems = [];
if (after.sheets.map((s) => s.name).join('|') !== before.sheets.map((s) => s.name).join('|')) problems.push('изменился состав листов');
let changedCells = 0;
for (let i = 0; i < before.sheets.length; i++) {
  const b = before.sheets[i].rows, a = after.sheets[i]?.rows ?? [];
  const shown = writtenSheets.has(before.sheets[i].name); // лист с ценами показывается (решение владельца 21.10.2026)
  if ((shown ? false : before.sheets[i].hidden) !== after.sheets[i]?.hidden) problems.push(`[${before.sheets[i].name}] изменилась видимость`);
  for (let r = 0; r < Math.max(b.length, a.length); r++) {
    for (let k = 0; k < Math.max(b[r]?.length ?? 0, a[r]?.length ?? 0); k++) {
      const key = `${before.sheets[i].name}!${colLetters(k)}${r + 1}`;
      const was = b[r]?.[k] ?? null, now = a[r]?.[k] ?? null;
      const want = expected.has(key) ? expected.get(key) : was;
      if (now !== want) problems.push(`${key}: ожидалось ${want}, стало ${now}`);
      else if (now !== was) changedCells++;
    }
  }
}
const pb = await listParts(new Uint8Array(await readFile(file))), pa = await listParts(bytes);
if ([...pa.keys()].join('|') !== [...pb.keys()].join('|')) problems.push('изменился состав частей файла');
const dec = new TextDecoder();
const changedParts = [];
for (const [k, v] of pb) {
  const w = pa.get(k);
  if (!w || Buffer.compare(Buffer.from(v), Buffer.from(w)) === 0) continue;
  changedParts.push(k);
  if (!k.includes('worksheets/')) continue;
  const sb = dec.decode(v), sa = dec.decode(w);
  for (const [label, re] of [['объединения', /<mergeCell\b[^>]*>/g], ['ширины', /<cols>[\s\S]*?<\/cols>/g], ['скрытые строки', /<row\b[^>]*hidden="1"[^>]*>/g], ['формулы', /<f\b[^>]*>[^<]*<\/f>|<f\b[^>]*\/>/g], ['усл. формат', /<conditionalFormatting\b[\s\S]*?<\/conditionalFormatting>/g], ['проверки данных', /<dataValidations\b[\s\S]*?<\/dataValidations>/g]]) {
    if (JSON.stringify(sa.match(re)) !== JSON.stringify(sb.match(re))) problems.push(`${k}: изменились ${label}`);
  }
}
console.log(`Итого: изменено ячеек ${changedCells} (вписано ${total}, совпали с прежним ${total - changedCells}), формул не тронуто ${skipped}; частей файла ${pb.size}, изменено ${changedParts.length}: ${changedParts.join(', ') || '—'}`);
console.log(problems.length ? `ПРОБЛЕМЫ (${problems.length}):\n  ${problems.slice(0, 20).join('\n  ')}` : 'Прочее без изменений.');
const out = opt('--out');
if (out) { await writeFile(out, bytes); console.log(`Файл КП: ${out}`); }
process.exit(problems.length ? 1 : 0);
