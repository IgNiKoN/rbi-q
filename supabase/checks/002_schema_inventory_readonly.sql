-- P2-0069 этап 4: ТОЛЬКО ЧТЕНИЕ. Ничего не меняет, строк данных не читает — только описание таблиц из pg_catalog.
-- Выполнить в SQL Editor сервера; результат — одна ячейка JSON: Results → Export → «Copy as JSON».
-- Сравнение с описью миграций: node scripts/schema-inventory.mjs --prod <файл.json>
with t as (
  select c.oid, n.nspname as s, c.relname as name, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and n.nspname in ('core', 'planfact', 'quality', 'public', 'p2_backup')
), detail as (
  select t.s || '.' || t.name as id, t.rls,
    coalesce((select to_jsonb(array(select a.attname from unnest(k.conkey) with ordinality u(num, o)
        join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.num order by u.o))
      from pg_constraint k where k.conrelid = t.oid and k.contype = 'p'), '[]'::jsonb) as pk,
    coalesce((select jsonb_object_agg(col, refs) from (
        select a.attname as col, jsonb_agg(distinct (select rn.nspname || '.' || rc.relname from pg_class rc join pg_namespace rn on rn.oid = rc.relnamespace where rc.oid = k.confrelid)) as refs
        from pg_constraint k cross join unnest(k.conkey) u(num) join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.num
        where k.conrelid = t.oid and k.contype = 'f' group by a.attname) f), '{}'::jsonb) as fk,
    (select jsonb_agg(jsonb_build_array(a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull) order by a.attnum)
      from pg_attribute a where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped) as cols
  from t
)
select jsonb_build_object(
  'source', 'боевой сервер, ' || to_char(now() at time zone 'Europe/Moscow', 'YYYY-MM-DD HH24:MI') || ' МСК',
  'counts', (select jsonb_object_agg(s, n) from (select n.nspname as s, count(*) as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p') and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast') group by 1) x),
  'tables', (select jsonb_agg(jsonb_build_object('id', id, 'rls', rls, 'pk', pk, 'fk', fk, 'cols', cols) order by id) from detail)
)::text as schema_inventory;
