// Проверка КС-2 по унифицированной форме (P2-0008b, этап 1) на синтетическом акте (вымышленные данные).
// Запуск: node scripts/ks2-probe.mjs [--out "<путь .xlsx>"] [--rows 40]
// Пишет файл, читает его обратно и сверяет: строки, суммы до копеек, итог = сумме строк.
import { writeFile } from 'node:fs/promises';
import { readWorkbook } from '../src/modules/planfact/vor/xlsx-reader.ts';
import { writeUnifiedKs2, actTotal, actRows, rowCost, emptyKs2Header } from '../src/modules/planfact/ks2/form.ts';

const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const n = Number(opt('--rows') ?? 12);
const names = ['Штукатурка стен «Альфа» по маякам', 'Устройство стяжки пола толщиной 50 мм из смеси «Бета» с армированием сеткой', 'Окраска стен в два слоя', 'Монтаж ГКЛ перегородок «Гамма» в один слой на металлическом каркасе с заполнением минераловатной плитой'];
const rows = [];
for (let i = 0; i < n; i++) {
  const work = i % 3 !== 2;
  const qty = Math.round((10 + i * 7.37) * 1000) / 1000, price = Math.round((150 + i * 33.333) * 100) / 100;
  rows.push({ source_row_id: `r${i}`, row_no: i + 5, number: work ? `${Math.floor(i / 3) + 1}.${i % 3 + 1}` : `${Math.floor(i / 3) + 1}.2.1`,
    name: work ? names[i % names.length] : `Материал «Дельта-${i}»`, unit: work ? 'м2' : 'кг', kind: work ? 'work' : 'material',
    sys_qty: qty, sys_price: price, qty, price, excluded: false, total_qty: qty * 2, prev_qty: qty });
}
const snap = { header: { ...emptyKs2Header(), investor: 'ООО «Инвест-Альфа»', customer: 'АО «Заказчик-Бета»', contractor: 'ООО «Подряд-Гамма»',
  construction: 'ЖК «Вымышленный», г. Энск', object: 'Корпус 1, отделочные работы', contract_no: 'Д-17/26', contract_date: '2026-03-01',
  act_no: '3', act_date: '2026-10-31', period_from: '2026-10-01', period_to: '2026-10-31',
  contractor_signer: 'Начальник участка Иванов И. И.', customer_signer: 'Инженер ТН Петров П. П.' }, rows };

const bytes = await writeUnifiedKs2(snap);
const g = (await readWorkbook(bytes)).sheets[0].rows;
const problems = [];
const data = g.filter((r) => typeof r[0] === 'number' && typeof r[7] === 'number' && typeof r[2] === 'string' && r[2] !== 'Наименование работ');
if (data.length !== actRows(snap).length) problems.push(`строк в файле ${data.length}, в акте ${actRows(snap).length}`);
data.forEach((r, i) => { if (r[7] !== rowCost(actRows(snap)[i])) problems.push(`строка ${i + 1}: ${r[7]} ≠ ${rowCost(actRows(snap)[i])}`); });
const itog = g.find((r) => r[0] === 'Итого')?.[7];
const sum = data.reduce((a, r) => a + Math.round(r[7] * 100), 0) / 100;
if (itog !== sum || itog !== actTotal(snap)) problems.push(`итог ${itog}, сумма строк ${sum}, расчёт ${actTotal(snap)}`);
console.log(`Строк ${data.length}, итог ${itog} руб., сумма строк ${sum}`);
const out = opt('--out');
if (out) { await writeFile(out, bytes); console.log(`Файл: ${out}`); }
console.log(problems.length ? `ПРОБЛЕМЫ:\n  ${problems.join('\n  ')}` : 'Без расхождений.');
process.exit(problems.length ? 1 : 0);
