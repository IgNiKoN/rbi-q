# P2-0078 — план выкладки «Скорость сервера»

**Кто:** Архитектор (после своей проверки), по «да» владельца. **Порядок очереди:** P2-0053 доработка 2 (058) → P2-0077 → **P2-0078**.
**Что на боевой:** миграция `059_rls_fast_up.sql` (SQL Editor, одним запросом) → затем сайт (`git pull --ff-only` в `/var/www/rbi-quality`).
Миграция только меняет правила **чтения** и добавляет функции; данные не меняются. Приложение до 059 с 059 работает (новая
функция `pf_my_permissions_all` ему не нужна); приложение после 059 без 059 тоже работает (права План/Факта — прежним вызовом).

## 0. До выкладки (Архитектор, только чтение боевого)

1. Влить в ветку свежий `main` (после 058 и P2-0077): конфликты ожидаются только в `sw.js` (пересобрать `npm run build:version`),
   `ai-dev/reference/schema-inventory.json` и `ai-dev/reports/P2-0069/inventory.html` (пересобрать `node scripts/schema-inventory.mjs`),
   номера ТД (у этой ветки — 420–426).
2. После влития 058 — перегнать «до = после» на схеме с 058 (2 запуска, ~2 мин каждый, `P2_PGLITE` — см. отчёт):
   ```
   node tests/server/run-pglite.mjs --upto 058 --then 059_rls_fast.seed.pglite.sql --then 059_rls_fast_up.sql 059_rls_fast_compare.check.sql
   node tests/server/run-pglite.mjs --upto 058 --then 059_rls_fast.seed.pglite.sql --then 059_rls_fast_up.sql --then 059_rls_fast_down.sql 059_rls_fast_compare.check.sql
   node tests/server/run-pglite.mjs 059_pf_permissions.sql
   ```
   Ожидается `FAIL всего: 0` во всех трёх. 058 меняет `pf_summary_portfolio` / `pf_my_inbox` — правила Качества не трогает.
3. Замер «до» на боевом (только чтение), в отчёт:
   ```sql
   select left(query, 80) q, calls, round(total_exec_time) total_ms, round(mean_exec_time) mean_ms
     from pg_stat_statements
    where query ilike '%quality.file_registry%' or query ilike '%quality.sk_records%' or query ilike '%storage.search%'
       or query ilike '%rbi_inspection_items%' or query ilike '%location_nodes%' or query ilike '%pf_my_permissions%'
    order by total_exec_time desc limit 15;
   -- записи без автора (их автор считается по почте на каждой строке — ТД 422)
   select 'rbi_inspections', count(*) filter (where core_created_by is null) from quality.rbi_inspections
   union all select 'rbi_tasks', count(*) filter (where core_created_by is null) from quality.rbi_tasks;
   ```
4. Проверить, что Storage боевого понимает «есть ли файл» (HEAD одного файла): в браузере владельца, вкладка Network, отправить
   любое фото проверки — должен быть запрос `HEAD …/storage/v1/object/quality-…/…` с ответом 200 или 400, без `object/list`.
   Если HEAD не поддерживается (ответ не 200/400/404) — клиент сам вернётся к списку (как раньше), выигрыш этапа 3 на сервере
   тогда только от правила `storage.objects` (ТД 425).

## 1. Выкладка

1. `select pg_stat_statements_reset();` — чистый замер «после».
2. SQL Editor: весь `supabase/migrations/059_rls_fast_up.sql` одним запросом → «Success».
3. Сразу после — проверка прав на боевом: `test:server` (как в P2-0076) — FAIL 0 (сравнить с прошлым: был 1 FAIL — тайм-аут
   `sk_records` у чужого ПТО, ТД 411 — теперь должен пройти).
4. Сайт: `git pull --ff-only` в `/var/www/rbi-quality` на коммит ветки после влития в `main`. Новая версия включится при
   следующем запуске или кнопкой «Перезапустить сейчас» в «Настройки → Помощь и о программе».

## 2. Через сутки — замер «после»

Тот же запрос п. 0.3. Цели карточки: `quality.file_registry` ≤ 0,3 с, `sk_records` ≤ 1 с; `storage.search` — вызовов 0 или 1 на
проход; `pf_my_permissions` — почти нет (вместо него `pf_my_permissions_all`). График Beget при входе нового устройства — без
пиков 300 %. Снимок РБИ «до = после» (`tests/server/005_rbi_snapshot.sql`).

## 3. Откат

- Утечка прав или ошибка чтения у кого-либо → `supabase/migrations/059_rls_fast_down.sql` (SQL Editor, одним запросом): правила
  чтения побуквенно как до 059 (проверено: `059_rls_fast_compare.check.sql` после отката — «правил не как до 059 — 0»).
- Сайт — прежний коммит `main` (`git reset --hard <коммит до P2-0078>`). Приложение P2-0078 со старой схемой тоже работает
  (права План/Факта — прежним вызовом, если `pf_my_permissions_all` нет).

## 4. Проверка владельцем (10 минут)

1. Новый телефон (или «Настройки → Данные на устройстве → Очистить скачанное»): вход → Качество открывается, синхронизация идёт
   заметно быстрее; на графике Beget нет пика 300 %.
2. «План/Факт» у обычного сотрудника с несколькими объектами — открывается за 1–2 с.
3. Отправить осмотр с фото — фото дошло (в «Истории» есть, на другом устройстве открывается).
4. Подрядчик и инженер на части объекта видят то же, что вчера (по одной записи на выбор).
