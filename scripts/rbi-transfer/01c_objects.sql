-- P2-0027 этап 1. Объекты РБИ внутри проекта rbi-test (ключ объекта записей) и почта администратора платформы — ТОЛЬКО ЧТЕНИЕ.
select 'object' s, coalesce(project_canonical_key, '—') k,
       count(*) || ' проверок · ' || (select count(*) from public.rbi_tasks t where t.project_canonical_key is not distinct from i.project_canonical_key) || ' задач · '
       || (select count(*) from public.rbi_inspection_photos f where f.inspection_id in (select id from public.rbi_inspections x where x.project_canonical_key is not distinct from i.project_canonical_key)) || ' фото · '
       || coalesce(max(project_display_name), '') v
  from public.rbi_inspections i where project_code = 'rbi-test' group by project_canonical_key
union all
select 'platform_admin', u.email, a.created_at::date::text from core.platform_admins a join auth.users u on u.id = a.user_id
order by 1, 2;
