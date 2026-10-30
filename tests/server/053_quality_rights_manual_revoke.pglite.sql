-- P2-0071 (053), доработка №1 — откат после ручного отзыва, часть 1 из 2: после 053 администратор снимает «инженеру ЖК-1» его
-- перенесённое назначение на ЖК-1 (как «Сотрудники → Отозвать»). Порядок: 053_quality_rights.seed.pglite.sql (схема 052) →
-- 053_quality_rights_up.sql → этот файл → 053_quality_rights_down.sql → 053_quality_rights_rollback.check.sql.
create table public.t053_rb as
select u.k, j.old_id, j.new_id from p2_backup.m053_assignments j
  join core.role_assignments a on a.id = j.old_id join public.t053_users u on u.id = a.user_id
 where j.kind = 'object';
update core.role_assignments set revoked_at = now(), revoked_by = current_setting('m53.adm')::uuid
 where id in (select new_id from public.t053_rb where k = 'инженер ЖК-1');
