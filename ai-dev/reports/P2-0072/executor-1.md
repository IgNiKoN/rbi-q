# Отчёт исполнителя — P2-0072 «Номера Качества по стандарту»

**Роль:** EXECUTOR · **Ветка:** `task/P2-0072-quality-ids` от `main` `2bde728`, рабочая копия `~/dev/platform-2-core-0072`, **не запушена, не влита** · **Карточка:** `ai-dev/tasks/P2-0072.md` · **Окружение:** PGlite 0.5.12 (`P2_PGLITE=~/dev/platform-2-core-p2-0053`), стенд Chromium (`tests/offline`, подставной сервер). Боевой сервер не использовался, 054 на боевую не применялась.

## Этапы

| № | Этап | Проверка → результат | Коммит |
|---|---|---|---|
| 1 | Сервис номеров `js/services/record-id.service.js` (`window.RbiIds`: `newId` uuid v4 + запасной путь без `randomUUID`, `stableId` uuid v5, `childId`); новая проверка — `uuid` (`audit.actions.js`); пункты / фото — v5 от проверки, у старой проверки — прежние «номер_пункт(_фото)»; черновик — v5 от инженера, загрузка черновика — самый свежий | unit `record-id.service.test.js` 6/6 (эталон RFC 4122, v5 = Node SHA-1, 500 номеров запасным путём, без `crypto`); unit всего 1001/1001; `tsc` 0; стенд `q-ids` PASS 7 / FAIL 0 (без сети проверка с 3 фото + проверка старой версии в очереди → сеть → обрыв ответа и повтор: проверок 2, пунктов 5, фото 4 — дублей 0; черновик — одна строка uuid); `sync.mjs` 11 сценариев — PASS 42 / FAIL 0; `f-field`, `f-manager` — PASS 12 / FAIL 0; зеркало — 11 975 проверок, FAIL 0 | `c6de006` |
| 2 | Миграция 054 + `054_down` (41 таблица, 16 связей, сторож `quality.core_ids_stamp` / `core_ids_children`); тесты PGlite, проба `scripts/p2-0072/01_dryrun.sql`, запускатель `tests/server/run-pglite.mjs` | засев «до 054» (41 таблица, 2 компании, одинаковые текстовый и uuid-номера, 16 связей: совпадающие, висячие, пустые, в чужую компанию) → 054 → `054_quality_ids_backfill.check.sql` FAIL 0; отрицательный контроль (снята связь, подменён `core_id`) → FAIL 2; `054_quality_ids.sql` (сторож: вставка без `core_id`, повтор upsert, смена → отказ 22023, uuid-несовпадение → отказ, копия с чужим `core_id` → свой, изоляция компаний, ребёнок раньше родителя, смена ссылки, удаление родителя, сбой дозаписи у охраняемого ребёнка) FAIL 0; без триггеров детей → FAIL 2; откат: отпечаток схемы до = после `up → down`, `up → down → up` + проверка — FAIL 0; все 80 прежних серверных тестов = `main` (18 давних красных те же), 052 / 053 / 047 / 043 — без изменений; замер: 30 тыс. проверок / 300 тыс. пунктов / 90 тыс. фото → 054 за 17,6 с (PGlite), пакет 500 пунктов после 054 — 75 мс, откат — мгновенно | `8ff9b80` |
| 3 | Все прочие генераторы → сервис номеров (задачи, совещания, мероприятия, практики, FMEA, этапы, эталоны, ТИВИ, узлы, документы, отчёты и шаблоны, справочники и очередь подрядчиков, внешний СК, обратная связь, Стройконтроль 1 и 2.0, места); описания `sync` — `coreId`; телефон хранит `core_id` (проверки, задачи явно; остальные — как пришло с сервера); мост `quality-bridge.ts` не отправляет `core_id` и связи (`withoutServerIds`); сторож кода | сторож кода (unit): «приставка + время» вне `dist/` и тестов — 0, кроме 13 служебных меток устройства с причиной; unit всего 1004/1004; `tsc` 0; стенд `q-ids-other` PASS 7 / FAIL 0 (задача с сервера хранит `core_id`; поручение с экрана, замечание, помещение, приёмка СК 2.0 — `uuid`; правка старой задачи и новые записи ушли без `core_id`; `core_id` на телефоне после отправки на месте); `s-kinds`, `s-new-kind`, `s-module-off`, `q-ids`, `s-pull-scope`, `s-own-first`, `s-contractor`, `s-reject-retry`, `s-rename`, `s-foreign`, `s-leader` — PASS 50 / FAIL 0; PGlite: правка без `core_id` и с пустым — прежний `core_id` (054) | `a795f78` |
| 4 | Сторож таблиц: мост ключа (`core_id uuid not null` рядом) и связей (`LINK_BRIDGE`) — жёлтый с причиной; правило 10 «валюта у родителя»; заготовка `supabase/templates/new_module_table.sql`; документы | `npm run test:schema` → новых 0, рост 0, снизить 0, заготовка — зелёная по всем правилам; потолок 151 → 106 (`--update-debt`); светофор: красных 143 → 100, у Качества 106 → 63 (41 ключ + 2 связи К6 + по 1 у пунктов и фото); unit правило 10 (родитель с валютой — зелёный, без — красный) и мост — 7/7; отрицательный контроль заготовки (без RLS и `deleted_at`) → «не по стандарту»; unit всего 1006/1006; **показ владельцу** — «Продолжай» | `ac9f51f` |
| 5 | Полный прогон и проба | стенд 69 сценариев в 6 потоков — PASS 399 / FAIL 0; зеркало FAIL 0; unit 1006/1006; tsc 0; `test:schema` 0; серверные тесты = `main` + 054 FAIL 0; проба готова | сдача |

## Что сделано

- **Телефон.** Номер записи — один сервис платформы (`window.RbiIds`, подключён в `index.html` перед синхронизацией; модули `src/` берут общий экземпляр со страницы, своей копии в сборках нет). Пункт и фото проверки получают номер от номера проверки: та же проверка → тот же номер, поэтому повтор и обрыв не дают дублей; проверка старой версии (номер — число-время) досылается прежними составными номерами. Номер замечания Стройконтроля 1 — `def_` + uuid (приставка нужна фото замечания, ТД 378).
- **Сервер (054).** `core_id` у 41 таблицы, 16 связей по uuid с внешним ключом (on delete set null). Решения Исполнителя: `core_id` уникален во всей таблице (стандарт п. 1 — ключ `uuid`); тот же uuid-номер в другой компании и копия записи с чужим `core_id` получают новый номер; телефон `core_id` не отправляет (правка или копия не затрут номер, пакеты строк — с одинаковыми полями); сторож — последним из BEFORE (сторожа прав 052/053 не видят служебных колонок); дозапись связи детям при записи родителя не мешает записи родителя при отказе сторожа ребёнка.
- **Сторож таблиц.** Мост ключа и связей — жёлтый с причиной, правило 10, заготовка таблицы.

## Изменённые файлы

- Новое: `js/services/record-id.service.{js,d.ts}`, `supabase/migrations/054_quality_ids_{up,down}.sql`, `supabase/templates/new_module_table.sql`, `scripts/p2-0072/01_dryrun.sql`, `tests/server/054_quality_ids{.sql,.seed.pglite.sql,_backfill.check.sql}`, `tests/server/run-pglite.mjs`, `js/shared/__tests__/record-id.service.test.js`.
- Телефон: `index.html`, `js/services/sync/sync-engine.core.js`, `sync-post-actions.js`, `js/services/{storage,template,contractor-directory}.service.js`, `storage/storage-cache-manager.js`; генераторы — `js/modules/quality/features/{audit,tasks,meetings,interventions.js,schedule,etalon,gamification,ai,reports,sk}`, `js/modules/knowledge/{knowledge.module.js,features/reference.js,features/faq.js}`, `js/modules/construction/features/{acceptance,admin,defect-form,pdf-viewer,transfer}.js`, `js/modules/settings/features/feedback.js`; описания `sync` — `quality/manifest.js`, `knowledge/knowledge.manifest.js`, `construction-v2/construction-v2.manifest.js`; `src/platform/auth/quality-bridge.ts`, `src/services/{construction-defects,construction-units,construction-acceptance,locations}/*.service.ts`; бандлы `js/dist/{platform,rbi-locations,rbi-construction-*}`, `sw.js`.
- Тесты: `tests/offline/{sync,servers}.mjs` (`q-ids`, `q-ids-other`, `stand.serve`), `quality-bridge.test.ts`, `sync-access.policy.test.js`, `migrations-lint.test.ts`; `tests/server/{018_quality,018_quality_structure,021_quality_keys,024_quality_contractor_dirs}.sql` — знают про мост (служебный триггер и колонку ставит сервер, ключ `core_id` без компании — по стандарту).
- Сторож: `tests/server/schema-lint.mjs`, `scripts/schema-inventory.mjs`, `ai-dev/reference/schema-{inventory.json,debt.json}`, `reports/P2-0069/inventory.html`.
- Документы: `standards/{DATA_TABLES,SYNC_AND_ACCESS}.md`, `reference/{GLOSSARY,MODULES}.md`, `reports/P2-0069/migration-plan.md`, `docs/{SERVERS,TECH_DEBT}.md`, `CHANGELOG.md`, `FILE_MAP.md`, `reports/P2-0072/{release-plan.md,inventory-before.html,inventory-after.html}`.
- Вне списка карточки §4 (по её же п. 3.4 «ТИВИ, справочники…» и 41 таблице): генераторы в `js/modules/knowledge`, `js/modules/construction`, `js/modules/settings/features/feedback.js`, `src/services/locations`; описания `sync` базы знаний и СК 2.0 — по одной строке.

## Запуск и проверка

Этап 5 (финал, ветка `ac9f51f` + документы):
- **Полный стенд** `tests/offline/run.mjs`, все **69 сценариев в 6 потоков** (по кругу; погоды и выкладка — в разных потоках), порты 8931–8942: **PASS 399, FAIL 0**.
  - поток 1 (порты 8931/8932)): PASS 67, FAIL 0 — cold375 cache w-slow double-start r-middeploy r-allow m-hang v-summary1440 d-device s-reject-retry s-foreign pf-drop
  - поток 2 (порты 8933/8934)): PASS 66, FAIL 0 — cold1440 otheruser w-hang double-start-nolocks r-partial r-launch m-hang375 v-other d-quality-only s-reject-retry-1440-dark s-leader pf-batch
  - поток 3 (порты 8935/8936)): PASS 94, FAIL 0 — rescue screen375 w-flap reasons375 r-tabs r-return m-revoke v-prefetch375 d-screens s-own-first q-ids pf-batch1440-dark
  - поток 4 (порты 8937/8938)): PASS 77, FAIL 0 — expired screen768 w-drop reasons1440-dark r-chunk r-queue m-first v-prefetch1440 s-module-off s-contractor q-ids-other
  - поток 5 (порты 8939/8940)): PASS 53, FAIL 0 — stale14 screen1440 w-5xx w-tabs r-requests r-transition m-other f-field s-new-kind s-kinds pf-offline
  - поток 6 (порты 8941/8942)): PASS 42, FAIL 0 — invalid w-offline edit-mid r-deploy r-delta r-size v-summary375 f-manager s-pull-scope s-rename pf-offline1440
- Зеркало `node tests/server/sync-access.mirror.mjs` → 15 таблиц + План/Факт, 11 975 проверок, FAIL 0.
- `npm run test:unit` → 1006/1006; `npx tsc --noEmit` → 0; `npm run test:schema` → новых 0, рост 0, снизить 0, заготовка таблицы — зелёная.
- Серверные тесты PGlite (`node tests/server/run-pglite.mjs`, 81 файл, каждый на свежей базе): 80 прежних = `main` (18 давних красных те же: 007–011a «Верхний уровень — только объект», 013a, 015_rbi_audit_security, 015_rbi_guard, 018_quality (FAIL 6, ТД 366), 018_quality_structure, 032_company_staff, 039, 040a, 041, 042, 044, 045 — требуют своего засева / порядка), новый `054_quality_ids.sql` — FAIL 0.
- Вес (gzip -9, `main` → ветка): первый экран +3,1 КБ (`record-id.service.js` +2,5, `platform.js` +0,24, `sync-engine.core.js` +0,22, манифест Качества +0,1), лимит 50 КБ; модули по открытию — меньше (сборки Стройконтроля и мест −0,06 КБ каждая, генераторы — −0,01…0,15 КБ); итого по всем файлам +2,1 КБ.

NOT RUN: проба `scripts/p2-0072/01_dryrun.sql` на боевой — шаг 1 выкладки (проверена на PGlite со схемой 053 и засевом: числа = проверке заполнения); `npm run test:server` (ходит на боевой, 054 там нет); живые телефоны.

## Пользовательский сценарий

«Откройте светофор таблиц (`reports/P2-0072/inventory-after.html`) — у 41 таблицы Качества “Ключ” жёлтый с подсказкой “мост … снимет уборка P2-0063”, красных 100 вместо 143. На телефоне проведите проверку с фото без сети, включите сеть, нажмите “Синхронизировать” ещё раз — проверка одна, фото на месте; старые проверки и задачи открываются и правятся как раньше.»

## Изменения API/БД/безопасности

- **API/контракт:** строки Качества получают поля `core_id` и `core_<связь>_id` (ставит сервер); телефон их не отправляет. Ключ синхронизации — прежний `id`.
- **SQL и миграции:** `054_quality_ids_up.sql` / `_down.sql` — только PGlite; на боевую — шаг выкладки по разрешению.
- **Восстановление:** сайт — прежний HEAD; `054_quality_ids_down.sql` (отпечаток = до).
- **Права:** RLS, функции 052/053 не менялись; серверные тесты прав 052/053/047/043 и зеркало — без изменения ожиданий.

## Известные ограничения и технический долг

ТД 377 (мост до P2-0063), 378 (`def_` у Стройконтроля 1), 379 (`item_id` текстом), 380 (`sk_*` — блок 4г), 381 (служебные метки устройства), 382 (внешний ключ места у СК 2.0 и физическое удаление места).

## Передача

- **Новые ошибки / отличие от baseline:** нет; серверные тесты = `main`.
- **Что проверить при приёмке:** diff `054_quality_ids_up.sql` (CRITICAL — синхронизация), правило «копия с чужим `core_id` → свой номер», решение «телефон `core_id` не отправляет».
- **Итог:** `READY_FOR_ACCEPTANCE`, не `DONE`.
