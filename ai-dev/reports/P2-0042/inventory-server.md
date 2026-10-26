# P2-0042 этап 1 — опись доступа без входа к схеме public (сервер, 26.10.2026)

Источник: `scripts/p2-0042/01_inventory.sql` (только чтение, SQL Editor сервера) и REST публичным ключом (`select … limit=1`, `Prefer: count=exact` — только число строк, данные не сохранялись).

## Итог
- Таблиц `public` с правами `anon` (S,I,U,D): **61**; ещё 13 таблиц `plan_fact_*` — только `authenticated` (старый прототип План/Факт, новое приложение работает со схемой `planfact`).
- Правил RLS в `public`: 312; из них «для всех» (`using(true)` / `check(true)`, роль anon/public): **17** — allowed_projects.rbi_allowed_projects_select_public, construction_acceptance_v2.construction_acceptance_v2_select_an, construction_buildings_v2.construction_buildings_v2_select_anon, construction_defects_v2.construction_defects_v2_select_anon, construction_floors_v2.construction_floors_v2_select_anon, construction_objects_v2.construction_objects_v2_select_anon, construction_units_v2.construction_units_v2_select_anon, contractor_aliases_v2.contractor_aliases_v2_select_anon, contractors.contractors_select_anon, contracts.contracts_select_anon, issue_items.issue_items_select_anon, issues.issues_select_anon, location_node_aliases.location_node_aliases_select_anon, location_nodes.location_nodes_select_anon, rbi_company_settings.rbi_company_settings_select_anon, rbi_sync_queue."Allow insert to queue", sk_records_v2.sk_records_v2_select_anon.
- Функций `public` (кроме `pf_*`), доступных `anon`: **43** (`rbi_*`, `auth_name`, `auth_role`, `can_create`, `is_admin`, `get_public_report_by_token`, `plan_fact_*`, `set_updated_at`). Все `pf_*` — только `authenticated` (норма).
- Последовательность `plan_fact_audit_id_seq` — `anon` и `authenticated`.
- Права по умолчанию в `public` (`postgres` и `supabase_admin`): новые таблицы, последовательности и функции автоматически получают права `anon` и `authenticated`.

## Что реально отдаётся без входа (REST, число строк)
| Таблица | Строк |
|---|---|
| `allowed_projects` | 2 |
| `construction_acceptance_v2` | 21 |
| `construction_defects_v2` | 33 |
| `construction_floors_v2` | 133 |
| `construction_units_v2` | 64 |
| `contractors` | 14 |
| `contracts` | 2 |
| `location_nodes` | 392 |
| `rbi_company_settings` | 1 |
| `shared_report_snapshots` | 376 |

Остальные 51 таблиц без входа отдают 0 строк (правила RLS по ролям старого приложения), но права `anon` на запись/чтение у них есть; `rbi_sync_queue` — вставка для всех (`check(true)`).

**Сверх описи Архитектора:** `shared_report_snapshots` — 376 сохранённых отчётов (правило «публичный отчёт» без токена отдаёт все), `allowed_projects` — 2.

## Потребители в коде (новое приложение)
- Клиент Качества — `createQualityClient` (`src/platform/auth/quality-bridge.ts:136`, схема `quality`); `sync-engine.core.js` читает одноимённые таблицы через него, не `public`.
- Старый клиент `public` (`js/services/sync/sync-auth.js:133`) не создаётся: `APP_CONFIG.SUPABASE_URL = ''` (`js/services/config.service.js:18`, так же на `app.rbi-q.ru`).
- Платформа (`auth.service.ts`) — только функции `pf_*`; `pf-ai` — `Accept-Profile: quality`.
- `report.html` (QR-ссылки отчётов) вызывает `get_public_report_by_token` старым клиентом — на сайте уже показывает «Облако отключено» (URL пуст с P2-0032); закрытие ничего не меняет. Восстановление QR — отдельная задача (ТД).
- Серверные функции переноса (`031*`, `033a/b`, `036*`) читают `public.*` от владельца базы, `authenticated` их не вызывает.

**Вывод:** потребителей `public` (таблиц и функций, кроме `pf_*`) у нового приложения нет — стоп-условие этапа 1 не сработало.
