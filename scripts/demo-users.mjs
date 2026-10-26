// P2-0009. SQL для «Демо-компании» на общем сервере: компания (is_test = true), 5 учёток *@demo.invalid и их роли.
// Учётки создаются вставкой в auth.users / auth.identities, как тестовые P2-0004 (service_role-ключа нет; ТД №13).
// Пароли: берутся из .env.local (P2_DEMO_*_PASSWORD); если их нет — генерируются и дописываются туда. В консоль не печатаются.
// Результат — файл .env.demo-users.sql (в git не попадает: правило .env.*). Его выполняет ВЛАДЕЛЕЦ в SQL Editor сервера,
// затем файл удалить. Запуск: node scripts/demo-users.mjs
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const envUrl = new URL('../.env.local', import.meta.url);
const env = existsSync(envUrl) ? readFileSync(envUrl, 'utf8') : '';
const get = (k) => (env.split('\n').find((l) => l.startsWith(k + '=')) || '').slice(k.length + 1).trim();

const USERS = [
  ['ADMIN', 'demo-admin@demo.invalid', 'company_admin'],
  ['PTO', 'demo-pto@demo.invalid', 'pto'],
  ['FOREMAN', 'demo-foreman@demo.invalid', 'foreman'],
  ['PM', 'demo-pm@demo.invalid', 'project_manager'],
  ['BOSS', 'demo-boss@demo.invalid', 'management']
];
const added = [];
const pw = {};
for (const [k] of USERS) {
  const key = `P2_DEMO_${k}_PASSWORD`;
  pw[k] = get(key);
  if (!pw[k]) { pw[k] = 'Demo-' + randomBytes(9).toString('base64url'); added.push(`${key}=${pw[k]}`); }
}
if (added.length) appendFileSync(envUrl, (env.endsWith('\n') || !env ? '' : '\n') + added.join('\n') + '\n');

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = `-- P2-0009: «Демо-компания» и 5 учёток @demo.invalid. Выполнить ОДИН раз в SQL Editor; затем удалить этот файл.
-- Повторный запуск откажет («уже есть»). Удаление — docs/DEMO.md, раздел «Сброс демо».
do $$
declare
  v_company uuid; v_user uuid; v_tpl auth.users; v_has_pid boolean; r record;
begin
  set local search_path = public, extensions;
  if exists (select 1 from core.companies where name = 'Демо-компания') or exists (select 1 from auth.users where email like '%@demo.invalid') then
    raise exception 'Демо-компания или учётки @demo.invalid уже есть — сначала «Сброс демо» (docs/DEMO.md)';
  end if;
  select * into v_tpl from auth.users where email = 'alfa-pto@test.invalid';   -- образец: instance_id, aud, role тестовых учёток P2-0004
  if v_tpl.id is null then raise exception 'Нет образца alfa-pto@test.invalid'; end if;
  select exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id') into v_has_pid;
  insert into core.companies(name, is_test) values ('Демо-компания', true) returning id into v_company;
  for r in select * from (values
${USERS.map(([k, e, role]) => `    (${lit(e)}, ${lit(pw[k])}, ${lit(role)})`).join(',\n')}
  ) u(email, pass, role) loop
    v_user := gen_random_uuid();
    insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                           created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values (v_tpl.instance_id, v_user, v_tpl.aud, v_tpl.role, r.email, crypt(r.pass, gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
    if v_has_pid then
      execute 'insert into auth.identities(id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
               values (gen_random_uuid(), $1, $1::text, $2, ''email'', now(), now(), now())'
        using v_user, jsonb_build_object('sub', v_user::text, 'email', r.email, 'email_verified', true);
    else
      execute 'insert into auth.identities(id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
               values ($1, $1, $2, ''email'', now(), now(), now())'
        using v_user, jsonb_build_object('sub', v_user::text, 'email', r.email, 'email_verified', true);
    end if;
    insert into core.company_members(company_id, user_id) values (v_company, v_user);
    insert into core.role_assignments(company_id, user_id, role_id, project_id)
    values (v_company, v_user, (select id from core.company_roles where company_id = v_company and template_code = r.role), null);
  end loop;
  raise notice 'Демо-компания и 5 учёток созданы';
end $$;
`;
writeFileSync(new URL('../.env.demo-users.sql', import.meta.url), sql);
console.log(`Готово: .env.demo-users.sql (${USERS.length} учёток); паролей добавлено в .env.local: ${added.length}. Пароли в консоль не выводятся.`);
