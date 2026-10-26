#!/usr/bin/env node
/**
 * P2-0032: выпуск Платформы 2.0 для адреса РБИ (репозиторий IgNiKoN/rbi-q → GitHub Pages /rbi-q/ и app.rbi-q.ru через git pull).
 * Копирует в папку-клон rbi-q только файлы приложения из текущего коммита (git ls-files): без документов, исходников,
 * тестов, скриптов и .env*. Всё прежнее в папке, кроме .git, удаляется. Повторяемый: один и тот же коммит → те же файлы.
 *
 *   node scripts/release-rbi-q.mjs <папка-клон-rbi-q> [--dry]
 *
 * Коммит и push в rbi-q — вручную и только по разрешению владельца (карточка P2-0032).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Что входит в приложение: файлы корня и папки целиком (без тестов). */
export const RELEASE_FILES = ['index.html', 'report.html', 'sw.js', 'manifest.webmanifest', 'favicon.ico', '.nojekyll',
  'Шаблон_акта_эталона_в_18.html'];
export const RELEASE_DIRS = ['css', 'data', 'fonts', 'icons', 'js', 'libs', 'locales'];

export function isReleaseFile(path) {
  if (/(^|\/)\.env/.test(path)) return false;
  if (/(^|\/)__tests__\//.test(path) || /\.map$/.test(path)) return false;
  if (RELEASE_FILES.includes(path)) return true;
  return RELEASE_DIRS.some((d) => path.startsWith(d + '/'));
}

function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const target = args.find((a) => !a.startsWith('--'));
  if (!target) { console.error('Укажите папку-клон rbi-q: node scripts/release-rbi-q.mjs <папка> [--dry]'); process.exit(2); }
  const out = resolve(target);
  if (out === ROOT || out.startsWith(ROOT + '/')) { console.error('Папка выпуска не может быть внутри platform-2-core'); process.exit(2); }
  if (git(['status', '--porcelain', '--untracked-files=no'])) { console.error('Есть незакоммиченные изменения — выпуск только из коммита'); process.exit(2); }

  const files = git(['-c', 'core.quotepath=off', 'ls-files']).split('\n').filter(isReleaseFile);
  const commit = git(['rev-parse', 'HEAD']);
  const sw = /SW_VERSION = '([^']+)'/.exec(git(['show', 'HEAD:sw.js']))?.[1] || '';
  console.log(`Выпуск: ${files.length} файлов, коммит ${commit.slice(0, 7)}, SW ${sw} → ${out}${dry ? ' (пробно)' : ''}`);
  if (dry) return;

  if (!existsSync(join(out, '.git'))) { console.error('В папке нет .git — нужен клон репозитория rbi-q'); process.exit(2); }
  for (const name of readdirSync(out)) if (name !== '.git') rmSync(join(out, name), { recursive: true, force: true });
  for (const f of files) {
    mkdirSync(dirname(join(out, f)), { recursive: true });
    cpSync(join(ROOT, f), join(out, f));
  }
  writeFileSync(join(out, 'RELEASE.json'), JSON.stringify({ source: 'IgNiKoN/platform-2-core', commit, sw_version: sw, files: files.length }, null, 2) + '\n');
  writeFileSync(join(out, 'README.md'), '# RBI Platform — Платформа 2.0 (выпуск)\n\nСобрано скриптом `scripts/release-rbi-q.mjs` из `IgNiKoN/platform-2-core` (коммит — в `RELEASE.json`). '
    + 'Не редактировать вручную. Прежнее приложение — репозиторий `IgNiKoN/rbi-q-old`.\n');
  console.log('Готово. Дальше: git -C <папка> add -A && git commit — push только по разрешению владельца.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
