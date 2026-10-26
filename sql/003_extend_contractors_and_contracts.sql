-- Файл: sql/003_extend_contractors_and_contracts.sql
-- §38 (дополнение к Блоку 2) — расширение таблицы contractors + новая
-- таблица contracts.
-- Источник схемы: _ai/DATA_MIGRATION_MAP.md (секция Contractor, дополнена
-- 2026-07-12), согласовано с пользователем (расширенная карточка подрядчика).
-- Выполняется ВРУЧНУЮ в Supabase SQL Editor — не через приложение,
-- не через anon-ключ REST API (DDL недоступен anon-ключу).
-- Дата: 2026-07-12.
--
-- Принципы:
-- 1. contractors уже существует (sql/002_create_platform_v2_tables.sql),
--    пустая, RLS уже настроен (anon: SELECT, authenticated: полный CRUD) —
--    этот файл не трогает RLS contractors, только добавляет колонки.
-- 2. Новые колонки contractors — все text, nullable (не NOT NULL): таблица
--    предположительно ещё пуста, но ADD COLUMN IF NOT EXISTS защищает от
--    повторного запуска и от случая, если запись уже началась.
-- 3. contracts — новая таблица, единый стандарт технических полей §18.1,
--    обязательная ссылка contractorId → contractors.id.
-- 4. RLS/grants для contracts — эквивалент contractors (anon: SELECT,
--    authenticated: полный CRUD), тот же паттерн DO $$ ... FOREACH ... $$,
--    что в 002_....sql.
-- 5. Идемпотентность: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS —
--    безопасно перезапускать.

-- =========================================================================
-- 1. contractors — расширение 6 новыми колонками
-- =========================================================================
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS legal_name     text;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS legal_form     text;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS legal_address  text;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS contact_phone  text;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS contact_email  text;

-- =========================================================================
-- 2. contracts — новая таблица (1 подрядчик → N договоров)
-- =========================================================================
CREATE TABLE IF NOT EXISTS contracts (
    id                text PRIMARY KEY,
    "companyId"       text NOT NULL DEFAULT 'rbi',
    "contractorId"    text NOT NULL REFERENCES contractors(id),
    contract_number   text,
    contract_date     date,
    work_type         text,
    status            text,
    created_by        text,
    is_deleted        boolean NOT NULL DEFAULT false,
    deleted_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           integer NOT NULL DEFAULT 1
);

-- =========================================================================
-- RLS + доступ для contracts, эквивалентный contractors (anon: SELECT
-- только, authenticated: полный CRUD) — тот же паттерн, что в
-- 002_create_platform_v2_tables.sql.
-- =========================================================================
DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['contracts']
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
-- ALTER TABLE contractors DROP COLUMN IF EXISTS legal_name;
-- ALTER TABLE contractors DROP COLUMN IF EXISTS legal_form;
-- ALTER TABLE contractors DROP COLUMN IF EXISTS legal_address;
-- ALTER TABLE contractors DROP COLUMN IF EXISTS contact_person;
-- ALTER TABLE contractors DROP COLUMN IF EXISTS contact_phone;
-- ALTER TABLE contractors DROP COLUMN IF EXISTS contact_email;
-- DROP TABLE IF EXISTS contracts;
