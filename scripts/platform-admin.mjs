// P2-0013. SQL «администратор платформы» для общего сервера (ADR-064 п. 6): учётка владельца (почта + пароль) и признак
// core.platform_admins. Учётка создаётся вставкой в auth.users / auth.identities, как демо-учётки P2-0009 (service_role-ключа нет;
// ТД №13); если учётка с этой почтой уже есть — пароль не меняется, только признак.
// Пароль: берётся из .env.local (P2_PLATFORM_ADMIN_PASSWORD); если его нет — генерируется и дописывается туда. В консоль не печатается.
// Результат — файл .env.platform-admin.sql (в git не попадает: правило .env.*). Его выполняет ВЛАДЕЛЕЦ в SQL Editor сервера
// после миграции 014, затем файл удалить. Запуск: node scripts/platform-admin.mjs <почта>
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Укажите почту: node scripts/platform-admin.mjs <почта>');
  process.exit(1);
}
const envUrl = new URL('../.env.local', import.meta.url);
const env = existsSync(envUrl) ? readFileSync(envUrl, 'utf8') : '';
const get = (k) => (env.split('\n').find((l) => l.startsWith(k + '=')) || '').slice(k.length + 1).trim();
const KEY = 'P2_PLATFORM_ADMIN_PASSWORD';
let pass = get(KEY);
const added = !pass;
if (added) {
  pass = 'Adm-' + randomBytes(12).toString('base64url');
  appendFileSync(envUrl, (env.endsWith('\n') || !env ? '' : '\n') + `P2_PLATFORM_ADMIN_EMAIL=${email}\n${KEY}=${pass}\n`);
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = `-- P2-0013: администратор платформы ${email}. Выполнить в SQL Editor ПОСЛЕ миграции 014; затем удалить этот файл.
-- Повторный запуск безопасен: учётка не пересоздаётся, пароль не меняется, признак не дублируется.
do $$
declare
  v_email text := ${lit(email)}; v_user uuid; v_tpl auth.users; v_has_pid boolean;
begin
  set local search_path = public, extensions;
  if to_regclass('core.platform_admins') is null then raise exception 'Сначала примените миграции 014 и 016'; end if;
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is null then
    select * into v_tpl from auth.users where email = 'alfa-pto@test.invalid';   -- образец: instance_id, aud, role тестовых учёток P2-0004
    if v_tpl.id is null then raise exception 'Нет образца alfa-pto@test.invalid'; end if;
    select exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id') into v_has_pid;
    v_user := gen_random_uuid();
    insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                           created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values (v_tpl.instance_id, v_user, v_tpl.aud, v_tpl.role, v_email, crypt(${lit(pass)}, gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
    if v_has_pid then
      execute 'insert into auth.identities(id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
               values (gen_random_uuid(), $1, $1::text, $2, ''email'', now(), now(), now())'
        using v_user, jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true);
    else
      execute 'insert into auth.identities(id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
               values ($1, $1, $2, ''email'', now(), now(), now())'
        using v_user, jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true);
    end if;
    raise notice 'Учётка создана';
  else
    raise notice 'Учётка уже была — пароль не менялся';
  end if;
  insert into core.platform_admins(user_id) values (v_user) on conflict do nothing;
  raise notice 'Администратор платформы: готово';
end $$;
`;
writeFileSync(new URL('../.env.platform-admin.sql', import.meta.url), sql);
console.log(`Готово: .env.platform-admin.sql; пароль ${added ? 'сгенерирован и записан' : 'взят из'} .env.local (${KEY}). В консоль не выводится.`);
