// P2-0069: опись всех таблиц сервера. Поднимает PGlite со всеми миграциями (tests/server/pglite-db.mjs), читает pg_catalog
// и пишет ai-dev/reference/schema-inventory.json (машинный) и ai-dev/reports/P2-0069/inventory.html (для владельца).
// Боевой сервер не используется. Запуск: P2_PGLITE=<папка с @electric-sql/pglite> node scripts/schema-inventory.mjs
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverDb } from '../tests/server/pglite-db.mjs';
import { readSchema, migrationsHash, moduleOf, SCOPE, OUT_OF_SCOPE } from '../tests/server/schema-lint.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const INV = join(ROOT, 'ai-dev/reference/schema-inventory.json');
const HTML = join(ROOT, 'ai-dev/reports/P2-0069/inventory.html');

const db = await serverDb();
const tables = await readSchema(db);
await db.close();

const counts = {};
for (const t of tables) counts[t.schema] = (counts[t.schema] || 0) + 1;
const inventory = {
  about: 'P2-0069: схема сервера после всех миграций (PGlite). Пересоздаётся: node scripts/schema-inventory.mjs. Не править руками.',
  migrationsHash: migrationsHash(ROOT),
  counts,
  tables: tables.map((t) => ({ id: `${t.schema}.${t.name}`, module: SCOPE.includes(t.schema) ? moduleOf(t.schema, t.name) : null, rls: t.rls, pk: t.pk, fk: t.fk, cols: t.cols }))
};
// одна таблица — одна строка: изменение схемы видно в diff построчно
const { tables: list, ...head } = inventory;
writeFileSync(INV, `${JSON.stringify(head, null, 1).slice(0, -2)},\n "tables": [\n${list.map((t) => `  ${JSON.stringify(t)}`).join(',\n')}\n ]\n}\n`);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const byModule = new Map();
for (const t of inventory.tables.filter((x) => x.module)) (byModule.get(t.module) || byModule.set(t.module, []).get(t.module)).push(t);
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Опись таблиц сервера</title></head><body>
<h1>Опись таблиц сервера (черновик, этап 1)</h1>
<p>Разделы: ${Object.entries(counts).map(([s, n]) => `${esc(s)} — ${n}`).join(' · ')}</p>
${[...byModule].map(([m, ts]) => `<h2>${esc(m)} — ${ts.length}</h2><ul>${ts.map((t) => `<li><b>${esc(t.id)}</b>: ${t.cols.map(([n, ty]) => `${esc(n)} ${esc(ty)}`).join(', ')}</li>`).join('')}</ul>`).join('\n')}
<h2>Вне стандарта</h2><ul>${Object.entries(OUT_OF_SCOPE).map(([s, why]) => `<li>${esc(s)} — ${counts[s] || 0}: ${esc(why)}</li>`).join('')}</ul>
</body></html>`;
writeFileSync(HTML, html);
console.log(`опись: ${tables.length} таблиц (${Object.entries(counts).map(([s, n]) => `${s} ${n}`).join(', ')}), хеш миграций ${inventory.migrationsHash}`);
