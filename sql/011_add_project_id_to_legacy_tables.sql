-- Файл: sql/011_add_project_id_to_legacy_tables.sql
-- Привязка объектов по UUID (locations.object.id) — зеркало sql/005 contractorId.
-- Dual-write `projectId` рядом со строковыми project_canonical_key / projectName.
-- Выполняется ВРУЧНУЮ в Supabase SQL Editor — не через приложение,
-- не через anon-ключ REST API (DDL недоступен anon-ключу).
-- Дата: 2026-07-30.
--
-- Принципы:
-- 1. Только ADD COLUMN — старые поля (project_canonical_key / projectName /
--    project_display_name) не трогаем: старые клиенты продолжают работать.
-- 2. Колонка nullable text, без NOT NULL и без FK: записи без UUID остаются валидными.
-- 3. Значение = UUID узла locations.object (ObjectDirectory.objects[].id).
-- 4. Идемпотентность: ADD COLUMN IF NOT EXISTS.

-- =========================================================================
-- 1. Качество — осмотры
-- =========================================================================
ALTER TABLE rbi_inspections
    ADD COLUMN IF NOT EXISTS "projectId" text;

-- =========================================================================
-- 2. ПК СК — импортированные записи
-- =========================================================================
ALTER TABLE sk_records
    ADD COLUMN IF NOT EXISTS "projectId" text;

-- =========================================================================
-- 3. Стройконтроль — дефекты и заявки на приёмку
-- =========================================================================
ALTER TABLE construction_defects
    ADD COLUMN IF NOT EXISTS "projectId" text;

ALTER TABLE construction_acceptance
    ADD COLUMN IF NOT EXISTS "projectId" text;

-- =========================================================================
-- ROLLBACK (раскомментировать и выполнить для отката колонок):
-- =========================================================================
-- ALTER TABLE rbi_inspections DROP COLUMN IF EXISTS "projectId";
-- ALTER TABLE sk_records DROP COLUMN IF EXISTS "projectId";
-- ALTER TABLE construction_defects DROP COLUMN IF EXISTS "projectId";
-- ALTER TABLE construction_acceptance DROP COLUMN IF EXISTS "projectId";
