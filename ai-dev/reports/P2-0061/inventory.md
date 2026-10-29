# P2-0061 — опись: где сегодня решается «кто автор», «что моё», «можно ли отправить», «что скачать»

Архитектор, 29.10.2026, только чтение кода (`main` `7036f1e`; P2-0060 — ветка `task/P2-0060-offline-any-module` `e6d925b`).
Повод — диагноз стенда f-field (P2-0060): неотправленный осмотр инженера не уходит, если `inspectorName` ≠ ФИО вошедшего.

## 1. Сервер (окончательный судья — не меняется в P2-0061)

| Что | Где | Как решает |
|---|---|---|
| Автор записи | `quality.set_author()` — `supabase/migrations/020_quality_scope_up.sql:117-123` | при вставке `core_created_by := auth.uid()`, при правке — прежний; клиент автора не задаёт |
| Видимость и правка по таблицам | `023_quality_scope_fix_up.sql:106-142` (список «таблица → действия просмотра → действия правки → режим → поле автора»), `033`, `043` (`row_visible_id`, `contractor_limited`) | **уже описанием**: режим `author` / `owner` / `contractor`, поле автора `core_created_by` (для старых — `member_by_email(engineer_name)`), фирма — `core_counterparty_id`; права — по действиям (`quality.edit`, `construction.edit`, `quality.scope.contractor`), не по названию роли |

## 2. Устройство — «кто я»

| Что | Где | Как |
|---|---|---|
| ФИО вошедшего | `quality-bridge.ts:315-319, 354, 377` → `syncConfig.engineerName` | ФИО из профиля; при смене ФИО (P2-0028) **перезаписывается**, прежнее не хранится |
| id учётной записи | `quality-bridge.ts:378` → `syncConfig.authUserId` (P2-0035b) | есть, но в отборе при отправке не используется |
| Роль на устройстве | `quality-bridge.ts:96` `roleFor(actions)` → `ROLE_MATRIX` (`permission.service.js:28-91`) | права с сервера сводятся к **названию роли**, дальше решения — по роли (`isAdmin()`, `=== 'engineer'`, `dataScope`) |
| Закреплённые объекты | `permission.service.js:585` `getAssignedProjects`, `:604` `isRecordInAssignedProjects` → `object-directory.service.js` | id объекта ядра, запасной путь — по тексту ключа |
| Фирма подрядчика | `permission.service.js:625` `getAssignedContractor` (название) + `appSettings.assignedCounterpartyId` (P2-0044, id) | смешанно: id, если есть, иначе по названию |

## 3. Устройство — «моё» и «можно ли отправить» (`js/services/sync/sync-engine.core.js`)

| Хранилище | Строки | Правило сейчас | Причина при отсеве |
|---|---|---|---|
| Осмотры (`app_history`) | `989-992` отбор до проверки; `1063-1105` проверка | не руководство → только `inspectorName === engineerName`; затем роль + объект | **отсеянное на `:991` — молча `not_synced`**; на `:1101` — `blocked` с причиной |
| Задачи (`rbi_tasks`) | `3055-3066` | роль `engineer` → по `engineerName / inspectorName` | молча |
| Совещания и прочие «объекты» (`meeting`, `fmea`, практики, эталоны, TWI, документы…) | `3374-3395` | не руководство → `owner / author / inspectorName / engineerName === ФИО`; совещания — по объекту (`meetingPushAllowed`) | молча |
| Отчёты (`app_reports`) | `3593-3600` | `created_by !== ФИО` → пропуск | молча |
| Замечания СК 2.0 (`construction_defects_v2`) | `3220-3257` | подрядчик — по id контрагента / карточке; прочие — `owner / created_by / author === ФИО` | молча |
| Приёмки СК 2.0 (`construction_acceptance_v2`) | `4130-4162` | то же, копия кода | молча |
| Помещения СК 2.0 (`construction_units_v2`) | `4238-4251` | `owner === ФИО` | молча |
| Записи ПК СК (`sk_records`) | `3715-3800` | без отбора по автору | `blocked` + `syncBlockReason` |
| Файлы объектов (реестр) | `828` | владелец = `owner / author / created_by / … / ФИО` | — |
| Рейтинг и профиль | `3191-3206` | по `auth_user_id` (P2-0035b) ✅ | — |
| Черновики | `1777` | по `core_created_by / owner_auth_user_id` ✅, без id — по ФИО | — |

Повтор отклонённого: запись, отклонённая сервером, остаётся `source: 'cloud'` и не уходит снова (ТД 313). «Своё первым» и порции по 5 — только осмотры (ТД 315); «своё первым» — до загрузки справочника объектов (ТД 320).

## 4. Устройство — «что скачать» и что видно

| Что | Где | Как |
|---|---|---|
| Запрос к серверу | `sync-engine.core.js:1485-1555` (`getDataScope`, `clientScopeMode`), задачи `:1846-1880` | по `dataScope` роли; «свои» — `core_created_by` ✅, задачи — по ФИО (ТД 149) |
| Отбор после скачивания | `sync-push-pull.core.js:470-535` | по `dataScope`: подрядчик — по **названию** фирмы, режим «Только мои» — по **ФИО** (`engineer_name / inspector_name / created_by`) |
| Скачанный осмотр на устройстве | `sync-engine.core.js:1703` | хранится `inspectorName` (ФИО); **`core_created_by` не сохраняется** |
| Фото «заранее» (P2-0060) | `src/platform/services/offline/files-rule.ts`, `copy.ts:206` `isMine` | по роли + закреплённым объектам (по id) ✅, автор не участвует |

## 5. Экраны — «можно изменить / удалить»

| Где | Как |
|---|---|
| `permission.service.js:431` `canEdit(ownerName)` | по ФИО |
| `permission.service.js:441` `canDelete(ownerName, ownerId)` | **по id, если есть, иначе по ФИО** ✅ — образец переходного правила |
| `tasks.module.js:1805, 1898, 1921` | `canDelete(ФИО, assignedToId)` |
| `game.actions.js:1247` (FMEA), `meetings.module.js:1436`, `etalon.actions.js:959`, `interventions.js:1432`, `history.actions.js:301`, `knowledge.module.js:242`, `knowledge.service.js:429`, `sync-merge.policy.js:107` | по ФИО (`author / owner / inspectorName`) — ТД 238 |

## 6. Запись — откуда берётся автор

| Где | Что пишет |
|---|---|
| `audit.actions.js:877` (экран осмотра) | `inspectorName: <поле, заполнено ФИО, только чтение>` — **id автора нет** |
| `inspection.service.js:180-196` `save()` | автора не ставит (`source:'local'`, `syncStatus:'not_synced'`) |
| Прочие формы (задачи, совещания, FMEA, эталоны, СК 2.0) | `author / owner / created_by / engineerName` — ФИО |

## 7. Списки хранилищ (повторяются в нескольких местах)

`STORES` (`storage-db.core.js`), `RECORD_STORES` (`src/platform/auth/offline-rescue.ts:22`, 15+ хранилищ — счётчик «не отправлено»), свой блок кода на каждое хранилище в `sync-engine.core.js` (6 копий отбора «по ФИО»). Новый модуль сегодня = правка всех трёх мест.

## 8. План/Факт (вне P2-0061 — подключится в P2-0064)

Пишет прямо на сервер, автор — сервер. `area.ts:162` `onBehalfPlan` — «я ответственный за факт» сравнивается по **почте**, у `FactOwner` есть `user_id` → в P2-0064 по id.

## Вывод

Сервер уже работает по описанию и по id. Устройство повторяет его своим кодом в 10+ местах, по ФИО и по названию роли; часть отсева молчит. Стандарт P2-0061 — одно правило на устройстве, зеркало серверного, модули подключаются описанием.
