// Локальная проверка разбора ВОР (P2-0006) на реальных файлах — файлы в репозиторий НЕ кладутся.
// Запуск: node scripts/vor-probe.mjs "<путь к .xlsx>" [--rows "Имя листа"] [--sample 20]
// Печатает по каждому листу: ВОР или нет (причина), строки шапки, карту колонок, счётчики типов строк, долю работ с ЕИ, сверку итогов.
import { readFile } from 'node:fs/promises';
import { readWorkbook } from '../src/modules/planfact/vor/xlsx-reader.ts';
import { parseSheet, contextLabel } from '../src/modules/planfact/vor/parse.ts';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--rows' && args[args.indexOf(a) - 1] !== '--sample');
const rowsSheet = args.includes('--rows') ? args[args.indexOf('--rows') + 1] : null;
const sample = args.includes('--sample') ? Number(args[args.indexOf('--sample') + 1]) : 20;
if (!file) { console.error('Укажите путь к .xlsx'); process.exit(2); }

const wb = await readWorkbook(await readFile(file));
for (const sh of wb.sheets) {
  const r = parseSheet(sh);
  const s = r.stats;
  if (!r.isVor) { console.log(`[${sh.name}] НЕ ВОР: ${r.reason}`); continue; }
  const c = r.columns;
  const pct = s.works ? Math.round((s.worksWithUnit / s.works) * 1000) / 10 : 0;
  console.log(`[${sh.name}] ВОР: шапка строки ${r.headerRows.join(',')}; колонки №=${c.number} имя=${c.name} ЕИ=${c.unit} объём=${c.qty} норма=${c.norm} тип=${c.type} цен=${c.prices.length}`);
  console.log(`   строк ${s.total}: работ ${s.works} (с ЕИ ${s.worksWithUnit} = ${pct}%, с объёмом ${s.worksWithQty}), материалов ${s.materials}, групп ${s.groups}, мест ${s.context}`);
  const bad = r.checks.filter((k) => !k.ok);
  console.log(`   сверка итогов: ${r.checks.length} проверено, расхождений ${bad.length}${bad.length ? ' → ' + bad.slice(0, 3).map((k) => `стр.${k.rowNo} «${k.label}» ${k.expected} ≠ ${k.actual}`).join('; ') : ''}`);
  const noUnit = r.rows.filter((x) => x.kind === 'work' && !x.unitText).slice(0, 3);
  if (noUnit.length) console.log(`   работы без ЕИ: ${noUnit.map((x) => 'стр.' + x.rowNo).join(', ')}`);
  const noQty = r.rows.filter((x) => x.kind === "work" && x.qty === null).slice(0, 5);
  if (noQty.length) console.log(`   работы без объёма: ${noQty.map((x) => "стр." + x.rowNo).join(", ")}`);
  if (rowsSheet === sh.name) {
    const works = r.rows.filter((x) => x.kind === 'work');
    const step = Math.max(1, Math.floor(works.length / sample));
    for (let i = 0; i < works.length; i += step) {
      const x = works[i];
      console.log(`   стр.${x.rowNo} ${x.kind} | ${contextLabel(x.context) || '—'} | ${x.name.slice(0, 50)} | ${x.unitText} | ${x.qty}`);
    }
  }
}
