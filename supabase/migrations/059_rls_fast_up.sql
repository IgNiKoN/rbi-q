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

-- 2а. Правила quality.row_visible(компания, проект, действия, вид, автор, исполнитель, ключ фирмы, фирма) — Стройконтроль 1,
-- черновики, очередь: как quality.assignment_sees. all_p — все записи проектов, mine_p — свои (автор или исполнитель — я),
-- ctr — «проект/ключ фирмы» (роль «своя фирма»: ключи — сопоставления фирмы и её название). Запись без проекта и записи
-- проекта-контейнера — при любом назначении.
create type quality.visible_scope as (me uuid, all_p uuid[], mine_p uuid[], ctr text[]);

create or replace function quality.visible_scope(p_actions text[], p_kind text)
 RETURNS quality.visible_scope
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core', 'planfact'
AS $function$
declare
  c uuid := quality.request_company();
  s quality.visible_scope;
  v_all constant uuid := quality.any_project();
  v_extra uuid[]; g record; v_p uuid[]; m text; v_keys text[];
begin
  s := row(auth.uid(), '{}', '{}', '{}');
  if c is null or s.me is null then return s; end if;
  v_extra := quality.no_project() || array(select p.id from core.projects p where p.company_id = c and p.quality_container);
  for g in
    with acts as (
      select act from unnest(p_actions) act
       where exists (select 1 from core.company_modules cm where cm.company_id = c and cm.module = split_part(act, '.', 1) and cm.enabled))
    select x.act, true adm, null::uuid project_id, null::uuid counterparty_id, null::text[] r from acts x where planfact.is_platform_admin()
    union all
    select x.act, false, a.project_id, a.counterparty_id,
           array(select rp.action from core.company_role_permissions rp where rp.role_id = a.role_id and rp.company_id = a.company_id)
      from acts x join core.role_assignments a on a.company_id = c and a.user_id = s.me
       and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
       and exists (select 1 from core.company_role_permissions rp where rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = x.act)
     where not planfact.is_platform_admin()
  loop
    if g.adm then s.all_p := s.all_p || v_all; continue; end if;
    m := split_part(g.act, '.', 1);
    v_p := coalesce(g.project_id, v_all) || v_extra;
    if p_kind = 'owner' then
      if (m || '.manage') = any(g.r) then s.all_p := s.all_p || v_p; else s.mine_p := s.mine_p || v_p; end if;
    elsif 'quality.scope.company' = any(g.r) then s.all_p := s.all_p || v_all;
    elsif (m || '.manage') = any(g.r) then s.all_p := s.all_p || v_p;
    elsif 'quality.scope.contractor' = any(g.r) then
      if g.counterparty_id is not null then         -- как quality.contractor_matches
        v_keys := array(select l.canonical_key from quality.contractor_core_links l
                         where l.core_company_id = c and l.counterparty_id = g.counterparty_id
                        union
                        select quality.contractor_key(cp.name) from core.counterparties cp
                         where cp.id = g.counterparty_id and cp.company_id = c and cp.deleted_at is null);
        s.ctr := s.ctr || array(select pp::text || '/' || k from unnest(v_p) pp, unnest(v_keys) k where k <> 'unknown_contractor');
      end if;
    elsif p_kind = 'author' and (m || '.edit') = any(g.r) then s.mine_p := s.mine_p || v_p;
    else s.all_p := s.all_p || v_p;
    end if;
  end loop;
  return s;
end $function$;
comment on function quality.visible_scope(text[], text) is
  'P2-0078: области назначений для правил чтения quality.row_visible (Стройконтроль 1, черновики, очередь) — один раз на запрос';

create or replace function quality.visible_ok(s quality.visible_scope, p_project uuid, p_author uuid, p_assignee uuid, p_cname text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_all constant uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  k uuid := coalesce(p_project, '00000000-0000-0000-0000-000000000001'::uuid);   -- quality.no_project()
  v_key text;
begin
  if s.me is null then return false; end if;
  if s.all_p && array[k, v_all] then return true; end if;
  if coalesce(p_author = s.me or p_assignee = s.me, false) and s.mine_p && array[k, v_all] then return true; end if;
  if cardinality(s.ctr) > 0 and nullif(btrim(coalesce(p_cname, '')), '') is not null then
    v_key := quality.contractor_key(p_cname);
    return s.ctr && array[k::text || '/' || v_key, v_all::text || '/' || v_key];
  end if;
  return false;
end $function$;
comment on function quality.visible_ok(quality.visible_scope, uuid, uuid, uuid, text) is
  'P2-0078: видна ли запись по областям quality.visible_scope (без запросов к базе, на каждой строке)';

-- 2б. Правила core.row_allowed с местом (Стройконтроль 2.0): как core.row_allowed + core.assignment_allows. all_p / cp_p —
-- назначения без места (проект; «проект/фирма»), placed — назначения на место: ключи «проект/место» (и «/фирма») для каждого
-- места поддерева назначения, в т. ч. удалённых (как core.place_up); un_* — те же назначения для записи без места (признак
-- действия: mine — «нет», own — «своя», all — «все»). Запись без проекта — при любом назначении. Место записи всегда есть
-- в core.locations (внешний ключ), поэтому «без места» = core_location_id пуст.
create type quality.area_scope as (
  me uuid, all_p uuid[], cp_p text[], placed jsonb, has_loc boolean,
  un_all uuid[], un_mine uuid[], un_own uuid[], un_cp text[], un_own_cp text[]);

create or replace function quality.area_scope(p_actions text[])
 RETURNS quality.area_scope
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core', 'planfact'
AS $function$
declare
  c uuid := quality.request_company();
  s quality.area_scope;
  v_all constant uuid := quality.any_project();
  g record; v_p uuid[]; v_cp uuid; v_any boolean; v_sub uuid[]; v_keys text[] := '{}';
begin
  s := row(auth.uid(), '{}', '{}', '{}'::jsonb, false, '{}', '{}', '{}', '{}', '{}');
  if c is null or s.me is null then return s; end if;
  for g in
    with acts as (
      select pc.action act, pc.area_scoped, pc.unplaced from core.permission_catalog pc
       where pc.action = any(p_actions)
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
    if g.adm or 'quality.scope.company' = any(g.r) then s.all_p := s.all_p || v_all; continue; end if;
    v_p := array[coalesce(g.project_id, v_all), quality.no_project()];
    v_any := (split_part(g.act, '.', 1) || '.manage') = any(g.r) or not 'quality.scope.contractor' = any(g.r);
    v_cp := g.counterparty_id;
    if g.location_id is null then
      if v_any then s.all_p := s.all_p || v_p;
      elsif v_cp is not null then s.cp_p := s.cp_p || array(select pp::text || '/' || v_cp::text from unnest(v_p) pp); end if;
      continue;
    end if;
    s.has_loc := true;
    if g.unplaced is null and g.act like '%.view' then   -- без места: только своя и только просмотр, фирма не проверяется
      s.un_mine := s.un_mine || v_p;
    end if;
    continue when not v_any and v_cp is null;           -- «своя фирма» без фирмы — ничего больше
    v_sub := array(
      with recursive sub(id) as (
        select l.id from core.locations l where l.id = g.location_id
        union
        select ch.id from core.locations ch join sub on ch.parent_id = sub.id)
      select sub.id from sub);
    v_keys := v_keys || array(select pp::text || '/' || l::text || case when v_any then '' else '/' || v_cp::text end
                                from unnest(v_p) pp, unnest(v_sub) l);
    if g.unplaced is null then
      null;
    elsif g.unplaced = 'own' then
      if v_any then s.un_own := s.un_own || v_p;
      else s.un_own_cp := s.un_own_cp || array(select pp::text || '/' || v_cp::text from unnest(v_p) pp); end if;
    elsif v_any then s.un_all := s.un_all || v_p;
    else s.un_cp := s.un_cp || array(select pp::text || '/' || v_cp::text from unnest(v_p) pp);
    end if;
  end loop;
  s.placed := coalesce((select jsonb_object_agg(k, true) from (select distinct k from unnest(v_keys) k) x), '{}'::jsonb);
  return s;
end $function$;
comment on function quality.area_scope(text[]) is
  'P2-0078: области назначений (с местами) для правил чтения core.row_allowed — один раз на запрос; строку сверяет quality.area_ok';

create or replace function quality.area_ok(s quality.area_scope, p_project uuid, p_location uuid, p_author uuid, p_cp uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_all constant text := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  k uuid := coalesce(p_project, '00000000-0000-0000-0000-000000000001'::uuid);   -- quality.no_project()
  kc text[] := array[k::text || '/' || p_cp::text, v_all || '/' || p_cp::text];
begin
  if s.me is null then return false; end if;
  if s.all_p && array[k, v_all::uuid] then return true; end if;
  if p_cp is not null and s.cp_p && kc then return true; end if;
  if not s.has_loc then return false; end if;
  if p_location is not null then
    return s.placed ?| array[k::text || '/' || p_location::text, v_all || '/' || p_location::text,
                             k::text || '/' || p_location::text || '/' || p_cp::text, v_all || '/' || p_location::text || '/' || p_cp::text];
  end if;
  if p_author = s.me and s.un_mine && array[k, v_all::uuid] then return true; end if;
  if s.un_all && array[k, v_all::uuid] then return true; end if;
  if (p_author is null or p_author = s.me) and s.un_own && array[k, v_all::uuid] then return true; end if;
  if p_cp is not null then
    if s.un_cp && kc then return true; end if;
    if (p_author is null or p_author = s.me) and s.un_own_cp && kc then return true; end if;
  end if;
  return false;
end $function$;
comment on function quality.area_ok(quality.area_scope, uuid, uuid, uuid, uuid) is
  'P2-0078: видна ли запись по областям quality.area_scope (без запросов к базе, на каждой строке)';

revoke all on function quality.any_project(), quality.no_project(), quality.readable_projects(text[]), quality.read_scope(text[], text[]),
  quality.read_ok(quality.read_scope, uuid, uuid, uuid, uuid, uuid), quality.visible_scope(text[], text),
  quality.visible_ok(quality.visible_scope, uuid, uuid, uuid, text), quality.area_scope(text[]),
  quality.area_ok(quality.area_scope, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function quality.any_project(), quality.no_project(), quality.readable_projects(text[]), quality.read_scope(text[], text[]),
  quality.read_ok(quality.read_scope, uuid, uuid, uuid, uuid, uuid), quality.visible_scope(text[], text),
  quality.visible_ok(quality.visible_scope, uuid, uuid, uuid, text), quality.area_scope(text[]),
  quality.area_ok(quality.area_scope, uuid, uuid, uuid, uuid) to authenticated;
-- ключ фирмы по названию (чистая функция, без данных) — строку сверяет quality.visible_ok с правами вызывающего
grant execute on function quality.contractor_key(text) to authenticated;

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

-- 4. Этап 2 — остальные таблицы quality.* тем же шаблоном (правило — общая функция; списки — те же действия, что в 018 / 053).
-- Список для отката — тот же (059_rls_fast_down.sql).
do $$
declare r record;
begin
  -- quality.can(компания, проект, действия)
  for r in select * from (values
      ('allowed_projects', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('contractor_aliases', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('contractor_directory', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('contractor_normalization_queue', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('contractors', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('object_aliases', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('object_normalization_queue', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('project_objects', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('project_settings', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('rbi_company_settings', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('rbi_engineer_profiles', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('rbi_error_logs', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('construction_buildings', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('construction_floors', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('construction_floors_v2', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('construction_objects', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('construction_units', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('construction_units_v2', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('contracts', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('location_node_aliases', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('location_nodes', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('rbi_engineer_ratings', 'core_company_id', 'core_project_id', '{quality.view}'),
      ('sk_category_map', 'core_company_id', 'core_project_id', '{quality.sk.view}'),
      ('sk_contractor_map', 'core_company_id', 'core_project_id', '{quality.sk.view}'),
      ('sk_data_bundles', 'core_company_id', 'core_project_id', '{quality.sk.view}'),
      ('sk_import_batches', 'core_company_id', 'core_project_id', '{quality.sk.view}'),
      ('sk_mapping', 'core_company_id', 'core_project_id', '{quality.sk.view}'),
      ('sk_volumes', 'core_company_id', 'core_project_id', '{quality.sk.view}'),
      ('sk_links', 'company_id', 'project_id', '{quality.sk.view}'),
      ('shared_report_templates', 'core_company_id', 'core_project_id', '{quality.reports.view}'),
      -- библиотека компании — без проекта (7а 053)
      ('app_assistant_kb', 'core_company_id', null, '{quality.view}'),
      ('shared_checklists', 'core_company_id', null, '{quality.view}'),
      ('shared_docs', 'core_company_id', null, '{quality.view}'),
      ('shared_etalons', 'core_company_id', null, '{quality.view}'),
      ('shared_feedback', 'core_company_id', null, '{quality.view}'),
      ('shared_nodes', 'core_company_id', null, '{quality.view}'),
      ('shared_practices', 'core_company_id', null, '{quality.view}'),
      ('shared_twi_cards', 'core_company_id', null, '{quality.view}')) v(t, c, p, acts) loop
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using (%I = (select quality.request_company()) '
                   'and (select quality.readable_projects(%L)) && array[%s, quality.any_project()])',
                   r.t || '_select', r.t, r.c, r.acts,
                   case when r.p is null then 'quality.no_project()' else format('coalesce(%I, quality.no_project())', r.p) end);
  end loop;
  -- quality.rec_ok(компания, проект, объект, видеть все, своя, автор, исполнитель, фирма)
  for r in select * from (values
      ('project_fmea', '{quality.method.view}', '{quality.method.view,quality.method.edit}', 'core_created_by', 'null'),
      ('project_schedule_stages', '{quality.method.view}', '{quality.method.view,quality.method.edit}', 'core_created_by', 'null'),
      ('project_meetings', '{quality.meetings.view}', '{quality.meetings.view,quality.meetings.edit}', 'core_created_by', 'null'),
      ('project_interventions', '{quality.meetings.view}', '{quality.meetings.view,quality.meetings.edit}', 'core_created_by', 'null'),
      ('shared_reports', '{quality.reports.view}', '{quality.reports.view,quality.reports.edit}', 'core_created_by', 'null'),
      ('shared_report_snapshots', '{quality.reports.view}', '{quality.reports.view,quality.reports.edit}', 'core_created_by', 'null'),
      ('rbi_inspections', '{quality.inspections.view}', '{quality.inspections.view,quality.inspections.create}',
       'coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name))', 'null'),
      ('rbi_tasks', '{quality.tasks.view}', '{quality.tasks.view,quality.tasks.create,quality.tasks.work}',
       'coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name))', 'assigned_to_auth_user_id')) v(t, a_any, a_own, author, assignee) loop
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using (core_company_id = (select quality.request_company()) '
                   'and quality.read_ok((select quality.read_scope(%L, %L)), core_project_id, core_object_id, %s, %s, core_counterparty_id))',
                   r.t || '_select', r.t, r.a_any, r.a_own, r.author, r.assignee);
  end loop;
  -- quality.row_visible(компания, проект, действия, вид, автор, исполнитель, ключ фирмы, фирма)
  for r in select * from (values
      ('construction_acceptance', '{construction.view}', 'contractor', 'core_created_by', 'contractor'),
      ('construction_defects', '{construction.view}', 'contractor', 'core_created_by', 'contractor'),
      ('rbi_draft_sessions', '{quality.view}', 'owner',
       'coalesce(core_created_by, owner_auth_user_id, quality.member_by_email(core_company_id, engineer_name))', 'null'),
      ('rbi_sync_queue', '{quality.view,construction.view}', 'owner',
       'coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name))', 'null')) v(t, acts, kind, author, cname) loop
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using (core_company_id = (select quality.request_company()) '
                   'and quality.visible_ok((select quality.visible_scope(%L, %L)), core_project_id, %s, null, %s))',
                   r.t || '_select', r.t, r.acts, r.kind, r.author, r.cname);
  end loop;
  -- core.row_allowed с местом (Стройконтроль 2.0)
  for r in select * from (values
      ('construction_acceptance_v2', '{construction.acceptance.view}'),
      ('construction_defects_v2', '{construction.defects.view}')) v(t, acts) loop
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using (core_company_id = (select quality.request_company()) '
                   'and quality.area_ok((select quality.area_scope(%L)), core_project_id, core_location_id, core_created_by, core_counterparty_id))',
                   r.t || '_select', r.t, r.acts);
  end loop;
end $$;

-- 5. Этап 3 — файлы Качества (storage.objects, бакеты quality-*): чтение и сторож чтения звали quality.storage_can на КАЖДОМ
-- файле бакета (список папки — storage.search — 10 с). Теперь: компании, где у человека есть просмотр модуля бакета, — один раз
-- на запрос; файл — сравнение первой папки пути с этим списком. Смысл — как quality.storage_can (компания — первая папка, uuid
-- без учёта регистра; бакет quality-construction-* — Стройконтроль, quality-custom-assets — Качество или Стройконтроль, прочие
-- quality-* — Качество). Запись (insert / update / delete) не меняется.
create or replace function quality.storage_companies(p_mods text[])
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core', 'planfact'
AS $function$
  select coalesce(array_agg(c.id::text), '{}') from core.companies c
   where auth.uid() is not null and quality.has_actions(c.id, null, (select array_agg(m || '.view') from unnest(p_mods) m))
$function$;
comment on function quality.storage_companies(text[]) is
  'P2-0078: компании (id текстом), где у человека есть просмотр модулей бакета (как quality.storage_can, чтение) — для правил storage.objects';
revoke all on function quality.storage_companies(text[]) from public, anon;
grant execute on function quality.storage_companies(text[]) to authenticated;

drop policy quality_files_select on storage.objects;
create policy quality_files_select on storage.objects for select to authenticated using (
  bucket_id like 'quality-%'
  and lower(split_part(coalesce(name, ''), '/', 1)) = any (case
    when bucket_id like 'quality-construction-%' then (select quality.storage_companies('{construction}'))
    when bucket_id = 'quality-custom-assets' then (select quality.storage_companies('{quality,construction}'))
    else (select quality.storage_companies('{quality}')) end));
drop policy quality_files_guard_select on storage.objects;
create policy quality_files_guard_select on storage.objects as restrictive for select to authenticated using (
  case when bucket_id like 'quality-%' then lower(split_part(coalesce(name, ''), '/', 1)) = any (case
    when bucket_id like 'quality-construction-%' then (select quality.storage_companies('{construction}'))
    when bucket_id = 'quality-custom-assets' then (select quality.storage_companies('{quality,construction}'))
    else (select quality.storage_companies('{quality}')) end)
  else true end);

-- 6. Этап 5 — права План/Факта по всем моим объектам одним вызовом (прежде pf_my_permissions на каждый объект подряд: 19 вызовов
-- по 70–180 мс). Смысл — как pf_my_permissions (planfact.has_permission → core.has_grant, место не указано): модуль План/Факта
-- включён у компании объекта; администратор платформы — все действия каталога; иначе действие роли действующего назначения на
-- компанию или на этот объект (назначение на место — только для действий с областью). Объект без модуля — не в ответе (как «{}»).
-- Прежняя pf_my_permissions остаётся (совместимость, без сети — копия по объекту).
create or replace function public.pf_my_permissions_all(p_projects uuid[])
 RETURNS TABLE(project_id uuid, actions text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
  with adm as (select planfact.is_platform_admin() yes),
  asg as (
    select a.company_id, a.project_id, a.location_id, rp.action
      from core.role_assignments a
      join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id
     where a.user_id = auth.uid() and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))
  select pr.id, coalesce((
      select array_agg(c.action order by c.action) from core.permission_catalog c
       where (select yes from adm)
          or exists (select 1 from asg
                      where asg.company_id = pr.company_id and asg.action = c.action and (asg.project_id is null or asg.project_id = pr.id)
                        and (asg.location_id is null or c.area_scoped))), '{}')
    from core.projects pr
    join core.company_modules cm on cm.company_id = pr.company_id and cm.module = 'planfact' and cm.enabled
   where auth.uid() is not null and pr.id = any (p_projects[1:500])
$function$;
comment on function public.pf_my_permissions_all(uuid[]) is
  'P2-0078: права План/Факта по объектам (до 500) одним вызовом — то же, что pf_my_permissions по каждому';
revoke all on function public.pf_my_permissions_all(uuid[]) from public, anon;
grant execute on function public.pf_my_permissions_all(uuid[]) to authenticated;

-- Пункты и фото проверки (quality.inspection_child_ok, чтение): проверка есть и видна (её правило) — видно; проверки нет —
-- своё при просмотре или проведении проверок хоть где-то в компании. Видимые проверки — один раз на запрос (хеш).
do $$
declare t text;
begin
  foreach t in array array['rbi_inspection_items', 'rbi_inspection_photos'] loop
    execute format('drop policy %I on quality.%I', t || '_select', t);
    execute format('create policy %I on quality.%I for select to authenticated using ('
                   '(core_company_id, inspection_id) in (select i.core_company_id, i.id from quality.rbi_inspections i) '
                   'or (core_company_id = (select quality.request_company()) and core_created_by = (select auth.uid()) '
                   'and (select quality.has_anywhere(quality.request_company(), ''{quality.inspections.view,quality.inspections.create}'', null)) '
                   'and not quality.row_exists(''rbi_inspections'', inspection_id, core_company_id)))', t || '_select', t);
  end loop;
end $$;

commit;
