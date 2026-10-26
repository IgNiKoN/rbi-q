/** Defect category — v1 parity (B1/B2/B3). Aliases critical/major/minor нормализуются при чтении. */
export type DefectCategoryV2 = 'B1' | 'B2' | 'B3';

/** Defect lifecycle — как ConstDefectForm (issued → … → closed/rejected). */
export type DefectStatusV2 = 'issued' | 'in_progress' | 'fixed' | 'closed' | 'rejected';

export type DefectHistoryEntryV2 = {
  status: DefectStatusV2 | string;
  date: string;
  user: string;
  comment?: string | null;
  /** Одно фото устранения (legacy / совместимость). */
  photo?: string | null;
  /** Несколько фото устранения (v2). */
  photos?: string[] | null;
};

/**
 * ConstructionDefectV2 — поля ≈ таблица construction_defects_v2 (sql/002).
 * Координаты x/y — проценты 0…100 относительно страницы плана.
 * `locationId` — id узла `floor` (этажный осмотр) **или** `apartment` (квартирный план).
 * Локально: `photos: string[]`. В облаке колонка `photo` (text) = JSON-массив URL или один URL.
 */
export interface ConstructionDefectV2 {
  id: string;
  companyId: string;
  /** Узел floor (этажный план) или apartment (план квартиры). */
  locationId: string;
  x: number;
  y: number;
  template_key?: string | null;
  item_id?: string | null;
  item_name?: string | null;
  norm_text?: string | null;
  text?: string | null;
  category: DefectCategoryV2 | string;
  deadline?: string | null;
  contractorId?: string | null;
  description: string;
  /** Локальный канон: массив local:// / https URL. */
  photos?: string[];
  /** Legacy / cloud mirror колонки photo. */
  photo?: string | null;
  status: DefectStatusV2 | string;
  history?: DefectHistoryEntryV2[] | unknown;
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

export const DEFECT_CATEGORIES_V2: DefectCategoryV2[] = ['B1', 'B2', 'B3'];

export const DEFECT_STATUSES_V2: DefectStatusV2[] = [
  'issued',
  'in_progress',
  'fixed',
  'closed',
  'rejected'
];
