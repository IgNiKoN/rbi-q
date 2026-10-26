---
name: "platform2-verify"
description: "Роли ТЕСТЕР и ДОКУМЕНТАТОР Platform 2.0 / План-Факт СМР: независимая проверка diff задачи P2-xxxx (PASS/FAIL/BLOCKED) или обновление Markdown после PASS."
---

# Platform 2.0 — роли TESTER / DOCUMENTER

Одна сессия = одна роль. Если пользователь не сказал явно «Тестер» или «Документатор» — спросить и не начинать.

## Где регламент

- В новом репозитории: корень (`AGENTS.md`, `ai-dev/`).
- В Cowork: `$HOME/mnt/Project Cloude/Platform_2_0_AI_Roles_Workflow_v1_3/` (через device_bash).

Общее чтение: `AGENTS.md`, `FILE_MAP.md`, `ai-dev/CURRENT_CONTEXT.md`, `ai-dev/WORKFLOW.md`, карточка `ai-dev/tasks/<ID>.md`, отчёт Исполнителя, точный commit/diff.

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