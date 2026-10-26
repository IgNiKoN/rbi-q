-- P2-0044 этап 1: куда указывают "contractorId" замечаний/приёмок v2 (ТОЛЬКО ЧТЕНИЕ).
with r as (
  select 'defects' t, d.core_company_id c, d."contractorId" cid, d.is_deleted del, d.created_at from quality.construction_defects_v2 d where coalesce(d."contractorId", '') <> ''
  union all
  select 'acceptance', a.core_company_id, a."contractorId", a.is_deleted, a.created_at from quality.construction_acceptance_v2 a where coalesce(a."contractorId", '') <> ''
)
select r.t, r.cid,
  (select count(*) from quality.contractors k where k.id = r.cid) in_quality_any_company,
  (select string_agg(cp.name || ' [' || cp.company_id || ']', '; ') from core.counterparties cp where cp.id::text = r.cid) core_counterparty,
  (select count(*) from public.contractors pc where pc.id = r.cid) in_public_contractors,
  (select max(pc."displayName") from public.contractors pc where pc.id = r.cid) public_name,
  r.del, r.created_at::date
from r order by r.t, r.created_at;
