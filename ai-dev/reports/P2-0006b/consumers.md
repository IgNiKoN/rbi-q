# P2-0006b — опись потребителей позиций ВОР (этап 1)

Источник: определения функций копии сервера после `045` (PGlite, `pg_get_functiondef`), поиск по `vor_positions`, `vor_links`, `vor_imports`, `vor_source_rows`, `fact_totals`.

**Как было:** позиции создаются только при подтверждении загрузки; все функции брали **все позиции проекта** (`vor_positions where project_id = …`), план — `p.qty`. Двух редакций одной ВОР не было.

**Как стало (046):** «действующая редакция» — одно поле `planfact.vor_heads.current_import_id`. Позиция переживает редакцию (тот же `id`); объём и «снята» — события `planfact.vor_position_events`; текущее состояние — представление `planfact.vor_positions_current`. План везде идёт через `planfact.fact_totals`: действующий объём, у снятой — 0; снятая без факта в расчётах не видна.

| Функция | Что берёт | Решение в 046 |
|---|---|---|
| `planfact.fact_totals` | план и факт по позициям | **изменена**: план из `vor_positions_current`, снятая — 0 / скрыта без факта |
| `pf_summary_positions`, `pf_fact_positions` | список позиций + `fact_totals` | **пересоздана**: + столбец `withdrawn` |
| `pf_vor_positions` | позиции ВОР | **пересоздана**: действующий объём, файл и строка действующей редакции, + `withdrawn`, `revision_no` |
| `pf_vor_list_imports` | список загрузок | **пересоздана**: + `revision_no`, `previous_import_id`, `root_import_id`, `is_current`, `confirmed_by_email`; «позиций» — по связкам строк этой загрузки (для №1 — то же число) |
| `pf_summary_places`, `pf_summary_portfolio` | `fact_totals` + счёт позиций | **изменены**: счёт — только действующие |
| `planfact.fact_insert` (через `pf_fact_add`, `pf_fact_correct`, пачки) | допуск от `p.qty` | **изменена**: допуск — от действующего объёма; на снятую — только исправление |
| `pf_vor_confirm` | первая загрузка | **изменена**: создаёт «действующую №1»; новую редакцию так не подтвердить |
| `pf_estimate_create` | подтверждённые загрузки | **изменена**: только действующие редакции |
| `pf_summary_worktypes`, `pf_summary_weekly`, `pf_summary_attention`, `pf_fact_pending`, `pf_fact_position_totals`, `summary_project` | план — через `fact_totals` (inner join) | без изменений — переходят сами |
| `pf_fact_history`, `pf_fact_journal`, `pf_fact_decide`, `pf_fact_correct`, `fact_guard` | позиция — только для места / вида / блокировки | без изменений |
| `ks2_rows`, `position_money`, `summary_rows`, `pf_ks2_*`, `pf_summary_ks2_gap` | строки **КП** (`estimates.import_ids`) + факт позиций через связки | без изменений: КС-2 и деньги — по договорному КП, построенному на своей редакции (решение карточки: смета/КП не пересчитываются). Факт совпавших позиций приходит в строки прежней редакции через их связку; у новых позиций цены нет до нового КП |
| `pf_estimate_rows`, `pf_estimate_set_prices`, `estimate_fill_reference`, `pf_kp_create`, `pf_price_upsert`, `pf_vor_add_rows`, `pf_vor_resolve_rows`, `pf_vor_import_rows`, `pf_vor_delete_import`, `pf_vor_create_import`, `pf_list_company_audit`, `require_vor_draft`, `vor_guard_confirmed` | строки одной загрузки / черновик | без изменений (черновик редакции — тот же поток) |

**Новые функции:** `pf_vor_create_revision` (черновик к действующей, один на редакцию), `pf_vor_revision_base` (строки действующей редакции с позициями и фактом — база для сравнения на устройстве), `pf_vor_accept_revision` (всё или ничего: проверка, что действующая не сменилась; решение по каждой строке; снятие; «оставить» / «перенести факт»), `pf_vor_revision_changes` (события редакции — для истории).

**Триггер неизменяемости `vor_guard_confirmed` не ослаблен:** старая редакция и её позиции не меняются; принятие только добавляет (новые позиции, связки, события) и переводит черновик в «подтверждена». Перенос факта — новой записью, старая — `superseded` (как исправление сейчас).

**Известное следствие (для архитектора):** перенесённый на новую позицию факт попадает в КС-2 только после нового КП по новой редакции (старое КП не знает новой строки). Сводка и шахматка по объёмам — сразу по новой редакции.
