-- P2-0016: откат 018d_quality_storage_up.sql. Удаляет пустые бакеты quality-*, политики quality_files_*,
-- функции has_actions/storage_can; quality.can — как в 018. Применять до 018c_quality_access_down.sql.
-- P2-0018 (ТД №117, №121): файлы SQL-ом не удаляются — если в бакетах quality-* есть файлы, откат останавливается:
-- сначала очистить бакеты через Storage API или панель (docs/SERVERS.md «Откат файлов Качества»).
begin;

do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'counterparties_to_quality' and tgrelid = 'core.counterparties'::regclass) then
    raise exception 'Сначала откатите 018e: 018e_quality_contractors_down.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from storage.objects where bucket_id like 'quality-%') then
    raise exception 'В бакетах quality-* есть файлы (%): сначала очистите их через Storage API или панель (docs/SERVERS.md «Откат файлов Качества»)',
      (select count(*) from storage.objects where bucket_id like 'quality-%') using errcode = 'P0001';
  end if;
end $$;

drop policy if exists quality_files_select on storage.objects;
drop policy if exists quality_files_insert on storage.objects;
drop policy if exists quality_files_update on storage.objects;
drop policy if exists quality_files_delete on storage.objects;
drop policy if exists quality_files_guard_select on storage.objects;
drop policy if exists quality_files_guard_insert on storage.objects;
drop policy if exists quality_files_guard_update on storage.objects;
drop policy if exists quality_files_guard_delete on storage.objects;
delete from storage.buckets where id like 'quality-%';

create or replace function quality.can(p_company uuid, p_project uuid, p_actions text[])
returns boolean language sql stable security definer set search_path = pg_catalog, core, planfact as $$
  select p_company is not null and p_company = quality.request_company() and exists (
    select 1 from unnest(p_actions) act
    join core.permission_catalog pc on pc.action = act
    join core.company_modules cm on cm.company_id = p_company and cm.module = split_part(act, '.', 1) and cm.enabled
    where planfact.is_platform_admin() or exists (
      select 1 from core.role_assignments a
      join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = act
      where a.company_id = p_company and a.user_id = auth.uid()
        and (p_project is null or a.project_id is null or a.project_id = p_project)
        and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())));
$$;
revoke all on function quality.can(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function quality.can(uuid, uuid, text[]) to authenticated;
drop function if exists quality.storage_can(text, text, boolean);
drop function if exists quality.has_actions(uuid, uuid, text[]);

commit;
