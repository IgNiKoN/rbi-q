// P2-0069: опись всех таблиц сервера и светофор по стандарту ai-dev/standards/DATA_TABLES.md.
// Поднимает PGlite со всеми миграциями (tests/server/pglite-db.mjs), читает pg_catalog и пишет
// ai-dev/reference/schema-inventory.json (машинный) и ai-dev/reports/P2-0069/inventory.html (для владельца).
// Боевой сервер не используется. Запуск: P2_PGLITE=<папка с @electric-sql/pglite> node scripts/schema-inventory.mjs
//   --check        сторож по свежей схеме: ничего не пишет, код выхода 1 при нарушении (npm run test:schema)
//   --update-debt  записать потолок старых нарушений (только если нарушений не стало больше)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverDb } from '../tests/server/pglite-db.mjs';
import { readSchema, migrationsHash, moduleOf, evaluate, debtOf, compareDebt, SCOPE, OUT_OF_SCOPE, RULES, RULE_CODES, CLASSES } from '../tests/server/schema-lint.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const INV = join(ROOT, 'ai-dev/reference/schema-inventory.json');
const DEBT = join(ROOT, 'ai-dev/reference/schema-debt.json');
const DIR = join(ROOT, 'ai-dev/reports/P2-0069');
const HTML = join(DIR, 'inventory.html');
const args = new Set(process.argv.slice(2));

const db = await serverDb();
const tables = await readSchema(db);
await db.close();
const evaluation = evaluate(tables);
const ceiling = existsSync(DEBT) ? JSON.parse(readFileSync(DEBT, 'utf8')) : null;

if (args.has('--check')) {
  if (!ceiling) { console.error('нет потолка ai-dev/reference/schema-debt.json'); process.exit(1); }
  const { fresh, grew, lower } = compareDebt(evaluation, ceiling);
  for (const m of [...fresh, ...grew]) console.error(`✕ ${m}`);
  for (const m of lower) console.error(`↓ ${m}`);
  console.log(`сторож таблиц: ${evaluation.length} таблиц, новые с нарушением ${fresh.length}, рост ${grew.length}, снизить потолок ${lower.length}`);
  process.exit(fresh.length + grew.length + lower.length ? 1 : 0);
}

if (args.has('--update-debt')) {
  if (ceiling) {
    const { fresh, grew } = compareDebt(evaluation, ceiling);
    if (fresh.length || grew.length) { for (const m of [...fresh, ...grew]) console.error(`✕ ${m}`); console.error('потолок не меняю: нарушений стало больше'); process.exit(1); }
  }
  const debt = debtOf(evaluation);
  writeFileSync(DEBT, `{\n "about": "P2-0069: потолок старых нарушений стандарта таблиц (только убывает). Пишет node scripts/schema-inventory.mjs --update-debt.",\n "tables": {\n${
    Object.entries(debt).map(([id, d]) => `  ${JSON.stringify(id)}: ${JSON.stringify(d)}`).join(',\n')}\n }\n}\n`);
  console.log(`потолок записан: ${Object.values(debt).reduce((s, d) => s + Object.values(d).reduce((a, b) => a + b, 0), 0)} нарушений`);
}

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

// ——— HTML для владельца ———
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const part = (f) => (existsSync(join(DIR, f)) ? readFileSync(join(DIR, f), 'utf8') : '');
const GLYPH = { green: '✓', yellow: '!', red: '✕', na: '—' };
const LABEL = { green: 'зелёный', yellow: 'жёлтый', red: 'красный', na: 'не относится' };
const tally = (rows) => { const c = { green: 0, yellow: 0, red: 0, na: 0 }; for (const e of rows) for (const k of RULE_CODES) c[e.rules[k].s]++; return c; };
const clean = (e) => RULE_CODES.every((k) => e.rules[k].s !== 'red');
const modules = [];
for (const e of evaluation) { let m = modules.find((x) => x.name === e.module); if (!m) modules.push(m = { name: e.module, rows: [] }); m.rows.push(e); }
const all = tally(evaluation);
const cell = (r) => `<td class="c ${r.s}" title="${esc(`${LABEL[r.s]}${r.note ? `: ${r.note}` : ''}`)}">${GLYPH[r.s]}</td>`;
const notes = (e) => RULE_CODES.filter((k) => ['red', 'yellow'].includes(e.rules[k].s))
  .map((k) => `<li class="${e.rules[k].s}"><b>${esc(RULES.find((r) => r.code === k).title)}</b> — ${esc(e.rules[k].note)}</li>`).join('');

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Опись таблиц сервера</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--text:#1d2330;--muted:#5d6675;--line:#e2e5ea;--accent:#2f6fde;
--ok:#1f8a4c;--ok-bg:#e3f5ea;--warn:#a86a00;--warn-bg:#fff2d6;--bad:#c62f2f;--bad-bg:#fde5e5;--na:#8a919c;--na-bg:#f0f1f3}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14171c;--card:#1d2128;--text:#e6e9ee;--muted:#9aa3b0;--line:#2e343d;--accent:#6c9cf0;
--ok:#5fd08f;--ok-bg:#183626;--warn:#f0b54a;--warn-bg:#3a2d12;--bad:#ff7b7b;--bad-bg:#3d1b1b;--na:#7d8591;--na-bg:#262a31}}
:root[data-theme="dark"]{--bg:#14171c;--card:#1d2128;--text:#e6e9ee;--muted:#9aa3b0;--line:#2e343d;--accent:#6c9cf0;
--ok:#5fd08f;--ok-bg:#183626;--warn:#f0b54a;--warn-bg:#3a2d12;--bad:#ff7b7b;--bad-bg:#3d1b1b;--na:#7d8591;--na-bg:#262a31}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:1200px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:8px 0 4px}h2{font-size:18px;margin:28px 0 8px}h3{font-size:16px;margin:20px 0 6px}
p,li{max-width:80ch}.muted{color:var(--muted)}a{color:var(--accent)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:10px 0}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.tile b{display:block;font-size:24px}.tile.green b{color:var(--ok)}.tile.yellow b{color:var(--warn)}.tile.red b{color:var(--bad)}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line);border-radius:12px;background:var(--card)}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-weight:600;color:var(--muted);white-space:nowrap}
.m th.r{writing-mode:vertical-rl;transform:rotate(180deg);font-size:12px;padding:6px 4px;height:110px}
.m td.t{position:sticky;left:0;background:var(--card);white-space:nowrap;font-family:ui-monospace,Menlo,monospace;font-size:13px}
td.c{text-align:center;font-weight:700;min-width:32px}
td.green{color:var(--ok);background:var(--ok-bg)}td.yellow{color:var(--warn);background:var(--warn-bg)}td.red{color:var(--bad);background:var(--bad-bg)}td.na{color:var(--na);background:var(--na-bg)}
td.num{text-align:right;white-space:nowrap}
details{border-bottom:1px solid var(--line);padding:6px 0}summary{cursor:pointer;font-family:ui-monospace,Menlo,monospace;font-size:13px;min-height:32px;display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;overflow-wrap:anywhere}
details ul{margin:6px 0 6px 0;padding-left:20px}li.red::marker{color:var(--bad)}li.yellow::marker{color:var(--warn)}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%}.dot.red{background:var(--bad)}.dot.green{background:var(--ok)}
code{font-family:ui-monospace,Menlo,monospace;font-size:13px;overflow-wrap:anywhere}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;background:var(--na-bg);padding:10px;border-radius:8px}
.legend span{display:inline-block;margin-right:12px}
@media (max-width:600px){.m td.t{white-space:normal;overflow-wrap:anywhere;max-width:140px;font-size:12px}}
</style></head><body><main>
<h1>Опись таблиц сервера и светофор стандарта</h1>
<p class="muted">P2-0069 · источник — локальная копия сервера (PGlite) со всеми миграциями, отпечаток миграций <code>${inventory.migrationsHash}</code> · стандарт — <code>ai-dev/standards/DATA_TABLES.md</code></p>

<div class="card"><b>Коротко.</b> На сервере ${tables.length} таблиц. Под стандарт попадают ${evaluation.length} (ядро, План/Факт, Качество и Стройконтроль), остальные ${tables.length - evaluation.length} — служебные Supabase и старое приложение RBI (внизу).
Без единого красного — <b>${evaluation.filter(clean).length}</b> из ${evaluation.length}. Красное — это то, что переезжает по плану по шагам; новые таблицы с красным сторож не пропускает.</div>

<h2>Итог по клеткам</h2>
<div class="tiles">
<div class="tile green"><b>${all.green}</b>зелёных — правило соблюдено</div>
<div class="tile yellow"><b>${all.yellow}</b>жёлтых — исключение с причиной или мост</div>
<div class="tile red"><b>${all.red}</b>красных — нарушение</div>
<div class="tile"><b>${all.na}</b>«—» — не относится</div>
</div>

<h2>Итог по модулям</h2>
<div class="scroll"><table><thead><tr><th>Модуль</th><th>Таблиц</th><th>Без красного</th><th>Красных клеток</th><th>Жёлтых</th></tr></thead><tbody>
${modules.map((m) => { const c = tally(m.rows); return `<tr><td>${esc(m.name)}</td><td class="num">${m.rows.length}</td><td class="num">${m.rows.filter(clean).length}</td><td class="num">${c.red}</td><td class="num">${c.yellow}</td></tr>`; }).join('\n')}
</tbody></table></div>

<h2>Итог по правилам</h2>
<div class="scroll"><table><thead><tr><th>Правило</th><th>Почему</th><th>✓</th><th>!</th><th>✕</th><th>—</th></tr></thead><tbody>
${RULES.map((r) => { const c = { green: 0, yellow: 0, red: 0, na: 0 }; for (const e of evaluation) c[e.rules[r.code].s]++; return `<tr><td><b>${esc(r.title)}</b></td><td>${esc(r.why)}</td><td class="c green">${c.green}</td><td class="c yellow">${c.yellow}</td><td class="c red">${c.red}</td><td class="c na">${c.na}</td></tr>`; }).join('\n')}
</tbody></table></div>

<h2>Светофор по модулям</h2>
<p class="legend muted"><span>✓ зелёный — соблюдено</span><span>! жёлтый — исключение или мост</span><span>✕ красный — нарушение</span><span>— не относится</span></p>
<p class="muted">Таблица прокручивается вбок внутри рамки. Что именно не так — под таблицей, по нажатию на имя.</p>
${modules.map((m) => `<h3>${esc(m.name)} — ${m.rows.length} <span class="muted">(раздел ${esc([...new Set(m.rows.map((e) => e.schema))].join(', '))})</span></h3>
<div class="scroll"><table class="m"><thead><tr><th>Таблица</th>${RULES.map((r) => `<th class="r" title="${esc(r.title)}">${esc(r.short)}</th>`).join('')}</tr></thead><tbody>
${m.rows.map((e) => `<tr><td class="t" title="${esc(e.id)}">${esc(e.name)}</td>${RULE_CODES.map((k) => cell(e.rules[k])).join('')}</tr>`).join('\n')}
</tbody></table></div>
<div class="card">${m.rows.map((e) => { const n = notes(e); return n ? `<details><summary><span class="dot ${clean(e) ? 'green' : 'red'}"></span>${esc(e.id)}${e.classes.length ? ` <span class="muted">· ${esc(e.classes.map((c) => CLASSES[c].title).join(', '))}</span>` : ''}</summary><ul>${n}</ul></details>` : ''; }).join('')}</div>`).join('\n')}

<h2>Классы исключений</h2>
<div class="scroll"><table><thead><tr><th>Класс</th><th>Снимает правила</th><th>Почему</th></tr></thead><tbody>
${Object.values(CLASSES).map((c) => `<tr><td><b>${esc(c.title)}</b></td><td>${c.waives.map((k) => esc(RULES.find((r) => r.code === k).title)).join(', ')}</td><td>${esc(c.why)}</td></tr>`).join('\n')}
</tbody></table></div>
${part('watch.html')}
${part('prod.html') || '<h2>Сверка с боевой базой</h2><div class="card">Ещё не проводилась: запрос только на чтение <code>supabase/checks/002_schema_inventory_readonly.sql</code> запускает владелец.</div>'}
${part('plan.html')}
<h2>Вне стандарта</h2>
<div class="scroll"><table><thead><tr><th>Раздел</th><th>Таблиц</th><th>Почему не проверяется</th></tr></thead><tbody>
${Object.entries(OUT_OF_SCOPE).map(([s, why]) => `<tr><td><code>${esc(s)}</code></td><td class="num">${counts[s] || 0}</td><td>${esc(why)}</td></tr>`).join('\n')}
</tbody></table></div>
</main></body></html>
`;
writeFileSync(HTML, html);
console.log(`опись: ${tables.length} таблиц (${Object.entries(counts).map(([s, n]) => `${s} ${n}`).join(', ')}), хеш миграций ${inventory.migrationsHash}; светофор ✓${all.green} !${all.yellow} ✕${all.red} —${all.na}`);
