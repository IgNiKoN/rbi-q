/**
 * month-dynamics.calc.js
 * P2-0049: «Динамика за месяц» — расчёт календарного месяца к прошлому с учётом объёма выборки
 * (проверка в Качестве — выборочный аудит). Без DOM: экран и отчёт берут числа только отсюда.
 * Формулы УрК, коэффициент Стьюдента и ступени надёжности — из js/shared/math.utils.js
 * (window.studentTCrit, window.getConfidenceLevel); здесь только «на 100 пунктов»,
 * «месяц к месяцу» и «заметно / в пределах разброса».
 * Разбор: ai-dev/specs/2026-10-27-quality-month-dynamics.md.
 */

export const FEW_DATA_N = 7;

function _math() {
  var w = typeof window !== 'undefined' ? window : globalThis;
  return {
    tCrit: typeof w.studentTCrit === 'function' ? w.studentTCrit : function () { return 1.96; },
    conf: typeof w.getConfidenceLevel === 'function'
      ? w.getConfidenceLevel
      : function () { return { name: '', cls: 'conf-low' }; }
  };
}

function _sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }

/* ---------- Месяцы ---------- */

/** 'YYYY-MM' по локальной дате. */
export function monthKeyOf(date) {
  var d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  var m = d.getMonth() + 1;
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m;
}

/** Границы месяца: start — 1-е число 00:00, end — последний день 23:59:59.999 (локально). */
export function monthBounds(key) {
  var p = String(key).split('-');
  var y = Number(p[0]), m = Number(p[1]) - 1;
  return { key: key, start: new Date(y, m, 1, 0, 0, 0, 0), end: new Date(y, m + 1, 0, 23, 59, 59, 999) };
}

/** Сдвиг месяца на delta (−1 — прошлый). */
export function shiftMonth(key, delta) {
  var p = String(key).split('-');
  return monthKeyOf(new Date(Number(p[0]), Number(p[1]) - 1 + delta, 1));
}

/** Ключи месяцев от (key − n + 1) до key включительно. */
export function lastMonths(key, n) {
  var out = [];
  for (var i = n - 1; i >= 0; i--) out.push(shiftMonth(key, -i));
  return out;
}

/* ---------- Доступ к полям проверки ---------- */

export function checkObject(c) {
  return String((c && (c.project_display_name || c.projectName || c.project_canonical_key)) || 'Без объекта').trim() || 'Без объекта';
}
export function checkContractor(c) {
  return String((c && c.contractorName) || 'Неизвестно').trim() || 'Неизвестно';
}
export function checkInspector(c) {
  return String((c && (c.inspectorName || c.inspector)) || '').trim();
}
export function checkType(c) {
  return String((c && c.templateKey) || '').trim() || 'unknown';
}

/** Зона одной проверки по её итоговому УрК (как getProductMetrics): B3 или < 70 — красная, ≥ 85 — зелёная. */
export function checkZone(m) {
  if (!m) return null;
  var f = Number(m.final) || 0;
  if (m.b3_found || f < 70) return 'red';
  if (f >= 85) return 'green';
  return 'yellow';
}

/**
 * Проверенных пунктов: metrics.checkedCount; у старых записей его нет — считаем отмеченные пункты в state.
 */
export function checkedOf(c) {
  var k = Number(c && c.metrics && c.metrics.checkedCount);
  if (k > 0) return k;
  var st = c && c.state;
  if (!st) return 0;
  return Object.keys(st).filter(function (id) {
    var v = st[id];
    return v === 'ok' || v === 'fail' || v === 'fail_escalated';
  }).length;
}

/** Базовый УрК проверки; у старых записей без baseUrkPerc — итоговый. */
export function baseUrkOf(c) {
  var m = c && c.metrics;
  if (!m) return 0;
  return Number(m.baseUrkPerc != null ? m.baseUrkPerc : m.final) || 0;
}

/** В расчёт идут только проверки с посчитанными метриками и хотя бы одним проверенным пунктом. */
export function hasMetrics(c) {
  return !!(c && c.metrics && checkedOf(c) > 0);
}

/* ---------- Статистика ---------- */

/** Среднее и разброс ±E (Стьюдент, как в getContractorMetrics). E = null при N < 2. */
export function meanWithMargin(values) {
  var N = values.length;
  if (!N) return null;
  var mean = _sum(values) / N, s = 0, E = null;
  if (N >= 2) {
    s = Math.sqrt(values.reduce(function (a, v) { return a + (v - mean) * (v - mean); }, 0) / (N - 1));
    E = _math().tCrit(N) * s / Math.sqrt(N);
  }
  return { N: N, mean: mean, s: s, E: E, lo: E == null ? null : mean - E, hi: E == null ? null : mean + E };
}

/** Доля k из N в % с разбросом: тот же коэффициент Стьюдента, оценка доли (k+1)/(N+2). */
export function shareWithMargin(k, N) {
  if (!N) return null;
  var p = k / N, pa = (k + 1) / (N + 2);
  var E = N >= 2 ? _math().tCrit(N) * Math.sqrt(pa * (1 - pa) / N) * 100 : null;
  return {
    N: N, k: k, mean: p * 100, E: E,
    lo: E == null ? null : Math.max(0, p * 100 - E),
    hi: E == null ? null : Math.min(100, p * 100 + E)
  };
}

/** Ступень надёжности месяца по числу проверок. */
export function reliability(N) {
  var c = _math().conf(N);
  return { name: c.name, cls: c.cls, few: N < FEW_DATA_N };
}

/**
 * «Этот / прошлый»: меньше 7 проверок в любом месяце — 'few' (стрелку не рисуем);
 * изменение больше разброса обоих месяцев — 'notable'; иначе — 'within'.
 */
export function compareMonths(cur, prev, higherIsBetter) {
  if (!cur || !prev) return { kind: 'few', d: null };
  var d = cur.mean - prev.mean;
  if (cur.N < FEW_DATA_N || prev.N < FEW_DATA_N || cur.few || prev.few) return { kind: 'few', d: d };
  var notable = Math.abs(d) > (cur.E || 0) && Math.abs(d) > (prev.E || 0);
  return { kind: notable ? 'notable' : 'within', d: d, good: higherIsBetter ? d > 0 : d < 0 };
}

/* ---------- Сводка по набору проверок ---------- */

/**
 * Объём выборки и показатели набора проверок (обычно — месяц).
 * typeShare — обычные доли видов работ (за 12 месяцев) для «УрК с постоянным составом».
 */
export function aggregateChecks(list, typeShare) {
  list = (list || []).filter(hasMetrics);
  var N = list.length;
  var r = { N: N, list: list, conf: reliability(N) };
  var m = function (c) { return c.metrics; };
  r.items = _sum(list.map(checkedOf));
  r.b1 = _sum(list.map(function (c) { return Number(m(c).n_B1_fail) || 0; }));
  r.b2 = _sum(list.map(function (c) { return Number(m(c).n_B2_fail) || 0; }));
  r.b3 = _sum(list.map(function (c) { return Number(m(c).n_B3_fail) || 0; }));
  r.fails = r.b1 + r.b2 + r.b3;
  function uniq(fn) { var s = {}; list.forEach(function (c) { var k = fn(c); if (k) s[k] = 1; }); return Object.keys(s).length; }
  r.nObj = uniq(checkObject);
  r.nCon = uniq(checkContractor);
  r.nIns = uniq(checkInspector);
  r.nTypes = uniq(checkType);
  r.base = meanWithMargin(list.map(baseUrkOf));
  r.final = meanWithMargin(list.map(function (c) { return Number(m(c).final) || 0; }));
  var nB3 = 0, nRed = 0, nYellow = 0;
  list.forEach(function (c) {
    if (m(c).b3_found) nB3++;
    var z = checkZone(m(c));
    if (z === 'red') nRed++;
    else if (z === 'yellow') nYellow++;
  });
  r.nB3Checks = nB3;
  r.nRed = nRed; r.nYellow = nYellow; r.nGreen = N - nRed - nYellow;
  r.b3share = shareWithMargin(nB3, N);
  r.red = shareWithMargin(nRed, N);
  r.yellow = shareWithMargin(nYellow, N);
  r.green = shareWithMargin(N - nRed - nYellow, N);
  // Невыполненных пунктов на 100 проверенных; разброс — по долям отдельных проверок.
  var rates = meanWithMargin(list.map(function (c) {
    var k = checkedOf(c);
    return k ? ((Number(m(c).n_B1_fail) || 0) + (Number(m(c).n_B2_fail) || 0) + (Number(m(c).n_B3_fail) || 0)) / k * 100 : 0;
  }));
  r.per100 = N ? { N: N, mean: r.items ? r.fails / r.items * 100 : 0, E: rates ? rates.E : null } : null;
  if (r.per100 && r.per100.E != null) {
    r.per100.lo = Math.max(0, r.per100.mean - r.per100.E);
    r.per100.hi = r.per100.mean + r.per100.E;
  }
  r.b1p = r.items ? r.b1 / r.items * 100 : 0;
  r.b2p = r.items ? r.b2 / r.items * 100 : 0;
  r.b3p = r.items ? r.b3 / r.items * 100 : 0;
  r.critShare = r.fails ? r.b3 / r.fails * 100 : null;
  r.byType = {};
  list.forEach(function (c) { var t = checkType(c); r.byType[t] = (r.byType[t] || 0) + 1; });
  // УрК с постоянным составом: средний базовый УрК вида работ × его обычная доля.
  r.baseMix = null;
  if (typeShare && N) {
    var num = 0, den = 0;
    Object.keys(r.byType).forEach(function (t) {
      var w = typeShare[t];
      if (!w) return;
      var a = list.filter(function (c) { return checkType(c) === t; }).map(baseUrkOf);
      num += w * _sum(a) / a.length;
      den += w;
    });
    r.baseMix = den ? num / den : null;
  }
  return r;
}

/** Проверки по месяцам: { 'YYYY-MM': [check, …] }. */
export function groupByMonth(checks) {
  var g = {};
  (checks || []).forEach(function (c) {
    if (!c || !c.date) return;
    var k = monthKeyOf(c.date);
    if (!k) return;
    (g[k] = g[k] || []).push(c);
  });
  return g;
}

/** Обычные доли видов работ по набору проверок. */
export function typeShares(list) {
  var cnt = {}, N = 0;
  (list || []).filter(hasMetrics).forEach(function (c) { var t = checkType(c); cnt[t] = (cnt[t] || 0) + 1; N++; });
  var out = {};
  Object.keys(cnt).forEach(function (t) { out[t] = cnt[t] / N; });
  return out;
}

/**
 * ИУрК месяца — интегральный уровень качества (надёжность) по серии проверок, как «Надёжность» в «Сводке»
 * (avgContractorRatingsFromChecks): у каждой группы «подрядчик [объект]» — getContractorMetrics по всем её
 * проверкам месяца (без скользящего окна, штрафы за системный B2 и долю проверок с B3); среднее — по группам
 * от 7 проверок. Нет ни одной такой группы — среднее по всем группам и пометка «мало данных».
 * Разброс: по группам (их ≥ 2) или разброс самой группы, если она одна.
 */
export function integralUrk(list, opts) {
  var w = _w();
  var fn = (opts && opts.contractorMetrics) || w.getContractorMetrics;
  var keyOf = typeof w.contractorGroupKey === 'function' ? w.contractorGroupKey
    : function (c) { return checkContractor(c) + ' [' + checkObject(c) + ']'; };
  list = (list || []).filter(hasMetrics);
  if (typeof fn !== 'function' || !list.length) return null;
  var g = {};
  list.forEach(function (c) { var k = keyOf(c); (g[k] = g[k] || []).push(c); });
  var all = [], ok = [];
  Object.keys(g).forEach(function (k) {
    var m = fn(g[k], (opts && opts.templates) || {}, false);
    if (!m) return;
    all.push(m);
    if (m.count >= FEW_DATA_N) ok.push(m);
  });
  if (!all.length) return null;
  var use = ok.length ? ok : all;
  var st = meanWithMargin(use.map(function (m) { return m.finalC; }));
  var E = use.length >= 2 ? st.E : (use[0].count >= 2 ? use[0].ci95_margin : null);
  return {
    N: list.length, mean: st.mean, E: E,
    lo: E == null ? null : st.mean - E, hi: E == null ? null : st.mean + E,
    groups: use.length, groupsAll: all.length, few: !ok.length
  };
}

/** Плитки «этот / прошлый / изменение». */
export function buildTiles(cur, prev) {
  function tile(key, title, c, p, higherIsBetter) {
    return { key: key, title: title, cur: c, prev: p, cmp: compareMonths(c, p, higherIsBetter) };
  }
  return [
    tile('base', 'Базовый УрК', cur.base, prev.base, true),
    tile('iurk', 'ИУрК (надёжность)', cur.iurk, prev.iurk, true),
    tile('b3share', 'Проверок с критичным дефектом (B3)', cur.b3share, prev.b3share, false),
    tile('per100', 'Невыполненных пунктов на 100 проверенных', cur.per100, prev.per100, false),
    tile('red', 'Проверок в красной зоне', cur.red, prev.red, false)
  ];
}

/**
 * Полный расчёт месяца по уже отфильтрованным проверкам.
 * opts.month — 'YYYY-MM' (по умолчанию — текущий), opts.trendMonths — 12.
 */
export function computeMonthDynamics(checks, opts) {
  opts = opts || {};
  var month = opts.month || monthKeyOf(opts.now || new Date());
  var n = opts.trendMonths || 12;
  var byMonth = groupByMonth(checks);
  var keys = lastMonths(month, n);
  var windowChecks = [];
  keys.forEach(function (k) { windowChecks = windowChecks.concat(byMonth[k] || []); });
  var shares = typeShares(windowChecks);
  var prevKey = shiftMonth(month, -1);
  var cur = aggregateChecks(byMonth[month] || [], shares);
  var prev = aggregateChecks(byMonth[prevKey] || [], shares);
  cur.iurk = integralUrk(cur.list, opts);
  prev.iurk = integralUrk(prev.list, opts);
  var trend = keys.map(function (k) {
    var a = k === month ? cur : k === prevKey ? prev : aggregateChecks(byMonth[k] || [], shares);
    var iu = k === month ? cur.iurk : k === prevKey ? prev.iurk : integralUrk(a.list, opts);
    return {
      key: k, N: a.N, few: a.N < FEW_DATA_N, base: a.base, final: a.final, iurk: iu,
      nRed: a.nRed, nYellow: a.nYellow, nGreen: a.nGreen,
      red: a.red, yellow: a.yellow, green: a.green, b3share: a.b3share, per100: a.per100,
      b1p: a.b1p, b2p: a.b2p, b3p: a.b3p, critShare: a.critShare
    };
  });
  var res = {
    month: month, prevMonth: prevKey, bounds: monthBounds(month),
    cur: cur, prev: prev, tiles: buildTiles(cur, prev), trend: trend, typeShare: shares,
    skippedNoMetrics: (byMonth[month] || []).filter(function (c) { return !hasMetrics(c); }).length
  };
  var d = computeMonthDetails(byMonth, keys, month, opts);
  Object.keys(d).forEach(function (k) { res[k] = d[k]; });
  res.findings = buildFindings(res);
  return res;
}

/** Месяцы, в которых есть проверки (для выбора месяца), от новых к старым. */
export function availableMonths(checks) {
  return Object.keys(groupByMonth(checks)).sort().reverse();
}

/* ---------- Подрядчики, дефекты, объекты (P2-0049 этап 3) ---------- */

function _w() { return typeof window !== 'undefined' ? window : globalThis; }

function _isFail(v) { return v === 'fail' || v === 'fail_escalated'; }

/** Ключ пункта чек-листа: вид работ + id пункта (id разных шаблонов могут совпадать). */
export function itemKey(c, id) { return checkType(c) + '|' + id; }

/**
 * Метаданные пунктов: opts.itemsOf(check) → [{ id, n, w }] (плоский чек-лист шаблона проверки).
 * Без него — имя «Пункт id», вес 1.
 */
function _itemMeta(opts) {
  var cache = {};
  return function (c, id) {
    var t = checkType(c);
    if (!cache[t]) {
      cache[t] = {};
      var list = [];
      try { list = (opts && typeof opts.itemsOf === 'function' && opts.itemsOf(c)) || []; } catch (e) { list = []; }
      list.forEach(function (it) { if (it && it.id != null) cache[t][String(it.id)] = it; });
    }
    var it = cache[t][String(id)];
    var w = c.state && c.state[id] === 'fail_escalated' ? 3 : (it && Number(it.w)) || 1;
    return { key: itemKey(c, id), id: String(id), name: (it && (it.n || it.name)) || ('Пункт ' + id), w: (it && Number(it.w)) || 1, wEff: w, type: t, typeTitle: c.templateTitle || t };
  };
}

function _contractorZone(m) {
  if (!m) return null;
  if (m.isRedZone) return 'red';
  if (m.statusCls === 'tag-green') return 'green';
  return 'yellow';
}
var ZONE_TEXT = { red: 'Красная зона', green: 'Образцовое', yellow: 'Жёлтая зона' };

/** ИУрК подрядчика за набор проверок — getContractorMetrics из math.utils без скользящего окна. */
export function contractorMonthMetrics(list, opts) {
  var fn = (opts && opts.contractorMetrics) || _w().getContractorMetrics;
  if (typeof fn !== 'function' || !list || !list.length) return null;
  var m = fn(list, (opts && opts.templates) || {}, false);
  if (!m) return null;
  var E = m.count >= 2 ? m.ci95_margin : null;
  var zone = _contractorZone(m);
  return {
    U: m.finalC, base: m.baseUrkContrPerc, N: m.count, E: E, lo: E == null ? null : m.finalC - E,
    conf: reliability(m.count), stab: m.stabilityIndex, stabText: m.stabText, NB3: m.n_изделий_с_B3,
    Rsys: m.maxFailRate, zone: zone, zoneText: ZONE_TEXT[zone]
  };
}

function _byContractor(list) {
  var g = {};
  (list || []).forEach(function (c) { var k = checkContractor(c); (g[k] = g[k] || []).push(c); });
  return g;
}

/** Статистика пунктов: проверено / не выполнено / фото / у кого. */
function _itemStats(list, meta) {
  var s = {};
  list.forEach(function (c) {
    if (!c.state) return;
    Object.keys(c.state).forEach(function (id) {
      var v = c.state[id];
      if (v !== 'ok' && !_isFail(v)) return;
      var m = meta(c, id);
      var e = s[m.key] || (s[m.key] = { meta: m, chk: 0, fail: 0, photos: 0, photoSrc: null, cons: {} });
      e.chk++;
      if (_isFail(v)) {
        e.fail++;
        var ph = c.photos && c.photos[id];
        var arr = Array.isArray(ph) ? ph : ph ? [ph] : [];
        if (arr.length) {
          e.photos += arr.length;
          if (!e.photoSrc) {
            var first = arr[0];
            var src = typeof first === 'string' ? first : first && (first.src || first.url || first.dataUrl);
            if (src && /^(data:image|https?:|blob:)/.test(src)) e.photoSrc = src;
          }
        }
        var cn = checkContractor(c);
        e.cons[cn] = (e.cons[cn] || 0) + 1;
      }
    });
  });
  return s;
}

/** Невыполненных пунктов на 100 проверенных по связке «подрядчик × вид работ». */
function _heat(list) {
  var h = {};
  list.filter(hasMetrics).forEach(function (c) {
    var k = checkContractor(c) + '|' + checkType(c);
    var e = h[k] || (h[k] = { con: checkContractor(c), type: checkType(c), typeTitle: c.templateTitle || checkType(c), n: 0, items: 0, fails: 0 });
    e.n++;
    e.items += checkedOf(c);
    e.fails += (Number(c.metrics.n_B1_fail) || 0) + (Number(c.metrics.n_B2_fail) || 0) + (Number(c.metrics.n_B3_fail) || 0);
  });
  Object.keys(h).forEach(function (k) { h[k].v = h[k].items ? h[k].fails / h[k].items * 100 : 0; });
  return h;
}

export function computeMonthDetails(byMonth, keys, month, opts) {
  opts = opts || {};
  var meta = _itemMeta(opts);
  var causeName = typeof opts.causeName === 'function' ? opts.causeName : function (code) { return code; };
  var prevKey = shiftMonth(month, -1);
  var curL = (byMonth[month] || []).filter(hasMetrics);
  var prevL = (byMonth[prevKey] || []).filter(hasMetrics);

  // Подрядчики: календарный месяц, все проверки (без «последних 15»).
  var gc = _byContractor(curL), gp = _byContractor(prevL);
  var cons = Object.keys(gc).map(function (name) {
    var m = contractorMonthMetrics(gc[name], opts);
    if (!m) return null;
    var mp = gp[name] ? contractorMonthMetrics(gp[name], opts) : null;
    var d = mp ? m.U - mp.U : null;
    var kind = 'few';
    if (mp && m.N >= FEW_DATA_N && mp.N >= FEW_DATA_N) kind = (Math.abs(d) > (m.E || 0) && Math.abs(d) > (mp.E || 0)) ? 'notable' : 'within';
    var types = {};
    gc[name].forEach(function (c) { types[c.templateTitle || checkType(c)] = 1; });
    // Пункт B2 с наибольшей долей невыполнения (системность брака).
    var st = _itemStats(gc[name], meta), sysItem = null, sysRate = 0;
    Object.keys(st).forEach(function (k) {
      var e = st[k];
      if (e.meta.w !== 2 || !e.chk) return;
      var r = e.fail / e.chk * 100;
      if (r > sysRate) { sysRate = r; sysItem = e.meta; }
    });
    return { name: name, m: m, mp: mp, d: d, kind: kind, types: Object.keys(types), sysRate: sysRate, sysItem: sysItem };
  }).filter(Boolean);
  cons.sort(function (a, b) {
    var fa = a.m.N < FEW_DATA_N ? 1 : 0, fb = b.m.N < FEW_DATA_N ? 1 : 0;
    if (fa !== fb) return fa - fb; // меньше 7 проверок — ниже всех
    var la = a.m.lo == null ? -1e9 : a.m.lo, lb = b.m.lo == null ? -1e9 : b.m.lo;
    return lb - la;
  });
  var sysB2 = cons.filter(function (r) { return r.sysRate > 0; })
    .map(function (r) { return { name: r.name, rate: r.sysRate, item: r.sysItem, N: r.m.N }; })
    .sort(function (a, b) { return b.rate - a.rate; });

  // Топ-10 типовых дефектов: «не выполнен k из N проверок пункта».
  var ic = _itemStats(curL, meta), ip = _itemStats(prevL, meta);
  var top = Object.keys(ic).map(function (k) { return ic[k]; }).filter(function (e) { return e.fail > 0; })
    .sort(function (a, b) { return b.fail - a.fail || b.fail / b.chk - a.fail / a.chk; }).slice(0, 10)
    .map(function (e) {
      var p = ip[e.meta.key];
      var rate = e.fail / e.chk * 100, prate = p && p.chk >= 3 ? p.fail / p.chk * 100 : null;
      var main = Object.keys(e.cons).sort(function (a, b) { return e.cons[b] - e.cons[a]; })[0];
      return { item: e.meta, chk: e.chk, fail: e.fail, rate: rate, prate: prate, d: prate == null ? null : rate - prate,
        photos: e.photos, photoSrc: e.photoSrc, mainCon: main, mainConN: e.cons[main] };
    });

  // Тепловая карта: месяц и 3 месяца.
  var heat1 = _heat(curL);
  var l3 = [];
  [0, -1, -2].forEach(function (dlt) { l3 = l3.concat(byMonth[shiftMonth(month, dlt)] || []); });
  var heat3 = _heat(l3);

  // Повторяемость: тот же пункт у того же подрядчика не выполнен 2+ месяца подряд (до выбранного).
  var repeats = [];
  Object.keys(gc).forEach(function (name) {
    var ids = {};
    gc[name].forEach(function (c) {
      if (!c.state) return;
      Object.keys(c.state).forEach(function (id) { if (_isFail(c.state[id])) ids[itemKey(c, id)] = meta(c, id); });
    });
    Object.keys(ids).forEach(function (k) {
      var streak = 0, hist = [];
      for (var j = 0; j < 24; j++) {
        var mk = shiftMonth(month, -j);
        var l = (byMonth[mk] || []).filter(function (c) { return checkContractor(c) === name && c.state && c.state[ids[k].id] && checkType(c) === ids[k].type; });
        var fl = l.filter(function (c) { return _isFail(c.state[ids[k].id]); }).length;
        if (fl >= 2 || (fl >= 1 && l.length <= 3)) { streak++; hist.unshift({ key: mk, chk: l.length, fail: fl }); } else break;
      }
      if (streak >= 2) repeats.push({ name: name, item: ids[k], streak: streak, hist: hist.slice(-4) });
    });
  });
  repeats.sort(function (a, b) { return b.streak - a.streak || b.item.w - a.item.w; });

  // Парето причин; причину заполняют по желанию — «не указана» считаем отдельно.
  var cz = {}, czTotal = 0, noCause = 0;
  curL.forEach(function (c) {
    if (!c.state) return;
    Object.keys(c.state).forEach(function (id) {
      if (!_isFail(c.state[id])) return;
      var code = c.details && c.details[id] && c.details[id].causeCode;
      if (!code) { noCause++; return; }
      var nm = causeName(code) || code;
      cz[nm] = (cz[nm] || 0) + 1;
      czTotal++;
    });
  });
  var cum = 0;
  var pareto = Object.keys(cz).map(function (k) { return { name: k, n: cz[k] }; }).sort(function (a, b) { return b.n - a.n; })
    .map(function (e) { var before = cum; cum += e.n; e.pct = e.n / czTotal * 100; e.cum = cum / czTotal * 100; e.in80 = before / czTotal * 100 < 80; return e; });
  var failsAll = czTotal + noCause;

  // Объекты: ИКО (getObjectIntegralMetrics из math.utils), окно 3 месяца.
  var ikoFn = opts.objectMetrics || _w().getObjectIntegralMetrics;
  var objNames = {};
  keys.forEach(function (k) { (byMonth[k] || []).forEach(function (c) { objNames[checkObject(c)] = 1; }); });
  var objs = Object.keys(objNames).sort().map(function (o) {
    var series = keys.map(function (k) {
      var l = [];
      [0, -1, -2].forEach(function (dlt) { l = l.concat((byMonth[shiftMonth(k, dlt)] || []).filter(function (c) { return checkObject(c) === o && hasMetrics(c); })); });
      var r = null;
      try { r = typeof ikoFn === 'function' && l.length ? ikoFn(l, opts.templates || {}) : null; } catch (e) { r = null; }
      if (!r) return null;
      var v = Number(r.IKO);
      return { iko: v, status: r.ikoStatus, valid: r.totalValidChecks, red: r.redZonePerc, yellow: r.yellowZonePerc, green: r.greenZonePerc,
        zone: v < 0.3 ? 'green' : v < 0.6 ? 'yellow' : 'red' };
    });
    var mon = aggregateChecks(curL.filter(function (c) { return checkObject(c) === o; }));
    return { name: o, series: series, cur: series[series.length - 1], prev: series[series.length - 2] || null, mon: mon };
  });

  return { cons: cons, sysB2: sysB2, top: top, heat1: heat1, heat3: heat3, repeats: repeats,
    pareto: pareto, noCause: noCause, czTotal: czTotal, failsAll: failsAll, objs: objs };
}

/* ---------- Выводы месяца: только изменения больше разброса ---------- */

function _pl(n, a, b, c) {
  n = Math.abs(n) % 100;
  var n1 = n % 10;
  if (n > 10 && n < 20) return c;
  if (n1 > 1 && n1 < 5) return b;
  if (n1 === 1) return a;
  return c;
}
function _f(x, d) {
  if (x == null || isNaN(x)) return '—';
  return Number(x).toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
}
function _fs(x, d) {
  var v = Number(Number(x).toFixed(d || 0));
  return (v > 0 ? '+' : v < 0 ? '−' : '±') + _f(Math.abs(v), d);
}

var TILE_DIGITS = { base: 1, iurk: 1, b3share: 0, per100: 1, red: 0 };

export function buildFindings(r) {
  var cur = r.cur, out = { main: [], notable: [], within: [], recs: [], warn: [] };
  if (!cur.N) { out.warn.push('За этот месяц нет проверок по выбранным фильтрам.'); return out; }
  if (cur.conf.few) out.warn.push('В этом месяце всего ' + cur.N + ' ' + _pl(cur.N, 'проверка', 'проверки', 'проверок') + ' — это «мало данных»: сравнения с прошлым месяцем не делаем.');
  out.main.push('Проверено ' + _f(cur.N) + ' ' + _pl(cur.N, 'раз', 'раза', 'раз') + ' (' + _f(cur.items) + ' ' + _pl(cur.items, 'пункт', 'пункта', 'пунктов') + ' чек-листов), надёжность месяца — «' + cur.conf.name + '».');
  var tb = r.tiles[0];
  if (cur.base) {
    var s = 'Базовый УрК ' + _f(cur.base.mean) + (cur.base.E != null ? ' ± ' + _f(cur.base.E) : '') + ' %';
    if (tb.cmp.kind === 'notable') s += ' — ' + (tb.cmp.good ? 'заметно лучше' : 'заметно хуже') + ' прошлого месяца (' + _fs(tb.cmp.d) + ' п.п.).';
    else if (tb.cmp.kind === 'within') s += ', изменение к прошлому месяцу ' + _fs(tb.cmp.d) + ' п.п. — в пределах разброса, то есть «не изменилось».';
    else s += '.';
    out.main.push(s);
  }
  r.tiles.forEach(function (t) {
    if (t.cmp.kind === 'few' || t.cmp.d == null) return;
    var d = TILE_DIGITS[t.key] || 0, pct = t.key !== 'per100';
    var line = t.title + ': ' + _f(t.prev.mean, d) + ' → ' + _f(t.cur.mean, d) + (pct ? ' %' : '') + ' (' + _fs(t.cmp.d, d) + (pct ? ' п.п.' : '') + ')';
    if (t.cmp.kind === 'notable') out.notable.push({ text: line + (t.cmp.good ? ' — улучшение' : ' — ухудшение'), good: t.cmp.good });
    else out.within.push(line);
  });
  (r.cons || []).forEach(function (x) {
    if (x.kind !== 'notable') return;
    out.notable.push({ text: x.name + ': ИУрК подрядчика ' + x.mp.U + ' → ' + x.m.U + ' (' + _fs(x.d) + ')' + (x.d > 0 ? ' — улучшение' : ' — ухудшение'), good: x.d > 0 });
  });
  var red = (r.cons || []).filter(function (x) { return x.m.zone === 'red'; });
  var redOk = red.filter(function (x) { return !x.m.conf.few; });
  if (redOk.length) out.main.push('В красной зоне: ' + redOk.map(function (x) { return x.name + ' (ИУрК ' + x.m.U + ' %, ' + x.m.N + ' ' + _pl(x.m.N, 'проверка', 'проверки', 'проверок') + ')'; }).join(', ') + '.');
  else if (red.length) out.main.push('Есть подрядчики в красной зоне, но по ним мало проверок (меньше 7) — вывод предварительный: ' + red.map(function (x) { return x.name; }).join(', ') + '.');
  if (r.top && r.top.length) {
    var t0 = r.top[0];
    out.main.push('Самый частый дефект — «' + t0.item.name + '» (' + String(t0.item.typeTitle).toLowerCase() + '): не выполнен ' + t0.fail + ' из ' + t0.chk + ' раз, чаще всего — ' + t0.mainCon + '.');
  }
  var reps = r.repeats || [];
  var longRep = reps.filter(function (x) { return x.streak >= 3; });
  if (reps.length) out.main.push('Повторяются ' + reps.length + ' ' + _pl(reps.length, 'дефект', 'дефекта', 'дефектов') + ' (2 месяца подряд и дольше)' + (longRep.length ? ', из них ' + longRep.length + ' — 3 месяца и дольше' : '') + '.');
  if (r.pareto && r.pareto.length) {
    var p80 = r.pareto.filter(function (x) { return x.in80; });
    out.main.push('80 % дефектов с указанной причиной дают ' + p80.length + ' ' + _pl(p80.length, 'причина', 'причины', 'причин') + ': ' + p80.map(function (x) { return String(x.name).toLowerCase(); }).join(', ') + '.');
  }
  redOk.forEach(function (x) { out.recs.push(x.name + ': совещание с руководством подрядчика, разбор причин' + (x.m.NB3 ? ' критичных дефектов (B3)' : '') + ', план исправлений к следующему месяцу.'); });
  reps.slice(0, 3).forEach(function (x) { out.recs.push('«' + x.item.name + '» у подрядчика ' + x.name + ' держится ' + x.streak + ' ' + _pl(x.streak, 'месяц', 'месяца', 'месяцев') + ' — проверить технологию на месте, провести обучение бригады.'); });
  if (r.noCause > 0) out.recs.push('У ' + r.noCause + ' ' + _pl(r.noCause, 'дефекта', 'дефектов', 'дефектов') + ' не указана причина — по возможности указывать причину, чтобы картина причин была полнее.');
  var fewCons = (r.cons || []).filter(function (x) { return x.m.conf.few; });
  if (fewCons.length) out.recs.push('Мало проверок (меньше 7) у: ' + fewCons.map(function (x) { return x.name; }).join(', ') + ' — добавить выборку в следующем месяце.');
  return out;
}
