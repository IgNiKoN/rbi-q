-- P2-0047 (045): состояние мест «Перевод 045» — запускать до up, после up и после down (сравнить вывод).
select id, node_type, coalesce((to_jsonb(l)->>'object_kind'), '-') kind, updated_at from core.locations l
 where project_id = '00000000-0000-4000-8000-000000045002' order by id;
