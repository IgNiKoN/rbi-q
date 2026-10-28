-- P2-0055: откат 049_structure_editor_up.sql — функции переноса, копии в выбранное место и восстановления сняты;
-- прежний pf_copy_place(3 арг.) не менялся. Данные мест не трогаются (перенесённые и восстановленные места остаются как есть).
-- Проверка на PGlite: schema_fingerprint до up и после down совпадает.
begin;
do $$
begin
  if to_regprocedure('public.pf_move_place(uuid, uuid, uuid)') is null then
    raise exception '049 down: 049 не применена' using errcode = 'P0001';
  end if;
end $$;

drop function public.pf_next_build_no(uuid);
drop function public.pf_restore_place(uuid);
drop function public.pf_copy_place(uuid, uuid, text, uuid);
drop function public.pf_move_place(uuid, uuid, uuid);

commit;
