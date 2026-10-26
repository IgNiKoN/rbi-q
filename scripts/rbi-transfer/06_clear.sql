-- P2-0027. Откат переноса компании «RBI»: сначала node scripts/rbi-transfer/files.mjs clear <id компании> (файлы), затем этот запрос.
select * from quality.rbi_transfer_clear((select id from core.companies where name = 'RBI'));
