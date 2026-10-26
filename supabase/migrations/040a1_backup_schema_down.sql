-- Откат 040a1 (P2-0035b): копии и журнал 040a — обратно в quality (нужно перед 040a_people_bind_down.sql).
begin;
alter table p2_backup.p2_0035b_backup_profiles set schema quality;
alter table p2_backup.p2_0035b_backup_ratings set schema quality;
alter table p2_backup.p2_0035b_changes set schema quality;
drop schema if exists p2_backup;
commit;
