// Стенд P2-0047: проекты компании с заказчиками и дерево мест (корпус → секция → этаж → квартира) для снимков «как сейчас».
// Подставные данные; в сеть ничего не уходит (guard.js + stand.js).
(function () {
  var W = window, prev = W.__standRpc;
  var parties = [
    { id: 'cp-1', company_id: 'c1', name: 'ООО «Заказчик-Девелопмент»', inn: '7800000001', kind: 'customer', archived_at: null },
    { id: 'cp-2', company_id: 'c1', name: 'АО «Генподряд Северо-Запад»', inn: '7800000002', kind: 'general_contractor', archived_at: null },
    { id: 'cp-3', company_id: 'c1', name: 'ООО «Каркас»', inn: '7800000003', kind: 'contractor', archived_at: null }];
  var P = function (id, name, code, cust, arch, quality) { return { id: id, company_id: 'c1', name: name, code: code, archived_at: arch || null, created_at: '2026-08-01', can_manage: true,
    customer_id: cust ? 'cp-1' : null, customer_name: cust ? parties[0].name : null, general_contractor_id: cust ? 'cp-2' : null, general_contractor_name: cust ? parties[1].name : null, __q: !!quality }; };
  var projects = [
    P('p1', 'Большевиков, 22 (Гений)', 'BLV22', true, null, true), P('p2', 'Школа 400 (Крыленко)', 'SH400', true, null, true), P('p3', 'Ленина, 38 (Зеленогорск)', 'LEN38', true, null, true),
    P('p4', 'Шостаковича уч.1 (Струны)', 'SHOS1', false, null, true), P('p5', 'Парашютная 47 (Ultra city 3.0)', 'PAR47', true), P('p6', 'Репин (Приморское ш. 441)', 'REP441', false),
    P('p7', 'ГБДОУ Детский сад №3', 'DS3', false), P('p8', 'ГБОУ Лицей № 329', 'LIC329', false), P('p9', 'Лиговский 240', 'LIG240', false, '2026-06-30')];
  // Дерево: корпуса → секции → этажи → квартиры (ленивое раскрытие по parent)
  var nodes = {};
  function node(id, parent, type, name, depth, path, kids) { nodes[id] = { id: id, parent_id: parent, node_type: type, name: name, sort_order: 0, area: null, depth: depth, path: path, child_count: kids }; return id; }
  function build(pr, corps) {
    corps.forEach(function (c, ci) {
      var b = node(pr + '-b' + ci, null, c.type || 'building', c.name, 1, c.name, c.sections ? c.sections : 0);
      for (var s = 1; s <= (c.sections || 0); s++) {
        var sid = node(b + '-s' + s, b, 'section', 'Секция ' + s, 2, c.name + ' · Секция ' + s, c.floors);
        for (var f = 1; f <= c.floors; f++) {
          var fid = node(sid + '-f' + f, sid, 'floor', f + ' этаж', 3, c.name + ' · Секция ' + s + ' · ' + f + ' этаж', c.apts);
          for (var a = 1; a <= c.apts; a++) { var no = (s - 1) * c.floors * c.apts + (f - 1) * c.apts + a; node(fid + '-a' + a, fid, 'apartment', 'Кв. ' + no, 4, c.name + ' · Секция ' + s + ' · ' + f + ' этаж · Кв. ' + no, 0); }
        }
      }
    });
  }
  build('p1', [{ name: 'Корпус 1', sections: 2, floors: 9, apts: 6 }, { name: 'Корпус 2', sections: 1, floors: 12, apts: 8 }, { name: 'Паркинг', type: 'other', sections: 0 }]);
  build('p5', [{ name: 'Корпус 1', sections: 3, floors: 14, apts: 8 }, { name: 'Корпус 2', sections: 2, floors: 14, apts: 8 }, { name: 'Наружные сети', type: 'other', sections: 0 }, { name: 'Благоустройство', type: 'other', sections: 0 }]);
  build('p6', [{ name: 'Корпус 1', sections: 1, floors: 5, apts: 4 }, { name: 'Корпус 2', sections: 1, floors: 5, apts: 4 }]);
  var R = {
    pf_company_projects: function () { return projects; },
    pf_my_projects: function () { return projects.filter(function (p) { return !p.archived_at; }); },
    pf_counterparties_list: function () { return parties; },
    pf_list_locations: function (a) { var pre = a.p_project + '-'; return Object.keys(nodes).map(function (k) { return nodes[k]; })
      .filter(function (n) { return n.id.indexOf(pre) === 0 && n.parent_id === (a.p_parent || null); }); },
    pf_locations_from_quality: function (a) { var p = projects.find(function (x) { return x.id === a.p_project; }); return !!(p && p.__q); }
  };
  W.__standRpc = function (name, args) { return R[name] ? R[name](args) : prev ? prev(name, args) : undefined; };
})();
