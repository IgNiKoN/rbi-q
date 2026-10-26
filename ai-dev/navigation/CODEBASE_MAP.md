# Карта исходников RBI Platform — для переноса в Platform 2.0

**Источник:** переданный архив `rbi-q-main (14)(1).zip`, сверено по **физически существующим именам файлов** на 20.10.2026. Не выдавать этот снимок за актуальную branch/commit или состояние сервера.  
**Правило:** здесь указано *где искать реализацию*, а не подтверждённое описание каждого публичного API. При изменении — открыть код, проверить методы и вызывающие стороны.

**Актуальная ревизия:** пути, подтверждённые в `platform-2-core` `379cc5f`, — в `FILE_MAP.md` (раздел «Подтверждённая ревизия базы»). Эта карта снимка ZIP остаётся `HISTORICAL` для путей, которых там нет.

## 1. Запуск, shell, реестр модулей

| Файл | Где искать |
|---|---|
| `index.html` | корневой HTML, загрузку скриптов и общие контейнеры |
| `js/core/bootstrap.js` | старт приложения и последовательность инициализации |
| `js/core/app.entry.js` | оркестрацию модулей, перечни подключений и доступных возможностей |
| `js/core/rbi-core.js` | контекст `ctx`, регистрацию общих сервисов, события |
| `js/core/module-loader.js` | поиск, загрузку и кэширование модулей |
| `js/modules/modules.manifest.js` | список манифестов |
| `js/core/router.js`, `js/core/views.js` | роутинг, экраны и жизненный цикл UI |
| `js/core/app-shell.js`, `js/core/app-shell.desktop.js` | меню, shell, навигацию, desktop |
| `sw.js`, `manifest.webmanifest` | PWA, versioned cache и offline-эффекты |

**Риск:** старый loader и меню содержат статические списки; исходный `init(ctx)` ещё не гарантирует независимые `mount/unmount` или откат новой React-сборки. Контракт проверять на отдельном эксперименте, не редактировать production.

**P2-0004:** вход и права — `src/platform/auth/auth.service.ts`; серверная модель — `supabase/migrations/`; данные модуля — только `public.pf_*` (`src/modules/planfact/data.service.ts`). Подробно — `FILE_MAP.md`, «Изменения P2-0004».

**P2-0002:** модуль Platform 2.0 подключается manifest'ом с `menu.section:'platform'` + `MODULE_BASE_URLS` + `PLATFORM2_MODULES` (`app.entry.js`); пункт меню рисует `getPlatformMenuItems()` в `app-shell.js`, маршрут регистрирует модуль. Контракт `init/mount/unmount` есть у `planfact` (`src/modules/planfact/index.ts`); у старых модулей — только `init(ctx)`. Подробно — `FILE_MAP.md`, раздел «Изменения P2-0002».

## 2. Пользователи, права, компания, настройки

| Файл | Где искать |
|---|---|
| `js/services/sync/sync-auth.js` | текущий механизм входа в наследуемом проекте |
| `js/services/user-context.service.js` | текущий контекст пользователя/объекта |
| `js/services/session.service.js` | состояние сессии |
| `js/services/permission.service.js` | старую клиентскую матрицу ролей и разрешений; **не серверную безопасность SaaS** |
| `js/services/company.service.js` | компанию, её настройки и доступные модули (проверить жёсткий `rbi`) |
| `js/services/settings.service.js`, `js/services/config.service.js` | конфигурацию и пользовательские настройки |
| `js/modules/settings/features/role-matrix-ui.js` | существующий UI управления матрицей |
| `js/modules/settings/features/enabled-modules-ui.js` | включение модулей в наследуемом UI |
| `sql/012_company_settings_role_matrix.sql` | историческую SQL-схему настроек |
| `sql/014_privilege_rls_hardening.sql` | отдельное ужесточение доступа — не заменяет полного аудита всех RLS |

**Новая модель:** Auth, членство, назначения, компания, лицензия, scope и серверный deny-by-default — см. `ai-dev/standards/AUTH_AND_ACCESS.md`. Не переносить `ROLE_MATRIX` как коммерческую модель безопасности.

## 3. Канонические объекты, работа, подрядчики

| Файл | Где искать |
|---|---|
| `src/services/locations/index.ts`, `locations.service.ts`, `types.ts` | существующий LocationService и дерево |
| `src/services/locations/object-bridge.ts`, `od-migrate.ts` | связь объектов и локаций, переходные ключи |
| `js/services/object-directory.service.js` | плоский каталог объектов |
| `js/services/contractor-directory.service.js` | справочник подрядчиков |
| `js/services/masterData.service.js` | существующий агрегатор master data; проверить фактический объём |
| `sql/002_create_platform_v2_tables.sql` | исторические таблицы Platform v2 |
| `sql/006_extend_location_nodes_hierarchy.sql`, `sql/009_location_nodes_apartment_type.sql` | эволюцию локаций |
| `sql/011_add_project_id_to_legacy_tables.sql` | изменение проектной принадлежности legacy-таблиц |
| `js/modules/settings/features/location-directory-ui.js` | существующий UI каталога локаций |

**Важно:** `types.ts` в исходном снимке содержит жёсткую цепочку `object/building/section/floor/apartment`; новые company/project ID и гибкая структура должны быть сделаны совместимо, без создания второго дерева. Виды работ и позиции ВОР — не элементы физического дерева.

## 4. Данные, локальное хранение, серверные операции

| Файл | Где искать |
|---|---|
| `js/services/storage.service.js`, `js/services/storage/storage-db.core.js` | IndexedDB и сервисную точку входа |
| `js/services/storage/storage-photo-manager.js` | фото/asset cache |
| `js/services/storage/storage-file-queue.actions.js`, `storage-offline-cache.utils.js` | очередь файлов / offline-слой |
| `js/services/sync.service.js`, `js/services/sync/sync-engine.core.js` | сценарии синхронизации |
| `js/services/sync/sync-push-pull.core.js`, `sync-cloud-prepare.utils.js` | pull/push, подготовку записей |
| `js/services/file.service.js` | общий вход для файлов |
| `sql/007_storage_construction_defects_policies.sql` | исторические storage-политики — потенциально небезопасны для tenant SaaS |
| `sql/README.md` | использование старых SQL-файлов; инструкции проверять перед применением |

**Риск:** любые изменения хранилища, Sync, Auth, SW и RLS — расширенные тесты и отдельная dev/test-среда. Не запускать старые миграции против реального сервера автоматически.

## 5. Дизайн, интерфейсы и библиотеки

| Файл | Где искать |
|---|---|
| `css/brand/rbi.css` | брендовые токены существующего продукта |
| `css/style.css`, `css/rbi-ui.css` | темы, стили, общие кнопки/карточки/состояния |
| `css/app-shell.desktop.css` | desktop shell |
| `js/shared/notify.utils.js`, `js/shared/toast.utils.js` | уведомления и вспомогательные UI-функции |
| `js/shared/layout.utils.js`, `js/shared/math.utils.js` | layout/общая математика |
| `js/shared/pdf-open.utils.js`, `js/shared/plan-panzoom.utils.js` | PDF/просмотр планов |
| `libs/xlsx.full.min.js`, `libs/docx.bundle.js`, `libs/pptxgenjs.bundle.js` | существующие возможности экспорта/работы с файлами; НЕ обязательный выбор библиотеки нового продукта |
| `libs/panzoom.min.js`, `libs/chart.umd.min.js` | существующие визуальные библиотеки |

**Правило:** UI сначала через общие токены/примитивы, затем обоснованные React-обёртки. Не переносить торговую марку RBI в технические ID нового продукта.

## 6. Исходные модули и примеры интеграции

| Файл/каталог | Для чего смотреть |
|---|---|
| `js/modules/quality/` | legacy Quality с внутренними features; не импортировать приватное состояние |
| `js/modules/construction/` | legacy Construction, дефекты и приёмка |
| `js/modules/settings/` | существующие настройки, каталог, role UI |
| `js/modules/knowledge/` | существующий Knowledge |
| `src/modules/construction-v2/index.ts`, `manifest.ts` | пример независимого TS/Vite-сборочного пути в **старой оболочке**, не готовый React-контракт |
| `vite.construction-v2.config.ts`, `js/dist/` | настройки и артефакты старой Vite-сборки |
| `src/services/construction-defects/`, `src/services/construction-acceptance/`, `src/services/construction-units/` | существующие TS-сервисы и контракты Construction |

## 7. Сборка, тесты, файлы окружения

- `package.json` / `package-lock.json` — реальные scripts, версии и зависимости; запускать команды только после проверки их содержания.
- `tsconfig.json`, `tsconfig.node.json`, `vite.*.config.ts` — настройки TS и существующего Vite.
- `js/shared/__tests__/`, `js/modules/knowledge/__tests__/`, `js/modules/quality/features/analytics/__tests__/` — существующие тесты снимка.
- `.gitignore` — убедиться, что `README.md` и docs нового репозитория не исключены.
- **В этом ZIP отсутствуют** `_ai/scripts/check-module-boundaries.sh` и новые React-зависимости; исторический `_ai.zip` содержит разные скрипты, но их запуск/перенос допустим только после аудита и адаптации.

## 8. Исторический Plan/Fact — НЕ подтверждение готового модуля

`_ai/CURRENT_STEP.md`, `_ai/specs/2026-10-15-plan-fact-in-rbi-core-design.md`, `_ai/agent-reports/2026-10-15-report-pf1-plan-fact-module.md` и последующие PF-2…PF-6 описывают работы **на 15.10.2026**, в том числе TS-пакет, импорт, календарь, факт и синхронизацию. Но **проверенный кодовый ZIP не содержит `src/modules/plan-fact/` и `js/modules/plan-fact/`**.

**Действие P2-0001:** сравнить датированные отчёты и фактический Git; если работающие TS-доменные функции существуют — классифицировать их `REUSE/ADAPT/REWRITE` и сохранить тесты; не копировать автоматически старую схему клиентской роли/модульной регистрации в Platform 2.0. Решение 20.10.2026 v1.3 имеет приоритет над старым вариантом «Plan/Fact без React внутри RBI».
