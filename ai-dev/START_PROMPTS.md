# Короткие запросы для двух ролей (ADR-062)

Короткий режим — фразы из `LOOP.md` §6. Ниже — полные формулировки, если нужно запустить роль без скила.

## 1. Архитектор

> ROLE=ARCHITECT. Прочитай `ai-dev/CORE_RULES.md`, `ai-dev/CURRENT_CONTEXT.md`, `ai-dev/ROADMAP.md`, `ai-dev/MVP_BACKLOG.md`, `ai-dev/roles/ARCHITECT.md`. Предложи владельцу следующий **крупный блок**: что он даст, 2–3 варианта реализации с рекомендацией — простым языком. После обсуждения напиши карточку `ai-dev/tasks/<ID>.md` (DRAFT) и `ai-dev/handoff/LATEST_ARCHITECT_PLAN.md` (`STATUS: PLAN_READY`). Код и SQL не пиши. Для общих функций — владелец и единственный источник истины (`standards/SINGLE_SOURCE_OF_TRUTH.md`, `AUTH_AND_ACCESS.md`).

## 2. Исполнитель

> ROLE=EXECUTOR. Выполни план `ai-dev/handoff/LATEST_ARCHITECT_PLAN.md` / карточку `[ID]`. Прочитай `ai-dev/CORE_RULES.md`, `ai-dev/roles/EXECUTOR.md`. Работай в task-ветке нового репозитория, production RBI/Quality не трогай. Реализуй план, напиши тесты, **сам проверь** по `roles/TESTER.md` (команда → фактический результат, NOT RUN с причиной), **сам обнови документацию** по `roles/DOCUMENTER.md`, просмотри свой полный diff. Сдай отчёт `reports/<ID>/executor-<n>.md` + `handoff/LATEST_EXECUTOR_REPORT.md` (`STATUS: READY_FOR_ACCEPTANCE` или `BLOCKED`). DONE не ставь.

## 3. Приёмка

Владелец: «Архитектор. принято P2-xxxx» или «Вернуть P2-xxxx: …». Для CRITICAL-блоков Архитектор перед DONE делает read-only ревью diff (ADR-062).
