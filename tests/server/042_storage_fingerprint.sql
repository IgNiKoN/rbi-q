-- P2-0043: отпечаток Storage (ТОЛЬКО ЧТЕНИЕ) для проверки «откат 042 побайтно»: до 042 и после up → down строки совпадают.
select 'buckets' as k, md5(string_agg(id || '|' || public, ',' order by id)) as v, count(*) as n from storage.buckets
union all
select 'storage_policies', md5(string_agg(concat_ws('|', tablename, policyname, permissive, roles::text, cmd, qual, with_check), E'\n'
                                          order by tablename, policyname)), count(*)
  from pg_policies where schemaname = 'storage'
union all
select 'objects', md5(string_agg(bucket_id || '/' || name, ',' order by bucket_id, name)), count(*) from storage.objects
union all
select 'profiles_acl', md5(coalesce(relacl::text, '')), 1 from pg_class where oid = 'public.rbi_engineer_profiles'::regclass;
