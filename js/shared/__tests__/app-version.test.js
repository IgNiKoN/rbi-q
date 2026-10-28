/**
 * P2-0066: сторож описи версии. Опись в sw.js совпадает с файлами приложения (забыли `npm run build:version` — красный);
 * всё, что подключает index.html и что догружают бандлы js/dist, есть в описи; номер не меняется без изменений и меняется от одного байта.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, groupOf, readBlock, renderBlock, updateSw, BEGIN, END } from '../../../scripts/app-version.mjs';
import { listAppFiles } from '../../../scripts/app-files.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const manifest = buildManifest(ROOT);

describe('P2-0066: опись версии', () => {
  it('опись в sw.js актуальна (иначе: npm run build:version)', () => {
    assert.equal(updateSw(sw, manifest, '2000-01-01'), sw, 'опись в sw.js устарела — запустите npm run build:version');
  });

  it('номер версии и список файлов — только из описи (SW_VERSION руками нет)', () => {
    assert.match(sw, /const SW_VERSION = APP_RELEASE\.version;/);
    assert.doesNotMatch(sw, /const SW_VERSION = '/);
  });

  it('всё, что подключает index.html, есть в описи', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const refs = [...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"/g)].map((m) => m[1])
      .filter((u) => !/^(https?:|data:|#|\/\/)/.test(u)).map((u) => posix.normalize(u.split(/[?#]/)[0]).replace(/^\.?\//, ''));
    assert.ok(refs.length > 20, 'в index.html найдено подключений: ' + refs.length);
    const missing = refs.filter((p) => !manifest.files[p]);
    assert.deepEqual(missing, [], 'подключены, но нет в описи');
  });

  it('части, которые догружают бандлы js/dist, есть в описи и в той же группе', () => {
    const missing = [];
    let seen = 0;
    for (const p of Object.keys(manifest.files).filter((x) => x.startsWith('js/dist/') && x.endsWith('.js'))) {
      const text = readFileSync(join(ROOT, p), 'utf8');
      for (const m of text.matchAll(/(?:import\(\s*|from\s*)["'](\.\.?\/[^"']+\.js)["']/g)) {
        const target = posix.normalize(posix.join(posix.dirname(p), m[1]));
        seen++;
        if (!manifest.files[target]) missing.push(p + ' → ' + target);
        else assert.equal(groupOf(target), groupOf(p), `${target} в другой группе, чем ${p}`);
      }
    }
    assert.ok(seen > 0, 'догрузок не найдено — проверка не работает');
    assert.deepEqual(missing, []);
  });

  it('выпуск и опись — одно правило: опись = файлы выпуска без sw.js и скрытых', () => {
    assert.deepEqual(Object.keys(manifest.files), listAppFiles(ROOT).filter((p) => p !== 'sw.js' && !/(^|\/)\./.test(p)));
  });

  it('в описи нет скрытых файлов — боевой nginx их не отдаёт (.nojekyll → 404, версия не ставилась бы)', () => {
    assert.deepEqual(Object.keys(manifest.files).filter((p) => /(^|\/)\./.test(p)), []);
  });

  it('группы: модули по допуску, манифесты модулей и вход платформы — оболочка', () => {
    assert.equal(groupOf('js/dist/planfact/planfact.js'), 'planfact');
    assert.equal(groupOf('js/dist/company/chunks/x.js'), 'company');
    assert.equal(groupOf('js/modules/quality/quality.manifest.js'), '');
    assert.equal(groupOf('js/modules/quality/features/a.js'), 'quality');
    assert.equal(groupOf('js/modules/construction-v2/x.js'), 'construction-v2');
    assert.equal(groupOf('js/dist/platform/platform.js'), '');
  });

  it('без изменений номер тот же (и дата), от одного байта — другой', () => {
    const dir = mkdtempSync(join(tmpdir(), 'p2-0066-'));
    try {
      const put = (p, t) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), t); };
      put('index.html', '<html></html>'); put('js/a.js', 'a'); put('js/dist/planfact/planfact.js', 'p');
      put('sw.js', `${BEGIN}\n${END}\nconst SW_VERSION = APP_RELEASE.version;\n`);
      const v = (t) => /version: '([^']+)'/.exec(readBlock(t).text)[1];
      const s1 = updateSw(readFileSync(join(dir, 'sw.js'), 'utf8'), buildManifest(dir), '2026-10-29');
      const s2 = updateSw(s1, buildManifest(dir), '2026-11-05');
      assert.equal(s2, s1, 'без изменений файлов sw.js не меняется, даже в другой день');
      put('js/a.js', 'b');
      const s3 = updateSw(s2, buildManifest(dir), '2026-11-05');
      assert.notEqual(v(s3), v(s1));
      assert.match(v(s3), /^2026\.11\.05-[0-9a-f]{8}$/);
      assert.deepEqual(buildManifest(dir).files['js/dist/planfact/planfact.js'].slice(1), [1, 'planfact']);
      assert.ok(renderBlock(buildManifest(dir), '2026-11-05').includes('"planfact":"p2"'));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
