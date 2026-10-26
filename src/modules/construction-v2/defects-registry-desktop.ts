/**
 * Desktop-таблица реестра замечаний этажа (construction-v2 subview `defects`, ≥1280px).
 * Тот же контракт опций, что у `renderDefectsRegistry` (mobile) — переиспользует
 * `filterDefects` (defects-registry.ts) и SLA-функции (defect-sla-metrics.ts),
 * не копирует бизнес-логику фильтрации/просрочки.
 */

import type { ConstructionDefectV2 } from '../../services/construction-defects/types';
import { daysOpen, deadlineEndOfDay, isOverdueNow } from './defect-sla-metrics';
import { type PinFilters, pinFiltersState, renderPinFiltersHtml } from './pin-filters';
import { filterDefectsForRole } from './contractor-scope';
import { filterDefects, type DefectsRegistryCallbacks } from './defects-registry';

let _overdueOnly = false;

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

function _stripHtml(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function _statusLabel(s: string): string {
  const map: Record<string, [string, string]> = {
    issued: ['construction.status.issued', 'Выдано'],
    in_progress: ['construction.status.in_progress', 'В работе'],
    fixed: ['construction.form.status_fixed', 'Устранено'],
    closed: ['construction.status.closed', 'Закрыто'],
    rejected: ['construction.status.rejected', 'Отклонено'],
    open: ['construction.status.issued', 'Выдано'],
    cancelled: ['construction.status.rejected', 'Отклонено']
  };
  const entry = map[s];
  return entry ? _t(entry[0], entry[1]) : s || '—';
}

function _categoryLabel(c: string): string {
  const v = String(c || '').toUpperCase();
  if (v === 'B1' || v === 'MINOR') return 'B1';
  if (v === 'B3' || v === 'CRITICAL') return 'B3';
  if (v === 'B2' || v === 'MAJOR') return 'B2';
  return v || '—';
}

function _categoryBar(c: string): string {
  const v = String(c || '').toUpperCase();
  if (v === 'B1' || v === 'MINOR') return 'bg-blue-500';
  if (v === 'B3' || v === 'CRITICAL') return 'bg-danger';
  return 'bg-orange-500';
}

function _statusChip(status: string): string {
  const st = String(status || '').toLowerCase();
  let cls = 'bg-slate-100 text-ink dark:bg-slate-800';
  if (st === 'issued' || st === 'open') cls = 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300';
  else if (st === 'in_progress') cls = 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
  else if (st === 'fixed') cls = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
  else if (st === 'closed') cls = 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300';
  else if (st === 'rejected' || st === 'cancelled') cls = 'bg-slate-100 text-muted dark:bg-slate-800';
  return `<span class="inline-block px-1.5 py-0.5 rounded-md text-rbi-caption font-bold ${cls}">${_escape(
    _statusLabel(st)
  )}</span>`;
}

function _deadlineMeta(d: ConstructionDefectV2): { label: string; overdue: boolean } {
  if (d.deadline == null || d.deadline === '') return { label: _t('construction.v2.registry.no_deadline', 'без срока'), overdue: false };
  const m = String(d.deadline).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return { label: String(d.deadline), overdue: false };
  const [y, mo, day] = m[1].split('-');
  const label = `${day}.${mo}.${y}`;
  return { label, overdue: isOverdueNow(d) };
}

function _deadlineSortKey(d: ConstructionDefectV2): number {
  const end = deadlineEndOfDay(d.deadline);
  return end ? end.getTime() : Number.POSITIVE_INFINITY;
}

/** Просроченные сверху, затем по deadline ASC (без срока — в конце) — тот же порядок, что у mobile. */
function _sortRegistry(list: ConstructionDefectV2[]): ConstructionDefectV2[] {
  return list.slice().sort((a, b) => {
    const ao = isOverdueNow(a) ? 0 : 1;
    const bo = isOverdueNow(b) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return _deadlineSortKey(a) - _deadlineSortKey(b);
  });
}

export function renderDefectsRegistryDesktop(
  host: HTMLElement,
  opts: {
    floorId: string | null;
    floorLabel?: string;
    defects: ConstructionDefectV2[];
    filters?: PinFilters;
    cb: DefectsRegistryCallbacks;
  }
): void {
  const { floorId, floorLabel, cb } = opts;
  const defects = filterDefectsForRole(opts.defects || []);
  const filters = opts.filters || pinFiltersState;

  if (!floorId) {
    host.innerHTML = `<div class="flex items-center justify-center h-full min-h-[240px] text-muted text-rbi-body font-medium px-6 text-center">
      ${_escape(_t('construction.v2.registry.select_floor', 'Выберите этаж слева, чтобы увидеть реестр замечаний'))}
    </div>`;
    return;
  }

  let filtered = filterDefects(defects, filters);
  if (_overdueOnly) {
    filtered = filtered.filter((d) => isOverdueNow(d));
  }
  filtered = _sortRegistry(filtered);

  const overdueChipCls = _overdueOnly
    ? 'bg-danger text-white border-danger'
    : 'bg-surface text-danger border-danger-soft hover:bg-danger-soft';

  const rows =
    filtered.length === 0
      ? `<tr><td colspan="6" class="p-8 text-center text-muted text-rbi-body font-medium">
          ${_escape(_t('construction.v2.registry.empty_filter', 'Нет замечаний по выбранному фильтру'))}
        </td></tr>`
      : filtered
          .map((d, i) => {
            const desc = _stripHtml(
              String(d.description || d.item_name || d.text || _t('construction.v2.no_description', 'Без описания'))
            ).slice(0, 200);
            const dl = _deadlineMeta(d);
            const openDays = daysOpen(d);
            const dlCls = dl.overdue ? 'text-danger font-semibold' : 'text-muted';
            const bar = _categoryBar(String(d.category));
            const rowBg = dl.overdue ? 'bg-danger-soft' : '';
            return `<tr class="${rowBg} hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors border-b border-surface">
              <td class="p-0 w-1"><div class="w-1 h-full ${bar}"></div></td>
              <td class="px-3 py-2.5 align-top">
                <button type="button" data-c2-def-row="${_escape(d.id)}" class="text-left w-full flex items-start gap-2.5">
                  <span class="shrink-0 w-6 h-6 mt-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-ink
                               flex items-center justify-center text-rbi-caption font-bold">${i + 1}</span>
                  <span class="min-w-0">
                    <span class="block text-rbi-caption font-bold text-muted mb-0.5">${_escape(_categoryLabel(String(d.category)))}</span>
                    ${_statusChip(String(d.status))}
                  </span>
                </button>
              </td>
              <td class="px-3 py-2.5 align-top">
                <button type="button" data-c2-def-row="${_escape(d.id)}" class="text-left w-full">
                  <span class="block text-rbi-body font-medium text-ink line-clamp-2 leading-snug">${_escape(desc)}</span>
                </button>
              </td>
              <td class="px-3 py-2.5 align-top whitespace-nowrap">
                <span class="text-rbi-body ${dlCls}">${_escape(dl.label)}</span>
                ${dl.overdue ? `<span class="block text-rbi-caption text-danger font-bold">${_escape(_t('construction.v2.registry.overdue', 'просрочено'))}</span>` : ''}
              </td>
              <td class="px-3 py-2.5 align-top whitespace-nowrap text-rbi-body ${dl.overdue ? 'text-danger font-bold' : 'text-muted'}">
                ${openDays != null ? `${openDays} ${_escape(_t('construction.v2.registry.days_short', 'дн.'))}` : '—'}
              </td>
              <td class="px-3 py-2.5 align-top text-right">
                <button type="button" data-c2-def-on-plan="${_escape(d.id)}" data-c2-def-loc="${_escape(d.locationId)}"
                  class="shrink-0 px-2.5 py-1.5 rounded-lg text-rbi-caption font-bold text-brand hover:bg-brand-soft"
                  title="${_escape(_t('construction.v2.registry.show_on_plan', 'Показать на плане'))}">${_escape(_t('construction.v2.registry.on_plan', 'На плане'))}</button>
              </td>
            </tr>`;
          })
          .join('');

  host.innerHTML = `
    <div class="flex flex-col h-full min-h-[320px]">
      <div class="px-4 py-3 border-b border-surface flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <div class="text-rbi-body font-semibold text-ink min-w-0 truncate">
            ${_escape(floorLabel || _t('construction.v2.registry.floor', 'Этаж'))}
          </div>
          <div class="text-rbi-label text-muted shrink-0">${_escape(_t('construction.v2.registry.shown_count', 'Показано {shown} из {total}', { shown: filtered.length, total: defects.length }))}</div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="min-w-0 flex-1" data-c2-pin-filters-host="registry">${renderPinFiltersHtml(defects, filters, { compact: true })}</div>
          <button type="button" data-c2-reg-overdue
            class="shrink-0 px-2.5 py-1.5 rounded-lg text-rbi-caption font-black uppercase tracking-wide border ${overdueChipCls}"
            title="${_escape(_t('construction.v2.registry.overdue_only_title', 'Только просроченные (issued / в работе / на проверке)'))}">${_escape(_t('construction.v2.registry.overdue_chip', 'Просроч.'))}</button>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto">
        <table class="w-full border-collapse text-left">
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;

  host.querySelector('[data-c2-reg-overdue]')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    _overdueOnly = !_overdueOnly;
    renderDefectsRegistryDesktop(host, opts);
    cb.onFiltersChanged?.();
  });

  host.querySelectorAll('[data-c2-def-row]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      const id = (btn as HTMLElement).getAttribute('data-c2-def-row');
      if (id) cb.onOpenDefect(id);
    });
  });

  host.querySelectorAll('[data-c2-def-on-plan]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const el = btn as HTMLElement;
      const id = el.getAttribute('data-c2-def-on-plan');
      const loc = el.getAttribute('data-c2-def-loc');
      if (id && loc) cb.onShowOnPlan(id, loc);
    });
  });
}
