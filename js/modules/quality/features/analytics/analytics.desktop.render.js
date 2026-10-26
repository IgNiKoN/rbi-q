/**
 * analytics.desktop.render.js
 * Desktop Analytics (≥1280): зоны A→B→C→D (пульс → работа/таблица+detail →
 * контекст HTML → фото раскрыто по умолчанию). Mobile analytics.* не редактирует.
 * Стили: css/analytics.desktop.css (.rbi-analytics-desktop-wide).
 */

import {
  paintHistoryContent,
  ensureHistoryDeskContainers,
  clearHistoryDeskPanels,
  bindHistoryDeskEvents
} from './history.desktop.content.js';
import {
  paintSkContent,
  ensureSkDeskContainers,
  clearSkDeskPanels,
  bindSkDeskEvents
} from './sk.desktop.content.js';
import {
  paintScheduleContent,
  teardownScheduleDesktop
} from './schedule.desktop.content.js';
import {
  shouldScheduleDeskAfterTabPaint,
  deskDetailsOpenAttr,
  shouldRepaintDeskContextZones
} from '../../../../shared/sync-live-paint.policy.js';
import { buildRiskZonesInsight, formatRiskInsightDisplayHtml, isAutoRiskInsightText } from './analytics.risk-insight.js';

const DESKTOP_MIN = 1280;
const SHELL_ID = 'analytics-desktop-shell';
const TOP_ID = 'analytics-desktop-top';
const TOOLBAR_ID = 'analytics-desktop-toolbar';
const KPI_ID = 'analytics-desktop-kpi';
const WORK_ID = 'analytics-desktop-workspace';
const NOTE_ID = 'analytics-desktop-fallback-note';
const OP_TOGGLE_ID = 'ana-desk-op-mode-toggle';
const CSS_HREF = './css/analytics.desktop.css';
const WIDE_CLASS = 'rbi-analytics-desktop-wide';
const ORIG_ORDER = [
  'analytics-subtabs-block',
  'analytics-filters-block',
  'sub-contractors',
  'sub-onepager',
  'sub-schedule',
  'sub-sk',
  'sub-history'
];

let _resizeBound = false;
let _shellApplied = false;
let _hooksBound = false;
let _localeBound = false;
let _onResizeNavigate = null;
let _selectedContractor = null;
/** Desktop contractors table sort: key = name|urk|doc|rel|n|defects|stab */
let _deskContractorSort = { key: 'rel', dir: 'desc' };
const _deskCharts = {};

function _t(key, fallback, vars) {
  try {
    var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
    if (i18n && typeof i18n.t === 'function') {
      var s = vars ? i18n.t(key, vars) : i18n.t(key);
      if (s && s !== key) return s;
    }
  } catch (e) {}
  if (vars && fallback) {
    return String(fallback).replace(/\{(\w+)\}/g, function (_m, k) {
      return vars[k] != null ? String(vars[k]) : '';
    });
  }
  return fallback;
}

function _setSkBtnLabel(btn, text) {
  if (!btn) return;
  const svg = btn.querySelector('svg');
  btn.textContent = '';
  if (svg) btn.appendChild(svg);
  btn.appendChild(document.createTextNode(' ' + text));
}

/** Один отложенный afterTabPaint на волну (раньше 80+280 → двойной rebuild графиков Сводки). */
let _afterPaintTimer = null;
let _afterPaintTab = null;
function scheduleAfterTabPaint(tabId, delayMs) {
  _afterPaintTab = tabId;
  if (_afterPaintTimer) clearTimeout(_afterPaintTimer);
  _afterPaintTimer = setTimeout(() => {
    _afterPaintTimer = null;
    const tab = _afterPaintTab;
    _afterPaintTab = null;
    if (!tab) return;
    try { afterTabPaint(tab); } catch (_) { /* ignore */ }
  }, typeof delayMs === 'number' ? delayMs : 100);
}

function isDesktopViewport() {
  return typeof window !== 'undefined' && window.innerWidth >= DESKTOP_MIN;
}

function tabRoot() {
  return document.getElementById('tab-analytics');
}

function ensureMarkupMounted() {
  return !!tabRoot();
}

function ensureDesktopCss() {
  if (document.querySelector('link[data-analytics-desktop-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_HREF;
  link.setAttribute('data-analytics-desktop-css', '1');
  document.head.appendChild(link);
}

function setWideLayout(on) {
  ensureDesktopCss();
  const root = document.getElementById('app-root');
  const body = document.body;
  if (on) {
    if (root) root.classList.add(WIDE_CLASS);
    if (body) body.classList.add(WIDE_CLASS);
  } else {
    if (root) root.classList.remove(WIDE_CLASS);
    if (body) body.classList.remove(WIDE_CLASS);
  }
}

function placeSubtabsInShell(shell) {
  const subtabs = document.getElementById('analytics-subtabs-block');
  if (!subtabs || !shell) return;
  subtabs.classList.remove('max-w-4xl', 'mx-auto');
  subtabs.classList.add('w-full', 'max-w-none');
  // Leave topbar if previously mounted there
  const host = document.getElementById('desk-screen-tabs');
  if (host) {
    host.hidden = true;
    document.body.classList.remove('has-desk-screen-tabs');
  }
  if (subtabs.parentElement !== shell) {
    shell.insertBefore(subtabs, shell.firstChild);
  }
}

/** KPI scrolls with contractors content — first child of workspace. */
function placeKpiInWorkspace(shell) {
  const kpi = document.getElementById(KPI_ID);
  const work = document.getElementById(WORK_ID);
  if (!kpi || !work) return;
  if (kpi.parentElement === work && work.firstElementChild === kpi) return;
  work.insertBefore(kpi, work.firstChild);
}

function expandFiltersForDesktop() {
  const body = document.getElementById('analytics-panel-body');
  if (!body) return;
  body.style.maxHeight = 'none';
  body.style.overflow = 'visible';
  body.style.opacity = '1';
  body.style.margin = '';
  const icon = document.getElementById('analytics-panel-toggle-icon');
  if (icon) icon.style.transform = 'rotate(0deg)';
}

function winHasFn(name) {
  return typeof window[name] === 'function';
}

function winCall(name, ...args) {
  const fn = window[name];
  if (typeof fn === 'function') return fn(...args);
  return undefined;
}

function getFilteredData() {
  try {
    if (winHasFn('getFilteredAnalyticsData')) return winCall('getFilteredAnalyticsData') || [];
    const actions = window.AnalyticsActions;
    if (actions && typeof actions.getFilteredAnalyticsData === 'function') {
      return actions.getFilteredAnalyticsData() || [];
    }
  } catch (_) { /* ignore */ }
  return [];
}

function getTemplatesMap() {
  try {
    const svc = window.RBI && window.RBI.services && window.RBI.services.templates;
    if (svc && typeof svc.getUserTemplates === 'function') {
      return svc.getUserTemplates() || {};
    }
  } catch (_) { /* ignore */ }
  if (typeof window['getUserTemplates'] === 'function') return window['getUserTemplates']() || {};
  return window.userTemplates || {};
}

function escapeAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function destroyDeskCharts() {
  Object.keys(_deskCharts).forEach((k) => {
    try {
      if (_deskCharts[k] && typeof _deskCharts[k].destroy === 'function') _deskCharts[k].destroy();
    } catch (_) { /* ignore */ }
    delete _deskCharts[k];
  });
}

function paintDesktopCharts(data, model) {
  if (typeof window.Chart !== 'function') return;
  destroyDeskCharts();

  const chartOpts = {
    animation: false,
    responsive: true,
    maintainAspectRatio: false
  };

  try {
    const trendEl = document.getElementById('desk-chart-trend');
    if (trendEl && typeof window.buildTrendChartData === 'function') {
      const td = window.buildTrendChartData(data, 'TOTAL', [], 'WEEK');
      _deskCharts.trend = new window.Chart(trendEl.getContext('2d'), {
        type: 'line',
        data: td,
        options: {
          ...chartOpts,
          scales: { y: { min: 0, max: 100 } },
          plugins: { legend: { display: false } }
        }
      });
    }
  } catch (_) { /* ignore */ }

  try {
    const causesEl = document.getElementById('desk-chart-causes');
    if (causesEl && model) {
      let causesList = [];
      try {
        const insp = window.RBI && window.RBI.services && window.RBI.services.inspections;
        causesList = (insp && typeof insp.getDefectCausesSync === 'function' && insp.getDefectCausesSync())
          || (typeof DEFECT_CAUSES !== 'undefined' ? DEFECT_CAUSES : [])
          || [];
      } catch (_) { causesList = []; }
      const entries = Object.keys(model.causesCount || {})
        .map((code) => {
          const found = causesList.find((c) => c && c.code === code);
          return { name: ((found && found.name) || code).substring(0, 22), n: model.causesCount[code] };
        })
        .sort((a, b) => b.n - a.n)
        .slice(0, 8);
      if (entries.length) {
        _deskCharts.causes = new window.Chart(causesEl.getContext('2d'), {
          type: 'bar',
          data: {
            labels: entries.map((e) => e.name),
            datasets: [{ data: entries.map((e) => e.n), backgroundColor: '#f59e0b', borderRadius: 4 }]
          },
          options: {
            ...chartOpts,
            indexAxis: 'y',
            plugins: { legend: { display: false } }
          }
        });
      }
    }
  } catch (_) { /* ignore */ }

  try {
    const compareEl = document.getElementById('desk-chart-compare');
    if (compareEl && model && model.rows && model.rows.length) {
      const rows = model.rows.slice(0, 8);
      const labels = rows.map((r) => {
        const n = r.name.split(' [')[0];
        return n.length > 14 ? n.slice(0, 14) + '…' : n;
      });
      const values = rows.map((r) => (r.metrics.count < 7 ? null : r.metrics.finalC));
      const colors = values.map((v) => (v == null ? '#cbd5e1' : (v < 70 ? '#ef4444' : (v < 85 ? '#f59e0b' : '#22c55e'))));
      _deskCharts.compare = new window.Chart(compareEl.getContext('2d'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{ data: values.map((v) => v == null ? 0 : v), backgroundColor: colors, borderRadius: 4 }]
        },
        options: {
          ...chartOpts,
          scales: { y: { min: 0, max: 100 } },
          plugins: { legend: { display: false } }
        }
      });
    }
  } catch (_) { /* ignore */ }
}

function metricColorClass(v) {
  if (v == null || Number.isNaN(v)) return 'text-muted';
  if (v < 70) return 'text-danger';
  if (v < 85) return 'text-orange-500';
  return 'text-green-600';
}

function buildPulseModel(data) {
  data = Array.isArray(data) ? data : [];
  const grouped = {};
  const causesCount = {};
  let sumB1 = 0;
  let sumB2 = 0;
  let sumB3 = 0;
  data.forEach((i) => {
    if (!i) return;
    if (i.metrics) {
      sumB1 += Number(i.metrics.n_B1_fail) || 0;
      sumB2 += Number(i.metrics.n_B2_fail) || 0;
      sumB3 += Number(i.metrics.n_B3_fail) || 0;
    }
    const projectLabel = i.project_display_name || i.projectName || i.project_canonical_key || 'Без объекта';
    const cKey = (i.contractorName || '—') + ' [' + projectLabel + ']';
    grouped[cKey] = grouped[cKey] || [];
    grouped[cKey].push(i);
    if (i.state) {
      Object.keys(i.state).forEach((id) => {
        const s = i.state[id];
        if (s === 'fail' || s === 'fail_escalated') {
          const code = i.details && i.details[id] ? (i.details[id].causeCode || 'C00') : 'C00';
          causesCount[code] = (causesCount[code] || 0) + 1;
        }
      });
    }
  });

  const avgFn = window.avgContractorRatingsFromChecks;
  const ratings = (typeof avgFn === 'function')
    ? avgFn(data)
    : { avgUrk: 0, avgDoc: null, avgReliability: null, relN: 0 };

  const rows = buildContractorRows(data);
  let sumB1z = sumB1;
  let sumB2z = sumB2;
  let sumB3z = sumB3;
  // buildContractorRows may apply chip filter — for insight use unfiltered zone rows
  const allRows = (() => {
    const prev = window.currentContractorsFilter;
    window.currentContractorsFilter = 'ALL';
    try { return buildContractorRows(data); } finally { window.currentContractorsFilter = prev; }
  })();

  let insight = '';
  let insightHtml = '';
  try {
    const reports = window.RBI && window.RBI.services && window.RBI.services.reports;
    let saved = reports && typeof reports.getExpertConclusion === 'function'
      ? reports.getExpertConclusion('global_main_analysis')
      : null;
    if (saved && isAutoRiskInsightText(saved)) {
      try { reports.setExpertConclusion('global_main_analysis', ''); } catch (_) { /* ignore */ }
      saved = null;
    }
    const built = buildRiskZonesInsight({
      rows: allRows.map((r) => ({ name: r.name, metrics: r.metrics })),
      avgUrk: ratings.avgUrk || 0,
      qualityN: ratings.relN || 0,
      sumB1: sumB1z,
      sumB2: sumB2z,
      sumB3: sumB3z,
      checks: data.length
    });
    if (saved && String(saved).trim()) {
      insight = saved;
      insightHtml = formatRiskInsightDisplayHtml(saved);
    } else {
      insight = '';
      insightHtml = built.html || '';
    }
  } catch (_) { /* ignore */ }

  return {
    avgUrk: ratings.avgUrk || 0,
    avgDoc: ratings.avgDoc,
    avgRel: ratings.avgReliability != null ? ratings.avgReliability : 0,
    relN: ratings.relN || 0,
    contrCount: Object.keys(grouped).length,
    checks: data.length,
    sumB1, sumB2, sumB3,
    causesCount,
    rows,
    insight,
    insightHtml
  };
}

function buildKpiHtml(data) {
  const m = buildPulseModel(data);
  const gap = (m.avgDoc != null && Math.abs(m.avgUrk - m.avgDoc) > 30)
    ? ('<div class="ana-desk-gap-warn">' + _t('quality.analytics.desk.gap_warn', 'Разрыв физика {phys}% / документация {doc}% — {gap} п.п.', {
      phys: m.avgUrk, doc: m.avgDoc, gap: Math.abs(m.avgUrk - m.avgDoc)
    }) + '</div>')
    : '';

  return ''
    + '<div class="ana-desk-kpi-strip">'
    + '  <div><div class="k">' + _t('quality.analytics.kpi.avg_urk', 'Ср. УрК') + '</div><div class="v ' + metricColorClass(m.avgUrk) + '">' + m.avgUrk + '%</div></div>'
    + '  <div><div class="k">' + _t('quality.analytics.desk.kpi_doc', 'УрК док.') + '</div><div class="v ' + (m.avgDoc == null ? 'text-muted' : metricColorClass(m.avgDoc)) + '">'
    + (m.avgDoc == null ? '—' : m.avgDoc + '%') + '</div></div>'
    + '  <div><div class="k">' + _t('quality.analytics.kpi.reliability', 'Надёжность') + '</div><div class="v ' + (m.relN > 0 ? metricColorClass(m.avgRel) : 'text-muted') + '">'
    + (m.relN > 0 ? m.avgRel + '%' : _t('quality.analytics.kpi.collecting', 'СБОР')) + '</div></div>'
    + '  <div><div class="k">' + _t('quality.analytics.kpi.contractors', 'Подрядчики') + '</div><div class="v text-ink dark:text-white">' + m.contrCount + '</div></div>'
    + '  <div><div class="k">' + _t('quality.analytics.kpi.checks', 'Проверок') + '</div><div class="v text-ink dark:text-white">' + m.checks + '</div></div>'
    + '</div>'
    + gap
    + '<div class="ana-desk-sev-strip">'
    + '  <div><div class="k">B1</div><div class="v text-blue-600">' + m.sumB1 + '</div></div>'
    + '  <div><div class="k">B2</div><div class="v text-orange-500">' + m.sumB2 + '</div></div>'
    + '  <div><div class="k">B3</div><div class="v text-danger">' + m.sumB3 + '</div></div>'
    + '</div>';
}

function ensureContextZones() {
  // Sibling of table/detail so C/D can span full width under the split.
  const host = document.getElementById('sub-contractors')
    || document.getElementById('contractors-main-view');
  if (!host) return;
  if (!document.getElementById('ana-desk-zone-c')) {
    const c = document.createElement('div');
    c.id = 'ana-desk-zone-c';
    c.className = 'ana-desk-zone';
    host.appendChild(c);
  }
  if (!document.getElementById('ana-desk-zone-d')) {
    const d = document.createElement('div');
    d.id = 'ana-desk-zone-d';
    d.className = 'ana-desk-zone';
    host.appendChild(d);
  }
}

function paintContextZones(opts) {
  if (!_shellApplied || !isDesktopViewport()) return;
  ensureContextZones();
  const zoneC = document.getElementById('ana-desk-zone-c');
  const zoneD = document.getElementById('ana-desk-zone-d');
  if (!zoneC || !zoneD) return;

  const force = !!(opts && opts.force);
  const hasGalleryWrap = !!(
    zoneD.querySelector('#gallery-wrap-desk_b3')
    || zoneD.querySelector('#gallery-wrap-desk_b2')
    || zoneD.querySelector('#gallery-wrap-desk_ok')
  );
  // Возврат на подвкладку: не wipe живых галерей (blob revoke + rebuild → вопросики).
  // Но графики/risk-текст в zone C всё равно обновляем под текущие фильтры.
  if (!shouldRepaintDeskContextZones({ hasGalleryWrap, force })) {
    const photosDetails = zoneD.querySelector('#analytics-photos-details-desk');
    if (photosDetails && photosDetails.open) {
      try { rehydrateDeskPhotoGalleries(); } catch (_) { /* ignore */ }
    }
    try {
      const dataKeep = getFilteredData();
      const modelKeep = buildPulseModel(dataKeep);
      const riskBody = zoneC.querySelector('.ana-desk-risk-body');
      if (riskBody) {
        riskBody.innerHTML = modelKeep.insightHtml || formatRiskInsightDisplayHtml(modelKeep.insight);
      }
      if (!zoneC.querySelector('#desk-chart-trend')) {
        paintContextZones({ force: true });
        return;
      }
      requestAnimationFrame(() => paintDesktopCharts(dataKeep, modelKeep));
    } catch (_) { /* ignore */ }
    return;
  }

  const data = getFilteredData();
  const model = buildPulseModel(data);
  destroyDeskCharts();

  zoneC.innerHTML = ''
    + '<div class="ana-desk-secondary">'
    + '  <div class="ana-desk-panel"><h3>' + _t('quality.analytics.section.risk_zones', 'Анализ зон риска') + '</h3>'
    + '    <div class="meta">' + _t('quality.analytics.desk.meta_sample', 'По выборке · подрядчиков: {n}', { n: model.contrCount }) + '</div>'
    + '    <div class="ana-desk-risk-body">' + (model.insightHtml || formatRiskInsightDisplayHtml(model.insight)) + '</div></div>'
    + '  <div class="ana-desk-panel"><h3>' + _t('quality.analytics.desk.dynamics_urk', 'Динамика УрК') + '</h3>'
    + '    <div class="meta">' + _t('quality.analytics.desk.meta_weekly_urk', 'Средний УрК по неделям, %') + '</div>'
    + '    <div class="ana-desk-canvas-wrap"><canvas id="desk-chart-trend"></canvas></div></div>'
    + '</div>'
    + '<div class="ana-desk-secondary">'
    + '  <div class="ana-desk-panel"><h3>' + _t('quality.analytics.section.root_causes', 'Коренные причины') + '</h3>'
    + '    <div class="meta">' + _t('quality.analytics.desk.meta_causes', 'Число дефектов с причиной') + '</div>'
    + '    <div class="ana-desk-canvas-wrap"><canvas id="desk-chart-causes"></canvas></div></div>'
    + '  <div class="ana-desk-panel"><h3>' + _t('quality.analytics.desk.compare_contr', 'Сравнение подрядчиков') + '</h3>'
    + '    <div class="meta">' + _t('quality.analytics.desk.meta_integral', 'Интегральный УрК (надёжность), %') + '</div>'
    + '    <div class="ana-desk-canvas-wrap"><canvas id="desk-chart-compare"></canvas></div></div>'
    + '</div>';

  // Сохранить open при repaint; первый paint — раскрыт по умолчанию.
  const prevPhotos = document.getElementById('analytics-photos-details-desk');
  const prevOpen = prevPhotos ? !!prevPhotos.open : null;
  const openAttr = deskDetailsOpenAttr(prevOpen, true);

  zoneD.innerHTML = ''
    + '<details class="ana-desk-evidence" id="analytics-photos-details-desk"' + openAttr + '>'
    + '  <summary>' + _t('quality.analytics.desk.gallery_summary', 'Фотогалерея B3 / B2 / OK — раскрыть') + '</summary>'
    + '  <div class="ana-desk-evidence-body">'
    + '    <div class="ev-h b3">' + _t('quality.analytics.gallery.b3_title', 'Критический брак (B3)') + '</div><div id="lazy-gallery-desk_b3" class="text-xs text-muted">' + _t('quality.analytics.desk.gallery_open', 'Откройте блок…') + '</div>'
    + '    <div class="ev-h b2">' + _t('quality.analytics.defect.b2', 'Значимые (B2)') + '</div><div id="lazy-gallery-desk_b2" class="text-xs text-muted">' + _t('quality.analytics.desk.gallery_open', 'Откройте блок…') + '</div>'
    + '    <div class="ev-h ok">' + _t('quality.analytics.desk.gallery_ok', 'Эталон (OK)') + '</div><div id="lazy-gallery-desk_ok" class="text-xs text-muted">' + _t('quality.analytics.desk.gallery_open', 'Откройте блок…') + '</div>'
    + '  </div>'
    + '</details>';

  neutralizeMobileGalleryMarkup();

  const photosDetails = zoneD.querySelector('#analytics-photos-details-desk');
  if (photosDetails) {
    photosDetails.addEventListener('toggle', ensureDesktopPhotoGalleries);
    // Уже open на первом paint / после preserve — сразу гидратировать галерею.
    if (photosDetails.open) {
      try { ensureDesktopPhotoGalleries({ target: photosDetails }); } catch (_) { /* ignore */ }
    }
  }

  requestAnimationFrame(() => paintDesktopCharts(data, model));
}

/** Сброс мёртвых blob: в desk-галереях и повторный resolve из IDB. */
function rehydrateDeskPhotoGalleries() {
  const rehydrate = window.AnalyticsRender
    && typeof window.AnalyticsRender.rehydratePhotoGallery === 'function'
    ? window.AnalyticsRender.rehydratePhotoGallery.bind(window.AnalyticsRender)
    : null;
  ['desk_b3', 'desk_b2', 'desk_ok'].forEach(function (id) {
    if (rehydrate) {
      try { rehydrate(id); } catch (_) { /* ignore */ }
    }
  });
  const zone = document.getElementById('ana-desk-zone-d');
  if (zone && typeof window.rbiHydrateLocalImages === 'function') {
    try { window.rbiHydrateLocalImages(zone); } catch (_) { /* ignore */ }
  }
}

/** Remove mobile photo-details from hidden top-summary (duplicate ids). */
function neutralizeMobileGalleryMarkup() {
  const top = document.getElementById('contractors-top-summary');
  if (!top) return;
  const mobileDetails = top.querySelector('#analytics-photos-details');
  if (mobileDetails) mobileDetails.remove();
  top.querySelectorAll('[id^="lazy-gallery-main_"], [id^="gallery-wrap-main_"]').forEach((el) => {
    try { el.remove(); } catch (_) { /* ignore */ }
  });
}

/** Collect B3/B2/OK gallery entries from filtered inspections (desktop path). */
function collectDesktopGalleryPhotos(data) {
  const allPhotosB3 = [];
  const allPhotosB2 = [];
  const allPhotosOK = [];
  if (!Array.isArray(data)) return { allPhotosB3, allPhotosB2, allPhotosOK };

  const userTpl = getTemplatesMap() || {};
  const sysTpl = (typeof window.SYSTEM_TEMPLATES !== 'undefined' && window.SYSTEM_TEMPLATES) || {};
  const flatFn = typeof window.getFlatList === 'function' ? window.getFlatList : null;
  const sortFn = (typeof window.AnalyticsRender !== 'undefined' && window.AnalyticsRender.sortGalleryNewestFirst)
    ? window.AnalyticsRender.sortGalleryNewestFirst
    : function (arr) {
      if (!Array.isArray(arr) || arr.length < 2) return arr || [];
      arr.sort(function (a, b) {
        const ta = Number(a && a.ts) || 0;
        const tb = Number(b && b.ts) || 0;
        if (tb !== ta) return tb - ta;
        const c = String((a && a.contr) || '').localeCompare(String((b && b.contr) || ''), 'ru');
        if (c) return c;
        return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), 'ru');
      });
      return arr;
    };

  data.forEach((i) => {
    if (!i || !i.state) return;
    const ts = new Date(i.date).getTime();
    const dateLabel = Number.isFinite(ts) ? new Date(ts).toLocaleDateString('ru-RU') : '—';
    Object.keys(i.state).forEach((id) => {
      const s = i.state[id];
      const photosArr = (i.photos && i.photos[id])
        ? (window.normalizeItemPhotos ? window.normalizeItemPhotos(i.photos[id]) : [].concat(i.photos[id]))
        : [];
      if (!photosArr.length) return;

      let defName = _t('quality.analytics.fallback.defect', 'Дефект');
      let foundItem = null;
      const tType = i.templateKey ? i.templateKey.split('_')[0] : '';
      const tKey = i.templateKey ? i.templateKey.replace(tType + '_', '') : '';
      const groups = (tType === 'sys' && sysTpl[tKey] && sysTpl[tKey].groups)
        || (userTpl[tKey] && userTpl[tKey].groups)
        || [];
      if (flatFn) {
        foundItem = flatFn(groups).find((x) => String(x.id) === String(id));
        if (foundItem) defName = foundItem.n;
      } else {
        groups.forEach((g) => {
          const found = (g.items || []).find((x) => String(x.id) === String(id));
          if (found) { foundItem = found; defName = found.n; }
        });
      }

      photosArr.forEach((photo) => {
        if (!photo) return;
        const photoObj = {
          photo: photo,
          name: defName,
          contr: i.contractorName,
          date: dateLabel,
          ts: Number.isFinite(ts) ? ts : 0,
          dateRaw: i.date
        };
        if (s === 'fail' || s === 'fail_escalated') {
          const isB3 = (s === 'fail_escalated') || (foundItem && foundItem.w === 3);
          if (isB3) allPhotosB3.push(photoObj);
          else allPhotosB2.push(photoObj); // B1+B2
        } else if (s === 'ok') {
          allPhotosOK.push(photoObj);
        }
      });
    });
  });
  sortFn(allPhotosB3);
  sortFn(allPhotosB2);
  sortFn(allPhotosOK);
  return { allPhotosB3, allPhotosB2, allPhotosOK };
}

function ensureDesktopPhotoGalleries(ev) {
  const details = ev && ev.target;
  if (details && details.tagName === 'DETAILS' && !details.open) return;

  const zone = document.getElementById('ana-desk-zone-d');
  if (!zone) return;
  // Already filled — не init заново; подтянуть свежие URL если blob revoke.
  if (zone.querySelector('#gallery-wrap-desk_b3')
    || zone.querySelector('#gallery-wrap-desk_b2')
    || zone.querySelector('#gallery-wrap-desk_ok')) {
    if (!zone.querySelector('[id^="lazy-gallery-desk_"]')) {
      try { rehydrateDeskPhotoGalleries(); } catch (_) { /* ignore */ }
      return;
    }
  }

  const init = (window.AnalyticsRender && typeof window.AnalyticsRender.initPhotoGallery === 'function')
    ? window.AnalyticsRender.initPhotoGallery.bind(window.AnalyticsRender)
    : (typeof window.initPhotoGallery === 'function' ? window.initPhotoGallery : null);
  if (!init) return;

  neutralizeMobileGalleryMarkup();

  const packs = collectDesktopGalleryPhotos(getFilteredData());
  const slotB3 = zone.querySelector('#lazy-gallery-desk_b3');
  const slotB2 = zone.querySelector('#lazy-gallery-desk_b2');
  const slotOk = zone.querySelector('#lazy-gallery-desk_ok');
  if (slotB3) slotB3.outerHTML = init('desk_b3', packs.allPhotosB3, true);
  if (slotB2) slotB2.outerHTML = init('desk_b2', packs.allPhotosB2, false);
  if (slotOk) {
    slotOk.outerHTML = init(
      'desk_ok', packs.allPhotosOK, false,
      'text-green-700 bg-green-100 border-green-200', 'OK'
    );
  }
}

function refreshKpi() {
  const host = document.getElementById(KPI_ID);
  if (!host) return;
  host.innerHTML = buildKpiHtml(getFilteredData());
}

function buildContractorRows(data) {
  const grouped = {};
  (data || []).forEach((i) => {
    if (!i) return;
    const projectLabel = i.project_display_name || i.projectName || i.project_canonical_key || 'Без объекта';
    const cKey = (i.contractorName || '—') + ' [' + projectLabel + ']';
    if (!grouped[cKey]) grouped[cKey] = [];
    grouped[cKey].push(i);
  });

  const templates = getTemplatesMap();
  const metricsFn = window.getContractorMetrics;
  const rows = [];

  Object.keys(grouped).forEach((name) => {
    const cData = grouped[name];
    if (typeof metricsFn !== 'function') return;
    const m = metricsFn(cData, templates);
    if (!m) return;
    let b1 = 0;
    let b2 = 0;
    cData.forEach((u) => {
      if (!u.metrics) return;
      b1 += Number(u.metrics.n_B1_fail) || 0;
      b2 += Number(u.metrics.n_B2_fail) || 0;
    });
    rows.push({
      name,
      workType: cData[0].templateTitle || '—',
      metrics: m,
      b1,
      b2,
      b3: m.n_изделий_с_B3 || 0
    });
  });

  const filter = window.currentContractorsFilter || 'ALL';
  let filtered = rows;
  if (filter === 'CRITICAL') {
    filtered = rows.filter((c) => c.metrics.finalC < 70 || c.metrics.n_изделий_с_B3 > 0);
  } else if (filter === 'WARNING') {
    filtered = rows.filter((c) => (c.metrics.finalC >= 70 && c.metrics.finalC < 85) || c.metrics.stabilityIndex < 60);
  } else if (filter === 'STABLE') {
    filtered = rows.filter((c) => c.metrics.finalC >= 85 && c.metrics.n_изделий_с_B3 === 0);
  } else if (filter === 'NEW') {
    filtered = rows.filter((c) => c.metrics.count < 7);
  }

  filtered.sort((a, b) => {
    const dir = _deskContractorSort.dir === 'asc' ? 1 : -1;
    const key = _deskContractorSort.key || 'rel';
    const num = (v) => {
      if (v == null || v === '—' || Number.isNaN(Number(v))) return null;
      return Number(v);
    };
    const cmpNullLast = (av, bv) => {
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av === bv ? 0 : (av < bv ? -1 : 1);
    };
    let cmp = 0;
    if (key === 'name') {
      cmp = String(a.name).localeCompare(String(b.name), 'ru');
    } else if (key === 'urk') {
      cmp = cmpNullLast(num(a.metrics.baseUrkContrPerc), num(b.metrics.baseUrkContrPerc));
    } else if (key === 'doc') {
      cmp = cmpNullLast(num(a.metrics.documentaryC), num(b.metrics.documentaryC));
    } else if (key === 'rel') {
      // default: «сбор» (N<7) вниз, затем надёжность
      const aP = a.metrics.count < 7;
      const bP = b.metrics.count < 7;
      if (aP !== bP) return aP ? 1 : -1;
      cmp = cmpNullLast(num(a.metrics.finalC), num(b.metrics.finalC));
    } else if (key === 'n') {
      cmp = cmpNullLast(num(a.metrics.count), num(b.metrics.count));
    } else if (key === 'defects') {
      cmp = cmpNullLast(a.b3, b.b3)
        || cmpNullLast(a.b2, b.b2)
        || cmpNullLast(a.b1, b.b1);
    } else if (key === 'stab') {
      cmp = cmpNullLast(num(a.metrics.stabilityIndex), num(b.metrics.stabilityIndex));
    } else {
      cmp = cmpNullLast(num(a.metrics.finalC), num(b.metrics.finalC));
    }
    if (cmp !== 0) return cmp * dir;
    return String(a.name).localeCompare(String(b.name), 'ru');
  });
  return filtered;
}

function contractorSortMark(key) {
  if (_deskContractorSort.key !== key) return '';
  return _deskContractorSort.dir === 'asc' ? ' ↑' : ' ↓';
}

function paintContractorsTable() {
  const list = document.getElementById('contractors-list-container');
  if (!list || !_shellApplied || !isDesktopViewport()) return;

  const rows = buildContractorRows(getFilteredData());
  if (!rows.length) {
    list.innerHTML = '<div class="ana-desk-empty">' + _t('quality.analytics.desk.empty_category', 'В этой категории никого нет') + '</div>';
    return;
  }

  const th = (key, label) => {
    const on = _deskContractorSort.key === key ? ' is-on' : '';
    return '<th class="ana-desk-th-sort' + on + '" data-ana-desk-c-sort="' + key + '" scope="col" title="'
      + _t('quality.analytics.desk.sort', 'Сортировать') + '">'
      + label + contractorSortMark(key) + '</th>';
  };

  let html = '<div class="ana-desk-table-wrap"><table class="ana-desk-table"><thead><tr>'
    + th('name', _t('quality.analytics.desk.col_contractor', 'Подрядчик'))
    + th('urk', _t('quality.analytics.desk.col_urk', 'УрК'))
    + th('doc', _t('quality.analytics.desk.col_doc', 'Док'))
    + th('rel', _t('quality.analytics.desk.col_rel', 'Надёжн.'))
    + th('n', 'N')
    + th('defects', 'B1/B2/B3')
    + th('stab', _t('quality.analytics.desk.col_stab', 'Стаб.'))
    + '</tr></thead><tbody>';

  rows.forEach((c) => {
    const m = c.metrics;
    const isPrelim = m.count < 7;
    const selected = _selectedContractor === c.name ? ' is-selected' : '';
    const urk = m.baseUrkContrPerc;
    const rel = isPrelim ? null : m.finalC;
    const doc = (m.documentaryC !== null && m.documentaryC !== undefined) ? m.documentaryC : null;
    const stab = m.stabilityIndex != null ? m.stabilityIndex : '—';
    html += '<tr class="' + selected.trim() + '" data-ana-desk-contractor="' + escapeAttr(c.name) + '">'
      + '<td><div class="ana-desk-name">' + escapeAttr(c.name) + '</div>'
      + '<span class="ana-desk-work">' + escapeAttr(c.workType)
      + (isPrelim ? ' · ' + _t('quality.analytics.desk.collecting_suffix', 'сбор') : '') + '</span></td>'
      + '<td><span class="ana-desk-metric ' + metricColorClass(urk) + '">' + urk + '%</span></td>'
      + '<td><span class="ana-desk-metric ' + (doc == null ? 'text-muted' : metricColorClass(doc)) + '">'
      + (doc == null ? '—' : doc + '%') + '</span></td>'
      + '<td><span class="ana-desk-metric ' + (rel == null ? 'text-muted' : metricColorClass(rel)) + '">'
      + (rel == null ? '—' : rel + '%') + '</span></td>'
      + '<td><span class="ana-desk-metric text-ink">' + m.count + '</span></td>'
      + '<td><span class="ana-desk-metric text-muted">' + c.b1 + '/' + c.b2 + '/' + c.b3 + '</span></td>'
      + '<td><span class="ana-desk-metric text-ink">' + stab + '</span></td>'
      + '</tr>';
  });

  html += '</tbody></table></div>';
  list.innerHTML = html;
}

function setDetailEmptyState(empty) {
  const detail = document.getElementById('contractor-detail-view');
  if (!detail) return;
  if (empty) {
    detail.classList.add('ana-desk-detail-empty');
    detail.classList.add('hidden');
    const content = document.getElementById('contractor-detail-content');
    if (content) {
      content.innerHTML = '';
      content.removeAttribute('data-ana-desk-flat');
    }
  } else {
    detail.classList.remove('ana-desk-detail-empty');
    detail.classList.remove('hidden');
  }
}

function openDesktopDetail(contractorName, opts) {
  if (!contractorName) return;
  const force = !!(opts && opts.force);
  if (!force && _selectedContractor === contractorName) {
    closeDesktopDetail();
    return;
  }
  _selectedContractor = contractorName;
  paintContractorsTable();

  const showFn = window.showContractorDetailView;
  if (typeof showFn === 'function') {
    showFn(contractorName);
  }

  const main = document.getElementById('contractors-main-view');
  if (main) main.classList.remove('hidden');
  const sub = document.getElementById('sub-contractors');
  if (sub) sub.classList.add('ana-desk-split');
  setDetailEmptyState(false);
  restyleDesktopDetailHeader(contractorName);

  const content = document.getElementById('contractor-detail-content');
  if (content) content.removeAttribute('data-ana-desk-flat');

  requestAnimationFrame(() => {
    restyleDesktopDetailHeader(contractorName);
    normalizeDesktopDetailContent();
  });
  setTimeout(() => {
    normalizeDesktopDetailContent();
    try {
      const ch = window.AnalyticsState && window.AnalyticsState.chartInstances
        && window.AnalyticsState.chartInstances.chart_detail_line;
      if (ch && typeof ch.resize === 'function') ch.resize();
    } catch (_) { /* ignore */ }
  }, 140);
}

function flattenDetailsToBlock(detailsEl) {
  const summary = detailsEl.querySelector(':scope > summary');
  const title = ((summary && summary.textContent) || '')
    .replace(/[▼▲🔮📝🏅⚙️📉📑📋📸📚]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || _t('quality.analytics.desk.section', 'Раздел');
  const section = document.createElement('section');
  section.className = 'ana-desk-block';
  section.setAttribute('data-title', title);
  if (isWideDetailBlock(title)) section.classList.add('ana-desk-block--wide');
  const h = document.createElement('h4');
  h.className = 'ana-desk-block-title';
  h.textContent = title;
  const body = document.createElement('div');
  body.className = 'ana-desk-block-body';
  const nodes = Array.prototype.slice.call(detailsEl.childNodes);
  nodes.forEach((node) => {
    if (node === summary) return;
    if (node.nodeType === 1 && node.tagName === 'SUMMARY') return;
    body.appendChild(node);
  });
  section.appendChild(h);
  section.appendChild(body);
  detailsEl.replaceWith(section);
  return section;
}

function isWideDetailBlock(title) {
  const t = String(title || '').toLowerCase();
  return /фото|галер|динамик|эксперт|заключ|pdca|реестр|этап|смр/.test(t);
}

/**
 * Desktop detail: ALL mobile sections visible.
 * Hero on top; sections in a wide 2-col grid (full parity, desktop composition).
 */
function normalizeDesktopDetailContent() {
  const content = document.getElementById('contractor-detail-content');
  if (!content || !_shellApplied) return;
  content.classList.add('ana-desk-detail-body');

  const hasRawDetails = !!content.querySelector('details');
  if (content.getAttribute('data-ana-desk-flat') === '1' && !hasRawDetails) return;
  content.removeAttribute('data-ana-desk-flat');

  const exportBtn = content.querySelector('button[onclick*="exportPersonalContractorReport"]');
  if (exportBtn) {
    exportBtn.classList.add('ana-desk-export-btn');
    exportBtn.textContent = _t('quality.analytics.desk.download_a3', 'Скачать отчёт для планерки (A3)');
  }

  Array.prototype.some.call(content.children, (el) => {
    if (!el || el.tagName === 'BUTTON' || el.tagName === 'DETAILS' || el.tagName === 'SECTION') return false;
    if (el.classList && /border|rounded|bg-/.test(el.className || '')) {
      el.classList.add('ana-desk-hero-card');
      return true;
    }
    return false;
  });

  let guard = 0;
  while (content.querySelector('details') && guard < 40) {
    guard += 1;
    const d = content.querySelector('details');
    if (!d) break;
    flattenDetailsToBlock(d);
  }

  Array.prototype.slice.call(content.querySelectorAll(':scope > div')).forEach((el) => {
    if (el.classList.contains('ana-desk-hero-card') || el.classList.contains('ana-desk-detail-shell')) return;
    if (el.querySelector('.ana-desk-block')) {
      Array.prototype.slice.call(el.querySelectorAll('.ana-desk-block')).forEach((b) => content.appendChild(b));
      if (!el.children.length) el.remove();
    } else if (!el.children.length && !(el.textContent || '').trim()) {
      el.remove();
    }
  });

  const topNodes = [];
  const blocks = [];
  Array.prototype.slice.call(content.children).forEach((el) => {
    if (el.classList && el.classList.contains('ana-desk-block')) blocks.push(el);
    else topNodes.push(el);
  });

  const shell = document.createElement('div');
  shell.className = 'ana-desk-detail-shell';

  const top = document.createElement('div');
  top.className = 'ana-desk-detail-top';
  topNodes.forEach((n) => top.appendChild(n));
  shell.appendChild(top);

  const grid = document.createElement('div');
  grid.className = 'ana-desk-detail-grid';
  blocks.forEach((b) => {
    if (isWideDetailBlock(b.getAttribute('data-title'))) b.classList.add('ana-desk-block--wide');
    grid.appendChild(b);
  });
  shell.appendChild(grid);

  content.innerHTML = '';
  content.appendChild(shell);
  content.setAttribute('data-ana-desk-flat', '1');
  content.scrollTop = 0;

  setTimeout(() => {
    try {
      const ch = window.AnalyticsState && window.AnalyticsState.chartInstances
        && window.AnalyticsState.chartInstances.chart_detail_line;
      if (ch && typeof ch.resize === 'function') ch.resize();
    } catch (_) { /* ignore */ }
  }, 80);
}

function restyleDesktopDetailHeader(contractorName) {
  const header = document.getElementById('contractor-detail-header');
  if (!header) return;
  header.className = 'ana-desk-detail-head';
  header.removeAttribute('style');
  header.innerHTML = ''
    + '<button type="button" class="ana-desk-detail-close" id="ana-desk-detail-close">' + _t('quality.analytics.desk.close', '← Закрыть') + '</button>'
    + '<div class="ana-desk-detail-title" id="detail-view-title"></div>';
  const title = document.getElementById('detail-view-title');
  if (title) title.textContent = contractorName || '';
  const closeBtn = document.getElementById('ana-desk-detail-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDesktopDetail();
    });
  }
}

function closeDesktopDetail() {
  _selectedContractor = null;
  if (winHasFn('hideContractorDetailView')) winCall('hideContractorDetailView');
  const main = document.getElementById('contractors-main-view');
  if (main) main.classList.remove('hidden');
  const sub = document.getElementById('sub-contractors');
  if (sub) sub.classList.remove('ana-desk-split');
  setDetailEmptyState(true);
  paintContractorsTable();
}

function updateFallbackNote(tabId) {
  const note = document.getElementById(NOTE_ID);
  if (!note) return;
  const desktopNative = (tabId === 'sub-contractors' || tabId === 'sub-onepager' || tabId === 'sub-history' || tabId === 'sub-sk' || tabId === 'sub-schedule');
  if (desktopNative) {
    note.classList.add('hidden');
    note.innerHTML = '';
    return;
  }
  note.classList.remove('hidden');
  note.innerHTML = '<div class="mb-3 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 text-rbi-body text-amber-800 dark:text-amber-200 font-medium">'
    + _t('quality.analytics.desk.mobile_fallback_note', 'Подвкладка на ПК пока в mobile-рендере внутри широкой оболочки. Отдельный desktop — в следующих блоках.')
    + '</div>';
}

/**
 * Desktop History — executive chrome + real content builders
 * (history.desktop.content.js). Mobile views hidden while desk panels active.
 */
function paintHistoryDesktop() {
  if (!_shellApplied || !isDesktopViewport()) return;
  const root = document.getElementById('sub-history');
  if (!root) return;
  root.classList.add('ana-desk-hist');
  bindHistoryDeskEvents();

  const sticky = document.getElementById('hist-sticky-panel');
  const viewChecks = document.getElementById('history-checks-view');
  const viewReports = document.getElementById('history-reports-view');
  const viewPlans = document.getElementById('history-plans-view');
  if (!sticky || !viewChecks) return;

  let exec = root.querySelector(':scope > .ana-desk-hist-exec');
  if (!exec) {
    exec = document.createElement('div');
    exec.className = 'ana-desk-hist-exec';
    root.insertBefore(exec, sticky);
  }

  // Sticky chrome: title + mode pills + filters, flush under analytics subtabs
  let chrome = exec.querySelector(':scope > .ana-desk-hist-chrome');
  if (!chrome) {
    chrome = document.createElement('div');
    chrome.className = 'ana-desk-hist-chrome';
    exec.insertBefore(chrome, exec.firstChild);
  }

  let hero = chrome.querySelector(':scope > .ana-desk-hist-hero');
  if (!hero) {
    hero = document.createElement('header');
    hero.className = 'ana-desk-hist-hero';
    hero.innerHTML = ''
      + '<div class="ana-desk-hist-hero-text">'
      + '  <h2 class="ana-desk-hist-title">' + _t('quality.desk.analytics.hist_title', 'История') + '</h2>'
      + '  <p class="ana-desk-hist-sub" data-hist-desk-sub></p>'
      + '</div>'
      + '<div class="ana-desk-hist-mode" data-hist-desk-mode-host></div>';
    chrome.appendChild(hero);
  }

  const modeHost = hero.querySelector('[data-hist-desk-mode-host]');
  const modeWrap = sticky.querySelector('[data-no-panel-toggle]')
    || sticky.querySelector('#btn-hist-checks')?.parentElement
    || modeHost?.querySelector('.ana-desk-hist-mode-pills')
    || document.getElementById('btn-hist-checks')?.parentElement;
  if (modeHost && modeWrap && modeWrap.parentElement !== modeHost) {
    modeHost.appendChild(modeWrap);
  }
  if (modeWrap) {
    modeWrap.classList.add('ana-desk-hist-mode-pills');
    modeWrap.setAttribute('role', 'group');
    modeWrap.setAttribute('aria-label', _t('quality.desk.analytics.hist_mode_aria', 'Режим истории'));
  }

  const histTitle = hero.querySelector('.ana-desk-hist-title');
  if (histTitle) histTitle.textContent = _t('quality.desk.analytics.hist_title', 'История');

  const panelHeader = document.getElementById('hist-panel-header');
  if (panelHeader) {
    panelHeader.querySelector(':scope > span')?.classList.add('ana-desk-hist-hide');
  }

  sticky.classList.add('ana-desk-hist-toolbar');
  if (sticky.parentElement !== chrome) chrome.appendChild(sticky);

  let stage = exec.querySelector(':scope > .ana-desk-hist-stage');
  if (!stage) {
    stage = document.createElement('div');
    stage.className = 'ana-desk-hist-stage';
    exec.appendChild(stage);
  }
  // Keep mobile views in stage but hidden; desk panels are siblings
  [viewChecks, viewReports, viewPlans].forEach((v) => {
    if (v && v.parentElement !== stage) stage.appendChild(v);
  });
  ensureHistoryDeskContainers(stage);

  const body = document.getElementById('hist-panel-body');
  if (body) {
    body.style.maxHeight = 'none';
    body.style.opacity = '1';
    body.style.margin = '0';
    body.style.overflow = 'visible';
  }

  const mode = window.currentHistoryViewMode || 'checks';
  const actionsRow = document.getElementById('hist-checks-actions-row');
  if (actionsRow) {
    // Check-only chips: hide for reports; for plans hide «С планом» (rail + plans own that)
    actionsRow.style.display = (mode === 'reports') ? 'none' : 'flex';
  }
  const planChip = document.getElementById('hist-filter-plan')?.closest('label');
  if (planChip) planChip.style.display = (mode === 'plans') ? 'none' : '';
  // Uncheck redundant «С планом» when viewing plans
  if (mode === 'plans') {
    const planCb = document.getElementById('hist-filter-plan');
    if (planCb) planCb.checked = false;
  }

  // Project multifilter duplicates object rail — mark for CSS hide
  root.classList.add('ana-desk-hist--no-proj-filter');
  root.classList.toggle('ana-desk-hist--mode-plans', mode === 'plans');
  root.classList.remove('ana-desk-hist--filters-collapsed');

  // Remove obsolete filters toggle if present
  const filtBtn = hero.querySelector('[data-ana-desk-hist-filters-toggle]');
  if (filtBtn) filtBtn.remove();
  const tools = hero.querySelector('.ana-desk-hist-hero-tools');
  if (tools && modeHost && modeHost.parentElement === tools) {
    hero.appendChild(modeHost);
    tools.remove();
  }

  const sub = hero.querySelector('[data-hist-desk-sub]');
  if (sub) {
    sub.textContent = mode === 'reports'
      ? _t('quality.desk.analytics.hist_sub_reports', 'Архив отчётов')
      : (mode === 'plans'
        ? _t('quality.desk.analytics.hist_sub_plans', 'Планы этажей по объектам')
        : _t('quality.desk.analytics.hist_sub_checks', 'Журнал проверок'));
  }

  ['checks', 'reports', 'plans'].forEach((m) => {
    const btn = document.getElementById('btn-hist-' + m);
    if (!btn) return;
    btn.classList.add('ana-desk-hist-pill');
    btn.classList.toggle('is-on', mode === m);
  });

  try { paintHistoryContent(mode); } catch (err) {
    console.warn('[AnalyticsDesktop] history content', err);
  }
}

/**
 * Desktop ПК СК — sticky chrome + master–detail (sk.desktop.content.js).
 * Mobile sk-view-* hidden while desk panels active.
 */
function paintSkDesktop() {
  if (!_shellApplied || !isDesktopViewport()) return;
  if (window.__anaDeskSkPainting) return;
  window.__anaDeskSkPainting = true;
  try {
  const root = document.getElementById('sub-sk');
  const main = document.getElementById('sk-main-container');
  if (!root || !main) return;
  if (!document.getElementById('sk-view-dashboard')) return;

  root.classList.add('ana-desk-sk');
  bindSkDeskEvents();

  const countEl = document.getElementById('sk-total-count');
  const headerCard = countEl
    ? (countEl.closest('.rounded-2xl') || countEl.closest('.rounded-xl') || countEl.parentElement?.parentElement?.parentElement)
    : null;
  const btnDash = document.getElementById('sk-btn-dashboard');
  const pillsRow = btnDash ? btnDash.parentElement : null;
  const banner = document.getElementById('sk-contractor-queue-banner');

  let exec = main.querySelector(':scope > .ana-desk-sk-exec');
  if (!exec) {
    exec = document.createElement('div');
    exec.className = 'ana-desk-sk-exec';
    main.insertBefore(exec, main.firstChild);
  }

  let chrome = exec.querySelector(':scope > .ana-desk-sk-chrome');
  if (!chrome) {
    chrome = document.createElement('div');
    chrome.className = 'ana-desk-sk-chrome';
    exec.insertBefore(chrome, exec.firstChild);
  }

  if (banner && banner.parentElement !== chrome) {
    chrome.insertBefore(banner, chrome.firstChild);
  }

  let hero = chrome.querySelector(':scope > .ana-desk-sk-hero');
  if (!hero) {
    hero = document.createElement('header');
    hero.className = 'ana-desk-sk-hero';
    hero.innerHTML = ''
      + '<div class="ana-desk-sk-hero-text">'
      + '  <h2 class="ana-desk-sk-title">' + _t('quality.desk.analytics.sk_title', 'ПК Стройконтроль') + '</h2>'
      + '  <p class="ana-desk-sk-sub" data-sk-desk-sub></p>'
      + '</div>'
      + '<div class="ana-desk-sk-hero-actions" data-sk-desk-actions></div>';
    chrome.appendChild(hero);
  }

  const skTitleEl = hero.querySelector('.ana-desk-sk-title');
  if (skTitleEl) skTitleEl.textContent = _t('quality.desk.analytics.sk_title', 'ПК Стройконтроль');

  const actionsHost = hero.querySelector('[data-sk-desk-actions]');
  if (headerCard && actionsHost) {
    // Import / clear / view-only cluster is the right-side flex in the head card
    const actionCluster = headerCard.querySelector('.flex.gap-2');
    if (actionCluster && actionCluster.parentElement !== actionsHost) {
      actionsHost.appendChild(actionCluster);
    }
    headerCard.classList.add('ana-desk-sk-mobile-hide');
  }

  let modeHost = chrome.querySelector('[data-sk-desk-mode-host]');
  if (!modeHost) {
    modeHost = document.createElement('div');
    modeHost.setAttribute('data-sk-desk-mode-host', '');
    chrome.appendChild(modeHost);
  }
  if (pillsRow && pillsRow.parentElement !== modeHost) {
    modeHost.appendChild(pillsRow);
  }
  if (pillsRow) {
    pillsRow.classList.add('ana-desk-sk-mode-pills');
    pillsRow.setAttribute('role', 'group');
    pillsRow.setAttribute('aria-label', _t('quality.desk.analytics.sk_mode_aria', 'Режим ПК СК'));
  }

  let stage = exec.querySelector(':scope > .ana-desk-sk-stage');
  if (!stage) {
    stage = document.createElement('div');
    stage.className = 'ana-desk-sk-stage';
    exec.appendChild(stage);
  }

  const viewDash = document.getElementById('sk-view-dashboard');
  const viewVol = document.getElementById('sk-view-volumes');
  const viewHr = document.getElementById('sk-view-hr');
  [viewDash, viewVol, viewHr].forEach((v) => {
    if (v && v.parentElement !== stage) stage.appendChild(v);
  });
  ensureSkDeskContainers(stage);

  const mode = window.skCurrentSubTab || 'dashboard';
  const periodEl = document.getElementById('sk-period-text');
  const sub = hero.querySelector('[data-sk-desk-sub]');
  if (sub) {
    const n = (window.skRecords && window.skRecords.length) || 0;
    const period = periodEl ? String(periodEl.textContent || '').replace(/^Период:\s*/i, '') : '';
    const modeLabel = mode === 'volumes'
      ? _t('quality.desk.analytics.sk_mode_volumes', 'Объёмы')
      : (mode === 'hr'
        ? _t('quality.desk.analytics.sk_mode_engineers', 'Инженеры')
        : _t('quality.desk.analytics.sk_mode_dashboard', 'Дашборд'));
    sub.textContent = _t('quality.desk.analytics.sk_sub_positions', '{mode} · {n} позиций', { mode: modeLabel, n: n })
      + (period ? ` · ${period}` : '');
  }

  ['dashboard', 'volumes', 'hr'].forEach((m) => {
    const btn = document.getElementById('sk-btn-' + m);
    if (!btn) return;
    btn.classList.add('ana-desk-sk-pill');
    btn.classList.toggle('is-on', mode === m);
    const label = m === 'volumes'
      ? _t('quality.desk.analytics.sk_mode_volumes', 'Объёмы')
      : (m === 'hr'
        ? _t('quality.desk.analytics.sk_mode_engineers', 'Инженеры')
        : _t('quality.desk.analytics.sk_mode_dashboard', 'Дашборд'));
    _setSkBtnLabel(btn, label);
  });

  window.__anaDeskPaintSk = paintSkDesktop;

  try { paintSkContent(mode); } catch (err) {
    console.warn('[AnalyticsDesktop] sk content', err);
  }
  } finally {
    window.__anaDeskSkPainting = false;
  }
}

function clearSkDesktopArtifacts() {
  const root = document.getElementById('sub-sk');
  const main = document.getElementById('sk-main-container');
  if (!root) return;

  clearSkDeskPanels();

  const modeHost = root.querySelector('[data-sk-desk-mode-host]');
  const pillsRow = modeHost && modeHost.firstElementChild;
  const actionsHost = root.querySelector('[data-sk-desk-actions]');
  const actionCluster = actionsHost && actionsHost.firstElementChild;

  const countEl = document.getElementById('sk-total-count');
  const headerCard = countEl
    ? (countEl.closest('.rounded-2xl') || countEl.closest('.rounded-xl') || countEl.parentElement?.parentElement?.parentElement)
    : null;

  if (headerCard) {
    headerCard.classList.remove('ana-desk-sk-mobile-hide');
    if (actionCluster) {
      // Put actions back into the header's right column
      const rightCol = headerCard.querySelector('.flex.justify-between')?.lastElementChild
        || headerCard;
      if (actionCluster.parentElement !== rightCol) rightCol.appendChild(actionCluster);
    }
  }

  const viewDash = document.getElementById('sk-view-dashboard');
  const viewVol = document.getElementById('sk-view-volumes');
  const viewHr = document.getElementById('sk-view-hr');

  if (main) {
    if (headerCard && headerCard.parentElement !== main) main.appendChild(headerCard);
    if (pillsRow) {
      pillsRow.classList.remove('ana-desk-sk-mode-pills');
      main.appendChild(pillsRow);
    }
    [viewDash, viewVol, viewHr].forEach((v) => {
      if (!v) return;
      v.classList.remove('ana-desk-sk-mobile-hide', 'hidden');
      main.appendChild(v);
    });
    const banner = document.getElementById('sk-contractor-queue-banner');
    if (banner && banner.parentElement !== main) main.insertBefore(banner, main.firstChild);
  }

  const exec = main && main.querySelector(':scope > .ana-desk-sk-exec');
  if (exec) exec.remove();

  root.classList.remove('ana-desk-sk');

  ['dashboard', 'volumes', 'hr'].forEach((m) => {
    const btn = document.getElementById('sk-btn-' + m);
    if (btn) btn.classList.remove('ana-desk-sk-pill', 'is-on');
  });

  // Restore mobile visibility for active mode (no sk_switchView — avoids desk re-entry)
  const mode = window.skCurrentSubTab || 'dashboard';
  if (viewDash) viewDash.classList.toggle('hidden', mode !== 'dashboard');
  if (viewVol) viewVol.classList.toggle('hidden', mode !== 'volumes');
  if (viewHr) viewHr.classList.toggle('hidden', mode !== 'hr');
}

/** Desktop График СМР — chrome + split поверх mobile #schedule-container. */
function paintScheduleDesktop() {
  if (!_shellApplied || !isDesktopViewport()) return;
  wrapScheduleRenderIfNeeded();
  const container = document.getElementById('schedule-container');
  if (!container) return;

  const run = () => {
    try { paintScheduleContent(); } catch (err) {
      console.warn('[AnalyticsDesktop] schedule content', err);
    }
  };

  if (container.children.length) {
    run();
    return;
  }
  if (typeof window.rbi_renderScheduleTab === 'function') {
    Promise.resolve(window.rbi_renderScheduleTab(true)).then(() => {
      if (_shellApplied && isDesktopViewport()) run();
    }).catch(() => { /* ignore */ });
  }
}

function wrapScheduleRenderIfNeeded() {
  if (typeof window.rbi_renderScheduleTab !== 'function') return;
  if (window.rbi_renderScheduleTab.__anaDeskWrapped) return;
  const origSched = window.rbi_renderScheduleTab;
  window.rbi_renderScheduleTab = async function () {
    const ret = await origSched.apply(this, arguments);
    if (_shellApplied && isDesktopViewport()) {
      const tab = (window.AnalyticsState && window.AnalyticsState.activeSubTab)
        || window.currentActiveAnalyticsTab;
      if (tab === 'sub-schedule') {
        try { paintScheduleContent(); } catch (_) { /* ignore */ }
      }
    }
    return ret;
  };
  window.rbi_renderScheduleTab.__anaDeskWrapped = true;
}

function clearScheduleDesktopArtifacts() {
  try { teardownScheduleDesktop(); } catch (_) { /* ignore */ }
  const root = document.getElementById('sub-schedule');
  if (root) root.classList.remove('ana-desk-sched');
}

function clearHistoryDesktopArtifacts() {
  const root = document.getElementById('sub-history');
  if (!root) return;

  const sticky = document.getElementById('hist-sticky-panel');
  const panelHeader = document.getElementById('hist-panel-header');
  const modeHost = root.querySelector('[data-hist-desk-mode-host]');
  const modeWrap = modeHost && modeHost.firstElementChild;
  if (panelHeader && modeWrap) {
    panelHeader.appendChild(modeWrap);
    modeWrap.classList.remove('ana-desk-hist-mode-pills');
  }
  panelHeader?.querySelector(':scope > span')?.classList.remove('ana-desk-hist-hide');

  clearHistoryDeskPanels();

  const viewChecks = document.getElementById('history-checks-view');
  const viewReports = document.getElementById('history-reports-view');
  const viewPlans = document.getElementById('history-plans-view');
  if (sticky) {
    sticky.classList.remove('ana-desk-hist-toolbar');
    root.appendChild(sticky);
  }
  [viewChecks, viewReports, viewPlans].forEach((v) => {
    if (!v) return;
    // Desktop showDeskMode left all three `hidden` — must clear or mobile History is blank
    v.classList.remove('ana-desk-hist-mobile-hide', 'hidden');
    root.appendChild(v);
  });

  const exec = root.querySelector(':scope > .ana-desk-hist-exec');
  if (exec) exec.remove();

  root.classList.remove('ana-desk-hist');
  root.classList.remove('ana-desk-hist--no-proj-filter');

  const planChip = document.getElementById('hist-filter-plan')?.closest('label');
  if (planChip) planChip.style.display = '';

  const body = document.getElementById('hist-panel-body');
  if (body) {
    body.style.maxHeight = '';
    body.style.opacity = '';
    body.style.margin = '';
    body.style.overflow = '';
  }

  ['checks', 'reports', 'plans'].forEach((m) => {
    const btn = document.getElementById('btn-hist-' + m);
    if (btn) btn.classList.remove('ana-desk-hist-pill', 'is-on');
  });

  // Restore mobile visibility for active mode (no switchHistoryView — avoids desk re-entry)
  const mode = window.currentHistoryViewMode || 'checks';
  if (viewChecks) viewChecks.classList.toggle('hidden', mode !== 'checks');
  if (viewReports) viewReports.classList.toggle('hidden', mode !== 'reports');
  if (viewPlans) viewPlans.classList.toggle('hidden', mode !== 'plans');
}

function getOnepagerMode() {
  if (typeof window.onepagerMode === 'undefined') window.onepagerMode = 'local';
  return window.onepagerMode === 'global' ? 'global' : 'local';
}

function setOnepagerMode(mode) {
  window.onepagerMode = mode === 'global' ? 'global' : 'local';
  if (winHasFn('renderCurrentAnalyticsTab')) winCall('renderCurrentAnalyticsTab');
}

function placeOnepagerToggleAboveFilters(el) {
  const toolbar = document.getElementById(TOOLBAR_ID);
  if (!el || !toolbar) return;
  const filters = document.getElementById('analytics-filters-block');
  if (filters && filters.parentElement === toolbar) {
    if (el.nextElementSibling !== filters) toolbar.insertBefore(el, filters);
  } else if (el.parentElement !== toolbar) {
    toolbar.insertBefore(el, toolbar.firstChild);
  }
}

function ensureOnepagerModeToggle() {
  let el = document.getElementById(OP_TOGGLE_ID);
  const toolbar = document.getElementById(TOOLBAR_ID);
  if (!toolbar) return el || null;
  if (!el) {
    el = document.createElement('div');
    el.id = OP_TOGGLE_ID;
    el.className = 'ana-desk-op-toggle hidden';
    el.innerHTML = ''
      + '<div class="ana-desk-op-toggle-pills" role="group" aria-label="' + _t('quality.analytics.desk.op_mode_aria', 'Режим сводки') + '">'
      + '  <button type="button" data-op-mode="local" class="ana-desk-op-pill">' + _t('quality.analytics.desk.op_object', 'Объект') + '</button>'
      + '  <button type="button" data-op-mode="global" class="ana-desk-op-pill">' + _t('quality.analytics.desk.op_company', 'Компания') + '</button>'
      + '</div>';
    el.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-op-mode]') : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      setOnepagerMode(btn.getAttribute('data-op-mode'));
    });
  } else {
    // Drop legacy "Сводка" label if present
    const label = el.querySelector('.ana-desk-op-toggle-label');
    if (label) label.remove();
  }
  placeOnepagerToggleAboveFilters(el);
  return el;
}

function syncOnepagerModeToggle(tabId) {
  const el = ensureOnepagerModeToggle();
  if (!el) return;
  const show = tabId === 'sub-onepager';
  el.classList.toggle('hidden', !show);
  if (!show) return;
  placeOnepagerToggleAboveFilters(el);
  const mode = getOnepagerMode();
  el.querySelectorAll('[data-op-mode]').forEach((btn) => {
    btn.classList.toggle('is-on', btn.getAttribute('data-op-mode') === mode);
  });
}

/** KPI strip is contractors pulse only — hide on other subtabs. */
function syncDesktopChrome(tabId) {
  const tab = tabId
    || (window.AnalyticsState && window.AnalyticsState.activeSubTab)
    || window.currentActiveAnalyticsTab
    || 'sub-contractors';
  const showPulse = tab === 'sub-contractors';
  const kpi = document.getElementById(KPI_ID);
  if (kpi) kpi.classList.toggle('hidden', !showPulse);
  const top = document.getElementById(TOP_ID);
  if (top) top.classList.toggle('ana-desk-top-pulse', showPulse);
  syncOnepagerModeToggle(tab);
}


let _origRenderOnePagerSubTab = null;

/** Section title text from flattened accordion. */
function opFlatTitleText(section) {
  const t = section && section.querySelector('.ana-desk-op-flat-title');
  return t ? String(t.textContent || '').trim() : '';
}

function opSectionBody(section) {
  if (!section) return null;
  const divs = section.querySelectorAll(':scope > div');
  for (let i = 0; i < divs.length; i++) {
    if (!divs[i].classList.contains('ana-desk-op-flat-title')) return divs[i];
  }
  return null;
}

function flattenOnePagerAccordions(container) {
  container.querySelectorAll('details').forEach((d) => {
    d.open = true;
    d.classList.add('ana-desk-op-flat');
    const sum = d.querySelector(':scope > summary');
    if (!sum || sum.dataset.anaDeskDone === '1') return;
    sum.dataset.anaDeskDone = '1';
    const title = document.createElement('div');
    title.className = 'ana-desk-op-flat-title';
    const clone = sum.cloneNode(true);
    clone.querySelectorAll('svg, button, span.transition-transform').forEach((n) => n.remove());
    title.textContent = String(clone.textContent || '').replace(/[▼▲]/g, '').replace(/\s+/g, ' ').trim();
    sum.replaceWith(title);
  });
}

function bumpOnePagerCharts(container) {
  const lineCanvas = container.querySelector('#op-line-chart');
  if (lineCanvas && lineCanvas.parentElement) {
    lineCanvas.parentElement.classList.add('ana-desk-op-chart-lg');
    lineCanvas.parentElement.style.height = '300px';
  }
  const sparkCanvas = container.querySelector('#op-sparkline-chart');
  if (sparkCanvas && sparkCanvas.parentElement) {
    sparkCanvas.parentElement.classList.add('ana-desk-op-spark-lg');
  }
}

function markOnePagerProjectCards(container) {
  container.querySelectorAll('.grid').forEach((g) => {
    if (g.classList.contains('ana-desk-op-kpi-band')) return;
    if (g.querySelectorAll(':scope > div.cursor-pointer, :scope > div[onclick]').length >= 1
      || /rbi_setAnalyticsProjectFilter/.test(g.innerHTML)) {
      g.classList.add('ana-desk-op-cards-native');
    }
  });
  container.querySelectorAll('.ana-desk-op-cards-native > div, .ana-desk-op-cards-native > button').forEach((card) => {
    card.classList.add('ana-desk-op-card-native');
  });
}

function wrapAsPanel(titleText, bodyNode, extraClass) {
  const panel = document.createElement('section');
  panel.className = 'ana-desk-op-panel' + (extraClass ? (' ' + extraClass) : '');
  if (titleText) {
    const h = document.createElement('h3');
    h.className = 'ana-desk-op-panel-title';
    h.textContent = titleText;
    panel.appendChild(h);
  }
  if (bodyNode) panel.appendChild(bodyNode);
  return panel;
}

/** Same thresholds as contractor cells: defects/checks → green / yellow / red. */
function heatBgByDefectRate(defectRate) {
  let bg = 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:border-green-800';
  if (defectRate > 1.5) {
    bg = 'bg-danger-soft text-danger border-danger font-black/40';
  } else if (defectRate > 0.5) {
    bg = 'bg-yellow-50 text-yellow-700 border-yellow-200 font-bold dark:bg-yellow-900/20 dark:border-yellow-800';
  }
  return bg;
}

/**
 * Color «Вид работ» (+ «Всего дефектов») by stage defect rate — same logic as matrix cells.
 * Desktop-only post-process (mobile render untouched).
 */
function colorHeatmapWorkTypeCells(root, data) {
  const table = root && root.querySelector('.ana-desk-op-panel-heat table');
  if (!table || !Array.isArray(data) || !data.length) return;

  const stages = {};
  data.forEach((check) => {
    if (!check || !check.metrics) return;
    const stage = check.templateTitle || check.templateKey || _t('quality.analytics.fallback.unknown_stage', 'Неизвестный этап');
    if (!stages[stage]) stages[stage] = { checks: 0, defects: 0 };
    stages[stage].checks += 1;
    stages[stage].defects += (Number(check.metrics.n_B2_fail) || 0)
      + (Number(check.metrics.n_B3_fail) || 0);
  });

  Array.prototype.forEach.call(table.querySelectorAll('tbody tr'), (tr) => {
    const stageTd = tr.cells[0];
    const totalTd = tr.cells[1];
    if (!stageTd) return;
    const stage = String(stageTd.getAttribute('title') || stageTd.textContent || '').trim();
    const agg = stages[stage];
    if (!agg || !agg.checks) return;
    const cls = heatBgByDefectRate(agg.defects / agg.checks);
    stageTd.className = 'p-2 border border-[var(--card-border)] font-bold sticky left-0 z-10 min-w-[120px] max-w-[160px] whitespace-normal leading-tight ' + cls;
    if (totalTd) {
      const left = totalTd.getAttribute('style') || 'left:120px';
      totalTd.className = 'p-2 border border-[var(--card-border)] text-center font-black sticky z-10 tabular-nums ' + cls;
      totalTd.setAttribute('style', left);
    }
  });
}

/**
 * Local (Объект): executive composition —
 * header → KPI band → trend|reliability → pulse|PDCA → heatmap → photos
 */
function layoutLocalExecutive(container) {
  const sections = Array.prototype.slice.call(container.querySelectorAll('.ana-desk-op-flat'));
  if (!sections.length) return;

  const stats = sections.find((s) => s.querySelector('#op-line-chart')) || sections[0];
  const pulse = sections.find((s) => s.querySelector('#pulse-ai-text'));
  const heat = sections.find((s) => {
    const t = opFlatTitleText(s).toLowerCase();
    return /тепловая|этап/.test(t) || (!!s.querySelector('table') && s !== stats);
  });
  const photos = sections.find((s) => /топ|дефект|эталон/.test(opFlatTitleText(s).toLowerCase()));
  const pdca = sections.find((s) => s.querySelector('#hidden_pdca_text'));

  const header = Array.prototype.find.call(container.children, (el) => {
    return el && !el.classList.contains('space-y-3') && !el.classList.contains('ana-desk-op-exec')
      && (el.querySelector('h2') || /сводный статус/i.test(el.textContent || ''));
  });

  const exec = document.createElement('div');
  exec.className = 'ana-desk-op-exec';

  if (header) {
    header.classList.add('ana-desk-op-hero');
    exec.appendChild(header);
  }

  // Unpack stats body
  const statsBody = opSectionBody(stats);
  if (statsBody) {
    const kids = Array.prototype.slice.call(statsBody.children);
    const kpiGrid = kids.find((el) => el.classList.contains('grid'));
    const chartBlock = kids.find((el) => el.querySelector && el.querySelector('#op-line-chart'));
    const ratingBlock = kids.find((el) => el !== kpiGrid && el !== chartBlock && /надёж|надеж|рейтинг/i.test(el.textContent || ''));
    const warn = kids.find((el) => /разрыв/i.test(el.textContent || ''));

    if (warn) {
      warn.classList.add('ana-desk-op-alert');
      exec.appendChild(warn);
    }
    if (kpiGrid) {
      kpiGrid.classList.add('ana-desk-op-kpi-band');
      exec.appendChild(kpiGrid);
    }

    const row = document.createElement('div');
    row.className = 'ana-desk-op-row-2';
    if (chartBlock) {
      chartBlock.classList.add('ana-desk-op-block');
      row.appendChild(wrapAsPanel('', chartBlock, 'ana-desk-op-panel-chart'));
    }
    if (ratingBlock) {
      ratingBlock.classList.add('ana-desk-op-block');
      row.appendChild(wrapAsPanel('', ratingBlock, 'ana-desk-op-panel-rank'));
    }
    if (row.childNodes.length) exec.appendChild(row);
  }

  const insightRow = document.createElement('div');
  insightRow.className = 'ana-desk-op-row-2';
  if (pulse) {
    const body = opSectionBody(pulse);
    if (body) insightRow.appendChild(wrapAsPanel(opFlatTitleText(pulse) || _t('quality.analytics.desk.pulse_object', 'Пульс объекта'), body, 'ana-desk-op-panel-pulse'));
  }
  if (pdca) {
    const body = opSectionBody(pdca);
    if (body) insightRow.appendChild(wrapAsPanel(opFlatTitleText(pdca) || _t('quality.analytics.onepager.quality_analytics', 'Аналитика качества'), body, 'ana-desk-op-panel-pdca'));
  }
  if (insightRow.childNodes.length) exec.appendChild(insightRow);

  if (heat) {
    const body = opSectionBody(heat);
    if (body) exec.appendChild(wrapAsPanel(opFlatTitleText(heat) || _t('quality.analytics.onepager.heatmap', 'Тепловая карта этапов'), body, 'ana-desk-op-panel-heat'));
  }
  if (photos) {
    const body = opSectionBody(photos);
    if (body) exec.appendChild(wrapAsPanel(opFlatTitleText(photos) || _t('quality.analytics.desk.top_defects', 'ТОП дефектов и эталонов'), body, 'ana-desk-op-panel-photos'));
  }

  // Clear old accordion stack and mount exec
  Array.prototype.slice.call(container.children).forEach((ch) => {
    if (ch !== exec) ch.remove();
  });
  container.appendChild(exec);
}

/**
 * Global (Компания): hero → project cards → AI → ranking grid
 */
function layoutGlobalExecutive(container) {
  const sections = Array.prototype.slice.call(container.querySelectorAll('.ana-desk-op-flat'));
  const header = Array.prototype.find.call(container.children, (el) => {
    return el && !el.classList.contains('space-y-3') && !el.classList.contains('ana-desk-op-exec')
      && (el.querySelector('h2') || /глобальн|компания/i.test(el.textContent || ''));
  });

  // Cards grid sits between header and space-y-3 in mobile markup
  let cardsGrid = null;
  Array.prototype.slice.call(container.querySelectorAll('.grid')).forEach((g) => {
    if (/rbi_setAnalyticsProjectFilter/.test(g.innerHTML)) cardsGrid = g;
  });

  const exec = document.createElement('div');
  exec.className = 'ana-desk-op-exec ana-desk-op-exec-global';

  if (header) {
    header.classList.add('ana-desk-op-hero');
    exec.appendChild(header);
  }
  if (cardsGrid) {
    const wrap = document.createElement('section');
    wrap.className = 'ana-desk-op-portfolio';
    const h = document.createElement('h3');
    h.className = 'ana-desk-op-panel-title';
    h.textContent = _t('quality.analytics.desk.portfolio_projects', 'Объекты портфеля');
    wrap.appendChild(h);
    cardsGrid.classList.add('ana-desk-op-cards-native');
    Array.prototype.slice.call(cardsGrid.children).forEach((c) => c.classList.add('ana-desk-op-card-native'));
    wrap.appendChild(cardsGrid);
    exec.appendChild(wrap);
  }

  const ai = sections.find((s) => s.querySelector('#global-ai-text') || /анализ портфеля|портфел/i.test(opFlatTitleText(s)));
  if (ai) {
    const body = opSectionBody(ai);
    if (body) exec.appendChild(wrapAsPanel(opFlatTitleText(ai) || _t('quality.analytics.desk.portfolio_analysis', 'Анализ портфеля'), body, 'ana-desk-op-panel-ai'));
  }

  const rankSections = sections.filter((s) => s !== ai);
  if (rankSections.length) {
    const grid = document.createElement('div');
    grid.className = 'ana-desk-op-rank-grid';
    rankSections.forEach((s) => {
      const body = opSectionBody(s);
      if (!body) return;
      grid.appendChild(wrapAsPanel(opFlatTitleText(s) || _t('quality.analytics.desk.rating', 'Рейтинг'), body));
    });
    exec.appendChild(grid);
  }

  Array.prototype.slice.call(container.children).forEach((ch) => {
    if (ch !== exec) ch.remove();
  });
  container.appendChild(exec);
}

function restyleOnePagerForDesktop(container) {
  if (!container) return;
  container.classList.add('ana-desk-op-native');
  flattenOnePagerAccordions(container);

  if (getOnepagerMode() === 'global') layoutGlobalExecutive(container);
  else layoutLocalExecutive(container);

  bumpOnePagerCharts(container);
  markOnePagerProjectCards(container);
}

let _opPaintTimer = null;
let _opPaintPayload = null;
let _opPaintFp = '';

function onepagerDesktopFingerprint(data) {
  const mode = getOnepagerMode();
  const n = Array.isArray(data) ? data.length : -1;
  const period = document.getElementById('global-filter-period')?.value || '';
  const dFrom = document.getElementById('filter-date-from')?.value || '';
  const dTo = document.getElementById('filter-date-to')?.value || '';
  const f = (window.activeMultiFilters && window.activeMultiFilters.analytics) || {};
  const tg = (window.trendGroupings && window.trendGroupings.onepager) || 'WEEK';
  const lines = (window.selectedChartFilters && window.selectedChartFilters.onepager) || [];
  return [
    mode,
    n,
    period,
    dFrom,
    dTo,
    tg,
    lines.join('\u0001'),
    (f.project || []).join('\u0001'),
    (f.contractor || []).join('\u0001'),
    (f.inspector || []).join('\u0001'),
    (f.template || []).join('\u0001')
  ].join('|');
}

function isOnePagerDesktopFresh(container, fp) {
  if (!container || !fp || fp !== _opPaintFp) return false;
  if (!container.classList.contains('ana-desk-op-native')) return false;
  // Нужен живой canvas тренда — иначе «свежий» layout без графика и фильтры/WEEK не перерисуют.
  const line = container.querySelector('#op-line-chart');
  if (!line) return false;
  return !!container.querySelector('.ana-desk-op-exec, .ana-desk-op-kpi-band');
}

function paintOnePagerDesktopNow(data) {
  if (!_shellApplied || !isDesktopViewport()) return;
  const container = document.getElementById('onepager-content-container');
  if (!container) return;
  const payload = Array.isArray(data) ? data : getFilteredData();
  const fp = onepagerDesktopFingerprint(payload);

  // Повторный afterTabPaint/wrap с теми же данными — не пересобирать DOM/Chart
  // (иначе график «мигает» один раз без смены цифр).
  if (isOnePagerDesktopFresh(container, fp)) return;

  // Full mobile data parity — then executive layout restyle
  let rendered = null;
  if (typeof _origRenderOnePagerSubTab === 'function') {
    try { rendered = _origRenderOnePagerSubTab(payload); } catch (_) { /* ignore */ }
  }
  // P2-0024: мобильная «Сводка» дорисовывается во втором шаге (async) — раскладку ПК делаем после него.
  Promise.resolve(rendered).then((ok) => {
    // P2-0024 доработка 1 (ревью №4): мобильная «Сводка» вышла по смене поколения — раскладку не трогаем,
    // отпечаток «свежо» не ставим (иначе при возврате с теми же фильтрами остался бы старый экран)
    if (ok === false) return;
    // Высоту графиков ставим ДО setTimeout(100) внутри mobile-render,
    // чтобы Chart создался уже в финальном размере (без resize-мигания).
    // P2-0024: тепловая карта строится при раскрытии блока; на ПК блоки раскрыты сразу — строим до раскраски.
    if (typeof window.rbiDrawOnePagerHeatmap === 'function') {
      try { window.rbiDrawOnePagerHeatmap(); } catch (_) { /* ignore */ }
    }
    restyleOnePagerForDesktop(container);
    colorHeatmapWorkTypeCells(container, payload);
    _opPaintFp = fp;
  }).catch(() => { /* ignore */ });
}

/** Схлопывает повторные вызовы из wrap + afterTabPaint. */
function paintOnePagerDesktop(data) {
  if (!_shellApplied || !isDesktopViewport()) return;
  _opPaintPayload = Array.isArray(data) ? data : null;
  if (_opPaintTimer) clearTimeout(_opPaintTimer);
  _opPaintTimer = setTimeout(() => {
    _opPaintTimer = null;
    paintOnePagerDesktopNow(_opPaintPayload);
  }, 50);
}

function isDeskOnepagerActive() {
  if (!_shellApplied || !isDesktopViewport()) return false;
  const tab = (window.AnalyticsState && window.AnalyticsState.activeSubTab)
    || window.currentActiveAnalyticsTab
    || '';
  if (tab === 'sub-onepager') return true;
  const sec = document.getElementById('sub-onepager');
  return !!(sec && !sec.classList.contains('hidden'));
}

function ensureShell() {
  const root = tabRoot();
  if (!root) return false;
  ensureDesktopCss();
  setWideLayout(true);

  const existing = document.getElementById(SHELL_ID);
  // Old aside-layout shell → rebuild
  if (existing && document.getElementById('analytics-desktop-aside')) {
    teardownShell();
  } else if (existing) {
    _shellApplied = true;
    root.classList.add('analytics-desktop-active');
    placeSubtabsInShell(existing);
    placeKpiInWorkspace(existing);
    return true;
  }

  const shell = document.createElement('div');
  shell.id = SHELL_ID;

  const top = document.createElement('div');
  top.id = TOP_ID;

  const toolbar = document.createElement('div');
  toolbar.id = TOOLBAR_ID;

  const kpi = document.createElement('div');
  kpi.id = KPI_ID;

  const work = document.createElement('div');
  work.id = WORK_ID;

  const note = document.createElement('div');
  note.id = NOTE_ID;
  note.className = 'hidden';

  const filters = document.getElementById('analytics-filters-block');
  const sections = Array.prototype.slice.call(root.querySelectorAll(':scope > .analytics-sub-section'));

  if (filters) toolbar.appendChild(filters);
  top.appendChild(toolbar);

  work.appendChild(kpi);
  work.appendChild(note);
  sections.forEach((sec) => { work.appendChild(sec); });

  shell.appendChild(top);
  shell.appendChild(work);
  root.appendChild(shell);
  placeSubtabsInShell(shell);
  placeKpiInWorkspace(shell);

  root.classList.add('analytics-desktop-active');
  root.style.maxWidth = 'none';
  root.style.width = '100%';
  setDetailEmptyState(true);

  _shellApplied = true;
  return true;
}

function clearDesktopListArtifacts() {
  const list = document.getElementById('contractors-list-container');
  if (list && (list.querySelector('.ana-desk-table, .ana-desk-table-wrap, .ana-desk-empty') || /ana-desk-/.test(list.innerHTML || ''))) {
    list.innerHTML = '';
  }
  const kpi = document.getElementById(KPI_ID);
  if (kpi) kpi.innerHTML = '';
  // Desktop force-expanded filters — restore collapsible defaults for mobile
  const anaBody = document.getElementById('analytics-panel-body');
  if (anaBody) {
    anaBody.style.maxHeight = '';
    anaBody.style.opacity = '';
    anaBody.style.overflow = '';
    anaBody.style.margin = '';
    anaBody.style.marginTop = '';
  }
  const anaIcon = document.getElementById('analytics-panel-toggle-icon');
  if (anaIcon) anaIcon.style.transform = '';
  if (typeof window.invalidateAnalyticsFilterCache === 'function') {
    try { window.invalidateAnalyticsFilterCache(); } catch (_) { /* ignore */ }
  }
  // Force mobile/desktop paint to treat tabs as dirty after desk DOM wipe
  try {
    if (window.AnalyticsState && window.AnalyticsState._paintedTabs) {
      delete window.AnalyticsState._paintedTabs['sub-contractors'];
      delete window.AnalyticsState._paintedTabs['sub-history'];
      delete window.AnalyticsState._paintedTabs['sub-onepager'];
      delete window.AnalyticsState._paintedTabs['sub-sk'];
      delete window.AnalyticsState._paintedTabs['sub-schedule'];
    }
  } catch (_) { /* ignore */ }
}

function teardownShell() {
  const root = tabRoot();
  const shell = document.getElementById(SHELL_ID);
  setWideLayout(false);
  _selectedContractor = null;
  _opPaintFp = '';
  if (_opPaintTimer) {
    clearTimeout(_opPaintTimer);
    _opPaintTimer = null;
  }

  const opToggle = document.getElementById(OP_TOGGLE_ID);
  if (opToggle) opToggle.remove();

  ['ana-desk-zone-c', 'ana-desk-zone-d'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
  destroyDeskCharts();
  const sub = document.getElementById('sub-contractors');
  if (sub) sub.classList.remove('ana-desk-split');
  clearDesktopListArtifacts();
  clearHistoryDesktopArtifacts();
  clearSkDesktopArtifacts();
  clearScheduleDesktopArtifacts();

  const detail = document.getElementById('contractor-detail-view');
  if (detail) {
    detail.classList.add('hidden');
    detail.classList.remove('ana-desk-detail-empty');
  }
  const main = document.getElementById('contractors-main-view');
  if (main) main.classList.remove('hidden');

  if (!root || !shell) {
    _shellApplied = false;
    if (root) root.classList.remove('analytics-desktop-active');
    return;
  }

  ORIG_ORDER.forEach((id) => {
    const el = document.getElementById(id);
    if (el) root.appendChild(el);
  });
  Array.prototype.slice.call(shell.querySelectorAll('.analytics-sub-section')).forEach((sec) => {
    root.appendChild(sec);
  });

  const subtabs = document.getElementById('analytics-subtabs-block');
  if (subtabs) {
    subtabs.classList.add('max-w-4xl', 'mx-auto');
    subtabs.classList.remove('max-w-none');
  }

  shell.remove();
  root.classList.remove('analytics-desktop-active');
  root.style.maxWidth = '';
  root.style.width = '';
  _shellApplied = false;
}

function afterTabPaint(tabId) {
  syncDesktopChrome(tabId);
  if (tabId === 'sub-onepager') {
    try { paintOnePagerDesktop(getFilteredData()); } catch (_) { /* ignore */ }
    return;
  }
  if (tabId === 'sub-history') {
    try { paintHistoryDesktop(); } catch (_) { /* ignore */ }
    return;
  }
  if (tabId === 'sub-sk') {
    try { paintSkDesktop(); } catch (_) { /* ignore */ }
    return;
  }
  if (tabId === 'sub-schedule') {
    try { paintScheduleDesktop(); } catch (_) { /* ignore */ }
    return;
  }
  if (tabId !== 'sub-contractors') return;
  refreshKpi();
  paintContractorsTable();
  paintContextZones();
  if (_selectedContractor) {
    openDesktopDetail(_selectedContractor, { force: true });
  } else {
    setDetailEmptyState(true);
    const main = document.getElementById('contractors-main-view');
    if (main) main.classList.remove('hidden');
    const sub = document.getElementById('sub-contractors');
    if (sub) sub.classList.remove('ana-desk-split');
  }
}

function doRenderActiveTab() {
  const fromHash = (window.AppRouter && typeof window.AppRouter.subTabIdFromPath === 'function')
    ? window.AppRouter.subTabIdFromPath(window.location.hash || '', '#/quality/analytics')
    : null;
  const targetTab = fromHash
    || (window.AnalyticsState && window.AnalyticsState.activeSubTab)
    || window.currentActiveAnalyticsTab
    || 'sub-contractors';

  updateFallbackNote(targetTab);
  syncDesktopChrome(targetTab);

  const btn = document.querySelector('#analytics-subtabs-block button[data-action-arg="' + targetTab + '"]');
  if (btn && winHasFn('switchAnalyticsSubTab')) {
    winCall('switchAnalyticsSubTab', targetTab, btn, { fromRouter: true });
  } else if (winHasFn('switchAnalyticsSubTab')) {
    winCall('switchAnalyticsSubTab', targetTab, null, { fromRouter: true });
  } else if (winHasFn('renderCurrentAnalyticsTab')) {
    winCall('renderCurrentAnalyticsTab');
  }

  // Mobile paint is async (rAF/setTimeout inside switch) — one coalesced follow-up.
  scheduleAfterTabPaint(targetTab, 100);

  winCall('updateFabButton', 'tab-analytics');
}

function isDeskContractorsActive() {
  if (!_shellApplied || !isDesktopViewport()) return false;
  const tab = (window.AnalyticsState && window.AnalyticsState.activeSubTab)
    || window.currentActiveAnalyticsTab
    || 'sub-contractors';
  return tab === 'sub-contractors' || !tab;
}

function deskRepaintContractors() {
  if (!isDeskContractorsActive()) return;
  try { refreshKpi(); } catch (_) { /* ignore */ }
  try { paintContractorsTable(); } catch (_) { /* ignore */ }
  // force: смена фильтра/списка — зоны и галереи пересобрать.
  try { paintContextZones({ force: true }); } catch (_) { /* ignore */ }
  try { neutralizeMobileGalleryMarkup(); } catch (_) { /* ignore */ }
}

/**
 * Patch AnalyticsRender + window: internal calls use AnalyticsRender.*,
 * so window-only wraps never see filter/SubTab paints.
 */
function wrapPaintFunctions() {
  const AR = window.AnalyticsRender;
  if (!AR) return;

  if (typeof AR.renderContractorsListOnly === 'function' && !AR.renderContractorsListOnly.__anaDeskWrapped) {
    const origList = AR.renderContractorsListOnly.bind(AR);
    const wrappedList = function (data) {
      if (isDeskContractorsActive()) {
        // Never paint mobile cards on desktop.
        deskRepaintContractors();
        return;
      }
      return origList(data);
    };
    wrappedList.__anaDeskWrapped = true;
    AR.renderContractorsListOnly = wrappedList;
    window.renderContractorsListOnly = wrappedList;
  } else if (typeof window.renderContractorsListOnly === 'function' && !window.renderContractorsListOnly.__anaDeskWrapped) {
    // Fallback if AR method already replaced oddly
    const origList = window.renderContractorsListOnly;
    const wrappedList = function (data) {
      if (isDeskContractorsActive()) {
        deskRepaintContractors();
        return;
      }
      return origList.apply(this, arguments);
    };
    wrappedList.__anaDeskWrapped = true;
    window.renderContractorsListOnly = wrappedList;
  }

  if (typeof AR.renderContractorsSubTab === 'function' && !AR.renderContractorsSubTab.__anaDeskWrapped) {
    const origSub = AR.renderContractorsSubTab.bind(AR);
    const wrappedSub = function (data) {
      const ret = origSub(data);
      if (isDeskContractorsActive()) {
        deskRepaintContractors();
      }
      return ret;
    };
    wrappedSub.__anaDeskWrapped = true;
    AR.renderContractorsSubTab = wrappedSub;
    window.renderContractorsSubTab = wrappedSub;
  }

  if (typeof AR.renderCurrentAnalyticsTab === 'function' && !AR.renderCurrentAnalyticsTab.__anaDeskWrapped) {
    const origTab = AR.renderCurrentAnalyticsTab.bind(AR);
    const wrappedTab = function () {
      const ret = origTab.apply(AR, arguments);
      // Только после реального paint — иначе silent sync / reuse схлопывает фото.
      if (_shellApplied && isDesktopViewport() && shouldScheduleDeskAfterTabPaint(ret)) {
        scheduleAfterTabPaint(
          (window.AnalyticsState && window.AnalyticsState.activeSubTab) || 'sub-contractors',
          80
        );
      }
      return ret;
    };
    wrappedTab.__anaDeskWrapped = true;
    AR.renderCurrentAnalyticsTab = wrappedTab;
    window.renderCurrentAnalyticsTab = wrappedTab;
  }

  if (typeof AR.renderOnePagerSubTab === 'function' && !AR.renderOnePagerSubTab.__anaDeskWrapped) {
    const origOp = AR.renderOnePagerSubTab.bind(AR);
    _origRenderOnePagerSubTab = origOp;
    const wrappedOp = function (data) {
      if (isDeskOnepagerActive()) {
        try { paintOnePagerDesktop(data); } catch (_) { /* ignore */ }
        return;
      }
      return origOp(data);
    };
    wrappedOp.__anaDeskWrapped = true;
    AR.renderOnePagerSubTab = wrappedOp;
    window.renderOnePagerSubTab = wrappedOp;
  } else if (typeof window.renderOnePagerSubTab === 'function' && !window.renderOnePagerSubTab.__anaDeskWrapped) {
    const origOp = window.renderOnePagerSubTab;
    _origRenderOnePagerSubTab = origOp.bind(window.AnalyticsRender || null);
    const wrappedOp = function (data) {
      if (isDeskOnepagerActive()) {
        try { paintOnePagerDesktop(data); } catch (_) { /* ignore */ }
        return;
      }
      return origOp.apply(this, arguments);
    };
    wrappedOp.__anaDeskWrapped = true;
    window.renderOnePagerSubTab = wrappedOp;
  } else if (!_origRenderOnePagerSubTab && AR && typeof AR.renderOnePagerSubTab === 'function') {
    // Already wrapped in a previous load — try to keep a usable orig if present
    if (AR.renderOnePagerSubTab.__anaDeskOrig) {
      _origRenderOnePagerSubTab = AR.renderOnePagerSubTab.__anaDeskOrig;
    }
  }
  if (_origRenderOnePagerSubTab && AR && AR.renderOnePagerSubTab) {
    AR.renderOnePagerSubTab.__anaDeskOrig = _origRenderOnePagerSubTab;
  }

  // After mode switch (checks/reports/plans) re-apply desktop chrome
  const wrapSwitchHist = (fn) => {
    if (!fn || fn.__anaDeskHistWrapped) return fn;
    const wrapped = function (view) {
      const ret = fn.apply(this, arguments);
      if (_shellApplied && isDesktopViewport()) {
        try { paintHistoryDesktop(); } catch (_) { /* ignore */ }
      }
      return ret;
    };
    wrapped.__anaDeskHistWrapped = true;
    return wrapped;
  };
  if (typeof window.switchHistoryView === 'function') {
    window.switchHistoryView = wrapSwitchHist(window.switchHistoryView);
  }
  if (window.AnalyticsActions && typeof window.AnalyticsActions.switchHistoryView === 'function') {
    window.AnalyticsActions.switchHistoryView = wrapSwitchHist(window.AnalyticsActions.switchHistoryView);
  }

  const wrapHistContent = (fn, modeHint) => {
    if (!fn || fn.__anaDeskHistContentWrapped) return fn;
    const wrapped = function () {
      const ret = fn.apply(this, arguments);
      if (_shellApplied && isDesktopViewport()) {
        const mode = modeHint || window.currentHistoryViewMode || 'checks';
        try { paintHistoryContent(mode); } catch (_) { /* ignore */ }
      }
      return ret;
    };
    wrapped.__anaDeskHistContentWrapped = true;
    return wrapped;
  };
  if (typeof window.renderReportsList === 'function') {
    window.renderReportsList = wrapHistContent(window.renderReportsList, 'reports');
  }
  if (window.AnalyticsRender && typeof window.AnalyticsRender.renderReportsList === 'function') {
    window.AnalyticsRender.renderReportsList = wrapHistContent(window.AnalyticsRender.renderReportsList, 'reports');
  }
  if (typeof window.renderHistoryTab === 'function') {
    window.renderHistoryTab = wrapHistContent(window.renderHistoryTab, null);
  }
  if (typeof window.applyHistoryFilters === 'function') {
    window.applyHistoryFilters = wrapHistContent(window.applyHistoryFilters, null);
  }

  // ПК СК desktop: after view switch / main tab paint
  const wrapSkDesk = (fn) => {
    if (!fn || fn.__anaDeskSkWrapped) return fn;
    const wrapped = function () {
      const ret = fn.apply(this, arguments);
      const finish = () => {
        if (!_shellApplied || !isDesktopViewport()) return;
        if (window.__anaDeskSkPainting) return;
        const tab = (window.AnalyticsState && window.AnalyticsState.activeSubTab)
          || window.currentActiveAnalyticsTab;
        const sk = document.getElementById('sub-sk');
        if (tab !== 'sub-sk' && (!sk || sk.classList.contains('hidden'))) return;
        try { paintSkDesktop(); } catch (_) { /* ignore */ }
      };
      if (ret && typeof ret.then === 'function') {
        return ret.then((v) => { finish(); return v; });
      }
      finish();
      return ret;
    };
    wrapped.__anaDeskSkWrapped = true;
    return wrapped;
  };
  if (typeof window.sk_switchView === 'function') {
    window.sk_switchView = wrapSkDesk(window.sk_switchView);
  }
  if (typeof window.sk_renderMainTab === 'function') {
    window.sk_renderMainTab = wrapSkDesk(window.sk_renderMainTab);
  }
  // Do NOT wrap sk_renderDashboard/Volumes/Hr — hostMobileView calls them while
  // rebuilding detail; a nested paintSkDesktop moves #sk-view-* into a detached node.

  wrapScheduleRenderIfNeeded();
}

function refreshAnalyticsDeskChromeI18n() {
  if (!_shellApplied || !isDesktopViewport()) return;

  const histTitle = document.querySelector('.ana-desk-hist-title');
  if (histTitle) histTitle.textContent = _t('quality.desk.analytics.hist_title', 'История');
  const histMode = document.querySelector('.ana-desk-hist-mode-pills');
  if (histMode) histMode.setAttribute('aria-label', _t('quality.desk.analytics.hist_mode_aria', 'Режим истории'));
  const histSub = document.querySelector('[data-hist-desk-sub]');
  if (histSub) {
    const mode = window.currentHistoryViewMode || 'checks';
    histSub.textContent = mode === 'reports'
      ? _t('quality.desk.analytics.hist_sub_reports', 'Архив отчётов')
      : (mode === 'plans'
        ? _t('quality.desk.analytics.hist_sub_plans', 'Планы этажей по объектам')
        : _t('quality.desk.analytics.hist_sub_checks', 'Журнал проверок'));
  }

  const skTitle = document.querySelector('.ana-desk-sk-title');
  if (skTitle) skTitle.textContent = _t('quality.desk.analytics.sk_title', 'ПК Стройконтроль');
  const skMode = document.querySelector('.ana-desk-sk-mode-pills');
  if (skMode) skMode.setAttribute('aria-label', _t('quality.desk.analytics.sk_mode_aria', 'Режим ПК СК'));

  const skModeId = window.skCurrentSubTab || 'dashboard';
  const periodEl = document.getElementById('sk-period-text');
  const skSub = document.querySelector('[data-sk-desk-sub]');
  if (skSub) {
    const n = (window.skRecords && window.skRecords.length) || 0;
    const period = periodEl ? String(periodEl.textContent || '').replace(/^Период:\s*/i, '') : '';
    const modeLabel = skModeId === 'volumes'
      ? _t('quality.desk.analytics.sk_mode_volumes', 'Объёмы')
      : (skModeId === 'hr'
        ? _t('quality.desk.analytics.sk_mode_engineers', 'Инженеры')
        : _t('quality.desk.analytics.sk_mode_dashboard', 'Дашборд'));
    skSub.textContent = _t('quality.desk.analytics.sk_sub_positions', '{mode} · {n} позиций', { mode: modeLabel, n: n })
      + (period ? ` · ${period}` : '');
  }
  ['dashboard', 'volumes', 'hr'].forEach((m) => {
    const btn = document.getElementById('sk-btn-' + m);
    if (!btn) return;
    const label = m === 'volumes'
      ? _t('quality.desk.analytics.sk_mode_volumes', 'Объёмы')
      : (m === 'hr'
        ? _t('quality.desk.analytics.sk_mode_engineers', 'Инженеры')
        : _t('quality.desk.analytics.sk_mode_dashboard', 'Дашборд'));
    _setSkBtnLabel(btn, label);
  });
}

function bindLocale() {
  if (_localeBound) return;
  _localeBound = true;
  if (window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function') {
    window.RBI.events.on('i18n:localeChanged', function () {
      try {
        refreshAnalyticsDeskChromeI18n();
        if (!_shellApplied || !isDesktopViewport()) return;
        const tab = (window.AnalyticsState && window.AnalyticsState.activeSubTab)
          || window.currentActiveAnalyticsTab
          || '';
        if (tab === 'sub-contractors') {
          const kpi = document.getElementById(KPI_ID);
          if (kpi) {
            try { kpi.innerHTML = buildKpiHtml(getFilteredData()); } catch (_) { /* ignore */ }
          }
          try { deskRepaintContractors(); } catch (_) { /* ignore */ }
        }
        if (tab === 'sub-sk') {
          try { paintSkDesktop(); } catch (_) { /* ignore */ }
        }
        if (typeof window.renderCurrentAnalyticsTab === 'function') {
          window.renderCurrentAnalyticsTab();
        }
      } catch (_) { /* ignore */ }
    });
  }
}

function bindDesktopHooks() {
  // Always (re)patch paint entrypoints — filter path calls AnalyticsRender.* directly.
  wrapPaintFunctions();
  bindLocale();

  if (_hooksBound) return;
  _hooksBound = true;

  // Keep page scroll position — mobile show/hide jumps to top.
  if (typeof window.showContractorDetailView === 'function' && !window.showContractorDetailView.__anaDeskScrollWrapped) {
    const origShow = window.showContractorDetailView;
    window.showContractorDetailView = function () {
      const y = window.scrollY || window.pageYOffset || 0;
      const ret = origShow.apply(this, arguments);
      if (_shellApplied && isDesktopViewport()) {
        window.scrollTo(0, y);
        requestAnimationFrame(() => window.scrollTo(0, y));
      }
      return ret;
    };
    window.showContractorDetailView.__anaDeskScrollWrapped = true;
  }
  if (typeof window.hideContractorDetailView === 'function' && !window.hideContractorDetailView.__anaDeskScrollWrapped) {
    const origHide = window.hideContractorDetailView;
    window.hideContractorDetailView = function () {
      const y = window.scrollY || window.pageYOffset || 0;
      const ret = origHide.apply(this, arguments);
      if (_shellApplied && isDesktopViewport()) {
        window.scrollTo(0, y);
        requestAnimationFrame(() => window.scrollTo(0, y));
      }
      return ret;
    };
    window.hideContractorDetailView.__anaDeskScrollWrapped = true;
  }

  if (typeof window.switchAnalyticsSubTab === 'function' && !window.switchAnalyticsSubTab.__anaDeskWrapped) {
    const origSwitch = window.switchAnalyticsSubTab;
    window.switchAnalyticsSubTab = function (tabId, btnElement) {
      const ret = origSwitch.apply(this, arguments);
      if (_shellApplied && isDesktopViewport()) {
        // Markup leaves a permanent `active` on Подрядчики — sync highlight by data-action-arg.
        document.querySelectorAll('#analytics-subtabs-block .sub-tab-btn').forEach((el) => {
          const isOn = el.getAttribute('data-action-arg') === tabId;
          el.classList.toggle('active', isOn);
          el.classList.toggle('bg-white', isOn);
          el.classList.toggle('shadow-sm', isOn);
          el.classList.toggle('text-brand', isOn);
          el.classList.toggle('text-[var(--text-muted)]', !isOn);
        });
        try { updateFallbackNote(tabId); } catch (_) { /* ignore */ }
        try { syncDesktopChrome(tabId); } catch (_) { /* ignore */ }
        if (tabId === 'sub-onepager') {
          scheduleAfterTabPaint('sub-onepager', 100);
        } else if (tabId === 'sub-history') {
          scheduleAfterTabPaint('sub-history', 100);
        } else if (tabId === 'sub-sk') {
          scheduleAfterTabPaint('sub-sk', 100);
        } else if (tabId === 'sub-schedule') {
          scheduleAfterTabPaint('sub-schedule', 150);
        } else if (tabId !== 'sub-contractors') {
          _selectedContractor = null;
          const sub = document.getElementById('sub-contractors');
          if (sub) sub.classList.remove('ana-desk-split');
        } else {
          scheduleAfterTabPaint('sub-contractors', 100);
        }
      }
      return ret;
    };
    window.switchAnalyticsSubTab.__anaDeskWrapped = true;
  }

  const scheduleRefresh = () => {
    if (!_shellApplied || !isDesktopViewport()) return;
    setTimeout(() => {
      deskRepaintContractors();
      if (isDeskOnepagerActive()) {
        try { paintOnePagerDesktop(getFilteredData()); } catch (_) { /* ignore */ }
      }
      const tab = (window.AnalyticsState && window.AnalyticsState.activeSubTab) || window.currentActiveAnalyticsTab;
      if (tab === 'sub-history') {
        try { paintHistoryDesktop(); } catch (_) { /* ignore */ }
      }
      if (tab === 'sub-sk') {
        try { paintSkDesktop(); } catch (_) { /* ignore */ }
      }
      try { updateFallbackNote(tab); } catch (_) { /* ignore */ }
      try { syncDesktopChrome(tab); } catch (_) { /* ignore */ }
    }, 60);
  };

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t || !_shellApplied) return;
    if (t.closest && t.closest('#analytics-filters-block')) scheduleRefresh();
  }, true);

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !_shellApplied || !isDesktopViewport()) return;

    const sortTh = t.closest && t.closest('[data-ana-desk-c-sort]');
    if (sortTh) {
      e.preventDefault();
      e.stopPropagation();
      const key = sortTh.getAttribute('data-ana-desk-c-sort');
      if (!key) return;
      if (_deskContractorSort.key === key) {
        _deskContractorSort.dir = _deskContractorSort.dir === 'desc' ? 'asc' : 'desc';
      } else {
        _deskContractorSort = {
          key,
          dir: (key === 'name') ? 'asc' : 'desc'
        };
      }
      try { paintContractorsTable(); } catch (_) { /* ignore */ }
      return;
    }

    const row = t.closest && t.closest('[data-ana-desk-contractor]');
    if (row) {
      e.preventDefault();
      e.stopPropagation();
      openDesktopDetail(row.getAttribute('data-ana-desk-contractor'));
      return;
    }

    if (t.closest && t.closest('#analytics-subtabs-block')) {
      setTimeout(() => {
        const tab = (window.AnalyticsState && window.AnalyticsState.activeSubTab)
          || window.currentActiveAnalyticsTab;
        try { updateFallbackNote(tab); } catch (_) { /* ignore */ }
        if (tab === 'sub-contractors') scheduleRefresh();
      }, 30);
      return;
    }

    if (t.closest && (
      t.closest('[data-multifilter-action]')
      || t.closest('#analytics-filters-block')
      || t.closest('#contractors-chips-container')
    )) {
      scheduleRefresh();
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _shellApplied && isDesktopViewport() && _selectedContractor) {
      closeDesktopDetail();
    }
  });
}

function show() {
  if (!ensureMarkupMounted()) {
    console.warn('[AnalyticsDesktopRender] #tab-analytics missing');
    return;
  }
  if (!ensureShell()) return;

  expandFiltersForDesktop();
  bindDesktopHooks();

  if (winHasFn('updateAnalyticsFilters')) winCall('updateAnalyticsFilters');

  let hadDataOnOpen = false;
  try {
    const inspections0 = window.RBI && window.RBI.services && window.RBI.services.inspections
      ? window.RBI.services.inspections.getAllForAnalyticsSync()
      : [];
    hadDataOnOpen = Array.isArray(inspections0) && inspections0.length > 0;
  } catch (_) { hadDataOnOpen = false; }

  doRenderActiveTab();

  let retryCount = 0;
  const retryMax = 25;
  const retryTimer = setInterval(() => {
    retryCount++;
    const activeSection = document.querySelector('.view-section.active');
    if (!activeSection || activeSection.id !== 'tab-analytics' || !isDesktopViewport()) {
      clearInterval(retryTimer);
      return;
    }
    let inspections = [];
    try {
      inspections = window.RBI.services.inspections.getAllForAnalyticsSync() || [];
    } catch (_) { inspections = []; }
    if (inspections.length > 0) {
      clearInterval(retryTimer);
      if (!hadDataOnOpen) {
        if (winHasFn('updateAnalyticsFilters')) winCall('updateAnalyticsFilters');
        doRenderActiveTab();
      } else {
        afterTabPaint((window.AnalyticsState && window.AnalyticsState.activeSubTab) || 'sub-contractors');
      }
      return;
    }
    if (retryCount >= retryMax) clearInterval(retryTimer);
  }, 200);

  expandFiltersForDesktop();
}

function bindResizeWatcher(onNavigate) {
  if (typeof onNavigate === 'function') _onResizeNavigate = onNavigate;
  if (_resizeBound) return;
  _resizeBound = true;
  let timer = null;
  let lastDesktop = isDesktopViewport();
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const active = document.getElementById('tab-analytics');
      if (!active || !active.classList.contains('active')) {
        lastDesktop = isDesktopViewport();
        return;
      }
      const nowDesktop = isDesktopViewport();
      if (nowDesktop === lastDesktop) return;
      lastDesktop = nowDesktop;
      // Breakpoint crossed: apply/drop desktop shell immediately (don't rely on defer).
      if (!nowDesktop) {
        try { teardownShell(); } catch (_) { /* ignore */ }
      } else {
        try { show(); } catch (_) { /* ignore */ }
      }
      if (typeof _onResizeNavigate === 'function') _onResizeNavigate();
    }, 120);
  });
}

export const AnalyticsDesktopRender = {
  DESKTOP_MIN,
  isDesktop: isDesktopViewport,
  isShellApplied: () => !!(
    _shellApplied
    && document.getElementById(SHELL_ID)
    && document.body.classList.contains(WIDE_CLASS)
  ),
  ensureShell,
  teardown: teardownShell,
  refreshKpi,
  paintContractorsTable,
  show,
  bindResizeWatcher
};

console.log('[AnalyticsDesktopRender] analytics.desktop.render.js loaded (A–D)');

if (typeof window !== 'undefined') {
  window.AnalyticsDesktopRender = AnalyticsDesktopRender;
}
