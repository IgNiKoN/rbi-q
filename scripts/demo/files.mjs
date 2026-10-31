// P2-0053. Образцы файлов «попробуйте сами» для своей компании клиента (docs/demo-files/): Excel со списком квартир (форма
// «Компания → Объекты и места → Загрузить из Excel») и ВОР своей формы (заголовки «Корпус / Секция / этаж» строками).
// Всё выдуманное. После записи файлы читаются теми же разборщиками, что в приложении (xlsx-reader, places-import, vor/parse) —
// число строк печатается. node scripts/demo/files.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
const DIR = fileURLToPath(new URL('../../docs/demo-files/', import.meta.url));

export async function writeSamples() {
  // 1. Список квартир: Корпус 1, 2 секции × 5 этажей × 4 квартиры
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Квартиры');
  ws.addRow(['Корпус', 'Секция', 'Этаж', 'Помещение', 'Стр. №', '№ БТИ', 'Площадь, м²', 'Комнат']);
  const AREAS = [[38.4, 1], [61.2, 2], [74.9, 3], [27.1, 'студия']];
  let no = 1;
  for (let s = 1; s <= 2; s++) for (let f = 1; f <= 5; f++) for (let a = 0; a < 4; a++, no++) ws.addRow(['Корпус 1', s, f, no, no, null, AREAS[a][0], AREAS[a][1]]);
  ws.columns.forEach((c) => { c.width = 14; });
  await wb.xlsx.writeFile(DIR + 'Образец — список квартир.xlsx');

  // 2. ВОР своей формы: шапка, затем «Корпус 1» → «Секция 1» → «Этаж 1» строками-заголовками и работы под ними
  const vb = new ExcelJS.Workbook();
  const vs = vb.addWorksheet('ВОР');
  vs.addRow(['Ведомость объёмов работ (образец, выдуманные объёмы)']);
  vs.addRow([]);
  vs.addRow(['№ п/п', 'Наименование работ', 'Ед. изм.', 'Кол-во', 'Примечание']);
  const WORKS = [['Армирование и бетонирование перекрытий', 'м3', 42], ['Монолитные стены и колонны', 'м3', 28], ['Кладка наружных стен из газобетона', 'м3', 18],
    ['Штукатурка стен', 'м2', 640], ['Стяжка пола', 'м2', 310], ['Окна ПВХ', 'шт', 16]];
  let n = 1;
  vs.addRow(['', 'Корпус 1']);
  for (let s = 1; s <= 2; s++) {
    vs.addRow(['', `Секция ${s}`]);
    for (let f = 1; f <= 5; f++) {
      vs.addRow(['', `Этаж ${f}`]);
      for (const [w, u, q] of WORKS) vs.addRow([n++, w, u, q, '']);
    }
  }
  vs.getColumn(2).width = 46;
  await vb.xlsx.writeFile(DIR + 'Образец — ВОР своей формы.xlsx');
}

export async function verifySamples() {
  const { readWorkbook } = await import('../../src/platform/services/excel/xlsx-reader.ts');
  const { findPlaceHeader, sheetRows } = await import('../../src/platform/company/places-import.ts');
  const { parseSheet } = await import('../../src/modules/planfact/vor/parse.ts');
  const places = await readWorkbook(readFileSync(DIR + 'Образец — список квартир.xlsx'));
  const ph = findPlaceHeader(places.sheets[0].rows);
  const prow = ph ? sheetRows(places.sheets[0], ph, null) : [];
  const vor = await readWorkbook(readFileSync(DIR + 'Образец — ВОР своей формы.xlsx'));
  const pr = parseSheet(vor.sheets[0]);
  const withPlace = pr.rows.filter((r) => r.kind === 'work' && r.context && r.context.floor).length;
  return { apartments: prow.length, vorIsVor: pr.isVor, vorWorks: pr.stats.works, vorWithFloor: withPlace, reason: pr.reason };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeSamples();
  console.log('образцы записаны; разбор приложением:', JSON.stringify(await verifySamples()));
}
