-- P2-0045: откат 044_one_places_tree_up.sql — перенос Качество → ядро и запрет правки в План/Факте сняты; места, перенесённые
-- из Качества, помечаются удалёнными (План/Факт их больше не показывает); замечания и приёмки v2 — снова без объекта (как 043).
-- Проверка на PGlite: schema_fingerprint до up и после down совпадает.
begin;
do $$
begin
  if to_regprocedure('quality.place_sync(uuid,text,boolean,integer)') is null then
    raise exception '044 down: 044 не применена' using errcode = 'P0001';
  end if;
end $$;

drop trigger construction_defects_v2_bind_object on quality.construction_defects_v2;
drop trigger construction_acceptance_v2_bind_object on quality.construction_acceptance_v2;
-- bind_company обнуляет core_project_id при любой правке строки
update quality.construction_defects_v2 set core_project_id = null where core_project_id is not null;
update quality.construction_acceptance_v2 set core_project_id = null where core_project_id is not null;

drop trigger location_nodes_place_sync on quality.location_nodes;
drop trigger zz_locations_quality_guard on core.locations;
update core.locations l set deleted_at = now()
 where l.deleted_at is null and exists (select 1 from quality.location_nodes n where n.core_location_id = l.id);

drop function public.pf_locations_from_quality(uuid);
drop function quality.v2_bind_object();
drop function quality.places_guard();
drop function quality.node_place_sync();
drop function quality.place_sync(uuid, text, boolean, int);
drop function quality.places_led_by_quality(uuid);
drop function quality.node_object_project(uuid, text);
drop function quality.node_root_project(quality.location_nodes);
drop index quality.location_nodes_core_location_uq;
drop index quality.location_nodes_core_location_idx;
alter table quality.location_nodes drop column core_location_id;

commit;
