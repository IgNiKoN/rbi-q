-- =========================================================================
-- 006: иерархия LocationNode (nodeType, sort_order) для справочника локаций
-- Предпосылка: sql/002_create_platform_v2_tables.sql уже применён
--   (location_nodes, location_node_aliases, construction_floors_v2).
-- Идемпотентно: ADD COLUMN IF NOT EXISTS.
-- =========================================================================

-- Уровень узла: object | building | section | floor
ALTER TABLE location_nodes
    ADD COLUMN IF NOT EXISTS "nodeType" text;

ALTER TABLE location_nodes
    ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Индекс для обхода дерева
CREATE INDEX IF NOT EXISTS location_nodes_parent_idx
    ON location_nodes ("parentId")
    WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS location_nodes_type_idx
    ON location_nodes ("nodeType")
    WHERE is_deleted = false;

-- План этажа уже в construction_floors_v2.locationId → location_nodes.id
CREATE INDEX IF NOT EXISTS construction_floors_v2_location_idx
    ON construction_floors_v2 ("locationId")
    WHERE is_deleted = false;

-- Опциональная проверка допустимых типов (мягкая: не CHECK на всю историю)
COMMENT ON COLUMN location_nodes."nodeType" IS
    'object | building | section | floor — иерархия справочника локаций RBI Platform';
