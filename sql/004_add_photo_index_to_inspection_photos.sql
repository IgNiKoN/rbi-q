-- Файл: sql/004_add_photo_index_to_inspection_photos.sql
-- Множественные фото к пункту чек-листа (B1, трек пользовательского фидбека,
-- _ai/USER_FEEDBACK_TRIAGE.md) — критичный шаг, изменение схемы существующей
-- (не §38 v2) таблицы rbi_inspection_photos.
-- Выполняется ВРУЧНУЮ в Supabase SQL Editor — не через приложение,
-- не через anon-ключ REST API (DDL недоступен anon-ключу).
-- Дата: 2026-07-19.
--
-- Контекст: раньше одна строка rbi_inspection_photos на (inspection_id,
-- item_id) — id = `${inspection_id}_${item_id}_main`. Теперь до N строк на
-- (inspection_id, item_id), различаемых photo_index (0-based позиция в
-- массиве photos[item_id]) — id = `${inspection_id}_${item_id}_${photoIndex}`.
--
-- Идемпотентность: ADD COLUMN IF NOT EXISTS / UPDATE — безопасно
-- перезапускать (backfill условный, WHERE photo_index IS NULL).

-- =========================================================================
-- 1. Новая колонка photo_index (позиция фото в массиве photos[item_id])
-- =========================================================================
ALTER TABLE rbi_inspection_photos ADD COLUMN IF NOT EXISTS photo_index integer NOT NULL DEFAULT 0;

-- =========================================================================
-- 2. Backfill старых строк (id заканчивался на `_main`, единственное фото
--    на item_id) — photo_index уже 0 по умолчанию, явный UPDATE не нужен,
--    но переименовываем id для единообразия с новым форматом.
--    ВНИМАНИЕ: меняет id существующих строк. Безопасно, потому что
--    приложение больше не читает/пишет id со суффиксом `_main` после этого
--    блока — только `_${photoIndex}`. Если деплой кода отстаёт от миграции,
--    выполнить эту миграцию СРАЗУ ПОСЛЕ деплоя кода (не раньше), чтобы не
--    создавать окно с двумя одновременно живыми форматами id для одной
--    и той же строки.
-- =========================================================================
UPDATE rbi_inspection_photos
SET id = regexp_replace(id, '_main$', '_0')
WHERE id LIKE '%_main';

-- =========================================================================
-- 3. Индекс для быстрой сортировки фото пункта по позиции при pull
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_rbi_inspection_photos_item_order
    ON rbi_inspection_photos (inspection_id, item_id, photo_index);

-- =========================================================================
-- ROLLBACK (раскомментировать и выполнить для отката):
-- =========================================================================
-- UPDATE rbi_inspection_photos SET id = regexp_replace(id, '_0$', '_main') WHERE id LIKE '%_0' AND photo_index = 0;
-- DROP INDEX IF EXISTS idx_rbi_inspection_photos_item_order;
-- ALTER TABLE rbi_inspection_photos DROP COLUMN IF EXISTS photo_index;
