/**
 * Ядро платформы (P2-0015): объекты (проекты), дерево локаций и единицы измерения — только через функции public.pf_* миграции 006
 * (права и изоляция компаний — на сервере; кнопки на экране — подсказка). Модули берут эти данные только отсюда
 * (standards/SINGLE_SOURCE_OF_TRUTH.md; проверка — src/platform/core/__tests__/single-entry.test.ts).
 */
import { getClient } from '../auth/auth.service.ts';
import { mapCompanyError } from '../company/company.service.ts';
import type { PlanNodeType } from '../../services/locations/types.ts';
import type { Result } from '../company/company.service.ts';

import type { CompanyAccess } from './core.service.ts';
export type { CompanyAccess } from './core.service.ts';
export interface ProjectItem {
  id: string; name: string; code: string | null; archived_at: string | null; created_at: string; can_manage: boolean;
  /** P2-0015: заказчик и генподрядчик объекта (контрагенты ядра); у старых ответов сервера полей может не быть. */
  customer_id?: string | null; customer_name?: string | null; general_contractor_id?: string | null; general_contractor_name?: string | null;
}
export interface LocationNode {
  id: string; parent_id: string | null; node_type: PlanNodeType; name: string; sort_order: number;
  area: number | null; depth: number; path: string; child_count: number;
}
export interface UnitItem { id: string; company_id: string | null; code: string; name: string; is_common: boolean }
export interface GenerateParams {
  projectId: string; parentId: string | null; name: string;
  sections: number; floors: number; apartmentsPerFloor: number; firstFloor: number;
}

export interface ProjectsApi {
  myAccess(): Promise<CompanyAccess[]>;
  listProjects(companyId: string): Promise<ProjectItem[]>;
  createProject(companyId: string, name: string, code: string): Promise<Result<string>>;
  updateProject(projectId: string, name: string, code: string, archived: boolean | null): Promise<Result>;
  listLocations(projectId: string, parentId: string | null): Promise<LocationNode[]>;
  addLocation(projectId: string, parentId: string | null, type: PlanNodeType, name: string): Promise<Result<string>>;
  renameLocation(locationId: string, name: string): Promise<Result>;
  deleteLocation(locationId: string, cascade: boolean): Promise<Result<number>>;
  generateBuilding(p: GenerateParams): Promise<Result<string>>;
  listUnits(companyId: string): Promise<UnitItem[]>;
  addUnit(companyId: string, code: string, name: string): Promise<Result<string>>;
  deleteUnit(unitId: string): Promise<Result>;
}

/**
 * Объекты, доступные пользователю (pf_my_projects, строка объекта целиком) — единый вход модулей к списку объектов (P2-0015).
 * Ошибка или нет входа — пустой список.
 */
export async function fetchMyProjects<T>(): Promise<T[]> {
  const c = getClient();
  if (!c) return [];
  const { data, error } = await c.rpc('pf_my_projects');
  return error || !Array.isArray(data) ? [] : (data as T[]);
}

/** Число узлов, которое создаст генератор: корпус + N·(секция + M·(этаж + K квартир)). Та же формула, что на сервере. */
export function generatedNodeCount(sections: number, floors: number, apartmentsPerFloor: number): number {
  return 1 + sections * (1 + floors * (1 + apartmentsPerFloor));
}
export const GENERATE_LIMIT = 5000;

export function createProjectsService(): ProjectsApi | null {
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
    myAccess: () => rows<CompanyAccess>('pf_my_company_access'),
    listProjects: (company) => rows<ProjectItem>('pf_company_projects', { p_company: company }),
    createProject: (company, name, code) => call<string>('pf_create_project', { p_company: company, p_name: name, p_code: code || null }),
    updateProject: (id, name, code, archived) => call('pf_update_project', { p_project: id, p_name: name, p_code: code || null, p_archived: archived }),
    listLocations: (project, parent) => rows<LocationNode>('pf_list_locations', { p_project: project, p_parent: parent }),
    addLocation: (project, parent, type, name) => call<string>('pf_add_location', { p_project: project, p_parent: parent, p_type: type, p_name: name }),
    renameLocation: (id, name) => call('pf_rename_location', { p_location: id, p_name: name }),
    deleteLocation: (id, cascade) => call<number>('pf_delete_location', { p_location: id, p_cascade: cascade }),
    generateBuilding: (p) => call<string>('pf_generate_building', {
      p_project: p.projectId, p_parent: p.parentId, p_name: p.name, p_sections: p.sections, p_floors: p.floors,
      p_apartments_per_floor: p.apartmentsPerFloor, p_first_floor: p.firstFloor
    }),
    listUnits: (company) => rows<UnitItem>('pf_list_units', { p_company: company }),
    addUnit: (company, code, name) => call<string>('pf_add_unit', { p_company: company, p_code: code, p_name: name }),
    deleteUnit: (id) => call('pf_delete_unit', { p_unit: id })
  };
}
