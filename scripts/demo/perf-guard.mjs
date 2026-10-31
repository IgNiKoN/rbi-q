// P2-0053. Замер: не замедляет ли сторож «Демо — только просмотр» (057) запись обычной компании (как РБИ). Две копии схемы
// в PGlite: до 057 (056) и с 057 (+ существующая демо-компания с посетителем). В обеих — компания «РБИ-замер»: импорт ВОР
// (2 000 строк: добавить, разобрать, подтвердить), факт прораба (пачки по 100 позиций), 500 замечаний СК прямой вставкой
// (как телефон). По 3 повтора, медиана, мс. Боевой не используется. P2_PGLITE=… node scripts/demo/perf-guard.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const { serverDb } = await import(pathToFileURL(join(ROOT, 'tests/server/pglite-db.mjs')).href);
const U = '0d000000-0000-4000-8000-0000000000e1', F = '0d000000-0000-4000-8000-0000000000e2', V = '0d000000-0000-4000-8000-0000000000e3';
const C = '0c000000-0000-4000-8000-0000000000e1';

async function as(db, user, company) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false),
    set_config('request.jwt.claims', '${JSON.stringify({ sub: user, role: 'authenticated' })}', false),
    set_config('request.headers', '${company ? JSON.stringify({ 'x-company-id': company }) : '{}'}', false); set role authenticated;`);
}

async function setup(db, withDemo) {
  await db.exec(`insert into auth.users(id, email) values ('${U}', 'perf-admin@test.invalid'), ('${F}', 'perf-foreman@test.invalid'), ('${V}', 'perf-visitor@test.invalid');
    insert into core.companies(id, name, is_test) values ('${C}', 'РБИ-замер', true);
    insert into core.company_modules(company_id, module, enabled) select '${C}', m, true from unnest(array['planfact','quality','construction']) m
      on conflict (company_id, module) do update set enabled = true;
    insert into core.company_members(company_id, user_id) values ('${C}', '${U}'), ('${C}', '${F}');
    insert into core.role_assignments(company_id, user_id, role_id) select '${C}'::uuid, '${U}'::uuid, id from core.company_roles where company_id = '${C}' and template_code = 'company_admin';`);
  if (withDemo) {
    await db.exec(`insert into core.companies(id, name, is_test, is_demo) values ('0c000000-0000-4000-8000-0000000000d1', 'Демо-замер', true, true);`);
  }
  await as(db, U, C);
  const pid = (await db.query(`select public.pf_create_project('${C}', 'Объект замера') id`)).rows[0].id;
  const bld = (await db.query(`select public.pf_add_location($1, null, 'building', 'Корпус 1') id`, [pid])).rows[0].id;
  const floors = [];
  for (let i = 1; i <= 20; i++) floors.push((await db.query(`select public.pf_add_location($1, $2, 'floor', $3) id`, [pid, bld, 'эт. ' + i])).rows[0].id);
  const r = (await db.query(`select id from core.company_roles where company_id = $1 and template_code = 'foreman'`, [C])).rows[0].id;
  await db.query(`select public.pf_set_participation(array[$1::uuid], $2, $3, null, true)`, [F, r, pid]);
  const m2 = (await db.query(`select id from core.units where company_id is null and code = 'м²'`)).rows[0].id;
  const wt = (await db.query(`select public.pf_vor_add_work_type($1, 'Штукатурка', $2) id`, [pid, m2])).rows[0].id;
  const br = (await db.query(`select public.pf_brigade_save($1, null, 'Бригада замера', null, null) id`, [C])).rows[0].id;
  await db.exec('reset role');
  return { pid, floors, m2, wt, br };
}

async function vorImport(db, s, n, k) {
  await as(db, U, C);
  const imp = (await db.query(`select public.pf_vor_create_import($1, $2, $3, 'Лист 1') id`, [s.pid, `вор-${k}.xlsx`, String(k).padStart(64, '0')])).rows[0].id;
  const rows = Array.from({ length: n }, (_, i) => ({ row_no: i + 1, kind: 'work', name: 'Штукатурка ' + i, unit_text: 'м2', qty: 100 }));
  const t0 = performance.now();
  for (let i = 0; i < n; i += 500) await db.query(`select public.pf_vor_add_rows($1, $2::jsonb)`, [imp, JSON.stringify(rows.slice(i, i + 500))]);
  const res = rows.map((r, i) => ({ row_no: r.row_no, location_id: s.floors[i % 20], work_type_id: s.wt, unit_id: s.m2, match: 'green' }));
  for (let i = 0; i < n; i += 1000) await db.query(`select public.pf_vor_resolve_rows($1, $2::jsonb)`, [imp, JSON.stringify(res.slice(i, i + 1000))]);
  await db.query(`select public.pf_vor_confirm($1)`, [imp]);
  const ms = performance.now() - t0;
  await db.exec('reset role');
  return { ms, imp };
}

async function facts(db, imp, s) {
  const pos = (await db.query(`select id from planfact.vor_positions where import_id = $1 limit 500`, [imp])).rows.map((x) => x.id);
  await as(db, F, C);
  const br = s.br;
  const t0 = performance.now();
  for (let i = 0; i < pos.length; i += 100) {
    await db.query(`select public.pf_fact_add_batch((select project_id from planfact.vor_positions where id = $1), $2, current_date, $3::jsonb, 3, null, false)`,
      [pos[i], br, JSON.stringify(pos.slice(i, i + 100).map((p) => ({ position_id: p, qty: 1 })))]);
  }
  const ms = performance.now() - t0;
  await db.exec('reset role');
  return ms;
}

async function defects(db, s) {
  await as(db, U, C);
  const t0 = performance.now();
  for (let i = 0; i < 500; i += 50) {
    const vals = Array.from({ length: 50 }, (_, j) => `('${crypto.randomUUID()}', '${s.floors[(i + j) % 20]}', 'Замечание ${i + j}', 'open')`).join(',');
    await db.exec(`insert into quality.construction_defects_v2 (id, "locationId", text, status) values ${vals}`);
  }
  const ms = performance.now() - t0;
  await db.exec('reset role');
  return ms;
}

const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const out = {};
for (const [label, upto, demo] of [['до 057', '056', false], ['с 057', null, true]]) {
  const res = { vor: [], fact: [], defects: [] };
  for (let k = 0; k < 3; k++) {
    const db = await serverDb(upto ? { upto } : {});
    const s = await setup(db, demo);
    const v = await vorImport(db, s, 2000, k + 1);
    res.vor.push(v.ms);
    res.fact.push(await facts(db, v.imp, s));
    res.defects.push(await defects(db, s));
    await db.close();
  }
  out[label] = { 'импорт ВОР 2 000 строк': Math.round(med(res.vor)), 'факт 500 позиций (5 пачек)': Math.round(med(res.fact)), '500 замечаний СК': Math.round(med(res.defects)) };
}
console.log(JSON.stringify(out, null, 1));
for (const k of Object.keys(out['до 057'])) {
  const a = out['до 057'][k], b = out['с 057'][k];
  console.log(`${k}: ${a} → ${b} мс (${b >= a ? '+' : ''}${Math.round(((b - a) / a) * 100)} %)`);
}
