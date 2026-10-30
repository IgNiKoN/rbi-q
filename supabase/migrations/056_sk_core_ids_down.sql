-- P2-0076: откат 056_sk_core_ids_up.sql — снимает сторож, функции, таблицу соответствий и колонки id. Соответствия, выбранные
-- людьми в «Разобрать», теряются (тексты и подписи замечаний не тронуты); core_counterparty_id остаётся (039a) и при следующей
-- правке записи снова ставится прежним правилом 039a.
drop trigger if exists sk_records_zz_core_links on quality.sk_records;
drop function if exists quality.sk_links_backfill(boolean);
drop function if exists quality.sk_links_register(uuid, jsonb);
drop function if exists quality.sk_core_choices(uuid);
drop function if exists quality.sk_links_list(uuid, boolean);
drop function if exists quality.sk_link_set(uuid, text, text, uuid);
drop function if exists quality.sk_project_objects(uuid, uuid);
drop function if exists quality.sk_links_guard(uuid, text);
drop function if exists quality.sk_stamp_core_ids();
drop function if exists quality.sk_link_resolve(uuid, uuid, text, text, uuid, boolean);
drop function if exists quality.sk_link_target(quality.sk_links);
drop function if exists quality.sk_place_path(uuid);
drop function if exists quality.sk_auto_target(uuid, text, uuid, text, text, text, text, text, text, text);
drop function if exists quality.sk_place_of(uuid, text, text, text);
drop function if exists quality.sk_rec_text(text, quality.sk_records);
drop function if exists quality.sk_link_key(text);
drop table if exists quality.sk_links;
drop index if exists quality.sk_records_core_location_idx;
drop index if exists quality.sk_records_core_work_type_idx;
alter table quality.sk_records drop column if exists core_location_id;
alter table quality.sk_records drop column if exists core_work_type_id;
