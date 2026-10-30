// P2-0072: прогон серверных тестов tests/server/*.sql в PGlite (локальная копия схемы, боевой сервер не используется).
// node tests/server/run-pglite.mjs [--upto 053] [--then 054_quality_ids_up.sql] файл.sql …  (без файлов — все *.sql, кроме *.pglite.sql и *.check.sql)
// Каждый файл — на свежей базе (все миграции или до --upto, затем по порядку файлы --then: засев, миграция). Тест сообщает итог
// исключением «FAIL всего: N» (P0001) — N = 0 → OK; любая другая ошибка — ERR. Выход 1, если есть FAIL/ERR.
// P2_VERBOSE=1 — показать и сводку теста при FAIL 0. Нужен P2_PGLITE (см. pglite-db.mjs).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverDb } from './pglite-db.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SRV = join(ROOT, 'tests/server');
const args = process.argv.slice(2);
let upto = null; const then = []; const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--upto') upto = args[++i];
  else if (args[i] === '--then') then.push(args[++i]);
  else files.push(args[i]);
}
const list = files.length ? files : readdirSync(SRV).filter((f) => f.endsWith('.sql') && !/\.(pglite|check)\.sql$/.test(f)).sort();
const path = (f) => (existsSync(f) ? f : existsSync(join(SRV, f)) ? join(SRV, f) : join(ROOT, 'supabase/migrations', f));
let bad = 0;
for (const f of list) {
  const t0 = Date.now();
  const db = await serverDb(upto ? { upto } : {});
  let line;
  try {
    for (const x of then) await db.exec(readFileSync(path(x), 'utf8'));
    const res = await db.exec(readFileSync(path(f), 'utf8'));
    const rows = res.flatMap((r) => r.rows || []);
    line = 'OK ' + (rows.length ? JSON.stringify(rows).slice(0, 2000) : '');
  } catch (e) {
    const m = String(e.message || e);
    const n = m.match(/FAIL всего: (\d+)/);
    if (n && n[1] === '0') line = 'OK ' + (process.env.P2_VERBOSE ? m : 'FAIL всего: 0');
    else { bad++; line = (n ? 'FAIL ' : 'ERR ') + m.slice(0, 4000); }
  }
  console.log(`${f} (${((Date.now() - t0) / 1000).toFixed(1)} с): ${line}`);
  await db.close();
}
console.log(`Итого файлов ${list.length}, с ошибками ${bad}`);
process.exit(bad ? 1 : 0);
