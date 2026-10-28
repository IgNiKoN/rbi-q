// Стенд P2-0056: загрузка списка помещений в памяти страницы — те же правила, что у сервера 050 (pf_import_places: предпросмотр
// ничего не пишет, существующие не трогаются, сопоставление по названию / номеру / стр. №, ошибка в строке — ничего не создаётся,
// повтор по метке; pf_import_undo; площадь и комнаты). Подключается после p55.js (оборачивает __standRpc).
(function () {
  var W = window, prev = W.__standRpc, info = {}, batches = {}, done = {}, seq = 0;
  var canon = function (s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); };
  var num = function (s) { var m = String(s || '').trim().match(/(-?[0-9]+)(\s+[^0-9]*)?$/); return m && m[1].length <= 9 ? +m[1] : null; };
  var list = function (pr, parent) { return prev('pf_project_places', { p_project: pr, p_parent: parent }) || []; };
  var withInfo = function (x) { var i = info[x.id] || {}; return Object.assign({}, x, { area: i.area == null ? null : i.area, rooms: i.rooms == null ? null : i.rooms }); };
  function find(kids, type, name, build) {
    var c = kids.filter(function (x) { return canon(x.name) === canon(name); }); if (c.length) return c[0];
    if (num(name) !== null) { c = kids.filter(function (x) { return x.node_type === type && num(x.name) === num(name); }); if (c.length === 1) return c[0]; }
    if (type === 'apartment' && build) { c = kids.filter(function (x) { return x.node_type === 'apartment' && x.build_no === build; }); if (c.length === 1) return c[0]; }
    return null;
  }
  function run(a, write) {
    var pr = a.p_project, rows = (a.p_rows || []).map(function (r) { var t = function (v) { v = v == null ? '' : String(v).trim(); return v || null; };
      return { row_no: r.row_no, obj: t(r.object), sec: t(r.section), flr: t(r.floor), name: t(r.name), build_no: t(r.build_no), bti_no: t(r.bti_no), area: t(r.area), rooms: t(r.rooms), err: null }; });
    rows.forEach(function (r) {
      if (!r.obj) r.err = 'Не указан корпус (объект)';
      else if (r.name && !r.flr) r.err = 'У помещения не указан этаж';
      else if (!r.name && (r.build_no || r.bti_no || r.area || r.rooms)) r.err = 'Номера, площадь и комнаты — только у помещения';
      else if (r.area && (!/^[0-9]{1,6}([.,][0-9]+)?$/.test(r.area) || +r.area.replace(',', '.') <= 0 || +r.area.replace(',', '.') >= 100000)) r.err = 'Площадь — положительное число меньше 100 000 м²';
      else if (r.rooms && (!/^[0-9]{1,3}$/.test(r.rooms) || +r.rooms > 20)) r.err = 'Комнат — целое число от 0 до 20';
    });
    var dup = {}; rows.forEach(function (r) { if (!r.err && r.name) { var k = [r.obj, r.sec || '', r.flr, r.name].map(canon).join('|'); (dup[k] = dup[k] || []).push(r); } });
    Object.keys(dup).forEach(function (k) { if (dup[k].length > 1) dup[k].forEach(function (r) { r.err = 'Повтор в файле: строки ' + dup[k].map(function (x) { return x.row_no; }).join(', '); }); });
    var virt = {}, made = [], c = { objects: 0, sections: 0, floors: 0, apartments: 0 }, existing = [], differs = [], roots = [], next = {}, isNew = {};
    var kidsOf = function (parent) { var l = list(pr, parent).concat(virt[parent || ''] || []); l.forEach(function (x) { all[x.id] = x; }); return l; };
    // название — по образцу соседей того же вида (как core.import_pattern): соседи, затем места того же вида у соседей родителя
    var RE = /^(.*?)(-?[0-9]+)(\s+[^0-9]*)?$/, pat = {};
    var patternOf = function (parent, type) { var k = parent + '|' + type; if (k in pat) return pat[k];
      var pick = function (l) { var m = null; l.filter(function (x) { return x.node_type === type && RE.test(x.name); }).forEach(function (x) { m = x.name.match(RE); }); return m && (m[1] || m[3]) ? [m[1], m[3] || ''] : null; };
      var p = pick(kidsOf(parent)), up = all[parent] ? all[parent].parent_id : null;
      if (!p && up !== undefined) kidsOf(up).forEach(function (c) { if (!p) p = pick(kidsOf(c.id)); });
      if (!p) { var walk = function (par) { kidsOf(par).forEach(function (c) { if (!p) { p = pick([c]); walk(c.id); } }); }; walk(null); }   // любое место проекта
      return (pat[k] = p); };
    var all = {};
    var nameFor = function (parent, type, name) { if (!/^(Секция|эт\.|кв\.) -?[0-9]+$/.test(name)) return name; var p = patternOf(parent, type); return p ? p[0] + num(name) + p[1] : name; };
    var make = function (parent, type, name, extra) { name = nameFor(parent, type, name);
      var n = Object.assign({ id: 'st56-' + (++seq), parent_id: parent, node_type: type, name: name, build_no: null, bti_no: null, object_kind: type === 'object' ? 'building' : null }, extra || {}); all[n.id] = n;
      (virt[parent || ''] = virt[parent || ''] || []).push(n); made.push(n); isNew[n.id] = true; if (parent && !isNew[parent]) roots.push(n.id); if (!parent) roots.push(n.id); return n; };
    rows.filter(function (r) { return !r.err; }).sort(function (x, y) { return x.row_no - y.row_no; }).forEach(function (r) {
      var o = find(kidsOf(null), 'object', r.obj); if (!o) { o = make(null, 'object', r.obj); c.objects++; }
      var p = o;
      [['section', r.sec], ['floor', r.flr]].forEach(function (lv) { if (!lv[1]) return; var x = find(kidsOf(p.id), lv[0], lv[1]);
        if (x && x.node_type !== lv[0]) { r.err = 'На этом уровне уже есть «' + lv[1] + '» другого вида'; return; }
        if (!x) { x = make(p.id, lv[0], lv[1]); c[lv[0] === 'section' ? 'sections' : 'floors']++; } p = x; });
      if (r.err) return;
      if (!r.name) { if (!isNew[p.id]) existing.push(r.row_no); return; }
      var ap = find(kidsOf(p.id), 'apartment', r.name, r.build_no);
      if (ap) { var i = info[ap.id] || {}, f = [];
        if (r.build_no && r.build_no !== ap.build_no) f.push({ field: 'build_no', now: ap.build_no, file: r.build_no });
        if (r.bti_no && r.bti_no !== ap.bti_no) f.push({ field: 'bti_no', now: ap.bti_no, file: r.bti_no });
        if (r.area && +r.area.replace(',', '.') !== i.area) f.push({ field: 'area', now: i.area == null ? null : i.area, file: +r.area.replace(',', '.') });
        if (r.rooms && +r.rooms !== i.rooms) f.push({ field: 'rooms', now: i.rooms == null ? null : i.rooms, file: +r.rooms });
        if (f.length) differs.push({ row_no: r.row_no, name: ap.name, fields: f }); else existing.push(r.row_no); return; }
      var b = r.build_no;
      if (!b) { if (next[o.id] == null) { var fm = rows.filter(function (x) { return canon(x.obj) === canon(r.obj) && /^[0-9]{1,9}$/.test(x.build_no || ''); }).reduce(function (m, x) { return Math.max(m, +x.build_no + 1); }, 1);
        next[o.id] = Math.max(isNew[o.id] ? 1 : prev('pf_next_build_no', { p_location: o.id }), fm); } b = String(next[o.id]++); }
      make(p.id, 'apartment', r.name, { build_no: b, bti_no: r.bti_no, area: r.area ? Math.round(+r.area.replace(',', '.') * 100) / 100 : null, rooms: r.rooms ? +r.rooms : null }); c.apartments++;
    });
    var errors = rows.filter(function (r) { return r.err; }).map(function (r) { return { row_no: r.row_no, msg: r.err }; });
    var res = { ok: !errors.length, dry_run: !write, created: c, existing_rows: existing, differs: differs, errors: errors, roots: write && !errors.length ? roots : [] };
    if (write && !errors.length) {
      made.forEach(function (n) { prev('pf_save_place', { p_project: pr, p_id: n.id, p_parent: n.parent_id, p_type: n.node_type, p_name: n.name, p_object_kind: n.object_kind, p_build_no: n.build_no, p_bti_no: n.bti_no });
        if (n.area != null || n.rooms != null) info[n.id] = { area: n.area, rooms: n.rooms }; });
      batches[a.p_batch] = made.map(function (n) { return n.id; });
    }
    return res;
  }
  var R = {
    pf_project_places: function (a) { return list(a.p_project, a.p_parent).map(withInfo); },
    pf_import_places: function (a) {
      if (!a.p_dry_run && done[a.p_batch]) return Object.assign({}, done[a.p_batch], { repeat: true });
      if (!a.p_rows || !a.p_rows.length) return { __error: 'В файле нет строк для загрузки', code: '22023' };
      if (a.p_rows.length > 5000) return { __error: 'Слишком много строк (максимум 5000)', code: '22023' };
      var r = run(a, !a.p_dry_run); if (!a.p_dry_run && r.ok) done[a.p_batch] = r; return r; },
    pf_import_undo: function (a) { var ids = batches[a.p_batch]; if (!ids) return { __error: 'Загрузка не найдена', code: '22023' };
      return ids.reduce(function (m, id) { return m + (prev('pf_remove_place', { p_location: id }) || 0); }, 0); },
    pf_save_place_info: function (a) {
      if (a.p_area != null && !(a.p_area > 0 && a.p_area < 100000)) return { __error: 'Площадь — положительное число меньше 100 000 м²', code: '22023' };
      if (a.p_rooms != null && !(a.p_rooms >= 0 && a.p_rooms <= 20)) return { __error: 'Комнат — целое число от 0 до 20', code: '22023' };
      info[a.p_location] = { area: a.p_area == null ? null : Math.round(a.p_area * 100) / 100, rooms: a.p_rooms }; return a.p_location; }
  };
  W.__standRpc = function (name, args) { return R[name] ? R[name](args) : prev(name, args); };
})();
