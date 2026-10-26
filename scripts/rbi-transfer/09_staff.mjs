// P2-0028 этап 4. Сотрудники RBI: учётки по почте, временные роли (до P2-0033), сопоставление старых профилей для переноса.
// Вход: файл .env.rbi-staff.txt (в git не попадает — правило .env.*), строка на человека: «ФИО старого профиля;почта».
//   Первая строка с пометкой «;владелец» в конце — владелец (рабочая почта): его старый профиль переходит с gmail на неё.
// Выход: .env.rbi-staff.sql — выполнить в SQL Editor по разрешению владельца, затем удалить файл.
// Что делает SQL (от имени администратора платформы, теми же функциями, что экран «Сотрудники»):
//   для каждого — профиль РБИ по ФИО (rbi-test, без учёта регистра: «ПЕТРУШКО Д.М.»), pf_company_add_member (почта, ФИО, роль временно по старой роли:
//   manager → «Администратор компании», deputy_manager/director → «Руководство», engineer → «Инженер строительного контроля»
//   на объект «Объекты RBI»), quality.rbi_transfer_people (профиль → почта → учётка).
// Временные пароли в SQL не выводятся и нигде не сохраняются (хранится только хэш); сотрудникам их выдаёт владелец
// кнопкой «Сбросить пароль» в день переключения (P2-0032). Повтор безопасен: уже добавленный — пропускается.
// Запуск: node scripts/rbi-transfer/09_staff.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const src = new URL('../../.env.rbi-staff.txt', import.meta.url);
if (!existsSync(src)) { console.log('Нет файла .env.rbi-staff.txt (строки «ФИО;почта»)'); process.exit(1); }
const rows = readFileSync(src, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split(';').map((x) => x.trim()));
const bad = rows.filter((r) => r.length < 2 || !r[0] || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(r[1]));
if (bad.length) { console.log(`Строк с ошибкой: ${bad.length} (нужно «ФИО;почта»)`); process.exit(1); }
const owners = rows.filter((r) => (r[2] || '').toLowerCase() === 'владелец');
if (owners.length !== 1) { console.log('Нужна ровно одна строка с пометкой «;владелец»'); process.exit(1); }
const emails = new Set(rows.map((r) => r[1].toLowerCase()));
if (emails.size !== rows.length) { console.log('Почты повторяются'); process.exit(1); }

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = `-- P2-0028 этап 4: сотрудники RBI (${rows.length}). Выполнить в SQL Editor ОДИН раз (повтор безопасен), затем удалить этот файл.
begin;
create temp table _staff(name text, email text, is_owner boolean) on commit drop;
insert into _staff values
${rows.map((r) => `  (${lit(r[0])}, ${lit(r[1].toLowerCase())}, ${(r[2] || '').toLowerCase() === 'владелец'})`).join(',\n')};

do $$
declare
  v_admin uuid; v_c uuid; v_p uuid; s record; v_prof public.rbi_engineer_profiles; v_n int;
  v_tpl text; v_role uuid; v_user uuid; v_added int := 0; v_skipped int := 0;
begin
  select user_id into v_admin from core.platform_admins order by created_at limit 1;
  select id into v_c from core.companies where name = 'RBI';
  select core_project_id into v_p from quality.rbi_transfer_projects where core_company_id = v_c and old_code = 'rbi-test';
  if v_admin is null or v_c is null or v_p is null then raise exception 'Нет администратора платформы / компании RBI / объекта rbi-test'; end if;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  for s in select * from _staff loop
    select count(*) into v_n from public.rbi_engineer_profiles
     where project_code = 'rbi-test' and (lower(btrim(inspector_name)) = lower(s.name) or lower(btrim(engineer_name)) = lower(s.name));
    if v_n <> 1 then raise exception 'Профиль «%»: найдено %, нужен ровно один', s.name, v_n; end if;
    select * into v_prof from public.rbi_engineer_profiles
     where project_code = 'rbi-test' and (lower(btrim(inspector_name)) = lower(s.name) or lower(btrim(engineer_name)) = lower(s.name));
    v_tpl := case v_prof.role when 'manager' then 'company_admin' when 'deputy_manager' then 'management'
                              when 'director' then 'management' when 'engineer' then 'qc_engineer' end;
    if v_tpl is null then raise exception 'Профиль «%»: роль «%» не сопоставлена', s.name, v_prof.role; end if;
    select id into v_role from core.company_roles where company_id = v_c and template_code = v_tpl;
    select id into v_user from auth.users where lower(email::text) = s.email;
    if v_user is not null and exists (select 1 from core.company_members where company_id = v_c and user_id = v_user) then
      v_skipped := v_skipped + 1;   -- уже добавлен (повтор)
    else
      select a.user_id into v_user from public.pf_company_add_member(v_c, s.email, s.name, v_role,
        case when v_tpl = 'qc_engineer' then v_p end) a;   -- временный пароль не выводится
      v_added := v_added + 1;
    end if;
    insert into quality.rbi_transfer_people(core_company_id, old_profile_id, email, user_id) values (v_c, v_prof.id, s.email, v_user)
      on conflict (core_company_id, old_profile_id) do update set email = excluded.email, user_id = excluded.user_id;
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  raise notice 'Добавлено %, уже были %', v_added, v_skipped;
end $$;

-- Итог: сотрудники RBI (ФИО, почта, роль, ждёт смены пароля) и сопоставление профилей
select up.full_name, u.email, r.name role_name, pr.name project, up.must_change_password,
       (select count(*) from quality.rbi_transfer_people t where t.user_id = m.user_id and t.core_company_id = m.company_id) profiles
  from core.company_members m join core.companies c on c.id = m.company_id and c.name = 'RBI'
  join auth.users u on u.id = m.user_id
  left join core.user_profiles up on up.user_id = m.user_id
  left join core.role_assignments a on a.company_id = m.company_id and a.user_id = m.user_id and a.revoked_at is null
  left join core.company_roles r on r.id = a.role_id
  left join core.projects pr on pr.id = a.project_id
 order by up.full_name nulls last, u.email;
commit;
`;
writeFileSync(new URL('../../.env.rbi-staff.sql', import.meta.url), sql);
console.log(`Готово: .env.rbi-staff.sql (${rows.length} человек, владелец — 1). Почты и пароли в консоль не выводятся.`);
