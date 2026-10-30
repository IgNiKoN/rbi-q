-- P2-0076: разовая привязка старых замечаний внешнего СК — ПРИМЕНЕНИЕ (по «да» владельца после 01_dryrun.sql).
-- Одна транзакция: всем текстам заводятся соответствия (узнанное — с записью «Компании», остальное — «не сопоставлено»,
-- это и есть «Разобрать»), замечаниям, у которых id отличаются, — новые id и время правки (устройства подтянут).
-- Повторный запуск — 0 изменений (проверка — последний запрос: число замечаний, у которых id не совпали бы, = 0).
begin;
select company, kind, count(*) as texts, sum(records) as records, count(*) filter (where target is null) as to_review
  from quality.sk_links_backfill(true) group by company, kind order by company, kind;
commit;

-- Проверка после применения: соответствий по видам и «не сопоставлено»
select c.name as company, l.kind, count(*) as links,
       count(*) filter (where coalesce(l.counterparty_id, l.work_type_id, l.location_id) is null) as to_review
  from quality.sk_links l join core.companies c on c.id = l.company_id
 group by c.name, l.kind order by c.name, l.kind;
