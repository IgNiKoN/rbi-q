-- P2-0057: откат 055_place_plans_up.sql — схема как до 055 (побайтно по отпечатку tests/server/schema_fingerprint.pglite.sql).
-- Бакет core-place-plans и его файлы НЕ удаляются (ничего не стирается): без правил доступа файлы недоступны никому, кроме
-- сервиса. Копии планов в quality.construction_floors_v2 / construction_units_v2 остаются как есть (ссылки на файлы ядра
-- после отката не откроются — перед откатом снять копии: release-plan). Записи core.place_documents удаляются вместе с таблицей —
-- перед откатом сохранить: create table p2_backup.p2_0057_place_documents as select * from core.place_documents.
begin;
drop trigger if exists construction_floors_v2_plan_guard on quality.construction_floors_v2;
drop trigger if exists construction_units_v2_plan_guard on quality.construction_units_v2;
drop function if exists public.pf_place_plans(uuid);
drop function if exists public.pf_add_place_plan(uuid, uuid, text, text, bigint);
drop function if exists public.pf_set_place_plan(uuid);
drop function if exists public.pf_remove_place_plan(uuid);
drop function if exists public.pf_place_pins(uuid);
drop function if exists core.plan_place(uuid);
drop function if exists quality.plan_core_guard();
drop function if exists quality.plan_row_exists(text, uuid, text);
drop function if exists quality.plan_core_url(uuid, text);
drop function if exists quality.plan_core_place(uuid, text);
drop function if exists quality.mirror_place_plan(uuid);
drop policy if exists core_place_plans_select on storage.objects;
drop policy if exists core_place_plans_insert on storage.objects;
drop policy if exists core_place_plans_guard_select on storage.objects;
drop policy if exists core_place_plans_guard_insert on storage.objects;
drop policy if exists core_place_plans_guard_update on storage.objects;
drop policy if exists core_place_plans_guard_delete on storage.objects;
drop function if exists core.place_file_can(text, boolean);
drop function if exists core.can_manage_places(uuid);
drop table if exists core.place_documents;
commit;
