-- P2-0036 этап 1. Отчёты одного объекта: отпечаток public, размер базы, перенос с замером времени, без сверки (запуск — по разрешению владельца).
-- Объект — ключ объекта РБИ (как в 01c_objects.sql). Повтор безопасен (только новые строки). Затем файлы: node scripts/rbi-transfer/files.mjs copy <id компании>.
with c as (select id from core.companies where name = 'RBI'),
fp as (select md5(string_agg(t || ':' || n || ':' || md5, ',' order by t)) v from quality.rbi_transfer_public_fingerprint()),
sz0 as (select pg_database_size(current_database()) b),
run as (select json_object_agg(t, inserted) filter (where inserted > 0) v from quality.rbi_transfer_run((select id from c), 'гбдоу детский сад №3'))
select (select v from fp) "отпечаток public до", (select pg_size_pretty(b) from sz0) "база до", (select v from run) "перенесено",
       round(extract(epoch from clock_timestamp() - statement_timestamp())::numeric, 1) "секунд";
-- сверка — отдельным запуском (04_verify.sql): в том же запросе сверка не видит только что перенесённые строки
