import { readFile } from 'node:fs/promises';
import { readWorkbook } from './src/modules/planfact/vor/xlsx-reader.ts';
import { parseSheet } from './src/modules/planfact/vor/parse.ts';
import { guessPriceColumns } from './src/modules/planfact/estimate/prices.ts';
import { calcRows } from './src/modules/planfact/estimate/calc.ts';
const wb = await readWorkbook(await readFile(process.argv[2]));
const name = process.argv[3];
const r = parseSheet(wb.sheets.find((s) => s.name === name));
const labels = r.columns.prices.map((p) => p.label);
const cols = guessPriceColumns(labels);
const totM = labels.find((l) => /всего/i.test(l) && /Материал/.test(l)), totW = labels.find((l) => /всего/i.test(l) && /Работа/.test(l));
const rows = r.rows.filter((x) => x.kind !== 'skip').map((x) => ({ source_row_id: String(x.rowNo), import_id: 'a', row_no: x.rowNo, kind: x.kind, qty: x.qty, norm: x.norm,
  parent_row_no: x.parentRowNo, price_labor: x.kind === 'work' ? x.prices[cols.labor] ?? null : null, price_material: x.prices[cols.material] ?? null, _x: x }));
const c = calcRows(rows);
let n = 0, sumK = 0;
for (const x of r.rows) {
  const k = x.prices[totM] ?? 0; if (x.kind === 'work' || x.kind === 'material') sumK += k;
  const m = c.get(String(x.rowNo))?.material ?? 0;
  if (Math.abs(k - m) > 0.005) { n++; if (n <= 12) console.log(`стр.${x.rowNo} ${x.kind} K=${k} наш=${m.toFixed(2)} qty=${x.qty} норма=${x.norm} цена=${x.prices[cols.material]} «${x.name.slice(0, 50)}»`); }
}
const skipped = r.rows.filter((x) => x.kind === 'skip' || x.kind === 'group' || x.kind === 'context').filter((x) => (x.prices[totM] ?? 0) !== 0);
console.log('расхождений', n, 'ΣK по работам/материалам', sumK.toFixed(2), '; строки не-работы/материалы с K:', skipped.map((x) => `стр.${x.rowNo} ${x.kind} ${x.prices[totM]} «${x.name.slice(0,30)}»`).slice(0, 8).join(' | '));
