/**
 * Цены, шаблон надбавок, сметы и КП с сервера (P2-0006c): только функции public.pf_price_* / pf_overhead_* / pf_estimate_* /
 * pf_kp_* миграции 008. Право planfact.estimate.manage, изоляцию компаний и неизменяемость редакций КП проверяет сервер.
 */
import { getClient } from '../../../platform/auth/auth.service.ts';
import { mapCompanyError } from '../../../platform/company/company.service.ts';
import type { Result } from '../../../platform/company/company.service.ts';
import { chunks } from '../vor/vor.service.ts';

export const ESTIMATE_MANAGE = 'planfact.estimate.manage';
const PRICES_CHUNK = 2000;

export type PriceKind = 'work' | 'material';
export interface PriceItem {
  id: string; kind: PriceKind; work_type_id: string | null; name: string; unit_text: string; unit_code: string | null;
  price_labor: number | null; price_material: number | null; price_date: string; note: string | null;
  updated_at: string; updated_by_email: string | null;
}
export interface PriceInput {
  kind: PriceKind; work_type_id?: string | null; name?: string; unit_text?: string;
  price_labor?: number | null; price_material?: number | null; price_date?: string | null; note?: string | null;
}
export interface PriceHistoryRow {
  changed_at: string; changed_by_email: string | null; old_labor: number | null; new_labor: number | null;
  old_material: number | null; new_material: number | null; price_date: string; source: string;
}
export interface UpsertCounts { created: number; updated: number; unchanged: number }

export type OverheadSection = 'materials' | 'fot_smr' | 'fot_itr' | 'household' | 'other' | 'profit' | 'office' | 'vat';
export type OverheadMethod = 'percent_of' | 'qty_rate' | 'fixed' | 'gross_up';
export interface OverheadBase { totals?: ('labor' | 'material')[]; sections?: OverheadSection[]; lines?: string[] }
export interface OverheadParams { percent?: number; factors?: number[]; amount?: number; share?: number }
export interface OverheadLine {
  key: string; section: OverheadSection; name: string; comment: string | null; method: OverheadMethod;
  base: OverheadBase; params: OverheadParams; in_total: boolean;
}

export interface EstimateItem {
  id: string; name: string; import_ids: string[]; area_m2: number | null; rows: number; unpriced: number; revisions: number;
  created_at: string; created_by_email: string | null; updated_at: string;
}
export type PriceSource = 'reference' | 'manual' | 'none';
export interface EstimateRow {
  source_row_id: string; import_id: string; row_no: number; kind: 'group' | 'work' | 'material' | 'context'; number: string | null;
  name: string; unit_text: string | null; qty: number | null; norm: number | null; parent_row_no: number | null; work_type_id: string | null;
  price_labor: number | null; price_material: number | null; price_source: PriceSource | null;
  ref_item_id: string | null; ref_labor: number | null; ref_material: number | null; ref_date: string | null;
}
export interface RowPrice { source_row_id: string; price_labor?: number | null; price_material?: number | null; reset?: boolean }
export interface KpRevision { id: string; revision_no: number; total: number; file_sha256: string; note: string | null; created_at: string; created_by_email: string | null }
export interface KpRevisionFull { id: string; revision_no: number; total: number; file_sha256: string; note: string | null; created_at: string; snapshot: Record<string, unknown> }

export interface EstimateApi {
  /** Есть ли у вошедшего право на цены и сметы в компании (сервер отвечает на pf_price_list). */
  canUse(companyId: string): Promise<boolean>;
  listPrices(companyId: string): Promise<Result<PriceItem[]>>;
  upsertPrices(companyId: string, items: PriceInput[], source: string): Promise<Result<UpsertCounts>>;
  deletePrice(itemId: string): Promise<Result>;
  priceHistory(itemId: string): Promise<PriceHistoryRow[]>;
  template(companyId: string): Promise<Result<OverheadLine[]>>;
  saveTemplate(companyId: string, lines: OverheadLine[]): Promise<Result<number>>;
  listEstimates(projectId: string): Promise<EstimateItem[]>;
  createEstimate(projectId: string, name: string, importIds: string[], area: number | null): Promise<Result<string>>;
  updateEstimate(estimateId: string, name: string, area: number | null): Promise<Result>;
  estimateRows(estimateId: string): Promise<Result<EstimateRow[]>>;
  setPrices(estimateId: string, items: RowPrice[]): Promise<Result<number>>;
  refill(estimateId: string): Promise<Result<number>>;
  overheads(estimateId: string): Promise<Result<OverheadLine[]>>;
  saveOverheads(estimateId: string, lines: OverheadLine[]): Promise<Result<number>>;
  createKp(estimateId: string, sha256: string, snapshot: Record<string, unknown>, total: number, note: string | null): Promise<Result<{ id: string; revision_no: number }>>;
  listKp(estimateId: string): Promise<KpRevision[]>;
  getKp(revisionId: string): Promise<Result<KpRevisionFull>>;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

/** Числа приходят из numeric как строки или числа — приводим к числу. */
export function normPrice(p: PriceItem): PriceItem { return { ...p, price_labor: num(p.price_labor), price_material: num(p.price_material) }; }
export function normRow(r: EstimateRow): EstimateRow {
  return { ...r, qty: num(r.qty), norm: num(r.norm), price_labor: num(r.price_labor), price_material: num(r.price_material),
    ref_labor: num(r.ref_labor), ref_material: num(r.ref_material) };
}
function lineOut(l: OverheadLine): Record<string, unknown> {
  return { key: l.key, section: l.section, name: l.name, comment: l.comment || null, method: l.method, base: l.base, params: l.params, in_total: l.in_total };
}
function lineIn(l: OverheadLine & { sort?: number }): OverheadLine {
  return { key: l.key, section: l.section, name: l.name, comment: l.comment ?? null, method: l.method, base: l.base || {}, params: l.params || {}, in_total: l.in_total !== false };
}

export function createEstimateService(): EstimateApi | null {
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
  async function rows<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
    const r = await call<T[]>(fn, args);
    return r.ok && Array.isArray(r.value) ? r.value : [];
  }
  return {
    async canUse(company) { return (await call('pf_price_list', { p_company: company })).ok; },
    async listPrices(company) {
      const r = await call<PriceItem[]>('pf_price_list', { p_company: company });
      return r.ok ? { ok: true, value: (r.value || []).map(normPrice) } : r;
    },
    async upsertPrices(company, items, source) {
      const sum: UpsertCounts = { created: 0, updated: 0, unchanged: 0 };
      for (const part of chunks(items, PRICES_CHUNK)) {
        const r = await call<UpsertCounts>('pf_price_upsert', { p_company: company, p_items: part, p_source: source });
        if (!r.ok) return r;
        sum.created += r.value.created; sum.updated += r.value.updated; sum.unchanged += r.value.unchanged;
      }
      return { ok: true, value: sum };
    },
    deletePrice: (id) => call('pf_price_delete', { p_item: id }),
    priceHistory: async (id) => (await rows<PriceHistoryRow>('pf_price_history', { p_item: id }))
      .map((h) => ({ ...h, old_labor: num(h.old_labor), new_labor: num(h.new_labor), old_material: num(h.old_material), new_material: num(h.new_material) })),
    async template(company) {
      const r = await call<OverheadLine[]>('pf_overhead_template', { p_company: company });
      return r.ok ? { ok: true, value: (r.value || []).map(lineIn) } : r;
    },
    saveTemplate: (company, lines) => call<number>('pf_overhead_save_template', { p_company: company, p_lines: lines.map(lineOut) }),
    listEstimates: async (p) => (await rows<EstimateItem>('pf_estimate_list', { p_project: p })).map((e) => ({ ...e, area_m2: num(e.area_m2) })),
    createEstimate: (p, name, imports, area) => call<string>('pf_estimate_create', { p_project: p, p_name: name, p_imports: imports, p_area: area }),
    updateEstimate: (id, name, area) => call('pf_estimate_update', { p_estimate: id, p_name: name, p_area: area }),
    async estimateRows(id) {
      const r = await call<EstimateRow[]>('pf_estimate_rows', { p_estimate: id });
      return r.ok ? { ok: true, value: (r.value || []).map(normRow) } : r;
    },
    async setPrices(id, items) {
      let total = 0;
      for (const part of chunks(items, PRICES_CHUNK)) {
        const r = await call<number>('pf_estimate_set_prices', { p_estimate: id, p_items: part });
        if (!r.ok) return r;
        total += r.value || 0;
      }
      return { ok: true, value: total };
    },
    refill: (id) => call<number>('pf_estimate_refill', { p_estimate: id }),
    async overheads(id) {
      const r = await call<OverheadLine[]>('pf_estimate_overheads', { p_estimate: id });
      return r.ok ? { ok: true, value: (r.value || []).map(lineIn) } : r;
    },
    saveOverheads: (id, lines) => call<number>('pf_estimate_save_overheads', { p_estimate: id, p_lines: lines.map(lineOut) }),
    createKp: (id, sha, snapshot, total, note) => call<{ id: string; revision_no: number }>('pf_kp_create',
      { p_estimate: id, p_file_sha256: sha, p_snapshot: snapshot, p_total: total, p_note: note }),
    listKp: async (id) => (await rows<KpRevision>('pf_kp_list', { p_estimate: id })).map((k) => ({ ...k, total: Number(k.total) })),
    async getKp(id) {
      const r = await call<KpRevisionFull>('pf_kp_get', { p_revision: id });
      return r.ok && r.value ? { ok: true, value: { ...r.value, total: Number(r.value.total) } } : (r.ok ? { ok: false, message: 'Редакция КП не найдена' } : r);
    }
  };
}
