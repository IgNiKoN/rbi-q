-- P2-0016 этап 1: структура quality.<таблица> = public.<таблица> + core_company_id, core_project_id (ТОЛЬКО ЧТЕНИЕ).
-- Сравниваются колонки (имя, тип, обязательность, значение по умолчанию, порядок), ограничения и индексы.
-- Допустимые отличия 018: уникальности и внешние ключи — в пределах компании (+ core_company_id), служебные ключи/индекс компании.
-- Отчёт — ERROR P0001 с «FAIL всего: N».
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
create or replace function pg_temp.cols(s text, t text) returns text language sql as $f$
  select string_agg(concat_ws(' ¦ ', a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull::text,
                              coalesce(pg_get_expr(d.adbin, d.adrelid), '')), ' ‖ ' order by a.attnum)
  from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = (s || '.' || t)::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname not in ('core_company_id', 'core_project_id') $f$;
create or replace function pg_temp.norm(x text) returns text language sql as $f$
  select regexp_replace(replace(replace(replace(x, 'core_company_id, ', ''), ', core_company_id)', ')'), 'quality.', ''), ' ON public.', ' ON ') $f$;
create or replace function pg_temp.cons(s text, t text) returns text language sql as $f$
  select coalesce(string_agg(x.conname || ' ' || pg_temp.norm(pg_get_constraintdef(x.oid)), ' ‖ ' order by x.conname), '')
  from pg_constraint x where x.conrelid = (s || '.' || t)::regclass
    and x.conname not like '%\_core\_project\_fk' and x.conname not like '%\_core\_company\_id\_fkey' and x.conname not like '%\_company\_key' and x.contype <> 'n' $f$;
create or replace function pg_temp.idx(s text, t text) returns text language sql as $f$
  select coalesce(string_agg(i.indexname || ' ' || pg_temp.norm(replace(i.indexdef, ' ON ' || s || '.', ' ON ')), ' ‖ ' order by i.indexname), '')
  from pg_indexes i where i.schemaname = s and i.tablename = t and i.indexname not like '%\_core\_company\_idx'
    and not exists (select 1 from pg_constraint x where x.conrelid = (s || '.' || t)::regclass and x.conname = i.indexname) $f$;

do $$
declare r record; res text := ''; n int := 0; v text;
begin
  for r in select tablename t from pg_tables where schemaname = 'quality' and tablename <> 'contractor_core_links' order by 1 loop
    n := n + 1;
    if to_regclass('public.' || r.t) is null then res := res || pg_temp.t(false, r.t || ': нет public.' || r.t); continue; end if;
    res := res || pg_temp.t(pg_temp.cols('quality', r.t) = pg_temp.cols('public', r.t), r.t || ': колонки отличаются');
    res := res || pg_temp.t(pg_temp.cons('quality', r.t) = pg_temp.cons('public', r.t),
      r.t || E': ограничения\n  quality: ' || pg_temp.cons('quality', r.t) || E'\n  public:  ' || pg_temp.cons('public', r.t));
    res := res || pg_temp.t(pg_temp.idx('quality', r.t) = pg_temp.idx('public', r.t),
      r.t || E': индексы\n  quality: ' || pg_temp.idx('quality', r.t) || E'\n  public:  ' || pg_temp.idx('public', r.t));
    select format_type(atttypid, atttypmod) || attnotnull::text into v from pg_attribute
     where attrelid = ('quality.' || r.t)::regclass and attname = 'core_company_id';
    res := res || pg_temp.t(v = 'uuidtrue', r.t || ': core_company_id uuid not null');
  end loop;
  res := res || pg_temp.t(n = 55, 'таблиц quality: ' || n || ' из 55');
  raise exception E'ОТЧЁТ (только чтение), таблиц %:\n%\nFAIL всего: %', n, res, (length(res) - length(replace(res, 'FAIL', ''))) / 4;
end $$;
