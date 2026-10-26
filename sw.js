/* Файл: sw.js */
// ОБЯЗАТЕЛЬНО МЕНЯЕМ ВЕРСИЮ при любых изменениях в коде!
// ОБЯЗАТЕЛЬНО МЕНЯЕМ ВЕРСИЮ при любых изменениях в коде!
const APP_VERSION = '18.59.0';
const SW_VERSION = '18.86.0';
// P2-0013: «разработка / выпуск» — из единственного переключателя js/services/config.service.js (выпуск: rbi-quality-* вместо старой версии).
importScripts('./js/services/config.service.js');
const CACHE_PREFIX = (self.APP_CONFIG && self.APP_CONFIG.SW_CACHE_PREFIX) || 'platform2-';
const CACHE_NAME = `${CACHE_PREFIX}v${SW_VERSION}`;

/**
 * Business path prefix → shortId (app.entry allowSet / RBI_SW_ALLOWLIST).
 * Order: longer / more specific prefixes first (construction-v2 before construction).
 * *.manifest.js under these prefixes are NOT gated (declarative glue for modules.manifest.js).
 */
const BUSINESS_PREFIX_TO_MODULE = [
  { prefix: '/js/modules/construction-v2/', module: 'construction-v2' },
  { prefix: '/js/modules/construction/', module: 'construction' },
  { prefix: '/js/modules/quality/', module: 'quality' },
  { prefix: '/js/dist/construction-v2.js', module: 'construction-v2' },
  { prefix: '/js/dist/rbi-construction-', module: 'construction' }
];

/** null = allowlist ещё не пришёл — временно разрешаем cache.put (первый paint). */
let allowedModules = null;

/**
 * P2-0013: бандлы модулей Platform 2.0 — в кэше только положенные этому входу (сообщение P2_SW_ALLOWLIST от входа платформы:
 * модуль компании ∩ права по ответу сервера); остальные не кэшируются и удаляются. Сам вход (js/dist/platform/) — всем.
 */
const P2_PREFIX_TO_MODULE = [
  { prefix: '/js/dist/planfact/', module: 'planfact' },
  { prefix: '/js/dist/company/', module: 'company' },
  { prefix: '/js/dist/platform-admin/', module: 'platform-admin' }
];
let p2AllowedModules = null;

function resolveP2Module(url) {
  try {
    const path = new URL(url).pathname;
    for (let i = 0; i < P2_PREFIX_TO_MODULE.length; i++) {
      if (path.indexOf(P2_PREFIX_TO_MODULE[i].prefix) !== -1) return P2_PREFIX_TO_MODULE[i].module;
    }
  } catch (e) { /* ignore */ }
  return null;
}

function purgeDisallowedP2Cache() {
  if (p2AllowedModules === null) return Promise.resolve();
  return caches.open(CACHE_NAME).then((cache) => cache.keys().then((keys) => Promise.all(keys.map((req) => {
    const mod = resolveP2Module(req.url);
    return mod && p2AllowedModules.indexOf(mod) === -1 ? cache.delete(req) : null;
  }))));
}

function isManifestUrl(url) {
  try {
    const path = new URL(url).pathname;
    return /(^|\/)[^/]*manifest\.js$/.test(path);
  } catch (e) {
    return false;
  }
}

function resolveBusinessModule(url) {
  try {
    const path = new URL(url).pathname;
    for (let i = 0; i < BUSINESS_PREFIX_TO_MODULE.length; i++) {
      const { prefix, module } = BUSINESS_PREFIX_TO_MODULE[i];
      if (prefix.endsWith('.js')) {
        if (path === prefix || path.endsWith(prefix)) return module;
      } else if (path.indexOf(prefix) !== -1) {
        return module;
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

function mayCachePut(url) {
  const p2 = resolveP2Module(url);
  if (p2) return p2AllowedModules === null || p2AllowedModules.indexOf(p2) !== -1;
  if (isManifestUrl(url)) return true;
  const mod = resolveBusinessModule(url);
  if (!mod) return true;
  if (allowedModules === null) return true;
  return allowedModules.indexOf(mod) !== -1;
}

function purgeDisallowedBusinessCache() {
  if (allowedModules === null) return Promise.resolve();
  return caches.open(CACHE_NAME).then((cache) => {
    return cache.keys().then((keys) => {
      return Promise.all(
        keys.map((req) => {
          if (isManifestUrl(req.url)) return null;
          const mod = resolveBusinessModule(req.url);
          if (mod && allowedModules.indexOf(mod) === -1) {
            return cache.delete(req);
          }
          return null;
        })
      );
    });
  });
}

// 1. ПРЕ-КЭШ: shell + settings + locations (+ business *.manifest.js as declarations).
// Business bundles (quality/construction/…) — runtime cache via fetch + RBI_SW_ALLOWLIST.
const urlsToCache = [
  './',
  './index.html',
  './report.html',
  './css/brand/rbi.css',
  './css/style.css',
  './css/app-shell.desktop.css',
  './css/rbi-ui.css',
  './css/analytics.desktop.css',
  './css/audit.desktop.css',
  './css/engineer.desktop.css',
  './css/knowledge.desktop.css',
  './css/settings.desktop.css',
  // PWA / сплэш / push (иначе офлайн без иконок и «Добавить на экран»)
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-2.png',
  './icons/icon-maskable-512.png',
  './data/system_docs.js',
  './data/system_nodes.js',
  './data/system_twi.js',
  './js/shared/template.utils.js',
  './data/system_templates.js',
  './data/system_templates.en.js',
  './data/system_templates.sr-Latn.js',
  './data/system_templates.ka.js',
  './js/shared/system-templates-locale.js',
  './js/core/router.js',
  './js/core/views.js',
  './js/services/config.service.js',
  './libs/tailwindcdn.js',
  './libs/chart.umd.min.js',
  './libs/xlsx.full.min.js',
  './libs/html2pdf.bundle.min.js',
  './libs/pptxgenjs.bundle.js',
  './libs/pptxviewjs.min.js',
  './libs/docx.bundle.js',
  './libs/pdfjs/pdf.min.js',
  './libs/pdfjs/pdf.worker.min.js',
  './libs/qrcode.min.js',
  './libs/panzoom.min.js',
  './libs/Sortable.min.js',
  './libs/supabase-js.min.js',
  './js/services/sync/sync-pull.policy.js',
  './js/services/sync/sync-retry.policy.js',
  './js/services/sync/sync-merge.policy.js',
  './js/services/sync/sync-core.state.js',
  './js/services/sync/sync-cloud-prepare.utils.js',
  './js/services/sync/sync-auth.js',
  './js/services/sync/sync-ui.render.js',
  './js/services/sync/sync-connection.actions.js',
  './js/services/sync/sync-push-pull.core.js',
  './js/services/sync/sync-progress.ui.js',
  './js/services/sync/sync-engine.core.js',
  './js/services/sync/sync-post-actions.js',
  './js/services/storage/storage-db.core.js',
  './js/services/storage/checklist-snapshot.utils.js',
  './js/services/storage/history-memory.utils.js',
  './js/services/storage/storage-converters.utils.js',
  './js/services/storage/storage-cache-manager.js',
  './js/services/storage/storage-offline-cache.utils.js',
  './js/services/storage/storage-diagnostics.render.js',
  './js/services/storage/storage-photo-loader.js',
  './js/services/storage/storage-photo-manager.js',
  './js/services/storage/storage-file-queue.actions.js',
  './js/shared/math.utils.js',
  './js/shared/plan-panzoom.utils.js',
  './js/shared/toast.utils.js',
  './js/shared/form-draft.utils.js',
  './js/shared/smart-input.utils.js',
  './js/shared/photo-editor.utils.js',
  './js/shared/photo-viewer-zoom.utils.js',
  './js/shared/pdf-open.utils.js',
  './js/shared/splash-screen.utils.js',
  './js/shared/pwa-update.utils.js',
  './js/shared/fab-export.utils.js',
  './js/shared/layout.utils.js',
  './js/shared/sync-ui-defer.utils.js',
  './js/shared/notify.utils.js',
  './js/shared/error-log.utils.js',
  './js/shared/touch-gestures.utils.js',
  './js/shared/ui-motion.utils.js',
  './js/shared/snake-game.utils.js',
  './js/shared/checklist-runner.js',
  './js/core/bootstrap.js',
  './js/core/app-shell.js',
  './js/core/app-shell.desktop.js',

  // Ядро модульной архитектуры
  './js/core/rbi-core.js',
  './js/core/app.entry.js',
  './js/core/module-loader.js',
  './js/modules/modules.manifest.js',

  // Сервисы
  './js/services/storage.service.js',
  './js/services/permission.service.js',
  './js/services/sync.service.js',
  './js/services/inspection.service.js',
  './js/services/file.service.js',
  './js/services/report.service.js',
  './js/services/contractor-directory.service.js',
  './js/services/contractor-metrics.service.js',
  './js/services/object-directory.service.js',
  './js/services/task.service.js',
  './js/services/sk.service.js',
  './js/services/game.service.js',
  './js/services/knowledge.service.js',
  './js/services/analytics.service.js',

  // Фаза 21 — AI Service
  './js/services/ai.service.js',

  // Фаза 22/23 — Master Data Service
  './js/services/masterData.service.js',

  // Фаза 29 — Template Service
  './js/services/template.service.js',

  // Фаза 8 — Settings
  './js/services/settings.service.js',
  // i18n v1 — каркас локализации оболочки
  './js/services/i18n.service.js',
  './locales/ru.json',
  './locales/en.json',
  './locales/sr-Latn.json',
  './locales/ka.json',
  './js/services/app-mode.service.js',
  './js/services/company.service.js',
  './js/services/user-context.service.js',
  './js/services/session.service.js',
  './js/modules/settings/settings.manifest.js',
  './js/modules/settings/settings.render.js',
  './js/modules/settings/settings.desktop.render.js',
  './js/modules/settings/settings.actions.js',
  './js/modules/settings/settings.module.js',
  './js/modules/settings/features/tutorial.js',
  './js/modules/settings/features/app-mode-utils.js',
  './js/modules/settings/features/changelog.js',
  './js/modules/settings/features/feedback.js',
  './js/modules/settings/features/contractor-directory-ui.js',
  './js/modules/settings/features/contractor-id-backfill-ui.js',
  './js/modules/settings/features/project-id-backfill-ui.js',
  './js/modules/settings/features/cloud-deleted-purge-ui.js',
  './js/modules/settings/features/cloud-orphan-urls-ui.js',
  './js/modules/settings/features/role-matrix-ui.js',
  './js/modules/settings/features/official-templates-ui.js',
  './js/modules/settings/features/location-directory-ui.js',
  './js/modules/settings/index.js',
  './js/dist/rbi-locations.js',

  // Business manifests only (declarative; modules.manifest.js imports them)
  './js/modules/quality/manifest.js',
  './js/modules/quality/features/sk/sk.manifest.js',
  './js/modules/knowledge/knowledge.manifest.js',
  './js/modules/quality/features/gamification/game.manifest.js',
  './js/modules/quality/features/ai/ai.manifest.js',
  './js/modules/construction/construction.manifest.js',
  './js/modules/construction-v2/construction-v2.manifest.js',

  // Модули (legacy)
  './manifest.webmanifest',
  // Шрифты Inter (интерфейс)
  './fonts/Inter-Regular.woff2',
  './fonts/Inter-Medium.woff2',
  './fonts/Inter-SemiBold.woff2',
  './fonts/Inter-Bold.woff2',
  './fonts/Inter-ExtraBold.woff2',
  './fonts/Inter-Black.woff2',

  // Шрифты IBM Plex Sans (темы rbi-*-v3)
  './fonts/IBMPlexSans-Regular.woff2',
  './fonts/IBMPlexSans-Medium.woff2',
  './fonts/IBMPlexSans-SemiBold.woff2',
  './fonts/IBMPlexSans-Bold.woff2',

  // Шрифты Playfair Display (PDF – заголовки)
  './fonts/PlayfairDisplay-Regular.woff2',
  './fonts/PlayfairDisplay-Italic.woff2',
  './fonts/PlayfairDisplay-Medium.woff2',
  './fonts/PlayfairDisplay-MediumItalic.woff2',
  './fonts/PlayfairDisplay-SemiBold.woff2',
  './fonts/PlayfairDisplay-SemiBoldItalic.woff2',
  './fonts/PlayfairDisplay-Bold.woff2',
  './fonts/PlayfairDisplay-BoldItalic.woff2',
  './fonts/PlayfairDisplay-ExtraBold.woff2',
  './fonts/PlayfairDisplay-ExtraBoldItalic.woff2',
  './fonts/PlayfairDisplay-Black.woff2',
  './fonts/PlayfairDisplay-BlackItalic.woff2',

  // Шрифты Bricolage Grotesque (PDF – основной текст)
  './fonts/BricolageGrotesque-Light.woff2',
  './fonts/BricolageGrotesque-Regular.woff2',
  './fonts/BricolageGrotesque-Medium.woff2',
  './fonts/BricolageGrotesque-SemiBold.woff2',
  './fonts/BricolageGrotesque-Bold.woff2',
  './fonts/BricolageGrotesque-ExtraBold.woff2'
];

// 2. УСТАНОВКА: Безопасное скачивание файлов в память
// skipWaiting: только первая установка (нет active SW). Обновление ждёт
// кнопку «Обновить» → postMessage('SKIP_WAITING'), иначе controllerchange
// + location.reload на iPhone выглядят как внезапная перезагрузка.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Кэшируем ядро и библиотеки...');
      // Безопасное кэширование: если одна ссылка недоступна, остальные всё равно скачаются
      return Promise.all(

        urlsToCache.map(url => {

          // cache: 'reload' — принудительно обходит HTTP-кэш браузера (критично для
          // iOS Safari: без этого fetch() мог вернуть старую версию файла из
          // собственного кэша WebKit, даже если Cache API уже создаёт новую версию
          // кэша под новым CACHE_NAME — из-за этого получалась смесь старых и новых
          // файлов внутри "новой" версии и визуальные артефакты после обновления).
          return fetch(url, { cache: 'reload' })

            .then(response => {

              if (
                response &&
                response.status === 200
              ) {

                return cache.put(
                  url,
                  response.clone()
                );

              }

            })

            .catch(err => {

              console.log(
                '[SW] Ошибка кэширования:',
                url,
                err
              );

            });

        })

      );
    }).then(() => {
      if (!self.registration.active) {
        return self.skipWaiting();
      }
    })
  );
});

// 3. АКТИВАЦИЯ: Удаляем старые версии кэша
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Platform 2.0: удаляем только свои старые кэши, чужие (другие приложения на origin) не трогаем
          if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME) {
            console.log('[SW] Удаляем старый кэш:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 4. ПЕРЕХВАТ ЗАПРОСОВ
// P2-0016 (ADR-068): файлы компаний — в закрытых бакетах quality-*. Ссылки в записях Качества остаются «публичного» вида
// (…/object/public/quality-…); кэш приложения подставляет вход вошедшего (токен присылает страница — сообщение P2_STORAGE_TOKEN)
// и берёт файл по …/object/authenticated/…. Только сервер платформы (APP_CONFIG.P2_SUPABASE_URL). Нет связи — офлайн-кэш.
let p2StorageToken = null;
let p2TokenKnown = false;   // страница уже сообщила (в т.ч. «вышли» — null): не ждать
let p2TokenWaiters = [];
const P2_STORAGE_ORIGIN = (() => { try { return new URL(self.APP_CONFIG.P2_SUPABASE_URL).origin; } catch (e) { return ''; } })();

function isCompanyFileUrl(url) {
  return !!P2_STORAGE_ORIGIN && url.startsWith(P2_STORAGE_ORIGIN + '/storage/v1/object/public/quality-');
}

async function p2Token() {
  if (p2TokenKnown) return p2StorageToken;
  const list = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  list.forEach((c) => c.postMessage({ type: 'P2_STORAGE_TOKEN_REQUEST' }));
  return new Promise((resolve) => {
    p2TokenWaiters.push(resolve);
    setTimeout(() => resolve(p2StorageToken), 3000);
  });
}

// P2-0018 (ТД №121): ответ сервера (в т.ч. 401/403 — нет входа или права) отдаётся как есть; офлайн-кэш — только без сети.
async function fetchCompanyFile(request) {
  const token = await p2Token();
  const url = request.url.replace('/storage/v1/object/public/', '/storage/v1/object/authenticated/');
  try {
    return await fetch(url, { headers: token ? { Authorization: 'Bearer ' + token, apikey: self.APP_CONFIG.P2_SUPABASE_ANON_KEY } : {} });
  } catch (e) {
    const cached = await caches.match(request, { ignoreVary: true });
    return cached || Response.error();
  }
}

// P2-0018 (ТД №121): закрытые файлы компаний в кэше — только текущего входа. Выход (токен сброшен) или другой
// «компания + пользователь» (сообщение страницы P2_STORAGE_SLOT) — такие файлы удаляются из всех кэшей.
const P2_SLOT_CACHE = 'p2-storage-slot', P2_SLOT_KEY = '/__p2_storage_slot';
function purgeCompanyFiles() {
  return caches.keys().then((names) => Promise.all(names.map((n) => caches.open(n).then((c) => c.keys()
    .then((keys) => Promise.all(keys.filter((r) => isCompanyFileUrl(r.url)).map((r) => c.delete(r))))))));
}
async function setStorageSlot(slot) {
  let prev = null;
  try {
    const c = await caches.open(P2_SLOT_CACHE);
    const hit = typeof c.match === 'function' ? await c.match(P2_SLOT_KEY) : null;
    prev = hit ? await hit.text() : null;
    if (prev !== slot) {
      await purgeCompanyFiles();
      await c.put(P2_SLOT_KEY, new Response(slot));
    }
  } catch (e) { await purgeCompanyFiles(); }
}

self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith('http')) return;
  if (event.request.method !== 'GET') return;

  if (isCompanyFileUrl(event.request.url)) {
    event.respondWith(fetchCompanyFile(event.request));
    return;
  }

  // ✅ НОВОЕ: Полностью пропускаем запросы к облачному хранилищу (Storage)
  if (event.request.url.includes('/storage/v1/object/public/')) {
    return;   // Браузер обработает запрос напрямую, без вмешательства SW
  }

  // ✅ Пропускаем запросы к API Supabase (база, авторизация, функции) по пути, без привязки к хосту
  const isApi = /\/(rest|auth|functions|realtime)\/v1\//.test(event.request.url);
  if (isApi) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Сеть (обновление кэша) запускаем всегда, но НЕ ждём её для ответа,
      // если есть кэш — см. ветку ниже. .catch(() => null) не даёт упасть
      // необработанным réjection'ом (сеть недоступна/CORS).
      const networkUpdate = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && mayCachePut(event.request.url)) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => null);

      // Cache-first + stale-while-revalidate: если есть закэшированная
      // версия — отдаём её МГНОВЕННО, не дожидаясь сети. Раньше здесь был
      // network-first (сначала fetch, кэш — только при явном сетевом
      // сбое) — на iOS при смене сети на возврате из фона fetch() может
      // «висеть» без явного reject, и запрос ядра приложения (bootstrap.js,
      // router.js и т.п.) зависал вместо мгновенной отдачи из кэша. Плюс
      // раньше не-200 ответ сети (гонка деплоя/CDN) шёл пользователю
      // напрямую, даже если в кэше была валидная версия. Сеть обновляет
      // кэш в фоне (event.waitUntil — чтобы браузер не убил SW раньше
      // времени), результат уйдёт в дело при следующем обращении.
      if (cachedResponse) {
        event.waitUntil(networkUpdate);
        return cachedResponse;
      }

      // В кэше нет записи — сеть остаётся единственным источником.
      return networkUpdate.then((networkResponse) => networkResponse || Response.error());
    }).catch(() => Response.error())
  );
});

// ==========================================
// PUSH УВЕДОМЛЕНИЯ
// ==========================================

// Слушаем приход Push-уведомления с сервера
self.addEventListener('push', function (event) {
  // Если сервер прислал данные, берем их. Иначе ставим заглушку.
  const data = event.data ? event.data.json() : { title: 'RBI Platform', body: 'У вас новое уведомление' };

  const options = {
    body: data.body,
    icon: './icons/icon-512-2.png',
    badge: './icons/icon-512-2.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/' // Ссылка, куда перейти при клике
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Слушаем клик пользователя по уведомлению
self.addEventListener('notificationclick', function (event) {
  event.notification.close(); // Закрываем уведомление

  // Открываем приложение по ссылке из уведомления
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});

// ==========================================
// ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ КЭША
// ==========================================
self.addEventListener('message', (event) => {
  // Если получаем команду SKIP_WAITING от кнопки "Обновить" в интерфейсе
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting(); // Заставляем новый Service Worker немедленно взять управление на себя
    return;
  }
  // Platform runtime independence · столп A: allowlist shortIds → gate cache.put + purge
  if (event.data && event.data.type === 'RBI_SW_ALLOWLIST' && Array.isArray(event.data.modules)) {
    allowedModules = event.data.modules.slice();
    console.log('[SW] RBI_SW_ALLOWLIST:', allowedModules.join(','));
    event.waitUntil(purgeDisallowedBusinessCache());
  }
  if (event.data && event.data.type === 'P2_STORAGE_TOKEN') {
    const had = p2StorageToken;
    p2StorageToken = typeof event.data.token === 'string' && event.data.token ? event.data.token : null;
    p2TokenKnown = true;
    // выход — закрытые файлы из кэша убрать (и после перезапуска кэша: по сохранённому слоту входа)
    if (!p2StorageToken) event.waitUntil(had ? purgeCompanyFiles().then(() => setStorageSlot('')) : setStorageSlot(''));
    const w = p2TokenWaiters; p2TokenWaiters = [];
    w.forEach((r) => r(p2StorageToken));
    return;
  }
  if (event.data && event.data.type === 'P2_STORAGE_SLOT' && typeof event.data.slot === 'string') {
    event.waitUntil(setStorageSlot(event.data.slot));
    return;
  }
  if (event.data && event.data.type === 'P2_SW_ALLOWLIST' && Array.isArray(event.data.modules)) {
    p2AllowedModules = event.data.modules.slice();
    console.log('[SW] P2_SW_ALLOWLIST:', p2AllowedModules.join(',') || '—');
    event.waitUntil(purgeDisallowedP2Cache());
  }
});