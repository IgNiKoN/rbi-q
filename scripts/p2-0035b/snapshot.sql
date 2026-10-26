-- P2-0035b — снимок «до/после» по каждому сотруднику: ТОЛЬКО ЧТЕНИЕ. Сверка этапов 1–4: значения до и после должны совпасть.
-- Профили и рейтинги — по номеру учётки (если стоит) или по ФИО; очки — длина gameLogs профиля.
select c.name "компания", coalesce(up.full_name, p.engineer_name) "сотрудник", u.email "почта",
       count(distinct p.id) "профилей", coalesce(sum(jsonb_array_length(coalesce(p.profile_data->'gameLogs', '[]'::jsonb))), 0) "записей очков",
       (select coalesce(sum(r.pi), 0) from quality.rbi_engineer_ratings r where r.core_company_id = p.core_company_id
          and (r.auth_user_id = p.auth_user_id or lower(btrim(r.engineer_name)) = lower(btrim(p.engineer_name)))) "рейтинг (pi)",
       (select count(*) from quality.rbi_inspections i where i.core_company_id = p.core_company_id
          and lower(btrim(i.engineer_name)) = lower(btrim(p.engineer_name))) "проверок по ФИО",
       (select count(*) from quality.rbi_tasks t where t.core_company_id = p.core_company_id
          and lower(btrim(t.engineer_name)) = lower(btrim(p.engineer_name))) "задач по ФИО"
  from quality.rbi_engineer_profiles p
  join core.companies c on c.id = p.core_company_id
  left join core.user_profiles up on up.user_id = p.auth_user_id
  left join auth.users u on u.id = p.auth_user_id
 group by c.name, p.core_company_id, p.auth_user_id, coalesce(up.full_name, p.engineer_name), u.email, p.engineer_name
 order by 1, 2;
