# P2-0078 — замер боевого «до» (31.10.2026, перед выкладкой 059; pg_stat_statements с 25.10, только чтение)

| Запрос (PostgREST / RPC) | Вызовов | Всего, мс | Среднее, мс |
|---|---|---|---|
| file_registry | 8 494 | 19 041 640 | 2 241,8 |
| storage.search | 434 | 4 409 835 | 10 160,9 |
| sk_records | 1 474 | 631 439 | 428,4 |
| rbi_inspection_items | 761 | 466 234 | 612,7 |
| location_nodes | 1 190 | 277 936 | 233,6 |
| rbi_inspections | 2 942 | 274 915 | 93,4 |
| rbi_tasks | 2 243 | 265 480 | 118,4 |
| pf_my_permissions | 5 867 | 149 585 | 25,5 |
| construction_defects_v2 | 1 933 | 24 407 | 12,6 |
