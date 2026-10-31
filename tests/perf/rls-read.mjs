// P2-0078: замер чтения Качества под правилами строк (RLS) — до и после 059, на копии схемы (PGlite) с объёмом боевого
// (31.10.2026: 39 проектов, file_registry 3 632, sk_records 11 900). Боевой сервер не используется. Нужен P2_PGLITE.
// node tests/perf/rls-read.mjs [--files 3632] [--sk 11900] [--projects 39] [--objects 5000] [--runs 3]
// Печатает время запросов клиента (страница файлов по проекту, все файлы, все замечания СК) у руководителя, инженера на
// 5 объектах и «своей фирмы»; число строк до = после.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverDb } from '../server/pglite-db.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const N_FILES = arg('--files', 3632), N_SK = arg('--sk', 11900), N_PROJ = arg('--projects', 39), N_OBJ = arg('--objects', 5000), RUNS = arg('--runs', 3);

const db = await serverDb({ upto: '058' });
await db.exec(`
do $$
declare ca uuid := gen_random_uuid(); cont uuid := gen_random_uuid(); p uuid[]; f uuid := gen_random_uuid();
  r_eng uuid; r_ctr uuid; u_adm uuid := gen_random_uuid(); u_eng uuid := gen_random_uuid(); u_ctr uuid := gen_random_uuid();
begin
  perform set_config('perf.ca', ca::text, false);
  insert into core.companies(id, name, is_test) values (ca, 'Замер 059', true);
  insert into core.company_modules(company_id, module, enabled) select ca, m, true from unnest(array['quality', 'construction', 'planfact']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.projects(id, company_id, name, quality_container) values (cont, ca, 'Контейнер', true);
  p := array(select gen_random_uuid() from generate_series(1, ${N_PROJ}));
  insert into core.projects(id, company_id, name) select x, ca, 'ЖК ' || i from unnest(p) with ordinality t(x, i);
  insert into core.counterparties(id, company_id, name, inn, kinds) values (f, ca, 'ООО Фирма', '7700000590', array['contractor']);
  insert into auth.users(id, email) values (u_adm, 'adm@test.invalid'), (u_eng, 'eng@test.invalid'), (u_ctr, 'ctr@test.invalid');
  insert into core.company_members(company_id, user_id) values (ca, u_adm), (ca, u_eng), (ca, u_ctr);
  insert into core.company_roles(company_id, name) values (ca, 'Инженер') returning id into r_eng;
  insert into core.company_role_permissions(role_id, company_id, action)
    select r_eng, ca, action from core.permission_catalog where action like 'quality.%' and action not like 'quality.scope.%' and action not like '%manage';
  insert into core.company_roles(company_id, name) values (ca, 'Подрядчик') returning id into r_ctr;
  insert into core.company_role_permissions(role_id, company_id, action)
    select r_ctr, ca, action from core.permission_catalog where action like 'quality.%.view' or action in ('quality.view', 'quality.scope.contractor');
  insert into core.role_assignments(company_id, user_id, role_id, project_id, counterparty_id)
    select ca, u_adm, id, null::uuid, null::uuid from core.company_roles where company_id = ca and template_code = 'company_admin'
    union all select ca, u_eng, r_eng, x, null::uuid from unnest(p[1:5]) x
    union all select ca, u_ctr, r_ctr, null::uuid, f;
  perform set_config('perf.adm', u_adm::text, false); perform set_config('perf.eng', u_eng::text, false); perform set_config('perf.ctr', u_ctr::text, false);
  perform set_config('perf.code', cont::text, false);
  set local session_replication_role = replica;
  insert into quality.file_registry(id, project_code, entity_type, entity_id, bucket, storage_path, core_company_id, core_project_id, core_id)
    select gen_random_uuid(), cont::text, 'inspection', 'e' || i, 'quality-inspection-photos', ca || '/f' || i, ca, p[1 + i % ${N_PROJ}], gen_random_uuid()
      from generate_series(1, ${N_FILES}) i;
  insert into quality.sk_records(id, project_code, sk_number, sk_unique_key, core_company_id, core_project_id, core_object_id, core_created_by, core_counterparty_id, text)
    select 'sk' || i, cont::text, i::text, 'k' || i, ca, cont, case when i % 10 = 0 then null else p[1 + i % ${N_PROJ}] end, u_adm,
           case when i % 3 = 0 then f end, 'замечание ' || i
      from generate_series(1, ${N_SK}) i;
  -- файлы Storage: одна папка «hashed_assets» компании (как у фото проверок) — список папки = storage.search
  insert into storage.objects(id, bucket_id, name)
    select gen_random_uuid(), 'quality-inspection-photos', ca || '/hashed_assets/photo_' || i || '.jpg' from generate_series(1, ${N_OBJ}) i;
  set local session_replication_role = origin;
end $$;
analyze quality.file_registry; analyze quality.sk_records;`);

const who = { 'руководитель': 'perf.adm', 'инженер на 5 объектах': 'perf.eng', 'своя фирма': 'perf.ctr' };
const queries = {
  'файлы: страница по проекту': `select * from quality.file_registry where project_code = current_setting('perf.code') order by id limit 1000`,
  'файлы: все': `select id from quality.file_registry`,
  'замечания СК: все': `select * from quality.sk_records limit 25000`,
  'замечания СК: число': `select count(*) n from quality.sk_records`,
  'файлы Storage: список папки': `select name from storage.objects where bucket_id = 'quality-inspection-photos'
    and name like current_setting('perf.ca') || '/hashed_assets/%' order by name limit 100`
};
async function measure(label) {
  const out = {};
  for (const [u, key] of Object.entries(who)) {
    for (const [qn, q] of Object.entries(queries)) {
      let best = Infinity, rows = 0;
      for (let i = 0; i < RUNS; i++) {
        await db.exec(`reset role; select set_config('request.jwt.claim.sub', current_setting('${key}'), false),
          set_config('request.jwt.claims', json_build_object('sub', current_setting('${key}'), 'role', 'authenticated')::text, false),
          set_config('request.headers', json_build_object('x-company-id', current_setting('perf.ca'))::text, false); set role authenticated;`);
        const t0 = performance.now();
        const r = await db.query(q);
        best = Math.min(best, performance.now() - t0);
        rows = r.rows.length;
        await db.exec('reset role');
      }
      out[`${u} · ${qn}`] = { ms: Math.round(best), rows };
    }
  }
  console.log(label); for (const [k, v] of Object.entries(out)) console.log(`  ${k}: ${v.ms} мс, строк ${v.rows}`);
  return out;
}
// без правил строк (сервер): сколько стоит сама выдача строк
for (const [qn, q] of Object.entries(queries)) {
  await db.exec(`select set_config('request.headers', json_build_object('x-company-id', current_setting('perf.ca'))::text, false)`);
  let best = Infinity;
  for (let i = 0; i < RUNS; i++) { const t0 = performance.now(); await db.query(q); best = Math.min(best, performance.now() - t0); }
  console.log(`без правил строк · ${qn}: ${Math.round(best)} мс`);
}
const before = await measure(`ДО 059 (файлов ${N_FILES}, замечаний СК ${N_SK}, проектов ${N_PROJ}, лучшее из ${RUNS}):`);
await db.exec(readFileSync(join(ROOT, 'supabase/migrations/059_rls_fast_up.sql'), 'utf8'));
const after = await measure('ПОСЛЕ 059:');
let bad = 0;
console.log('Итог:');
for (const k of Object.keys(before)) {
  const same = before[k].rows === after[k].rows;
  if (!same) bad++;
  console.log(`  ${k}: ${before[k].ms} → ${after[k].ms} мс (×${(before[k].ms / Math.max(after[k].ms, 1)).toFixed(1)}), строк ${before[k].rows} → ${after[k].rows}${same ? '' : ' — РАСХОЖДЕНИЕ'}`);
}
await db.close();
process.exit(bad ? 1 : 0);
