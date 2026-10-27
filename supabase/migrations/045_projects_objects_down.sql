-- Откат P2-0047 (045): объекты снова корпус/прочее, карточка проекта, подразделения и справочники убираются.
-- Данные карточки (адрес, стадия, роль, пояс, страна, подразделение, руководитель) и номера помещений теряются — перед откатом
-- выгрузить при необходимости. Объекты вида «паркинг», «сети», «благоустройство», созданные после 045, станут «прочим».
begin;

do $$
begin
  if to_regclass('core.divisions') is null then raise exception '045 не применена' using errcode = 'P0001'; end if;
end $$;

drop function public.pf_copy_place(uuid, uuid, text);
drop function public.pf_add_floors(uuid[], int, int, int);
drop function public.pf_fill_object(uuid, int, int, int, int, text, int, boolean, boolean);
drop function core.next_build_no(uuid);
drop function public.pf_remove_place(uuid);
drop function public.pf_save_place(uuid, uuid, uuid, text, text, text, text, text);
drop function public.pf_project_places(uuid, uuid);
drop function public.pf_save_project(uuid, uuid, jsonb);
drop function public.pf_project_catalog(uuid);
drop function public.pf_save_division(uuid, uuid, text, uuid, boolean);
drop function public.pf_company_divisions(uuid);
drop function public.pf_project_dicts();
drop function core.require_places_manage(uuid);
drop function core.can_manage_projects(uuid);
drop function core.is_project_participant(uuid);

drop trigger a_locations_root_object on core.locations;
drop function core.locations_root_object();
alter table core.locations drop constraint locations_object_root_chk, drop constraint locations_object_kind_chk;
alter table core.locations disable trigger user;
update core.locations set node_type = case when object_kind = 'building' then 'building' else 'other' end where node_type = 'object';
alter table core.locations enable trigger user;
alter table core.locations drop constraint locations_node_type_check;
alter table core.locations add constraint locations_node_type_check
  check (node_type = any (array['building'::text, 'section'::text, 'floor'::text, 'apartment'::text, 'other'::text]));
alter table core.locations drop column object_kind, drop column build_no, drop column bti_no;

drop index core.projects_division_idx;
alter table core.projects
  drop constraint projects_division_fk, drop constraint projects_manager_fk, drop constraint projects_country_chk, drop constraint projects_address_chk,
  drop column division_id, drop column address, drop column manager_user_id, drop column stage, drop column our_role,
  drop column timezone, drop column country;

drop table core.divisions;
drop table core.project_roles;
drop table core.object_kinds;
drop table core.project_stages;

commit;
