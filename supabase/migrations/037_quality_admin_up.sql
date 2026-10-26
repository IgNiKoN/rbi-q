-- P2-0037 этап 1: админка Качества при входе по почте — справочники пишет только администратор компании (quality.manage).
-- Таблица «раздел → таблицы → кто пишет» — ai-dev/reports/P2-0037/executor-1.md. Что уже было до 037: справочник объектов и
-- дерево локаций — quality.objects.manage (033c), настройки компании/объекта и список объектов — quality.manage (018).
-- 037: 1) справочник подрядчиков (contractors, contractor_directory, contractor_aliases): решение владельца 25.10.2026
--      («Добавлять — да, править — админ»): инженер, как раньше, добавляет нового подрядчика (черновик в «Контрагентах»,
--      ADR-068 п. 6, лимит 025); переименовать, удалить, слить дубли, синонимы — только *.manage;
--      2) очереди заявок (подрядчики, объекты) — инженер подаёт заявку как раньше (вставка и повторная подача), но решение
--      по заявке (status, admin_comment, удаление-пометка) меняет только *.manage: сторож quality.queue_guard тихо
--      сохраняет прежние значения (повторная подача уже разобранной заявки не ломает синхронизацию инженера);
--      удаление строк очереди — только *.manage.
-- Сервисные запуски без пользователя (auth.uid() is null: перенос, SQL Editor) сторож не трогает.
-- Применять после 034, одним запросом. Откат — 037_quality_admin_down.sql.
begin;

do $$
begin
  if not exists (select 1 from core.permission_catalog where action = 'quality.ai') then
    raise exception '037: сначала 034_quality_ai_up.sql' using errcode = 'P0001';
  end if;
  if to_regprocedure('quality.queue_guard()') is not null then
    raise exception '037 уже применена (повтор — только после 037_quality_admin_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Справочник подрядчиков: добавить — *.edit (как 026), править и удалять — только администратор; синонимы — только
--    администратор (подрядчик-только — как в 022/026: никогда)
do $$
declare r record;
  v_add text := 'quality.can(core_company_id, core_project_id, ''{quality.edit,construction.edit}'') and not quality.contractor_only(core_company_id, core_project_id)';
  v_adm text := 'quality.can(core_company_id, core_project_id, ''{quality.manage,construction.manage}'') and not quality.contractor_only(core_company_id, core_project_id)';
begin
  for r in select * from (values ('contractors', v_add), ('contractor_directory', v_add), ('contractor_aliases', v_adm)) v(t, ins) loop
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, r.ins);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', r.t || '_update', r.t, v_adm, v_adm);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, v_adm);
  end loop;
end $$;

-- 2. Очереди заявок: удаление — только администратор; решение по заявке — сторож
drop policy contractor_normalization_queue_delete on quality.contractor_normalization_queue;
create policy contractor_normalization_queue_delete on quality.contractor_normalization_queue for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.manage,construction.manage}') and not quality.contractor_only(core_company_id, core_project_id));
drop policy object_normalization_queue_delete on quality.object_normalization_queue;
create policy object_normalization_queue_delete on quality.object_normalization_queue for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.manage,construction.manage}'));

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
revoke all on function quality.queue_guard() from public, anon, authenticated;

-- имя после «…_bind_company»: сторож видит уже привязанную компанию
create trigger contractor_normalization_queue_queue_guard before insert or update on quality.contractor_normalization_queue
  for each row execute function quality.queue_guard();
create trigger object_normalization_queue_queue_guard before insert or update on quality.object_normalization_queue
  for each row execute function quality.queue_guard();

commit;
