// Стенд P2-0048 этап 5: План/Факт по области (как 047). ?as=<почта> — кто вошёл:
//   ivanov@stand.invalid — прораб, ЖК Альфа, секции 1–2, ответственный за факт;
//   petrov@stand.invalid — прораб, секция 3, без «ответственного»;
//   rp@stand.invalid (и любой другой) — РП, весь проект (подтверждает факт, вносит «за кого»).
// Списки отдают только область; отказы — тем же текстом, что 047. Подставные данные; в сеть ничего не уходит.
(function () {
  var W = window, prev = W.__standRpc, ME = W.__standEmail || 'rp@stand.invalid';
  var TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
  var addDays = function (d, k) { var t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };
  var USERS = { 'u-iv': ['ivanov@stand.invalid', 'Иванов А. И.'], 'u-pet': ['petrov@stand.invalid', 'Петров П. П.'], 'u-rp': ['rp@stand.invalid', 'Руднев Р. П.'] };
  var uidOf = function (email) { for (var k in USERS) if (USERS[k][0] === email) return k; return 'u-rp'; };
  var UID = uidOf(ME);
  var ASG = { 'u-iv': { roots: ['pa-s1', 'pa-s2'], owner: true }, 'u-pet': { roots: ['pa-s3'], owner: false }, 'u-rp': { roots: null, owner: false } };
  var BASE = ['planfact.works.view', 'planfact.fact.view', 'planfact.fact.create', 'planfact.checklist.view'];
  var PERMS = UID === 'u-rp' ? BASE.concat(['planfact.fact.approve', 'planfact.money.view', 'planfact.ks2.view', 'planfact.ks2.edit', 'planfact.vor.manage', 'planfact.works.edit', 'planfact.plan.approve']) : BASE;
  var PROJ = { id: 'pa', name: 'ЖК Альфа', code: 'ALFA', company_id: 'c1', archived_at: null, created_at: '2026-09-01', can_manage: UID === 'u-rp', planned_start: '2026-09-01', planned_finish: addDays(TODAY, 90) };
  // дерево: Корпус 1 → Секции 1–3 → этажи 1–5; Паркинг
  var nodes = [];
  function n(id, parent, type, name) { nodes.push({ id: id, parent_id: parent, node_type: type, name: name, sort_order: nodes.length }); return id; }
  var k1 = n('pa-k1', null, 'object', 'Корпус 1');
  for (var s = 1; s <= 3; s++) { var sid = n('pa-s' + s, k1, 'section', 'Секция ' + s); for (var f = 1; f <= 5; f++) n(sid + '-f' + f, sid, 'floor', f + ' этаж'); }
  n('pa-park', null, 'object', 'Паркинг');
  var byId = function (id) { return nodes.find(function (x) { return x.id === id; }); };
  var path = function (x) { return (x.parent_id ? path(byId(x.parent_id)) + ' · ' : '') + x.name; };
  var depth = function (x) { return x.parent_id ? depth(byId(x.parent_id)) + 1 : 1; };
  var under = function (id, root) { for (var x = byId(id); x; x = x.parent_id ? byId(x.parent_id) : null) if (x.id === root) return true; return false; };
  var areaOf = function (uid) { var a = ASG[uid]; return a.roots ? nodes.filter(function (x) { return a.roots.some(function (r) { return under(x.id, r); }); }).map(function (x) { return x.id; }) : null; };
  var AREA = areaOf(UID);
  var inArea = function (loc) { return !AREA || AREA.indexOf(loc) >= 0; };
  var visibleNode = function (id) { return !AREA || AREA.some(function (a) { return under(a, id); }); };   // область и её родители
  var owners = function (loc) { return Object.keys(ASG).filter(function (u) { var a = ASG[u]; return a.owner && a.roots && a.roots.some(function (r) { return under(loc, r); }); }); };
  // позиции: на каждом этаже секций — 4 работы
  var WORKS = [['Штукатурка стен', 'м²', 120], ['Стяжка пола', 'м²', 80], ['Электромонтаж', 'м²', 80], ['Двери входные', 'шт.', 4]];
  var pos = [];
  nodes.filter(function (x) { return x.node_type === 'floor'; }).forEach(function (fl) { WORKS.forEach(function (w, i) { pos.push({ id: fl.id + '-w' + i, loc: fl.id, work: w[0], unit: w[1], plan: w[2] }); }); });
  var posById = function (id) { return pos.find(function (p) { return p.id === id; }); };
  var entries = [], eseq = 0;
  function add(pid, qty, date, by, behalf, status, note) { var e = { id: 'f' + (++eseq), position_id: pid, qty: qty, work_date: date, status: status || 'accepted', created_by: by, on_behalf_of: behalf || null,
    created_at: date + 'T09:' + String(10 + eseq % 50) + ':00Z', brigade: 'Бригада Иванова', note: note || null, batch_id: null, decided_by: null, decided_at: null, decision_note: null }; entries.push(e); return e; }
  add('pa-s1-f1-w0', 120, addDays(TODAY, -12), 'u-iv'); add('pa-s1-f1-w1', 80, addDays(TODAY, -10), 'u-iv'); add('pa-s1-f2-w0', 60, addDays(TODAY, -5), 'u-iv');
  add('pa-s2-f1-w0', 40, addDays(TODAY, -3), 'u-iv'); add('pa-s3-f1-w0', 50, addDays(TODAY, -4), 'u-pet'); add('pa-s3-f2-w2', 30, addDays(TODAY, -2), 'u-pet');
  add('pa-s1-f3-w0', 140, addDays(TODAY, -1), 'u-iv', null, 'pending_approval');
  var sum = function (id, st, from) { return entries.filter(function (e) { return e.position_id === id && e.status === st && (!from || e.work_date >= from); }).reduce(function (a, e) { return a + e.qty; }, 0); };
  var r3 = function (v) { return Math.round(v * 1000) / 1000; };
  var err = function (m, c) { return { __error: m, code: c || '22023' }; };
  var mail = function (u) { return u ? USERS[u][0] : null; };
  var mine = function () { return pos.filter(function (p) { return inArea(p.loc); }); };
  var sub = function (root) { return function (p) { return !root || under(p.loc, root); }; };
  var noAccess = function (a) { return a.p_project !== 'pa'; };
  W.__stand5 = { entries: entries, calls: [] };

  function checkPlace(loc, behalf) {
    if (!inArea(loc)) return err('Это место вне вашей области в проекте — факт не принят', '42501');
    var o = owners(loc);
    if (behalf) {
      if (PERMS.indexOf('planfact.fact.approve') < 0) return err('Вносить факт «за кого» может только тот, кто подтверждает факт (РП)', '42501');
      if (behalf === UID) return err('В «за кого» указывают другого сотрудника');
      if (o.indexOf(behalf) < 0) return err('Этот сотрудник не отвечает за факт по этому месту');
      return null;
    }
    if (!o.length || o.indexOf(UID) >= 0) return null;
    return err('Факт по этому месту вносит ответственный: ' + o.map(function (u) { return USERS[u][1]; }).join(', ') + '. РП может внести за него — с отметкой «за кого»', '42501');
  }
  function factAdd(a, behalf) {
    W.__stand5.calls.push({ fn: behalf ? 'pf_fact_add_for' : 'pf_fact_add', a: a });
    var p = posById(a.p_position);
    if (!p || !inArea(p.loc) && false) return err('Позиция не найдена в проекте');
    if (PERMS.indexOf('planfact.fact.create') < 0 && !(behalf && PERMS.indexOf('planfact.fact.approve') >= 0)) return err('Нет права вносить факт', '42501');
    var bad = checkPlace(p.loc, behalf); if (bad) return bad;
    if (a.p_date > TODAY) return err('Дата не может быть в будущем');
    var over = sum(p.id, 'accepted') + a.p_qty > p.plan * 1.02;
    var e = add(p.id, a.p_qty, a.p_date, UID, behalf, over ? 'pending_approval' : 'accepted', a.p_note); e.period_from = a.p_period_from || null; e.created_at = new Date().toISOString();
    return { id: e.id, status: e.status };
  }
  function factBatch(a, behalf) {
    W.__stand5.calls.push({ fn: behalf ? 'pf_fact_add_batch_for' : 'pf_fact_add_batch', a: a });
    if (PERMS.indexOf('planfact.fact.create') < 0 && !(behalf && PERMS.indexOf('planfact.fact.approve') >= 0)) return err('Нет права вносить факт', '42501');
    for (var i = 0; i < a.p_items.length; i++) { var p = posById(a.p_items[i].position_id); if (!p) return err('Позиция не найдена в проекте'); var bad = checkPlace(p.loc, behalf); if (bad) return bad; }
    var acc = 0, pen = 0, b = 'b' + (++eseq);
    a.p_items.forEach(function (it) { var p = posById(it.position_id); var st = a.p_require_approval || sum(p.id, 'accepted') + it.qty > p.plan * 1.02 ? 'pending_approval' : 'accepted';
      var e = add(p.id, it.qty, a.p_date, UID, behalf, st, a.p_note); e.batch_id = b; e.created_at = new Date().toISOString(); if (st === 'accepted') acc++; else pen++; });
    return { batch_id: b, accepted: acc, pending: pen };
  }
  var hist = function (e) { var p = posById(e.position_id), l = byId(p.loc);
    return { id: e.id, status: e.status, qty: e.qty, work_date: e.work_date, brigade_name: e.brigade, workers: null, man_hours: null, note: e.note, corrects_id: null, correction_reason: null,
      batch_id: e.batch_id, created_by_email: mail(e.created_by), created_at: e.created_at, decided_by_email: mail(e.decided_by), decided_at: e.decided_at, decision_note: e.decision_note,
      period_from: e.period_from || null, on_behalf_email: mail(e.on_behalf_of), position_id: p.id, location_path: path(l), work_name: p.work, unit_code: p.unit }; };
  var fp = function (p) { var l = byId(p.loc); return { position_id: p.id, location_id: p.loc, location_path: path(l), location_type: l.node_type, work_type_id: 'w-' + p.work, work_name: p.work, unit_code: p.unit,
    plan_qty: p.plan, fact_qty: r3(sum(p.id, 'accepted')), pending_qty: r3(sum(p.id, 'pending_approval')), pending_count: entries.filter(function (e) { return e.position_id === p.id && e.status === 'pending_approval'; }).length,
    last_rejected_note: null, withdrawn: false }; };
  var spos = function (p) { var f = sum(p.id, 'accepted'), from14 = addDays(TODAY, -13), from7 = addDays(TODAY, -6), l = byId(p.loc);
    return { position_id: p.id, location_id: p.loc, location_path: path(l), work_type_id: 'w-' + p.work, work_name: p.work, unit_code: p.unit, plan_qty: p.plan, fact_qty: r3(f),
      pct: Math.round(f / p.plan * 1000) / 10, rest_qty: r3(Math.max(0, p.plan - f)), fact7: r3(sum(p.id, 'accepted', from7)), fact14: r3(sum(p.id, 'accepted', from14)), pending_qty: r3(sum(p.id, 'pending_approval')),
      forecast_finish: null, delta_days: null, plan_pct_today: null, dev_pp: null, withdrawn: false }; };
  var pending = function () { return entries.filter(function (e) { return e.status === 'pending_approval' && inArea(posById(e.position_id).loc); }); };

  var R = {
    pf_my_platform: function () { return { is_platform_admin: false, companies: [{ id: 'c1', name: 'RBI-стенд', is_test: true, roles: [UID === 'u-rp' ? 'Руководитель проекта' : 'Прораб'], modules: ['planfact', 'quality'], can_manage_company: UID === 'u-rp' }] }; },
    pf_my_profile: function () { return { user_id: UID, email: ME, full_name: USERS[UID][1], must_change_password: false }; },
    pf_my_context: function () { return [{ company_id: 'c1', company_name: 'RBI-стенд', role_name: UID === 'u-rp' ? 'Руководитель проекта' : 'Прораб', project_id: 'pa' }]; },
    pf_my_company_access: function () { return [{ company_id: 'c1', company_name: 'RBI-стенд', can_manage_projects: UID === 'u-rp', can_manage_units: false, can_manage_roles: UID === 'u-rp', can_manage_counterparties: false }]; },
    pf_my_projects: function () { return [PROJ]; },
    pf_my_permissions: function (a) { return a.p_project === 'pa' ? PERMS : []; },
    pf_my_area: function (a) { if (noAccess(a)) return err('Нет доступа к проекту', '42501');
      return { full: !AREA, locations: ASG[UID].roots || [], fact_owner: ASG[UID].owner ? ASG[UID].roots : [], can_on_behalf: PERMS.indexOf('planfact.fact.approve') >= 0 }; },
    pf_place_fact_owners: function (a) { if (PERMS.indexOf('planfact.fact.approve') < 0) return err('Нет права вносить факт «за кого»', '42501');
      return owners(a.p_location).map(function (u) { return { user_id: u, full_name: USERS[u][1], email: USERS[u][0] }; }); },
    pf_location_path: function (a) { var l = byId(a.p_location); return l ? path(l) : err('Узел не найден'); },
    pf_list_locations: function (a) { if (noAccess(a)) return err('Нет доступа к проекту', '42501');
      return nodes.filter(function (x) { return (x.parent_id || null) === (a.p_parent || null) && visibleNode(x.id); }).map(function (x) {
        return { id: x.id, parent_id: x.parent_id, node_type: x.node_type, name: x.name, sort_order: x.sort_order, area: null, depth: depth(x), path: path(x),
          child_count: nodes.filter(function (c) { return c.parent_id === x.id && visibleNode(c.id); }).length }; }); },
    pf_project_places: function (a) { if (a.p_project !== 'pa') return prev ? prev('pf_project_places', a) : []; return R.pf_list_locations(a).map(function (x) { return Object.assign({ object_kind: null, build_no: null, bti_no: null }, x); }); },
    pf_fact_positions: function (a) { if (noAccess(a)) return err('Нет доступа к проекту', '42501'); return mine().filter(sub(a.p_location)).map(fp); },
    pf_vor_positions: function (a) { return mine().filter(sub(a.p_location)).map(function (p) { var l = byId(p.loc); return { id: p.id, location_id: p.loc, location_path: path(l), work_type_id: 'w-' + p.work, work_type: p.work,
      unit_code: p.unit, qty: p.plan, apartments_note: null, import_id: 'i-pa', file_name: 'ВОР Альфа.xlsx', source_row_no: 1, withdrawn: false, revision_no: 1 }; }); },
    pf_fact_history: function (a) { var p = posById(a.p_position); if (!p || !inArea(p.loc)) return err('Нет права видеть факт', '42501');
      return entries.filter(function (e) { return e.position_id === p.id; }).slice().reverse().map(hist); },
    pf_fact_journal: function (a) { return entries.filter(function (e) { return inArea(posById(e.position_id).loc) && (!a.p_from || e.work_date >= a.p_from) && (!a.p_to || e.work_date <= a.p_to); })
      .slice().sort(function (x, y) { return x.work_date < y.work_date ? 1 : x.work_date > y.work_date ? -1 : x.created_at < y.created_at ? 1 : -1; }).map(hist); },
    pf_fact_pending: function () { if (PERMS.indexOf('planfact.fact.approve') < 0) return err('Нет права подтверждать факт', '42501');
      return pending().map(function (e) { var h = hist(e), p = posById(e.position_id); return Object.assign(h, { plan_qty: p.plan, fact_qty: sum(p.id, 'accepted') }); }); },
    pf_fact_add: function (a) { return factAdd(a, null); },
    pf_fact_add_for: function (a) { if (!a.p_on_behalf) return err('Укажите, за кого вносится факт'); return factAdd(a, a.p_on_behalf); },
    pf_fact_add_batch: function (a) { return factBatch(a, null); },
    pf_fact_add_batch_for: function (a) { if (!a.p_on_behalf) return err('Укажите, за кого вносится факт'); return factBatch(a, a.p_on_behalf); },
    pf_brigade_list: function () { return [{ id: 'br1', name: 'Бригада Иванова', leader_name: null, phone: null, archived_at: null, can_manage: UID === 'u-rp' }]; },
    pf_vor_list_imports: function () { return [{ id: 'i-pa', file_name: 'ВОР Альфа.xlsx', sheet_name: 'Лист 1', status: 'confirmed', row_count: pos.length, works: pos.length, positions: pos.length, created_at: '2026-10-01T10:00:00Z', created_by_email: 'rp@stand.invalid', confirmed_at: '2026-10-01T11:00:00Z', profile_id: null }]; },
    pf_vor_import_rows: function () { return []; },
    pf_summary_portfolio: function () { return [{ project_id: 'pa', name: PROJ.name, code: PROJ.code, planned_start: PROJ.planned_start, planned_finish: PROJ.planned_finish, can_money: UID === 'u-rp', can_manage: UID === 'u-rp',
      has_kp: false, plan_money: null, done_money: null, issued_money: null, gap_money: null, pct_money: null, pace7: null, pace14: null, need_pace: null, days_left: 90, forecast_finish: null,
      light: 'grey', light_reason: 'no_kp', unpriced_rows: 0, positions: mine().length, pending: pending().length, plan_pct_today: null, lag_pp: null, lag_days: null, pace_verdict: null,
      work_days_left: null, light_yellow_pp: 3, light_red_pp: 10, light_overdue_days: 3, can_thresholds: false }]; },
    pf_summary_worktypes: function () { var g = {}; mine().forEach(function (p) { var x = g[p.work] = g[p.work] || { work_type_id: 'w-' + p.work, work_name: p.work, u: {}, positions: 0 }; x.positions++;
        var u = x.u[p.unit] = x.u[p.unit] || { unit: p.unit, plan: 0, fact: 0, pend: 0 }; u.plan += p.plan; u.fact += sum(p.id, 'accepted'); u.pend += sum(p.id, 'pending_approval'); });
      return Object.keys(g).sort().map(function (k) { var x = g[k]; return { work_type_id: x.work_type_id, work_name: x.work_name, positions: x.positions, plan_money: null, done_money: null, pct_money: null, unpriced_rows: 0, plan_pct_today: null,
        units: Object.keys(x.u).map(function (k2) { var u = x.u[k2]; return { unit: u.unit, plan: u.plan, fact: r3(u.fact), pct: Math.round(u.fact / u.plan * 1000) / 10, rest: r3(Math.max(0, u.plan - u.fact)), fact7: 0, fact14: 0, pending: u.pend, forecast_finish: null, delta_days: null, dev_pp: null }; }) }; }); },
    pf_summary_positions: function (a) { return mine().filter(function (p) { return !a.p_work_type || 'w-' + p.work === a.p_work_type; }).map(spos); },
    pf_summary_places: function (a) { return nodes.filter(function (x) { return (x.parent_id || null) === (a.p_location || null) && visibleNode(x.id); }).map(function (x) {
      var ps = mine().filter(sub(x.id)); return { location_id: x.id, name: x.name, node_type: x.node_type, depth: depth(x), children: nodes.filter(function (c) { return c.parent_id === x.id; }).length, positions: ps.length,
        here_positions: ps.filter(function (p) { return p.loc === x.id; }).length, plan_money: null, done_money: null, pct_money: null, units: [] }; }); },
    pf_summary_attention: function () { return { stale_days: 14, counts: { no_kp: true, no_dates: false, gap_rows: 0, gap_money: null, unpriced_rows: 0, stale_positions: 0, pending_entries: pending().length },
      gap: [], unpriced: [], stale: [], completeness: { rows_total: 0, rows_priced: 0, priced_pct: null, dates_pct: 100, positions_total: mine().length, positions_placed: mine().length, placed_pct: 100 } }; },
    pf_my_inbox: function () { return [{ project_id: 'pa', name: PROJ.name, code: PROJ.code, pending: PERMS.indexOf('planfact.fact.approve') >= 0 ? pending().length : 0, my_rejected: 0, my_rejected_from: null,
      ks2_drafts: 0, ks2_gap: 0, ks2_gap_money: null, stale: 0, stale_days: 14 }]; },
    pf_ks2_settings: function () { return err('Нет права', '42501'); },
    pf_price_list: function () { return UID === 'u-rp' ? [] : err('Нет права вести расценки', '42501'); },
    pf_estimate_list: function () { return UID === 'u-rp' ? [] : err('Нет права', '42501'); },
  };
  var planfact = location.hash.indexOf('#/planfact') === 0 || location.search.indexOf('pf5') >= 0;
  W.__standRpc = function (name, args) {
    if (R[name] && (planfact || location.hash.indexOf('#/planfact') === 0 || /^pf_(fact|my_area|place_fact|summary|vor|brigade|location_path|list_locations|my_permissions|my_inbox|ks2|price|estimate)/.test(name))) return R[name](args);
    return prev ? prev(name, args) : undefined;
  };
})();
