-- P2-0027 этап 2, доработка 031 (031, 031a применены на сервере 25.10.2026). Профиль РБИ человека, который уже вошёл в новое
-- приложение по почте, не переносился: новое приложение создаёт свой профиль (компания + учётка уникальны), а перенос привязывал
-- старый профиль к той же учётке → конфликт, строка пропущена (сверка: профилей 22 → 21). Теперь auth_user_id старого профиля
-- не подменяется (остаётся старая учётка РБИ — история); автор записей и прочие ссылки на учётку — как в 031.
-- Откат — 031b_rbi_transfer_profiles_down.sql (функция как в 031).
begin;
create or replace function quality.rbi_transfer_row(p_company uuid, p_table text, p_row jsonb, p_projects jsonb, p_auth jsonb, p_names jsonb)
returns jsonb language plpgsql stable as $$
declare
  v text := p_row::text;
  b text;
  j jsonb;
  k text;
  u text;
begin
  foreach b in array quality.rbi_transfer_buckets() loop
    v := replace(v, '/storage/v1/object/public/' || b || '/', '/storage/v1/object/public/quality-' || b || '/' || p_company || '/');
  end loop;
  -- код проекта внутри данных записи (task_data, inspection_data …; и в JSON, сохранённом текстом): "project_code"/"projectCode"
  for k, u in select key, value from jsonb_each_text(p_projects) loop
    v := regexp_replace(v, '(\\?"(project_code|projectCode)\\?"\s*:\s*\\?")' || regexp_replace(k, '([.*+?^${}()|\[\]\\])', '\\\1', 'g')
                           || '(\\?")', '\1' || u || '\3', 'g');
  end loop;
  j := v::jsonb;
  foreach k in array array['project_code', case when p_table = 'allowed_projects' then 'code' end] loop
    if k is not null and p_projects ? (j ->> k) then j := j || jsonb_build_object(k, p_projects ->> (j ->> k)); end if;
  end loop;
  -- путь файла в бакете компании начинается с компании (018d); отчёты не переносятся — их пути не трогаем
  if j ? 'storage_path' and coalesce(j ->> 'bucket', j ->> 'bucket_name', '') = any (quality.rbi_transfer_buckets())
     and nullif(j ->> 'storage_path', '') is not null and j ->> 'storage_path' not like p_company || '/%' then
    j := j || jsonb_build_object('storage_path', p_company || '/' || ltrim(j ->> 'storage_path', '/'));
  end if;
  -- профиль РБИ — история (роль экрана берёт права компании): своя учётка у человека — профиль, созданный новым приложением
  -- при входе по почте (уникально: компания + учётка), поэтому auth_user_id старого профиля не подменяется (031b)
  foreach k in array array[case when p_table <> 'rbi_engineer_profiles' then 'auth_user_id' end, 'owner_auth_user_id', 'assigned_to_auth_user_id', 'created_by_auth_user_id',
                           'updated_by_auth_user_id', 'deleted_by_auth_user_id'] loop
    if k is not null and p_auth ? (j ->> k) then j := j || jsonb_build_object(k, p_auth ->> (j ->> k)); end if;
  end loop;
  -- автор записи (core_created_by): учётка старого автора — по старой учётке, иначе по имени
  u := coalesce(p_auth ->> (p_row ->> 'created_by_auth_user_id'), p_auth ->> (p_row ->> 'owner_auth_user_id'),
                p_names ->> (p_row ->> 'engineer_name'), p_names ->> (p_row ->> 'inspector_name'),
                p_names ->> (p_row ->> 'created_by_name'), p_names ->> (p_row ->> 'owner_name'));
  j := j || jsonb_build_object('core_company_id', p_company, 'core_project_id', null, 'core_created_by', u);
  if p_table = 'rbi_engineer_profiles' then j := j || jsonb_build_object('pin_hash', null); end if;
  return j;
end $$;
revoke all on function quality.rbi_transfer_row(uuid, text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
commit;
