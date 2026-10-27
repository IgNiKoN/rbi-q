-- P2-0054 (048): данные «до» как у RBI (PGlite, база после 047; ПЕРЕД 048). Компания «Снимок 048» с Качеством:
--   ЖК Север — дерево Качества (2 корпуса × 2 секции × 3 этажа × 2 квартиры, удалённая ветка, дубль названия);
--   ЖК Юг — корпус с веткой глубже 6 уровней (самый глубокий узел — без места ядра);
--   ЖК Пустой — узел-проект без мест; ЖК План/Факт — свои места План/Факта (Качество их не ведёт).
-- Компания «Альфа 048» — один ЖК с двумя корпусами. Замечания и приёмки СК 2.0, планы этажей, помещения СК 2.0, синонимы мест,
-- инженеры Качества с объектами и без. Узлы пишутся как приложение Качества (перенос в ядро — триггер 044).
insert into auth.users(id, email) select ('00000000-0000-4000-8000-0000005480' || lpad(g::text, 2, '0'))::uuid, 'u548' || g || '@test.invalid'
  from generate_series(1, 6) g;
insert into core.companies(id, name, is_test) values
  ('00000000-0000-4000-8000-000000548100', 'Снимок 048', true), ('00000000-0000-4000-8000-000000548101', 'Альфа 048', true);
insert into core.company_members(company_id, user_id)
  select '00000000-0000-4000-8000-000000548100'::uuid, ('00000000-0000-4000-8000-0000005480' || lpad(g::text, 2, '0'))::uuid from generate_series(1, 5) g
  union all select '00000000-0000-4000-8000-000000548101', '00000000-0000-4000-8000-000000548006';
insert into core.company_modules(company_id, module, enabled)
  select c::uuid, m, true from unnest(array['00000000-0000-4000-8000-000000548100', '00000000-0000-4000-8000-000000548101']) c,
                               unnest(array['quality', 'construction', 'planfact']) m
  on conflict (company_id, module) do update set enabled = true;

do $$
declare
  c uuid := '00000000-0000-4000-8000-000000548100'; ca uuid := '00000000-0000-4000-8000-000000548101';
  b int; s int; f int; a int; k int; nid text; pid text; pw uuid; pf uuid := '00000000-0000-4000-8000-000000548209';
begin
  -- узлы-проекты (как приложение: корень "object") → объекты Качества и проекты ядра (039b)
  insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order, core_company_id) values
    ('n548-n', null, 'object', 'ЖК Север', 'жк север', 1, c), ('n548-s', null, 'object', 'ЖК Юг', 'жк юг', 2, c),
    ('n548-e', null, 'object', 'ЖК Пустой', 'жк пустой', 3, c), ('n548-x', null, 'object', 'ЖК Восток', 'жк восток', 1, ca);
  for b in 1..2 loop
    insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order, core_company_id)
    values ('n548-n-b' || b, 'n548-n', 'building', 'Корпус ' || b, '', b, c);
    for s in 1..2 loop
      insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order, core_company_id)
      values ('n548-n-b' || b || 's' || s, 'n548-n-b' || b, 'section', 'Секция ' || s, '', s, c);
      for f in 1..3 loop
        insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order, core_company_id)
        values ('n548-n-b' || b || 's' || s || 'f' || f, 'n548-n-b' || b || 's' || s, 'floor', 'Этаж ' || f, '', f, c);
        for a in 1..2 loop
          insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order, core_company_id)
          values ('n548-n-b' || b || 's' || s || 'f' || f || 'a' || a, 'n548-n-b' || b || 's' || s || 'f' || f, 'apartment',
                  'Кв. ' || ((b - 1) * 12 + (s - 1) * 6 + (f - 1) * 2 + a), '', a, c);
        end loop;
      end loop;
    end loop;
  end loop;
  -- дубль названия и удалённая ветка
  insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order, core_company_id)
  values ('n548-n-dup', 'n548-n-b1s1', 'floor', 'этаж  1', '', 9, c), ('n548-n-del', 'n548-n-b2', 'section', 'Секция снесена', '', 9, c),
         ('n548-n-delf', 'n548-n-del', 'floor', 'Этаж снесён', '', 1, c);
  update quality.location_nodes set is_deleted = true, deleted_at = now() where core_company_id = c and id = 'n548-n-del';
  -- ЖК Юг: ветка глубже 6
  pid := 'n548-s';
  for k in 1..7 loop
    nid := 'n548-s-' || k;
    insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order, core_company_id)
    values (nid, pid, case k when 1 then 'building' when 2 then 'section' when 3 then 'floor' when 4 then 'apartment' else 'room' end,
            'Уровень ' || k, '', 1, c);
    pid := nid;
  end loop;
  -- Альфа: два корпуса
  insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order, core_company_id)
  values ('n548-x-b1', 'n548-x', 'building', 'Корпус А', '', 1, ca), ('n548-x-b2', 'n548-x', 'building', 'Корпус Б', '', 2, ca);

  -- ЖК План/Факт: проект ядра со своими местами («было до 044»)
  insert into core.projects(id, company_id, name) values (pf, c, 'ЖК План/Факт');
  perform set_config('quality.place_sync', '1', true);
  insert into core.locations(id, company_id, project_id, node_type, object_kind, name, canonical_key, depth) values
    ('00000000-0000-4000-8000-000000548301', c, pf, 'object', 'building', 'Корпус ПФ', 'корпус пф', 1);
  insert into core.locations(id, company_id, project_id, parent_id, node_type, name, canonical_key, depth) values
    ('00000000-0000-4000-8000-000000548302', c, pf, '00000000-0000-4000-8000-000000548301', 'section', 'Секция ПФ', 'секция пф', 2);
  perform set_config('quality.place_sync', '', true);

  -- СК 2.0: замечания, приёмки, планы этажей, помещения, синонимы мест
  insert into quality.construction_defects_v2(id, "locationId", status, text, core_company_id) values
    ('d548-1', 'n548-n-b1s1f1a1', 'issued', 'Замечание 1', c), ('d548-2', 'n548-n-b2s2f3a2', 'in_progress', 'Замечание 2', c),
    ('d548-3', 'n548-s-6', 'issued', 'Замечание 3', c), ('d548-4', 'n548-x-b1', 'issued', 'Замечание 4', ca),
    ('d548-5', null, 'issued', 'Без места', c);
  insert into quality.construction_acceptance_v2(id, "locationId", status, core_company_id) values
    ('a548-1', 'n548-n-b1s2f2', 'requested', c), ('a548-2', 'n548-n-b2', 'accepted', c);
  insert into quality.construction_floors_v2(id, "locationId", name, sort_order, pdf_url, pdf_name, pdf_size, is_active, core_company_id) values
    ('p548-1', 'n548-n-b1s1f1', 'План 1', 1, 'plans/p548-1.pdf', 'p1.pdf', '1 КБ', true, c),
    ('p548-2', 'n548-n-b2s1f2', 'План 2', 1, 'plans/p548-2.pdf', 'p2.pdf', '1 КБ', true, c);
  insert into quality.construction_units_v2(id, "locationId", name, type, sort_order, status, core_company_id) values
    ('u548-1', 'n548-n-b1s1f1a1', 'Кв. 1', 'apartment', 1, 'active', c), ('u548-2', 'n548-n-b1s1f1a2', 'Кв. 2', 'apartment', 2, 'active', c);
  update quality.location_nodes set synonyms = '["корпус первый"]' where core_company_id = c and id = 'n548-n-b1';
end $$;

-- инженеры Качества (роли — из шаблонов компании): с объектами ЖК Север, с двумя, без объектов (все), админ
insert into core.role_assignments(company_id, user_id, role_id, project_id, quality_objects)
select '00000000-0000-4000-8000-000000548100'::uuid, ('00000000-0000-4000-8000-0000005480' || v.u)::uuid,
       (select id from core.company_roles where company_id = '00000000-0000-4000-8000-000000548100' and template_code = v.t), null,
       case when v.o is null then null else
         array(select po.id from quality.project_objects po where po.core_company_id = '00000000-0000-4000-8000-000000548100'
                  and po.display_name = any (v.o) order by po.id) end
  from (values ('01', 'company_admin', null::text[]), ('02', 'qc_engineer', array['ЖК Север']),
               ('03', 'qc_engineer', array['ЖК Север', 'ЖК Юг']), ('04', 'qc_engineer', null)) v(u, t, o);
insert into core.role_assignments(company_id, user_id, role_id, project_id, quality_objects)
select '00000000-0000-4000-8000-000000548101'::uuid, '00000000-0000-4000-8000-000000548006'::uuid,
       (select id from core.company_roles where company_id = '00000000-0000-4000-8000-000000548101' and template_code = 'qc_engineer'), null, null;
