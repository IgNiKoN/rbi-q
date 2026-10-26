-- P2-0043: ТОЛЬКО ДЛЯ PGlite. Правила storage.objects старых бакетов РБИ — дословно с сервера (scripts/p2-0043/02_policies_ddl.sql,
-- 26.10.2026; имена функций и таблиц дописаны схемой: uid → auth.uid, role → auth.role, rbi_* → public.rbi_*) и по файлу в старых бакетах.
-- Запуск: модель 040d + 041_close_public_anon.seed.pglite.sql + 041 up, затем этот файл.
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname not like 'quality\_files\_%' loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;
create policy "Allow all for anon on custom-assets" on storage.objects as PERMISSIVE for ALL to anon using ((bucket_id = 'custom-assets'::text)) with check ((bucket_id = 'custom-assets'::text));
create policy "Allow all for anon on inspection-photos" on storage.objects as PERMISSIVE for ALL to anon using ((bucket_id = 'inspection-photos'::text)) with check ((bucket_id = 'inspection-photos'::text));
create policy "Allow all for anon on library-checklists" on storage.objects as PERMISSIVE for ALL to anon using ((bucket_id = 'library-checklists'::text)) with check ((bucket_id = 'library-checklists'::text));
create policy "Allow all for anon on library-docs" on storage.objects as PERMISSIVE for ALL to anon using ((bucket_id = 'library-docs'::text)) with check ((bucket_id = 'library-docs'::text));
create policy "Allow all for anon on library-etalons" on storage.objects as PERMISSIVE for ALL to anon using ((bucket_id = 'library-etalons'::text)) with check ((bucket_id = 'library-etalons'::text));
create policy "Allow all for anon on library-nodes" on storage.objects as PERMISSIVE for ALL to anon using ((bucket_id = 'library-nodes'::text)) with check ((bucket_id = 'library-nodes'::text));
create policy "Allow all for anon on library-practices" on storage.objects as PERMISSIVE for ALL to anon using ((bucket_id = 'library-practices'::text)) with check ((bucket_id = 'library-practices'::text));
create policy "Allow all for anon on library-twi" on storage.objects as PERMISSIVE for ALL to anon using ((bucket_id = 'library-twi'::text)) with check ((bucket_id = 'library-twi'::text));
create policy "Allow all for anon on twi-pdfs" on storage.objects as PERMISSIVE for ALL to anon using ((bucket_id = 'twi-pdfs'::text)) with check ((bucket_id = 'twi-pdfs'::text));
create policy "Public Delete Access Plans" on storage.objects as PERMISSIVE for DELETE to public using ((bucket_id = 'construction-plans'::text));
create policy "Public Insert Access Plans" on storage.objects as PERMISSIVE for INSERT to public with check ((bucket_id = 'construction-plans'::text));
create policy "Public Read Access Plans" on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'construction-plans'::text));
create policy "Public Update Access Plans" on storage.objects as PERMISSIVE for UPDATE to public using ((bucket_id = 'construction-plans'::text));
create policy "construction-defects_delete_anon" on storage.objects as PERMISSIVE for DELETE to anon, authenticated using ((bucket_id = 'construction-defects'::text));
create policy "construction-defects_insert_anon" on storage.objects as PERMISSIVE for INSERT to anon, authenticated with check ((bucket_id = 'construction-defects'::text));
create policy "construction-defects_select_anon" on storage.objects as PERMISSIVE for SELECT to anon, authenticated using ((bucket_id = 'construction-defects'::text));
create policy "construction-defects_update_anon" on storage.objects as PERMISSIVE for UPDATE to anon, authenticated using ((bucket_id = 'construction-defects'::text)) with check ((bucket_id = 'construction-defects'::text));
create policy rbi_admin_storage_access on storage.objects as PERMISSIVE for ALL to authenticated using ((public.rbi_current_role() = ANY (ARRAY['manager'::text, 'deputy_manager'::text])));
create policy storage_insert_authenticated_transition on storage.objects as PERMISSIVE for INSERT to public with check (((bucket_id = ANY (ARRAY['custom-assets'::text, 'inspection-photos'::text, 'library-checklists'::text, 'library-docs'::text, 'library-etalons'::text, 'library-nodes'::text, 'library-practices'::text, 'library-twi'::text, 'reports'::text, 'twi-pdfs'::text])) AND (auth.role() = 'authenticated'::text)));
create policy storage_insert_transition on storage.objects as PERMISSIVE for INSERT to public with check (((bucket_id = ANY (ARRAY['custom-assets'::text, 'inspection-photos'::text, 'library-checklists'::text, 'library-docs'::text, 'library-etalons'::text, 'library-nodes'::text, 'library-practices'::text, 'library-twi'::text, 'reports'::text, 'twi-pdfs'::text])) AND ((EXISTS ( SELECT 1
   FROM public.rbi_engineer_profiles p
  WHERE ((p.auth_user_id = auth.uid()) AND (p.cloud_status = 'approved'::text) AND ((p.project_code = split_part(objects.name, '/'::text, 1)) OR (split_part(objects.name, '/'::text, 1) = ANY (COALESCE(p.assigned_projects, ARRAY[]::text[]))))))) OR (auth.role() = 'authenticated'::text))));
create policy storage_select_transition on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = ANY (ARRAY['custom-assets'::text, 'inspection-photos'::text, 'library-checklists'::text, 'library-docs'::text, 'library-etalons'::text, 'library-nodes'::text, 'library-practices'::text, 'library-twi'::text, 'reports'::text, 'twi-pdfs'::text])));
create policy storage_update_authenticated_transition on storage.objects as PERMISSIVE for UPDATE to public using (((bucket_id = ANY (ARRAY['custom-assets'::text, 'inspection-photos'::text, 'library-checklists'::text, 'library-docs'::text, 'library-etalons'::text, 'library-nodes'::text, 'library-practices'::text, 'library-twi'::text, 'reports'::text, 'twi-pdfs'::text])) AND (auth.role() = 'authenticated'::text))) with check (((bucket_id = ANY (ARRAY['custom-assets'::text, 'inspection-photos'::text, 'library-checklists'::text, 'library-docs'::text, 'library-etalons'::text, 'library-nodes'::text, 'library-practices'::text, 'library-twi'::text, 'reports'::text, 'twi-pdfs'::text])) AND (auth.role() = 'authenticated'::text)));
create policy storage_update_transition on storage.objects as PERMISSIVE for UPDATE to public using (((bucket_id = ANY (ARRAY['custom-assets'::text, 'inspection-photos'::text, 'library-checklists'::text, 'library-docs'::text, 'library-etalons'::text, 'library-nodes'::text, 'library-practices'::text, 'library-twi'::text, 'reports'::text, 'twi-pdfs'::text])) AND ((EXISTS ( SELECT 1
   FROM public.rbi_engineer_profiles p
  WHERE ((p.auth_user_id = auth.uid()) AND (p.cloud_status = 'approved'::text) AND ((p.project_code = split_part(objects.name, '/'::text, 1)) OR (split_part(objects.name, '/'::text, 1) = ANY (COALESCE(p.assigned_projects, ARRAY[]::text[]))))))) OR (auth.role() = 'authenticated'::text)))) with check (((bucket_id = ANY (ARRAY['custom-assets'::text, 'inspection-photos'::text, 'library-checklists'::text, 'library-docs'::text, 'library-etalons'::text, 'library-nodes'::text, 'library-practices'::text, 'library-twi'::text, 'reports'::text, 'twi-pdfs'::text])) AND ((EXISTS ( SELECT 1
   FROM public.rbi_engineer_profiles p
  WHERE ((p.auth_user_id = auth.uid()) AND (p.cloud_status = 'approved'::text) AND ((p.project_code = split_part(objects.name, '/'::text, 1)) OR (split_part(objects.name, '/'::text, 1) = ANY (COALESCE(p.assigned_projects, ARRAY[]::text[]))))))) OR (auth.role() = 'authenticated'::text))));
create policy "temp reports storage authenticated delete" on storage.objects as PERMISSIVE for DELETE to authenticated using ((bucket_id = 'reports'::text));
create policy "temp reports storage authenticated insert" on storage.objects as PERMISSIVE for INSERT to authenticated with check ((bucket_id = 'reports'::text));
create policy "temp reports storage authenticated update" on storage.objects as PERMISSIVE for UPDATE to authenticated using ((bucket_id = 'reports'::text)) with check ((bucket_id = 'reports'::text));
create policy "temp reports storage public delete emergency" on storage.objects as PERMISSIVE for DELETE to public using ((bucket_id = 'reports'::text));
create policy "temp reports storage public insert emergency" on storage.objects as PERMISSIVE for INSERT to public with check ((bucket_id = 'reports'::text));
create policy "temp reports storage public read" on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'reports'::text));
create policy "temp reports storage public update emergency" on storage.objects as PERMISSIVE for UPDATE to public using ((bucket_id = 'reports'::text)) with check ((bucket_id = 'reports'::text));
insert into storage.objects(bucket_id, name) values
  ('inspection-photos', 'RBI/old-photo.jpg'), ('reports', 'old-report.pdf'), ('construction-plans', 'RBI/plan.pdf'), ('library-twi', 'RBI/twi.pdf');
