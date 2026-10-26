/**
 * sk.desktop.content.js
 * Desktop-only ПК СК builders (dashboard / volumes / hr).
 * Mobile sk.render / sk.actions stay untouched.
 */

const PANEL_ID = 'ana-desk-sk-panel';
const RU_COLLATOR = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });

let _deskSkContractor = 'ALL';
let _deskSkSection = 'overview'; // overview | isd | spatial | trend
let _deskSkBound = false;
let _deskHrSort = { key: 'kpi', dir: 'desc' };
let _deskMatrixSort = { key: 'total', dir: 'desc' };
let _deskTrendChart = null;

function _t(key, fallback, vars) {
  try {
    const i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
    if (i18n && typeof i18n.t === 'function') {
      const s = vars ? i18n.t(key, vars) : i18n.t(key);
      if (s && s !== key) return s;
    }
  } catch (_) { /* ignore */ }
  if (vars && fallback) {
    return String(fallback).replace(/\{(\w+)\}/g, (_m, k) => (
      vars[k] != null ? String(vars[k]) : ''
    ));
  }
  return fallback;
}

function _chartLocaleTag() {
  try {
    const i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
    const code = i18n && typeof i18n.getLocale === 'function' ? i18n.getLocale() : 'ru';
    if (code === 'en') return 'en-US';
    if (code === 'sr-Latn') return 'sr-Latn';
    if (code === 'ka') return 'ka-GE';
  } catch (_) { /* ignore */ }
  return 'ru-RU';
}

/** Display-only: data SoT stays RU ('Без подрядчика' / 'Без категории' / 'Объект'). */
function _deskDisplayContractor(name) {
  if (name === 'Без подрядчика') return _t('quality.sk.display.no_contractor', 'Без подрядчика');
  return name;
}

function _deskDisplayCategory(cat) {
  if (cat === 'Без категории') return _t('quality.sk.display.uncategorized', 'Без категории');
  return cat;
}

function _deskDisplayObject(name) {
  if (name === 'Объект') return _t('quality.sk.display.object', 'Объект');
  return name;
}

function deskSections() {
  return [
    { id: 'overview', label: _t('quality.sk.desk.section.overview', 'Обзор') },
    { id: 'isd', label: _t('quality.sk.desk.section.isd', 'ИСД') },
    { id: 'spatial', label: _t('quality.sk.desk.section.spatial', 'Этажи') },
    { id: 'trend', label: _t('quality.sk.desk.section.trend', 'Тренд') }
  ];
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function analyticsFilters() {
  try {
    if (window.RBI?.services?.analytics?.getAnalyticsFilters) {
      return window.RBI.services.analytics.getAnalyticsFilters();
    }
  } catch (_) { /* ignore */ }
  if (typeof activeMultiFilters !== 'undefined' && activeMultiFilters.analytics) {
    return activeMultiFilters.analytics;
  }
  return { project: [], contractor: [], inspector: [], template: [] };
}

function isIssueOpen(record) {
  if (!record) return false;
  if (record.is_verified_closed === true) return false;
  if (record.status_normalized === 'verified') return false;
  const s = String(record.status || record.status_raw || '').toLowerCase().trim();
  return s !== 'проверено';
}

function getFilteredSkRecords(opts) {
  opts = opts || {};
  let arr = Array.isArray(window.skRecords) ? window.skRecords.slice() : [];
  if (window.analyticsDataMode === 'cloud') {
    arr = arr.filter((r) => r.source === 'cloud' || r.syncStatus === 'synced' || r.sync_status === 'synced');
  }

  // Тренд — за всё время; остальные секции уважают global-filter-period.
  if (!opts.ignorePeriod) {
    const selPeriod = document.getElementById('global-filter-period')?.value || 'D30';
    const now = new Date();
    const periodNorm = typeof window.normalizeAnalyticsPeriod === 'function'
      ? window.normalizeAnalyticsPeriod(selPeriod)
      : selPeriod;
    const periodDays = typeof window.getAnalyticsPeriodDays === 'function'
      ? window.getAnalyticsPeriodDays(selPeriod)
      : null;

    if (periodNorm === 'CUSTOM') {
      const dFrom = document.getElementById('filter-date-from')?.value;
      const dTo = document.getElementById('filter-date-to')?.value;
      if (dFrom) arr = arr.filter((r) => r.date_issued && new Date(r.date_issued) >= new Date(dFrom));
      if (dTo) {
        const tDate = new Date(dTo);
        tDate.setHours(23, 59, 59, 999);
        arr = arr.filter((r) => r.date_issued && new Date(r.date_issued) <= tDate);
      }
    } else if (periodDays) {
      const fromP = new Date(now);
      fromP.setDate(now.getDate() - periodDays);
      arr = arr.filter((r) => r.date_issued && new Date(r.date_issued) >= fromP);
    }
  }

  const f = analyticsFilters();
  if (f.project?.length) {
    arr = arr.filter((r) => f.project.includes(r.project_display_name)
      || f.project.includes(r.project_canonical_key)
      || f.project.includes(r.display_name));
  }
  if (f.contractor?.length) {
    arr = arr.filter((r) => f.contractor.includes(r.contractor_name)
      || f.contractor.includes(r.contractor_canonical_key)
      || f.contractor.includes(r.contractor));
  }
  if (f.inspector?.length) {
    arr = arr.filter((r) => f.inspector.includes(r.issued_by) || f.inspector.includes(r.inspector));
  }
  if (f.template?.length) {
    const fTmpl = f.template.map((t) => String(t).toLowerCase());
    arr = arr.filter((r) => fTmpl.includes(String(r.category || '').toLowerCase()));
  }
  return arr;
}

function normalizeDefectText(text) {
  let clean = String(text || '').toLowerCase().trim();
  clean = clean.replace(/(в осях|оси|отм\.|на отметке|кв\.|квартира)[\s\dа-яa-z.\-,+]+/g, '');
  clean = clean.replace(/\d+[.,]\d+[.,]\d+/g, '').replace(/\d+/g, '');
  clean = clean.replace(/согласно ппр|согласно рд|по проекту|нарушение/g, '').trim();
  if (clean.length < 5) clean = String(text || '').substring(0, 100);
  return clean.charAt(0).toUpperCase() + clean.slice(1, 120) + (clean.length > 120 ? '...' : '');
}

function buildContrMap(records) {
  const map = {};
  let totalIssues = 0;
  let totalOpen = 0;
  const matrixMap = {};
  const standardsMap = {};

  records.forEach((r) => {
    if (Array.isArray(r.standards)) {
      r.standards.forEach((std) => {
        standardsMap[std] = (standardsMap[std] || 0) + 1;
      });
    }
    const c = r.contractor || 'Без подрядчика';
    totalIssues++;
    const open = isIssueOpen(r);
    if (open) totalOpen++;

    if (!map[c]) {
      map[c] = {
        total: 0,
        open: 0,
        overdueCount: 0,
        defects: {},
        overdueDaysArr: [],
        closedCount: 0,
        closedOnTimeCount: 0
      };
    }
    const data = map[c];
    data.total++;
    if (open) data.open++;

    if (r.text) {
      const key = normalizeDefectText(r.text);
      data.defects[key] = (data.defects[key] || 0) + 1;
    }

    const issued = r.date_issued ? new Date(r.date_issued) : null;
    const deadline = r.deadline ? new Date(r.deadline) : null;
    const resolved = r.date_resolved ? new Date(r.date_resolved) : null;
    const nowD = new Date();
    if (deadline) {
      if (open && nowD > deadline) {
        data.overdueCount++;
        data.overdueDaysArr.push(Math.ceil((nowD - deadline) / 86400000));
      } else if (!open && resolved && resolved > deadline) {
        data.overdueCount++;
        data.overdueDaysArr.push(Math.ceil((resolved - deadline) / 86400000));
      }
    }
    if (!open) {
      data.closedCount++;
      if (!deadline || !resolved || resolved <= deadline) data.closedOnTimeCount++;
    }

    const effectiveCategory = r.category_corrected && r.ai_category ? r.ai_category : r.category;
    const rawCats = effectiveCategory
      ? String(effectiveCategory).split(',').map((s) => s.trim()).filter(Boolean)
      : ['Без категории'];
    rawCats.forEach((raw) => {
      const cleanCat = raw.replace(/^\d+[.,]\s*/, '').trim() || 'Без категории';
      const matrixKey = c + '_||_' + cleanCat;
      if (!matrixMap[matrixKey]) {
        matrixMap[matrixKey] = { contractor: c, category: cleanCat, total: 0, open: 0, overdue: 0 };
      }
      matrixMap[matrixKey].total++;
      if (open) matrixMap[matrixKey].open++;
      if (deadline) {
        if (open && nowD > deadline) matrixMap[matrixKey].overdue++;
        else if (!open && resolved && resolved > deadline) matrixMap[matrixKey].overdue++;
      }
    });
  });

  return { map, totalIssues, totalOpen, matrixMap, standardsMap };
}

function contractorMetrics(data) {
  const overduePerc = data.total > 0 ? Math.round((data.overdueCount / data.total) * 100) : 0;
  const avgOverdueDepth = data.overdueDaysArr.length > 0
    ? Math.round(data.overdueDaysArr.reduce((a, b) => a + b, 0) / data.overdueDaysArr.length)
    : 0;
  const onTimePerc = data.closedCount > 0
    ? Math.round((data.closedOnTimeCount / data.closedCount) * 100)
    : 100;
  let cmi = 0;
  if (data.total > 0) {
    cmi = Math.round((onTimePerc * 0.6) + ((100 - overduePerc) * 0.4) - Math.min(avgOverdueDepth, 30));
    cmi = Math.max(0, Math.min(100, cmi));
    if (data.closedCount === 0 && data.overdueCount === 0) cmi = 100;
  }
  return { overduePerc, avgOverdueDepth, onTimePerc, cmi };
}

function ensureSkDeskContainers(stage) {
  if (!stage) return null;
  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'ana-desk-sk-panel';
    stage.appendChild(panel);
  }
  return panel;
}

function clearSkDeskPanels() {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  const stage = panel.parentElement;
  ['sk-view-dashboard', 'sk-view-volumes', 'sk-view-hr'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && panel.contains(el) && stage) stage.appendChild(el);
  });
  panel.remove();
}

function stashMobileViews(stage) {
  ['sk-view-dashboard', 'sk-view-volumes', 'sk-view-hr'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('ana-desk-sk-mobile-hide', 'hidden');
    if (stage && el.parentElement !== stage) stage.appendChild(el);
  });
}

function flattenSkHosted(root) {
  if (!root) return;
  root.querySelectorAll('details').forEach((d) => {
    d.open = true;
    d.classList.add('ana-desk-sk-flat');
  });
}

function hostMobileView(detail, viewId, renderFnName) {
  if (!detail) return null;
  const stage = document.querySelector('#sub-sk.ana-desk-sk .ana-desk-sk-stage');
  // Park views on stage before any re-entrant paint can wipe panel.innerHTML
  stashMobileViews(stage);

  const view = document.getElementById(viewId);
  if (!view) return null;

  view.classList.remove('ana-desk-sk-mobile-hide');

  // Prevent wrap(sk_render*) → paintSkDesktop re-entry while we host
  const prevGuard = window.__anaDeskSkPainting;
  window.__anaDeskSkPainting = true;
  try {
    if (typeof window[renderFnName] === 'function') {
      try { window[renderFnName](); } catch (err) {
        console.warn('[AnalyticsDesktop] ' + renderFnName, err);
      }
    }
  } finally {
    window.__anaDeskSkPainting = prevGuard;
  }

  // Re-query: nested paint may have replaced the detail node
  const liveDetail = document.querySelector('#sub-sk.ana-desk-sk [data-sk-desk-detail]') || detail;
  liveDetail.classList.add('ana-desk-sk-host');
  Array.prototype.slice.call(liveDetail.children).forEach((ch) => {
    if (ch.id !== viewId) ch.remove();
  });
  const liveView = document.getElementById(viewId) || view;
  if (!liveView) return null;
  liveView.classList.remove('hidden', 'ana-desk-sk-mobile-hide');
  if (liveView.parentElement !== liveDetail) liveDetail.appendChild(liveView);
  flattenSkHosted(liveView);
  return liveView;
}

function railHtml(contractors, selected, totalAll) {
  const allOn = selected === 'ALL' ? ' is-on' : '';
  let html = '<div class="ana-desk-sk-rail-list">'
    + `<button type="button" class="ana-desk-sk-obj${allOn}" data-sk-desk-contractor="ALL">`
    + `<span class="ana-desk-sk-obj-name">${esc(_t('quality.sk.desk.rail.all_contractors', 'Все подрядчики'))}</span>`
    + `<span class="ana-desk-sk-obj-count">${totalAll}</span></button>`;
  contractors.forEach(({ name, total }) => {
    const on = selected === name ? ' is-on' : '';
    const shown = _deskDisplayContractor(name);
    html += `<button type="button" class="ana-desk-sk-obj${on}" data-sk-desk-contractor="${esc(name)}">`
      + `<span class="ana-desk-sk-obj-name" title="${esc(shown)}">${esc(shown)}</span>`
      + `<span class="ana-desk-sk-obj-count">${total}</span></button>`;
  });
  html += '</div>';
  return html;
}

function kpiStrip(items) {
  return '<div class="ana-desk-sk-kpi">'
    + items.map((it) => ''
      + '<div class="ana-desk-sk-kpi-item">'
      + `<div class="ana-desk-sk-kpi-label">${esc(it.label)}</div>`
      + `<div class="ana-desk-sk-kpi-val${it.bad ? ' is-bad' : ''}">${esc(it.value)}</div>`
      + '</div>').join('')
    + '</div>';
}

function sectionPillsHtml(active) {
  return `<div class="ana-desk-sk-sec-pills" role="tablist" aria-label="${esc(_t('quality.sk.desk.sections_aria', 'Раздел дашборда'))}">`
    + deskSections().map((s) => ''
      + `<button type="button" class="ana-desk-sk-sec${active === s.id ? ' is-on' : ''}" data-sk-desk-section="${s.id}">`
      + `${esc(s.label)}</button>`).join('')
    + '</div>';
}

function scopeRecords(records, selected) {
  if (!selected || selected === 'ALL') return records || [];
  return (records || []).filter((r) => (r.contractor || 'Без подрядчика') === selected);
}

function buildSpatialMap(records) {
  const spatialMap = {};
  (records || []).forEach((r) => {
    if (!r.block || !r.floor || r.canonical_key === 'unknown') return;
    const objKey = r.display_name || r.project_display_name || 'Объект';
    if (!spatialMap[objKey]) spatialMap[objKey] = {};
    if (!spatialMap[objKey][r.block]) spatialMap[objKey][r.block] = {};
    if (!spatialMap[objKey][r.block][r.floor]) {
      spatialMap[objKey][r.block][r.floor] = { total: 0, open: 0, overdue: 0 };
    }
    const cell = spatialMap[objKey][r.block][r.floor];
    cell.total++;
    if (isIssueOpen(r)) cell.open++;
    const deadline = r.deadline ? new Date(r.deadline) : null;
    if (deadline && isIssueOpen(r) && new Date() > deadline) cell.overdue++;
  });
  return spatialMap;
}

function renderSpatialHtml(spatialMap) {
  const keys = Object.keys(spatialMap);
  if (!keys.length) {
    return `<div class="ana-desk-sk-empty">${esc(_t('quality.sk.desk.spatial.empty', 'Нет данных о блоках/этажах. Проверьте колонку «Элемент структуры» при импорте.'))}</div>`;
  }
  let html = '';
  keys.forEach((objKey) => {
    const shownObj = _deskDisplayObject(objKey);
    html += `<div class="ana-desk-sk-card"><div class="ana-desk-sk-card-title">🏢 ${esc(shownObj)}</div>`;
    Object.keys(spatialMap[objKey]).sort().forEach((blockName) => {
      const blockData = spatialMap[objKey][blockName];
      const floors = Object.keys(blockData).sort((a, b) => {
        const nA = parseInt(a, 10);
        const nB = parseInt(b, 10);
        return (!Number.isNaN(nA) && !Number.isNaN(nB)) ? nB - nA : RU_COLLATOR.compare(a, b);
      });
      const rows = floors.map((floor) => {
        const cell = blockData[floor];
        let tone = '';
        if (cell.total > 15) tone = ' is-hot';
        else if (cell.total > 5) tone = ' is-warm';
        return `<tr><td class="text-center">${esc(_t('quality.sk.spatial.floor', 'Эт. {floor}', { floor }))}</td>`
          + `<td class="text-center ana-desk-sk-floor-n${tone}">${cell.total}</td>`
          + `<td class="text-center">${esc(_t('quality.sk.desk.spatial.open_abbr', 'О:'))} ${cell.open} · <span class="${cell.overdue > 0 ? 'text-red-600' : ''}">${esc(_t('quality.sk.desk.spatial.overdue_abbr', 'П:'))} ${cell.overdue}</span></td></tr>`;
      }).join('');
      html += `<div class="ana-desk-sk-block"><div class="ana-desk-sk-block-title">${esc(blockName)}</div>`
        + '<div class="ana-desk-sk-table-wrap"><table class="ana-desk-sk-table"><thead><tr>'
        + `<th>${esc(_t('quality.sk.spatial.level', 'Уровень'))}</th>`
        + `<th>${esc(_t('quality.sk.desk.th.total', 'Всего'))}</th>`
        + `<th>${esc(_t('quality.sk.desk.spatial.open_overdue', 'Открыто / Проср.'))}</th></tr></thead><tbody>`
        + rows + '</tbody></table></div></div>';
    });
    html += '</div>';
  });
  return html;
}

function renderIsdTable(matrixMap, selected) {
  let rows = Object.values(matrixMap || {});
  if (selected && selected !== 'ALL') {
    rows = rows.filter((r) => r.contractor === selected);
  }
  const mk = _deskMatrixSort.key;
  const md = _deskMatrixSort.dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const va = a[mk];
    const vb = b[mk];
    if (typeof va === 'string' || typeof vb === 'string') {
      return RU_COLLATOR.compare(String(va), String(vb)) * (md < 0 ? -1 : 1);
    }
    return (va - vb) * md;
  });
  rows = rows.slice(0, 100);
  if (!rows.length) {
    return `<div class="ana-desk-sk-empty">${esc(_t('quality.sk.desk.isd.empty', 'Нет данных для матрицы ИСД'))}</div>`;
  }
  const mark = (key) => (_deskMatrixSort.key === key
    ? (_deskMatrixSort.dir === 'desc' ? ' ▼' : ' ▲')
    : '');
  const showContr = !selected || selected === 'ALL';
  return '<div class="ana-desk-sk-table-wrap"><table class="ana-desk-sk-table"><thead><tr>'
    + (showContr
      ? `<th data-sk-matrix-sort="contractor" class="${_deskMatrixSort.key === 'contractor' ? 'is-on' : ''}">${esc(_t('quality.sk.desk.th.contractor', 'Подрядчик'))}${mark('contractor')}</th>`
      : '')
    + `<th data-sk-matrix-sort="category" class="${_deskMatrixSort.key === 'category' ? 'is-on' : ''}">${esc(_t('quality.sk.desk.th.work_type', 'Вид работ'))}${mark('category')}</th>`
    + `<th data-sk-matrix-sort="total" class="${_deskMatrixSort.key === 'total' ? 'is-on' : ''}">${esc(_t('quality.sk.desk.th.total', 'Всего'))}${mark('total')}</th>`
    + `<th data-sk-matrix-sort="open" class="${_deskMatrixSort.key === 'open' ? 'is-on' : ''}">${esc(_t('quality.sk.desk.th.open', 'Открыто'))}${mark('open')}</th>`
    + `<th data-sk-matrix-sort="overdue" class="${_deskMatrixSort.key === 'overdue' ? 'is-on' : ''}">${esc(_t('quality.sk.desk.th.overdue_short', 'Проср.'))}${mark('overdue')}</th>`
    + '</tr></thead><tbody>'
    + rows.map((r) => {
      const cShown = _deskDisplayContractor(r.contractor);
      const catShown = _deskDisplayCategory(r.category);
      return '<tr>'
        + (showContr ? `<td title="${esc(cShown)}">${esc(cShown)}</td>` : '')
        + `<td>${esc(catShown)}</td><td>${r.total}</td><td>${r.open}</td><td>${r.overdue}</td></tr>`;
    }).join('')
    + '</tbody></table></div>';
}

function paintTrendChart(records) {
  const canvas = document.getElementById('ana-desk-sk-trend-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const monthsSet = new Set();
  (records || []).forEach((r) => {
    if (r.date_issued) {
      const d = new Date(r.date_issued);
      monthsSet.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
    if (r.date_resolved) {
      const d = new Date(r.date_resolved);
      monthsSet.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
  });
  const sortedMonths = Array.from(monthsSet).sort();
  const labels = [];
  const dataOpen = [];
  const dataNew = [];
  const dataOverdue = [];
  const dataClosed = [];
  const dataCum = [];
  sortedMonths.forEach((mKey) => {
    const parts = mKey.split('-');
    const year = parts[0];
    const month = parts[1];
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);
    const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0);
    labels.push(endOfMonth.toLocaleString(_chartLocaleTag(), { month: 'short', year: '2-digit' }));
    let openCount = 0;
    let newCount = 0;
    let overdueCount = 0;
    let closedCount = 0;
    let cumCount = 0;
    (records || []).forEach((r) => {
      if (!r.date_issued) return;
      const issued = new Date(r.date_issued);
      if (issued > endOfMonth) return;
      const resolved = r.date_resolved ? new Date(r.date_resolved) : null;
      const deadline = r.deadline ? new Date(r.deadline) : null;
      const openAtEom = !resolved || resolved > endOfMonth;
      cumCount++;
      if (issued >= startOfMonth && issued <= endOfMonth) newCount++;
      if (openAtEom) {
        openCount++;
        if (deadline && deadline < endOfMonth) overdueCount++;
      }
      if (resolved && resolved <= endOfMonth) closedCount++;
    });
    dataOpen.push(openCount);
    dataNew.push(newCount);
    dataOverdue.push(overdueCount);
    dataClosed.push(closedCount);
    dataCum.push(cumCount);
  });
  if (_deskTrendChart) {
    try { _deskTrendChart.destroy(); } catch (_) { /* ignore */ }
    _deskTrendChart = null;
  }
  if (window.skTrendChartInstance) {
    try { window.skTrendChartInstance.destroy(); } catch (_) { /* ignore */ }
    window.skTrendChartInstance = null;
  }
  _deskTrendChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: _t('quality.sk.chart.open_eom', 'Открыто на конец мес.'),
          data: dataOpen,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          borderWidth: 2,
          pointRadius: 3,
          fill: true,
          tension: 0.3
        },
        {
          label: _t('quality.sk.chart.overdue_eom', 'Просрочено на конец мес.'),
          data: dataOverdue,
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 3,
          fill: false,
          tension: 0.3
        },
        {
          label: _t('quality.sk.chart.closed_eom', 'Закрыто на конец мес.'),
          data: dataClosed,
          borderColor: '#22c55e',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 3,
          fill: false,
          tension: 0.3
        },
        {
          label: _t('quality.sk.chart.new_issued', 'Выдано новых'),
          data: dataNew,
          borderColor: '#6366f1',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 3,
          fill: false,
          tension: 0.3
        },
        {
          label: _t('quality.sk.chart.cumulative', 'Накоплено выдано'),
          data: dataCum,
          borderColor: '#64748b',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [2, 4],
          pointRadius: 2,
          fill: false,
          tension: 0.25
        }
      ]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { boxWidth: 10, font: { size: 10 }, padding: 10 }
        }
      },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderOverviewBody(pack, selected, scopedRecords) {
  if (selected !== 'ALL' && pack.map[selected]) {
    const data = pack.map[selected];
    const m = contractorMetrics(data);
    const topDefects = Object.keys(data.defects)
      .map((text) => ({ text, count: data.defects[text] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const safeId = selected.replace(/[^a-zA-Zа-яА-Я0-9]/g, '');
    const safeCName = selected.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const defectsHtml = topDefects.length
      ? topDefects.map((d) => ''
        + `<div class="ana-desk-sk-defect"><span class="ana-desk-sk-defect-n">${d.count}</span>`
        + `<span>${esc(d.text)}</span></div>`).join('')
      : `<div class="text-[11px] text-slate-400 font-bold">${esc(_t('quality.sk.desk.defects_empty', 'Повторов не найдено'))}</div>`;
    return kpiStrip([
      { label: _t('quality.sk.desk.kpi.total', 'Всего'), value: data.total },
      { label: _t('quality.sk.desk.kpi.open', 'Открыто'), value: data.open, bad: data.open > 0 },
      { label: _t('quality.sk.desk.kpi.overdue', 'Просрочка'), value: m.overduePerc + '%', bad: m.overduePerc > 20 },
      { label: _t('quality.sk.desk.kpi.cmi', 'CMI'), value: m.cmi }
    ])
      + `<div class="ana-desk-sk-card"><div class="ana-desk-sk-card-title">${esc(_t('quality.sk.desk.metrics_title', 'Метрики закрытия'))} `
      + '<button type="button" class="text-indigo-400 ml-1" onclick="sk_showInfoModal(\'cmi\')" title="CMI">❓</button></div>'
      + '<div class="grid grid-cols-3 gap-2 text-center">'
      + `<div><div class="ana-desk-sk-kpi-label">${esc(_t('quality.sk.cmi.on_time', 'В срок'))}</div><div class="text-lg font-black">${m.onTimePerc}%</div></div>`
      + `<div><div class="ana-desk-sk-kpi-label">${esc(_t('quality.sk.cmi.depth', 'Глубина'))}</div><div class="text-lg font-black">${esc(_t('quality.sk.cmi.days', '{n} дн.', { n: m.avgOverdueDepth }))}</div></div>`
      + `<div><div class="ana-desk-sk-kpi-label">${esc(_t('quality.sk.desk.kpi.cmi', 'CMI'))}</div><div class="text-lg font-black">${m.cmi}</div></div>`
      + '</div></div>'
      + `<div class="ana-desk-sk-card"><div class="ana-desk-sk-card-title">${esc(_t('quality.sk.desk.defects_title', 'Типовые дефекты'))}</div>`
      + defectsHtml + '</div>'
      + `<button type="button" id="btn-sk-ai-${safeId}" class="w-full bg-indigo-600 text-white py-3 rounded-xl text-[10px] font-black uppercase shadow-md"
          onclick="window.RBI && window.RBI.services && window.RBI.services.ai && window.RBI.services.ai.sk_generateContractorAiSummary('${safeCName}', '${safeId}')">`
      + `${esc(_t('quality.sk.ai.analyze', '🤖 AI-Анализ и Письмо прорабу'))}</button>`
      + `<div id="sk-ai-res-${safeId}" class="hidden mt-3 p-3 bg-white border border-indigo-200 rounded-xl text-[11px] leading-relaxed"></div>`;
  }

  // ALL overview — KPI + standards only (deep dives via section pills)
  const standards = Object.keys(pack.standardsMap || {})
    .sort((a, b) => pack.standardsMap[b] - pack.standardsMap[a])
    .slice(0, 10);
  const stdHtml = standards.length
    ? '<div class="flex flex-wrap gap-2">'
      + standards.map((s) => ''
        + `<span class="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg text-[11px] font-black text-blue-700">`
        + `${esc(s)}<span class="text-[9px] bg-white text-slate-500 px-1.5 rounded border">${pack.standardsMap[s]}</span></span>`).join('')
      + '</div>'
    : `<div class="text-[11px] text-slate-400 font-bold">${esc(_t('quality.sk.desk.standards_empty', 'Ссылок на нормативы нет'))}</div>`;

  const topContr = Object.keys(pack.map)
    .map((name) => ({ name, total: pack.map[name].total, open: pack.map[name].open }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  const topHtml = topContr.length
    ? '<div class="ana-desk-sk-table-wrap"><table class="ana-desk-sk-table"><thead><tr>'
      + `<th>${esc(_t('quality.sk.desk.th.contractor', 'Подрядчик'))}</th>`
      + `<th>${esc(_t('quality.sk.desk.th.total', 'Всего'))}</th>`
      + `<th>${esc(_t('quality.sk.desk.th.open', 'Открыто'))}</th></tr></thead><tbody>`
      + topContr.map((c) => {
        const shown = _deskDisplayContractor(c.name);
        return `<tr class="ana-desk-sk-row-pick" data-sk-desk-contractor="${esc(c.name)}" style="cursor:pointer">`
          + `<td>${esc(shown)}</td><td>${c.total}</td><td>${c.open}</td></tr>`;
      }).join('')
      + '</tbody></table></div>'
    : `<div class="ana-desk-sk-empty">${esc(_t('quality.sk.desk.no_contractors', 'Нет подрядчиков'))}</div>`;

  return kpiStrip([
    { label: _t('quality.sk.desk.kpi.total', 'Всего'), value: pack.totalIssues },
    { label: _t('quality.sk.desk.kpi.open', 'Открыто'), value: pack.totalOpen, bad: pack.totalOpen > 0 },
    { label: _t('quality.sk.desk.kpi.contractors', 'Подрядчики'), value: Object.keys(pack.map).length },
    { label: _t('quality.sk.desk.kpi.records', 'Записей'), value: scopedRecords.length }
  ])
    + `<div class="ana-desk-sk-card"><div class="ana-desk-sk-card-title">${esc(_t('quality.sk.standards.title', 'Самые нарушаемые нормативы'))}</div>`
    + stdHtml + '</div>'
    + `<div class="ana-desk-sk-card"><div class="ana-desk-sk-card-title">${esc(_t('quality.sk.desk.top_contractors', 'Топ подрядчиков · клик откроет карточку'))}</div>`
    + topHtml + '</div>'
    + `<p class="text-[11px] text-slate-400 font-medium m-0">${esc(_t('quality.sk.desk.overview_hint', 'ИСД, этажи и тренд — отдельными вкладками выше (работают и для выбранного подрядчика).'))}</p>`;
}

function paintDashboardDetail(detail, pack, selected, allRecords) {
  const stage = document.querySelector('#sub-sk.ana-desk-sk .ana-desk-sk-stage');
  stashMobileViews(stage);

  const liveDetail = document.querySelector('#sub-sk.ana-desk-sk [data-sk-desk-detail]') || detail;
  liveDetail.classList.remove('ana-desk-sk-host');

  const isTrend = _deskSkSection === 'trend';
  const trendSource = isTrend
    ? getFilteredSkRecords({ ignorePeriod: true })
    : allRecords;
  const scoped = scopeRecords(isTrend ? trendSource : allRecords, selected);
  const scopedPack = selected === 'ALL'
    ? (isTrend ? buildContrMap(trendSource) : pack)
    : buildContrMap(scoped);

  if (!scoped.length && selected !== 'ALL') {
    liveDetail.innerHTML = `<div class="ana-desk-sk-empty">${esc(_t('quality.sk.desk.empty.contractor', 'Нет данных по подрядчику'))}</div>`;
    return;
  }
  if (!isTrend && !pack.totalIssues && selected === 'ALL') {
    liveDetail.innerHTML = `<div class="ana-desk-sk-empty">${esc(_t('quality.sk.desk.empty.period', 'Нет данных за период и фильтры'))}</div>`;
    return;
  }
  if (isTrend && !scoped.length) {
    liveDetail.innerHTML = `<div class="ana-desk-sk-empty">${esc(_t('quality.sk.desk.empty.trend', 'Нет данных для тренда'))}</div>`;
    return;
  }

  const title = selected === 'ALL'
    ? _t('quality.sk.desk.summary_title', 'Сводка по подрядчикам')
    : _deskDisplayContractor(selected);
  const countLabel = selected === 'ALL'
    ? _t('quality.sk.desk.count.orgs', '{orgs} орг. · {issues} зам.', {
      orgs: Object.keys(scopedPack.map).length,
      issues: scopedPack.totalIssues
    })
    : _t('quality.sk.desk.count.issues', '{n} замечаний', { n: scoped.length });

  let body = '';
  if (_deskSkSection === 'isd') {
    body = `<div class="ana-desk-sk-card"><div class="ana-desk-sk-card-title">${esc(_t('quality.sk.desk.isd.matrix_title', 'Матрица рисков (ИСД)'))} `
      + '<button type="button" class="text-indigo-400 ml-1" onclick="sk_showInfoModal(\'isd\')">❓</button></div>'
      + renderIsdTable(scopedPack.matrixMap, selected) + '</div>';
  } else if (_deskSkSection === 'spatial') {
    body = renderSpatialHtml(buildSpatialMap(scoped));
  } else if (isTrend) {
    body = `<div class="ana-desk-sk-card"><div class="ana-desk-sk-card-title">${esc(_t('quality.sk.trend.title', 'Тренд открытых замечаний'))}`
      + ` <span class="text-[10px] font-bold text-slate-400 normal-case tracking-normal">${esc(_t('quality.sk.trend.all_time', '· за всё время'))}</span></div>`
      + '<div class="ana-desk-sk-trend-wrap"><canvas id="ana-desk-sk-trend-chart"></canvas></div></div>';
  } else {
    body = renderOverviewBody(selected === 'ALL' ? pack : scopedPack, selected, scoped);
  }

  liveDetail.innerHTML = ''
    + '<div class="ana-desk-sk-detail-head">'
    + `<h3 class="ana-desk-sk-detail-title">${esc(title)}</h3>`
    + `<span class="ana-desk-sk-detail-count">${esc(countLabel)}</span></div>`
    + sectionPillsHtml(_deskSkSection)
    + '<div class="ana-desk-sk-sec-body">' + body + '</div>';

  if (isTrend) {
    requestAnimationFrame(() => {
      try { paintTrendChart(scoped); } catch (err) {
        console.warn('[AnalyticsDesktop] trend', err);
      }
    });
  }
}

function paintVolumesDetail(detail) {
  const vols = window.skVolumes || {};
  const keys = Object.keys(vols).sort((a, b) => RU_COLLATOR.compare(a, b));
  const rows = keys.length
    ? keys.map((workType) => {
      const v = vols[workType];
      const safe = String(workType).replace(/'/g, "\\'");
      return ''
        + `<div class="ana-desk-sk-vol-row">`
        + `<div class="font-bold text-[12px] text-slate-700 truncate" title="${esc(workType)}">${esc(workType)}</div>`
        + `<div class="text-center text-[11px] font-black">${esc(v.amount)} ${esc(v.unit)}</div>`
        + `<button type="button" class="text-red-500 bg-red-50 border border-red-200 w-8 h-8 rounded-lg flex items-center justify-center"
            onclick="Promise.resolve(sk_deleteVolume('${safe}')).then(function(){ if(window.__anaDeskPaintSk) window.__anaDeskPaintSk(); })" title="${esc(_t('quality.sk.desk.volumes.delete', 'Удалить'))}">×</button></div>`;
    }).join('')
    : `<div class="ana-desk-sk-empty">${esc(_t('quality.sk.desk.volumes.empty', 'Справочник пуст. Укажите объёмы для расчёта ИСД.'))}</div>`;

  detail.innerHTML = ''
    + '<div class="ana-desk-sk-detail-head">'
    + `<h3 class="ana-desk-sk-detail-title">${esc(_t('quality.sk.desk.volumes.title', 'Объёмы работ'))}</h3>`
    + `<span class="ana-desk-sk-detail-count">${esc(_t('quality.sk.desk.volumes.count', '{n} видов', { n: keys.length }))}</span></div>`
    + '<div class="ana-desk-sk-card">'
    + `<div class="ana-desk-sk-card-title">${esc(_t('quality.sk.desk.volumes.add', 'Добавить объём'))}</div>`
    + '<div class="ana-desk-sk-vol-form">'
    + `<input type="text" id="sk-vol-name" class="input-base text-[11px]" placeholder="${esc(_t('quality.sk.desk.volumes.name_ph', 'Вид работ'))}">`
    + `<input type="number" id="sk-vol-amount" class="input-base text-[11px]" placeholder="${esc(_t('quality.sk.desk.volumes.amount_ph', 'Кол-во'))}">`
    + `<input type="text" id="sk-vol-unit" class="input-base text-[11px] text-center" placeholder="${esc(_t('quality.sk.desk.volumes.unit_ph', 'Ед.'))}">`
    + `<button type="button" onclick="Promise.resolve(sk_addVolume()).then(function(){ if(window.__anaDeskPaintSk) window.__anaDeskPaintSk(); })" class="bg-green-50 text-green-700 border border-green-200 px-3 py-2 rounded-xl text-[10px] font-black uppercase">${esc(_t('quality.sk.volumes.save', 'Сохранить'))}</button>`
    + '</div></div>'
    + `<div class="ana-desk-sk-card"><div class="ana-desk-sk-card-title">${esc(_t('quality.sk.desk.volumes.dictionary', 'Справочник'))}</div>`
    + rows + '</div>';
}

function paintHrDetail(detail) {
  hostMobileView(detail, 'sk-view-hr', 'sk_renderHrTab');
  // Head hint above hosted table (if empty guest state, host still shows it)
  if (!detail.querySelector('.ana-desk-sk-detail-head') && detail.querySelector('#sk-view-hr')) {
    const head = document.createElement('div');
    head.className = 'ana-desk-sk-detail-head';
    head.innerHTML = `<h3 class="ana-desk-sk-detail-title">${esc(_t('quality.sk.desk.hr.title', 'Рейтинг инженеров СК'))}</h3>`
      + `<span class="ana-desk-sk-detail-count">${esc(_t('quality.sk.desk.hr.subtitle', 'динамика ▲▼ + AI-тренер'))}</span>`;
    detail.insertBefore(head, detail.firstChild);
  }
}

function paintSkContent(mode) {
  const stage = document.querySelector('#sub-sk.ana-desk-sk .ana-desk-sk-stage');
  if (!stage) return;
  const panel = ensureSkDeskContainers(stage);
  if (!panel) return;

  const m = mode || window.skCurrentSubTab || 'dashboard';

  // Park mobile views on stage BEFORE panel.innerHTML (innerHTML would destroy them)
  stashMobileViews(stage);

  const prevGuard = window.__anaDeskSkPainting;
  window.__anaDeskSkPainting = true;
  try {
  if (m === 'volumes') {
    panel.className = 'ana-desk-sk-panel';
    panel.innerHTML = '<div class="ana-desk-sk-detail" data-sk-desk-detail></div>';
    paintVolumesDetail(panel.querySelector('[data-sk-desk-detail]'));
    return;
  }

  if (m === 'hr') {
    panel.className = 'ana-desk-sk-panel';
    panel.innerHTML = '<div class="ana-desk-sk-detail ana-desk-sk-host" data-sk-desk-detail></div>';
    paintHrDetail(panel.querySelector('[data-sk-desk-detail]'));
    return;
  }

  // dashboard — master–detail
  const records = getFilteredSkRecords();
  const pack = buildContrMap(records);
  const contractors = Object.keys(pack.map)
    .map((name) => ({ name, total: pack.map[name].total }))
    .sort((a, b) => b.total - a.total);

  if (_deskSkContractor !== 'ALL' && !pack.map[_deskSkContractor]) {
    _deskSkContractor = 'ALL';
  }

  panel.className = 'ana-desk-sk-panel ana-desk-sk-split';
  panel.innerHTML = ''
    + '<aside class="ana-desk-sk-rail" data-sk-desk-rail></aside>'
    + '<div class="ana-desk-sk-detail" data-sk-desk-detail></div>';

  const rail = panel.querySelector('[data-sk-desk-rail]');
  const detail = panel.querySelector('[data-sk-desk-detail]');
  rail.innerHTML = railHtml(contractors, _deskSkContractor, pack.totalIssues);
  paintDashboardDetail(detail, pack, _deskSkContractor, records);
  } finally {
    window.__anaDeskSkPainting = prevGuard;
  }
}

function bindSkDeskEvents() {
  if (_deskSkBound) return;
  _deskSkBound = true;
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !document.getElementById('sub-sk')?.classList.contains('ana-desk-sk')) return;

    const secBtn = t.closest && t.closest('[data-sk-desk-section]');
    if (secBtn) {
      e.preventDefault();
      _deskSkSection = secBtn.getAttribute('data-sk-desk-section') || 'overview';
      try { paintSkContent('dashboard'); } catch (_) { /* ignore */ }
      return;
    }

    const contrBtn = t.closest && t.closest('[data-sk-desk-contractor]');
    if (contrBtn) {
      e.preventDefault();
      _deskSkContractor = contrBtn.getAttribute('data-sk-desk-contractor') || 'ALL';
      try { paintSkContent('dashboard'); } catch (_) { /* ignore */ }
      return;
    }

    const matrixTh = t.closest && t.closest('[data-sk-matrix-sort]');
    if (matrixTh) {
      e.preventDefault();
      const key = matrixTh.getAttribute('data-sk-matrix-sort');
      if (_deskMatrixSort.key === key) {
        _deskMatrixSort.dir = _deskMatrixSort.dir === 'desc' ? 'asc' : 'desc';
      } else {
        _deskMatrixSort = { key, dir: key === 'contractor' || key === 'category' ? 'asc' : 'desc' };
      }
      try { paintSkContent('dashboard'); } catch (_) { /* ignore */ }
      return;
    }

    const hrTh = t.closest && t.closest('[data-sk-hr-sort]');
    if (hrTh) {
      e.preventDefault();
      const key = hrTh.getAttribute('data-sk-hr-sort');
      if (_deskHrSort.key === key) {
        _deskHrSort.dir = _deskHrSort.dir === 'desc' ? 'asc' : 'desc';
      } else {
        _deskHrSort = { key, dir: key === 'name' ? 'asc' : 'desc' };
      }
      try { paintSkContent('hr'); } catch (_) { /* ignore */ }
    }
  }, true);
}

export {
  paintSkContent,
  ensureSkDeskContainers,
  clearSkDeskPanels,
  bindSkDeskEvents
};
