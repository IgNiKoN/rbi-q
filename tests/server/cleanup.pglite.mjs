// P2-0075: проверка scripts/cleanup-test-projects.sql в PGlite (боевой сервер не используется). Нужен P2_PGLITE (см. pglite-db.mjs).
// node tests/server/cleanup.pglite.mjs
// 1) засев → dry (отчёт «СУХОЙ ПРОГОН») → проверка «ничего не изменилось» → apply → проверка → apply ещё раз (удалено 0) → проверка;
// 2) засев + запись «REST…» в нетестовой компании → dry и apply — отказ «вне тестовых компаний», ничего не изменилось.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverDb } from './pglite-db.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const script = read('scripts/cleanup-test-projects.sql');
const dry = script, apply = script.replace("v_mode text := 'dry';", "v_mode text := 'apply';");
if (apply === dry) throw new Error('в скрипте не найдена строка режима');
const seed = read('tests/server/cleanup_seed.pglite.sql'), check = read('tests/server/cleanup_check.pglite.sql');
let fails = 0;
const ok = (c, l) => { console.log(`${c ? 'OK' : 'FAIL'} ${l}`); if (!c) fails++; };
const tryExec = async (db, sql) => { try { return { rows: (await db.exec(sql)).flatMap((r) => r.rows || []) }; } catch (e) { return { err: String(e.message || e) }; } };
const runCheck = async (db, label) => {
  const r = await tryExec(db, check);
  const n = r.err?.match(/FAIL всего: (\d+)/);
  ok(n && n[1] === '0', `${label}: проверка${n && n[1] === '0' ? '' : '\n' + (r.err || 'нет отчёта')}`);
  if (process.env.P2_VERBOSE) console.log(r.err);
};

{
  const db = await serverDb();
  const s = await tryExec(db, seed);
  ok(!s.err, 'засев' + (s.err ? ': ' + s.err : ''));
  const d = await tryExec(db, dry);
  ok(/СУХОЙ ПРОГОН/.test(d.err || ''), 'dry — отчёт «СУХОЙ ПРОГОН»');
  console.log((d.err || '').split('\n').filter((l) => /^(0|4|5) \|/.test(l)).join('\n'));
  await runCheck(db, 'после dry');
  const a = await tryExec(db, apply);
  ok(!a.err && a.rows.some((r) => r.step === 4), 'apply — удаление выполнено' + (a.err ? ': ' + a.err : ''));
  await runCheck(db, 'после apply');
  const a2 = await tryExec(db, apply);
  ok(!a2.err && !a2.rows.some((r) => r.step === 4 || r.step === 5 && r['до'] > 1), 'повтор apply — удалено 0 строк' + (a2.err ? ': ' + a2.err : ''));
  await runCheck(db, 'после повтора');
  await db.close();
}
{
  const db = await serverDb();
  await tryExec(db, seed);
  const ins = await tryExec(db, `insert into planfact.works(company_id, project_id, name)
    select p.company_id, p.id, 'REST-подлог' from core.projects p join core.companies c on c.id = p.company_id where c.name = 'РБИ'`);
  ok(!ins.err, '«REST…» в нетестовой компании (РБИ) добавлен' + (ins.err ? ': ' + ins.err : ''));
  await tryExec(db, `create table public.cleanup_x as select * from public.cleanup_counts()`);
  for (const [m, sql] of [['dry', dry], ['apply', apply]]) {
    const r = await tryExec(db, sql);
    ok(/вне тестовых компаний — ничего не удалено[\s\S]*planfact\.works: 1/.test(r.err || ''), `${m}: «REST…» в РБИ — отказ` + (r.err ? '' : ' (отказа нет)'));
    const c = await tryExec(db, `select count(*)::int n from (select * from public.cleanup_counts() except select * from public.cleanup_x) d`);
    ok(c.rows?.[0]?.n === 0, `${m}: после отказа ничего не изменилось`);
  }
  await db.close();
}
console.log(fails ? `ИТОГ: FAIL (${fails})` : 'ИТОГ: PASS');
process.exit(fails ? 1 : 0);
