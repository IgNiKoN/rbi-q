-- P2-0027 (найдено на перенесённых данных РБИ, замер на сервере 25.10.2026 — scripts/rbi-transfer/perf/01_rls_cost.sql).
-- Правило видимости пунктов и фото проверки ищет автора старой проверки по почте в engineer_name (quality.member_by_email).
-- У перенесённых записей РБИ там имя («Иванов А.И.»), а не почта: поиск по учёткам на каждой строке впустую — 93 % времени
-- правила (1904 из 2039 мс на 2277 пунктах), загрузка приложения обрывается по таймауту сервера.
-- Почта всегда содержит «@»: без «@» ответ «не найдено» сразу (case — до поиска и проверки прав). Результат функции не меняется.
-- Откат — 031c_quality_author_lookup_fast_down.sql (функция как в 024).
begin;
create or replace function quality.member_by_email(p_company uuid, p_email text)
returns uuid language sql stable security definer set search_path = pg_catalog, core as $$
  select case when strpos(coalesce(p_email, ''), '@') = 0 then null::uuid else (
    select m.user_id from core.company_members m join auth.users u on u.id = m.user_id
     where m.company_id = p_company and p_company = quality.request_company()   -- только своя текущая компания
       and quality.has_actions(p_company, null, array['quality.view', 'construction.view'])
       and nullif(btrim(coalesce(p_email, '')), '') is not null
       and lower(u.email::text) = lower(btrim(p_email)) limit 1) end;
$$;
revoke all on function quality.member_by_email(uuid, text) from public, anon, authenticated;
grant execute on function quality.member_by_email(uuid, text) to authenticated;
commit;
