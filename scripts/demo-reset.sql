-- P2-0009. Сброс демо: удалить «Демо-компанию» со всеми её данными и учётки @demo.invalid. Выполняет ВЛАДЕЛЕЦ в SQL Editor.
-- «Альфа», «Бета», Quality не затрагиваются. Проверено на копии стенда (данные демо удалены, триггеры снова включены).
-- Сброс демо: защитные триггеры (журнал, неизменяемые ВОР / КП / КС-2 / факт) отключаются только на время удаления, в одной транзакции.
begin;
alter table core.audit_log disable trigger audit_log_no_change;
alter table planfact.fact_entries disable trigger fact_entries_guard;
alter table planfact.kp_revisions disable trigger kp_revisions_guard;
alter table planfact.ks2_acts disable trigger ks2_acts_guard;
alter table planfact.ks2_revisions disable trigger ks2_revisions_guard;
alter table planfact.vor_imports disable trigger vor_imports_guard;
alter table planfact.vor_links disable trigger vor_links_guard;
alter table planfact.vor_positions disable trigger vor_positions_guard;
alter table planfact.vor_source_rows disable trigger vor_source_rows_guard;
create temp table demo_p on commit drop as
  select p.id from core.projects p join core.companies c on c.id = p.company_id where c.name = 'Демо-компания' and c.is_test;
update planfact.ks2_acts set status = 'draft', issued_revision_id = null, issued_at = null, issued_by = null where project_id in (select id from demo_p);
delete from planfact.ks2_revisions where project_id in (select id from demo_p);
delete from planfact.ks2_acts where project_id in (select id from demo_p);
delete from planfact.ks2_settings where project_id in (select id from demo_p);
delete from planfact.fact_entries where project_id in (select id from demo_p);
delete from planfact.kp_revisions where project_id in (select id from demo_p);
delete from planfact.estimates where project_id in (select id from demo_p);
delete from planfact.vor_links where project_id in (select id from demo_p);
delete from planfact.vor_positions where project_id in (select id from demo_p);
delete from planfact.vor_source_rows where project_id in (select id from demo_p);
delete from planfact.vor_imports where project_id in (select id from demo_p);
delete from core.projects where id in (select id from demo_p);
delete from core.companies where name = 'Демо-компания' and is_test;
alter table core.audit_log enable trigger audit_log_no_change;
alter table planfact.fact_entries enable trigger fact_entries_guard;
alter table planfact.kp_revisions enable trigger kp_revisions_guard;
alter table planfact.ks2_acts enable trigger ks2_acts_guard;
alter table planfact.ks2_revisions enable trigger ks2_revisions_guard;
alter table planfact.vor_imports enable trigger vor_imports_guard;
alter table planfact.vor_links enable trigger vor_links_guard;
alter table planfact.vor_positions enable trigger vor_positions_guard;
alter table planfact.vor_source_rows enable trigger vor_source_rows_guard;
delete from auth.users where email like '%@demo.invalid';
commit;
