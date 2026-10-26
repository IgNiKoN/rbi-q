/**
 * Данные раздела «Компания»: только через функции public.pf_* миграции 005 (права и правила защиты — на сервере).
 */
import { getClient } from '../auth/auth.service.ts';
import { fetchMyProjects } from '../core/projects.service.ts';
import { createCoreService } from '../core/core.service.ts';

export interface CompanyRef { company_id: string; company_name: string }
export interface CatalogRow { action: string; description: string }
export interface RoleRow { id: string; name: string; template_code: string | null; actions: string[]; active_assignments: number }
export interface MemberRow {
  user_id: string; email: string | null; assignment_id: string | null; role_id: string | null; role_name: string | null;
  project_id: string | null; project_name: string | null; valid_from: string | null; valid_to: string | null; is_active: boolean | null;
  /** P2-0018: фирма подрядчика назначения (контрагент ядра). */
  counterparty_id?: string | null; counterparty_name?: string | null;
  /** P2-0028 (032): ФИО (ядро), отключён, ждёт смены пароля, учётка создана этой компанией (её пароль можно сбросить). */
  full_name?: string | null; disabled_at?: string | null; must_change_password?: boolean; managed?: boolean;
  /** P2-0033 (033): закреплённые объекты Качества назначения; null — все объекты. */
  quality_objects?: QualityObjectRef[] | null;
}
/** P2-0033: объект Качества компании (постоянный id, ADR-070) — для закрепления сотрудника при назначении роли. */
export interface QualityObjectRef { id: string; name: string }
/** P2-0028: результат «Добавить сотрудника» — временный пароль только у новой учётки и только один раз. */
export interface AddMemberResult { user_id: string; temp_password: string | null; created: boolean }
export interface ContractorRef { id: string; name: string; draft?: boolean }
export interface ProjectRef { id: string; name: string; company_id: string; archived_at?: string | null }
export interface CompanyAuditRow {
  at: string; actor_email: string | null; action: string; record_id: string; subject_email: string | null;
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; table_name?: string;
}
export type Result<T = null> = { ok: true; value: T } | { ok: false; message: string };

export interface CompanyApi {
  myAdminCompanies(): Promise<CompanyRef[]>;
  catalog(): Promise<CatalogRow[]>;
  listRoles(companyId: string): Promise<RoleRow[]>;
  listMembers(companyId: string): Promise<MemberRow[]>;
  listProjects(): Promise<ProjectRef[]>;
  listAudit(companyId: string): Promise<CompanyAuditRow[]>;
  createRole(sourceRoleId: string, name: string): Promise<Result<string>>;
  renameRole(roleId: string, name: string): Promise<Result>;
  setRoleActions(roleId: string, actions: string[]): Promise<Result>;
  deleteRole(roleId: string): Promise<Result>;
  /** Действующие контрагенты компании вида «подрядчик» — фирма для назначения роли с quality.scope.contractor. */
  listContractors(companyId: string): Promise<ContractorRef[]>;
  /** P2-0033: объекты Качества компании для выбора при назначении (пусто — у компании нет объектов Качества). */
  listQualityObjects?(companyId: string): Promise<QualityObjectRef[]>;
  /** objectIds — id объектов Качества (пусто — все объекты). */
  assignRole(userId: string, roleId: string, projectId: string | null, validTo: string | null, counterpartyId?: string | null,
    objectIds?: string[]): Promise<Result<string>>;
  revoke(assignmentId: string): Promise<Result>;
  /** P2-0028: сотрудники — добавить (учётка + роль), сбросить пароль (новый временный), отключить доступ. */
  addMember(companyId: string, email: string, fullName: string, roleId: string, projectId: string | null): Promise<Result<AddMemberResult>>;
  resetPassword(companyId: string, userId: string): Promise<Result<string>>;
  disableMember(companyId: string, userId: string): Promise<Result>;
  /** P2-0028 (032a): ФИО сотрудника — сервер переписывает имя в его записях Качества. Возвращает число переписанных записей. */
  setFullName(userId: string, fullName: string): Promise<Result<number>>;
}

/** Ошибка сервера → понятный текст. Русские сообщения сервера (миграция 005) показываются как есть. */
export function mapCompanyError(err: { code?: string; message?: string } | null | undefined): string {
  const m = (err && err.message) || '';
  if (/[А-Яа-яЁё]/.test(m)) return m;
  if (/cannot assign a role to yourself/i.test(m)) return 'Нельзя назначить роль самому себе';
  if (/failed to fetch|network|load failed/i.test(m)) return 'Нет связи с сервером. Попробуйте позже';
  if ((err && err.code === '42501') || /forbidden|permission denied/i.test(m)) return 'Нет права на это действие';
  return 'Не удалось выполнить. Попробуйте ещё раз';
}

export function createCompanyService(): CompanyApi | null {
  const c = getClient();
  if (!c) return null;
  async function rows<T>(fn: string, args?: Record<string, unknown>): Promise<T[]> {
    const { data, error } = await c!.rpc(fn, args);
    if (error || !Array.isArray(data)) return [];
    return data as T[];
  }
  async function call<T = null>(fn: string, args: Record<string, unknown>): Promise<Result<T>> {
    try {
      const { data, error } = await c!.rpc(fn, args);
      return error ? { ok: false, message: mapCompanyError(error) } : { ok: true, value: (data ?? null) as T };
    } catch (e) {
      return { ok: false, message: mapCompanyError({ message: e instanceof Error ? e.message : '' }) };
    }
  }
  return {
    myAdminCompanies: () => rows<CompanyRef>('pf_my_admin_companies'),
    catalog: () => rows<CatalogRow>('pf_permission_catalog'),
    listRoles: (co) => rows<RoleRow>('pf_list_company_roles', { p_company: co }),
    listMembers: (co) => rows<MemberRow>('pf_list_company_members', { p_company: co }),
    listProjects: () => fetchMyProjects<ProjectRef>(),
    listAudit: (co) => rows<CompanyAuditRow>('pf_list_company_audit', { p_company: co, p_limit: 100 }),
    createRole: (src, name) => call<string>('pf_create_role', { p_source_role: src, p_name: name }),
    renameRole: (id, name) => call('pf_rename_role', { p_role: id, p_name: name }),
    setRoleActions: (id, actions) => call('pf_set_role_actions', { p_role: id, p_actions: actions }),
    deleteRole: (id) => call('pf_delete_role', { p_role: id }),
    listContractors: async (co) => ((await createCoreService()?.listCounterparties(co, false)) || [])   // REUSE: контрагенты — ядро
      .filter((x) => x.kinds.includes('contractor')).map((x) => ({ id: x.id, name: x.name, draft: x.draft })),
    listQualityObjects: (co) => rows<QualityObjectRef>('pf_list_quality_objects', { p_company: co }),
    assignRole: (u, r, p, to, cp, objs) => call<string>('pf_assign_role', { p_user: u, p_role: r, p_project: p, p_valid_to: to,
      ...(cp ? { p_counterparty: cp } : {}), ...(objs && objs.length ? { p_objects: objs } : {}) }),
    revoke: (id) => call('pf_revoke_assignment', { p_assignment: id }),
    addMember: async (co, email, name, role, project) => {
      const r = await call<AddMemberResult[]>('pf_company_add_member', { p_company: co, p_email: email, p_full_name: name, p_role: role, p_project: project });
      if (!r.ok) return r;
      const row = Array.isArray(r.value) ? r.value[0] : null;
      return row ? { ok: true, value: row } : { ok: false, message: 'Не удалось выполнить. Попробуйте ещё раз' };
    },
    resetPassword: (co, u) => call<string>('pf_company_reset_password', { p_company: co, p_user: u }),
    disableMember: (co, u) => call('pf_company_disable_member', { p_company: co, p_user: u }),
    setFullName: (u, name) => call<number>('pf_set_full_name', { p_user: u, p_full_name: name })
  };
}
