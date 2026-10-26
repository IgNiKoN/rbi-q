-- =========================================================================
-- 007: Storage RLS — bucket `construction-defects` writable for app client
-- =========================================================================
-- Зачем: upload фото дефектов (legacy `const_defect` + construction-v2
--   `const_defect_v2`) через `rbiUploadAsset` / `uploadObjectFilesToCloud`
--   падает с `StorageApiError: new row violates row-level security policy`
--   для клиентской роли `anon` (приложение ходит с anon-ключом, без
--   auth-сессии). Тот же клиент успешно пишет в `inspection-photos`.
--
-- Диагностика (2026-07-25, anon-ключ, без JWT session):
--   inspection-photos:    INSERT ✓  LIST ✓  DELETE ✓
--   construction-defects: INSERT ✗ (RLS 403)  LIST ✓
--   listBuckets / dump pg_policies через anon — недоступны.
--
-- Политики ниже дают `construction-defects` не более узкий доступ, чем
-- фактически работает у `inspection-photos` для роли приложения (`anon`
-- + `authenticated` на случай будущей сессии). Имена НОВЫЕ (не копия
-- имён эталона — дамп политик Dashboard/service_role недоступен
-- исполнителю); SELECT уже частично работал — доп. SELECT-политика
-- пермиссивна (OR) и не сужает доступ.
--
-- Применение: Supabase Dashboard → SQL Editor → вставить файл → Run.
-- Идемпотентно: DROP POLICY IF EXISTS + CREATE POLICY.
-- =========================================================================

-- Bucket: создать при отсутствии; public=true — public URL как у фото-бакетов
INSERT INTO storage.buckets (id, name, public)
VALUES ('construction-defects', 'construction-defects', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

-- SELECT (list / getPublicUrl consumers / dedup list в rbiUploadAsset)
DROP POLICY IF EXISTS "construction-defects_select_anon" ON storage.objects;
CREATE POLICY "construction-defects_select_anon"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'construction-defects');

-- INSERT (первая загрузка файла)
DROP POLICY IF EXISTS "construction-defects_insert_anon" ON storage.objects;
CREATE POLICY "construction-defects_insert_anon"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'construction-defects');

-- UPDATE (upsert: true в rbiUploadAsset)
DROP POLICY IF EXISTS "construction-defects_update_anon" ON storage.objects;
CREATE POLICY "construction-defects_update_anon"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'construction-defects')
WITH CHECK (bucket_id = 'construction-defects');

-- DELETE (cleanup / паритет с inspection-photos, где remove у anon работает)
DROP POLICY IF EXISTS "construction-defects_delete_anon" ON storage.objects;
CREATE POLICY "construction-defects_delete_anon"
ON storage.objects
FOR DELETE
TO anon, authenticated
USING (bucket_id = 'construction-defects');

-- =========================================================================
-- ROLLBACK (вручную при необходимости)
-- =========================================================================
-- DROP POLICY IF EXISTS "construction-defects_select_anon" ON storage.objects;
-- DROP POLICY IF EXISTS "construction-defects_insert_anon" ON storage.objects;
-- DROP POLICY IF EXISTS "construction-defects_update_anon" ON storage.objects;
-- DROP POLICY IF EXISTS "construction-defects_delete_anon" ON storage.objects;
-- -- bucket не удаляем: в нём могут быть боевые объекты.
-- =========================================================================
