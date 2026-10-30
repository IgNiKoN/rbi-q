// P2-0071 этап 4: данные для снимков «Компания → Сотрудники и доступ» (роли с группами Качества и «Доступ к модулю», мастер
// назначения «Все объекты / Выбранные объекты / Без объектов», «Кто что может» по Качеству) — из локальной копии сервера (PGlite,
// все миграции ветки), не придуманные: роли из шаблонов + своя, сотрудники с участием (вся компания, объект, секция, подрядчик,
// «без объектов»), каталог действий. Ответы — теми же функциями сервера, что зовёт экран, под администратором компании.
// Основа — reports/P2-0070/stage5/data.mjs.
// Запуск: P2_PGLITE=<папка с pglite> node data.mjs <repo> <out.json>
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const { serverDb } = await import(pathToFileURL(join(repo, 'tests/server/pglite-db.mjs')).href);
const { COMPANY } = await import(pathToFileURL(join(repo, 'tests/offline/servers.mjs')).href);
const db = await serverDb();
const q = async (sql, p) => (await db.query(sql, p)).rows;
const CA = COMPANY.id, ADM = '0d000000-0000-4000-8000-000000000001';
const P1 = '0a000000-0000-4000-8000-000000000001', P2 = '0a000000-0000-4000-8000-000000000002';
const K1 = '0b000000-0000-4000-8000-000000000001', K2 = '0b000000-0000-4000-8000-000000000002';
const F1 = '0c000000-0000-4000-8000-000000000001';
const asUser = (u) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${u}', false),
  set_config('request.jwt.claims', '${JSON.stringify({ sub: u, role: 'authenticated' })}', false),
  set_config('request.headers', '${JSON.stringify({ 'x-company-id': CA })}', false); set role authenticated;`);

await q(`insert into auth.users(id, email) values ($1, 'test@stand.local')`, [ADM]);
await q(`insert into core.companies(id, name, is_test) values ($1, $2, true)`, [CA, COMPANY.name]);
await q(`insert into core.company_modules(company_id, module, enabled) select $1, m, true from unnest(array['quality','construction','planfact']) m
         on conflict (company_id, module) do update set enabled = true`, [CA]);
await q(`insert into core.company_members(company_id, user_id) values ($1, $2)`, [CA, ADM]);
await q(`insert into core.user_profiles(user_id, full_name) values ($1, 'Иванов Иван') on conflict (user_id) do update set full_name = excluded.full_name`, [ADM]);
const roleOf = async (code) => (await q(`select id from core.company_roles where company_id = $1 and template_code = $2`, [CA, code]))[0].id;
await q(`insert into core.role_assignments(company_id, user_id, role_id) values ($1, $2, $3)`, [CA, ADM, await roleOf('company_admin')]);
await q(`insert into core.counterparties(id, company_id, name, inn, kinds) values ($1, $2, 'ООО «Каркас»', '7800000003', '{contractor}')`, [F1, CA]);
const CONT = '0a000000-0000-4000-8000-0000000000c0';   // проект-контейнер Качества («Без объектов»)
await q(`insert into core.projects(id, company_id, name, quality_container) values ($1, $2, 'Качество (общее)', true)`, [CONT, CA]);

await asUser(ADM);
await q(`select public.pf_save_project($1, $2, '{"name": "ЖК «Северный»"}'), public.pf_save_project($1, $3, '{"name": "ЖК «Южный»"}')`, [CA, P1, P2]);
await q(`select public.pf_save_place($1, $2, null, 'object', 'Корпус 1', 'building'), public.pf_save_place($3, $4, null, 'object', 'Корпус 1', 'building')`, [P1, K1, P2, K2]);
await q(`select public.pf_fill_object($1, 2, 3, 2), public.pf_fill_object($2, 1, 3, 2)`, [K1, K2]);
await db.exec('reset role');
const sec = async (n) => (await q(`select id from core.locations where parent_id = $1 and name = $2`, [K1, n]))[0].id;
const sec1 = await sec('Секция 1'), sec2 = await sec('Секция 2');

// своя роль «Методолог Качества» — только Качество (Стройконтроль выключен переключателем «Доступ к модулю»)
const [{ id: rNoClose }] = await q(`insert into core.company_roles(company_id, name) values ($1, 'Методолог Качества') returning id`, [CA]);
await q(`insert into core.company_role_permissions(role_id, company_id, action)
         select $1, $2, action from core.role_template_permissions where template_code = 'qc_engineer' and action like 'quality.%'`, [rNoClose, CA]);
const people = [
  ['Петров Пётр', 'qc_engineer', null, null, null],
  ['Сидорова Анна', 'qc_engineer', P1, null, null],
  ['Сидорова Анна', 'qc_engineer', P2, null, null],
  ['Лебедев Антон', null, CONT, null, null],
  ['Козлов Дмитрий', null, P1, sec1, null],
  ['Смирнов Олег', 'contractor_rep', P1, null, F1],
  ['Орлова Мария', 'customer', P1, null, null],
  ['Никитин Сергей', 'project_manager', P1, null, null],
  ['Волков Илья', 'foreman', P1, sec2, null],
  ['Егорова Ольга', 'foreman', P2, null, null]];
const byName = {};
for (const [name, tpl, proj, loc, cp] of people) {
  let u = byName[name];
  if (!u) {
    [{ id: u }] = await q(`insert into auth.users(id, email) values (gen_random_uuid(), gen_random_uuid() || '@stand.local') returning id`);
    await q(`insert into core.company_members(company_id, user_id) values ($1, $2)`, [CA, u]);
    await q(`insert into core.user_profiles(user_id, full_name) values ($1, $2) on conflict (user_id) do update set full_name = excluded.full_name`, [u, name]);
    byName[name] = u;
  }
  await q(`insert into core.role_assignments(company_id, user_id, role_id, project_id, location_id, counterparty_id) values ($1, $2, $3, $4, $5, $6)`,
    [CA, u, tpl ? await roleOf(tpl) : rNoClose, proj, loc, cp]);
}

await asUser(ADM);
const catalog = await q(`select * from public.pf_permission_catalog()`);
const roles = await q(`select * from public.pf_list_company_roles($1)`, [CA]);
const members = await q(`select * from public.pf_list_company_members($1)`, [CA]);
const container = (await q(`select public.pf_quality_container($1) c`, [CA]))[0].c;
// этап 5: ответы настоящих функций экрана «Кто что может» и дерева мест (если они есть в этой схеме)
const who = {}, tree = {};
const hasWho = (await q(`select to_regprocedure('public.pf_who_can(uuid,uuid,uuid)') is not null ok`))[0].ok;
for (const p of [P1, P2]) {
  tree[p + '|'] = await q(`select * from public.pf_project_places($1, null)`, [p]);
  for (const k of tree[p + '|']) tree[p + '|' + k.id] = await q(`select * from public.pf_project_places($1, $2)`, [p, k.id]);
  if (!hasWho) continue;
  for (const loc of [null, ...Object.values(tree).flat().filter((x) => x.project_id === p || true).map((x) => x.id)]) {
    const r = await q(`select * from public.pf_who_can($1, $2, $3)`, [CA, p, loc]).catch(() => null);
    if (r) who[p + '|' + (loc || '')] = r;
  }
}
await db.exec('reset role');
const places = await q(`select id, project_id, parent_id, name, depth from core.locations where project_id in ($1, $2) and depth <= 2 and deleted_at is null
                        order by project_id, depth, name`, [P1, P2]);
writeFileSync(out, JSON.stringify({ catalog, roles, members, places, who, tree, container, modules: ['quality', 'construction', 'planfact'],
  projects: [{ id: P1, name: 'ЖК «Северный»' }, { id: P2, name: 'ЖК «Южный»' }] }, null, 1));
console.log(`каталог ${catalog.length}, ролей ${roles.length}, строк сотрудников ${members.length}, мест ${places.length} → ${out}`);
