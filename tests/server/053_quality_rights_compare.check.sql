-- P2-0071 (053), часть 2 из 2 — «до = после»: снимок прав ПОСЛЕ миграции и сравнение со снимком ДО
-- (053_quality_rights.seed.pglite.sql на схеме 052 → 053_quality_rights_up.sql → этот файл; та же сессия).
-- Ожидаемые отличия — только решения владельца 30.10.2026 (карточка P2-0071, п. 2а, 2, 10):
--   (а) инженер с выбранными объектами — Стройконтроль тоже только на них («в стройконтроле также — только назначенные объекты»);
--   (б) инженер «только свои» на компанию без объектов → «без объектов»: записи объектов не видит и не правит, общие разделы
--       (эталоны, база знаний) — как были;
--   (в) роль с Качеством, назначенная на объект или его часть, теперь работает и в Качестве (прежде мост «объекты Качества» её не
--       пропускал): видит записи объекта (часть объекта — все записи без места), правит свои,
--       проводит проверки (в т. ч. на объекте, который сервер не узнал), общие разделы — по своим галочкам.
-- Всё остальное — до = после. Отчёт — ERROR P0001 «FAIL всего: N».
select pg_temp.capture('после');

create table public.t053_diff as
select b.usr, b.tbl, b.rec, b.op, b.ok before, a.ok after,
       case
         when b.usr = 'инженер ЖК-1' and b.tbl = 'замечание СК' and b.rec = 'd2-m53' and b.ok and not a.ok
           then 'а: Стройконтроль — только назначенные объекты'
         when b.usr = 'инженер без объектов' and b.tbl <> 'эталон' and b.ok and not a.ok
           then 'б: без объектов'
         when b.usr in ('прораб + Качество ЖК-1', 'прораб + Качество секция 1') and not b.ok and a.ok
              and (b.tbl = 'эталон'
                   or b.tbl in ('проверка', 'задача', 'пункт') and b.op = 'видит' and b.rec in ('i1-m53', 'i2-m53', 'i5-m53', 'it1-m53', 't1-m53', 't2-m53')
                   or b.tbl = 'проверка' and b.op = 'создать на объекте'
                   or b.usr = 'прораб + Качество секция 1' and b.tbl = 'проверка' and b.rec = 'i5-m53')
           then 'в: участие на объект работает в Качестве'
       end why
  from public.t053 b join public.t053 a on a.usr = b.usr and a.tbl = b.tbl and a.rec = b.rec and a.op = b.op and a.phase = 'после'
 where b.phase = 'до' and b.ok is distinct from a.ok;

do $$
declare n_all int; n_exp int; n_bad int; bad text;
begin
  select count(*) into n_all from public.t053 where phase = 'до';
  select count(*) into n_exp from public.t053_diff where why is not null;
  select count(*), string_agg(format('%s · %s · %s · %s: до %s, после %s', usr, tbl, rec, op, before, after), E'\n' order by usr, tbl, rec, op)
    into n_bad, bad from public.t053_diff where why is null;
  raise exception E'ОТЧЁТ 053 «до = после»: проверок %, совпало %, ожидаемых отличий % (а: %, б: %, в: %)\n%FAIL всего: %',
    n_all, n_all - n_exp - n_bad, n_exp, (select count(*) from public.t053_diff where why like 'а:%'),
    (select count(*) from public.t053_diff where why like 'б:%'), (select count(*) from public.t053_diff where why like 'в:%'),
    coalesce(regexp_replace(bad, '(^|\n)', '\1FAIL ', 'g') || E'\n', ''), n_bad using errcode = 'P0001';
end $$;
