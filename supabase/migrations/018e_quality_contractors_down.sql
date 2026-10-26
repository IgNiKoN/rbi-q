-- P2-0016: откат 018e_quality_contractors_up.sql. Строки справочника Качества, созданные из ядра, остаются (данные компании);
-- черновики контрагентов без ИНН удаляются (их нельзя вернуть в схему «ИНН обязателен»). Применять до 018d_quality_storage_down.sql.
-- P2-0018 (ТД №117): если черновик где-то указан (ссылка без каскада) — понятная ошибка до любых изменений.
begin;

do $$
declare r record; n bigint;
begin
  if to_regprocedure('quality.row_visible(uuid,uuid,text[],text,uuid,uuid,text,text)') is not null then
    raise exception 'Сначала откатите 020: 020_quality_scope_down.sql' using errcode = 'P0001';
  end if;
  for r in select c.conrelid::regclass::text tbl, a.attname col from pg_constraint c
             cross join lateral unnest(c.conkey, c.confkey) k(src, dst)
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.src
             join pg_attribute b on b.attrelid = c.confrelid and b.attnum = k.dst and b.attname = 'id'
            where c.contype = 'f' and c.confrelid = 'core.counterparties'::regclass and c.confdeltype in ('a', 'r') loop
    execute format('select count(*) from %s t join core.counterparties cp on cp.id = t.%I where cp.draft and cp.inn is null', r.tbl, r.col) into n;
    if n > 0 then
      raise exception 'Черновик контрагента без ИНН указан в % (% шт.): дозаполните ИНН в «Контрагентах» или уберите ссылку, затем повторите откат', r.tbl, n
        using errcode = 'P0001';
    end if;
  end loop;
end $$;

drop trigger if exists contractor_directory_to_core on quality.contractor_directory;
drop trigger if exists projects_to_quality on core.projects;
drop trigger if exists counterparties_to_quality on core.counterparties;
drop function if exists quality.on_directory_insert();
drop function if exists quality.on_project_insert();
drop function if exists quality.on_counterparty_change();
drop function if exists quality.push_contractor(core.counterparties);
drop table if exists quality.contractor_core_links;
drop function if exists quality.contractor_key(text);

delete from core.counterparties where draft and inn is null;
drop trigger if exists counterparties_undraft on core.counterparties;
drop function if exists core.counterparty_undraft();
drop index if exists core.counterparties_company_draft_name_uidx;
alter table core.counterparties drop constraint if exists counterparties_inn_check;
alter table core.counterparties add constraint counterparties_inn_check check (inn ~ '^([0-9]{10}|[0-9]{12})$');
alter table core.counterparties alter column inn set not null;
alter table core.counterparties drop column if exists draft;

drop function if exists public.pf_counterparties_list(uuid, boolean);
create function public.pf_counterparties_list(p_company uuid, p_include_archived boolean default false)
returns table(id uuid, name text, inn text, kpp text, kinds text[], requisites jsonb, archived_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
begin
  if p_company is null or auth.uid() is null
     or not (planfact.is_company_member(p_company) or planfact.has_company_permission(p_company, 'core.counterparties.manage')) then
    raise exception 'Нет доступа к компании' using errcode = '42501';
  end if;
  return query
  select c.id, c.name, c.inn, c.kpp, c.kinds, c.requisites, c.archived_at, c.updated_at
  from core.counterparties c
  where c.company_id = p_company and c.deleted_at is null and (p_include_archived or c.archived_at is null)
  order by (c.archived_at is not null), lower(c.name), c.inn;
end $$;
revoke all on function public.pf_counterparties_list(uuid, boolean) from public, anon;
grant execute on function public.pf_counterparties_list(uuid, boolean) to authenticated;

commit;
