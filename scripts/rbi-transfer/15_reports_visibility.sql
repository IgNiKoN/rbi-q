-- P2-0036 этап 1. Кто видит отчёты и снимки объекта под своей учёткой (правило 033) — ТОЛЬКО ЧТЕНИЕ, всё откатывается
-- (отчёт — ERROR P0001 «ВИДИМОСТЬ … (откат)»). По каждому сотруднику компании RBI: роль, закреплённые объекты, видно отчётов / снимков объекта.
do $$
declare
  c uuid := (select id from core.companies where name = 'RBI');
  v_obj text := 'гбдоу детский сад №3';
  m record; n_r int; n_s int; out text := '';
begin
  if c is null then raise exception 'Нет компании RBI' using errcode = 'P0001'; end if;
  create temp table _v (r int, s int) on commit drop;
  grant insert, select on _v to authenticated;
  for m in select u.id, u.email, coalesce(string_agg(distinct r.name, ', '), '—') roles,
                  coalesce((select string_agg(distinct o.display_name, ', ') from core.role_assignments a2, unnest(a2.quality_objects) qo
                             join quality.project_objects o on o.id = qo and o.core_company_id = c
                            where a2.company_id = c and a2.user_id = u.id), case when bool_or(a.quality_objects is null) then 'все' else '—' end) objs
             from core.company_members cm join auth.users u on u.id = cm.user_id
             left join core.role_assignments a on a.company_id = c and a.user_id = u.id
             left join core.company_roles r on r.id = a.role_id
            where cm.company_id = c group by u.id, u.email order by u.email loop
    perform set_config('request.jwt.claim.sub', m.id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', m.id, 'role', 'authenticated')::text, true);
    perform set_config('request.headers', json_build_object('x-company-id', c)::text, true);
    set local role authenticated;
    insert into _v select (select count(*) from quality.shared_reports where lower(project_canonical_key) = v_obj),
                          (select count(*) from quality.shared_report_snapshots where report_id in (select id from quality.shared_reports where lower(project_canonical_key) = v_obj));
    reset role;
    select r, s into n_r, n_s from _v; delete from _v;
    out := out || format(E'%s | %s | объекты: %s | отчётов %s, снимков %s\n', m.email, m.roles, left(m.objs, 80), n_r, n_s);
  end loop;
  out := out || format(E'снимки объекта (всего, без ключа объекта): %s\n', (select count(*) || ', ' || count(*) filter (where nullif(project_canonical_key, '') is null)
    from quality.shared_report_snapshots where report_id in (select id from quality.shared_reports where core_company_id = c and lower(project_canonical_key) = v_obj)));
  raise exception E'ВИДИМОСТЬ отчётов объекта «%» (откат):\n%', v_obj, out using errcode = 'P0001';
end $$;
