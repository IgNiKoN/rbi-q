-- P2-0045 этап 1: пробная привязка дерева мест Качества к общему дереву платформы core.locations (ТОЛЬКО ЧТЕНИЕ).
-- Как будет считать 044: корневой узел-объект ("nodeType" = 'object', без родителя) → объект Качества с тем же названием
-- (quality.node_names && quality.po_names, как 039b) → объект ядра (core_object_id); узлы ниже объекта → места core.locations
-- (глубина 1 = прямые дети объекта, ≤ 6; родитель — место узла-родителя); тип узла → node_type (building/section/floor/apartment/other).
-- Итог по компаниям: сколько мест ляжет и список проблем (не угадывать — решение владельца).
with recursive n as (
  select n.*, quality.node_names(n) nm from quality.location_nodes n where not n.is_deleted
), obj as (                                    -- корневые узлы-объекты и их объект ядра
  select n.core_company_id c, n.id, n."displayName" name,
         (select array_agg(distinct po.core_object_id) from quality.project_objects po
           where po.core_company_id = n.core_company_id and quality.object_alive(po) and quality.po_names(po) && n.nm
             and po.core_object_id is not null) core
    from n where n."nodeType" = 'object' and coalesce(n."parentId", '') = ''
), t as (                                      -- дерево вниз от объекта
  select n.core_company_id c, n.id, n."parentId" pid, n."nodeType" nt, n."displayName" name, o.id obj, o.core, 1 depth
    from n join obj o on o.c = n.core_company_id and n."parentId" = o.id
  union all
  select n.core_company_id, n.id, n."parentId", n."nodeType", n."displayName", t.obj, t.core, t.depth + 1
    from n join t on t.c = n.core_company_id and n."parentId" = t.id
), dup as (                                    -- одинаковые имена у одного родителя (уникальность core.locations)
  select c, pid, planfact.canon_name(coalesce(name, '')) k, count(*) k_n from t group by 1, 2, 3 having count(*) > 1
), issues as (
  select c, 'места к созданию' what, count(*) n, null::text ex from t where cardinality(core) = 1 and depth <= 6 group by c
  union all
  select c, 'объект без объекта ядра', count(*), string_agg(name, ', ') from obj where core is null group by c
  union all
  select c, 'объект → несколько объектов ядра', count(*), string_agg(name, ', ') from obj where cardinality(core) > 1 group by c
  union all
  select c, 'тип узла: ' || coalesce(nt, '(пусто)'), count(*), string_agg(distinct name, ', ') from t
   where coalesce(nt, '') not in ('building', 'section', 'floor', 'apartment') group by c, nt
  union all
  select c, 'глубина > 6', count(*), string_agg(name, ', ') from t where depth > 6 group by c
  union all
  select c, 'пустое имя', count(*), null from t where btrim(coalesce(name, '')) = '' group by c
  union all
  select d.c, 'дубли имён у родителя', sum(k_n), string_agg(distinct d.k, ', ') from dup d group by d.c
  union all
  select n.core_company_id, 'узел вне дерева объекта (нет живого родителя-объекта)', count(*), string_agg(n."displayName", ', ')
    from n where not (n."nodeType" = 'object' and coalesce(n."parentId", '') = '')
     and not exists (select 1 from t where t.c = n.core_company_id and t.id = n.id) group by n.core_company_id
  union all
  select c, 'места ядра уже есть у объекта', count(*), null from (
    select distinct o.c, l.id from obj o join core.locations l on l.project_id = any(o.core) and l.deleted_at is null) z group by c
)
select co.name company, i.what, i.n, left(i.ex, 300) examples
  from issues i join core.companies co on co.id = i.c
 order by co.name, i.what;
