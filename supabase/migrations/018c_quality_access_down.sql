-- P2-0016: откат 018c_quality_access_up.sql. Применять до 018_quality_down.sql.
begin;

do $$
begin   -- P2-0018: сторож порядка откатов (ТД №117) — ошибка до любых изменений
  if to_regprocedure('quality.row_visible(uuid,uuid,text[],text,uuid,uuid,text,text)') is not null then
    raise exception 'Сначала откатите 020: 020_quality_scope_down.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'counterparties_to_quality' and tgrelid = 'core.counterparties'::regclass) then
    raise exception 'Сначала откатите 018e: 018e_quality_contractors_down.sql' using errcode = 'P0001';
  end if;
  if to_regclass('storage.buckets') is not null then
    if exists (select 1 from storage.buckets where id like 'quality-%') then
      raise exception 'Сначала откатите 018d (бакеты quality-*): 018d_quality_storage_down.sql' using errcode = 'P0001';
    end if;
  end if;
end $$;

drop function if exists quality.my_access(uuid);

commit;
