/**
 * ВОР с сервера (P2-0006; редакции — P2-0006b, 046): только функции public.pf_vor_* — права, изоляция компаний и неизменяемость
 * подтверждённой загрузки проверяет сервер; кнопки на экране — подсказка.
 * P2-0060: чтения — через копию для просмотра (без сети — последние данные), запись без сети не отправляется.
 */
import { getClient } from '../../../platform/auth/auth.service.ts';
import { mapCompanyError } from '../../../platform/company/company.service.ts';
import type { Result } from '../../../platform/company/company.service.ts';
import type { ParsedRow, RowContext } from './parse.ts';
import type { BaseRow } from './revision.ts';
import { fetchMyProjects } from '../../../platform/core/projects.service.ts';
import { copyCall, offlineNow } from '../../../platform/services/offline/copy.ts';
import { createPermsBatch } from './permissions-batch.ts';
import type { PermsBatch } from './permissions-batch.ts';

/** P2-0060: функции-чтения ВОР (копия для просмотра); остальные pf_vor_* — запись. */
export const VOR_READS: ReadonlySet<string> = new Set(['pf_my_permissions', 'pf_vor_list_imports', 'pf_vor_import_rows', 'pf_vor_list_profiles',
  'pf_vor_list_work_types', 'pf_vor_dictionary', 'pf_vor_positions', 'pf_vor_revision_base', 'pf_vor_revision_changes']);

export const VOR_MANAGE = 'planfact.vor.manage';
export const ROWS_CHUNK = 1000;

export interface VorProject { id: string; name: string; company_id: string; archived_at?: string | null }
export interface VorImport {
  id: string; file_name: string; sheet_name: string; status: 'draft' | 'confirmed'; row_count: number; works: number; positions: number;
  created_at: string; created_by_email: string | null; confirmed_at: string | null; profile_id: string | null;
  /** P2-0006b (046): номер редакции, предыдущая и первая редакция цепочки, «действующая», кто подтвердил. */
  revision_no?: number; previous_import_id?: string | null; root_import_id?: string; is_current?: boolean; confirmed_by_email?: string | null;
}
export interface VorRow {
  id: string; row_no: number; kind: ParsedRow['kind']; number: string | null; name: string; unit_text: string | null;
  qty: number | null; norm: number | null; prices: Record<string, number | null>; context: RowContext; parent_row_no: number | null;
  location_id: string | null; work_type_id: string | null; unit_id: string | null; match: 'green' | 'yellow' | 'red' | null;
}
export interface VorProfile { id: string; name: string; signature: string; column_map: Record<string, unknown>; rules: Record<string, unknown>; updated_at: string }
export interface WorkType { id: string; code: string | null; name: string; unit_id: string | null; unit_code: string | null }
export interface DictEntry { canon_name: string; unit_text: string; work_type_id: string; hits: number }
export interface Resolution { row_no: number; location_id: string | null; work_type_id: string | null; unit_id: string | null; match: 'green' | 'yellow' | 'red' | null }
export interface VorPosition {
  id: string; location_id: string; location_path: string; work_type_id: string; work_type: string; unit_code: string; qty: number;
  apartments_note: string | null; import_id: string; file_name: string; source_row_no: number | null;
  /** P2-0006b: снята в новой редакции (факт сохранён, в план не считается); номер редакции файла и строки. */
  withdrawn?: boolean; revision_no?: number;
}
/** previousId — новая редакция к действующей (pf_vor_create_revision), иначе — отдельная ВОР (pf_vor_create_import). */
export interface NewImport { projectId: string; fileName: string; sha256: string; sheet: string; profileId: string | null; totals: Record<string, unknown>; previousId?: string | null }
/** Итог pf_vor_accept_revision. */
export interface AcceptResult { revision_no: number; added: number; unchanged: number; qty_changed: number; withdrawn: number; fact_kept: number; fact_moved_entries: number }
/** Событие редакции (pf_vor_revision_changes): объём изменён / позиция снята. */
export interface RevisionChange { position_id: string; kind: 'qty' | 'withdrawn'; qty_before: number; qty_after: number; location_path: string; work_name: string; unit_code: string; created_at: string; created_by_email: string | null }

export interface VorApi {
  listProjects(): Promise<VorProject[]>;
  permissions(projectId: string): Promise<string[]>;
  listImports(projectId: string): Promise<VorImport[]>;
  importRows(importId: string): Promise<VorRow[]>;
  /** Черновик загрузки + все строки порциями по 1 000. */
  saveDraft(p: NewImport, rows: ParsedRow[], onProgress?: (done: number) => void): Promise<Result<string>>;
  deleteImport(importId: string): Promise<Result>;
  listProfiles(projectId: string): Promise<VorProfile[]>;
  saveProfile(projectId: string, name: string, signature: string, columnMap: Record<string, unknown>): Promise<Result<string>>;
  listWorkTypes(projectId: string): Promise<WorkType[]>;
  addWorkType(projectId: string, name: string, unitId: string | null): Promise<Result<string>>;
  /** Пачка видов работ (существующий canon+ЕИ — его id): [{name, unit_id}] → [{name, unit_id, id, created}]. */
  addWorkTypes(projectId: string, items: { name: string; unit_id: string | null }[]): Promise<Result<{ name: string; unit_id: string | null; id: string; created: boolean }[]>>;
  dictionary(projectId: string): Promise<DictEntry[]>;
  learn(projectId: string, items: { name: string; unit_text: string; work_type_id: string }[]): Promise<Result<number>>;
  resolveRows(importId: string, items: Resolution[]): Promise<Result<number>>;
  confirm(importId: string): Promise<Result<number>>;
  positions(projectId: string, locationId: string | null): Promise<VorPosition[]>;
  /** P2-0006b: строки действующей редакции с позициями и фактом — база сравнения для черновика новой редакции. */
  revisionBase(importId: string): Promise<Result<BaseRow[]>>;
  acceptRevision(importId: string, items: { row_no: number; position_id: string | null }[], red: unknown[]): Promise<Result<AcceptResult>>;
  revisionChanges(importId: string): Promise<RevisionChange[]>;
}

/** Строка разбора → строка для pf_vor_add_rows. */
export function toServerRow(r: ParsedRow): Record<string, unknown> {
  return { row_no: r.rowNo, kind: r.kind, number: r.number, name: r.name, unit_text: r.unitText, qty: r.qty, norm: r.norm,
    prices: r.prices, context: r.context, parent_row_no: r.parentRowNo, raw: r.raw };
}

export function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** P2-0078: права всех моих объектов одним вызовом — общий на клиент (экраны и «заранее» создают свои сервисы). */
let perms: { client: unknown; batch: PermsBatch } | null = null;
function permsBatch(c: NonNullable<ReturnType<typeof getClient>>): PermsBatch {
  if (perms && perms.client === c) return perms.batch;
  const batch = createPermsBatch({
    now: () => Date.now(),
    offline: offlineNow,
    myProjects: async () => (await fetchMyProjects<VorProject>()).map((p) => p.id),
    fetchAll: async (ids) => {
      try {
        const { data, error } = await c.rpc('pf_my_permissions_all', { p_projects: ids });
        return error || !Array.isArray(data) ? null : (data as Array<{ project_id: string; actions: string[] | null }>);
      } catch { return null; }
    }
  });
  if (!perms && typeof window !== 'undefined') {
    for (const e of ['rbi:platform-access', 'rbi:company-access']) window.addEventListener(e, () => { if (perms) perms.batch.reset(); });
  }
  perms = { client: c, batch };
  return batch;
}

export function createVorService(): VorApi | null {
  const c = getClient();
  if (!c) return null;
  async function rows<T>(fn: string, args?: Record<string, unknown>): Promise<T[]> {
    const r = await call<T[]>(fn, args || {});
    return r.ok && Array.isArray(r.value) ? r.value : [];
  }
  const call = <T = null>(fn: string, args: Record<string, unknown>): Promise<Result<T>> => copyCall('planfact', VOR_READS, fn, args, () => send<T>(fn, args));
  async function send<T = null>(fn: string, args: Record<string, unknown>): Promise<Result<T>> {
    try {
      const { data, error } = await c!.rpc(fn, args);
      return error ? { ok: false, message: mapCompanyError(error) } : { ok: true, value: (data ?? null) as T };
    } catch (e) {
      return { ok: false, message: mapCompanyError({ message: e instanceof Error ? e.message : '' }) };
    }
  }
  async function batched<T>(fn: string, key: string, args: Record<string, unknown>, items: T[]): Promise<Result<number>> {
    let total = 0;
    for (const part of chunks(items, ROWS_CHUNK)) {
      const r = await call<number>(fn, { ...args, [key]: part });
      if (!r.ok) return r;
      total += r.value || 0;
    }
    return { ok: true, value: total };
  }
  return {
    listProjects: () => fetchMyProjects<VorProject>(),
    async permissions(p) {
      const v = await permsBatch(c).get(p);
      if (!v) return rows<string>('pf_my_permissions', { p_project: p });
      // в копию для просмотра — как ответ pf_my_permissions этого объекта (без сети экран откроется с правами)
      const r = await copyCall('planfact', VOR_READS, 'pf_my_permissions', { p_project: p }, async () => ({ ok: true as const, value: v }));
      return r.ok && Array.isArray(r.value) ? (r.value as string[]) : v;
    },
    listImports: (p) => rows<VorImport>('pf_vor_list_imports', { p_project: p }),
    importRows: (i) => rows<VorRow>('pf_vor_import_rows', { p_import: i }),
    async saveDraft(p, list, onProgress) {
      const created = p.previousId
        ? await call<string>('pf_vor_create_revision', { p_previous: p.previousId, p_file_name: p.fileName, p_sha256: p.sha256,
            p_sheet: p.sheet, p_profile: p.profileId, p_totals: p.totals })
        : await call<string>('pf_vor_create_import', { p_project: p.projectId, p_file_name: p.fileName, p_sha256: p.sha256,
            p_sheet: p.sheet, p_profile: p.profileId, p_totals: p.totals });
      if (!created.ok) return created;
      let done = 0;
      for (const part of chunks(list, ROWS_CHUNK)) {
        const r = await call<number>('pf_vor_add_rows', { p_import: created.value, p_rows: part.map(toServerRow) });
        if (!r.ok) { await call('pf_vor_delete_import', { p_import: created.value }); return r; }
        done += part.length;
        if (onProgress) onProgress(done);
      }
      return created;
    },
    deleteImport: (i) => call('pf_vor_delete_import', { p_import: i }),
    listProfiles: (p) => rows<VorProfile>('pf_vor_list_profiles', { p_project: p }),
    saveProfile: (p, name, signature, map) => call<string>('pf_vor_save_profile', { p_project: p, p_name: name, p_signature: signature, p_column_map: map, p_rules: {} }),
    listWorkTypes: (p) => rows<WorkType>('pf_vor_list_work_types', { p_project: p }),
    addWorkType: (p, name, unit) => call<string>('pf_vor_add_work_type', { p_project: p, p_name: name, p_unit: unit, p_code: null }),
    async addWorkTypes(p, items) {
      const out: { name: string; unit_id: string | null; id: string; created: boolean }[] = [];
      for (const part of chunks(items, ROWS_CHUNK)) {
        const r = await call<{ name: string; unit_id: string | null; id: string; created: boolean }[]>('pf_vor_add_work_types', { p_project: p, p_items: part });
        if (!r.ok) return r;
        out.push(...(r.value || []));
      }
      return { ok: true, value: out };
    },
    dictionary: (p) => rows<DictEntry>('pf_vor_dictionary', { p_project: p }),
    learn: (p, items) => batched('pf_vor_learn', 'p_items', { p_project: p }, items),
    resolveRows: (i, items) => batched('pf_vor_resolve_rows', 'p_items', { p_import: i }, items),
    confirm: (i) => call<number>('pf_vor_confirm', { p_import: i }),
    positions: (p, loc) => rows<VorPosition>('pf_vor_positions', { p_project: p, p_location: loc }),
    async revisionBase(i) {
      const r = await call<BaseRow[]>('pf_vor_revision_base', { p_import: i });
      return r.ok ? { ok: true, value: Array.isArray(r.value) ? r.value.map((x) => ({ ...x, qty: x.qty === null ? null : Number(x.qty),
        position_qty: x.position_qty === null ? null : Number(x.position_qty), fact_qty: Number(x.fact_qty || 0), pending_qty: Number(x.pending_qty || 0) })) : [] } : r;
    },
    acceptRevision: (i, items, red) => call<AcceptResult>('pf_vor_accept_revision', { p_import: i, p_items: items, p_red: red }),
    revisionChanges: (i) => rows<RevisionChange>('pf_vor_revision_changes', { p_import: i })
  };
}
