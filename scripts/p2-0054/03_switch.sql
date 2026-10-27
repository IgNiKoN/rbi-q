-- P2-0054: перевод компании на «места ведёт ядро» (правка мест — только «Компания → Объекты и места»).
-- Перед запуском: 01_probe.sql и 02_snapshot.sql (сохранить «до»); инженеров попросить синхронизироваться; нерабочее время.
-- Меняется только признак проектов (places_master 'quality' → 'core'); id узлов и мест, проверки, замечания, приёмки, планы,
-- помещения, назначения инженеров — не меняются. Узлы Качества без места ядра (глубина ≤ 6) — дозаливаются местом (как 044).
-- Название компании — в одном месте ниже (v_name). Откат — 04_rollback.sql (по копии p2_backup.p2_0054_switch).
begin;
do $$
declare
  v_name text := 'RBI';   -- ← компания
  v_company uuid; v_n int; v_fill int := 0; r record;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'projects' and column_name = 'places_master') then
    raise exception 'Сначала 048_core_places_up.sql' using errcode = 'P0001';
  end if;
  select id into v_company from core.companies where name = v_name;
  if v_company is null then raise exception 'Компания «%» не найдена', v_name using errcode = 'P0001'; end if;
  if (select count(*) from core.companies where name = v_name) > 1 then raise exception 'Компаний «%» несколько', v_name using errcode = 'P0001'; end if;

  create schema if not exists p2_backup;
  revoke all on schema p2_backup from public, anon, authenticated;
  create table if not exists p2_backup.p2_0054_switch (project_id uuid primary key, company_id uuid not null, places_master text not null,
                                                         switched_at timestamptz not null default now(), rolled_back_at timestamptz);
  revoke all on p2_backup.p2_0054_switch from public, anon, authenticated;

  -- 1. Дозаливка: живые узлы проектов Качества без места ядра (родитель уже связан) — место, как перенос 044.
  for r in with recursive tree as (
             select n.core_company_id c, n.id, 0 lvl, false del from quality.location_nodes n
              join core.projects pr on pr.id = quality.node_root_project(n)
             where n.core_company_id = v_company and n."nodeType" = 'object' and coalesce(n."parentId", '') = '' and not n.is_deleted
               and pr.places_master = 'quality'
             union all
             select x.core_company_id, x.id, t.lvl + 1, x.is_deleted or t.del from quality.location_nodes x
               join tree t on t.c = x.core_company_id and x."parentId" = t.id where t.lvl < 6)
           select t.id from tree t join quality.location_nodes n on n.core_company_id = t.c and n.id = t.id
            where t.lvl between 1 and 6 and not t.del and n.core_location_id is null order by t.lvl, t.id loop
    perform quality.place_sync(v_company, r.id, false);
    v_fill := v_fill + 1;
  end loop;

  -- 2. Признак (без пометки «изменено»), прежнее значение — в копию.
  insert into p2_backup.p2_0054_switch(project_id, company_id, places_master)
  select id, company_id, places_master from core.projects where company_id = v_company and places_master = 'quality'
  on conflict (project_id) do update set places_master = excluded.places_master, switched_at = now(), rolled_back_at = null;
  alter table core.projects disable trigger projects_touch;
  update core.projects set places_master = 'core' where company_id = v_company and places_master = 'quality';
  get diagnostics v_n = row_count;
  alter table core.projects enable trigger projects_touch;
  raise notice 'P2-0054: «%» — проектов переведено %, дозалито узлов %', v_name, v_n, v_fill;
end $$;
commit;

select pr.name || ': ведёт ' || pr.places_master line from core.projects pr join core.companies co on co.id = pr.company_id
 where co.name = 'RBI' and not pr.quality_container and pr.deleted_at is null order by 1;   -- ← та же компания
