-- P2-0054: репетиция перевода (засев 048_core_places.seed.pglite.sql → 048 → scripts/p2-0054/03_switch.sql для «Снимок 048»).
-- После перевода: проекты компании ведёт ядро; правка мест RBI в Качестве — отказ, синонимы — можно; место в «Компании»
-- заводится под старым корпусом RBI и появляется в Качестве под его узлом (id узлов RBI не менялись); правка названия
-- в «Компании» — в узле RBI; замечания и приёмки — с прежним проектом; новое замечание по месту — с проектом.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N».
create or replace function pg_temp.as_user(u uuid, company uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', json_build_object('x-company-id', company)::text, true);
  execute 'set local role authenticated';
end $f$;
create or replace function pg_temp.msg(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ' ' || sqlerrm; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;

do $$
declare
  c uuid := '00000000-0000-4000-8000-000000548100'; uadm uuid := '00000000-0000-4000-8000-000000548001';
  north uuid; b1 uuid; s1 uuid; newf uuid := gen_random_uuid(); res text := ''; str text;
begin
  select id into north from core.projects where company_id = c and name = 'ЖК Север';
  select core_location_id into b1 from quality.location_nodes where core_company_id = c and id = 'n548-n-b1';
  select core_location_id into s1 from quality.location_nodes where core_company_id = c and id = 'n548-n-b1s1';
  res := res || pg_temp.t((select bool_and(places_master = 'core') from core.projects where company_id = c and not quality_container),
                          'все проекты компании — ведёт ядро');
  res := res || pg_temp.t(not quality.places_led_by_quality(north), 'правило 044 для ЖК Север выключено');
  res := res || pg_temp.t((select count(*) from p2_backup.p2_0054_switch where company_id = c and rolled_back_at is null) = 2,
                          'копия признака: 2 проекта (ЖК Север, ЖК Юг)');

  -- Качество: структура — отказ, синонимы — можно
  perform pg_temp.as_user(uadm, c);
  str := pg_temp.msg($q$update quality.location_nodes set "displayName" = 'Взлом' where id = 'n548-n-b1s1f1a1'$q$);
  res := res || pg_temp.t(str like '42501 Места ведутся в «Компания → Объекты и места»%', 'Качество: переименовать место RBI — отказ (' || str || ')');
  str := pg_temp.msg($q$insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key) values ('n548-hack', 'n548-n-b1s1', 'floor', 'Этаж 9', '')$q$);
  res := res || pg_temp.t(str like '42501 Места ведутся%', 'Качество: добавить этаж RBI — отказ');
  str := pg_temp.msg($q$update quality.location_nodes set synonyms = '["корпус один"]' where id = 'n548-n-b1'$q$);
  res := res || pg_temp.t(str = 'OK', 'Качество: синонимы — можно (' || str || ')');

  -- «Компания»: этаж в старой секции RBI → узел Качества под узлом RBI; переименование — в узле RBI
  str := pg_temp.msg(format($q$select public.pf_save_place(%L, %L, %L, 'floor', 'Этаж 4')$q$, north, newf, s1));
  res := res || pg_temp.t(str = 'OK', 'Компания: этаж в секции RBI заводится (' || str || ')');
  str := pg_temp.msg(format($q$select public.pf_save_place(%L, %L, null, null, 'Корпус 1 (новое имя)')$q$, north, b1));
  res := res || pg_temp.t(str = 'OK', 'Компания: переименовать корпус RBI (' || str || ')');
  reset role;
  res := res || pg_temp.t((select "parentId" = 'n548-n-b1s1' and id = newf::text and not is_deleted from quality.location_nodes where core_location_id = newf),
                          'новый этаж — в Качестве под секцией RBI');
  res := res || pg_temp.t((select "displayName" from quality.location_nodes where core_company_id = c and id = 'n548-n-b1') = 'Корпус 1 (новое имя)',
                          'новое имя корпуса — в узле RBI (id прежний)');
  res := res || pg_temp.t((select count(*) from core.locations where project_id = north and name = 'Корпус 1 (новое имя)') = 1,
                          'петли нет: одно место с новым именем');

  -- Замечания: прежние — с проектом; новое по старому месту — с проектом
  res := res || pg_temp.t((select core_project_id from quality.construction_defects_v2 where id = 'd548-1') = north, 'замечание RBI — проект прежний');
  insert into quality.construction_defects_v2(id, "locationId", status, core_company_id) values ('d548-new', 'n548-n-b2s1f1a1', 'issued', c);
  res := res || pg_temp.t((select core_project_id from quality.construction_defects_v2 where id = 'd548-new') = north, 'новое замечание по месту RBI — проект проставлен');

  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
