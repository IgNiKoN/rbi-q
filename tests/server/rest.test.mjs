// P2-0004: проверка через настоящий REST/Auth сервера. Читает .env.local; без него — SKIP (не PASS).
import { readFileSync, existsSync } from 'node:fs';
const envFile = new URL('../../.env.local', import.meta.url);
if (!existsSync(envFile)) { console.log('SKIP: нет .env.local (NOT RUN)'); process.exit(0); }
const env = Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const URL_ = env.P2_SUPABASE_URL, ANON = env.P2_SUPABASE_ANON_KEY;
// P2-0016: сеть до сервера иногда не устанавливает соединение (тайм-аут подключения) — повтор только в этом случае:
// запрос до сервера не дошёл, повтор безопасен. Остальные ошибки — как есть.
{ const f0 = globalThis.fetch; globalThis.fetch = async (...a) => { for (let i = 0; ; i++) { try { return await f0(...a); }
  catch (e) { if (i < 5 && ['UND_ERR_CONNECT_TIMEOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(e?.cause?.code)) { await new Promise((r) => setTimeout(r, 1000)); continue; } throw e; } } }; }
let fails = 0;
const REST_PROJECT = 'REST-автопроверки';   // P2-0011: единственный объект автопроверок в «Альфе» (не архивируется; уборка — scripts/cleanup-test-projects.sql)
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const rpc = (fn, body, token) => fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token || ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
async function login(email, password) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return { status: r.status, json: await r.json() };
}
const users = { alfaAdmin: ['alfa-admin@test.invalid', env.P2_TEST_ALFA_ADMIN_PASSWORD], alfaPto: ['alfa-pto@test.invalid', env.P2_TEST_ALFA_PTO_PASSWORD],
  alfaForeman: ['alfa-foreman@test.invalid', env.P2_TEST_ALFA_FOREMAN_PASSWORD], betaPto: ['beta-pto@test.invalid', env.P2_TEST_BETA_PTO_PASSWORD] };
const tok = {};
for (const [k, [e, p]] of Object.entries(users)) { const r = await login(e, p); tok[k] = r.json.access_token; check(`вход ${e}`, r.status === 200 && !!tok[k]); }
const bad = await login('alfa-pto@test.invalid', 'wrong-password-123');
check('неверный пароль отклонён', bad.status === 400 && !bad.json.access_token, `статус ${bad.status}`);
const an = await rpc('pf_my_projects', {}); check('anon не вызывает pf_my_projects', an.status === 401 || an.status === 403, `статус ${an.status}`);
const projs = {};
for (const k of Object.keys(tok)) { const r = await rpc('pf_my_projects', {}, tok[k]); projs[k] = r.ok ? await r.json() : []; }
check('Альфа-ПТО видит 1 проект Альфы', projs.alfaPto.length === 1 && projs.alfaPto[0].name.startsWith('Альфа'));
check('Бета-ПТО видит 1 проект Беты', projs.betaPto.length === 1 && projs.betaPto[0].name.startsWith('Бета'));
const pA = projs.alfaPto[0]?.id, pB = projs.betaPto[0]?.id;
const wl = async (k, p) => (await (await rpc('pf_list_works', { p_project: p }, tok[k])).json());
check('Альфа-ПТО видит 2 работы Альфы', (await wl('alfaPto', pA)).length >= 2);
check('Альфа-ПТО не видит работ Беты', (await wl('alfaPto', pB)).length === 0);
check('Бета-ПТО не видит работ Альфы', (await wl('betaPto', pA)).length === 0);
const perms = async (k, p) => (await (await rpc('pf_my_permissions', { p_project: p }, tok[k])).json());
const fp = await perms('alfaForeman', pA);
check('прораб: нет works.edit и money.view, есть fact.create', !fp.includes('planfact.works.edit') && !fp.includes('planfact.money.view') && fp.includes('planfact.fact.create'));
check('ПТО: есть works.edit', (await perms('alfaPto', pA)).includes('planfact.works.edit'));
const ctxOf = async (k) => (await (await rpc('pf_my_context', {}, tok[k])).json());
const cp = await ctxOf('alfaPto'), cf = await ctxOf('alfaForeman'), cb = await ctxOf('betaPto');
check('шапка: ПТО Альфы = Альфа · Инженер ПТО', cp.length === 1 && cp[0].company_name === 'Альфа' && cp[0].role_name === 'Инженер ПТО');
check('шапка: прораб = Альфа · Прораб / мастер', cf.length === 1 && cf[0].role_name === 'Прораб / мастер');
check('шапка: ПТО Беты видит только Бету', cb.length === 1 && cb[0].company_name === 'Бета');
const anCtx = await rpc('pf_my_context', {}); check('anon не вызывает pf_my_context', anCtx.status === 401 || anCtx.status === 403);
const fAdd = await rpc('pf_add_work', { p_project: pA, p_name: 'ВЗЛОМ-ПРОРАБ' }, tok.alfaForeman);
check('прораб: pf_add_work отклонён', !fAdd.ok, `статус ${fAdd.status}`);
const cross = await rpc('pf_add_work', { p_project: pB, p_name: 'ВЗЛОМ-ЧУЖОЙ' }, tok.alfaPto);
check('ПТО Альфы: добавление в проект Беты отклонено', !cross.ok, `статус ${cross.status}`);
const direct = await fetch(`${URL_}/rest/v1/works`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${tok.alfaPto}`, 'Content-Type': 'application/json', 'Accept-Profile': 'planfact', 'Content-Profile': 'planfact' }, body: '{}' });
check('схема planfact не открыта через REST напрямую', !direct.ok, `статус ${direct.status}`);
// --- этап 4: суммы, журнал, добавление ---
const stamp = 'REST-тест ' + new Date().toISOString();
const addOk = await rpc('pf_add_work', { p_project: pA, p_name: stamp, p_unit: 'шт', p_plan_qty: 1 }, tok.alfaPto);
check('ПТО добавил работу через pf_add_work', addOk.ok, `статус ${addOk.status}`);
const wPto = await wl('alfaPto', pA), wFor = await wl('alfaForeman', pA), wAdm = await wl('alfaAdmin', pA);
check('новая работа видна в списке ПТО', wPto.some((w) => w.name === stamp));
check('ПТО видит суммы (есть money.view)', wPto.some((w) => w.plan_amount !== null));
check('прораб не видит ни одной суммы', wFor.length > 0 && wFor.every((w) => w.plan_amount === null));
check('администратор не видит ни одной суммы', wAdm.length > 0 && wAdm.every((w) => w.plan_amount === null));
const aud = async (k, p) => (await (await rpc('pf_list_audit', { p_project: p }, tok[k])).json());
const audAdm = await aud('alfaAdmin', pA);
check('админ видит в журнале запись: кто=alfa-pto, что=INSERT', audAdm.some((r) => r.actor_email === 'alfa-pto@test.invalid' && r.action === 'INSERT' && r.new_data?.name === stamp));
check('в журнале у админа нет сумм', audAdm.every((r) => !r.new_data || !('plan_amount' in r.new_data)));
check('ПТО не видит журнал', (await aud('alfaPto', pA)).length === 0);
check('прораб не видит журнал', (await aud('alfaForeman', pA)).length === 0);
check('ПТО Беты не видит журнал Альфы', (await aud('betaPto', pA)).length === 0);
const tamper = await fetch(`${URL_}/rest/v1/audit_log`, { method: 'DELETE', headers: { apikey: ANON, Authorization: `Bearer ${tok.alfaAdmin}`, 'Content-Profile': 'planfact' } });
check('журнал не удалить через REST', !tamper.ok, `статус ${tamper.status}`);
// --- P2-0004b: конструктор ролей (миграция 005) ---
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const probe = await rpc('pf_my_admin_companies', {}, tok.alfaAdmin);
if (probe.status === 404) { console.log('NOT RUN: миграция 005 не применена — проверки конструктора ролей пропущены'); fails++; }
else {
  const adm = await j(probe);
  check('админ Альфы управляет 1 компанией (Альфа)', Array.isArray(adm) && adm.length === 1 && adm[0].company_name === 'Альфа');
  const cA = adm[0]?.company_id;
  check('ПТО: раздел «Компания» недоступен', (await j(await rpc('pf_my_admin_companies', {}, tok.alfaPto))).length === 0);
  check('ПТО: список ролей отклонён', !(await rpc('pf_list_company_roles', { p_company: cA }, tok.alfaPto)).ok);
  check('anon: каталог действий закрыт', !(await rpc('pf_permission_catalog', {})).ok);
  const roles = await j(await rpc('pf_list_company_roles', { p_company: cA }, tok.alfaAdmin));
  const tplFor = roles.find((r) => r.template_code === 'foreman');
  check('админ видит 9+ ролей, есть шаблон «Прораб / мастер»', roles.length >= 9 && !!tplFor);
  check('шаблон не переименовать', !(await rpc('pf_rename_role', { p_role: tplFor.id, p_name: 'взлом' }, tok.alfaAdmin)).ok);
  const roleName = 'REST-роль ' + new Date().toISOString();
  const cr = await rpc('pf_create_role', { p_source_role: tplFor.id, p_name: roleName }, tok.alfaAdmin);
  const newRole = await j(cr);
  check('копия шаблона создана', cr.ok && typeof newRole === 'string', `статус ${cr.status}`);
  let asg = null;
  try {
    const sa = await rpc('pf_set_role_actions', { p_role: newRole, p_actions: [...tplFor.actions, 'planfact.works.edit'] }, tok.alfaAdmin);
    check('админ отметил «Добавление и правка работ»', sa.ok, `статус ${sa.status}`);
    check('неизвестное действие отклонено', !(await rpc('pf_set_role_actions', { p_role: newRole, p_actions: ['planfact.no.such'] }, tok.alfaAdmin)).ok);
    check('ПТО Беты не меняет роль Альфы', !(await rpc('pf_rename_role', { p_role: newRole, p_name: 'взлом' }, tok.betaPto)).ok);
    const members = await j(await rpc('pf_list_company_members', { p_company: cA }, tok.alfaAdmin));
    const fUser = members.find((m) => m.email === 'alfa-foreman@test.invalid')?.user_id;
    const aUser = members.find((m) => m.email === 'alfa-admin@test.invalid')?.user_id;
    check('в «Сотрудниках» есть alfa-foreman', !!fUser);
    check('самоназначение отклонено', !(await rpc('pf_assign_role', { p_user: aUser, p_role: newRole, p_project: pA }, tok.alfaAdmin)).ok);
    const ar = await rpc('pf_assign_role', { p_user: fUser, p_role: newRole, p_project: pA }, tok.alfaAdmin);
    asg = await j(ar);
    check('роль назначена прорабу на проект', ar.ok, `статус ${ar.status}`);
    check('прораб сразу получил works.edit (без повторного входа)', (await perms('alfaForeman', pA)).includes('planfact.works.edit'));
    check('прораб добавил работу', (await rpc('pf_add_work', { p_project: pA, p_name: 'REST-прораб ' + roleName }, tok.alfaForeman)).ok);
    check('роль с назначением не удалить', !(await rpc('pf_delete_role', { p_role: newRole }, tok.alfaAdmin)).ok);
    const rv = await rpc('pf_revoke_assignment', { p_assignment: asg }, tok.alfaAdmin); asg = rv.ok ? null : asg;
    check('назначение отозвано', rv.ok, `статус ${rv.status}`);
    check('после отзыва works.edit нет', !(await perms('alfaForeman', pA)).includes('planfact.works.edit'));
    check('после отзыва добавление отклонено сервером', !(await rpc('pf_add_work', { p_project: pA, p_name: 'ВЗЛОМ-после-отзыва' }, tok.alfaForeman)).ok);
  } finally {
    if (asg) await rpc('pf_revoke_assignment', { p_assignment: asg }, tok.alfaAdmin);
    check('роль удалена', (await rpc('pf_delete_role', { p_role: newRole }, tok.alfaAdmin)).ok);
  }
  const ca = await j(await rpc('pf_list_company_audit', { p_company: cA, p_limit: 20 }, tok.alfaAdmin));
  check('журнал: создание роли — автор alfa-admin', ca.some((r) => r.action === 'ROLE_CREATE' && r.actor_email === 'alfa-admin@test.invalid' && r.new_data?.name === roleName));
  check('журнал: назначение и отзыв для alfa-foreman', ['ASSIGN', 'REVOKE'].every((a) => ca.some((r) => r.action === a && r.subject_email === 'alfa-foreman@test.invalid')));
  check('журнал проекта «План/Факт» — только работы (без назначений)', (await aud('alfaAdmin', pA)).every((r) => ['INSERT', 'UPDATE', 'DELETE'].includes(r.action)));
  check('ПТО не читает журнал компании', !(await rpc('pf_list_company_audit', { p_company: cA }, tok.alfaPto)).ok);
}
// --- P2-0005: проекты, локации, единицы (миграция 006) ---
const acc = await rpc('pf_my_company_access', {}, tok.alfaAdmin);
if (acc.status === 404) { console.log('NOT RUN: миграция 006 не применена — проверки проектов/локаций/единиц пропущены'); fails++; }
else {
  const accA = await j(acc);
  check('админ Альфы: доступ к проектам, единицам и ролям', accA.length === 1 && accA[0].can_manage_projects && accA[0].can_manage_units && accA[0].can_manage_roles);
  const cA5 = accA[0]?.company_id;
  const accF = await j(await rpc('pf_my_company_access', {}, tok.alfaForeman));
  check('прораб: доступ есть, права править нет', accF.length === 1 && !accF[0].can_manage_projects && !accF[0].can_manage_units);
  const accB = await j(await rpc('pf_my_company_access', {}, tok.betaPto));
  check('Бета-ПТО видит только свою компанию', accB.length === 1 && accB[0].company_name === 'Бета');
  check('anon: pf_my_company_access закрыт', !(await rpc('pf_my_company_access', {})).ok);
  // P2-0011: один постоянный объект автопроверок на компанию (создаётся при первом прогоне, дальше переиспользуется) — список объектов
  // «Альфы» не растёт. Данные прогона помечены меткой времени (виды работ, сметы, бригады, номера актов) и сверяются только по этому прогону.
  let pid = null, bld5 = null, unitId = null;
  try {
    check('прораб: создать проект нельзя', !(await rpc('pf_create_project', { p_company: cA5, p_name: 'ВЗЛОМ-прораб' }, tok.alfaForeman)).ok);
    check('Бета-ПТО: создать проект в Альфе нельзя', !(await rpc('pf_create_project', { p_company: cA5, p_name: 'ВЗЛОМ-бета' }, tok.betaPto)).ok);
    const before = await j(await rpc('pf_company_projects', { p_company: cA5 }, tok.alfaAdmin));
    pid = before.find((x) => x.name === REST_PROJECT && !x.archived_at)?.id ?? null;
    if (!pid) {
      const cp5 = await rpc('pf_create_project', { p_company: cA5, p_name: REST_PROJECT, p_code: 'REST' }, tok.alfaAdmin);
      pid = await j(cp5);
      check('админ создал постоянный объект автопроверок', cp5.ok && typeof pid === 'string', `статус ${cp5.status}`);
    }
    check('админ правит объект (журнал «projects»)', (await rpc('pf_update_project', { p_project: pid, p_name: REST_PROJECT, p_code: 'REST', p_archived: false }, tok.alfaAdmin)).ok);
    const pl = await j(await rpc('pf_company_projects', { p_company: cA5 }, tok.alfaAdmin));
    check('объект в списке, can_manage = true', pl.some((x) => x.id === pid && x.name === REST_PROJECT && x.can_manage));
    check('прогон не добавил объектов в компанию', pl.length === before.length + (before.some((x) => x.id === pid) ? 0 : 1), `${before.length} → ${pl.length}`);
    check('Бета-ПТО не видит проектов Альфы', (await j(await rpc('pf_company_projects', { p_company: cA5 }, tok.betaPto))).length === 0);
    // остаток упавшего прогона: корпус генератора удаляем, чтобы повторная генерация не упала на дубле имени
    const left = (await j(await rpc('pf_list_locations', { p_project: pid, p_parent: null }, tok.alfaAdmin))).find((x) => x.name === 'Корпус REST');
    if (left) await rpc('pf_delete_location', { p_location: left.id, p_cascade: true }, tok.alfaAdmin);
    const gb = await rpc('pf_generate_building', { p_project: pid, p_parent: null, p_name: 'Корпус REST', p_sections: 2, p_floors: 5, p_apartments_per_floor: 4, p_first_floor: 1 }, tok.alfaAdmin);
    bld5 = await j(gb);
    check('генератор 2×5×4 выполнен', gb.ok && typeof bld5 === 'string', `статус ${gb.status}`);
    const lst = async (k, parent) => j(await rpc('pf_list_locations', { p_project: pid, p_parent: parent }, tok[k]));
    const secs = await lst('alfaAdmin', bld5);
    check('в корпусе 2 секции', Array.isArray(secs) && secs.length === 2);
    const fls = await lst('alfaAdmin', secs[1].id);
    check('в секции 5 этажей', fls.length === 5);
    const aps = await lst('alfaAdmin', fls[0].id);
    check('на этаже 4 квартиры, сквозная нумерация: секция 2, эт. 1 → кв. 21', aps.length === 4 && aps[0].name === 'кв. 21');
    check('путь квартиры строкой', aps[0].path === 'Корпус REST · Секция 2 · эт. 1 · кв. 21', aps[0].path);
    check('Бета-ПТО не читает дерево проекта Альфы', !(await rpc('pf_list_locations', { p_project: pid, p_parent: null }, tok.betaPto)).ok);
    check('Бета-ПТО не добавляет узел в Альфу', !(await rpc('pf_add_location', { p_project: pid, p_parent: null, p_type: 'other', p_name: 'ВЗЛОМ' }, tok.betaPto)).ok);
    check('прораб не добавляет узел', !(await rpc('pf_add_location', { p_project: pid, p_parent: null, p_type: 'other', p_name: 'ВЗЛОМ' }, tok.alfaForeman)).ok);
    check('дубль имени на уровне отклонён', !(await rpc('pf_add_location', { p_project: pid, p_parent: null, p_type: 'building', p_name: 'корпус  rest' }, tok.alfaAdmin)).ok);
    check('> 5000 узлов отклонено', !(await rpc('pf_generate_building', { p_project: pid, p_parent: null, p_name: 'Огромный', p_sections: 10, p_floors: 100, p_apartments_per_floor: 10, p_first_floor: 1 }, tok.alfaAdmin)).ok);
    const un = await j(await rpc('pf_list_units', { p_company: cA5 }, tok.alfaAdmin));
    check('общих единиц ≥ 9 (м², м³, м.п., шт. …)', un.filter((u) => u.is_common).length >= 9 && ['м²', 'м.п.', 'шт.'].every((c) => un.some((u) => u.code === c)));
    const common = un.find((u) => u.is_common);
    check('общую единицу удалить нельзя', !(await rpc('pf_delete_unit', { p_unit: common.id }, tok.alfaAdmin)).ok);
    const unitCode = 'rest' + Date.now();
    const au = await rpc('pf_add_unit', { p_company: cA5, p_code: unitCode, p_name: 'REST единица' }, tok.alfaAdmin);
    unitId = await j(au);
    check('админ добавил свою единицу', au.ok && typeof unitId === 'string', `статус ${au.status}`);
    check('дубль единицы отклонён', !(await rpc('pf_add_unit', { p_company: cA5, p_code: unitCode.toUpperCase(), p_name: 'дубль' }, tok.alfaAdmin)).ok);
    check('прораб не добавляет единицу', !(await rpc('pf_add_unit', { p_company: cA5, p_code: 'взлом', p_name: 'взлом' }, tok.alfaForeman)).ok);
    check('прораб видит свою единицу компании (только чтение)', (await j(await rpc('pf_list_units', { p_company: cA5 }, tok.alfaForeman))).some((u) => u.code === unitCode));
    check('Бета не читает единицы Альфы', !(await rpc('pf_list_units', { p_company: cA5 }, tok.betaPto)).ok);
    const cbId = accB[0]?.company_id;
    check('Бета не видит своих единиц Альфы в своём списке', !(await j(await rpc('pf_list_units', { p_company: cbId }, tok.betaPto))).some((u) => u.code === unitCode));
    const aud5 = await j(await rpc('pf_list_company_audit', { p_company: cA5, p_limit: 50 }, tok.alfaAdmin));
    check('журнал компании: проект, локации, единицы', ['projects', 'locations', 'units'].every((t) => aud5.some((r) => r.table_name === t)));
  } finally {
    if (bld5) check('ветка корпуса удалена (53 узла)', (await j(await rpc('pf_delete_location', { p_location: bld5, p_cascade: true }, tok.alfaAdmin))) === 53);
    if (unitId) check('своя единица удалена', (await rpc('pf_delete_unit', { p_unit: unitId }, tok.alfaAdmin)).ok);
  }
}
// --- P2-0006: ВОР (миграция 007) — права, изоляция компаний, подтверждение, неизменяемость. Данные помечены «REST-ВОР …». ---
const vorProbe = await rpc('pf_vor_list_imports', { p_project: pA }, tok.alfaPto);
if (vorProbe.status === 404) { console.log('NOT RUN: миграция 007 не применена — проверки ВОР пропущены'); fails++; }
else {
  check('ПТО читает загрузки ВОР своего проекта', vorProbe.ok, `статус ${vorProbe.status}`);
  const accV = await j(await rpc('pf_my_company_access', {}, tok.alfaAdmin));
  const cV = accV[0]?.company_id;
  const stampV = 'REST-ВОР ' + new Date().toISOString();
  let pv = null, imp = null; const asgV = [];
  const actNo = (n) => 'R' + Date.now().toString(36) + '-' + n;   // номера актов прогона — свои: черновики прошлых прогонов не мешают
  try {
    pv = (await j(await rpc('pf_company_projects', { p_company: cV }, tok.alfaAdmin))).find((x) => x.name === REST_PROJECT && !x.archived_at)?.id ?? null;
    check('постоянный объект автопроверок найден', typeof pv === 'string');
    const roots = await j(await rpc('pf_list_locations', { p_project: pv, p_parent: null }, tok.alfaAdmin));
    const sec = roots.find((x) => x.name === 'Секция 1')?.id
      ?? await j(await rpc('pf_add_location', { p_project: pv, p_parent: null, p_type: 'section', p_name: 'Секция 1' }, tok.alfaAdmin));
    // Тестовые ПТО и прораб назначены на основной проект Альфы — на время теста назначаем их и на объект автопроверок (в конце — отзыв).
    const rolesV = await j(await rpc('pf_list_company_roles', { p_company: cV }, tok.alfaAdmin));
    const membersV = await j(await rpc('pf_list_company_members', { p_company: cV }, tok.alfaAdmin));
    for (const [email, tpl] of [['alfa-pto@test.invalid', 'pto'], ['alfa-foreman@test.invalid', 'foreman']]) {
      const u = membersV.find((m) => m.email === email)?.user_id, r = rolesV.find((x) => x.template_code === tpl)?.id;
      const a = await rpc('pf_assign_role', { p_user: u, p_role: r, p_project: pv }, tok.alfaAdmin);
      check(`назначение ${tpl} на объект автопроверок`, a.ok, `статус ${a.status}`);
      if (a.ok) asgV.push(await j(a));
    }
    check('ПТО: право planfact.vor.manage в проекте', (await perms('alfaPto', pv)).includes('planfact.vor.manage'));
    check('прораб: права planfact.vor.manage нет', !(await perms('alfaForeman', pv)).includes('planfact.vor.manage'));
    const sha = 'e'.repeat(64);
    check('прораб не создаёт загрузку', !(await rpc('pf_vor_create_import', { p_project: pv, p_file_name: 'x.xlsx', p_sha256: sha, p_sheet: 'Лист' }, tok.alfaForeman)).ok);
    check('Бета-ПТО не создаёт загрузку в проекте Альфы', !(await rpc('pf_vor_create_import', { p_project: pv, p_file_name: 'x.xlsx', p_sha256: sha, p_sheet: 'Лист' }, tok.betaPto)).ok);
    const ci = await rpc('pf_vor_create_import', { p_project: pv, p_file_name: stampV + '.xlsx', p_sha256: sha, p_sheet: 'ФКП', p_profile: null, p_totals: {} }, tok.alfaPto);
    imp = await j(ci);
    check('ПТО создал черновик загрузки', ci.ok && typeof imp === 'string', `статус ${ci.status}`);
    const rowsV = [
      { row_no: 10, kind: 'context', name: 'Секция 1', context: { section: '1' } },
      { row_no: 11, kind: 'work', name: stampV + ' устройство пола', unit_text: 'м2', qty: 399.89, context: { section: '1', apartments: 'кв. 3, 16' } },
      { row_no: 12, kind: 'material', name: stampV + ' смесь', unit_text: 'кг', qty: 75, norm: 7.5, parent_row_no: 11, context: { section: '1' } }];
    const big = Array.from({ length: 900 }, (_, i) => ({ row_no: 100 + i, kind: i % 2 ? 'material' : 'work', name: 'Строка ' + i, unit_text: 'м2', qty: i, parent_row_no: i % 2 ? 99 + i : null, context: {} }));
    const ar = await rpc('pf_vor_add_rows', { p_import: imp, p_rows: rowsV }, tok.alfaPto);
    check('строки сохранены', ar.ok && (await j(ar)) === 3, `статус ${ar.status}`);
    const imp2 = await j(await rpc('pf_vor_create_import', { p_project: pv, p_file_name: 'большой.xlsx', p_sha256: sha, p_sheet: 'Лист' }, tok.alfaPto));
    const tb = Date.now();
    const br = await rpc('pf_vor_add_rows', { p_import: imp2, p_rows: big }, tok.alfaPto);
    const msBig = Date.now() - tb;
    check('900 строк одной порцией < 10 с', br.ok && msBig < 10000, `${msBig} мс, статус ${br.status}`);
    check('черновик удалён', (await rpc('pf_vor_delete_import', { p_import: imp2 }, tok.alfaPto)).ok);
    check('прораб читает строки', (await j(await rpc('pf_vor_import_rows', { p_import: imp }, tok.alfaForeman))).length === 3);
    check('Бета-ПТО не читает строки Альфы', !(await rpc('pf_vor_import_rows', { p_import: imp }, tok.betaPto)).ok);
    check('Бета-ПТО не читает загрузки Альфы', !(await rpc('pf_vor_list_imports', { p_project: pv }, tok.betaPto)).ok);
    check('Бета-ПТО не пишет строки в загрузку Альфы', !(await rpc('pf_vor_add_rows', { p_import: imp, p_rows: [{ row_no: 50, kind: 'work', name: 'ВЗЛОМ' }] }, tok.betaPto)).ok);
    const units = await j(await rpc('pf_list_units', { p_company: cV }, tok.alfaPto));
    const m2 = units.find((u) => u.code === 'м²')?.id;
    const wt = await j(await rpc('pf_vor_add_work_type', { p_project: pv, p_name: stampV + ' Устройство пола', p_unit: m2, p_code: null }, tok.alfaPto));
    check('ПТО создал вид работ', typeof wt === 'string');
    check('прораб не создаёт вид работ', !(await rpc('pf_vor_add_work_type', { p_project: pv, p_name: 'ВЗЛОМ', p_unit: m2, p_code: null }, tok.alfaForeman)).ok);
    check('Бета-ПТО не видит виды работ Альфы', !(await rpc('pf_vor_list_work_types', { p_project: pv }, tok.betaPto)).ok);
    check('словарь пополнен', (await rpc('pf_vor_learn', { p_project: pv, p_items: [{ name: stampV + ' устройство пола', unit_text: 'м2', work_type_id: wt }] }, tok.alfaPto)).ok);
    check('Бета-ПТО не читает словарь Альфы', !(await rpc('pf_vor_dictionary', { p_project: pv }, tok.betaPto)).ok);
    check('нельзя подтвердить неразобранный ВОР', !(await rpc('pf_vor_confirm', { p_import: imp }, tok.alfaPto)).ok);
    check('решения строки сохранены', (await rpc('pf_vor_resolve_rows', { p_import: imp, p_items: [{ row_no: 11, location_id: sec, work_type_id: wt, unit_id: m2, match: 'green' }] }, tok.alfaPto)).ok);
    check('прораб не подтверждает ВОР', !(await rpc('pf_vor_confirm', { p_import: imp }, tok.alfaForeman)).ok);
    const cf = await rpc('pf_vor_confirm', { p_import: imp }, tok.alfaPto);
    check('ВОР подтверждён: 1 позиция', cf.ok && (await j(cf)) === 1, `статус ${cf.status}`);
    const pos = (await j(await rpc('pf_vor_positions', { p_project: pv, p_location: null }, tok.alfaForeman))).filter((x) => x.import_id === imp);
    check('прораб видит позицию «Секция 1 · вид работ · м² · 399,89 · кв.»', pos.length === 1 && pos[0].location_path === 'Секция 1' && pos[0].unit_code === 'м²' && Number(pos[0].qty) === 399.89 && pos[0].apartments_note === 'кв. 3, 16');
    check('подтверждённый: строки не дописать', !(await rpc('pf_vor_add_rows', { p_import: imp, p_rows: [{ row_no: 60, kind: 'work', name: 'x' }] }, tok.alfaPto)).ok);
    check('подтверждённый: не удалить', !(await rpc('pf_vor_delete_import', { p_import: imp }, tok.alfaPto)).ok);
    check('Бета-ПТО не видит позиции Альфы', !(await rpc('pf_vor_positions', { p_project: pv, p_location: null }, tok.betaPto)).ok);
    // --- P2-0006c: цены, смета, КП (миграция 008) — прораб цены не видит, Бета не видит Альфу, редакции КП неизменяемы. ---
    let est = null;
    const prProbe = await rpc('pf_price_list', { p_company: cV }, tok.alfaPto);
    if (prProbe.status === 404) { console.log('NOT RUN: миграция 008 не применена — проверки цен и смет пропущены'); fails++; }
    else {
      check('ПТО читает справочник цен', prProbe.ok, `статус ${prProbe.status}`);
      check('ПТО: право planfact.estimate.manage в проекте', (await perms('alfaPto', pv)).includes('planfact.estimate.manage'));
      check('прораб: права planfact.estimate.manage нет', !(await perms('alfaForeman', pv)).includes('planfact.estimate.manage'));
      const up = await rpc('pf_price_upsert', { p_company: cV, p_source: 'import:' + imp, p_items: [
        { kind: 'work', work_type_id: wt, price_labor: 10, price_material: 1.5 },
        { kind: 'material', name: stampV + ' смесь', unit_text: 'кг', price_material: 2 }] }, tok.alfaPto);
      const upJ = await j(up);
      check('ПТО записал цены (работа + материал) с источником «загрузка ВОР»', up.ok && upJ.created + upJ.updated === 2, `статус ${up.status}`);
      check('прораб не читает цены', !(await rpc('pf_price_list', { p_company: cV }, tok.alfaForeman)).ok);
      check('прораб не пишет цены', !(await rpc('pf_price_upsert', { p_company: cV, p_items: [], p_source: 'manual' }, tok.alfaForeman)).ok);
      check('Бета-ПТО не читает цены Альфы', !(await rpc('pf_price_list', { p_company: cV }, tok.betaPto)).ok);
      check('Бета-ПТО не пишет цены Альфы', !(await rpc('pf_price_upsert', { p_company: cV, p_items: [], p_source: 'manual' }, tok.betaPto)).ok);
      const tplE = await j(await rpc('pf_overhead_template', { p_company: cV }, tok.alfaPto));
      check('шаблон надбавок компании открывается, русские названия целы', tplE.length > 0 && tplE.some((l) => l.name === 'НДС минимально необходимый'));
      const catE = await j(await rpc('pf_permission_catalog', {}, tok.alfaAdmin));
      check('каталог прав: planfact.estimate.manage с русским описанием', catE.some((c) => c.action === 'planfact.estimate.manage' && String(c.description).startsWith('Цены, шаблон надбавок')));
      check('прораб не читает шаблон надбавок', !(await rpc('pf_overhead_template', { p_company: cV }, tok.alfaForeman)).ok);
      check('прораб не создаёт смету', !(await rpc('pf_estimate_create', { p_project: pv, p_name: 'x', p_imports: [imp], p_area: null }, tok.alfaForeman)).ok);
      check('Бета-ПТО не создаёт смету по ВОР Альфы', !(await rpc('pf_estimate_create', { p_project: pv, p_name: 'x', p_imports: [imp], p_area: null }, tok.betaPto)).ok);
      const ce = await rpc('pf_estimate_create', { p_project: pv, p_name: stampV + ' смета', p_imports: [imp], p_area: 100 }, tok.alfaPto);
      est = await j(ce);
      check('ПТО создал смету по подтверждённому ВОР', ce.ok && typeof est === 'string', `статус ${ce.status}`);
      const er = await j(await rpc('pf_estimate_rows', { p_estimate: est }, tok.alfaPto));
      const w11 = er.find((r) => r.row_no === 11), m12 = er.find((r) => r.row_no === 12);
      check('цены подставлены из справочника (работа 10 / 1,5, материал 2)', Number(w11?.price_labor) === 10 && Number(w11?.price_material) === 1.5 && Number(m12?.price_material) === 2 && w11?.price_source === 'reference');
      check('ручная цена сохранена', (await rpc('pf_estimate_set_prices', { p_estimate: est, p_items: [{ source_row_id: w11?.source_row_id, price_labor: 11, price_material: 1.5 }] }, tok.alfaPto)).ok);
      const er2 = await j(await rpc('pf_estimate_rows', { p_estimate: est }, tok.alfaPto));
      check('ручная цена помечена, справочник не изменился', er2.some((r) => r.row_no === 11 && Number(r.price_labor) === 11 && r.price_source === 'manual' && Number(r.ref_labor) === 10));
      check('прораб не читает смету', !(await rpc('pf_estimate_rows', { p_estimate: est }, tok.alfaForeman)).ok);
      check('Бета-ПТО не читает смету Альфы', !(await rpc('pf_estimate_rows', { p_estimate: est }, tok.betaPto)).ok);
      check('КП по другому файлу отклонено', !(await rpc('pf_kp_create', { p_estimate: est, p_file_sha256: 'f'.repeat(64), p_snapshot: {}, p_total: 1, p_note: null }, tok.alfaPto)).ok);
      const k1 = await rpc('pf_kp_create', { p_estimate: est, p_file_sha256: sha, p_snapshot: { rows: [{ row_no: 11, price_labor: 11 }] }, p_total: 4398.79, p_note: null }, tok.alfaPto);
      const k1J = await j(k1);
      check('редакция КП 1 создана', k1.ok && k1J.revision_no === 1, `статус ${k1.status}`);
      check('прораб не читает КП', !(await rpc('pf_kp_get', { p_revision: k1J.id }, tok.alfaForeman)).ok);
      check('Бета-ПТО не читает КП Альфы', !(await rpc('pf_kp_list', { p_estimate: est }, tok.betaPto)).ok);
      const directK = await fetch(`${URL_}/rest/v1/kp_revisions?id=eq.${k1J.id}`, { method: 'PATCH', headers: { apikey: ANON, Authorization: `Bearer ${tok.alfaPto}`, 'Content-Type': 'application/json', 'Accept-Profile': 'planfact', 'Content-Profile': 'planfact' }, body: '{"total": 1}' });
      check('редакцию КП не изменить через REST', !directK.ok, `статус ${directK.status}`);
      check('редакция КП после попытки изменения — прежняя', Number((await j(await rpc('pf_kp_get', { p_revision: k1J.id }, tok.alfaPto)))?.total) === 4398.79);
      const audE = await j(await rpc('pf_list_company_audit', { p_company: cV, p_limit: 200 }, tok.alfaAdmin));
      check('журнал компании: цены, смета, КП', ['price_items', 'estimates', 'kp_revisions'].every((t) => audE.some((r) => r.table_name === t)));
      check('anon: pf_price_list закрыт', !(await rpc('pf_price_list', { p_company: cV })).ok);
    }
    // --- P2-0007: бригады и факт прораба (миграция 009) — права, допуск перебора, подтверждение РП, изоляция компаний. ---
    const fProbe = await rpc('pf_brigade_list', { p_company: cV }, tok.alfaPto);
    let brigId = null;
    if (fProbe.status === 404) { console.log('NOT RUN: миграция 009 не применена — проверки бригад и факта пропущены'); fails++; }
    else {
      const stampB = 'REST-бригада ' + new Date().toISOString();
      check('прораб не ведёт справочник бригад', !(await rpc('pf_brigade_save', { p_company: cV, p_id: null, p_name: stampB }, tok.alfaForeman)).ok);
      const bs = await rpc('pf_brigade_save', { p_company: cV, p_id: null, p_name: stampB, p_leader: 'Тест', p_phone: null }, tok.alfaPto);
      brigId = await j(bs);
      check('ПТО добавил бригаду', bs.ok && typeof brigId === 'string', `статус ${bs.status}`);
      check('повтор имени бригады отклонён', !(await rpc('pf_brigade_save', { p_company: cV, p_id: null, p_name: stampB.toUpperCase() }, tok.alfaPto)).ok);
      check('прораб видит бригады компании', (await j(await rpc('pf_brigade_list', { p_company: cV }, tok.alfaForeman))).some((b) => b.id === brigId));
      check('Бета-ПТО не видит бригады Альфы', !(await rpc('pf_brigade_list', { p_company: cV }, tok.betaPto)).ok);
      const today = new Date().toISOString().slice(0, 10);
      const posId = pos[0]?.id;
      check('факт: без бригады — отказ', !(await rpc('pf_fact_add', { p_position: posId, p_brigade: null, p_date: today, p_qty: 1 }, tok.alfaForeman)).ok);
      check('факт: объём 0 — отказ', !(await rpc('pf_fact_add', { p_position: posId, p_brigade: brigId, p_date: today, p_qty: 0 }, tok.alfaForeman)).ok);
      check('факт: будущая дата — отказ', !(await rpc('pf_fact_add', { p_position: posId, p_brigade: brigId, p_date: '2099-01-01', p_qty: 1 }, tok.alfaForeman)).ok);
      check('ПТО без fact.create не вносит факт', !(await rpc('pf_fact_add', { p_position: posId, p_brigade: brigId, p_date: today, p_qty: 1 }, tok.alfaPto)).ok);
      check('Бета-ПТО не вносит факт в позицию Альфы', !(await rpc('pf_fact_add', { p_position: posId, p_brigade: brigId, p_date: today, p_qty: 1 }, tok.betaPto)).ok);
      const fa = await rpc('pf_fact_add', { p_position: posId, p_brigade: brigId, p_date: today, p_qty: 10, p_workers: 2, p_man_hours: 16, p_note: 'REST-тест' }, tok.alfaForeman);
      const faJ = await j(fa);
      check('прораб внёс 10 — принято', fa.ok && faJ.status === 'accepted', `статус ${fa.status}`);
      const tt = async (k) => (await j(await rpc('pf_fact_position_totals', { p_project: pv }, tok[k]))).find((t) => t.position_id === posId);
      check('итог позиции: факт 10', Number((await tt('alfaForeman'))?.fact_qty) === 10);
      const over = await rpc('pf_fact_add', { p_position: posId, p_brigade: brigId, p_date: today, p_qty: 1000 }, tok.alfaForeman);
      const overJ = await j(over);
      check('перебор плана > допуска — ждёт подтверждения РП', over.ok && overJ.status === 'pending_approval', `статус ${over.status}`);
      check('неподтверждённый перебор в итог не входит', Number((await tt('alfaForeman'))?.fact_qty) === 10 && Number((await tt('alfaForeman'))?.pending_qty) === 1000);
      check('прораб не подтверждает перебор', !(await rpc('pf_fact_decide', { p_entry: overJ.id, p_approve: true }, tok.alfaForeman)).ok);
      check('прораб не видит очередь подтверждения', !(await rpc('pf_fact_pending', { p_project: pv }, tok.alfaForeman)).ok);
      check('администратор видит очередь: 1 запись', (await j(await rpc('pf_fact_pending', { p_project: pv }, tok.alfaAdmin))).some((r) => r.id === overJ.id));
      check('отказ без причины не проходит', !(await rpc('pf_fact_decide', { p_entry: overJ.id, p_approve: false }, tok.alfaAdmin)).ok);
      check('администратор отклонил перебор с причиной', (await rpc('pf_fact_decide', { p_entry: overJ.id, p_approve: false, p_note: 'REST-тест: лишнее' }, tok.alfaAdmin)).ok);
      const fc = await rpc('pf_fact_correct', { p_entry: faJ.id, p_qty: 8, p_reason: 'REST-тест: уточнение' }, tok.alfaForeman);
      check('прораб исправил свою запись 10 → 8', fc.ok, `статус ${fc.status}`);
      check('исправление без причины отклонено', !(await rpc('pf_fact_correct', { p_entry: faJ.id, p_qty: 5, p_reason: ' ' }, tok.alfaForeman)).ok);
      const hist = await j(await rpc('pf_fact_history', { p_position: posId }, tok.alfaForeman));
      check('история: заменённая, новая и отклонённая записи на месте', hist.some((h) => h.status === 'superseded') && hist.some((h) => h.status === 'accepted' && Number(h.qty) === 8) && hist.some((h) => h.status === 'rejected'));
      check('Бета-ПТО не читает историю и итоги Альфы', !(await rpc('pf_fact_history', { p_position: posId }, tok.betaPto)).ok && !(await rpc('pf_fact_position_totals', { p_project: pv }, tok.betaPto)).ok);
      const directF = await fetch(`${URL_}/rest/v1/fact_entries?id=eq.${faJ.id}`, { method: 'PATCH', headers: { apikey: ANON, Authorization: `Bearer ${tok.alfaForeman}`, 'Content-Type': 'application/json', 'Accept-Profile': 'planfact', 'Content-Profile': 'planfact' }, body: JSON.stringify({ qty: 999 }) });
      check('запись факта не изменить через REST', !directF.ok, `статус ${directF.status}`);
      const directD = await fetch(`${URL_}/rest/v1/fact_entries?id=eq.${faJ.id}`, { method: 'DELETE', headers: { apikey: ANON, Authorization: `Bearer ${tok.alfaForeman}`, 'Accept-Profile': 'planfact', 'Content-Profile': 'planfact' } });
      check('запись факта не удалить через REST', !directD.ok, `статус ${directD.status}`);
      check('итог после исправления: факт 8', Number((await tt('alfaForeman'))?.fact_qty) === 8);
      // --- P2-0019: «Закрыть через РП» (миграция 027) — p_require_approval: ждёт РП без перебора; права и изоляция прежние. ---
      const fpBody = { p_project: pv, p_brigade: brigId, p_date: today, p_items: [{ position_id: posId, qty: 1 }], p_note: 'REST-тест', p_require_approval: true };
      const fp = await rpc('pf_fact_add_batch', fpBody, tok.alfaForeman);
      const fpJ = await j(fp);
      if (fp.status === 404) { console.log('NOT RUN: миграция 027 не применена — проверки «через РП» пропущены'); fails++; }
      else {
        check('0019: «через РП» — пачка без перебора ждёт РП', fp.ok && fpJ.accepted === 0 && fpJ.pending === 1, `статус ${fp.status}`);
        check('0019: в итог не вошло до решения РП', Number((await tt('alfaForeman'))?.fact_qty) === 8);
        const fpq = (await j(await rpc('pf_fact_pending', { p_project: pv }, tok.alfaAdmin))).find((r) => r.position_id === posId && r.note === 'Закрытие через РП. REST-тест');
        check('0019: в «Ждёт подтверждения» с пометкой «Закрытие через РП»', !!fpq);
        check('0019: ПТО без fact.create — отказ', !(await rpc('pf_fact_add_batch', fpBody, tok.alfaPto)).ok);
        check('0019: Бета-ПТО — отказ', !(await rpc('pf_fact_add_batch', fpBody, tok.betaPto)).ok);
        check('0019: anon — отказ', !(await rpc('pf_fact_add_batch', fpBody)).ok);
        if (fpq) check('0019: РП отклонил тестовую запись (итог не меняется)', (await rpc('pf_fact_decide', { p_entry: fpq.id, p_approve: false, p_note: 'REST-тест: уборка' }, tok.alfaAdmin)).ok && Number((await tt('alfaForeman'))?.fact_qty) === 8);
      }
      // --- P2-0020: решение РП пачкой и журнал объекта (миграция 028). Пачка только отклоняется — итог тестового объекта не меняется. ---
      const jProbe = await rpc('pf_fact_journal', { p_project: pv, p_from: today, p_to: today }, tok.alfaForeman);
      if (jProbe.status === 404) { console.log('NOT RUN: миграция 028 не применена — проверки пачки РП и журнала пропущены'); fails++; }
      else {
        const pend = [];
        for (const note of ['REST-0020 a', 'REST-0020 b']) {
          const b = await j(await rpc('pf_fact_add_batch', { ...fpBody, p_note: note }, tok.alfaForeman));
          const e = (await j(await rpc('pf_fact_pending', { p_project: pv }, tok.alfaAdmin))).find((r) => r.note === 'Закрытие через РП. ' + note);
          if (b && e) pend.push(e.id);
        }
        check('0020: две записи ждут РП', pend.length === 2);
        const accepted = (await j(await rpc('pf_fact_history', { p_position: posId }, tok.alfaForeman))).find((h) => h.status === 'accepted')?.id;
        const dBody = (ids, approve, note) => ({ p_project: pv, p_entries: ids, p_approve: approve, p_note: note });
        check('0020: прораб — отказ', !(await rpc('pf_fact_decide_batch', dBody(pend, false, 'REST-0020'), tok.alfaForeman)).ok);
        check('0020: Бета-ПТО — отказ', !(await rpc('pf_fact_decide_batch', dBody(pend, false, 'REST-0020'), tok.betaPto)).ok);
        check('0020: anon — отказ', !(await rpc('pf_fact_decide_batch', dBody(pend, false, 'REST-0020'))).ok);
        check('0020: отказ без причины — отказ', !(await rpc('pf_fact_decide_batch', dBody(pend, false, ' '), tok.alfaAdmin)).ok);
        check('0020: в пачке принятая запись — отказ всей пачки', !!accepted && !(await rpc('pf_fact_decide_batch', dBody([...pend, accepted], false, 'REST-0020'), tok.alfaAdmin)).ok);
        const still = (await j(await rpc('pf_fact_pending', { p_project: pv }, tok.alfaAdmin))).filter((r) => pend.includes(r.id)).length;
        check('0020: после отказов обе записи по-прежнему ждут РП', still === 2);
        const db = await rpc('pf_fact_decide_batch', dBody(pend, false, 'REST-0020: уборка'), tok.alfaAdmin);
        const dbJ = await j(db);
        check('0020: РП отклонил пачку одной операцией', db.ok && dbJ.rejected === 2 && dbJ.approved === 0, `статус ${db.status}`);
        check('0020: итог объекта не изменился', Number((await tt('alfaForeman'))?.fact_qty) === 8);
        const jr = await j(await rpc('pf_fact_journal', { p_project: pv, p_from: today, p_to: today }, tok.alfaForeman));
        check('0020: журнал прораба — отклонённые пачкой с одной причиной', pend.every((id) => jr.some((r) => r.id === id && r.status === 'rejected' && r.decision_note === 'REST-0020: уборка')));
        check('0020: журнал — Бета-ПТО отказ', !(await rpc('pf_fact_journal', { p_project: pv }, tok.betaPto)).ok);
        check('0020: журнал — anon отказ', !(await rpc('pf_fact_journal', { p_project: pv })).ok);
        check('0020: журнал — начало позже конца отказ', !(await rpc('pf_fact_journal', { p_project: pv, p_from: today, p_to: '2000-01-01' }, tok.alfaForeman)).ok);
        // --- P2-0021: «Требует моего участия» (миграция 029) — только чтение; ТД №138: повторное решение — отказ. ---
        const iProbe = await rpc('pf_my_inbox', {}, tok.alfaForeman);
        if (iProbe.status === 404) { console.log('NOT RUN: миграция 029 не применена — проверки «Требует моего участия» пропущены'); fails++; }
        else {
          const inboxOf = async (who) => (await j(await rpc('pf_my_inbox', {}, tok[who])) || []).find((r) => r.project_id === pv);
          const iAdm = await inboxOf('alfaAdmin'), iFor = await inboxOf('alfaForeman'), iPto = await inboxOf('alfaPto');
          const pendN = (await j(await rpc('pf_fact_pending', { p_project: pv }, tok.alfaAdmin))).length;
          check('0021: администратор (fact.approve) — «ждёт подтверждения» = pf_fact_pending', !!iAdm && iAdm.pending === pendN, JSON.stringify(iAdm));
          check('0021: прораб — «мои отклонённые» есть, подтверждения нет', !!iFor && typeof iFor.my_rejected === 'number' && iFor.pending === null, JSON.stringify(iFor));
          const ks2N = (await j(await rpc('pf_ks2_acts', { p_project: pv }, tok.alfaPto)) || []).filter((a) => a.status === 'draft').length;
          check('0021: ПТО — черновики КС-2 = pf_ks2_acts, подтверждения нет', !!iPto && iPto.ks2_drafts === ks2N && iPto.pending === null, JSON.stringify(iPto));
          check('0021: Бета-ПТО не видит объект Альфы', !(await inboxOf('betaPto')));
          check('0021: anon — отказ', !(await rpc('pf_my_inbox', {})).ok);
          check('0021: ТД №138 — повторное решение по отклонённой записи — отказ', !!pend[0] && !(await rpc('pf_fact_decide', { p_entry: pend[0], p_approve: true, p_note: 'REST-0021' }, tok.alfaAdmin)).ok);
          check('0021: итог объекта не изменился', Number((await tt('alfaForeman'))?.fact_qty) === 8);
        }
        // --- P2-0022: запись «за период» и прогноз (миграция 030). Запись за период — перебор → ждёт РП → отклоняется: итог не меняется. ---
        const shiftD = (d, k) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };
        const perBody = { p_position: posId, p_brigade: brigId, p_date: today, p_qty: 1000, p_note: 'REST-0022', p_period_from: shiftD(today, -3) };
        const per = await rpc('pf_fact_add', perBody, tok.alfaForeman);
        if (per.status === 404) { console.log('NOT RUN: миграция 030 не применена — проверки периода и прогноза пропущены'); fails++; }
        else {
          const perJ = await j(per);
          check('0022: запись за период (перебор) — одна запись, ждёт РП', per.ok && perJ.status === 'pending_approval', `статус ${per.status}`);
          const hp = (await j(await rpc('pf_fact_history', { p_position: posId }, tok.alfaForeman))).find((h) => h.id === perJ.id);
          check('0022: история — period_from = начало, work_date = конец', hp?.period_from === shiftD(today, -3) && hp?.work_date === today, JSON.stringify(hp));
          check('0022: журнал — period_from', (await j(await rpc('pf_fact_journal', { p_project: pv, p_from: today, p_to: today }, tok.alfaForeman))).some((r) => r.id === perJ.id && r.period_from === shiftD(today, -3)));
          check('0022: начало позже конца — отказ', !(await rpc('pf_fact_add', { ...perBody, p_period_from: shiftD(today, 1) }, tok.alfaForeman)).ok);
          check('0022: больше 31 дня — отказ', !(await rpc('pf_fact_add', { ...perBody, p_period_from: shiftD(today, -31) }, tok.alfaForeman)).ok);
          check('0022: Бета-ПТО — отказ', !(await rpc('pf_fact_add', perBody, tok.betaPto)).ok);
          check('0022: anon — отказ', !(await rpc('pf_fact_add', perBody)).ok);
          const directP = await fetch(`${URL_}/rest/v1/fact_entries?id=eq.${perJ.id}`, { method: 'PATCH', headers: { apikey: ANON, Authorization: `Bearer ${tok.alfaForeman}`, 'Content-Type': 'application/json', 'Accept-Profile': 'planfact', 'Content-Profile': 'planfact' }, body: JSON.stringify({ period_from: null }) });
          check('0022: период не изменить через REST', !directP.ok, `статус ${directP.status}`);
          check('0022: РП отклонил тестовую запись за период', (await rpc('pf_fact_decide', { p_entry: perJ.id, p_approve: false, p_note: 'REST-0022: уборка' }, tok.alfaAdmin)).ok);
          check('0022: итог объекта не изменился', Number((await tt('alfaForeman'))?.fact_qty) === 8);
          const sp = (await j(await rpc('pf_summary_positions', { p_project: pv }, tok.alfaForeman)) || []).find((r) => r.position_id === posId);
          check('0022: прогноз позиции — поля есть, факт 8 как в итоге', !!sp && 'forecast_finish' in sp && 'delta_days' in sp && 'plan_pct_today' in sp && 'dev_pp' in sp && Number(sp.fact_qty) === 8, JSON.stringify(sp));
          const wts = await j(await rpc('pf_summary_worktypes', { p_project: pv }, tok.alfaForeman)) || [];
          check('0022: вид работ — прогноз по ЕИ, прораб без ₽', wts.length > 0 && wts.every((w) => 'plan_pct_today' in w && w.plan_money === null && w.units.every((u) => 'forecast_finish' in u && 'dev_pp' in u)), JSON.stringify(wts[0]));
          check('0022: сводка — Бета-ПТО отказ', !(await rpc('pf_summary_positions', { p_project: pv }, tok.betaPto)).ok && !(await rpc('pf_summary_worktypes', { p_project: pv }, tok.betaPto)).ok);
          check('0022: сводка — anon отказ', !(await rpc('pf_summary_positions', { p_project: pv })).ok);
        }
      }
      const audF = await j(await rpc('pf_list_company_audit', { p_company: cV, p_limit: 200 }, tok.alfaAdmin));
      check('журнал компании: бригады и факт', ['brigades', 'fact_entries'].every((t) => audF.some((r) => r.table_name === t)));
      check('anon: pf_fact_add закрыт', !(await rpc('pf_fact_add', { p_position: posId, p_brigade: brigId, p_date: today, p_qty: 1 })).ok);
      // --- P2-0008b: проект КС-2 (миграция 010) — права, изоляция, предложение по факту, редакции, выдача, аннулирование. ---
      const kProbe = await rpc('pf_ks2_settings', { p_project: pv }, tok.alfaPto);
      if (kProbe.status === 404) { console.log('NOT RUN: миграция 010 не применена — проверки КС-2 пропущены'); fails++; }
      else if (!est) { console.log('NOT RUN: нет сметы (миграция 008) — проверки КС-2 пропущены'); fails++; }
      else {
        check('ПТО открывает настройки КС-2', kProbe.ok, `статус ${kProbe.status}`);
        check('ПТО: право planfact.ks2.edit в проекте', (await perms('alfaPto', pv)).includes('planfact.ks2.edit'));
        check('прораб не видит КС-2', !(await rpc('pf_ks2_settings', { p_project: pv }, tok.alfaForeman)).ok);
        check('администратор без ks2.* не видит акты', !(await rpc('pf_ks2_acts', { p_project: pv }, tok.alfaAdmin)).ok);
        check('Бета-ПТО не видит акты Альфы', !(await rpc('pf_ks2_acts', { p_project: pv }, tok.betaPto)).ok);
        const s0 = await j(await rpc('pf_ks2_settings', { p_project: pv }, tok.alfaPto));
        if (!s0?.contract_kp_revision_id) check('без договорной КП акт не создаётся', !(await rpc('pf_ks2_act_create', { p_project: pv, p_act_no: actNo(0), p_act_date: today, p_from: today, p_to: today }, tok.alfaPto)).ok);
        const kk = await j(await rpc('pf_kp_create', { p_estimate: est, p_file_sha256: sha, p_snapshot: { version: 1, rows: [
          { import_id: imp, row_no: 11, kind: 'work', price_labor: 11, price_material: 1.5 }, { import_id: imp, row_no: 12, kind: 'material', price_labor: null, price_material: 2 }] }, p_total: 1, p_note: 'REST-КС-2' }, tok.alfaPto));
        check('Бета-ПТО не выбирает договорную КП Альфы', !(await rpc('pf_ks2_set_contract', { p_project: pv, p_kp_revision: kk?.id }, tok.betaPto)).ok);
        check('ПТО выбрал договорную КП', (await rpc('pf_ks2_set_contract', { p_project: pv, p_kp_revision: kk?.id }, tok.alfaPto)).ok);
        const no1 = actNo(1), no2 = actNo(2);
        const ac = await rpc('pf_ks2_act_create', { p_project: pv, p_act_no: no1, p_act_date: today, p_from: today, p_to: today }, tok.alfaPto);
        const act1 = await j(ac);
        check('ПТО создал акт № 1', ac.ok && typeof act1 === 'string', `статус ${ac.status}`);
        const a1 = await j(await rpc('pf_ks2_act', { p_act: act1 }, tok.alfaPto));
        const w = a1?.proposal?.find((r) => r.row_no === 11), m = a1?.proposal?.find((r) => r.row_no === 12);
        check('предложение: работа = принятый факт 8 (перебор и заменённая запись не идут), цена 11 + 1,5', Number(w?.sys_qty) === 8 && Number(w?.price) === 12.5, JSON.stringify(w));
        check('предложение: материал = 8 × норма 7,5 = 60, цена 2', Number(m?.sys_qty) === 60 && Number(m?.price) === 2, JSON.stringify(m));
        check('Бета-ПТО не открывает акт Альфы', !(await rpc('pf_ks2_act', { p_act: act1 }, tok.betaPto)).ok);
        const sv = await rpc('pf_ks2_save', { p_act: act1, p_header: { customer: 'REST-заказчик', contract_no: 'REST-Д' }, p_rows: [{ source_row_id: w?.source_row_id, qty: 7, price: 12.5, excluded: false }], p_note: null }, tok.alfaPto);
        check('редакция 1 сохранена (итог ПТО 7 при системе 8)', sv.ok && (await j(sv)) === 1, `статус ${sv.status}`);
        check('прораб не сохраняет редакцию', !(await rpc('pf_ks2_save', { p_act: act1, p_header: {}, p_rows: [], p_note: null }, tok.alfaForeman)).ok);
        const revs = await j(await rpc('pf_ks2_revisions', { p_act: act1 }, tok.alfaPto));
        const directR = await fetch(`${URL_}/rest/v1/ks2_revisions?id=eq.${revs?.[0]?.id}`, { method: 'PATCH', headers: { apikey: ANON, Authorization: `Bearer ${tok.alfaPto}`, 'Content-Type': 'application/json', 'Accept-Profile': 'planfact', 'Content-Profile': 'planfact' }, body: '{"total": 1}' });
        check('редакцию акта не изменить через REST', !directR.ok, `статус ${directR.status}`);
        const r1 = await j(await rpc('pf_ks2_revision', { p_revision: revs?.[0]?.id }, tok.alfaPto));
        check('итог редакции = 7 × 12,5 + 60 × 2 = 207,50', Number(r1?.total) === 207.5, String(r1?.total));
        check('ПТО выдал акт № 1', (await rpc('pf_ks2_issue', { p_act: act1 }, tok.alfaPto)).ok);
        check('повторная выдача отклонена', !(await rpc('pf_ks2_issue', { p_act: act1 }, tok.alfaPto)).ok);
        check('выданный акт не правится', !(await rpc('pf_ks2_save', { p_act: act1, p_header: {}, p_rows: [], p_note: null }, tok.alfaPto)).ok);
        const act2 = await j(await rpc('pf_ks2_act_create', { p_project: pv, p_act_no: no2, p_act_date: today, p_from: today, p_to: today }, tok.alfaPto));
        const a2 = await j(await rpc('pf_ks2_act', { p_act: act2 }, tok.alfaPto));
        const w2 = a2?.proposal?.find((r) => r.row_no === 11);
        check('акт № 2: выставлено ранее 7, по системе 1', Number(w2?.prev_qty) === 7 && Number(w2?.sys_qty) === 1, JSON.stringify(w2));
        check('аннулирование без причины отклонено', !(await rpc('pf_ks2_annul', { p_act: act1, p_reason: ' ' }, tok.alfaPto)).ok);
        check('ПТО аннулировал акт № 1 с причиной', (await rpc('pf_ks2_annul', { p_act: act1, p_reason: 'REST-тест' }, tok.alfaPto)).ok);
        const w3 = (await j(await rpc('pf_ks2_act', { p_act: act2 }, tok.alfaPto)))?.proposal?.find((r) => r.row_no === 11);
        check('после аннулирования объём снова доступен (по системе 8)', Number(w3?.sys_qty) === 8, JSON.stringify(w3));
        const lst = await j(await rpc('pf_ks2_acts', { p_project: pv }, tok.alfaPto));
        check('список актов: № 1 аннулирован, № 2 черновик', lst.some((a) => a.act_no === no1 && a.status === 'annulled') && lst.some((a) => a.act_no === no2 && a.status === 'draft'));
        const audK = await j(await rpc('pf_list_company_audit', { p_company: cV, p_limit: 200 }, tok.alfaAdmin));
        check('журнал компании: КС-2', ['ks2_acts', 'ks2_settings'].every((t) => audK.some((r) => r.table_name === t)));
        check('anon: pf_ks2_acts закрыт', !(await rpc('pf_ks2_acts', { p_project: pv })).ok);
        // --- P2-0008: сводка руководителю (миграция 011) — ₽ только с money.view, изоляция, даты проекта. ---
        const sProbe = await rpc('pf_summary_portfolio', {}, tok.alfaPto);
        if (sProbe.status === 404) { console.log('NOT RUN: миграция 011 не применена — проверки сводки пропущены'); fails++; }
        else {
          const sp = (await j(sProbe))?.find((r) => r.project_id === pv);
          check('сводка ПТО: проект с договорной КП, сделано 8 × 12,5 + 60 × 2 = 220 ₽', sp?.has_kp && Number(sp?.done_money) === 220, JSON.stringify(sp));
          check('сводка ПТО: выставлено 0 (акт аннулирован), разрыв 220 ₽', Number(sp?.issued_money) === 0 && Number(sp?.gap_money) === 220);
          const sf = (await j(await rpc('pf_summary_portfolio', {}, tok.alfaForeman)))?.find((r) => r.project_id === pv);
          check('сводка прораба: проект виден, ₽ / % / прогноз не приходят', !!sf && sf.plan_money === null && sf.done_money === null && sf.pct_money === null && sf.forecast_finish === null, JSON.stringify(sf));
          const gf = (await j(await rpc('pf_summary_ks2_gap', { p_project: pv }, tok.alfaForeman)))?.find((r) => r.row_no === 11);
          check('разрыв КС-2 у прораба: объём 8, ₽ нет', Number(gf?.gap_qty) === 8 && gf?.gap_money === null && gf?.price === null, JSON.stringify(gf));
          const gp = (await j(await rpc('pf_summary_ks2_gap', { p_project: pv }, tok.alfaPto)))?.find((r) => r.row_no === 11);
          check('разрыв КС-2 у ПТО: 8 × 12,5 = 100 ₽', Number(gp?.gap_money) === 100, JSON.stringify(gp));
          const wtf = await j(await rpc('pf_summary_worktypes', { p_project: pv }, tok.alfaForeman));
          check('виды работ у прораба: объёмы в своих ЕИ, ₽ нет', Array.isArray(wtf) && wtf.length > 0 && wtf.every((r) => r.plan_money === null && Array.isArray(r.units)));
          check('Бета-ПТО не видит виды работ Альфы', !(await rpc('pf_summary_worktypes', { p_project: pv }, tok.betaPto)).ok);
          check('Бета-ПТО не видит проект Альфы в портфеле', !(await j(await rpc('pf_summary_portfolio', {}, tok.betaPto)))?.some((r) => r.project_id === pv));
          check('прораб не меняет даты проекта', !(await rpc('pf_project_set_dates', { p_project: pv, p_start: today, p_finish: today }, tok.alfaForeman)).ok);
          check('начало позже окончания — отказ', !(await rpc('pf_project_set_dates', { p_project: pv, p_start: '2030-01-02', p_finish: '2030-01-01' }, tok.alfaPto)).ok);
          check('ПТО задал даты проекта', (await rpc('pf_project_set_dates', { p_project: pv, p_start: today, p_finish: '2030-01-01' }, tok.alfaPto)).ok);
          check('013a: дата окончания 9999-12-31 — отказ (даты 2000…2100)', !(await rpc('pf_project_set_dates', { p_project: pv, p_start: today, p_finish: '9999-12-31' }, tok.alfaPto)).ok);
          check('anon: pf_summary_portfolio закрыт', !(await rpc('pf_summary_portfolio', {})).ok);
          // --- P2-0010: дашборд руководителя (миграция 013) — отставание по ТЗ §9, светофор 8.2, недели, «требует внимания», места, пороги. ---
          const wProbe = await rpc('pf_summary_weekly', { p_project: pv, p_weeks: 4 }, tok.alfaPto);
          if (wProbe.status === 404) { console.log('NOT RUN: миграция 013 не применена — проверки дашборда пропущены'); fails++; }
          else {
            const s2 = (await j(await rpc('pf_summary_portfolio', {}, tok.alfaPto)))?.find((r) => r.project_id === pv);
            check('013: даты с сегодня — план на сегодня 0 %, отставание отрицательное, зелёный «в графике», пороги 3/10/3',
              Number(s2?.plan_pct_today) === 0 && Number(s2?.lag_days) < 0 && s2?.light === 'green' && s2?.light_reason === 'on_track'
              && Number(s2?.light_yellow_pp) === 3 && Number(s2?.light_red_pp) === 10 && Number(s2?.light_overdue_days) === 3 && s2?.can_thresholds === false, JSON.stringify(s2));
            const f2 = (await j(await rpc('pf_summary_portfolio', {}, tok.alfaForeman)))?.find((r) => r.project_id === pv);
            check('013: прораб — отставание (п.п., дни) не приходит, план на сегодня и светофор есть', f2?.lag_days === null && f2?.lag_pp === null && Number(f2?.plan_pct_today) === 0 && !!f2?.light, JSON.stringify(f2));
            const wk = await j(wProbe);
            const last = Array.isArray(wk) ? wk[wk.length - 1] : null;
            check('013: недели — 4, нарастающий итог на сегодня = сделано в сводке (220 ₽)', Array.isArray(wk) && wk.length === 4 && last?.week_end === new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10) && Number(last?.done_money_cum) === 220, JSON.stringify(last));
            const wkf = await j(await rpc('pf_summary_weekly', { p_project: pv, p_weeks: 4 }, tok.alfaForeman));
            check('013: недели у прораба — без ₽, объёмы есть', Array.isArray(wkf) && wkf.every((w) => w.done_money === null && w.done_money_cum === null && w.issued_money === null) && wkf.some((w) => w.units.length), JSON.stringify(wkf?.[wkf.length - 1]));
            const at = await j(await rpc('pf_summary_attention', { p_project: pv }, tok.alfaPto));
            check('013: «требует внимания» у ПТО — не выставлено 220 ₽, полнота посчитана', Number(at?.counts?.gap_money) === 220 && at?.completeness?.dates_pct === 100, JSON.stringify(at?.counts));
            const atf = await j(await rpc('pf_summary_attention', { p_project: pv }, tok.alfaForeman));
            check('013: «требует внимания» у прораба — без ₽', atf?.counts?.gap_money === null && (atf?.gap || []).every((g) => g.money === null), JSON.stringify(atf?.counts));
            const pl = await j(await rpc('pf_summary_places', { p_project: pv }, tok.alfaPto));
            const plf = await j(await rpc('pf_summary_places', { p_project: pv }, tok.alfaForeman));
            check('013: места — у ПТО ₽ есть, у прораба нет', Array.isArray(pl) && pl.length > 0 && pl.some((x) => x.plan_money !== null) && Array.isArray(plf) && plf.every((x) => x.plan_money === null && x.done_money === null), JSON.stringify(pl?.[0]));
            check('013: Бета-ПТО не видит недели Альфы', !(await rpc('pf_summary_weekly', { p_project: pv, p_weeks: 4 }, tok.betaPto)).ok);
            check('013: Бета-ПТО не видит «требует внимания» Альфы', !(await rpc('pf_summary_attention', { p_project: pv }, tok.betaPto)).ok);
            check('013: Бета-ПТО не видит места Альфы', !(await rpc('pf_summary_places', { p_project: pv }, tok.betaPto)).ok);
            check('013: ПТО (без thresholds.edit) не меняет пороги', !(await rpc('pf_project_set_thresholds', { p_project: pv, p_yellow_pp: 4, p_red_pp: 12, p_overdue_days: 5 }, tok.alfaPto)).ok);
            check('013: прораб не меняет пороги', !(await rpc('pf_project_set_thresholds', { p_project: pv, p_yellow_pp: 4, p_red_pp: 12, p_overdue_days: 5 }, tok.alfaForeman)).ok);
            check('013: anon — недели, «требует внимания», места, пороги закрыты', !(await rpc('pf_summary_weekly', { p_project: pv, p_weeks: 4 })).ok
              && !(await rpc('pf_summary_attention', { p_project: pv })).ok && !(await rpc('pf_summary_places', { p_project: pv })).ok
              && !(await rpc('pf_project_set_thresholds', { p_project: pv, p_yellow_pp: 4, p_red_pp: 12, p_overdue_days: 5 })).ok);
          }
        }
      }
      // бригаду REST-теста отправляем в архив — активные имена не накапливаются
      check('бригада REST-теста отправлена в архив', (await rpc('pf_brigade_archive', { p_brigade: brigId, p_archived: true }, tok.alfaPto)).ok);
    }
    const audV = await j(await rpc('pf_list_company_audit', { p_company: cV, p_limit: 100 }, tok.alfaAdmin));
    check('журнал компании: загрузка и подтверждение ВОР', audV.some((r) => r.table_name === 'vor_imports' && r.action === 'INSERT') && audV.some((r) => r.table_name === 'vor_imports' && r.new_data?.status === 'confirmed'));
    const directV = await fetch(`${URL_}/rest/v1/vor_imports`, { headers: { apikey: ANON, Authorization: `Bearer ${tok.alfaPto}`, 'Accept-Profile': 'planfact' } });
    check('таблицы ВОР не открыты через REST напрямую', !directV.ok, `статус ${directV.status}`);
    check('anon: pf_vor_list_imports закрыт', !(await rpc('pf_vor_list_imports', { p_project: pv })).ok);
  } finally {
    for (const a of asgV) check('назначение на объект автопроверок отозвано', (await rpc('pf_revoke_assignment', { p_assignment: a }, tok.alfaAdmin)).ok);
  }
}
// --- P2-0013 (014): кто я и администрирование платформы — только чтение и отказы, сервер не меняется ---
{
  const me = async (k) => { const r = await rpc('pf_my_platform', {}, tok[k]); return r.ok ? r.json() : null; };
  const mf = await me('alfaForeman'), mb = await me('betaPto');
  check('014: прораб Альфы — не админ платформы, компания Альфа, модуль planfact, «Компания» недоступна',
    mf?.is_platform_admin === false && mf.companies.length === 1 && mf.companies[0].name === 'Альфа'
    && JSON.stringify(mf.companies[0].modules) === '["planfact"]' && mf.companies[0].can_manage_company === false, JSON.stringify(mf));
  check('014: ПТО Беты видит только Бету', mb?.companies?.length === 1 && mb.companies[0].name === 'Бета', JSON.stringify(mb?.companies?.map((c) => c.name)));
  check('014: администратор Альфы — «Компания» доступна', (await me('alfaAdmin'))?.companies?.find((c) => c.name === 'Альфа')?.can_manage_company === true);
  const cA = mf?.companies?.[0]?.id;
  for (const k of ['alfaAdmin', 'alfaForeman']) {
    check(`014: ${k} — pf_platform_companies отказ`, !(await rpc('pf_platform_companies', {}, tok[k])).ok);
    check(`014: ${k} — pf_platform_create_company отказ`, !(await rpc('pf_platform_create_company', { p_name: 'REST-взлом' }, tok[k])).ok);
    check(`014: ${k} — pf_platform_set_module отказ`, !(await rpc('pf_platform_set_module', { p_company: cA, p_module: 'planfact', p_enabled: false }, tok[k])).ok);
    check(`014: ${k} — pf_platform_set_company_admin отказ`, !(await rpc('pf_platform_set_company_admin', { p_company: cA, p_email: 'alfa-pto@test.invalid' }, tok[k])).ok);
  }
  check('014: после отказов модуль Альфы включён', JSON.stringify((await me('alfaForeman'))?.companies?.[0]?.modules) === '["planfact"]');
  check('014: anon — pf_my_platform и pf_platform_companies закрыты', !(await rpc('pf_my_platform', {})).ok && !(await rpc('pf_platform_companies', {})).ok);
  const directPA = await fetch(`${URL_}/rest/v1/platform_admins`, { headers: { apikey: ANON, Authorization: `Bearer ${tok.alfaAdmin}`, 'Accept-Profile': 'planfact' } });
  check('014: platform_admins не открыта через REST', !directPA.ok, `статус ${directPA.status}`);
}
// --- P2-0016 (018): хранилище quality по компаниям через REST. Модули Качество/Стройконтроль у тестовых Альфы и Беты
// включаются администратором платформы на время проверки и выключаются в конце (014 ожидает только planfact).
{
  const qProbe = await fetch(`${URL_}/rest/v1/rbi_inspections?select=id&limit=1`, { headers: { apikey: ANON, Authorization: `Bearer ${tok.alfaAdmin}`, 'Accept-Profile': 'quality' } });
  if (qProbe.status === 406 || qProbe.status === 404) { console.log(`NOT RUN: раздел quality не открыт в API (статус ${qProbe.status}) — проверки 018 пропущены`); fails++; }
  else {
    const pl = await login(env.P2_PLATFORM_ADMIN_EMAIL, env.P2_PLATFORM_ADMIN_PASSWORD);
    const tPl = pl.json.access_token;
    check('018: вход администратора платформы', pl.status === 200 && !!tPl);
    const me = async (k) => { const r = await rpc('pf_my_platform', {}, tok[k]); return r.ok ? r.json() : null; };
    const cA = (await me('alfaAdmin'))?.companies?.find((c) => c.name === 'Альфа')?.id;
    const cB = (await me('betaPto'))?.companies?.find((c) => c.name === 'Бета')?.id;
    const setMods = async (on) => { for (const c of [cA, cB]) for (const m of ['quality', 'construction']) {
      const r = await rpc('pf_platform_set_module', { p_company: c, p_module: m, p_enabled: on }, tPl);
      check(`018: модуль ${m} ${on ? 'включён' : 'выключен'} у ${c === cA ? 'Альфы' : 'Беты'}`, r.ok, `статус ${r.status}`); } };
    const H = (k, company, extra = {}) => ({ apikey: ANON, Authorization: `Bearer ${tok[k] || ANON}`, 'Accept-Profile': 'quality', 'Content-Profile': 'quality',
      'Content-Type': 'application/json', ...(company ? { 'x-company-id': company } : {}), ...extra });
    const q = (path, k, company, init = {}) => fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: H(k, company, init.headers) });
    const stampQ = 'REST-018-' + Date.now();
    await setMods(true);
    let asgQ = null;
    try {
      const pRest = (await j(await rpc('pf_company_projects', { p_company: cA }, tok.alfaAdmin))).find((p) => p.name === REST_PROJECT)?.id;
      check('018: объект автопроверок Альфы найден', !!pRest);
      // ПТО Альфы — на время проверок 018 назначен на объект автопроверок (назначение из блока ВОР к этому моменту отозвано)
      const ptoU = (await j(await rpc('pf_list_company_members', { p_company: cA }, tok.alfaAdmin))).find((m) => m.email === 'alfa-pto@test.invalid')?.user_id;
      const ptoR = (await j(await rpc('pf_list_company_roles', { p_company: cA }, tok.alfaAdmin))).find((x) => x.template_code === 'pto')?.id;
      const aQ = await rpc('pf_assign_role', { p_user: ptoU, p_role: ptoR, p_project: pRest }, tok.alfaAdmin);
      check('018: ПТО Альфы назначен на объект автопроверок', aQ.ok, `статус ${aQ.status}`);
      if (aQ.ok) asgQ = await j(aQ);
      // Запись админом Альфы в 5 таблиц: проектная, настройки компании, Стройконтроль v2, библиотека, СК
      const rows = {
        rbi_inspections: { id: stampQ + '-insp', project_code: pRest },
        sk_records: { id: stampQ + '-sk', project_code: pRest, sk_number: stampQ, sk_unique_key: `${pRest}_${stampQ}` },   // номер и ключ СК обязательны (как в public)
        construction_defects_v2: { id: stampQ + '-def' },
        shared_docs: { id: stampQ + '-doc', project_code: pRest },
        rbi_company_settings: { company_id: 'rbi' },
      };
      for (const [t, row] of Object.entries(rows)) {
        const r = await q(t, 'alfaAdmin', cA, { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=representation,resolution=merge-duplicates' } });
        const got = r.ok ? (await r.json())[0] : await r.text();
        check(`018: ${t} — админ Альфы пишет, запись привязана к Альфе`, r.ok && got.core_company_id === cA, r.ok ? '' : `статус ${r.status} ${String(got).slice(0, 160)}`);
      }
      // select=* — у части таблиц нет колонки id (rbi_company_settings, allowed_projects, project_settings)
      const cnt = async (t, k, company, filter) => { const r = await q(`${t}?select=*${filter || ''}`, k, company); return r.ok ? (await r.json()).length : -r.status; };
      check('018: ПТО Альфы (просмотр) видит проверку', await cnt('rbi_inspections', 'alfaPto', cA, `&id=eq.${stampQ}-insp`) === 1);
      const ptoW = await q('rbi_inspections', 'alfaPto', cA, { method: 'POST', body: JSON.stringify({ id: stampQ + '-pto', project_code: pRest }) });
      check('018: ПТО Альфы (без права записи) — запись отклонена', !ptoW.ok, `статус ${ptoW.status}`);
      for (const t of Object.keys(rows)) {
        check(`018: ${t} — ПТО Беты со своей компанией видит 0`, await cnt(t, 'betaPto', cB, `&core_company_id=eq.${cA}`) === 0);
        check(`018: ${t} — ПТО Беты с заголовком Альфы видит 0`, await cnt(t, 'betaPto', cA) === 0);
      }
      const bW = await q('rbi_inspections', 'betaPto', cA, { method: 'POST', body: JSON.stringify({ id: stampQ + '-beta', project_code: pRest }) });
      check('018: Бета пишет в объект Альфы — отказ', !bW.ok, `статус ${bW.status}`);
      const bD = await q(`rbi_inspections?id=eq.${stampQ}-insp`, 'betaPto', cA, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
      check('018: Бета удаляет проверку Альфы — 0 строк', !bD.ok || (await bD.json()).length === 0);
      check('018: без заголовка компании — 0 строк', await cnt('rbi_inspections', 'alfaAdmin', null) === 0);
      const anQ = await fetch(`${URL_}/rest/v1/rbi_inspections?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Accept-Profile': 'quality', 'x-company-id': cA } });
      check('018: anon — отказ или 0 строк', !anQ.ok || (await anQ.json()).length === 0, `статус ${anQ.status}`);
      const noObj = await q('rbi_inspections', 'alfaAdmin', cA, { method: 'POST', body: JSON.stringify({ id: stampQ + '-x', project_code: 'НЕ-ОБЪЕКТ' }) });
      check('018: проверка без объекта ядра — отказ', !noObj.ok, `статус ${noObj.status}`);
      const pub = await fetch(`${URL_}/rest/v1/rbi_inspections?select=id&limit=1`, { headers: { apikey: ANON, Authorization: `Bearer ${tok.alfaAdmin}` } });
      check('018: почтовая учётка в public.rbi_inspections — как до (ADR-067: отказ или 0)', !pub.ok || (await pub.json()).length === 0, `статус ${pub.status}`);
      for (const prof of ['planfact', 'core']) {
        const r = await fetch(`${URL_}/rest/v1/companies?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${tok.alfaAdmin}`, 'Accept-Profile': prof } });
        check(`018: раздел ${prof} по-прежнему закрыт в API`, !r.ok, `статус ${r.status}`);
      }
      // Удаление своей компанией (уборка)
      for (const [t, row] of Object.entries(rows)) {
        const key = t === 'rbi_company_settings' ? `company_id=eq.${cA}` : `id=eq.${row.id}`;
        const d = await q(`${t}?${key}`, 'alfaAdmin', cA, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
        check(`018: ${t} — админ Альфы удаляет`, d.ok && (await d.json()).length === 1, `статус ${d.status}`);
      }
      // Этап 6: «туда-обратно» по всем таблицам quality — обязательные поля из описания API (OpenAPI раздела quality).
      const spec = await (await fetch(`${URL_}/rest/v1/`, { headers: { apikey: ANON, Authorization: `Bearer ${tok.alfaAdmin}`, 'Accept-Profile': 'quality' } })).json();
      const defs = spec.definitions || {};
      const val = (p) => p.format === 'uuid' ? crypto.randomUUID() : p.type === 'boolean' ? false : p.type === 'integer' || p.type === 'number' ? 1
        : p.format === 'jsonb' || p.format === 'json' ? {} : p.type === 'array' ? [] : /timestamp|date/.test(p.format || '') ? new Date().toISOString() : `${stampQ}-v`;
      const tables = Object.keys(defs).filter((t) => !t.startsWith('rpc')).sort();
      check('018: в API раздела quality 55 таблиц', tables.length === 55, String(tables.length));
      let rt = 0;
      for (const t of tables) {
        const d = defs[t]; const row = {};
        for (const c of d.required || []) if (!['core_company_id', 'core_project_id'].includes(c) && !(d.properties[c]?.default !== undefined)) row[c] = val(d.properties[c] || {});
        if (d.properties.project_code) row.project_code = pRest;
        if (d.properties.id && !row.id && d.properties.id.format !== 'uuid') row.id = `${stampQ}-${t}`;
        if (t === 'rbi_company_settings') row.company_id = 'rbi';
        if (t === 'contracts') {   // договор — на подрядчика своей компании
          const cId = `${stampQ}-ctr`;
          await q('contractors', 'alfaAdmin', cA, { method: 'POST', body: JSON.stringify({ id: cId }), headers: { Prefer: 'resolution=merge-duplicates' } });
          row.contractorId = cId;
        }
        const ins = await q(t, 'alfaAdmin', cA, { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=representation,resolution=merge-duplicates' } });
        const got = ins.ok ? (await ins.json())[0] : null;
        if (!got) { check(`018: ${t} — запись админом Альфы`, false, `статус ${ins.status} ${(await ins.text().catch(() => '')).slice(0, 120)}`); continue; }
        const keyCol = d.properties.id ? 'id' : t === 'rbi_company_settings' ? 'company_id' : Object.keys(row)[0];
        const key = `${keyCol}=eq.${encodeURIComponent(got[keyCol])}`;
        const seenPto = await cnt(t, 'alfaPto', cA, `&${key}`);
        const seenBeta = await cnt(t, 'betaPto', cB, `&${key}`);
        const seenBetaHdr = await cnt(t, 'betaPto', cA, `&${key}`);
        const del = await q(`${t}?${key}`, 'alfaAdmin', cA, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
        // P2-0018 (023): черновики и очередь — только свои (ПТО чужие не видит)
        const ptoSees = ['rbi_draft_sessions', 'rbi_sync_queue'].includes(t) ? 0 : 1;
        const okT = got.core_company_id === cA && seenPto === ptoSees && seenBeta === 0 && seenBetaHdr === 0 && del.ok;
        if (okT) rt++; else check(`018: ${t} — туда-обратно`, false, `компания ${got.core_company_id === cA}, ПТО ${seenPto}, Бета ${seenBeta}/${seenBetaHdr}, удаление ${del.status}`);
      }
      await q(`contractors?id=eq.${stampQ}-ctr`, 'alfaAdmin', cA, { method: 'DELETE' });
      check(`018: «туда-обратно» по таблицам quality: ${rt} из ${tables.length}`, rt === tables.length);

      // 018d через настоящий Storage API: закрытый бакет компании, путь <компания>/…
      const st = (path, k, init = {}) => fetch(`${URL_}/storage/v1/object/${path}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${tok[k] || ANON}`, ...(init.headers || {}) } });
      const fileA = `quality-inspection-photos/${cA}/REST-018/${stampQ}.txt`;
      const up = await st(fileA, 'alfaAdmin', { method: 'POST', body: 'REST-018', headers: { 'Content-Type': 'text/plain' } });
      check('018d: админ Альфы загружает файл в папку своей компании', up.ok, `статус ${up.status}`);
      check('018d: админ Альфы скачивает файл', (await st(`authenticated/${fileA}`, 'alfaAdmin')).status === 200);
      check('018d: ПТО Альфы (просмотр) скачивает файл', (await st(`authenticated/${fileA}`, 'alfaPto')).status === 200);
      check('018d: ПТО Беты не скачивает файл Альфы', (await st(`authenticated/${fileA}`, 'betaPto')).status !== 200);
      check('018d: по публичной ссылке файл не отдаётся', (await fetch(`${URL_}/storage/v1/object/public/${fileA}`)).status !== 200);
      check('018d: anon не скачивает файл', (await st(`authenticated/${fileA}`, null)).status !== 200);
      const upB = await st(`quality-inspection-photos/${cA}/REST-018/${stampQ}-beta.txt`, 'betaPto', { method: 'POST', body: 'x', headers: { 'Content-Type': 'text/plain' } });
      check('018d: ПТО Беты не загружает в папку Альфы', !upB.ok, `статус ${upB.status}`);
      const upP = await st(`quality-inspection-photos/${cA}/REST-018/${stampQ}-pto.txt`, 'alfaPto', { method: 'POST', body: 'x', headers: { 'Content-Type': 'text/plain' } });
      check('018d: ПТО Альфы (без права записи) не загружает', !upP.ok, `статус ${upP.status}`);
      const delB = await st('quality-inspection-photos', 'betaPto', { method: 'DELETE', body: JSON.stringify({ prefixes: [fileA.slice('quality-inspection-photos/'.length)] }), headers: { 'Content-Type': 'application/json' } });
      check('018d: ПТО Беты не удаляет файл Альфы', (await st(`authenticated/${fileA}`, 'alfaAdmin')).status === 200, `статус удаления ${delB.status}`);
      const delA = await st('quality-inspection-photos', 'alfaAdmin', { method: 'DELETE', body: JSON.stringify({ prefixes: [fileA.slice('quality-inspection-photos/'.length)] }), headers: { 'Content-Type': 'application/json' } });
      check('018d: админ Альфы удаляет файл', delA.ok && (await st(`authenticated/${fileA}`, 'alfaAdmin')).status !== 200, `статус ${delA.status}`);

      // 018e: подрядчик из Качества → черновик в «Контрагентах» → справочник Качества на всех объектах компании
      const ctrName = `REST-018 Подрядчик ${stampQ}`, ctrKey = `rest-018-${stampQ}`;
      const dIns = await q('contractor_directory', 'alfaAdmin', cA, { method: 'POST', body: JSON.stringify({ project_code: pRest, canonical_key: ctrKey, display_name: ctrName }) });
      check('018e: админ Альфы добавляет подрядчика в Качестве', dIns.ok, `статус ${dIns.status}`);
      const cpA = await j(await rpc('pf_counterparties_list', { p_company: cA, p_include_archived: false }, tok.alfaAdmin));
      const cp = Array.isArray(cpA) ? cpA.find((c) => c.name === ctrName) : null;
      check('018e: подрядчик появился в «Контрагентах» Альфы черновиком без ИНН', !!cp && cp.draft === true && !cp.inn && cp.kinds.includes('contractor'), JSON.stringify(cp));
      const cpB = await j(await rpc('pf_counterparties_list', { p_company: cB, p_include_archived: false }, tok.betaPto));
      check('018e: Бета этого подрядчика не видит', Array.isArray(cpB) && !cpB.some((c) => c.name === ctrName));
      const dirRows = await j(await q(`contractor_directory?select=project_code&canonical_key=eq.${ctrKey}`, 'alfaAdmin', cA));
      const projA = (await j(await rpc('pf_company_projects', { p_company: cA }, tok.alfaAdmin))).filter((p) => !p.archived_at).map((p) => p.id);
      check('018e: подрядчик есть в справочнике Качества на всех объектах Альфы', Array.isArray(dirRows) && projA.every((p) => dirRows.some((r) => r.project_code === p)),
        `объектов ${projA.length}, строк ${Array.isArray(dirRows) ? dirRows.length : dirRows}`);
      check('018e: Бета не видит справочник Альфы', await cnt('contractor_directory', 'betaPto', cA, `&canonical_key=eq.${ctrKey}`) === 0);
      // уборка: контрагент — в архив (удаления контрагентов нет), строки справочника Качества — удалить
      if (cp) await rpc('pf_counterparties_archive', { p_id: cp.id, p_archived: true }, tok.alfaAdmin);
      await q(`contractor_directory?canonical_key=eq.${ctrKey}`, 'alfaAdmin', cA, { method: 'DELETE' });

      // P2-0018 (020/021): видимость по ролям проверяет сервер. alfa-foreman временно — инженер СК на объекте автопроверок,
      // затем представитель подрядчика своей фирмы, затем подрядчик без фирмы. ПТО Альфы (просмотр) — свои объекты.
      const accQ = async (k) => j(await q('rpc/my_access', k, cA, { method: 'POST', body: '{}' }));
      const acc0 = await accQ('alfaAdmin');
      if (!acc0 || typeof acc0 !== 'object' || !('projects' in acc0)) { console.log('NOT RUN: 020 на сервере не применена — проверки P2-0018 пропущены'); fails++; }
      else {
        const s18 = 'REST-0018-' + Date.now();
        const members = await j(await rpc('pf_list_company_members', { p_company: cA }, tok.alfaAdmin));
        const forU = members.find((m) => m.email === 'alfa-foreman@test.invalid')?.user_id;
        const forBase = members.filter((m) => m.user_id === forU && m.is_active && (!m.project_id || m.project_id === pRest));
        const rolesA = await j(await rpc('pf_list_company_roles', { p_company: cA }, tok.alfaAdmin));
        const roleOf = (tpl) => rolesA.find((x) => x.template_code === tpl)?.id;
        if (!forU || forBase.length) { console.log('NOT RUN: у alfa-foreman есть назначение на объект автопроверок или на всю компанию — матрица P2-0018 пропущена'); fails++; }
        else {
          const asg18 = [];
          const assign = async (tpl, cpId) => { const r = await rpc('pf_assign_role', { p_user: forU, p_role: roleOf(tpl), p_project: pRest, ...(cpId ? { p_counterparty: cpId } : {}) }, tok.alfaAdmin);
            const id = r.ok ? await j(r) : null; if (id) asg18.push(id); check(`0018: alfa-foreman назначен «${tpl}»${cpId ? ' с фирмой' : ''}`, !!id, `статус ${r.status}`); return id; };
          const revoke = async (id) => { if (id && (await rpc('pf_revoke_assignment', { p_assignment: id }, tok.alfaAdmin)).ok) asg18.splice(asg18.indexOf(id), 1); };
          const row = (t, extra) => { const d = defs[t]; const r0 = {};
            for (const c of d.required || []) if (!['core_company_id', 'core_project_id'].includes(c) && d.properties[c]?.default === undefined) r0[c] = val(d.properties[c] || {});
            return { ...r0, project_code: pRest, ...extra }; };
          const ids = (t, k) => q(`${t}?select=id&id=like.${s18}*&order=id`, k, cA).then(async (r) => r.ok ? (await r.json()).map((x) => x.id.slice(s18.length + 1)).join(',') : `ERR${r.status}`);
          const patch = async (t, id, k, body) => { const r = await q(`${t}?id=eq.${s18}-${id}`, k, cA, { method: 'PATCH', body: JSON.stringify(body), headers: { Prefer: 'return=representation' } });
            return r.ok ? (await r.json()).length : -r.status; };
          const kName = `REST-0018 Фирма ${s18}`, kKey = `rest-0018-${s18}`;
          let cp18 = null;
          try {
            await q('contractor_directory', 'alfaAdmin', cA, { method: 'POST', body: JSON.stringify({ project_code: pRest, canonical_key: kKey, display_name: kName }) });
            cp18 = (await j(await rpc('pf_counterparties_list', { p_company: cA, p_include_archived: false }, tok.alfaAdmin))).find((c) => c.name === kName);
            check('0018: фирма-подрядчик для проверки в «Контрагентах»', !!cp18);
            const w = async (t, id, extra) => { const r = await q(t, 'alfaAdmin', cA, { method: 'POST', body: JSON.stringify(row(t, { id: `${s18}-${id}`, ...extra })) });
              check(`0018: админ пишет ${t} ${id}`, r.ok, r.ok ? '' : `статус ${r.status} ${(await r.text()).slice(0, 120)}`); };
            await w('rbi_inspections', 'i1', { contractor_name: kName });
            await w('rbi_inspections', 'i2', { contractor_name: 'REST-0018 чужая фирма' });
            await w('construction_defects', 'd1', { contractor: kName });
            await w('construction_defects', 'd2', { contractor: 'REST-0018 чужая фирма' });

            const aE = await assign('qc_engineer');
            const iE = await q('rbi_inspections', 'alfaForeman', cA, { method: 'POST', body: JSON.stringify(row('rbi_inspections', { id: `${s18}-i3` })) });
            check('0018: инженер СК создаёт свою проверку', iE.ok, `статус ${iE.status}`);
            check('0018: инженер СК видит только свои проверки', await ids('rbi_inspections', 'alfaForeman') === 'i3', await ids('rbi_inspections', 'alfaForeman'));
            check('0018: инженер СК не правит чужую проверку', await patch('rbi_inspections', 'i1', 'alfaForeman', { location: 'x' }) <= 0);
            check('0018: инженер СК правит свою проверку', await patch('rbi_inspections', 'i3', 'alfaForeman', { location: 'x' }) === 1);
            check('0018: ПТО (свои объекты) видит все проверки объекта', await ids('rbi_inspections', 'alfaPto') === 'i1,i2,i3', await ids('rbi_inspections', 'alfaPto'));
            check('0018: ПТО не правит проверку', await patch('rbi_inspections', 'i3', 'alfaPto', { location: 'y' }) <= 0);
            check('0018: ПТО не правит замечание', await patch('construction_defects', 'd1', 'alfaPto', { updated_at: new Date().toISOString() }) <= 0);
            await revoke(aE);

            const aC = await assign('contractor_rep', cp18?.id);
            check('0018: подрядчик видит только проверки своей фирмы', await ids('rbi_inspections', 'alfaForeman') === 'i1', await ids('rbi_inspections', 'alfaForeman'));
            check('0018: подрядчик видит только замечания своей фирмы', await ids('construction_defects', 'alfaForeman') === 'd1', await ids('construction_defects', 'alfaForeman'));
            check('0018: подрядчик правит замечание своей фирмы', await patch('construction_defects', 'd1', 'alfaForeman', { updated_at: new Date().toISOString() }) === 1);
            check('0018: подрядчик не правит замечание чужой фирмы', await patch('construction_defects', 'd2', 'alfaForeman', { updated_at: new Date().toISOString() }) <= 0);
            check('0018: подрядчик не правит проверку Качества', await patch('rbi_inspections', 'i1', 'alfaForeman', { location: 'z' }) <= 0);
            const accC = await accQ('alfaForeman');
            check('0018: экран Качества получает фирму и объект подрядчика', accC?.contractor?.name === kName && Array.isArray(accC?.projects) && accC.projects.includes(pRest), JSON.stringify(accC).slice(0, 200));
            const memC = (await j(await rpc('pf_list_company_members', { p_company: cA }, tok.alfaAdmin))).find((m) => m.assignment_id === aC);
            check('0018: «Компания → люди» показывает фирму назначения', memC?.counterparty_name === kName);
            await revoke(aC);

            const a0 = await assign('contractor_rep');
            check('0018: подрядчик без фирмы не видит записей', await ids('rbi_inspections', 'alfaForeman') === '' && await ids('construction_defects', 'alfaForeman') === '');
            await revoke(a0);
            const spoof = await q('rbi_inspections?select=id', 'betaPto', cA);
            check('0018: подмена x-company-id (Бета → Альфа) — 0 строк', !spoof.ok || (await spoof.json()).length === 0);
          } finally {
            for (const id of [...asg18]) await revoke(id);
            check('0018: временные назначения alfa-foreman отозваны', asg18.length === 0);
            for (const [t, l] of [['rbi_inspections', ['i1', 'i2', 'i3']], ['construction_defects', ['d1', 'd2']]])
              for (const id of l) await q(`${t}?id=eq.${s18}-${id}`, 'alfaAdmin', cA, { method: 'DELETE' });
            if (cp18) await rpc('pf_counterparties_archive', { p_id: cp18.id, p_archived: true }, tok.alfaAdmin);
            await q(`contractor_directory?canonical_key=eq.${kKey}`, 'alfaAdmin', cA, { method: 'DELETE' });
          }
        }
      }
    } finally {
      if (asgQ) check('018: назначение ПТО на объект автопроверок отозвано', (await rpc('pf_revoke_assignment', { p_assignment: asgQ }, tok.alfaAdmin)).ok);
      await setMods(false);
    }
  }
}
// --- P2-0025: лимит строк сервера (max-rows), только чтение planfact. Выдача, меньшая лимита, лимит не показывает —
// тогда печатается нижняя граница; если выдача обрезана (строк меньше общего числа) — печатается сам лимит.
{
  const r = await fetch(`${URL_}/rest/v1/rpc/pf_list_works`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${tok.alfaPto}`, 'Content-Type': 'application/json', Prefer: 'count=exact' }, body: JSON.stringify({ p_project: pA }) });
  const rows = r.ok ? await r.json() : null;
  const total = Number(String(r.headers.get('content-range') || '').split('/')[1]);
  const n = Array.isArray(rows) ? rows.length : -1;
  check('P2-0025: лимит строк сервера — чтение planfact', n >= 0 && Number.isFinite(total),
    n < total ? `лимит = ${n} (выдача обрезана, всего ${total})` : `лимит не достигнут: не меньше ${n} (наибольшая тестовая выдача)`);
}
// --- P2-0028 (032): сотрудник — учётка функцией сервера; вход, смена, сброс, отключение через настоящий GoTrue.
// Каждый запуск — новая учётка p2-0028-<время>@test.invalid в «Альфе»; в конце она отключена (вход закрыт). Пароли не печатаются.
{
  const probe = await rpc('pf_my_profile', {}, tok.alfaAdmin);
  if (probe.status === 404) { console.log('NOT RUN: миграция 032 не применена — проверки сотрудников пропущены'); fails++; }
  else {
    const auth = (path, method, body, token) => fetch(`${URL_}/auth/v1/${path}`, { method, headers: { apikey: ANON, Authorization: `Bearer ${token || ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const cA = (await j(await rpc('pf_my_admin_companies', {}, tok.alfaAdmin)))?.[0]?.company_id;
    const roleFor = (await j(await rpc('pf_list_company_roles', { p_company: cA }, tok.alfaAdmin))).find((x) => x.template_code === 'foreman')?.id;
    const email = `p2-0028-${Date.now()}@test.invalid`;
    const addArgs = { p_company: cA, p_email: email, p_full_name: 'Тестов Т.Т.', p_role: roleFor, p_project: pA };
    check('032: прораб не добавляет сотрудника', !(await rpc('pf_company_add_member', addArgs, tok.alfaForeman)).ok);
    check('032: ПТО Беты не добавляет в Альфу', !(await rpc('pf_company_add_member', addArgs, tok.betaPto)).ok);
    check('032: anon не добавляет', !(await rpc('pf_company_add_member', addArgs)).ok);
    const add = await j(await rpc('pf_company_add_member', addArgs, tok.alfaAdmin));
    const nu = Array.isArray(add) ? add[0] : null, temp = nu?.temp_password;
    check('032: админ добавил — новая учётка и временный пароль', !!nu?.created && typeof temp === 'string' && temp.length === 14);
    const l1 = await login(email, temp);
    check('032: вход временным паролем (GoTrue 200)', l1.status === 200 && !!l1.json.access_token, `статус ${l1.status}`);
    const t1 = l1.json.access_token, rt1 = l1.json.refresh_token;
    const me1 = await j(await rpc('pf_my_profile', {}, t1));
    check('032: флаг «сменить пароль» стоит, ФИО', me1?.must_change_password === true && me1?.full_name === 'Тестов Т.Т.' && me1?.email === email);
    check('032: без смены пароля флаг не снять', !(await rpc('pf_password_changed', {}, t1)).ok);
    const myp = await j(await rpc('pf_my_projects', {}, t1));
    check('032: роль на объект работает (видит объект)', Array.isArray(myp) && myp.some((p) => p.id === pA));
    const own = `Own-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    const ch = await auth('user', 'PUT', { password: own }, t1);
    check('032: смена пароля через Auth (PUT /user 200)', ch.status === 200, `статус ${ch.status}`);
    check('032: pf_password_changed после смены', (await rpc('pf_password_changed', {}, t1)).ok);
    check('032: флаг снят', (await j(await rpc('pf_my_profile', {}, t1)))?.must_change_password === false);
    check('032: вход своим паролем 200, временным — 400', (await login(email, own)).status === 200 && (await login(email, temp)).status === 400);
    const uid = nu?.user_id;
    check('032: прораб не сбрасывает пароль', !(await rpc('pf_company_reset_password', { p_company: cA, p_user: uid }, tok.alfaForeman)).ok);
    const temp2 = await j(await rpc('pf_company_reset_password', { p_company: cA, p_user: uid }, tok.alfaAdmin));
    check('032: сброс — новый временный пароль', typeof temp2 === 'string' && temp2.length === 14 && temp2 !== temp);
    check('032: после сброса старый пароль 400, новый 200', (await login(email, own)).status === 400 && (await login(email, temp2)).status === 200);
    const rf = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: rt1 }) });
    check('032: после сброса прежний сеанс не продлевается', rf.status >= 400, `статус ${rf.status}`);
    const t2 = (await login(email, temp2)).json.access_token;
    check('032: после сброса флаг снова стоит', (await j(await rpc('pf_my_profile', {}, t2)))?.must_change_password === true);
    // 032a: ФИО — сам себе, администратор; прораб чужое не меняет
    const nm = await rpc('pf_set_full_name', { p_user: uid, p_full_name: 'Тестов Тест Тестович' }, t2);
    check('032a: сотрудник меняет своё ФИО', nm.ok, `статус ${nm.status}`);
    check('032a: прораб не меняет чужое ФИО', !(await rpc('pf_set_full_name', { p_user: uid, p_full_name: 'Взлом В.В.' }, tok.alfaForeman)).ok);
    check('032a: администратор меняет ФИО сотрудника', (await rpc('pf_set_full_name', { p_user: uid, p_full_name: 'Тестов Т.Т.' }, tok.alfaAdmin)).ok);
    check('032a: pf_my_profile — новое ФИО', (await j(await rpc('pf_my_profile', {}, t2)))?.full_name === 'Тестов Т.Т.');
    check('032: прораб не отключает',!(await rpc('pf_company_disable_member', { p_company: cA, p_user: uid }, tok.alfaForeman)).ok);
    check('032: админ отключил доступ', (await rpc('pf_company_disable_member', { p_company: cA, p_user: uid }, tok.alfaAdmin)).ok);
    const l3 = await login(email, temp2);
    check('032: отключённый не входит (400)', l3.status === 400 && !l3.json.access_token, `статус ${l3.status}`);
    const myp3 = await j(await rpc('pf_my_projects', {}, t2));
    check('032: отключённый с ещё живым токеном объектов не видит', Array.isArray(myp3) && myp3.length === 0);
    const mem = await j(await rpc('pf_list_company_members', { p_company: cA }, tok.alfaAdmin));
    check('032: в списке — отключён, ФИО, без ролей', Array.isArray(mem) && mem.some((m) => m.user_id === uid && m.disabled_at && !m.assignment_id && m.full_name === 'Тестов Т.Т.'));
    const meAdm = await j(await rpc('pf_my_profile', {}, tok.alfaAdmin));
    check('032: админ себе пароль не сбрасывает', !(await rpc('pf_company_reset_password', { p_company: cA, p_user: meAdm?.user_id }, tok.alfaAdmin)).ok);
  }
}
console.log(fails ? `ИТОГ: FAIL (${fails})` : 'ИТОГ: PASS');
process.exit(fails ? 1 : 0);
