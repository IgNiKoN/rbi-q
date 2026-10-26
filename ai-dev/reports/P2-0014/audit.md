# P2-0014 этап 1 — аудит доступа к Качеству (22.10.2026, только чтение)

Запросы: `tests/server/015_rbi_audit.sql` (выгрузка CSV владельцем, 200 строк), `tests/server/015_rbi_audit_functions.sql` (выполнен Исполнителем по разрешению владельца). Ничего не менялось. Почты/имена не выводились.

## Учётки Auth (только счётчики)

| Тип | Кол-во | В профилях Качества |
|---|---|---|
| PIN-технические `@rbi-quality.local` | 35 (у всех `project_code` в метаданных) | 23 |
| Тестовые P2 `@test.invalid` | 4 | 0 |
| Демо P2 `@demo.invalid` | 9 | 0 |
| Прочие почты | 1 | 0 |

Не-PIN учёток, работающих в старом Quality (есть профиль `rbi_engineer_profiles`), **нет** → стоп-условие «законная почтовая учётка» не сработало.

## Как Качество узнаёт «своего»

Все признаки (`rbi_current_role`, `rbi_current_project_code`, `rbi_is_approved`, `rbi_can_*`) — по строке `rbi_engineer_profiles` с `auth_user_id = auth.uid()`. Почта не проверяется нигде. PIN-учётка создаётся самим приложением через `signUp` — любой, кто знает публичный ключ, может завести «PIN-почту» `…@rbi-quality.local`. **Признак по почте ненадёжен**; надёжный — одобренный профиль (`cloud_status = 'approved'`, `rbi_is_approved()`).

## Таблицы (74 в `public`, RLS включён у всех; у `anon` и `authenticated` полные GRANT)

| Группа | Кто может | Почтовая учётка | Аноним (без входа) |
|---|---|---|---|
| Старые таблицы Качества: `rbi_inspections`, `rbi_inspection_items/photos`, `rbi_tasks`, `sk_records`, `sk_*_map`, `sk_volumes`, `construction_*` (старые), `shared_feedback`, `plan_fact_*` (старые RBI) | только свой проект профиля / роль manager | **закрыто** (нет профиля → проект `''`, роль `guest`) | закрыто |
| **Стройконтроль v2 и справочники** (14): `construction_acceptance_v2` (~19 строк), `construction_buildings_v2`, `construction_defects_v2` (~24), `construction_floors_v2` (~106), `construction_objects_v2`, `construction_units_v2`, `contractor_aliases_v2`, `contractors`, `contracts`, `issue_items`, `issues`, `location_node_aliases`, `location_nodes`, `sk_records_v2` | SELECT — `public` (true), ALL — `authenticated` (true) | **ДЫРА: читает, пишет, удаляет всё** | **ДЫРА: читает всё** |
| Библиотека `shared_checklists/docs/etalons/nodes/practices/twi_cards` | SELECT `authenticated` true; запись — по правам | **читает** (запись закрыта) | закрыто |
| `rbi_company_settings`, `allowed_projects` | SELECT всем, запись — manager | читает настройки/список проектов | читает |
| `rbi_sync_queue` | INSERT всем (true) | может писать в очередь | может писать |
| `rbi_engineer_profiles` | INSERT: `auth_user_id = uid()`; SELECT/UPDATE «ничьих» (`auth_user_id is null`) — всем | **может создать себе профиль** (поля роли/статуса при вставке — триггером не проверено, см. ниже) и читать/«забрать» ничьи профили | читает/правит ничьи профили |
| Прочие (KB, отчёты, справочники подрядчиков, черновики, ошибки) | по функциям прав профиля | закрыто | закрыто |

Триггер `rbi_guard_profile_update` защищает только UPDATE. Защищает ли что-то INSERT профиля с `role='manager'`, `cloud_status='approved'` — в выводе не видно (строки триггеров не попали в экран); **если не защищает — любой вошедший (почта или самозаведённая «PIN-почта») становится руководителем любого проекта.** Проверка — на копии на этапе 2.

## Файлы (Storage)

Все 12 бакетов **public = true** (файл открывается по прямой ссылке без входа): `inspection-photos` 4 177 файлов, `library-twi` 378, `reports` 347, `library-etalons` 336, `custom-assets` 146, `construction-defects` 36, `library-practices` 30, `construction-plans` 25, `library-docs` 24, `library-nodes` 2, `library-checklists` 0, `twi-pdfs` 0.
Политики `storage.objects`: «Allow all for anon on …» (ALL для `anon` на 9 бакетах), `construction-defects_*` (anon+authenticated, все действия), «Public … Plans», «temp reports … emergency» (public: чтение, запись, удаление), `storage_*_transition`. → **любой, у кого есть публичный ключ из кода приложения, без входа может читать, заменять и удалять фото осмотров и отчёты.** Ограничение только почтовых учёток эту дыру не закрывает.

## Вывод

Дыра подтверждена и **шире карточки**: (1) Стройконтроль v2 — почтовая учётка пишет/удаляет, аноним читает; (2) Storage — аноним может всё; (3) профиль Качества можно завести себе самому; (4) «PIN-почта» не признак — её может завести кто угодно. Нужен выбор владельца/Архитектора по объёму (вопрос в чате).

## Дополнение: расширенный аудит сервера (`tests/server/015_rbi_audit_security.sql`, 22.10.2026, только чтение)

- **Триггеры профиля:** только `BEFORE UPDATE` (`rbi_guard_profile_update`, `set_updated_at`). **На INSERT защиты нет**; столбцы `role` (по умолчанию `guest`), `cloud_status` (по умолчанию `pending`), `project_code`, `assigned_projects` клиент может задать сам. Политика INSERT пропускает любую строку с `auth_user_id = auth.uid()`.
- **Auth:** 49 учёток, неподтверждённых почт 0 (регистрация без подтверждения включена), за 30 дней — 14 новых (PIN — 0, то есть демо/тестовые P2).
- **Профили:** 23, все `approved` (менеджер 3, зам 1, директор 3, инженер 16), «ничьих» (`auth_user_id is null`) — 0.
- **Реальные строки в открытых таблицах:** `location_nodes` 392, `construction_floors_v2` 133, `construction_units_v2` 64, `construction_defects_v2` 33, `construction_acceptance_v2` 20, `contractors` 14, `contracts` 2, `allowed_projects` 2, `rbi_company_settings` 1, `rbi_sync_queue` 1 703 (INSERT открыт всем); остальные v2 — 0.
- **SECURITY DEFINER, вызываемые анонимом:** 39 функций-признаков `rbi_*`/`auth_*` (без аргументов-данных, отвечают «про себя» — утечки нет) и `get_public_report_by_token(text)` — публичная ссылка на отчёт по токену (задумано; стойкость токена — проверить в коде).
- **Без RLS и с SELECT для anon** (вне `public`): `net._http_response`, `net.http_request_queue`, `supabase_functions.hooks/migrations`, `realtime.subscription/schema_migrations`, представления `extensions.pg_stat_statements*`. Опасны, только если эти схемы открыты в PostgREST/GraphQL (настройку `PGRST_DB_SCHEMAS` из SQL не видно — проверить на сервере).
- **Realtime:** таблиц в публикации нет.
- `planfact`: anon без доступа к схеме — корректно.

### Критично (вывод сервера, не проверено попыткой)
Цепочка без всяких прав: публичный ключ (есть в коде приложения) → `signUp` любой почтой (подтверждение выключено) → `insert into rbi_engineer_profiles (auth_user_id = свой id, role = 'manager', cloud_status = 'approved', project_code = <любой>)` → `rbi_current_role() = 'manager'` → политики `rbi_super_admin_access` / `rbi_admin_storage_access` открывают все данные и файлы проекта. Подтвердить на копии схемы (этап 2), на боевом сервере не пробовать.

## Как утечки возникают в коде Quality (разбор `rbi-q-main`, только чтение) и какой проверки сервера нет

| # | Утечка | Как возникает в коде | Чего нет на сервере |
|---|---|---|---|
| 1 | Чужие данные Стройконтроля v2 видны всем | синхронизация тянет `select('*')` без фильтра: `sync-engine.core.js:1723–2043` (contractors, contracts, location_nodes, floors/defects/acceptance/units_v2); отбор только в интерфейсе | RLS по профилю/проекту; SELECT открыт и анониму |
| 2 | Запись/удаление v2 кем угодно из вошедших | upsert `sync-engine.core.js:3368–3806`, допуск — только `permissions.isAdmin()` на клиенте | `ALL authenticated = true` без условия роли |
| 3 | Подмена/удаление фото и отчётов | `rbiUploadAsset` (`sync-engine.core.js:~520–660`), `remove()` `:2397`, чистка `cloud-deleted-purge-ui.js:434` (проверка админа — только экран) | у `anon` INSERT/UPDATE/DELETE во всех бакетах |
| 4 | Фото и PDF открыты по ссылке | в базе и в HTML отчётов хранятся публичные ссылки `/storage/v1/object/public/`; QR-ссылки `report.html?token=` | бакеты public (закрыть = переделать на подписанные ссылки) |
| 5 | Самоназначение руководителем | вход PIN: `sync-connection.actions.js:396–422` вставляет профиль (guest/pending), но `:82–97` берёт role/cloud_status из локальных настроек; через REST можно вставить что угодно | нет триггера на INSERT профиля (role → guest, cloud_status → pending) |
| 6 | Перехват профиля | UPDATE `auth_user_id` по `inspector_id` `sync-connection.actions.js:438–442`; PIN проверяется на клиенте `:389`; `pin_hash` — SHA-256 4 цифр без соли | «ничьи» профили видны и правятся всеми (сейчас таких 0) |
| 7 | Мусор в журналах | `error-log.utils.js:10`, `sync-post-actions.js:155` пишут без проверки сессии | INSERT для anon в `rbi_sync_queue`, `rbi_error_logs` |

Секретов `service_role` в коде нет; публичный anon-ключ — в `js/services/config.service.js` и `report.html` (так и задумано Supabase, но тогда вся защита — только RLS).
Не используются клиентом (закрыть без последствий): `construction_buildings_v2`, `construction_objects_v2`, `contractor_aliases_v2`, `issues`, `issue_items`, `sk_records_v2`, `location_node_aliases`.

## Варианты исправления и на что влияют

| Шаг | Что делаем (только добавляем политики/триггер, ADR-067) | Влияние |
|---|---|---|
| А1 | Триггер BEFORE INSERT на `rbi_engineer_profiles`: не-админ получает `role='guest'`, `cloud_status='pending'`, `assigned_projects='{}'` | новые PIN-люди как и задумано ждут одобрения; 23 существующих профиля не меняются |
| А2 | Стройконтроль v2 + справочники: чтение и запись — только одобренный профиль Качества (`rbi_is_approved()`), запись — роль с правом; 7 неиспользуемых таблиц — закрыть для anon/authenticated | Quality на телефонах с одобренным профилем работает; покупатель План/Факта и аноним — 0 строк. Риск: синхронизация с истёкшей сессией получит 0 строк — проверить, не стирает ли она локальные данные |
| А3 | `rbi_sync_queue`, `rbi_error_logs`: INSERT только с сессией | теряются логи устройств с истёкшей сессией — некритично |
| Б | Storage: запись/удаление — только одобренный профиль (удаление — руководитель); чтение по ссылке — оставить | нужна правка синхронизации (не грузить без сессии) в копии Quality в Platform 2.0, иначе часть загрузок будет отклоняться до повторного входа |
| В | Закрытые бакеты + подписанные ссылки, отчёты по QR через сервер | большая переделка Quality и `report.html`; отдельный блок |
| Г | Проверить на сервере, какие схемы открыты в PostgREST (`net`, `supabase_functions` без RLS) | только чтение конфигурации сервера владельцем |
