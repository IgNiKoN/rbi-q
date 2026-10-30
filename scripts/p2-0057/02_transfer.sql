-- P2-0057 этап 4: перенос существующих PDF-планов этажей и квартир в документы ядра (core.place_documents, после 055).
-- Что переносится: план этажа (quality.construction_floors_v2) и квартиры (quality.construction_units_v2) с pdf_url, если место —
-- этаж / квартира проекта, где места ведёт ядро (places_master = 'core'), и у места ещё нет документа-плана. Документ — версия 1,
-- текущая; файл НЕ копируется: ссылка — та же, что в модулях (прежний закрытый бакет quality-*), поэтому ссылки в Качестве и
-- СК не меняются и открывают тот же файл. Несколько строк плана на одно место — берётся последняя изменённая (остальные — в
-- отчёте). Проекты, где места ведёт Качество, не трогаются (после перевода 03_switch P2-0054 скрипт можно запустить снова).
-- Повтор безопасен (уже перенесённое пропускается). Компания — p2_0057.company (по умолчанию RBI). Копия «что создано» —
-- p2_backup.p2_0057_transfer (для отката 04_rollback.sql). Перед запуском — 03_snapshot.sql («до»), после — снова («после»).
begin;
do $$
declare
  v_name text := coalesce(nullif(current_setting('p2_0057.company', true), ''), 'RBI');
  v_company uuid; v_new int; v_dup int; v_quality int; v_noplace int; v_mismatch int;
begin
  if to_regclass('core.place_documents') is null then raise exception 'Сначала 055_place_plans_up.sql' using errcode = 'P0001'; end if;
  select id into v_company from core.companies where name = v_name;
  if v_company is null then raise exception 'Компания «%» не найдена', v_name using errcode = 'P0001'; end if;
  if (select count(*) from core.companies where name = v_name) > 1 then raise exception 'Компаний «%» несколько', v_name using errcode = 'P0001'; end if;
  create schema if not exists p2_backup;
  revoke all on schema p2_backup from public, anon, authenticated;
  create table if not exists p2_backup.p2_0057_transfer (doc_id uuid primary key, company_id uuid not null, source_table text not null,
    source_id text not null, location_id uuid not null, transferred_at timestamptz not null default now(), rolled_back_at timestamptz);
  revoke all on p2_backup.p2_0057_transfer from public, anon, authenticated;

  create temp table p57_src on commit drop as
  select x.*, l.id as place_id, l.project_id, l.node_type as place_type, pr.places_master,
         row_number() over (partition by l.id order by x.updated_at desc, x.row_id) as rn
    from (select 'construction_floors_v2' as tbl, 'floor' as lvl, f.id as row_id, f.core_company_id, f."locationId" as node_id, f.pdf_url, f.pdf_name,
                 f.pdf_size, f.created_at, f.updated_at
            from quality.construction_floors_v2 f where f.core_company_id = v_company and not f.is_deleted and coalesce(f.pdf_url, '') <> ''
          union all
          select 'construction_units_v2', 'apartment', u.id, u.core_company_id, u."locationId", u.pdf_url, u.pdf_name, u.pdf_size, u.created_at, u.updated_at
            from quality.construction_units_v2 u where u.core_company_id = v_company and not u.is_deleted and coalesce(u.pdf_url, '') <> '') x
    left join quality.location_nodes n on n.core_company_id = x.core_company_id and n.id = x.node_id
    left join core.locations l on l.id = n.core_location_id and l.deleted_at is null
    left join core.projects pr on pr.id = l.project_id;

  select count(*) filter (where place_id is null), count(*) filter (where places_master = 'quality'),
         count(*) filter (where place_id is not null and place_type <> lvl), count(*) filter (where rn > 1 and places_master = 'core')
    into v_noplace, v_quality, v_mismatch, v_dup from p57_src;

  with pick as (
    select s.*, gen_random_uuid() as doc_id from p57_src s
     where s.rn = 1 and s.places_master = 'core' and s.place_type = s.lvl
       and not exists (select 1 from core.place_documents d where d.location_id = s.place_id and d.kind = 'plan')
  ), ins as (
    insert into core.place_documents (id, company_id, project_id, location_id, kind, version_no, is_current, file_bucket, file_path, file_url,
                                      file_name, file_size, created_by, created_at, updated_at)
    select doc_id, v_company, project_id, place_id, 'plan', 1, true,
           coalesce(substring(pdf_url from '/storage/v1/object/public/([^/]+)/'), 'ссылка'),
           coalesce(substring(pdf_url from '/storage/v1/object/public/[^/]+/(.*)$'), pdf_url), pdf_url,
           left(coalesce(nullif(btrim(pdf_name), ''), 'План.pdf'), 255),
           greatest(coalesce(nullif(regexp_replace(coalesce(pdf_size, ''), '\D', '', 'g'), '')::bigint, 1), 1), null, created_at, now()
      from pick returning id
  )
  insert into p2_backup.p2_0057_transfer (doc_id, company_id, source_table, source_id, location_id)
  select p.doc_id, v_company, p.tbl, p.row_id, p.place_id from pick p join ins on ins.id = p.doc_id;
  get diagnostics v_new = row_count;
  perform planfact.log_admin_change(v_company, null, 'place_documents', gen_random_uuid(), 'TRANSFER', null,
    jsonb_build_object('created', v_new, 'duplicates', v_dup, 'quality_led', v_quality, 'no_place', v_noplace, 'type_mismatch', v_mismatch));
  raise notice 'P2-0057 перенос «%»: создано документов %; пропущено: дубли строк %, проекты Качества %, без места ядра %, вид места иной %',
    v_name, v_new, v_dup, v_quality, v_noplace, v_mismatch;
end $$;
commit;
