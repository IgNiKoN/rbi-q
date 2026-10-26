-- Файл: sql/012_company_settings_role_matrix.sql
-- §23 Блок 2 — общая company SoT для оверрайдов матрицы ролей.
-- Выполняется ВРУЧНУЮ в Supabase SQL Editor (Dashboard) — не через anon REST.
-- Дата: 2026-08-09.
--
-- Принципы:
-- 1. Одна строка на компанию (PK company_id, default 'rbi').
-- 2. role_matrix_overrides — sparse jsonb partials поверх DEFAULT ROLE_MATRIX
--    в коде (пустой '{}' = права как в DEFAULT, без дрифта).
-- 3. RLS как у platform v2 (anon SELECT; authenticated CRUD). Жёсткий
--    admin-only RLS — отдельно (§23 Блок 3+); клиент уже режет push по
--    isAdmin/canManageRoles.
--    ЗАМЕНЕНО: политика "rbi_company_settings_write_authenticated" ниже
--    заменена в sql/014_privilege_rls_hardening.sql на admin-only write
--    (Security hardening roadmap, Блок 1, 2026-08-13) — открытая запись
--    была privilege escalation (любой authenticated мог переписать
--    role_matrix_overrides). Секция ниже оставлена как есть для истории.
-- 4. Идемпотентно: CREATE TABLE IF NOT EXISTS + DROP/CREATE POLICY.

CREATE TABLE IF NOT EXISTS rbi_company_settings (
    company_id              text PRIMARY KEY DEFAULT 'rbi',
    role_matrix_overrides   jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at              timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
    tbl text := 'rbi_company_settings';
BEGIN
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);

    EXECUTE format('DROP POLICY IF EXISTS "%s_select_anon" ON %I;', tbl, tbl);
    EXECUTE format(
        'CREATE POLICY "%s_select_anon" ON %I FOR SELECT USING (true);',
        tbl, tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS "%s_write_authenticated" ON %I;', tbl, tbl);
    EXECUTE format(
        'CREATE POLICY "%s_write_authenticated" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
        tbl, tbl
    );

    EXECUTE format('GRANT SELECT ON %I TO anon;', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', tbl);
END $$;

-- =========================================================================
-- ROLLBACK (вручную при необходимости)
-- =========================================================================
-- DROP TABLE IF EXISTS rbi_company_settings;
