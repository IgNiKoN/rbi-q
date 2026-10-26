-- P2-0042: правила storage.objects и storage.buckets, которые обращаются к объектам public (ТОЛЬКО ЧТЕНИЕ).
select schemaname || '.' || tablename as tbl, policyname, permissive, roles::text, cmd,
       left(coalesce(qual, '-'), 300) as qual, left(coalesce(with_check, '-'), 300) as with_check
  from pg_policies where schemaname = 'storage'
 order by tablename, policyname;
