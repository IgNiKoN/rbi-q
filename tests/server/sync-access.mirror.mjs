// P2-0061: зеркальный тест «правило устройства = правило сервера» (standards/SYNC_AND_ACCESS.md, правило 2).
// Локальная копия сервера в PGlite (tests/server/pglite-db.mjs, все миграции), боевой сервер не используется.
// Каждый тестовый пользователь спрашивает сервер quality.my_access → из ответа строится «кто я» устройства (meFrom);
// для каждой записи сравниваются: сервер видит (select под RLS) = visible() устройства, сервер даёт править (update под RLS)
// = canSend() устройства; P2-0070 — Стройконтроль 2.0 по участию: роли с новыми действиями (тем же правилом, что перенос в 052),
// участие на объект и на секцию, каждое действие записи: сервер core.row_allowed = canAct() устройства; План/Факт — та же
// область по описанию манифеста (pf_my_area → grants): сервер planfact.has_permission ∧ in_area(my_area) = canAct() устройства. Запуск: P2_PGLITE=<папка с @electric-sql/pglite> node tests/server/sync-access.mirror.mjs
import { serverDb } from './pglite-db.mjs';
import { canAct, canSend, fineFromLegacy, kindOf, meFrom, visible } from '../../js/services/sync/sync-access.policy.js';

const db = await serverDb();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const uuid = async () => (await q('select gen_random_uuid() id'))[0].id;

// ---- засев (под суперпользователем; автор вставки — sub, как set_author на сервере)
const CA = await uuid(), PA = await uuid(), CP1 = await uuid(), CP2 = await uuid();
const U = {};
for (const k of ['eng', 'engO1', 'mgr', 'dir', 'comp', 'ctr', 'viewer', 'other', 'engP', 'sec', 'ctrSec', 'noclose']) U[k] = await uuid();
await q(`insert into auth.users(id, email) select u, u || '@test.invalid' from unnest($1::uuid[]) u`, [Object.values(U)]);
await q(`insert into core.companies(id, name, is_test) values ($1, 'Зеркало P2-0061', true)`, [CA]);
await q(`insert into core.company_members(company_id, user_id) select $1, u from unnest($2::uuid[]) u`, [CA, Object.values(U)]);
await q(`insert into core.company_modules(company_id, module, enabled) select $1, m, true from unnest(array['quality','construction','planfact']) m
         on conflict (company_id, module) do update set enabled = true`, [CA]);
await db.exec(`select set_config('quality.object_sync', '1', false)`);
await q(`insert into core.projects(id, company_id, name) values ($1, $2, 'Объекты зеркала')`, [PA, CA]);
await q(`insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id) values
         ('o1-mir', 'жк север', 'ЖК Север', '{}', $1), ('o2-mir', 'жк юг', 'ЖК Юг', '{}', $1)`, [CA]);
await db.exec(`select set_config('quality.object_sync', '', false)`);
await q(`insert into core.counterparties(id, company_id, name, inn, kinds) values ($1, $3, 'Фирма 1', '7701000001', '{contractor}'), ($2, $3, 'Фирма 2', '7701000002', '{contractor}')`, [CP1, CP2, CA]);
const CE = ['construction.view', 'construction.edit'];
// P2-0070: места объекта PA (корпус → секция 1 → этаж; секция 2) и второй объект PB
const PB = await uuid(), L0 = await uuid(), L1 = await uuid(), L1F = await uuid(), L2 = await uuid();
await q(`insert into core.projects(id, company_id, name) values ($1, $2, 'Второй объект зеркала')`, [PB, CA]);
await q(`insert into core.locations(id, company_id, project_id, parent_id, node_type, name, canonical_key, depth) values
  ($1, $5, $6, null, 'building', 'Корпус', 'корпус', 1), ($2, $5, $6, $1, 'section', 'Секция 1', 'секция 1', 2),
  ($3, $5, $6, $2, 'floor', 'Этаж 1', 'этаж 1', 3), ($4, $5, $6, $1, 'section', 'Секция 2', 'секция 2', 2)`, [L0, L1, L1F, L2, CA, PA]);
const ROLES = {
  eng: ['quality.view', 'quality.edit', ...CE], engO1: ['quality.view', 'quality.edit', ...CE], mgr: ['quality.view', 'quality.edit', 'quality.manage', ...CE, 'construction.manage'],
  dir: ['quality.view', 'quality.scope.company', 'construction.view'], comp: ['quality.view', 'quality.edit', 'quality.scope.company', ...CE],
  ctr: ['quality.view', 'quality.edit', 'quality.scope.contractor', ...CE], viewer: ['quality.view', 'construction.view'], other: ['quality.view', 'quality.edit', ...CE],
  engP: ['quality.view', 'quality.edit', ...CE], sec: ['quality.view', 'quality.edit', ...CE], ctrSec: ['quality.view', 'quality.edit', 'quality.scope.contractor', ...CE],
  noclose: ['quality.view', 'construction.defects.view', 'construction.defects.create', 'construction.defects.reject', 'construction.acceptance.view',
            'construction.acceptance.book']
};
// участие: engP — объект PA целиком; sec и ctrSec — секция 1 объекта PA; остальные — вся компания
const PLACE = { engP: [PA, null], sec: [PA, L1], ctrSec: [PA, L1] };
for (const [k, acts] of Object.entries(ROLES)) {
  const [{ id }] = await q(`insert into core.company_roles(company_id, name) values ($1, $2) returning id`, [CA, 'Зеркало ' + k]);
  await q(`insert into core.company_role_permissions(role_id, company_id, action) select $1, $2, a from unnest($3::text[]) a`, [id, CA, acts]);
  // P2-0070: новые действия Стройконтроля по прежним — тем же правилом, что перенос ролей в 052
  await q(`insert into core.company_role_permissions(role_id, company_id, action) select $1, $2, x from unnest($3::text[]) x
           on conflict do nothing`, [id, CA, fineFromLegacy(acts)]);
  await q(`insert into core.role_assignments(company_id, user_id, role_id, quality_objects, counterparty_id, project_id, location_id) values ($1, $2, $3, $4, $5, $6, $7)`,
    [CA, U[k], id, k === 'engO1' ? ['o1-mir'] : null, k === 'ctr' || k === 'ctrSec' ? CP1 : null, (PLACE[k] || [])[0] || null, (PLACE[k] || [])[1] || null]);
}

// таблицы с политикой и вид записи устройства (описание `sync` манифеста)
const TABLES = [['rbi_inspections', 'inspection'], ['rbi_tasks', 'task'], ['project_meetings', 'meeting'], ['project_interventions', 'intervention'],
  ['project_fmea', 'fmea'], ['project_schedule_stages', 'schedule'], ['shared_reports', 'report'], ['sk_records', 'sk_record'],
  ['shared_etalons', 'etalon'], ['shared_docs', 'document'], ['shared_practices', 'practice'], ['shared_twi_cards', 'twi'],
  ['construction_defects_v2', 'defect_v2'], ['construction_acceptance_v2', 'acceptance_v2'], ['construction_units_v2', 'unit_v2']];
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
async function row(t, id, { author = null, engineer = 'x', object = null, cp = null, assignee = null, place = null }) {
  const c = colsOf[t], has = (n) => c.some((x) => x.n === n);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${author || ''}', false)`);
  const names = ['id', 'core_company_id'], vals = [`'${id}'`, `'${CA}'`];
  if (has('project_code')) { names.push('project_code'); vals.push(`'${PA}'`); }
  if (has('engineer_name')) { names.push('engineer_name'); vals.push(`'${engineer.replace(/'/g, "''")}'`); }
  if (has('project_canonical_key')) { names.push('project_canonical_key'); vals.push(object === null ? 'null' : `'${object}'`); }
  if (has('assigned_to_auth_user_id') && assignee) { names.push('assigned_to_auth_user_id'); vals.push(`'${assignee}'`); }
  for (const x of c) if (x.nn && !x.def && !SET.includes(x.n)) { names.push(x.n); vals.push(filler(x.t, id + '-' + x.n)); }
  // Стройконтроль 2.0: сторож 043 не даёт подрядчику создавать замечания — засев в обход триггеров, автор — явно
  const raw = t.startsWith('construction_');
  if (raw && author && has('core_created_by')) { names.push('core_created_by'); vals.push(`'${author}'`); }
  if (raw) await db.exec(`set session_replication_role = replica`);
  await db.exec(`insert into quality.${t} (${names.map((n) => '"' + n + '"').join(',')}) values (${vals.join(',')})`);
  if (raw) await db.exec(`set session_replication_role = origin`);
  if (cp && has('core_counterparty_id')) {   // фирма записи — прямо id контрагента (обычно её ставит триггер по названию; здесь — в обход, как перенос данных)
    await db.exec(`set session_replication_role = replica`);   // без триггеров привязки фирмы — id контрагента как есть
    await q(`update quality.${t} set core_counterparty_id = $1 where id = $2`, [cp, id]);
    await db.exec(`set session_replication_role = origin`);
  }
  if (place && has('core_location_id')) {   // P2-0070: объект и место записи — прямо (обычно их ставит сервер по "locationId")
    await db.exec(`set session_replication_role = replica`);
    await q(`update quality.${t} set core_project_id = $1, core_location_id = $2 where id = $3`, [place[0], place[1], id]);
    await db.exec(`set session_replication_role = origin`);
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
  if (t.startsWith('construction_') && t !== 'construction_units_v2') {   // P2-0070: места и объекты
    await row(t, 'p-s1-floor', { author: U.other, cp: CP1, place: [PA, L1F] });
    await row(t, 'p-s1', { author: U.other, cp: CP2, place: [PA, L1] });
    await row(t, 'p-s2', { author: U.other, cp: CP1, place: [PA, L2] });
    await row(t, 'p-pa-obj', { author: U.other, cp: CP1, place: [PA, null] });
    await row(t, 'p-pa-obj-sec', { author: U.sec, cp: CP1, place: [PA, null] });
    await row(t, 'p-pb', { author: U.other, cp: CP1, place: [PB, null] });
  }
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
  const pick = ['id', ...['core_created_by', 'core_counterparty_id', 'engineer_name', 'project_canonical_key', 'assigned_to_auth_user_id',
    'core_project_id', 'core_location_id'].filter(has)];
  // P2-0070: каждое действие записи по отдельности — сервер core.row_allowed = canAct устройства
  const ACTS = K.mode === 'area' ? [...K.view, ...K.edit] : [];
  await db.exec('reset role');   // список записей — под сервером (не под последним пользователем прошлой таблицы)
  const all = await q(`select ${pick.map((n) => '"' + n + '"').join(',')} from quality.${t} order by id`);
  for (const k of Object.keys(U)) {
    await asUser(U[k]);
    const acc = (await q(`select quality.my_access() a`))[0].a;
    const me = meFrom({ userId: U[k], email: mail(k), name: 'Сотрудник ' + k, actions: acc.actions,
      objects: Array.isArray(acc.objects) ? acc.objects.map((o) => o.key) : null, contractorId: acc.contractor ? acc.contractor.id : '',
      areas: { construction: acc.construction } });
    const seen = new Set((await q(`select id from quality.${t}`)).map((r) => r.id));
    for (const r of all) {
      let canEdit;
      // P2-0070: записи с местом заведены в обход привязки ("locationId" пуст) — правка пересчитала бы место; «править» = правило
      // строк правки (core.row_allowed с действиями правки; без смены полей сторож действий ничего не требует)
      if (ACTS.length && r.core_location_id) {
        canEdit = (await q(`select core_company_id = quality.request_company() and core.row_allowed(core_company_id, core_project_id, core_location_id, $1::text[], core_created_by, core_counterparty_id) ok
                            from quality.${t} where id = $2`, [K.edit, r.id])).some((x) => x.ok);
      } else try {
        await db.exec('begin');
        canEdit = (await q(`update quality.${t} set id = id where id = $1 returning id`, [r.id])).length === 1;
      } catch { canEdit = false; } finally { await db.exec('rollback').catch(() => {}); await asUser(U[k]); }
      // запись устройства — как её сохраняет скачивание (id автора, подпись, объект, фирма, кому задача)
      const nameField = [].concat((K.author || {}).name || [])[0] || 'inspectorName';
      const rec = { id: r.id, authorId: r.core_created_by || undefined, [nameField]: r.engineer_name || '', project_canonical_key: r.project_canonical_key || '',
        core_counterparty_id: r.core_counterparty_id || '', assignedToId: r.assigned_to_auth_user_id || '',
        contractorId: 'card-' + r.id,   // Б2: как на телефоне — contractorId это карточка справочника (другой номер), не id фирмы
        core_project_id: r.core_project_id || '', core_location_id: r.core_location_id || '' };
      const dv = visible(rec, K, me), de = canSend(rec, K, me);
      const key = t + ' · ' + k;
      tally[key] = tally[key] || [0, 0];
      if (seen.has(r.id)) tally[key][0]++;
      if (canEdit) tally[key][1]++;
      const pairs = [['видно', seen.has(r.id), dv], ['править', canEdit, de.ok]];
      for (const a of ACTS) {
        const [{ ok }] = await q(`select core_company_id = quality.request_company() and core.row_allowed(core_company_id, core_project_id, core_location_id, array[$1], core_created_by, core_counterparty_id) ok
                                   from quality.${t} where id = $2`, [a, r.id]).catch(() => [{ ok: false }]).then((x) => (x.length ? x : [{ ok: false }]));
        pairs.push([a, ok, canAct(rec, K, me, a).ok]);
      }
      for (const [what, srv, dev] of pairs) {
        checks++;
        if (srv !== dev) { fail++; out.push(`FAIL ${t} · ${k} · ${r.id} · ${what}: сервер ${srv}, устройство ${dev}${de.reason ? ' (' + de.reason + ')' : ''}`); }
      }
    }
  }
}

// ---- P2-0070: План/Факт — то же описание (pf_fact: место записи, действия каталога); участие — pf_my_area → grants
const PK = kindOf('pf_fact');
await db.exec('reset role');
const LB = await uuid();
await q(`insert into core.locations(id, company_id, project_id, parent_id, node_type, name, canonical_key, depth) values
  ($1, $2, $3, null, 'building', 'Корпус Б', 'корпус б', 1)`, [LB, CA, PB]);
const PFU = {};
for (const k of ['pfRP', 'pfFor', 'pfTwo', 'pfView', 'pfComp', 'pfB', 'pfNone', 'pfMix']) PFU[k] = await uuid();
await q(`insert into auth.users(id, email) select u, u || '@test.invalid' from unnest($1::uuid[]) u`, [Object.values(PFU)]);
await q(`insert into core.company_members(company_id, user_id) select $1, u from unnest($2::uuid[]) u`, [CA, Object.values(PFU)]);
const pfRole = async (name, acts) => {
  const [{ id }] = await q(`insert into core.company_roles(company_id, name) values ($1, $2) returning id`, [CA, name]);
  await q(`insert into core.company_role_permissions(role_id, company_id, action) select $1, $2, a from unnest($3::text[]) a`, [id, CA, acts]);
  return id;
};
const R_FACT = await pfRole('Зеркало ПФ: факт', ['planfact.works.view', 'planfact.fact.view', 'planfact.fact.create']);
const R_VIEW = await pfRole('Зеркало ПФ: просмотр', ['planfact.works.view', 'planfact.fact.view']);
const R_MONEY = await pfRole('Зеркало ПФ: деньги', ['planfact.works.view', 'planfact.money.view']);
// [пользователь, роль, проект, место]: РП — весь объект PA; прораб — секция 1; два участка — секции 1 и 2; просмотр — весь PA;
// вся компания; только объект PB; mix — роль без факта на весь PA + роль с фактом на секцию 1
for (const [k, r, p, l] of [['pfRP', R_FACT, PA, null], ['pfFor', R_FACT, PA, L1], ['pfTwo', R_FACT, PA, L1], ['pfTwo', R_FACT, PA, L2],
  ['pfView', R_VIEW, PA, null], ['pfComp', R_FACT, null, null], ['pfB', R_FACT, PB, null], ['pfMix', R_MONEY, PA, null], ['pfMix', R_FACT, PA, L1]]) {
  await q(`insert into core.role_assignments(company_id, user_id, role_id, project_id, location_id) values ($1, $2, $3, $4, $5)`, [CA, PFU[k], r, p, l]);
}
const PLACES = [[PA, L0], [PA, L1], [PA, L1F], [PA, L2], [PB, LB]];
let pfKnown = 0;
for (const k of Object.keys(PFU)) {
  await asUser(PFU[k]);
  const grants = [];
  for (const p of [PA, PB]) {
    const a = await q(`select public.pf_my_area($1) a`, [p]).catch(() => []);
    if (a.length) grants.push(...a[0].a.grants);
  }
  const me = meFrom({ userId: PFU[k], name: 'Сотрудник ' + k, actions: [], areas: { planfact: { admin: false, enabled: true, grants } } });
  for (const [p, l] of PLACES) {
    const rec = { id: 'f-' + l, project: p, location_id: l };
    for (const a of [...PK.view, ...PK.edit]) {
      const [{ ok }] = await q(`select planfact.has_permission($1, $2) and planfact.in_area($3, planfact.my_area($1)) ok`, [p, a, l]);
      const dev = canAct(rec, PK, me, a).ok;
      checks++;
      if (ok === dev) continue;
      // известное расхождение (ТД P2-0070): План/Факт складывает область всех ролей (has_permission ∧ my_area) — у mix факт
      // проходит на сервере по всему объекту; правило ядра и устройство — по каждому участию отдельно (строже, лишнего не шлёт)
      if (k === 'pfMix' && ok && !dev) { pfKnown++; continue; }
      fail++; out.push(`FAIL planfact · ${k} · ${l === L0 ? 'корпус' : l === L1 ? 'секция 1' : l === L1F ? 'этаж с1' : l === L2 ? 'секция 2' : 'корпус Б'} · ${a}: сервер ${ok}, устройство ${dev}`);
    }
  }
}
console.log(`План/Факт: известных расхождений «сервер шире устройства» (роль без факта на весь объект + роль с фактом на часть) — ${pfKnown}`);
await db.exec('reset role');
console.log(out.join('\n'));
for (const [t] of TABLES) console.log(t + ': ' + Object.keys(U).map((k) => `${k} ${(tally[t + ' · ' + k] || ['—', '—']).join('/')}`).join(', '));
console.log(`Зеркало ${TABLES.length} таблиц + План/Факт: проверок ${checks}, FAIL ${fail}`);
process.exit(fail ? 1 : 0);
