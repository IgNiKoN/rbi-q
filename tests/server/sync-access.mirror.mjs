// P2-0061: зеркальный тест «правило устройства = правило сервера» (standards/SYNC_AND_ACCESS.md, правило 2).
// Локальная копия сервера в PGlite (tests/server/pglite-db.mjs, все миграции), боевой сервер не используется.
// Каждый тестовый пользователь спрашивает сервер quality.my_access → из ответа строится «кто я» устройства (meFrom);
// для каждой записи сравниваются: сервер видит (select под RLS) = visible() устройства, сервер даёт править (update под RLS)
// = canSend() устройства. Запуск: P2_PGLITE=<папка с @electric-sql/pglite> node tests/server/sync-access.mirror.mjs
import { serverDb } from './pglite-db.mjs';
import { canSend, kindOf, meFrom, visible } from '../../js/services/sync/sync-access.policy.js';

const db = await serverDb();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const uuid = async () => (await q('select gen_random_uuid() id'))[0].id;

// ---- засев (под суперпользователем; автор вставки — sub, как set_author на сервере)
const CA = await uuid(), PA = await uuid(), CP1 = await uuid(), CP2 = await uuid();
const U = {};
for (const k of ['eng', 'engO1', 'mgr', 'dir', 'comp', 'ctr', 'viewer', 'other']) U[k] = await uuid();
await q(`insert into auth.users(id, email) select u, u || '@test.invalid' from unnest($1::uuid[]) u`, [Object.values(U)]);
await q(`insert into core.companies(id, name, is_test) values ($1, 'Зеркало P2-0061', true)`, [CA]);
await q(`insert into core.company_members(company_id, user_id) select $1, u from unnest($2::uuid[]) u`, [CA, Object.values(U)]);
await q(`insert into core.company_modules(company_id, module, enabled) select $1, m, true from unnest(array['quality','construction']) m
         on conflict (company_id, module) do update set enabled = true`, [CA]);
await db.exec(`select set_config('quality.object_sync', '1', false)`);
await q(`insert into core.projects(id, company_id, name) values ($1, $2, 'Объекты зеркала')`, [PA, CA]);
await q(`insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id) values
         ('o1-mir', 'жк север', 'ЖК Север', '{}', $1), ('o2-mir', 'жк юг', 'ЖК Юг', '{}', $1)`, [CA]);
await db.exec(`select set_config('quality.object_sync', '', false)`);
await q(`insert into core.counterparties(id, company_id, name, inn, kinds) values ($1, $3, 'Фирма 1', '7701000001', '{contractor}'), ($2, $3, 'Фирма 2', '7701000002', '{contractor}')`, [CP1, CP2, CA]);
const ROLES = {
  eng: ['quality.view', 'quality.edit'], engO1: ['quality.view', 'quality.edit'], mgr: ['quality.view', 'quality.edit', 'quality.manage'],
  dir: ['quality.view', 'quality.scope.company'], comp: ['quality.view', 'quality.edit', 'quality.scope.company'],
  ctr: ['quality.view', 'quality.edit', 'quality.scope.contractor'], viewer: ['quality.view'], other: ['quality.view', 'quality.edit']
};
for (const [k, acts] of Object.entries(ROLES)) {
  const [{ id }] = await q(`insert into core.company_roles(company_id, name) values ($1, $2) returning id`, [CA, 'Зеркало ' + k]);
  await q(`insert into core.company_role_permissions(role_id, company_id, action) select $1, $2, a from unnest($3::text[]) a`, [id, CA, acts]);
  await q(`insert into core.role_assignments(company_id, user_id, role_id, quality_objects, counterparty_id) values ($1, $2, $3, $4, $5)`,
    [CA, U[k], id, k === 'engO1' ? ['o1-mir'] : null, k === 'ctr' ? CP1 : null]);
}

// обязательные колонки таблицы без значения по умолчанию — заполняются заглушками (как pg_temp.mk в 033)
const cols = await q(`select a.attname n, format_type(a.atttypid, a.atttypmod) t from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'quality.rbi_inspections'::regclass and a.attnum > 0 and not a.attisdropped and a.attnotnull and d.adbin is null
    and a.attname not in ('id', 'project_code', 'core_company_id', 'core_project_id', 'core_created_by')`);
const filler = (t) => (t === 'text' ? "'x'" : t === 'uuid' ? 'gen_random_uuid()' : t === 'boolean' ? 'false' : /json/.test(t) ? "'{}'"
  : /int|numeric|double|real/.test(t) ? '1' : /timestamp/.test(t) ? 'now()' : t === 'date' ? 'current_date' : /\[\]/.test(t) ? "'{}'" : 'null');
async function row(id, { author = null, engineer = 'x', object = null, cp = null }) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${author || ''}', false)`);
  const names = ['id', 'project_code', 'core_company_id', 'engineer_name', 'project_canonical_key', ...cols.map((c) => c.n).filter((n) => !['engineer_name', 'project_canonical_key'].includes(n))];
  const vals = [`'${id}'`, `'${PA}'`, `'${CA}'`, `'${engineer.replace(/'/g, "''")}'`, object === null ? 'null' : `'${object}'`,
    ...cols.filter((c) => !['engineer_name', 'project_canonical_key'].includes(c.n)).map((c) => filler(c.t))];
  await db.exec(`insert into quality.rbi_inspections (${names.map((n) => '"' + n + '"').join(',')}) values (${vals.join(',')})`);
  if (cp) {   // фирма записи — прямо id контрагента (обычно её ставит триггер по названию; здесь — в обход, как перенос данных)
    await db.exec(`select set_config('quality.object_bind', '1', false)`);
    await q(`update quality.rbi_inspections set core_counterparty_id = $1 where id = $2`, [cp, id]);
    await db.exec(`select set_config('quality.object_bind', '', false)`);
  }
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
}
const mail = (k) => U[k] + '@test.invalid';
await row('r-eng-o1', { author: U.eng, object: 'жк север' });
await row('r-eng-o2', { author: U.eng, object: 'жк юг' });
await row('r-eng-none', { author: U.eng, object: null });
await row('r-engO1-o1', { author: U.engO1, object: 'жк север' });
await row('r-engO1-none', { author: U.engO1, object: null });
await row('r-other-o1', { author: U.other, object: 'жк север' });
await row('r-other-o2', { author: U.other, object: 'жк юг' });
await row('r-other-none', { author: U.other, object: null });
await row('r-legacy-mail', { author: null, engineer: mail('eng'), object: 'жк север' });        // старая: автор по почте (member_by_email)
await row('r-cp1', { author: U.other, object: 'жк север', cp: CP1 });
await row('r-cp2', { author: U.other, object: 'жк юг', cp: CP2 });
await row('r-ctr-own', { author: U.ctr, object: 'жк север', cp: null });

// ---- сравнение
const K = kindOf('inspection');
const asUser = async (u) => db.exec(`reset role;
  select set_config('request.jwt.claim.sub', '${u}', false), set_config('request.jwt.claims', '${JSON.stringify({ sub: u, role: 'authenticated' })}', false),
         set_config('request.headers', '${JSON.stringify({ 'x-company-id': CA })}', false);
  set role authenticated;`);
const all = (await q(`select id, core_created_by, engineer_name, project_canonical_key, core_counterparty_id from quality.rbi_inspections order by id`));
let fail = 0, checks = 0;
const tally = {};
const out = [];
for (const k of Object.keys(U)) {
  await asUser(U[k]);
  const acc = (await q(`select quality.my_access() a`))[0].a;
  const me = meFrom({ userId: U[k], email: mail(k), name: 'Сотрудник ' + k, actions: acc.actions,
    objects: Array.isArray(acc.objects) ? acc.objects.map((o) => o.key) : null, contractorId: acc.contractor ? acc.contractor.id : '' });
  const seen = new Set((await q(`select id from quality.rbi_inspections`)).map((r) => r.id));
  for (const r of all) {
    let canEdit;
    try {
      await db.exec('begin');
      canEdit = (await q(`update quality.rbi_inspections set location = location where id = $1 returning id`, [r.id])).length === 1;
    } catch { canEdit = false; } finally { await db.exec('rollback').catch(() => {}); await asUser(U[k]); }
    const rec = { id: r.id, authorId: r.core_created_by || undefined, inspectorName: r.engineer_name, project_canonical_key: r.project_canonical_key || '', contractorId: r.core_counterparty_id || '' };
    const dv = visible(rec, K, me), de = canSend(rec, K, me);
    tally[k] = tally[k] || { видно: 0, править: 0 };
    if (seen.has(r.id)) tally[k].видно++;
    if (canEdit) tally[k].править++;
    for (const [what, srv, dev] of [['видно', seen.has(r.id), dv], ['править', canEdit, de.ok]]) {
      checks++;
      if (srv !== dev) { fail++; out.push(`FAIL ${k} · ${r.id} · ${what}: сервер ${srv}, устройство ${dev}${de.reason ? ' (' + de.reason + ')' : ''}`); }
    }
  }
}
await db.exec('reset role');
console.log(out.join('\n'));
console.log('Сервер (из ' + all.length + ' записей): ' + Object.entries(tally).map(([k, v]) => `${k} видит ${v.видно}, правит ${v.править}`).join('; '));
console.log(`Зеркало rbi_inspections: проверок ${checks}, FAIL ${fail}`);
process.exit(fail ? 1 : 0);
