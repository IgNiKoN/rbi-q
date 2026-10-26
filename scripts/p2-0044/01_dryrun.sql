-- P2-0044 этап 1: пробная привязка замечаний/приёмок Стройконтроля 2.0 к контрагенту ядра (ТОЛЬКО ЧТЕНИЕ).
-- Как будет считать 043: "contractorId" → справочник фирм объекта quality.contractor_directory (или quality.contractors)
-- → ключ и название → quality.counterparty_of (связь ключа или контрагент с тем же ключом названия; две/ни одной — пусто).
with r as (
  select 'construction_defects_v2' t, d.core_company_id c, d."contractorId" cid, d.is_deleted del from quality.construction_defects_v2 d
  union all
  select 'construction_acceptance_v2', a.core_company_id, a."contractorId", a.is_deleted from quality.construction_acceptance_v2 a
), m as (
  select r.t, r.c, r.cid, r.del, s.k, s.nm,
         case when r.cid is null or btrim(r.cid) = '' then 'нет подрядчика'
              when s.k is null then 'нет в справочниках'
              when quality.counterparty_of(r.c, s.k, s.nm) is null then 'не разобрано'
              else 'привязано' end st
    from r
    left join lateral (
      select coalesce(dd.canonical_key, kk.canonical_key) k, coalesce(dd.display_name, kk."displayName") nm
        from (select 1) one
        left join quality.contractor_directory dd on dd.id::text = r.cid and dd.core_company_id = r.c
        left join quality.contractors kk on kk.id = r.cid and kk.core_company_id = r.c) s on true
)
select t, st, count(*) n, count(*) filter (where not del) live, string_agg(distinct coalesce(nm, cid), ', ') examples
  from m group by t, st order by t, st;
