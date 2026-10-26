-- P2-0045 этап 2: живые записи v2 без объекта — куда указывает "locationId" (ТОЛЬКО ЧТЕНИЕ).
with r as (
  select 'замечание' t, d.core_company_id c, d."locationId" loc from quality.construction_defects_v2 d where not d.is_deleted
  union all
  select 'приёмка', a.core_company_id, a."locationId" from quality.construction_acceptance_v2 a where not a.is_deleted
)
select string_agg(format('%s | loc=%s | узел: %s %s %s | родитель: %s %s %s', r.t, coalesce(r.loc, '(пусто)'),
         coalesce(n."nodeType", '-'), coalesce(n."displayName", 'НЕТ УЗЛА'), case when n.is_deleted then '(удалён)' else '' end,
         coalesce(p."nodeType", '-'), coalesce(p."displayName", '-'), case when p.is_deleted then '(удалён)' else '' end), E'\n') lines
  from r left join quality.location_nodes n on n.core_company_id = r.c and n.id = r.loc
  left join quality.location_nodes p on p.core_company_id = r.c and p.id = n."parentId";
