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
import { copyCall, offlineRead, pruneToMyProjects, rpcRead } from '../services/offline/copy.ts';

/** P2-0060: чтения ядра (объекты, места, единицы) — через копию для просмотра (без сети — последние данные); остальные функции — запись, без сети не отправляется. */
export const PROJECTS_READS: ReadonlySet<string> = new Set(['pf_my_company_access', 'pf_company_projects', 'pf_list_locations', 'pf_list_units', 'pf_project_catalog', 'pf_company_divisions', 'pf_project_dicts', 'pf_project_places', 'pf_location_path']);
/** P2-0060: доступ к компании — служебное чтение (в пометку «данные на …» не идёт). */
const CORE_ACCESS: ReadonlySet<string> = new Set(['pf_my_company_access']);
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
/** P2-0047: проект с карточкой («Компания → Проекты», pf_project_catalog) — права ядра, модуль не нужен. */
export interface ProjectCard extends ProjectItem {
  division_id: string | null; division_name: string | null; address: string | null;
  planned_start: string | null; planned_finish: string | null; manager_user_id: string | null; manager_name: string | null;
  stage: string; our_role: string | null; timezone: string; country: string;
  object_count: number; place_count: number; places_led_by_quality: boolean;
}
/** P2-0047: поля карточки для pf_save_project; ключ без значения — не меняется, null — очистить. */
export type ProjectCardInput = Partial<{
  name: string; code: string | null; division_id: string | null; address: string | null; planned_start: string | null; planned_finish: string | null;
  manager_user_id: string | null; customer_id: string | null; general_contractor_id: string | null; stage: string; our_role: string | null;
  timezone: string; country: string; archived: boolean;
}>;
export interface Division { id: string; name: string; head_user_id: string | null; head_name: string | null; archived_at: string | null; project_count: number; can_manage: boolean }
/** P2-0047: справочники платформы (стадии, виды объектов, роли в проекте) — данные, а не код (правило 9). */
export interface DictItem { code: string; name: string; sort_order: number }
export interface ProjectDicts { stages: DictItem[]; objectKinds: DictItem[]; roles: DictItem[] }

/** P2-0047: место дерева проекта (pf_project_places): верх — объект с видом; у помещения — строительный номер и номер БТИ. */
export interface PlaceNode {
  id: string; parent_id: string | null; node_type: PlanNodeType; object_kind: string | null; name: string; build_no: string | null; bti_no: string | null;
  sort_order: number; depth: number; path: string; child_count: number; apartment_count: number | null;
  /** P2-0056: площадь, м² и комнат (0 — студия) — у помещения. */
  area?: number | null; rooms?: number | null;
}
/** P2-0056: строка загрузки списка помещений (названия уже приведены: «Корпус 1», «Секция 1», «эт. 3», «кв. 45»). */
export interface ImportRow {
  row_no: number; object: string | null; section: string | null; floor: string | null; name: string | null;
  build_no: string | null; bti_no: string | null; area: string | null; rooms: string | null;
}
/** P2-0056: ответ pf_import_places — одинаковый для предпросмотра и загрузки. */
export interface ImportResult {
  ok: boolean; dryRun: boolean; repeat: boolean;
  created: { objects: number; sections: number; floors: number; apartments: number };
  existingRows: number[];
  differs: { row_no: number; name: string; fields: { field: 'build_no' | 'bti_no' | 'area' | 'rooms'; now: string | number | null; file: string | number | null }[] }[];
  errors: { row_no: number; msg: string }[];
  roots: string[];
}
/** P2-0047: мастер объекта (pf_fill_object) — секции × этажи × квартиры, нумерация, подвал и кровля. */
export interface FillParams {
  objectId: string; sections: number; floors: number; apartmentsPerFloor: number; firstFloor: number;
  numbering: 'through' | 'per_section'; startNo: number; basement: boolean; roof: boolean;
}
/** Сколько мест создаст мастер объекта: секции · (секция + подвал + кровля + этажи · (этаж + квартиры)). Та же формула, что на сервере. */
export function fillNodeCount(sections: number, floors: number, apartmentsPerFloor: number, basement: boolean, roof: boolean): number {
  return sections * (1 + (basement ? 1 : 0) + (roof ? 1 : 0) + floors * (1 + apartmentsPerFloor));
}

export interface UnitItem { id: string; company_id: string | null; code: string; name: string; is_common: boolean }
export interface GenerateParams {
  projectId: string; parentId: string | null; name: string;
  sections: number; floors: number; apartmentsPerFloor: number; firstFloor: number;
}

/** P2-0055: ответ переноса — прежнее положение (для «Отменить»). */
export interface MovePlaceResult { changed: boolean; oldParentId: string | null; oldBeforeId: string | null }

export interface ProjectsApi {
  myAccess(): Promise<CompanyAccess[]>;
  listProjects(companyId: string): Promise<ProjectItem[]>;
  createProject(companyId: string, name: string, code: string): Promise<Result<string>>;
  updateProject(projectId: string, name: string, code: string, archived: boolean | null): Promise<Result>;
  listLocations(projectId: string, parentId: string | null): Promise<LocationNode[]>;
  addLocation(projectId: string, parentId: string | null, type: PlanNodeType, name: string): Promise<Result<string>>;
  renameLocation(locationId: string, name: string): Promise<Result>;
  deleteLocation(locationId: string, cascade: boolean): Promise<Result<number>>;
  /** Места объекта ведутся в Качестве (P2-0045) — в Платформе только просмотр. Ошибка — false (правку всё равно проверяет сервер). */
  locationsFromQuality?(projectId: string): Promise<boolean>;
  generateBuilding(p: GenerateParams): Promise<Result<string>>;
  listUnits(companyId: string): Promise<UnitItem[]>;
  /** P2-0047: «Компания → Проекты» — каталог с карточкой, подразделения, справочники; id новой записи даёт приложение (newId). */
  projectCatalog?(companyId: string): Promise<ProjectCard[]>;
  saveProject?(companyId: string, id: string, card: ProjectCardInput): Promise<Result<string>>;
  listDivisions?(companyId: string): Promise<Division[]>;
  saveDivision?(companyId: string, id: string, name: string, headUserId: string | null, archived: boolean | null): Promise<Result<string>>;
  dicts?(): Promise<ProjectDicts>;
  /** P2-0047: «Объекты и места» — права ядра, модуль не нужен; id нового места даёт приложение. */
  projectPlaces?(projectId: string, parentId: string | null): Promise<PlaceNode[]>;
  savePlace?(projectId: string, id: string, parentId: string | null, type: PlanNodeType, name: string, kind?: string | null, buildNo?: string | null, btiNo?: string | null): Promise<Result<string>>;
  removePlace?(id: string): Promise<Result<number>>;
  fillObject?(p: FillParams): Promise<Result<number>>;
  addFloors?(sectionIds: string[], from: number, to: number, apartmentsPerFloor: number): Promise<Result<number>>;
  /** P2-0055: копия ветки; targetParentId — куда вставить (место того же проекта, в т.ч. другой корпус); без него — рядом с источником. */
  copyPlace?(sourceId: string, newId: string, name: string, targetParentId?: string | null): Promise<Result<string>>;
  /** P2-0055: перенос / порядок только внутри объекта (у объекта — только порядок, newParentId = null); before — сосед, перед которым встать. */
  movePlace?(id: string, newParentId: string | null, beforeId: string | null): Promise<Result<MovePlaceResult>>;
  /** P2-0055: вернуть ветку, удалённую одним действием («Отменить» после удаления). */
  restorePlace?(id: string): Promise<Result<number>>;
  /** P2-0055: следующий строительный номер помещения в объекте места («+ Кв.» без окна). */
  nextBuildNo?(id: string): Promise<Result<number>>;
  /** P2-0056: загрузка списка помещений; dryRun — предпросмотр без записи; batch — метка (повтор — прежний ответ, «Отменить»). */
  importPlaces?(projectId: string, batch: string, rows: ImportRow[], dryRun: boolean): Promise<Result<ImportResult>>;
  /** P2-0056: снять загрузку (места этой загрузки и добавленное внутрь потом). */
  importUndo?(batch: string): Promise<Result<number>>;
  /** P2-0056: площадь и комнаты помещения (null — стереть). */
  savePlaceInfo?(id: string, area: number | null, rooms: number | null): Promise<Result<string>>;
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
  // P2-0060: через копию для просмотра; с сетью сервер назвал мои объекты — копии остальных объектов удаляются (План/Факт, «Компания»)
  const r = await offlineRead<T[]>('company', 'pf_my_projects', () => rpcRead<T[]>('pf_my_projects'), { quiet: true });
  if (!r.ok || !Array.isArray(r.value)) return [];
  if (r.meta && r.meta.from === 'server') {
    const ids = r.value.map((p) => String((p as { id?: unknown }).id || '')).filter(Boolean);
    void pruneToMyProjects(ids, ['planfact', 'company']);
  }
  return r.value;
}

/** P2-0048: путь места «Корпус 1 · Секция 2» по id (pf_location_path; нет доступа к проекту — null). Для плашки «Ваша область». */
export async function fetchLocationPath(locationId: string): Promise<string | null> {
  const c = getClient();
  if (!c) return null;
  const r = await copyCall('company', PROJECTS_READS, 'pf_location_path', { p_location: locationId }, () => rpcRead<unknown>('pf_location_path', { p_location: locationId }));
  return r.ok && typeof r.value === 'string' ? r.value : null;
}

/** Число узлов, которое создаст генератор: корпус + N·(секция + M·(этаж + K квартир)). Та же формула, что на сервере. */
export function generatedNodeCount(sections: number, floors: number, apartmentsPerFloor: number): number {
  return 1 + sections * (1 + floors * (1 + apartmentsPerFloor));
}
export const GENERATE_LIMIT = 5000;
/** P2-0047: id новой записи создаёт приложение — повтор запроса после обрыва связи не создаёт дубль (правило 1). */
export function newId(): string {
  const cr = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cr && cr.randomUUID) return cr.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3) | 8).toString(16); });
}

/** P2-0056: ответ pf_import_places → ImportResult (пустые части — пустые списки). */
export function importResult(v: Record<string, unknown>): ImportResult {
  const c = (v.created || {}) as Record<string, unknown>;
  const n = (x: unknown): number => (typeof x === 'number' ? x : Number(x) || 0);
  const list = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
  return {
    ok: v.ok === true, dryRun: v.dry_run === true, repeat: v.repeat === true,
    created: { objects: n(c.objects), sections: n(c.sections), floors: n(c.floors), apartments: n(c.apartments) },
    existingRows: list<number>(v.existing_rows), differs: list<ImportResult['differs'][number]>(v.differs),
    errors: list<ImportResult['errors'][number]>(v.errors), roots: list<string>(v.roots)
  };
}

export function createProjectsService(): ProjectsApi | null {
  const c = getClient();
  if (!c) return null;
  async function rows<T>(fn: string, args?: Record<string, unknown>): Promise<T[]> {
    const r = await call<T[]>(fn, args || {});
    return r.ok && Array.isArray(r.value) ? r.value : [];
  }
  const call = <T = null>(fn: string, args: Record<string, unknown>): Promise<Result<T>> => copyCall('company', PROJECTS_READS, fn, args, () => send<T>(fn, args), CORE_ACCESS);
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
    listProjects: (company) => rows<ProjectItem>('pf_company_projects', { p_company: company }),
    createProject: (company, name, code) => call<string>('pf_create_project', { p_company: company, p_name: name, p_code: code || null }),
    updateProject: (id, name, code, archived) => call('pf_update_project', { p_project: id, p_name: name, p_code: code || null, p_archived: archived }),
    listLocations: (project, parent) => rows<LocationNode>('pf_list_locations', { p_project: project, p_parent: parent }),
    addLocation: (project, parent, type, name) => call<string>('pf_add_location', { p_project: project, p_parent: parent, p_type: type, p_name: name }),
    renameLocation: (id, name) => call('pf_rename_location', { p_location: id, p_name: name }),
    deleteLocation: (id, cascade) => call<number>('pf_delete_location', { p_location: id, p_cascade: cascade }),
    locationsFromQuality: async (project) => { const r = await call<boolean>('pf_locations_from_quality', { p_project: project }); return r.ok && r.value === true; },
    generateBuilding: (p) => call<string>('pf_generate_building', {
      p_project: p.projectId, p_parent: p.parentId, p_name: p.name, p_sections: p.sections, p_floors: p.floors,
      p_apartments_per_floor: p.apartmentsPerFloor, p_first_floor: p.firstFloor
    }),
    listUnits: (company) => rows<UnitItem>('pf_list_units', { p_company: company }),
    projectCatalog: (company) => rows<ProjectCard>('pf_project_catalog', { p_company: company }),
    saveProject: (company, id, card) => call<string>('pf_save_project', { p_company: company, p_id: id, p_card: card }),
    listDivisions: (company) => rows<Division>('pf_company_divisions', { p_company: company }),
    saveDivision: (company, id, name, head, archived) => call<string>('pf_save_division', { p_company: company, p_id: id, p_name: name, p_head_user: head, p_archived: archived }),
    dicts: async () => {
      const r = await call<{ stages?: DictItem[]; object_kinds?: DictItem[]; roles?: DictItem[] } | null>('pf_project_dicts', {});
      const v = r.ok && r.value ? r.value : {};
      return { stages: v.stages || [], objectKinds: v.object_kinds || [], roles: v.roles || [] };
    },
    projectPlaces: (project, parent) => rows<PlaceNode>('pf_project_places', { p_project: project, p_parent: parent }),
    savePlace: (project, id, parent, type, name, kind, buildNo, btiNo) => call<string>('pf_save_place', { p_project: project, p_id: id, p_parent: parent, p_type: type,
      p_name: name, p_object_kind: kind ?? null, p_build_no: buildNo ?? null, p_bti_no: btiNo ?? null }),
    removePlace: (id) => call<number>('pf_remove_place', { p_location: id }),
    fillObject: (p) => call<number>('pf_fill_object', { p_object: p.objectId, p_sections: p.sections, p_floors: p.floors, p_apartments_per_floor: p.apartmentsPerFloor,
      p_first_floor: p.firstFloor, p_numbering: p.numbering, p_start_no: p.startNo, p_basement: p.basement, p_roof: p.roof }),
    addFloors: (sections, from, to, apf) => call<number>('pf_add_floors', { p_sections: sections, p_from: from, p_to: to, p_apartments_per_floor: apf }),
    copyPlace: (source, id, name, target) => call<string>('pf_copy_place', target
      ? { p_source: source, p_new_id: id, p_name: name, p_target_parent: target }
      : { p_source: source, p_new_id: id, p_name: name }),
    movePlace: async (id, parent, before) => {
      const r = await call<{ changed?: boolean; old_parent?: string | null; old_before?: string | null } | null>('pf_move_place',
        { p_location: id, p_new_parent: parent, p_before: before });
      if (!r.ok) return r;
      const v = r.value || {};
      return { ok: true, value: { changed: v.changed === true, oldParentId: v.old_parent ?? null, oldBeforeId: v.old_before ?? null } };
    },
    restorePlace: (id) => call<number>('pf_restore_place', { p_location: id }),
    nextBuildNo: (id) => call<number>('pf_next_build_no', { p_location: id }),
    importPlaces: async (project, batch, list, dryRun) => {
      const r = await call<Record<string, unknown> | null>('pf_import_places', { p_project: project, p_batch: batch, p_rows: list, p_dry_run: dryRun });
      if (!r.ok) return r;
      return { ok: true, value: importResult(r.value || {}) };
    },
    importUndo: (batch) => call<number>('pf_import_undo', { p_batch: batch }),
    savePlaceInfo: (id, area, rooms) => call<string>('pf_save_place_info', { p_location: id, p_area: area, p_rooms: rooms }),
    addUnit: (company, code, name) => call<string>('pf_add_unit', { p_company: company, p_code: code, p_name: name }),
    deleteUnit: (id) => call('pf_delete_unit', { p_unit: id })
  };
}
