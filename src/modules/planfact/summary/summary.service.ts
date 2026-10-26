/**
 * Сводка руководителю с сервера (P2-0008, P2-0010): только функции public.pf_summary_* и pf_project_set_dates / pf_project_set_thresholds
 * миграций 011 и 013. Отставание (п.п. и дни, ТЗ §9), светофор по ТЗ 8.2 и вердикт темпа — только с сервера (summary_project).
 * Готовность по деньгам договорной КП, темп, прогноз, светофор, «сделано ↔ КС-2» считает сервер (единый расчёт summary_project);
 * поля в ₽, общий % и прогноз приходят только при праве planfact.money.view (иначе null). Экран ничего не пересчитывает.
 * P2-0021: «Требует моего участия» — pf_my_inbox (миграция 029): по всем объектам, только виды по правам (иначе null).
 */
import { getClient } from '../../../platform/auth/auth.service.ts';
import { mapCompanyError } from '../../../platform/company/company.service.ts';
import type { Result } from '../../../platform/company/company.service.ts';

export type Light = 'green' | 'yellow' | 'red' | 'grey';
export type LightReason = 'no_kp' | 'no_prices' | 'no_dates' | 'done' | 'lag_red' | 'overdue' | 'finish_near' | 'lag_yellow' | 'lag_days' | 'on_track';
export type PaceVerdict = 'faster' | 'slower' | 'steady';

export interface SummaryProject {
  project_id: string; name: string; code: string | null; planned_start: string | null; planned_finish: string | null;
  can_money: boolean; can_manage: boolean; has_kp: boolean;
  plan_money: number | null; done_money: number | null; issued_money: number | null; gap_money: number | null; pct_money: number | null;
  pace7: number | null; pace14: number | null; need_pace: number | null; days_left: number | null; forecast_finish: string | null;
  light: Light; light_reason: LightReason; unpriced_rows: number; positions: number; pending: number;
  plan_pct_today: number | null; lag_pp: number | null; lag_days: number | null; pace_verdict: PaceVerdict | null; work_days_left: number | null;
  light_yellow_pp: number; light_red_pp: number; light_overdue_days: number; can_thresholds: boolean;
}
export interface UnitQty { unit: string; qty: number }
export interface SummaryWeek {
  week_start: string; week_end: string; plan_pct: number | null; plan_money_cum: number | null; done_money: number | null; done_money_cum: number | null;
  issued_money: number | null; issued_money_cum: number | null; units: UnitQty[];
}
export interface PlaceUnit { unit: string; plan: number; fact: number; pct: number | null }
export interface SummaryPlace {
  location_id: string; name: string; node_type: string; depth: number; children: number; positions: number; here_positions: number;
  plan_money: number | null; done_money: number | null; pct_money: number | null; units: PlaceUnit[];
}
export interface AttentionGap { source_row_id: string; number: string | null; name: string; unit: string | null; qty: number; money: number | null }
export interface AttentionUnpriced { source_row_id: string; number: string | null; name: string; unit: string | null; qty: number }
export interface AttentionStale { position_id: string; work_name: string; location_path: string; unit: string; plan_qty: number; fact_qty: number; idle_days: number }
export interface SummaryAttention {
  stale_days: number;
  counts: { no_kp: boolean; no_dates: boolean; gap_rows: number; gap_money: number | null; unpriced_rows: number; stale_positions: number; pending_entries: number };
  gap: AttentionGap[]; unpriced: AttentionUnpriced[]; stale: AttentionStale[];
  completeness: { rows_total: number; rows_priced: number; priced_pct: number | null; dates_pct: number; positions_total: number; positions_placed: number; placed_pct: number | null };
}
/** forecast_finish / delta_days / dev_pp — прогноз по ЕИ (P2-0022, 030; null — нет темпа / нет дат объекта). */
export interface UnitVolume { unit: string; plan: number; fact: number; pct: number | null; rest: number; fact7: number; fact14: number; pending: number;
  forecast_finish: string | null; delta_days: number | null; dev_pp: number | null }
export interface SummaryWorkType {
  work_type_id: string | null; work_name: string; units: UnitVolume[]; positions: number;
  plan_money: number | null; done_money: number | null; pct_money: number | null; unpriced_rows: number; plan_pct_today: number | null;
}
export interface SummaryPosition {
  position_id: string; location_id: string; location_path: string; work_type_id: string; work_name: string; unit_code: string;
  plan_qty: number; fact_qty: number; pct: number | null; rest_qty: number; fact7: number; fact14: number; pending_qty: number;
  forecast_finish: string | null; delta_days: number | null; plan_pct_today: number | null; dev_pp: number | null;
}
export interface Ks2GapRow {
  source_row_id: string; import_id: string; row_no: number; number: string | null; name: string; unit_text: string | null; kind: 'work' | 'material';
  work_name: string | null; done_qty: number; issued_qty: number; gap_qty: number;
  price: number | null; done_money: number | null; issued_money: number | null; gap_money: number | null;
}
/** Строка «Требует моего участия» по объекту (pf_my_inbox, 029). null — у вошедшего нет права на этот вид в объекте. */
export interface InboxRow {
  project_id: string; name: string; code: string | null;
  pending: number | null; my_rejected: number | null; my_rejected_from: string | null; ks2_drafts: number | null;
  ks2_gap: number | null; ks2_gap_money: number | null; stale: number | null; stale_days: number | null;
}

export interface SummaryApi {
  portfolio(): Promise<Result<SummaryProject[]>>;
  workTypes(projectId: string): Promise<Result<SummaryWorkType[]>>;
  positions(projectId: string, workTypeId: string | null): Promise<Result<SummaryPosition[]>>;
  ks2Gap(projectId: string): Promise<Result<Ks2GapRow[]>>;
  setDates(projectId: string, start: string | null, finish: string | null): Promise<Result>;
  weekly(projectId: string, weeks: number): Promise<Result<SummaryWeek[]>>;
  places(projectId: string, locationId: string | null): Promise<Result<SummaryPlace[]>>;
  attention(projectId: string): Promise<Result<SummaryAttention>>;
  setThresholds(projectId: string, yellowPp: number, redPp: number, days: number): Promise<Result>;
  /** Что ждёт вошедшего по всем его объектам (один вызов сервера). */
  inbox(): Promise<Result<InboxRow[]>>;
}

const n = (v: unknown): number => Number(v ?? 0);
const nn = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
export const normProject = (p: SummaryProject): SummaryProject => ({
  ...p, plan_money: nn(p.plan_money), done_money: nn(p.done_money), issued_money: nn(p.issued_money), gap_money: nn(p.gap_money),
  pct_money: nn(p.pct_money), pace7: nn(p.pace7), pace14: nn(p.pace14), need_pace: nn(p.need_pace), days_left: nn(p.days_left),
  unpriced_rows: n(p.unpriced_rows), positions: n(p.positions), pending: n(p.pending),
  plan_pct_today: nn(p.plan_pct_today), lag_pp: nn(p.lag_pp), lag_days: nn(p.lag_days), pace_verdict: p.pace_verdict ?? null, work_days_left: nn(p.work_days_left),
  light_yellow_pp: n(p.light_yellow_pp), light_red_pp: n(p.light_red_pp), light_overdue_days: n(p.light_overdue_days), can_thresholds: !!p.can_thresholds });
export const normWeek = (w: SummaryWeek): SummaryWeek => ({
  ...w, plan_pct: nn(w.plan_pct), plan_money_cum: nn(w.plan_money_cum), done_money: nn(w.done_money), done_money_cum: nn(w.done_money_cum),
  issued_money: nn(w.issued_money), issued_money_cum: nn(w.issued_money_cum), units: (w.units || []).map((u) => ({ unit: u.unit, qty: n(u.qty) })) });
export const normPlace = (x: SummaryPlace): SummaryPlace => ({
  ...x, depth: n(x.depth), children: n(x.children), positions: n(x.positions), here_positions: n(x.here_positions),
  plan_money: nn(x.plan_money), done_money: nn(x.done_money), pct_money: nn(x.pct_money),
  units: (x.units || []).map((u) => ({ unit: u.unit, plan: n(u.plan), fact: n(u.fact), pct: nn(u.pct) })) });
export const normWorkType = (w: SummaryWorkType): SummaryWorkType => ({
  ...w, positions: n(w.positions), plan_money: nn(w.plan_money), done_money: nn(w.done_money), pct_money: nn(w.pct_money), unpriced_rows: n(w.unpriced_rows),
  units: (w.units || []).map((u) => ({ unit: u.unit, plan: n(u.plan), fact: n(u.fact), pct: nn(u.pct), rest: n(u.rest), fact7: n(u.fact7), fact14: n(u.fact14), pending: n(u.pending),
    forecast_finish: u.forecast_finish ?? null, delta_days: nn(u.delta_days), dev_pp: nn(u.dev_pp) })), plan_pct_today: nn(w.plan_pct_today) });
export const normPosition = (p: SummaryPosition): SummaryPosition => ({
  ...p, plan_qty: n(p.plan_qty), fact_qty: n(p.fact_qty), pct: nn(p.pct), rest_qty: n(p.rest_qty), fact7: n(p.fact7), fact14: n(p.fact14), pending_qty: n(p.pending_qty),
  forecast_finish: p.forecast_finish ?? null, delta_days: nn(p.delta_days), plan_pct_today: nn(p.plan_pct_today), dev_pp: nn(p.dev_pp) });
export const normGap = (r: Ks2GapRow): Ks2GapRow => ({
  ...r, row_no: n(r.row_no), done_qty: n(r.done_qty), issued_qty: n(r.issued_qty), gap_qty: n(r.gap_qty),
  price: nn(r.price), done_money: nn(r.done_money), issued_money: nn(r.issued_money), gap_money: nn(r.gap_money) });

export const normInbox = (r: InboxRow): InboxRow => ({
  ...r, code: r.code ?? null, pending: nn(r.pending), my_rejected: nn(r.my_rejected), my_rejected_from: r.my_rejected_from ?? null, ks2_drafts: nn(r.ks2_drafts), ks2_gap: nn(r.ks2_gap),
  ks2_gap_money: nn(r.ks2_gap_money), stale: nn(r.stale), stale_days: nn(r.stale_days) });

export function createSummaryService(): SummaryApi | null {
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
  const list = async <T>(r: Promise<Result<T[]>>, f: (v: T) => T): Promise<Result<T[]>> => { const x = await r; return x.ok ? { ok: true, value: (x.value || []).map(f) } : x; };
  return {
    portfolio: () => list(call<SummaryProject[]>('pf_summary_portfolio', {}), normProject),
    workTypes: (p) => list(call<SummaryWorkType[]>('pf_summary_worktypes', { p_project: p }), normWorkType),
    positions: (p, wt) => list(call<SummaryPosition[]>('pf_summary_positions', { p_project: p, p_work_type: wt }), normPosition),
    ks2Gap: (p) => list(call<Ks2GapRow[]>('pf_summary_ks2_gap', { p_project: p }), normGap),
    setDates: (p, s, f) => call('pf_project_set_dates', { p_project: p, p_start: s, p_finish: f }),
    weekly: (p, w) => list(call<SummaryWeek[]>('pf_summary_weekly', { p_project: p, p_weeks: w }), normWeek),
    places: (p, l) => list(call<SummaryPlace[]>('pf_summary_places', { p_project: p, p_location: l }), normPlace),
    attention: (p) => call<SummaryAttention>('pf_summary_attention', { p_project: p }),
    setThresholds: (p, y, r, d) => call('pf_project_set_thresholds', { p_project: p, p_yellow_pp: y, p_red_pp: r, p_overdue_days: d }),
    inbox: () => list(call<InboxRow[]>('pf_my_inbox', {}), normInbox),
  };
}
