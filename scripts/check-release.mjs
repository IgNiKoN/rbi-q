#!/usr/bin/env node
/**
 * P2-0066: проверка выкладки — каждый файл описи версии на сайте совпадает со своим отпечатком (иначе у людей новая версия
 * не поставится: «файл другой версии»). Только чтение статических файлов сайта, без входа.
 *
 *   node scripts/check-release.mjs [https://app.rbi-q.ru/]
 */
import { createHash } from 'node:crypto';

const BASE = (process.argv[2] || 'https://app.rbi-q.ru/').replace(/\/?$/, '/');
const sw = await (await fetch(BASE + 'sw.js', { cache: 'no-store' })).text();
const i = sw.indexOf('const APP_RELEASE'), j = sw.indexOf('// </app-version>');
if (i < 0 || j < 0) { console.error('В sw.js на сайте нет описи версии'); process.exit(2); }
const R = new Function(sw.slice(i, j) + ';return APP_RELEASE;')();
const list = Object.entries(R.files);
const bad = [];
let bytes = 0;
for (let k = 0; k < list.length; k += 8) {
  await Promise.all(list.slice(k, k + 8).map(async ([p, [h]]) => {
    const r = await fetch(BASE + encodeURI(p), { cache: 'no-store' });
    const b = Buffer.from(await r.arrayBuffer()); bytes += b.length;
    if (!r.ok) bad.push(`${p} — ответ ${r.status}`);
    else if (createHash('sha256').update(b).digest('hex').slice(0, 16) !== h) bad.push(`${p} — другое содержимое`);
  }));
}
console.log(`${BASE} версия ${R.version}: файлов ${list.length}, ${(bytes / 1048576).toFixed(1)} МБ`);
if (bad.length) { console.error('Не совпало (версия у людей не поставится):\n' + bad.join('\n')); process.exit(1); }
console.log('Все файлы совпадают с описью — версия поставится целиком.');
