# P2-0067a — план выкладки (этап 3)

**Статус:** не начат. Сервер и `main` — только после «принято» и отдельного разрешения владельца в чате.

## 1. Что выкладывается

| Часть | Что | Как |
|---|---|---|
| Приложение | `icons/splash-logo.jpg` (новый, 22 КБ), заставка в `index.html`, значок уведомлений → `icons/icon-192.png` (`sw.js`, `app-mode-utils.js`), опись версии (`sw.js`) без `icon-512-2.png` | ветка `task/P2-0067a-gzip-logo` → `main` → `git pull --ff-only` в `/var/www/rbi-quality` |
| Служебное | `docs/assets/splash-logo-original-1254.png` (старый логотип), `tests/perf/first-open.mjs`, `tests/offline/*` (режим `--gzip`), `ai-dev/reports/P2-0067a/` | nginx не отдаёт (`docs`, `tests`, `ai-dev` уже в правиле → 404) |
| Сервер | сжатие в блоке `server_name app.rbi-q.ru` файла `/etc/nginx/sites-available/rbi-router` (+ копия `rbi-router.bak-p2-0067a`) | файловый менеджер Beget; `nginx -t`, `systemctl reload nginx` — владелец в терминале панели |

## 2. Шаги

1. Свежий `main` в ветку (если ушёл вперёд — P2-0060); `npm run build:version`, `npm run test:unit`, `npm run check:ts`, стенд `node tests/offline/run.mjs cold375 r-deploy r-partial r-launch r-transition --gzip` и без `--gzip`.
2. Слияние в `main` (fast-forward), push в `IgNiKoN/rbi-q`.
3. Сервер: `cd /var/www/rbi-quality && git rev-parse HEAD` (запомнить) → `git pull --ff-only` → `git rev-parse HEAD` = коммит `main`.
4. `node scripts/check-release.mjs` — все файлы описи совпадают с отпечатком.
5. **Перед правкой nginx — только чтение:** `grep -n gzip /etc/nginx/nginx.conf /etc/nginx/sites-available/rbi-router`. Если `gzip on;` уже есть в `http { }` — в блок `app.rbi-q.ru` не добавлять `gzip on;` повторно в тот же блок (в разных блоках повтор допустим; в одном — `nginx -t` упадёт); `gzip_types` в блоке сервера заменяет общий список — это то, что нужно.
6. Копия: `cp /etc/nginx/sites-available/rbi-router /etc/nginx/sites-available/rbi-router.bak-p2-0067a`.
7. Правка в файловом менеджере Beget (VNC искажает `_ & $ |` — в терминале не набирать): внутрь блока `server { … server_name app.rbi-q.ru; … }`, рядом с `root`, вне `location`:
   ```
   gzip on;
   gzip_vary on;
   gzip_comp_level 5;
   gzip_min_length 1024;
   gzip_types text/css application/javascript text/javascript application/json application/manifest+json image/svg+xml text/plain;
   ```
   Тип `manifest.webmanifest` (`types { application/manifest+json webmanifest; }`) — добавлять, только если в `/etc/nginx/mime.types` нет строки с `webmanifest`; `types { }` внутри блока сервера заменяет весь список типов для этого блока — поэтому **не добавлять** туда, а при необходимости — одну строку в `mime.types` (общий файл; иначе записать в ТД).
8. Владелец: `nginx -t` → только при `syntax is ok` / `test is successful` → `systemctl reload nginx`.
9. Проверка: `curl -sI -H 'Accept-Encoding: gzip' https://app.rbi-q.ru/<файл>` → `content-encoding: gzip` у `js/core/bootstrap.js`, `css/style.css`, `locales/ru.json`, `data/system_templates.js`; у `icons/*.png`, `fonts/*` — без сжатия. Повторно `node scripts/check-release.mjs`. Замер `node tests/perf/first-open.mjs --profile 4g --runs 2` и `--profile slow`. Вход, «Качество», «План/Факт → ВОР» открываются.

## 3. Откат

- nginx: `cp /etc/nginx/sites-available/rbi-router.bak-p2-0067a /etc/nginx/sites-available/rbi-router` → `nginx -t` → `systemctl reload nginx`.
- Код: `cd /var/www/rbi-quality && git reset --hard <запомненный HEAD>`.
- Устройства: старые версии держат `icon-512-2.png` в своём кэше; из сети он им не нужен (стенд `r-transition` со сжатием — PASS).
