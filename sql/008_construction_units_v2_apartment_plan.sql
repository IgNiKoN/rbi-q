-- =========================================================================
-- 008: PDF плана квартиры на construction_units_v2
-- =========================================================================
-- Зачем: фаза 5 LOCATION_DIRECTORY — один активный PDF-план на помещение
--   (квартиру), поля паритетны construction_floors_v2.
-- Применить вручную в Supabase SQL Editor до cloud-smoke upload PDF.
-- Безопасно на уже существующей таблице (IF NOT EXISTS).
-- =========================================================================

ALTER TABLE construction_units_v2
  ADD COLUMN IF NOT EXISTS pdf_url  text,
  ADD COLUMN IF NOT EXISTS pdf_name text,
  ADD COLUMN IF NOT EXISTS pdf_size text;

COMMENT ON COLUMN construction_units_v2.pdf_url IS
  'Public https URL плана квартиры в bucket custom-assets (unit_plans/...)';
COMMENT ON COLUMN construction_units_v2.pdf_name IS
  'Оригинальное имя PDF для UI';
COMMENT ON COLUMN construction_units_v2.pdf_size IS
  'Размер файла (строка, байты) — паритет floors_v2';
