/**
 * Статусы помещения v2 — жизненный цикл передачи.
 * Alias старого MVP (none/ready/defects/accepted) → canonical при чтении.
 */
export type UnitStatusV2 =
  | 'not_inspected'
  | 'finishing'
  | 'has_defects'
  | 'ready_for_transfer'
  | 'transferred'
  | 'shareholder_defects';

/** Старый MVP → canonical. */
export const UNIT_STATUS_ALIASES: Record<string, UnitStatusV2> = {
  none: 'not_inspected',
  ready: 'finishing',
  defects: 'has_defects',
  accepted: 'transferred'
};

export const UNIT_STATUSES_V2: UnitStatusV2[] = [
  'not_inspected',
  'finishing',
  'has_defects',
  'ready_for_transfer',
  'transferred',
  'shareholder_defects'
];

export const UNIT_STATUS_LABELS_RU: Record<UnitStatusV2, string> = {
  not_inspected: 'Не осматривалась',
  finishing: 'В отделке',
  has_defects: 'Есть замечания',
  ready_for_transfer: 'Готова к передаче',
  transferred: 'Передана',
  shareholder_defects: 'Замечания дольщика'
};

/**
 * ConstructionUnitV2 — поля ≈ таблица construction_units_v2 (sql/002 + sql/008).
 * Canonical: locationId = id узла apartment из service.locations (parent = floor).
 * Legacy read: locationId может ещё указывать на floor — listForFloor/listForBuilding это учитывают.
 */
export interface ConstructionUnitV2 {
  id: string;
  companyId: string;
  locationId: string;
  name: string;
  type?: string | null;
  sort_order?: number;
  status: UnitStatusV2 | string;
  pdf_url?: string | null;
  pdf_name?: string | null;
  pdf_size?: string | null;
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
