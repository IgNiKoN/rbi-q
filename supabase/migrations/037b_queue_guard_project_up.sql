-- P2-0031 доработка 1 (CRITICAL — права), ревью `reports/P2-0031/review-1.md` M1: обход сторожа очередей в два шага.
-- В 037a не-администратор мог у заявки «на рассмотрении» сменить объект (project_code → core_project_id), а следующим
-- запросом решить её как заявку «своего» объекта; либо указать не-UUID код — объект обнулялся, и решить мог любой с правом
-- решать хотя бы на одном объекте. 037b: без права решать по старой и новой строке объект заявки не меняется — сторож
-- возвращает прежние project_code и core_project_id (без ошибки, как остальные поля). Администратор переносит, как раньше.
-- Остальное — как в 037a. Данные не меняет. Применять после 037a, одним запросом. Откат — 037b_queue_guard_project_down.sql.
begin;

do $$
begin
  if obj_description('quality.queue_guard()'::regprocedure, 'pg_proc') is distinct from '037a' then
    raise exception '037b: нужна 037a (и 037b ещё не применена)' using errcode = 'P0001';
  end if;
end $$;

create or replace function quality.queue_guard()
returns trigger language plpgsql set search_path = pg_catalog, quality as $$
declare
  v_acts text[] := case when tg_table_name = 'object_normalization_queue'
                        then array['quality.objects.manage', 'construction.objects.manage']
                        else array['quality.manage', 'construction.manage'] end;
begin
  if auth.uid() is null then
    return new;
  end if;
  if quality.can(new.core_company_id, new.core_project_id, v_acts)
     and (tg_op = 'INSERT' or quality.can(old.core_company_id, old.core_project_id, v_acts)) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.is_deleted := false;
    new.deleted_at := null;
    new.deleted_by_auth_user_id := null;
    return new;
  end if;
  if old.status is distinct from 'pending' then
    return old;
  end if;
  new.project_code := old.project_code;
  new.core_project_id := old.core_project_id;
  new.status := old.status;
  new.admin_comment := old.admin_comment;
  new.is_deleted := old.is_deleted;
  new.deleted_at := old.deleted_at;
  new.deleted_by_auth_user_id := old.deleted_by_auth_user_id;
  return new;
end $$;
comment on function quality.queue_guard() is '037b';
revoke all on function quality.queue_guard() from public, anon, authenticated;

commit;
