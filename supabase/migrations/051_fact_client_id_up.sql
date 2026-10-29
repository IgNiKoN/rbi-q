-- P2-0064 (Факт без сети; MODULES.md раздел 9, правило 1 «повтор не создаёт дубль»): ввод факта с номером записи,
-- созданным на телефоне. Прораб вносит факт без связи — запись лежит на устройстве и уходит, когда связь появится;
-- если связь оборвалась после записи на сервере, телефон отправит ту же запись ещё раз — сервер вернёт прежний ответ.
--   1) planfact.fact_submissions — какие номера с устройства уже приняты и что ответил сервер (строки — только функции, RLS без правил);
--   2) public.pf_fact_submit(p_client_id, p_entry) — одна запись (kind 'entry') или пачка (kind 'batch'), как прежние
--      pf_fact_add / pf_fact_add_for / pf_fact_add_batch / pf_fact_add_batch_for (их права, проверки и «на проверку» при переборе —
--      без изменений: функция их и вызывает). Отказ — откат целиком, номер не занимается: после исправления (право, бригада)
--      та же запись уходит снова. Номер, занятый другим пользователем, — отказ.
-- Прежние функции и их подписи не меняются (старое приложение работает).
begin;

create table planfact.fact_submissions (
  id uuid primary key,   -- номер записи, созданный на телефоне (p_client_id)
  company_id uuid not null,
  project_id uuid not null,
  kind text not null check (kind in ('entry', 'batch')),
  result jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index fact_submissions_project_idx on planfact.fact_submissions(project_id, created_at desc);
alter table planfact.fact_submissions enable row level security;
-- правил нет: читают и пишут только функции ниже (deny-by-default)
revoke all on planfact.fact_submissions from public, anon, authenticated;

create function public.pf_fact_submit(p_client_id uuid, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare v_kind text := p_entry ->> 'kind'; v_project uuid; v_company uuid; v_prev planfact.fact_submissions; v_res jsonb;
        v_behalf uuid := nullif(p_entry ->> 'on_behalf', '')::uuid;
begin
  if auth.uid() is null then raise exception 'Нет права вносить факт' using errcode = '42501'; end if;
  if p_client_id is null then raise exception 'Нет номера записи с устройства' using errcode = '22023'; end if;
  if p_entry is null or jsonb_typeof(p_entry) <> 'object' or v_kind is null or v_kind not in ('entry', 'batch') then
    raise exception 'Неизвестный вид записи факта' using errcode = '22023';
  end if;
  -- повтор уже принятой записи — прежний ответ, второй записи нет
  select * into v_prev from planfact.fact_submissions where id = p_client_id;
  if found then
    if v_prev.created_by <> auth.uid() then raise exception 'Номер записи занят другим пользователем' using errcode = '42501'; end if;
    return v_prev.result || jsonb_build_object('repeat', true);
  end if;
  if v_kind = 'entry' then
    select project_id into v_project from planfact.vor_positions where id = (p_entry ->> 'position_id')::uuid;
    if v_project is null then raise exception 'Позиция не найдена' using errcode = '22023'; end if;
  else
    v_project := (p_entry ->> 'project_id')::uuid;
  end if;
  select company_id into v_company from core.projects where id = v_project;
  if v_company is null then raise exception 'Проект не найден' using errcode = '22023'; end if;
  -- номер занимается до записи факта: одновременный повтор ждёт первого и получает его ответ
  insert into planfact.fact_submissions(id, company_id, project_id, kind) values (p_client_id, v_company, v_project, v_kind)
  on conflict (id) do nothing;
  if not found then
    select * into v_prev from planfact.fact_submissions where id = p_client_id;
    if v_prev.created_by <> auth.uid() then raise exception 'Номер записи занят другим пользователем' using errcode = '42501'; end if;
    return v_prev.result || jsonb_build_object('repeat', true);
  end if;
  if v_kind = 'entry' then
    if v_behalf is not null then
      v_res := public.pf_fact_add_for(v_behalf, (p_entry ->> 'position_id')::uuid, (p_entry ->> 'brigade_id')::uuid, (p_entry ->> 'date')::date,
        (p_entry ->> 'qty')::numeric, (p_entry ->> 'workers')::int, (p_entry ->> 'man_hours')::numeric, p_entry ->> 'note',
        (p_entry ->> 'period_from')::date);
    else
      v_res := public.pf_fact_add((p_entry ->> 'position_id')::uuid, (p_entry ->> 'brigade_id')::uuid, (p_entry ->> 'date')::date,
        (p_entry ->> 'qty')::numeric, (p_entry ->> 'workers')::int, (p_entry ->> 'man_hours')::numeric, p_entry ->> 'note',
        (p_entry ->> 'period_from')::date);
    end if;
  elsif v_behalf is not null then
    v_res := public.pf_fact_add_batch_for(v_behalf, v_project, (p_entry ->> 'brigade_id')::uuid, (p_entry ->> 'date')::date, p_entry -> 'items',
      (p_entry ->> 'workers')::int, p_entry ->> 'note');
  else
    v_res := public.pf_fact_add_batch(v_project, (p_entry ->> 'brigade_id')::uuid, (p_entry ->> 'date')::date, p_entry -> 'items',
      (p_entry ->> 'workers')::int, p_entry ->> 'note', coalesce((p_entry ->> 'require_approval')::boolean, false));
  end if;
  update planfact.fact_submissions set result = v_res where id = p_client_id;
  return v_res;
end $$;

revoke all on function public.pf_fact_submit(uuid, jsonb) from public, anon;
grant execute on function public.pf_fact_submit(uuid, jsonb) to authenticated;

commit;
