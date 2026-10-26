-- P2-0045 этап 1: узлы Качества вне дерева объекта — почему (ТОЛЬКО ЧТЕНИЕ).
with recursive n as (select * from quality.location_nodes where not is_deleted),
up as (                                         -- путь вверх от каждого узла не-объекта
  select n.core_company_id c, n.id start, n.id cur, n."parentId" pid, 0 lvl from n
   where not (n."nodeType" = 'object' and coalesce(n."parentId", '') = '')
  union all
  select up.c, up.start, p.id, p."parentId", up.lvl + 1
    from up join quality.location_nodes p on p.core_company_id = up.c and p.id = up.pid
   where up.lvl < 20 and not p.is_deleted
     and not (p."nodeType" = 'object' and coalesce(p."parentId", '') = '')
), top as (                                     -- последний достигнутый узел пути
  select distinct on (c, start) c, start, cur, pid from up order by c, start, lvl desc
), why as (
  select t.c, s."nodeType" nt, s."displayName" nm,
         case when coalesce(t.pid, '') = '' then 'корень не объект (тип ' || coalesce(r."nodeType", '-') || ': ' || coalesce(r."displayName", '') || ')'
              when p.id is null then 'родителя нет в базе'
              when p.is_deleted then 'родитель удалён (' || coalesce(p."nodeType", '-') || ': ' || coalesce(p."displayName", '') || ')'
              when p."nodeType" = 'object' and coalesce(p."parentId", '') = '' then 'в дереве'
              else 'другое' end reason
    from top t join n s on s.core_company_id = t.c and s.id = t.start
    left join quality.location_nodes r on r.core_company_id = t.c and r.id = t.cur
    left join quality.location_nodes p on p.core_company_id = t.c and p.id = t.pid
)
select co.name company, w.reason, w.nt, count(*) n, left(string_agg(w.nm, ', '), 200) examples
  from why w join core.companies co on co.id = w.c
 where w.reason <> 'в дереве'
 group by 1, 2, 3 order by 1, 2, 3;
