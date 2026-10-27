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
  if (cur.N < FEW_DATA_N || prev.N < FEW_DATA_N) return { kind: 'few', d: d };
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

/** Плитки «этот / прошлый / изменение». */
export function buildTiles(cur, prev) {
  function tile(key, title, c, p, higherIsBetter) {
    return { key: key, title: title, cur: c, prev: p, cmp: compareMonths(c, p, higherIsBetter) };
  }
  return [
    tile('base', 'Базовый УрК', cur.base, prev.base, true),
    tile('final', 'Итоговый УрК', cur.final, prev.final, true),
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
  var trend = keys.map(function (k) {
    var a = aggregateChecks(byMonth[k] || [], shares);
    return {
      key: k, N: a.N, few: a.N < FEW_DATA_N, base: a.base, final: a.final,
      nRed: a.nRed, nYellow: a.nYellow, nGreen: a.nGreen,
      b1p: a.b1p, b2p: a.b2p, b3p: a.b3p, critShare: a.critShare
    };
  });
  return {
    month: month, prevMonth: prevKey, bounds: monthBounds(month),
    cur: cur, prev: prev, tiles: buildTiles(cur, prev), trend: trend, typeShare: shares,
    skippedNoMetrics: (byMonth[month] || []).filter(function (c) { return !hasMetrics(c); }).length
  };
}

/** Месяцы, в которых есть проверки (для выбора месяца), от новых к старым. */
export function availableMonths(checks) {
  return Object.keys(groupByMonth(checks)).sort().reverse();
}
