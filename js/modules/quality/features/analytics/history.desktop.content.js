/**
 * history.desktop.content.js
 * Desktop-only History content builders (checks / reports / plans).
 * Mobile history.render / analytics.renderReportsList stay untouched.
 */

import { openHistoryPlanViewer } from '../audit/features/quality-plan-pin.js';
import { planPinOf } from '../shared/plan-pin-label.js';
import { groupByContractorWork, avgFinalUrk, avgUrkStatusCls } from '../history/history.group.js';
import { reportKindOf, reportKindLabel, orderKindGroups, REPORT_KIND_OTHER } from '../reports/report-kind.js';

const DESK_IDS = {
  checks: 'ana-desk-hist-checks',
  reports: 'ana-desk-hist-reports',
  plans: 'ana-desk-hist-plans'
};

let _deskChecksProject = 'ALL';
let _deskReportsProject = 'ALL';
let _deskPlansProject = 'ALL';
let _deskChecksSort = { key: 'date', dir: 'desc' };
/** P2-0026: раскрытые группы таблицы «Проверки» (ключи объект / подрядчик / вид работ) — сохраняются между перерисовками. */
let _deskChecksOpen = new Set();
/** P2-0039: раскрытые группы типов «Отчеты» (`r:{тип}`; `!r:{тип}` — свёрнута вручную единственная группа). */
let _deskReportsOpen = new Set();
let _deskPlansFloorItems = new Map();
let _deskPlansFloorLabels = new Map();
let _deskPlansSelectedFloor = null;
/** Expanded accordion keys in plans left pane: `b:{buildingId}` / `s:{sectionId}` / `o:{projectName}` */
let _deskPlansExpanded = new Set();
let _deskHistBound = false;
let _historyDeskI18nBound = false;

function _t(key, fallback, vars) {
  try {
    var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
    if (i18n && typeof i18n.t === 'function') {
      var out = vars ? i18n.t(key, vars) : i18n.t(key);
      if (out && out !== key) return out;
    }
  } catch (e) {}
  if (vars && fallback) {
    return String(fallback).replace(/\{(\w+)\}/g, function (_m, k) {
      return vars[k] != null ? String(vars[k]) : '';
    });
  }
  return fallback;
}

function _bindHistoryDeskI18n() {
  if (_historyDeskI18nBound) return;
  if (!(window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function')) return;
  _historyDeskI18nBound = true;
  window.RBI.events.on('i18n:localeChanged', function () {
    try {
      const mounted = Object.keys(DESK_IDS).some(function (m) {
        return !!document.getElementById(DESK_IDS[m]);
      });
      if (!mounted) return;
      paintHistoryContent(window.currentHistoryViewMode || 'checks');
    } catch (_e) { /* ignore */ }
  });
}

const CHECK_SORT_KEYS = ['place', 'date', 'tmpl', 'insp', 'urk'];
const RU_COLLATOR = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function histMulti() {
  return (window.activeMultiFilters && window.activeMultiFilters.history) || {};
}

function reportsSvc() {
  try {
    return window.RBI && window.RBI.services && window.RBI.services.reports;
  } catch (_) {
    return null;
  }
}

function locationsSvc() {
  try {
    return window.RBI && window.RBI.services && window.RBI.services.locations;
  } catch (_) {
    return null;
  }
}

function reportAuthor(r) {
  return String(r.created_by || r.engineer_name || (r.metadata && r.metadata.author) || 'Инженер').trim() || 'Инженер';
}

function reportPeriod(r) {
  const raw = (r.metadata && (r.metadata.period || r.metadata.periodLabel)) || '';
  return String(raw).trim() || _t('quality.history.report.period_none', 'Период не указан');
}

function reportProject(r) {
  return String((r.metadata && r.metadata.project) || _t('quality.history.report.default_project', 'Сводный Отчет')).trim() || _t('quality.history.report.default_project', 'Сводный Отчет');
}

function filterHistoryRecords(allRecords) {
  const fSearch = (document.getElementById('hist-search-text')?.value || '').toLowerCase();
  const fPeriod = document.getElementById('hist-filter-period')?.value || 'D30';
  const fPhoto = document.getElementById('hist-filter-photo')?.checked;
  const fB3 = document.getElementById('hist-filter-b3')?.checked;
  const fPlan = document.getElementById('hist-filter-plan')?.checked;
  const mf = histMulti();
  const fProj = mf.project || [];
  const fContr = mf.contractor || [];
  const fInsp = mf.inspector || [];
  const fTmpl = mf.template || [];
  let arr = allRecords || [];
  const now = new Date();

  if (fSearch) {
    arr = arr.filter((i) => {
      const projectText = i.project_display_name || i.projectName || i.project_canonical_key || '';
      return (
        (i.location && String(i.location).toLowerCase().includes(fSearch))
        || (projectText && String(projectText).toLowerCase().includes(fSearch))
        || (i.inspectorName && String(i.inspectorName).toLowerCase().includes(fSearch))
        || (i.contractorName && String(i.contractorName).toLowerCase().includes(fSearch))
        || (i.templateTitle && String(i.templateTitle).toLowerCase().includes(fSearch))
      );
    });
  }
  if (fProj.length) {
    arr = arr.filter((i) => {
      const p = i.project_display_name || i.projectName || i.project_canonical_key || '';
      return fProj.includes(p) || fProj.includes(i.project_canonical_key);
    });
  }
  if (fContr.length) arr = arr.filter((i) => fContr.includes(i.contractorName));
  if (fInsp.length) arr = arr.filter((i) => fInsp.includes(i.inspectorName));
  if (fTmpl.length) arr = arr.filter((i) => fTmpl.includes(i.templateTitle || i.templateKey));
  if (fPeriod && fPeriod !== 'ALL') {
    const days = typeof window.getAnalyticsPeriodDays === 'function'
      ? window.getAnalyticsPeriodDays(fPeriod)
      : null;
    if (days) {
      const from = new Date(now);
      from.setDate(now.getDate() - days);
      arr = arr.filter((i) => new Date(i.date) >= from);
    }
  }
  if (fPhoto) arr = arr.filter((i) => i.photos && Object.keys(i.photos).length > 0);
  if (fB3) arr = arr.filter((i) => i.metrics && i.metrics.n_B3_fail > 0);
  if (fPlan) {
    arr = arr.filter((i) => {
      const pin = planPinOf(i);
      if (!pin) return false;
      return Number.isFinite(Number(pin.x)) && Number.isFinite(Number(pin.y)) && pin.locationId != null;
    });
  }
  return arr;
}

function filterReports(all) {
  const fSearch = (document.getElementById('hist-search-text')?.value || '').toLowerCase();
  const fPeriod = document.getElementById('hist-filter-period')?.value || 'D30';
  const mf = histMulti();
  const fProj = mf.project || [];
  const fContr = mf.contractor || [];
  const fInsp = mf.inspector || [];
  let arr = (all || []).filter((r) => !r.is_deleted);
  const now = new Date();

  if (fSearch) {
    arr = arr.filter((r) => (
      (r.title && String(r.title).toLowerCase().includes(fSearch))
      || (r.metadata?.project && String(r.metadata.project).toLowerCase().includes(fSearch))
    ));
  }
  if (fProj.length) {
    arr = arr.filter((r) => {
      const p = r.metadata?.project || '';
      return p.includes('Все объекты') || fProj.includes(p) || fProj.some((proj) => p.includes(proj));
    });
  }
  if (fContr.length) {
    arr = arr.filter((r) => fContr.some((c) => String(r.title || '').includes(c)));
  }
  if (fInsp.length) arr = arr.filter((r) => fInsp.includes(r.created_by));
  if (fPeriod !== 'ALL') {
    const days = typeof window.getAnalyticsPeriodDays === 'function'
      ? window.getAnalyticsPeriodDays(fPeriod)
      : null;
    if (days) {
      const from = new Date(now);
      from.setDate(now.getDate() - days);
      arr = arr.filter((i) => new Date(i.generated_at) >= from);
    }
  }
  return arr;
}

function ensureDeskStage(stage) {
  if (!stage) return null;
  Object.keys(DESK_IDS).forEach((mode) => {
    let el = document.getElementById(DESK_IDS[mode]);
    if (!el) {
      el = document.createElement('div');
      el.id = DESK_IDS[mode];
      el.className = 'ana-desk-hist-panel hidden';
      el.setAttribute('data-ana-desk-hist-mode', mode);
      stage.appendChild(el);
    } else if (el.parentElement !== stage) {
      stage.appendChild(el);
    }
  });
  return stage;
}

function showDeskMode(mode) {
  Object.keys(DESK_IDS).forEach((m) => {
    const el = document.getElementById(DESK_IDS[m]);
    if (el) el.classList.toggle('hidden', m !== mode);
  });
  // Hide mobile content views while desktop panels are active
  ['history-checks-view', 'history-reports-view', 'history-plans-view'].forEach((id) => {
    const v = document.getElementById(id);
    if (v) v.classList.add('hidden', 'ana-desk-hist-mobile-hide');
  });
}

function emptyHtml(title, hint) {
  return `<div class="ana-desk-hist-empty">`
    + `<p data-hist-empty-label="1">${esc(title)}</p>`
    + (hint ? `<span class="ana-desk-hist-empty-hint">${esc(hint)}</span>` : '')
    + `</div>`;
}

/* ─── Master–detail helpers ─────────────────────────────────────────── */

function groupByProject(items, nameOf) {
  const map = new Map();
  (items || []).forEach((item) => {
    const p = nameOf(item);
    if (!map.has(p)) map.set(p, []);
    map.get(p).push(item);
  });
  const names = Array.from(map.keys()).sort(RU_COLLATOR.compare);
  return { map, names };
}

function resolveSelectedProject(selected, names) {
  if (selected === 'ALL') return 'ALL';
  if (names.includes(selected)) return selected;
  return 'ALL';
}

function buildObjectRailHtml(kind, names, counts, selected, total) {
  const allOn = selected === 'ALL';
  const allBtn = `<button type="button" class="ana-desk-hist-obj${allOn ? ' is-on' : ''}" data-ana-desk-obj="${kind}" data-ana-desk-obj-id="ALL">`
    + `<span class="ana-desk-hist-obj-name">${esc(_t('quality.history.rail.all_objects', 'Все объекты'))}</span>`
    + `<span class="ana-desk-hist-obj-count">${total}</span>`
    + `</button>`;
  const cards = names.map((name) => {
    const on = selected === name;
    return `<button type="button" class="ana-desk-hist-obj${on ? ' is-on' : ''}" data-ana-desk-obj="${kind}" data-ana-desk-obj-id="${esc(name)}">`
      + `<span class="ana-desk-hist-obj-name">${esc(name)}</span>`
      + `<span class="ana-desk-hist-obj-count">${counts.get(name) || 0}</span>`
      + `</button>`;
  }).join('');
  return `<aside class="ana-desk-hist-rail" aria-label="${esc(_t('quality.history.rail.aria', 'Объекты'))}">`
    + `<div class="ana-desk-hist-rail-list">${allBtn}${cards}</div>`
    + `</aside>`;
}

function detailHeadHtml(title, count, unit) {
  return `<header class="ana-desk-hist-detail-head">`
    + `<h3 class="ana-desk-hist-detail-title">${esc(title)}</h3>`
    + `<span class="ana-desk-hist-detail-count">${count} ${unit}</span>`
    + `</header>`;
}

function checkProjectOf(item) {
  return item.project_display_name || item.projectName || _t('quality.history.fallback.no_project', 'Без объекта');
}

function checkSortValue(item, key) {
  if (key === 'place') return String(item.location || '');
  if (key === 'date') return new Date(item.date).getTime() || 0;
  if (key === 'tmpl') return String(item.templateTitle || '');
  if (key === 'insp') return String(item.inspectorName || '');
  if (key === 'urk') {
    const v = item.metrics && item.metrics.final;
    return (v == null || v === '') ? -1 : Number(v);
  }
  return '';
}

function sortChecks(items, sort) {
  const key = (sort && sort.key) || 'date';
  const dir = (sort && sort.dir) === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const va = checkSortValue(a, key);
    const vb = checkSortValue(b, key);
    let cmp = 0;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = RU_COLLATOR.compare(String(va), String(vb));
    if (cmp === 0) cmp = (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0);
    return cmp * dir;
  });
}

function sortMark(key) {
  if (_deskChecksSort.key !== key) return '';
  return _deskChecksSort.dir === 'asc' ? ' ↑' : ' ↓';
}

function checkRowHtml(item) {
  const id = String(item.id);
  const place = item.location || _t('quality.history.fallback.no_location', 'Без локации');
  const when = new Date(item.date).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  const tmpl = item.templateTitle || '—';
  const insp = item.inspectorName || '—';
  const finalPct = (item.metrics && item.metrics.final != null) ? item.metrics.final : '—';
  const statusCls = (item.metrics && item.metrics.statusCls) || '';
  const hasPhoto = !!(item.photos && Object.keys(item.photos).length);
  return `<div class="ana-desk-hist-row" data-hist-id="${esc(id)}" role="row">`
    + `<input type="checkbox" class="hist-checkbox ana-desk-hist-row-cb" value="${esc(id)}">`
    + `<button type="button" class="ana-desk-hist-row-main" data-ana-desk-open-check="${esc(id)}">`
    + `<span class="ana-desk-hist-row-place">${esc(place)}${hasPhoto ? _t('quality.history.row.has_photo', ' · фото') : ''}</span>`
    + `<span class="ana-desk-hist-row-when">${esc(when)}</span>`
    + `<span class="ana-desk-hist-row-tmpl">${esc(tmpl)}</span>`
    + `<span class="ana-desk-hist-row-insp">${esc(insp)}</span>`
    + `<span class="ana-desk-hist-row-urk status-tag ${esc(statusCls)}">${esc(String(finalPct))}${finalPct !== '—' ? '%' : ''}</span>`
    + `</button>`
    + `</div>`;
}

/** P2-0026: строка-группа (объект / подрядчик / вид работ): раскрыть-свернуть, число проверок, средний УрК — как на телефоне. */
function groupHtml(level, key, name, items, inner, opts) {
  const o = opts || {};
  const open = o.open != null ? !!o.open : _deskChecksOpen.has(key);
  const avg = o.noUrk ? null : avgFinalUrk(items);
  const urk = o.noUrk ? ''
    : avg !== null
      ? `<span class="ana-desk-hist-grp-urk status-tag ${avgUrkStatusCls(avg)}">${avg}%</span>`
      : `<span class="ana-desk-hist-grp-urk"></span>`;
  const cbLabel = o.cbLabel || _t('quality.history.group.select', 'Отметить все проверки группы');
  return `<div class="ana-desk-hist-grp" data-lvl="${level}" role="row">`
    + `<input type="checkbox" class="ana-desk-hist-grp-cb" data-ana-desk-grp-cb="1" aria-label="${esc(cbLabel)}">`
    + `<button type="button" class="ana-desk-hist-grp-main" data-ana-desk-grp="${esc(key)}" aria-expanded="${open ? 'true' : 'false'}">`
    + `<span class="ana-desk-hist-grp-chev" aria-hidden="true">›</span>`
    + `<span class="ana-desk-hist-grp-name">${esc(name)}</span>`
    + `<span class="ana-desk-hist-grp-count">${esc(_t('quality.history.count.pcs', '{n} шт', { n: items.length }))}</span>`
    + urk
    + `</button>`
    + `</div>`
    + `<div class="ana-desk-hist-grp-body" data-lvl="${level}"${open ? '' : ' hidden'}>${inner}</div>`;
}

function contractorGroupsHtml(prefix, items) {
  return groupByContractorWork(items).map((c) => {
    const cKey = `${prefix}|c:${c.name}`;
    const works = c.works.map((w) => {
      const wKey = `${cKey}|w:${w.name}`;
      return groupHtml(2, wKey, w.name, w.items, sortChecks(w.items, _deskChecksSort).map(checkRowHtml).join(''));
    }).join('');
    return groupHtml(1, cKey, c.name, c.items, works);
  }).join('');
}

/** Таблица проверок с группами: «Все объекты» — Объект → Подрядчик → Вид работ; один объект — Подрядчик → Вид работ. */
function buildChecksTableHtml(items, project) {
  const headCols = [
    ['place', _t('quality.history.sort.place', 'Место')],
    ['date', _t('quality.history.sort.date', 'Дата')],
    ['tmpl', _t('quality.history.sort.work', 'Вид работ')],
    ['insp', _t('quality.history.sort.inspector', 'Инспектор')],
    ['urk', _t('quality.history.sort.urk', 'УрК')]
  ];
  const head = `<div class="ana-desk-hist-row-head" role="row">`
    + `<span></span>`
    + headCols.map(([key, label]) => (
      `<button type="button" class="ana-desk-hist-sort${_deskChecksSort.key === key ? ' is-on' : ''}" data-ana-desk-sort="${key}">`
      + `${esc(label)}${sortMark(key)}</button>`
    )).join('')
    + `</div>`;

  let rows = '';
  if (project === 'ALL') {
    const { map, names } = groupByProject(items, checkProjectOf);
    rows = names.map((p) => groupHtml(0, `p:${p}`, p, map.get(p), contractorGroupsHtml(`p:${p}`, map.get(p)))).join('');
  } else {
    rows = contractorGroupsHtml(`p:${project}`, items);
  }

  return `<div class="ana-desk-hist-journal" role="table">${head}${rows}</div>`;
}

function reportFileCard(r) {
  const isPptx = (r.mime_type && String(r.mime_type).includes('presentation'))
    || r.report_type === 'pptx'
    || /\.pptx$/i.test(String(r.title || ''));
  const type = isPptx ? 'PPTX' : 'PDF';
  const typeCls = isPptx ? 'is-pptx' : 'is-pdf';
  const kind = reportKindOf(r);
  const author = reportAuthor(r);
  const period = reportPeriod(r);
  const dateStr = new Date(r.generated_at).toLocaleDateString('ru-RU');
  const sizeStr = (((r.file_size || 0) / 1024 / 1024).toFixed(2)) + ' MB';
  const isOwner = !r.created_by || r.created_by === ((window.RBI?.services?.settings?.get?.('engineerName')) || 'Инженер');
  const safeTitle = String(r.title || '').replace(/'/g, "\\'");
  const project = reportProject(r);
  return `<article class="ana-desk-hist-file" data-report-id="${esc(r.id)}" role="button" tabindex="0">`
    + `<input type="checkbox" class="report-checkbox ana-desk-hist-file-cb" value="${esc(r.id)}">`
    + `<span class="ana-desk-hist-file-type ${typeCls}">${type}</span>`
    + `<div class="ana-desk-hist-file-body">`
    + `<div class="ana-desk-hist-file-title">${esc(r.title || _t('quality.history.report.untitled', 'Без названия'))}</div>`
    + `<div class="ana-desk-hist-file-meta">${esc(kind !== REPORT_KIND_OTHER ? reportKindLabel(kind, _t) : _t('quality.history.report.generic', 'Отчёт'))}`
    + `${_deskReportsProject === 'ALL' ? ' · ' + esc(project) : ''}</div>`
    + `<div class="ana-desk-hist-file-sub">${esc(author)} · ${esc(period)} · ${esc(sizeStr)}</div>`
    + `</div>`
    + `<div class="ana-desk-hist-file-side">`
    + `<time class="ana-desk-hist-file-date">${esc(dateStr)}</time>`
    + `<button type="button" class="ana-desk-hist-file-more" data-ana-desk-report-more="${esc(r.id)}" data-owner="${isOwner ? '1' : '0'}" data-title="${esc(safeTitle)}" aria-label="${esc(_t('quality.history.report.actions', 'Действия'))}">⋮</button>`
    + `</div>`
    + `</article>`;
}

/** P2-0039: отчёты разложены по группам типов (по количеству, «Прочее» последней); внутри — свежие сверху. */
function reportKindGroupsHtml(items) {
  const byKind = new Map();
  items.forEach((r) => {
    const k = reportKindOf(r);
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k).push(r);
  });
  const kinds = orderKindGroups(new Map([...byKind].map(([k, list]) => [k, list.length])));
  const single = kinds.length === 1;
  const groups = kinds.map((k) => {
    const key = `r:${k}`;
    const open = _deskReportsOpen.has(key) || (single && !_deskReportsOpen.has('!' + key));
    const list = byKind.get(k);
    return groupHtml(0, key, reportKindLabel(k, _t), list,
      `<div class="ana-desk-hist-files">${list.map(reportFileCard).join('')}</div>`,
      { open, noUrk: true, cbLabel: _t('quality.history.report.group_select', 'Отметить все отчёты группы') });
  }).join('');
  return `<div class="ana-desk-hist-files ana-desk-hist-kind-groups">${groups}</div>`;
}

/* ─── Reports: object rail + kind groups ────────────────────────────── */

function paintDeskReports() {
  const host = document.getElementById(DESK_IDS.reports);
  if (!host) return;
  const svc = reportsSvc();
  const all = svc && typeof svc.getAllSync === 'function' ? svc.getAllSync() : [];
  const filtered = filterReports(all);

  if (!all.length) {
    host.innerHTML = emptyHtml(_t('quality.history.report.empty', 'Сохранённых отчётов пока нет.'), _t('quality.history.report.empty_hint', 'Сформируйте отчёт во вкладке Отчёты.'));
    return;
  }
  if (!filtered.length) {
    host.innerHTML = emptyHtml(_t('quality.history.report.empty_filtered', 'По выбранным фильтрам отчётов не найдено.'), _t('quality.history.report.empty_filtered_hint', 'Смягчите фильтры или период.'));
    return;
  }

  const { map, names } = groupByProject(filtered, reportProject);
  _deskReportsProject = resolveSelectedProject(_deskReportsProject, names);
  const selectedItems = _deskReportsProject === 'ALL'
    ? filtered.slice()
    : (map.get(_deskReportsProject) || []).slice();
  selectedItems.sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at));

  const counts = new Map(names.map((n) => [n, (map.get(n) || []).length]));
  const rail = buildObjectRailHtml('reports', names, counts, _deskReportsProject, filtered.length);

  const actions = `<div class="ana-desk-hist-reports-actions">`
    + `<label class="ana-desk-hist-check-all"><input type="checkbox" id="ana-desk-reports-select-all" class="accent-indigo-600"> ${_t('quality.history.report.select_all', 'Выбрать всё')}</label>`
    + `<button type="button" class="ana-desk-hist-danger-btn" data-analytics-action="deleteSelectedReports">${_t('quality.history.report.delete_selected', 'Удалить выбранные')}</button>`
    + `</div>`;

  const title = _deskReportsProject === 'ALL' ? _t('quality.history.rail.all_objects', 'Все объекты') : _deskReportsProject;
  let body = '';
  if (!selectedItems.length) {
    body = emptyHtml(_t('quality.history.report.empty_project', 'В этом объекте нет отчётов.'), _t('quality.history.report.empty_project_hint', 'Выберите другой объект.'));
  } else {
    body = reportKindGroupsHtml(selectedItems);
  }

  const detail = `<div class="ana-desk-hist-detail">`
    + detailHeadHtml(title, selectedItems.length, selectedItems.length === 1 ? _t('quality.history.unit.report_one', 'отчёт') : _t('quality.history.unit.report_many', 'отчётов'))
    + actions + body
    + `</div>`;

  host.innerHTML = `<div class="ana-desk-hist-split">${rail}${detail}</div>`;
}

/* ─── Checks: object rail + sortable table ──────────────────────────── */

function paintDeskChecks() {
  const host = document.getElementById(DESK_IDS.checks);
  if (!host) return;
  const records = (window.HistoryState && window.HistoryState.allRecords) || [];
  const filtered = filterHistoryRecords(records);

  if (!records.length) {
    host.innerHTML = emptyHtml(_t('quality.history.empty.all', 'История пуста.'), _t('quality.history.empty.all_hint', 'Создайте проверку или смягчите фильтры.'));
    return;
  }
  if (!filtered.length) {
    host.innerHTML = emptyHtml(_t('quality.history.empty.filtered', 'По заданным фильтрам проверок не найдено.'), _t('quality.history.empty.filtered_hint', 'Смягчите период или условия фильтра.'));
    return;
  }

  const { map, names } = groupByProject(filtered, checkProjectOf);
  _deskChecksProject = resolveSelectedProject(_deskChecksProject, names);
  const selectedItems = _deskChecksProject === 'ALL'
    ? filtered
    : (map.get(_deskChecksProject) || []);

  const counts = new Map(names.map((n) => [n, (map.get(n) || []).length]));
  const rail = buildObjectRailHtml('checks', names, counts, _deskChecksProject, filtered.length);
  const title = _deskChecksProject === 'ALL' ? _t('quality.history.rail.all_objects', 'Все объекты') : _deskChecksProject;

  let body = '';
  if (!selectedItems.length) {
    body = emptyHtml(_t('quality.history.empty.project', 'В этом объекте нет проверок.'), _t('quality.history.empty.project_hint', 'Выберите другой объект.'));
  } else {
    body = buildChecksTableHtml(selectedItems, _deskChecksProject);
  }

  let more = '';
  if (window.HistoryState && window.HistoryState.pageHasMore) {
    more = `<button type="button" class="ana-desk-hist-more" data-history-action="loadMoreHistoryPage">${_t('quality.history.btn.load_more', 'Загрузить ещё')}</button>`;
  }

  const detail = `<div class="ana-desk-hist-detail">`
    + detailHeadHtml(title, selectedItems.length, selectedItems.length === 1 ? _t('quality.history.unit.check_one', 'проверка') : _t('quality.history.unit.check_many', 'проверок'))
    + body + more
    + `</div>`;

  host.innerHTML = `<div class="ana-desk-hist-split">${rail}${detail}</div>`;
}

/* ─── Plans: project cards with floors visible ──────────────────────── */

function resolveLocationObject(loc, projectName) {
  if (!loc || !projectName) return null;
  if (typeof loc.resolveObjectLink === 'function') {
    try {
      const link = loc.resolveObjectLink({ displayName: projectName });
      if (link && link.locationObject) return link.locationObject;
    } catch (_) { /* ignore */ }
  }
  const objects = (typeof loc.listNodes === 'function'
    ? loc.listNodes({ nodeType: 'object', parentId: null })
    : []) || [];
  const pn = String(projectName || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return objects.find((o) => {
    const a = String(o.displayName || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const b = String(o.canonical_key || '').toLowerCase().replace(/\s+/g, ' ').trim();
    return a === pn || b === pn;
  }) || null;
}

function pdfFloorsForObject(loc, objectNode) {
  if (!loc || !objectNode) return [];
  const buildings = (loc.getChildren(objectNode.id) || []).filter((n) => !n.nodeType || n.nodeType === 'building');
  const rows = [];
  buildings.forEach((b) => {
    const sections = (loc.getChildren(b.id) || []).filter((n) => !n.nodeType || n.nodeType === 'section');
    sections.forEach((s) => {
      (loc.getChildren(s.id) || []).forEach((f) => {
        if (f.nodeType !== 'floor') return;
        const plan = loc.getPlanForFloor(f.id);
        if (!plan || !plan.pdf_url) return;
        rows.push({
          id: String(f.id),
          name: f.displayName || f.id,
          buildingId: String(b.id),
          buildingName: b.displayName || '',
          buildingsCount: buildings.length,
          sectionId: String(s.id),
          sectionName: s.displayName || _t('quality.history.plan.section', 'Секция'),
          sectionsCount: sections.length
        });
      });
    });
  });
  return rows;
}

function pinItemsOnFloor(filteredArr, floorId) {
  const fid = String(floorId);
  return (filteredArr || []).filter((item) => {
    const pin = planPinOf(item);
    return !!(pin && String(pin.locationId) === fid
      && Number.isFinite(Number(pin.x)) && Number.isFinite(Number(pin.y)));
  });
}

function groupPdfFloors(floors) {
  const buildings = [];
  const bMap = new Map();
  (floors || []).forEach((row) => {
    const bKey = row.buildingId || row.buildingName || '_';
    let b = bMap.get(bKey);
    if (!b) {
      b = {
        buildingId: row.buildingId,
        buildingName: row.buildingName || '',
        sections: [],
        sMap: new Map()
      };
      bMap.set(bKey, b);
      buildings.push(b);
    }
    const sKey = row.sectionId || row.sectionName || '_';
    let s = b.sMap.get(sKey);
    if (!s) {
      s = { sectionId: row.sectionId, sectionName: row.sectionName || _t('quality.history.plan.section', 'Секция'), floors: [] };
      b.sMap.set(sKey, s);
      b.sections.push(s);
    }
    s.floors.push(row);
  });
  buildings.forEach((b) => { delete b.sMap; });
  return buildings;
}

function projectNameOf(item) {
  return (item && (item.project_display_name || item.projectName)) || _t('quality.history.fallback.no_project', 'Без объекта');
}

function buildAggTableHtml(items, headLabel) {
  const pins = items || [];
  if (!pins.length) {
    return `<div class="ana-desk-hist-plan-defects-empty">${esc(_t('quality.history.plan.no_pins_filtered', 'Нет точек на планах по текущим фильтрам.'))}</div>`;
  }
  const groups = groupPinsByTemplate(pins);
  let sumChecks = 0;
  let sumB1 = 0;
  let sumB2 = 0;
  let sumB3 = 0;
  const rows = groups.map((g) => {
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    g.list.forEach((item) => {
      const m = item.metrics || {};
      b1 += Number(m.n_B1_fail) || 0;
      b2 += Number(m.n_B2_fail) || 0;
      b3 += Number(m.n_B3_fail) || 0;
    });
    const checks = g.list.length;
    const total = b1 + b2 + b3;
    sumChecks += checks;
    sumB1 += b1;
    sumB2 += b2;
    sumB3 += b3;
    return `<tr>`
      + `<td class="ana-desk-hist-plan-agg-name">${esc(g.title)}</td>`
      + `<td class="ana-desk-hist-plan-agg-num">${checks}</td>`
      + `<td class="ana-desk-hist-plan-agg-num">${total}</td>`
      + `<td class="ana-desk-hist-plan-agg-num is-b3">${b3}</td>`
      + `<td class="ana-desk-hist-plan-agg-num is-b2">${b2}</td>`
      + `<td class="ana-desk-hist-plan-agg-num is-b1">${b1}</td>`
      + `</tr>`;
  }).join('');
  const sumTotal = sumB1 + sumB2 + sumB3;
  return `<div class="ana-desk-hist-plan-defects">`
    + `<div class="ana-desk-hist-plan-defects-head">${esc(headLabel || _t('quality.history.plan.agg_work', 'Замечания на плане · по видам работ'))}</div>`
    + `<div class="ana-desk-hist-plan-agg-wrap">`
    + `<table class="ana-desk-hist-plan-agg">`
    + `<thead><tr>`
    + `<th class="ana-desk-hist-plan-agg-name">${esc(_t('quality.history.plan.col_work', 'Вид работ'))}</th>`
    + `<th class="ana-desk-hist-plan-agg-num">${esc(_t('quality.history.plan.col_checks', 'Проверок'))}</th>`
    + `<th class="ana-desk-hist-plan-agg-num">${esc(_t('quality.history.plan.col_total', 'Всего'))}</th>`
    + `<th class="ana-desk-hist-plan-agg-num">B3</th>`
    + `<th class="ana-desk-hist-plan-agg-num">B2</th>`
    + `<th class="ana-desk-hist-plan-agg-num">B1</th>`
    + `</tr></thead>`
    + `<tbody>${rows}</tbody>`
    + `<tfoot><tr>`
    + `<td>${esc(_t('quality.history.plan.total', 'Итого'))}</td>`
    + `<td class="ana-desk-hist-plan-agg-num">${sumChecks}</td>`
    + `<td class="ana-desk-hist-plan-agg-num">${sumTotal}</td>`
    + `<td class="ana-desk-hist-plan-agg-num is-b3">${sumB3}</td>`
    + `<td class="ana-desk-hist-plan-agg-num is-b2">${sumB2}</td>`
    + `<td class="ana-desk-hist-plan-agg-num is-b1">${sumB1}</td>`
    + `</tr></tfoot>`
    + `</table></div></div>`;
}

function groupPinsByTemplate(items) {
  const map = new Map();
  (items || []).forEach((item) => {
    const key = item.templateTitle || item.templateKey || _t('quality.history.fallback.no_work', 'Без вида работ');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  const groups = Array.from(map.entries()).map(([title, list]) => ({ title, list }));
  groups.sort((a, b) => RU_COLLATOR.compare(a.title, b.title));
  return groups;
}

function isExpanded(key, fallbackOpen) {
  if (_deskPlansExpanded.has(key)) return true;
  if (_deskPlansExpanded.has('!' + key)) return false;
  return !!fallbackOpen;
}

/** Single left cascade: All + Object → Building → Section → Floor (with pin counts). */
function buildPlansCascadeHtml(loc, usableMeta, filtered, selectedFloorId) {
  const parts = [];
  const allPins = [];
  const allOn = !selectedFloorId;
  let totalFloors = 0;
  let totalPins = 0;

  usableMeta.forEach((meta) => {
    const pName = meta.pName;
    const obj = resolveLocationObject(loc, pName);
    if (!obj) return;
    const floors = pdfFloorsForObject(loc, obj);
    if (!floors.length) return;
    const groups = groupPdfFloors(floors);
    const oKey = 'o:' + pName;
    let objPins = 0;
    let objFloors = 0;
    const objHasSel = floors.some((f) => String(f.id) === String(selectedFloorId));
    // Default collapsed; open only ancestors of selected floor or explicit user expand.
    const oOpen = isExpanded(oKey, objHasSel);

    const buildingParts = [];
    groups.forEach((b, bi) => {
      const bKey = 'b:' + pName + ':' + (b.buildingId || b.buildingName || bi);
      let bPins = 0;
      let bFloors = 0;
      const bHasSel = b.sections.some((s) => s.floors.some((f) => String(f.id) === String(selectedFloorId)));
      const showBuilding = groups.length > 1 && b.buildingName;
      const bOpen = isExpanded(bKey, bHasSel);

      const sectionParts = [];
      b.sections.forEach((s, si) => {
        const sKey = 's:' + pName + ':' + (s.sectionId || s.sectionName || (bi + '-' + si));
        let sPins = 0;
        const sHasSel = s.floors.some((f) => String(f.id) === String(selectedFloorId));
        const multiSec = b.sections.length > 1;
        const sOpen = isExpanded(sKey, sHasSel);

        const floorBtns = s.floors.map((row) => {
          const pins = pinItemsOnFloor(filtered, row.id);
          _deskPlansFloorItems.set(String(row.id), pins);
          _deskPlansFloorLabels.set(String(row.id), row.name);
          pins.forEach((p) => allPins.push(p));
          sPins += pins.length;
          bPins += pins.length;
          objPins += pins.length;
          objFloors += 1;
          bFloors += 1;
          totalFloors += 1;
          totalPins += pins.length;
          const selCls = selectedFloorId && String(selectedFloorId) === String(row.id) ? ' is-selected' : '';
          const countCls = pins.length ? 'has-pins' : 'no-pins';
          return `<button type="button" class="ana-desk-hist-floor ${countCls}${selCls}" data-ana-desk-floor="${esc(row.id)}" data-ana-desk-floor-label="${esc(row.name)}">`
            + `<span class="ana-desk-hist-floor-name">${esc(row.name)}</span>`
            + `<span class="ana-desk-hist-floor-count">${pins.length}</span>`
            + `</button>`;
        }).join('');

        if (multiSec) {
          sectionParts.push(
            `<button type="button" class="ana-desk-hist-plan-acc ana-desk-hist-plan-acc--sub${sOpen ? ' is-open' : ''}" data-ana-desk-acc="${esc(sKey)}" aria-expanded="${sOpen ? 'true' : 'false'}">`
            + `<span class="ana-desk-hist-plan-acc-label">${esc(s.sectionName)}</span>`
            + `<span class="ana-desk-hist-plan-acc-meta">${sPins}</span>`
            + `<span class="ana-desk-hist-plan-acc-chev" aria-hidden="true"></span>`
            + `</button>`
            + `<div class="ana-desk-hist-plan-acc-body${sOpen ? '' : ' is-collapsed'}" data-ana-desk-acc-body="${esc(sKey)}">${floorBtns}</div>`
          );
        } else {
          if (s.sectionName && showBuilding) {
            sectionParts.push(`<div class="ana-desk-hist-plan-section">${esc(s.sectionName)}</div>`);
          }
          sectionParts.push(floorBtns);
        }
      });

      if (showBuilding) {
        buildingParts.push(
          `<button type="button" class="ana-desk-hist-plan-acc${bOpen ? ' is-open' : ''}" data-ana-desk-acc="${esc(bKey)}" aria-expanded="${bOpen ? 'true' : 'false'}">`
          + `<span class="ana-desk-hist-plan-acc-label">${esc(b.buildingName)}</span>`
          + `<span class="ana-desk-hist-plan-acc-meta">${bPins}</span>`
          + `<span class="ana-desk-hist-plan-acc-chev" aria-hidden="true"></span>`
          + `</button>`
          + `<div class="ana-desk-hist-plan-acc-body${bOpen ? '' : ' is-collapsed'}" data-ana-desk-acc-body="${esc(bKey)}">${sectionParts.join('')}</div>`
        );
      } else {
        buildingParts.push(...sectionParts);
      }
    });

    parts.push(
      `<button type="button" class="ana-desk-hist-plan-acc ana-desk-hist-plan-acc--obj${oOpen ? ' is-open' : ''}" data-ana-desk-acc="${esc(oKey)}" aria-expanded="${oOpen ? 'true' : 'false'}">`
      + `<span class="ana-desk-hist-plan-acc-label">${esc(pName)}</span>`
      + `<span class="ana-desk-hist-plan-acc-meta">${objPins}</span>`
      + `<span class="ana-desk-hist-plan-acc-chev" aria-hidden="true"></span>`
      + `</button>`
      + `<div class="ana-desk-hist-plan-acc-body${oOpen ? '' : ' is-collapsed'}" data-ana-desk-acc-body="${esc(oKey)}">${buildingParts.join('')}</div>`
    );
  });

  const allBtn = `<button type="button" class="ana-desk-hist-obj${allOn ? ' is-on' : ''}" data-ana-desk-plans-all="1">`
    + `<span class="ana-desk-hist-obj-name">${esc(_t('quality.history.rail.all_objects', 'Все объекты'))}</span>`
    + `<span class="ana-desk-hist-obj-count">${totalPins}</span>`
    + `</button>`;

  return {
    html: `<aside class="ana-desk-hist-plan-cascade" aria-label="${esc(_t('quality.history.plan.aria', 'Планы'))}">`
      + `<div class="ana-desk-hist-plan-cascade-list">${allBtn}${parts.join('')}</div>`
      + `</aside>`,
    totalFloors,
    totalPins,
    allPins
  };
}

function floorLabelForId(floorId) {
  const fromMap = _deskPlansFloorLabels.get(String(floorId));
  if (fromMap) return fromMap;
  const btn = document.querySelector(`.ana-desk-hist-floor[data-ana-desk-floor="${String(floorId).replace(/"/g, '')}"]`);
  return (btn && btn.getAttribute('data-ana-desk-floor-label')) || _t('quality.history.plan.floor_title', 'План этажа');
}

async function mountSelectedFloorPreview(floorId) {
  const host = document.getElementById('ana-desk-hist-plan-preview');
  const defectsHost = document.getElementById('ana-desk-hist-plan-defects-host');
  const previewWrap = document.getElementById('ana-desk-hist-plan-preview-wrap');

  if (!floorId) {
    if (previewWrap) previewWrap.classList.add('is-hidden');
    if (host) host.innerHTML = '';
    return;
  }

  if (previewWrap) previewWrap.classList.remove('is-hidden');
  const items = _deskPlansFloorItems.get(String(floorId)) || [];
  if (defectsHost) defectsHost.innerHTML = buildAggTableHtml(items, _t('quality.history.plan.agg_work', 'Замечания на плане · по видам работ'));
  if (!host) return;
  host.innerHTML = `<div class="ana-desk-hist-plan-preview-loading">${esc(_t('quality.history.plan.loading', 'Загрузка плана…'))}</div>`;

  const openFullscreen = function () {
    openHistoryPlanViewer({
      floorId: floorId,
      items: items,
      onClose: function () {
        if (_deskPlansSelectedFloor && String(_deskPlansSelectedFloor) === String(floorId)) {
          mountSelectedFloorPreview(floorId);
        }
      }
    });
  };

  try {
    await openHistoryPlanViewer({
      floorId: floorId,
      items: items,
      mountEl: host,
      onFullscreen: openFullscreen
    });
  } catch (e) {
    console.warn('[history.desk.plans] preview', e);
    host.innerHTML = `<div class="ana-desk-hist-plan-preview-empty">${esc(_t('quality.history.plan.open_failed', 'Не удалось открыть план'))}</div>`;
  }
}

function paintDeskPlans() {
  const host = document.getElementById(DESK_IDS.plans);
  if (!host) return;
  const loc = locationsSvc();
  const records = (window.HistoryState && window.HistoryState.allRecords) || [];
  const filtered = filterHistoryRecords(records);
  _deskPlansFloorItems = new Map();
  _deskPlansFloorLabels = new Map();

  if (!loc || typeof loc.getPlanForFloor !== 'function') {
    host.innerHTML = emptyHtml(_t('quality.history.plan.locations_unavailable', 'Справочник локаций недоступен.'), '');
    return;
  }

  const candidateNames = [];
  const seen = new Set();
  filtered.forEach((item) => {
    const p = projectNameOf(item);
    if (!seen.has(p)) {
      seen.add(p);
      candidateNames.push(p);
    }
  });
  try {
    const objects = (typeof loc.listNodes === 'function'
      ? loc.listNodes({ nodeType: 'object', parentId: null })
      : []) || [];
    objects.forEach((o) => {
      const name = o.displayName || o.canonical_key;
      if (!name || seen.has(name)) return;
      if (pdfFloorsForObject(loc, o).length) {
        seen.add(name);
        candidateNames.push(name);
      }
    });
  } catch (_) { /* ignore */ }
  candidateNames.sort(RU_COLLATOR.compare);

  const usableMeta = candidateNames
    .map((pName) => {
      const obj = resolveLocationObject(loc, pName);
      if (!obj) return null;
      const floors = pdfFloorsForObject(loc, obj);
      if (!floors.length) return null;
      return { pName };
    })
    .filter(Boolean);

  if (!usableMeta.length) {
    host.innerHTML = emptyHtml(
      _t('quality.history.plan.empty_filtered', 'Нет объектов с PDF-планами этажей по заданным фильтрам.'),
      _t('quality.history.plan.empty_filtered_hint', 'Смягчите фильтры или загрузите планы в Настройках.')
    );
    return;
  }

  let cascade = buildPlansCascadeHtml(loc, usableMeta, filtered, _deskPlansSelectedFloor);
  if (_deskPlansSelectedFloor && !_deskPlansFloorItems.has(String(_deskPlansSelectedFloor))) {
    _deskPlansSelectedFloor = null;
    _deskPlansFloorItems = new Map();
    _deskPlansFloorLabels = new Map();
    cascade = buildPlansCascadeHtml(loc, usableMeta, filtered, null);
  }

  const selFloor = _deskPlansSelectedFloor;
  const showPreview = !!selFloor;
  const tableItems = showPreview
    ? (_deskPlansFloorItems.get(String(selFloor)) || [])
    : cascade.allPins;
  const tableHead = showPreview
    ? _t('quality.history.plan.agg_work', 'Замечания на плане · по видам работ')
    : _t('quality.history.plan.agg_all', 'Замечания по всем объектам · по видам работ');

  // Keep live PDF viewer across chrome re-paints (same floor) — avoids reload/toast while zooming.
  const prevHost = document.getElementById('ana-desk-hist-plan-preview');
  const liveOverlay = prevHost && prevHost.querySelector('#quality-plan-pin-overlay');
  const keepPreview = !!(
    showPreview
    && selFloor
    && liveOverlay
    && liveOverlay.isConnected
    && liveOverlay.getAttribute('data-qpin-floor') === String(selFloor)
  );
  if (keepPreview) {
    liveOverlay.remove();
  }

  const stage = `<div class="ana-desk-hist-plan-stage">`
    + `<div id="ana-desk-hist-plan-preview-wrap" class="ana-desk-hist-plan-preview-wrap${showPreview ? '' : ' is-hidden'}">`
    + `<div id="ana-desk-hist-plan-preview" class="ana-desk-hist-plan-preview"></div>`
    + `</div>`
    + `<div id="ana-desk-hist-plan-defects-host" class="ana-desk-hist-plan-defects-host">${buildAggTableHtml(tableItems, tableHead)}</div>`
    + `</div>`;

  // No detail-head above: cascade top aligns with preview chrome top.
  host.innerHTML = `<div class="ana-desk-hist-detail ana-desk-hist-detail--plans">`
    + `<div class="ana-desk-hist-plan-workspace ana-desk-hist-plan-workspace--cascade">`
    + cascade.html
    + stage
    + `</div></div>`;

  if (keepPreview) {
    const nextHost = document.getElementById('ana-desk-hist-plan-preview');
    if (nextHost) {
      nextHost.innerHTML = '';
      nextHost.appendChild(liveOverlay);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          try {
            const pp = window.RbiPlanPanzoom;
            const pz = liveOverlay._qpinPanzoom;
            const wrap = liveOverlay.querySelector('[data-qpin-wrap]');
            const st = liveOverlay.querySelector('[data-qpin-stage]');
            if (pp && pz && wrap && st) pp.center(pz, wrap, st);
          } catch (_eKeep) { /* ignore */ }
        });
      });
    }
  } else if (showPreview) {
    mountSelectedFloorPreview(selFloor);
  }
}

/* ─── Public paint API ──────────────────────────────────────────────── */

export function paintHistoryContent(mode) {
  _bindHistoryDeskI18n();
  const m = mode || window.currentHistoryViewMode || 'checks';
  showDeskMode(m);
  // Object rail owns project selection on desktop — drop multifilter duplicate
  try {
    if (window.activeMultiFilters && window.activeMultiFilters.history) {
      window.activeMultiFilters.history.project = [];
    }
    const projBtn = document.getElementById('btn-hist-project');
    const span = projBtn && projBtn.querySelector('span.truncate');
    if (span) span.textContent = _t('quality.history.rail.all_objects', 'Все объекты');
  } catch (_) { /* ignore */ }
  if (m === 'reports') paintDeskReports();
  else if (m === 'plans') paintDeskPlans();
  else paintDeskChecks();
}

export function ensureHistoryDeskContainers(stage) {
  return ensureDeskStage(stage);
}

export function clearHistoryDeskPanels() {
  Object.keys(DESK_IDS).forEach((m) => {
    const el = document.getElementById(DESK_IDS[m]);
    if (el) el.remove();
  });
  ['history-checks-view', 'history-reports-view', 'history-plans-view'].forEach((id) => {
    const v = document.getElementById(id);
    if (v) v.classList.remove('ana-desk-hist-mobile-hide');
  });
  _deskPlansFloorItems = new Map();
  _deskPlansFloorLabels = new Map();
  _deskChecksProject = 'ALL';
  _deskReportsProject = 'ALL';
  _deskPlansProject = 'ALL';
  _deskPlansSelectedFloor = null;
  _deskPlansExpanded = new Set();
  _deskChecksSort = { key: 'date', dir: 'desc' };
}

export function bindHistoryDeskEvents() {
  if (_deskHistBound) return;
  _deskHistBound = true;
  _bindHistoryDeskI18n();

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;

    const objBtn = t.closest('[data-ana-desk-obj]');
    if (objBtn) {
      e.preventDefault();
      const kind = objBtn.getAttribute('data-ana-desk-obj');
      const id = objBtn.getAttribute('data-ana-desk-obj-id') || 'ALL';
      if (kind === 'checks') {
        _deskChecksProject = id;
        paintDeskChecks();
      } else if (kind === 'reports') {
        _deskReportsProject = id;
        paintDeskReports();
      } else if (kind === 'plans') {
        _deskPlansProject = id;
        paintDeskPlans();
      }
      return;
    }

    const sortBtn = t.closest('[data-ana-desk-sort]');
    if (sortBtn) {
      e.preventDefault();
      const key = sortBtn.getAttribute('data-ana-desk-sort');
      if (!CHECK_SORT_KEYS.includes(key)) return;
      if (_deskChecksSort.key === key) {
        _deskChecksSort = { key, dir: _deskChecksSort.dir === 'asc' ? 'desc' : 'asc' };
      } else {
        _deskChecksSort = { key, dir: key === 'date' || key === 'urk' ? 'desc' : 'asc' };
      }
      paintDeskChecks();
      return;
    }

    const more = t.closest('[data-ana-desk-report-more]');
    if (more) {
      e.preventDefault();
      e.stopPropagation();
      const id = more.getAttribute('data-ana-desk-report-more');
      const title = more.getAttribute('data-title') || '';
      const isOwner = more.getAttribute('data-owner') === '1';
      if (typeof window.openUniversalActionSheet === 'function') {
        window.openUniversalActionSheet(id, 'report', title, isOwner);
      }
      return;
    }

    const file = t.closest('.ana-desk-hist-file');
    if (file && !t.closest('input, button')) {
      e.preventDefault();
      const id = file.getAttribute('data-report-id');
      if (id && typeof window.openReport === 'function') window.openReport(id);
      return;
    }

    const accBtn = t.closest('[data-ana-desk-acc]');
    if (accBtn) {
      e.preventDefault();
      e.stopPropagation();
      const key = accBtn.getAttribute('data-ana-desk-acc');
      if (!key) return;
      const body = document.querySelector(`[data-ana-desk-acc-body="${key}"]`);
      const open = accBtn.classList.contains('is-open');
      if (open) {
        accBtn.classList.remove('is-open');
        accBtn.setAttribute('aria-expanded', 'false');
        if (body) body.classList.add('is-collapsed');
        _deskPlansExpanded.delete(key);
        _deskPlansExpanded.add('!' + key);
      } else {
        accBtn.classList.add('is-open');
        accBtn.setAttribute('aria-expanded', 'true');
        if (body) body.classList.remove('is-collapsed');
        _deskPlansExpanded.delete('!' + key);
        _deskPlansExpanded.add(key);
      }
      return;
    }

    const grp = t.closest('[data-ana-desk-grp]');
    if (grp) {
      e.preventDefault();
      const key = grp.getAttribute('data-ana-desk-grp');
      const body = grp.parentElement && grp.parentElement.nextElementSibling;
      if (!key || !body) return;
      const open = grp.getAttribute('aria-expanded') !== 'true';
      if (key.startsWith('r:')) {
        if (open) { _deskReportsOpen.add(key); _deskReportsOpen.delete('!' + key); }
        else { _deskReportsOpen.delete(key); _deskReportsOpen.add('!' + key); }
      } else if (open) _deskChecksOpen.add(key); else _deskChecksOpen.delete(key);
      grp.setAttribute('aria-expanded', open ? 'true' : 'false');
      body.hidden = !open;
      return;
    }

    const openCheck = t.closest('[data-ana-desk-open-check]');
    if (openCheck) {
      e.preventDefault();
      const id = openCheck.getAttribute('data-ana-desk-open-check');
      if (id && typeof window.showHistoryDetail === 'function') window.showHistoryDetail(id);
      return;
    }

    const plansAll = t.closest('[data-ana-desk-plans-all]');
    if (plansAll) {
      e.preventDefault();
      e.stopPropagation();
      _deskPlansSelectedFloor = null;
      _deskPlansProject = 'ALL';
      paintDeskPlans();
      return;
    }

    const floor = t.closest('[data-ana-desk-floor]');
    if (floor) {
      e.preventDefault();
      e.stopPropagation();
      const floorId = floor.getAttribute('data-ana-desk-floor');
      if (!floorId) return;
      _deskPlansSelectedFloor = String(floorId);
      _deskPlansProject = 'FLOOR';
      paintDeskPlans();
      return;
    }

    if (t.id === 'ana-desk-reports-select-all') {
      return; // handled on change
    }
  }, true);

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t) return;
    // P2-0026: галочка группы — отметить/снять все проверки группы (и вложенные группы)
    if (t.matches && t.matches('[data-ana-desk-grp-cb]')) {
      const body = t.parentElement && t.parentElement.nextElementSibling;
      if (body) body.querySelectorAll('.hist-checkbox, .report-checkbox, [data-ana-desk-grp-cb]').forEach((el) => { el.checked = !!t.checked; });
      return;
    }
    if (t.id === 'ana-desk-reports-select-all') {
      const on = !!t.checked;
      document.querySelectorAll('#ana-desk-hist-reports .report-checkbox, #ana-desk-hist-reports [data-ana-desk-grp-cb]').forEach((el) => {
        el.checked = on;
      });
    }
  }, true);
}
