/**
 * month-dynamics.view.js
 * P2-0049: переключатель «Сводка / Динамика за месяц» внутри подвкладки «Сводка» и экран динамики.
 * Числа — только из month-dynamics.calc.js; цвета — только токены темы (standards/DESIGN_SYSTEM.md §3а).
 * Обычная Сводка (#onepager-content-container) не меняется: в режиме «Динамика» она просто скрыта.
 * Макет: ai-dev/specs/quality-month-mockup/index.html.
 */
import { computeMonthDynamics, computeSkMonth, availableMonths, monthKeyOf, FEW_DATA_N } from './month-dynamics.calc.js';
import { getFilteredSkRecords, skDisciplineMetrics } from './sk.desktop.content.js';
import { printMonthReport, exportMonthReportPdf, exportMonthReportPptx } from './month-dynamics.report.js';
import {
  MONTHS_GEN, esc, fmt, fmtS, plural, monthParts, monthFull, monthShort, chartSpark, CHARTS
} from './month-dynamics.charts.js';


const MODE_KEY = 'rbi_onepager_view';
const SWITCH_ID = 'md-view-switch';
const ROOT_ID = 'md-root';
const STYLE_ID = 'md-style';

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
  iurk: '<b>ИУрК — интегральный уровень качества (надёжность)</b> — уровень качества по серии проверок, как «Надёжность» в «Сводке»: у каждого подрядчика на объекте — по всем его проверкам месяца, со штрафами за системный брак B2 и долю проверок с B3; среднее — по подрядчикам, у кого от 7 проверок. Если таких нет — «мало данных».',
  b3share: '<b>Проверок с критичным дефектом</b> — доля проверок месяца, где найден хотя бы один B3.',
  per100: '<b>Невыполненных пунктов на 100 проверенных</b> — делим на пункты, а не на проверки: чек-листы разной длины.',
  red: '<b>Красная зона</b> — проверки с критичным дефектом (B3) или с УрК проверки (со штрафами, как в карточке проверки) ниже 70.',
  trend: '<b>Тренд за 12 месяцев.</b> Сплошная линия — базовый УрК, полоса вокруг — разброс ±, пунктир — ИУрК (надёжность по серии проверок). Пустой кружок — меньше 7 проверок. Внизу — число проверок по месяцам.',
  zones: '<b>Зоны качества</b> — доли проверок месяца по УрК самой проверки (со штрафами, как в карточке проверки): зелёная (от 85), жёлтая (70–84), красная (B3 или ниже 70).',
  cons: '<b>ИУрК подрядчика за месяц</b> (надёжность) — по всем проверкам календарного месяца (не «последние 15»), те же штрафы за системный брак и B3, что в рейтинге. Сортировка — по нижней границе разброса: подрядчик с двумя случайно хорошими проверками не окажется первым. Меньше 7 проверок — бледная строка, ниже всех.',
  stab: '<b>Стабильность</b> — насколько ровно работает подрядчик от проверки к проверке (100 — одинаково, ниже 40 — качество скачет).',
  zoneC: '<b>Зона подрядчика</b> — красная: УрК ниже 70, или B3 в 20 % проверок и больше, или системный брак B2 от 40 %; «Образцовое» — УрК от 85 без B3 и без системного брака.',
  bcl: '<b>B1 / B2 / B3 на 100 проверенных пунктов</b> — малозначительные, значительные и критичные невыполненные пункты, делённые на число осмотренных пунктов.',
  crit: '<b>Доля критичных</b> — какая часть всех невыполненных пунктов месяца приходится на B3.',
  top: '<b>Топ-10 типовых дефектов</b> — пункты, которые чаще всего не выполнены. «k из N» — сколько раз пункт не выполнен из того, сколько раз его проверяли в месяце. Стрелка — к прошлому месяцу (если тогда пункт проверяли хотя бы 3 раза).',
  heat: '<b>Подрядчик × вид работ</b> — невыполненных пунктов на 100 проверенных по каждой связке. Бледные клетки — меньше 7 проверок.',
  rep: '<b>Повторяемость</b> — тот же пункт у того же подрядчика не выполнен 2 месяца подряд и дольше (до выбранного месяца). Это сигнал, что дефект не случайный.',
  sys: '<b>Системность брака B2</b> — у каждого подрядчика пункт веса B2 с наибольшей долей невыполнения за месяц. От 20 % — штраф к УрК, от 40 % — красная зона.',
  pareto: '<b>Причины дефектов (Парето)</b> — какие причины дают 80 % дефектов. Причину инженер указывает по желанию; дефекты без причины показаны отдельно.',
  iko: '<b>ИКО — индекс критичности объекта</b> (как в «Сводке»): 0 — нет риска, 1 — максимальный; до 0,3 — низкий риск, 0,3–0,6 — повышенный, от 0,6 — высокий. Считается за 3 месяца по связкам «подрядчик × вид работ» от 7 проверок.',
  cobj: '<b>Объекты компании</b> — как «Компания» в обычной Сводке, но за календарный месяц: у каждого объекта базовый УрК, ИУрК (надёжность), ИКО за 3 месяца, доля проверок с B3 и красной зоны; изменение к прошлому месяцу — «заметно», только если больше разброса.',
  sk: '<b>Замечания стройконтроля по месяцам</b> — одно правило для всей Аналитики: замечание открыто, пока инженер не поставил «Проверено»; «Устранено» подрядчиком — тоже открыто (ждёт проверки). Закрыто в месяце — проверено и устранено в этом месяце.',
  skov: '<b>Просрочено — два числа.</b> «Просрочено сейчас» — открыто на конец месяца, срок прошёл. «Закрыто с опозданием» — закрыто в месяце позже срока.',
  idz: '<b>ИДЗ — индекс дисциплины закрытия</b>, та же формула, что на экране Стройконтроля: в срок × 0,6 + (100 − просрочка) × 0,4 − средняя просрочка (дней, не больше 30). Считается по замечаниям, закрытым в этом месяце или открытым на его конец (те же, что в строке).',
  concl: '<b>Выводы месяца</b> собираются автоматически. «Заметно изменилось» — только то, что больше разброса; остальное — «в пределах разброса».'
};

const state = { month: null, timer: null, ro: null, lastFp: null, result: null, heat: 1, topAll: false, repAll: false, data: null };

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

function zoneOfUrk(v) { return v >= 85 ? 'ok' : v >= 70 ? 'warn' : 'bad'; }
function hint(k) { return '<button type="button" class="md-hint" data-md-hint="' + k + '" aria-label="Как считается">?</button>'; }

/* ---------- Режим ---------- */

/** «Объект / Компания» — общий тумблер Сводки (window.onepagerMode). */
function getOnepagerScope() {
  return typeof window !== 'undefined' && window.onepagerMode === 'global' ? 'global' : 'local';
}

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
.md-acts{display:flex;flex-direction:column;gap:3px;margin-left:auto}
.md-btns{display:flex;flex-wrap:wrap;gap:6px}
.md-btn{background:var(--md-card);color:var(--md-text);border:1px solid var(--md-line2);border-radius:8px;padding:7px 11px;font-size:12px;font-weight:750;cursor:pointer;white-space:nowrap}
.md-btn:hover{border-color:var(--md-gold);color:var(--md-acc)}
.md-btn[disabled]{opacity:.5;cursor:progress}
@container md (max-width:599px){.md-acts{margin-left:0;width:100%}.md-btn{flex:1 1 auto}}
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
.md-chipz{display:inline-block;font-size:10.5px;font-weight:800;border-radius:999px;padding:2px 8px;white-space:nowrap}
.md-chipz.green{background:color-mix(in srgb,var(--md-ok) 20%,transparent);color:var(--md-ok-t)}
.md-chipz.yellow{background:color-mix(in srgb,var(--md-warn) 20%,transparent);color:var(--md-warn-t)}
.md-chipz.red{background:color-mix(in srgb,var(--md-bad) 20%,transparent);color:var(--md-bad-t)}
.md-chipz.grey{background:var(--md-hover);color:var(--md-muted)}
.md-conf{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;white-space:nowrap}
.md-conf i{display:inline-flex;gap:1.5px}
.md-conf i b{width:4px;height:10px;border-radius:1px;background:var(--md-line2)}
.md-conf i b.on{background:var(--md-gold)}
.md-conf.few{color:var(--md-muted)}
.md-tblw{overflow-x:auto;max-width:100%}
.md-tbl{width:100%;border-collapse:collapse;font-size:12px}
.md-tbl th{font-size:10px;font-weight:750;letter-spacing:.04em;text-transform:uppercase;color:var(--md-muted);text-align:left;padding:6px 8px;border-bottom:1px solid var(--md-line2);white-space:nowrap}
.md-tbl td{padding:8px;border-bottom:1px solid var(--md-line);vertical-align:middle;font-variant-numeric:tabular-nums}
.md-tbl tr:last-child td{border-bottom:0}
.md-tbl td.r,.md-tbl th.r{text-align:right}
.md-tbl .name{font-weight:750}
.md-tbl .name small{display:block;font-weight:500;color:var(--md-muted);font-size:11px}
.md-tbl tr.faint td{opacity:.62}
.md-rk-inline{display:none;color:var(--md-muted);margin-right:4px}
.md-rng{position:relative;height:14px;min-width:110px;background:linear-gradient(90deg,color-mix(in srgb,var(--md-bad) 14%,transparent) 0 70%,color-mix(in srgb,var(--md-warn) 14%,transparent) 70% 85%,color-mix(in srgb,var(--md-ok) 14%,transparent) 85% 100%);border-radius:3px}
.md-rng b{position:absolute;top:5px;height:4px;background:var(--md-gold);opacity:.6;border-radius:2px}
.md-rng i{position:absolute;top:2px;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:var(--md-gold);border:2px solid var(--md-card)}
.md-rng i.hollow{background:var(--md-card);border-color:var(--md-gold)}
.md-dlt{font-weight:800;white-space:nowrap}
.md-dlt small{display:block;font-weight:650;font-size:10px;color:var(--md-muted)}
.md-dlt.good{color:var(--md-ok-t)} .md-dlt.bad{color:var(--md-bad-t)} .md-dlt.same{color:var(--md-muted)}
.md-mini{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:10px}
.md-mini>div{background:var(--md-card2);border:1px solid var(--md-line);border-radius:8px;padding:6px 8px}
.md-mini .k{font-size:10px;color:var(--md-muted);font-weight:700}
.md-mini .v{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums}
.md-top,.md-rep{list-style:none;margin:0;padding:0}
.md-top li{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:4px 10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--md-line)}
.md-top li:last-child,.md-rep li:last-child{border-bottom:0}
.md-top .rk{font-size:11px;font-weight:800;color:var(--md-muted);text-align:center}
.md-top .nm,.md-rep .nm{font-weight:700;font-size:12.5px;line-height:1.3;min-width:0}
.md-top .nm small,.md-rep .nm small{display:block;color:var(--md-muted);font-weight:500;font-size:11px}
.md-bcl{display:inline-block;font-size:9.5px;font-weight:850;border-radius:4px;padding:0 4px;margin-right:5px;vertical-align:1px}
.md-bcl.b1{background:color-mix(in srgb,var(--md-blue) 24%,transparent);color:var(--md-blue)}
.md-bcl.b2{background:color-mix(in srgb,var(--md-warn) 24%,transparent);color:var(--md-warn-t)}
.md-bcl.b3{background:color-mix(in srgb,var(--md-bad) 24%,transparent);color:var(--md-bad-t)}
.md-top .rt{display:flex;align-items:center;gap:8px;justify-content:flex-end}
.md-top .of{font-size:12px;font-weight:800;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.md-top .of small{display:block;font-size:10.5px;font-weight:600;color:var(--md-muted)}
.md-top .meter{grid-column:2/3;height:4px;background:var(--md-hover);border-radius:2px;position:relative}
.md-top .meter b{position:absolute;left:0;top:0;bottom:0;background:var(--md-bad);border-radius:2px;opacity:.75}
.md-top .meter i{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--md-text);opacity:.5}
.md-arrow{font-size:11px;font-weight:800;white-space:nowrap}
.md-arrow.up{color:var(--md-bad-t)} .md-arrow.down{color:var(--md-ok-t)} .md-arrow.eq,.md-arrow.na{color:var(--md-muted);font-weight:650}
.md-photo{width:34px;height:34px;border-radius:6px;flex:none;position:relative;overflow:hidden;background:var(--md-card2);border:1px solid var(--md-line2);display:grid;place-items:center;color:var(--md-muted);font-size:9px;font-weight:800}
.md-photo img{width:100%;height:100%;object-fit:cover}
.md-photo em{position:absolute;right:1px;bottom:0;font-style:normal;font-size:9px;font-weight:800;color:var(--md-text);background:var(--md-card);border-radius:3px;padding:0 2px}
.md-photo.none{opacity:.35}
.md-more{margin-top:8px;background:transparent;border:1px dashed var(--md-line2);border-radius:8px;padding:6px 10px;width:100%;font-size:12px;font-weight:700;color:var(--md-acc);cursor:pointer}
.md-heat{width:100%;border-collapse:separate;border-spacing:3px;font-size:11.5px}
.md-heat th{font-size:10px;font-weight:700;color:var(--md-muted);text-align:center;padding:2px;white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis}
.md-heat th.rowh{text-align:left;font-size:11.5px;color:var(--md-text);font-weight:750}
.md-heat td{text-align:center;border-radius:6px;padding:7px 2px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1;color:var(--md-text)}
.md-heat td small{display:block;font-size:9px;font-weight:650;opacity:.8}
.md-heat td.empty{background:transparent;color:var(--md-line2);font-weight:500}
.md-heat td.pale{opacity:.5;background-image:repeating-linear-gradient(135deg,transparent 0 4px,rgba(127,127,127,.18) 4px 6px)}
.md-hscale{display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--md-muted);margin-top:8px;flex-wrap:wrap}
.md-hscale span{width:22px;height:10px;border-radius:2px;display:inline-block}
.md-seg2{display:inline-flex;border:1px solid var(--md-line2);border-radius:7px;overflow:hidden;margin-left:auto}
.md-seg2 button{background:transparent;border:0;padding:3px 8px;font-size:11px;font-weight:700;color:var(--md-muted);cursor:pointer}
.md-seg2 button.on{background:var(--md-chip);color:var(--md-acc)}
.md-rep li{padding:8px 0;border-bottom:1px solid var(--md-line);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;align-items:center}
.md-rep .streak{font-size:11px;font-weight:800;color:var(--md-bad-t);white-space:nowrap;text-align:right}
.md-rep .hist{grid-column:1/-1;display:flex;gap:4px;flex-wrap:wrap}
.md-rep .hist span{font-size:10.5px;background:var(--md-hover);border-radius:4px;padding:1px 6px;color:var(--md-muted);font-variant-numeric:tabular-nums}
.md-rep .hist span b{color:var(--md-text)}
.md-sys{margin-top:12px;padding-top:10px;border-top:1px solid var(--md-line)}
.md-sys h4{margin:0 0 6px;font-size:12px;font-weight:800;display:flex;gap:6px;align-items:center}
.md-sys .row{display:grid;grid-template-columns:minmax(0,110px) minmax(0,1fr) 46px;gap:8px;align-items:center;font-size:11.5px;padding:3px 0}
.md-sys .row>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.md-sys .bar{height:8px;background:var(--md-hover);border-radius:3px;position:relative}
.md-sys .bar b{position:absolute;left:0;top:0;bottom:0;border-radius:3px}
.md-par{display:grid;gap:5px}
.md-par .row{display:grid;grid-template-columns:minmax(0,150px) minmax(0,1fr) 74px;gap:8px;align-items:center;font-size:11.5px}
.md-par .lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.md-par .row.in80 .lbl{font-weight:750}
.md-par .bar{position:relative;height:14px;background:var(--md-hover);border-radius:3px}
.md-par .bar b{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--md-gold);opacity:.4}
.md-par .row.in80 .bar b{opacity:.9}
.md-par .bar i{position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--md-bad)}
.md-par .row>span:last-child{text-align:right;font-variant-numeric:tabular-nums;color:var(--md-muted)}
.md-par .row>span:last-child b{color:var(--md-text)}
.md-zbar{display:flex;height:10px;border-radius:3px;overflow:hidden;min-width:90px;background:var(--md-hover)}
.md-zbar b{display:block;height:100%}
.md-zbar .g{background:var(--md-ok)} .md-zbar .y{background:var(--md-warn)} .md-zbar .r{background:var(--md-bad)}
.md-banner{font-size:11.5px;border-radius:8px;padding:7px 10px;background:color-mix(in srgb,var(--md-warn) 14%,transparent);color:var(--md-text);margin-bottom:10px;border:1px solid color-mix(in srgb,var(--md-warn) 35%,transparent)}
.md-banner.grey{background:var(--md-hover);border-color:var(--md-line)}
.md-concl{display:grid;gap:14px}
.md-concl h4{margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--md-muted)}
.md-concl ul{margin:0;padding-left:18px;display:grid;gap:5px}
.md-concl li{font-size:12.5px}
.md-concl .within li{color:var(--md-muted)}
.md-split{display:grid;gap:12px}
.md-mini.md-mini4{grid-template-columns:repeat(2,minmax(0,1fr))}
@container md (min-width:600px){.md-mini.md-mini4{grid-template-columns:repeat(4,minmax(0,1fr))}}
.md-aging{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:10px}
.md-aging>div{border-radius:8px;padding:7px 9px;background:var(--md-card2);border:1px solid var(--md-line)}
.md-aging .k{font-size:10.5px;color:var(--md-muted);font-weight:700}
.md-aging .v{font-size:17px;font-weight:850;font-variant-numeric:tabular-nums}
.md-svg .sk-iss{fill:var(--md-blue)} .md-svg .sk-cls{fill:var(--md-ok)}
.md-svg .ln-open{fill:none;stroke:var(--md-bad);stroke-width:2}
.md-svg .dot-open{fill:var(--md-bad);stroke:var(--md-card);stroke-width:1.2}
.md-svg .b-1{fill:var(--md-blue)} .md-svg .b-2{fill:var(--md-warn)} .md-svg .b-3{fill:var(--md-bad)}
.md-svg .zone-bg-ok{fill:var(--md-ok);opacity:.08} .md-svg .zone-bg-warn{fill:var(--md-warn);opacity:.08} .md-svg .zone-bg-bad{fill:var(--md-bad);opacity:.09}
.md-svg .ln.s-0{stroke:var(--md-gold)} .md-svg .ln.s-1{stroke:var(--md-blue)} .md-svg .ln.s-2{stroke:var(--color-violet,var(--md-blue))} .md-svg .ln.s-3{stroke:var(--md-ok)} .md-svg .ln.s-4{stroke:var(--md-warn)}
.md-svg circle.s-0{fill:var(--md-gold)} .md-svg circle.s-1{fill:var(--md-blue)} .md-svg circle.s-2{fill:var(--color-violet,var(--md-blue))} .md-svg circle.s-3{fill:var(--md-ok)} .md-svg circle.s-4{fill:var(--md-warn)}
@container md (max-width:899px){
 .md-tbl.cards thead{display:none}
 .md-tbl.cards,.md-tbl.cards tbody,.md-tbl.cards tr,.md-tbl.cards td{display:block;width:100%}
 .md-tbl.cards tr{border:1px solid var(--md-line);border-radius:10px;padding:8px 10px;margin-bottom:8px;background:var(--md-card2);display:grid;grid-template-columns:1fr 1fr;gap:2px 10px}
 .md-tbl.cards td{border:0;padding:2px 0;display:block;min-width:0}
 .md-tbl.cards td::before{content:attr(data-label);display:block;font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--md-muted)}
 .md-tbl.cards td.rk{display:none}
 .md-tbl.cards .md-rk-inline{display:inline}
 .md-tbl.cards td.full{grid-column:1/-1}
 .md-tbl.cards td.nolbl::before{display:none}
 .md-tbl.cards td.r{text-align:left}
 .md-tbl.cards .md-rng{min-width:0}
}
@container md (min-width:600px) and (max-width:899px){
 .md-tbl.cards tbody{display:grid;grid-template-columns:1fr 1fr;gap:8px}
 .md-tbl.cards tr{margin-bottom:0}
}
@container md (max-width:599px){
 .md-heat thead{display:none}
 .md-heat,.md-heat tbody{display:block}
 .md-heat tr{display:flex;flex-wrap:wrap;gap:4px;padding:8px 0;border-bottom:1px solid var(--md-line)}
 .md-heat th.rowh{flex-basis:100%;padding:0 0 2px;max-width:none}
 .md-heat td{flex:0 0 calc(33% - 3px);padding:5px 2px}
 .md-heat td::before{content:attr(data-label);display:block;font-size:9px;font-weight:650;opacity:.85;margin-bottom:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .md-heat td.empty{display:none}
 .md-par .row{grid-template-columns:minmax(0,112px) minmax(0,1fr) 64px}
}
@container md (min-width:600px){
 .md-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
 .md-d6,.md-d4,.md-d3,.md-d2,.md-sec{grid-column:1/-1}
 .md-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}
 .md-tile:last-child{grid-column:span 2}
 .md-vol{grid-template-columns:repeat(5,minmax(0,1fr))}
 .md-cols{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
 .md-split{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
 .md-concl{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)}
}
@container md (min-width:1024px){
 .md-grid{grid-template-columns:repeat(6,minmax(0,1fr));gap:14px}
 .md-d6{grid-column:span 6} .md-d4{grid-column:span 4} .md-d3{grid-column:span 3} .md-d2{grid-column:span 2}
 .md-tiles{grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
 .md-tile:last-child{grid-column:auto}
 .md-tile .t-val{font-size:27px}
 .md-cols{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr) minmax(0,1fr)}
}`;
  document.head.appendChild(st);
}

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

const TILE_FMT = { base: { d: 1, u: ' %' }, iurk: { d: 1, u: ' %' }, b3share: { d: 0, u: ' %' }, per100: { d: 1, u: '' }, red: { d: 0, u: ' %' } };

function tileHtml(t, r) {
  const c = t.cur, p = t.prev, f = TILE_FMT[t.key], d = f.d, isPct = f.u === ' %';
  const head = '<div class="t-head"><span class="t-title">' + esc(t.title) + '</span>' + hint(t.key) + '</div>';
  if (!c) return '<div class="md-tile">' + head + '<div class="t-val md-muted">—</div><div class="t-range">нет проверок</div></div>';
  const valCls = (t.key === 'base' || t.key === 'iurk') ? 'md-' + zoneOfUrk(c.mean) : '';
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

function blockTrend(r, n) {
  const first = r.trend[0].key, last = r.trend[r.trend.length - 1].key;
  n = n || 3;
  return '<h2 class="md-sec"><span class="n">' + n + '</span>Динамика за 12 месяцев<span class="note">' + esc(monthFull(first).toLowerCase()) + ' — ' + esc(monthFull(last).toLowerCase()) + '</span></h2>'
    + '<div class="md-card md-d4"><h3>Уровень качества (УрК) по месяцам' + hint('trend') + '</h3>'
    + '<div class="md-lg"><span><i class="line" style="background:var(--md-gold)"></i>Базовый УрК</span><span><i style="background:var(--md-gold);opacity:.3"></i>разброс ±</span><span><i class="dash"></i>ИУрК (надёжность)</span><span><i class="hollow"></i>меньше 7 проверок</span><span><i style="background:var(--md-line2)"></i>число проверок</span></div>'
    + '<div class="md-chart" data-md-chart="trend"></div></div>'
    + '<div class="md-card md-d2"><h3>Зоны качества по месяцам' + hint('zones') + '</h3>'
    + '<div class="md-lg"><span><i style="background:var(--md-ok)"></i>зелёная (от 85)</span><span><i style="background:var(--md-warn)"></i>жёлтая (70–84)</span><span><i style="background:var(--md-bad)"></i>красная (B3 или ниже 70)</span></div>'
    + '<div class="md-chart" data-md-chart="zones"></div></div>';
}

function confHtml(c, N) {
  const idx = c.few ? 0 : N >= 51 ? 5 : N >= 32 ? 4 : N >= 24 ? 3 : N >= 16 ? 2 : 1;
  let bars = '';
  for (let i = 1; i <= 5; i++) bars += '<b class="' + (idx >= i ? 'on' : '') + '"></b>';
  return '<span class="md-conf ' + (c.few ? 'few' : '') + '"><i>' + bars + '</i>' + esc(c.name) + '</span>';
}
function zoneChip(z, t) { return '<span class="md-chipz ' + (z || 'grey') + '">' + esc(t || '—') + '</span>'; }
function rngBar(m) {
  const lo = m.E != null ? Math.max(0, m.U - m.E) : null, hi = m.E != null ? Math.min(100, m.U + m.E) : null;
  return '<div class="md-rng" title="' + (lo != null ? 'скорее всего от ' + fmt(lo) + ' до ' + fmt(hi) : 'разброс не посчитать') + '">'
    + (lo != null ? '<b style="left:' + lo + '%;width:' + (hi - lo) + '%"></b>' : '') + '<i class="' + (m.conf.few ? 'hollow' : '') + '" style="left:' + Math.max(0, Math.min(100, m.U)) + '%"></i></div>';
}

function blockCons(r) {
  const ps = monthShort(r.prevMonth);
  const rows = r.cons.map((x, i) => {
    const m = x.m, mp = x.mp, d = x.d;
    const dcls = x.kind === 'notable' ? (d > 0 ? 'good' : 'bad') : 'same';
    const dtxt = d == null ? '—' : (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '') + fmtS(d);
    const dsub = d == null ? 'нет прошлого' : x.kind === 'notable' ? 'заметно' : x.kind === 'within' ? 'в пределах разброса' : 'мало данных';
    return '<tr class="' + (m.conf.few ? 'faint' : '') + '">'
      + '<td data-label="Место" class="r rk">' + (i + 1) + '</td>'
      + '<td data-label="Подрядчик" class="name full nolbl"><span class="md-rk-inline">' + (i + 1) + '.</span>' + esc(x.name) + '<small>' + esc(x.types.join(', ')) + '</small></td>'
      + '<td data-label="ИУрК за ' + monthShort(r.month) + '" class="r"><b class="md-' + zoneOfUrk(m.U) + '" style="font-size:15px">' + m.U + '</b>' + (m.E != null ? ' <span class="md-muted">± ' + fmt(m.E) + '</span>' : '') + '</td>'
      + '<td data-label="Разброс (0–100)" class="full">' + rngBar(m) + '</td>'
      + '<td data-label="' + ps + '" class="r">' + (mp ? mp.U + ' <span class="md-muted">(' + mp.N + ' пр.)</span>' : '—') + '</td>'
      + '<td data-label="Изменение"><span class="md-dlt ' + dcls + '">' + dtxt + '<small>' + dsub + '</small></span></td>'
      + '<td data-label="Проверок" class="r">' + m.N + '</td>'
      + '<td data-label="Надёжность">' + confHtml(m.conf, m.N) + '</td>'
      + '<td data-label="Зона">' + zoneChip(m.zone, m.zoneText) + (m.NB3 ? '<small class="md-muted" style="display:block;font-size:10.5px">B3 в ' + m.NB3 + ' из ' + m.N + '</small>' : '') + '</td>'
      + '<td data-label="Стабильность">' + esc(m.stabText) + ' <span class="md-muted">' + m.stab + '</span></td></tr>';
  }).join('');
  return '<h2 class="md-sec"><span class="n">5</span>Подрядчики за ' + esc(monthFull(r.month).toLowerCase()) + hint('cons') + '<span class="note">сортировка по нижней границе разброса</span></h2>'
    + '<div class="md-card md-d6">' + (rows ? '<div class="md-tblw"><table class="md-tbl cards"><thead><tr><th class="r">#</th><th>Подрядчик</th><th class="r">ИУрК</th><th>Разброс</th><th class="r">' + ps + '</th><th>Изменение ' + hint('delta') + '</th><th class="r">Проверок</th><th>Надёжность ' + hint('conf') + '</th><th>Зона ' + hint('zoneC') + '</th><th>Стабильность ' + hint('stab') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="md-muted">Нет проверок</p>')
    + '<p class="sub" style="margin:8px 0 0">Бледные строки — меньше 7 проверок (сбор данных). Пустой кружок на шкале — то же.</p></div>';
}

function heatColor(v) {
  const p = Math.min(1, v / 30);
  const col = p < 0.33 ? 'var(--md-ok)' : p < 0.66 ? 'var(--md-warn)' : 'var(--md-bad)';
  return 'background:color-mix(in srgb,' + col + ' ' + (22 + Math.round(p * 50)) + '%,var(--md-card));';
}

function blockDefects(r) {
  const c = r.cur, p = r.prev, ps = monthShort(r.prevMonth);
  let html = '<h2 class="md-sec"><span class="n">6</span>Дефекты<span class="note">всё на 100 проверенных пунктов, с учётом выборки</span></h2>';
  html += '<div class="md-card md-d4"><h3>Невыполненные пункты B1 / B2 / B3 на 100 проверенных' + hint('bcl') + '</h3>'
    + '<div class="md-lg"><span><i style="background:var(--md-blue)"></i>B1 малозначительные</span><span><i style="background:var(--md-warn)"></i>B2 значительные</span><span><i style="background:var(--md-bad)"></i>B3 критичные</span></div>'
    + '<div class="md-chart" data-md-chart="bclass"></div></div>';
  html += '<div class="md-card md-d2"><h3>Доля критичных среди всех дефектов' + hint('crit') + '</h3><p class="sub">' + esc(monthFull(r.month)) + '</p>'
    + '<div class="md-big"><span class="v ' + (c.critShare > 15 ? 'md-bad' : '') + '">' + fmt(c.critShare) + ' %</span><span class="md-muted">' + c.b3 + ' из ' + c.fails + ' дефектов' + (p && p.critShare != null ? ' · ' + ps + ': ' + fmt(p.critShare) + ' %' : '') + '</span></div>'
    + '<div class="md-mini"><div><div class="k">B1 на 100</div><div class="v">' + fmt(c.b1p, 1) + '</div><div class="k">' + c.b1 + ' шт.</div></div>'
    + '<div><div class="k">B2 на 100</div><div class="v md-warn">' + fmt(c.b2p, 1) + '</div><div class="k">' + c.b2 + ' шт.</div></div>'
    + '<div><div class="k">B3 на 100</div><div class="v md-bad">' + fmt(c.b3p, 1) + '</div><div class="k">' + c.b3 + ' шт.</div></div></div>'
    + '<div class="md-note">Всего проверено ' + fmt(c.items) + ' ' + plural(c.items, 'пункт', 'пункта', 'пунктов') + ', не выполнено ' + fmt(c.fails) + '.</div></div>';
  // Топ-10
  const topRows = r.top.map((t, i) => {
    let arrow;
    if (t.d == null) arrow = '<span class="md-arrow na" title="в прошлом месяце проверяли меньше 3 раз">— нет сравнения</span>';
    else if (t.d >= 5) arrow = '<span class="md-arrow up">▲ ' + fmtS(t.d) + ' п.п.</span>';
    else if (t.d <= -5) arrow = '<span class="md-arrow down">▼ ' + fmtS(t.d) + ' п.п.</span>';
    else arrow = '<span class="md-arrow eq">≈ как в ' + ps + '</span>';
    const fewChk = t.chk < FEW_DATA_N ? ' <span class="md-chipz grey" title="пункт проверяли меньше 7 раз">мало проверок</span>' : '';
    const ph = t.photoSrc
      ? '<span class="md-photo" title="фото: ' + t.photos + '"><img src="' + esc(t.photoSrc) + '" alt="" loading="lazy"><em>' + t.photos + '</em></span>'
      : '<span class="md-photo ' + (t.photos ? '' : 'none') + '" title="' + (t.photos ? 'фото: ' + t.photos : 'нет фото') + '">фото' + (t.photos ? '<em>' + t.photos + '</em>' : '') + '</span>';
    return '<li><span class="rk">' + (i + 1) + '</span><div class="nm"><span class="md-bcl b' + t.item.w + '">B' + t.item.w + '</span>' + esc(t.item.name) + fewChk
      + '<small>' + esc(t.item.typeTitle) + ' · чаще у ' + esc(t.mainCon) + ' (' + t.mainConN + ') · ' + arrow + '</small></div>'
      + '<div class="rt"><div class="of">' + t.fail + ' из ' + t.chk + '<small>' + fmt(t.rate) + ' %</small></div>' + ph + '</div>'
      + '<div class="meter"><b style="width:' + t.rate.toFixed(1) + '%"></b>' + (t.prate != null ? '<i style="left:' + t.prate.toFixed(1) + '%" title="' + ps + ': ' + fmt(t.prate) + ' %"></i>' : '') + '</div></li>';
  });
  const showTop = state.topAll ? topRows : topRows.slice(0, 6);
  html += '<div class="md-card md-d3"><h3>Топ-10 типовых дефектов' + hint('top') + '</h3><p class="sub">«из N» — сколько раз пункт проверяли в этом месяце</p>'
    + (topRows.length ? '<ol class="md-top">' + showTop.join('') + '</ol>' + (topRows.length > 6 ? '<button type="button" class="md-more" data-md-act="topAll">' + (state.topAll ? 'Свернуть' : 'Ещё ' + (topRows.length - 6)) + '</button>' : '') : '<p class="md-muted">Дефектов нет</p>') + '</div>';
  // Тепловая карта
  const H = state.heat === 3 ? r.heat3 : r.heat1;
  const hk = Object.keys(H);
  const tps = [], tpsT = {}, cns = [];
  hk.forEach((k) => { const e = H[k]; if (tps.indexOf(e.type) < 0) { tps.push(e.type); tpsT[e.type] = e.typeTitle; } if (cns.indexOf(e.con) < 0) cns.push(e.con); });
  cns.sort();
  const heat = '<table class="md-heat"><thead><tr><th></th>' + tps.map((t) => '<th title="' + esc(tpsT[t]) + '">' + esc(tpsT[t]) + '</th>').join('') + '</tr></thead><tbody>'
    + cns.map((cn) => '<tr><th class="rowh">' + esc(cn) + '</th>' + tps.map((t) => {
      const e = H[cn + '|' + t];
      if (!e) return '<td class="empty" data-label="' + esc(tpsT[t]) + '">·</td>';
      return '<td data-label="' + esc(tpsT[t]) + '" class="' + (e.n < FEW_DATA_N ? 'pale' : '') + '" style="' + heatColor(e.v) + '" title="' + esc(cn + ' · ' + tpsT[t] + ': ' + fmt(e.v, 1) + ' на 100 пунктов, проверок ' + e.n + (e.n < FEW_DATA_N ? ' (мало)' : '')) + '">' + fmt(e.v, 1) + '<small>' + e.n + ' пр.</small></td>';
    }).join('') + '</tr>').join('') + '</tbody></table>';
  html += '<div class="md-card md-d3"><h3>Подрядчик × вид работ' + hint('heat') + '<span class="md-seg2"><button type="button" data-md-heat="1" class="' + (state.heat === 1 ? 'on' : '') + '">Месяц</button><button type="button" data-md-heat="3" class="' + (state.heat === 3 ? 'on' : '') + '">3 месяца</button></span></h3>'
    + '<p class="sub">Невыполненных пунктов на 100 проверенных · под числом — проверок</p><div class="md-tblw">' + (cns.length ? heat : '<p class="md-muted">Нет данных</p>') + '</div>'
    + '<div class="md-hscale">меньше <span style="' + heatColor(2) + '"></span><span style="' + heatColor(12) + '"></span><span style="' + heatColor(28) + '"></span> больше · <span style="background:var(--md-hover);background-image:repeating-linear-gradient(135deg,transparent 0 4px,rgba(127,127,127,.3) 4px 6px)"></span> меньше 7 проверок</div></div>';
  // Повторяемость и системность B2
  const reps = r.repeats.map((x) => '<li><div class="nm"><span class="md-bcl b' + x.item.w + '">B' + x.item.w + '</span>' + esc(x.item.name) + '<small>' + esc(x.name) + ' · ' + esc(x.item.typeTitle) + '</small></div>'
    + '<div class="streak">держится ' + x.streak + ' ' + plural(x.streak, 'месяц', 'месяца', 'месяцев') + '</div>'
    + '<div class="hist">' + x.hist.map((h) => '<span>' + monthShort(h.key) + ': <b>' + h.fail + '</b> из ' + h.chk + '</span>').join('') + '</div></li>');
  const showRep = state.repAll ? reps : reps.slice(0, 4);
  const sys = r.sysB2.slice(0, 6).map((x) => {
    const col = x.rate >= 40 ? 'var(--md-bad)' : x.rate >= 20 ? 'var(--md-warn)' : 'var(--md-ok)';
    return '<div class="row"><span title="' + esc(x.name) + '">' + esc(x.name) + '</span><div class="bar" title="' + esc(x.item ? x.item.name : '') + '"><b style="width:' + Math.min(100, x.rate).toFixed(0) + '%;background:' + col + '"></b></div><span style="text-align:right;font-weight:800;font-variant-numeric:tabular-nums">' + fmt(x.rate) + ' %</span></div>';
  }).join('');
  html += '<div class="md-card md-d3"><h3>Повторяемость: держится 2+ месяца' + hint('rep') + '</h3><p class="sub">Тот же пункт у того же подрядчика, месяц за месяцем</p>'
    + (reps.length ? '<ul class="md-rep">' + showRep.join('') + '</ul>' + (reps.length > 4 ? '<button type="button" class="md-more" data-md-act="repAll">' + (state.repAll ? 'Свернуть' : 'Ещё ' + (reps.length - 4)) + '</button>' : '') : '<p class="md-muted">Повторов нет</p>')
    + '<div class="md-sys"><h4>Системность брака B2 за месяц' + hint('sys') + '</h4>' + (sys || '<span class="md-muted">нет невыполненных B2</span>') + '</div></div>';
  // Парето
  const mx = r.pareto.length ? r.pareto[0].n : 1;
  const par = r.pareto.map((x) => '<div class="row ' + (x.in80 ? 'in80' : '') + '"><span class="lbl" title="' + esc(x.name) + '">' + esc(x.name) + '</span><div class="bar"><b style="width:' + (x.n / mx * 100).toFixed(1) + '%"></b><i style="left:' + Math.min(99, x.cum).toFixed(1) + '%" title="накоплено ' + fmt(x.cum) + ' %"></i></div><span><b>' + x.n + '</b> · ' + fmt(x.cum) + ' %</span></div>').join('');
  const p80 = r.pareto.filter((x) => x.in80).length;
  const noPct = r.failsAll ? r.noCause / r.failsAll * 100 : 0;
  html += '<div class="md-card md-d3"><h3>Причины дефектов (Парето)' + hint('pareto') + '</h3><p class="sub">' + (r.pareto.length ? '<b style="color:var(--md-text)">' + p80 + ' ' + plural(p80, 'причина', 'причины', 'причин') + '</b> из ' + r.pareto.length + ' дают 80 % дефектов с указанной причиной · число · накоплено' : 'причины не указаны') + '</p>'
    + '<div class="md-par">' + par + '</div>'
    + (r.noCause ? '<div class="md-banner grey" style="margin:10px 0 0">Причина не указана — ' + fmt(noPct) + ' % (' + r.noCause + ' ' + plural(r.noCause, 'дефект', 'дефекта', 'дефектов') + ' из ' + r.failsAll + '). Эти дефекты в Парето не входят.</div>' : '') + '</div>';
  return html;
}

const OBJ_COLORS = ['var(--md-gold)', 'var(--md-blue)', 'var(--color-violet,var(--md-blue))', 'var(--md-ok)', 'var(--md-warn)'];

function blockObjects(r) {
  const ps = monthShort(r.prevMonth);
  const rows = r.objs.map((o, k) => {
    const c = o.cur, p = o.prev, m = o.mon;
    const d = c && p ? c.iko - p.iko : null;
    const mark = k < 5 ? '<span style="display:inline-block;width:10px;height:3px;border-radius:2px;vertical-align:3px;margin-right:6px;background:' + OBJ_COLORS[k] + '"></span>' : '';
    return '<tr><td data-label="Объект" class="name full nolbl">' + mark + esc(o.name) + '<small>' + m.N + ' ' + plural(m.N, 'проверка', 'проверки', 'проверок') + ' в месяце · базовый УрК ' + (m.base ? fmt(m.base.mean, 1) + ' %' : '—') + '</small></td>'
      + '<td data-label="ИКО" class="r"><b class="' + (c ? 'md-' + (c.zone === 'green' ? 'ok' : c.zone === 'yellow' ? 'warn' : 'bad') : 'md-muted') + '" style="font-size:15px">' + (c ? fmt(c.iko, 2) : '—') + '</b></td>'
      + '<td data-label="' + ps + '" class="r">' + (p ? fmt(p.iko, 2) : '—') + (d != null ? ' <span class="md-dlt ' + (d > 0.005 ? 'bad' : d < -0.005 ? 'good' : 'same') + '">' + (d > 0 ? '▲' : d < 0 ? '▼' : '') + fmtS(d, 2) + '</span>' : '') + '</td>'
      + '<td data-label="Риск">' + (c ? zoneChip(c.zone, c.status) : '<span class="md-muted">мало данных</span>') + '</td>'
      + '<td data-label="Зоны (доля проверок)" class="full">' + (c ? '<div class="md-zbar" title="зелёная ' + c.green + ' %, жёлтая ' + c.yellow + ' %, красная ' + c.red + ' %"><b class="g" style="width:' + c.green + '%"></b><b class="y" style="width:' + c.yellow + '%"></b><b class="r" style="width:' + c.red + '%"></b></div><small class="md-muted">' + c.green + ' / ' + c.yellow + ' / ' + c.red + ' % · в расчёте ' + c.valid + ' пр.</small>' : '—') + '</td></tr>';
  }).join('');
  return '<h2 class="md-sec"><span class="n">7</span>Объекты<span class="note">индекс критичности (ИКО), окно 3 месяца</span></h2>'
    + '<div class="md-card md-d3"><h3>ИКО по месяцам' + hint('iko') + '</h3><div class="md-lg">' + r.objs.slice(0, 5).map((o, k) => '<span><i class="line" style="background:' + OBJ_COLORS[k] + '"></i>' + esc(o.name) + '</span>').join('') + '<span>фон: зелёный — низкий риск, жёлтый — повышенный, красный — высокий</span></div><div class="md-chart" data-md-chart="iko"></div></div>'
    + '<div class="md-card md-d3"><h3>Объекты за ' + esc(monthFull(r.month).toLowerCase()) + hint('iko') + '</h3><p class="sub">ИКО: 0 — нет риска, 1 — максимальный; «мало данных» — нет связок от 7 проверок за 3 месяца</p><div class="md-tblw"><table class="md-tbl cards"><thead><tr><th>Объект</th><th class="r">ИКО</th><th class="r">' + ps + '</th><th>Риск</th><th>Зоны</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

function cmpCell(cmp, d) {
  if (!cmp || cmp.d == null) return '<span class="md-dlt same">—<small>нет прошлого</small></span>';
  if (cmp.kind === 'few') return '<span class="md-dlt same">' + fmtS(cmp.d, d) + '<small>мало данных</small></span>';
  const cls = cmp.kind === 'notable' ? (cmp.good ? 'good' : 'bad') : 'same';
  return '<span class="md-dlt ' + cls + '">' + (cmp.d > 0 ? '▲ ' : cmp.d < 0 ? '▼ ' : '') + fmtS(cmp.d, d) + '<small>' + (cmp.kind === 'notable' ? 'заметно' : 'в пределах разброса') + '</small></span>';
}

/** Режим «Компания»: объекты компании «этот / прошлый месяц» (как глобальная Сводка — рейтинг и антирейтинг объектов). */
function blockCompanyObjects(r) {
  const ps = monthShort(r.prevMonth);
  const rows = r.objs.map((o, k) => {
    const c = o.cur, p = o.prev, m = o.mon, mp = o.monPrev;
    const d = c && p ? c.iko - p.iko : null;
    const mark = k < 5 ? '<span style="display:inline-block;width:10px;height:3px;border-radius:2px;vertical-align:3px;margin-right:6px;background:' + OBJ_COLORS[k] + '"></span>' : '';
    const few = m.N < FEW_DATA_N;
    return '<tr class="' + (few ? 'faint' : '') + '"><td data-label="Объект" class="name full nolbl">' + mark + esc(o.name) + '<small>' + m.N + ' ' + plural(m.N, 'проверка', 'проверки', 'проверок') + ' · ' + ps + ': ' + mp.N + '</small></td>'
      + '<td data-label="Базовый УрК" class="r">' + (m.base ? '<b class="md-' + zoneOfUrk(m.base.mean) + '">' + fmt(m.base.mean, 1) + '</b>' + (m.base.E != null ? ' <span class="md-muted">± ' + fmt(m.base.E, 1) + '</span>' : '') : '—') + '</td>'
      + '<td data-label="Изменение УрК">' + cmpCell(o.cmpBase, 1) + '</td>'
      + '<td data-label="ИУрК" class="r">' + (o.iurk ? '<b class="md-' + zoneOfUrk(o.iurk.mean) + '">' + fmt(o.iurk.mean, 1) + '</b>' + (o.iurk.few ? ' <span class="md-muted">мало</span>' : '') : '—') + '</td>'
      + '<td data-label="Изменение ИУрК">' + cmpCell(o.cmpIurk, 1) + '</td>'
      + '<td data-label="ИКО" class="r"><b class="' + (c ? 'md-' + (c.zone === 'green' ? 'ok' : c.zone === 'yellow' ? 'warn' : 'bad') : 'md-muted') + '">' + (c ? fmt(c.iko, 2) : '—') + '</b>' + (d != null ? ' <span class="md-dlt ' + (d > 0.005 ? 'bad' : d < -0.005 ? 'good' : 'same') + '">' + (d > 0 ? '▲' : d < 0 ? '▼' : '') + fmtS(d, 2) + '</span>' : '') + '</td>'
      + '<td data-label="Риск">' + (c ? zoneChip(c.zone, c.status) : '<span class="md-muted">мало данных</span>') + '</td>'
      + '<td data-label="С B3" class="r">' + (m.b3share ? fmt(m.b3share.mean) + ' %' : '—') + '</td>'
      + '<td data-label="Красная зона" class="r">' + (m.red ? fmt(m.red.mean) + ' %' : '—') + '</td></tr>';
  }).join('');
  return '<h2 class="md-sec"><span class="n">3</span>Объекты компании за ' + esc(monthFull(r.month).toLowerCase()) + hint('cobj') + '<span class="note">сначала высокий риск (ИКО); изменения — к прошлому месяцу</span></h2>'
    + '<div class="md-card md-d6"><div class="md-tblw"><table class="md-tbl cards"><thead><tr><th>Объект</th><th class="r">Базовый УрК</th><th>Изменение ' + hint('delta') + '</th><th class="r">ИУрК ' + hint('iurk') + '</th><th>Изменение</th><th class="r">ИКО ' + hint('iko') + '</th><th>Риск</th><th class="r">С B3</th><th class="r">Красная</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '<p class="sub" style="margin:8px 0 0">Бледные строки — меньше 7 проверок за месяц. Нажмите «Объект» вверху, чтобы смотреть один объект.</p></div>'
    + '<div class="md-card md-d6"><h3>ИКО объектов по месяцам' + hint('iko') + '</h3><div class="md-lg">' + r.objs.slice(0, 5).map((o, k) => '<span><i class="line" style="background:' + OBJ_COLORS[k] + '"></i>' + esc(o.name) + '</span>').join('') + '<span>фон: зелёный — низкий риск, жёлтый — повышенный, красный — высокий</span></div><div class="md-chart" data-md-chart="iko"></div></div>';
}

function blockSk(r, n) {
  const k = r.sk, c = k.cur, p = k.prev, ps = monthShort(r.prevMonth);
  const idzCls = (v) => (v == null ? 'md-muted' : v >= 70 ? 'md-ok' : v >= 45 ? 'md-warn' : 'md-bad');
  const rows = k.cons.map((x) => {
    const xc = x.cur, d = x.idz != null && x.idzPrev != null ? x.idz - x.idzPrev : null;
    return '<tr><td data-label="Подрядчик" class="name full nolbl">' + esc(x.name) + '</td>'
      + '<td data-label="Выдано" class="r">' + xc.issued + '</td><td data-label="Закрыто" class="r">' + xc.closed + '</td>'
      + '<td data-label="Открыто" class="r">' + xc.open + (xc.awaiting ? ' <span class="md-muted">(ждут проверки ' + xc.awaiting + ')</span>' : '') + '</td>'
      + '<td data-label="В срок" class="r">' + (xc.onTimePerc != null ? fmt(xc.onTimePerc) + ' %' : '—') + '</td>'
      + '<td data-label="Просрочено сейчас" class="r">' + xc.overdueNow + '</td>'
      + '<td data-label="Закрыто с опозданием" class="r">' + xc.closedLate + (xc.closedLate ? ' <span class="md-muted">(ср. ' + fmt(xc.avgLateDays) + ' дн.)</span>' : '') + '</td>'
      + '<td data-label="ИДЗ" class="r"><b class="' + idzCls(x.idz) + '">' + (x.idz != null ? fmt(x.idz) : '—') + '</b>' + (d != null ? ' <span class="md-dlt ' + (d > 0 ? 'good' : d < 0 ? 'bad' : 'same') + '" style="font-size:11px">' + fmtS(d) + '</span>' : '') + '</td></tr>';
  }).join('');
  return '<h2 class="md-sec"><span class="n">' + n + '</span>Стройконтроль (ПК СК)' + hint('sk') + '<span class="note">замечания: выдано / закрыто / открыто на конец месяца</span></h2>'
    + '<div class="md-card md-d2"><h3>Замечания по месяцам' + hint('sk') + '</h3><div class="md-lg"><span><i style="background:var(--md-blue)"></i>выдано</span><span><i style="background:var(--md-ok)"></i>закрыто (проверено)</span><span><i class="line" style="background:var(--md-bad)"></i>открыто на конец месяца</span></div>'
    + '<div class="md-chart" data-md-chart="sk"></div>'
    + '<div class="md-aging"><div><div class="k">Висят 0–7 дней</div><div class="v">' + c.age.a + '</div></div><div><div class="k">8–30 дней</div><div class="v md-warn">' + c.age.b + '</div></div><div><div class="k">больше 30 дней</div><div class="v md-bad">' + c.age.c + '</div></div></div></div>'
    + '<div class="md-card md-d4"><h3>Дисциплина закрытия по подрядчикам' + hint('idz') + '</h3>'
    + '<p class="sub">' + esc(monthFull(r.month)) + ': выдано ' + c.issued + ', закрыто ' + c.closed
    + (c.closed >= c.issued ? ' <b class="md-ok">— закрыли не меньше, чем выдали</b>' : ' <b class="md-bad">— выдали больше, чем закрыли</b>')
    + ', открыто ' + c.open + (p ? ' (' + ps + ': ' + p.open + ')' : '') + (c.awaiting ? ', из них ждут проверки инженера ' + c.awaiting : '') + '.</p>'
    + '<div class="md-mini md-mini4" style="margin:0 0 10px"><div><div class="k">Просрочено сейчас' + hint('skov') + '</div><div class="v md-bad">' + c.overdueNow + '</div><div class="k">' + ps + ': ' + (p ? p.overdueNow : '—') + '</div></div>'
    + '<div><div class="k">Закрыто с опозданием</div><div class="v md-warn">' + c.closedLate + '</div><div class="k">' + (c.closedLate ? 'в среднем на ' + fmt(c.avgLateDays) + ' дн.' : '—') + '</div></div>'
    + '<div><div class="k">ИДЗ месяца' + hint('idz') + '</div><div class="v ' + idzCls(c.idz) + '">' + (c.idz != null ? fmt(c.idz) : '—') + '</div><div class="k">' + ps + ': ' + (p && p.idz != null ? fmt(p.idz) : '—') + '</div></div>'
    + '<div><div class="k">Закрыто в срок</div><div class="v md-ok">' + (c.onTimePerc != null ? fmt(c.onTimePerc) + ' %' : '—') + '</div><div class="k">' + c.closedOnTime + ' из ' + c.closed + '</div></div></div>'
    + (rows ? '<div class="md-tblw"><table class="md-tbl cards"><thead><tr><th>Подрядчик</th><th class="r">Выдано</th><th class="r">Закрыто</th><th class="r">Открыто</th><th class="r">В срок</th><th class="r">Просрочено сейчас</th><th class="r">Закрыто с опозд.</th><th class="r">ИДЗ ' + hint('idz') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="md-muted">В этом месяце замечаний нет.</p>') + '</div>';
}

function blockConcl(r) {
  const F = r.findings;
  const li = (a) => a.map((t) => '<li>' + esc(t) + '</li>').join('');
  return '<h2 class="md-sec"><span class="n">9</span>Выводы месяца' + hint('concl') + '<span class="note">собираются автоматически</span></h2>'
    + '<div class="md-card md-d6"><div class="md-concl"><div>'
    + (F.warn.length ? '<div class="md-banner">' + F.warn.map(esc).join('<br>') + '</div>' : '')
    + '<h4>Главное</h4><ul>' + li(F.main) + '</ul>'
    + '<h4 style="margin-top:14px">Что сделать</h4><ul>' + (F.recs.length ? li(F.recs) : '<li>—</li>') + '</ul></div><div>'
    + '<h4>Заметно изменилось</h4>' + (F.notable.length ? '<ul>' + F.notable.map((n) => '<li><b class="' + (n.good ? 'md-ok' : 'md-bad') + '">' + esc(n.text) + '</b></li>').join('') + '</ul>' : '<p class="md-muted" style="margin:0">Ничего: все изменения в пределах разброса или мало данных.</p>')
    + '<h4 style="margin-top:14px">В пределах разброса (не считаем изменением)</h4><ul class="within">' + (F.within.length ? li(F.within) : '<li>—</li>') + '</ul></div></div></div>';
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

/** Чек-листы, причины и шаблоны — из сервисов Качества (как отчёты для совещаний). */
function calcOptions() {
  const svc = (window.RBI && window.RBI.services) || {};
  const tpl = svc.templates;
  let user = {}, sys = {};
  try { user = (tpl && tpl.getUserTemplates && tpl.getUserTemplates()) || window.userTemplates || {}; } catch (_) { user = {}; }
  try { sys = (tpl && tpl.getSystemTemplates && tpl.getSystemTemplates()) || window.SYSTEM_TEMPLATES || {}; } catch (_) { sys = {}; }
  let causes = [];
  try { causes = (svc.inspections && svc.inspections.getDefectCausesSync && svc.inspections.getDefectCausesSync()) || window.DEFECT_CAUSES || []; } catch (_) { causes = []; }
  const flat = typeof window.getFlatList === 'function' ? window.getFlatList : (g) => (g || []).flatMap((x) => x.items || []);
  return {
    templates: user,
    itemsOf(c) {
      const key = String(c.templateKey || '');
      const groups = (user[key.replace('user_', '')] || {}).groups || (sys[key.replace('sys_', '')] || {}).groups || [];
      return flat(groups);
    },
    causeName(code) {
      const f = causes.find((x) => x.code === code);
      return f ? f.name : code;
    }
  };
}

/** Замечания СК — с теми же фильтрами, что экран Стройконтроля, без периода (месяц выбирается здесь). */
function skSource() {
  try { return getFilteredSkRecords({ ignorePeriod: true }) || []; } catch (_) { return []; }
}

/** ИДЗ — формула экрана Стройконтроля (contractorMetrics). */
const skDiscipline = skDisciplineMetrics;

export function renderMonthDynamics(root, checks) {
  ensureStyle();
  const months = availableMonths(checks);
  const month = pickMonth(months);
  state.month = month;
  const global = getOnepagerScope() === 'global';
  const r = computeMonthDynamics(checks, Object.assign({ month, mode: global ? 'global' : 'local' }, calcOptions()));
  r.sk = computeSkMonth(skSource(), month, { skDiscipline });
  state.result = r;
  const c = r.cur;
  const bar = '<div class="md-bar"><label class="md-f"><span>Месяц</span><select data-md-month>' + monthOptions(months, month) + '</select></label>'
    + (c.N ? '<div class="md-acts"><span class="md-f"><span>Отчёт за месяц</span></span><div class="md-btns">'
      + '<button type="button" class="md-btn" data-md-export="print">Печать / PDF</button>'
      + '<button type="button" class="md-btn" data-md-export="pdf">PDF-файл</button>'
      + '<button type="button" class="md-btn" data-md-export="pptx">PowerPoint</button></div></div>' : '')
    + '</div>'
    + '<div class="md-summary"><b>' + esc(monthFull(month)) + '</b> · ' + fmt(c.N) + ' ' + plural(c.N, 'проверка', 'проверки', 'проверок')
    + ' · надёжность «' + esc(c.conf.name) + '» · сравнение с: ' + esc(monthFull(r.prevMonth).toLowerCase())
    + ' · ' + (global ? '<b>Компания</b>: все объекты, подрядчики — по объектам' : 'вид «Объект»')
    + (r.skippedNoMetrics ? ' · без оценки: ' + r.skippedNoMetrics : '') + '</div>'
    + '<div class="md-summary">Объект, подрядчик, вид работ и инспектор — из фильтров выше; период фильтров здесь не действует.</div>';
  let body;
  if (!c.N) {
    body = blockVolume(r, checks) + '<div class="md-card md-d6"><p class="md-empty">За этот месяц нет проверок по выбранным фильтрам.</p></div>';
  } else {
    const sk = r.sk.total ? blockSk(r, 8) : '';
    body = global
      ? blockVolume(r, checks) + blockTiles(r) + blockCompanyObjects(r) + blockTrend(r, 4) + blockCons(r) + blockDefects(r) + sk + blockConcl(r)
      : blockVolume(r, checks) + blockTiles(r) + blockTrend(r) + blockCons(r) + blockDefects(r) + blockObjects(r) + sk + blockConcl(r);
  }
  root.innerHTML = bar + '<div class="md-grid">' + body + '</div>';
  drawCharts(root);
}

/* ---------- Отчёт за месяц ---------- */

function reportMeta(r) {
  const global = getOnepagerScope() === 'global';
  const names = (r.objs || []).filter((o) => o.mon.N).map((o) => o.name);
  const scope = (global ? 'Компания · ' : '') + (names.length ? (names.slice(0, 3).join(', ') + (names.length > 3 ? ' и ещё ' + (names.length - 3) : '')) : 'все объекты по фильтрам');
  return { scope, mode: global ? 'global' : 'local', generated: new Date().toLocaleString('ru-RU') };
}

async function runExport(btn) {
  const r = state.result;
  if (!r || btn.disabled) return;
  const kind = btn.getAttribute('data-md-export');
  const meta = reportMeta(r);
  btn.disabled = true;
  try {
    if (kind === 'print') printMonthReport(r, meta);
    else if (kind === 'pdf') await exportMonthReportPdf(r, meta);
    else await exportMonthReportPptx(r, meta);
  } finally {
    btn.disabled = false;
  }
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
      if (!e.target.closest) return;
      const h = e.target.closest('.md-hint');
      if (h) { e.preventDefault(); showPop(h); return; }
      const ex = e.target.closest('[data-md-export]');
      if (ex) { e.preventDefault(); runExport(ex); return; }
      const act = e.target.closest('[data-md-act]');
      const hb = e.target.closest('[data-md-heat]');
      if (!act && !hb) return;
      e.preventDefault();
      if (act) state[act.getAttribute('data-md-act')] = !state[act.getAttribute('data-md-act')];
      if (hb) state.heat = Number(hb.getAttribute('data-md-heat')) === 3 ? 3 : 1;
      if (state.data) renderMonthDynamics(root, state.data);
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
  // Отпечаток набора: число, последняя дата и хэш id — смена фильтров с тем же числом проверок тоже перерисует экран.
  let last = '', h = 5381;
  for (let i = 0; i < data.length; i++) {
    const d = data[i] && data[i].date;
    if (d && d > last) last = d;
    const id = String((data[i] && data[i].id) || '');
    for (let k = 0; k < id.length; k++) h = ((h << 5) + h + id.charCodeAt(k)) | 0;
  }
  const sk = Array.isArray(window.skRecords) ? window.skRecords.length : 0;
  return [state.month || '', data.length, last, h, getOnepagerScope(), sk].join('|');
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
  state.data = data;
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
