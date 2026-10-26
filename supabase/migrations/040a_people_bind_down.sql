-- Откат 040a (P2-0035b): вернуть поля номера и признак «скрыт из рейтинга» по журналу quality.p2_0035b_changes, удалить журнал
-- и копии. Строки, изменённые после 040a приложением, откатываются только если значение всё ещё то, что поставила 040a.
begin;

do $$
declare r record; n integer := 0;
begin
  if to_regclass('quality.p2_0035b_changes') is null then
    raise exception '040a не применена' using errcode = 'P0001';
  end if;
  for r in select * from quality.p2_0035b_changes order by changed_at desc loop
    if r.col = 'is_deleted' then
      execute format('update quality.%I set is_deleted = false, deleted_at = null where id::text = $1 and is_deleted = true', r.t) using r.id;
    else
      execute format('update quality.%I set %I = null where id::text = $1 and %I::text = $2', r.t, r.col, r.col) using r.id, r.new_value;
    end if;
    n := n + 1;
  end loop;
  raise notice 'P2-0035b 040a откат: изменений %', n;
end $$;

drop table quality.p2_0035b_changes;
drop table quality.p2_0035b_backup_profiles;
drop table quality.p2_0035b_backup_ratings;

commit;
