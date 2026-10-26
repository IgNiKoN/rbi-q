/* Файл: js/services/storage/storage-cache-manager.js — перенесено из js/storage.js без изменения логики */
// =====================================================
// RBI NEW: Адаптивный менеджер файлового кэша
// Управляет только локальными копиями файлов в IndexedDB.
// НЕ удаляет записи проверок, TWI, документы и файлы из Supabase Storage.
// =====================================================

window.RbiStorageManager = {
    cleanupLock: false,

    /** Размер payload: ArrayBuffer / Blob / meta (берём максимум — meta часто устаревшая). */
    payloadBytes(data, meta) {
        let fromData = 0;
        if (data) {
            if (typeof data.byteLength === 'number') fromData = data.byteLength;
            else if (typeof data.size === 'number') fromData = data.size;
            else if (typeof data === 'string') {
                if (data.startsWith('data:')) {
                    const b64 = data.split(',')[1] || '';
                    fromData = Math.floor(b64.length * 0.75);
                } else {
                    fromData = data.length;
                }
            }
        }
        const metaSize = meta
            ? Number(meta.sizeBytes || meta.size_bytes || meta.file_size || 0) || 0
            : 0;
        return Math.max(fromData, metaSize > 0 ? metaSize : 0);
    },

    /**
     * Возраст файла для TTL/очистки.
     * last_accessed — только реальное использование; не путать с датой кэша
     * (markCloudFileCached/backfill раньше ставили access=now и ломали автоочистку).
     */
    fileIdleAgeDays(file, reg, now = Date.now()) {
        const accessRaw =
            file?.lastAccessedAt ||
            file?.last_accessed_at ||
            null;
        const regAccessRaw = reg?.last_accessed_at || reg?.lastAccessedAt || null;
        const cacheRaw =
            file?.cachedAt ||
            file?.cached_at ||
            reg?.last_local_cached_at ||
            reg?.lastLocalCachedAt ||
            file?.createdAt ||
            file?.created_at ||
            reg?.uploaded_at ||
            reg?.uploadedAt ||
            null;

        const accessTime = accessRaw ? new Date(accessRaw).getTime() : 0;
        let regAccessTime = regAccessRaw ? new Date(regAccessRaw).getTime() : 0;
        const cacheTime = cacheRaw ? new Date(cacheRaw).getTime() : 0;

        // Backfill часто пишет last_accessed_at === last_local_cached_at === now — это не доступ
        if (regAccessTime && cacheTime && Math.abs(regAccessTime - cacheTime) < 120000) {
            regAccessTime = 0;
        }

        const idleTime = accessTime || regAccessTime || cacheTime || 0;
        if (!idleTime || Number.isNaN(idleTime)) return 9999;
        return Math.max(0, (now - idleTime) / 86400000);
    },

    async logEvent(type, payload = {}) {
        try {
            if (!STORES.STORAGE_EVENTS || typeof dbPut !== 'function') return;

            const event = {
                id: 'storage_event_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 10000),
                type,
                ...payload,
                createdAt: new Date().toISOString(),
                created_at: new Date().toISOString()
            };

            await dbPut(STORES.STORAGE_EVENTS, event);
        } catch (e) {
            console.warn('[StorageManager] Не удалось записать событие:', e);
        }
    },

    /**
     * Снимок квоты/режима очистки.
     * По умолчанию — лёгкий путь: estimate + сумма size_bytes из FILE_REGISTRY
     * (без dbGetAll(PHOTOS) — иначе автокэш поднимает все blob в RAM).
     * Полный обход PHOTOS/REPORTS — только `{ detailed: true }` (диагностика UI).
     */
    async getStorageSnapshot(options = {}) {
        const opts = (options === true) ? { detailed: true } : (options || {});
        const detailed = opts.detailed === true;

        if (!navigator.storage || !navigator.storage.estimate) {
            return {
                supported: false,
                usageBytes: 0,
                quotaBytes: 0,
                freeBytes: 0,
                usedMB: 0,
                quotaMB: 0,
                freeMB: 0,
                usagePercent: 0,
                mode: 'unknown',
                detailed: false
            };
        }

        const estimate = await navigator.storage.estimate();

        // estimate.usage — полный объём origin (как в DevTools). realBytes — только
        // полезная нагрузка файлов; нужен как нижняя граница, если estimate занижен.
        let realBytes = 0;
        try {
            if (detailed) {
                await dbForEachCursor(STORES.PHOTOS, (f) => {
                    if (!f || !f.data) return;
                    realBytes += this.payloadBytes(f.data, f);
                });
                if (STORES.REPORTS) {
                    await dbForEachCursor(STORES.REPORTS, (rep) => {
                        if (!rep || !rep.file_blob) return;
                        realBytes += this.payloadBytes(rep.file_blob, rep);
                    });
                }
            } else if (STORES.FILE_REGISTRY) {
                const registry = await dbGetAll(STORES.FILE_REGISTRY) || [];
                registry.forEach((r) => {
                    if (!r) return;
                    realBytes += Number(r.size_bytes || r.sizeBytes || 0) || 0;
                });
            }
        } catch (e) { /* ignore */ }

        const usageBytes = Math.max(realBytes, estimate.usage || 0);
        const quotaBytes = estimate.quota || 0;
        const freeBytes = Math.max(0, quotaBytes - usageBytes);

        const usedMB = usageBytes / 1024 / 1024;
        const quotaMB = quotaBytes / 1024 / 1024;
        const freeMB = freeBytes / 1024 / 1024;
        const usagePercent = quotaBytes > 0 ? (usageBytes / quotaBytes) * 100 : 0;

        let mode = 'keep_all';

        const settings = typeof appSettings !== 'undefined' ? appSettings : {};
        const keepAllFree = settings.storageKeepAllIfFreeMB || 2048;

        // Достаточно свободно — не трогаем кэш (настройка keep-all)
        if (freeMB >= keepAllFree && usagePercent < (settings.storageSoftThresholdPercent || 60)) {
            mode = 'keep_all';
        } else if (
            usagePercent >= (settings.storageCriticalThresholdPercent || 90) ||
            freeMB <= (settings.storageCriticalCleanupFreeMB || 250)
        ) {
            mode = 'critical_cleanup';
        } else if (
            usagePercent >= (settings.storageCleanupThresholdPercent || 80) ||
            freeMB <= (settings.storageNormalCleanupFreeMB || 500)
        ) {
            mode = 'normal_cleanup';
        } else if (
            usagePercent >= (settings.storageSoftThresholdPercent || 60) ||
            freeMB <= (settings.storageSoftCleanupFreeMB || 1000)
        ) {
            mode = 'soft_lifecycle';
        } else {
            mode = 'keep_all';
        }

        return {
            supported: true,
            usageBytes,
            quotaBytes,
            freeBytes,
            usedMB,
            quotaMB,
            freeMB,
            usagePercent,
            mode,
            detailed
        };
    },

    /** Индекс FILE_REGISTRY по URL — один dbGetAll на сессию автокэша, не на каждый файл. */
    _registryByUrl: null,

    invalidateFileRegistryIndex() {
        this._registryByUrl = null;
    },

    async ensureFileRegistryIndex(force = false) {
        if (this._registryByUrl && !force) return this._registryByUrl;
        const map = new Map();
        if (STORES.FILE_REGISTRY) {
            const all = await dbGetAll(STORES.FILE_REGISTRY) || [];
            all.forEach((f) => {
                if (!f) return;
                [f.public_url, f.publicUrl, f.local_key, f.localKey].forEach((k) => {
                    if (k) map.set(k, f);
                });
            });
        }
        this._registryByUrl = map;
        return map;
    },

    _indexRegistryItem(item) {
        if (!item || !this._registryByUrl) return;
        [item.public_url, item.publicUrl, item.local_key, item.localKey].forEach((k) => {
            if (k) this._registryByUrl.set(k, item);
        });
    },

    async getRecoverableCacheStats() {
        try {
            const registry = STORES.FILE_REGISTRY ? (await dbGetAll(STORES.FILE_REGISTRY) || []) : [];

            const registryByUrl = new Map();

            registry.forEach(r => {
                if (r.public_url) registryByUrl.set(r.public_url, r);
                if (r.publicUrl) registryByUrl.set(r.publicUrl, r);
                if (r.local_key) registryByUrl.set(r.local_key, r);
                if (r.localKey) registryByUrl.set(r.localKey, r);
            });

            let totalFiles = 0;
            let totalBytes = 0;

            let recoverableFiles = 0;
            let recoverableBytes = 0;

            let localOnlyFiles = 0;
            let localOnlyBytes = 0;

            let otherFiles = 0;
            let otherBytes = 0;

            let imageFiles = 0;
            let pdfFiles = 0;

            await dbForEachCursor(STORES.PHOTOS, (file) => {
                if (!file || !file.id || !file.data) return;

                totalFiles++;

                const id = String(file.id || '');

                const sizeBytes = this.payloadBytes(file.data, file);

                totalBytes += sizeBytes;

                const mime =
                    file.mimeType ||
                    file.mime_type ||
                    '';

                if (String(mime).includes('image')) imageFiles++;
                if (String(mime).includes('pdf')) pdfFiles++;

                const sourceUrl =
                    file.sourceUrl ||
                    file.source_url ||
                    file.public_url ||
                    file.publicUrl ||
                    '';

                const registryItem =
                    registryByUrl.get(id) ||
                    registryByUrl.get(sourceUrl) ||
                    null;

                const registryUrl =
                    registryItem?.public_url ||
                    registryItem?.publicUrl ||
                    '';

                const hasCloudSource =
                    id.startsWith('http') ||
                    String(sourceUrl).startsWith('http') ||
                    String(registryUrl).startsWith('http');

                const isLocalOnly =
                    id.startsWith('local://') &&
                    !hasCloudSource;

                if (hasCloudSource) {
                    recoverableFiles++;
                    recoverableBytes += sizeBytes;
                } else if (isLocalOnly) {
                    localOnlyFiles++;
                    localOnlyBytes += sizeBytes;
                } else {
                    otherFiles++;
                    otherBytes += sizeBytes;
                }
            });
            // RBI NEW: учитываем PDF-отчеты, которые хранятся не в app_photos, а в app_reports.file_blob
            await dbForEachCursor(STORES.REPORTS, (rep) => {
                if (!rep || !rep.file_blob) return;

                const reportSize = this.payloadBytes(rep.file_blob, rep);

                totalFiles++;
                totalBytes += reportSize;

                pdfFiles++;

                if (rep.file_url && String(rep.file_url).startsWith('http')) {
                    recoverableFiles++;
                    recoverableBytes += reportSize;
                } else {
                    otherFiles++;
                    otherBytes += reportSize;
                }
            });
            return {
                totalFiles,
                totalBytes,
                totalMB: totalBytes / 1024 / 1024,

                recoverableFiles,
                recoverableBytes,
                recoverableMB: recoverableBytes / 1024 / 1024,

                localOnlyFiles,
                localOnlyBytes,
                localOnlyMB: localOnlyBytes / 1024 / 1024,

                otherFiles,
                otherBytes,
                otherMB: otherBytes / 1024 / 1024,

                imageFiles,
                pdfFiles,

                lastCleanupAt: appSettings?.storageLastCleanupAt || null
            };

        } catch (e) {
            console.warn('[StorageManager] Не удалось посчитать статистику кэша:', e);
            return null;
        }
    },
    async requestPersistentStorageOnce() {
        try {
            if (!navigator.storage || !navigator.storage.persist || !navigator.storage.persisted) {
                return false;
            }

            if (typeof appSettings !== 'undefined' && appSettings.storagePersistentRequestedAt) {
                return !!appSettings.storagePersistentGranted;
            }

            const already = await navigator.storage.persisted();
            let granted = already;

            if (!already) {
                granted = await navigator.storage.persist();
            }

            if (typeof appSettings !== 'undefined') {
                appSettings.storagePersistentRequestedAt = new Date().toISOString();
                appSettings.storagePersistentGranted = granted === true;

                try {
                    await dbPut(STORES.SETTINGS, { key: 'user_prefs', ...appSettings });
                } catch (e) { }
            }

            return granted === true;
        } catch (e) {
            console.warn('[StorageManager] Persistent storage недоступен:', e);
            return false;
        }
    },

    guessEntityTypeByUrl(url) {
        const s = String(url || '').toLowerCase();

        if (s.includes('/reports/')) return 'report_pdf';
        if (s.includes('construction-plans') || s.includes('construction_plans')) return 'construction_plan_pdf';
        if (s.includes('etalon') || s.includes('library-etalons')) return 'etalon_file';
        if (s.includes('inspection') || s.includes('inspection-photos')) return 'inspection_photo';
        if (s.includes('twi')) return 'twi_photo';
        if (s.includes('node') || s.includes('library-nodes')) return 'node_file';
        if (s.includes('practice') || s.includes('library-practices')) return 'practice_file';
        if (s.includes('doc') || s.includes('library-docs')) return 'custom_doc_pdf';
        if (s.includes('assistant') || s.includes('kb')) return 'assistant_kb_file';

        return 'unknown_file';
    },

    getEvictionPriority(entityType, ageDays, sizeBytes) {
        let base = 0;

        if (entityType === 'report_pdf') {
            base += 1000;
        } else if (
            entityType === 'custom_doc_pdf' ||
            entityType === 'custom_doc_file' ||
            entityType === 'assistant_kb_file' ||
            entityType === 'knowledge_file'
        ) {
            base += 800;
        } else if (entityType === 'inspection_photo') {
            base += 700;
        } else if (entityType === 'practice_file') {
            base += 500;
        } else if (
            entityType === 'node_file' ||
            entityType === 'etalon_file'
        ) {
            base += 400;
        } else if (
            entityType === 'twi_file' ||
            entityType === 'twi_photo' ||
            entityType === 'twi_pdf'
        ) {
            base += 300;
        } else {
            base += 100;
        }

        base += Math.min(500, ageDays);
        base += Math.min(500, sizeBytes / 1024 / 1024);

        return base;
    },

    async upsertLocalFileRegistry(item) {
        if (!item || !item.id || !STORES.FILE_REGISTRY) return;

        const now = new Date().toISOString();

        const normalized = {
            ...item,
            updatedAt: now,
            updated_at: now
        };

        await dbPut(STORES.FILE_REGISTRY, normalized);
    },

    async syncFileRegistryFromCloud() {
        try {
            if (!window.supabaseClient || !window.syncConfig?.enabled || !STORES.FILE_REGISTRY) return 0;

            const pCode = window.syncConfig.projectCode || '';
            if (!pCode) return 0;

            // Постранично (как остальные pull) — без жёсткого limit(5000).
            const pullFn = typeof window.rbiPullAllRows === 'function'
                ? window.rbiPullAllRows
                : null;

            let data = [];
            if (pullFn) {
                data = await pullFn((from, to) => window.supabaseClient
                    .from('file_registry')
                    .select('*')
                    .eq('project_code', pCode)
                    .eq('is_deleted', false)
                    .order('id', { ascending: true })
                    .range(from, to), 500);
            } else {
                const res = await window.supabaseClient
                    .from('file_registry')
                    .select('*')
                    .eq('project_code', pCode)
                    .eq('is_deleted', false)
                    .order('id', { ascending: true })
                    .range(0, 499);
                if (res.error) throw res.error;
                data = res.data || [];
            }

            let count = 0;

            for (const row of data || []) {
                await dbPut(STORES.FILE_REGISTRY, {
                    ...row,
                    id: row.id,
                    cacheStatus: row.cache_status || row.cacheStatus || 'cloud_only',
                    cache_status: row.cache_status || row.cacheStatus || 'cloud_only',
                    publicUrl: row.public_url || row.publicUrl || '',
                    public_url: row.public_url || row.publicUrl || '',
                    storagePath: row.storage_path || row.storagePath || '',
                    storage_path: row.storage_path || row.storagePath || ''
                });

                count++;
            }

            return count;
        } catch (e) {
            console.warn('[StorageManager] Не удалось синхронизировать file_registry:', e);
            return 0;
        }
    },
    /** localStorage-ключ для guard'а backfillLocalFileRegistryCache — число записей PHOTOS
     *  на момент последнего успешного полного прохода (см. ниже). */
    _BACKFILL_PHOTOS_COUNT_KEY: 'rbi_file_registry_backfill_photos_count',

    async backfillLocalFileRegistryCache() {
        try {
            if (!STORES.FILE_REGISTRY || !STORES.PHOTOS) return 0;

            const currentPhotosCount = await dbCount(STORES.PHOTOS);
            const lastPhotosCountRaw = localStorage.getItem(this._BACKFILL_PHOTOS_COUNT_KEY);
            const lastPhotosCount = lastPhotosCountRaw !== null ? parseInt(lastPhotosCountRaw, 10) : NaN;

            if (Number.isFinite(lastPhotosCount) && lastPhotosCount === currentPhotosCount) {
                return 0;
            }

            const registry = await dbGetAll(STORES.FILE_REGISTRY) || [];

            const existingKeys = new Set();

            registry.forEach(r => {
                if (r.public_url) existingKeys.add(String(r.public_url));
                if (r.publicUrl) existingKeys.add(String(r.publicUrl));
                if (r.local_key) existingKeys.add(String(r.local_key));
                if (r.localKey) existingKeys.add(String(r.localKey));
            });

            const now = new Date().toISOString();

            // Лёгкие дескрипторы (без ссылки на file.data) — сама запись в
            // FILE_REGISTRY (dbPut) выполняется после закрытия курсора, см.
            // предупреждение в dbForEachCursor (storage-db.core.js).
            const toCreate = [];

            await dbForEachCursor(STORES.PHOTOS, (file) => {
                if (!file || !file.id || !file.data) return;

                const id = String(file.id || '');
                const sourceUrl =
                    file.sourceUrl ||
                    file.source_url ||
                    file.public_url ||
                    file.publicUrl ||
                    '';

                const publicUrl = id.startsWith('http')
                    ? id
                    : String(sourceUrl).startsWith('http')
                        ? sourceUrl
                        : '';

                const localKey = id;
                const lookupKey = publicUrl || localKey;

                if (!lookupKey || existingKeys.has(lookupKey)) return;

                const sizeBytes =
                    file.sizeBytes ||
                    file.size_bytes ||
                    file.data.byteLength ||
                    0;

                const mimeType =
                    file.mimeType ||
                    file.mime_type ||
                    'application/octet-stream';

                const entityType =
                    file.entityType ||
                    file.entity_type ||
                    this.guessEntityTypeByUrl(publicUrl || localKey);

                toCreate.push({
                    publicUrl,
                    localKey,
                    sizeBytes,
                    mimeType,
                    entityType,
                    entityId: file.entityId || file.entity_id || '',
                    fieldPath: file.fieldPath || file.field_path || '',
                    originalName: file.originalName || file.original_name || '',
                    uploadedBy: file.uploadedBy || file.uploaded_by || window.syncConfig?.engineerName || '',
                    createdAt: file.created_at || file.createdAt || now,
                    cachedAt: file.cached_at || file.cachedAt || file.created_at || file.createdAt || now,
                    lastAccessedAt: file.last_accessed_at || file.lastAccessedAt || file.cached_at || file.cachedAt || file.created_at || file.createdAt || now
                });

                existingKeys.add(lookupKey);
            });

            let createdCount = 0;

            for (const item of toCreate) {
                const isCloudBacked = !!item.publicUrl;

                await dbPut(STORES.FILE_REGISTRY, {
                    id: 'localreg_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 100000),

                    project_code: window.syncConfig?.projectCode || 'LOCAL',

                    entity_type: item.entityType,
                    entityType: item.entityType,

                    entity_id: item.entityId,
                    entityId: item.entityId,

                    field_path: item.fieldPath,
                    fieldPath: item.fieldPath,

                    bucket: '',
                    storage_path: '',
                    storagePath: '',

                    public_url: item.publicUrl,
                    publicUrl: item.publicUrl,

                    local_key: item.localKey,
                    localKey: item.localKey,

                    original_name: item.originalName,
                    originalName: item.originalName,

                    mime_type: item.mimeType,
                    mimeType: item.mimeType,

                    size_bytes: item.sizeBytes,
                    sizeBytes: item.sizeBytes,

                    uploaded_by: item.uploadedBy,
                    uploadedBy: item.uploadedBy,

                    uploaded_at: item.createdAt,
                    uploadedAt: item.createdAt,

                    cache_policy: 'auto',
                    cachePolicy: 'auto',

                    cache_status: isCloudBacked ? 'cached_cloud' : 'local_only',
                    cacheStatus: isCloudBacked ? 'cached_cloud' : 'local_only',

                    is_deleted: false,
                    isDeleted: false,

                    last_local_cached_at: item.cachedAt,
                    lastLocalCachedAt: item.cachedAt,

                    // access ≠ cache: не подставляем now, иначе файл «вечно свежий» для TTL
                    last_accessed_at: item.lastAccessedAt,
                    lastAccessedAt: item.lastAccessedAt,

                    last_local_cleanup_at: null,
                    lastLocalCleanupAt: null,

                    created_at: now,
                    createdAt: now,

                    updated_at: now,
                    updatedAt: now
                });

                createdCount++;
            }

            if (createdCount > 0) {
                await this.logEvent('local_file_registry_backfilled', {
                    createdCount
                });
            }

            try {
                localStorage.setItem(this._BACKFILL_PHOTOS_COUNT_KEY, String(currentPhotosCount));
            } catch (e) { /* ignore */ }

            return createdCount;

        } catch (e) {
            console.warn('[StorageManager] Не удалось выполнить backfill локального file_registry:', e);
            return 0;
        }
    },
    async registerUploadedFile(meta) {
        try {
            if (!meta || !meta.public_url || !meta.bucket || !meta.storage_path) {
                console.warn('[StorageManager] Недостаточно данных для регистрации файла:', meta);
                return null;
            }

            const pCode = meta.project_code || window.syncConfig?.projectCode || 'LOCAL';
            const now = new Date().toISOString();

            const payload = {
                project_code: pCode,

                entity_type: meta.entity_type || 'unknown_file',
                entity_id: meta.entity_id || '',
                field_path: meta.field_path || '',

                bucket: meta.bucket,
                storage_path: meta.storage_path,
                public_url: meta.public_url,

                original_name: meta.original_name || '',
                mime_type: meta.mime_type || '',
                size_bytes: meta.size_bytes || 0,

                uploaded_by: meta.uploaded_by || window.syncConfig?.engineerName || '',
                uploaded_at: meta.uploaded_at || now,

                cache_policy: meta.cache_policy || 'auto',
                cache_status: meta.cache_status || 'cached_cloud',

                is_deleted: false,

                last_accessed_at: meta.last_accessed_at || now,
                last_local_cached_at: meta.last_local_cached_at || now,
                last_local_cleanup_at: null,

                updated_at: now
            };

            let cloudRow = null;

            if (window.supabaseClient && window.syncConfig?.enabled) {
                const { data, error } = await window.supabaseClient
                    .from('file_registry')
                    .upsert(payload, { onConflict: 'bucket,storage_path' })
                    .select()
                    .single();

                if (error) {
                    console.error('[StorageManager] Ошибка записи file_registry:', error);
                    return null;
                }

                cloudRow = data;
                //console.log('[StorageManager] Файл зарегистрирован в file_registry:', cloudRow);
            }

            const localRow = {
                ...(cloudRow || payload),
                id: cloudRow?.id || meta.id || ('file_' + Date.now().toString(36)),
                cacheStatus: payload.cache_status,
                cache_status: payload.cache_status,
                publicUrl: payload.public_url,
                public_url: payload.public_url,
                storagePath: payload.storage_path,
                storage_path: payload.storage_path,
                updatedAt: now,
                updated_at: now
            };

            if (STORES.FILE_REGISTRY) {
                await dbPut(STORES.FILE_REGISTRY, localRow);
            }

            return localRow;
        } catch (e) {
            console.error('[StorageManager] Не удалось зарегистрировать файл:', e);
            return null;
        }
    },

    async updateAccessByUrl(url) {
        try {
            if (!url || !STORES.FILE_REGISTRY) return;

            const now = new Date().toISOString();
            const all = await dbGetAll(STORES.FILE_REGISTRY) || [];

            const found = all.find(f =>
                f.public_url === url ||
                f.publicUrl === url ||
                f.local_key === url ||
                f.localKey === url
            );

            if (found) {
                found.last_accessed_at = now;
                found.lastAccessedAt = now;
                found.updated_at = now;
                found.updatedAt = now;
                await dbPut(STORES.FILE_REGISTRY, found);
            }
        } catch (e) { }
    },

    async markCloudFileCached(url, sizeBytes = 0, mimeType = '') {
        try {
            if (!url || !STORES.FILE_REGISTRY) return;

            const now = new Date().toISOString();
            const index = await this.ensureFileRegistryIndex();
            const found = index.get(url);

            if (!found) return;

            found.cache_status = 'cached_cloud';
            found.cacheStatus = 'cached_cloud';

            // Не трогаем last_accessed — иначе автоочистка по TTL никогда не сработает
            found.last_local_cached_at = now;
            found.lastLocalCachedAt = now;

            found.updated_at = now;
            found.updatedAt = now;

            if (sizeBytes > 0) {
                found.size_bytes = sizeBytes;
                found.sizeBytes = sizeBytes;
            }

            if (mimeType) {
                found.mime_type = mimeType;
                found.mimeType = mimeType;
            }
            if ((!found.size_bytes || found.size_bytes <= 0 || !found.mime_type) && typeof this.updateRegistryFileSizeByUrl === 'function') {
                await this.updateRegistryFileSizeByUrl(url, sizeBytes, mimeType);
            }

            await dbPut(STORES.FILE_REGISTRY, found);
            this._indexRegistryItem(found);
        } catch (e) {
            console.warn('[StorageManager] Не удалось обновить статус кэша файла:', e);
        }
    },
    async updateRegistryFileSizeByUrl(url, sizeBytes = 0, mimeType = '') {
        try {
            if (!url || !STORES.FILE_REGISTRY) return false;

            const index = await this.ensureFileRegistryIndex();
            const found = index.get(url);

            if (!found) return false;

            const currentSize =
                found.size_bytes ||
                found.sizeBytes ||
                0;

            const currentMime =
                found.mime_type ||
                found.mimeType ||
                '';

            let nextSize = sizeBytes || currentSize || 0;
            let nextMime = mimeType || currentMime || '';

            // HEAD-запрос делаем только если это НЕ синхронизация (т.е. уже прошёл первый pull).
            // Во время первой синхронизации этот запрос блокирует поток на ~60 сек для каждого файла.
            // lastPullAt пустой при первой синхронизации.
            const isFirstSync = !localStorage.getItem('rbi_sync_last_pull_at');
            if ((!nextSize || nextSize <= 0) && navigator.onLine !== false && !isFirstSync) {
                try {
                    const res = await fetch(url, {
                        method: 'HEAD',
                        cache: 'no-store',
                        credentials: 'omit',
                        mode: 'cors'
                    });

                    if (res && res.ok) {
                        const len = parseInt(res.headers.get('content-length') || '0', 10);
                        const type = res.headers.get('content-type') || '';

                        if (len > 0) nextSize = len;
                        if (type) nextMime = type;
                    }
                } catch (e) { }
            }

            if (!nextSize && !nextMime) return false;

            const now = new Date().toISOString();

            found.size_bytes = nextSize || 0;
            found.sizeBytes = nextSize || 0;

            if (nextMime) {
                found.mime_type = nextMime;
                found.mimeType = nextMime;
            }

            found.updated_at = now;
            found.updatedAt = now;

            await dbPut(STORES.FILE_REGISTRY, found);
            this._indexRegistryItem(found);

            if (window.supabaseClient && window.syncConfig?.enabled && found.bucket && found.storage_path) {
                try {
                    await window.supabaseClient
                        .from('file_registry')
                        .update({
                            size_bytes: found.size_bytes,
                            mime_type: found.mime_type || '',
                            updated_at: now
                        })
                        .eq('bucket', found.bucket)
                        .eq('storage_path', found.storage_path);
                } catch (e) {
                    console.warn('[StorageManager] Не удалось обновить размер файла в Supabase:', e);
                }
            }

            return true;

        } catch (e) {
            console.warn('[StorageManager] Не удалось обновить размер файла:', e);
            return false;
        }
    },
    async collectEvictionCandidates(mode = 'normal_cleanup') {
        const registry = STORES.FILE_REGISTRY ? (await dbGetAll(STORES.FILE_REGISTRY) || []) : [];

        const registryByUrl = new Map();

        registry.forEach(r => {
            if (r.public_url) registryByUrl.set(r.public_url, r);
            if (r.publicUrl) registryByUrl.set(r.publicUrl, r);
            if (r.local_key) registryByUrl.set(r.local_key, r);
            if (r.localKey) registryByUrl.set(r.localKey, r);
        });

        const now = Date.now();
        const settings = typeof appSettings !== 'undefined' ? appSettings : {};
        const result = [];

        await dbForEachCursor(STORES.PHOTOS, (file) => {
            if (!file || !file.id || !file.data) return;

            const isHttp = String(file.id).startsWith('http');
            const reg = registryByUrl.get(file.id)
                || registryByUrl.get(file.sourceUrl || file.source_url || '')
                || registryByUrl.get(file.public_url || file.publicUrl || '')
                || null;

            const publicUrl =
                file.sourceUrl ||
                file.source_url ||
                file.public_url ||
                file.publicUrl ||
                reg?.public_url ||
                reg?.publicUrl ||
                (isHttp ? file.id : '');

            const hasCloud = publicUrl && String(publicUrl).startsWith('http');
            const isLocalOnly = String(file.id).startsWith('local://') && !hasCloud;

            if (isLocalOnly || !hasCloud) return;

            const entityType =
                file.entityType ||
                file.entity_type ||
                reg?.entity_type ||
                reg?.entityType ||
                this.guessEntityTypeByUrl(publicUrl);

            const ageDays = this.fileIdleAgeDays(file, reg, now);
            const sizeBytes = this.payloadBytes(file.data, file);

            let ttl = 60;

            if (entityType === 'inspection_photo') {
                ttl = settings.storageInspectionPhotoTtlDays || 60;
            } else if (
                entityType === 'assistant_kb_file' ||
                entityType === 'knowledge_file'
            ) {
                ttl = settings.storageKnowledgeFileTtlDays || 45;
            } else if (entityType === 'report_pdf') {
                ttl = settings.storageReportTtlDays || 30;
            } else if (
                entityType === 'twi_file' ||
                entityType === 'twi_photo' ||
                entityType === 'twi_pdf'
            ) {
                ttl = settings.storageTwiTtlDays || 90;
            } else if (entityType === 'node_file') {
                ttl = settings.storageNodeTtlDays || 90;
            } else if (entityType === 'etalon_file') {
                ttl = settings.storageNodeTtlDays || 90;
            } else if (entityType === 'practice_file') {
                ttl = settings.storagePracticeTtlDays || 60;
            } else if (
                entityType === 'custom_doc_pdf' ||
                entityType === 'custom_doc_file'
            ) {
                ttl = settings.storageDocTtlDays || 60;
            }

            const oldEnough = ageDays >= ttl;
            // RBI SAFETY: свежие файлы не удаляем, чтобы не ломать Offline-First после текущей работы
            const freshProtectionHours = 24;
            const isFreshFile = ageDays < (freshProtectionHours / 24);

            if (isFreshFile && mode !== 'critical_cleanup') {
                return;
            }

            // soft + normal — уважаем TTL из настроек; critical / quota — можно раньше
            if ((mode === 'soft_lifecycle' || mode === 'normal_cleanup') && !oldEnough) {
                return;
            }

            result.push({
                id: file.id,
                publicUrl,
                entityType,
                ageDays,
                sizeBytes,
                priority: this.getEvictionPriority(entityType, ageDays, sizeBytes),
                registry: reg
            });
        });

        result.sort((a, b) => b.priority - a.priority);

        return result;
    },
    async previewAdaptiveStorageCleanup(reason = 'manual_preview') {
        try {
            const snapshot = await this.getStorageSnapshot();

            let mode = snapshot.mode || 'keep_all';

            // Для ручного предпросмотра показываем, что можно очистить,
            // даже если памяти сейчас достаточно.
            if (reason === 'manual_preview' && mode === 'keep_all') {
                mode = 'normal_cleanup';
            }

            const candidates = await this.collectEvictionCandidates(mode);

            let totalBytes = 0;
            let inspectionPhotos = 0;
            let reports = 0;
            let docs = 0;
            let twi = 0;
            let nodes = 0;
            let practices = 0;
            let etalons = 0;
            let other = 0;

            candidates.forEach(c => {
                totalBytes += c.sizeBytes || 0;

                if (c.entityType === 'inspection_photo') {
                    inspectionPhotos++;
                } else if (c.entityType === 'report_pdf') {
                    reports++;
                } else if (
                    c.entityType === 'custom_doc_pdf' ||
                    c.entityType === 'custom_doc_file' ||
                    c.entityType === 'assistant_kb_file' ||
                    c.entityType === 'knowledge_file'
                ) {
                    docs++;
                } else if (
                    c.entityType === 'twi_file' ||
                    c.entityType === 'twi_photo' ||
                    c.entityType === 'twi_pdf'
                ) {
                    twi++;
                } else if (c.entityType === 'node_file') {
                    nodes++;
                } else if (c.entityType === 'practice_file') {
                    practices++;
                } else if (c.entityType === 'etalon_file') {
                    etalons++;
                } else {
                    other++;
                }
            });

            // PDF-отчёты из app_reports — с тем же TTL, что и автоочистка
            let reportCandidates = 0;
            try {
                const settings = typeof appSettings !== 'undefined' ? appSettings : {};
                const ttlDays = settings.storageReportTtlDays || 30;
                const now = Date.now();

                await dbForEachCursor(STORES.REPORTS, (rep) => {
                    if (!rep || !rep.file_blob || !rep.file_url || !String(rep.file_url).startsWith('http')) return;

                    const ageDays = this.fileIdleAgeDays(rep, null, now);

                    if (ageDays < 1 && mode !== 'critical_cleanup') return;
                    if ((mode === 'soft_lifecycle' || mode === 'normal_cleanup') && ageDays < ttlDays) return;

                    const reportSize = this.payloadBytes(rep.file_blob, rep);
                    totalBytes += reportSize;
                    reports++;
                    reportCandidates++;
                });
            } catch (e) {
                console.warn('[StorageManager] Не удалось учесть PDF-отчеты в предпросмотре:', e);
            }

            // Что снимет кнопка «Очистить кэш» (все облачные копии, без TTL)
            const recoverable = await this.getRecoverableCacheStats();

            return {
                reason,
                mode,
                usagePercent: snapshot.usagePercent || 0,
                usedMB: snapshot.usedMB || 0,
                freeMB: snapshot.freeMB || 0,
                candidatesCount: candidates.length + reportCandidates,
                totalBytes,
                totalMB: totalBytes / 1024 / 1024,
                inspectionPhotos,
                reports,
                docs,
                twi,
                nodes,
                practices,
                etalons,
                other,
                manualRecoverableFiles: recoverable?.recoverableFiles || 0,
                manualRecoverableMB: recoverable?.recoverableMB || 0,
                localOnlyFiles: recoverable?.localOnlyFiles || 0,
                localOnlyMB: recoverable?.localOnlyMB || 0
            };

        } catch (e) {
            console.error('[StorageManager] Ошибка предпросмотра очистки:', e);
            return {
                error: e.message || String(e)
            };
        }
    },
    /**
     * P2-0023: убрать тяжёлые данные фото с устройства. Для local:// запись не удаляется,
     * а становится псевдонимом на облачный адрес — иначе карточка с local:// не найдёт фото.
     */
    async _dropPhotoPayload(id, cloudUrl, rec) {
        const key = String(id || '');
        const target = cloudUrl || (rec && (rec.sourceUrl || rec.source_url)) || '';
        if (key.startsWith('local://') && /^https?:\/\//i.test(String(target))
            && typeof PhotoManager !== 'undefined' && typeof PhotoManager._aliasRecord === 'function') {
            const prev = rec || await dbGet(STORES.PHOTOS, key);
            await dbPut(STORES.PHOTOS, PhotoManager._aliasRecord(key, String(target), prev));
            return;
        }
        await dbDelete(STORES.PHOTOS, key);
    },

    async evictLocalCopy(candidate) {
        if (!candidate || !candidate.id) return 0;

        const rec = await dbGet(STORES.PHOTOS, candidate.id);
        const freed = this.payloadBytes(rec?.data, rec) || candidate.sizeBytes || 0;

        await this._dropPhotoPayload(candidate.id, candidate.cloudUrl || candidate.publicUrl || candidate.public_url || '', rec);

        if (typeof PhotoManager !== 'undefined') {
            if (typeof PhotoManager.releaseCachedUrl === 'function') {
                PhotoManager.releaseCachedUrl(candidate.id);
            } else if (PhotoManager.cache && PhotoManager.cache[candidate.id]) {
                const cachedUrl = PhotoManager.cache[candidate.id];
                try {
                    URL.revokeObjectURL(cachedUrl);
                } catch (e) { }
                if (PhotoManager.activeUrls) PhotoManager.activeUrls.delete(cachedUrl);
                delete PhotoManager.cache[candidate.id];
            }
        }

        if (candidate.registry) {
            candidate.registry.cache_status = 'cloud_only';
            candidate.registry.cacheStatus = 'cloud_only';
            candidate.registry.last_local_cleanup_at = new Date().toISOString();
            candidate.registry.lastLocalCleanupAt = candidate.registry.last_local_cleanup_at;
            await dbPut(STORES.FILE_REGISTRY, candidate.registry);
        }

        await this.logEvent('file_evicted', {
            fileId: candidate.id,
            publicUrl: candidate.publicUrl,
            entityType: candidate.entityType,
            sizeBytes: freed
        });

        return freed;
    },

    async runManualRecoverableCacheCleanup() {
        if (this.cleanupLock) {
            if (typeof showToast === 'function') showToast('⏳ Очистка уже выполняется...');
            return { skipped: true, reason: 'locked' };
        }

        this.cleanupLock = true;

        try {
            if (typeof PhotoManager !== 'undefined' && typeof PhotoManager.clearMemory === 'function') {
                PhotoManager.clearMemory();
            }

            const registry = STORES.FILE_REGISTRY ? (await dbGetAll(STORES.FILE_REGISTRY) || []) : [];

            const registryByUrl = new Map();

            registry.forEach(r => {
                if (r.public_url) registryByUrl.set(r.public_url, r);
                if (r.publicUrl) registryByUrl.set(r.publicUrl, r);
                if (r.local_key) registryByUrl.set(r.local_key, r);
                if (r.localKey) registryByUrl.set(r.localKey, r);
            });

            let deletedCount = 0;
            let freedBytes = 0;
            let skippedLocalOnly = 0;

            // Лёгкие дескрипторы (без ссылки на file.data) — удаление/dbPut идёт
            // после закрытия курсора, см. предупреждение в dbForEachCursor.
            const toEvict = [];

            await dbForEachCursor(STORES.PHOTOS, (file) => {
                if (!file || !file.id || !file.data) return;

                const id = String(file.id || '');

                const sourceUrl =
                    file.sourceUrl ||
                    file.source_url ||
                    file.public_url ||
                    file.publicUrl ||
                    '';

                const registryItem =
                    registryByUrl.get(id) ||
                    registryByUrl.get(sourceUrl) ||
                    null;

                const registryUrl =
                    registryItem?.public_url ||
                    registryItem?.publicUrl ||
                    '';

                const cloudUrl =
                    id.startsWith('http') ? id :
                        String(sourceUrl).startsWith('http') ? sourceUrl :
                            String(registryUrl).startsWith('http') ? registryUrl :
                                '';

                const isLocalOnly =
                    id.startsWith('local://') &&
                    !cloudUrl;

                // Offline-First защита:
                // локальные несинхронизированные файлы без облачного источника не удаляем.
                if (isLocalOnly) {
                    skippedLocalOnly++;
                    return;
                }

                // Удаляем только восстановимые локальные копии.
                if (!cloudUrl) return;

                const sizeBytes = this.payloadBytes(file.data, file);

                toEvict.push({
                    id: file.id,
                    cloudUrl,
                    sizeBytes,
                    registryItem,
                    entityType: file.entityType || file.entity_type || registryItem?.entity_type || this.guessEntityTypeByUrl(cloudUrl)
                });
            });

            for (const c of toEvict) {
                await this._dropPhotoPayload(c.id, c.cloudUrl, null);

                if (c.registryItem) {
                    c.registryItem.cache_status = 'cloud_only';
                    c.registryItem.cacheStatus = 'cloud_only';
                    c.registryItem.last_local_cleanup_at = new Date().toISOString();
                    c.registryItem.lastLocalCleanupAt = c.registryItem.last_local_cleanup_at;

                    await dbPut(STORES.FILE_REGISTRY, c.registryItem);
                }

                deletedCount++;
                freedBytes += c.sizeBytes;

                await this.logEvent('manual_file_evicted', {
                    fileId: c.id,
                    publicUrl: c.cloudUrl,
                    entityType: c.entityType,
                    sizeBytes: c.sizeBytes
                });
            }

            if (typeof PhotoManager !== 'undefined' && typeof PhotoManager.clearMemory === 'function') {
                PhotoManager.clearMemory();
            }
            // RBI NEW: очищаем локальные PDF-отчеты из app_reports.
            // Метаданные отчета и file_url остаются, удаляется только тяжелый file_blob.
            try {
                // Лёгкие дескрипторы (без ссылки на file_blob) — dbPut идёт после
                // закрытия курсора, см. предупреждение в dbForEachCursor.
                const reportsToEvict = [];

                await dbForEachCursor(STORES.REPORTS, (rep) => {
                    if (!rep || !rep.file_blob || !rep.file_url || !String(rep.file_url).startsWith('http')) return;

                    let reportSize = 0;

                    try {
                        reportSize =
                            rep.file_blob.size ||
                            rep.file_size ||
                            rep.sizeBytes ||
                            rep.size_bytes ||
                            0;
                    } catch (e) { }

                    const cleanupAt = new Date().toISOString();

                    reportsToEvict.push({
                        updatedReport: {
                            ...rep,
                            file_blob: null,
                            cache_status: 'cloud_only',
                            cacheStatus: 'cloud_only',
                            updatedAt: cleanupAt,
                            updated_at: cleanupAt
                        },
                        id: rep.id,
                        fileUrl: rep.file_url,
                        reportSize
                    });
                });

                for (const item of reportsToEvict) {
                    const { updatedReport, id, fileUrl, reportSize } = item;

                    await dbPut(STORES.REPORTS, updatedReport);

                    // Обновляем массив в памяти, чтобы интерфейс не держал старый blob до перезагрузки
                    if (typeof reportsArray !== 'undefined' && Array.isArray(reportsArray)) {
                        const idx = reportsArray.findIndex(r => String(r.id) === String(id));
                        if (idx >= 0) {
                            reportsArray[idx] = {
                                ...reportsArray[idx],
                                file_blob: null,
                                cache_status: 'cloud_only',
                                cacheStatus: 'cloud_only',
                                updatedAt: updatedReport.updatedAt,
                                updated_at: updatedReport.updated_at
                            };
                        }
                    }

                    const reportRegistryItem =
                        registryByUrl.get(fileUrl) ||
                        null;

                    if (reportRegistryItem) {
                        reportRegistryItem.cache_status = 'cloud_only';
                        reportRegistryItem.cacheStatus = 'cloud_only';
                        reportRegistryItem.last_local_cleanup_at = new Date().toISOString();
                        reportRegistryItem.lastLocalCleanupAt = reportRegistryItem.last_local_cleanup_at;
                        reportRegistryItem.updated_at = reportRegistryItem.last_local_cleanup_at;
                        reportRegistryItem.updatedAt = reportRegistryItem.updated_at;

                        await dbPut(STORES.FILE_REGISTRY, reportRegistryItem);
                    }

                    deletedCount++;
                    freedBytes += reportSize;

                    await this.logEvent('manual_report_blob_evicted', {
                        fileId: id,
                        publicUrl: fileUrl,
                        entityType: 'report_pdf',
                        sizeBytes: reportSize
                    });
                }
            } catch (e) {
                console.warn('[StorageManager] Не удалось очистить локальные PDF-отчеты:', e);
            }
            await this.logEvent('manual_recoverable_cleanup_completed', {
                deletedCount,
                freedBytes,
                skippedLocalOnly
            });
            if (typeof appSettings !== 'undefined') {
                appSettings.storageLastCleanupAt = new Date().toISOString();

                try {
                    await dbPut(STORES.SETTINGS, { key: 'user_prefs', ...appSettings });
                } catch (e) { }
            }

            // Ручная очистка — пользователь ждёт повторной докачки при наличии сети.
            if (deletedCount > 0 && typeof window.rbiRequestFullOfflineCache === 'function') {
                window.rbiRequestFullOfflineCache('manual_cleanup');
                if (typeof window.rbiScheduleFullOfflineCacheIfEnabled === 'function') {
                    window.rbiScheduleFullOfflineCacheIfEnabled(1000);
                }
            }

            if (typeof updateStorageInfo === 'function') updateStorageInfo();

            if (typeof showToast === 'function') {
                showToast(
                    `✅ Очищено ${(freedBytes / 1024 / 1024).toFixed(1)} МБ. ` +
                    `Удалено локальных копий: ${deletedCount}. ` +
                    `Несинхронизированные: ${skippedLocalOnly} не тронуты.`
                );
            }

            return {
                deletedCount,
                freedBytes,
                skippedLocalOnly
            };

        } catch (e) {
            console.error('[StorageManager] Ошибка ручной очистки:', e);

            if (typeof showToast === 'function') {
                showToast('❌ Ошибка при очистке кэша');
            }

            return { error: e };
        } finally {
            this.cleanupLock = false;
        }
    },
    async cleanupReportBlobsByTtl(mode = 'normal_cleanup') {
        try {
            const registry = STORES.FILE_REGISTRY ? (await dbGetAll(STORES.FILE_REGISTRY) || []) : [];

            const registryByUrl = new Map();

            registry.forEach(r => {
                if (r.public_url) registryByUrl.set(r.public_url, r);
                if (r.publicUrl) registryByUrl.set(r.publicUrl, r);
            });

            const settings = typeof appSettings !== 'undefined' ? appSettings : {};
            const ttlDays = settings.storageReportTtlDays || 30;
            const now = Date.now();

            let deletedCount = 0;
            let freedBytes = 0;

            // Лёгкие дескрипторы (без ссылки на file_blob) — dbPut идёт после
            // закрытия курсора, см. предупреждение в dbForEachCursor.
            const toEvict = [];

            await dbForEachCursor(STORES.REPORTS, (rep) => {
                if (!rep || !rep.file_blob || !rep.file_url || !String(rep.file_url).startsWith('http')) return;

                const ageDays = this.fileIdleAgeDays(rep, null, now);

                // Не удаляем свежие отчеты в первые 24 часа, кроме аварийного режима
                if (ageDays < 1 && mode !== 'critical_cleanup') {
                    return;
                }

                // В мягком и нормальном режиме уважаем TTL
                if ((mode === 'soft_lifecycle' || mode === 'normal_cleanup') && ageDays < ttlDays) {
                    return;
                }

                const reportSize = this.payloadBytes(rep.file_blob, rep);
                const cleanupAt = new Date().toISOString();

                toEvict.push({
                    updatedReport: {
                        ...rep,
                        file_blob: null,
                        cache_status: 'cloud_only',
                        cacheStatus: 'cloud_only',
                        last_local_cleanup_at: cleanupAt,
                        lastLocalCleanupAt: cleanupAt,
                        updatedAt: cleanupAt,
                        updated_at: cleanupAt
                    },
                    id: rep.id,
                    fileUrl: rep.file_url,
                    reportSize,
                    ageDays
                });
            });

            for (const item of toEvict) {
                const { updatedReport, id, fileUrl, reportSize, ageDays } = item;

                await dbPut(STORES.REPORTS, updatedReport);

                if (typeof reportsArray !== 'undefined' && Array.isArray(reportsArray)) {
                    const idx = reportsArray.findIndex(r => String(r.id) === String(id));

                    if (idx >= 0) {
                        reportsArray[idx] = {
                            ...reportsArray[idx],
                            file_blob: null,
                            cache_status: 'cloud_only',
                            cacheStatus: 'cloud_only',
                            last_local_cleanup_at: updatedReport.last_local_cleanup_at,
                            lastLocalCleanupAt: updatedReport.lastLocalCleanupAt,
                            updatedAt: updatedReport.updatedAt,
                            updated_at: updatedReport.updated_at
                        };
                    }
                }

                const registryItem = registryByUrl.get(fileUrl);

                if (registryItem) {
                    registryItem.cache_status = 'cloud_only';
                    registryItem.cacheStatus = 'cloud_only';
                    registryItem.last_local_cleanup_at = new Date().toISOString();
                    registryItem.lastLocalCleanupAt = registryItem.last_local_cleanup_at;
                    registryItem.updated_at = registryItem.last_local_cleanup_at;
                    registryItem.updatedAt = registryItem.updated_at;

                    await dbPut(STORES.FILE_REGISTRY, registryItem);
                }

                deletedCount++;
                freedBytes += reportSize;

                await this.logEvent('auto_report_blob_evicted', {
                    fileId: id,
                    publicUrl: fileUrl,
                    entityType: 'report_pdf',
                    ageDays,
                    sizeBytes: reportSize,
                    mode
                });
            }

            return {
                deletedCount,
                freedBytes
            };

        } catch (e) {
            console.warn('[StorageManager] Не удалось выполнить автоочистку PDF-отчетов:', e);

            return {
                deletedCount: 0,
                freedBytes: 0,
                error: e
            };
        }
    },

    async runAdaptiveStorageCleanup(reason = 'scheduled') {
        if (this.cleanupLock) return { skipped: true, reason: 'locked' };

        const settings = typeof appSettings !== 'undefined' ? appSettings : {};
        if (settings.storageAutoCleanupEnabled === false) return { skipped: true, reason: 'disabled' };

        this.cleanupLock = true;

        try {
            const lastCleanup = settings.storageLastCleanupAt ? new Date(settings.storageLastCleanupAt).getTime() : 0;
            const now = Date.now();

            if (reason !== 'quota_exceeded' && lastCleanup && (now - lastCleanup) < 6 * 60 * 60 * 1000) {
                return { skipped: true, reason: 'too_early' };
            }

            const snapshot = await this.getStorageSnapshot();

            if (snapshot.mode === 'keep_all' && reason !== 'quota_exceeded') {
                return { skipped: true, reason: 'enough_space', snapshot };
            }

            await this.logEvent('cleanup_started', { reason, mode: snapshot.mode });

            const candidates = await this.collectEvictionCandidates(snapshot.mode);

            let targetFreeBytes = 0;

            if (snapshot.mode === 'soft_lifecycle') targetFreeBytes = 150 * 1024 * 1024;
            else if (snapshot.mode === 'normal_cleanup') targetFreeBytes = 500 * 1024 * 1024;
            else if (snapshot.mode === 'critical_cleanup' || reason === 'quota_exceeded') targetFreeBytes = 1024 * 1024 * 1024;

            let freedBytes = 0;
            let deletedCount = 0;

            for (const c of candidates) {
                if (freedBytes >= targetFreeBytes && reason !== 'quota_exceeded') break;

                const freed = await this.evictLocalCopy(c);

                if (freed > 0) {
                    freedBytes += freed;
                    deletedCount++;
                }
            }

            // RBI NEW: автоочистка локальных PDF-blob отчетов из app_reports.
            // Отчеты хранятся отдельно от app_photos, поэтому чистим их отдельным безопасным методом.
            if (
                typeof this.cleanupReportBlobsByTtl === 'function' &&
                (freedBytes < targetFreeBytes || snapshot.mode === 'critical_cleanup' || reason === 'quota_exceeded')
            ) {
                const reportCleanup = await this.cleanupReportBlobsByTtl(snapshot.mode);

                if (reportCleanup && !reportCleanup.error) {
                    freedBytes += reportCleanup.freedBytes || 0;
                    deletedCount += reportCleanup.deletedCount || 0;
                }
            }

            // Не ставим «последнюю очистку», если ничего не удалили — иначе 6ч пауза
            // блокирует следующую попытку при нехватке места.
            if (deletedCount > 0 || reason === 'quota_exceeded') {
                if (typeof appSettings !== 'undefined') {
                    appSettings.storageLastCleanupAt = new Date().toISOString();

                    try {
                        // Тот же ключ, что loadSettings/user_prefs — иначе пауза 6ч не переживает reload
                        await dbPut(STORES.SETTINGS, { key: 'user_prefs', ...appSettings });
                    } catch (e) { }
                }
            }

            // Не запрашиваем полное автокэширование после adaptive cleanup:
            // иначе «освободили место → сразу скачали всё обратно» (петля after_sync).
            // Повторная докачка — только у ручной «Очистить кэш».

            await this.logEvent('cleanup_completed', {
                reason,
                mode: snapshot.mode,
                deletedCount,
                freedBytes
            });

            if (deletedCount > 0 && reason === 'quota_exceeded' && typeof showToast === 'function') {
                showToast(`🧹 Освобождено ${(freedBytes / 1024 / 1024).toFixed(1)} МБ. Данные проверок сохранены.`);
            }

            if (typeof updateStorageInfo === 'function') updateStorageInfo();

            return {
                skipped: deletedCount === 0,
                reason: deletedCount === 0 ? 'no_candidates' : undefined,
                deletedCount,
                freedBytes,
                snapshot
            };

        } catch (e) {
            console.error('[StorageManager] Ошибка автоочистки:', e);
            await this.logEvent('cleanup_error', { reason, message: e.message || String(e) });
            return { error: e };
        } finally {
            this.cleanupLock = false;
        }
    }
};
/**
 * Статистика хранилища (Свободное место на устройстве)
 */
async function getStorageStats() {
    if (window.RbiStorageManager && typeof window.RbiStorageManager.getStorageSnapshot === 'function') {
        try {
            const snap = await window.RbiStorageManager.getStorageSnapshot();

            return {
                supported: snap.supported,
                usedMB: snap.usedMB.toFixed(1),
                quotaMB: snap.quotaMB.toFixed(1),
                freeMB: snap.freeMB.toFixed(1),
                percentUsed: snap.usagePercent.toFixed(1),
                mode: snap.mode,
                status: snap.freeMB > 1000 ? 'good' : (snap.freeMB > 300 ? 'warning' : 'critical')
            };
        } catch (e) {
            return { supported: false, message: 'Ошибка доступа' };
        }
    }

    if (!navigator.storage || !navigator.storage.estimate) {
        return { supported: false, message: 'Не поддерживается', usedMB: 0, quotaMB: 0, freeMB: 0, percentUsed: 0 };
    }

    try {
        const estimate = await navigator.storage.estimate();
        const usedMB = (estimate.usage / 1024 / 1024).toFixed(1);
        const quotaMB = (estimate.quota / 1024 / 1024).toFixed(1);
        const freeMB = ((estimate.quota - estimate.usage) / 1024 / 1024).toFixed(1);
        const percentUsed = ((estimate.usage / estimate.quota) * 100).toFixed(1);

        return {
            supported: true,
            usedMB,
            quotaMB,
            freeMB,
            percentUsed,
            status: parseFloat(freeMB) > 1000 ? 'good' : (parseFloat(freeMB) > 300 ? 'warning' : 'critical')
        };
    } catch (e) {
        return { supported: false, message: 'Ошибка доступа' };
    }
}
