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

// таблицы с политикой и вид записи устройства (описание `sync` манифеста)
const TABLES = [['rbi_inspections', 'inspection'], ['rbi_tasks', 'task'], ['project_meetings', 'meeting'], ['project_interventions', 'intervention'],
  ['project_fmea', 'fmea'], ['project_schedule_stages', 'schedule'], ['shared_reports', 'report'], ['sk_records', 'sk_record'],
  ['shared_etalons', 'etalon'], ['shared_docs', 'document'], ['shared_practices', 'practice'], ['shared_twi_cards', 'twi']];
const filler = (t, tag) => (t === 'text' ? `'${tag}'` : t === 'uuid' ? 'gen_random_uuid()' : t === 'boolean' ? 'false' : /json/.test(t) ? "'{}'"
  : /int|numeric|double|real/.test(t) ? '1' : /timestamp/.test(t) ? 'now()' : t === 'date' ? 'current_date' : /\[\]/.test(t) ? "'{}'" : 'null');
const colsOf = {};
for (const [t] of TABLES) {
  colsOf[t] = await q(`select a.attname n, format_type(a.atttypid, a.atttypmod) t, a.attnotnull nn, d.adbin is not null def from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = ('quality.' || $1)::regclass and a.attnum > 0 and not a.attisdropped`, [t]);
}
const SET = ['id', 'project_code', 'core_company_id', 'engineer_name', 'project_canonical_key', 'assigned_to_auth_user_id', 'core_project_id', 'core_created_by'];
/** Строка таблицы: обязательные колонки — заглушки (как pg_temp.mk в 033); автор вставки — sub (set_author сервера). */
async function row(t, id, { author = null, engineer = 'x', object = null, cp = null, assignee = null }) {
  const c = colsOf[t], has = (n) => c.some((x) => x.n === n);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${author || ''}', false)`);
  const names = ['id', 'core_company_id'], vals = [`'${id}'`, `'${CA}'`];
  if (has('project_code')) { names.push('project_code'); vals.push(`'${PA}'`); }
  if (has('engineer_name')) { names.push('engineer_name'); vals.push(`'${engineer.replace(/'/g, "''")}'`); }
  if (has('project_canonical_key')) { names.push('project_canonical_key'); vals.push(object === null ? 'null' : `'${object}'`); }
  if (has('assigned_to_auth_user_id') && assignee) { names.push('assigned_to_auth_user_id'); vals.push(`'${assignee}'`); }
  for (const x of c) if (x.nn && !x.def && !SET.includes(x.n)) { names.push(x.n); vals.push(filler(x.t, id + '-' + x.n)); }
  await db.exec(`insert into quality.${t} (${names.map((n) => '"' + n + '"').join(',')}) values (${vals.join(',')})`);
  if (cp && has('core_counterparty_id')) {   // фирма записи — прямо id контрагента (обычно её ставит триггер по названию; здесь — в обход, как перенос данных)
    await db.exec(`select set_config('quality.object_bind', '1', false)`);
    await q(`update quality.${t} set core_counterparty_id = $1 where id = $2`, [cp, id]);
    await db.exec(`select set_config('quality.object_bind', '', false)`);
  }
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
}
const mail = (k) => U[k] + '@test.invalid';
for (const [t] of TABLES) {
  await row(t, 'r-eng-o1', { author: U.eng, object: 'жк север' });
  await row(t, 'r-eng-o2', { author: U.eng, object: 'жк юг' });
  await row(t, 'r-eng-none', { author: U.eng, object: null });
  await row(t, 'r-engO1-o1', { author: U.engO1, object: 'жк север' });
  await row(t, 'r-engO1-none', { author: U.engO1, object: null });
  await row(t, 'r-other-o1', { author: U.other, object: 'жк север' });
  await row(t, 'r-other-o2', { author: U.other, object: 'жк юг' });
  await row(t, 'r-other-none', { author: U.other, object: null });
  await row(t, 'r-legacy-mail', { author: null, engineer: mail('eng'), object: 'жк север' });   // старая: автор по почте (member_by_email)
  await row(t, 'r-cp1', { author: U.other, object: 'жк север', cp: CP1 });
  await row(t, 'r-cp2', { author: U.other, object: 'жк юг', cp: CP2 });
  await row(t, 'r-ctr-own', { author: U.ctr, object: 'жк север', cp: null });
  await row(t, 'r-assigned-eng', { author: U.other, object: 'жк юг', assignee: U.eng });         // задача: назначена инженеру
}

// ---- сравнение
const asUser = async (u) => db.exec(`reset role;
  select set_config('request.jwt.claim.sub', '${u}', false), set_config('request.jwt.claims', '${JSON.stringify({ sub: u, role: 'authenticated' })}', false),
         set_config('request.headers', '${JSON.stringify({ 'x-company-id': CA })}', false);
  set role authenticated;`);
let fail = 0, checks = 0;
const out = [], tally = {};
for (const [t, kindName] of TABLES) {
  const K = kindOf(kindName);
  const has = (n) => colsOf[t].some((x) => x.n === n);
  const pick = ['id', ...['core_created_by', 'core_counterparty_id', 'engineer_name', 'project_canonical_key', 'assigned_to_auth_user_id'].filter(has)];
  const all = await q(`select ${pick.map((n) => '"' + n + '"').join(',')} from quality.${t} order by id`);
  for (const k of Object.keys(U)) {
    await asUser(U[k]);
    const acc = (await q(`select quality.my_access() a`))[0].a;
    const me = meFrom({ userId: U[k], email: mail(k), name: 'Сотрудник ' + k, actions: acc.actions,
      objects: Array.isArray(acc.objects) ? acc.objects.map((o) => o.key) : null, contractorId: acc.contractor ? acc.contractor.id : '' });
    const seen = new Set((await q(`select id from quality.${t}`)).map((r) => r.id));
    for (const r of all) {
      let canEdit;
      try {
        await db.exec('begin');
        canEdit = (await q(`update quality.${t} set id = id where id = $1 returning id`, [r.id])).length === 1;
      } catch { canEdit = false; } finally { await db.exec('rollback').catch(() => {}); await asUser(U[k]); }
      // запись устройства — как её сохраняет скачивание (id автора, подпись, объект, фирма, кому задача)
      const nameField = [].concat((K.author || {}).name || [])[0] || 'inspectorName';
      const rec = { id: r.id, authorId: r.core_created_by || undefined, [nameField]: r.engineer_name || '', project_canonical_key: r.project_canonical_key || '',
        contractorId: r.core_counterparty_id || '', assignedToId: r.assigned_to_auth_user_id || '' };
      const dv = visible(rec, K, me), de = canSend(rec, K, me);
      const key = t + ' · ' + k;
      tally[key] = tally[key] || [0, 0];
      if (seen.has(r.id)) tally[key][0]++;
      if (canEdit) tally[key][1]++;
      for (const [what, srv, dev] of [['видно', seen.has(r.id), dv], ['править', canEdit, de.ok]]) {
        checks++;
        if (srv !== dev) { fail++; out.push(`FAIL ${t} · ${k} · ${r.id} · ${what}: сервер ${srv}, устройство ${dev}${de.reason ? ' (' + de.reason + ')' : ''}`); }
      }
    }
  }
}
await db.exec('reset role');
console.log(out.join('\n'));
for (const [t] of TABLES) console.log(t + ': ' + Object.keys(U).map((k) => `${k} ${tally[t + ' · ' + k].join('/')}`).join(', '));
console.log(`Зеркало ${TABLES.length} таблиц: проверок ${checks}, FAIL ${fail}`);
process.exit(fail ? 1 : 0);
