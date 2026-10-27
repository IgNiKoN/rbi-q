/**
 * month-dynamics.view.js
 * P2-0049: переключатель «Сводка / Динамика за месяц» внутри подвкладки «Сводка» и экран динамики.
 * Числа — только из month-dynamics.calc.js; цвета — только токены темы (standards/DESIGN_SYSTEM.md §3а).
 * Обычная Сводка (#onepager-content-container) не меняется: в режиме «Динамика» она просто скрыта.
 * Макет: ai-dev/specs/quality-month-mockup/index.html.
 */
import { computeMonthDynamics, availableMonths, monthKeyOf, FEW_DATA_N } from './month-dynamics.calc.js';

const MODE_KEY = 'rbi_onepager_view';
const SWITCH_ID = 'md-view-switch';
const ROOT_ID = 'md-root';
const STYLE_ID = 'md-style';

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const STEPS = [
  { name: 'Сбор данных', note: 'меньше 7' },
  { name: 'Предварительный', note: '7–15' },
  { name: 'Базовый', note: '16–23' },
  { name: 'Уверенный', note: '24–31' },
  { name: 'Стабильный', note: '32–50' },
  { name: 'Эталонный', note: '51+' }
];

/** Подсказки «как считается» — простым языком. */
const HINTS = {
  vol: '<b>Объём выборки</b> — сколько проверок сделали в календарном месяце и сколько пунктов чек-листов в них реально осмотрели. Проверяем выборочно, поэтому все числа ниже — про осмотренное, а не про всю стройку.',
  conf: '<b>Надёжность месяца</b> — по числу проверок: меньше 7 — «Сбор данных» (мало данных, стрелки не рисуем), 7–15 — «Предварительный», 16–23 — «Базовый», 24–31 — «Уверенный», 32–50 — «Стабильный», 51 и больше — «Эталонный». Те же ступени, что в рейтинге подрядчиков.',
  comp: '<b>Состав выборки</b> — какие виды работ проверяли в этом месяце (полоска) и какая их доля обычно за 12 месяцев (чёрточка).',
  mix: '<b>Поправка на состав.</b> Если в месяце больше проверили «трудный» вид работ, общий УрК может упасть без реального ухудшения. Здесь УрК пересчитан так, будто виды работ проверяли в обычных долях за 12 месяцев.',
  delta: '<b>Этот / прошлый месяц.</b> Изменение «заметное», только если оно больше разброса обоих месяцев. Иначе — «в пределах разброса»: разница может быть случайной. Если в любом месяце меньше 7 проверок — «мало данных», не сравниваем.',
  base: '<b>Базовый УрК</b> — средняя доля выполненных пунктов с весами (B1 = 1, B2 = 2, B3 = 3) по проверкам месяца, без штрафов. Рядом — разброс ±: где скорее всего находится настоящее значение.',
  final: '<b>Итоговый УрК</b> — УрК проверок со штрафами за значимые (B2) и критичные (B3) дефекты, как в карточке проверки.',
  b3share: '<b>Проверок с критичным дефектом</b> — доля проверок месяца, где найден хотя бы один B3.',
  per100: '<b>Невыполненных пунктов на 100 проверенных</b> — делим на пункты, а не на проверки: чек-листы разной длины.',
  red: '<b>Красная зона</b> — проверки с критичным дефектом (B3) или итоговым УрК ниже 70.',
  trend: '<b>Тренд за 12 месяцев.</b> Сплошная линия — базовый УрК, полоса вокруг — разброс ±, пунктир — итоговый УрК. Пустой кружок — меньше 7 проверок. Внизу — число проверок по месяцам.',
  zones: '<b>Зоны качества</b> — доли проверок месяца: зелёная (итоговый УрК от 85), жёлтая (70–84), красная (B3 или ниже 70).'
};

const state = { month: null, timer: null, ro: null, lastFp: null, result: null };

function _t(key, fallback) {
  try {
    const i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
    if (i18n && typeof i18n.t === 'function') {
      const s = i18n.t(key);
      if (s && s !== key) return s;
    }
  } catch (_) { /* ignore */ }
  return fallback;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmt(x, d) {
  if (x == null || isNaN(x)) return '—';
  return Number(x).toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
}
function fmtS(x, d) {
  if (x == null || isNaN(x)) return '—';
  const v = Number(Number(x).toFixed(d || 0));
  return (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v), d);
}
function plural(n, a, b, c) {
  n = Math.abs(n) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return c;
  if (n1 > 1 && n1 < 5) return b;
  if (n1 === 1) return a;
  return c;
}
function monthParts(key) {
  const p = String(key).split('-');
  return { y: Number(p[0]), m: Number(p[1]) - 1 };
}
function monthFull(key) { const p = monthParts(key); return MONTHS[p.m].charAt(0).toUpperCase() + MONTHS[p.m].slice(1) + ' ' + p.y; }
function monthShort(key) { return MONTHS_SHORT[monthParts(key).m]; }
function zoneOfUrk(v) { return v >= 85 ? 'ok' : v >= 70 ? 'warn' : 'bad'; }
function hint(k) { return '<button type="button" class="md-hint" data-md-hint="' + k + '" aria-label="Как считается">?</button>'; }

/* ---------- Режим ---------- */

export function getOnepagerView() {
  try { return localStorage.getItem(MODE_KEY) === 'month' ? 'month' : 'summary'; } catch (_) { return 'summary'; }
}
function setOnepagerView(v) {
  try { localStorage.setItem(MODE_KEY, v); } catch (_) { /* ignore */ }
}

/* ---------- Стили (токены темы) ---------- */

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
#${SWITCH_ID}{display:flex;margin:0 0 10px}
#${SWITCH_ID}.is-month{max-width:1440px;margin:0 auto 10px}
#${SWITCH_ID} .md-seg{display:inline-flex;border:1px solid var(--line-strong,var(--card-border));border-radius:10px;overflow:hidden;background:var(--card-bg)}
#${SWITCH_ID} button{background:transparent;border:0;padding:7px 14px;font-size:12px;font-weight:750;color:var(--text-muted);cursor:pointer;white-space:nowrap}
#${SWITCH_ID} button+button{border-left:1px solid var(--line-strong,var(--card-border))}
#${SWITCH_ID} button.is-on{background:var(--btn-primary,var(--accent));color:var(--btn-primary-text,var(--text-main))}
.md-root{--md-card:var(--card-bg);--md-card2:var(--card-bg-2,var(--card-bg));--md-line:var(--card-border);--md-line2:var(--line-strong,var(--card-border));
 --md-text:var(--text-main);--md-muted:var(--text-muted);--md-gold:var(--gold,var(--accent));--md-acc:var(--accent-text,var(--text-main));
 --md-ok:var(--color-green);--md-warn:var(--color-yellow);--md-bad:var(--color-red);
 --md-ok-t:var(--ok-text,var(--color-green));--md-warn-t:var(--warn-text,var(--color-yellow));--md-bad-t:var(--bad-text,var(--color-red));
 --md-blue:var(--color-blue);--md-hover:var(--hover-bg);--md-sel:var(--sel-bg,var(--hover-bg));--md-chip:color-mix(in srgb,var(--md-gold) 15%,transparent);
 container-type:inline-size;container-name:md;max-width:1440px;margin:0 auto;color:var(--md-text);font-size:13px;line-height:1.45;padding-bottom:28px}
.md-root *{box-sizing:border-box}
.md-bar{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px 12px;margin-bottom:6px}
.md-f{display:flex;flex-direction:column;gap:3px}
.md-f span{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--md-muted)}
.md-f select{background:var(--md-card);color:var(--md-text);border:1px solid var(--md-gold);border-radius:8px;padding:7px 10px;font-size:13px;font-weight:800;min-width:170px}
.md-summary{font-size:11.5px;color:var(--md-muted);margin:2px 0 4px}
.md-summary b{color:var(--md-text)}
.md-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
.md-grid>*{min-width:0}
.md-sec{grid-column:1/-1;display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 10px;margin:14px 0 0;font-size:15px;font-weight:800}
.md-sec .n{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:6px;background:var(--md-chip);color:var(--md-acc);font-size:11px;font-weight:900;flex:none}
.md-sec .note{font-size:11.5px;font-weight:600;color:var(--md-muted)}
.md-card{background:var(--md-card);border:1px solid var(--md-line);border-radius:12px;padding:14px;min-width:0}
.md-card h3{margin:0 0 4px;font-size:13px;font-weight:800;display:flex;align-items:center;gap:6px}
.md-card .sub{margin:0 0 10px;font-size:11.5px;color:var(--md-muted)}
.md-muted{color:var(--md-muted)}
.md-ok{color:var(--md-ok-t)} .md-warn{color:var(--md-warn-t)} .md-bad{color:var(--md-bad-t)}
.md-hint{flex:none;width:18px;height:18px;border-radius:50%;border:1px solid var(--md-line2);background:transparent;color:var(--md-muted);font-size:10px;font-weight:800;line-height:1;cursor:help;padding:0;display:inline-grid;place-items:center}
.md-hint:hover,.md-hint.on{border-color:var(--md-gold);color:var(--md-acc)}
.md-pop{position:fixed;z-index:200;max-width:300px;background:var(--md-card2);color:var(--md-text);border:1px solid var(--md-gold);border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.45;box-shadow:0 12px 28px rgba(0,0,0,.2);display:none}
.md-pop b{color:var(--md-acc)}
.md-vol{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px}
.md-vol>div{background:var(--md-card2);border:1px solid var(--md-line);border-radius:10px;padding:8px 10px}
.md-vol .k{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--md-muted)}
.md-vol .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.15}
.md-vol .v small{font-size:11px;font-weight:600;color:var(--md-muted);margin-left:4px}
.md-cols{display:grid;gap:14px}
.md-ladder{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;margin:6px 0 4px}
.md-ladder div{padding:6px 4px 5px;border-radius:6px;background:var(--md-hover);text-align:center;font-size:10px;line-height:1.2;color:var(--md-muted);font-weight:650;min-width:0}
.md-ladder div small{display:block;font-size:9px;font-weight:600}
.md-ladder div.past{background:color-mix(in srgb,var(--md-gold) 18%,transparent);color:var(--md-text)}
.md-ladder div.cur{background:var(--btn-primary,var(--md-gold));color:var(--btn-primary-text,var(--md-text));font-weight:800}
.md-comp{display:grid;gap:5px}
.md-comp .row{display:grid;grid-template-columns:minmax(0,110px) minmax(0,1fr) 70px;gap:8px;align-items:center;font-size:11.5px}
.md-comp .row>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.md-comp .bar{position:relative;height:10px;background:var(--md-hover);border-radius:3px}
.md-comp .bar b{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--md-gold);opacity:.8}
.md-comp .bar i{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--md-text);opacity:.55}
.md-comp .row>span:last-child{text-align:right;font-variant-numeric:tabular-nums;color:var(--md-muted)}
.md-big{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.md-big .v{font-size:28px;font-weight:850;font-variant-numeric:tabular-nums}
.md-note{margin-top:10px;font-size:11.5px;color:var(--md-muted);border-left:3px solid var(--md-gold);padding:4px 0 4px 10px}
.md-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.md-tile{background:var(--md-card);border:1px solid var(--md-line);border-radius:12px;padding:11px 11px 9px;display:flex;flex-direction:column;gap:3px;min-width:0}
.md-tile:last-child{grid-column:1/-1}
.md-tile .t-head{display:flex;align-items:flex-start;gap:6px;justify-content:space-between}
.md-tile .t-title{font-size:10.5px;font-weight:750;letter-spacing:.02em;text-transform:uppercase;color:var(--md-muted);line-height:1.25}
.md-tile .t-val{font-size:24px;font-weight:850;line-height:1.05;font-variant-numeric:tabular-nums;margin-top:3px}
.md-tile .t-val small{font-size:14px;font-weight:700;margin-left:1px}
.md-tile .t-val .pm{font-size:13px;font-weight:700;color:var(--md-muted);margin-left:4px}
.md-tile .t-range,.md-tile .t-prev{font-size:11px;color:var(--md-muted);font-variant-numeric:tabular-nums}
.md-tile .t-prev b{color:var(--md-text);font-weight:700}
.md-tile .t-delta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;font-size:11px;font-weight:750;margin-top:3px;font-variant-numeric:tabular-nums;color:var(--md-muted)}
.md-tile .badge{font-size:10px;font-weight:800;border-radius:999px;padding:1px 7px;background:var(--md-hover);color:var(--md-muted)}
.md-tile .t-delta.good{color:var(--md-ok-t)} .md-tile .t-delta.bad{color:var(--md-bad-t)}
.md-tile .t-delta.good .badge{background:color-mix(in srgb,var(--md-ok) 22%,transparent);color:var(--md-ok-t)}
.md-tile .t-delta.bad .badge{background:color-mix(in srgb,var(--md-bad) 22%,transparent);color:var(--md-bad-t)}
.md-spk{margin-top:4px;width:100%;height:24px}
.md-lg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11px;color:var(--md-muted);margin:2px 0 8px}
.md-lg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.md-lg i.line{height:3px;width:16px;vertical-align:3px}
.md-lg i.dash{height:0;border-top:2px dashed var(--md-blue);width:16px;vertical-align:3px;border-radius:0}
.md-lg i.hollow{border-radius:50%;border:2px solid var(--md-gold);background:transparent;width:9px;height:9px}
.md-chart{width:100%;min-height:60px}
.md-svg{display:block;max-width:100%;height:auto;overflow:visible;font-family:inherit}
.md-svg .ax{font-size:10px;fill:var(--md-muted)}
.md-svg .ax-sel{fill:var(--md-text);font-weight:700}
.md-svg .ax-bad{fill:var(--md-bad-t);font-weight:700}
.md-svg .val{font-size:11px;font-weight:800;fill:var(--md-text)}
.md-svg .grid{stroke:var(--md-line);stroke-width:1}
.md-svg .thr{stroke-width:1.2;stroke-dasharray:4 4}
.md-svg .thr-ok{stroke:var(--md-ok)} .md-svg .thr-bad{stroke:var(--md-bad)}
.md-svg .thr-lbl-ok{fill:var(--md-ok-t);font-weight:700} .md-svg .thr-lbl-bad{fill:var(--md-bad-t);font-weight:700}
.md-svg .sel-band{fill:var(--md-sel)}
.md-svg .ci-band{fill:var(--md-gold);opacity:.18}
.md-svg .ln{fill:none;stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round}
.md-svg .ln-base{stroke:var(--md-gold)}
.md-svg .ln-final{stroke:var(--md-blue);stroke-width:1.6;stroke-dasharray:5 4}
.md-svg .dot-base{fill:var(--md-gold);stroke:var(--md-card);stroke-width:1.5}
.md-svg .dot-final{fill:var(--md-blue)}
.md-svg .dot-hollow{fill:var(--md-card);stroke:var(--md-gold);stroke-width:2}
.md-svg .bar-n{fill:var(--md-line2)} .md-svg .bar-sel{fill:var(--md-gold);opacity:.75}
.md-svg .bar-few{fill:none;stroke:var(--md-bad);stroke-width:1.2;stroke-dasharray:3 2}
.md-svg .z-ok{fill:var(--md-ok)} .md-svg .z-warn{fill:var(--md-warn)} .md-svg .z-bad{fill:var(--md-bad)}
.md-svg .few{opacity:.38}
.md-svg .ln-spark{fill:none;stroke:var(--md-gold);stroke-width:1.6;opacity:.85}
.md-empty{padding:18px;text-align:center;color:var(--md-muted)}
@container md (min-width:600px){
 .md-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
 .md-d6,.md-d4,.md-d2,.md-sec{grid-column:1/-1}
 .md-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}
 .md-tile:last-child{grid-column:span 2}
 .md-vol{grid-template-columns:repeat(5,minmax(0,1fr))}
 .md-cols{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
}
@container md (min-width:1024px){
 .md-grid{grid-template-columns:repeat(6,minmax(0,1fr));gap:14px}
 .md-d6{grid-column:span 6} .md-d4{grid-column:span 4} .md-d2{grid-column:span 2}
 .md-tiles{grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
 .md-tile:last-child{grid-column:auto}
 .md-tile .t-val{font-size:27px}
 .md-cols{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr) minmax(0,1fr)}
}`;
  document.head.appendChild(st);
}

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

function chartTrend(w, r) {
  const ms = r.trend, sel = ms.length - 1, narrow = w < 520;
  const pl = 30, pr = narrow ? 8 : 26, pt = 16, h1 = narrow ? 170 : 200, gap = 26, h2 = narrow ? 52 : 62, h = pt + h1 + gap + h2 + 20;
  const { bw, x } = band(ms.length, w, pl, pr);
  let mn = 100;
  ms.forEach((m) => { if (m.base) mn = Math.min(mn, m.base.lo != null ? m.base.lo : m.base.mean, m.final.mean); });
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
  s += line('final', 'ln-final');
  s += line('base', 'ln-base');
  ms.forEach((m, i) => {
    if (!m.base) return;
    const tip = monthFull(m.key) + ': проверок ' + m.N + (m.few ? ' (мало данных)' : '')
      + '\nБазовый УрК ' + fmt(m.base.mean, 1) + (m.base.E != null ? ' ± ' + fmt(m.base.E, 1) : '') + ' %'
      + '\nИтоговый УрК ' + fmt(m.final.mean, 1) + ' %';
    s += '<g><title>' + esc(tip) + '</title>';
    s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(m.final.mean).toFixed(1) + '" r="2.6" class="dot-final"/>';
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

function chartZones(w, r) {
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

function chartSpark(w, h, vals, few) {
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

const CHARTS = { trend: chartTrend, zones: chartZones };

/* ---------- Блоки ---------- */

function typeTitle(key, list) {
  const c = list.find((x) => String(x.templateKey || '') === key);
  return (c && c.templateTitle) || key;
}

function blockVolume(r, all) {
  const c = r.cur;
  const idx = STEPS.findIndex((s) => c.conf.name.indexOf(s.name) === 0);
  const lad = STEPS.map((s, i) => '<div class="' + (i === idx ? 'cur' : i < idx ? 'past' : '') + '">' + s.name + '<small>' + s.note + '</small></div>').join('');
  const types = Object.keys(c.byType).sort((a, b) => c.byType[b] - c.byType[a]);
  const comp = types.map((t) => {
    const p = c.byType[t] / c.N * 100;
    const avg = (r.typeShare[t] || 0) * 100;
    return '<div class="row"><span title="' + esc(typeTitle(t, all)) + '">' + esc(typeTitle(t, all)) + '</span>'
      + '<div class="bar"><b style="width:' + p.toFixed(1) + '%"></b><i style="left:' + avg.toFixed(1) + '%" title="обычно ' + fmt(avg) + ' %"></i></div>'
      + '<span>' + c.byType[t] + ' · ' + fmt(p) + ' %</span></div>';
  }).join('');
  return '<h2 class="md-sec"><span class="n">1</span>Объём выборки и надёжность месяца' + hint('vol') + '</h2>'
    + '<div class="md-card md-d6"><div class="md-vol">'
    + '<div><div class="k">Проверок</div><div class="v">' + fmt(c.N) + '<small>' + monthShort(r.prevMonth) + ': ' + fmt(r.prev.N) + '</small></div></div>'
    + '<div><div class="k">Проверено пунктов</div><div class="v">' + fmt(c.items) + '</div></div>'
    + '<div><div class="k">Объектов</div><div class="v">' + c.nObj + '</div></div>'
    + '<div><div class="k">Подрядчиков</div><div class="v">' + c.nCon + '</div></div>'
    + '<div><div class="k">Инспекторов</div><div class="v">' + c.nIns + '</div></div></div>'
    + '<div class="md-cols"><div><h3>Надёжность месяца' + hint('conf') + '</h3><p class="sub">' + fmt(c.N) + ' ' + plural(c.N, 'проверка', 'проверки', 'проверок')
    + ' — ступень «' + esc(STEPS[Math.max(0, idx)].name) + '»' + (c.conf.few ? '. <b class="md-bad">Мало данных:</b> нужно не меньше ' + FEW_DATA_N + ' проверок, изменения к прошлому месяцу не оцениваем.' : '') + '</p>'
    + '<div class="md-ladder">' + lad + '</div></div>'
    + '<div><h3>Состав выборки по видам работ' + hint('comp') + '</h3><p class="sub">Полоска — этот месяц, чёрточка — обычная доля за 12 месяцев</p><div class="md-comp">' + (comp || '<span class="md-muted">нет проверок</span>') + '</div></div>'
    + '<div><h3>Поправка на состав' + hint('mix') + '</h3><p class="sub">УрК, если бы виды работ проверяли в обычных долях</p>'
    + '<div class="md-big"><span class="v ' + (c.baseMix != null ? 'md-' + zoneOfUrk(c.baseMix) : '') + '">' + fmt(c.baseMix, 1) + ' %</span><span class="md-muted">обычный базовый УрК: ' + (c.base ? fmt(c.base.mean, 1) + ' %' : '—') + '</span></div>'
    + '<div class="md-note">Это доля брака <b>среди осмотренного</b>, а не по всей стройке. Пересчитывать её на весь объём работ нельзя.</div></div></div></div>';
}

const TILE_FMT = { base: { d: 1, u: ' %' }, final: { d: 1, u: ' %' }, b3share: { d: 0, u: ' %' }, per100: { d: 1, u: '' }, red: { d: 0, u: ' %' } };

function tileHtml(t, r) {
  const c = t.cur, p = t.prev, f = TILE_FMT[t.key], d = f.d, isPct = f.u === ' %';
  const head = '<div class="t-head"><span class="t-title">' + esc(t.title) + '</span>' + hint(t.key) + '</div>';
  if (!c) return '<div class="md-tile">' + head + '<div class="t-val md-muted">—</div><div class="t-range">нет проверок</div></div>';
  const valCls = (t.key === 'base' || t.key === 'final') ? 'md-' + zoneOfUrk(c.mean) : '';
  const cmp = t.cmp;
  const pp = isPct ? ' п.п.' : '';
  let dl;
  if (cmp.kind === 'few') {
    dl = '<div class="t-delta"><span class="badge">мало данных</span>' + (cmp.d != null ? '<span>' + fmtS(cmp.d, d) + pp + ' — не сравниваем</span>' : '') + '</div>';
  } else {
    const arrow = Math.abs(cmp.d) < Math.pow(10, -d) / 2 ? '=' : cmp.d > 0 ? '▲' : '▼';
    const cls = cmp.kind === 'notable' ? (cmp.good ? 'good' : 'bad') : '';
    dl = '<div class="t-delta ' + cls + '"><span>' + arrow + ' ' + fmtS(cmp.d, d) + pp + '</span><span class="badge">'
      + (cmp.kind === 'notable' ? (cmp.good ? 'заметно лучше' : 'заметно хуже') : 'в пределах разброса') + '</span>' + hint('delta') + '</div>';
  }
  const series = r.trend.map((m) => { const v = m[t.key]; return v ? v.mean : null; });
  const few = r.trend.map((m) => m.few);
  const hi = isPct ? Math.min(100, c.mean + (c.E || 0)) : c.mean + (c.E || 0);
  return '<div class="md-tile">' + head
    + '<div class="t-val ' + valCls + '">' + fmt(c.mean, d) + '<small>' + f.u.trim() + '</small>' + (c.E != null ? '<span class="pm">± ' + fmt(c.E, d) + '</span>' : '') + '</div>'
    + '<div class="t-range">' + (c.E != null ? 'скорее всего от ' + fmt(Math.max(0, c.mean - c.E), d) + ' до ' + fmt(hi, d) : 'разброс не посчитать') + '</div>'
    + '<div class="t-prev">' + monthFull(r.prevMonth).split(' ')[0] + ': <b>' + (p ? fmt(p.mean, d) + f.u : '—') + '</b>' + (p && p.E != null ? ' ± ' + fmt(p.E, d) : '') + (p ? ' · ' + p.N + ' пр.' : '') + '</div>'
    + dl + '<div class="md-spk" data-md-spark="' + series.map((v) => (v == null ? '' : v.toFixed(2))).join(',') + '" data-md-few="' + few.map((x) => (x ? 1 : 0)).join(',') + '"></div></div>';
}

function blockTiles(r) {
  const pm = monthParts(r.prevMonth), cm = monthParts(r.month);
  return '<h2 class="md-sec"><span class="n">2</span>' + esc(monthFull(r.month)) + ' против ' + MONTHS_GEN[pm.m] + (pm.y !== cm.y ? ' ' + pm.y : '') + hint('delta') + '<span class="note">этот / прошлый / изменение</span></h2>'
    + '<div class="md-d6"><div class="md-tiles">' + r.tiles.map((t) => tileHtml(t, r)).join('') + '</div></div>';
}

function blockTrend(r) {
  const first = r.trend[0].key, last = r.trend[r.trend.length - 1].key;
  return '<h2 class="md-sec"><span class="n">3</span>Динамика за 12 месяцев<span class="note">' + esc(monthFull(first).toLowerCase()) + ' — ' + esc(monthFull(last).toLowerCase()) + '</span></h2>'
    + '<div class="md-card md-d4"><h3>Уровень качества (УрК) по месяцам' + hint('trend') + '</h3>'
    + '<div class="md-lg"><span><i class="line" style="background:var(--md-gold)"></i>Базовый УрК</span><span><i style="background:var(--md-gold);opacity:.3"></i>разброс ±</span><span><i class="dash"></i>Итоговый УрК</span><span><i class="hollow"></i>меньше 7 проверок</span><span><i style="background:var(--md-line2)"></i>число проверок</span></div>'
    + '<div class="md-chart" data-md-chart="trend"></div></div>'
    + '<div class="md-card md-d2"><h3><span class="md-sec" style="margin:0;font-size:13px"><span class="n">4</span></span>Зоны качества по месяцам' + hint('zones') + '</h3>'
    + '<div class="md-lg"><span><i style="background:var(--md-ok)"></i>зелёная (от 85)</span><span><i style="background:var(--md-warn)"></i>жёлтая (70–84)</span><span><i style="background:var(--md-bad)"></i>красная (B3 или ниже 70)</span></div>'
    + '<div class="md-chart" data-md-chart="zones"></div></div>';
}

/* ---------- Отрисовка ---------- */

function drawCharts(root) {
  const r = state.result;
  if (!r || !root) return;
  root.querySelectorAll('[data-md-chart]').forEach((el) => {
    const w = Math.floor(el.clientWidth);
    if (w < 120) return;
    el.innerHTML = CHARTS[el.getAttribute('data-md-chart')](w, r);
  });
  root.querySelectorAll('[data-md-spark]').forEach((el) => {
    const w = Math.floor(el.clientWidth);
    if (w < 40) return;
    const vals = el.getAttribute('data-md-spark').split(',').map((v) => (v === '' ? null : +v));
    const few = el.getAttribute('data-md-few').split(',').map((v) => v === '1');
    el.innerHTML = chartSpark(w, 24, vals, few);
  });
}

function pickMonth(months) {
  const now = monthKeyOf(new Date());
  if (state.month && (state.month === now || months.indexOf(state.month) >= 0)) return state.month;
  return months.length && months.indexOf(now) < 0 ? months[0] : now;
}

function monthOptions(months, sel) {
  const now = monthKeyOf(new Date());
  const list = months.indexOf(now) >= 0 ? months.slice() : [now].concat(months);
  if (list.indexOf(sel) < 0) list.unshift(sel);
  return list.map((k) => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(monthFull(k)) + '</option>').join('');
}

export function renderMonthDynamics(root, checks) {
  ensureStyle();
  const months = availableMonths(checks);
  const month = pickMonth(months);
  state.month = month;
  const r = computeMonthDynamics(checks, { month });
  state.result = r;
  const c = r.cur;
  const bar = '<div class="md-bar"><label class="md-f"><span>Месяц</span><select data-md-month>' + monthOptions(months, month) + '</select></label></div>'
    + '<div class="md-summary"><b>' + esc(monthFull(month)) + '</b> · ' + fmt(c.N) + ' ' + plural(c.N, 'проверка', 'проверки', 'проверок')
    + ' · надёжность «' + esc(c.conf.name) + '» · сравнение с: ' + esc(monthFull(r.prevMonth).toLowerCase())
    + (r.skippedNoMetrics ? ' · без оценки: ' + r.skippedNoMetrics : '') + '</div>'
    + '<div class="md-summary">Объект, подрядчик, вид работ и инспектор — из фильтров выше; период фильтров здесь не действует.</div>';
  let body;
  if (!c.N) {
    body = blockVolume(r, checks) + '<div class="md-card md-d6"><p class="md-empty">За этот месяц нет проверок по выбранным фильтрам.</p></div>';
  } else {
    body = blockVolume(r, checks) + blockTiles(r) + blockTrend(r);
  }
  root.innerHTML = bar + '<div class="md-grid">' + body + '</div>';
  drawCharts(root);
}

/* ---------- Подсказки ---------- */

function ensurePop() {
  let pop = document.getElementById('md-pop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'md-pop';
    pop.className = 'md-pop';
    pop.setAttribute('role', 'tooltip');
    document.body.appendChild(pop);
    document.addEventListener('click', (e) => {
      if (!e.target.closest || (!e.target.closest('.md-hint') && !e.target.closest('#md-pop'))) hidePop();
    });
  }
  return pop;
}
function hidePop() {
  const pop = document.getElementById('md-pop');
  if (pop) pop.style.display = 'none';
  document.querySelectorAll('.md-hint.on').forEach((b) => b.classList.remove('on'));
}
function showPop(btn) {
  const pop = ensurePop();
  const k = btn.getAttribute('data-md-hint');
  if (btn.classList.contains('on')) { hidePop(); return; }
  hidePop();
  pop.innerHTML = HINTS[k] || '';
  pop.style.display = 'block';
  btn.classList.add('on');
  const b = btn.getBoundingClientRect();
  const pw = Math.min(300, window.innerWidth - 24);
  pop.style.maxWidth = pw + 'px';
  let left = Math.min(Math.max(12, b.left + b.width / 2 - pw / 2), window.innerWidth - pw - 12);
  let top = b.bottom + 8;
  if (top + pop.offsetHeight > window.innerHeight - 8) top = Math.max(8, b.top - pop.offsetHeight - 8);
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
}

/* ---------- Переключатель и встраивание в «Сводку» ---------- */

function sourceData() {
  const a = window.AnalyticsActions;
  if (a && typeof a.getMonthDynamicsSourceData === 'function') return a.getMonthDynamicsSourceData();
  return [];
}

function ensureSwitch(section) {
  let sw = document.getElementById(SWITCH_ID);
  if (!sw) {
    sw = document.createElement('div');
    sw.id = SWITCH_ID;
    sw.innerHTML = '<div class="md-seg" role="group" aria-label="' + esc(_t('quality.analytics.month.switch_aria', 'Вид Сводки')) + '">'
      + '<button type="button" data-md-view="summary">' + esc(_t('quality.analytics.month.view_summary', 'Сводка')) + '</button>'
      + '<button type="button" data-md-view="month">' + esc(_t('quality.analytics.month.view_month', 'Динамика за месяц')) + '</button></div>';
    sw.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('[data-md-view]');
      if (!btn) return;
      const v = btn.getAttribute('data-md-view');
      if (v === getOnepagerView()) return;
      setOnepagerView(v);
      state.lastFp = null;
      applyView(true);
    });
  }
  if (sw.parentNode !== section || section.firstChild !== sw) section.insertBefore(sw, section.firstChild);
  return sw;
}

function ensureRoot(section) {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'md-root hidden';
    root.addEventListener('change', (e) => {
      const sel = e.target.closest && e.target.closest('[data-md-month]');
      if (!sel) return;
      state.month = sel.value;
      state.lastFp = null;
      applyView(true);
    });
    root.addEventListener('click', (e) => {
      const h = e.target.closest && e.target.closest('.md-hint');
      if (h) { e.preventDefault(); showPop(h); }
    });
    if (typeof ResizeObserver === 'function') {
      let rw = 0;
      state.ro = new ResizeObserver((entries) => {
        const w = Math.round(entries[0].contentRect.width);
        if (w && w !== rw) { rw = w; drawCharts(root); }
      });
      state.ro.observe(root);
    }
  }
  const sw = document.getElementById(SWITCH_ID);
  if (root.parentNode !== section) section.insertBefore(root, sw ? sw.nextSibling : section.firstChild);
  return root;
}

function fingerprint(data) {
  let last = '';
  for (let i = 0; i < data.length; i++) { const d = data[i] && data[i].date; if (d && d > last) last = d; }
  return [state.month || '', data.length, last, document.documentElement.getAttribute('data-theme') || ''].join('|');
}

function applyView(force) {
  const section = document.getElementById('sub-onepager');
  if (!section) return;
  ensureStyle();
  const sw = ensureSwitch(section);
  const root = ensureRoot(section);
  const view = getOnepagerView();
  sw.querySelectorAll('[data-md-view]').forEach((b) => {
    const on = b.getAttribute('data-md-view') === view;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  sw.classList.toggle('is-month', view === 'month');
  const summary = document.getElementById('onepager-content-container');
  if (summary) summary.classList.toggle('hidden', view === 'month');
  root.classList.toggle('hidden', view !== 'month');
  if (view !== 'month') { hidePop(); return; }
  const data = sourceData();
  const fp = fingerprint(data);
  if (!force && fp === state.lastFp && root.childElementCount) return;
  state.lastFp = fp;
  try {
    renderMonthDynamics(root, data);
  } catch (e) {
    root.innerHTML = '<div class="md-card"><p class="md-empty">Не удалось посчитать динамику: ' + esc(e && e.message) + '</p></div>';
  }
}

/** Вызывается при отрисовке «Сводки» (телефон и ПК); повторные вызовы схлопываются. */
export function syncMonthDynamics() {
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = null;
    applyView(false);
  }, 30);
}

if (typeof window !== 'undefined') {
  window.syncMonthDynamics = syncMonthDynamics;
}
