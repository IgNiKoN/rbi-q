-- P2-0053 доработка 2: «Сводка», «Входящие» и «Мои объекты» План/Факта в демо и у сотрудника не админа платформы.
-- Боевой 31.10 (учётка владельца, замер Архитектора): в демо pf_summary_portfolio 6,5–7,3 с (1 строка), pf_my_inbox 6,9–7,1 с;
-- вне демо (админ платформы) 0,36 с. При старте вызовы идут вместе и выходят за ожидание чтения 8 с → «Нужен интернет».
-- Счёт вызовов на стенде (scripts/demo/perf-demo.mjs): «Сводка» «ЖК Демо» у посетителя звала область человека (my_area) 284 раза —
-- на каждую позицию ВОР, а с ней проверку «админ ли платформы» с разбором заголовка запроса ~300 раз; у админа платформы вне демо
-- область — «всё» без разбора заголовка. «Входящие» — права на каждом проекте платформы.
-- Теперь: область — один раз на проект («Сводка», «Входящие»); подзапрос-барьер (offset 0) сначала отбирает проекты дёшево —
-- в демо только демо-компания; не админ — проекты своих действующих назначений (на всю компанию или на проект: без такого
-- назначения has_grant всё равно «нет» — результат тот же); админ платформы вне демо — все, как раньше; права — только на них.
-- «Входящие» в демо — только демо (ТД 412); pf_my_projects в демо — только объекты демо (отдавал объекты своей компании).
-- Применять после 057, одним запросом. Откат — 058_demo_fast_down.sql.
begin;

do $$
begin
  if to_regprocedure('core.request_demo_company()') is null then
    raise exception '058: сначала 057_demo_mode_up.sql' using errcode = 'P0001';
  end if;
  if to_regprocedure('core.in_demo_scope(uuid)') is not null then
    raise exception '058 уже применена (повтор — только после 058_demo_fast_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- Демо-компания запроса — и функциям с правами вызывающего (pf_my_projects): она и так в заголовке запроса, тайны нет.
grant execute on function core.request_demo_company() to authenticated;
-- Компания строки в области запроса: не демо — любая; запрос к демо-компании — только она (проверки и отчёты).
create function core.in_demo_scope(p_company uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select core.request_demo_company() is null or p_company = core.request_demo_company()
$$;
revoke all on function core.in_demo_scope(uuid) from public, anon;
grant execute on function core.in_demo_scope(uuid) to authenticated;

create function pg_temp.patch(p_fn regprocedure, p_from text[], p_to text[])
returns void language plpgsql as $$
declare v_new text := pg_get_functiondef(p_fn); i int;
begin
  for i in 1..cardinality(p_from) loop
    if position(p_from[i] in v_new) = 0 then
      raise exception '058: в % не найдено место правки «%»', p_fn, p_from[i] using errcode = 'P0001';
    end if;
    v_new := replace(v_new, p_from[i], p_to[i]);
  end loop;
  execute v_new;
end $$;

select pg_temp.patch('public.pf_summary_portfolio()'::regprocedure,
  array['declare v_today date := planfact.fact_today(); v_demo uuid := core.request_demo_company();',
        '  with pj as (',
        '           planfact.has_permission(p.id, ''planfact.thresholds.edit'') th',
        '    from core.projects p where p.archived_at is null and planfact.has_permission(p.id, ''planfact.fact.view'')
      and (v_demo is null or p.company_id = v_demo)',
        '            and planfact.in_area(vp.location_id, planfact.my_area(pj.id))),',
        'where e.project_id = pj.id and e.status = ''pending_approval'' and planfact.in_area(vp.location_id, planfact.my_area(pj.id))),'],
  array['declare v_today date := planfact.fact_today(); v_demo uuid := core.request_demo_company(); v_uid uuid := auth.uid();
        v_admin boolean := planfact.is_platform_admin();',
        '  with pj as materialized (   -- 058: область человека — один раз на проект (не на каждую позицию)',
        '           planfact.has_permission(p.id, ''planfact.thresholds.edit'') th, planfact.my_area(p.id) area',
        '    from (select p0.id, p0.name, p0.code from core.projects p0 where p0.archived_at is null and (v_demo is null or p0.company_id = v_demo)
            and (v_admin or exists (select 1 from core.role_assignments a where a.company_id = p0.company_id and a.user_id = v_uid
              and (a.project_id is null or a.project_id = p0.id)
              and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())))
          offset 0) p   -- 058: сначала проекты человека (в демо — только демо-компании), права — только на них
    where planfact.has_permission(p.id, ''planfact.fact.view'')',
        '            and planfact.in_area(vp.location_id, pj.area)),',
        'where e.project_id = pj.id and e.status = ''pending_approval'' and planfact.in_area(vp.location_id, pj.area)),']);
select pg_temp.patch('public.pf_my_inbox()'::regprocedure,
  array['declare r record; v_uid uuid := auth.uid();',
        'for r in select p.id, p.name, p.code from core.projects p where p.archived_at is null order by p.name, p.id loop',
        '    pending := case when v_ap then',
        'and planfact.in_area(vp.location_id, planfact.my_area(r.id))) end;'],
  array['declare r record; v_uid uuid := auth.uid(); v_demo uuid := core.request_demo_company(); v_admin boolean := planfact.is_platform_admin(); v_area uuid[];',
        'for r in select p0.id, p0.name, p0.code from core.projects p0 where p0.archived_at is null and (v_demo is null or p0.company_id = v_demo)
            and (v_admin or exists (select 1 from core.role_assignments a where a.company_id = p0.company_id and a.user_id = v_uid
              and (a.project_id is null or a.project_id = p0.id)
              and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())))
    order by p0.name, p0.id loop   -- 058: только проекты человека (в демо — только демо-компании)',
        '    -- 058: область — один раз на проект и только если есть что подтверждать (без таких записей область, как и раньше, не считается)
    v_area := case when v_ap and exists (select 1 from planfact.fact_entries e where e.project_id = r.id and e.status = ''pending_approval'')
                   then planfact.my_area(r.id) end;
    pending := case when v_ap then',
        'and planfact.in_area(vp.location_id, v_area)) end;']);
select pg_temp.patch('public.pf_my_projects()'::regprocedure,
  array['select * from core.projects where not quality_container order by name;'],
  array['select * from core.projects where not quality_container and coalesce(company_id = (select core.request_demo_company()), true) order by name;   -- 058: в демо — только демо (заголовок разбирается один раз)']);
drop function pg_temp.patch(regprocedure, text[], text[]);

commit;
