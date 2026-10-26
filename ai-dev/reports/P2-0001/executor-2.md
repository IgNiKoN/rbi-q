# Отчёт исполнителя — P2-0001 (доработка после tester-1 FAIL)

**Роль:** EXECUTOR · **Статус задачи при передаче:** TESTING
**Репозиторий, ветка, commit:** `~/dev/platform-2-core`, `task/P2-0001-audit` = `main` `379cc5f`; `git status` чист, код не менялся.
**Карточка:** `ai-dev/tasks/P2-0001.md` · **Дефекты Тестера:** `ai-dev/reports/P2-0001/tester-1.md` (D1–D4). Исправлен только отчёт. Команды из executor-1 (npm ci / build:modules / check:ts / test:unit 34/34 / check:boundaries FAIL) Тестер независимо подтвердил, повторно не гонялись.
**Окружение:** локально, чтение файлов; сети и БД не трогал.

## Что сделано
- D1: таблица сверки с `DEV_READINESS_AUDIT_2026-10-20.md` (CONFIRMED/CHANGED/NOT VERIFIED).
- D2: карта по `IMPLEMENTATION_REPORT` с путями и номерами строк.
- D3: сверка с `DESIGN_SYSTEM.md` остаётся grep-уровня, явно помечена NOT RUN (в критерии приёмки §6 полная сверка не входит).
- D4: исправлена формулировка находки 1.

## Сверка с DEV_READINESS_AUDIT (D1)
| Утверждение аудита | Статус | Доказательство |
|---|---|---|
| Фиксированный `MODULE_BASE_URLS`, `import()`, `init`, кэш по id; нет mount/unmount, версий | CONFIRMED | `js/core/module-loader.js:16,88,97-99`, `_loaded[id]` |
| `MODULE_KEYS`, `BUNDLES`, `ALWAYS_INIT` фиксированы | CONFIRMED | `js/core/app.entry.js:23,35,41` |
| Статический `modules.manifest.js` | CONFIRMED | 8 импортов манифестов, `ModulesManifest` (стр. 13-22) |
| `COMPANY_ID='rbi'` | CONFIRMED | `js/services/company.service.js:30` |
| `user-context` отдаёт имя как id и `projectCode` | CONFIRMED | `user-context.service.js:25-38` (`id = getCurrentEngineerName()`, fallback `'rbi'`) |
| `locations` пишет `companyId:'rbi'` | CONFIRMED | `src/services/locations/locations.service.ts:179,323` |
| URL действующего Supabase в `config.service.js` и `report.html` | CONFIRMED | `config.service.js:5-6`, `report.html:354-355,513`; также `sw.js:353` (проверка api-хоста), `sql/README.md` |
| Anon `USING (true)` / bucket public (sql/002, 007), 014 сужает одну таблицу | CONFIRMED по файлам; живая БД NOT VERIFIED | sql/002,003,012 по 2 `USING (true)`; sql/007:27-37 |
| `sync-auth` с авто-регистрацией по projectCode+имя+PIN | CONFIRMED | `sync-auth.js:34-36,79` (`signUp`) |
| IndexedDB `RBI_QUALITY_DB` | CONFIRMED | `js/services/storage/storage-db.core.js:4` |
| `sw.js`: удаляет чужие caches при activate | CONFIRMED | `sw.js:328-333`; имя `rbi-quality-v18.59.59` (стр. 5-6) |
| `.gitignore` игнорирует `docs/`, `README.md` | **CHANGED** | в `.gitignore` нового репо этих правил нет, `README.md` в репо; правило `/dist/` корневое |
| Нет `.env.example`, CI, `AGENTS.md`/`CLAUDE.md`, React | CONFIRMED (в `platform-2-core`; регламент лежит отдельно) | `ls .env.example` — нет; `.github/` — нет |
| `tsc --noEmit`: 6 ошибок (`plan-viewer.ts` 4, `object-bridge.ts` 2) | **CHANGED → 0 ошибок** | `npm run check:ts` PASS; оба файла в нашем снимке уже чистые (`plan-viewer.ts` появился в `b63a9d0`; в `object-bridge.ts` обращения к `locs` нет) |
| `check:boundaries` падает | CONFIRMED | `package.json:15`, нет `_ai/scripts` |
| `npm ci --offline` невозможен | **CHANGED** | обычный `npm ci` и `build:modules` PASS (онлайн) |
| 34/34 unit | CONFIRMED | Тестер повторил |
| Commit/соответствие production | **NOT VERIFIED** | в репо нет связи с боевым деплоем; GitHub `rbi-platform` `main`=`c6f6b02` (по карточке §2) |
| Живые RLS/Storage, полный smoke, Pages-вход | NOT VERIFIED / NOT RUN | запрещено без отдельного разрешения (ADR-061, карточка §5) |

## Карта (D2): App Shell → Loader → ctx → модули → сервисы → сборка → SQL
- **Вход:** `index.html` → `js/core/bootstrap.js` (396 стр.) → `core/app.entry.js`: `MODULE_KEYS` (стр. 23), `BUNDLES` (35), `ALWAYS_INIT=['settings']` (41); init только разрешённых ключей, порядок по `MODULE_KEYS`.
- **Загрузчик:** `core/module-loader.js`: `MODULE_BASE_URLS` (16), `loadModule` (88-110): URL = baseUrl+`manifest.entry` → `import()` → `mod.init(ctx)`; ctx = переданный или `window.RBI.ctx` или `{}` (стр. 94). Нет версий, mount/unmount, отката, изоляции ошибок кроме сброса кэша.
- **Манифесты:** `js/modules/modules.manifest.js`: 8 статических манифестов (quality, sk, settings, knowledge, construction, construction-v2, game, ai), `getModuleManifest(id)`.
- **Контекст:** `core/rbi-core.js` (149 стр.): `window.RBI.events/registry/context/services/utils`. Версионированного типизированного `ctx` нет.
- **Сервисы:** `company.service.js` (482; `COMPANY_ID='rbi'`), `permission.service.js` (897; `ROLE_MATRIX` стр. 28, `COMPANY_ROLE_MATRICES={rbi}` стр. 110, роли по названию), `user-context.service.js` (53), `config.service.js` (35), `sync/sync-auth.js` (215), `src/services/locations/*` (index, locations.service, object-bridge, od-migrate, types).
- **Новый модуль = правки в 3 местах ядра:** manifest (`modules.manifest.js`), `MODULE_BASE_URLS` (`module-loader.js`), `MODULE_KEYS`/`BUNDLES` (`app.entry.js`).
- **Эталон TS/Vite-модуля:** `src/modules/construction-v2/` + `vite.construction-v2.config.ts` → `js/dist/construction-v2.js`; ещё 4 сборки (locations, construction-defects/-acceptance/-units); `npm run build:modules` запускает 5.
- **SQL/Storage/RLS:** `sql/002,003,012` (широкие политики), `007` (storage, anon), `014` (сужение `rbi_company_settings`). Живое состояние — NOT VERIFIED.
- **PWA/хранилища:** `sw.js` (`SW_VERSION`, `CACHE_NAME`), IndexedDB `RBI_QUALITY_DB`.
- Граф зависимостей полностью — NOT RUN.

## Находки (уточнено, D4)
1. Production: литерал URL (`https://api.rbi-q.ru`) и anon-ключ — в `js/services/config.service.js:5-6` и `report.html:354-355`; `sw.js:353` проверяет хост. `sync-auth.js:128-131` и `ai.actions.js:258` читают `window.APP_CONFIG.SUPABASE_URL/KEY` (не литералы). Репозиторий public.
2–5 без изменений относительно executor-1 (имена IndexedDB/SW, широкие RLS, дизайн-токены, plan-fact NOT FOUND).

## Дизайн-система (D3)
Токены: `css/brand/rbi.css` (19 `--*`, темы `html[data-theme="rbi-light-v3|rbi-dark-v3"]`, стр. 51-52). Захардкоженные hex вне brand — количества по executor-1 (grep, повторно не считались). Сверка по компонентам с `standards/DESIGN_SYSTEM.md` — **NOT RUN**: в P2-0001 не требуется критериями §6; перенести в P2-0002 или отдельную задачу.

## Изменённые файлы
Только Markdown регламента: `ai-dev/reports/P2-0001/executor-2.md`, `ai-dev/handoff/LATEST_EXECUTOR_REPORT.md`, `ai-dev/CURRENT_CONTEXT.md`. Код `platform-2-core` и `rbi-q-main` — нет.

## Минимальный список для P2-0002
Без изменений относительно executor-1 §«Минимальный список» (6 пунктов: dev-конфиг вместо зашитого URL, новые имена IndexedDB/SW, замена `check:boundaries`, CI + политика `dist`, шаблон RLS без `USING (true)`, решение о публичности репо).

## Изменения API/БД/безопасности
Нет. Восстановление не требуется.

## Известные ограничения
Статический аудит; живая БД, Pages, `_ai.zip`, граф зависимостей, сверка по компонентам с DESIGN_SYSTEM — NOT RUN.

## Передача
- **Что проверить Тестеру:** закрытие D1–D4 по таблице и карте выше (пути/строки выборочно), `git status` чист.
- **Итог:** `ПЕРЕДАНО В TESTING`, не `PASS` и не `DONE`.
