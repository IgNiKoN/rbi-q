-- P2-0033 этап 4. Сверка «видит в старом = видит в новом» по сотрудникам из переноса — ТОЛЬКО ЧТЕНИЕ, всё откатывается
-- (отчёт — ERROR P0001 «СВЕРКА … (откат)»). Для каждого человека и таблицы:
--   «старое» — строки public.<таблица> перенесённых объектов РБИ по правилу роли старого профиля (ROLE_MATRIX, permission.service.js),
--     посчитанному здесь независимо от правила сервера: Админ / Зам. / Директор — все; Инженер СК — записи закреплённых объектов
--     (ObjectDirectory.isRecordInAssignedProjects: "projectId" = id узла-объекта, ключ или название записи = ключ / название /
--     синоним объекта старого справочника public.location_nodes / public.project_objects после cleanString) + свои записи без объекта
--     (пусто / unknown; «свои» — по имени инженера, как старое приложение; «Все» — чужой объект: старое приложение такие записи
--     инженеру не скачивало и не показывало); пункты и фото — проверок, видимых по этому правилу;
--   «новое» — что сервер отдаёт под учёткой человека (роль authenticated, компания RBI в заголовке, правила RLS) из quality.<таблица>.
-- Расхождения: число строк только в старом / только в новом и до 3 примеров id; объяснённые — отдельно:
--   «свои Все» — своя запись (автор — этот человек) с объектом «Все»: по карточке P2-0033 §8 — как «свои без объекта», видна;
--   «сироты» — пункты и фото без проверки (проверка удалена): в старом не видны, в новом — свои автору (правило 023, не менялось);
--   «новые» — записи, созданные уже в новом приложении после переноса (в public их нет);
--   «свои „не разобрано“» (P2-0035, 039) — своя запись, объект которой сервер не узнал: видна автору (ничего не скрывается молча).
-- DIFF — только необъяснённые. Параметр: v_only — почты людей этого запуска
-- (null — все; на сервере по 3 человека: иначе SQL Editor обрывает долгий запрос).
do $$
declare
  c uuid := (select id from core.companies where name = 'RBI');
  v_only text[] := null;
  v_tables text[] := array['rbi_inspections', 'rbi_tasks', 'sk_records', 'project_meetings', 'project_fmea', 'project_interventions',
                           'project_schedule_stages', 'rbi_inspection_items', 'rbi_inspection_photos'];
  v_codes text[];
  m record; t text; v_refs text[]; v_ids text[]; v_names text[]; n_ex int;
  v_old text; v_new text; n_old int; n_new int; n_oo int; n_on int; s_oo text; s_on text;
  out text := ''; v_bad int := 0;
begin
  if c is null then raise exception 'Нет компании RBI' using errcode = 'P0001'; end if;
  select array_agg(old_code) into v_codes from quality.rbi_transfer_projects where core_company_id = c;
  create temp table _new (id text) on commit drop;
  create temp table _old (id text) on commit drop;
  create temp table _oldinsp (id text) on commit drop;
  grant insert, select, delete on _new to authenticated;
  -- ObjectDirectory.cleanString: lower → без ' " « » → без «жк » → trim
  create function pg_temp.cs(p text) returns text language sql immutable as $f$
    select btrim(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[''"«»]', '', 'g'), 'жк\s+', '', 'g')) $f$;

  for m in
    select t.user_id, t.email, p.role, p.engineer_name,
           case when jsonb_typeof(p.settings -> 'assignedProjects') = 'array' and jsonb_array_length(p.settings -> 'assignedProjects') > 0
                then array(select jsonb_array_elements_text(p.settings -> 'assignedProjects')) else coalesce(p.assigned_projects, '{}') end refs
      from quality.rbi_transfer_people t join public.rbi_engineer_profiles p on p.id = t.old_profile_id
     where t.core_company_id = c and t.user_id is not null and (v_only is null or t.email = any (v_only))
     order by t.email
  loop
    -- старый справочник: узлы-объекты public.location_nodes (id, ключ, название, синонимы) + public.project_objects
    v_refs := array(select btrim(x) from unnest(m.refs) x where btrim(x) <> '');
    with obj as (
      select n.id, array[pg_temp.cs(n.canonical_key), pg_temp.cs(n."displayName")]
               || coalesce(array(select pg_temp.cs(y) from jsonb_array_elements_text(case when jsonb_typeof(n.synonyms) = 'array' then n.synonyms else '[]' end) y), '{}') names
        from public.location_nodes n where n."nodeType" = 'object' and coalesce(n.is_deleted, false) = false
      union all
      select o.id, array[pg_temp.cs(o.canonical_key), pg_temp.cs(o.display_name)] || coalesce(array(select pg_temp.cs(y) from unnest(o.synonyms) y), '{}')
        from public.project_objects o where coalesce(o.is_deleted, false) = false),
    hit as (select distinct o.id, o.names from obj o, unnest(v_refs) r where o.id = r or pg_temp.cs(r) = any (o.names))
    select array(select id from hit), array(select distinct x from hit, unnest(names) x where x <> '') || array(select pg_temp.cs(r) from unnest(v_refs) r)
      into v_ids, v_names;
    -- имена — объектов по тем же ключам (узел дерева и карточка справочника с одним ключом — один объект)
    v_names := array(select distinct x from unnest(v_names) x where x <> '');
    with obj as (select n.id, pg_temp.cs(coalesce(nullif(n.canonical_key, ''), n."displayName")) k from public.location_nodes n where n."nodeType" = 'object'
                 union all select o.id, pg_temp.cs(o.canonical_key) from public.project_objects o)
    select array(select distinct id from obj where k = any (v_names)) || v_ids into v_ids;

    truncate _oldinsp;
    foreach t in array v_tables loop
      truncate _old; truncate _new;
      if t in ('rbi_inspection_items', 'rbi_inspection_photos') then
        execute format('insert into _old select p.id from public.%I p where p.project_code = any ($1) and p.inspection_id in (select id from _oldinsp)', t)
          using v_codes;
      else
        execute format($q$insert into _old select p.id from public.%I p, lateral (select to_jsonb(p) j) x
           where p.project_code = any ($1) and ($2 in ('manager', 'deputy_manager', 'director')
             or $2 = 'engineer' and (
                  coalesce(j ->> 'projectId', '') = any ($3)
               or pg_temp.cs(j ->> 'project_canonical_key') = any ($4) or pg_temp.cs(j ->> 'project_display_name') = any ($4)
               or coalesce(j ->> 'project_canonical_key', '') in ('', 'unknown')
                  and coalesce(j ->> 'engineer_name', j ->> 'inspector_name', j ->> 'created_by_name', j ->> 'owner_name') = $5))$q$, t)
          using v_codes, m.role, v_ids, v_names, m.engineer_name;
        if t = 'rbi_inspections' then insert into _oldinsp select id from _old; end if;
      end if;
      perform set_config('request.jwt.claim.sub', m.user_id::text, true);
      perform set_config('request.jwt.claims', json_build_object('sub', m.user_id, 'role', 'authenticated')::text, true);
      perform set_config('request.headers', json_build_object('x-company-id', c)::text, true);
      execute 'set local role authenticated';
      execute format('insert into _new select id from quality.%I', t);
      execute 'reset role';
      select count(*) into n_old from _old;
      select count(*) into n_new from _new;
      select count(*), string_agg(id, ', ') filter (where rn <= 3) into n_oo, s_oo
        from (select id, row_number() over (order by id) rn from (select id from _old except select id from _new) d) z;
      -- «только в новом»: объяснённые (свои «Все», сироты) — отдельно
      execute format($q$select count(*) filter (where why = ''), string_agg(id, ', ') filter (where why = '' and rn <= 3),
             count(*) filter (where why <> '') from (
        select d.id, row_number() over (partition by (x.why = '') order by d.id) rn, x.why from (select id from _new except select id from _old) d
          join quality.%I q on q.id = d.id and q.core_company_id = $1, lateral (select to_jsonb(q) j) jj,
          lateral (select case
            when not exists (select 1 from public.%I p where p.id = d.id) then 'новые'
            when $2 in ('rbi_inspection_items', 'rbi_inspection_photos')
                 and not exists (select 1 from quality.rbi_inspections i where i.core_company_id = $1 and i.id = jj.j ->> 'inspection_id') then 'сироты'
            when (pg_temp.cs(jj.j ->> 'project_canonical_key') in ('все', 'all') or pg_temp.cs(jj.j ->> 'project_canonical_key') like 'все %%')
                 and jj.j ->> 'core_created_by' = $3::text then 'свои Все'
            -- P2-0035 (039): своя запись, объект которой сервер не узнал («не разобрано»), видна автору
            when jj.j ? 'core_object_id' and jj.j ->> 'core_object_id' is null and jj.j ->> 'core_created_by' = $3::text
                 and pg_temp.cs(coalesce(nullif(jj.j ->> 'project_canonical_key', ''), jj.j ->> 'project_display_name')) not in ('', 'unknown')
                 then 'свои «не разобрано»'
            else '' end why) x) z$q$, t, t)
        into n_on, s_on, n_ex using c, t, m.user_id;
      if n_oo + n_on > 0 then v_bad := v_bad + 1; end if;
      out := out || format('%s %s | %s | старое %s, новое %s%s%s', case when n_oo + n_on = 0 then 'OK  ' else 'DIFF' end, m.email, t, n_old, n_new,
               case when n_oo > 0 then format(' | только в старом %s: %s', n_oo, s_oo) else '' end,
               case when n_on > 0 then format(' | только в новом %s: %s', n_on, s_on) else '' end)
             || case when n_ex > 0 then format(' | объяснено (свои «Все», свои «не разобрано», сироты, новые): %s', n_ex) else '' end || E'\n';
    end loop;
  end loop;
  raise exception E'СВЕРКА (откат), расхождений: %\n%', v_bad, out using errcode = 'P0001';
end $$;
