-- P2-0048 (047): данные «до» для снимка видимости (PGlite, база после 046c): назначения на компанию и на проект,
-- инженеры Качества с объектами и без, фирма подрядчика, отозванное и с истёкшим сроком; роли из шаблонов.
insert into auth.users(id, email) select ('00000000-0000-4000-8000-0000000480' || lpad(g::text, 2, '0'))::uuid, 'u' || g || '@test.invalid'
  from generate_series(1, 9) g;
insert into core.companies(id, name, is_test) values ('00000000-0000-4000-8000-000000048100', 'Снимок 047', true);
insert into core.company_members(company_id, user_id)
  select '00000000-0000-4000-8000-000000048100', ('00000000-0000-4000-8000-0000000480' || lpad(g::text, 2, '0'))::uuid from generate_series(1, 9) g;
insert into core.company_modules(company_id, module, enabled)
  select '00000000-0000-4000-8000-000000048100', m, true from unnest(array['quality', 'construction']) m
  on conflict (company_id, module) do update set enabled = true;
insert into core.projects(id, company_id, name) values
  ('00000000-0000-4000-8000-000000048201', '00000000-0000-4000-8000-000000048100', 'ЖК Снимок 1'),
  ('00000000-0000-4000-8000-000000048202', '00000000-0000-4000-8000-000000048100', 'ЖК Снимок 2');
select set_config('quality.object_sync', '1', false);
insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id) values
  ('obj-a-048', 'а 048', 'Объект А', '{}', '00000000-0000-4000-8000-000000048100'),
  ('obj-b-048', 'б 048', 'Объект Б', '{}', '00000000-0000-4000-8000-000000048100');
select set_config('quality.object_sync', '', false);
insert into core.role_assignments(company_id, user_id, role_id, project_id, quality_objects, valid_to, revoked_at)
select '00000000-0000-4000-8000-000000048100', ('00000000-0000-4000-8000-0000000480' || v.u)::uuid,
       (select id from core.company_roles where company_id = '00000000-0000-4000-8000-000000048100' and template_code = v.t),
       v.p::uuid, v.o, v.vt, v.rv
  from (values ('01', 'company_admin', null, null::text[], null::timestamptz, null::timestamptz),
               ('02', 'project_manager', '00000000-0000-4000-8000-000000048201', null, null, null),
               ('03', 'foreman', '00000000-0000-4000-8000-000000048201', null, null, null),
               ('03', 'foreman', '00000000-0000-4000-8000-000000048202', null, null, null),
               ('04', 'pto', null, null, null, null),
               ('05', 'qc_engineer', null, array['obj-a-048'], null, null),
               ('06', 'qc_engineer', null, array['obj-a-048', 'obj-b-048'], null, null),
               ('07', 'qc_engineer', null, null, null, null),
               ('08', 'foreman', '00000000-0000-4000-8000-000000048202', null, now() + interval '10 days', null),
               ('09', 'foreman', '00000000-0000-4000-8000-000000048201', null, null, now())) v(u, t, p, o, vt, rv);
-- Стройконтроль 2.0: замечания и приёмка компании (для строки снимка «видят»)
insert into quality.construction_defects_v2(id, core_company_id, status, text)
  select 'd' || g || '-048', '00000000-0000-4000-8000-000000048100', 'issued', 'Замечание ' || g from generate_series(1, 3) g;
insert into quality.construction_acceptance_v2(id, core_company_id, status)
  values ('a1-048', '00000000-0000-4000-8000-000000048100', 'requested');
