/* Файл: js/services/sync/sync-core.state.js — перенесено из js/sync.js; P2-0023: постраничная загрузка пунктов/фото */
import { pullPagedByIds } from './sync-pull.policy.js';
import './sync-retry.policy.js';
import './sync-merge.policy.js'; // window.RbiSyncMergePolicy (P2-0023 этап 5) // window.RbiSyncRetryPolicy для sync-engine/sync-auth (P2-0023 этап 4)
/* Файл: js/sync.js (Исправленная версия сборки объектов) */
console.log("✅ SYNC.JS загружен браузером!");

window.supabaseClient = null;
window.syncConfig = { enabled: false, engineerName: '', projectCode: '', pinHash: '', deviceId: '', syncMode: 'personal', fullAccessGranted: false };
window.isSyncing = false;
window.appAssistantData = []; // Массив базы знаний ИИ
let syncTimeout = null;
const syncChannel = new BroadcastChannel('rbi_sync_lock');
syncChannel.onmessage = (e) => {
    if (e.data === 'sync_started') {
        window.isSyncing = true;
        if (typeof window.rbiBeginSyncUiDefer === 'function') window.rbiBeginSyncUiDefer();
        else window._rbiDeferActiveViewFullRender = true;
    }
    if (e.data === 'sync_done') {
        window.isSyncing = false;
        if (typeof window.rbiEndSyncUiDefer === 'function') window.rbiEndSyncUiDefer(400);
        else window._rbiDeferActiveViewFullRender = false;
    }
};
// Флаги отложенного обновления интерфейса (Lazy Rendering)
window.syncDirtyFlags = {
    templates: false,
    history: false,
    analytics: false,
    tasks: false,
    session: false,
    reference: false,
    sk: false,
    construction: false
};
// Хэш SHA-256 для пароля ""
const SYNC_FULL_ACCESS_HASH = "1570722437"
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        let char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Преобразуем в 32-битное целое
    }
    return hash.toString();
}
try {
    let saved = localStorage.getItem('rbi_sync_config');
    if (saved) window.syncConfig = JSON.parse(saved);
} catch (e) { }

if (!window.syncConfig.deviceId) {
    window.syncConfig.deviceId = 'dev_' + Date.now().toString(36);
    localStorage.setItem('rbi_sync_config', JSON.stringify(window.syncConfig));
}

function safeToast(msg) {
    if (typeof showToast === 'function') showToast(msg);
    else console.log(msg);
}
// === RBI FIX: лёгкая очередь фонового кэша файлов ===
window.rbiBgCacheQueue = window.rbiBgCacheQueue || [];
window.rbiBgCacheProcessing = false;
window.rbiFullOfflineCacheProcessing = false;
/** URL, уже успешно проверенные/закэшированные в этой сессии — не ставить в очередь снова на каждом sync. */
window.rbiBgCacheDone = (window.rbiBgCacheDone instanceof Set) ? window.rbiBgCacheDone : new Set();
/** Пауза sync на время полного автокэша / «скачать всё» (не лёгкая bg-очередь). */
window.rbiOfflineCacheBlocksSync = false;

function rbiBgCacheMarkDone(url) {
    if (typeof url === 'string' && url) window.rbiBgCacheDone.add(url);
}

function rbiBgCacheIsDone(url) {
    if (!url || typeof url !== 'string') return true;
    if (window.rbiBgCacheDone.has(url)) return true;
    try {
        if (typeof PhotoManager !== 'undefined' && PhotoManager.cache && PhotoManager.cache[url]) return true;
    } catch (_) { /* ignore */ }
    return false;
}

function rbiIsOfflineCacheBlockingSync() {
    return !!(
        window.rbiOfflineCacheBlocksSync ||
        window.rbiFileCacheQueueLock ||
        window.rbiFullOfflineCacheProcessing
    );
}

function rbiBeginOfflineCacheSyncPause(reason) {
    window.rbiOfflineCacheBlocksSync = true;
    if (reason) {
        console.log('[OfflineCache] Sync на паузе до конца докачки:', reason);
    }
}

/**
 * Снять паузу sync. Если был отложенный triggerSync — один раз запустить после паузы.
 * Не флашит, пока ещё держится lock / FullOfflineCacheProcessing.
 * После автокэша — всегда silent (без тоста), кроме явного manual, который юзер нажал во время докачки.
 */
function rbiEndOfflineCacheSyncPause() {
    window.rbiOfflineCacheBlocksSync = false;

    if (window.rbiFileCacheQueueLock || window.rbiFullOfflineCacheProcessing) return;
    if (window.isSyncing) return;
    if (!window._rbiPendingSyncRetryMode) return;
    if (typeof window.triggerSync !== 'function') return;

    const retryMode = window._rbiPendingSyncRetryMode;
    window._rbiPendingSyncRetryMode = null;
    // Автодогон после кэша не шумит тостом; manual оставляем как ручной запрос.
    const flushMode = retryMode === 'manual' ? 'manual' : 'silent';
    console.log('[OfflineCache] Пауза sync снята, отложенный sync:', flushMode,
        flushMode !== retryMode ? `(было ${retryMode})` : '');
    setTimeout(() => {
        if (rbiIsOfflineCacheBlockingSync()) {
            window._rbiPendingSyncRetryMode =
                (flushMode === 'manual' || window._rbiPendingSyncRetryMode === 'manual')
                    ? 'manual'
                    : (window._rbiPendingSyncRetryMode || flushMode);
            return;
        }
        if (!window.isSyncing) window.triggerSync(flushMode);
    }, 400);
}

function rbiDeferSyncForOfflineCache(mode) {
    window._rbiPendingSyncRetryMode =
        (mode === 'manual' || window._rbiPendingSyncRetryMode === 'manual')
            ? 'manual'
            : (window._rbiPendingSyncRetryMode || mode || 'silent');
}

function rbiEnqueueCloudFilesForCache(urls, source = 'unknown') {
    if (!Array.isArray(urls) || urls.length === 0) return;

    const existing = new Set(window.rbiBgCacheQueue.map(x => x.url));

    urls.forEach(url => {
        if (
            typeof url === 'string' &&
            url.startsWith('http') &&
            url.includes('/storage/v1/object/') &&
            !existing.has(url) &&
            !rbiBgCacheIsDone(url)
        ) {
            window.rbiBgCacheQueue.push({
                url,
                source,
                addedAt: Date.now()
            });
            existing.add(url);
        }
    });

    // Ограничиваем очередь, чтобы старые телефоны не зависали.
    // Ограничиваем очередь, но не режем её слишком сильно.
    // 300 мало: при первой полной синхронизации часть файлов просто не успевает попасть в автокэш.
    const maxQueueSize = 2000;

    if (window.rbiBgCacheQueue.length > maxQueueSize) {
        window.rbiBgCacheQueue = window.rbiBgCacheQueue.slice(-maxQueueSize);
    }
}

async function rbiProcessBgCacheQueue(options = {}) {
    if (window.rbiBgCacheProcessing) return;
    if (!navigator.onLine) return;
    if (typeof PhotoManager === 'undefined') return;
    if (typeof PhotoManager.downloadForOffline !== 'function') return;

    // Единая политика для всех устройств (без Safari/iOS split).
    const concurrency = options.concurrency || window.RBI_OFFLINE_CACHE_CONCURRENCY || 4;
    const maxPerRun = options.maxPerRun || 80;
    const pauseBetweenRounds = options.pauseBetweenRounds ?? (window.RBI_OFFLINE_CACHE_BATCH_PAUSE_MS ?? 60);

    window.rbiBgCacheProcessing = true;

    try {
        // Уже done в этой сессии — выкидываем без скачивания/логов.
        const raw = window.rbiBgCacheQueue.splice(0, maxPerRun);
        const batch = raw.filter((item) => item && item.url && !rbiBgCacheIsDone(item.url));
        // Хвост очереди мог накопиться — не потерять, но done-URL не возвращаем.
        if (batch.length === 0) {
            if (window.rbiBgCacheQueue.length > 0) {
                setTimeout(() => { rbiProcessBgCacheQueue(options); }, pauseBetweenRounds);
            }
            return;
        }

        let cursor = 0;
        let fetched = 0;
        let skipped = 0;

        const workers = Array.from({ length: concurrency }, async () => {
            while (cursor < batch.length) {
                const item = batch[cursor++];
                if (!item || !item.url) continue;

                try {
                    const res = await PhotoManager.downloadForOffline(item.url, { skipMemoryCache: true });
                    rbiBgCacheMarkDone(item.url);
                    if (res && res.fetched === true) fetched++;
                    else skipped++;
                } catch (e) {
                    console.warn('[Cache] Не удалось закэшировать файл:', item.source, e);
                }
            }
        });

        await Promise.allSettled(workers);

        // Лог только если было реальное скачивание — иначе sync каждый раз «перекэшировал» одни и те же URL.
        if (fetched > 0) {
            console.log(
                `[Cache] Фоновый кэш: скачано ${fetched}, уже локально ${skipped}, ` +
                `потоков ${concurrency}, осталось в очереди: ${window.rbiBgCacheQueue.length}`
            );
        }

        if (window.rbiBgCacheQueue.length > 0) {
            setTimeout(() => {
                rbiProcessBgCacheQueue(options);
            }, pauseBetweenRounds);
        }
    } finally {
        window.rbiBgCacheProcessing = false;
    }
}

function rbiCollectCloudStorageUrls(obj, limit = 30) {
    const urls = new Set();

    const walk = (value) => {
        if (!value || urls.size >= limit) return;

        if (
            typeof value === 'string' &&
            value.startsWith('http') &&
            value.includes('/storage/v1/object/')
        ) {
            urls.add(value);
            return;
        }

        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }

        if (typeof value === 'object') {
            Object.values(value).forEach(walk);
        }
    };

    walk(obj);
    return Array.from(urls);
}
// === /RBI FIX ===
// === RBI FIX: регулярная проверка облака даже без локальных изменений ===
function rbiIsRemotePollDue(intervalMs = 10 * 60 * 1000) {
    const last = Number(localStorage.getItem('rbi_sync_last_remote_check_at') || 0);
    return !last || (Date.now() - last) > intervalMs;
}

function rbiMarkCloudDirty() {
    localStorage.setItem('rbi_cloud_dirty', '1');
    localStorage.setItem('rbi_force_remote_poll', '1');
}

window.rbiMarkCloudDirty = rbiMarkCloudDirty;
// === RBI FIX: настройка автокэша офлайн-файлов ===
function rbiIsAutoCacheEnabled() {
    // Полное автокэширование запускаем только когда настройка явно включена.
    return typeof appSettings !== 'undefined' && appSettings.autoCacheCloudFiles === true;
}

/** После очистки кэша / нехватки места — заново скачать облачные файлы для офлайна. */
function rbiRequestFullOfflineCache(reason = '') {
    localStorage.removeItem('rbi_first_full_offline_cache_done');
    localStorage.removeItem('rbi_first_full_offline_cache_started_at');
    localStorage.setItem('rbi_need_full_offline_cache', '1');
    // Полный перекэш — сбросить session-done, иначе лёгкая очередь не возьмёт те же URL.
    window.rbiBgCacheDone = new Set();
    if (reason) {
        console.log('[OfflineCache] Запрошено полное копирование:', reason);
    }
}

function rbiScheduleFullOfflineCacheIfEnabled(delayMs = 800) {
    if (!navigator.onLine) return;
    if (!rbiIsAutoCacheEnabled()) return;
    if (typeof window.downloadMissingCloudFiles !== 'function') return;
    if (window.rbiFullOfflineCacheProcessing || window.rbiFileCacheQueueLock) return;

    rbiBeginOfflineCacheSyncPause('schedule_full_offline_cache');

    setTimeout(async () => {
        try {
            if (!rbiIsAutoCacheEnabled() || !navigator.onLine) return;
            if (window.rbiFullOfflineCacheProcessing || window.rbiFileCacheQueueLock) return;

            window.rbiFullOfflineCacheProcessing = true;
            try {
                console.log('[OfflineCache] Запуск докачки после очистки/запроса.');
                await window.downloadMissingCloudFiles(false, 'all');
                window.rbiBgCacheQueue = [];
                localStorage.setItem('rbi_first_full_offline_cache_done', '1');
                localStorage.setItem('rbi_last_bg_cache_at', String(Date.now()));
                localStorage.removeItem('rbi_need_full_offline_cache');
            } catch (e) {
                console.warn('[OfflineCache] Ошибка докачки после запроса:', e);
                localStorage.removeItem('rbi_first_full_offline_cache_done');
            } finally {
                window.rbiFullOfflineCacheProcessing = false;
            }
        } finally {
            rbiEndOfflineCacheSyncPause();
        }
    }, delayMs);
}
// === /RBI FIX ===
// === /RBI FIX ===
// === RBI FIX: постраничный pull без жёсткого потолка ===
// Раньше запросы вида .select('*').limit(500) обрезали результат навсегда —
// строки за пределами первых 500 (по заданной сортировке) не докачивались ни
// при первой, ни при последующих синхронизациях. queryBuilderFn(from, to)
// должен каждый раз собирать НОВЫЙ объект запроса Supabase (с тем же order()
// и фильтрами) и применять .range(from, to) — сам объект запроса одноразовый
// после await, поэтому переиспользовать его между страницами нельзя.
async function rbiPullAllRows(queryBuilderFn, pageSize = 500) {
    const result = [];
    let from = 0;

    while (true) {
        const to = from + pageSize - 1;
        const { data, error } = await queryBuilderFn(from, to);

        if (error) {
            console.error(`[Sync] Ошибка постраничного pull, диапазон ${from}-${to}:`, error);
            throw error;
        }

        if (Array.isArray(data) && data.length > 0) {
            result.push(...data);
        }

        if (!Array.isArray(data) || data.length < pageSize) break;
        from += pageSize;
    }

    return result;
}

// === RBI FIX: безопасные батчи для pull/push и кэширования файлов ===
// P2-0023: внутри пачки — постранично (order by id + range). Раньше один запрос на 40 проверок:
// сервер обрезал ответ по лимиту строк (~1000), и пункты/фото хвоста молча терялись.
// P2-0024: пачки по 200 проверок, до 3 запросов одновременно; первая страница пачки просит общее
// число строк (count) — хвост не теряется при любом лимите сервера и без лишнего пустого запроса.
async function rbiPullRowsByInspectionIds(tableName, ids, batchSize = 40, pageSize = 500, opts = {}) {
    try {
        return await pullPagedByIds(
            // P2-0025 (ТД №167): страница — «после последнего полученного id», а не по смещению
            (batchIds, from, to, first, afterId) => {
                let q = window.supabaseClient
                    .from(tableName)
                    .select('*', first ? { count: 'exact' } : undefined)
                    .in('inspection_id', batchIds);
                if (afterId !== null && afterId !== undefined) q = q.gt('id', afterId);
                return q.order('id', { ascending: true }).limit(to - from + 1);
            },
            ids,
            {
                batchSize,
                pageSize,
                keyset: true,
                concurrency: opts.concurrency || 1,
                onBatchDone: opts.onBatchDone,
                onThrottle: (err) => {
                    console.warn(`[Sync] Сервер перегружен (${tableName}), загрузка по одному запросу:`, err && (err.status || err.message));
                    if (opts.onThrottle) opts.onThrottle(err);
                },
                pause: opts.concurrency > 1 ? null : () => new Promise(r => setTimeout(r, 20))
            }
        );
    } catch (error) {
        console.error(`[Sync] Ошибка pull ${tableName}:`, error);
        throw error;
    }
}

async function rbiUpsertBatches(tableName, rows, batchSize = 500, options = { onConflict: 'id' }) {
    if (!Array.isArray(rows) || rows.length === 0) return 0;

    let pushed = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);

        const { error } = await window.supabaseClient
            .from(tableName)
            .upsert(batch, options);

        if (error) {
            console.error(`[Sync] Ошибка push ${tableName}, batch ${i}-${i + batch.length}:`, error);
            throw error;
        }

        pushed += batch.length;
        await new Promise(r => setTimeout(r, 20));
    }

    return pushed;
}

window.simpleHash = simpleHash;
window.safeToast = safeToast;
window.rbiEnqueueCloudFilesForCache = rbiEnqueueCloudFilesForCache;
window.rbiProcessBgCacheQueue = rbiProcessBgCacheQueue;
window.rbiCollectCloudStorageUrls = rbiCollectCloudStorageUrls;
window.rbiIsRemotePollDue = rbiIsRemotePollDue;
window.rbiIsAutoCacheEnabled = rbiIsAutoCacheEnabled;
window.rbiRequestFullOfflineCache = rbiRequestFullOfflineCache;
window.rbiScheduleFullOfflineCacheIfEnabled = rbiScheduleFullOfflineCacheIfEnabled;
window.rbiIsOfflineCacheBlockingSync = rbiIsOfflineCacheBlockingSync;
window.rbiBeginOfflineCacheSyncPause = rbiBeginOfflineCacheSyncPause;
window.rbiEndOfflineCacheSyncPause = rbiEndOfflineCacheSyncPause;
window.rbiDeferSyncForOfflineCache = rbiDeferSyncForOfflineCache;
window.rbiPullAllRows = rbiPullAllRows;
window.rbiPullRowsByInspectionIds = rbiPullRowsByInspectionIds;
window.rbiUpsertBatches = rbiUpsertBatches;
window.syncTimeout = syncTimeout;
window.syncChannel = syncChannel;
window.SYNC_FULL_ACCESS_HASH = SYNC_FULL_ACCESS_HASH;
