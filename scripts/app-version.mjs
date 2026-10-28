#!/usr/bin/env node
/**
 * P2-0066: опись версии приложения — список всех файлов (по `app-files.mjs`) с отпечатком и размером, сгруппированный
 * на оболочку и модули, и номер версии «дата сборки-отпечаток описи». Опись встраивается в `sw.js` между метками
 * `<app-version>` … `</app-version>`: любое изменение любого файла меняет `sw.js`, и браузер видит новую версию.
 *
 *   node scripts/app-version.mjs [--root <папка>] [--date ГГГГ-ММ-ДД] [--check]
 *
 * Без изменений файлов номер (и дата) не меняются. --check — ничего не писать, код 1, если опись в `sw.js` устарела.
 * Сторож — `js/shared/__tests__/app-version.test.js` (npm run test:unit).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listAppFiles } from './app-files.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BEGIN = '// <app-version>';
export const END = '// </app-version>';

/** Модули, чей код кэшируется только при допуске (P2-0013): префикс пути → модуль и чей допуск (p2 — вход платформы, rbi — оболочка Качества). */
export const MODULE_PREFIXES = [
  { prefix: 'js/dist/planfact/', module: 'planfact', kind: 'p2' },
  { prefix: 'js/dist/company/', module: 'company', kind: 'p2' },
  { prefix: 'js/dist/platform-admin/', module: 'platform-admin', kind: 'p2' },
  { prefix: 'js/modules/construction-v2/', module: 'construction-v2', kind: 'rbi' },
  { prefix: 'js/modules/construction/', module: 'construction', kind: 'rbi' },
  { prefix: 'js/modules/quality/', module: 'quality', kind: 'rbi' },
  { prefix: 'js/dist/construction-v2.js', module: 'construction-v2', kind: 'rbi' },
  { prefix: 'js/dist/rbi-construction-', module: 'construction', kind: 'rbi' }
];

/** Группа файла: '' — оболочка (всем), иначе модуль. Манифесты модулей (`*manifest.js`) — оболочка: по ним строится меню. */
export function groupOf(path) {
  if (/(^|\/)[^/]*manifest\.js$/.test(path)) return '';
  const m = MODULE_PREFIXES.find((x) => path.startsWith(x.prefix));
  return m ? m.module : '';
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/** Опись папки root: { digest, files: { путь: [отпечаток, размер, группа] } }. `sw.js` в опись не входит — опись живёт в нём. */
export function buildManifest(root) {
  const files = {};
  for (const p of listAppFiles(root)) {
    if (p === 'sw.js') continue;
    const buf = readFileSync(join(root, p));
    files[p] = [sha(buf).slice(0, 16), buf.length, groupOf(p)];
  }
  const digest = sha(Object.entries(files).map(([p, [h, , g]]) => `${p}:${h}:${g}`).join('\n')).slice(0, 8);
  return { digest, files };
}

/** Текст участка для `sw.js`. */
export function renderBlock(m, date) {
  const kinds = Object.fromEntries(MODULE_PREFIXES.map((x) => [x.module, x.kind]));
  const lines = Object.entries(m.files).map(([p, v]) => `    ${JSON.stringify(p)}: ${JSON.stringify(v)}`);
  return `${BEGIN} — сгенерировано scripts/app-version.mjs (npm run build:version), руками не править\n`
    + `const APP_RELEASE = {\n  version: '${date.replace(/-/g, '.')}-${m.digest}',\n  date: '${date}',\n  digest: '${m.digest}',\n`
    + `  modules: ${JSON.stringify(kinds)},\n  files: {\n${lines.join(',\n')}\n  }\n};\n${END}`;
}

/** Прежний участок в тексте `sw.js`: { digest, date } или null. */
export function readBlock(swText) {
  const i = swText.indexOf(BEGIN), j = swText.indexOf(END);
  if (i < 0 || j < 0) return null;
  const block = swText.slice(i, j);
  return { digest: /digest: '([^']+)'/.exec(block)?.[1] || '', date: /date: '([^']+)'/.exec(block)?.[1] || '', text: swText.slice(i, j + END.length) };
}

/** Новый текст `sw.js`: при том же отпечатке описи дата сохраняется (номер не меняется). */
export function updateSw(swText, m, date) {
  const prev = readBlock(swText);
  if (!prev) throw new Error(`В sw.js нет меток ${BEGIN} … ${END}`);
  const keep = prev.digest === m.digest && prev.date ? prev.date : date;
  return swText.replace(prev.text, renderBlock(m, keep));
}

function main() {
  const args = process.argv.slice(2);
  const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const root = resolve(val('--root') || ROOT);
  const date = val('--date') || new Date().toLocaleDateString('sv-SE');   // местная дата ГГГГ-ММ-ДД
  const swPath = join(root, 'sw.js');
  const before = readFileSync(swPath, 'utf8');
  const m = buildManifest(root);
  const after = updateSw(before, m, date);
  const version = /version: '([^']+)'/.exec(readBlock(after).text)[1];
  const size = Object.values(m.files).reduce((s, v) => s + v[1], 0);
  if (args.includes('--check')) {
    if (after !== before) { console.error(`Опись версии в sw.js устарела — запустите npm run build:version (будет ${version})`); process.exit(1); }
    console.log(`Опись актуальна: ${version}`);
    return;
  }
  if (after !== before) writeFileSync(swPath, after);
  console.log(`Версия ${version}: ${Object.keys(m.files).length} файлов, ${(size / 1048576).toFixed(1)} МБ${after === before ? ' (без изменений)' : ''}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
