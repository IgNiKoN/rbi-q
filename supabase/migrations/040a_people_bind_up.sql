-- P2-0035b этап 1 (ADR-070): разовая привязка старых записей Качества к учёткам по ФИО — только то, что узнаётся однозначно.
-- Решения владельца 26.10.2026: спорные не угадывать; «Латвшев Е.В.» (опечатка) — это Латышев Е.В.; тестовые учётки старого
-- РБИ (почта …@rbi-quality.local, не сотрудники компании) — скрыть из рейтинга (данные не удаляются).
-- Перед изменениями — копия профилей и рейтингов (quality.p2_0035b_backup_*); каждое изменение — в quality.p2_0035b_changes
-- (откат — 040a_people_bind_down.sql). Заполняются только пустые поля номера; ФИО-подписи не трогаются.
-- Очередь отправки (rbi_sync_queue) не трогается: автор там неизменяем (триггер 020), строки уже отправлены.
-- Пробный отчёт до и после — scripts/p2-0035b/dryrun.sql, сверка по сотрудникам — scripts/p2-0035b/snapshot.sql.
begin;

do $$
begin
  if to_regclass('quality.p2_0035b_changes') is not null then
    raise exception '040a уже применена (повтор — только после 040a_people_bind_down.sql)' using errcode = 'P0001';
  end if;
  if to_regprocedure('core.staff_name_aliases(uuid,text)') is null then
    raise exception '040a: сначала 032a' using errcode = 'P0001';
  end if;
end $$;

create table quality.p2_0035b_backup_profiles as select * from quality.rbi_engineer_profiles;
create table quality.p2_0035b_backup_ratings as select * from quality.rbi_engineer_ratings;
create table quality.p2_0035b_changes (t text not null, id text not null, col text not null, old_value text, new_value text,
  changed_at timestamptz not null default now());
revoke all on quality.p2_0035b_backup_profiles, quality.p2_0035b_backup_ratings, quality.p2_0035b_changes from public, anon, authenticated;

-- Синонимы сотрудников компании (нижний регистр): ФИО, почта, имена старых профилей РБИ; плюс опечатка по решению владельца.
create temp table p2b_people on commit drop as
  select m.company_id, m.user_id, a.alias
    from core.company_members m
    left join core.user_profiles up on up.user_id = m.user_id
    cross join lateral unnest(core.staff_name_aliases(m.user_id, up.full_name)) a(alias);
insert into p2b_people
  select m.company_id, m.user_id, 'латвшев е.в.'
    from core.company_members m join core.user_profiles up on up.user_id = m.user_id
   where lower(btrim(up.full_name)) = 'латышев е.в.';

-- Однозначное совпадение: ровно одна учётка компании с таким именем
create temp table p2b_unique on commit drop as
  select company_id, alias, min(user_id::text)::uuid user_id
    from p2b_people group by company_id, alias having count(distinct user_id) = 1;

-- Пустое поле номера ← однозначно узнанная учётка; журнал изменений
create function pg_temp.bind(p_table text, p_key text, p_id_col text) returns integer language plpgsql as $f$
declare n integer;
begin
  execute format(
    'with c as (select x.%2$I::text id, u.user_id from quality.%1$I x
                  join p2b_unique u on u.company_id = x.core_company_id and u.alias = lower(btrim(x.engineer_name))
                 where x.%3$I is null and nullif(btrim(x.engineer_name), '''') is not null),
          l as (insert into quality.p2_0035b_changes(t, id, col, old_value, new_value) select %1$L, c.id, %3$L, null, c.user_id::text from c returning 1),
          w as (update quality.%1$I x set %3$I = c.user_id from c where x.%2$I::text = c.id returning 1)
     select (select count(*) from w)', p_table, p_key, p_id_col) into n;
  return n;
end $f$;

do $$
declare n_tasks int; n_drafts int; n_prof int; n_rate int; n_hidden int;
begin
  n_tasks  := pg_temp.bind('rbi_tasks', 'id', 'assigned_to_auth_user_id');      -- «Мои задачи» — по номеру того, кому задача
  n_drafts := pg_temp.bind('rbi_draft_sessions', 'id', 'owner_auth_user_id');
  n_prof   := pg_temp.bind('rbi_engineer_profiles', 'id', 'auth_user_id');
  n_rate   := pg_temp.bind('rbi_engineer_ratings', 'id', 'auth_user_id');
  -- Тестовые учётки старого РБИ (…@rbi-quality.local, не сотрудники компании) — скрыть из рейтинга
  with c as (select r.id from quality.rbi_engineer_ratings r join auth.users u on u.id = r.auth_user_id
              where lower(u.email::text) like '%@rbi-quality.local' and coalesce(r.is_deleted, false) = false
                and not exists (select 1 from core.company_members m where m.company_id = r.core_company_id and m.user_id = r.auth_user_id)),
       l as (insert into quality.p2_0035b_changes(t, id, col, old_value, new_value) select 'rbi_engineer_ratings', c.id, 'is_deleted', 'false', 'true' from c returning 1)
  update quality.rbi_engineer_ratings r set is_deleted = true, deleted_at = now() from c where r.id = c.id;
  get diagnostics n_hidden = row_count;
  raise notice 'P2-0035b 040a: задачи %, черновики %, профили %, рейтинги %, скрыто тестовых из рейтинга %',
    n_tasks, n_drafts, n_prof, n_rate, n_hidden;
end $$;

commit;
