-- P2-0035b 040a: после 040a_people_bind_down.sql — поля номера и «скрыт» вернулись, журнал и копии удалены. Отчёт — ERROR «FAIL всего: N».
do $$
declare res text := '';
begin
  if exists (select 1 from quality.rbi_tasks where id in ('t1', 't2') and assigned_to_auth_user_id is not null) then res := res || 'FAIL задачи вернулись пустыми' || E'\n'; end if;
  if (select owner_auth_user_id from quality.rbi_draft_sessions where id = 'd1') is not null then res := res || 'FAIL черновик вернулся' || E'\n'; end if;
  if (select auth_user_id from quality.rbi_engineer_ratings where id = 'r1') is not null then res := res || 'FAIL рейтинг r1 вернулся' || E'\n'; end if;
  if (select is_deleted from quality.rbi_engineer_ratings where id = 'r2') then res := res || 'FAIL r2 снова виден' || E'\n'; end if;
  if to_regclass('quality.p2_0035b_changes') is not null or to_regclass('quality.p2_0035b_backup_ratings') is not null then res := res || 'FAIL журнал и копии удалены' || E'\n'; end if;
  raise exception 'P2-0035b 040a (откат)%FAIL всего: %', E'\n' || res, (length(res) - length(replace(res, 'FAIL', ''))) / 4 using errcode = 'P0001';
end $$;
