// P2-0053. Проверка «ЖК Демо» на стенде (PGlite, боевой сервер не используется): засев → сводка; на стенде есть «чужая»
// компания с данными, «песочница» клиента и её сотрудник-посетитель демо (вошёл в демо ролью); сброс → у них всё на месте
// (строки по каждой таблице, учётки, участие, назначения — до = после), посетитель — без участия в демо; второй засев — те же
// числа. Выход 1 при расхождении. Запуск: P2_PGLITE=… node scripts/demo/check.mjs [--today ГГГГ-ММ-ДД]
import { fileURLToPath } from 'node:url';
import { accountsSql } from './accounts.mjs';
import { runSeed } from './seed.mjs';
import { resetSql } from './stand.mjs';
import { standDb, startStand } from './stand-server.mjs';
import { checkSeed } from './checks.mjs';

const ALFA = '0c000000-0000-4000-8000-0000000000a1', SAND = '0c000000-0000-4000-8000-0000000000b1';
const U_ALFA = '0d000000-0000-4000-8000-0000000000a1', U_SAND = '0d000000-0000-4000-8000-0000000000b1', U_VIS = '0d000000-0000-4000-8000-0000000000b2';

/** Строки не демо-компании по каждой таблице core / planfact / quality, учётки не zd-…, участие и назначения — «снимок». */
async function snapshot(db) {
  const r = await db.query(`
    with t as (select c.table_schema s, c.table_name tb, max(c.column_name) col from information_schema.columns c
                 join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
                where c.table_schema in ('core', 'planfact', 'quality') and c.column_name in ('company_id', 'core_company_id') group by 1, 2)
    select s || '.' || tb k, col from t order by 1`);
  const out = {};
  const demo = (await db.query(`select coalesce(array_agg(id::text), '{}') ids from core.companies where is_demo`)).rows[0].ids;
  for (const x of r.rows) {
    const [s, tb] = x.k.split('.');
    out[x.k] = Number((await db.query(`select count(*)::int n from "${s}"."${tb}" where not coalesce("${x.col}"::text = any($1::text[]), false)`, [demo])).rows[0].n);
  }
  out['auth.users (не zd-)'] = Number((await db.query(`select count(*)::int n from auth.users where email not like 'zd-%@demo.invalid'`)).rows[0].n);
  out['назначения вне демо'] = (await db.query(`select coalesce(string_agg(company_id || ':' || user_id || ':' || role_id || ':' || coalesce(revoked_at::text, '-'), ';' order by id), '')
    v from core.role_assignments where not coalesce(company_id::text = any($1::text[]), false)`, [demo])).rows[0].v;
  return out;
}

export async function standWithNeighbours(today) {
  const db = await standDb();
  // «чужая» компания с объектом и местами, «песочница» клиента с админом и прорабом-посетителем
  await db.exec(`
    insert into auth.users(id, email) values ('${U_ALFA}', 'alfa-admin@test.invalid'), ('${U_SAND}', 'admin.k0@sandbox.test.invalid'),
      ('${U_VIS}', 'prorab.k0@sandbox.test.invalid');
    insert into core.companies(id, name, is_test) values ('${ALFA}', 'Альфа (стенд)', true), ('${SAND}', 'Песочница — Клиент 0 (стенд)', true);
    insert into core.company_members(company_id, user_id) values ('${ALFA}', '${U_ALFA}'), ('${SAND}', '${U_SAND}'), ('${SAND}', '${U_VIS}');
    insert into core.role_assignments(company_id, user_id, role_id)
      select '${ALFA}'::uuid, '${U_ALFA}'::uuid, id from core.company_roles where company_id = '${ALFA}' and template_code = 'company_admin'
      union all select '${SAND}'::uuid, '${U_SAND}'::uuid, id from core.company_roles where company_id = '${SAND}' and template_code = 'company_admin'
      union all select '${SAND}'::uuid, '${U_VIS}'::uuid, id from core.company_roles where company_id = '${SAND}' and template_code = 'foreman';
    select set_config('request.jwt.claim.sub', '${U_ALFA}', false);
    select public.pf_save_project('${ALFA}', '0a000000-0000-4000-8000-0000000000a1', '{"name": "ЖК Альфа"}');
    select public.pf_save_place('0a000000-0000-4000-8000-0000000000a1', '0b000000-0000-4000-8000-0000000000a1', null, 'object', 'Корпус А', 'building', 'А', null);
    select public.pf_fill_object('0b000000-0000-4000-8000-0000000000a1', 1, 3, 2, 1, 'through', 1, false, false);
    select set_config('request.jwt.claim.sub', '', false);`);
  await db.exec(accountsSql('stand'));
  const stand = await startStand({ db, apiPort: 18893, appPort: 0 });
  const seed = (log = () => {}) => runSeed({ url: stand.apiUrl, anonKey: 'stand', password: 'stand', today, log });
  return { db, stand, seed };
}

/** Посетитель из «песочницы» входит в демо ролью (как кнопка «Демо»). */
export async function visit(db, user, role) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${user}', false)`);
  const r = (await db.query(`select public.pf_demo_enter($1) j`, [role])).rows[0].j;
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  return r;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const today = a.includes('--today') ? a[a.indexOf('--today') + 1] : null;
  let bad = 0;
  const t = (c, l) => { console.log((c ? 'OK   ' : 'FAIL ') + l); if (!c) bad++; };
  try {
    const t0 = Date.now();
    const { db, stand, seed } = await standWithNeighbours(today);
    const first = await seed(console.log);
    for (const [ok, label] of await checkSeed(db, stand.apiUrl, first)) t(ok, label);
    const v = await visit(db, U_VIS, 'foreman');
    t(v && v.role === 'foreman', 'посетитель из «песочницы» вошёл в демо прорабом');
    const before = await snapshot(db);
    await db.exec(resetSql());
    const after = await snapshot(db);
    const diff = Object.keys(before).filter((k) => before[k] !== after[k]);
    t(diff.length === 0, 'сброс: «чужая» компания, «песочница», посетитель — до = после' + (diff.length ? ' (' + diff.map((k) => `${k}: ${before[k]} → ${after[k]}`).join('; ') + ')' : ''));
    const left = (await db.query(`select (select count(*) from core.companies where is_demo)::int c, (select count(*) from auth.users where email like 'zd-%@demo.invalid')::int u,
      (select count(*) from auth.users where id = $1)::int vis, (select count(*) from core.demo_visits)::int visits`, [U_VIS])).rows[0];
    t(left.c === 0 && left.u === 0 && left.vis === 1 && left.visits === 0, `сброс: демо-компании и zd-учёток нет, учётка посетителя на месте, визитов нет (${JSON.stringify(left)})`);
    await db.exec(accountsSql('stand'));
    const second = await seed();
    t(JSON.stringify(first) === JSON.stringify(second), 'второй засев после сброса — те же числа');
    const v2 = await visit(db, U_VIS, 'qc_engineer');
    t(v2 && v2.role === 'qc_engineer', 'после сброса посетитель снова входит в демо');
    console.log(`сводка: ${JSON.stringify(first)} (${((Date.now() - t0) / 1000).toFixed(1)} с)`);
    await stand.stop();
  } catch (e) {
    console.error('ОШИБКА:', e.stack || e.message);
    bad++;
  }
  console.log(bad ? `FAIL всего: ${bad}` : 'FAIL всего: 0');
  process.exit(bad ? 1 : 0);
}
