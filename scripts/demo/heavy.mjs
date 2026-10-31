// P2-0053 доработка 2. Тяжёлая учётка стенда, как владелец на боевом: админ платформы и админ своей компании с 20 объектами
// (~6 600 мест), ещё 16 объектов в чужой компании (админ платформы видит их вне демо) и обычный сотрудник с 20 объектами.
// Отдельный модуль: его подключают browser.mjs, tours.mjs и perf-demo.mjs (perf-demo сам импортирует browser.mjs).
const hex = (n) => n.toString(16).padStart(12, '0');

export const HEAVY = { company: '0c000000-0000-4000-8000-0000000000c1', other: '0c000000-0000-4000-8000-0000000000c2',
  user: '0d000000-0000-4000-8000-0000000000c1', email: 'heavy-owner@stand.test.invalid',
  // обычный сотрудник (не админ платформы): руководитель проектов на всю свою компанию — 20 объектов
  staff: '0d000000-0000-4000-8000-0000000000c2', staffEmail: 'heavy-staff@stand.test.invalid' };

/** Тяжёлая учётка: своя компания — 20 объектов по ~330 мест, чужая — 16 объектов; учётка — админ компании и платформы. */
export async function addHeavy(db, { own = 20, other = 16 } = {}) {
  const { company: C, other: O, user: U, email } = HEAVY;
  await db.exec(`insert into auth.users(id, email, email_confirmed_at) values ('${U}', '${email}', now());
    insert into core.companies(id, name, is_test) values ('${C}', 'Тяжёлая (стенд)', true), ('${O}', 'Чужая тяжёлая (стенд)', true);
    insert into core.company_modules(company_id, module, enabled) select c, m, true from unnest(array['${C}', '${O}']::uuid[]) c,
      unnest(array['planfact','quality','construction']) m on conflict (company_id, module) do update set enabled = true;
    insert into core.company_members(company_id, user_id) values ('${C}', '${U}');
    insert into core.role_assignments(company_id, user_id, role_id) select '${C}'::uuid, '${U}'::uuid, id from core.company_roles
      where company_id = '${C}' and template_code = 'company_admin';
    insert into core.platform_admins(user_id) values ('${U}') on conflict do nothing;
    insert into auth.users(id, email, email_confirmed_at) values ('${HEAVY.staff}', '${HEAVY.staffEmail}', now());
    insert into core.company_members(company_id, user_id) values ('${C}', '${HEAVY.staff}');
    insert into core.role_assignments(company_id, user_id, role_id) select '${C}'::uuid, '${HEAVY.staff}'::uuid, id from core.company_roles
      where company_id = '${C}' and template_code = 'project_manager';
    select set_config('request.jwt.claim.sub', '${U}', false);`);
  for (let i = 1; i <= own + other; i++) {
    const comp = i <= own ? C : O, pid = '0a000000-0000-4000-8000-' + hex(0xc000 + i), obj = '0b000000-0000-4000-8000-' + hex(0xc000 + i);
    await db.exec(`select public.pf_save_project('${comp}', '${pid}', '{"name": "Объект ${String(i).padStart(2, '0')}"}');
      select public.pf_save_place('${pid}', '${obj}', null, 'object', 'Корпус', 'building', 'К', null);
      select public.pf_fill_object('${obj}', 3, 12, 8, 1, 'through', 1, false, false);`);
  }
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  return (await db.query(`select count(*)::int n from core.locations l join core.projects p on p.id = l.project_id where p.company_id in ('${C}', '${O}')`)).rows[0].n;
}
