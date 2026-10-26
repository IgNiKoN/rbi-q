/**
 * SLA / сроки замечаний construction-v2 — чистые функции без DOM.
 * Канон определений — current_plan.md блок E.
 */

import type { ConstructionDefectV2, DefectHistoryEntryV2 } from '../../services/construction-defects/types';

const MS_DAY = 24 * 60 * 60 * 1000;

const NO_DESCRIPTION_FALLBACK = 'Без описания';

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

function _noDescription(): string {
  return _t('construction.v2.no_description', NO_DESCRIPTION_FALLBACK);
}

export type PeriodPreset = 'all' | '30' | '90';

export type AgingBucket = '0-3' | '4-7' | '8-14' | '15+';

export type DefectSlaMetricsOpts = {
  /** now — для тестов; по умолчанию Date.now() */
  now?: Date | number;
  /** Период по created_at / дате выдачи */
  period?: PeriodPreset;
  /** Ограничить locationId (floor/apartment ids) */
  locationIds?: Set<string> | string[] | null;
};

export type CategorySlice = {
  category: 'B1' | 'B2' | 'B3';
  open: number;
  overdue: number;
  avgEliminateDays: number | null;
};

export type ContractorSlice = {
  contractorId: string;
  open: number;
  overdue: number;
  avgEliminateDays: number | null;
};

export type OverdueRow = {
  id: string;
  description: string;
  status: string;
  category: string;
  contractorId: string | null;
  deadline: string;
  daysOverdue: number;
  daysOpen: number;
  locationId: string;
};

export type DefectSlaMetrics = {
  open: number;
  overdueNow: number;
  avgEliminateDays: number | null;
  avgReviewDays: number | null;
  onTimePct: number | null;
  closedOnTime: number;
  closedLate: number;
  closedWithDeadline: number;
  byCategory: CategorySlice[];
  byContractor: ContractorSlice[];
  aging: Record<AgingBucket, number>;
  overdueList: OverdueRow[];
};

function _asDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) {
    const d = new Date(`${m[1]}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Конец календарного дня deadline (локально). */
export function deadlineEndOfDay(deadline: unknown): Date | null {
  const m = String(deadline || '')
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const end = new Date(`${m[1]}T23:59:59.999`);
  return Number.isNaN(end.getTime()) ? null : end;
}

function _ceilDays(from: Date, to: Date): number {
  const a = new Date(from);
  a.setHours(12, 0, 0, 0);
  const b = new Date(to);
  b.setHours(12, 0, 0, 0);
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / MS_DAY));
}

function _history(d: ConstructionDefectV2): DefectHistoryEntryV2[] {
  const h = d.history;
  if (!Array.isArray(h)) return [];
  return h as DefectHistoryEntryV2[];
}

function _normStatus(s: string): string {
  const st = String(s || '').toLowerCase();
  if (st === 'open') return 'issued';
  if (st === 'cancelled') return 'rejected';
  return st;
}

export function normalizeCategory(c: unknown): 'B1' | 'B2' | 'B3' | string {
  const v = String(c || '').toLowerCase();
  if (v === 'minor' || v === 'b1') return 'B1';
  if (v === 'major' || v === 'b2') return 'B2';
  if (v === 'critical' || v === 'b3') return 'B3';
  const up = String(c || '').toUpperCase();
  if (up === 'B1' || up === 'B2' || up === 'B3') return up;
  return up || '—';
}

/** Открыт для устранения: issued | in_progress */
export function isOpenForFix(status: string): boolean {
  const st = _normStatus(status);
  return st === 'issued' || st === 'in_progress';
}

/** Ждёт проверки СК: fixed */
export function isAwaitingReview(status: string): boolean {
  return _normStatus(status) === 'fixed';
}

/** Просрочен сейчас: deadline прошёл и status ∈ {issued, in_progress, fixed} */
export function isOverdueNow(d: ConstructionDefectV2, now: Date = new Date()): boolean {
  const st = _normStatus(String(d.status));
  if (st !== 'issued' && st !== 'in_progress' && st !== 'fixed') return false;
  const end = deadlineEndOfDay(d.deadline);
  if (!end) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return end < today;
}

/** Дата выдачи: created_at → первая history issued/open → updated_at */
export function issueDate(d: ConstructionDefectV2): Date | null {
  const fromCreated = _asDate(d.created_at);
  if (fromCreated) return fromCreated;
  for (const e of _history(d)) {
    const st = _normStatus(String(e.status));
    if (st === 'issued') {
      const dt = _asDate(e.date);
      if (dt) return dt;
    }
  }
  return _asDate(d.updated_at);
}

/** Первая history fixed|closed (что раньше по дате). */
export function eliminateDate(d: ConstructionDefectV2): Date | null {
  let best: Date | null = null;
  for (const e of _history(d)) {
    const st = _normStatus(String(e.status));
    if (st !== 'fixed' && st !== 'closed') continue;
    const dt = _asDate(e.date);
    if (!dt) continue;
    if (!best || dt.getTime() < best.getTime()) best = dt;
  }
  return best;
}

/** Первая history closed. */
export function acceptedDate(d: ConstructionDefectV2): Date | null {
  let best: Date | null = null;
  for (const e of _history(d)) {
    if (_normStatus(String(e.status)) !== 'closed') continue;
    const dt = _asDate(e.date);
    if (!dt) continue;
    if (!best || dt.getTime() < best.getTime()) best = dt;
  }
  return best;
}

/** Дни от выдачи до сегодня (для aging / колонки реестра). */
export function daysOpen(d: ConstructionDefectV2, now: Date = new Date()): number | null {
  const issued = issueDate(d);
  if (!issued) return null;
  return _ceilDays(issued, now);
}

export function agingBucket(days: number): AgingBucket {
  if (days <= 3) return '0-3';
  if (days <= 7) return '4-7';
  if (days <= 14) return '8-14';
  return '15+';
}

function _avg(nums: number[]): number | null {
  if (!nums.length) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Math.round((sum / nums.length) * 10) / 10;
}

function _inPeriod(d: ConstructionDefectV2, period: PeriodPreset, now: Date): boolean {
  if (period === 'all') return true;
  const days = period === '30' ? 30 : 90;
  const issued = issueDate(d);
  if (!issued) return false;
  const cut = new Date(now);
  cut.setHours(0, 0, 0, 0);
  cut.setDate(cut.getDate() - days);
  return issued.getTime() >= cut.getTime();
}

function _locOk(d: ConstructionDefectV2, ids: Set<string> | null): boolean {
  if (!ids || ids.size === 0) return true;
  return ids.has(String(d.locationId || ''));
}

/**
 * Сводка SLA по массиву дефектов (уже локально синхронизированных).
 */
export function computeDefectSlaMetrics(
  defects: ConstructionDefectV2[],
  opts: DefectSlaMetricsOpts = {}
): DefectSlaMetrics {
  const now = opts.now instanceof Date ? opts.now : new Date(opts.now ?? Date.now());
  const period: PeriodPreset = opts.period || 'all';
  const locSet =
    opts.locationIds == null
      ? null
      : opts.locationIds instanceof Set
        ? opts.locationIds
        : new Set(opts.locationIds.map(String));

  const list = (defects || []).filter(
    (d) => d && !d.is_deleted && !d._deleted && _inPeriod(d, period, now) && _locOk(d, locSet)
  );

  let open = 0;
  let overdueNow = 0;
  const elimDays: number[] = [];
  const reviewDays: number[] = [];
  let closedOnTime = 0;
  let closedLate = 0;

  const catMap: Record<'B1' | 'B2' | 'B3', { open: number; overdue: number; elim: number[] }> = {
    B1: { open: 0, overdue: 0, elim: [] },
    B2: { open: 0, overdue: 0, elim: [] },
    B3: { open: 0, overdue: 0, elim: [] }
  };

  const contrMap = new Map<string, { open: number; overdue: number; elim: number[] }>();
  const aging: Record<AgingBucket, number> = { '0-3': 0, '4-7': 0, '8-14': 0, '15+': 0 };
  const overdueList: OverdueRow[] = [];

  const ensureContr = (id: string) => {
    if (!contrMap.has(id)) contrMap.set(id, { open: 0, overdue: 0, elim: [] });
    return contrMap.get(id)!;
  };

  for (const d of list) {
    const st = _normStatus(String(d.status));
    const cat = normalizeCategory(d.category);
    const catKey = cat === 'B1' || cat === 'B2' || cat === 'B3' ? cat : null;
    const cid = String(d.contractorId || '').trim() || '—';
    const contr = ensureContr(cid);

    const issued = issueDate(d);
    const elim = eliminateDate(d);
    const accepted = acceptedDate(d);

    if (elim && issued) {
      const days = _ceilDays(issued, elim);
      elimDays.push(days);
      if (catKey) catMap[catKey].elim.push(days);
      contr.elim.push(days);
    }

    // Срок проверки: оба fixed и позже closed в history
    if (accepted && elim) {
      const hist = _history(d);
      const hasFixed = hist.some((e) => _normStatus(String(e.status)) === 'fixed');
      if (hasFixed && accepted.getTime() >= elim.getTime()) {
        reviewDays.push(_ceilDays(elim, accepted));
      }
    }

    if (st === 'closed') {
      const end = deadlineEndOfDay(d.deadline);
      if (end && accepted) {
        if (accepted.getTime() <= end.getTime()) closedOnTime += 1;
        else closedLate += 1;
      }
    }

    const isOpenAging = st === 'issued' || st === 'in_progress' || st === 'fixed';
    if (isOpenAging) {
      if (st === 'issued' || st === 'in_progress') {
        open += 1;
        if (catKey) catMap[catKey].open += 1;
        contr.open += 1;
      }
      if (issued) {
        aging[agingBucket(_ceilDays(issued, now))] += 1;
      }
      if (isOverdueNow(d, now)) {
        overdueNow += 1;
        if (catKey) catMap[catKey].overdue += 1;
        contr.overdue += 1;
        const end = deadlineEndOfDay(d.deadline)!;
        const daysOd = _ceilDays(end, now);
        overdueList.push({
          id: d.id,
          description: String(d.description || d.item_name || d.text || _noDescription()).slice(0, 120),
          status: st,
          category: String(cat),
          contractorId: d.contractorId || null,
          deadline: String(d.deadline || '').slice(0, 10),
          daysOverdue: daysOd,
          daysOpen: issued ? _ceilDays(issued, now) : 0,
          locationId: String(d.locationId || '')
        });
      }
    }
  }

  overdueList.sort((a, b) => b.daysOverdue - a.daysOverdue || b.daysOpen - a.daysOpen);

  const closedWithDeadline = closedOnTime + closedLate;
  const onTimePct =
    closedWithDeadline > 0 ? Math.round((closedOnTime / closedWithDeadline) * 1000) / 10 : null;

  const byCategory: CategorySlice[] = (['B1', 'B2', 'B3'] as const).map((category) => ({
    category,
    open: catMap[category].open,
    overdue: catMap[category].overdue,
    avgEliminateDays: _avg(catMap[category].elim)
  }));

  const byContractor: ContractorSlice[] = [...contrMap.entries()]
    .map(([contractorId, v]) => ({
      contractorId,
      open: v.open,
      overdue: v.overdue,
      avgEliminateDays: _avg(v.elim)
    }))
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open)
    .slice(0, 10);

  return {
    open,
    overdueNow,
    avgEliminateDays: _avg(elimDays),
    avgReviewDays: _avg(reviewDays),
    onTimePct,
    closedOnTime,
    closedLate,
    closedWithDeadline,
    byCategory,
    byContractor,
    aging,
    overdueList: overdueList.slice(0, 20)
  };
}
