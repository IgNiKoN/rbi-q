-- P2-0014: после 015 — следов теста нет, профили не изменились (ТОЛЬКО ЧТЕНИЕ).
select (select count(*) from public.rbi_engineer_profiles where inspector_id like 'p2-0014-%') as test_profiles,
 (select count(*) from auth.users where email like '%@p2-0014.invalid') as test_users,
 (select count(*) from public.rbi_engineer_profiles) as profiles,
 (select count(*) from public.rbi_engineer_profiles where cloud_status = 'approved') as approved,
 (select count(*) from pg_trigger where tgname = 'trg_p2_rbi_profile_insert_guard') as guard;
