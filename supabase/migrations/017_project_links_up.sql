-- P2-0015 этап 4. Объект ↔ контрагенты: у объекта (core.projects) — «Заказчик» и «Генподрядчик» из контрагентов своей компании.
-- Применять после 017_counterparties_up.sql. Объекты RBI/Quality, Auth и Storage не затрагивает. Повторное применение безопасно.
-- КС-2 не меняется на сервере: реквизиты заказчика подставляет клиент из карточки (pf_project_counterparties), если в настройках КС-2 пусто.
-- Откат — 017_project_links_down.sql.

alter table core.projects add column if not exists customer_id uuid;
alter table core.projects add column if not exists general_contractor_id uuid;
do $$
begin
  -- Ссылка только на контрагента той же компании: составной ключ (id, company_id).
  if not exists (select 1 from pg_constraint where conname = 'projects_customer_fk') then
    alter table core.projects add constraint projects_customer_fk foreign key (customer_id, company_id)
      references core.counterparties(id, company_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_general_contractor_fk') then
    alter table core.projects add constraint projects_general_contractor_fk foreign key (general_contractor_id, company_id)
      references core.counterparties(id, company_id) on delete restrict;
  end if;
end $$;
create index if not exists projects_customer_idx on core.projects(customer_id) where customer_id is not null;
create index if not exists projects_general_contractor_idx on core.projects(general_contractor_id) where general_contractor_id is not null;

-- Карточка контрагента для документов объекта (без проверки прав — только для pf_*).
create or replace function core.counterparty_card(p_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, core as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'inn', c.inn, 'kpp', c.kpp, 'kinds', to_jsonb(c.kinds),
                            'requisites', c.requisites, 'archived', c.archived_at is not null)
  from core.counterparties c where c.id = p_id and c.deleted_at is null;
$$;

-- Заказчик и генподрядчик объекта: { customer: {…} | null, general_contractor: {…} | null }. Любой участник объекта.
create or replace function public.pf_project_counterparties(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
declare v_p core.projects;
begin
  if p_project is null or auth.uid() is null or not planfact.is_project_member(p_project) then
    raise exception 'Нет доступа к объекту' using errcode = '42501';
  end if;
  select * into v_p from core.projects where id = p_project;
  return jsonb_build_object('customer', core.counterparty_card(v_p.customer_id),
                            'general_contractor', core.counterparty_card(v_p.general_contractor_id));
end $$;

-- Выбрать заказчика и генподрядчика объекта (null — не указан). Право planfact.projects.manage; объект не в архиве.
-- Новый выбор — только действующий (не архивный) контрагент своей компании с нужным видом; прежний выбор можно оставить.
create or replace function public.pf_project_set_counterparties(p_project uuid, p_customer uuid, p_general_contractor uuid)
returns void language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare v_company uuid; v_old core.projects; v_c core.counterparties;
begin
  v_company := planfact.require_project_manage(p_project, false);
  select * into v_old from core.projects where id = p_project for update;
  if p_customer is not null and p_customer is distinct from v_old.customer_id then
    select * into v_c from core.counterparties where id = p_customer and company_id = v_company and deleted_at is null;
    if v_c.id is null then raise exception 'Контрагент не найден' using errcode = '22023'; end if;
    if v_c.archived_at is not null then raise exception 'Контрагент «%» в архиве', v_c.name using errcode = '22023'; end if;
    if not 'customer' = any(v_c.kinds) then raise exception '«%» не отмечен как заказчик', v_c.name using errcode = '22023'; end if;
  end if;
  if p_general_contractor is not null and p_general_contractor is distinct from v_old.general_contractor_id then
    select * into v_c from core.counterparties where id = p_general_contractor and company_id = v_company and deleted_at is null;
    if v_c.id is null then raise exception 'Контрагент не найден' using errcode = '22023'; end if;
    if v_c.archived_at is not null then raise exception 'Контрагент «%» в архиве', v_c.name using errcode = '22023'; end if;
    if not 'general_contractor' = any(v_c.kinds) then raise exception '«%» не отмечен как генподрядчик', v_c.name using errcode = '22023'; end if;
  end if;
  if p_customer is not distinct from v_old.customer_id and p_general_contractor is not distinct from v_old.general_contractor_id then
    return;
  end if;
  update core.projects set customer_id = p_customer, general_contractor_id = p_general_contractor where id = p_project;
  perform planfact.log_admin_change(v_company, p_project, 'projects', p_project, 'UPDATE',
    jsonb_build_object('customer', core.counterparty_card(v_old.customer_id) ->> 'name',
                       'general_contractor', core.counterparty_card(v_old.general_contractor_id) ->> 'name'),
    jsonb_build_object('customer', core.counterparty_card(p_customer) ->> 'name',
                       'general_contractor', core.counterparty_card(p_general_contractor) ->> 'name'));
end $$;

-- Список объектов компании: + заказчик и генподрядчик (столбцы в конце; прежние — без изменений).
drop function if exists public.pf_company_projects(uuid);
create function public.pf_company_projects(p_company uuid)
returns table(id uuid, name text, code text, archived_at timestamptz, created_at timestamptz, can_manage boolean,
              customer_id uuid, customer_name text, general_contractor_id uuid, general_contractor_name text)
language sql stable security definer set search_path = pg_catalog, planfact, core as $$
  select pr.id, pr.name, pr.code, pr.archived_at, pr.created_at, planfact.has_permission(pr.id, 'planfact.projects.manage'),
         pr.customer_id, cu.name, pr.general_contractor_id, gc.name
  from core.projects pr
  left join core.counterparties cu on cu.id = pr.customer_id
  left join core.counterparties gc on gc.id = pr.general_contractor_id
  where pr.company_id = p_company and auth.uid() is not null and planfact.is_project_member(pr.id)
  order by (pr.archived_at is not null), pr.name;
$$;

revoke all on function core.counterparty_card(uuid) from public, anon;
revoke all on function public.pf_project_counterparties(uuid), public.pf_project_set_counterparties(uuid, uuid, uuid),
  public.pf_company_projects(uuid) from public, anon;
grant execute on function public.pf_project_counterparties(uuid), public.pf_project_set_counterparties(uuid, uuid, uuid),
  public.pf_company_projects(uuid) to authenticated;
