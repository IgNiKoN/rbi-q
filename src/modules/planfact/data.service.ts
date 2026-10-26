/**
 * Данные «План/Факт» с сервера: только через функции public.pf_* (права проверяет сервер; кнопки — подсказка).
 */
import { getClient } from '../../platform/auth/auth.service.ts';
import { fetchMyProjects } from '../../platform/core/projects.service.ts';

export interface ProjectRow { id: string; name: string; company_id: string }
export interface WorkRow { id: string; name: string; unit: string; plan_qty: number | null; plan_amount: number | null; created_at: string }
export interface AuditRow {
  at: string; actor_email: string | null; action: string; record_id: string;
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null;
}
export type AddWorkResult = { ok: true } | { ok: false; message: string };

export interface DataApi {
  listProjects(): Promise<ProjectRow[]>;
  listWorks(projectId: string): Promise<WorkRow[]>;
  permissions(projectId: string): Promise<string[]>;
  addWork(projectId: string, name: string, unit: string, planQty: number | null): Promise<AddWorkResult>;
  listAudit(projectId: string): Promise<AuditRow[]>;
}

export function createDataService(): DataApi | null {
  const c = getClient();
  if (!c) return null;
  async function rows<T>(fn: string, args?: Record<string, unknown>): Promise<T[]> {
    const { data, error } = await c!.rpc(fn, args);
    if (error || !Array.isArray(data)) return [];
    return data as T[];
  }
  return {
    listProjects: () => fetchMyProjects<ProjectRow>(),
    listWorks: (p) => rows<WorkRow>('pf_list_works', { p_project: p }),
    async permissions(p) {
      const { data, error } = await c!.rpc('pf_my_permissions', { p_project: p });
      return !error && Array.isArray(data) ? (data as string[]) : [];
    },
    async addWork(p, name, unit, qty) {
      const { error } = await c!.rpc('pf_add_work', { p_project: p, p_name: name, p_unit: unit, p_plan_qty: qty });
      if (!error) return { ok: true };
      return { ok: false, message: error.code === '42501' || /row-level|permission|forbidden|no access/i.test(error.message)
        ? 'Недостаточно прав для добавления работы' : 'Не удалось добавить работу. Попробуйте ещё раз' };
    },
    listAudit: (p) => rows<AuditRow>('pf_list_audit', { p_project: p })
  };
}
