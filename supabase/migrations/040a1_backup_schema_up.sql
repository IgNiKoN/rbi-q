-- P2-0035b этап 2: копии и журнал 040a — в отдельную закрытую схему p2_backup (в схеме quality их проверяют общие тесты
-- структуры и прав Качества как рабочие таблицы). Данные не меняются. Откат — 040a1_backup_schema_down.sql.
begin;
do $$
begin
  if to_regclass('quality.p2_0035b_changes') is null then
    raise exception '040a1: журнал 040a не найден в quality (не применена 040a или уже перенесён)' using errcode = 'P0001';
  end if;
end $$;
create schema if not exists p2_backup;
revoke all on schema p2_backup from public, anon, authenticated;
alter table quality.p2_0035b_backup_profiles set schema p2_backup;
alter table quality.p2_0035b_backup_ratings set schema p2_backup;
alter table quality.p2_0035b_changes set schema p2_backup;
commit;
