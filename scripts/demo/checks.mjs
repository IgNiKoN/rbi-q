// P2-0053. Проверки засева «ЖК Демо» по базе стенда (числа — из data/demo.json): места, виды работ, планы, демо-роли.
import { DATA } from './accounts.mjs';

export async function checkSeed(db, apiUrl, summary) {
  const out = [];
  const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
  const c = await one(`select id from core.companies where is_demo`);
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
  const size = await fetch(`${apiUrl}/rest/v1/rpc/pf_demo_roles`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  out.push([size.status !== 200 || (await size.json()).length === 0, `аноним: роли демо — отказ (${size.status})`]);
  return out;
}
