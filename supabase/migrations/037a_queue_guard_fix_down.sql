-- Откат 037a (P2-0031): сторож очередей заявок и удаление заявок на объект — как в 037.
begin;

create or replace function quality.queue_guard()
returns trigger language plpgsql set search_path = pg_catalog, quality as $$
begin
  if auth.uid() is null or quality.can(new.core_company_id, new.core_project_id, array['quality.manage', 'construction.manage']) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.is_deleted := false;
    new.deleted_at := null;
    new.deleted_by_auth_user_id := null;
  else
    new.status := old.status;
    new.admin_comment := old.admin_comment;
    new.is_deleted := old.is_deleted;
    new.deleted_at := old.deleted_at;
    new.deleted_by_auth_user_id := old.deleted_by_auth_user_id;
  end if;
  return new;
end $$;
comment on function quality.queue_guard() is null;
revoke all on function quality.queue_guard() from public, anon, authenticated;

drop policy object_normalization_queue_delete on quality.object_normalization_queue;
create policy object_normalization_queue_delete on quality.object_normalization_queue for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.manage,construction.manage}'));

commit;
