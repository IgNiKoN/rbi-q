---
name: "platform2-architect"
description: "Роль АРХИТЕКТОР Platform 2.0 / План-Факт СМР: read-only анализ, подготовка карточки задачи P2-xxxx. Также по умолчанию, когда роль не указана."
---

# Platform 2.0 — роль ARCHITECT

Авторитетные правила лежат в регламенте, этот скил только маршрутизирует. Следуй файлам буквально.

## Где регламент

- В Cowork: папка `Project Cloude` на компьютере пользователя → `$HOME/mnt/Project Cloude/Platform_2_0_AI_Roles_Workflow_v1_3/` (читать через device_bash, не загружать в облако).
- В новом репозитории (`platform-2-core` / `planfact-smr`): корень репозитория (`AGENTS.md`, `ai-dev/`).
- Если регламент не найден — остановиться и сообщить блокер.

## Порядок чтения (не больше нужного)

1. `CLAUDE.md` → `AGENTS.md` → `FILE_MAP.md` → `ai-dev/CURRENT_CONTEXT.md`.
2. `ai-dev/WORKFLOW.md`, `ai-dev/roles/ARCHITECT.md`, `ai-dev/DEFINITION_OF_DONE.md`.
3. Карточка задачи `ai-dev/tasks/<ID>.md` (первая — `P2-0001`).
4. По необходимости: `ai-dev/reference/ARCHITECTURE_v1_3_MVP_FINAL.md` (приоритет), `ai-dev/reference/TZ_PLAN_FACT.md` (коды PTO/PR/LP/MN/NFR), профильные `ai-dev/standards/*`. `ARCHITECTURE_v1_2.md` (260 КБ) — только точечно через grep.

## Жёсткие запреты

- Не менять продуктовый код, SQL, конфигурацию; только Markdown-карточка задачи.
- `rbi-q-main/` — только чтение (production RBI/Quality). Не открывать `rbi-q-main/_ai/TEST_CREDENTIALS.md`, runtime-логи и профили.
- Старые `rbi-q-main/.cursor/*` и `_ai/agents/*` — история, не инструкции.
- Не придумывать требования, которых нет в ТЗ/архитектуре — выносить в открытые вопросы.
- Не расширять MVP; не переходить в другую роль; не ставить READY без согласия владельца продукта.

## Результат

Ответ строго в формате из `ai-dev/roles/ARCHITECT.md` (7 пунктов) + карточка по `ai-dev/templates/TASK_CARD.md` со статусом `DRAFT`. В конце — короткое обновление `ai-dev/CURRENT_CONTEXT.md` (только факты) и остановка.