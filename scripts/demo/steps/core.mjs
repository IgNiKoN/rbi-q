// P2-0053 этап 2. Ядро «ЖК Демо»: подразделение, подрядчики, карточка проекта, три корпуса и паркинг (места — функциями
// «Компания → Объекты и места»), участие сотрудников, бригады, 20 видов работ, демо-роли кнопки «Демо», PDF-планы этажей.
// Администратор компании — карточка, места и люди; ПТО — виды работ и планы (как на экранах).
import { randomUUID } from 'node:crypto';
import { floorPlanPdf } from './pdf.mjs';

/** Место по пути «k2/Секция 1/5 этаж» (ключ объекта из data/demo.json, дальше — имена мест). */
export function placeByPath(places, objects, path) {
  const [obj, ...rest] = path.split('/');
  let cur = objects[obj];
  for (const name of rest) {
    const next = places.find((p) => p.parent_id === cur && p.name === name);
    if (!next) throw new Error(`нет места «${path}» (не найдено «${name}»)`);
    cur = next.id;
  }
  return cur;
}

/** Все места проекта: «Объекты и места» отдают уровень за уровнем (pf_project_places), обходим узлы с детьми. */
export async function allPlaces(client, ok, projectId) {
  const out = [];
  let level = [null];
  while (level.length) {
    const next = [];
    for (const parent of level) {
      const rows = ok(await client.rpc('pf_project_places', { p_project: projectId, p_parent: parent }), 'места');
      for (const r of rows) { out.push(r); if (r.child_count > 0) next.push(r.id); }
    }
    level = next;
  }
  return out;
}

export async function seedCore(ctx) {
  const { DATA, as, ok, day, log, url } = ctx;
  const admin = await as('admin');
  const plat = ok(await admin.rpc('pf_my_platform'), 'мои компании');
  const company = (plat.companies || []).find((c) => c.is_demo && c.name === DATA.company.name);
  if (!company) throw new Error(`Нет демо-компании «${DATA.company.name}» — сначала SQL учёток (scripts/demo/accounts.mjs)`);
  const companyId = company.id;
  if (ok(await admin.rpc('pf_project_catalog', { p_company: companyId }), 'проекты').some((p) => p.name === DATA.project.name)) {
    throw new Error(`«${DATA.project.name}» уже есть — сначала сброс (scripts/demo/reset.sql)`);
  }
  const members = ok(await admin.rpc('pf_list_company_members', { p_company: companyId }), 'сотрудники');
  const userId = (key) => {
    const m = members.find((x) => x.email === `zd-${DATA.company.key}-${key}@demo.invalid`);
    if (!m) throw new Error(`нет учётки «${key}»`);
    return m.user_id;
  };
  const roles = ok(await admin.rpc('pf_list_company_roles', { p_company: companyId }), 'роли');
  const roleId = (code) => roles.find((r) => r.template_code === code).id;

  const divisionId = randomUUID();
  ok(await admin.rpc('pf_save_division', { p_company: companyId, p_id: divisionId, p_name: DATA.division, p_head_user: userId('boss'), p_archived: false }), 'подразделение');

  const cps = {};
  for (const cp of DATA.counterparties) {
    cps[cp.key] = ok(await admin.rpc('pf_counterparties_save', { p_company: companyId, p_id: null, p_name: cp.name, p_inn: cp.inn, p_kpp: null,
      p_kinds: cp.kinds, p_requisites: {} }), cp.name);
  }

  const p = DATA.project;
  const projectId = randomUUID();
  ok(await admin.rpc('pf_save_project', { p_company: companyId, p_id: projectId, p_card: {
    name: p.name, code: p.code, address: p.address, division_id: divisionId, manager_user_id: userId('pm'), customer_id: cps.customer,
    stage: p.stage, our_role: p.our_role, timezone: p.timezone, country: p.country,
    planned_start: day(p.planned_start_days), planned_finish: day(p.planned_finish_days) } }), 'проект');

  // места: объект → «заполнить объект» (секции × этажи × квартиры, кровля) → МОП в каждой секции; паркинг — свои места
  const objects = {};
  for (const o of DATA.objects) {
    const id = randomUUID();
    ok(await admin.rpc('pf_save_place', { p_project: projectId, p_id: id, p_parent: null, p_type: 'object', p_name: o.name, p_object_kind: o.kind,
      p_build_no: o.build_no, p_bti_no: null }), o.name);
    objects[o.key] = id;
    if (o.sections) {
      ok(await admin.rpc('pf_fill_object', { p_object: id, p_sections: o.sections, p_floors: o.floors, p_apartments_per_floor: o.apartments,
        p_first_floor: 1, p_numbering: 'through', p_start_no: 1, p_basement: false, p_roof: !!o.roof }), `${o.name}: секции и этажи`);
    }
  }
  let places = await allPlaces(admin, ok, projectId);
  for (const o of DATA.objects) {
    for (const s of places.filter((x) => x.parent_id === objects[o.key] && x.node_type === 'section')) {
      ok(await admin.rpc('pf_save_place', { p_project: projectId, p_id: randomUUID(), p_parent: s.id, p_type: 'other', p_name: 'МОП', p_object_kind: null,
        p_build_no: null, p_bti_no: null }), `${o.name}, ${s.name}: МОП`);
    }
    for (const name of o.places || []) {
      ok(await admin.rpc('pf_save_place', { p_project: projectId, p_id: randomUUID(), p_parent: objects[o.key], p_type: 'other', p_name: name,
        p_object_kind: null, p_build_no: null, p_bti_no: null }), name);
    }
  }
  places = await allPlaces(admin, ok, projectId);
  const at = (path) => placeByPath(places, objects, path);

  // участие сотрудников: роль на компанию / проект / часть проекта, прораб — ответственный за факт, подрядчик — своя фирма
  for (const x of DATA.participation) {
    ok(await admin.rpc('pf_set_participation', { p_users: [userId(x.user)], p_role: roleId(x.role), p_project: x.project || x.places ? projectId : null,
      p_locations: x.places ? x.places.map(at) : null, p_fact_owner: !!x.fact_owner, p_valid_to: null, p_objects: null,
      p_counterparty: x.counterparty ? cps[x.counterparty] : null }), `участие ${x.user}`);
  }

  const brigades = {};
  for (const b of DATA.brigades) brigades[b.key] = ok(await admin.rpc('pf_brigade_save', { p_company: companyId, p_id: null, p_name: b.name, p_leader: b.leader, p_phone: null }), b.name);

  // виды работ (ПТО, как «ВОР → Виды работ»)
  const pto = await as('pto');
  const units = ok(await pto.rpc('pf_list_units', { p_company: companyId }), 'единицы');
  const unitId = (code) => { const u = units.find((x) => x.code === code); if (!u) throw new Error('нет единицы ' + code); return u.id; };
  const wtRows = ok(await pto.rpc('pf_vor_add_work_types', { p_project: projectId, p_items: DATA.work_types.map((w) => ({ name: w.name, unit_id: unitId(w.unit) })) }), 'виды работ');
  const workTypes = {};
  for (const w of DATA.work_types) {
    const r = (Array.isArray(wtRows) ? wtRows : []).find((x) => x.name === w.name);
    if (!r) throw new Error('вид работ не создан: ' + w.name);
    workTypes[w.key] = { ...w, id: r.id, unitCode: w.unit, unit: unitId(w.unit) };
  }

  // PDF-планы этажей (ПТО; закрытый бакет ядра, версия 1 — текущая)
  const plans = [];
  for (const pl of DATA.plans) {
    const sec = DATA.objects.find((o) => o.key === pl.object);
    const floorId = at(`${pl.object}/${pl.section}/эт. ${pl.floor}`);
    const docId = randomUUID();
    const path = `${companyId}/${projectId}/${floorId}/${docId}.pdf`;
    const pdf = floorPlanPdf({ title: `ZhK Demo  ${sec.build_no.replace('К', 'K')}  section ${pl.section.replace(/\D/g, '')}  floor ${pl.floor}`, apartments: sec.apartments,
      firstNo: firstApartmentNo(sec, pl.section, pl.floor) });
    ok(await pto.storage.from('core-place-plans').upload(path, pdf, { contentType: 'application/pdf', upsert: false }), 'файл плана');
    const fileUrl = `${url}/storage/v1/object/public/core-place-plans/${path}`;
    ok(await pto.rpc('pf_add_place_plan', { p_location: floorId, p_id: docId, p_url: fileUrl, p_name: `План ${sec.build_no} ${pl.section.replace('Секция ', 'с.')} эт.${pl.floor}.pdf`,
      p_size: pdf.length }), 'план этажа');
    plans.push({ floorId, docId, path, url: fileUrl, ...pl });
  }

  // демо-роли кнопки «Демо»
  const demoRoles = DATA.demo_roles.map((r) => ({ code: r.code, title: r.title, hint: r.hint, sort: r.sort,
    project: r.project ? projectId : null, location: r.place ? at(r.place) : null, counterparty: r.counterparty ? cps[r.counterparty] : null }));
  ok(await admin.rpc('pf_demo_setup', { p_company: companyId, p_roles: demoRoles }), 'демо-роли');

  const summary = { places: places.length, counterparties: Object.keys(cps).length, workTypes: Object.keys(workTypes).length, plans: plans.length,
    demoRoles: demoRoles.length, people: DATA.company.users.length };
  log(`ядро: проект «${p.name}», мест ${summary.places}, подрядчиков ${summary.counterparties - 1}, видов работ ${summary.workTypes}, планов ${summary.plans}, демо-ролей ${summary.demoRoles}`);
  return { companyId, projectId, divisionId, objects, places, at, cps, brigades, workTypes, plans, userId, roleId, summary };
}

/** Номер первой квартиры этажа при сквозной нумерации по объекту (как pf_fill_object: секция за секцией, снизу вверх). */
export function firstApartmentNo(obj, section, floor) {
  const s = Number(String(section).replace(/\D/g, '')) || 1;
  return (s - 1) * obj.floors * obj.apartments + (floor - 1) * obj.apartments + 1;
}
