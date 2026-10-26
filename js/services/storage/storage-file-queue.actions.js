/* Файл: js/services/storage/storage-file-queue.actions.js — очередь офлайн-кэша + scopes */
// === RBI FILE CACHE QUEUE v18.57.355 ===
window.rbiFileCacheQueueLock = false;

async function rbiUpsertFileCacheQueueItem(url, status = 'pending', extra = {}) {
    if (!url || !STORES.FILE_REGISTRY) return;

    const now = new Date().toISOString();
    const sm = window.RbiStorageManager;
    const index = sm && typeof sm.ensureFileRegistryIndex === 'function'
        ? await sm.ensureFileRegistryIndex()
        : null;

    let item = index ? index.get(url) : null;

    if (!item) {
        item = {
            id: 'cacheq_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 100000),
            project_code: window.syncConfig?.projectCode || 'LOCAL',
            public_url: url,
            publicUrl: url,
            local_key: url,
            localKey: url,
            entity_type: window.RbiStorageManager?.guessEntityTypeByUrl?.(url) || 'unknown_file',
            entityType: window.RbiStorageManager?.guessEntityTypeByUrl?.(url) || 'unknown_file',
            cache_policy: 'auto',
            cachePolicy: 'auto',
            is_deleted: false,
            created_at: now,
            createdAt: now
        };
    }

    item.cache_status = status;
    item.cacheStatus = status;
    item.cache_attempts = extra.cache_attempts ?? item.cache_attempts ?? item.cacheAttempts ?? 0;
    item.cacheAttempts = item.cache_attempts;
    item.last_cache_error = extra.last_cache_error ?? item.last_cache_error ?? '';
    item.lastCacheError = item.last_cache_error;
    item.next_cache_retry_at = extra.next_cache_retry_at ?? item.next_cache_retry_at ?? null;
    item.nextCacheRetryAt = item.next_cache_retry_at;
    item.updated_at = now;
    item.updatedAt = now;

    if (extra.size_bytes > 0) {
        item.size_bytes = extra.size_bytes;
        item.sizeBytes = extra.size_bytes;
    }

    await dbPut(STORES.FILE_REGISTRY, item);
    if (sm && typeof sm._indexRegistryItem === 'function') {
        sm._indexRegistryItem(item);
    } else if (index) {
        index.set(url, item);
    }
}

function rbiIsPermanentCloudMissError(err) {
    const s = String(err && err.message != null ? err.message : err || '').toLowerCase();
    return s.includes('недоступен')
        || s.includes('not_found')
        || s.includes('object not found')
        || s.includes('404')
        || s.includes('statuscode":"404"')
        || s.includes('statuscode":404');
}

async function rbiDownloadFileWithRetry(url, maxAttempts = 3) {
    if (!url || !String(url).startsWith('http')) {
        return { status: 'skipped', bytes: 0, fetched: false };
    }
    if (typeof window.rbiIsOfflineCacheableUrl === 'function' && !window.rbiIsOfflineCacheableUrl(url)) {
        return { status: 'skipped', bytes: 0, fetched: false };
    }

    const nowMs = Date.now();
    const sm = window.RbiStorageManager;
    const index = sm && typeof sm.ensureFileRegistryIndex === 'function'
        ? await sm.ensureFileRegistryIndex()
        : null;
    const item = index ? index.get(url) : null;

    const prevStatus = item?.cache_status || item?.cacheStatus || '';
    const prevErr = item?.last_cache_error || item?.lastCacheError || '';
    // Битый Storage-объект: не долбим сеть каждые N минут / при полном кэше.
    if (prevStatus === 'failed' && rbiIsPermanentCloudMissError(prevErr)) {
        const retryAtPerm = item?.next_cache_retry_at || item?.nextCacheRetryAt;
        if (!retryAtPerm || new Date(retryAtPerm).getTime() > nowMs) {
            return { status: 'postponed', bytes: 0, fetched: false };
        }
        // Окно истекло — один probe ниже (maxAttempts принудительно 1).
        maxAttempts = 1;
    }

    const retryAt = item?.next_cache_retry_at || item?.nextCacheRetryAt;
    if (retryAt && new Date(retryAt).getTime() > nowMs) {
        return { status: 'postponed', bytes: 0, fetched: false };
    }

    let attempts = item?.cache_attempts || item?.cacheAttempts || 0;
    if (prevStatus === 'failed' && attempts >= maxAttempts && !rbiIsPermanentCloudMissError(prevErr)) {
        // Исчерпаны обычные ретраи, ждём next_cache_retry_at (уже проверен выше).
        return { status: 'failed', bytes: 0, fetched: false };
    }

    // Уже в IDB — сразу skip без записей в FILE_REGISTRY (массовый автокэш).
    try {
        let quick = await dbGet(STORES.PHOTOS, url);
        if (!(quick && quick.data) && item) {
            const lk = item.local_key || item.localKey;
            if (lk && lk !== url) quick = await dbGet(STORES.PHOTOS, lk);
        }
        if (quick && quick.data) {
            const b = quick.size_bytes || quick.sizeBytes || quick.data.byteLength || 0;
            return { status: 'already', bytes: b, fetched: false };
        }
    } catch (_) { /* дальше обычный download */ }

    for (let i = attempts; i < maxAttempts; i++) {
        try {
            await rbiUpsertFileCacheQueueItem(url, 'pending', {
                cache_attempts: i + 1,
                last_cache_error: ''
            });

            const dl = (typeof window.rbiIsCloudPdfUrl === 'function' && window.rbiIsCloudPdfUrl(url)
                && typeof window.rbiCacheCloudPdf === 'function')
                ? await window.rbiCacheCloudPdf(url, { skipMemoryCache: true })
                : await PhotoManager.downloadForOffline(url, { skipMemoryCache: true });
            const fetched = !!(dl && dl.fetched);
            const bytes = (dl && dl.bytes) || 0;

            // Уже было в IDB — без повторной записи реестра.
            if (dl && dl.ok && !fetched) {
                return { status: 'already', bytes, fetched: false };
            }

            if (dl && dl.ok && fetched && bytes > 0) {
                await rbiUpsertFileCacheQueueItem(url, 'cached_cloud', {
                    cache_attempts: i + 1,
                    last_cache_error: '',
                    next_cache_retry_at: null,
                    size_bytes: bytes
                });
                return { status: 'cached', bytes, fetched: true };
            }

            // Fallback: проверить IDB (на случай старого downloadForOffline без return).
            const cached = await dbGet(STORES.PHOTOS, url);
            if (cached && cached.data) {
                const b = cached.size_bytes || cached.sizeBytes || cached.data.byteLength || 0;
                return { status: 'already', bytes: b, fetched: false };
            }

            throw new Error('Файл не сохранился в IndexedDB');

        } catch (e) {
            // 404 / Object not found — сразу failed + длинный backoff (7 суток).
            if (rbiIsPermanentCloudMissError(e)) {
                const nextRetry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                await rbiUpsertFileCacheQueueItem(url, 'failed', {
                    cache_attempts: maxAttempts,
                    last_cache_error: e.message || String(e),
                    next_cache_retry_at: nextRetry
                });
                return { status: 'failed', bytes: 0, fetched: false };
            }

            const delayMin = i === 0 ? 2 : i === 1 ? 10 : 60;
            const nextRetry = new Date(Date.now() + delayMin * 60 * 1000).toISOString();

            await rbiUpsertFileCacheQueueItem(url, i + 1 >= maxAttempts ? 'failed' : 'pending', {
                cache_attempts: i + 1,
                last_cache_error: e.message || String(e),
                next_cache_retry_at: nextRetry
            });

            if (i + 1 >= maxAttempts) {
                return { status: 'failed', bytes: 0, fetched: false };
            }
        }
    }

    return { status: 'failed', bytes: 0, fetched: false };
}

window.rbiFileCacheQueueLock = false;

/**
 * Докачка облачных файлов в IDB.
 * @param {boolean} silent — не показывать toast «уже выполняется»; прогресс в mini-toast всё равно виден
 * @param {'all'|'days30'|'knowledge'|'reports'} scope
 */
window.downloadMissingCloudFiles = async function (silent = false, scope = 'all') {
    if (window.rbiFileCacheQueueLock) {
        if (!silent && typeof showToast === 'function') showToast('⏳ Докачка файлов уже выполняется');
        return;
    }

    window.rbiFileCacheQueueLock = true;
    if (typeof window.rbiBeginOfflineCacheSyncPause === 'function') {
        window.rbiBeginOfflineCacheSyncPause('downloadMissingCloudFiles:' + (scope || 'all'));
    }

    // Не перекрывать тост синхронизации (ручная / 1-я полная).
    if (!silent && window.rbiSyncProgress && typeof window.rbiSyncProgress.whenHidden === 'function') {
        try {
            await window.rbiSyncProgress.whenHidden(9000);
        } catch (_) { /* ignore */ }
    }

    const resolvedScope = scope || 'all';
    const concurrency = window.RBI_OFFLINE_CACHE_CONCURRENCY || 4;
    const batchPauseMs = window.RBI_OFFLINE_CACHE_BATCH_PAUSE_MS ?? 60;

    let miniCacheToast = document.getElementById('mini-cache-toast');
    const toastNeedsRebuild = !miniCacheToast || !miniCacheToast.querySelector('#mini-cache-toast-dl');

    if (toastNeedsRebuild) {
        if (miniCacheToast) miniCacheToast.remove();
        miniCacheToast = document.createElement('div');
        miniCacheToast.id = 'mini-cache-toast';
        // Фиксированная ширина + tabular-nums — тост не прыгает при смене цифр.
        miniCacheToast.className = 'fixed left-1/2 bottom-24 z-[9000] w-[280px] bg-slate-900/95 text-white rounded-2xl shadow-xl px-4 py-3 text-[11px] font-bold hidden border border-white/10 backdrop-blur-md -translate-x-1/2';
        miniCacheToast.innerHTML = `
            <div class="flex items-center gap-2 mb-1.5">
                <span id="mini-cache-toast-spin" class="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin shrink-0"></span>
                <span id="mini-cache-toast-status" class="flex-1 truncate tracking-wide uppercase text-[10px] text-white/80">Кэширование</span>
                <span id="mini-cache-toast-count" class="tabular-nums shrink-0 text-white">— / —</span>
            </div>
            <div id="mini-cache-toast-body">
                <div class="h-1.5 w-full rounded-full bg-white/15 overflow-hidden mb-2">
                    <div id="mini-cache-toast-bar" class="h-full bg-indigo-400 rounded-full transition-[width] duration-200" style="width:0%"></div>
                </div>
                <div class="flex justify-between gap-2 tabular-nums text-[10px] text-white/75 font-semibold">
                    <span>скачано <span id="mini-cache-toast-dl" class="text-white">0.0</span> МБ</span>
                    <span>ост. ~<span id="mini-cache-toast-left" class="text-white">0.0</span> МБ</span>
                </div>
            </div>
        `;
        document.body.appendChild(miniCacheToast);
    }

    const applyProgress = typeof window.rbiApplyCacheProgressToDom === 'function'
        ? window.rbiApplyCacheProgressToDom
        : null;

    const setProgress = (payload) => {
        miniCacheToast.classList.remove('hidden');
        if (applyProgress) {
            applyProgress(miniCacheToast, payload);
            return;
        }
        const statusEl = miniCacheToast.querySelector('#mini-cache-toast-status');
        if (statusEl && typeof window.rbiFormatCacheProgress === 'function') {
            statusEl.textContent = window.rbiFormatCacheProgress(payload);
        }
    };

    try {
        setProgress({ phase: 'prepare', done: 0, total: 0, downloadedBytes: 0, remainingBytes: 0 });

        if (window.RbiStorageManager && typeof window.RbiStorageManager.ensureFileRegistryIndex === 'function') {
            await window.RbiStorageManager.ensureFileRegistryIndex(true);
        }
        const registryByUrl = (window.RbiStorageManager && window.RbiStorageManager._registryByUrl)
            ? window.RbiStorageManager._registryByUrl
            : new Map();

        const collect = typeof window.rbiCollectOfflineCacheUrls === 'function'
            ? window.rbiCollectOfflineCacheUrls
            : () => [];
        const entries = collect(resolvedScope) || [];

        // Планы СК (floors / floors_v2 / units_v2) — добираем из IDB (RAM ConstManager уже в collect).
        if ((resolvedScope === 'all' || !resolvedScope) && typeof window.rbiCollectConstructionPlanPdfUrls === 'function') {
            try {
                const planEntries = await window.rbiCollectConstructionPlanPdfUrls();
                const seen = new Set(entries.map((e) => e && e.url).filter(Boolean));
                (planEntries || []).forEach((e) => {
                    if (!e || !e.url || seen.has(e.url)) return;
                    seen.add(e.url);
                    entries.push(e);
                });
            } catch (e) {
                console.warn('[Cache] collect construction plans failed', e);
            }
        }

        const urlArray = entries.map((e) => e.url);
        const kindByUrl = new Map();
        entries.forEach((e) => {
            if (e && e.url) kindByUrl.set(e.url, e.kind || 'file');
        });
        const total = urlArray.length;

        let downloadedCount = 0;
        let alreadyCachedCount = 0;
        let failedCount = 0;
        let downloadedBytes = 0;
        // Сколько байт уже «закрыто» по оценке очереди (скачано + skip + fail).
        let settledEstimateBytes = 0;
        // Для уточнения дефолтной оценки неизвестных файлов.
        let knownBytesSum = 0;
        let knownBytesN = 0;

        const estimateBytes = typeof window.rbiEstimateUrlBytes === 'function'
            ? window.rbiEstimateUrlBytes
            : () => (window.RBI_OFFLINE_CACHE_DEFAULT_FILE_BYTES || 200 * 1024);

        const avgKnown = () => (knownBytesN > 0 ? (knownBytesSum / knownBytesN) : 0);
        const est = (url) => estimateBytes(url, registryByUrl, avgKnown());

        // Плановый размер каждого URL фиксируем на старте — иначе «осталось» плывёт
        // после появления среднего avg по уже скачанным.
        const plannedByUrl = new Map();
        urlArray.forEach((url) => plannedByUrl.set(url, est(url)));
        let totalEstimateBytes = 0;
        plannedByUrl.forEach((v) => { totalEstimateBytes += v; });

        if (total === 0) {
            setProgress({ phase: 'empty', done: 0, total: 0, downloadedBytes: 0, remainingBytes: 0 });
            setTimeout(() => miniCacheToast.classList.add('hidden'), 1800);
            return;
        }

        const noteKnownSize = (bytes) => {
            const b = Number(bytes) || 0;
            if (b <= 0) return;
            knownBytesSum += b;
            knownBytesN += 1;
        };

        const settleUrl = (url, actualBytes) => {
            const planned = plannedByUrl.get(url) || est(url);
            settledEstimateBytes += planned;
            const actual = Number(actualBytes) || 0;
            if (actual > 0) {
                // Уточняем общий прогноз: факт вместо плана.
                totalEstimateBytes += (actual - planned);
                noteKnownSize(actual);
            }
        };

        const updateUi = () => {
            const done = downloadedCount + alreadyCachedCount;
            const remainingBytes = Math.max(0, totalEstimateBytes - settledEstimateBytes);
            setProgress({
                done,
                total,
                downloadedBytes,
                remainingBytes,
                fetchedCount: downloadedCount,
                skippedCount: alreadyCachedCount
            });
        };

        updateUi();

        // Один раз URL → отчёт (без reportsArray.find на каждый файл).
        const reportByUrl = new Map();
        if (typeof reportsArray !== 'undefined' && Array.isArray(reportsArray)) {
            reportsArray.forEach((r) => {
                if (!r) return;
                const u = r.file_url || r.fileUrl;
                if (u && typeof u === 'string') reportByUrl.set(u, r);
            });
        }

        for (let i = 0; i < total; i += concurrency) {
            const batch = urlArray.slice(i, i + concurrency);

            const promises = batch.map(async (url) => {
                try {
                    const entryKind = kindByUrl.get(url) || '';
                    const repObj = reportByUrl.get(url) || null;
                    // Не только path /reports/ — kind из collect + map reportsArray.
                    const isReportFile = entryKind === 'report_pdf'
                        || !!repObj
                        || (typeof url === 'string' && (
                            url.includes('/object/public/reports/')
                            || url.includes('/storage/v1/object/public/reports/')
                            || /\/reports\/[^/?#]+\.(pdf|pptx)(\?|$)/i.test(url)
                        ));

                    if (isReportFile) {
                        if (!repObj) {
                            // Нет мета в RAM — качаем в PHOTOS (openReport 1c / нет строки REPORTS).
                            const result = await rbiDownloadFileWithRetry(url, 3);
                            if (result.status === 'cached' && result.fetched) {
                                downloadedCount++;
                                downloadedBytes += result.bytes || 0;
                                settleUrl(url, result.bytes || 0);
                            } else if (result.status === 'already' || result.status === 'cached'
                                || result.status === 'postponed' || result.status === 'skipped') {
                                alreadyCachedCount++;
                                settleUrl(url, result.bytes || plannedByUrl.get(url) || 0);
                            } else {
                                failedCount++;
                                settleUrl(url, 0);
                            }
                            return;
                        }

                        // Уже в RAM (локальный не залитый) — skip.
                        if (typeof window.rbiHasReportPayload === 'function'
                            ? window.rbiHasReportPayload(repObj.file_blob)
                            : !!repObj.file_blob) {
                            alreadyCachedCount++;
                            const sz = (typeof window.rbiReportPayloadBytes === 'function'
                                ? window.rbiReportPayloadBytes(repObj.file_blob)
                                : (repObj.file_blob.size || 0)) || plannedByUrl.get(url) || 0;
                            settleUrl(url, sz);
                            return;
                        }

                        // Только реальное наличие payload в IDB. Мета cache_status
                        // часто врёт (sync/eviction) — из‑за этого UI «закэшировано»,
                        // а openReport не находит локальный PDF.
                        let idbRow = null;
                        try {
                            idbRow = await dbGet(STORES.REPORTS, repObj.id);
                        } catch (_) { /* ignore */ }

                        if (idbRow && (typeof window.rbiHasReportPayload === 'function'
                            ? window.rbiHasReportPayload(idbRow.file_blob)
                            : !!idbRow.file_blob)) {
                            alreadyCachedCount++;
                            const sz = (typeof window.rbiReportPayloadBytes === 'function'
                                ? window.rbiReportPayloadBytes(idbRow.file_blob)
                                : 0)
                                || idbRow.file_size
                                || plannedByUrl.get(url)
                                || 0;
                            repObj.file_size = sz;
                            repObj.cache_status = 'cached_cloud';
                            repObj.cacheStatus = 'cached_cloud';
                            // Не копируем blob в reportsArray.
                            settleUrl(url, sz);
                            return;
                        }

                        // Мета врала — чиним статус до скачивания.
                        if ((repObj.cache_status || repObj.cacheStatus) === 'cached_cloud') {
                            repObj.cache_status = 'cloud_only';
                            repObj.cacheStatus = 'cloud_only';
                        }

                        const res = await rbiFetchCloudFileNoBrowserCache(url);

                        if (res.ok) {
                            const reportBlob = await res.blob();
                            const reportBuffer = (typeof blobToArrayBuffer === 'function')
                                ? await blobToArrayBuffer(reportBlob)
                                : null;
                            const payload = reportBuffer || reportBlob;
                            const payloadBytes = (typeof window.rbiReportPayloadBytes === 'function')
                                ? window.rbiReportPayloadBytes(payload)
                                : (reportBlob.size || 0);
                            const now = new Date().toISOString();
                            const mime = reportBlob.type || 'application/pdf';

                            // IDB — ArrayBuffer (iOS-safe); память — только метаданные.
                            const idbRecord = {
                                ...(idbRow || repObj),
                                ...repObj,
                                file_blob: payload,
                                file_size: payloadBytes,
                                mime_type: mime,
                                mimeType: mime,
                                cache_status: 'cached_cloud',
                                cacheStatus: 'cached_cloud',
                                updatedAt: now,
                                updated_at: now
                            };
                            await dbPut(STORES.REPORTS, idbRecord);
                            // Без зеркала в PHOTOS: источник истины — app_reports.
                            // openReport 1c по PHOTOS оставлен для старых копий, новые не дублируем.

                            repObj.file_blob = null;
                            repObj.file_size = payloadBytes;
                            repObj.cache_status = 'cached_cloud';
                            repObj.cacheStatus = 'cached_cloud';
                            repObj.updatedAt = now;
                            repObj.updated_at = now;

                            if (window.RbiStorageManager && typeof window.RbiStorageManager.markCloudFileCached === 'function') {
                                await window.RbiStorageManager.markCloudFileCached(
                                    url,
                                    payloadBytes,
                                    mime
                                );
                            }

                            downloadedCount++;
                            downloadedBytes += payloadBytes;
                            settleUrl(url, payloadBytes);
                        } else {
                            failedCount++;
                            settleUrl(url, 0);
                        }

                        return;
                    }

                    // Skip только если blob реально на устройстве (RAM или IDB-ключ).
                    // cache_status в registry сам по себе не считается доказательством
                    // (после eviction/sync флаг часто врёт → раньше «Скачать всё» мгновенно
                    // пропускало дыры).
                    if (PhotoManager.cache[url]) {
                        alreadyCachedCount++;
                        settleUrl(url, plannedByUrl.get(url) || 0);
                        return;
                    }

                    if (url.startsWith('cloud://')) {
                        alreadyCachedCount++;
                        settleUrl(url, 0);
                        return;
                    }

                    const hasKey = typeof window.dbHasKey === 'function'
                        ? (key) => window.dbHasKey(STORES.PHOTOS, key)
                        : async (key) => !!(await dbGet(STORES.PHOTOS, key))?.data;

                    let hasIdbBlob = await hasKey(url);
                    if (!hasIdbBlob) {
                        const regItem = registryByUrl.get(url);
                        const lk = regItem && (regItem.local_key || regItem.localKey);
                        if (lk && lk !== url) hasIdbBlob = await hasKey(lk);
                    }
                    if (hasIdbBlob) {
                        alreadyCachedCount++;
                        settleUrl(url, plannedByUrl.get(url) || 0);
                        return;
                    }

                    const result = await rbiDownloadFileWithRetry(url, 3);

                    if (result.status === 'cached' && result.fetched) {
                        // Реально ушло в сеть в этом прогоне.
                        downloadedCount++;
                        downloadedBytes += result.bytes || 0;
                        settleUrl(url, result.bytes || 0);
                    } else if (result.status === 'already' || result.status === 'cached') {
                        // Уже было в IDB / registry — не в «скачано».
                        alreadyCachedCount++;
                        settleUrl(url, result.bytes || plannedByUrl.get(url) || 0);
                    } else if (result.status === 'postponed' || result.status === 'skipped') {
                        alreadyCachedCount++;
                        settleUrl(url, plannedByUrl.get(url) || 0);
                    } else {
                        failedCount++;
                        settleUrl(url, 0);
                    }

                } catch (e) {
                    failedCount++;
                    settleUrl(url, 0);
                    console.warn('[Cache] Пропущен файл:', String(url).substring(0, 80), e);
                }
            });

            await Promise.all(promises);
            updateUi();

            if (i + concurrency < total && batchPauseMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, batchPauseMs));
            }
        }

        const done = downloadedCount + alreadyCachedCount;
        if (failedCount > 0) {
            setProgress({
                phase: 'done_fail',
                done: downloadedCount,
                total: done,
                downloadedBytes,
                remainingBytes: 0,
                fetchedCount: downloadedCount,
                skippedCount: alreadyCachedCount
            });
        } else if (downloadedCount > 0) {
            setProgress({
                phase: 'done_ok',
                done: downloadedCount,
                total: done,
                downloadedBytes,
                remainingBytes: 0,
                fetchedCount: downloadedCount,
                skippedCount: alreadyCachedCount
            });
        } else {
            setProgress({
                phase: 'done_skip',
                done,
                total,
                downloadedBytes,
                remainingBytes: 0,
                fetchedCount: 0,
                skippedCount: alreadyCachedCount
            });
        }

        setTimeout(() => miniCacheToast.classList.add('hidden'), 3000);

    } finally {
        window.rbiFileCacheQueueLock = false;

        if (typeof updateStorageInfo === 'function') {
            updateStorageInfo();
        }

        // Снять паузу sync (если снаружи ещё держится FullOfflineCacheProcessing — flush позже).
        if (typeof window.rbiEndOfflineCacheSyncPause === 'function') {
            window.rbiEndOfflineCacheSyncPause();
        }
    }
};


// Окончательное удаление файлов из корзины (Hard Delete)
// Глубокая очистка устройства (Удаление скрытых записей и осиротевших файлов)
window.emptyTrashBin = async function () {
    if (!confirm("Выполнить глубокую очистку памяти устройства?\n\nБудут окончательно удалены все скрытые записи и «осиротевшие» системные файлы (фото, PDF), которые больше нигде не используются.")) return;

    showToast("⏳ Начинаем глубокое сканирование памяти...");

    let deletedRecords = 0;
    let deletedFiles = 0;
    let freedBytes = 0;

    try {
        // 1. ОЧИСТКА МЯГКО УДАЛЕННЫХ ЗАПИСЕЙ ВО ВСЕХ БАЗАХ
        const storesToClean = [
            STORES.HISTORY, STORES.ETALON_ACTS, STORES.TASKS, STORES.MEETINGS,
            STORES.PRACTICES, STORES.INTERVENTIONS, STORES.FMEA, STORES.SK_RECORDS,
            STORES.TEMPLATES
        ];

        for (let store of storesToClean) {
            const items = await dbGetAll(store);
            if (items) {
                for (let item of items) {
                    const isDel = item._deleted || (item.data && item.data._deleted);
                    if (isDel) {
                        const key = item.id || item.slug;
                        if (key) {
                            await dbDelete(store, key);
                            deletedRecords++;
                        }
                    }
                }
            }
        }

        // 2. СБОР ВСЕХ ЖИВЫХ (ИСПОЛЬЗУЕМЫХ) ССЫЛОК НА ФАЙЛЫ
        const usedFiles = new Set();

        // Рекурсивный сканер: лезет вглубь любого объекта и ищет ссылки
        const extractFiles = (obj) => {
            if (!obj) return;
            if (typeof obj === 'string') {
                if (obj.startsWith('local://') || obj.startsWith('http')) usedFiles.add(obj);
            } else if (typeof obj === 'object') {
                Object.values(obj).forEach(extractFiles);
            }
        };

        // Сканируем все живые записи в базе
        const allStores = [STORES.HISTORY, STORES.ETALON_ACTS, STORES.TASKS, STORES.MEETINGS, STORES.PRACTICES, STORES.FMEA];
        for (let store of allStores) {
            const items = await dbGetAll(store);
            if (items) items.forEach(extractFiles);
        }

        // P2-0023: фото черновика текущей проверки ещё не в истории — не мусор.
        if (typeof PhotoManager !== 'undefined' && typeof PhotoManager.collectDraftPhotoRefs === 'function') {
            (await PhotoManager.collectDraftPhotoRefs()).forEach((r) => usedFiles.add(r));
        }

        // Сканируем системные справочники из памяти (TWI, Узлы, Нормативы)
        if (typeof customTwiCards !== 'undefined') extractFiles(customTwiCards);
        if (typeof customNodes !== 'undefined') extractFiles(customNodes);
        if (typeof customDocs !== 'undefined') extractFiles(customDocs);

        // 3. УДАЛЕНИЕ МУСОРНЫХ ФАЙЛОВ ИЗ ХРАНИЛИЩА ФОТО/PDF
        // Лёгкие дескрипторы (только id) — dbDelete идёт после закрытия курсора,
        // см. предупреждение в dbForEachCursor (storage-db.core.js).
        const photoIdsToDelete = [];

        await dbForEachCursor(STORES.PHOTOS, (p) => {
            if (!p || !p.id) return;
            // Если файл лежит в базе, но ссылка на него не найдена ни в одной карточке
            if (!usedFiles.has(p.id)) {
                if (p.data && p.data.byteLength) freedBytes += p.data.byteLength;
                photoIdsToDelete.push(p.id);
            }
        });

        for (const photoId of photoIdsToDelete) {
            await dbDelete(STORES.PHOTOS, photoId);

            // Выгружаем из кэша браузера, если он там застрял
            if (PhotoManager.cache && PhotoManager.cache[photoId]) {
                URL.revokeObjectURL(PhotoManager.cache[photoId]);
                delete PhotoManager.cache[photoId];
            }
            deletedFiles++;
        }

        // 4. ИТОГИ
        const freedMB = (freedBytes / 1024 / 1024).toFixed(1);
        showToast(`✅ Готово! Очищено записей: ${deletedRecords}. Удалено мусорных файлов: ${deletedFiles}. Освобождено: ${freedMB} МБ.`);

        if (typeof updateStorageInfo === 'function') updateStorageInfo();

        // --- НОВОЕ: Сбрасываем оперативную память ---
        // Иначе удаленные из IndexedDB записи останутся висеть на экране 
        // и при синхронизации снова запишутся в базу!
        if (deletedRecords > 0 || deletedFiles > 0) {
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        }

    } catch (e) {
        console.error("Ошибка при очистке мусора:", e);
        showToast("❌ Ошибка при очистке памяти");
    }
};
