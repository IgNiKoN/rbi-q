/**
 * Сервис ядра платформы (P2-0015, ADR-066): единственный вход модулей к мастер-данным компании — контрагенты
 * (дальше — объекты, локации, ЕИ). Модуль не хранит копий и не вызывает RPC ядра в обход этого файла
 * (standards/SINGLE_SOURCE_OF_TRUTH.md). Права и изоляция компаний — на сервере.
 */
import { getClient } from '../auth/auth.service.ts';
import { mapCompanyError } from '../company/company.service.ts';
import type { Result } from '../company/company.service.ts';
import { cleanRequisites } from './counterparties.ts';
import type { Counterparty, CounterpartyDraft, ProjectCounterparties } from './counterparties.ts';
import { copyCall } from '../services/offline/copy.ts';

/** P2-0060: чтения ядра (доступ, контрагенты) — через копию для просмотра (без сети — последние данные); остальные функции — запись, без сети не отправляется. */
export const CORE_READS: ReadonlySet<string> = new Set(['pf_my_company_access', 'pf_counterparties_list', 'pf_project_counterparties']);
/** P2-0060: доступ к компании — служебное чтение (в пометку «данные на …» не идёт). */
const CORE_ACCESS: ReadonlySet<string> = new Set(['pf_my_company_access']);

/** Компании пользователя и что он может в справочниках (pf_my_company_access; кнопки — подсказка, проверяет сервер). */
export interface CompanyAccess {
  company_id: string; company_name: string;
  can_manage_projects: boolean; can_manage_units: boolean; can_manage_roles: boolean; can_manage_counterparties: boolean;
}

export interface CoreApi {
  myAccess(): Promise<CompanyAccess[]>;
  listCounterparties(companyId: string, includeArchived?: boolean): Promise<Counterparty[]>;
  saveCounterparty(companyId: string, id: string | null, d: CounterpartyDraft): Promise<Result<string>>;
  archiveCounterparty(id: string, archived: boolean): Promise<Result>;
  /** Заказчик и генподрядчик объекта (карточки для документов); нет доступа или ошибка — оба null. */
  projectCounterparties(projectId: string): Promise<ProjectCounterparties>;
  setProjectCounterparties(projectId: string, customerId: string | null, generalContractorId: string | null): Promise<Result>;
}

export function createCoreService(): CoreApi | null {
  const c = getClient();
  if (!c) return null;
  async function rows<T>(fn: string, args?: Record<string, unknown>): Promise<T[]> {
    const r = await call<T[]>(fn, args || {});
    return r.ok && Array.isArray(r.value) ? r.value : [];
  }
  const call = <T = null>(fn: string, args: Record<string, unknown>): Promise<Result<T>> => copyCall('company', CORE_READS, fn, args, () => send<T>(fn, args), CORE_ACCESS);
  async function send<T = null>(fn: string, args: Record<string, unknown>): Promise<Result<T>> {
    try {
      const { data, error } = await c!.rpc(fn, args);
      return error ? { ok: false, message: mapCompanyError(error) } : { ok: true, value: (data ?? null) as T };
    } catch (e) {
      return { ok: false, message: mapCompanyError({ message: e instanceof Error ? e.message : '' }) };
    }
  }
  return {
    myAccess: () => rows<CompanyAccess>('pf_my_company_access'),
    listCounterparties: (company, archived) =>
      rows<Counterparty>('pf_counterparties_list', { p_company: company, p_include_archived: !!archived })
        .then((l) => l.map((x) => ({ ...x, requisites: x.requisites || {}, kinds: x.kinds || [] }))),
    saveCounterparty: (company, id, d) => call<string>('pf_counterparties_save', {
      p_company: company, p_id: id, p_name: d.name.trim(), p_inn: d.inn, p_kpp: d.kpp || null,
      p_kinds: d.kinds, p_requisites: cleanRequisites(d.requisites)
    }),
    archiveCounterparty: (id, archived) => call('pf_counterparties_archive', { p_id: id, p_archived: archived }),
    projectCounterparties: async (project) => {
      const r = await call<ProjectCounterparties>('pf_project_counterparties', { p_project: project });
      return r.ok && r.value ? { customer: r.value.customer || null, general_contractor: r.value.general_contractor || null }
        : { customer: null, general_contractor: null };
    },
    setProjectCounterparties: (project, customer, gc) =>
      call('pf_project_set_counterparties', { p_project: project, p_customer: customer, p_general_contractor: gc })
  };
}
