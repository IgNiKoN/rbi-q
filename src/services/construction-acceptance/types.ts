/** Зона на плане — проценты 0…100 (как legacy ConstAcceptance). */
export type AcceptanceZoneV2 = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Оси / захватка — внутри zone jsonb (отдельной колонки в sql/002 нет). */
  room?: string | null;
};

/** Статусы заявки на приёмку v2. */
export type AcceptanceStatusV2 = 'pending' | 'rejected' | 'accepted';

/** Статус пункта чек-листа приёмки (C+D; P — паритет аудита). */
export type ChecklistItemStatusV2 = 'ok' | 'fail' | 'na' | 'fail_escalated';

export type ChecklistResultItemV2 = {
  id: string;
  group?: string | null;
  name: string;
  status: ChecklistItemStatusV2;
  /** Комментарий к FAIL (как AuditState.details[id].comment). */
  comment?: string;
  /** Мультифото пункта: local:// | https (как AuditState.photos[id]). */
  photos?: string[];
  updated_at?: string;
};

/** jsonb checklist_results на construction_acceptance_v2 (sql/010). */
export type ChecklistResultsV2 = {
  template_key: string;
  updated_at: string;
  items: ChecklistResultItemV2[];
};

/**
 * ConstructionAcceptanceV2 — поля ≈ таблица construction_acceptance_v2 (sql/002 + 010).
 * locationId = id узла floor | apartment из service.locations
 * (этаж/зона — zone на плане; квартира — zone full-rect {0,0,100,100}).
 */
export interface ConstructionAcceptanceV2 {
  id: string;
  companyId: string;
  locationId: string;
  zone: AcceptanceZoneV2 | null;
  template_key?: string | null;
  work_type?: string | null;
  volume?: string | null;
  requested_date?: string | null;
  requested_time?: string | null;
  contractorId?: string | null;
  /** Результаты прохода чек-листа (этаж/зона или квартира); null если ещё не начат. */
  checklist_results?: ChecklistResultsV2 | null;
  status: AcceptanceStatusV2 | string;
  created_by?: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
  version?: number;
  syncStatus?: string;
  source?: string;
  _deleted?: boolean;
}

export const ACCEPTANCE_STATUSES_V2: AcceptanceStatusV2[] = ['pending', 'rejected', 'accepted'];
