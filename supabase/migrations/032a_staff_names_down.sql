-- P2-0028: откат 032a_staff_names_up.sql — функции смены ФИО. Уже переписанные имена в записях Качества остаются (это данные);
-- ФИО в core.user_profiles остаётся (таблица — 032).
begin;
drop function if exists public.pf_set_full_name(uuid, text);
drop function if exists core.staff_rename_quality(uuid, uuid, text[], text);
drop function if exists core.staff_name_aliases(uuid, text);
commit;
