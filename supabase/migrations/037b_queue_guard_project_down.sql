-- Откат 037b (P2-0031 доработка 1): сторож очередей заявок — как в 037a.
begin;

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
  new.status := old.status;
  new.admin_comment := old.admin_comment;
  new.is_deleted := old.is_deleted;
  new.deleted_at := old.deleted_at;
  new.deleted_by_auth_user_id := old.deleted_by_auth_user_id;
  return new;
end $$;
comment on function quality.queue_guard() is '037a';
revoke all on function quality.queue_guard() from public, anon, authenticated;

commit;
