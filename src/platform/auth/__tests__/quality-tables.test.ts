/// <reference types="node" />
/** P2-0016 этап 6: всё, к чему код Качества/Стройконтроля обращается на сервере (таблицы, файлы), есть в хранилище компании
 *  (018 / 018d) — иначе при входе почтой запрос ушёл бы в несуществующую таблицу quality.* и не синхронизировался. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../../../', import.meta.url).pathname;
const M018 = readFileSync(join(ROOT, 'supabase/migrations/018_quality_up.sql'), 'utf8');
const M018D = readFileSync(join(ROOT, 'supabase/migrations/018d_quality_storage_up.sql'), 'utf8');
const QUALITY_TABLES = new Set([...M018.matchAll(/create table if not exists quality\.(\w+) \(/g)].map((m) => m[1]));
const QUALITY_BUCKETS = new Set([...(M018D.match(/unnest\(array\[([^\]]+)\]\) b/)![1].matchAll(/'([a-z-]+)'/g))].map((m) => m[1]));

function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === 'dist' || n === '__tests__' || n === 'node_modules') continue;
    if (statSync(p).isDirectory()) files(p, out); else if (/\.(js|ts)$/.test(n)) out.push(p);
  }
  return out;
}
const SRC = [...files(join(ROOT, 'js')), ...files(join(ROOT, 'src/services')), ...files(join(ROOT, 'src/modules/construction-v2'))]
  .map((f) => ({ f: f.slice(ROOT.length), s: readFileSync(f, 'utf8') }));

// Не таблицы Качества: примеры кода, План/Факт и ядро (свой клиент платформы, rpc), старые демо-таблицы.
const NOT_QUALITY = new Set(['countries', 'characters', 'documents', 'games', 'instruments', 'messages', 'mytable', 'orchestral_sections',
  'profiles', 'users', 'very_big_table', 'avatars', 'bucket', 'reports']);

test('каждая таблица из кода Качества есть в quality (55)', () => {
  assert.equal(QUALITY_TABLES.size, 55);
  const used = new Map<string, string>();
  for (const { f, s } of SRC) {
    for (const m of s.matchAll(/\.from\(\s*['"`]([a-z_0-9]+)['"`]\s*\)/g)) if (!s.slice(m.index! - 9, m.index).includes('storage')) used.set(m[1], f);
    for (const m of s.matchAll(/tableName\s*=\s*['"`]([a-z_0-9]+)['"`]/g)) used.set(m[1], f);
  }
  const missing = [...used].filter(([t]) => !QUALITY_TABLES.has(t) && !NOT_QUALITY.has(t));
  assert.deepEqual(missing, [], 'нет в quality: ' + missing.map(([t, f]) => `${t} (${f})`).join(', '));
  assert.ok(used.size >= 30, 'найдено обращений к таблицам: ' + used.size);
});

test('каждый бакет из кода Качества есть среди бакетов компаний (11)', () => {
  assert.equal(QUALITY_BUCKETS.size, 11);
  const used = new Set<string>();
  for (const { s } of SRC) {
    for (const m of s.matchAll(/storage\s*\.from\(\s*['"`]([a-z-]+)['"`]\s*\)/g)) used.add(m[1]);
    for (const m of s.matchAll(/(?:targetBucket|bucketName|bucket)\s*[:=]\s*['"`]([a-z][a-z-]+)['"`]/g)) used.add(m[1]);
  }
  const missing = [...used].filter((b) => !QUALITY_BUCKETS.has(b) && !NOT_QUALITY.has(b) && b !== 'twi-pdfs');
  assert.deepEqual(missing, []);
  assert.ok(used.has('inspection-photos') && used.has('reports'));
});
