-- P2-0027 этап 1. Как задачи связаны с объектом и проверкой — ТОЛЬКО ЧТЕНИЕ.
select * from (
  select 1 o, 'key' s, coalesce(project_canonical_key, 'null') || ' / ' || coalesce(project_display_name, 'null') k, count(*)::text v
    from public.rbi_tasks group by 3 order by 4 desc limit 8
) a
union all
select * from (
  select 2, 'data_keys', k, count(*)::text
    from public.rbi_tasks, jsonb_object_keys(case when jsonb_typeof(task_data) = 'object' then task_data else '{}' end) k
   group by k order by 4 desc limit 45
) b
union all
select 3, 'cols', 'rbi_tasks', string_agg(column_name, ',') from information_schema.columns where table_schema = 'public' and table_name = 'rbi_tasks'
order by 1, 4 desc;
