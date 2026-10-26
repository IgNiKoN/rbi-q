# Отчёт исполнителя — P2-0001 (аудит baseline)

**Роль:** EXECUTOR · **Статус задачи при передаче:** TESTING  
**Репозиторий, ветка, commit:** `~/dev/platform-2-core`, ветка `task/P2-0001-audit` от `main` `379cc5f`; изменений кода нет (после `build:modules` артефакты `js/dist` откачены `git checkout`, `git status` чист).  
**Карточка:** `ai-dev/tasks/P2-0001.md` (запуск роли владельцем 20.10.2026).  
**Окружение:** локальная копия, production не затрагивался (запросов к сети/БД не делалось).

## Запуск и проверка

| Команда | Результат |
|---|---|
| `npm ci` | PASS (предупреждение allow-scripts для esbuild/fsevents — не ошибка) |
| `npm run build:modules` | PASS (5 сборок vite; артефакты `js/dist` изменились → откачены) |
| `npm run check:ts` | PASS (0 ошибок) |
| `npm run test:unit` | PASS 34/34 |
| `npm run check:boundaries` | FAIL — нет `_ai/scripts/check-module-boundaries.sh` |
| поиск `plan-fact`/`planfact` в репозитории | NOT FOUND |

Замечание: сборка недетерминирована относительно закоммиченного `js/dist` (после билда diff в 4 файлах) — dist надо либо не хранить в git, либо фиксировать версию сборки (в P2-0002).

## Находки (пути без значений ключей)

1. **Production в коде:** `js/services/config.service.js:5-6` — зашиты `SUPABASE_URL` (`https://api.rbi-q.ru`) и anon-ключ. Репозиторий **public**. Anon-ключ публичен по дизайну, но безопасность целиком держится на RLS, а dev/test-среда сейчас смотрит на production. Также упоминания в `js/services/sync/sync-auth.js`, `js/modules/quality/features/ai/ai.actions.js`, `report.html`.
2. **Имена хранилищ:** IndexedDB `RBI_QUALITY_DB` (`js/services/storage/storage-db.core.js:4`); Service Worker `sw.js`, `SW_VERSION = '18.59.59'`, кэш `rbi-quality-v${SW_VERSION}`. Для Platform 2.0 нужны отдельные имена, иначе конфликт с приложением на том же origin.
3. **SQL с широкими политиками (`sql/`):** `002`, `003`, `012` создают `SELECT USING (true)` + `GRANT SELECT TO anon` и `FOR ALL TO authenticated USING (true) WITH CHECK (true)`; `007` — storage-политики `TO anon, authenticated`. `014` сужает запись только для `rbi_company_settings`; для таблиц из 002/003 широкая запись любому authenticated остаётся (проверить на живой БД — NOT RUN, доступа нет). Для новых таблиц Platform 2.0 (ADR-061) эти шаблоны копировать нельзя.
4. **Дизайн-система:** токены в `css/brand/rbi.css` (19 CSS-переменных), темы `html[data-theme="rbi-light-v3|rbi-dark-v3"]` (rbi.css:51-52), применение в `css/style.css` и `js/modules/settings/settings.render.js`. Захардкоженных hex вне brand: style.css 237, knowledge 62, analytics 59, engineer 28, app-shell 4, audit 1, rbi-ui 1 — кандидаты на миграцию к токенам. Полная сверка с `standards/DESIGN_SYSTEM.md` по компонентам — NOT RUN (только grep-уровень).
5. **Plan/Fact:** в `platform-2-core` отсутствует; ПФ-1…ПФ-6 из `_ai.zip` не проверялись (zip не передан).
6. **CI:** `.github/` нет; `_ai/` нет (скрипты `check-module-boundaries.sh`, `smoke-*` из `package.json` недоступны).

## Карта (кратко)
`index.html` → App Shell / loader (`js/`, `js/services/*`: config, storage, sync, permission) → модули `js/modules/*` (+ TS-сборки `src/modules/*` через vite → `js/dist/*`: locations, construction-defects/acceptance/units/v2). Детальный граф зависимостей — NOT RUN (не строился).

## Минимальный список для P2-0002
1. Вынести `SUPABASE_URL/KEY` в `config.local.js`/`.env` + `.env.example`; в коде — только плейсхолдер; запретить production-хосты в dev/test (проверка в CI).
2. Новые имена IndexedDB/SW/cache для Platform 2.0.
3. Заменить `check:boundaries` (написать скрипт в самом репо или убрать из `package.json`).
4. Минимальный CI: `npm ci`, `check:ts`, `test:unit`, `build:modules`, проверка «нет изменений в dist» либо исключение dist из git.
5. Шаблон RLS для новых таблиц (ADR-061): без `USING (true)` на запись, без anon write; `sql/` с negative-тестами прав.
6. Решить публичность репозитория (риск принят владельцем, п.2 §8).

## Известные ограничения
Аудит статический; живая БД, Pages, `_ai.zip` не проверялись. Изменений кода/БД нет, откат не требуется.

## Передача
- **Что проверить Тестеру:** воспроизвести таблицу команд; убедиться, что `git status` чист и ветка = `main`; перепроверить ссылки на пути из находок 1–4.
- **Итог:** `ПЕРЕДАНО В TESTING`, не `PASS`/`DONE`.
