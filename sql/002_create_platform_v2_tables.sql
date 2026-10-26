-- Файл: sql/002_create_platform_v2_tables.sql
-- §38 Блок 2 — создание новых пустых Supabase-таблиц целевой схемы.
-- Источник схемы: _ai/DATA_MIGRATION_MAP.md (Блок 1, выполнен 2026-07-07,
-- имена таблиц LocationNode/Contractor уточнены 2026-07-12).
-- Выполняется ВРУЧНУЮ в Supabase SQL Editor — не через приложение,
-- не через anon-ключ REST API (DDL недоступен anon-ключу).
-- Дата: 2026-07-12.
--
-- Принципы:
-- 1. Единый стандарт технических полей §18.1: id, "companyId", created_at,
--    updated_at, deleted_at, is_deleted, created_by, version.
-- 2. Старые таблицы не трогаются: ни схема, ни данные.
-- 3. RLS: эквивалент уже действующего на старых таблицах уровня доступа,
--    подтверждённого эмпирически anon-ключом перед этим блоком —
--    SELECT разрешён роли anon, запись (INSERT/UPDATE/DELETE) — только
--    роли authenticated (anon-ключ без входа получает 42501 на INSERT
--    на старых таблицах rbi_inspections/sk_records, SELECT — 200 []).
-- 4. Идемпотентность: CREATE TABLE IF NOT EXISTS — безопасно перезапускать.

-- =========================================================================
-- 1. issues (было rbi_inspections)
-- =========================================================================
CREATE TABLE IF NOT EXISTS issues (
    id                text PRIMARY KEY,
    "companyId"       text NOT NULL DEFAULT 'rbi',
    "locationId"      text,
    "contractorId"    text,
    created_by        text,
    template_key      text,
    template_title    text,
    inspection_date   timestamptz,
    metrics           jsonb,
    is_completed      boolean DEFAULT false,
    inspection_type   text,
    is_deleted        boolean NOT NULL DEFAULT false,
    deleted_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           integer NOT NULL DEFAULT 1
);

-- =========================================================================
-- 2. issue_items (было rbi_inspection_items)
-- =========================================================================
CREATE TABLE IF NOT EXISTS issue_items (
    id                text PRIMARY KEY,
    "companyId"       text NOT NULL DEFAULT 'rbi',
    "issueId"         text,
    item_id           text,
    item_name         text,
    item_weight       numeric,
    status            text,
    comment           text,
    cause_code        text,
    fact_value        text,
    tolerance_value   text,
    details           jsonb,
    created_by        text,
    is_deleted        boolean NOT NULL DEFAULT false,
    deleted_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           integer NOT NULL DEFAULT 1
);

-- =========================================================================
-- 3. sk_records_v2 (было sk_records)
-- =========================================================================
CREATE TABLE IF NOT EXISTS sk_records_v2 (
    id                        text PRIMARY KEY,
    "companyId"               text NOT NULL DEFAULT 'rbi',
    "locationId"              text,
    sk_number                 text,
    sk_unique_key             text,
    row_number                text,
    text                      text,
    category                  text,
    date_issued               date,
    "contractorId"            text,
    contractor_representative text,
    deadline                  date,
    status                    text,
    is_verified_closed        boolean DEFAULT false,
    date_resolved             date,
    issued_by                 text,
    closed_by                 text,
    uploaded_by               text,
    first_uploaded_by         text,
    import_batch_id           text,
    import_count              integer,
    first_imported_at         timestamptz,
    created_by                text,
    is_deleted                boolean NOT NULL DEFAULT false,
    deleted_at                timestamptz,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    version                   integer NOT NULL DEFAULT 1
);

-- =========================================================================
-- 4. construction_objects_v2 (было construction_objects)
-- =========================================================================
CREATE TABLE IF NOT EXISTS construction_objects_v2 (
    id                text PRIMARY KEY,
    "companyId"       text NOT NULL DEFAULT 'rbi',
    name              text,
    "locationId"      text,
    created_by        text,
    is_deleted        boolean NOT NULL DEFAULT false,
    deleted_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           integer NOT NULL DEFAULT 1
);

-- =========================================================================
-- 5. construction_buildings_v2 (было construction_buildings)
-- =========================================================================
CREATE TABLE IF NOT EXISTS construction_buildings_v2 (
    id                text PRIMARY KEY,
    "companyId"       text NOT NULL DEFAULT 'rbi',
    "locationId"      text,
    name              text,
    sort_order        integer,
    created_by        text,
    is_deleted        boolean NOT NULL DEFAULT false,
    deleted_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           integer NOT NULL DEFAULT 1
);

-- =========================================================================
-- 6. construction_floors_v2 (было construction_floors)
-- =========================================================================
CREATE TABLE IF NOT EXISTS construction_floors_v2 (
    id                text PRIMARY KEY,
    "companyId"       text NOT NULL DEFAULT 'rbi',
    "locationId"      text,
    name              text,
    sort_order        integer,
    pdf_url           text,
    pdf_name          text,
    pdf_size          text,
    is_active         boolean DEFAULT true,
    created_by        text,
    is_deleted        boolean NOT NULL DEFAULT false,
    deleted_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           integer NOT NULL DEFAULT 1
);

-- =========================================================================
-- 7. construction_units_v2 (было construction_units)
-- =========================================================================
CREATE TABLE IF NOT EXISTS construction_units_v2 (
    id                text PRIMARY KEY,
    "companyId"       text NOT NULL DEFAULT 'rbi',
    "locationId"      text,
    name              text,
    type              text,
    sort_order        integer,
    status            text,
    created_by        text,
    is_deleted        boolean NOT NULL DEFAULT false,
    deleted_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           integer NOT NULL DEFAULT 1
);

-- =========================================================================
-- 8. construction_defects_v2 (было construction_defects)
-- =========================================================================
CREATE TABLE IF NOT EXISTS construction_defects_v2 (
    id                text PRIMARY KEY,
    "companyId"       text NOT NULL DEFAULT 'rbi',
    "locationId"      text,
    x                 numeric,
    y                 numeric,
    template_key      text,
    item_id           text,
    item_name         text,
    norm_text         text,
    text              text,
    category          text,
    deadline          timestamptz,
    "contractorId"    text,
    description       text,
    photo             text,
    status            text,
    history           jsonb,
    created_by        text,
    is_deleted        boolean NOT NULL DEFAULT false,
    deleted_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           integer NOT NULL DEFAULT 1
);

-- =========================================================================
-- 9. construction_acceptance_v2 (было construction_acceptance)
-- =========================================================================
CREATE TABLE IF NOT EXISTS construction_acceptance_v2 (
    id                text PRIMARY KEY,
    "companyId"       text NOT NULL DEFAULT 'rbi',
    "locationId"      text,
    zone              jsonb,
    template_key      text,
    work_type         text,
    volume            text,
    requested_date    date,
    requested_time    text,
    "contractorId"    text,
    status            text,
    created_by        text,
    is_deleted        boolean NOT NULL DEFAULT false,
    deleted_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           integer NOT NULL DEFAULT 1
);

-- =========================================================================
-- 10. location_nodes (было project_objects) — сущность LocationNode
-- =========================================================================
CREATE TABLE IF NOT EXISTS location_nodes (
    id                text PRIMARY KEY,
    "companyId"       text NOT NULL DEFAULT 'rbi',
    canonical_key     text,
    "displayName"     text,
    synonyms          jsonb,
    "parentId"        text,
    created_by        text,
    is_deleted        boolean NOT NULL DEFAULT false,
    deleted_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           integer NOT NULL DEFAULT 1
);

-- =========================================================================
-- 11. location_node_aliases (было object_aliases)
-- =========================================================================
CREATE TABLE IF NOT EXISTS location_node_aliases (
    id                text PRIMARY KEY,
    "companyId"       text NOT NULL DEFAULT 'rbi',
    raw_name          text,
    "locationId"      text,
    created_by        text,
    is_deleted        boolean NOT NULL DEFAULT false,
    deleted_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           integer NOT NULL DEFAULT 1
);

-- =========================================================================
-- 12. contractors (было contractor_directory) — сущность Contractor
-- =========================================================================
CREATE TABLE IF NOT EXISTS contractors (
    id                text PRIMARY KEY,
    "companyId"       text NOT NULL DEFAULT 'rbi',
    "locationId"      text,
    canonical_key     text,
    "displayName"     text,
    synonyms          jsonb,
    inn               text,
    created_by        text,
    is_deleted        boolean NOT NULL DEFAULT false,
    deleted_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           integer NOT NULL DEFAULT 1
);

-- =========================================================================
-- 13. contractor_aliases_v2 (было contractor_aliases)
-- =========================================================================
CREATE TABLE IF NOT EXISTS contractor_aliases_v2 (
    id                text PRIMARY KEY,
    "companyId"       text NOT NULL DEFAULT 'rbi',
    raw_name          text,
    "contractorId"    text,
    created_by        text,
    is_deleted        boolean NOT NULL DEFAULT false,
    deleted_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           integer NOT NULL DEFAULT 1
);

-- =========================================================================
-- RLS + доступ, эквивалентный старым таблицам (anon: SELECT только,
-- authenticated: полный CRUD) — эмпирически подтверждено перед блоком
-- на rbi_inspections/sk_records (INSERT anon-ключом без сессии → 42501,
-- SELECT anon-ключом → 200 []).
-- =========================================================================
DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'issues', 'issue_items', 'sk_records_v2',
        'construction_objects_v2', 'construction_buildings_v2',
        'construction_floors_v2', 'construction_units_v2',
        'construction_defects_v2', 'construction_acceptance_v2',
        'location_nodes', 'location_node_aliases',
        'contractors', 'contractor_aliases_v2'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);

        EXECUTE format(
            'DROP POLICY IF EXISTS "%s_select_anon" ON %I;',
            tbl, tbl
        );
        EXECUTE format(
            'CREATE POLICY "%s_select_anon" ON %I FOR SELECT USING (true);',
            tbl, tbl
        );

        EXECUTE format(
            'DROP POLICY IF EXISTS "%s_write_authenticated" ON %I;',
            tbl, tbl
        );
        EXECUTE format(
            'CREATE POLICY "%s_write_authenticated" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
            tbl, tbl
        );

        EXECUTE format('GRANT SELECT ON %I TO anon;', tbl);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', tbl);
    END LOOP;
END $$;

-- =========================================================================
-- ROLLBACK (не выполняется автоматически — вручную при необходимости)
-- =========================================================================
-- DROP TABLE IF EXISTS issues;
-- DROP TABLE IF EXISTS issue_items;
-- DROP TABLE IF EXISTS sk_records_v2;
-- DROP TABLE IF EXISTS construction_objects_v2;
-- DROP TABLE IF EXISTS construction_buildings_v2;
-- DROP TABLE IF EXISTS construction_floors_v2;
-- DROP TABLE IF EXISTS construction_units_v2;
-- DROP TABLE IF EXISTS construction_defects_v2;
-- DROP TABLE IF EXISTS construction_acceptance_v2;
-- DROP TABLE IF EXISTS location_nodes;
-- DROP TABLE IF EXISTS location_node_aliases;
-- DROP TABLE IF EXISTS contractors;
-- DROP TABLE IF EXISTS contractor_aliases_v2;
