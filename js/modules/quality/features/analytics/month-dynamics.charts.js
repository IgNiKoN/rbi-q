/**
 * month-dynamics.charts.js
 * P2-0049: графики (SVG без библиотек) и форматирование чисел «Динамики за месяц» —
 * общие для экрана (month-dynamics.view.js) и ежемесячного отчёта (month-dynamics.report.js).
 * Цвета — классы .md-svg …, их задают стили экрана (токены темы) или отчёта (печать).
 */

export const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export function fmt(x, d) {
  if (x == null || isNaN(x)) return '—';
  return Number(x).toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
}
export function fmtS(x, d) {
  if (x == null || isNaN(x)) return '—';
  const v = Number(Number(x).toFixed(d || 0));
  return (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v), d);
}
export function plural(n, a, b, c) {
  n = Math.abs(n) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return c;
  if (n1 > 1 && n1 < 5) return b;
  if (n1 === 1) return a;
  return c;
}
export function monthParts(key) {
  const p = String(key).split('-');
  return { y: Number(p[0]), m: Number(p[1]) - 1 };
}
export function monthFull(key) { const p = monthParts(key); return MONTHS[p.m].charAt(0).toUpperCase() + MONTHS[p.m].slice(1) + ' ' + p.y; }
export function monthShort(key) { return MONTHS_SHORT[monthParts(key).m]; }
/* ---------- Графики (SVG) ---------- */

function lin(d0, d1, r0, r1) { return (v) => r0 + (v - d0) / (d1 - d0) * (r1 - r0); }
function svgOpen(w, h, label) {
  return '<svg class="md-svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label) + '">';
}
function txt(x, y, s, cls, anchor) {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" class="' + (cls || 'ax') + '" text-anchor="' + (anchor || 'middle') + '">' + esc(s) + '</text>';
}
function band(n, w, pl, pr) { const bw = (w - pl - pr) / n; return { bw, x: (i) => pl + bw * (i + 0.5) }; }
function xAxis(ms, sel, x, bw, y) {
  let out = '';
  const step = bw < 30 ? 2 : 1;
  ms.forEach((m, i) => {
    if ((i % step === (11 % step)) || i === sel) out += txt(x(i), y, monthShort(m.key), i === sel ? 'ax ax-sel' : 'ax');
  });
  return out;
}

export function chartTrend(w, r) {
  const ms = r.trend, sel = ms.length - 1, narrow = w < 520;
  const pl = 30, pr = narrow ? 8 : 26, pt = 16, h1 = narrow ? 170 : 200, gap = 26, h2 = narrow ? 52 : 62, h = pt + h1 + gap + h2 + 20;
  const { bw, x } = band(ms.length, w, pl, pr);
  let mn = 100;
  ms.forEach((m) => { if (m.base) mn = Math.min(mn, m.base.lo != null ? m.base.lo : m.base.mean, m.iurk ? m.iurk.mean : 100); });
  let ymin = Math.max(0, Math.floor((mn - 3) / 10) * 10);
  if (ymin > 70) ymin = 60;
  const y = lin(ymin, 100, pt + h1, pt);
  let s = svgOpen(w, h, 'Тренд УрК за 12 месяцев');
  s += '<rect x="' + (x(sel) - bw / 2).toFixed(1) + '" y="' + (pt - 6) + '" width="' + bw.toFixed(1) + '" height="' + (h1 + gap + h2 + 6) + '" class="sel-band"/>';
  for (let g = ymin; g <= 100; g += 10) {
    s += '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + y(g).toFixed(1) + '" y2="' + y(g).toFixed(1) + '" class="grid"/>' + txt(pl - 6, y(g) + 3.5, g, 'ax', 'end');
  }
  [[85, 'ok'], [70, 'bad']].forEach((z) => {
    if (z[0] < ymin) return;
    s += '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + y(z[0]).toFixed(1) + '" y2="' + y(z[0]).toFixed(1) + '" class="thr thr-' + z[1] + '"/>';
    if (!narrow) s += txt(w - pr + 3, y(z[0]) + 3.5, z[0], 'ax thr-lbl-' + z[1], 'start');
  });
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      const up = run.map((i) => x(i).toFixed(1) + ',' + y(Math.min(100, ms[i].base.hi)).toFixed(1));
      const dn = run.slice().reverse().map((i) => x(i).toFixed(1) + ',' + y(Math.max(ymin, ms[i].base.lo)).toFixed(1));
      s += '<polygon points="' + up.concat(dn).join(' ') + '" class="ci-band"/>';
    }
    run = [];
  };
  ms.forEach((m, i) => { if (m.base && m.base.E != null) run.push(i); else flush(); });
  flush();
  const line = (key, cls) => {
    let d = '', started = false;
    ms.forEach((m, i) => {
      if (!m[key]) { started = false; return; }
      d += (started ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(m[key].mean).toFixed(1);
      started = true;
    });
    return '<path d="' + d + '" class="ln ' + cls + '"/>';
  };
  s += line('iurk', 'ln-final');
  s += line('base', 'ln-base');
  ms.forEach((m, i) => {
    if (!m.base) return;
    const tip = monthFull(m.key) + ': проверок ' + m.N + (m.few ? ' (мало данных)' : '')
      + '\nБазовый УрК ' + fmt(m.base.mean, 1) + (m.base.E != null ? ' ± ' + fmt(m.base.E, 1) : '') + ' %'
      + (m.iurk ? '\nИУрК ' + fmt(m.iurk.mean, 1) + ' %' + (m.iurk.few ? ' (ни у кого нет 7 проверок)' : '') : '');
    s += '<g><title>' + esc(tip) + '</title>';
    if (m.iurk) s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(m.iurk.mean).toFixed(1) + '" r="2.6" class="dot-final"/>';
    s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(m.base.mean).toFixed(1) + '" r="' + (i === sel ? 5 : 4) + '" class="' + (m.few ? 'dot-hollow' : 'dot-base') + '"/>';
    s += '<rect x="' + (x(i) - bw / 2).toFixed(1) + '" y="' + pt + '" width="' + bw.toFixed(1) + '" height="' + h1 + '" fill="transparent"/></g>';
    if (i === sel) s += txt(x(i), y(m.base.hi != null ? Math.min(100, m.base.hi) : m.base.mean) - 6, fmt(m.base.mean, 1), 'val');
  });
  const y0 = pt + h1 + gap;
  const maxN = Math.max.apply(null, ms.map((m) => m.N)) || 1;
  s += txt(pl - 6, y0 + 8, 'N', 'ax', 'end');
  ms.forEach((m, i) => {
    if (!m.N) return;
    const bh = m.N / maxN * (h2 - 12), bwid = Math.min(bw * 0.6, 22), bx = x(i) - bwid / 2;
    s += '<rect x="' + bx.toFixed(1) + '" y="' + (y0 + h2 - bh).toFixed(1) + '" width="' + bwid.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" class="' + (m.few ? 'bar-few' : i === sel ? 'bar-sel' : 'bar-n') + '"><title>' + esc(monthFull(m.key) + ': ' + m.N + ' ' + plural(m.N, 'проверка', 'проверки', 'проверок')) + '</title></rect>';
    if (!narrow || i === sel || m.few) s += txt(x(i), y0 + h2 - bh - 3, m.N, m.few ? 'ax ax-bad' : 'ax');
  });
  s += xAxis(ms, sel, x, bw, h - 4);
  return s + '</svg>';
}

export function chartZones(w, r) {
  const ms = r.trend, sel = ms.length - 1, narrow = w < 520;
  const pl = 30, pr = 8, pt = 10, h1 = narrow ? 170 : 190, h = pt + h1 + 22;
  const { bw, x } = band(ms.length, w, pl, pr);
  const y = lin(0, 100, pt + h1, pt);
  let s = svgOpen(w, h, 'Зоны качества по месяцам');
  [0, 50, 100].forEach((g) => { s += '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + y(g) + '" y2="' + y(g) + '" class="grid"/>' + txt(pl - 6, y(g) + 3.5, g + '%', 'ax', 'end'); });
  ms.forEach((m, i) => {
    if (!m.N) return;
    const bwid = Math.min(bw * 0.72, 34), bx = x(i) - bwid / 2;
    let acc = 0;
    [['зелёная', m.green.mean, 'z-ok'], ['жёлтая', m.yellow.mean, 'z-warn'], ['красная', m.red.mean, 'z-bad']].forEach((z) => {
      const v = z[1];
      if (v <= 0) return;
      const y1 = y(acc + v), y2 = y(acc);
      s += '<rect x="' + bx.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + bwid.toFixed(1) + '" height="' + Math.max(0, y2 - y1 - 1).toFixed(1) + '" class="' + z[2] + (m.few ? ' few' : '') + '"><title>' + esc(monthFull(m.key) + ': ' + z[0] + ' ' + fmt(v) + ' % из ' + m.N + ' ' + plural(m.N, 'проверки', 'проверок', 'проверок')) + '</title></rect>';
      acc += v;
    });
    if (m.few) s += txt(x(i), pt + 10, 'мало', 'ax ax-bad');
  });
  s += xAxis(ms, sel, x, bw, h - 4);
  return s + '</svg>';
}

export function chartSpark(w, h, vals, few) {
  const v = vals.filter((a) => a != null);
  if (v.length < 2) return '';
  let mn = Math.min.apply(null, v), mx = Math.max.apply(null, v);
  if (mx - mn < 1) { mx += 0.5; mn -= 0.5; }
  const x = lin(0, vals.length - 1, 3, w - 3), y = lin(mn, mx, h - 3, 3), sel = vals.length - 1;
  let d = '', st = false, dots = '';
  vals.forEach((a, i) => {
    if (a == null) { st = false; return; }
    d += (st ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(a).toFixed(1);
    st = true;
    if (i === sel) dots += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(a).toFixed(1) + '" r="2.6" class="dot-base"/>';
    else if (few[i]) dots += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(a).toFixed(1) + '" r="2" class="dot-hollow"/>';
  });
  return '<svg class="md-svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><path d="' + d + '" class="ln-spark"/>' + dots + '</svg>';
}

export function chartBclass(w, r) {
  const ms = r.trend, sel = ms.length - 1, narrow = w < 520;
  const pl = 30, pr = 8, pt = 18, h1 = narrow ? 160 : 180, h = pt + h1 + 22;
  let mx = 0;
  ms.forEach((m) => { mx = Math.max(mx, m.b1p + m.b2p + m.b3p); });
  mx = Math.ceil(mx / 5) * 5 || 5;
  const { bw, x } = band(ms.length, w, pl, pr);
  const y = lin(0, mx, pt + h1, pt);
  const step = mx > 30 ? 10 : 5;
  let s = svgOpen(w, h, 'Дефекты B1, B2, B3 на 100 проверенных пунктов');
  for (let g = 0; g <= mx; g += step) s += '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + y(g).toFixed(1) + '" y2="' + y(g).toFixed(1) + '" class="grid"/>' + txt(pl - 6, y(g) + 3.5, g, 'ax', 'end');
  ms.forEach((m, i) => {
    if (!m.N) return;
    const bwid = Math.min(bw * 0.62, 28), bx = x(i) - bwid / 2;
    let acc = 0;
    [['B1', m.b1p, 'b-1'], ['B2', m.b2p, 'b-2'], ['B3', m.b3p, 'b-3']].forEach((z) => {
      if (z[1] <= 0) return;
      const y1 = y(acc + z[1]), y2 = y(acc);
      s += '<rect x="' + bx.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + bwid.toFixed(1) + '" height="' + Math.max(0, y2 - y1 - 1).toFixed(1) + '" class="' + z[2] + (m.few ? ' few' : '') + '"><title>' + esc(monthFull(m.key) + ': ' + z[0] + ' — ' + fmt(z[1], 1) + ' на 100 пунктов') + '</title></rect>';
      acc += z[1];
    });
    if (i === sel || (!narrow && i === sel - 1)) s += txt(x(i), y(acc) - 5, fmt(acc, 1), i === sel ? 'val' : 'ax');
  });
  s += xAxis(ms, sel, x, bw, h - 4);
  return s + '</svg>';
}

export function chartIko(w, r) {
  const ms = r.trend, sel = ms.length - 1, narrow = w < 520;
  const pl = 34, pr = 8, pt = 12, h1 = narrow ? 160 : 180, h = pt + h1 + 22;
  const { bw, x } = band(ms.length, w, pl, pr);
  const y = lin(0, 1, pt + h1, pt);
  let s = svgOpen(w, h, 'Индекс критичности объектов по месяцам');
  s += '<rect x="' + pl + '" y="' + y(1) + '" width="' + (w - pl - pr) + '" height="' + (y(0.6) - y(1)) + '" class="zone-bg-bad"/>';
  s += '<rect x="' + pl + '" y="' + y(0.6) + '" width="' + (w - pl - pr) + '" height="' + (y(0.3) - y(0.6)) + '" class="zone-bg-warn"/>';
  s += '<rect x="' + pl + '" y="' + y(0.3) + '" width="' + (w - pl - pr) + '" height="' + (y(0) - y(0.3)) + '" class="zone-bg-ok"/>';
  [0, 0.3, 0.6, 1].forEach((g) => { s += '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + y(g) + '" y2="' + y(g) + '" class="grid"/>' + txt(pl - 6, y(g) + 3.5, fmt(g, 1), 'ax', 'end'); });
  s += '<rect x="' + (x(sel) - bw / 2).toFixed(1) + '" y="' + pt + '" width="' + bw.toFixed(1) + '" height="' + h1 + '" class="sel-band"/>';
  r.objs.slice(0, 5).forEach((o, k) => {
    let d = '', st = false;
    o.series.forEach((v, i) => { if (!v) { st = false; return; } d += (st ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v.iko).toFixed(1); st = true; });
    s += '<path d="' + d + '" class="ln s-' + k + '"/>';
    o.series.forEach((v, i) => {
      if (!v) return;
      s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v.iko).toFixed(1) + '" r="' + (i === sel ? 4.5 : 3) + '" class="s-' + k + '"><title>' + esc(o.name + ', ' + monthFull(ms[i].key) + ': ИКО ' + fmt(v.iko, 2) + ' — ' + v.status) + '</title></circle>';
    });
  });
  s += xAxis(ms, sel, x, bw, h - 4);
  return s + '</svg>';
}

export function chartSk(w, r) {
  const ss = r.sk.series, sel = ss.length - 1, narrow = w < 520;
  const pl = 30, pr = 8, pt = 14, h1 = narrow ? 160 : 180, h = pt + h1 + 22;
  let mx = 0;
  ss.forEach((m) => { mx = Math.max(mx, m.issued, m.closed, m.open); });
  mx = Math.ceil(mx / 20) * 20 || 20;
  const { bw, x } = band(ss.length, w, pl, pr);
  const y = lin(0, mx, pt + h1, pt);
  let s = svgOpen(w, h, 'Стройконтроль: выдано, закрыто, открыто');
  for (let g = 0; g <= mx; g += mx / 4) s += '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + y(g).toFixed(1) + '" y2="' + y(g).toFixed(1) + '" class="grid"/>' + txt(pl - 6, y(g) + 3.5, fmt(g), 'ax', 'end');
  s += '<rect x="' + (x(sel) - bw / 2).toFixed(1) + '" y="' + pt + '" width="' + bw.toFixed(1) + '" height="' + h1 + '" class="sel-band"/>';
  ss.forEach((m, i) => {
    const bwid = Math.min(bw * 0.34, 12);
    s += '<rect x="' + (x(i) - bwid - 1).toFixed(1) + '" y="' + y(m.issued).toFixed(1) + '" width="' + bwid.toFixed(1) + '" height="' + (y(0) - y(m.issued)).toFixed(1) + '" class="sk-iss"><title>' + esc(monthFull(m.key) + ': выдано ' + m.issued) + '</title></rect>';
    s += '<rect x="' + (x(i) + 1).toFixed(1) + '" y="' + y(m.closed).toFixed(1) + '" width="' + bwid.toFixed(1) + '" height="' + (y(0) - y(m.closed)).toFixed(1) + '" class="sk-cls"><title>' + esc(monthFull(m.key) + ': закрыто ' + m.closed) + '</title></rect>';
  });
  let d = '';
  ss.forEach((m, i) => { d += (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(m.open).toFixed(1); });
  s += '<path d="' + d + '" class="ln-open"/>';
  ss.forEach((m, i) => { s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(m.open).toFixed(1) + '" r="3" class="dot-open"><title>' + esc(monthFull(m.key) + ': открыто на конец месяца ' + m.open + (m.awaiting ? ', из них ждут проверки ' + m.awaiting : '')) + '</title></circle>'; });
  s += xAxis(ss, sel, x, bw, h - 4);
  return s + '</svg>';
}

export const CHARTS = { trend: chartTrend, zones: chartZones, bclass: chartBclass, iko: chartIko, sk: chartSk };
