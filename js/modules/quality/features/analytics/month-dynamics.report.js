/**
 * month-dynamics.report.js
 * P2-0049 этап 5: ежемесячный отчёт качества — PDF (страницы A4 по образцу
 * ai-dev/specs/quality-month-mockup/report.html) и PowerPoint (PptxGenJS, как analytics.pptx-export.js).
 * Числа — только из готового расчёта экрана (computeMonthDynamics + computeSkMonth): отчёт и экран не расходятся.
 */
import {
  MONTHS_GEN, esc, fmt, fmtS, plural, monthParts, monthFull, monthShort, CHARTS
} from './month-dynamics.charts.js';
import { monthBounds, FEW_DATA_N } from './month-dynamics.calc.js';

const root = typeof globalThis !== 'undefined' ? globalThis : window;

/* Светлая тема для печати: те же значения, что «Стандартная · светлая» (DESIGN_SYSTEM.md §3а).
   Без color-mix(): html2canvas его не понимает. */
const PRINT_CSS = `
.mdr{--md-card:#ffffff;--md-card2:#fbf9f5;--md-text:#172330;--md-muted:#5d6873;--md-line:rgba(28,43,57,.14);--md-line2:rgba(28,43,57,.24);
 --md-gold:#c49a5f;--md-acc:#8a6a35;--md-ok:#5f7f6d;--md-warn:#b8844a;--md-bad:#9f4c45;--md-ok-t:#52705f;--md-warn-t:#8a6a35;--md-bad-t:#9f4c45;
 --md-blue:#4c7288;--md-sel:rgba(196,154,95,.12);--md-chip:rgba(196,154,95,.16);--color-violet:#7a6aa0;
 color:var(--md-text);font-family:Inter,"Segoe UI",Roboto,-apple-system,Arial,sans-serif;font-size:11px;line-height:1.45;background:#fff}
.mdr *{box-sizing:border-box}
.mdr-page{position:relative;width:210mm;min-height:296mm;background:#fff;padding:12mm 12mm 16mm;overflow:hidden;break-after:page;page-break-after:always}
.mdr-page:last-child{break-after:auto;page-break-after:auto}
.mdr-head{display:flex;justify-content:space-between;align-items:center;font-size:9px;color:var(--md-muted);border-bottom:2px solid var(--md-gold);padding-bottom:5px;margin-bottom:10px}
.mdr-head b{color:var(--md-text);letter-spacing:.04em}
.mdr-foot{position:absolute;left:12mm;right:12mm;bottom:6mm;display:flex;justify-content:space-between;font-size:8.5px;color:var(--md-muted);border-top:1px solid var(--md-line);padding-top:4px}
.mdr h1{font-size:38px;line-height:1.05;margin:4px 0 6px;font-weight:850;letter-spacing:-.02em}
.mdr h2{font-size:14px;margin:0 0 7px;display:flex;align-items:baseline;gap:8px}
.mdr h2 .n{display:inline-block;width:19px;height:19px;line-height:19px;text-align:center;border-radius:5px;background:var(--md-chip);color:var(--md-acc);font-size:10px;font-weight:900}
.mdr h3{font-size:11px;margin:0 0 4px}
.mdr .sub{color:var(--md-muted);font-size:9.5px;margin:0 0 5px}
.mdr .blk{break-inside:avoid;page-break-inside:avoid;margin-bottom:8px}
.mdr .two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
.mdr .box{border:1px solid var(--md-line);border-radius:8px;padding:8px 10px;background:var(--md-card2)}
.mdr .muted{color:var(--md-muted)} .mdr .ok{color:var(--md-ok-t)} .mdr .warn{color:var(--md-warn-t)} .mdr .bad{color:var(--md-bad-t)}
.mdr .kicker{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--md-acc);margin-top:18mm}
.mdr .scope{font-size:11px;color:var(--md-muted);max-width:160mm}
.mdr .kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:10mm 0 7mm}
.mdr .kpi{border:1px solid var(--md-line);border-radius:8px;padding:7px 7px 6px}
.mdr .kpi .k{font-size:8px;font-weight:750;text-transform:uppercase;color:var(--md-muted);line-height:1.2;min-height:20px}
.mdr .kpi .v{font-size:19px;font-weight:850;line-height:1.1;margin-top:3px}
.mdr .kpi .v small{font-size:9.5px;font-weight:700;color:var(--md-muted);margin-left:2px}
.mdr .kpi .p,.mdr .kpi .d{font-size:8.5px;color:var(--md-muted)}
.mdr .kpi .d{font-weight:800}
.mdr .badge{display:inline-block;font-size:8px;font-weight:800;border-radius:999px;padding:1px 6px;background:rgba(28,43,57,.07);color:var(--md-muted)}
.mdr .badge.good{background:rgba(95,127,109,.18);color:var(--md-ok-t)}
.mdr .badge.bad{background:rgba(159,76,69,.16);color:var(--md-bad-t)}
.mdr ol.main{margin:0;padding-left:18px;display:grid;gap:6px;font-size:11.5px}
.mdr table.t{width:100%;border-collapse:collapse;font-size:9.5px}
.mdr table.t th{font-size:8px;font-weight:750;text-transform:uppercase;color:var(--md-muted);text-align:left;padding:4px 5px;border-bottom:1.5px solid var(--md-line2)}
.mdr table.t td{padding:3px 5px;border-bottom:1px solid var(--md-line);vertical-align:top}
.mdr table.t .r{text-align:right}
.mdr table.t tr{break-inside:avoid;page-break-inside:avoid}
.mdr table.t tr.faint td{color:var(--md-muted)}
.mdr table.t td small{color:var(--md-muted)}
.mdr .chip{display:inline-block;font-size:8px;font-weight:800;border-radius:999px;padding:1px 6px;white-space:nowrap}
.mdr .chip.green{background:rgba(95,127,109,.18);color:var(--md-ok-t)}
.mdr .chip.yellow{background:rgba(184,132,74,.2);color:var(--md-warn-t)}
.mdr .chip.red{background:rgba(159,76,69,.16);color:var(--md-bad-t)}
.mdr .bcl{display:inline-block;font-size:7.5px;font-weight:850;border-radius:3px;padding:0 3px;margin-right:4px}
.mdr .bcl.b1{background:rgba(76,114,136,.18);color:var(--md-blue)}
.mdr .bcl.b2{background:rgba(184,132,74,.2);color:var(--md-warn-t)}
.mdr .bcl.b3{background:rgba(159,76,69,.16);color:var(--md-bad-t)}
.mdr .heat{border-collapse:separate;border-spacing:2px;font-size:9px;width:100%}
.mdr .heat th{font-size:7.5px;color:var(--md-muted);font-weight:700;padding:1px}
.mdr .heat th.rh{text-align:left;color:var(--md-text);font-size:9px;white-space:nowrap}
.mdr .heat td{text-align:center;border-radius:4px;padding:4px 1px;font-weight:800;line-height:1.1}
.mdr .heat td small{display:block;font-size:7px;font-weight:600}
.mdr .heat td.pale{opacity:.5}
.mdr .par .row{display:grid;grid-template-columns:118px minmax(0,1fr) 56px;gap:6px;align-items:center;font-size:9px;margin-bottom:3px}
.mdr .par .lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mdr .par .bar{position:relative;height:9px;background:rgba(28,43,57,.06);border-radius:2px}
.mdr .par .bar b{position:absolute;left:0;top:0;bottom:0;background:var(--md-gold);border-radius:2px;opacity:.4}
.mdr .par .row.in80 .bar b{opacity:.95}
.mdr .par .bar i{position:absolute;top:-2px;bottom:-2px;width:1.5px;background:var(--md-bad)}
.mdr .par .row span:last-child{text-align:right;color:var(--md-muted)}
.mdr .concl ul{margin:0 0 8px;padding-left:16px;display:grid;gap:4px;font-size:10.5px}
.mdr .concl h3{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--md-muted);margin:8px 0 5px}
.mdr .appx h3{font-size:11px;margin:9px 0 3px}
.mdr .appx p{margin:0 0 4px;font-size:10px}
.mdr .appx .f{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:9.5px;background:var(--md-card2);border:1px solid var(--md-line);border-radius:5px;padding:4px 7px;margin:3px 0 5px;display:block}
.mdr .note{font-size:9.5px;color:var(--md-muted);border-left:3px solid var(--md-gold);padding:3px 0 3px 8px;margin:6px 0}
.mdr .lg{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:8.5px;color:var(--md-muted);margin:0 0 4px}
.mdr .lg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.mdr .lg i.line{height:3px;width:14px;vertical-align:2px}
.mdr .md-svg{display:block;width:100%;height:auto;overflow:visible;font-family:inherit}
.mdr .md-svg .ax{font-size:9px;fill:var(--md-muted)} .mdr .md-svg .ax-sel{fill:var(--md-text);font-weight:700} .mdr .md-svg .ax-bad{fill:var(--md-bad-t);font-weight:700}
.mdr .md-svg .val{font-size:10px;font-weight:800;fill:var(--md-text)} .mdr .md-svg .grid{stroke:var(--md-line);stroke-width:1}
.mdr .md-svg .thr{stroke-width:1.2;stroke-dasharray:4 4} .mdr .md-svg .thr-ok{stroke:var(--md-ok)} .mdr .md-svg .thr-bad{stroke:var(--md-bad)}
.mdr .md-svg .thr-lbl-ok{fill:var(--md-ok-t);font-weight:700} .mdr .md-svg .thr-lbl-bad{fill:var(--md-bad-t);font-weight:700}
.mdr .md-svg .sel-band{fill:var(--md-sel)} .mdr .md-svg .ci-band{fill:var(--md-gold);opacity:.18}
.mdr .md-svg .ln{fill:none;stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round}
.mdr .md-svg .ln-base{stroke:var(--md-gold)} .mdr .md-svg .ln-final{stroke:var(--md-blue);stroke-width:1.6;stroke-dasharray:5 4}
.mdr .md-svg .dot-base{fill:var(--md-gold);stroke:#fff;stroke-width:1.5} .mdr .md-svg .dot-final{fill:var(--md-blue)}
.mdr .md-svg .dot-hollow{fill:#fff;stroke:var(--md-gold);stroke-width:2}
.mdr .md-svg .bar-n{fill:var(--md-line2)} .mdr .md-svg .bar-sel{fill:var(--md-gold);opacity:.75}
.mdr .md-svg .bar-few{fill:none;stroke:var(--md-bad);stroke-width:1.2;stroke-dasharray:3 2}
.mdr .md-svg .z-ok{fill:var(--md-ok)} .mdr .md-svg .z-warn{fill:var(--md-warn)} .mdr .md-svg .z-bad{fill:var(--md-bad)} .mdr .md-svg .few{opacity:.38}
.mdr .md-svg .b-1{fill:var(--md-blue)} .mdr .md-svg .b-2{fill:var(--md-warn)} .mdr .md-svg .b-3{fill:var(--md-bad)}
.mdr .md-svg .zone-bg-ok{fill:var(--md-ok);opacity:.08} .mdr .md-svg .zone-bg-warn{fill:var(--md-warn);opacity:.08} .mdr .md-svg .zone-bg-bad{fill:var(--md-bad);opacity:.09}
.mdr .md-svg .ln.s-0{stroke:var(--md-gold)} .mdr .md-svg .ln.s-1{stroke:var(--md-blue)} .mdr .md-svg .ln.s-2{stroke:var(--color-violet)} .mdr .md-svg .ln.s-3{stroke:var(--md-ok)} .mdr .md-svg .ln.s-4{stroke:var(--md-warn)}
.mdr .md-svg circle.s-0{fill:var(--md-gold)} .mdr .md-svg circle.s-1{fill:var(--md-blue)} .mdr .md-svg circle.s-2{fill:var(--color-violet)} .mdr .md-svg circle.s-3{fill:var(--md-ok)} .mdr .md-svg circle.s-4{fill:var(--md-warn)}
.mdr .md-svg .sk-iss{fill:var(--md-blue)} .mdr .md-svg .sk-cls{fill:var(--md-ok)}
.mdr .md-svg .ln-open{fill:none;stroke:var(--md-bad);stroke-width:2} .mdr .md-svg .dot-open{fill:var(--md-bad);stroke:#fff;stroke-width:1.2}
`;

const CHART_W = 680; // ширина графика на листе A4 (px при 96 dpi за вычетом полей)
const OBJ_COLORS = ['#c49a5f', '#4c7288', '#7a6aa0', '#5f7f6d', '#b8844a'];

function zone(v) { return v >= 85 ? 'ok' : v >= 70 ? 'warn' : 'bad'; }
function chip(z, t) { return '<span class="chip ' + (z || '') + '">' + esc(t || '—') + '</span>'; }
const TILE = { base: { d: 1, pct: true }, iurk: { d: 1, pct: true }, b3share: { d: 0, pct: true }, per100: { d: 1, pct: false }, red: { d: 0, pct: true } };
function badge(cmp) {
  if (cmp.kind === 'few') return '<span class="badge">мало данных</span>';
  if (cmp.kind === 'within') return '<span class="badge">в пределах разброса</span>';
  return '<span class="badge ' + (cmp.good ? 'good' : 'bad') + '">' + (cmp.good ? 'заметно лучше' : 'заметно хуже') + '</span>';
}
function dTxt(t) {
  const f = TILE[t.key];
  if (t.cmp.d == null) return '—';
  const a = Math.abs(t.cmp.d) < Math.pow(10, -f.d) / 2 ? '= ' : t.cmp.d > 0 ? '▲ ' : '▼ ';
  return a + fmtS(t.cmp.d, f.d) + (f.pct ? ' п.п.' : '');
}
function chart(name, r, w) { return CHARTS[name](w || CHART_W, r); }
function heatBg(v) {
  const q = Math.min(1, v / 30);
  // светлая подложка без color-mix: от зелёной к красной
  const col = q < 0.33 ? [95, 127, 109] : q < 0.66 ? [184, 132, 74] : [159, 76, 69];
  return 'background:rgba(' + col.join(',') + ',' + (0.18 + q * 0.42).toFixed(2) + ')';
}

/** Страницы отчёта (HTML). meta: { scope, generated, mode }. */
export function buildMonthReportHtml(r, meta) {
  meta = meta || {};
  const c = r.cur, p = r.prev;
  const pm = monthParts(r.prevMonth);
  const prevName = MONTHS_GEN[pm.m];
  const b = monthBounds(r.month);
  const pages = [];
  const total = r.sk && r.sk.total ? 6 : 5;
  const head = () => '<div class="mdr-head"><b>КАЧЕСТВО · ЕЖЕМЕСЯЧНЫЙ ОТЧЁТ</b><span>' + esc(monthFull(r.month)) + (meta.scope ? ' · ' + esc(meta.scope) : '') + '</span></div>';
  const foot = (n) => '<div class="mdr-foot"><span>Показатели — по формулам приложения (Аналитика → Сводка → «Динамика за месяц»). Сформирован ' + esc(meta.generated || new Date().toLocaleString('ru-RU')) + '</span><span>стр. ' + n + ' из ' + total + '</span></div>';
  const page = (html) => { pages.push(html); };

  // стр. 1 — титул, плитки, главное
  const kp = r.tiles.map((t) => {
    const f = TILE[t.key];
    const cur = t.cur, prv = t.prev;
    return '<div class="kpi"><div class="k">' + esc(t.title) + '</div><div class="v ' + ((t.key === 'base' || t.key === 'iurk') && cur ? zone(cur.mean) : '') + '">' + (cur ? fmt(cur.mean, f.d) : '—') + '<small>' + (f.pct ? '%' : '') + (cur && cur.E != null ? ' ± ' + fmt(cur.E, f.d) : '') + '</small></div>'
      + '<div class="p">' + monthFull(r.prevMonth).split(' ')[0] + ': ' + (prv ? fmt(prv.mean, f.d) + (f.pct ? ' %' : '') : '—') + '</div><div class="d">' + dTxt(t) + ' ' + badge(t.cmp) + '</div></div>';
  }).join('');
  page('<div class="kicker">Ежемесячный отчёт качества</div><h1>' + esc(monthFull(r.month)) + '</h1>'
    + '<div class="scope">' + esc(meta.scope || 'Все объекты по фильтрам Аналитики') + '. Подрядчиков: ' + c.nCon + ', видов работ: ' + c.nTypes + ', инспекторов: ' + c.nIns + '. Период: '
    + b.start.toLocaleDateString('ru-RU') + ' — ' + b.end.toLocaleDateString('ru-RU') + ' (календарный месяц), сравнение — с ' + esc(monthFull(r.prevMonth).toLowerCase().replace(/^\S+/, prevName)) + '.</div>'
    + '<div class="kpis">' + kp + '</div>'
    + '<h2>Главное за месяц</h2><ol class="main">' + r.findings.main.slice(0, 6).map((t) => '<li>' + esc(t) + '</li>').join('') + '</ol>'
    + (r.findings.warn.length ? '<div class="note">' + r.findings.warn.map(esc).join('<br>') + '</div>' : '')
    + '<div class="note" style="margin-top:7mm">Все показатели — про <b>осмотренное</b> (выборочный аудит): это доля брака среди проверенного, а не по всей стройке. «± …» — разброс: с вероятностью около 95 % настоящее значение в этих пределах. «Заметно» — изменение больше разброса обоих месяцев.</div>');

  // стр. 2 — показатели, тренд, состав, зоны
  const trows = r.tiles.map((t) => {
    const f = TILE[t.key], cur = t.cur, prv = t.prev;
    return '<tr><td><b>' + esc(t.title) + '</b></td><td class="r"><b class="' + ((t.key === 'base' || t.key === 'iurk') && cur ? zone(cur.mean) : '') + '">' + (cur ? fmt(cur.mean, f.d) + (f.pct ? ' %' : '') : '—') + '</b>' + (cur && cur.E != null ? ' ± ' + fmt(cur.E, f.d) : '') + '</td>'
      + '<td class="r">' + (prv ? fmt(prv.mean, f.d) + (f.pct ? ' %' : '') + (prv.E != null ? ' ± ' + fmt(prv.E, f.d) : '') : '—') + '</td><td class="r">' + dTxt(t) + '</td><td>' + badge(t.cmp) + '</td></tr>';
  }).join('');
  const comp = Object.keys(c.byType).sort((a, z) => c.byType[z] - c.byType[a]).map((t) => {
    const ch = c.list.find((x) => String(x.templateKey || '') === t);
    return esc((ch && ch.templateTitle) || t) + ' — ' + c.byType[t];
  }).join(' · ');
  page(head() + '<h2><span class="n">1</span>Объём выборки и показатели месяца</h2>'
    + '<p style="margin:0 0 6px"><b>' + fmt(c.N) + '</b> ' + plural(c.N, 'проверка', 'проверки', 'проверок') + ' (' + monthShort(r.prevMonth) + ': ' + fmt(p.N) + '), <b>' + fmt(c.items) + '</b> проверенных пунктов. Надёжность месяца — <b>«' + esc(c.conf.name) + '»</b>' + (c.conf.few ? ' — мало данных, сравнения не делаем' : '') + '.</p>'
    + '<div class="blk"><table class="t"><thead><tr><th>Показатель</th><th class="r">' + esc(monthFull(r.month).split(' ')[0]) + '</th><th class="r">' + esc(monthFull(r.prevMonth).split(' ')[0]) + '</th><th class="r">Изменение</th><th>Оценка</th></tr></thead><tbody>' + trows + '</tbody></table></div>'
    + '<h2><span class="n">2</span>Динамика за 12 месяцев</h2>'
    + '<div class="blk"><h3>Уровень качества по месяцам</h3><div class="lg"><span><i class="line" style="background:#c49a5f"></i>Базовый УрК</span><span><i style="background:#c49a5f;opacity:.3"></i>разброс ±</span><span><i class="line" style="background:#4c7288"></i>ИУрК (надёжность), пунктир</span><span>пустой кружок — меньше 7 проверок</span></div>' + chart('trend', r) + '</div>'
    + '<div class="two blk"><div class="box"><h3>Состав выборки</h3><p style="margin:0 0 4px">Объектов: ' + c.nObj + ', подрядчиков: ' + c.nCon + ', инспекторов: ' + c.nIns + '.</p><p style="margin:0 0 4px">' + (comp || '—') + '</p>'
    + '<p style="margin:0">УрК с постоянным составом видов работ: <b>' + fmt(c.baseMix, 1) + ' %</b> (обычный базовый — ' + (c.base ? fmt(c.base.mean, 1) + ' %' : '—') + ').</p></div>'
    + '<div><h3>Зоны качества — доли проверок</h3><div class="lg"><span><i style="background:#5f7f6d"></i>от 85</span><span><i style="background:#b8844a"></i>70–84</span><span><i style="background:#9f4c45"></i>B3 или ниже 70</span></div>' + chart('zones', r, 330) + '</div></div>');

  // стр. 3 — дефекты
  const top = r.top.map((t, i) => {
    const ar = t.d == null ? '<span class="muted">—</span>' : t.d >= 5 ? '<span class="bad">▲ ' + fmtS(t.d) + '</span>' : t.d <= -5 ? '<span class="ok">▼ ' + fmtS(t.d) + '</span>' : '<span class="muted">≈</span>';
    return '<tr><td class="r">' + (i + 1) + '</td><td><span class="bcl b' + t.item.w + '">B' + t.item.w + '</span>' + esc(t.item.name) + '<br><small>' + esc(t.item.typeTitle) + ' · чаще у ' + esc(t.mainCon) + '</small></td>'
      + '<td class="r"><b>' + t.fail + ' из ' + t.chk + '</b>' + (t.chk < FEW_DATA_N ? '<br><small>мало проверок</small>' : '') + '</td><td class="r">' + fmt(t.rate) + ' %</td><td class="r">' + (t.prate != null ? fmt(t.prate) + ' %' : '—') + '</td><td class="r">' + ar + '</td><td class="r">' + (t.photos || '—') + '</td></tr>';
  }).join('');
  const p80 = r.pareto.filter((x) => x.in80).length;
  const par = r.pareto.map((x) => '<div class="row ' + (x.in80 ? 'in80' : '') + '"><span class="lbl">' + esc(x.name) + '</span><div class="bar"><b style="width:' + (x.n / r.pareto[0].n * 100).toFixed(1) + '%"></b><i style="left:' + Math.min(99, x.cum).toFixed(1) + '%"></i></div><span>' + x.n + ' · ' + fmt(x.cum) + ' %</span></div>').join('');
  const reps = r.repeats.slice(0, 6).map((x) => '<tr><td><span class="bcl b' + x.item.w + '">B' + x.item.w + '</span>' + esc(x.item.name) + '<br><small>' + esc(x.name) + ' · ' + esc(x.item.typeTitle) + '</small></td><td class="r"><b class="bad">' + x.streak + ' мес.</b></td><td>' + x.hist.map((h) => monthShort(h.key) + ' ' + h.fail + '/' + h.chk).join(', ') + '</td></tr>').join('');
  page(head() + '<h2><span class="n">3</span>Дефекты</h2>'
    + '<div class="two blk"><div><h3>Невыполненные пункты на 100 проверенных</h3><div class="lg"><span><i style="background:#4c7288"></i>B1</span><span><i style="background:#b8844a"></i>B2</span><span><i style="background:#9f4c45"></i>B3</span></div>' + chart('bclass', r, 330) + '</div>'
    + '<div class="box"><h3>' + esc(monthFull(r.month)) + '</h3><p style="margin:0 0 4px">Проверено <b>' + fmt(c.items) + '</b> пунктов, не выполнено <b>' + c.fails + '</b> (' + (c.per100 ? fmt(c.per100.mean, 1) : '—') + ' на 100).</p>'
    + '<p style="margin:0 0 4px">B1 — ' + fmt(c.b1p, 1) + ', B2 — ' + fmt(c.b2p, 1) + ', B3 — ' + fmt(c.b3p, 1) + ' на 100 пунктов.</p>'
    + '<p style="margin:0">Доля критичных (B3) среди всех дефектов: <b>' + fmt(c.critShare) + ' %</b> (' + c.b3 + ' из ' + c.fails + (p.critShare != null ? '; ' + monthShort(r.prevMonth) + ' — ' + fmt(p.critShare) + ' %' : '') + '). Проверок с B3: ' + c.nB3Checks + ' из ' + c.N + '.</p></div></div>'
    + '<div class="blk"><h3>Топ-10 типовых дефектов</h3><p class="sub">«5 из 8» — не выполнен в 5 проверках из 8, где пункт проверяли · стрелка — к прошлому месяцу (±5 п.п.)</p>'
    + (top ? '<table class="t"><thead><tr><th class="r">#</th><th>Пункт чек-листа</th><th class="r">Не выполнен</th><th class="r">Частота</th><th class="r">' + monthShort(r.prevMonth) + '</th><th class="r">Изм.</th><th class="r">Фото</th></tr></thead><tbody>' + top + '</tbody></table>' : '<p class="muted">Дефектов нет.</p>') + '</div>'
    + '<div class="two blk"><div><h3>Причины (Парето)</h3><p class="sub">' + (r.pareto.length ? p80 + ' ' + plural(p80, 'причина', 'причины', 'причин') + ' дают 80 % дефектов с указанной причиной' : 'причины не указаны') + (r.noCause ? ' · причина не указана — ' + fmt(r.failsAll ? r.noCause / r.failsAll * 100 : 0) + ' % (' + r.noCause + ')' : '') + '</p><div class="par">' + par + '</div></div>'
    + '<div><h3>Повторяются 2+ месяца подряд</h3><p class="sub">Тот же пункт у того же подрядчика · не выполнено / проверено</p>' + (reps ? '<table class="t"><tbody>' + reps + '</tbody></table>' : '<p class="muted">Повторов нет.</p>') + (r.repeats.length > 6 ? '<p class="sub">и ещё ' + (r.repeats.length - 6) + '</p>' : '') + '</div></div>');

  // стр. 4 — подрядчики, тепловая карта, объекты
  const cons = r.cons.map((x, i) => {
    const m = x.m;
    return '<tr class="' + (m.conf.few ? 'faint' : '') + '"><td class="r">' + (i + 1) + '</td><td><b>' + esc(x.name) + '</b><br><small>' + esc(x.types.join(', ')) + '</small></td>'
      + '<td class="r"><b class="' + zone(m.U) + '">' + m.U + '</b>' + (m.E != null ? ' ± ' + fmt(m.E) : '') + '</td><td class="r">' + (x.mp ? x.mp.U : '—') + '</td>'
      + '<td class="r">' + (x.d == null ? '—' : fmtS(x.d)) + '<br><small>' + (x.kind === 'notable' ? 'заметно' : x.kind === 'within' ? 'в пределах' : 'мало данных') + '</small></td>'
      + '<td class="r">' + m.N + '</td><td>' + esc(m.conf.name) + '</td><td>' + chip(m.zone, m.zoneText) + '</td><td>' + esc(m.stabText) + ' ' + m.stab + '</td></tr>';
  }).join('');
  const H = r.heat3, hk = Object.keys(H), tps = [], tpsT = {}, cns = [];
  hk.forEach((k) => { const e = H[k]; if (tps.indexOf(e.type) < 0) { tps.push(e.type); tpsT[e.type] = e.typeTitle; } if (cns.indexOf(e.con) < 0) cns.push(e.con); });
  cns.sort();
  const heat = cns.length ? '<table class="heat"><thead><tr><th></th>' + tps.map((t) => '<th>' + esc(tpsT[t]) + '</th>').join('') + '</tr></thead><tbody>' + cns.map((cn) => '<tr><th class="rh">' + esc(cn) + '</th>' + tps.map((t) => {
    const e = H[cn + '|' + t];
    if (!e) return '<td class="empty">·</td>';
    return '<td class="' + (e.n < FEW_DATA_N ? 'pale' : '') + '" style="' + heatBg(e.v) + '">' + fmt(e.v, 1) + '<small>' + e.n + ' пр.</small></td>';
  }).join('') + '</tr>').join('') + '</tbody></table>' : '<p class="muted">Нет данных.</p>';
  const ob = r.objs.map((o) => {
    const x = o.cur, y = o.prev;
    return '<tr><td><b>' + esc(o.name) + '</b><br><small>' + o.mon.N + ' ' + plural(o.mon.N, 'проверка', 'проверки', 'проверок') + (o.mon.base ? ' · базовый УрК ' + fmt(o.mon.base.mean, 1) + ' %' : '') + (o.iurk ? ' · ИУрК ' + fmt(o.iurk.mean, 1) : '') + '</small></td>'
      + '<td class="r">' + (x ? '<b class="' + (x.zone === 'green' ? 'ok' : x.zone === 'yellow' ? 'warn' : 'bad') + '">' + fmt(x.iko, 2) + '</b>' : '—') + '</td><td class="r">' + (y ? fmt(y.iko, 2) : '—') + '</td><td>' + (x ? chip(x.zone, x.status) : '<span class="muted">мало данных</span>') + '</td><td class="r">' + (x ? x.green + ' / ' + x.yellow + ' / ' + x.red : '—') + '</td></tr>';
  }).join('');
  page(head() + '<h2><span class="n">4</span>Подрядчики' + (meta.mode === 'global' ? ' (по объектам)' : '') + '</h2>'
    + '<div class="blk"><p class="sub">ИУрК подрядчика за календарный месяц (все проверки) с поправками на системный брак и долю B3. Порядок — по нижней границе разброса; меньше 7 проверок — внизу, серым.</p>'
    + (cons ? '<table class="t"><thead><tr><th class="r">#</th><th>Подрядчик</th><th class="r">ИУрК</th><th class="r">' + monthShort(r.prevMonth) + '</th><th class="r">Изм.</th><th class="r">Пров.</th><th>Надёжность</th><th>Зона</th><th>Стабильность</th></tr></thead><tbody>' + cons + '</tbody></table>' : '<p class="muted">Нет проверок.</p>') + '</div>'
    + '<div class="blk"><h3>Подрядчик × вид работ, 3 месяца</h3><p class="sub">Невыполненных пунктов на 100 проверенных; под числом — проверок; бледно — меньше 7 проверок</p>' + heat + '</div>'
    + '<h2 style="margin-top:6px"><span class="n">5</span>Объекты</h2>'
    + '<div class="two blk"><div><h3>ИКО по месяцам</h3><div class="lg">' + r.objs.slice(0, 5).map((o, k) => '<span><i class="line" style="background:' + OBJ_COLORS[k] + '"></i>' + esc(o.name) + '</span>').join('') + '</div>' + chart('iko', r, 330) + '</div>'
    + '<div><h3>' + esc(monthFull(r.month)) + '</h3><table class="t"><thead><tr><th>Объект</th><th class="r">ИКО</th><th class="r">' + monthShort(r.prevMonth) + '</th><th>Риск</th><th class="r">Зоны з/ж/к</th></tr></thead><tbody>' + ob + '</tbody></table><p class="sub" style="margin-top:4px">ИКО от 0 до 1: до 0,3 — низкий риск, 0,3–0,6 — повышенный, от 0,6 — высокий; окно 3 месяца.</p></div></div>');

  // стр. 5 — стройконтроль (если есть) и выводы
  const F = r.findings;
  let sk = '';
  if (r.sk && r.sk.total) {
    const s = r.sk.cur, sp = r.sk.prev;
    const skr = r.sk.cons.map((x) => {
      const q = x.cur;
      return '<tr><td><b>' + esc(x.name) + '</b></td><td class="r">' + q.issued + '</td><td class="r">' + q.closed + '</td><td class="r">' + q.open + (q.awaiting ? ' <small>(ждут ' + q.awaiting + ')</small>' : '') + '</td><td class="r">' + (q.onTimePerc != null ? fmt(q.onTimePerc) + ' %' : '—') + '</td><td class="r">' + q.overdueNow + '</td><td class="r">' + q.closedLate + '</td><td class="r"><b>' + (x.idz != null ? fmt(x.idz) : '—') + '</b></td></tr>';
    }).join('');
    sk = '<h2><span class="n">6</span>Стройконтроль (замечания ПК СК)</h2>'
      + '<div class="blk"><p style="margin:0 0 5px">' + esc(monthFull(r.month).split(' ')[0]) + ': выдано <b>' + s.issued + '</b>, закрыто (проверено) <b>' + s.closed + '</b>, открыто на конец месяца <b>' + s.open + '</b>' + (sp ? ' (' + monthShort(r.prevMonth) + ' — ' + sp.open + ')' : '') + (s.awaiting ? ', из них ждут проверки инженера ' + s.awaiting : '') + '. Просрочено сейчас — ' + s.overdueNow + ', закрыто с опозданием — ' + s.closedLate + '. ИДЗ месяца — <b>' + (s.idz != null ? fmt(s.idz) : '—') + '</b>. Висят: 0–7 дней — ' + s.age.a + ', 8–30 — ' + s.age.b + ', больше 30 — ' + s.age.c + '.</p>'
      + chart('sk', r, CHART_W) + '</div>'
      + (skr ? '<div class="blk"><table class="t"><thead><tr><th>Подрядчик</th><th class="r">Выдано</th><th class="r">Закрыто</th><th class="r">Открыто</th><th class="r">В срок</th><th class="r">Просрочено сейчас</th><th class="r">Закрыто с опозд.</th><th class="r">ИДЗ</th></tr></thead><tbody>' + skr + '</tbody></table></div>' : '');
    page(head() + sk);
    sk = '';
  }
  page(head() + sk + '<h2><span class="n">' + (r.sk && r.sk.total ? 7 : 6) + '</span>Выводы и рекомендации</h2><div class="concl">'
    + '<h3>Главное</h3><ul>' + F.main.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>'
    + '<h3>Заметно изменилось (больше разброса)</h3><ul>' + (F.notable.length ? F.notable.map((n) => '<li class="' + (n.good ? 'ok' : 'bad') + '"><b>' + esc(n.text) + '</b></li>').join('') : '<li class="muted">Ничего — все изменения в пределах разброса или мало данных.</li>') + '</ul>'
    + '<h3>В пределах разброса — не считаем изменением</h3><ul class="muted">' + (F.within.length ? F.within.map((t) => '<li>' + esc(t) + '</li>').join('') : '<li>—</li>') + '</ul>'
    + '<h3>Что сделать в следующем месяце</h3><ul>' + (F.recs.length ? F.recs.map((t) => '<li>' + esc(t) + '</li>').join('') : '<li>—</li>') + '</ul></div>'
    + '<div class="appx" style="margin-top:8mm"><h2>Как считались показатели</h2>'
    + '<p>Все показатели — по тем же правилам, что в приложении (один общий файл формул). Месяц — календарный, берутся <b>все</b> проверки месяца.</p>'
    + '<h3>Базовый УрК проверки</h3><span class="f">= вес выполненных пунктов ÷ вес проверенных × 100 (B1 = 1, B2 = 2, B3 = 3)</span>'
    + '<h3>ИУрК — интегральный уровень качества (надёжность)</h3><span class="f">= среднее УрК проверок подрядчика за месяц × Ks × KB3; при штрафе — не выше 84</span><p>Ks — системность брака B2, KB3 — доля проверок с B3. ИУрК месяца — среднее по подрядчикам (на объекте), у кого от 7 проверок.</p>'
    + '<h3>Разброс «±» и «заметно»</h3><span class="f">± = коэффициент Стьюдента × (стандартное отклонение ÷ √ число проверок)</span><p>Изменение «заметное», только если больше разброса и этого, и прошлого месяца. Меньше 7 проверок — «мало данных», не сравниваем.</p>'
    + '<h3>Дефекты на 100 проверенных пунктов</h3><span class="f">= невыполненных пунктов ÷ проверенных пунктов × 100</span>'
    + '<h3>Стройконтроль</h3><p>Замечание открыто, пока инженер не поставил «Проверено» («Устранено» — ждёт проверки). ИДЗ = в срок × 0,6 + (100 − просрочка) × 0,4 − средняя просрочка (дн., не больше 30), как на экране Стройконтроля.</p></div>');

  const html = pages.map((h, i) => '<section class="mdr-page">' + h + foot(i + 1) + '</section>').join('');
  return '<div class="mdr"><style>' + PRINT_CSS + '</style>' + html.replace(/стр\. (\d+) из \d+/g, (m0, n) => 'стр. ' + n + ' из ' + pages.length) + '</div>';
}

/* ---------- Системная печать (вид как в образце; «Сохранить как PDF» в окне печати) ---------- */

/** Полный документ для печати: A4 без полей браузера, листы — секции .mdr-page. */
export function buildMonthReportPrintDocument(r, meta) {
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>' + esc('Ежемесячный отчёт качества · ' + monthFull(r.month)) + '</title>'
    + '<style>@page{size:A4;margin:0}html,body{margin:0;background:#fff}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    + '@media screen{body{background:#e8e4dc}.mdr{display:flex;flex-direction:column;align-items:center;gap:16px;padding:16px 0}.mdr-page{box-shadow:0 10px 30px rgba(23,35,48,.15)}}</style></head><body>'
    + buildMonthReportHtml(r, meta) + '</body></html>';
}

export function printMonthReport(r, meta) {
  const doc = root.document;
  const old = doc.getElementById('md-print-frame');
  if (old) old.remove();
  const fr = doc.createElement('iframe');
  fr.id = 'md-print-frame';
  fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  fr.onload = () => {
    const w = fr.contentWindow;
    if (!w) return;
    const done = () => setTimeout(() => fr.remove(), 1000);
    w.addEventListener('afterprint', done);
    setTimeout(() => {
      try { w.focus(); w.print(); } catch (e) { toast('Печать недоступна: ' + (e && e.message)); done(); }
    }, 300);
  };
  fr.srcdoc = buildMonthReportPrintDocument(r, meta);
  doc.body.appendChild(fr);
}

/* ---------- PDF-файл (для телефона: сразу файл, чтобы отправить) ---------- */

const SVG_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'font-size', 'font-weight', 'font-family', 'text-anchor'];

/** Графики → <img>: html2canvas не применяет CSS-классы внутри SVG; переносим вычисленные стили в атрибуты. */
function inlineSvgCharts(container) {
  const svgs = container.querySelectorAll('svg.md-svg');
  return Promise.all(Array.prototype.map.call(svgs, (svg) => new Promise((resolve) => {
    svg.querySelectorAll('*').forEach((el) => {
      const cs = root.getComputedStyle(el);
      SVG_PROPS.forEach((k) => { const v = cs.getPropertyValue(k); if (v) el.setAttribute(k, v); });
      el.removeAttribute('class');
    });
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const w = Number(svg.getAttribute('width')) || CHART_W, h = Number(svg.getAttribute('height')) || 200;
    const img = new root.Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.style.width = '100%';
    img.style.display = 'block';
    img.width = w;
    img.height = h;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new root.XMLSerializer().serializeToString(svg));
    svg.parentNode.replaceChild(img, svg);
  })));
}

function fileBase(r) { return 'Ежемесячный_отчёт_качества_' + r.month; }

/** PDF-файл (Blob) отчёта. Требует html2pdf (libs/html2pdf.bundle.min.js, как остальные отчёты Качества). */
export async function buildMonthReportPdfBlob(r, meta) {
  if (typeof root.html2pdf !== 'function') throw new Error('html2pdf не загружен');
  const host = root.document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;background:#fff;z-index:-1';
  host.innerHTML = buildMonthReportHtml(r, meta);
  root.document.body.appendChild(host);
  try {
    await inlineSvgCharts(host);
    const el = host.querySelector('.mdr');
    return await root.html2pdf().set({
      margin: 0,
      filename: fileBase(r) + '.pdf',
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.blk'] }
    }).from(el).output('blob');
  } finally {
    host.remove();
  }
}

function toast(msg) {
  if (typeof root.showToast === 'function') root.showToast(msg);
  else console.warn('[month-report]', msg);
}

export async function exportMonthReportPdf(r, meta) {
  try {
    const blob = await buildMonthReportPdfBlob(r, meta);
    const title = 'Ежемесячный отчёт качества · ' + monthFull(r.month);
    if (typeof root.rbiOpenPdfDocument === 'function') {
      await root.rbiOpenPdfDocument({ blob, title, fileName: fileBase(r) + '.pdf' });
    } else {
      const a = root.document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileBase(r) + '.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    }
  } catch (e) {
    console.error('[month-report] pdf', e);
    toast('Не удалось сформировать PDF: ' + (e && e.message));
  }
}

/* ---------- PowerPoint ---------- */

function resolvePptx() {
  if (typeof root.PptxGenJS === 'function') return root.PptxGenJS;
  if (typeof root.pptxgenjs === 'function') return root.pptxgenjs;
  if (root.pptxgenjs && typeof root.pptxgenjs.default === 'function') return root.pptxgenjs.default;
  return null;
}

const HDR = { bold: true, fill: { color: 'EFEAE1' }, color: '172330', fontSize: 10 };
function cell(t, o) { return { text: String(t == null ? '—' : t), options: Object.assign({ fontSize: 10, color: '172330' }, o || {}) }; }
function title(slide, text, sub) {
  slide.addText(text, { x: 0.4, y: 0.25, w: 9.2, h: 0.5, fontSize: 22, bold: true, color: '172330' });
  if (sub) slide.addText(sub, { x: 0.4, y: 0.72, w: 9.2, h: 0.3, fontSize: 11, color: '5d6873' });
}
function cmpText(cmp) { return cmp.kind === 'few' ? 'мало данных' : cmp.kind === 'within' ? 'в пределах разброса' : (cmp.good ? 'заметно лучше' : 'заметно хуже'); }

/** Презентация отчёта: те же числа, что на экране. PptxCtor — конструктор PptxGenJS. */
export function buildMonthReportPptx(PptxCtor, r, meta) {
  meta = meta || {};
  const c = r.cur, p = r.prev, mName = monthFull(r.month), ps = monthShort(r.prevMonth);
  const pptx = new PptxCtor();
  pptx.author = 'Платформа · Качество';
  pptx.title = 'Ежемесячный отчёт качества · ' + mName;

  // 1. Титул и главное
  let s = pptx.addSlide();
  s.addText('Ежемесячный отчёт качества', { x: 0.5, y: 0.6, w: 9, h: 0.4, fontSize: 14, bold: true, color: '8a6a35' });
  s.addText(mName, { x: 0.5, y: 1.0, w: 9, h: 0.8, fontSize: 36, bold: true, color: '172330' });
  s.addText((meta.scope || 'Все объекты по фильтрам Аналитики') + ' · проверок: ' + c.N + ' (' + ps + ': ' + p.N + ') · надёжность «' + c.conf.name + '»', { x: 0.5, y: 1.85, w: 9, h: 0.4, fontSize: 12, color: '5d6873' });
  s.addText(r.findings.main.slice(0, 5).map((t) => ({ text: t, options: { bullet: true, breakLine: true } })), { x: 0.5, y: 2.4, w: 9, h: 2.9, fontSize: 13, color: '172330', valign: 'top' });

  // 2. Этот / прошлый
  s = pptx.addSlide();
  title(s, mName + ' против ' + MONTHS_GEN[monthParts(r.prevMonth).m], '«Заметно» — изменение больше разброса обоих месяцев; меньше 7 проверок — «мало данных»');
  const rows = [[cell('Показатель', HDR), cell(monthFull(r.month).split(' ')[0], HDR), cell(monthFull(r.prevMonth).split(' ')[0], HDR), cell('Изменение', HDR), cell('Оценка', HDR)]];
  r.tiles.forEach((t) => {
    const f = TILE[t.key];
    rows.push([cell(t.title), cell(t.cur ? fmt(t.cur.mean, f.d) + (f.pct ? ' %' : '') + (t.cur.E != null ? ' ± ' + fmt(t.cur.E, f.d) : '') : '—'),
      cell(t.prev ? fmt(t.prev.mean, f.d) + (f.pct ? ' %' : '') : '—'), cell(dTxt(t)), cell(cmpText(t.cmp))]);
  });
  s.addTable(rows, { x: 0.4, y: 1.15, w: 9.2, colW: [3.4, 1.7, 1.4, 1.3, 1.4], border: { type: 'solid', color: 'DDD6CA', pt: 0.5 } });

  // 3. Тренд и зоны (встроенные графики)
  s = pptx.addSlide();
  title(s, 'Динамика за 12 месяцев', 'Базовый УрК и ИУрК (надёжность) по месяцам; зоны — доли проверок');
  const labels = r.trend.map((m) => monthShort(m.key));
  const ch = pptx.ChartType || pptx.charts || {};
  s.addChart(ch.line || 'line', [
    { name: 'Базовый УрК', labels, values: r.trend.map((m) => (m.base ? Math.round(m.base.mean * 10) / 10 : null)) },
    { name: 'ИУрК', labels, values: r.trend.map((m) => (m.iurk ? Math.round(m.iurk.mean * 10) / 10 : null)) }
  ], { x: 0.4, y: 1.1, w: 5.2, h: 3.9, valAxisMinVal: 0, valAxisMaxVal: 100, chartColors: ['C49A5F', '4C7288'], showLegend: true, legendPos: 'b', lineDataSymbolSize: 5 });
  s.addChart(ch.bar || 'bar', [
    { name: 'зелёная', labels, values: r.trend.map((m) => (m.green ? Math.round(m.green.mean) : 0)) },
    { name: 'жёлтая', labels, values: r.trend.map((m) => (m.yellow ? Math.round(m.yellow.mean) : 0)) },
    { name: 'красная', labels, values: r.trend.map((m) => (m.red ? Math.round(m.red.mean) : 0)) }
  ], { x: 5.8, y: 1.1, w: 3.8, h: 3.9, barGrouping: 'percentStacked', chartColors: ['5F7F6D', 'B8844A', '9F4C45'], showLegend: true, legendPos: 'b' });

  // 4. Подрядчики
  s = pptx.addSlide();
  title(s, 'Подрядчики за ' + mName.toLowerCase(), 'ИУрК за месяц; порядок — по нижней границе разброса; меньше 7 проверок — внизу');
  const cr = [[cell('Подрядчик', HDR), cell('ИУрК', HDR), cell(ps, HDR), cell('Изм.', HDR), cell('Проверок', HDR), cell('Зона', HDR)]];
  r.cons.slice(0, 14).forEach((x) => {
    cr.push([cell(x.name), cell(x.m.U + (x.m.E != null ? ' ± ' + fmt(x.m.E) : '')), cell(x.mp ? x.mp.U : '—'),
      cell(x.d == null ? '—' : fmtS(x.d) + (x.kind === 'notable' ? ' (заметно)' : '')), cell(x.m.N), cell(x.m.zoneText)]);
  });
  s.addTable(cr, { x: 0.4, y: 1.15, w: 9.2, colW: [3.6, 1.3, 0.9, 1.4, 1.0, 1.0], border: { type: 'solid', color: 'DDD6CA', pt: 0.5 } });

  // 5. Дефекты
  s = pptx.addSlide();
  title(s, 'Топ-10 типовых дефектов', 'Не выполнено B1 ' + fmt(c.b1p, 1) + ' · B2 ' + fmt(c.b2p, 1) + ' · B3 ' + fmt(c.b3p, 1) + ' на 100 пунктов; доля критичных ' + fmt(c.critShare) + ' %');
  const tr = [[cell('Пункт', HDR), cell('Класс', HDR), cell('Не выполнен', HDR), cell('Частота', HDR), cell(ps, HDR), cell('Чаще у', HDR)]];
  r.top.forEach((t) => { tr.push([cell(t.item.name), cell('B' + t.item.w), cell(t.fail + ' из ' + t.chk), cell(fmt(t.rate) + ' %'), cell(t.prate != null ? fmt(t.prate) + ' %' : '—'), cell(t.mainCon)]); });
  s.addTable(tr, { x: 0.4, y: 1.15, w: 9.2, colW: [3.4, 0.7, 1.3, 1.0, 0.9, 1.9], border: { type: 'solid', color: 'DDD6CA', pt: 0.5 } });

  // 6. Объекты
  s = pptx.addSlide();
  title(s, 'Объекты', 'ИКО за 3 месяца: до 0,3 — низкий риск, 0,3–0,6 — повышенный, от 0,6 — высокий');
  const orows = [[cell('Объект', HDR), cell('Проверок', HDR), cell('Базовый УрК', HDR), cell('ИУрК', HDR), cell('ИКО', HDR), cell(ps, HDR), cell('Риск', HDR)]];
  r.objs.forEach((o) => {
    orows.push([cell(o.name), cell(o.mon.N), cell(o.mon.base ? fmt(o.mon.base.mean, 1) : '—'), cell(o.iurk ? fmt(o.iurk.mean, 1) : '—'),
      cell(o.cur ? fmt(o.cur.iko, 2) : '—'), cell(o.prev ? fmt(o.prev.iko, 2) : '—'), cell(o.cur ? o.cur.status : 'мало данных')]);
  });
  s.addTable(orows, { x: 0.4, y: 1.15, w: 9.2, colW: [2.9, 0.9, 1.2, 0.9, 0.9, 0.9, 1.5], border: { type: 'solid', color: 'DDD6CA', pt: 0.5 } });

  // 7. Стройконтроль
  if (r.sk && r.sk.total) {
    const k = r.sk.cur;
    s = pptx.addSlide();
    title(s, 'Стройконтроль', 'Выдано ' + k.issued + ' · закрыто ' + k.closed + ' · открыто на конец месяца ' + k.open + (k.awaiting ? ' (ждут проверки ' + k.awaiting + ')' : '') + ' · просрочено сейчас ' + k.overdueNow + ' · ИДЗ ' + (k.idz != null ? fmt(k.idz) : '—'));
    const sr = [[cell('Подрядчик', HDR), cell('Выдано', HDR), cell('Закрыто', HDR), cell('Открыто', HDR), cell('В срок', HDR), cell('Просрочено сейчас', HDR), cell('Закрыто с опозд.', HDR), cell('ИДЗ', HDR)]];
    r.sk.cons.slice(0, 14).forEach((x) => {
      const q = x.cur;
      sr.push([cell(x.name), cell(q.issued), cell(q.closed), cell(q.open), cell(q.onTimePerc != null ? fmt(q.onTimePerc) + ' %' : '—'), cell(q.overdueNow), cell(q.closedLate), cell(x.idz != null ? fmt(x.idz) : '—')]);
    });
    s.addTable(sr, { x: 0.4, y: 1.15, w: 9.2, colW: [2.6, 0.8, 0.9, 0.9, 0.9, 1.3, 1.2, 0.6], border: { type: 'solid', color: 'DDD6CA', pt: 0.5 } });
  }

  // 8. Выводы
  s = pptx.addSlide();
  title(s, 'Выводы и что сделать');
  const F = r.findings;
  const lines = [].concat(
    [{ text: 'Заметно изменилось', options: { bold: true, breakLine: true } }],
    (F.notable.length ? F.notable.map((n) => ({ text: n.text, options: { bullet: true, breakLine: true, color: n.good ? '52705F' : '9F4C45' } })) : [{ text: 'Ничего — все изменения в пределах разброса или мало данных.', options: { bullet: true, breakLine: true } }]),
    [{ text: 'Что сделать', options: { bold: true, breakLine: true } }],
    (F.recs.length ? F.recs : ['—']).map((t) => ({ text: t, options: { bullet: true, breakLine: true } }))
  );
  s.addText(lines, { x: 0.4, y: 0.9, w: 9.2, h: 4.5, fontSize: 12, color: '172330', valign: 'top' });
  return pptx;
}

export async function exportMonthReportPptx(r, meta) {
  const Ctor = resolvePptx();
  if (!Ctor) { toast('Библиотека PowerPoint не загружена'); return; }
  try {
    await buildMonthReportPptx(Ctor, r, meta).writeFile({ fileName: fileBase(r) + '.pptx' });
  } catch (e) {
    console.error('[month-report] pptx', e);
    toast('Не удалось сформировать PowerPoint: ' + (e && e.message));
  }
}
