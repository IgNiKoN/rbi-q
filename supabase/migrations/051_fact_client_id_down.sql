-- P2-0064: откат 051_fact_client_id_up.sql — снята функция pf_fact_submit и таблица принятых номеров ВМЕСТЕ С ДАННЫМИ
-- (сами записи факта остаются в planfact.fact_entries). Телефоны новой версии после отката не смогут отправить факт без сети —
-- откатывать вместе с приложением. Проверка на PGlite: schema_fingerprint до up и после down совпадает.
begin;
do $$
begin
  if to_regprocedure('public.pf_fact_submit(uuid, jsonb)') is null then
    raise exception '051 down: 051 не применена' using errcode = 'P0001';
  end if;
end $$;

drop function public.pf_fact_submit(uuid, jsonb);
drop table planfact.fact_submissions;

commit;
