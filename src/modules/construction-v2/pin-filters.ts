/**
 * Фильтры пинов construction-v2 (контракт как СК v1: пустой statuses = все; category ALL|B1|B2|B3).
 * Singleton state — общий для этажного плана, fullscreen, реестра и плана квартиры.
 */

import type { ConstructionDefectV2 } from '../../services/construction-defects/types';

export type PinCategory = 'ALL' | 'B1' | 'B2' | 'B3';

export type PinFilters = {
  /** Пустой массив = показать все статусы. */
  statuses: string[];
  category: PinCategory;
};

export const ALL_PIN_STATUSES = [
  'issued',
  'in_progress',
  'fixed',
  'closed',
  'rejected'
] as const;

export type PinStatusKey = (typeof ALL_PIN_STATUSES)[number];

const STATUS_LABEL_KEYS: Record<PinStatusKey, { key: string; fallback: string }> = {
  issued: { key: 'construction.status.issued', fallback: 'Выдано' },
  in_progress: { key: 'construction.status.in_progress', fallback: 'В работе' },
  fixed: { key: 'construction.status.fixed', fallback: 'На проверке' },
  closed: { key: 'construction.status.closed', fallback: 'Закрыто' },
  rejected: { key: 'construction.status.rejected', fallback: 'Отклонено' }
};

function _t(key: string, fallback: string): string {
  try {
    const i18n = (window as unknown as { RBI?: { services?: { i18n?: { t?: (k: string) => string } } } }).RBI
      ?.services?.i18n;
    if (i18n && typeof i18n.t === 'function') {
      const s = i18n.t(key);
      if (s && s !== key) return s;
    }
  } catch (_e) {
    /* ignore */
  }
  return fallback;
}

function _statusLabel(statusKey: PinStatusKey): string {
  const meta = STATUS_LABEL_KEYS[statusKey];
  return _t(meta.key, meta.fallback);
}

const STATUS_STYLES: Record<
  PinStatusKey,
  { active: string; badgeActive: string }
> = {
  issued: {
    active: 'bg-danger-soft text-danger border-danger-soft',
    badgeActive: 'bg-danger text-white'
  },
  in_progress: {
    active: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400',
    badgeActive: 'bg-blue-600 text-white'
  },
  fixed: {
    active: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400',
    badgeActive: 'bg-orange-500 text-white'
  },
  closed: {
    active: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400',
    badgeActive: 'bg-green-600 text-white'
  },
  rejected: {
    active: 'bg-slate-100 text-ink border-surface dark:bg-slate-800',
    badgeActive: 'bg-slate-500 text-white'
  }
};

/** Общее состояние фильтров модуля. */
export const pinFiltersState: PinFilters = {
  statuses: [],
  category: 'ALL'
};

export function createDefaultPinFilters(): PinFilters {
  return { statuses: [], category: 'ALL' };
}

/** Aliases minor/major/critical ↔ B1/B2/B3 (как _pinBg / registry). */
export function normalizePinCategory(c: string): 'B1' | 'B2' | 'B3' | string {
  const v = String(c || '').toLowerCase();
  if (v === 'minor' || v === 'b1') return 'B1';
  if (v === 'major' || v === 'b2') return 'B2';
  if (v === 'critical' || v === 'b3') return 'B3';
  const up = String(c || '').toUpperCase();
  if (up === 'B1' || up === 'B2' || up === 'B3') return up;
  return up || '';
}

export function filterDefectsByPins(
  defects: ConstructionDefectV2[],
  filters: PinFilters = pinFiltersState
): ConstructionDefectV2[] {
  let out = defects.slice();
  if (filters.statuses.length > 0) {
    const set = new Set(filters.statuses.map(String));
    out = out.filter((d) => set.has(String(d.status)));
  }
  if (filters.category && filters.category !== 'ALL') {
    out = out.filter((d) => normalizePinCategory(String(d.category)) === filters.category);
  }
  return out;
}

export function countByStatus(defects: ConstructionDefectV2[]): Record<PinStatusKey, number> {
  const counts: Record<PinStatusKey, number> = {
    issued: 0,
    in_progress: 0,
    fixed: 0,
    closed: 0,
    rejected: 0
  };
  for (const d of defects) {
    const st = String(d.status) as PinStatusKey;
    if (st in counts) counts[st]++;
  }
  return counts;
}

/** Toggle как v1: 5 активных → сброс в «все» (пустой массив). */
export function toggleStatusFilter(filters: PinFilters, statusKey: string): void {
  const idx = filters.statuses.indexOf(statusKey);
  if (idx > -1) filters.statuses.splice(idx, 1);
  else filters.statuses.push(statusKey);
  if (filters.statuses.length === ALL_PIN_STATUSES.length) {
    filters.statuses = [];
  }
}

export function setCategoryFilter(filters: PinFilters, category: PinCategory): void {
  filters.category = category;
}

/**
 * HTML ряда фильтров: chips статусов + категории.
 * Без onclick — только data-c2-pin-status / data-c2-pin-category.
 * Счётчики: база с учётом category (как v1 updateStatusChips).
 */
export function renderPinFiltersHtml(
  baseDefects: ConstructionDefectV2[],
  filters: PinFilters = pinFiltersState,
  opts?: { compact?: boolean; darkFs?: boolean }
): string {
  let forCounts = baseDefects;
  if (filters.category && filters.category !== 'ALL') {
    forCounts = baseDefects.filter(
      (d) => normalizePinCategory(String(d.category)) === filters.category
    );
  }
  const counts = countByStatus(forCounts);
  const isAllMode = filters.statuses.length === 0;
  const compact = !!opts?.compact;
  const darkFs = !!opts?.darkFs;

  const inactiveClass = darkFs
    ? 'bg-white/10 text-slate-300 border-white/20'
    : 'bg-surface text-muted border-surface';
  const inactiveBadge = darkFs
    ? 'bg-white/10 text-slate-400'
    : 'bg-slate-100 text-muted dark:bg-slate-900 border border-surface';

  const chips = ALL_PIN_STATUSES.map((statusKey) => {
    const isActive = filters.statuses.includes(statusKey);
    const visuallyActive = isAllMode || isActive;
    const btnClass = visuallyActive ? STATUS_STYLES[statusKey].active : inactiveClass;
    const badgeClass = visuallyActive ? STATUS_STYLES[statusKey].badgeActive : inactiveBadge;
    const pad = compact ? 'px-2 py-1' : 'px-2.5 py-1.5';
    return `<button type="button" data-c2-pin-status="${statusKey}"
      class="shrink-0 ${pad} rounded-xl border text-rbi-caption font-bold uppercase transition-all flex items-center gap-1 active:scale-95 ${btnClass}">
      ${_statusLabel(statusKey)}
      <span class="${badgeClass} px-1.5 py-0.5 rounded-md text-rbi-caption font-black min-w-[18px] text-center">${counts[statusKey] || 0}</span>
    </button>`;
  }).join('');

  const cats: { key: PinCategory; label: string }[] = [
    { key: 'ALL', label: _t('construction.pin.all', 'Все') },
    { key: 'B3', label: 'B3' },
    { key: 'B2', label: 'B2' },
    { key: 'B1', label: 'B1' }
  ];
  const catBtns = cats
    .map(({ key, label }) => {
      const on = filters.category === key;
      const cls = on
        ? darkFs
          ? 'bg-white text-slate-900'
          : 'bg-brand text-white'
        : darkFs
          ? 'bg-white/10 text-slate-300 hover:bg-white/20'
          : 'bg-slate-100 text-ink dark:bg-slate-800';
      return `<button type="button" data-c2-pin-category="${key}"
        class="px-2 py-1 rounded-lg text-rbi-caption font-bold transition-colors ${cls}">${label}</button>`;
    })
    .join('');

  return `<div data-c2-pin-filters class="flex flex-col gap-1.5 w-full min-w-0">
    <div class="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">${chips}</div>
    <div class="flex gap-1 items-center">
      <span class="text-rbi-caption font-bold uppercase tracking-wider text-muted shrink-0">${_t('construction.pin.cat', 'Кат.')}</span>
      <div class="flex gap-0.5">${catBtns}</div>
    </div>
  </div>`;
}

/** Обновить все контейнеры `[data-c2-pin-filters-host]` на странице. */
export function paintPinFilterHosts(
  baseDefects: ConstructionDefectV2[],
  filters: PinFilters = pinFiltersState,
  opts?: { compact?: boolean; darkFs?: boolean }
): void {
  document.querySelectorAll('[data-c2-pin-filters-host]').forEach((el) => {
    const host = el as HTMLElement;
    const dark = host.getAttribute('data-c2-pin-filters-host') === 'fs' || !!opts?.darkFs;
    host.innerHTML = renderPinFiltersHtml(baseDefects, filters, {
      compact: opts?.compact ?? true,
      darkFs: dark
    });
  });
}
