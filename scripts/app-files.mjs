/**
 * P2-0066: что входит в приложение — одно правило для выпуска (`release-rbi-q.mjs`) и описи версии (`app-version.mjs`).
 * Файлы корня и папки целиком, без `.map`, тестов и `.env*`. В git-папке — отслеживаемые и новые неигнорируемые файлы,
 * в папке без git (копия выпуска на стенде) — всё, что лежит в папках приложения.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const RELEASE_FILES = ['index.html', 'report.html', 'sw.js', 'manifest.webmanifest', 'favicon.ico', '.nojekyll',
  'Шаблон_акта_эталона_в_18.html'];
export const RELEASE_DIRS = ['css', 'data', 'fonts', 'icons', 'js', 'libs', 'locales'];

export function isReleaseFile(path) {
  if (/(^|\/)\.env/.test(path)) return false;
  if (/(^|\/)__tests__\//.test(path) || /\.map$/.test(path)) return false;
  if (RELEASE_FILES.includes(path)) return true;
  return RELEASE_DIRS.some((d) => path.startsWith(d + '/'));
}

function walk(root, dir, out) {
  for (const name of readdirSync(join(root, dir))) {
    if (name.startsWith('.')) continue;
    const rel = dir ? dir + '/' + name : name;
    if (statSync(join(root, rel)).isDirectory()) walk(root, rel, out); else out.push(rel);
  }
  return out;
}

/** Файлы приложения в папке root (пути относительные, отсортированы). */
export function listAppFiles(root) {
  let all;
  if (existsSync(join(root, '.git'))) {
    const git = (a) => execFileSync('git', ['-c', 'core.quotepath=off', ...a], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
    all = [...new Set([...git(['ls-files']), ...git(['ls-files', '--others', '--exclude-standard'])])];
  } else {
    all = [...RELEASE_FILES.filter((f) => existsSync(join(root, f))), ...RELEASE_DIRS.filter((d) => existsSync(join(root, d))).flatMap((d) => walk(root, d, []))];
  }
  return all.filter((p) => isReleaseFile(p) && existsSync(join(root, p)) && statSync(join(root, p)).isFile()).sort();
}
