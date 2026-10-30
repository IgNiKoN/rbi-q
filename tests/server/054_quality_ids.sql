-- P2-0072 (054): сторож номеров Качества quality.core_ids_stamp / core_ids_children. Сценарии: вставка без core_id (старый
-- клиент) — заполнен; uuid-номер → core_id = id; повтор upsert (в том числе с core_id = excluded) — прежний core_id; сменить
-- core_id — отказ с текстом, пусто → прежний; uuid-номер и другой core_id — отказ; uuid-номер, занятый записью другой компании, —
-- новый core_id; копия записи с её core_id — свой номер; одинаковый текстовый номер в двух компаниях — разные core_id, связи не переходят между компаниями; пункт раньше
-- проверки и ребёнок места раньше родителя в одном пакете — связь дописана; смена ссылки — связь пересчитана; удаление родителя —
-- связь пуста, строка на месте; сбой дозаписи связи у охраняемого ребёнка не мешает записи родителя. Всё откатывается;
-- отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 054_quality_ids_up.sql.
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
-- строка с обязательными полями по умолчанию (сторожа таблицы — включены)
create or replace function pg_temp.ins(t text, v jsonb) returns void language plpgsql as $f$
declare c record; cols text; v_all jsonb := v;
begin
  for c in select column_name, data_type from information_schema.columns
            where table_schema = 'quality' and table_name = t and is_nullable = 'NO' and column_default is null and not (v ? column_name) loop
    v_all := v_all || jsonb_build_object(c.column_name, case
      when c.data_type in ('integer', 'bigint', 'numeric', 'smallint', 'double precision', 'real') then to_jsonb(0)
      when c.data_type = 'boolean' then to_jsonb(false)
      when c.data_type in ('jsonb', 'json') then '{}'::jsonb
      when c.data_type = 'uuid' and c.column_name <> 'core_id' then to_jsonb(gen_random_uuid())
      when c.data_type like 'timestamp%' then to_jsonb(now())
      else to_jsonb(''::text) end);
  end loop;
  v_all := v_all - (case when v ? 'core_id' then '' else 'core_id' end);
  -- запись объекта: project_code = проект ядра компании (quality.bind_company)
  if not (v ? 'project_code') and exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = t
                                            and column_name = 'project_code') then
    v_all := v_all || jsonb_build_object('project_code',
      (select id::text from core.projects where company_id = (v ->> 'core_company_id')::uuid order by id limit 1));
  end if;
  select string_agg(quote_ident(k), ', ') into cols from jsonb_object_keys(v_all) k;
  execute format('insert into quality.%I (%s) select %s from jsonb_populate_record(null::quality.%I, $1)', t, cols, cols, t) using v_all;
end $f$;
create or replace function pg_temp.cid(t text, c uuid, i text) returns uuid language plpgsql as $f$
declare r uuid; begin execute format('select core_id from quality.%I where core_company_id = $1 and id::text = $2', t) into r using c, i; return r; end $f$;

do $$
declare
  ca constant uuid := '00000000-0000-4000-8000-0000000072c1';
  cb constant uuid := '00000000-0000-4000-8000-0000000072d1';
  uu constant text := '72000000-0000-4000-8000-0000000000a1';
  ub constant text := '72000000-0000-4000-8000-0000000000b1';
  res text := ''; e text; a uuid; b uuid; n int;
begin
  insert into core.companies(id, name, is_test) values (ca, 'Альфа-m72t', true), (cb, 'Бета-m72t', true);
  insert into core.projects(id, company_id, name) values (gen_random_uuid(), ca, 'ЖК-m72t А'), (gen_random_uuid(), cb, 'ЖК-m72t Б');
  -- прямые вставки задач в тесте — на проект компании А (откатывается вместе с тестом)
  execute format('alter table quality.rbi_tasks alter column project_code set default %L', (select id::text from core.projects where company_id = ca));

  -- 1. вставка без core_id (старый клиент): текстовый номер → новый uuid; uuid-номер → он же
  perform pg_temp.ins('rbi_tasks', jsonb_build_object('core_company_id', ca, 'id', 'task_man_m72'));
  a := pg_temp.cid('rbi_tasks', ca, 'task_man_m72');
  res := res || pg_temp.t(a is not null, 'вставка без core_id — заполнен');
  perform pg_temp.ins('rbi_tasks', jsonb_build_object('core_company_id', ca, 'id', uu));
  res := res || pg_temp.t(pg_temp.cid('rbi_tasks', ca, uu) = uu::uuid, 'uuid-номер → core_id = id');
  perform pg_temp.ins('allowed_projects', jsonb_build_object('core_company_id', ca, 'code', 'P-m72'));
  res := res || pg_temp.t((select core_id from quality.allowed_projects where core_company_id = ca and code = 'P-m72') is not null,
                          'allowed_projects (ключ code) — core_id заполнен');

  -- 2. повтор upsert: core_id не передан / передан пустым (excluded) — прежний; правка проходит
  e := pg_temp.err(format($q$insert into quality.rbi_tasks (core_company_id, id, title) values (%L, 'task_man_m72', 'повтор')
         on conflict (core_company_id, id) do update set title = excluded.title, core_id = excluded.core_id$q$, ca));
  res := res || pg_temp.t(e = 'OK' and pg_temp.cid('rbi_tasks', ca, 'task_man_m72') = a, 'повтор upsert (core_id пуст) — прежний core_id — ' || e);
  e := pg_temp.err(format($q$insert into quality.rbi_tasks (core_company_id, id, title) values (%L, %L, 'повтор')
         on conflict (core_company_id, id) do update set title = excluded.title, core_id = excluded.core_id$q$, ca, uu));
  res := res || pg_temp.t(e = 'OK' and pg_temp.cid('rbi_tasks', ca, uu) = uu::uuid, 'повтор upsert uuid-записи — прежний core_id — ' || e);
  e := pg_temp.err(format($q$insert into quality.allowed_projects (core_company_id, code, name) values (%L, 'P-m72', 'повтор')
         on conflict (core_company_id, code) do update set name = excluded.name, core_id = excluded.core_id$q$, ca));
  res := res || pg_temp.t(e = 'OK', 'повтор upsert allowed_projects — ' || e);

  -- 3. core_id не меняется: другой — отказ с текстом; пусто — прежний
  e := pg_temp.err(format('update quality.rbi_tasks set core_id = gen_random_uuid() where core_company_id = %L and id = %L', ca, 'task_man_m72'));
  res := res || pg_temp.t(e like '22023: Номер записи менять нельзя%', 'сменить core_id — отказ с текстом — ' || e);
  e := pg_temp.err(format('update quality.rbi_tasks set core_id = null, title = %L where core_company_id = %L and id = %L', 'x', ca, 'task_man_m72'));
  res := res || pg_temp.t(e = 'OK' and pg_temp.cid('rbi_tasks', ca, 'task_man_m72') = a, 'core_id пусто при правке — прежний — ' || e);
  e := pg_temp.err(format($q$insert into quality.rbi_tasks (core_company_id, id, title, core_id) values (%L, 'task_man_m72', 'чужой', gen_random_uuid())
         on conflict (core_company_id, id) do update set title = excluded.title, core_id = excluded.core_id$q$, ca));
  res := res || pg_temp.t(e like '22023: Номер записи менять нельзя%', 'повтор upsert с другим core_id — отказ — ' || e);

  -- 4. uuid-номер и другой core_id — отказ; совпадающий — можно
  e := pg_temp.err(format('insert into quality.rbi_tasks (core_company_id, id, title, core_id) values (%L, %L, %L, gen_random_uuid())',
                          ca, '72000000-0000-4000-8000-0000000000a2', 't'));
  res := res || pg_temp.t(e like '22023: Номер записи (core_id %) не совпадает с её uuid-номером%', 'uuid-номер и другой core_id — отказ — ' || e);
  e := pg_temp.err(format('insert into quality.rbi_tasks (core_company_id, id, title, core_id) values (%L, %L, %L, %L)',
                          ca, '72000000-0000-4000-8000-0000000000a3', 't', '72000000-0000-4000-8000-0000000000a3'));
  res := res || pg_temp.t(e = 'OK', 'uuid-номер и тот же core_id — можно — ' || e);

  -- 5. изоляция: тот же uuid-номер в другой компании — новый core_id; одинаковый текстовый номер — разные core_id
  perform pg_temp.ins('rbi_tasks', jsonb_build_object('core_company_id', cb, 'id', uu));
  b := pg_temp.cid('rbi_tasks', cb, uu);
  res := res || pg_temp.t(b is not null and b <> uu::uuid, 'тот же uuid-номер в другой компании — новый core_id');
  perform pg_temp.ins('rbi_tasks', jsonb_build_object('core_company_id', cb, 'id', 'task_man_m72'));
  res := res || pg_temp.t(pg_temp.cid('rbi_tasks', cb, 'task_man_m72') <> a, 'одинаковый текстовый номер в двух компаниях — разные core_id');

  -- копия записи с её core_id (в другую компанию / «копировать» на телефоне) — новая запись получает свой номер
  e := pg_temp.err(format($q$insert into quality.rbi_tasks (core_company_id, project_code, id, title, core_id)
         select %L, (select id::text from core.projects where company_id = %L), 'task_copy_m72', title, core_id
           from quality.rbi_tasks where core_company_id = %L and id = 'task_man_m72'$q$, cb, cb, ca));
  res := res || pg_temp.t(e = 'OK' and pg_temp.cid('rbi_tasks', cb, 'task_copy_m72') is not null
                          and pg_temp.cid('rbi_tasks', cb, 'task_copy_m72') <> pg_temp.cid('rbi_tasks', ca, 'task_man_m72'),
                          'копия записи с занятым core_id — свой номер — ' || e);

  -- 6. проверка и пункты: пункт раньше проверки — связь дописана при записи проверки; ссылка в другую компанию — пусто
  perform pg_temp.ins('rbi_inspection_items', jsonb_build_object('core_company_id', ca, 'id', 'late_1', 'inspection_id', 'late'));
  res := res || pg_temp.t((select core_inspection_id from quality.rbi_inspection_items where core_company_id = ca and id = 'late_1') is null,
                          'пункт раньше проверки — связь пока пуста');
  perform pg_temp.ins('rbi_inspections', jsonb_build_object('core_company_id', ca, 'id', 'late'));
  a := pg_temp.cid('rbi_inspections', ca, 'late');
  res := res || pg_temp.t((select core_inspection_id from quality.rbi_inspection_items where core_company_id = ca and id = 'late_1') = a,
                          'проверка записана позже — связь пункта дописана');
  perform pg_temp.ins('rbi_inspections', jsonb_build_object('core_company_id', ca, 'id', uu));
  perform pg_temp.ins('rbi_inspection_photos', jsonb_build_object('core_company_id', ca, 'id', 'ph-uu', 'inspection_id', uu));
  res := res || pg_temp.t((select core_inspection_id from quality.rbi_inspection_photos where core_company_id = ca and id = 'ph-uu') = uu::uuid,
                          'фото новой проверки — связь = uuid проверки');
  perform pg_temp.ins('rbi_inspections', jsonb_build_object('core_company_id', cb, 'id', 'only-b'));
  perform pg_temp.ins('rbi_inspection_items', jsonb_build_object('core_company_id', ca, 'id', 'cx_1', 'inspection_id', 'only-b'));
  res := res || pg_temp.t((select core_inspection_id from quality.rbi_inspection_items where core_company_id = ca and id = 'cx_1') is null,
                          'ссылка на проверку другой компании — связь пуста');
  -- смена ссылки — пересчёт; удаление проверки — связь пуста, пункт на месте
  update quality.rbi_inspection_items set inspection_id = uu where core_company_id = ca and id = 'late_1';
  res := res || pg_temp.t((select core_inspection_id from quality.rbi_inspection_items where core_company_id = ca and id = 'late_1') = uu::uuid,
                          'смена ссылки — связь пересчитана');
  e := pg_temp.err(format('update quality.rbi_inspection_items set core_inspection_id = %L where core_company_id = %L and id = %L', a, ca, 'late_1'));
  res := res || pg_temp.t((select core_inspection_id from quality.rbi_inspection_items where core_company_id = ca and id = 'late_1') = uu::uuid,
                          'связь вручную не расходится с текстовой ссылкой — ' || e);
  delete from quality.rbi_inspections where core_company_id = ca and id = uu;
  res := res || pg_temp.t((select core_inspection_id from quality.rbi_inspection_items where core_company_id = ca and id = 'late_1') is null
                          and (select core_inspection_id from quality.rbi_inspection_photos where core_company_id = ca and id = 'ph-uu') is null,
                          'проверку удалили — связь пуста, пункт и фото на месте');

  -- 7. места одним пакетом: ребёнок раньше родителя — связь дописана
  execute format($q$insert into quality.location_nodes (core_company_id, id, "companyId", "nodeType", "parentId", "displayName", sort_order)
    values (%1$L, 'n-floor', '', 'floor', 'n-bld', 'Этаж', 1), (%1$L, 'n-bld', '', 'building', null, 'Корпус', 1)$q$, ca);
  res := res || pg_temp.t((select core_parent_id from quality.location_nodes where core_company_id = ca and id = 'n-floor')
                          = pg_temp.cid('location_nodes', ca, 'n-bld'), 'места в одном пакете (ребёнок первым) — связь дописана');

  -- 8. сбой дозаписи связи у охраняемого ребёнка не мешает записи родителя
  perform pg_temp.ins('construction_defects_v2', jsonb_build_object('core_company_id', ca, 'id', 'def-m72', 'locationId', 'n-late'));
  create function pg_temp.deny() returns trigger language plpgsql as $g$ begin raise exception 'сторож' using errcode = '42501'; end $g$;
  create trigger m72_deny before update on quality.construction_defects_v2 for each row execute function pg_temp.deny();
  e := pg_temp.err(format($q$insert into quality.location_nodes (core_company_id, id, "companyId", "nodeType", "parentId", "displayName", sort_order)
    values (%L, 'n-late', '', 'floor', 'n-bld', 'Этаж 2', 2)$q$, ca));
  res := res || pg_temp.t(e = 'OK' and pg_temp.cid('location_nodes', ca, 'n-late') is not null, 'родитель записан, хотя ребёнок охраняется — ' || e);
  drop trigger m72_deny on quality.construction_defects_v2;
  update quality.construction_defects_v2 set version = version + 1 where core_company_id = ca and id = 'def-m72';
  res := res || pg_temp.t((select core_location_node_id from quality.construction_defects_v2 where core_company_id = ca and id = 'def-m72')
                          = pg_temp.cid('location_nodes', ca, 'n-late'), 'связь охраняемого ребёнка — при следующей правке');

  -- 9. права и правила строк 052/053 не тронуты: функции 053 на месте, у таблиц — прежние правила RLS
  select count(*) into n from pg_policies where schemaname = 'quality';
  res := res || pg_temp.t(n > 0, 'правила RLS Качества на месте');

  raise exception E'%FAIL всего: %', res, (length(res) - length(replace(res, 'FAIL ', ''))) / 5 using errcode = 'P0001';
end $$;
