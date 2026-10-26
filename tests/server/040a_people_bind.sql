-- P2-0035b 040a: проверка привязки (после 040a_people_bind.seed.pglite.sql и 040a_people_bind_up.sql). Отчёт — ERROR «FAIL всего: N».
do $$
declare res text := '';
begin
  if (select assigned_to_auth_user_id from quality.rbi_tasks where id = 't1') is distinct from public.t040a('uiv') then res := res || 'FAIL t1 → Иванов' || E'\n'; end if;
  if (select assigned_to_auth_user_id from quality.rbi_tasks where id = 't2') is distinct from public.t040a('uiv') then res := res || 'FAIL t2 (регистр/пробел) → Иванов' || E'\n'; end if;
  if (select assigned_to_auth_user_id from quality.rbi_tasks where id = 't3') is not null then res := res || 'FAIL t3 однофамильцы — не угадывать' || E'\n'; end if;
  if (select assigned_to_auth_user_id from quality.rbi_tasks where id = 't4') is not null then res := res || 'FAIL t4 неизвестный — пусто' || E'\n'; end if;
  if (select owner_auth_user_id from quality.rbi_draft_sessions where id = 'd1') is distinct from public.t040a('ula') then res := res || 'FAIL d1 опечатка «Латвшев» → Латышев' || E'\n'; end if;
  if (select owner_auth_user_id from quality.rbi_draft_sessions where id = 'd2') is not null then res := res || 'FAIL d2 однофамильцы — пусто' || E'\n'; end if;
  if (select auth_user_id from quality.rbi_engineer_ratings where id = 'r1') is distinct from public.t040a('uiv') then res := res || 'FAIL r1 рейтинг → Иванов' || E'\n'; end if;
  if not (select is_deleted from quality.rbi_engineer_ratings where id = 'r2') then res := res || 'FAIL r2 тестовая учётка скрыта из рейтинга' || E'\n'; end if;
  if (select pi from quality.rbi_engineer_ratings where id = 'r1') <> 100 then res := res || 'FAIL рейтинг не изменён' || E'\n'; end if;
  if (select count(*) from quality.p2_0035b_backup_ratings where id in ('r1', 'r2')) <> 2 then res := res || 'FAIL копия рейтингов' || E'\n'; end if;
  if (select count(*) from quality.p2_0035b_changes) <> 5 then res := res || 'FAIL журнал изменений 5: ' || (select count(*) from quality.p2_0035b_changes) || E'\n'; end if;
  if (select pg_temp_check from (select has_table_privilege('authenticated', 'quality.p2_0035b_changes', 'select') pg_temp_check) x) then res := res || 'FAIL журнал закрыт от клиента' || E'\n'; end if;
  raise exception 'P2-0035b 040a (привязка)%FAIL всего: %', E'\n' || res, (length(res) - length(replace(res, 'FAIL', ''))) / 4 using errcode = 'P0001';
end $$;
