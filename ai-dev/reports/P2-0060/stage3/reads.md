# P2-0060 этап 3 — опись чтений План/Факта и «Компании» (экран → вызов → копия)

Правило (сервис `src/platform/services/offline/copy.ts`, `copyCall`): функция из списка чтений службы — **через копию для просмотра**
(с сетью — ответ сервера и копия; без сети / обрыв / сервер молчит > 8 с — копия с пометкой «данные на …»; копии нет — «Нужен интернет»;
отказ сервера «нет права» — копия удаляется); остальные функции — **запись: без сети не отправляется** («Нужен интернет», ничего не начато).
Списки чтений — у каждой службы рядом с её вызовами (единый источник истины — служба).

Обозначения: **З** — скачивается заранее («держать без сети», `src/modules/planfact/prefetch.ts`); **О** — в копии, если открывали; **—** — только онлайн.

| Экран | Чтение (функция сервера) | Служба | Копия |
|---|---|---|---|
| Сводка (все проекты) | `pf_summary_portfolio` | summary.service `SUMMARY_READS` | З |
| Сводка (объект: дашборд, виды работ, места, внимание, КС-2) | `pf_summary_weekly`, `pf_summary_places`, `pf_summary_worktypes`, `pf_summary_positions`, `pf_summary_ks2_gap`, `pf_summary_attention` | summary.service | З (8 недель, все места); другие периоды / места ниже — О |
| Входящие | `pf_my_inbox` | summary.service | З |
| ВОР → Загрузки | `pf_vor_list_imports`, `pf_vor_import_rows`, `pf_vor_list_profiles`, `pf_vor_revision_base`, `pf_vor_revision_changes` | vor.service `VOR_READS` | загрузки, строки загрузок, профили — З; редакции — О |
| ВОР → Позиции (реестр) | `pf_summary_positions`, `pf_fact_positions`, `pf_summary_portfolio` | summary / fact | З |
| ВОР / Факт / КС-2: права проекта | `pf_my_permissions` | vor.service | З (служебное — без пометки) |
| ВОР: словарь, виды работ | `pf_vor_dictionary`, `pf_vor_list_work_types` | vor.service | О |
| Факт → Ввод | `pf_fact_positions` (по месту), `pf_list_locations`, `pf_brigade_list`, `pf_fact_history` | fact.service `FACT_READS`, projects.service | З (позиции места и вложенные места этажа — из скачанного, без запроса); история позиции — О |
| Факт → Ждёт подтверждения | `pf_fact_pending` | fact.service | З |
| Факт → Шахматка | `pf_list_locations` (всё дерево), `pf_fact_positions` (все) | projects / fact | З |
| Факт → Журнал | `pf_fact_journal` | fact.service | З (30 дней — как экран); другой период — О |
| Моя область | `pf_my_area`, `pf_place_fact_owners` | area.ts `AREA_READS` | область — З; владельцы места — О |
| Смета, цены, КП, накладные | `pf_price_list`, `pf_price_history`, `pf_estimate_list`, `pf_estimate_rows`, `pf_estimate_overheads`, `pf_kp_list`, `pf_kp_get`, `pf_overhead_template` | estimate.service `ESTIMATE_READS` | список смет — З по праву estimate; строки сметы, цены, КП — О (сервер отдаёт только по праву; отказ — копия удаляется) |
| КС-2 | `pf_ks2_acts`, `pf_ks2_act`, `pf_ks2_revisions`, `pf_ks2_revision`, `pf_ks2_settings`, `pf_ks2_template` | ks2.service `KS2_READS` | акты и настройки — З по праву КС-2; акт целиком, редакции, шаблон — О |
| Список моих проектов | `pf_my_projects` | projects.service `fetchMyProjects` | З (с сетью — копии чужих проектов удаляются во всех модулях) |
| «Компания» (ядро): проекты, места, единицы, подразделения, справочники | `pf_project_catalog`, `pf_company_projects`, `pf_list_locations`, `pf_project_places`, `pf_list_units`, `pf_company_divisions`, `pf_project_dicts`, `pf_location_path`, `pf_my_company_access` | projects.service `PROJECTS_READS` | З тем, кто управляет компанией (`src/platform/company/prefetch.ts`); дерево мест — З через шахматку; экран мест проекта — О |
| «Компания»: контрагенты | `pf_counterparties_list`, `pf_project_counterparties`, `pf_my_company_access` | core.service `CORE_READS` | З (контрагенты компании) |
| «Компания»: люди, роли, журнал, права | `pf_my_admin_companies`, `pf_permission_catalog`, `pf_list_company_roles`, `pf_list_company_members`, `pf_list_company_audit`, `pf_list_quality_objects` | company.service `COMPANY_READS` | З администратору компании; журнал — О |
| Роль в шапке раздела | `pf_my_context` (auth.getAccess) | PlanfactApp — `offlineRead` | О |
| Красные точки меню, вкладка порогов | `pf_my_inbox`, `pf_summary_portfolio` через `RBI.platform2.rpc` | обёртка `js/modules/planfact/index.js` | — (без сети прежние числа) |
| Старая таблица «Работы» (не в меню) | `pf_list_works`, `pf_list_audit` | data.service | — |

**Различных чтений — 57 > 40.** Сначала сработало стоп-условие карточки (заранее только Сводка, ВОР, Факт, шахматка); **решение владельца 29.10 «Почти всё, без нагрузки»** —
стоп-условие снято: заранее все экраны моих проектов, а чтения «по месту» (позиции места, вложенные места этажа) телефон собирает из уже скачанного (`copyCall` + `fromOther`) —
отдельных запросов по местам нет. Только открытое: история позиции (`pf_fact_history`), строки сметы, акт КС-2 целиком, владельцы факта места.
Замер заранее на стенде (1 проект, 3 этажа, 3 позиции): План/Факт — 18 чтений, 4,4 КБ на проект (всего 22 чтения); ядро платформы — 12 чтений на компанию (`prefetch.json`).
Порог 20 МБ на проект не достигнут.
