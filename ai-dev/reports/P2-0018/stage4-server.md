# P2-0018 этап 4 — общий сервер (23.10.2026, разрешение владельца «Да, весь этап 4»)

SQL Editor в Chrome владельца; файл → буфер в UTF-8, md5 буфера = md5 файла.

| Шаг | Результат |
|---|---|
| №99/118 (только чтение) | `authenticator.rolconfig`: `pgrst.db_schemas=public, storage, graphql_public, quality` (+ safeupdate, statement_timeout=8s, lock_timeout=8s). REST: `Accept-Profile: nonexistent_schema` → 406 «Only the following schemas are exposed: public, storage, graphql_public, quality». Схемы с USAGE у anon/authenticated: auth, core, extensions, graphql, graphql_public, net, planfact, public, quality, realtime, storage, supabase_functions — других пользовательских разделов для API нет, значит 018b ничего не «выключила» (стандарт сервера public, storage, graphql_public). Без RLS и с SELECT у anon: `net._http_response`, `net.http_request_queue`, `realtime.schema_migrations`, `realtime.subscription`, `supabase_functions.hooks`, `supabase_functions.migrations` — схемы не в `db_schemas`, через REST недоступны. **019 не нужна.** |
| Снимок RBI до | 74 \| 43 \| f926b2db… \| a920ba97… \| d09a3113… \| pf-функций 105 |
| `020_quality_scope_up.sql` | md5 `2307c9182d3df9ff313a685310df91e0`; предупреждение «destructive» (drop policy/function своих объектов Качества) → Run this query → «Success. No rows returned» |
| `tests/server/020_quality_scope.sql` | md5 `4154e577…`; «ОТЧЁТ (откат): FAIL всего: 0» |
| `021_quality_keys_up.sql` | md5 `5004b10fbfa9fc6016242544463b3aa9`; «destructive» (drop constraint/index своих таблиц) → «Success. No rows returned» |
| `tests/server/021_quality_keys.sql` | md5 `4958a061…`; «ОТЧЁТ (откат), таблиц 55: FAIL всего: 0» |
| `npm run test:server` | 1-й прогон: 324 PASS, 1 FAIL — ошибка теста (у alfa-foreman есть постоянное назначение на другой объект, `projects` = 2 объекта; проверка исправлена на «содержит объект автопроверок»). 2-й прогон: **325 PASS, ИТОГ: PASS** (в т.ч. 24 проверки матрицы P2-0018) |
| Снимок RBI после | 74 \| 43 \| f926b2db… \| a920ba97… \| d09a3113… — **= до** |

## Этап 6 — 022 на сервере (23.10.2026, разрешение владельца «Да, применить»)

| Шаг | Результат |
|---|---|
| Снимок RBI до | 74 \| 43 \| f926b2db… \| a920ba97… \| d09a3113… |
| `022_quality_contractors_fix_up.sql` | md5 `322a8d42a33cd7b3de74c6a458be29f5`; «Success. No rows returned» (без предупреждения) |
| `tests/server/022_quality_contractors_fix.sql` | md5 `f7680e7b…`; предупреждение «destructive» — `delete` тестовой строки внутри теста (весь тест откатывается) → «ОТЧЁТ (откат): FAIL всего: 0» |
| `npm run test:server` | **325 PASS, ИТОГ: PASS** |
| Снимок RBI после | 74 \| 43 \| f926b2db… \| a920ba97… \| d09a3113… — **= до** |

## Доработка 1 — 023 на сервере (23.10.2026, разрешение владельца «Да, применить»)

| Шаг | Результат |
|---|---|
| Снимок RBI до | 74 \| 43 \| f926b2db… \| a920ba97… \| d09a3113… |
| `023_quality_scope_fix_up.sql` | md5 `80d242edcb3135beea7c74f322bb7472`; предупреждение «update без where» (заполнение `core_created_by` черновиков из `owner_auth_user_id`) → «Success. No rows returned» |
| `tests/server/023_quality_scope_fix.sql` | md5 `1736df1a…`; «ОТЧЁТ (откат): FAIL всего: 0» |
| `npm run test:server` | 1-й прогон: 324 PASS, 3 FAIL — «туда-обратно» ждал, что ПТО видит черновик и очередь админа (по новому правилу — только свои); ожидание исправлено. 2-й прогон: **325 PASS** |
| Снимок RBI после | 74 \| 43 \| f926b2db… \| a920ba97… \| d09a3113… — **= до** |

## Доработка 2 — 024, 025 на сервере (23.10.2026, разрешения владельца «Да, применить» ×2)

| Шаг | Результат |
|---|---|
| Снимок RBI до | 74 \| 43 \| f926b2db… \| a920ba97… \| d09a3113… |
| `024_quality_contractor_dirs_up.sql` | md5 `2da2503e…`; «Success» |
| `tests/server/024_quality_contractor_dirs.sql` | md5 `0c7c2d01…`; FAIL 0 |
| `npm run test:server` после 024 | 315 PASS, 11 FAIL — тестовый админ «Альфы» упёрся в лимит 022 (20 черновиков за сутки от прогонов тестов) → ошибка 022: лимит касался и администратора → `025` |
| `025_quality_drafts_limit_up.sql` | md5 `2c1617e1…`; «Success» |
| `tests/server/022_quality_contractors_fix.sql` (с проверкой 025) | md5 `b5da10c1…`; «destructive» — `delete` внутри теста (откат) → FAIL 0 |
| `npm run test:server` | **325 PASS** |
| Снимок RBI после | 74 \| 43 \| f926b2db… \| a920ba97… \| d09a3113… — **= до** |

## Доработка 3 — 026 на сервере (23.10.2026, разрешение владельца «Да, применить»)

| Шаг | Результат |
|---|---|
| Снимок RBI до | 74 \| 43 \| f926b2db… \| a920ba97… \| d09a3113… |
| `026_quality_contractor_scope_fix_up.sql` | md5 `62aaa5a6…`; «destructive» (замена своих правил / функции) → «Success» |
| `tests/server/026_quality_contractor_scope_fix.sql` | md5 `cf915522…`; FAIL 0 |
| `npm run test:server` | **325 PASS** |
| Снимок RBI после | = до |
