// P2-0053. Проверки засева «ЖК Демо» по стенду (числа — из data/demo.json и сводки засева): места, виды работ, планы,
// демо-роли; сводка и КС-2 сходятся с фактом засева; посетитель кнопки «Демо» видит данные глазами роли и не может писать.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { DATA, emailOf } from './accounts.mjs';

const require = createRequire(import.meta.url);
const near = (a, b, eps = 1) => Math.abs(Number(a) - Number(b)) <= eps;

export function standClient(apiUrl, headers = {}) {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(apiUrl, 'stand', { auth: { persistSession: false, autoRefreshToken: false }, global: { headers } });
}

export async function checkSeed(db, apiUrl, summary) {
  const out = [];
  const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
  const c = await one(`select id from core.companies where is_demo`);
  const pid = (await one(`select id from core.projects where company_id = $1 and name = $2`, [c.id, DATA.project.name])).id;
  const places = Number((await one(`select count(*) n from core.locations l join core.projects p on p.id = l.project_id where p.company_id = $1 and l.deleted_at is null`, [c.id])).n);
  out.push([places >= 200 && places <= 250, `мест ≈ 200–250: ${places}`]);
  const objs = (await db.query(`select l.name from core.locations l join core.projects p on p.id = l.project_id where p.company_id = $1 and l.node_type = 'object' order by l.name`, [c.id])).rows.map((x) => x.name);
  out.push([objs.join(',') === 'Корпус 1,Корпус 2,Корпус 3,Паркинг', 'три корпуса и паркинг: ' + objs.join(', ')]);
  const wt = Number((await one(`select count(*) n from core.work_types where company_id = $1 and deleted_at is null`, [c.id])).n);
  out.push([wt === DATA.work_types.length, `видов работ ${wt} = ${DATA.work_types.length}`]);
  const plans = Number((await one(`select count(*) n from core.place_documents where company_id = $1 and is_current and deleted_at is null`, [c.id])).n);
  out.push([plans === DATA.plans.length, `PDF-планов этажей ${plans} = ${DATA.plans.length}`]);
  const roles = Number((await one(`select count(*) n from core.demo_roles where company_id = $1 and deleted_at is null`, [c.id])).n);
  out.push([roles === 8, `демо-ролей ${roles} = 8`]);
  const anon = await fetch(`${apiUrl}/rest/v1/rpc/pf_demo_roles`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  out.push([anon.status !== 200 || (await anon.json()).length === 0, `аноним: роли демо — отказ (${anon.status})`]);

  if (summary && summary.planfact && summary.planfact.vorRows) {
    const pm = standClient(apiUrl);
    await pm.auth.signInWithPassword({ email: emailOf('pm'), password: 'stand' });
    const acts = (await pm.rpc('pf_ks2_acts', { p_project: pid })).data || [];
    const issued = acts.filter((a) => a.status === 'issued').length;
    const sum = acts.reduce((s, a) => s + Number(a.total || 0), 0);
    out.push([acts.length === DATA.ks2.length && issued === DATA.ks2.filter((a) => a.issue).length, `КС-2: актов ${acts.length}, выдано ${issued}`]);
    const last = acts.find((a) => a.act_no === DATA.ks2[DATA.ks2.length - 1].no);
    out.push([last && String(last.period_to).slice(0, 10) === summary.today, `даты от --today: КС-2 №${last && last.act_no} по ${last && String(last.period_to).slice(0, 10)} = ${summary.today}`]);
    out.push([near(sum, summary.planfact.expectedDone), `КС-2 за все периоды = деньги факта засева: ${sum.toFixed(2)} ≈ ${summary.planfact.expectedDone}`]);
    const sp = (await pm.rpc('pf_summary_places', { p_project: pid, p_location: null })).data || [];
    const byName = Object.fromEntries(sp.map((x) => [x.name, x]));
    out.push([Number(byName['Корпус 1'].done_money) === 0, `сводка: Корпус 1 — старт, факта нет (${byName['Корпус 1'].pct_money}%)`]);
    out.push([near(byName['Корпус 2'].done_money, summary.planfact.doneByObject.k2) && Number(byName['Корпус 2'].pct_money) > 20 && Number(byName['Корпус 2'].pct_money) < 80,
      `сводка: Корпус 2 — в разгаре ${byName['Корпус 2'].pct_money}% (${byName['Корпус 2'].done_money} ≈ ${summary.planfact.doneByObject.k2})`]);
    out.push([Number(byName['Корпус 3'].pct_money) === 100, `сводка: Корпус 3 — сдача ${byName['Корпус 3'].pct_money}%`]);
    await pm.auth.signOut();
  }
  return out;
}

/** Посетитель (вошёл в демо ролью) глазами роли: что видит и что не может. */
export async function checkVisitor(db, apiUrl, email, role) {
  const out = [];
  const demo = (await db.query(`select id from core.companies where is_demo`)).rows[0].id;
  const pid = (await db.query(`select id from core.projects where company_id = $1 and name = $2`, [demo, DATA.project.name])).rows[0].id;
  const v = standClient(apiUrl, { 'x-company-id': demo });
  await v.auth.signInWithPassword({ email, password: 'stand' });
  const entered = await v.rpc('pf_demo_enter', { p_role: role });
  out.push([!entered.error && entered.data.role === role, `посетитель вошёл ролью «${role}»`]);
  const pos = (await v.rpc('pf_vor_positions', { p_project: pid, p_location: null })).data || [];
  const defects = (await v.schema('quality').from('construction_defects_v2').select('id,core_counterparty_id')).data || [];
  const insp = (await v.schema('quality').from('rbi_inspections').select('id')).data || [];
  if (role === 'foreman') {
    out.push([pos.length > 0 && pos.every((p) => /Корпус 2.*Секция 1/.test(p.location_path)), `прораб видит только свой участок: позиций ${pos.length} (Корпус 2, секция 1)`]);
    const w = await v.rpc('pf_fact_add_batch', { p_project: pid, p_brigade: null, p_date: new Date().toISOString().slice(0, 10), p_items: [{ position_id: pos[0] && pos[0].id, qty: 1 }],
      p_workers: 1, p_note: null, p_require_approval: false });
    out.push([!!w.error, `прораб-посетитель вносит факт — отказ (${w.error ? w.error.message : 'ПРОШЛО'})`]);
  }
  if (role === 'qc_engineer') {
    out.push([insp.length === 10 && defects.length === 30, `инженер качества видит проверки ${insp.length} и замечания ${defects.length}`]);
    const w = await v.schema('quality').from('construction_defects_v2').insert({ id: randomUUID(), locationId: pos[0] && pos[0].location_id, text: 'попытка', status: 'open' });
    out.push([!!w.error, `инженер-посетитель выдаёт замечание — отказ (${w.error ? w.error.message.slice(0, 80) : 'ПРОШЛО'})`]);
  }
  if (role === 'contractor_rep') {
    const own = (await db.query(`select id from core.counterparties where company_id = $1 and name = 'ООО «Отделка Демо»'`, [demo])).rows[0].id;
    out.push([defects.length > 0 && defects.every((d) => d.core_counterparty_id === own), `подрядчик видит только свою фирму: замечаний ${defects.length}`]);
    const acts = await v.rpc('pf_ks2_acts', { p_project: pid });
    out.push([!acts.data || acts.data.length === 0, `подрядчик не видит КС-2 (${acts.error ? 'отказ' : (acts.data || []).length})`]);
  }
  if (role === 'pto') {
    const est = (await v.rpc('pf_estimate_list', { p_project: pid })).data || [];
    out.push([est.length === 1, `ПТО видит смету: ${est.length}`]);
    const w = await v.rpc('pf_estimate_update', { p_estimate: est[0] && est[0].id, p_name: 'взлом', p_area: 1 });
    out.push([!!w.error && /Демо — только просмотр/.test(w.error.message), `ПТО-посетитель правит смету — «${w.error ? w.error.message : 'ПРОШЛО'}»`]);
  }
  await v.auth.signOut();
  return out;
}
