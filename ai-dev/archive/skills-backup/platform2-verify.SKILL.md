---
name: "platform2-verify"
description: "Роли ТЕСТЕР и ДОКУМЕНТАТОР Platform 2.0 / План-Факт СМР: независимая проверка diff задачи P2-xxxx (PASS/FAIL/BLOCKED) или обновление Markdown после PASS."
---

# Platform 2.0 — роли TESTER / DOCUMENTER

> **ЭКОНОМИЯ ТОКЕНОВ — этот блок главнее списков чтения ниже.** Читать только: `ai-dev/CORE_RULES.md` (вместо AGENTS/WORKFLOW/DoD/FILE_MAP), `ai-dev/CURRENT_CONTEXT.md`, `ai-dev/handoff/LATEST_*` предыдущей роли, карточку `ai-dev/tasks/<ID>.md`, шаблон своей роли. Остальные файлы регламента, ТЗ, архитектуру, `standards/*` — только точечно (grep, ±30 строк) и только если нужное названо в карточке. Не перечитывать прочитанное. Выход: `LATEST_*` ≤ 40 строк, полный отчёт — только факты (команда → результат), ответ в чат ≤ 15 строк + фраза для следующего чата. Вывод тяжёлых команд — через `tail`/`grep`. Субагентов не запускать без необходимости.


Одна сессия = одна роль. Если пользователь не сказал явно «Тестер» или «Документатор» — спросить и не начинать.

## Где регламент

- Единственная копия: репозиторий `~/dev/platform-2-core` — корень (`CLAUDE.md`, `AGENTS.md`, `FILE_MAP.md`, `ai-dev/`). iCloud-папка `Project Cloude/Platform_2_0_AI_Roles_Workflow_v1_3__ARCHIVE_moved_to_repo/` — архив, туда не писать.

Общее чтение: `AGENTS.md`, `FILE_MAP.md`, `ai-dev/CURRENT_CONTEXT.md`, `ai-dev/WORKFLOW.md`, карточка `ai-dev/tasks/<ID>.md`, отчёт Исполнителя, точный commit/diff.

Вопросы владельцу — **всегда кнопками с вариантами** (AskUserQuestion), рекомендуемый первым с пометкой «(рекомендую)».

## TESTER

- Читать `ai-dev/roles/TESTER.md`, `ai-dev/DEFINITION_OF_DONE.md`, `ai-dev/standards/CHANGE_IMPACT_AND_REGRESSION.md`.
- Не менять бизнес-код. Проверить scope, сборку, тесты, пользовательский сценарий, регрессию, негативные проверки прав/RLS, единицы измерения и двойной учёт для ВОР/плана/факта, светлую/тёмную тему для UI.
- Итог только PASS / FAIL / BLOCKED; NOT RUN отдельно. Отчёт — `ai-dev/templates/TEST_REPORT.md`.
- Финальная проверка (после Документатора): весь совокупный diff, нет скрытых изменений кода → `READY_FOR_ACCEPTANCE` + `ai-dev/templates/ACCEPTANCE_RECORD.md`. DONE не ставить.

## DOCUMENTER

- Только после PASS Тестера. Читать `ai-dev/roles/DOCUMENTER.md`, `ai-dev/navigation/MAP_MAINTENANCE.md`.
- Менять только относящиеся к задаче Markdown: as-built, README, API/миграции/security, CHANGELOG, `docs/TECH_DEBT.md`, трассировка к кодам ТЗ (`ai-dev/reference/TZ_PLAN_FACT.md`), `FILE_MAP.md` при переездах файлов.
- Описывать только реально реализованное. Код не трогать. Передать обратно Тестеру на финальную проверку.

## Общие запреты

- `rbi-q-main/` и production RBI/Quality — только чтение; не открывать `_ai/TEST_CREDENTIALS.md`.
- В конце — короткое фактическое обновление `ai-dev/CURRENT_CONTEXT.md`.

## Цикл через файлы (ai-dev/LOOP.md)

Протокол цикла: `ai-dev/LOOP.md` (в Cowork — в той же папке регламента). Прочитать его первым после `AGENTS.md`.

**Роль определяется фразой запуска** — не переспрашивать: «Тестер.» / «Тестер. Финальная проверка.» / «Документатор.» (ID — из `ai-dev/CURRENT_CONTEXT.md`; если не совпадает с `LATEST_*` — стоп). Это заменяет правило «спросить, если роль не названа», когда фраза есть.

- **Тестер:** вход — `ai-dev/handoff/LATEST_EXECUTOR_REPORT.md` со `STATUS: READY_FOR_REVIEW`. Выход — `ai-dev/reports/<ID>/tester-<n>.md` (`templates/TEST_REPORT.md`) и `ai-dev/handoff/LATEST_TESTER_REPORT.md` (≤40 строк) с последней строкой `STATUS: PASS | FAIL | BLOCKED`. Следующая фраза: PASS → `Документатор.`; FAIL → `Исполнитель. Доработка <ID>`; BLOCKED → `Архитектор. Следующий шаг.`
- **Документатор:** вход — `LATEST_TESTER_REPORT.md` со `STATUS: PASS`. Выход — `LATEST_DOCUMENTER_REPORT.md` с `STATUS: DOCS_READY`; следующая фраза: `Тестер. Финальная проверка.`
- **Финальная проверка:** вход — `LATEST_DOCUMENTER_REPORT.md` = `DOCS_READY`; выход — `STATUS: READY_FOR_ACCEPTANCE` в `LATEST_TESTER_REPORT.md` + `ACCEPTANCE_RECORD`; следующая фраза владельцу: `Архитектор. принято <ID>`. DONE не ставить.
- Всегда обновлять `CURRENT_CONTEXT.md` (следующая роль). Одна фраза = одна роль, в следующую не переключаться.
