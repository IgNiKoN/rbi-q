-- P2-0027. Перенос в компанию «RBI» (SQL Editor, по разрешению владельца). Один объект — ключ объекта РБИ (как в 01c_objects.sql),
-- всё — null. Повтор безопасен (только новые строки). Затем файлы: node scripts/rbi-transfer/files.mjs copy <id компании>.
select * from quality.rbi_transfer_run((select id from core.companies where name = 'RBI'), 'гбдоу детский сад №3');
