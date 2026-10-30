-- P2-0057 этап 4: проверка после 02_transfer.sql (ТОЛЬКО PGlite). Запуск:
--   node tests/server/run-pglite.mjs --upto 047 --then 048_core_places.seed.pglite.sql --then 048_core_places_up.sql … --then 055_place_plans_up.sql
--     --then 055_transfer_prep.pglite.sql --then scripts/p2-0057/02_transfer.sql [--then scripts/p2-0057/02_transfer.sql] 055_transfer.check.sql
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
do $$
declare
  c uuid := '00000000-0000-4000-8000-000000548100'; res text := ''; n int; m int; d core.place_documents; v text;
begin
  -- места ядра с планом в модулях (проекты ядра, один на место) = документы переноса
  select count(distinct l.id) into n
    from (select "locationId" as node, core_company_id from quality.construction_floors_v2 where not is_deleted and coalesce(pdf_url, '') <> ''
          union all select "locationId", core_company_id from quality.construction_units_v2 where not is_deleted and coalesce(pdf_url, '') <> '') x
    join quality.location_nodes nd on nd.core_company_id = x.core_company_id and nd.id = x.node
    join core.locations l on l.id = nd.core_location_id join core.projects pr on pr.id = l.project_id and pr.places_master = 'core'
   where x.core_company_id = c;
  select count(*) into m from core.place_documents where company_id = c and is_current and deleted_at is null and version_no = 1;
  res := res || pg_temp.t(n > 0 and m = n and (select count(*) from p2_backup.p2_0057_transfer) = n,
                          'перенос: мест с планом в проектах ядра ' || n || ' = документов ' || m || ' (ни один не потерян)');
  -- ссылки в модулях не изменились (снимок до = после)
  select string_agg(k || ':' || (b.n = a.n and b.v = a.v)::text, ',') into v
    from public.p57_before b join (
      select 'module_floors' as k, count(*) as n, md5(coalesce(string_agg(core_company_id || '|' || id || '|' || pdf_url, ',' order by core_company_id, id), '')) as v
        from quality.construction_floors_v2 where not is_deleted and coalesce(pdf_url, '') <> ''
      union all
      select 'module_units', count(*), md5(coalesce(string_agg(core_company_id || '|' || id || '|' || pdf_url, ',' order by core_company_id, id), ''))
        from quality.construction_units_v2 where not is_deleted and coalesce(pdf_url, '') <> '') a using (k);
  res := res || pg_temp.t(v = 'module_floors:true,module_units:true', 'снимок до = после: ссылки Качества / СК не менялись (' || v || ')');
  -- каждый документ ведёт на тот же файл, что строка модуля (последняя из дублей)
  res := res || pg_temp.t(not exists (
      select 1 from core.place_documents dd join p2_backup.p2_0057_transfer t on t.doc_id = dd.id
       where dd.file_url <> coalesce((select pdf_url from quality.construction_floors_v2 where core_company_id = c and id = t.source_id),
                                      (select pdf_url from quality.construction_units_v2 where core_company_id = c and id = t.source_id))),
    'документ = та же ссылка, что в модуле');
  select dd.* into d from core.place_documents dd join quality.location_nodes nd on nd.core_location_id = dd.location_id
   where nd.core_company_id = c and nd.id = 'n548-n-b1s1f1';
  res := res || pg_temp.t(d.file_url like '%/n548-n-b1s1f1/plan_1.pdf' and d.file_bucket = 'quality-custom-assets'
                          and d.file_path like '00000000-0000-4000-8000-000000548100/location_plans/%' and d.file_size = 120345,
                          'дубль строк этажа: взята последняя изменённая; бакет, путь и размер разобраны (' || coalesce(d.file_url, 'нет') || ')');
  res := res || pg_temp.t(exists (select 1 from core.place_documents dd join quality.location_nodes nd on nd.core_location_id = dd.location_id
                                   where nd.core_company_id = c and nd.id = 'n548-n-b1s1f1a1' and dd.file_name = 'кв1.pdf' and dd.file_size = 5000),
                          'квартира: план перенесён');
  res := res || pg_temp.t(exists (select 1 from quality.construction_floors_v2 where core_company_id = c and id = 'p548-south')
                          and not exists (select 1 from core.place_documents dd join core.projects pr on pr.id = dd.project_id where pr.name = 'ЖК Юг'),
                          'проект, где места ведёт Качество, — не перенесён');
  -- после переноса сторож модулей пропускает прежнюю ссылку от устройства, а мост 054 и права не задеты: зеркало ничего не меняет
  perform quality.mirror_place_plan(d.location_id);
  res := res || pg_temp.t((select count(*) from quality.construction_floors_v2 where core_company_id = c and "locationId" = 'n548-n-b1s1f1'
                            and pdf_url like '%/plan_1.pdf') >= 1, 'зеркало после переноса: ссылка та же');
  res := res || pg_temp.t(exists (select 1 from core.audit_log where table_name = 'place_documents' and action = 'TRANSFER'), 'журнал: перенос записан');
  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
