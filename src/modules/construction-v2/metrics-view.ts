/**
 * Subview «Сроки» construction-v2 — KPI + разрезы + топ просроченных.
 */

import type { ConstructionDefectV2 } from '../../services/construction-defects/types';
import type { LocationNode } from '../../services/locations/types';
import {
  type DefectSlaMetrics,
  type PeriodPreset,
  computeDefectSlaMetrics
} from './defect-sla-metrics';

export type MetricsViewCallbacks = {
  onOpenDefect: (id: string) => void;
};

type LocSvc = {
  listNodes: (opts?: { nodeType?: string; parentId?: string | null }) => LocationNode[];
  getPath: (id: string) => LocationNode[];
  getChildren: (parentId: string | null) => LocationNode[];
};

type DefectsSvc = {
  list: (opts?: { includeDeleted?: boolean }) => ConstructionDefectV2[];
};

let _period: PeriodPreset = 'all';
let _objectId: string | null = null;
let _boundHost: HTMLElement | null = null;

function _t(key: string, fallback: string, vars?: Record<string, string | number>): string {
  try {
    const i18n = window.RBI?.services?.i18n as
      | { t?: (k: string, v?: Record<string, string | number>) => string }
      | undefined;
    if (i18n && typeof i18n.t === 'function') {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
    /* ignore */
  }
  if (!vars) return fallback;
  return String(fallback).replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}

function _escape(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _fmt(n: number | null, suffix = ''): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n}${suffix}`;
}

function _contractorLabel(id: string | null | undefined): string {
  const cid = String(id || '').trim();
  if (!cid || cid === '—') return '—';
  try {
    const svc = window.RBI?.services?.contractors as
      | { list?: () => Array<{ id?: string; display_name?: string; name?: string }> }
      | undefined;
    const fromSvc = svc?.list?.() || [];
    const hit = fromSvc.find((c) => String(c.id) === cid);
    if (hit) return String(hit.display_name || hit.name || cid);
  } catch {
    /* ignore */
  }
  return cid.length > 12 ? `${cid.slice(0, 8)}…` : cid;
}

/** Все locationId (floor/apartment) под объектом. */
function _locationIdsUnderObject(loc: LocSvc, objectId: string): Set<string> {
  const ids = new Set<string>();
  const walk = (parentId: string) => {
    ids.add(parentId);
    for (const ch of loc.getChildren(parentId) || []) {
      walk(ch.id);
    }
  };
  walk(objectId);
  return ids;
}

function _kpiCard(label: string, value: string, tone = ''): string {
  const toneCls =
    tone === 'danger'
      ? 'border-danger-soft'
      : tone === 'ok'
        ? 'border-emerald-200 dark:border-emerald-900/40'
        : 'border-[var(--card-border)]';
  return `<div class="min-w-[7.5rem] flex-1 bg-[var(--card-bg)] border ${toneCls} rounded-2xl px-3 py-2.5">
    <div class="text-rbi-caption font-black uppercase tracking-widest text-muted mb-1">${_escape(label)}</div>
    <div class="text-[18px] font-black text-ink leading-none">${_escape(value)}</div>
  </div>`;
}

function _barRow(label: string, count: number, max: number, color: string): string {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return `<div class="flex items-center gap-2 text-rbi-label mb-1.5">
    <span class="w-12 shrink-0 font-bold text-muted">${_escape(label)}</span>
    <div class="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <div class="h-full ${color}" style="width:${pct}%"></div>
    </div>
    <span class="w-8 text-right font-bold text-ink">${count}</span>
  </div>`;
}

function _periodBtn(p: PeriodPreset, label: string): string {
  const on = _period === p;
  return `<button type="button" data-c2-metrics-period="${p}"
    class="px-2.5 py-1 rounded-lg text-rbi-caption font-bold border transition-colors ${
      on
        ? 'bg-brand text-white border-brand'
        : 'bg-transparent text-muted border-surface hover:border-brand-soft'
    }">${_escape(label)}</button>`;
}

export function renderMetricsView(
  host: HTMLElement,
  opts: {
    loc: LocSvc;
    defectsSvc: DefectsSvc | null;
    /** MVP: опционально сузить к этажу (если выбран в дереве) — не используется в текущем UI; object filter. */
    selectedFloorId?: string | null;
    cb: MetricsViewCallbacks;
  }
): void {
  const { loc, defectsSvc, cb } = opts;
  const objects = loc.listNodes({ nodeType: 'object', parentId: null }) || [];

  const allDefects = defectsSvc?.list?.({ includeDeleted: false }) || [];
  let locationIds: Set<string> | null = null;
  if (_objectId) {
    locationIds = _locationIdsUnderObject(loc, _objectId);
  }

  const m: DefectSlaMetrics = computeDefectSlaMetrics(allDefects, {
    period: _period,
    locationIds
  });

  const agingMax = Math.max(1, ...Object.values(m.aging));

  const objectOptions = [
    `<option value="">${_escape(_t('construction.v2.metrics.all_objects', 'Все объекты'))}</option>`,
    ...objects.map(
      (o) =>
        `<option value="${_escape(o.id)}"${_objectId === o.id ? ' selected' : ''}>${_escape(
          o.displayName
        )}</option>`
    )
  ].join('');

  const catRows = m.byCategory
    .map(
      (r) => `<tr class="border-t border-slate-100 dark:border-slate-800">
      <td class="py-1.5 pr-2 font-bold">${_escape(r.category)}</td>
      <td class="py-1.5 pr-2 text-right">${r.open}</td>
      <td class="py-1.5 pr-2 text-right ${r.overdue ? 'text-danger font-semibold' : ''}">${r.overdue}</td>
      <td class="py-1.5 text-right">${_fmt(r.avgEliminateDays)}</td>
    </tr>`
    )
    .join('');

  const contrRows =
    m.byContractor.length === 0
      ? `<tr><td colspan="4" class="py-3 text-center text-muted text-rbi-body">${_escape(_t('construction.v2.metrics.no_data', 'Нет данных'))}</td></tr>`
      : m.byContractor
          .map(
            (r) => `<tr class="border-t border-slate-100 dark:border-slate-800">
      <td class="py-1.5 pr-2 font-medium truncate max-w-[10rem]" title="${_escape(r.contractorId)}">${_escape(
              _contractorLabel(r.contractorId)
            )}</td>
      <td class="py-1.5 pr-2 text-right">${r.open}</td>
      <td class="py-1.5 pr-2 text-right ${r.overdue ? 'text-danger font-semibold' : ''}">${r.overdue}</td>
      <td class="py-1.5 text-right">${_fmt(r.avgEliminateDays)}</td>
    </tr>`
          )
          .join('');

  const overdueRows =
    m.overdueList.length === 0
      ? `<div class="p-4 text-center text-muted text-rbi-body">${_escape(_t('construction.v2.metrics.no_overdue', 'Нет просроченных'))}</div>`
      : `<ul class="divide-y divide-slate-100 dark:divide-slate-800">
          ${m.overdueList
            .map(
              (r) => `<li>
            <button type="button" data-c2-metrics-def="${_escape(r.id)}"
              class="w-full text-left px-3 py-2.5 hover:bg-danger-soft transition-colors">
              <span class="flex flex-wrap items-center gap-1.5 mb-0.5">
                <span class="text-rbi-caption font-bold text-muted">${_escape(r.category)}</span>
                <span class="text-rbi-caption font-bold uppercase text-danger">${_escape(_t('construction.v2.metrics.overdue_days', '+{days} дн. проср.', { days: r.daysOverdue }))}</span>
                <span class="text-rbi-caption text-muted">${_escape(_t('construction.v2.metrics.open_days', '{days} дн. открыто', { days: r.daysOpen }))}</span>
              </span>
              <span class="block text-rbi-body font-medium text-ink line-clamp-2">${_escape(
                r.description
              )}</span>
            </button>
          </li>`
            )
            .join('')}
        </ul>`;

  host.innerHTML = `
    <div class="flex flex-col gap-3 p-3 sm:p-4 overflow-y-auto max-h-[calc(100vh-8rem)]">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 class="text-rbi-title font-black text-ink tracking-tight">${_escape(_t('construction.v2.metrics.title', 'Сроки замечаний'))}</h3>
          <p class="text-rbi-caption text-muted mt-0.5">${_escape(_t('construction.v2.metrics.subtitle', 'Локальный расчёт по defects_v2 · без новой схемы БД'))}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex gap-1">${_periodBtn('30', _t('construction.v2.metrics.period_30', '30 дн.'))}${_periodBtn('90', _t('construction.v2.metrics.period_90', '90 дн.'))}${_periodBtn('all', _t('construction.v2.metrics.period_all', 'Все'))}</div>
          <select data-c2-metrics-object
            class="text-rbi-label font-bold rounded-xl border border-surface bg-[var(--card-bg)] px-2 py-1.5 max-w-[12rem]">
            ${objectOptions}
          </select>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        ${_kpiCard(_t('construction.v2.metrics.kpi_open', 'Открытые'), String(m.open))}
        ${_kpiCard(_t('construction.v2.metrics.kpi_overdue', 'Просроченные'), String(m.overdueNow), m.overdueNow ? 'danger' : '')}
        ${_kpiCard(_t('construction.v2.metrics.kpi_avg_fix', 'Ср. устранение'), _fmt(m.avgEliminateDays, _t('construction.v2.metrics.days_suffix', ' дн.')))}
        ${_kpiCard(_t('construction.v2.metrics.kpi_avg_review', 'Ср. проверка СК'), _fmt(m.avgReviewDays, _t('construction.v2.metrics.days_suffix', ' дн.')))}
        ${_kpiCard(_t('construction.v2.metrics.kpi_on_time', '% вовремя'), m.onTimePct == null ? '—' : `${m.onTimePct}%`, m.onTimePct != null && m.onTimePct >= 80 ? 'ok' : '')}
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-3">
          <div class="text-rbi-caption font-black uppercase tracking-widest text-muted mb-2">${_escape(_t('construction.v2.metrics.by_category', 'По категории'))}</div>
          <table class="w-full text-rbi-label text-ink">
            <thead><tr class="text-rbi-caption uppercase tracking-wider text-muted">
              <th class="text-left font-bold pb-1">${_escape(_t('construction.v2.metrics.th_cat', 'Cat'))}</th>
              <th class="text-right font-bold pb-1">${_escape(_t('construction.v2.metrics.th_open', 'Откр.'))}</th>
              <th class="text-right font-bold pb-1">${_escape(_t('construction.v2.metrics.th_overdue', 'Проср.'))}</th>
              <th class="text-right font-bold pb-1">${_escape(_t('construction.v2.metrics.th_avg_days', 'Ср. дн.'))}</th>
            </tr></thead>
            <tbody>${catRows}</tbody>
          </table>
        </div>
        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-3">
          <div class="text-rbi-caption font-black uppercase tracking-widest text-muted mb-2">${_escape(_t('construction.v2.metrics.aging_open', 'Aging открытых'))}</div>
          ${_barRow(_t('construction.v2.metrics.aging_0_3', '0–3'), m.aging['0-3'], agingMax, 'bg-emerald-500')}
          ${_barRow(_t('construction.v2.metrics.aging_4_7', '4–7'), m.aging['4-7'], agingMax, 'bg-amber-400')}
          ${_barRow(_t('construction.v2.metrics.aging_8_14', '8–14'), m.aging['8-14'], agingMax, 'bg-orange-500')}
          ${_barRow(_t('construction.v2.metrics.aging_15_plus', '15+'), m.aging['15+'], agingMax, 'bg-danger')}
        </div>
      </div>

      <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-3">
        <div class="text-rbi-caption font-black uppercase tracking-widest text-muted mb-2">${_escape(_t('construction.v2.metrics.by_contractor', 'По подрядчику (топ-10 по просрочке)'))}</div>
        <table class="w-full text-rbi-label text-ink">
          <thead><tr class="text-rbi-caption uppercase tracking-wider text-muted">
            <th class="text-left font-bold pb-1">${_escape(_t('construction.form.contractor', 'Подрядчик'))}</th>
            <th class="text-right font-bold pb-1">${_escape(_t('construction.v2.metrics.th_open', 'Откр.'))}</th>
            <th class="text-right font-bold pb-1">${_escape(_t('construction.v2.metrics.th_overdue', 'Проср.'))}</th>
            <th class="text-right font-bold pb-1">${_escape(_t('construction.v2.metrics.th_avg_days', 'Ср. дн.'))}</th>
          </tr></thead>
          <tbody>${contrRows}</tbody>
        </table>
      </div>

      <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        <div class="px-3 py-2 border-b border-surface text-rbi-caption font-black uppercase tracking-widest text-danger">
          ${_escape(_t('construction.v2.metrics.overdue_now', 'Просроченные сейчас · до 20'))}
        </div>
        ${overdueRows}
      </div>
    </div>`;

  _boundHost = host;

  host.querySelectorAll('[data-c2-metrics-period]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      const p = (btn as HTMLElement).getAttribute('data-c2-metrics-period') as PeriodPreset | null;
      if (!p || p === _period) return;
      _period = p;
      renderMetricsView(host, opts);
    });
  });

  const sel = host.querySelector('[data-c2-metrics-object]') as HTMLSelectElement | null;
  sel?.addEventListener('change', () => {
    _objectId = sel.value || null;
    renderMetricsView(host, opts);
  });

  host.querySelectorAll('[data-c2-metrics-def]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      const id = (btn as HTMLElement).getAttribute('data-c2-metrics-def');
      if (id) cb.onOpenDefect(id);
    });
  });
}

export function getMetricsPeriod(): PeriodPreset {
  return _period;
}

export function resetMetricsFilters(): void {
  _period = 'all';
  _objectId = null;
  _boundHost = null;
}
