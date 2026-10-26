-- Файл: sql/005_add_contractor_id_to_legacy_tables.sql
-- Единый справочник подрядчиков — Блок Б (`_ai/current_plan.md`):
-- dual-write `contractorId` (UUID карточки) рядом со строковыми полями
-- подрядчика на ЖИВЫХ legacy-таблицах.
-- Выполняется ВРУЧНУЮ в Supabase SQL Editor — не через приложение,
-- не через anon-ключ REST API (DDL недоступен anon-ключу).
-- Дата: 2026-07-22.
--
-- Принципы:
-- 1. Только ADD COLUMN — старые поля (contractor_name / contractor /
--    contractor_canonical_key и т.п.) не трогаем: старые клиенты продолжают
--    работать как раньше.
-- 2. Колонка nullable text, без NOT NULL и без FK: записи с pending-
--    нормализацией и вся история без UUID остаются валидными.
-- 3. Значение = тот же UUID, что contractor_directory.id / contractors.id
--    (когда карточка matched). Пусто/NULL — норма для старых строк.
-- 4. НЕ переключает запись на issues / sk_records_v2 /
--    construction_defects_v2 (§38 Блок 4 по-прежнему отложен).
-- 5. Идемпотентность: ADD COLUMN IF NOT EXISTS — безопасно перезапускать.
--
-- Порядок: выполнить этот SQL до cloud-смоука кода Блока Б.
-- Push со сверхкомплектным полем упадёт, если колонки ещё нет
-- (см. комментарий в prepareSkRecordForCloud).

-- =========================================================================
-- 1. Качество — осмотры
-- =========================================================================
ALTER TABLE rbi_inspections
    ADD COLUMN IF NOT EXISTS "contractorId" text;

-- =========================================================================
-- 2. ПК СК — импортированные записи
-- =========================================================================
ALTER TABLE sk_records
    ADD COLUMN IF NOT EXISTS "contractorId" text;

-- =========================================================================
-- 3. Стройконтроль — дефекты и заявки на приёмку
-- =========================================================================
ALTER TABLE construction_defects
    ADD COLUMN IF NOT EXISTS "contractorId" text;

ALTER TABLE construction_acceptance
    ADD COLUMN IF NOT EXISTS "contractorId" text;

-- =========================================================================
-- ROLLBACK (раскомментировать и выполнить для отката колонок):
-- =========================================================================
-- ALTER TABLE rbi_inspections DROP COLUMN IF EXISTS "contractorId";
-- ALTER TABLE sk_records DROP COLUMN IF EXISTS "contractorId";
-- ALTER TABLE construction_defects DROP COLUMN IF EXISTS "contractorId";
-- ALTER TABLE construction_acceptance DROP COLUMN IF EXISTS "contractorId";
