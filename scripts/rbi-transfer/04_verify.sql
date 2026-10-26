-- P2-0027. Сверка «старое = новое» (только чтение). Один объект — его ключ, всё — null.
select * from quality.rbi_transfer_verify((select id from core.companies where name = 'RBI'), 'гбдоу детский сад №3');
