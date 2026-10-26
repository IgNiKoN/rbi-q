-- Откат P2-0004 этапа 1. Удаляет ТОЛЬКО объекты planfact и public.pf_*.
drop function if exists public.pf_add_work(uuid, text, text, numeric);
drop function if exists public.pf_list_works(uuid);
drop function if exists public.pf_my_projects();
drop schema if exists planfact cascade;
