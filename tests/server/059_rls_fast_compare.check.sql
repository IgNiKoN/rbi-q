-- P2-0078 (059), часть 2 из 2 — права чтения «до = после»: снимок ПОСЛЕ миграции и сравнение со снимком ДО
-- (059_rls_fast.seed.pglite.sql на схеме 057 → 059_rls_fast_up.sql → этот файл; та же сессия). Ожидаемых отличий нет:
-- каждый человек в каждой таблице видит ровно те же записи. Отчёт — ERROR P0001 «FAIL всего: N».
select pg_temp.capture_all('после');

do $$
declare n_all int; n_bad int; bad text; n_err int; errs text; n_rows int; n_seen int; n_tbl int;
begin
  select count(*) into n_all from public.t059 where phase = 'до';
  select count(*), string_agg(format('%s · %s · %s: только до %s, только после %s', b.variant, b.usr, b.tbl,
           (select count(*) from unnest(b.ids) i where not i = any(a.ids)), (select count(*) from unnest(a.ids) i where not i = any(b.ids))),
           E'\n' order by b.variant, b.usr, b.tbl)
    into n_bad, bad
    from public.t059 b join public.t059 a on a.phase = 'после' and a.variant = b.variant and a.usr = b.usr and a.tbl = b.tbl
   where b.phase = 'до' and (b.ids is distinct from a.ids or b.err is distinct from a.err);
  select count(*), string_agg(distinct format('%s %s: %s', phase, tbl, left(err, 160)), E'\n') into n_err, errs
    from public.t059 where err is not null;
  select count(*), sum(n) into n_tbl, n_rows from public.t059_tables where err is null;
  select coalesce(sum(cardinality(ids)), 0) into n_seen from public.t059 where phase = 'до';
  raise exception E'ОТЧЁТ 059 «до = после»: таблиц %, записей %, людей %, снимков % (видимых записей всего %), расхождений %, ошибок чтения %\n%\n%\nFAIL всего: %',
    n_tbl, n_rows, (select count(*) from public.t059_users), n_all, n_seen, n_bad, n_err, coalesce(left(bad, 6000), ''),
    coalesce(errs, '') || coalesce((select E'\nне засеяно: ' || string_agg(t || ' — ' || left(err, 160), E'\n') from public.t059_tables where err is not null), ''),
    n_bad + n_err + (select count(*) from public.t059_tables where err is not null)
    using errcode = 'P0001';
end $$;
