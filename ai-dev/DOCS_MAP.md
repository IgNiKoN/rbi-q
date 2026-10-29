# Platform 2.0 — карта документов (DOCS_MAP)

**Версия:** 1.0 · 29.10.2026 (ревизия документов). **Что это:** единый ответ на вопросы «что читать сейчас» и «зачем нужен этот файл». Где лежит **код** — [`FILE_MAP.md`](../FILE_MAP.md).
**Правило экономии:** читать только строку своей ситуации (раздел 1). Остальное — точечно (`grep -n`, ±30 строк), не целиком.
**Кто обновляет:** тот, кто добавил, перенёс или отправил в архив документ, — в том же коммите.

## 1. Что читать — по ситуации

| Ситуация | Читать (по порядку) | Не читать без нужды |
|---|---|---|
| Любой агент, первый шаг | `CLAUDE.md` → [`CORE_RULES.md`](CORE_RULES.md) → [`CURRENT_CONTEXT.md`](CURRENT_CONTEXT.md) | `AGENTS.md` целиком (CORE_RULES — его выжимка) |
| Архитектор: «Следующий блок» | + [`handoff/LATEST_ARCHITECT_PLAN.md`](handoff/LATEST_ARCHITECT_PLAN.md), [`handoff/LATEST_EXECUTOR_REPORT.md`](handoff/LATEST_EXECUTOR_REPORT.md), [`ROADMAP.md`](ROADMAP.md), [`reference/MODULES.md`](reference/MODULES.md), [`standards/BLOCK_SIZING.md`](standards/BLOCK_SIZING.md), [`standards/WEIGHT_BUDGET.md`](standards/WEIGHT_BUDGET.md), [`templates/TASK_CARD.md`](templates/TASK_CARD.md) | `CONTEXT_LOG.md`, `reports/*`, архитектура v1.2 |
| Архитектор: «принято P2-xxxx» | + карточка `tasks/<ID>.md`, `reports/<ID>/executor-<n>.md`, [`templates/ACCEPTANCE_RECORD.md`](templates/ACCEPTANCE_RECORD.md), [`DEFINITION_OF_DONE.md`](DEFINITION_OF_DONE.md) | чужие блоки |
| Исполнитель: «Исполнитель. P2-xxxx» | + `handoff/LATEST_ARCHITECT_PLAN.md`, карточка `tasks/<ID>.md`, [`roles/EXECUTOR.md`](roles/EXECUTOR.md), [`roles/TESTER.md`](roles/TESTER.md) (самопроверка), [`roles/DOCUMENTER.md`](roles/DOCUMENTER.md) (документы); нужные строки `FILE_MAP.md` | весь `FILE_MAP.md`, `ROADMAP.md` |
| Экран / интерфейс | [`standards/DESIGN_SYSTEM.md`](standards/DESIGN_SYSTEM.md), [`standards/UI_COMPONENTS.md`](standards/UI_COMPONENTS.md), [`specs/2026-10-27-screens-and-layouts.md`](specs/2026-10-27-screens-and-layouts.md) | — |
| Вход, роли, права, RLS | [`standards/AUTH_AND_ACCESS.md`](standards/AUTH_AND_ACCESS.md), [`standards/SYNC_AND_ACCESS.md`](standards/SYNC_AND_ACCESS.md), [`standards/SINGLE_SOURCE_OF_TRUTH.md`](standards/SINGLE_SOURCE_OF_TRUTH.md) | — |
| Сервер, миграции, выкладка | [`../docs/SERVERS.md`](../docs/SERVERS.md), [`../docs/EDGE_FUNCTIONS.md`](../docs/EDGE_FUNCTIONS.md), `reports/<ID>/release-plan.md` прошлого блока | — |
| Бизнес-требования План/Факт | [`reference/TZ_PLAN_FACT.md`](reference/TZ_PLAN_FACT.md) (коды PTO/PR/LP/MN/NFR), [`specs/2026-10-27-planfact-vs-tz.md`](specs/2026-10-27-planfact-vs-tz.md) | — |
| Слово непонятно | [`reference/GLOSSARY.md`](reference/GLOSSARY.md) | — |
| История: «когда и почему так решили» | `grep -n` по [`CONTEXT_LOG.md`](CONTEXT_LOG.md), [`../CHANGELOG.md`](../CHANGELOG.md), `reports/<ID>/acceptance-record.md` | — |
| Владелец (Игорь) | `Project Cloude/README.md` (указатель в iCloud), [`ROADMAP.md`](ROADMAP.md) — раздел «Этапы», [`../docs/DEMO.md`](../docs/DEMO.md) | — |

## 2. Что главнее при расхождении

1. Решение владельца в чате → записывается в ADR ([`standards/DECISIONS_2026-10-20.md`](standards/DECISIONS_2026-10-20.md)), раздел 7 `MODULES.md` или `CORE_RULES.md`. **Более позднее решение главнее более раннего.**
2. [`reference/MODULES.md`](reference/MODULES.md) (модули, ядро, стороны, 17 правил фундамента, решения раздела 7) и [`ROADMAP.md`](ROADMAP.md) v2.0 (порядок этапов).
3. [`CORE_RULES.md`](CORE_RULES.md) и `standards/*` — как делать.
4. [`reference/TZ_PLAN_FACT.md`](reference/TZ_PLAN_FACT.md) — что нужно заказчику в План/Факт. Чего нет — вопрос владельцу.
5. [`reference/ARCHITECTURE_v1_3_MVP_FINAL.md`](reference/ARCHITECTURE_v1_3_MVP_FINAL.md) → [`ARCHITECTURE_v1_2.md`](reference/ARCHITECTURE_v1_2.md) — исходная архитектура MVP (20.10); справочно, по вопросу.
6. Код, схема БД, сервер — факты, которые проверяются; карточка задачи — допустимый объём блока.

## 3. Все документы: назначение, статус, кто ведёт

Статусы: **живой** — обновляется в работе; **справочный** — меняется редко, читать по вопросу; **журнал** — только дописывать, читать поиском; **архив** — не обновляется, не читать по умолчанию.

### Корень репозитория

| Файл | Зачем | Статус | Кто ведёт |
|---|---|---|---|
| `CLAUDE.md` | вход для Claude Code: роль → этот файл | живой | Архитектор |
| `AGENTS.md` | полные обязательные правила агентов | справочный | Архитектор, по решению владельца |
| `FILE_MAP.md` | где в коде функция, миграции, тесты | живой | Исполнитель (в своём блоке) |
| `README.md` | запуск у себя, команды разработчика | живой | Исполнитель |
| `CHANGELOG.md` | что вошло в каждый блок (для людей) | журнал | Исполнитель |

### `ai-dev/` — регламент

| Файл | Зачем | Статус | Кто ведёт |
|---|---|---|---|
| `CORE_RULES.md` | выжимка всех правил — читать вместо `AGENTS.md` + `WORKFLOW.md` | живой | Архитектор |
| `CURRENT_CONTEXT.md` | где мы сейчас (≤ 40 строк, перезаписывается) | живой | обе роли |
| `CONTEXT_LOG.md` | журнал событий по датам (бывший CURRENT_CONTEXT) | журнал | обе роли |
| `DOCS_MAP.md` | этот файл | живой | кто меняет документы |
| `ROADMAP.md` | дорожная карта v2.0, этапы Ц / В / Г / Д | живой | Архитектор, утверждает владелец |
| `WORKFLOW.md`, `LOOP.md` | как роли передают работу, маркеры `STATUS:` | справочный | Архитектор |
| `DEFINITION_OF_DONE.md` | когда блок готов | справочный | Архитектор |
| `START_PROMPTS.md` | фразы запуска ролей без навыка | справочный | Архитектор |
| `MVP_BACKLOG.md` | заглушка: бэклог MVP закрыт, ведёт в ROADMAP | архив | — |
| `handoff/LATEST_ARCHITECT_PLAN.md` | последний план + очередь блоков + действия владельца | живой | Архитектор |
| `handoff/LATEST_EXECUTOR_REPORT.md` | последняя сдача Исполнителя | живой | Исполнитель |
| `tasks/<ID>.md` | карточка блока (статус в шапке) | живой до DONE | Архитектор |
| `reports/<ID>/` | отчёты, акты приёмки, планы выкладки, снимки | журнал | обе роли |
| `roles/*.md` | инструкции ролей; `TESTER`/`DOCUMENTER` — чек-листы Исполнителя | справочный | Архитектор |
| `templates/*.md` | шаблоны карточки, отчёта, протокола, акта | справочный | Архитектор |
| `standards/*.md` | технические правила (стек, дизайн, доступ, синхронизация, вес, размер блока, ADR) | справочный | Архитектор, по решению владельца |
| `specs/*.md` | разборы и решения по отдельным темам (дата в имени) | справочный | Архитектор |
| `reference/MODULES.md` | каталог модулей — опора каждого блока | живой | Архитектор, границы — владелец |
| `reference/GLOSSARY.md` | словарь: одно слово — одно значение | живой | Архитектор |
| `reference/TZ_PLAN_FACT.md` | ТЗ v1.1 (Markdown-копия оригинала .docx) | справочный | — |
| `reference/ARCHITECTURE_v1_3_MVP_FINAL.md`, `_v1_2.md` | исходная архитектура 20.10 (без правок) | справочный | — |
| `reference/legacy/` | старая дорожная карта RBI 13.08 | архив | — |
| `navigation/CODEBASE_MAP.md` | где искать в **старой оболочке** RBI (`js/…`), снимок 20.10 | справочный | — |
| `navigation/AGENT_SEARCH_PLAYBOOK.md`, `MAP_MAINTENANCE.md` | как искать в коде; как вести `FILE_MAP.md` | справочный | Архитектор |
| `skills-backup/*.SKILL.md` | копии навыков ролей Claude (живые навыки — в приложении Claude) | справочный | Архитектор при правке навыка |
| `archive/` | устаревшее: комплект v1.3, бэклог MVP, отчёты Тестера/Документатора, старые планы, снимки ZIP, аудиты 20.10 | архив | — |

### `docs/` — для людей и эксплуатации

| Файл | Зачем | Статус |
|---|---|---|
| `SERVERS.md` | сервер, миграции, выкладка, откат | живой |
| `TECH_DEBT.md` | техдолг: причина, владелец, условие устранения | живой |
| `DEMO.md` | показ по ролям, демо-компания | живой |
| `EDGE_FUNCTIONS.md` | серверные функции | живой |
| `RBI_TRANSFER.md`, `RBI_STAFF_MEMO.md` | перенос данных РБИ, памятка сотрудникам | справочный |
| `APP_GUIDE.md` | обзор старого приложения Качества (экраны, модули) | справочный |
| `archive/` | материалы старого проекта RBI Platform (июль–август 2026) | архив |
