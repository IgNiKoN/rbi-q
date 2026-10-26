-- Файл: sql/013_company_official_templates.sql
-- Редактор системных чек-листов Блок 1 — «указатель официальной версии».
-- Выполняется ВРУЧНУЮ в Supabase SQL Editor (Dashboard) — не через anon REST.
-- Дата: 2026-08-12.
--
-- Принципы:
-- 1. Одна новая колонка в уже существующей rbi_company_settings (sql/012) —
--    без новой таблицы.
-- 2. official_templates — sparse jsonb map { systemKey: { type: 'user',
--    ref, version, updatedAt, updatedBy } }. Пустой '{}' = все виды работ
--    работают по поставке (SYSTEM_TEMPLATES), без изменений.
-- 3. Обратная совместимость: старые клиенты продолжают слать
--    { company_id, role_matrix_overrides, updated_at } без этой колонки —
--    Supabase upsert обновляет только переданные колонки, official_templates
--    у существующей строки не затирается.
-- 4. Идемпотентно: ADD COLUMN IF NOT EXISTS.

ALTER TABLE rbi_company_settings
    ADD COLUMN IF NOT EXISTS official_templates jsonb NOT NULL DEFAULT '{}'::jsonb;

-- RLS/policies таблицы уже настроены в sql/012 (anon SELECT; authenticated
-- CRUD) — новая колонка не требует отдельных policy.

-- =========================================================================
-- ROLLBACK (вручную при необходимости)
-- =========================================================================
-- ALTER TABLE rbi_company_settings DROP COLUMN IF EXISTS official_templates;
