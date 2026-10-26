-- P2-0014 (ADR-067, решение владельца 22.10.2026 «давай исправим»): сторож СОЗДАНИЯ профиля Качества.
-- Дыра (аудит reports/P2-0014/audit.md): политика INSERT на public.rbi_engineer_profiles пропускает любую строку
-- с auth_user_id = auth.uid(), а триггер rbi_guard_profile_update защищает только UPDATE. Любой, кто зарегистрировался
-- публичным ключом, мог вставить себе role = 'manager', cloud_status = 'approved' и стать руководителем любого проекта.
-- Исправление: BEFORE INSERT — не-руководитель проекта создаёт профиль только как guest / pending без назначений
-- (так же, как его создаёт само приложение, sync-connection.actions.js). Руководитель проекта (rbi_can_manage_profiles)
-- и служебные роли — как раньше.
-- Только ДОБАВЛЯЕТ функцию planfact.rbi_profile_insert_guard() и триггер; существующие политики, функции, триггеры
-- и данные RBI не меняются. При ON CONFLICT DO UPDATE прежний UPDATE-сторож возвращает роль и статус из старой строки.
-- Откат — 015_rbi_guard_down.sql.

create or replace function planfact.rbi_profile_insert_guard()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if public.rbi_can_manage_profiles(new.project_code) then
    return new;
  end if;
  new.role := 'guest';
  new.cloud_status := 'pending';
  new.assigned_projects := '{}';
  new.assigned_contractor := '';
  new.contractor_name := '';
  return new;
end $$;

revoke all on function planfact.rbi_profile_insert_guard() from public, anon, authenticated;

drop trigger if exists trg_p2_rbi_profile_insert_guard on public.rbi_engineer_profiles;
create trigger trg_p2_rbi_profile_insert_guard
  before insert on public.rbi_engineer_profiles
  for each row execute function planfact.rbi_profile_insert_guard();
