// P2-0053. SQL «демо-компания и учётки» для кнопки «Демо»: «Девелопмент Демо» (is_test, is_demo), модули по data/demo.json
// (ИИ выключен), учётки zd-dd-<роль>@demo.invalid, администратор — на всю компанию (остальным роли и участие даёт засев
// функцией экрана «Сотрудники»). Учётки — вставкой в auth.users / auth.identities, как в P2-0009 (service_role-ключа нет,
// ТД №13). Пароль один на все демо-учётки: P2_ZHK_DEMO_PASSWORD из .env.local; нет — создаётся и дописывается туда; в консоль
// не печатается. Посетители кнопки «Демо» — настоящие учётки других компаний — этим SQL не создаются и не трогаются.
// Боевой: node scripts/demo/accounts.mjs → .env.zhk-demo-accounts.sql (в git не попадает) → SQL Editor → файл удалить.
// Стенд: scripts/demo/stand.mjs выполняет accountsSql() сам.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const DATA = JSON.parse(readFileSync(new URL('./data/demo.json', import.meta.url), 'utf8'));
export const emailOf = (user) => `zd-${DATA.company.key}-${user}@demo.invalid`;

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function accountsSql(password) {
  const c = DATA.company;
  const users = c.users.map((u) => `    (${lit(emailOf(u.key))}, ${lit(u.name)}, ${lit(u.role)})`).join(',\n');
  const modules = Object.entries(c.modules).map(([m, on]) => `    (${lit(m)}, ${on})`).join(',\n');
  return `-- P2-0053: демо-компания «${c.name}» кнопки «Демо» и учётки zd-${c.key}-…@demo.invalid (${c.users.length}).
-- Выполнить ОДИН раз в SQL Editor (после 057); затем удалить этот файл. Повтор откажет («уже есть»): сначала scripts/demo/reset.sql.
do $$
declare
  v_company uuid; v_user uuid; v_tpl auth.users; v_has_pid boolean; r record;
begin
  set local search_path = public, extensions;
  if to_regclass('core.demo_visits') is null then raise exception 'Сначала миграция 057_demo_mode_up.sql'; end if;
  if exists (select 1 from core.companies where name = ${lit(c.name)} or is_demo)
     or exists (select 1 from auth.users where email like ${lit(`zd-${c.key}-%@demo.invalid`)}) then
    raise exception 'Демо-компания уже есть — сначала scripts/demo/reset.sql';
  end if;
  select * into v_tpl from auth.users where email not like '%@demo.invalid' and aud = 'authenticated' order by created_at limit 1;   -- образец instance_id / aud / role (как P2-0009)
  select exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id') into v_has_pid;
  insert into core.companies(name, is_test, is_demo) values (${lit(c.name)}, true, true) returning id into v_company;
  for r in select * from (values
${modules}
  ) x(module, enabled) loop
    insert into core.company_modules(company_id, module, enabled) values (v_company, r.module, r.enabled)
    on conflict (company_id, module) do update set enabled = excluded.enabled;
  end loop;
  for r in select * from (values
${users}
  ) u(email, full_name, role) loop
    v_user := gen_random_uuid();
    insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                           created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values (coalesce(v_tpl.instance_id, '00000000-0000-0000-0000-000000000000'), v_user, coalesce(v_tpl.aud, 'authenticated'),
            coalesce(v_tpl.role, 'authenticated'), r.email, crypt(${lit(password)}, gen_salt('bf')), now(),
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
    insert into core.user_profiles(user_id, full_name, managed_company_id) values (v_user, r.full_name, v_company)
      on conflict (user_id) do update set full_name = excluded.full_name;
    if r.role = 'company_admin' then
      insert into core.role_assignments(company_id, user_id, role_id, project_id)
      values (v_company, v_user, (select id from core.company_roles where company_id = v_company and template_code = r.role and deleted_at is null), null);
    end if;
  end loop;
  raise notice 'Демо-компания «%»: учёток % — создана', ${lit(c.name)}, ${c.users.length};
end $$;
`;
}

export function readEnv(url = new URL('../../.env.local', import.meta.url)) {
  return existsSync(url)
    ? Object.fromEntries(readFileSync(url, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
    : {};
}

export function demoPassword(envUrl = new URL('../../.env.local', import.meta.url)) {
  const env = existsSync(envUrl) ? readFileSync(envUrl, 'utf8') : '';
  const line = env.split('\n').find((l) => l.startsWith('P2_ZHK_DEMO_PASSWORD='));
  if (line) return { password: line.slice('P2_ZHK_DEMO_PASSWORD='.length).trim(), added: false };
  const password = 'Zhk-' + randomBytes(12).toString('base64url');
  appendFileSync(envUrl, (env.endsWith('\n') || !env ? '' : '\n') + `P2_ZHK_DEMO_PASSWORD=${password}\n`);
  return { password, added: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { password, added } = demoPassword();
  writeFileSync(new URL('../../.env.zhk-demo-accounts.sql', import.meta.url), accountsSql(password));
  console.log(`Готово: .env.zhk-demo-accounts.sql; пароль демо-учёток ${added ? 'создан и записан' : 'взят'} в .env.local (P2_ZHK_DEMO_PASSWORD). В консоль не выводится.`);
}
