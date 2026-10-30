-- P2-0076 (056), часть 1 из 2 — засев ДО миграции: старые замечания внешнего СК. Запуск — на схеме 054
-- (run-pglite.mjs --upto 054 --then 056_sk_core_ids.seed.pglite.sql --then 056_sk_core_ids_up.sql 056_sk_core_ids_backfill.check.sql).
-- Помечено «056т». Компания А: ЖК-1 (корпуса «Корпус 2» — 2 секции × 6 этажей и «Корпус 3»), контрагент «ООО Ромашка 056т», вид
-- работ «Кладочные работы»; замечания: фирма в двух написаниях, категория в другом регистре, «Без категории», место «Корпус 2,
-- секция 1, этаж 5», путь «ЖК / Корпус 2 / Секция 2 / 3», этаж которого нет (99), нераспознаваемое место, удалённое замечание.
-- Компания Б — те же названия контрагента и вида работ (свои записи ядра). Время правки — 01.01.2026.
create or replace function pg_temp.as_user(u uuid, company uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', case when company is null then '{}' else json_build_object('x-company-id', company)::text end, true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create or replace function pg_temp.sk(c uuid, p uuid, num text, craw text, cat text, path text, rname text, blk text, fl text, del boolean default false)
returns void language sql as $f$
  insert into quality.sk_records (id, project_code, sk_number, sk_unique_key, contractor_raw, contractor_name, category, project_raw_path,
                                  project_loc, project_raw_name, project_block, project_floor, is_deleted, core_company_id, updated_at)
  values ('sk_' || p || '_' || num, p::text, num, p || '_' || num, craw, craw, cat, path, path, rname, blk, fl, del, c, '2026-01-01T00:00:00Z');
$f$;

do $$
declare
  ca constant uuid := '00000000-0000-4000-8000-0000000076a1'; cb constant uuid := '00000000-0000-4000-8000-0000000076b1';
  p1 constant uuid := '00000000-0000-4000-8000-0000000076c1'; pb constant uuid := '00000000-0000-4000-8000-0000000076c9';
  k2 constant uuid := '00000000-0000-4000-8000-0000000076d2'; k3 constant uuid := '00000000-0000-4000-8000-0000000076d3';
  kb constant uuid := '00000000-0000-4000-8000-0000000076d9';
  r uuid; u uuid; c uuid;
begin
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 056т', true), (cb, 'Бета 056т', true);
  insert into core.company_modules(company_id, module, enabled)
    select x, m, true from unnest(array[ca, cb]) x, unnest(array['quality', 'planfact']) m
    on conflict (company_id, module) do update set enabled = true;
  foreach c in array array[ca, cb] loop
    insert into core.company_roles(company_id, name) values (c, 'Админ 056т') returning id into r;
    insert into core.company_role_permissions(role_id, company_id, action) values (r, c, 'planfact.projects.manage');
    u := gen_random_uuid();
    insert into auth.users(id, email) values (u, u || '@test.invalid');
    insert into core.company_members(company_id, user_id) values (c, u) on conflict do nothing;
    insert into core.role_assignments(company_id, user_id, role_id) values (c, u, r);
    perform pg_temp.as_user(u, c);
    if c = ca then
      perform public.pf_save_project(ca, p1, '{"name": "ЖК-1 056т"}');
      perform public.pf_save_place(p1, k2, null, 'object', 'Корпус 2', 'building');
      perform public.pf_fill_object(k2, 2, 6, 1);
      perform public.pf_save_place(p1, k3, null, 'object', 'Корпус 3', 'building');
      perform public.pf_fill_object(k3, 1, 3, 1);
    else
      perform public.pf_save_project(cb, pb, '{"name": "ЖК-Б 056т"}');
      perform public.pf_save_place(pb, kb, null, 'object', 'Корпус 2', 'building');
      perform public.pf_fill_object(kb, 1, 6, 1);
    end if;
    reset role;
  end loop;
  insert into core.counterparties(id, company_id, name, inn, kinds) values
    ('00000000-0000-4000-8000-0000000076e1', ca, 'ООО Ромашка 056т', '7700000761', array['contractor']),
    ('00000000-0000-4000-8000-0000000076e9', cb, 'ООО Ромашка 056т', '7700000769', array['contractor']);
  insert into core.work_types(id, company_id, name, canon_name) values
    ('00000000-0000-4000-8000-0000000076f1', ca, 'Кладочные работы', planfact.canon_name('Кладочные работы')),
    ('00000000-0000-4000-8000-0000000076f9', cb, 'Кладочные работы', planfact.canon_name('Кладочные работы'));

  perform pg_temp.sk(ca, p1, '1', 'ООО Ромашка 056т', 'Кладочные работы', 'Корпус 2, секция 1, этаж 5', 'Корпус 2, секция 1, этаж 5', 'Общее', '');
  perform pg_temp.sk(ca, p1, '2', 'Ромашка (ООО) 056т', 'Непонятная 056т', 'ЖК-1 056т/Корпус 2/Секция 2/3', 'Корпус 2', 'Секция 2', '3');
  perform pg_temp.sk(ca, p1, '3', 'Ромашка (ООО) 056т', 'Без категории', 'Корпус 2/Секция 1/99', 'Корпус 2', 'Секция 1', '99');
  perform pg_temp.sk(ca, p1, '4', 'ИП Неизвестный 056т', 'кладочные  работы', 'Склад у забора 056т', 'Склад у забора 056т', 'Общее', '');
  perform pg_temp.sk(ca, p1, '5', 'Удалённая фирма 056т', 'Удалённая категория 056т', 'Корпус 3', 'Корпус 3', 'Общее', '', true);
  perform pg_temp.sk(cb, pb, '1', 'ООО Ромашка 056т', 'Кладочные работы', 'Корпус 2, секция 1, этаж 2', 'Корпус 2, секция 1, этаж 2', 'Общее', '');
end $$;
