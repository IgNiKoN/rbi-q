-- P2-0076: разовая привязка старых замечаний внешнего СК — СУХОЙ ПРОГОН (только чтение). Запуск в SQL Editor после 056.
-- Отчёт: компания, вид (contractor — фирма, category — категория, place — место), текст из Excel, запись «Компании», замечаний,
-- как узнано (автоподбор / не сопоставлено — в «Разобрать»). Ничего не меняется: соответствия не заводятся, id не ставятся.
-- Ниже — сводка по видам. Отчёт показать владельцу; «да» → 02_apply.sql.
select * from quality.sk_links_backfill(false) order by company, kind, records desc;

select company, kind,
       count(*) as texts,
       sum(records) as records,
       sum(records) filter (where target is not null) as records_matched,
       count(*) filter (where target is null) as texts_to_review
  from quality.sk_links_backfill(false)
 group by company, kind
 order by company, kind;
