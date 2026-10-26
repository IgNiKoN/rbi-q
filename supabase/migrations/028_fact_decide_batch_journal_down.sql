-- P2-0020: откат 028_fact_decide_batch_journal_up.sql — удалить pf_fact_decide_batch и pf_fact_journal.
-- Решения РП, принятые пачкой, остаются (данные и журнал — как при решении по одной записи).
begin;

do $$
begin
  if to_regprocedure('public.pf_fact_decide_batch(uuid,uuid[],boolean,text)') is null then
    raise exception '028 не применена — откатывать нечего' using errcode = 'P0001';
  end if;
end $$;

drop function public.pf_fact_decide_batch(uuid, uuid[], boolean, text);
drop function public.pf_fact_journal(uuid, date, date, int);

commit;
