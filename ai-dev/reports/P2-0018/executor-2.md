# Отчёт исполнителя — P2-0018, доработка 1 (по ревью `architect-review-1.md`)

**Дата:** 23.10.2026. **Ветка:** `task/P2-0018-quality-hardening`, не запушена. **Старт:** «Исполнитель. Доработка P2-0018».

| № замечания | Что сделано | Проверка → результат | Коммит |
|---|---|---|---|
| 1 (HIGH) | `023`: `construction_defects_v2`, `construction_acceptance_v2` — вид «подрядчик» (`"contractorId"` → `quality.contractors`, `contractor_ref`); `rbi_draft_sessions`, `rbi_sync_queue` — вид «owner»: только своё (автор `core_created_by` — сервер; старые — `owner_auth_user_id` / почта) или `*.manage` | PGlite `023_quality_scope_fix.sql`: 7 персон × 6 таблиц — FAIL 0; подмена `assignment_sees` на версию 020 → 10 FAIL | `a74dc06` |
| 2 | `on_directory_insert`: у подрядчика (своя фирма, без manage / `core.counterparties.manage`) — без связей и черновиков | тест: строка справочника есть, связи нет; инженер — как раньше | `a74dc06` |
| 4 | `inspection_child_writable`: пункты/фото — только к существующей проверке той же компании; без неё — `*.manage` | тест: к будущей / чужой — отказ, к своей — да, админ — да. Старый клиент шлёт проверки раньше пунктов (`sync-engine.core.js:2454–2474`) | `a74dc06` |
| 6 | Автор старых проверок/задач — `coalesce(core_created_by, member_by_email(engineer_name))` | тест: старая проверка без автора видна инженеру 1 (почта с другим регистром) | `a74dc06` |
| 7 | Сторожа: `020_down` (есть 021), `021_down` (есть 022), `022_down` (не применена / есть 023) | PGlite: неверный порядок — 3 понятные ошибки, отпечаток без изменений; верный порядок 023→020 — отпечаток = до 020; `023_down` — побайтно | `a74dc06` |
| 8 | `sw.js`: при `P2_STORAGE_TOKEN = null` — чистка по сохранённому слоту (и после перезапуска SW); `entry.ts` — слот при `controllerchange`. SW 18.60.0 | unit `sw-storage` 6/6 (новый тест «после перезапуска» на старом коде — FAIL) | `d79679e` |
| 3 | файлы по фирме/автору — ТД №126 (решение владельца) | — | — |
| 5 | вся компания при назначении на один объект — по замыслу (решение владельца) | — | — |

**Безопасность новых функций:** `member_by_email` и `contractor_ref` нужны правилам RLS (выданы `authenticated`), но работают только в текущей компании запроса (`request_company`) — тест: из Беты по Альфе — пусто.

**Сервер (разрешение владельца):** 023 «Success»; её SQL-тест FAIL 0; `test:server` 325 PASS (ожидание «туда-обратно» для черновиков/очереди исправлено — ПТО чужие не видит); снимок RBI до = после. Подробно — `stage4-server.md`.

**Регрессия:** PGlite 002–023 как до (011=2, 011a=1 — ТД №74; `015_rbi_guard` — ошибка среды раннера); `npm test` ×3 — 362/362; `check:ts` 0; сборка platform.

**Файлы:** `supabase/migrations/023_quality_scope_fix_up/down.sql`, `020_down`, `021_down`, `022_down` (сторожа); `tests/server/023_quality_scope_fix.sql`, `rest.test.mjs`; `sw.js`, `src/platform/auth/entry.ts`, `src/platform/auth/__tests__/sw-storage.test.ts`, `js/dist/platform/*`, `changelog.js` (версия); документы — SERVERS (023, порядок откатов), APP_GUIDE (черновики, Стройконтроль 2.0), CHANGELOG.

Фраза владельцу: `Архитектор. принято P2-0018` или `Вернуть P2-0018: …`.
