-- P2-0027. Откат 031_rbi_transfer_up.sql: служебные таблицы и функции переноса. Перенесённые строки компании и файлы
-- не удаляются — перед откатом выполнить quality.rbi_transfer_clear(компания) и scripts/rbi-transfer/files.mjs clear.
begin;
drop function if exists quality.rbi_transfer_clear(uuid);
drop function if exists quality.rbi_transfer_public_fingerprint();
drop function if exists quality.rbi_transfer_verify(uuid, text);
drop function if exists quality.rbi_transfer_run(uuid, text);
drop function if exists quality.rbi_transfer_row(uuid, text, jsonb, jsonb, jsonb, jsonb);
drop function if exists quality.rbi_transfer_filter(uuid, text, text);
drop function if exists quality.rbi_transfer_tables();
drop function if exists quality.rbi_transfer_buckets();
drop table if exists quality.rbi_transfer_runs;
drop table if exists quality.rbi_transfer_files;
drop table if exists quality.rbi_transfer_people;
drop table if exists quality.rbi_transfer_projects;
-- usage раздела quality у service_role не отзывается: без таблиц переноса прав на объекты у него нет (как до 031).
commit;
