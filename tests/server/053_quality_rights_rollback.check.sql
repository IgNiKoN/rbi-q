-- P2-0071 (053), доработка №1 — откат после ручного отзыва, часть 2 из 2 (после 053_quality_rights_down.sql): прежнее назначение
-- «инженера ЖК-1» (снятого вручную после 053) не вернулось; у «инженера ЖК-1 и ЖК-2» — вернулось; перенесённых назначений нет;
-- контейнер, созданный 053 у компании Б, удалён. Отчёт — ERROR P0001 «FAIL всего: N».
do $$
declare res text := ''; cb uuid := current_setting('m53.cb')::uuid;
begin
  if exists (select 1 from core.role_assignments a join public.t053_rb r on r.old_id = a.id where r.k = 'инженер ЖК-1' and a.revoked_at is null) then
    res := res || E'FAIL снятый вручную после 053 — доступ вернулся при откате\n';
  end if;
  if exists (select 1 from core.role_assignments a join public.t053_rb r on r.old_id = a.id where r.k = 'инженер ЖК-1 и ЖК-2' and a.revoked_at is not null) then
    res := res || E'FAIL прежнее назначение не восстановлено\n';
  end if;
  if exists (select 1 from core.role_assignments a join public.t053_rb r on r.new_id = a.id) then
    res := res || E'FAIL перенесённые назначения остались\n';
  end if;
  if exists (select 1 from core.projects where company_id = cb and quality_container and archived_at is null) then
    res := res || E'FAIL созданный контейнер компании Б не убран\n';
  end if;
  raise exception E'%FAIL всего: %', res, (length(res) - length(replace(res, 'FAIL ', ''))) / 5 using errcode = 'P0001';
end $$;
