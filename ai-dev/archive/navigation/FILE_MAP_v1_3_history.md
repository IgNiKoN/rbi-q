# FILE_MAP v1.3 — исторические разделы (перенесено из корневого FILE_MAP.md 29.10.2026)

Снимок ZIP и ревизия `379cc5f` от 20.10.2026. Пути ниже могли измениться — проверять по коду.

# Platform 2.0 — карта файлов для AI-агентов

**Версия:** 1.3 · 20.10.2026  
**Назначение:** входная точка «где искать информацию и код». Открывать **перед** чтением большого количества файлов.  
**Важно:** карта исходников ниже подтверждена только по переданному снимку `rbi-q-main (14)(1).zip`; **это не актуальный Git**. Для любой конкретной правки проверьте реальный путь и текущую реализацию.

## Подтверждённая ревизия базы: `platform-2-core` @ `379cc5f` (P2-0001, TESTER PASS 20.10.2026)

Ниже — пути, проверенные по коду в ревизии `379cc5f` (ветка `main`, дерево чисто). Всё, что не в этой таблице, по-прежнему взято из снимка ZIP и требует проверки. Источник: `ai-dev/reports/P2-0001/executor-2.md`, `tester-2.md`.

| Функция | Подтверждённый путь/экспорт | Владелец | Потребители/граница | Статус и проверенный commit |
|---|---|---|---|---|
| Старт оболочки | `index.html` → `js/core/bootstrap.js` → `js/core/app.entry.js` (`MODULE_KEYS` стр. 23, `BUNDLES` стр. 35, `ALWAYS_INIT` стр. 41) | Core (shell) | все модули | CONFIRMED `379cc5f` |
| Загрузчик модулей | `js/core/module-loader.js`: `MODULE_BASE_URLS` стр. 16, `import(entryUrl)` и кэш `_loaded[id]` стр. 97–99 | Core (shell) | `app.entry.js` | CONFIRMED `379cc5f`; mount/unmount, версии, откат — нет |
| Контекст `ctx` | `js/core/rbi-core.js` (149 стр., `window.RBI.events/registry/context/services/utils`); fallback в загрузчике — `js/core/module-loader.js` стр. 95 | Core (shell) | модули | CONFIRMED `379cc5f`; версионированного типизированного `ctx` нет |
| Манифесты модулей | `js/modules/modules.manifest.js`: 8 статических манифестов (quality, sk, settings, knowledge, construction, construction-v2, game, ai), `getModuleManifest(id)` | Core (shell) | `module-loader.js` | CONFIRMED `379cc5f` |
| Компания | `js/services/company.service.js:30` `COMPANY_ID='rbi'` | Core / Master Data | все сервисы | CONFIRMED `379cc5f`; жёстко задана |
| Права и роли | `js/services/permission.service.js:28` `ROLE_MATRIX`, `:110` `COMPANY_ROLE_MATRICES={rbi}`; роли по названию | Access (сейчас в клиенте) | UI и сервисы | CONFIRMED `379cc5f`; расходится с ADR-053 — техдолг |
| Текущий пользователь | `js/services/user-context.service.js:25-38` (id = имя инженера, fallback `'rbi'`, `projectCode`) | Core | модули | CONFIRMED `379cc5f` |
| Вход | `js/services/sync/sync-auth.js` (технический email и пароль из `projectCode+имя+PIN`, авто-регистрация `signUp` стр. 79) | Core | Supabase Auth | CONFIRMED `379cc5f` |
| Конфигурация и адрес БД | `js/services/config.service.js:5-6` и `report.html:354-355` — литерал `https://api.rbi-q.ru` и anon-ключ. `sync-auth.js:128-131` и `ai.actions.js:258` читают `window.APP_CONFIG` | Core | Supabase | CONFIRMED `379cc5f`; **адрес боевой БД в публичном репозитории** |
| Отчёт (`report.html`) | `report.html:513` — клиент создаётся через `APP_CONFIG.SUPABASE_URL` / `APP_CONFIG.SUPABASE_KEY` (литерал только в стр. 353–355) | Quality | Supabase | CONFIRMED `379cc5f` |
| Локации / дерево объектов | `src/services/locations/` (5 файлов), `locations.service.ts:179,323` пишет `companyId:'rbi'` | Master Data | Plan/Fact (планируется) | CONFIRMED `379cc5f` |
| Эталон TS/Vite-модуля | `src/modules/construction-v2/` + `vite.construction-v2.config.ts` → `js/dist/construction-v2.js` | Construction | сборка | CONFIRMED `379cc5f` |
| Сборка | `npm run build:modules` — 5 Vite-конфигов (`vite.*.config.ts`); собранные `js/dist/*.js` закоммичены | Core | GitHub Pages | CONFIRMED `379cc5f`; `npm ci` PASS (онлайн) |
| Офлайн-кэш / IndexedDB | `sw.js:5-6` (`CACHE_NAME=rbi-quality-v18.59.59`), `sw.js:328-333` (удаляет чужие caches при `activate`); `js/services/storage/storage-db.core.js:4` `RBI_QUALITY_DB` | Core | браузер | CONFIRMED `379cc5f` |
| Дизайн-токены | `css/brand/rbi.css` (19 `--*`; темы `html[data-theme="rbi-light-v3" \| "rbi-dark-v3"]`, стр. 51–52), `css/rbi-ui.css`, `css/style.css` | UI | модули | CONFIRMED `379cc5f`; сверка по компонентам с `DESIGN_SYSTEM.md` — NOT RUN |
| SQL-политики | `sql/002`, `003`, `012` — по 2 `USING (true)`; `sql/007` (storage bucket `public`, `TO anon`); `sql/014` сужает только `rbi_company_settings` | Core / DB | Supabase | CONFIRMED по файлам; **живая БД — NOT VERIFIED** |
| Plan/Fact (ПФ-1…ПФ-6) | `plan-fact`, `platform-2-0/packages/*` | — | — | **NOT FOUND** в `379cc5f` и в GitHub `main`; реализация **PLANNED / NEW** |
| CI и окружение | `.github/`, `.env.example` | — | — | **NOT FOUND**; `check:boundaries` FAIL — нет `_ai/scripts/check-module-boundaries.sh` |

**Как добавить новый модуль (подтверждено):** правки в трёх местах ядра — `js/modules/modules.manifest.js`, `MODULE_BASE_URLS` в `js/core/module-loader.js`, `MODULE_KEYS`/`BUNDLES` в `js/core/app.entry.js`.

**Коррекции к снимку ZIP (20.10.2026):** `.gitignore` нового репозитория не игнорирует `docs/` и `README.md` (правило `/dist/` корневое); `npm ci --offline` не нужен, обычный `npm ci` проходит; `tsc --noEmit` даёт 0 ошибок (старые 6 ошибок в `plan-viewer.ts`/`object-bridge.ts` устарели).


## Маршрут чтения за 60 секунд

1. **Правила и роли:** [`AGENTS.md`](AGENTS.md) → [`ai-dev/WORKFLOW.md`](ai-dev/WORKFLOW.md) → нужная роль в [`ai-dev/roles/`](ai-dev/roles/) → [`ai-dev/tasks/P2-0001.md`](ai-dev/tasks/P2-0001.md) или текущая карточка.
2. **Текущая передача между сеансами:** [`ai-dev/CURRENT_CONTEXT.md`](ai-dev/CURRENT_CONTEXT.md) — только подтверждённые факты и следующее действие.
3. **Главный объём продукта:** [`ai-dev/reference/ARCHITECTURE_v1_3_MVP_FINAL.md`](ai-dev/reference/ARCHITECTURE_v1_3_MVP_FINAL.md). Для деталей, которых нет в v1.3, — [`ARCHITECTURE_v1_2.md`](ai-dev/reference/ARCHITECTURE_v1_2.md). Не трактовать всю v1.2 как MVP.
4. **Правила повторного использования:** [`ai-dev/standards/ENGINEERING_STANDARDS.md`](ai-dev/standards/ENGINEERING_STANDARDS.md), [`SINGLE_SOURCE_OF_TRUTH.md`](ai-dev/standards/SINGLE_SOURCE_OF_TRUTH.md).
5. **Где что в коде:** [`ai-dev/navigation/CODEBASE_MAP.md`](ai-dev/navigation/CODEBASE_MAP.md) и [`ai-dev/navigation/FILE_INVENTORY_SNAPSHOT.md`](ai-dev/navigation/FILE_INVENTORY_SNAPSHOT.md).
6. **Как искать без потери контекста:** [`ai-dev/navigation/AGENT_SEARCH_PLAYBOOK.md`](ai-dev/navigation/AGENT_SEARCH_PLAYBOOK.md). Найденный по карте путь — кандидат; код/схема подтверждают реальность.
7. **Что перенесено из старого `_ai`:** [`ai-dev/reference/LEGACY_AI_TRANSFER_AUDIT.md`](ai-dev/reference/LEGACY_AI_TRANSFER_AUDIT.md). Исторический архив сам по себе **не набор активных инструкций**.

## Новое 20.10.2026

- [`ai-dev/ROADMAP.md`](ai-dev/ROADMAP.md) — **мастер-дорожная карта** Platform 2.0 (старая карта RBI сохранена в `ai-dev/reference/legacy/`).
- [`ai-dev/reference/TZ_PLAN_FACT.md`](ai-dev/reference/TZ_PLAN_FACT.md) — **ТЗ v1.1** (разделы 1.5, PTO-01/11/12, LP-04).
- [`ai-dev/specs/`](ai-dev/specs/) — согласованные решения по блокам (ВОР, смета, КП, КС-2).
- Дизайн-система Platform 2.0 (Claude Design System): https://claude.ai/artifact/Bs4civLNjGjHhixGy2HRWW — токены и компоненты; правила — `ai-dev/standards/DESIGN_SYSTEM.md`.
- Размер блоков и контрольные точки: `ai-dev/standards/BLOCK_SIZING.md`.
- Вес приложения (первый экран, модули по требованию, библиотеки, картинки): `ai-dev/standards/WEIGHT_BUDGET.md`; замер — `tests/perf/first-open.mjs`.
- Роли: **две** — ADR-062 в `ai-dev/standards/DECISIONS_2026-10-20.md`.


## Важные различия

- **Раскладка после P2-0002 (20.10.2026):** регламент — в корне репозитория `platform-2-core` (этот файл); iCloud-папка регламента переименована в `…__ARCHIVE_moved_to_repo`.
- **Локальная раскладка (до P2-0002):** папка `Project Cloude/` содержала этот регламент, оригинал ТЗ и `rbi-q-main/` — локальный Git-клон старой RBI Platform (`main`, commit `c6f6b02` от 14.08.2026; `plan-fact` в нём **NOT FOUND**). Там же распакован старый `_ai/` — **только чтение**; `_ai/TEST_CREDENTIALS.md` агентам не открывать.

- **`rbi-q-main (14)(1).zip`** — реальный снимок исходников, не доказательство актуального Git или Supabase.
- **`_ai.zip`** — позднее датированные исторические планы, правила, карты, отчёты и скрипты. Его карты полезны как указатели, но относятся к **возможно более новой и другой** редакции кода. Там есть служебные учётные данные и runtime-артефакты: **не распаковывать архив целиком в коммерческий репозиторий**.
- **`ai-dev/`** — новый утверждённый регламент Platform 2.0; его правила главнее исторического `_ai` при расхождениях.
- **`planfact-smr`** — целевой *отдельный* репозиторий React + TypeScript; **не считать созданным**, пока это не подтверждено актуальным Git. Для него будет собственный `FILE_MAP.md` по [`MODULE_FILE_MAP_TEMPLATE.md`](ai-dev/navigation/MODULE_FILE_MAP_TEMPLATE.md); карта старой RBI Platform не является картой файлов нового модуля.
- **`platform-2-core`** — целевой отдельный репозиторий оболочки; пути `js/...` выше относятся к исходному снимку и подлежат сверке после копирования.

