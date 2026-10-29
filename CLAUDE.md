# Claude Code — вход в проект Platform 2.0

**Читать по порядку:** [`ai-dev/CORE_RULES.md`](ai-dev/CORE_RULES.md) (все правила кратко) → [`ai-dev/CURRENT_CONTEXT.md`](ai-dev/CURRENT_CONTEXT.md) (где мы сейчас) → строка своей ситуации в [`ai-dev/DOCS_MAP.md`](ai-dev/DOCS_MAP.md) §1 (что читать дальше). Полные правила — [`AGENTS.md`](AGENTS.md), точечно. Где код — [`FILE_MAP.md`](FILE_MAP.md), точечно.

1. Роль одна на сеанс: `ARCHITECT` или `EXECUTOR` (Исполнитель сам тестирует и документирует — ADR-062). Инструкция роли — `ai-dev/roles/<ROLE>.md` (или навык `platform2-architect` / `platform2-executor`).
2. Нет роли или утверждённой задачи — работать **только read-only как Архитектор**: предложить блок, продуктовый код не менять.
3. Репозиторий — `IgNiKoN/rbi-q` (с 26.10.2026; `IgNiKoN/platform-2-core` — архив, не коммитить и не пушить). `main` = боевое `app.rbi-q.ru` (`git pull` на сервере): в `main` — только принятые задачи; merge, push, выкладка — по разрешению владельца (`docs/SERVERS.md`).
4. Production старого RBI/Quality (`rbi-q-main/`) — только чтение.
5. Каждый блок сверяется с каталогом модулей [`ai-dev/reference/MODULES.md`](ai-dev/reference/MODULES.md) и дорожной картой [`ai-dev/ROADMAP.md`](ai-dev/ROADMAP.md). При расхождении документов главнее более позднее решение владельца (`ai-dev/DOCS_MAP.md` §2).
6. Результат — в формате своей роли. Не переключаться на другую роль и не объявлять задачу принятой: `DONE` ставит только владелец.
