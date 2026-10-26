-- P2-0044 этап 1: в каких таблицах quality/public/core есть строка с id подрядчика замечаний v2 (ТОЛЬКО ЧТЕНИЕ).
select c.table_schema || '.' || c.table_name || '.' || c.column_name col, x.n
from information_schema.columns c
cross join lateral (select (xpath('//n/text()', query_to_xml(format(
   $f$select count(*) n from %I.%I r where r.%I::text in (
        select "contractorId" from quality.construction_defects_v2 union select "contractorId" from quality.construction_acceptance_v2)$f$,
   c.table_schema, c.table_name, c.column_name), false, true, '')))[1]::text::int n) x
where c.table_schema in ('quality', 'public', 'core') and c.column_name in ('id', 'contractor_id', 'contractorId', 'counterparty_id')
  and c.table_name not in ('construction_defects_v2', 'construction_acceptance_v2')
  and (select relkind from pg_class where oid = (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass) = 'r'
  and x.n > 0;
