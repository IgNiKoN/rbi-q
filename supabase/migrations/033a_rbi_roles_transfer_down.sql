-- Откат P2-0033 этап 2 (033a_rbi_roles_transfer_up.sql): функции переноса ролей удаляются. Созданные роли, назначения и
-- добавленные объекты справочника остаются (данные компании): снять роли — «Сотрудники», объекты — справочник объектов Качества.
begin;
drop function quality.rbi_transfer_roles(uuid, boolean);
drop function quality.rbi_object_ref(uuid, text);
drop function quality.rbi_role_name(text);
drop function quality.rbi_role_actions(text);
commit;
