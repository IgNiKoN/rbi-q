-- P2-0016 этап 1: снимок структуры таблиц public и бакетов Storage (ТОЛЬКО ЧТЕНИЕ — ни данных, ни политик не выводит).
-- Одна строка на таблицу: вид | имя | колонки | ограничения | индексы. Разделители: поле « ¦ », элемент « ‖ ».
select 't' as k, c.relname::text as name,
  (select string_agg(concat_ws(' ¦ ', a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull::text,
                               coalesce(pg_get_expr(d.adbin, d.adrelid), ''), a.attidentity::text || a.attgenerated::text), ' ‖ ' order by a.attnum)
     from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as cols,
  (select string_agg(concat_ws(' ¦ ', x.conname, x.contype::text, pg_get_constraintdef(x.oid)), ' ‖ ' order by x.conname)
     from pg_constraint x where x.conrelid = c.oid) as cons,
  (select string_agg(concat_ws(' ¦ ', i.indexname, i.indexdef), ' ‖ ' order by i.indexname)
     from pg_indexes i where i.schemaname = 'public' and i.tablename = c.relname
      and not exists (select 1 from pg_constraint x where x.conrelid = c.oid and x.conname = i.indexname)) as idx
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
union all
select 'b', b.id, concat_ws(' ¦ ', b.public::text, coalesce(b.file_size_limit::text, ''), coalesce(array_to_string(b.allowed_mime_types, ','), '')), null, null
from storage.buckets b
order by 1 desc, 2;
