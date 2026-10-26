-- Файл: sql/014_privilege_rls_hardening.sql
-- Security hardening roadmap, Блок 1 — закрыть privilege escalation
-- через rbi_company_settings.role_matrix_overrides.
-- Выполняется ВРУЧНУЮ в Supabase SQL Editor — не через приложение,
-- не через anon-ключ REST API (DDL недоступен anon-ключу).
-- Дата: 2026-08-13.
--
-- Разведка (см. _ai/supabase/LIVE_INVENTORY.md + прямые запросы в чате,
-- 2026-08-13):
-- 1. rbi_engineer_profiles — уже защищена триггером rbi_guard_profile_update():
--    обычный пользователь (auth_user_id = auth.uid()) НЕ может изменить свои
--    role/cloud_status/assigned_projects/assigned_contractor — они откатываются
--    на OLD.*. Менять их может только rbi_can_manage_profiles(project_code)
--    (админ своего проекта) или сервисная роль. Доработка не требуется.
-- 2. rbi_company_settings — подтверждённая дырка: политика
--    "rbi_company_settings_write_authenticated" (sql/012) даёт ЛЮБОМУ
--    authenticated пользователю право переписать role_matrix_overrides
--    (= выдать себе/кому угодно isAdmin/canManageRoles на уровне всей
--    компании) и official_templates (sql/013). Эта миграция сужает write
--    до ролей, дающих isAdmin:true в ROLE_MATRIX (permission.service.js) —
--    'manager', 'deputy_manager' — по образцу уже существующей на проде
--    политики "rbi_super_admin_access" (rbi_current_role() = ANY(...)).
--
-- Принципы (как в остальных sql/0xx):
-- 1. Идемпотентно: DROP POLICY IF EXISTS + CREATE POLICY.
-- 2. SELECT (anon: чтение матрицы для UI) не трогаем — не является уязвимостью.
-- 3. Не создаём новых SQL-функций — используем rbi_current_role(), уже
--    существующую и проверенную в rbi_super_admin_access на других таблицах.

DO $$
DECLARE
    tbl text := 'rbi_company_settings';
BEGIN
    -- Убираем открытую политику записи "всем authenticated".
    EXECUTE format('DROP POLICY IF EXISTS "%s_write_authenticated" ON %I;', tbl, tbl);

    -- Новая политика: писать (INSERT/UPDATE/DELETE) может только роль
    -- с isAdmin:true в клиентской ROLE_MATRIX (manager/deputy_manager).
    EXECUTE format(
        'CREATE POLICY "%s_write_admin_only" ON %I '
        || 'FOR ALL TO authenticated '
        || 'USING (rbi_current_role() = ANY (ARRAY[''manager'', ''deputy_manager''])) '
        || 'WITH CHECK (rbi_current_role() = ANY (ARRAY[''manager'', ''deputy_manager'']));',
        tbl, tbl
    );
END $$;

-- =========================================================================
-- ROLLBACK (не выполняется автоматически — вручную при необходимости)
-- =========================================================================
-- DROP POLICY IF EXISTS "rbi_company_settings_write_admin_only" ON rbi_company_settings;
-- CREATE POLICY "rbi_company_settings_write_authenticated" ON rbi_company_settings
--     FOR ALL TO authenticated USING (true) WITH CHECK (true);
