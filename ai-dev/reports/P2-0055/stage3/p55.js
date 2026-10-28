// Стенд P2-0055: места проекта целиком в памяти страницы — те же правила, что у сервера 049 (перенос только внутри объекта,
// восстановление ветки своего удаления, номера помещений по объекту). Подключается после stand.js / p47.js (оборачивает __standRpc).
(function () {
  var W = window, prev = W.__standRpc, store = null, seq = 0, grp = 0;
  function init() {
    if (store) return; store = [];
    var ids = ['p1', 'p3', 'p5', 'p6', 'p10']; (prev('pf_project_catalog', {}) || []).forEach(function (p) { if (ids.indexOf(p.id) < 0) ids.push(p.id); });
    ids.forEach(function (pr) {
      var walk = function (parent, depth) {
        (prev('pf_project_places', { p_project: pr, p_parent: parent }) || []).forEach(function (n, i) {
          store.push({ id: n.id, parent_id: n.parent_id, project: pr, node_type: n.node_type, object_kind: n.object_kind, name: n.name, build_no: n.build_no,
            bti_no: n.bti_no, sort_order: i + 1, depth: depth, deleted: 0 });
          if (n.child_count) walk(n.id, depth + 1);
        });
      };
      walk(null, 1);
    });
  }
  var canon = function (s) { return String(s).trim().toLowerCase(); };
  var byId = function (id) { return store.find(function (x) { return x.id === id; }); };
  var live = function (pr, parent) { return store.filter(function (x) { return x.project === pr && !x.deleted && (x.parent_id || null) === (parent || null); })
    .sort(function (a, b) { return a.sort_order - b.sort_order || a.name.localeCompare(b.name); }); };
  var sub = function (id, all) { var out = []; store.forEach(function (x) { if ((all || !x.deleted) && x.parent_id === id) { out.push(x); out = out.concat(sub(x.id, all)); } }); return out; };
  var path = function (x) { return (x.parent_id ? path(byId(x.parent_id)) + ' · ' : '') + x.name; };
  var top = function (x) { return x.parent_id ? top(byId(x.parent_id)) : x; };
  var err = function (m, c) { return { __error: m, code: c || '22023' }; };
  var nextNo = function (o) { return sub(o.id).filter(function (x) { return x.node_type === 'apartment' && /^\d+$/.test(x.build_no || ''); }).reduce(function (m, x) { return Math.max(m, +x.build_no); }, 0) + 1; };
  var taken = function (pr, parent, name, except) { return live(pr, parent).some(function (x) { return x.id !== except && canon(x.name) === canon(name); }); };
  var ins = function (pr, parent, type, name, extra) { var r = Object.assign({ id: 'st55-' + (++seq), parent_id: parent, project: pr, node_type: type, object_kind: null, name: name, build_no: null, bti_no: null,
    sort_order: live(pr, parent).reduce(function (m, x) { return Math.max(m, x.sort_order); }, 0) + 1, depth: parent ? byId(parent).depth + 1 : 1, deleted: 0 }, extra || {}); store.push(r); return r; };
  var R = {
    pf_project_places: function (a) { init(); return live(a.p_project, a.p_parent).map(function (x) { var s = sub(x.id);
      return Object.assign({}, x, { path: path(x), child_count: live(a.p_project, x.id).length,
        apartment_count: x.node_type === 'object' || x.node_type === 'section' ? s.filter(function (y) { return y.node_type === 'apartment'; }).length : null }); }); },
    pf_save_place: function (a) { init(); var o = byId(a.p_id);
      if (o) { if (taken(o.project, o.parent_id, a.p_name, o.id)) return err('Место с таким названием уже есть на этом уровне', '23505');
        o.name = a.p_name; if (o.node_type === 'object') o.object_kind = a.p_object_kind || o.object_kind; o.build_no = a.p_build_no; o.bti_no = a.p_bti_no; return a.p_id; }
      if (!a.p_parent && a.p_type !== 'object') return err('Верхний уровень — только объект');
      if (taken(a.p_project, a.p_parent, a.p_name)) return err('Место с таким названием уже есть на этом уровне', '23505');
      ins(a.p_project, a.p_parent, a.p_type, a.p_name, { id: a.p_id, object_kind: a.p_type === 'object' ? a.p_object_kind || 'other' : null, build_no: a.p_build_no, bti_no: a.p_bti_no }); return a.p_id; },
    pf_remove_place: function (a) { init(); var x = byId(a.p_location); if (!x || x.deleted) return 0; grp++; var all = [x].concat(sub(x.id)); all.forEach(function (y) { y.deleted = grp; }); return all.length; },
    pf_restore_place: function (a) { init(); var x = byId(a.p_location); if (!x) return err('Место не найдено'); if (!x.deleted) return 0;
      if (x.parent_id && byId(x.parent_id).deleted) return err('Место выше удалено — сначала верните его');
      if (taken(x.project, x.parent_id, x.name)) return err('На этом уровне уже есть «' + x.name + '» — переименуйте его и повторите', '23505');
      var g = x.deleted, all = [x].concat(sub(x.id, true).filter(function (y) { return y.deleted === g; })); all.forEach(function (y) { y.deleted = 0; }); return all.length; },
    pf_next_build_no: function (a) { init(); return nextNo(top(byId(a.p_location))); },
    pf_move_place: function (a) { init(); var x = byId(a.p_location); if (!x || x.deleted) return err('Место не найдено');
      var p = a.p_new_parent ? byId(a.p_new_parent) : null;
      if (x.node_type === 'object') { if (p) return err('Объект не переносится — меняется только его порядок среди объектов'); }
      else {
        if (!p || top(p).id !== top(x).id) return err('Переносить можно только внутри объекта; в другой объект — копировать и вставить');
        for (var u = p; u; u = u.parent_id ? byId(u.parent_id) : null) if (u.id === x.id) return err('Нельзя перенести место внутрь самого себя');
        if (p.id !== x.parent_id && taken(x.project, p.id, x.name)) return err('Место с таким названием уже есть на этом уровне', '23505');
      }
      var old = live(x.project, x.parent_id), i = old.indexOf(x), res = { changed: true, old_parent: x.parent_id, old_before: old[i + 1] ? old[i + 1].id : null };
      var list = live(x.project, a.p_new_parent).filter(function (y) { return y !== x; }), at = a.p_before ? list.findIndex(function (y) { return y.id === a.p_before; }) : -1;
      list.splice(at < 0 ? list.length : at, 0, x);
      var d = (p ? p.depth + 1 : 1) - x.depth; x.parent_id = a.p_new_parent || null; sub(x.id).concat([x]).forEach(function (y) { y.depth += d; });
      list.forEach(function (y, k) { y.sort_order = k + 1; });
      return res; },
    pf_copy_place: function (a) { init(); var src = byId(a.p_source), t = a.p_target_parent ? byId(a.p_target_parent) : byId(src.parent_id);
      if (byId(a.p_new_id)) return a.p_new_id;
      for (var u = t; u; u = u.parent_id ? byId(u.parent_id) : null) if (u.id === src.id) return err('Нельзя вставить место внутрь самого себя');
      if (taken(src.project, t.id, a.p_name)) return err('Место с таким названием уже есть на этом уровне', '23505');
      var no = nextNo(top(t));
      var copy = function (x, parent, name, newId) { var r = ins(x.project, parent, x.node_type, name, newId ? { id: newId } : {});
        live(x.project, x.id).forEach(function (c) { if (c.node_type === 'apartment' && c.build_no) { copy(c, r.id, 'кв. ' + no, null); store[store.length - 1].build_no = String(no); no++; } else copy(c, r.id, c.name, null); }); return r.id; };
      copy(src, t.id, a.p_name, a.p_new_id); return a.p_new_id; }
  };
  ['pf_fill_object', 'pf_add_floors'].forEach(function (n) { R[n] = function (a) { var r = prev(n, a); store = null; init(); return r; }; });   // пакет — у p47, затем перечитать
  W.__standRpc = function (name, args) { return R[name] ? R[name](args) : prev ? prev(name, args) : undefined; };
})();
