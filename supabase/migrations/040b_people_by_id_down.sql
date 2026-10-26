-- Откат 040b (P2-0035b): триггеры и функции «по номеру», уникальность профиля/рейтинга по номеру — как до 040b.
-- Проставленные номера (задачи, профили, рейтинги) остаются — это данные.
begin;
drop trigger if exists rbi_tasks_zz_set_assignee on quality.rbi_tasks;
drop trigger if exists rbi_engineer_ratings_set_person on quality.rbi_engineer_ratings;
drop trigger if exists rbi_engineer_profiles_set_person on quality.rbi_engineer_profiles;
drop function if exists quality.set_assignee();
drop function if exists quality.set_person();
drop function if exists quality.person_by_name(uuid, text);
drop index if exists quality.rbi_engineer_ratings_company_user_key;
drop index if exists quality.rbi_engineer_profiles_company_user_key;
create unique index rbi_engineer_profiles_auth_user_id_uidx on quality.rbi_engineer_profiles (core_company_id, auth_user_id)
  where auth_user_id is not null;
commit;
