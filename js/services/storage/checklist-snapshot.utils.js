/* Файл: js/services/storage/checklist-snapshot.utils.js — P2-0024 этап 3.
 * Снимок чек-листа (checklistSnapshot) хранится один раз на версию шаблона — в хранилище
 * checklist_snapshots по хэшу, а в проверке остаётся ссылка checklistSnapshotRef.
 * Раньше снимок лежал копией в каждой проверке (46% объёма базы устройства на 3000 проверок).
 * На сервер снимок не уходит (sync-engine.core.js собирает строку проверки из отдельных полей).
 * Чистые функции (unit-тесты — js/shared/__tests__/checklist-snapshot.utils.test.js);
 * перевод базы одной транзакцией — storage-db.core.js (rbiMigrateChecklistSnapshots).
 */
'use strict';

/** Метка выполненного перевода в app_state (ставится в той же транзакции, что и перевод). */
export const SNAPSHOT_MIGRATION_KEY = 'checklist_snapshots_v1';

/** 53-битный хэш строки (cyrb53): быстрый, без зависимостей; совпадения дополнительно проверяются сравнением. */
function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Текст снимка — ровно то, что хранилось (JSON.stringify), по нему и хэш, и побайтная сверка. */
export function snapshotJson(snapshot) {
    return JSON.stringify(snapshot);
}

/** Ссылка на снимок: 'cs1_<хэш>_<длина>'. Пустой/не массив → '' (снимка нет — как раньше null). */
export function snapshotRef(snapshot) {
    if (!Array.isArray(snapshot)) return '';
    const json = snapshotJson(snapshot);
    return 'cs1_' + cyrb53(json).toString(36) + '_' + json.length.toString(36);
}

/**
 * План перевода: какие снимки положить в хранилище и как изменить записи.
 * Совпадение хэша при разном тексте (практически невозможно) — к ссылке добавляется суффикс.
 * @param {any[]} records записи app_history (только с checklistSnapshot учитываются)
 * @param {Map<string,string>} [knownJsonById] уже лежащие в хранилище снимки: ссылка → текст
 * @returns {{ snapshots: Map<string, any>, jsonById: Map<string,string>, updates: Array<{ id: any, ref: string }> }}
 */
export function planSnapshotMigration(records, knownJsonById) {
    const jsonById = new Map(knownJsonById || []);
    const snapshots = new Map();
    const updates = [];
    for (const r of records || []) {
        if (!r || !Array.isArray(r.checklistSnapshot)) continue;
        const ref = assignRef(r.checklistSnapshot, jsonById, snapshots);
        updates.push({ id: r.id, ref });
    }
    return { snapshots, jsonById, updates };
}

/** Подобрать ссылку для снимка с учётом уже известных (общая часть плана и потокового перевода). */
export function assignRef(snapshot, jsonById, newSnapshots) {
    const json = snapshotJson(snapshot);
    const base = snapshotRef(snapshot);
    let ref = base;
    for (let n = 1; jsonById.has(ref) && jsonById.get(ref) !== json; n++) ref = base + '_' + n;
    if (!jsonById.has(ref)) {
        jsonById.set(ref, json);
        if (newSnapshots) newSnapshots.set(ref, snapshot);
    }
    return ref;
}

/** Запись проверки после перевода: без копии снимка, со ссылкой (остальные поля — как были). */
export function withSnapshotRef(record, ref) {
    const out = Object.assign({}, record);
    delete out.checklistSnapshot;
    out.checklistSnapshotRef = ref;
    return out;
}

/**
 * Снимок чек-листа проверки: старый формат (копия в записи) или по ссылке из хранилища.
 * @param {any} record
 * @param {(ref: string) => any} getByRef синхронный доступ к уже загруженным снимкам
 * @returns {any[]|null}
 */
export function resolveSnapshot(record, getByRef) {
    if (!record) return null;
    if (Array.isArray(record.checklistSnapshot)) return record.checklistSnapshot;
    if (record.checklistSnapshotRef && typeof getByRef === 'function') {
        const s = getByRef(record.checklistSnapshotRef);
        return Array.isArray(s) ? s : null;
    }
    return null;
}

if (typeof window !== 'undefined') {
    window.RbiChecklistSnapshots = Object.assign(window.RbiChecklistSnapshots || {}, {
        SNAPSHOT_MIGRATION_KEY, snapshotJson, snapshotRef, planSnapshotMigration, assignRef, withSnapshotRef, resolveSnapshot
    });
}
