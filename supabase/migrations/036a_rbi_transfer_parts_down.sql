-- P2-0036. Откат 036a: функция переноса пачками удаляется (перенесённые строки не трогает).
begin;
drop function if exists quality.rbi_transfer_run_part(uuid, text[], boolean);
commit;
