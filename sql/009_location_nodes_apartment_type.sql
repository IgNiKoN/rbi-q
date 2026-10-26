-- =========================================================================
-- 009: nodeType = apartment в location_nodes (документация)
-- =========================================================================
-- Зачем: блок A LOCATION_DIRECTORY — квартиры как узлы иерархии
--   object → building → section → floor → apartment.
-- Колонка nodeType уже есть (sql/006). Новый обязательный CHECK НЕ добавляем:
--   исторические/нестандартные значения не должны ломаться.
-- Применить вручную в Supabase SQL Editor (безопасно, только COMMENT).
-- =========================================================================

COMMENT ON COLUMN location_nodes."nodeType" IS
  'Тип узла иерархии: object | building | section | floor | apartment. '
  'apartment.parentId = floor.id. Операционная проекция квартиры — construction_units_v2.locationId → apartment.id.';
