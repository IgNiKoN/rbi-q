-- P2-0031 этап 5 (CRITICAL — права): исправления сторожа очередей заявок 037 по ревью P2-0037 (ТД №206: M1, M2, L4).
-- 1) Право решать заявку проверяется по старой И новой строке: нельзя перенести чужую заявку на свой объект и решить её (M1).
-- 2) Разобранную заявку (статус не «на рассмотрении») не-администратор не переписывает: строка остаётся как была,
--    без ошибки — повторная подача с устройства инженера не ломает синхронизацию (M2).
-- 3) Заявку на объект решает и удаляет только право справочника объектов — quality.objects.manage / construction.objects.manage
--    (как сам справочник, 033c: у РБИ — Админ, не Зам.); заявку на подрядчика — по-прежнему quality.manage / construction.manage (L4).
-- Сервисные запуски без пользователя (auth.uid() is null) сторож не трогает, как в 037. Данные не меняет.
-- Применять после 037, одним запросом. Откат — 037a_queue_guard_fix_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.queue_guard()') is null then
    raise exception '037a: сначала 037_quality_admin_up.sql' using errcode = 'P0001';
  end if;
  if obj_description('quality.queue_guard()'::regprocedure, 'pg_proc') = '037a' then
    raise exception '037a уже применена (повтор — только после 037a_queue_guard_fix_down.sql)' using errcode = 'P0001';
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
  new.status := old.status;
  new.admin_comment := old.admin_comment;
  new.is_deleted := old.is_deleted;
  new.deleted_at := old.deleted_at;
  new.deleted_by_auth_user_id := old.deleted_by_auth_user_id;
  return new;
end $$;
comment on function quality.queue_guard() is '037a';
revoke all on function quality.queue_guard() from public, anon, authenticated;

drop policy object_normalization_queue_delete on quality.object_normalization_queue;
create policy object_normalization_queue_delete on quality.object_normalization_queue for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.objects.manage,construction.objects.manage}'));

commit;
