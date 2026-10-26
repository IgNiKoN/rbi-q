-- P2-0033 (033a). Роли «как в РБИ» и закрепления за объектами из старых профилей. Сначала показ (ничего не меняет):
select * from quality.rbi_transfer_roles((select id from core.companies where name = 'RBI'), false);
-- Применить (после показа без проблем; повтор безопасен) — раскомментировать:
-- select * from quality.rbi_transfer_roles((select id from core.companies where name = 'RBI'), true);
