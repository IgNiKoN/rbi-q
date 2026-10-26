# Протокол независимой проверки — P2-0001

**Роль:** TESTER · **Дата:** 20.10.2026
**Проверенная ревизия/ветка:** `~/dev/platform-2-core`, `task/P2-0001-audit` = `main` `379cc5f`, `git status` чист (до и после проверок)
**Окружение:** локально, Node 24, без обращений к сети/БД/`api.rbi-q.ru`
**Карточка:** `ai-dev/tasks/P2-0001.md` · **Отчёт Исполнителя:** `ai-dev/reports/P2-0001/executor-1.md`

## Проверка объёма
- [x] Код не менялся: ветка = main, diff пуст. Production не затрагивался.
- [x] Артефакты `js/dist` после build откатил `git checkout`; дерево чисто.
- [ ] Карточка §6 выполнена не полностью (см. дефекты).

## Автоматические проверки (выполнены Тестером независимо)
| Команда | Фактическое | Результат |
|---|---|---|
| `npm ci` | OK, только предупреждения allow-scripts (esbuild/fsevents) | PASS |
| `npm run check:ts` | 0 ошибок | PASS |
| `npm run test:unit` | tests 34, pass 34, fail 0 | PASS |
| `npm run build:modules` | собрано; изменились 4 файла `js/dist` (construction-v2, rbi-locations + map) → откачено | PASS (подтверждена недетерминированность dist) |
| `npm run check:boundaries` | `_ai/scripts/check-module-boundaries.sh` не найден | FAIL (ожидаемо по карточке §7) |
| поиск `plan-fact`/`planfact` | совпадений нет | PASS (NOT FOUND подтверждён) |

## Сверка находок по коду
1. `config.service.js:5-6` — URL `api.rbi-q.ru` и ключ зашиты: **подтверждено**. Уточнение: `sync-auth.js` и `ai.actions.js` не содержат литерала, а читают `window.APP_CONFIG.SUPABASE_URL`; литералы с `api.rbi-q.ru` — `config.service.js`, `report.html`, `sw.js:353`, `sql/README.md`.
2. `RBI_QUALITY_DB` (`storage-db.core.js:4`), `SW_VERSION='18.59.59'`, `CACHE_NAME=rbi-quality-v…` (`sw.js:5-6`): **подтверждено**.
3. `USING (true)` по 2 вхождения в sql/002, 003, 012; sql/007 про `anon`: **подтверждено**. Живая БД — NOT RUN.
4. `css/brand/rbi.css`: `html[data-theme="rbi-light-v3|rbi-dark-v3"]` (стр. 51-52), 19 объявлений `--*`: **подтверждено**. Счёт hex вне brand не перепроверялся (NOT RUN).
5. Нет `.github/`, `_ai/`: **подтверждено**.
Негативная проверка: Тестер не выполнял сетевых запросов к `api.rbi-q.ru`; запросов из команд выше нет (статические/локальные).

## Дефекты
- **D1, средний — критерий §6.4 не выполнен.** В отчёте нет пометки CONFIRMED / CHANGED / NOT VERIFIED по каждому риску прежнего аудита (`DEV_READINESS_AUDIT`), в частности «6 TS-ошибок → CHANGED (0)». Исполнитель дал только свои находки; п.3 §3 «список отличий от DEV_READINESS_AUDIT с путями» отсутствует.
- **D2, средний — критерий §6.2 выполнен частично.** Карта «shell → loader → manifests → ctx → сервисы → сборка → SQL/Storage/RLS» дана одной строкой; нет `core/app.entry.js` (MODULE_KEYS/BUNDLES), `core/module-loader.js` (MODULE_BASE_URLS), `modules.manifest.js`, `core/rbi-core.js` (отсутствие версионированного `ctx`), `permission.service.js`/`company.service.js`, мест правки для нового модуля. Эти данные есть в карточке §2, но отчёт Исполнителя их не подтверждает. Отчёт не оформлен по `IMPLEMENTATION_REPORT.md` (§3 п.2).
- **D3, низкий — scope §3 п.3.** Сверка с `DESIGN_SYSTEM.md` только grep-уровня (признано как NOT RUN); критерии приёмки её явно не требуют, но §3 п.3 требует.
- **D4, низкий — неточность:** находка 1 приписывает `sync-auth.js`/`ai.actions.js` «упоминания URL/ключа»; фактически это обращения к `APP_CONFIG`.

## Невыполненные проверки (NOT RUN)
Живая БД/RLS, GitHub Pages smoke, граф зависимостей, `_ai.zip`, полная сверка с DESIGN_SYSTEM, счёт hex.

## Итог первого прохода
**Вердикт:** `FAIL`
**Основание:** технические команды и ключевые факты подтверждены, production не затронут, код не менялся; но критерии приёмки §6.2 и §6.4 не выполнены (D1, D2), нужна доработка Markdown-отчёта.
**Передать:** `EXECUTOR` (доработка отчёта, код не менять).
