-- P2-0071 (053), часть 2 из 2 — «до = после»: снимок прав ПОСЛЕ миграции и сравнение со снимком ДО
-- (053_quality_rights.seed.pglite.sql на схеме 052 → 053_quality_rights_up.sql → этот файл; та же сессия).
-- Ожидаемые отличия — только решения владельца 30.10.2026 (карточка P2-0071, п. 2а, 2, 10):
--   (а) инженер с выбранными объектами — Стройконтроль тоже только на них («в стройконтроле также — только назначенные объекты»);
--   (б) инженер «только свои» на компанию без объектов → «без объектов»: записи объектов не видит и не правит, общие разделы
--       (эталоны, база знаний) — как были;
--   (в) роль с Качеством, назначенная на объект или его часть, теперь работает и в Качестве (прежде мост «объекты Качества» её не
--       пропускал): видит записи объекта (часть объекта — все записи без места), правит свои,
--       проводит проверки (в т. ч. на объекте, который сервер не узнал), общие разделы — по своим галочкам.
--   (г) доработка №1 (ревью п. 8): исполнитель задачи не удаляет её, если он не автор, без «Задачи: редактирование чужих».
-- Всё остальное — до = после. Доработка №1: у компании без контейнера он создаётся, на всю компанию не остаётся никого.
-- Отчёт — ERROR P0001 «FAIL всего: N».
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
                   or b.usr = 'прораб + Качество секция 1' and b.tbl = 'проверка' and b.rec = 'i5-m53'
                   -- этап 2: совещания, FMEA, внешний СК объекта; часть объекта — правит только своё (m3)
                   or b.tbl in ('project_meetings', 'project_fmea', 'sk_records') and b.rec in ('m1-m53', 'm3-m53', 'f1-m53', 'k1-m53')
                      and (b.op = 'видит' or b.usr = 'прораб + Качество ЖК-1' or b.rec = 'm3-m53'))
           then 'в: участие на объект работает в Качестве'
         when b.tbl = 'задача' and b.op in ('удалить', 'пометить удалённой') and b.ok and not a.ok
              and (select t.assigned_to_auth_user_id = u.id and t.core_created_by <> u.id from quality.rbi_tasks t, public.t053_users u
                    where t.id = b.rec and u.k = b.usr)
           then 'г: исполнитель не удаляет чужую задачу'
       end why
  from public.t053 b join public.t053 a on a.usr = b.usr and a.tbl = b.tbl and a.rec = b.rec and a.op = b.op and a.phase = 'после'
 where b.phase = 'до' and b.ok is distinct from a.ok;

do $$
declare n_all int; n_exp int; n_bad int; bad text; cb uuid := current_setting('m53.cb')::uuid; bad_b text := '';
begin
  -- доработка №1: компания Б без контейнера — контейнер создан, оба инженера на нём, действующих назначений на компанию нет
  if (select count(*) from core.projects where company_id = cb and quality_container and archived_at is null) <> 1 then
    bad_b := bad_b || E'FAIL компания Б: контейнер не создан\n';
  end if;
  if exists (select 1 from core.role_assignments where company_id = cb and project_id is null and revoked_at is null) then
    bad_b := bad_b || E'FAIL компания Б: осталось назначение на всю компанию\n';
  end if;
  if (select count(*) from core.role_assignments a join core.projects p on p.id = a.project_id and p.quality_container
       where a.company_id = cb and a.revoked_at is null) <> 2 then
    bad_b := bad_b || E'FAIL компания Б: не оба инженера «без объектов»\n';
  end if;
  select count(*) into n_all from public.t053 where phase = 'до';
  select count(*) into n_exp from public.t053_diff where why is not null;
  select count(*), string_agg(format('%s · %s · %s · %s: до %s, после %s', usr, tbl, rec, op, before, after), E'\n' order by usr, tbl, rec, op)
    into n_bad, bad from public.t053_diff where why is null;
  raise exception E'ОТЧЁТ 053 «до = после»: проверок %, совпало %, ожидаемых отличий % (а: %, б: %, в: %, г: %)\n%FAIL всего: %',
    n_all, n_all - n_exp - n_bad, n_exp, (select count(*) from public.t053_diff where why like 'а:%'),
    (select count(*) from public.t053_diff where why like 'б:%'), (select count(*) from public.t053_diff where why like 'в:%'),
    (select count(*) from public.t053_diff where why like 'г:%'),
    coalesce(regexp_replace(bad, '(^|\n)', '\1FAIL ', 'g') || E'\n', '') || bad_b,
    n_bad + (length(bad_b) - length(replace(bad_b, 'FAIL ', ''))) / 5 using errcode = 'P0001';
end $$;
