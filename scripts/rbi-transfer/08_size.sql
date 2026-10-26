-- P2-0027. Размер базы, раздела quality и файлов компании RBI (только чтение).
select pg_size_pretty(pg_database_size(current_database())) db,
       pg_size_pretty((select sum(pg_total_relation_size(format('quality.%I', table_name)::regclass)) from information_schema.tables where table_schema = 'quality' and table_type = 'BASE TABLE')) quality,
       (select count(*) || ' файлов · ' || pg_size_pretty(coalesce(sum((metadata ->> 'size')::bigint), 0)) from storage.objects
         where bucket_id like 'quality-%' and name like (select id::text from core.companies where name = 'RBI') || '/%') files_rbi,
       now()::text at_;
