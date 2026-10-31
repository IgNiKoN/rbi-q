-- P2-0053 доработка 2: откат 058b_ks2_rows_fence_up.sql — planfact.ks2_rows как после 046c.
begin;

do $$
begin
  if position('058b:' in pg_get_functiondef('planfact.ks2_rows(uuid, date, uuid, uuid)'::regprocedure)) = 0 then
    raise exception '058b не применена — откатывать нечего' using errcode = 'P0001';
  end if;
end $$;

create function pg_temp.patch(p_fn regprocedure, p_from text[], p_to text[])
returns void language plpgsql as $$
declare v_new text := pg_get_functiondef(p_fn); i int;
begin
  for i in 1..cardinality(p_from) loop
    if position(p_from[i] in v_new) = 0 then
      raise exception '058b откат: в % не найдено место правки «%»', p_fn, p_from[i] using errcode = 'P0001';
    end if;
    v_new := replace(v_new, p_from[i], p_to[i]);
  end loop;
  execute v_new;
end $$;

select pg_temp.patch('planfact.ks2_rows(uuid, date, uuid, uuid)'::regprocedure,
  array['from prev_raw p join planfact.vor_source_rows o on o.id = p.id and o.project_id = p_project) w
          offset 0) x   -- 058b: x не разворачивать — «куда перенесена позиция» один раз на строку, не на каждую строку vor_links'],
  array['from prev_raw p join planfact.vor_source_rows o on o.id = p.id and o.project_id = p_project) w) x']);
drop function pg_temp.patch(regprocedure, text[], text[]);

commit;
