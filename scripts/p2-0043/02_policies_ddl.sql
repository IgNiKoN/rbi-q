-- P2-0043: текст правил storage.objects как команды create policy (ТОЛЬКО ЧТЕНИЕ) — для модели PGlite.
select string_agg(format('create policy %I on storage.objects as %s for %s to %s%s%s;', policyname, permissive, cmd,
         (select string_agg(case when r = 'public' then 'public' else quote_ident(r) end, ', ') from unnest(roles) r),
         case when qual is not null then ' using (' || qual || ')' else '' end,
         case when with_check is not null then ' with check (' || with_check || ')' else '' end), E'\n' order by policyname) as ddl
  from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname not like 'quality\_files\_%';
