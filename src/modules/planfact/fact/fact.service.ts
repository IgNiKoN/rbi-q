/**
 * Бригады и факт прораба с сервера (P2-0007): только функции public.pf_brigade_* / pf_fact_* миграций 009, 027 и 028
 * (P2-0020: решение РП пачкой pf_fact_decide_batch, журнал объекта pf_fact_journal; P2-0022, 030: запись «за период»).
 * Права (fact.create / fact.approve / brigades.manage), изоляцию компаний, допуск перебора и неизменяемость записей
 * проверяет сервер; кнопки на экране — подсказка.
 */
import { getClient } from '../../../platform/auth/auth.service.ts';
import { mapCompanyError } from '../../../platform/company/company.service.ts';
import type { Result } from '../../../platform/company/company.service.ts';

export const FACT_VIEW = 'planfact.fact.view';
export const FACT_CREATE = 'planfact.fact.create';
export const FACT_APPROVE = 'planfact.fact.approve';

export interface Brigade { id: string; name: string; leader_name: string | null; phone: string | null; archived_at: string | null; can_manage: boolean }
export interface FactPosition {
  position_id: string; location_id: string; location_path: string; location_type: string; work_type_id: string; work_name: string;
  unit_code: string; plan_qty: number; fact_qty: number; pending_qty: number; pending_count: number; last_rejected_note: string | null;
}
export type FactStatus = 'accepted' | 'pending_approval' | 'rejected' | 'superseded';
export interface FactHistoryRow {
  id: string; status: FactStatus; qty: number; work_date: string; brigade_name: string; workers: number | null; man_hours: number | null;
  note: string | null; corrects_id: string | null; correction_reason: string | null; batch_id: string | null;
  created_by_email: string | null; created_at: string; decided_by_email: string | null; decided_at: string | null; decision_note: string | null;
  /** Начало периода (P2-0022, миграция 030); null — запись за день, work_date — конец периода. */
  period_from?: string | null;
}
export interface FactPendingRow {
  id: string; position_id: string; location_path: string; work_name: string; unit_code: string; plan_qty: number; fact_qty: number;
  qty: number; work_date: string; brigade_name: string; note: string | null; corrects_id: string | null; correction_reason: string | null;
  created_by_email: string | null; created_at: string;
}
/** Запись журнала факта объекта (pf_fact_journal, миграция 028): любой статус, решение РП и исправление. */
export interface FactJournalRow extends FactHistoryRow { position_id: string; location_path: string; work_name: string; unit_code: string }
/** Итог решения пачкой (всё или ничего). */
export interface DecideBatchResult { approved: number; rejected: number }
/** Предел пачки на сервере (pf_fact_decide_batch); больше — частями. */
export const DECIDE_BATCH_MAX = 500;
/** periodFrom (P2-0022) — начало периода «с … по date»; без него — запись за день. */
export interface FactEntryInput { brigadeId: string; date: string; qty: number; workers: number | null; manHours: number | null; note: string; periodFrom?: string | null }
/** requireApproval (P2-0019, миграция 027) — «Закрыть через РП»: все строки ждут подтверждения РП даже без перебора. */
export interface FactBatchInput { projectId: string; brigadeId: string; date: string; workers: number | null; note: string; items: { position_id: string; qty: number }[]; requireApproval?: boolean }
export interface FactAddResult { id: string; status: 'accepted' | 'pending_approval' }
export interface BatchResult { batch_id: string; accepted: number; pending: number }

export interface FactApi {
  listBrigades(companyId: string, withArchived: boolean): Promise<Brigade[]>;
  saveBrigade(companyId: string, id: string | null, name: string, leader: string, phone: string): Promise<Result<string>>;
  archiveBrigade(id: string, archived: boolean): Promise<Result>;
  positions(projectId: string, locationId: string | null): Promise<Result<FactPosition[]>>;
  history(positionId: string): Promise<Result<FactHistoryRow[]>>;
  pending(projectId: string): Promise<Result<FactPendingRow[]>>;
  add(positionId: string, e: FactEntryInput): Promise<Result<FactAddResult>>;
  addBatch(b: FactBatchInput): Promise<Result<BatchResult>>;
  correct(entryId: string, qty: number, reason: string): Promise<Result<{ id: string; status: string }>>;
  decide(entryId: string, approve: boolean, note: string): Promise<Result>;
  /** Решение РП по записям проекта одной операцией (≤ 500; всё или ничего). Отказ — одна причина на все. */
  decideBatch(projectId: string, entryIds: string[], approve: boolean, note: string): Promise<Result<DecideBatchResult>>;
  /** Журнал факта объекта за период по дате работ (null — без границы), новые сверху; limit — по умолчанию 2 000. */
  journal(projectId: string, from: string | null, to: string | null, limit?: number): Promise<Result<FactJournalRow[]>>;
}

const n = (v: unknown): number => Number(v ?? 0);
export function normPosition(p: FactPosition): FactPosition {
  return { ...p, plan_qty: n(p.plan_qty), fact_qty: n(p.fact_qty), pending_qty: n(p.pending_qty), pending_count: n(p.pending_count) };
}
const normHistory = (r: FactHistoryRow): FactHistoryRow => ({ ...r, period_from: r.period_from ?? null, qty: n(r.qty), workers: r.workers === null ? null : n(r.workers), man_hours: r.man_hours === null ? null : n(r.man_hours) });
const normJournal = (r: FactJournalRow): FactJournalRow => ({ ...r, ...normHistory(r) });
const normPending = (r: FactPendingRow): FactPendingRow => ({ ...r, plan_qty: n(r.plan_qty), fact_qty: n(r.fact_qty), qty: n(r.qty) });

export function createFactService(): FactApi | null {
  const c = getClient();
  if (!c) return null;
  async function call<T = null>(fn: string, args: Record<string, unknown>): Promise<Result<T>> {
    try {
      const { data, error } = await c!.rpc(fn, args);
      return error ? { ok: false, message: mapCompanyError(error) } : { ok: true, value: (data ?? null) as T };
    } catch (e) {
      return { ok: false, message: mapCompanyError({ message: e instanceof Error ? e.message : '' }) };
    }
  }
  const list = async <T, U = T>(fn: string, args: Record<string, unknown>, map: (r: T) => U): Promise<Result<U[]>> => {
    const r = await call<T[]>(fn, args);
    return r.ok ? { ok: true, value: (r.value || []).map(map) } : r;
  };
  return {
    async listBrigades(company, withArchived) {
      const r = await call<Brigade[]>('pf_brigade_list', { p_company: company, p_archived: withArchived });
      return r.ok && Array.isArray(r.value) ? r.value : [];
    },
    saveBrigade: (company, id, name, leader, phone) => call<string>('pf_brigade_save', { p_company: company, p_id: id, p_name: name, p_leader: leader || null, p_phone: phone || null }),
    archiveBrigade: (id, archived) => call('pf_brigade_archive', { p_brigade: id, p_archived: archived }),
    positions: (project, location) => list<FactPosition>('pf_fact_positions', { p_project: project, p_location: location }, normPosition),
    history: (position) => list<FactHistoryRow>('pf_fact_history', { p_position: position }, normHistory),
    pending: (project) => list<FactPendingRow>('pf_fact_pending', { p_project: project }, normPending),
    add: (position, e) => call<FactAddResult>('pf_fact_add', { p_position: position, p_brigade: e.brigadeId, p_date: e.date, p_qty: e.qty, p_workers: e.workers, p_man_hours: e.manHours, p_note: e.note || null,
      ...(e.periodFrom ? { p_period_from: e.periodFrom } : {}) }),   // период — только когда задан (вызов без него — как до 030)
    // Флаг передаётся, только когда нужен: прежний вызов (6 параметров) — как до 027.
    addBatch: (b) => call<BatchResult>('pf_fact_add_batch', { p_project: b.projectId, p_brigade: b.brigadeId, p_date: b.date, p_items: b.items, p_workers: b.workers, p_note: b.note || null,
      ...(b.requireApproval ? { p_require_approval: true } : {}) }),
    correct: (entry, qty, reason) => call<{ id: string; status: string }>('pf_fact_correct', { p_entry: entry, p_qty: qty, p_reason: reason }),
    decide: (entry, approve, note) => call('pf_fact_decide', { p_entry: entry, p_approve: approve, p_note: note || null }),
    async decideBatch(project, ids, approve, note) {
      const r = await call<DecideBatchResult>('pf_fact_decide_batch', { p_project: project, p_entries: ids, p_approve: approve, p_note: note || null });
      return r.ok ? { ok: true, value: { approved: n(r.value?.approved), rejected: n(r.value?.rejected) } } : r;
    },
    journal: (project, from, to, limit) => list<FactJournalRow>('pf_fact_journal', { p_project: project, p_from: from, p_to: to, p_limit: limit ?? 2000 }, normJournal)
  };
}
