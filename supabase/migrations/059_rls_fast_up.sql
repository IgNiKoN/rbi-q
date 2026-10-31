-- P2-0078 (CRITICAL — права / RLS, только чтение): правила чтения Качества без тяжёлой функции на каждой строке.
-- Прежде правило строки звало quality.can / quality.rec_ok (security definer, с запросами к назначениям) на КАЖДОЙ строке всей
-- таблицы: quality.file_registry — 2,66 с на чтение при 3 632 строках, sk_records — 5 с (боевой, 31.10.2026).
-- Теперь права человека считаются ОДИН раз на запрос (подзапрос (select …) — initplan), строка сверяется дешёвым сравнением:
--  1) quality.readable_projects(действия) — для правил quality.can: список проектов, где у человека есть одно из действий
--     (метка «любой проект» — назначение на всю компанию или администратор платформы, метка «без проекта» — запись без проекта
--     при любом назначении, проекты-контейнеры компании — при действии не «…manage»); правило строки — пересечение массивов;
--  2) quality.read_scope(видеть все, своя) + quality.read_ok(…) — для правил quality.rec_ok: области назначений (объект,
--     только своя запись, фирма) один раз на запрос; строка — сравнение объекта, автора, исполнителя и фирмы.
-- Смысл прав — прежний (функции 052/053 остаются источником истины для записи и сторожей); правила записи (insert / update /
-- delete) не меняются. Права «до = после» — tests/server/059_rls_fast.seed.pglite.sql + 059_rls_fast_compare.check.sql.
-- Применять после 057 (и 058, если она есть), одним запросом. Откат — 059_rls_fast_down.sql.
begin;

do $$
begin
  if to_regclass('core.demo_visits') is null then
    raise exception '059: сначала 057_demo_mode_up.sql' using errcode = 'P0001';
  end if;
  if to_regprocedure('quality.readable_projects(text[])') is not null then
    raise exception '059 уже применена (повтор — только после 059_rls_fast_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- Метки списка: «любой проект» и «запись без проекта» (проектов с такими id нет: gen_random_uuid их не выдаёт).
create or replace function quality.any_project()
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$ select 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid $function$;
create or replace function quality.no_project()
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$ select '00000000-0000-0000-0000-000000000001'::uuid $function$;

-- 1. Правила quality.can(компания, проект, действия): проекты, где есть одно из действий, — один раз на запрос.
-- Как quality.has_actions: действие в каталоге и модуль включён у компании; администратор платформы или назначение на всю
-- компанию — любой проект; запись без проекта — при любом назначении; назначение на проект — этот проект; проект-контейнер
-- Качества — при назначении на любой объект, кроме действий «…manage».
create or replace function quality.readable_projects(p_actions text[])
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core', 'planfact'
AS $function$
  with c as (select quality.request_company() id),
  acts as (
    select act from unnest(p_actions) act, c
     where exists (select 1 from core.permission_catalog pc where pc.action = act)
       and exists (select 1 from core.company_modules cm where cm.company_id = c.id and cm.module = split_part(act, '.', 1) and cm.enabled)),
  asg as (
    select a.project_id, x.act from c
      join core.role_assignments a on a.company_id = c.id and a.user_id = auth.uid()
       and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
      join acts x on exists (select 1 from core.company_role_permissions rp
                              where rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = x.act))
  select case
    when auth.uid() is null or (select id from c) is null or not exists (select 1 from acts) then '{}'::uuid[]
    when planfact.is_platform_admin() or exists (select 1 from asg where project_id is null) then array[quality.any_project()]
    when not exists (select 1 from asg) then '{}'::uuid[]
    else array(select distinct project_id from asg) || quality.no_project()
         || case when exists (select 1 from asg where act not like '%manage')
                 then array(select p.id from core.projects p, c where p.company_id = c.id and p.quality_container) else '{}'::uuid[] end
  end
$function$;
comment on function quality.readable_projects(text[]) is
  'P2-0078: проекты текущей компании, где у человека есть одно из действий (как quality.has_actions), — для правил чтения: '
  '(select quality.readable_projects(…)) && array[coalesce(core_project_id, quality.no_project()), quality.any_project()]';

-- 2. Правила quality.rec_ok(компания, проект, объект, видеть все, своя, автор, исполнитель, фирма): области назначений —
-- один раз на запрос, строка — quality.read_ok. Как core.row_allowed + core.assignment_allows (запись без места) и
-- quality.has_anywhere; any_* — ветка «видеть все» (автор — из строки), own_* — ветка «своя запись» (автор или исполнитель —
-- я); участник части проекта: *_mine — только своя (признак «нет»: автор = я), *_own — признак «своя» (автор = я или автора
-- нет: в core.assignment_allows сравнение с пустым автором не запрещает — поведение 053 сохранено, ТД); *_cp — «объект/фирма»
-- (роль «своя фирма»); метка «любой объект».
create type quality.read_scope as (
  me uuid, cont uuid[],
  any_obj uuid[], any_mine uuid[], any_own uuid[], any_cp text[], any_own_cp text[],
  own_obj uuid[], own_cp text[], own_free boolean, own_free_cp uuid[]);

create or replace function quality.read_scope(p_any text[], p_own text[])
 RETURNS quality.read_scope
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core', 'planfact'
AS $function$
declare
  c uuid := quality.request_company();
  s quality.read_scope;
  v_all constant uuid := quality.any_project();
  g record; v_obj uuid; v_own boolean; v_cp uuid; v_ok boolean; v_direct boolean;
begin
  s := row(auth.uid(), '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', false, '{}');
  if c is null or s.me is null then return s; end if;
  s.cont := array(select p.id from core.projects p where p.company_id = c and p.quality_container);
  for g in
    with acts as (
      select pc.action act, pc.area_scoped, pc.unplaced, pc.action = any(p_any) in_any, pc.action = any(p_own) in_own
        from core.permission_catalog pc
       where pc.action = any(p_any || p_own)
         and (pc.module is null or exists (select 1 from core.company_modules cm where cm.company_id = c and cm.module = pc.module and cm.enabled)))
    select x.*, true adm, null::uuid project_id, null::uuid location_id, null::uuid counterparty_id, null::text[] r
      from acts x where planfact.is_platform_admin()
    union all
    select x.*, false, a.project_id, a.location_id, a.counterparty_id,
           array(select rp.action from core.company_role_permissions rp where rp.role_id = a.role_id and rp.company_id = a.company_id)
      from acts x join core.role_assignments a on a.company_id = c and a.user_id = s.me
       and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
       and (a.location_id is null or x.area_scoped)
       and exists (select 1 from core.company_role_permissions rp where rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = x.act)
     where not planfact.is_platform_admin()
  loop
    if g.adm then
      if g.in_any then s.any_obj := s.any_obj || v_all; end if;
      if g.in_own then s.own_obj := s.own_obj || v_all; s.own_free := true; end if;
      continue;
    end if;
    -- quality.has_anywhere: своя запись без объекта — назначение не на контейнер; «своя фирма» — только её записи
    if g.in_own and (g.project_id is null or not g.project_id = any(s.cont)) then
      if not 'quality.scope.contractor' = any(g.r) or 'quality.scope.company' = any(g.r) then s.own_free := true;
      elsif g.counterparty_id is not null then s.own_free_cp := s.own_free_cp || g.counterparty_id; end if;
    end if;
    -- core.assignment_allows для записи без места
    v_obj := v_all; v_own := false; v_cp := null; v_ok := true; v_direct := false;
    if not 'quality.scope.company' = any(g.r) then
      v_obj := coalesce(g.project_id, v_all);
      if g.location_id is not null then
        if g.unplaced is null then        -- только своя и только просмотр
          v_own := true; v_direct := true; v_ok := g.act like '%.view';
        elsif g.unplaced = 'own' then
          v_own := true;
        end if;
      end if;
      if not v_direct and not (split_part(g.act, '.', 1) || '.manage') = any(g.r) and 'quality.scope.contractor' = any(g.r) then
        v_cp := g.counterparty_id; v_ok := g.counterparty_id is not null;
      end if;
    end if;
    continue when not v_ok;
    if g.in_any then
      if v_cp is null and not v_own then s.any_obj := s.any_obj || v_obj;
      elsif v_direct then s.any_mine := s.any_mine || v_obj;
      elsif v_cp is null then s.any_own := s.any_own || v_obj;
      elsif not v_own then s.any_cp := s.any_cp || (v_obj::text || '/' || v_cp::text);
      else s.any_own_cp := s.any_own_cp || (v_obj::text || '/' || v_cp::text); end if;
    end if;
    if g.in_own then                      -- автор — я: условие «только своя» выполнено
      if v_cp is null then s.own_obj := s.own_obj || v_obj;
      else s.own_cp := s.own_cp || (v_obj::text || '/' || v_cp::text); end if;
    end if;
  end loop;
  return s;
end $function$;
comment on function quality.read_scope(text[], text[]) is
  'P2-0078: области назначений человека в текущей компании для правил чтения записей Качества (как quality.rec_ok) — '
  'один раз на запрос; строку сверяет quality.read_ok';

-- Строка: объект записи (как quality.record_object), затем — области «видеть все», затем — своя запись. Без запросов к базе.
create or replace function quality.read_ok(s quality.read_scope, p_project uuid, p_object uuid, p_author uuid, p_assignee uuid, p_cp uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_all constant uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  o uuid := coalesce(p_object, case when p_project is not null and not p_project = any(s.cont) then p_project end);
  k uuid := coalesce(o, '00000000-0000-0000-0000-000000000000'::uuid);   -- quality.no_object()
begin
  if s.me is null then return false; end if;
  if s.any_obj && array[k, v_all] then return true; end if;
  if p_author = s.me and s.any_mine && array[k, v_all] then return true; end if;
  if (p_author is null or p_author = s.me) and s.any_own && array[k, v_all] then return true; end if;
  if p_cp is not null then
    if s.any_cp && array[k::text || '/' || p_cp::text, v_all::text || '/' || p_cp::text] then return true; end if;
    if (p_author is null or p_author = s.me) and s.any_own_cp && array[k::text || '/' || p_cp::text, v_all::text || '/' || p_cp::text] then return true; end if;
  end if;
  if not coalesce(p_author = s.me or p_assignee = s.me, false) then return false; end if;
  if s.own_obj && array[k, v_all] then return true; end if;
  if p_cp is not null and s.own_cp && array[k::text || '/' || p_cp::text, v_all::text || '/' || p_cp::text] then return true; end if;
  return o is null and (s.own_free or coalesce(p_cp = any(s.own_free_cp), false));
end $function$;
comment on function quality.read_ok(quality.read_scope, uuid, uuid, uuid, uuid, uuid) is
  'P2-0078: видна ли запись Качества по областям quality.read_scope (без запросов к базе, на каждой строке)';

revoke all on function quality.any_project(), quality.no_project(), quality.readable_projects(text[]), quality.read_scope(text[], text[]),
  quality.read_ok(quality.read_scope, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function quality.any_project(), quality.no_project(), quality.readable_projects(text[]), quality.read_scope(text[], text[]),
  quality.read_ok(quality.read_scope, uuid, uuid, uuid, uuid, uuid) to authenticated;

-- 3. Правила чтения: этап 1 — file_registry (quality.can) и sk_records (quality.rec_ok).
drop policy file_registry_select on quality.file_registry;
create policy file_registry_select on quality.file_registry for select to authenticated using (
  core_company_id = (select quality.request_company())
  and (select quality.readable_projects('{quality.view,construction.view}')) && array[coalesce(core_project_id, quality.no_project()), quality.any_project()]);

drop policy sk_records_select on quality.sk_records;
create policy sk_records_select on quality.sk_records for select to authenticated using (
  core_company_id = (select quality.request_company())
  and quality.read_ok((select quality.read_scope('{quality.sk.view}', '{quality.sk.view,quality.sk.import}')),
                      core_project_id, core_object_id, core_created_by, null, core_counterparty_id));

commit;
