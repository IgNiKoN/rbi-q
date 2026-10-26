/* Файл: js/services/storage/storage-photo-manager.js — перенесено из js/storage.js; P2-0023: адреса без лимита 80, статусы загрузки */
import {
    PHOTO_STATE,
    selectUrlsToRelease,
    decideCloudFallback,
    stateForHttpStatus,
    cloudUrlFor,
    createConcurrencyQueue,
    createPhotoLazyLoader
} from './storage-photo-loader.js';

/**
 * ГЛОБАЛЬНЫЙ МЕНЕДЖЕР ФОТОГРАФИЙ И ФАЙЛОВ (Умный кэш и Офлайн)
 * Единственный владелец blob:-адресов фото (экраны свои кэши не держат).
 */
const PhotoManager = {
    cache: {},
    activeUrls: new Set(),
    // P2-0023: раньше LRU на 80 адресов отзывал и те, что ещё на экране → «очищено».
    // Теперь адрес отзывается только если его нет на странице (sweepUnusedUrls)
    // и он не выдавался последние URL_GRACE_MS; чистка — только когда адресов > SOFT_URL_LIMIT.
    _touchedAt: {},
    SOFT_URL_LIMIT: 200,
    URL_GRACE_MS: 30000,
    // Превью для карточек (TWI, аудит, задачи…): раньше 150px/0.72 — мыло на retina.
    // THUMB_VERSION↑ → старые thumbData пересобираются в фоне (не при показе).
    THUMB_MAX_EDGE: 512,
    THUMB_JPEG_Q: 0.86,
    THUMB_VERSION: 2,

    async init() {
        console.log(`[PhotoManager] Инициализация`);
    },

    _touch(id) {
        if (!id) return;
        this._touchedAt[id] = Date.now();
    },

    urlCount() {
        return Object.keys(this.cache).length;
    },

    releaseCachedUrl(id) {
        if (!id || !this.cache[id]) return;
        const url = this.cache[id];
        try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        this.activeUrls.delete(url);
        delete this.cache[id];
        delete this._touchedAt[id];
    },

    _rememberObjectUrl(id, url) {
        if (!id || !url) return;
        if (this.cache[id] && this.cache[id] !== url) {
            this.releaseCachedUrl(id);
        }
        this.cache[id] = url;
        this.activeUrls.add(url);
        this._touch(id);
        if (this.urlCount() > this.SOFT_URL_LIMIT) this._scheduleSweep();
    },

    _scheduleSweep() {
        if (this._sweepTimer) return;
        this._sweepTimer = setTimeout(() => {
            this._sweepTimer = null;
            // Адресов много: сначала фото далеко за экраном отдают свои, потом чистка.
            if (window.RbiPhotoLoader && typeof window.RbiPhotoLoader.unloadFar === 'function') {
                window.RbiPhotoLoader.unloadFar(2500);
            }
            this.sweepUnusedUrls();
        }, 1500);
    },

    /** blob:-адреса, которые сейчас используются на странице. */
    _collectInUseUrls() {
        const inUse = new Set();
        if (typeof document === 'undefined' || !document.querySelectorAll) return inUse;
        const sel = 'img[src^="blob:"], source[src^="blob:"], video[src^="blob:"], iframe[src^="blob:"], embed[src^="blob:"], a[href^="blob:"], object[data^="blob:"]';
        document.querySelectorAll(sel).forEach((el) => {
            const u = el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('data');
            if (u) inUse.add(u);
        });
        return inUse;
    },

    /**
     * Отозвать адреса, которых нет на странице (память телефона). Возвращает число отозванных.
     * @param {{ force?: boolean }} [opts] force — уход в фон: все неиспользуемые, без паузы.
     */
    sweepUnusedUrls(opts) {
        const force = !!(opts && opts.force);
        // Демо-режим: база на устройстве отключена, фото живут только в этих адресах.
        if (typeof window !== 'undefined' && window.isDemoMode === true) return 0;
        const entries = Object.keys(this.cache).map((key) => ({
            key,
            url: this.cache[key],
            touchedAt: this._touchedAt[key] || 0
        }));
        const keys = selectUrlsToRelease({
            entries,
            inUse: this._collectInUseUrls(),
            now: Date.now(),
            graceMs: force ? 0 : this.URL_GRACE_MS,
            targetSize: force ? 0 : Math.floor(this.SOFT_URL_LIMIT * 0.75)
        });
        keys.forEach((k) => this.releaseCachedUrl(k));
        return keys.length;
    },

    // Canvas-превью для списков/карточек (JPEG). Размер — THUMB_MAX_EDGE.
    // Старые фото без thumbData / со старым THUMB_VERSION — при preferThumb.
    async _makeThumbFromDataUrl(dataUrl, maxEdge) {
        if (!dataUrl || !String(dataUrl).startsWith('data:')) return null;
        maxEdge = maxEdge || this.THUMB_MAX_EDGE;
        try {
            const img = await new Promise((resolve, reject) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = reject;
                el.src = dataUrl;
            });
            let w = img.width || maxEdge;
            let h = img.height || maxEdge;
            if (w > h && w > maxEdge) { h = Math.round(h * maxEdge / w); w = maxEdge; }
            else if (h > maxEdge) { w = Math.round(w * maxEdge / h); h = maxEdge; }
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, w);
            canvas.height = Math.max(1, h);
            const tctx = canvas.getContext('2d');
            // JPEG не хранит альфу — без белой подложки прозрачность PNG становится чёрной
            tctx.fillStyle = '#ffffff';
            tctx.fillRect(0, 0, canvas.width, canvas.height);
            tctx.imageSmoothingEnabled = true;
            tctx.imageSmoothingQuality = 'high';
            tctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const thumbUrl = canvas.toDataURL('image/jpeg', this.THUMB_JPEG_Q);
            return base64ToArrayBuffer(thumbUrl);
        } catch (e) {
            console.warn('[PhotoManager] thumb failed', e);
            return null;
        }
    },

    async _makeThumbFromBuffer(buffer, mimeType, maxEdge) {
        if (!buffer) return null;
        maxEdge = maxEdge || this.THUMB_MAX_EDGE;
        const blob = arrayBufferToBlob(buffer, mimeType || 'image/webp');
        const tmpUrl = URL.createObjectURL(blob);
        try {
            const img = await new Promise((resolve, reject) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = reject;
                el.src = tmpUrl;
            });
            let w = img.width || maxEdge;
            let h = img.height || maxEdge;
            if (w > h && w > maxEdge) { h = Math.round(h * maxEdge / w); w = maxEdge; }
            else if (h > maxEdge) { w = Math.round(w * maxEdge / h); h = maxEdge; }
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, w);
            canvas.height = Math.max(1, h);
            const tctx = canvas.getContext('2d');
            tctx.fillStyle = '#ffffff';
            tctx.fillRect(0, 0, canvas.width, canvas.height);
            tctx.imageSmoothingEnabled = true;
            tctx.imageSmoothingQuality = 'high';
            tctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            return base64ToArrayBuffer(canvas.toDataURL('image/jpeg', this.THUMB_JPEG_Q));
        } catch (e) {
            console.warn('[PhotoManager] thumb-from-buffer failed', e);
            return null;
        } finally {
            try { URL.revokeObjectURL(tmpUrl); } catch (_) { /* ignore */ }
        }
    },

    _thumbNeedsRebuild(record) {
        if (!record) return true;
        const buf = record.thumbData || record.thumb_data;
        if (!buf) return true;
        const ver = record.thumbVersion != null ? record.thumbVersion : record.thumb_version;
        return ver !== this.THUMB_VERSION;
    },

    _applyThumbToRecord(record, thumbBuf) {
        if (!record || !thumbBuf) return;
        record.thumbData = thumbBuf;
        record.thumb_data = thumbBuf;
        record.thumbMimeType = 'image/jpeg';
        record.thumb_mime_type = 'image/jpeg';
        record.thumbVersion = this.THUMB_VERSION;
        record.thumb_version = this.THUMB_VERSION;
        record.thumbMaxEdge = this.THUMB_MAX_EDGE;
        record.thumb_max_edge = this.THUMB_MAX_EDGE;
    },

    _thumbCacheKey(id) {
        return id ? (String(id) + '#thumb') : '';
    },

    async saveLocal(base64Data, prefix = 'img', meta = {}) {
        if (!base64Data || !base64Data.startsWith('data:')) return base64Data;

        const id = 'local://' + prefix + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1000);
        const mimeType = base64Data.match(/data:(.*?);/)?.[1] || 'image/webp';
        const buffer = await base64ToArrayBuffer(base64Data);
        const thumbBuffer = await this._makeThumbFromDataUrl(base64Data);
        const now = new Date().toISOString();

        await dbPut(STORES.PHOTOS, {
            id,
            data: buffer,
            mimeType,
            mime_type: mimeType,
            thumbData: thumbBuffer || null,
            thumb_data: thumbBuffer || null,
            thumbMimeType: thumbBuffer ? 'image/jpeg' : '',
            thumb_mime_type: thumbBuffer ? 'image/jpeg' : '',
            thumbVersion: thumbBuffer ? this.THUMB_VERSION : 0,
            thumb_version: thumbBuffer ? this.THUMB_VERSION : 0,
            thumbMaxEdge: thumbBuffer ? this.THUMB_MAX_EDGE : 0,
            thumb_max_edge: thumbBuffer ? this.THUMB_MAX_EDGE : 0,
            sizeBytes: buffer.byteLength,
            size_bytes: buffer.byteLength,
            createdAt: now,
            created_at: now,
            cachedAt: now,
            cached_at: now,
            lastAccessedAt: now,
            last_accessed_at: now,
            sourceUrl: meta.sourceUrl || '',
            source_url: meta.sourceUrl || '',
            entityType: meta.entityType || meta.entity_type || 'local_file',
            entity_type: meta.entityType || meta.entity_type || 'local_file',
            entityId: meta.entityId || meta.entity_id || '',
            entity_id: meta.entityId || meta.entity_id || '',
            fieldPath: meta.fieldPath || meta.field_path || '',
            field_path: meta.fieldPath || meta.field_path || '',
            cacheStatus: meta.cacheStatus || meta.cache_status || 'local_only',
            cache_status: meta.cacheStatus || meta.cache_status || 'local_only'
        });

        const blob = arrayBufferToBlob(buffer, mimeType);
        const url = URL.createObjectURL(blob);
        this._rememberObjectUrl(id, url);
        if (thumbBuffer) {
            const tBlob = arrayBufferToBlob(thumbBuffer, 'image/jpeg');
            this._rememberObjectUrl(this._thumbCacheKey(id), URL.createObjectURL(tBlob));
        }

        return id;
    },

    getSrc(url) {
        if (!url) return '';
        // photos[itemId] может быть массивом — берём первый ref.
        if (Array.isArray(url)) url = url[0];
        if (!url) return '';

        if (this.cache[url]) {
            this._touch(url);
            return this.cache[url];
        }

        // local:// и cloud:// нельзя отдавать напрямую в img.src
        if (String(url).startsWith('local://') || String(url).startsWith('cloud://')) {
            return window.rbiPhotoPlaceholder || '';
        }

        // http оставляем только для старых мест интерфейса.
        return url;
    },

    /** Sync: blob: превью если уже в RAM, иначе как getSrc (placeholder для local://). */
    getThumbSrc(url) {
        if (!url) return '';
        if (Array.isArray(url)) url = url[0];
        if (!url) return '';
        const tKey = this._thumbCacheKey(url);
        if (tKey && this.cache[tKey]) {
            this._touch(tKey);
            return this.cache[tKey];
        }
        return this.getSrc(url);
    },

    /**
     * Загрузить фото для показа. Возвращает статус, а не только адрес:
     * { state: 'ok', url } | 'offline' (нет сети, файл в облаке) | 'missing' (нет нигде) | 'error' (повторить).
     * Чтение НЕ пишет в IndexedDB; превью старой версии пересобирается в фоне.
     * @param {string|string[]} ref
     * @param {{ preferThumb?: boolean }} [opts]
     */
    resolvePhoto(ref, opts) {
        if (Array.isArray(ref)) ref = ref[0];
        if (!ref) return Promise.resolve({ state: PHOTO_STATE.MISSING });
        ref = String(ref);
        // Доработка 4: одновременные запросы одного фото объединяются — иначе второй createObjectURL
        // отзывал адрес первого, и уже показанное превью ломалось.
        const flightKey = (opts && opts.preferThumb ? 'thumb:' : 'full:') + ref;
        if (!this._inflight) this._inflight = new Map();
        const pending = this._inflight.get(flightKey);
        if (pending) return pending;
        const p = this._resolvePhotoOnce(ref, opts).finally(() => { this._inflight.delete(flightKey); });
        this._inflight.set(flightKey, p);
        return p;
    },

    async _resolvePhotoOnce(ref, opts) {
        const preferThumb = !!(opts && opts.preferThumb);
        const thumbKey = this._thumbCacheKey(ref);

        if (preferThumb && this.cache[thumbKey]) {
            this._touch(thumbKey);
            return { state: PHOTO_STATE.OK, url: this.cache[thumbKey] };
        }
        if (this.cache[ref]) {
            this._touch(ref);
            return { state: PHOTO_STATE.OK, url: this.cache[ref] };
        }

        let record = null;
        try {
            record = await dbGet(STORES.PHOTOS, ref);
        } catch (e) {
            console.warn('[PhotoManager] чтение фото из IndexedDB не удалось', e);
            return { state: PHOTO_STATE.ERROR };
        }

        if (record && record.data) {
            return { state: PHOTO_STATE.OK, url: this._urlFromRecord(ref, record, preferThumb) };
        }

        // Локальной копии нет (очищена или ссылка local:// на уже отправленное фото).
        const cloudUrl = cloudUrlFor(ref, record);
        if (cloudUrl && cloudUrl !== ref) {
            // Облачная копия могла остаться в IndexedDB под своим адресом.
            if (this.cache[cloudUrl]) {
                this._touch(cloudUrl);
                return { state: PHOTO_STATE.OK, url: this.cache[cloudUrl] };
            }
            try {
                const cloudRec = await dbGet(STORES.PHOTOS, cloudUrl);
                if (cloudRec && cloudRec.data) {
                    return { state: PHOTO_STATE.OK, url: this._urlFromRecord(cloudUrl, cloudRec, preferThumb) };
                }
            } catch (_e) { /* пробуем облако */ }
        }

        const decision = decideCloudFallback({
            cloudUrl,
            online: typeof navigator === 'undefined' || navigator.onLine !== false
        });
        if (decision !== 'fetch') return { state: decision };
        return this._fetchCloudPhoto(cloudUrl);
    },

    _urlFromRecord(key, record, preferThumb) {
        const thumbKey = this._thumbCacheKey(key);
        if (preferThumb) {
            const thumbBuf = record.thumbData || record.thumb_data;
            if (thumbBuf && !this._thumbNeedsRebuild(record)) {
                const tUrl = URL.createObjectURL(arrayBufferToBlob(thumbBuf, 'image/jpeg'));
                this._rememberObjectUrl(thumbKey, tUrl);
                return tUrl;
            }
            // Превью нет/старое: показываем полное фото сразу, превью — в фоне.
            this._queueThumbRebuild(key);
        }
        const url = URL.createObjectURL(arrayBufferToBlob(record.data, record.mimeType || record.mime_type || 'image/webp'));
        this._rememberObjectUrl(key, url);
        return url;
    },

    async _fetchCloudPhoto(cloudUrl) {
        let res;
        try {
            res = await rbiFetchCloudFileNoBrowserCache(cloudUrl);
        } catch (e) {
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
            return { state: offline ? PHOTO_STATE.OFFLINE : PHOTO_STATE.ERROR };
        }
        const st = stateForHttpStatus(res && res.status);
        if (!res || !res.ok || st !== PHOTO_STATE.OK) return { state: st === PHOTO_STATE.OK ? PHOTO_STATE.ERROR : st };

        let blob;
        try {
            blob = await res.blob();
        } catch (_e) {
            return { state: PHOTO_STATE.ERROR };
        }
        // Кэш облачной копии на устройство. Нет места — фото всё равно показываем.
        try {
            const buffer = await blobToArrayBuffer(blob);
            const now = new Date().toISOString();
            const entityType = window.RbiStorageManager ? window.RbiStorageManager.guessEntityTypeByUrl(cloudUrl) : 'unknown_file';
            await dbPut(STORES.PHOTOS, {
                id: cloudUrl,
                data: buffer,
                mimeType: blob.type || 'image/jpeg',
                mime_type: blob.type || 'image/jpeg',
                sizeBytes: buffer.byteLength,
                size_bytes: buffer.byteLength,
                createdAt: now,
                created_at: now,
                cachedAt: now,
                cached_at: now,
                lastAccessedAt: now,
                last_accessed_at: now,
                sourceUrl: cloudUrl,
                source_url: cloudUrl,
                cacheStatus: 'cached_cloud',
                cache_status: 'cached_cloud',
                entityType,
                entity_type: entityType
            });
            if (window.RbiStorageManager && typeof window.RbiStorageManager.markCloudFileCached === 'function') {
                await window.RbiStorageManager.markCloudFileCached(cloudUrl, buffer.byteLength, blob.type || 'image/jpeg');
            }
        } catch (e) {
            console.warn('[PhotoManager] облачное фото показано, но не сохранено на устройстве', e);
        }
        const localUrl = URL.createObjectURL(blob);
        this._rememberObjectUrl(cloudUrl, localUrl);
        return { state: PHOTO_STATE.OK, url: localUrl };
    },

    /** Пересборка превью в фоне по одному — не блокирует показ (P2-0023). */
    _queueThumbRebuild(key) {
        if (!key) return;
        if (!this._thumbQueue) this._thumbQueue = createConcurrencyQueue(1);
        if (!this._thumbQueued) this._thumbQueued = new Set();
        if (this._thumbQueued.has(key)) return;
        this._thumbQueued.add(key);
        this._thumbQueue.run(async () => {
            try {
                const rec = await dbGet(STORES.PHOTOS, key);
                if (!rec || !rec.data || !this._thumbNeedsRebuild(rec)) return;
                const thumbBuf = await this._makeThumbFromBuffer(rec.data, rec.mimeType || rec.mime_type || 'image/webp');
                if (!thumbBuf) return;
                this._applyThumbToRecord(rec, thumbBuf);
                await dbPut(STORES.PHOTOS, rec);
            } catch (e) {
                console.warn('[PhotoManager] фоновое превью не собрано', e);
            } finally {
                this._thumbQueued.delete(key);
            }
        });
    },

    /** Совместимость: адрес или null (все старые вызовы). Новый код — resolvePhoto. */
    async getAsyncUrl(localIdOrHttp, opts) {
        const res = await this.resolvePhoto(localIdOrHttp, opts);
        return res && res.state === PHOTO_STATE.OK ? res.url : null;
    },
    async getBase64(localId) {
        if (!localId) return null;

        try {
            const record = await dbGet(STORES.PHOTOS, localId);

            if (record && record.data) {
                return await arrayBufferToBase64(record.data, record.mimeType || record.mime_type || 'image/webp');
            }

            // P2-0023: local:// уже отправленного фото — псевдоним на облачный адрес.
            const aliasUrl = cloudUrlFor(localId, record);
            if (aliasUrl && aliasUrl !== String(localId)) {
                return await this.getBase64(aliasUrl);
            }

            if (String(localId).startsWith('http')) {
                if (!navigator.onLine) return null;

                const res = await rbiFetchCloudFileNoBrowserCache(localId);
                if (!res.ok) return null;

                const blob = await res.blob();
                const buffer = await blobToArrayBuffer(blob);
                const now = new Date().toISOString();

                await dbPut(STORES.PHOTOS, {
                    id: localId,
                    data: buffer,
                    mimeType: blob.type || 'image/jpeg',
                    mime_type: blob.type || 'image/jpeg',
                    sizeBytes: buffer.byteLength,
                    size_bytes: buffer.byteLength,
                    createdAt: now,
                    created_at: now,
                    cachedAt: now,
                    cached_at: now,
                    lastAccessedAt: now,
                    last_accessed_at: now,
                    sourceUrl: localId,
                    source_url: localId,
                    cacheStatus: 'cached_cloud',
                    cache_status: 'cached_cloud',
                    entityType: window.RbiStorageManager ? window.RbiStorageManager.guessEntityTypeByUrl(localId) : 'unknown_file',
                    entity_type: window.RbiStorageManager ? window.RbiStorageManager.guessEntityTypeByUrl(localId) : 'unknown_file'
                });
                if (window.RbiStorageManager && typeof window.RbiStorageManager.markCloudFileCached === 'function') {
                    await window.RbiStorageManager.markCloudFileCached(
                        localId,
                        buffer.byteLength,
                        blob.type || 'image/jpeg'
                    );
                }
                return await arrayBufferToBase64(buffer, blob.type || 'image/jpeg');
            }
        } catch (e) {
            console.warn('[PhotoManager] getBase64 error:', e);
        }

        return null;
    },

    clearMemory() {
        this.activeUrls.forEach(url => {
            try {
                URL.revokeObjectURL(url);
            } catch (e) { }
        });

        this.activeUrls.clear();
        this.cache = {};
        this._touchedAt = {};
    },

    /**
     * P2-0023: ссылки на фото черновика проверки (память + сохранённая сессия).
     * Их не должна удалять чистка «осиротевших» фото: черновик ещё не в истории.
     * @returns {Promise<Set<string>>}
     */
    async collectDraftPhotoRefs() {
        const out = new Set();
        const add = (v) => {
            if (!v) return;
            if (Array.isArray(v)) { v.forEach(add); return; }
            if (typeof v === 'object') { Object.values(v).forEach(add); return; }
            const s = String(v);
            if (s.startsWith('local://') || s.startsWith('http')) out.add(s);
        };
        try { add(window.AuditState ? window.AuditState.photos : window.photos); } catch (_e) { /* ignore */ }
        try {
            const sess = STORES.STATE ? await dbGet(STORES.STATE, 'current_session') : null;
            if (sess) add(sess.photos);
        } catch (_e) { /* ignore */ }
        return out;
    },

    /** Запись-псевдоним local:// → облачный адрес (без data, ~200 байт). */
    _aliasRecord(localId, cloudUrl, prev) {
        const now = new Date().toISOString();
        const p = prev || {};
        return {
            id: localId,
            aliasOf: cloudUrl,
            alias_of: cloudUrl,
            sourceUrl: cloudUrl,
            source_url: cloudUrl,
            mimeType: p.mimeType || p.mime_type || '',
            mime_type: p.mime_type || p.mimeType || '',
            sizeBytes: 0,
            size_bytes: 0,
            entityType: p.entityType || p.entity_type || 'local_file',
            entity_type: p.entity_type || p.entityType || 'local_file',
            cacheStatus: 'alias',
            cache_status: 'alias',
            createdAt: p.createdAt || p.created_at || now,
            created_at: p.created_at || p.createdAt || now
        };
    },

    async linkCloudToLocal(oldLocalUrl, newCloudUrl) {
        const record = await dbGet(STORES.PHOTOS, oldLocalUrl);

        if (record) {
            const now = new Date().toISOString();

            await dbPut(STORES.PHOTOS, {
                ...record,
                id: newCloudUrl,
                sourceUrl: newCloudUrl,
                source_url: newCloudUrl,
                cacheStatus: 'cached_cloud',
                cache_status: 'cached_cloud',
                lastAccessedAt: now,
                last_accessed_at: now,
                cachedAt: record.cachedAt || now,
                cached_at: record.cached_at || now
            });

            // P2-0023: не удаляем local:// — оставляем «псевдоним» без данных. Карточки,
            // где ещё лежит local://, найдут фото по облачному адресу (а не «очищено»).
            await dbPut(STORES.PHOTOS, this._aliasRecord(oldLocalUrl, newCloudUrl, record));

            if (this.cache[oldLocalUrl]) {
                this.cache[newCloudUrl] = this.cache[oldLocalUrl];
                this._touch(newCloudUrl);
                delete this.cache[oldLocalUrl];
                delete this._touchedAt[oldLocalUrl];
            }

            if (window.RbiStorageManager) {
                await window.RbiStorageManager.upsertLocalFileRegistry({
                    id: 'localreg_' + Date.now().toString(36),
                    local_key: newCloudUrl,
                    localKey: newCloudUrl,
                    public_url: newCloudUrl,
                    publicUrl: newCloudUrl,
                    cache_status: 'cached_cloud',
                    cacheStatus: 'cached_cloud',
                    entity_type: record.entity_type || record.entityType || 'inspection_photo',
                    entityType: record.entity_type || record.entityType || 'inspection_photo',
                    size_bytes: record.sizeBytes || record.size_bytes || record.data?.byteLength || 0,
                    sizeBytes: record.sizeBytes || record.size_bytes || record.data?.byteLength || 0
                });
            }
        }
    },

    async downloadForOffline(url, opts = {}) {
        // skipMemoryCache=true по умолчанию: автокэш пишет только в IDB, без ObjectURL в RAM.
        // UI, которому нужен blob:-URL сразу, передаёт { skipMemoryCache: false }.
        // Возвращает { ok, bytes, fetched } — fetched=true только после реального сетевого скачивания.
        const skipMemoryCache = opts.skipMemoryCache !== false;

        if (!url || !String(url).startsWith('http')) {
            return { ok: false, bytes: 0, fetched: false };
        }
        // Чужие домены (CORS / demo PDF) в офлайн-кэш не тащим.
        if (typeof window.rbiIsOfflineCacheableUrl === 'function' && !window.rbiIsOfflineCacheableUrl(url)) {
            return { ok: false, bytes: 0, fetched: false };
        }
        if (this.cache[url]) {
            this._touch(url);
            return { ok: true, bytes: 0, fetched: false };
        }

        try {
            // Квоту проверяем редко лёгким snapshot — не на каждый файл.
            this._downloadsSinceQuotaCheck = (this._downloadsSinceQuotaCheck || 0) + 1;
            if (
                this._downloadsSinceQuotaCheck >= 25 &&
                window.RbiStorageManager &&
                typeof window.RbiStorageManager.getStorageSnapshot === 'function'
            ) {
                this._downloadsSinceQuotaCheck = 0;
                const snap = await window.RbiStorageManager.getStorageSnapshot();
                if (
                    snap.mode === 'critical_cleanup' &&
                    typeof window.RbiStorageManager.runAdaptiveStorageCleanup === 'function'
                ) {
                    await window.RbiStorageManager.runAdaptiveStorageCleanup('before_download');
                }
            }

            const cached = await dbGet(STORES.PHOTOS, url);
            if (cached && cached.data) {
                const existingBytes = cached.size_bytes || cached.sizeBytes || cached.data.byteLength || 0;
                if (!skipMemoryCache) {
                    const mime = cached.mimeType || cached.mime_type || 'application/octet-stream';
                    const blob = cached.data instanceof Blob
                        ? cached.data
                        : new Blob([cached.data], { type: mime });
                    const localUrl = URL.createObjectURL(blob);
                    this._rememberObjectUrl(url, localUrl);
                }
                return { ok: true, bytes: existingBytes, fetched: false };
            }

            const res = await rbiFetchCloudFileNoBrowserCache(url);
            if (!res.ok) throw new Error("Файл недоступен");

            const blob = await res.blob();
            const buffer = await blobToArrayBuffer(blob);
            const now = new Date().toISOString();

            await dbPut(STORES.PHOTOS, {
                id: url,
                data: buffer,
                mimeType: blob.type || 'application/octet-stream',
                mime_type: blob.type || 'application/octet-stream',
                sizeBytes: buffer.byteLength,
                size_bytes: buffer.byteLength,
                createdAt: now,
                created_at: now,
                cachedAt: now,
                cached_at: now,
                lastAccessedAt: now,
                last_accessed_at: now,
                sourceUrl: url,
                source_url: url,
                cacheStatus: 'cached_cloud',
                cache_status: 'cached_cloud',
                entityType: window.RbiStorageManager ? window.RbiStorageManager.guessEntityTypeByUrl(url) : 'unknown_file',
                entity_type: window.RbiStorageManager ? window.RbiStorageManager.guessEntityTypeByUrl(url) : 'unknown_file'
            });
            if (window.RbiStorageManager && typeof window.RbiStorageManager.markCloudFileCached === 'function') {
                await window.RbiStorageManager.markCloudFileCached(
                    url,
                    buffer.byteLength,
                    blob.type || 'application/octet-stream'
                );
            }
            if (!skipMemoryCache) {
                const localUrl = URL.createObjectURL(blob);
                this._rememberObjectUrl(url, localUrl);
            }
            return { ok: true, bytes: buffer.byteLength, fetched: true };
        } catch (e) {
            console.warn('[PhotoManager] downloadForOffline error:', e);
            return { ok: false, bytes: 0, fetched: false };
        }
    }
};

// Найдено при проверке блока (класс риска 3, не покрыт исходным аудитом — проверял только top-level function,
// не top-level const-объекты): PhotoManager вызывается bare-идентификатором из множества внешних classic/module файлов
// (session.service.js, bootstrap.js, sync-engine.core.js, knowledge.module.js и др.).
window.PhotoManager = PhotoManager;

// P2-0023: единый ленивый загрузчик фото (раньше — IntersectionObserver в bootstrap.js
// и последовательный обход в rbiHydrateLocalImages).
if (typeof IntersectionObserver !== 'undefined') {
    const loader = createPhotoLazyLoader({
        resolve: (ref, opts) => PhotoManager.resolvePhoto(ref, opts),
        placeholderFor: (state) => (typeof window.rbiPhotoPlaceholderFor === 'function'
            ? window.rbiPhotoPlaceholderFor(state)
            : (window.rbiPhotoPlaceholder || '')),
        IntersectionObserver,
        document,
        maxConcurrent: 4,
        rootMargin: '300px',
        viewportHeight: () => window.innerHeight || 800
    });
    window.RbiPhotoLoader = loader;

    // «Не удалось загрузить — нажмите, чтобы повторить»: нажатие повторяет, а не открывает просмотр.
    document.addEventListener('click', (e) => {
        const img = e.target && e.target.closest ? e.target.closest('img[data-photo-state="error"]') : null;
        if (!img) return;
        e.preventDefault();
        e.stopPropagation();
        loader.retry(img);
    }, true);
    // Сеть появилась — догружаем «загрузится при подключении».
    window.addEventListener('online', () => {
        loader.retryState('offline');
        loader.retryState('error');
    });
}

// Глобальная функция для HTML разметки
window.getPhotoSrc = (url) => PhotoManager.getSrc(url);
window.getPhotoThumbSrc = (url) => PhotoManager.getThumbSrc(url);

// Обновленная функция авто-миграции
async function runPhotoMigration(historyArray) {
    for (let item of historyArray) {
        let itemChanged = false;
        if (item.photos) {
            for (let key in item.photos) {
                const photoData = item.photos[key];
                if (photoData && photoData.startsWith('data:image')) {
                    const localUrl = await PhotoManager.saveLocal(photoData, 'migr');
                    item.photos[key] = localUrl;
                    itemChanged = true;
                }
            }
        }
        if (itemChanged) await dbPut(STORES.HISTORY, item);
    }
}

window.runPhotoMigration = runPhotoMigration;
