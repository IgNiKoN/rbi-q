/**
 * Проект КС-2 с сервера (P2-0008b): только функции public.pf_ks2_* миграции 010; заказчик объекта — через сервис ядра (P2-0015).
 * Предложение системы (факт → строки заказчика, материалы по норме, цены договорной КП, «выставлено ранее») считает сервер;
 * права (ks2.view / ks2.edit), изоляцию компаний, неизменяемость редакций и выданных актов — тоже. Кнопки на экране — подсказка.
 */
import { getClient } from '../../../platform/auth/auth.service.ts';
import { mapCompanyError } from '../../../platform/company/company.service.ts';
import type { Result } from '../../../platform/company/company.service.ts';
import type { Ks2Header, Ks2Snapshot } from './form.ts';
import { createCoreService } from '../../../platform/core/core.service.ts';
import type { CounterpartyCard } from '../../../platform/core/counterparties.ts';

export const KS2_VIEW = 'planfact.ks2.view';
export const KS2_EDIT = 'planfact.ks2.edit';

export interface KpRevisionRef { id: string; estimate_name: string; revision_no: number; total: number; created_at: string }
export interface Ks2Settings {
  contract_kp_revision_id: string | null; requisites: Partial<Ks2Header>; template_name: string | null; template_sha256: string | null;
  template_size: number | null; can_edit: boolean; next_act_no: string; kp_revisions: KpRevisionRef[];
}
export type Ks2Status = 'draft' | 'issued' | 'annulled';
export interface Ks2ActItem {
  id: string; act_no: string; act_date: string; period_from: string; period_to: string; status: Ks2Status; total: number | null; revisions: number;
  last_revision_id: string | null; issued_at: string | null; issued_by_email: string | null; annul_reason: string | null; annulled_at: string | null; created_at: string;
}
export interface Ks2ProposalRow {
  source_row_id: string; import_id: string; row_no: number; number: string | null; name: string; unit_text: string | null; kind: 'work' | 'material';
  total_qty: number; prev_qty: number; sys_qty: number; price: number | null;
}
export interface Ks2SavedRevision { id: string; revision_no: number; snapshot: Ks2Snapshot; total: number; created_at: string }
export interface Ks2ActData {
  act: { id: string; project_id: string; act_no: string; act_date: string; period_from: string; period_to: string; status: Ks2Status; kp_revision_id: string; annul_reason: string | null };
  requisites: Partial<Ks2Header>;
  proposal: Ks2ProposalRow[] | null; // только у черновика
  last_revision: Ks2SavedRevision | null;
  /** P2-0015: заказчик объекта из ядра (карточка контрагента) — источник реквизитов, если в настройках КС-2 пусто. */
  customer?: CounterpartyCard | null;
}
export interface Ks2RevisionItem { id: string; revision_no: number; total: number; note: string | null; created_by_email: string | null; created_at: string; issued: boolean }
export interface Ks2RowEdit { source_row_id: string; qty: number; price: number | null; excluded: boolean }
export interface Ks2Template { name: string; sha256: string; data: string }

export interface Ks2Api {
  settings(projectId: string): Promise<Result<Ks2Settings>>;
  setContract(projectId: string, kpRevisionId: string): Promise<Result>;
  acts(projectId: string): Promise<Result<Ks2ActItem[]>>;
  createAct(projectId: string, actNo: string, actDate: string, from: string, to: string): Promise<Result<string>>;
  act(actId: string): Promise<Result<Ks2ActData>>;
  save(actId: string, header: Ks2Header, rows: Ks2RowEdit[], note: string): Promise<Result<number>>;
  issue(actId: string): Promise<Result>;
  annul(actId: string, reason: string): Promise<Result>;
  revisions(actId: string): Promise<Result<Ks2RevisionItem[]>>;
  revision(revisionId: string): Promise<Result<Ks2SavedRevision>>;
  template(projectId: string): Promise<Result<Ks2Template | null>>;
  saveTemplate(projectId: string, name: string | null, base64: string | null): Promise<Result<string>>;
}

const n = (v: unknown): number => Number(v ?? 0);
const nn = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
export const normProposal = (r: Ks2ProposalRow): Ks2ProposalRow => ({ ...r, row_no: n(r.row_no), total_qty: n(r.total_qty), prev_qty: n(r.prev_qty), sys_qty: n(r.sys_qty), price: nn(r.price) });
export const normActItem = (a: Ks2ActItem): Ks2ActItem => ({ ...a, total: nn(a.total), revisions: n(a.revisions) });
const normRevision = (r: Ks2SavedRevision): Ks2SavedRevision => ({ ...r, total: n(r.total) });
export function normActData(d: Ks2ActData): Ks2ActData {
  return { ...d, requisites: d.requisites || {}, proposal: d.proposal ? d.proposal.map(normProposal) : null, last_revision: d.last_revision ? normRevision(d.last_revision) : null };
}

export function createKs2Service(): Ks2Api | null {
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
  const core = createCoreService();
  const map = async <T, U>(r: Promise<Result<T>>, f: (v: T) => U): Promise<Result<U>> => { const x = await r; return x.ok ? { ok: true, value: f(x.value) } : x; };
  return {
    settings: (p) => map(call<Ks2Settings>('pf_ks2_settings', { p_project: p }), (s) => ({ ...s, template_size: nn(s.template_size), kp_revisions: (s.kp_revisions || []).map((k) => ({ ...k, total: n(k.total) })) })),
    setContract: (p, kp) => call('pf_ks2_set_contract', { p_project: p, p_kp_revision: kp }),
    acts: (p) => map(call<Ks2ActItem[]>('pf_ks2_acts', { p_project: p }), (v) => (v || []).map(normActItem)),
    createAct: (p, no, date, from, to) => call<string>('pf_ks2_act_create', { p_project: p, p_act_no: no, p_act_date: date, p_from: from, p_to: to }),
    act: async (id) => {
      const r = await map(call<Ks2ActData>('pf_ks2_act', { p_act: id }), normActData);
      if (!r.ok || !core) return r;
      const pc = await core.projectCounterparties(r.value.act.project_id);
      return { ok: true, value: { ...r.value, customer: pc.customer } };
    },
    save: (id, header, rows, note) => call<number>('pf_ks2_save', { p_act: id, p_header: header, p_rows: rows, p_note: note || null }),
    issue: (id) => call('pf_ks2_issue', { p_act: id }),
    annul: (id, reason) => call('pf_ks2_annul', { p_act: id, p_reason: reason }),
    revisions: (id) => map(call<Ks2RevisionItem[]>('pf_ks2_revisions', { p_act: id }), (v) => (v || []).map((r) => ({ ...r, total: n(r.total) }))),
    revision: (id) => map(call<Ks2SavedRevision>('pf_ks2_revision', { p_revision: id }), normRevision),
    template: (p) => call<Ks2Template | null>('pf_ks2_template', { p_project: p }),
    saveTemplate: (p, name, data) => call<string>('pf_ks2_template_save', { p_project: p, p_name: name, p_data: data }),
  };
}
