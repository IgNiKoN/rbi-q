-- P2-0070 (052), часть 2 из 2 — «до = после»: снимок прав ПОСЛЕ миграции и сравнение со снимком ДО
-- (052_rights_mechanism.seed.pglite.sql на схеме 051 → 052_rights_mechanism_up.sql → этот файл; та же сессия).
-- Ожидаемые отличия — только решения плана P2-0070 (п. 1 и 3 карточки):
--   (а) подрядчик в приёмке: «записаться», «отозвать» и видимость — как было; «принять» и «время» — больше нет
--       (роль-подрядчик получает только «видеть» и «записаться»; на экране этих кнопок у подрядчика и не было);
--   (б) участие на часть проекта (секция): записи вне секции и записи без места — больше не видны и не правятся;
--       своя запись без места — видна, но не правится.
-- Всё остальное (каждая роль-шаблон, свои роли, Стройконтроль 1) — до = после. Отчёт — таблица и ERROR P0001 «FAIL всего: N».
select pg_temp.capture('после');

create table public.t052_diff as
select b.usr, b.tbl, b.rec, b.op, b.ok before, a.ok after,
       case
         when b.usr in ('подрядчик F1', 'подрядчик F2', 'шаблон contractor_rep') and b.tbl = 'acceptance' and b.op in ('принять', 'время')
              and b.ok and not a.ok then 'а: подрядчик не проводит приёмку и не переносит время'
         when b.usr = 'инженер секции 1 ЖК-1' and b.tbl in ('defect', 'acceptance') and b.rec not like 's1-%' and b.rec <> 'own-m52'
              and b.ok and not a.ok then 'б: вне секции участия'
         when b.usr = 'инженер секции 1 ЖК-1' and b.tbl = 'defect' and b.rec = 'own-m52' and b.op <> 'видит'
              and b.ok and not a.ok then 'б: своё без места — только видит'
       end why
  from public.t052 b join public.t052 a on a.usr = b.usr and a.tbl = b.tbl and a.rec = b.rec and a.op = b.op and a.phase = 'после'
 where b.phase = 'до' and b.ok is distinct from a.ok;

do $$
declare n_all int; n_same int; n_exp int; n_bad int; bad text;
begin
  select count(*) into n_all from public.t052 where phase = 'до';
  select count(*) into n_exp from public.t052_diff where why is not null;
  select count(*), string_agg(format('%s · %s · %s · %s: до %s, после %s', usr, tbl, rec, op, before, after), E'\n' order by usr, tbl, rec, op)
    into n_bad, bad from public.t052_diff where why is null;
  n_same := n_all - n_exp - n_bad;
  raise exception E'ОТЧЁТ 052 «до = после»: проверок %, совпало %, ожидаемых отличий % (а: %, б: %)\n%FAIL всего: %',
    n_all, n_same, n_exp, (select count(*) from public.t052_diff where why like 'а:%'), (select count(*) from public.t052_diff where why like 'б:%'),
    coalesce(regexp_replace(bad, '(^|\n)', '\1FAIL ', 'g') || E'\n', ''), n_bad using errcode = 'P0001';
end $$;
