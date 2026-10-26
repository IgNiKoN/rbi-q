/* Файл: js/services/storage/storage-db.core.js — перенесено из js/storage.js без изменения логики */
/* Файл: js/storage.js */

// P2-0016: при входе почтой у каждой компании своя локальная база (PLATFORM2_DB_<компания>); компанию записывает
// src/platform/auth/quality-bridge.ts (ключ platform2_quality_company) и перезагружает страницу при её смене.
// P2-0018: и у каждого пользователя компании — своя (PLATFORM2_DB_<компания>_<пользователь>, ключ platform2_quality_user).
const DB_NAME = (function () {
    const base = (window.APP_CONFIG && window.APP_CONFIG.LOCAL_DB_NAME) || 'PLATFORM2_DB';
    let company = '', user = '';
    try { company = localStorage.getItem('platform2_quality_company') || ''; user = localStorage.getItem('platform2_quality_user') || ''; } catch (e) { company = ''; }
    if (!/^[0-9a-f-]{36}$/i.test(company)) return base;
    return /^[0-9a-f]{16}$/.test(user) ? base + '_' + company + '_' + user : base + '_' + company;
}());
// Повышаем версию только при изменении структуры IndexedDB
const DB_VERSION = 30; // БЫЛО 29, СТАЛО 30 — P2-0024: хранилище снимков чек-листа checklist_snapshots

// Глобально отдаём версию БД в интерфейс диагностики
window.RBI_DB_VERSION = DB_VERSION;
window.RBI_DB_NAME = DB_NAME;   // P2-0016: «Сброс данных» удаляет базу текущей компании

const STORES = {
    // --- НОВЫЕ ТАБЛИЦЫ ДЛЯ СТРОЙКОНТРОЛЯ ---
    CONST_OBJECTS: 'construction_objects',
    CONST_BUILDINGS: 'construction_buildings',
    CONST_FLOORS: 'construction_floors',
    CONST_DEFECTS: 'construction_defects',
    CONST_UNITS: 'construction_units',           
    CONST_ACCEPTANCE: 'construction_acceptance',  // <-- НОВОЕ (Заявки на приемку)
    // ---------------------------------------

    OBJECT_QUEUE: 'object_normalization_queue',
    STATE: 'app_state',
    HISTORY: 'app_history',
    SETTINGS: 'app_settings',
    TEMPLATES: 'user_templates',
    PHOTOS: 'app_photos',
    REPORTS: 'app_reports',
    REPORT_TEMPLATES: 'report_templates',
    TASKS: 'rbi_tasks',
    SCHEDULE: 'rbi_schedule_stages',
    MEETINGS: 'rbi_meetings',
    INTERVENTIONS: 'rbi_interventions',
    PRACTICES: 'rbi_practices',
    ETALON_ACTS: 'rbi_etalon_acts',
    ETALON_DRAFT: 'rbi_etalon_draft',
    FMEA: 'rbi_fmea',
    SK_IMPORTS: 'sk_imports',

    SK_RECORDS: 'sk_records',
    SK_IMPORT_BATCHES: 'sk_import_batches',

    SK_CONTRACTOR_MAP: 'sk_contractor_map',
    SK_VOLUMES: 'sk_volumes',
    SK_ISD_HISTORY: 'sk_isd_history',
    SK_CATEGORY_MAP: 'sk_category_map',
    SK_MAPPING: 'sk_mapping',

    CONTRACTOR_DIRECTORY: 'contractor_directory',
    CONTRACTOR_ALIASES: 'contractor_aliases',
    CONTRACTOR_QUEUE: 'contractor_normalization_queue',
    CONTRACTS: 'contracts',
    LOCATION_NODES: 'location_nodes',
    LOCATION_NODE_ALIASES: 'location_node_aliases',
    CONST_FLOORS_V2: 'construction_floors_v2',
    CONST_DEFECTS_V2: 'construction_defects_v2',
    CONST_ACCEPTANCE_V2: 'construction_acceptance_v2',
    CONST_UNITS_V2: 'construction_units_v2',
    PROJECT_OBJECTS: 'project_objects',
    OBJECT_ALIASES: 'object_aliases',
    BACKUP_LOGS: 'backup_logs',
    GAME_LOGS: 'game_logs',
    TWI_CARDS: 'twi_cards',
    CUSTOM_DOCS: 'custom_docs',
    CUSTOM_NODES: 'custom_nodes',
    FEEDBACK_LIST: 'feedback_list',
    ASSISTANT_KB: 'app_assistant_kb',
    FILE_REGISTRY: 'file_registry_cache',
    STORAGE_EVENTS: 'storage_events',
    SYNC_QUEUE: 'sync_queue',
    CHECKLIST_SNAPSHOTS: 'checklist_snapshots' // P2-0024: снимок чек-листа один раз на версию шаблона (id = ссылка)
};
window.STORES = STORES;

// Индексы Object Store → [{ name, keyPath }]. onupgradeneeded создаёт только
// отсутствующие — безопасно для уже заполненной локальной БД (upgrade 23→24).
// by_contractor_date не добавляем: пагинация журнала идёт по by_date (YAGNI).
const INDEX_DEFINITIONS = {
    [STORES.HISTORY]: [
        { name: 'by_date', keyPath: 'date' },
        { name: 'by_contractor', keyPath: 'contractorName' },
        // Мягко удалённые (_deleted:true). Записи без поля в индекс не попадают —
        // getActive() по-прежнему фильтрует после чтения; индекс для точечных выборок.
        { name: 'by_deleted', keyPath: '_deleted' }
    ]
};
window.INDEX_DEFINITIONS = INDEX_DEFINITIONS;

/**
 * Инициализация и открытие базы данных IndexedDB (Singleton).
 * Self-heal: если версия уже ≥ DB_VERSION, но какого-то store из STORES нет
 * (типичный случай: bump версии без store / частично закэшированный storage-db),
 * закрываем соединение и форсируем upgrade на db.version+1.
 * Если self-heal ранее поднял IDB выше константы DB_VERSION — открываем текущую
 * версию (без downgrade), иначе VersionError «requested < existing».
 */
let _dbPromise = null;

function _missingStores(db) {
    return Object.values(STORES).filter((storeName) => !db.objectStoreNames.contains(storeName));
}

/** Открыть БД на уже существующей версии (без указания version). */
function _openDbCurrent() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME);
        request.onblocked = function () {
            console.error('IndexedDB заблокирована! Закройте другие вкладки.');
            if (typeof showToast === 'function') {
                showToast('⚠️ Закройте все вкладки приложения и откройте заново!');
            }
            reject(new Error('БД заблокирована'));
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => {
                db.__rbiClosed = true; // P2-0025: закрыта из-за смены версии (другая вкладка)
                db.close();
                _dbPromise = null;
                if (typeof showToast === 'function') {
                    showToast('⚠️ База данных обновлена. Пожалуйста, перезагрузите страницу.');
                }
            };
            resolve(db);
        };
        request.onerror = () => reject(request.error);
    });
}

function _applySchemaUpgrade(db, upgradeTx) {
    Object.values(STORES).forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
            let keyOptions = { keyPath: 'id' };
            if (storeName === STORES.STATE || storeName === STORES.SETTINGS) keyOptions = { keyPath: 'key' };
            if (storeName === STORES.TEMPLATES) keyOptions = { keyPath: 'slug' };
            db.createObjectStore(storeName, keyOptions);
        }
    });

    Object.keys(INDEX_DEFINITIONS).forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) return;
        const store = upgradeTx.objectStore(storeName);
        (INDEX_DEFINITIONS[storeName] || []).forEach((def) => {
            if (!store.indexNames.contains(def.name)) {
                store.createIndex(def.name, def.keyPath, def.options || {});
            }
        });
    });
}

function _openDbAtVersion(version) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, version);

        request.onupgradeneeded = function (event) {
            _applySchemaUpgrade(event.target.result, event.target.transaction);
        };

        request.onblocked = function () {
            console.error('IndexedDB заблокирована! Закройте другие вкладки.');
            if (typeof showToast === 'function') {
                showToast('⚠️ Закройте все вкладки приложения и откройте заново!');
            }
            reject(new Error('БД заблокирована'));
        };

        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => {
                db.__rbiClosed = true; // P2-0025: закрыта из-за смены версии (другая вкладка)
                db.close();
                _dbPromise = null;
                if (typeof showToast === 'function') {
                    showToast('⚠️ База данных обновлена. Пожалуйста, перезагрузите страницу.');
                }
            };
            resolve(db);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

function openAppDb() {
    if (!_dbPromise) {
        _dbPromise = (async () => {
            let db;
            try {
                db = await _openDbAtVersion(DB_VERSION);
            } catch (err) {
                if (err && err.name === 'VersionError') {
                    console.warn('[DB] Requested version', DB_VERSION, '< existing — opening current');
                    db = await _openDbCurrent();
                } else {
                    throw err;
                }
            }
            let missing = _missingStores(db);
            if (missing.length) {
                const bump = db.version + 1;
                console.warn('[DB] Missing object stores — forcing upgrade →', bump, missing);
                try {
                    db.close();
                } catch (_) {
                    /* ignore */
                }
                db = await _openDbAtVersion(bump);
                missing = _missingStores(db);
                if (missing.length) {
                    console.error('[DB] Stores still missing after forced upgrade:', missing);
                }
            }
            window.RBI_DB_VERSION = Math.max(DB_VERSION, db.version);
            // P2-0024: один раз — снимки чек-листа из проверок в отдельное хранилище (до любого чтения истории).
            try {
                await rbiMigrateChecklistSnapshots(db);
            } catch (e) {
                console.warn('[DB] Перевод снимков чек-листа не выполнен (данные не тронуты):', e);
            }
            // P2-0025 (ТД №164): во время перевода другая вкладка сменила версию — база закрыта;
            // не отдаём закрытую, а открываем заново (не больше двух раз подряд).
            if (db.__rbiClosed) {
                if ((openAppDb._reopens = (openAppDb._reopens || 0) + 1) > 2) {
                    openAppDb._reopens = 0;
                    throw new Error('База закрыта другой вкладкой во время открытия');
                }
                console.warn('[DB] База закрыта сменой версии во время перевода — открываем заново');
                _dbPromise = null;
                return openAppDb();
            }
            openAppDb._reopens = 0;
            return db;
        })().catch((err) => {
            _dbPromise = null;
            throw err;
        });
    }
    return _dbPromise;
}
/**
 * ГЛОБАЛЬНЫЙ НОРМАЛИЗАТОР СИСТЕМНЫХ КЛЮЧЕЙ (JS vs Supabase)
 * Автоматически выравнивает camelCase и snake_case перед любым сохранением в базу.
 */
/**
 * ГЛОБАЛЬНЫЙ НОРМАЛИЗАТОР СИСТЕМНЫХ КЛЮЧЕЙ
 * Автоматически выравнивает структуру, добавляет проект и владельца перед любым сохранением.
 */
function normalizeSystemKeys(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    // 1. УНИВЕРСАЛЬНОЕ КЛЕЙМО ПРОЕКТА
    const pCode = window.syncConfig?.projectCode || 'LOCAL';
    if (!obj.project_code) obj.project_code = pCode;

    // 2. ВЛАДЕЛЕЦ (Критично для RLS политик Supabase)
    const currentEng = window.syncConfig?.engineerName || 'Инженер';
    const owner = obj.owner || obj.created_by || obj.author || obj.inspectorName || obj.engineer_name || currentEng;
    if (!obj.owner) obj.owner = owner;
    if (!obj.created_by) obj.created_by = owner;

    // 3. МЕТКИ УДАЛЕНИЯ (_deleted <-> is_deleted)
    const isDel = obj._deleted === true || obj.is_deleted === true;
    obj._deleted = isDel;
    obj.is_deleted = isDel;

    const delAt = obj._deletedAt || obj.deleted_at || null;
    if (delAt) {
        obj._deletedAt = delAt;
        obj.deleted_at = delAt;
    }

    // 4. СТАТУСЫ СИНХРОНИЗАЦИИ (syncStatus <-> sync_status)
    const sStatus = obj.syncStatus || obj.sync_status || 'not_synced';
    obj.syncStatus = sStatus;
    obj.sync_status = sStatus;

    const sReason = obj.syncBlockReason || obj.sync_block_reason || '';
    obj.syncBlockReason = sReason;
    obj.sync_block_reason = sReason;

    // 5. ВРЕМЕННЫЕ МЕТКИ (updatedAt <-> updated_at)
    const updAt = obj.updatedAt || obj.updated_at || new Date().toISOString();
    obj.updatedAt = updAt;
    obj.updated_at = updAt;

    const creAt = obj.createdAt || obj.created_at;
    if (creAt) {
        obj.createdAt = creAt;
        obj.created_at = creAt;
    }

    return obj;
}
/**
 * Ошибка прерванной транзакции: QuotaExceededError, если браузер так сказал
 * (или так выглядит), иначе AbortError. Вызывающий код уже умеет чистить место по Quota.
 */
function rbiTxAbortError(tx) {
    const err = tx && tx.error;
    if (err) return err;
    try {
        return new DOMException('Транзакция IndexedDB прервана (возможно, нет места)', 'AbortError');
    } catch (_e) {
        const e = new Error('Транзакция IndexedDB прервана');
        e.name = 'AbortError';
        return e;
    }
}

/**
 * P2-0024 этап 3: перевод старых проверок — снимок чек-листа (checklistSnapshot) из каждой записи
 * в хранилище checklist_snapshots (один раз на одинаковый снимок), в записи остаётся checklistSnapshotRef.
 * ОДНА транзакция на app_history + checklist_snapshots + app_state: перед фиксацией перечитываются все
 * затронутые снимки и сверяются побайтно (JSON) с исходными, число проверок до = после; любое расхождение
 * или ошибка (в т.ч. нет места) → abort → IndexedDB откатывает всё, данные остаются в старом формате
 * (он читается как раньше). Метка «сделано» пишется в той же транзакции. После 3 неудач подряд — не пытаемся.
 */
// доработка 1 (ревью №8): свой счётчик у каждой базы (компания / пользователь устройства)
const SNAPSHOT_MIGRATION_FAILS_KEY = 'rbi_checklist_snapshots_migration_fails:' + DB_NAME;
// Чистые функции — js/services/storage/checklist-snapshot.utils.js (подключён в index.html перед этим файлом;
// без import: тесты загружают этот файл как обычный скрипт).
function _cs() { return window.RbiChecklistSnapshots || null; }

function rbiReadMigrationFlag(db, key) {
    return new Promise((resolve) => {
        try {
            const r = db.transaction(STORES.STATE, 'readonly').objectStore(STORES.STATE).get(key);
            r.onsuccess = () => resolve(r.result || null);
            r.onerror = () => resolve(null);
        } catch (_e) {
            resolve(null);
        }
    });
}

async function rbiMigrateChecklistSnapshots(db) {
    const cs = _cs();
    if (!cs) return { skipped: 'no-utils' };
    const { SNAPSHOT_MIGRATION_KEY, snapshotJson, assignRef, withSnapshotRef } = cs;
    if (!db.objectStoreNames.contains(STORES.CHECKLIST_SNAPSHOTS)) return { skipped: 'no-store' };
    const flag = await rbiReadMigrationFlag(db, SNAPSHOT_MIGRATION_KEY);
    if (flag && flag.done) return { skipped: 'done' };
    let fails = 0;
    try { fails = parseInt(localStorage.getItem(SNAPSHOT_MIGRATION_FAILS_KEY) || '0', 10) || 0; } catch (_e) { fails = 0; }
    if (fails >= 3) return { skipped: 'too-many-failures' };

    const t0 = Date.now();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORES.HISTORY, STORES.CHECKLIST_SNAPSHOTS, STORES.STATE], 'readwrite');
        const hist = tx.objectStore(STORES.HISTORY);
        const snaps = tx.objectStore(STORES.CHECKLIST_SNAPSHOTS);
        const jsonById = new Map();
        const newSnaps = new Map();
        const usedRefs = new Set();
        const at = new Date().toISOString();
        let records = 0;
        let migrated = 0;
        let failReason = '';
        const fail = (reason) => {
            if (failReason) return;
            failReason = reason;
            try { tx.abort(); } catch (_e) { /* уже завершена */ }
        };

        const known = snaps.getAll();
        known.onsuccess = () => {
            (known.result || []).forEach((s) => { if (s && s.id) jsonById.set(s.id, snapshotJson(s.snapshot)); });
            const cur = hist.openCursor();
            cur.onsuccess = () => {
                if (failReason) return;
                const c = cur.result;
                if (!c) { verifyAndMark(); return; }
                records++;
                const r = c.value;
                if (r && Array.isArray(r.checklistSnapshot)) {
                    const json = snapshotJson(r.checklistSnapshot);
                    const ref = assignRef(r.checklistSnapshot, jsonById, newSnaps);
                    if (jsonById.get(ref) !== json) { fail('snapshot-mismatch'); return; }
                    usedRefs.add(ref);
                    c.update(withSnapshotRef(r, ref));
                    migrated++;
                }
                c.continue();
            };
        };

        function verifyAndMark() {
            newSnaps.forEach((snapshot, ref) => snaps.put({ id: ref, snapshot, createdAt: at }));
            let pending = usedRefs.size + 1;
            const done = () => {
                if (--pending > 0 || failReason) return;
                tx.objectStore(STORES.STATE).put({
                    key: SNAPSHOT_MIGRATION_KEY, done: true, at, records, migrated, snapshots: newSnaps.size
                });
            };
            usedRefs.forEach((ref) => {
                const g = snaps.get(ref);
                g.onsuccess = () => {
                    if (!g.result || snapshotJson(g.result.snapshot) !== jsonById.get(ref)) fail('verify-snapshot');
                    done();
                };
            });
            const cnt = hist.count();
            cnt.onsuccess = () => {
                if (cnt.result !== records) fail('verify-count');
                done();
            };
        }

        tx.oncomplete = () => {
            try { localStorage.removeItem(SNAPSHOT_MIGRATION_FAILS_KEY); } catch (_e) { /* ignore */ }
            const res = { records, migrated, snapshots: newSnaps.size, ms: Date.now() - t0 };
            if (migrated) console.log('[DB] Снимки чек-листа переведены:', res);
            resolve(res);
        };
        const onFail = () => {
            try { localStorage.setItem(SNAPSHOT_MIGRATION_FAILS_KEY, String(fails + 1)); } catch (_e) { /* ignore */ }
            const err = failReason ? new Error('checklist snapshots: ' + failReason) : rbiTxAbortError(tx);
            reject(err);
        };
        tx.onabort = onFail; // ошибка любого запроса (в т.ч. нет места) по умолчанию прерывает транзакцию → откат
    });
}

/**
 * P2-0024: положить снимок чек-листа в хранилище (если такого ещё нет) и вернуть ссылку для записи проверки.
 * Совпадение хэша при другом тексте — суффикс ссылки (как при переводе).
 */
async function rbiPutChecklistSnapshot(snapshot) {
    const cs = _cs();
    if (!cs) throw new Error('checklist-snapshot.utils.js не загружен');
    const { snapshotJson, snapshotRef } = cs;
    const base = snapshotRef(snapshot);
    if (!base) return '';
    const db = await openAppDb();
    const json = snapshotJson(snapshot);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.CHECKLIST_SNAPSHOTS, 'readwrite');
        const st = tx.objectStore(STORES.CHECKLIST_SNAPSHOTS);
        let ref = base;
        let n = 0;
        const tryRef = () => {
            const g = st.get(ref);
            g.onsuccess = () => {
                if (!g.result) st.put({ id: ref, snapshot, createdAt: new Date().toISOString() });
                else if (snapshotJson(g.result.snapshot) !== json) { n++; ref = base + '_' + n; tryRef(); }
            };
        };
        tryRef();
        tx.oncomplete = () => resolve(ref);
        tx.onerror = () => reject(rbiTxAbortError(tx));
        tx.onabort = () => reject(rbiTxAbortError(tx));
    });
}

/** P2-0024: снимок чек-листа по ссылке (для открытия старой проверки с тем чек-листом, что был). */
async function rbiGetChecklistSnapshot(ref) {
    if (!ref) return null;
    const row = await dbGet(STORES.CHECKLIST_SNAPSHOTS, ref);
    return row && Array.isArray(row.snapshot) ? row.snapshot : null;
}

/**
 * Базовые операции CRUD
 */
async function dbPut(storeName, data, retryAfterCleanup = true) {
    const db = await openAppDb();

    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const normalizedData = normalizeSystemKeys(data);

            store.put(normalizedData);

            tx.oncomplete = () => resolve(true);
            // tx.error бывает null (abort запроса всплывает в onerror раньше, чем tx.error заполнен).
            tx.onerror = () => reject(rbiTxAbortError(tx));
            // P2-0023: при нехватке места транзакция прерывается (abort) без onerror —
            // раньше promise висел вечно и сохранение «молча» не заканчивалось.
            tx.onabort = () => reject(rbiTxAbortError(tx));
        });
    } catch (e) {
        if (e && e.name === 'QuotaExceededError' && retryAfterCleanup) {
            console.warn('[DB] QuotaExceededError. Запускаем аварийную очистку...');

            if (window.RbiStorageManager) {
                await window.RbiStorageManager.runAdaptiveStorageCleanup('quota_exceeded');
            }

            return dbPut(storeName, data, false);
        }

        if (e && e.name === 'QuotaExceededError') {
            if (typeof showToast === 'function') {
                showToast('❌ Память устройства заполнена. Несинхронизированные файлы не удалены.');
            }
        }

        throw e;
    }
}
// МАССОВОЕ СОХРАНЕНИЕ (УСКОРЕНИЕ В 10 РАЗ)
async function dbPutBatch(storeName, itemsArray, retryAfterCleanup = true) {
    if (!itemsArray || itemsArray.length === 0) return true;

    const db = await openAppDb();

    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);

            itemsArray.forEach(item => {
                const normalizedItem = normalizeSystemKeys(item);
                store.put(normalizedItem);
            });

            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(rbiTxAbortError(tx));
            tx.onabort = () => reject(rbiTxAbortError(tx));
        });
    } catch (e) {
        if (e && e.name === 'QuotaExceededError' && retryAfterCleanup) {
            console.warn('[DB] QuotaExceededError batch. Запускаем аварийную очистку...');

            if (window.RbiStorageManager) {
                await window.RbiStorageManager.runAdaptiveStorageCleanup('quota_exceeded');
            }

            return dbPutBatch(storeName, itemsArray, false);
        }

        if (e && e.name === 'QuotaExceededError') {
            if (typeof showToast === 'function') {
                showToast('❌ Память устройства заполнена. Автоочистка не смогла освободить достаточно места.');
            }
        }

        throw e;
    }
}
async function dbGet(storeName, key) {
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** Есть ли ключ в store без чтения value (не поднимает blob в RAM). */
async function dbHasKey(storeName, key) {
    if (key == null || key === '') return false;
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        if (typeof store.getKey === 'function') {
            const req = store.getKey(key);
            req.onsuccess = () => resolve(req.result !== undefined);
            req.onerror = () => reject(req.error);
            return;
        }
        const req = store.count(IDBKeyRange.only(key));
        req.onsuccess = () => resolve((req.result || 0) > 0);
        req.onerror = () => reject(req.error);
    });
}

async function dbGetAll(storeName) {
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();

        req.onsuccess = () => {
            let results = req.result || [];

            // --- ГЛОБАЛЬНАЯ ИЗОЛЯЦИЯ ПРОЕКТОВ ---
            const pCode = window.syncConfig?.projectCode || 'LOCAL';

            // Исключения: эти таблицы общие для всего телефона (настройки, логи, фото-кэш)
            const globalStores = [STORES.STATE, STORES.SETTINGS, STORES.PHOTOS, STORES.BACKUP_LOGS, STORES.GAME_LOGS];

            if (!globalStores.includes(storeName)) {
                results = results.filter(item => {
                    // Разрешаем системные шаблоны и узлы (они начинаются на sys_)
                    if (String(item.id).startsWith('sys_') || String(item.slug).startsWith('sys_')) return true;

                    const itemProject = item.project_code || item.data?.project_code;

                    // Пропускаем записи, если они принадлежат текущему проекту
                    // (или если project_code вообще пустой — это старые локальные данные до обновления)
                    return !itemProject || itemProject === pCode;
                });
            }
            // ------------------------------------

            resolve(results);
        };
        req.onerror = () => reject(req.error);
    });
}

// КУРСОРНОЕ ЧТЕНИЕ СТРАНИЦЫ ПО ИНДЕКСУ (Журнал проверок, DB_VERSION 21).
// Не заменяет dbGetAll — используется точечно там, где нужна страница,
// а не весь стор (см. inspection.service.js getPage()).
// opts: { indexName, limit, direction: 'prev'|'next', range: IDBKeyRange|null,
//         cursorKey: значение поля индекса, с которого продолжить,
//         cursorPrimaryKey: primary key (id) записи, на которой остановилась
//         предыдущая страница — обязателен вместе с cursorKey }
//
// ИСПРАВЛЕНИЕ (см. отчёт "История показывает меньше записей, чем есть в базе"):
// граница по одному только значению cursorKey была ИСКЛЮЧАЮЩЕЙ (upperBound/
// lowerBound с exclusive=true) — если у нескольких записей совпадает значение
// поля `date` (секундная точность ISO-строки, массовый импорт/pull одним
// batch'ем — совсем не редкость), ВСЕ записи с этим значением, кроме уже
// прочитанных на предыдущей странице, навсегда пропускались курсором. Теперь
// граница по cursorKey ВКЛЮЧАЮЩАЯ, а точную позицию (с точностью до записи)
// определяем сами: пропускаем курсором все записи вплоть до и включая
// (cursorKey, cursorPrimaryKey) записи с предыдущей страницы, затем начинаем
// собирать со следующей.
//
// ПОЧЕМУ НЕ cursor.continuePrimaryKey() (первая версия фикса, откачена):
// спецификация IndexedDB требует, чтобы целевая позиция была строго ПОСЛЕ
// текущей позиции курсора — но открытый с включающей границей курсор нередко
// сам сразу встаёт РОВНО на запись (cursorKey, cursorPrimaryKey) (когда её
// значение `date` уникально в пределах диапазона). Вызов continuePrimaryKey
// с координатами собственной текущей позиции запрещён спецификацией и кидает
// `DataError: The parameter is greater than or equal to this cursor's
// position` — воспроизведено при живом клике «Загрузить более старые
// проверки». Ручное сравнение ключей через cursor.continue() (ниже) работает
// в обоих случаях (уникальное и повторяющееся значение `date`) без риска
// этой ошибки.
async function dbGetPageByIndex(storeName, opts) {
    const { indexName, limit = 50, direction = 'prev', range = null, cursorKey = null, cursorPrimaryKey = null } = opts || {};
    const db = await openAppDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);

        let effectiveRange = range;
        const hasCursor = cursorKey !== undefined && cursorKey !== null
            && cursorPrimaryKey !== undefined && cursorPrimaryKey !== null;
        if (hasCursor) {
            // Включающая граница — сама запись (cursorKey, cursorPrimaryKey) и всё,
            // что совпадает с ней по значению `date`, попадут в диапазон курсора;
            // пропускаем их вручную ниже (skipUntilPastCursor), пока не пройдём
            // именно ту запись, primaryKey которой совпадает с cursorPrimaryKey.
            if (direction === 'prev') {
                effectiveRange = IDBKeyRange.upperBound(cursorKey, false);
            } else {
                effectiveRange = IDBKeyRange.lowerBound(cursorKey, false);
            }
        }

        const results = [];
        let lastKey = null;
        let lastPrimaryKey = null;
        // Пока true — курсор идёт по записям с ключом cursorKey и ищет ровно
        // запись с primaryKey === cursorPrimaryKey, чтобы понять, где кончилась
        // предыдущая страница; сама эта запись и всё до неё — не результат.
        let skipUntilPastCursor = hasCursor;
        const pCode = window.syncConfig?.projectCode || 'LOCAL';
        const req = index.openCursor(effectiveRange, direction === 'prev' ? 'prev' : 'next');

        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) {
                resolve({
                    items: results,
                    hasMore: false,
                    nextCursorKey: lastKey,
                    nextCursorPrimaryKey: lastPrimaryKey
                });
                return;
            }

            if (skipUntilPastCursor) {
                // cursor.key !== cursorKey означает, что записей с cursorKey больше
                // нет (все они шли первыми в диапазоне) — искомая запись либо уже
                // прошла, либо её нет вовсе; в любом случае со следующей записи
                // начинаем собирать страницу.
                const isSameKey = indexedDB.cmp(cursor.key, cursorKey) === 0;
                const isCursorRecord = isSameKey && String(cursor.primaryKey) === String(cursorPrimaryKey);
                if (!isSameKey) {
                    skipUntilPastCursor = false;
                    // Не return — обрабатываем эту запись как первую страницы ниже.
                } else {
                    cursor.continue();
                    if (isCursorRecord) skipUntilPastCursor = false;
                    return;
                }
            }

            const item = cursor.value;

            if (results.length >= limit) {
                resolve({
                    items: results,
                    hasMore: true,
                    nextCursorKey: lastKey,
                    nextCursorPrimaryKey: lastPrimaryKey
                });
                return;
            }

            const itemProject = item.project_code || item.data?.project_code;
            const belongsToProject = !itemProject || itemProject === pCode;

            if (belongsToProject) {
                results.push(item);
                lastKey = cursor.key;
                lastPrimaryKey = cursor.primaryKey;
            }
            cursor.continue();
        };
        req.onerror = () => reject(req.error);
    });
}

/** Число записей в store без чтения value (не поднимает данные в RAM). */
async function dbCount(storeName) {
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.count();
        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => reject(req.error);
    });
}

// КУРСОРНЫЙ ПРОХОД ПО СТОРУ (без dbGetAll — не накапливает весь стор в RAM).
// Используется там, где нужно обработать каждую запись по одной (например,
// PHOTOS с тяжёлыми ArrayBuffer в поле data) — см. storage-cache-manager.js.
//
// ВАЖНО: callback ДОЛЖЕН быть синхронным (без await внутри). Асинхронная
// работа (dbPut/dbDelete/сетевые вызовы) между двумя cursor.continue() рвёт
// активность транзакции курсора (TransactionInactiveError) — тяжёлые async
// операции по каждой записи нужно откладывать в отдельный массив лёгких
// дескрипторов (без ссылки на .data) и выполнять ПОСЛЕ resolve этого промиса.
//
// Фильтрация по project_code — как в dbGetAll (см. выше): системные записи
// (id/slug начинается на sys_) всегда проходят, остальные — если project_code
// пуст или совпадает с текущим. Для globalStores фильтрация не применяется.
async function dbForEachCursor(storeName, callback) {
    const db = await openAppDb();
    const pCode = window.syncConfig?.projectCode || 'LOCAL';
    const globalStores = [STORES.STATE, STORES.SETTINGS, STORES.PHOTOS, STORES.BACKUP_LOGS, STORES.GAME_LOGS];
    const isGlobalStore = globalStores.includes(storeName);

    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.openCursor();

        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) {
                resolve();
                return;
            }

            const item = cursor.value;

            if (!isGlobalStore) {
                const isSystemRecord = String(item?.id).startsWith('sys_') || String(item?.slug).startsWith('sys_');
                const itemProject = item?.project_code || item?.data?.project_code;
                const belongsToProject = isSystemRecord || !itemProject || itemProject === pCode;
                if (!belongsToProject) {
                    cursor.continue();
                    return;
                }
            }

            try {
                callback(item);
            } catch (e) {
                reject(e);
                return;
            }

            cursor.continue();
        };
        req.onerror = () => reject(req.error);
    });
}

async function dbDelete(storeName, key) {
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

async function dbClear(storeName) {
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

window.dbPut = dbPut;
window.dbGet = dbGet;
window.dbHasKey = dbHasKey;
window.dbGetAll = dbGetAll;
window.dbGetPageByIndex = dbGetPageByIndex;
window.dbCount = dbCount;
window.dbForEachCursor = dbForEachCursor;
window.dbDelete = dbDelete;
window.dbClear = dbClear;
window.dbPutBatch = dbPutBatch;
window.rbiPutChecklistSnapshot = rbiPutChecklistSnapshot;
window.rbiGetChecklistSnapshot = rbiGetChecklistSnapshot;
window.rbiMigrateChecklistSnapshots = rbiMigrateChecklistSnapshots;

