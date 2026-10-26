-- P2-0044: назначения тестовой учётки alfa-foreman и действия ролей (ТОЛЬКО ЧТЕНИЕ); строки v2 автопроверок — объект.
select 'assignment' k, r.name || ' | project=' || coalesce(a.project_id::text, 'вся компания') || ' | revoked=' || (a.revoked_at is not null)
       || ' | ' || array_to_string(array(select rp.action from core.company_role_permissions rp where rp.role_id = a.role_id order by 1), ',') v
  from core.role_assignments a join core.company_roles r on r.id = a.role_id join auth.users u on u.id = a.user_id
 where u.email = 'alfa-foreman@test.invalid' and a.revoked_at is null
union all
select 'v2_rows_project', coalesce(core_project_id::text, 'null') || ' x' || count(*) from quality.construction_defects_v2 group by core_project_id;
