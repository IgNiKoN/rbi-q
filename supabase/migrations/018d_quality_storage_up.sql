-- P2-0016 этап 5 (ADR-068 п.5, CRITICAL — Storage). Файлы Качества и Стройконтроля по компаниям: 11 закрытых бакетов
-- quality-<бакет РБИ>; путь файла начинается с id компании ядра (<company_id>/…). Правила storage.objects: читать — участник
-- компании с правом просмотра модуля, писать/менять/удалять — с правом записи; anon — ничего. Бакеты и политики РБИ не меняются
-- (политики этого файла — только с префиксом quality_ и только для бакетов quality-*). Применять после 018c, одним запросом.
-- Откат — 018d_quality_storage_down.sql (удаляет бакеты quality-* вместе с файлами).
begin;

-- 1. Право без заголовка компании (компания — из пути файла): то же правило, что quality.can; quality.can = заголовок + это правило.
create or replace function quality.has_actions(p_company uuid, p_project uuid, p_actions text[])
returns boolean language sql stable security definer set search_path = pg_catalog, core, planfact as $$
  select p_company is not null and auth.uid() is not null and exists (
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
create or replace function quality.can(p_company uuid, p_project uuid, p_actions text[])
returns boolean language sql stable security definer set search_path = pg_catalog, core, planfact as $$
  select p_company is not null and p_company = quality.request_company() and quality.has_actions(p_company, p_project, p_actions);
$$;

-- 2. Бакеты компаний (закрытые)
insert into storage.buckets(id, name, public)
select 'quality-' || b, 'quality-' || b, false
from unnest(array['construction-defects', 'construction-plans', 'custom-assets', 'inspection-photos', 'library-checklists',
                  'library-docs', 'library-etalons', 'library-nodes', 'library-practices', 'library-twi', 'reports']) b
on conflict (id) do nothing;

-- 3. Доступ к файлу: компания — первая папка пути; модуль — по бакету.
create or replace function quality.storage_can(p_bucket text, p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core, planfact as $$
declare
  v_company text := split_part(coalesce(p_name, ''), '/', 1);
  v_mods text[];
begin
  if p_bucket is null or p_bucket not like 'quality-%' then return false; end if;
  if v_company !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  v_mods := case when p_bucket like 'quality-construction-%' then array['construction']
                 when p_bucket = 'quality-custom-assets' then array['quality', 'construction']
                 else array['quality'] end;
  return quality.has_actions(v_company::uuid, null,
    (select array_agg(m || case when p_write then '.edit' else '.view' end) from unnest(v_mods) m));
end $$;

drop policy if exists quality_files_select on storage.objects;
drop policy if exists quality_files_insert on storage.objects;
drop policy if exists quality_files_update on storage.objects;
drop policy if exists quality_files_delete on storage.objects;
create policy quality_files_select on storage.objects for select to authenticated
  using (bucket_id like 'quality-%' and quality.storage_can(bucket_id, name, false));
create policy quality_files_insert on storage.objects for insert to authenticated
  with check (bucket_id like 'quality-%' and quality.storage_can(bucket_id, name, true));
create policy quality_files_update on storage.objects for update to authenticated
  using (bucket_id like 'quality-%' and quality.storage_can(bucket_id, name, true))
  with check (bucket_id like 'quality-%' and quality.storage_can(bucket_id, name, true));
create policy quality_files_delete on storage.objects for delete to authenticated
  using (bucket_id like 'quality-%' and quality.storage_can(bucket_id, name, true));

-- 4. Ограничивающие (restrictive) правила: на сервере у РБИ есть разрешающая политика без ограничения по бакету
-- (rbi_admin_storage_access — руководитель/заместитель РБИ ко всем бакетам); разрешающие складываются через «или», поэтому
-- для бакетов quality-* дополнительно требуется право компании (через «и»). Бакеты РБИ — case ... else true: без изменений.
drop policy if exists quality_files_guard_select on storage.objects;
drop policy if exists quality_files_guard_insert on storage.objects;
drop policy if exists quality_files_guard_update on storage.objects;
drop policy if exists quality_files_guard_delete on storage.objects;
create policy quality_files_guard_select on storage.objects as restrictive for select to authenticated
  using (case when bucket_id like 'quality-%' then quality.storage_can(bucket_id, name, false) else true end);
create policy quality_files_guard_insert on storage.objects as restrictive for insert to authenticated
  with check (case when bucket_id like 'quality-%' then quality.storage_can(bucket_id, name, true) else true end);
create policy quality_files_guard_update on storage.objects as restrictive for update to authenticated
  using (case when bucket_id like 'quality-%' then quality.storage_can(bucket_id, name, true) else true end)
  with check (case when bucket_id like 'quality-%' then quality.storage_can(bucket_id, name, true) else true end);
create policy quality_files_guard_delete on storage.objects as restrictive for delete to authenticated
  using (case when bucket_id like 'quality-%' then quality.storage_can(bucket_id, name, true) else true end);

revoke all on function quality.has_actions(uuid, uuid, text[]), quality.storage_can(text, text, boolean) from public, anon, authenticated;
grant execute on function quality.has_actions(uuid, uuid, text[]), quality.storage_can(text, text, boolean) to authenticated;
revoke all on function quality.can(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function quality.can(uuid, uuid, text[]) to authenticated;

commit;
