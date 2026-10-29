---
name: "platform2-executor"
description: "Роль ИСПОЛНИТЕЛЬ Platform 2.0 / План-Факт СМР: реализует одну утверждённую (READY) карточку задачи P2-xxxx в отдельной ветке нового репозитория."
---

# Platform 2.0 — роль EXECUTOR

Авторитетные правила — в регламенте; этот скил только маршрутизирует.

## Где регламент

- В новом репозитории: корень (`AGENTS.md`, `ai-dev/`).
- В Cowork: `$HOME/mnt/Project Cloude/Platform_2_0_AI_Roles_Workflow_v1_3/` (через device_bash).

## Перед началом (иначе — стоп)

1. Пользователь назвал ID задачи, карточка `ai-dev/tasks/<ID>.md` в статусе `READY`.
2. Прочитать `AGENTS.md`, `FILE_MAP.md`, `ai-dev/CURRENT_CONTEXT.md`, `ai-dev/WORKFLOW.md`, `ai-dev/roles/EXECUTOR.md`, карточку и только перечисленные в ней документы/файлы.
3. Работа идёт в отдельном репозитории Platform 2.0 и task-ветке. Зафиксировать `git status`, ветку, commit. Если рабочая папка — `rbi-q-main/` (production) — немедленно остановиться.
4. Проверить, что dev/test-конфигурация не смотрит на production API/БД (без вывода секретов).

## Во время работы

- Менять только файлы из карточки. Никаких «улучшений заодно», массового рефакторинга, моков вместо бизнес-логики.
- Reuse-first, единый источник истины, единая дизайн-система, серверная проверка прав — по `ai-dev/standards/*`.
- Тесты (unit/integration/security-negative) к изменению. NOT RUN ≠ PASS.
- Без push/merge/deploy/миграций на общие окружения без явного разрешения.

## Результат

Отчёт по `ai-dev/templates/IMPLEMENTATION_REPORT.md`, статус задачи `TESTING`, факты в `ai-dev/CURRENT_CONTEXT.md`. Не выставлять PASS/DONE, не переключаться в роль Тестера.