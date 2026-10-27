export type NodeType = 'object' | 'building' | 'section' | 'floor' | 'apartment';

export interface LocationNode {
  id: string;
  companyId: string;
  nodeType: NodeType;
  parentId: string | null;
  displayName: string;
  canonical_key?: string;
  sort_order: number;
  synonyms?: unknown;
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

export interface FloorPlan {
  id: string;
  companyId: string;
  locationId: string;
  name?: string;
  sort_order: number;
  pdf_url: string;
  pdf_name: string;
  pdf_size: string;
  is_active: boolean;
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

export const NODE_TYPES: NodeType[] = ['object', 'building', 'section', 'floor', 'apartment'];

export const CHILD_OF: Record<NodeType, NodeType | null> = {
  object: null,
  building: 'object',
  section: 'building',
  floor: 'section',
  apartment: 'floor'
};

/**
 * Уровни дерева проекта Platform 2.0 (core.locations, P2-0005; P2-0047 — верх «объект») + 'other'.
 * Добавлено рядом, поведение Quality (NodeType, CHILD_OF) не менялось. Подсказка уровня мягкая: уровни можно пропускать.
 */
export type PlanNodeType = NodeType | 'other';
export const PLAN_NODE_TYPES: PlanNodeType[] = ['building', 'section', 'floor', 'apartment', 'other'];
export const PLAN_NODE_LABELS: Record<PlanNodeType, string> = {
  building: 'Корпус', section: 'Секция', floor: 'Этаж', apartment: 'Квартира', other: 'Другое', object: 'Объект'
};
/**
 * P2-0047: верх дерева проекта — «объект» (корпус, паркинг, сети…; вид — в карточке места). Старые корни «корпус» сервер
 * переводит в объект; для План/Факта объект верхнего уровня — то же, что раньше корпус.
 */
export const isTopPlace = (t: string): boolean => t === 'object' || t === 'building';
export const SUGGESTED_CHILD: Record<PlanNodeType | 'root', PlanNodeType> = {
  root: 'object', object: 'section', building: 'section', section: 'floor', floor: 'apartment', apartment: 'other', other: 'other'
};
