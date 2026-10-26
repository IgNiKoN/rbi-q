-- P2-0035b этап 2 (ADR-070): Качество узнаёт человека по номеру учётки.
-- 1) Профиль и рейтинг — один на человека в компании: уникальность (core_company_id, auth_user_id) без условия (решение владельца
--    №5), чтобы приложение писало их по номеру (onConflict → «core_company_id,auth_user_id» через мост Качества).
-- 2) Номер владельца профиля/рейтинга ставит сервер по токену входа при создании; запросом приложения не меняется (подмена
--    не работает; администратор, меняющий чужой профиль, номер не перезаписывает). Без входа (серверные привязки) — меняется.
-- 3) Задача: «кому» (assigned_to_auth_user_id) — сервер по ФИО исполнителя, если оно однозначно среди сотрудников компании
--    (ФИО, почта, имена старого профиля РБИ — core.staff_name_aliases); спорное — пусто (не угадывать).
-- ФИО остаются подписями. Применять после 040a. Откат — 040b_people_by_id_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.person_by_name(uuid,text)') is not null then
    raise exception '040b уже применена (повтор — только после 040b_people_by_id_down.sql)' using errcode = 'P0001';
  end if;
  if exists (select 1 from quality.rbi_engineer_profiles where auth_user_id is not null
              group by core_company_id, auth_user_id having count(*) > 1) then
    raise exception '040b: у учётки два профиля в одной компании — сначала разобрать (scripts/p2-0035b/dryrun_names.sql)' using errcode = 'P0001';
  end if;
  if exists (select 1 from quality.rbi_engineer_ratings where auth_user_id is not null
              group by core_company_id, auth_user_id having count(*) > 1) then
    raise exception '040b: у учётки два рейтинга в одной компании — сначала разобрать' using errcode = 'P0001';
  end if;
end $$;

-- Сотрудник компании по ФИО: ровно один — его номер, иначе пусто
create function quality.person_by_name(p_company uuid, p_name text)
returns uuid language sql stable security definer set search_path = pg_catalog, core as $$
  select case when count(distinct m.user_id) = 1 then min(m.user_id::text)::uuid end
    from core.company_members m
    left join core.user_profiles up on up.user_id = m.user_id
   where m.company_id = p_company and nullif(btrim(coalesce(p_name, '')), '') is not null
     and lower(btrim(p_name)) = any (core.staff_name_aliases(m.user_id, up.full_name));
$$;
revoke all on function quality.person_by_name(uuid, text) from public, anon, authenticated;

-- Владелец профиля/рейтинга: при создании — вошедший (токен), потом не меняется; без токена (сервер, перенос) — как передали
create function quality.set_person()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if tg_op = 'INSERT' then new.auth_user_id := coalesce(auth.uid(), new.auth_user_id);
  elsif auth.uid() is not null then new.auth_user_id := old.auth_user_id;   -- запрос приложения: номер владельца не меняется
  end if;                                                                     -- сервер без входа (привязка, перенос) — может
  return new;
end $$;
create trigger rbi_engineer_profiles_set_person before insert or update on quality.rbi_engineer_profiles
  for each row execute function quality.set_person();
create trigger rbi_engineer_ratings_set_person before insert or update on quality.rbi_engineer_ratings
  for each row execute function quality.set_person();

-- Один профиль и один рейтинг на человека в компании (пустой номер — не мешает)
drop index if exists quality.rbi_engineer_profiles_auth_user_id_uidx;
create unique index rbi_engineer_profiles_company_user_key on quality.rbi_engineer_profiles (core_company_id, auth_user_id);
create unique index rbi_engineer_ratings_company_user_key on quality.rbi_engineer_ratings (core_company_id, auth_user_id);

-- Задача: «кому» по ФИО исполнителя (после привязки компании — имя триггера после «…_bind_company»)
create function quality.set_assignee()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if new.assigned_to_auth_user_id is null
     or (tg_op = 'UPDATE' and new.engineer_name is distinct from old.engineer_name
         and new.assigned_to_auth_user_id is not distinct from old.assigned_to_auth_user_id) then
    new.assigned_to_auth_user_id := quality.person_by_name(new.core_company_id, new.engineer_name);
  end if;
  return new;
end $$;
create trigger rbi_tasks_zz_set_assignee before insert or update on quality.rbi_tasks
  for each row execute function quality.set_assignee();

revoke all on function quality.set_person(), quality.set_assignee() from public, anon, authenticated;

commit;
