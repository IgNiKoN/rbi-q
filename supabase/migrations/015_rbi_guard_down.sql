-- Откат P2-0014 (015): удаляет только добавленные триггер и функцию. Профили, созданные после 015, остаются как есть.
drop trigger if exists trg_p2_rbi_profile_insert_guard on public.rbi_engineer_profiles;
drop function if exists planfact.rbi_profile_insert_guard();
