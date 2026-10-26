-- P2-0027 этап 2. Сверка по объектам и людям (только чтение): проверок (всего / не удалённых), пунктов, фото-записей,
-- и совпадение содержимого оценок (metrics всех проверок объекта/инженера — md5) старое (public) = новое (quality, компания RBI).
with c as (select id from core.companies where name = 'RBI'),
old_i as (select * from public.rbi_inspections where project_code in (select old_code from quality.rbi_transfer_projects where core_company_id = (select id from c))),
new_i as (select * from quality.rbi_inspections where core_company_id = (select id from c)),
g as (
  select 'объект' kind, lower(coalesce(project_canonical_key, '—')) k, 'old' side, id, is_deleted, metrics from old_i
  union all select 'объект', lower(coalesce(project_canonical_key, '—')), 'new', id, is_deleted, metrics from new_i
  union all select 'инженер', coalesce(engineer_name, '—'), 'old', id, is_deleted, metrics from old_i
  union all select 'инженер', coalesce(engineer_name, '—'), 'new', id, is_deleted, metrics from new_i
),
items as (
  select i.inspection_id, 'old' side, count(*) n from public.rbi_inspection_items i where i.inspection_id in (select id from old_i) group by 1
  union all select i.inspection_id, 'new', count(*) from quality.rbi_inspection_items i where i.core_company_id = (select id from c) group by 1
),
photos as (
  select f.inspection_id, 'old' side, count(*) n from public.rbi_inspection_photos f where f.inspection_id in (select id from old_i) group by 1
  union all select f.inspection_id, 'new', count(*) from quality.rbi_inspection_photos f where f.core_company_id = (select id from c) group by 1
),
s as (
  select g.kind, g.k, g.side, count(*) n, count(*) filter (where not coalesce(g.is_deleted, false)) live,
         sum(coalesce(it.n, 0)) items, sum(coalesce(ph.n, 0)) photos, md5(string_agg(coalesce(g.metrics::text, ''), '|' order by g.id)) m
    from g left join items it on it.inspection_id = g.id and it.side = g.side left join photos ph on ph.inspection_id = g.id and ph.side = g.side
   group by 1, 2, 3
)
select o.kind, o.k, o.n || ' / ' || coalesce(n.n, 0) "проверок старое/новое", o.live || ' / ' || coalesce(n.live, 0) "не удалённых",
       o.items || ' / ' || coalesce(n.items, 0) "пунктов", o.photos || ' / ' || coalesce(n.photos, 0) "фото",
       (o.n = n.n and o.live = n.live and o.items = n.items and o.photos = n.photos and o.m = n.m) ok
  from s o left join s n on n.kind = o.kind and n.k = o.k and n.side = 'new'
 where o.side = 'old'
 order by ok, o.kind, o.k;
