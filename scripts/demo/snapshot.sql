-- P2-0053. Снимок «до / после» (ТОЛЬКО ЧТЕНИЕ) для выкладки «ЖК Демо» на боевой: по каждой таблице core / planfact / quality —
-- число строк и отпечаток (md5) строк НЕ демо-компании, изменённых до момента T0 (РБИ работает и во время выкладки — свежие
-- записи сотрудников в сверку не входят); учётки не zd-…@demo.invalid. T0 — одна и та же метка до 057 и после засева
-- (поставить в первой строке ниже перед первым запуском). Выполнить в SQL Editor до 057 и после засева; результат («Copy as
-- JSON») — в reports/P2-0053/release/. Разные отпечатки у не демо-компаний — откат.
with p as (select '2026-11-01 00:00:00+03'::timestamptz t0),
t as (
  select c.table_schema s, c.table_name tb, max(c.column_name) filter (where c.column_name in ('company_id', 'core_company_id')) col,
         max(c.column_name) filter (where c.column_name in ('updated_at', 'created_at', 'at')) ts
    from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
   where c.table_schema in ('core', 'planfact', 'quality') and c.column_name in ('company_id', 'core_company_id', 'updated_at', 'created_at', 'at')
   group by 1, 2)
select jsonb_object_agg(s || '.' || tb, (xpath('/row/c/text()', query_to_xml(format(
         'select count(*)::text || '':'' || coalesce(md5(string_agg(md5(x::text), '','' order by md5(x::text))), ''-'') c from %I.%I x
           where not coalesce(%I in (select id from core.companies where %s), false) %s',
         s, tb, col, case when exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'companies' and column_name = 'is_demo')
                           then 'is_demo' else 'false' end,
         case when ts is not null then format('and %I < %L', ts, (select t0 from p)) else '' end), false, true, '')))[1]::text order by s, tb)
       || jsonb_build_object('auth.users (не zd-, до T0)', (select count(*) from auth.users where email not like 'zd-%@demo.invalid' and created_at < (select t0 from p)))
  from t where col is not null;
