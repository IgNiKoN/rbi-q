// P2-0078 (доработка 1): собрать tests/server/059_rls_fast_prod_dryrun.sql — пробный прогон 059 на БОЕВЫХ данных в транзакции
// с откатом (SQL Editor). Тело миграции берётся из supabase/migrations/059_rls_fast_up.sql без её begin / commit — после правки
// 059 пересобрать: node scripts/p2-0078/prod-dryrun.mjs; --check — только сверить (код выхода 1, если файл устарел).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const UP = join(ROOT, 'supabase/migrations/059_rls_fast_up.sql');
const OUT = join(ROOT, 'tests/server/059_rls_fast_prod_dryrun.sql');

/** Тело 059 без шапки, без begin; и последнего commit; (транзакция — у пробного прогона). */
export function migrationBody(text) {
  const lines = text.split('\n');
  const b = lines.findIndex((l) => l.trim() === 'begin;');
  let c = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].trim() === 'commit;') { c = i; break; }
  if (b < 0 || c < 0 || c < b) throw new Error('059: нет begin; / commit;');
  return lines.slice(b + 1, c).join('\n').trim();
}

export function buildDryrun(upText) {
  return `-- P2-0078 (доработка 1): ПРОБНЫЙ ПРОГОН 059 НА БОЕВЫХ ДАННЫХ — в одной транзакции, которая всегда откатывается
-- (отчёт — ERROR P0001, ошибка откатывает всё; на сервере не остаётся ни 059, ни снимков). Файл собран из
-- supabase/migrations/059_rls_fast_up.sql скриптом scripts/p2-0078/prod-dryrun.mjs — руками не править.
--
-- Как запускать (SQL Editor, весь файл одним запросом): ниже, в строке «ЧАСТЬ», номер человека 1…7 — каждый запуск один человек:
--   1 — администратор компании (шаблон company_admin, на всю компанию), 2 — инженер качества (qc_engineer или роль с «Проверки:
--   создание» без «…manage»), 3 — участник с областью по месту (назначение с местом), 4 — представитель подрядчика («своя фирма»
--   с фирмой), 5 — заказчик (customer), 6 — администратор платформы с заголовком своей компании, 7 — посетитель демо с заголовком
--   демо-компании. Люди 1–5 — из компании с наибольшим числом проверок Качества (РБИ); выбор — только чтение core.role_assignments.
-- Что сравнивается: под учёткой и компанией человека — каждая таблица quality.* с правилом чтения и файлы quality-*
-- (storage.objects): число видимых строк и отпечаток их id ДО (правила как сейчас) и ПОСЛЕ (059 внутри этой же транзакции).
-- Не уложилось в ~60 с — во второй строке «ЧАСТЬ» поставить 'quality' (только таблицы) и отдельно 'storage' (только файлы).
-- Проверить конкретного человека — его почта в третьей строке «ЧАСТЬ» (компания запроса — та, что у части).
-- Блокировки: 059 меняет правила таблиц Качества — до отката они заняты (несколько секунд); lock_timeout 3 с — не ждать в очереди
-- (запускать в тихое время; «canceling statement due to lock timeout» — просто повторить).
-- Итог: «ОТЧЁТ 059 на боевом: часть N … FAIL всего: 0» — права совпали. Человека такой роли нет — «пропуск», FAIL 0.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '58s';
select set_config('p59.part', '1', true),          -- ЧАСТЬ: номер человека 1…7
       set_config('p59.group', 'все', true),         -- ЧАСТЬ: 'все' | 'quality' | 'storage'
       set_config('p59.email', '', true);            -- ЧАСТЬ: почта учётки вместо выбранной (необязательно; компания — та же)

-- 1. Люди (только чтение). Компания РБИ — где больше всего проверок Качества.
create temp table p59_people(k int primary key, label text, uid uuid, co uuid) on commit drop;
do $p59$
declare rbi uuid; demo uuid;
begin
  select core_company_id into rbi from quality.rbi_inspections group by 1 order by count(*) desc limit 1;
  select id into demo from core.companies where is_demo and deleted_at is null limit 1;
  insert into p59_people
  select 1, 'администратор компании', (select a.user_id from core.role_assignments a join core.company_roles r on r.id = a.role_id
     where a.company_id = rbi and r.template_code = 'company_admin' and a.project_id is null and a.revoked_at is null
       and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()) order by a.user_id limit 1), rbi
  union all
  select 2, 'инженер качества', (select a.user_id from core.role_assignments a join core.company_roles r on r.id = a.role_id
     where a.company_id = rbi and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
       and (r.template_code = 'qc_engineer' or exists (select 1 from core.company_role_permissions p where p.role_id = a.role_id and p.action = 'quality.inspections.create'))
       and not exists (select 1 from core.company_role_permissions p where p.role_id = a.role_id and p.action in ('quality.manage', 'quality.scope.company', 'quality.scope.contractor'))
     order by (a.project_id is null), a.user_id limit 1), rbi
  union all
  select 3, 'участник с областью по месту', (select a.user_id from core.role_assignments a
     where a.company_id = rbi and a.location_id is not null and a.revoked_at is null
       and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
     order by exists (select 1 from core.company_role_permissions p join core.permission_catalog c on c.action = p.action
                       where p.role_id = a.role_id and c.area_scoped and p.action like '%.view') desc, a.user_id limit 1), rbi
  union all
  select 4, 'представитель подрядчика («своя фирма»)', (select a.user_id from core.role_assignments a
     where a.company_id = rbi and a.counterparty_id is not null and a.revoked_at is null
       and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
       and exists (select 1 from core.company_role_permissions p where p.role_id = a.role_id and p.action = 'quality.scope.contractor')
     order by exists (select 1 from core.company_role_permissions p where p.role_id = a.role_id and p.action like '%.manage') , a.user_id limit 1), rbi
  union all
  select 5, 'заказчик', (select a.user_id from core.role_assignments a join core.company_roles r on r.id = a.role_id
     where a.company_id = rbi and r.template_code = 'customer' and a.revoked_at is null
       and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()) order by a.user_id limit 1), rbi
  union all
  select 6, 'администратор платформы (своя компания)', x.user_id, x.company_id from (
    select pa.user_id, m.company_id from core.platform_admins pa join core.company_members m on m.user_id = pa.user_id
      join core.companies c on c.id = m.company_id and not c.is_demo
     order by (m.company_id = rbi) desc, pa.user_id limit 1) x
  union all
  select 7, 'посетитель демо (демо-компания)', (select v.user_id from core.demo_visits v where v.company_id = demo and v.deleted_at is null
     order by v.user_id limit 1), demo;
  insert into p59_people select 6, 'администратор платформы (своя компания)', null, null where not exists (select 1 from p59_people where k = 6);
  if current_setting('p59.email') <> '' then
    update p59_people set uid = (select id from auth.users where lower(email) = lower(btrim(current_setting('p59.email')))),
                          label = label || ' — выбран вручную' where k = current_setting('p59.part')::int;
  end if;
end $p59$;

-- 2. Таблицы: quality.* с правилом чтения, файлы quality-*.
create temp table p59_tables(sch text, t text, key text, filter text) on commit drop;
insert into p59_tables
select 'quality', p.tablename::text,
       case when exists (select 1 from information_schema.columns c where c.table_schema = 'quality' and c.table_name = p.tablename and c.column_name = 'id')
            then 'id::text' else 'ctid::text' end, 'true'
  from (select distinct tablename from pg_policies where schemaname = 'quality' and cmd in ('SELECT', 'ALL')) p
 where current_setting('p59.group') in ('все', 'quality')
union all
select 'storage', 'objects', 'id::text', 'bucket_id like ''quality-%''' where current_setting('p59.group') in ('все', 'storage');

create temp table p59_snap(phase text, t text, n bigint, h text, err text) on commit drop;
grant all on p59_snap to authenticated;
create or replace function pg_temp.p59_take(p_phase text) returns void language plpgsql as $f$
declare w record; x record; v_n bigint; v_h text; v_e text;
begin
  select * into w from p59_people where k = current_setting('p59.part')::int;
  if w.uid is null then return; end if;
  for x in select * from p59_tables order by sch, t loop
    v_n := null; v_h := null; v_e := null;
    begin
      reset role;
      perform set_config('request.headers', json_build_object('x-company-id', w.co)::text, true);
      perform set_config('request.jwt.claim.sub', w.uid::text, true);
      perform set_config('request.jwt.claims', json_build_object('sub', w.uid, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      execute format('select count(*), md5(coalesce(string_agg(%s, '','' order by %s), '''')) from %I.%I where %s', x.key, x.key, x.sch, x.t, x.filter)
        into v_n, v_h;
    exception when others then v_e := sqlerrm;
    end;
    reset role;
    insert into p59_snap values (p_phase, x.sch || '.' || x.t, v_n, v_h, v_e);
  end loop;
end $f$;

-- 3. Снимок ДО (правила как сейчас на боевом).
select pg_temp.p59_take('до');
reset role;

-- 4. 059 внутри этой транзакции (будет откачена).
${migrationBody(upText)}

-- 5. Снимок ПОСЛЕ и отчёт (исключение откатывает всю транзакцию).
select pg_temp.p59_take('после');
reset role;
do $p59$
declare w record; n_t int; n_bad int; n_err int; bad text; errs text; v_rows bigint;
begin
  select * into w from p59_people where k = current_setting('p59.part')::int;
  if w.uid is null then
    raise exception E'ОТЧЁТ 059 на боевом: часть % — «%»: такой учётки нет, пропуск\\nFAIL всего: 0', current_setting('p59.part'), w.label using errcode = 'P0001';
  end if;
  select count(*), coalesce(sum(b.n), 0) into n_t, v_rows from p59_snap b where b.phase = 'до';
  select count(*), string_agg(format('%s: до %s строк, после %s', b.t, b.n, a.n), E'\\n' order by b.t) into n_bad, bad
    from p59_snap b join p59_snap a on a.t = b.t and a.phase = 'после'
   where b.phase = 'до' and (b.n is distinct from a.n or b.h is distinct from a.h);
  select count(*), string_agg(distinct format('%s %s: %s', phase, t, left(err, 160)), E'\\n') into n_err, errs from p59_snap where err is not null;
  raise exception E'ОТЧЁТ 059 на боевом: часть % — «%» (%, компания %), группа «%»: таблиц %, видимых строк %, расхождений %, ошибок чтения %\\n%\\n%\\nFAIL всего: %',
    current_setting('p59.part'), w.label, (select email from auth.users where id = w.uid), w.co, current_setting('p59.group'),
    n_t, v_rows, n_bad, n_err, coalesce(bad, ''), coalesce(errs, ''), n_bad + n_err using errcode = 'P0001';
end $p59$;
rollback;
`;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const want = buildDryrun(readFileSync(UP, 'utf8'));
  if (process.argv.includes('--check')) {
    let have = ''; try { have = readFileSync(OUT, 'utf8'); } catch { /* нет файла */ }
    if (have !== want) { console.error('tests/server/059_rls_fast_prod_dryrun.sql устарел: node scripts/p2-0078/prod-dryrun.mjs'); process.exit(1); }
    console.log('пробный прогон 059 — актуален');
  } else {
    writeFileSync(OUT, want);
    console.log('записан tests/server/059_rls_fast_prod_dryrun.sql');
  }
}
