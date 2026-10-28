// Синтетические файлы для стенда P2-0056 (в git не кладутся): квартирография «как у заказчика» и файл с ошибками. node make-files.mjs <out-dir>
import ExcelJS from 'exceljs';
const out = process.argv[2];
async function save(name, rows, merges = []) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Квартирография');
  rows.forEach((r) => ws.addRow(r)); merges.forEach((m) => ws.mergeCells(m));
  await wb.xlsx.writeFile(`${out}/${name}`);
}
// 1) Дом 1: этажи 1–7 по 4 кв. (1–5 уже есть на стенде; у кв. 3 в файле площадь — «иначе»), Дом 3 — новый: 2 подъезда × 3 этажа × 2 кв.
const rows = [['ЖК «Репин», квартирография на 28.10.2026'], [],
  ['№ п/п', 'Дом', 'Подъезд', 'Этаж', '№ кв.', 'Площадь общая, м2', 'Площадь жилая', 'Кол-во комнат', 'Цена, руб.']];
let k = 0, no = 0;
for (let f = 1; f <= 7; f++) for (let a = 1; a <= 4; a++) { no++; rows.push([++k, f === 1 && a === 1 ? 1 : null, f === 1 && a === 1 ? 1 : null, a === 1 ? f : null, no,
  f >= 6 || no === 3 ? [38.4, 61.2, 44.9, 72.15][a - 1] : null, null, f >= 6 ? ['1к', '2к', 'студия', '3-комн.'][a - 1] : null, 9000000]); }
rows.push(['Итого по дому 1', null, null, null, null, 532.6]);
for (let s = 1; s <= 2; s++) for (let f = 1; f <= 3; f++) for (let a = 1; a <= 2; a++) rows.push([++k, 3, s, f, `${s}${f}${a}`, 50 + a, null, a]);
await save('kvartirografiya.xlsx', rows);
// 2) ошибки: квартира без этажа (новая секция сбрасывает этаж), площадь словами, 25 комнат, повтор
await save('s-oshibkami.xlsx', [['Корпус', 'Секция', 'Этаж', 'Квартира', 'Площадь', 'Комнат'],
  ['Корпус 1', 1, 6, 101, 40, 1], [null, null, null, 103, 'много', 1], [null, null, null, 104, 40, 25], [null, null, null, 101, 41, 1],
  ['Корпус 1', 2, null, 102, 40, 1]]);
console.log('ok');
