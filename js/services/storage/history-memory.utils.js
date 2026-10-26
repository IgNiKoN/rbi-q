/* Файл: js/services/storage/history-memory.utils.js — P2-0024 этап 4.
 * «Облегчить проверку» для истории в памяти (window.contractorArray): каждая запись, прочитанная
 * из базы устройства, — отдельная копия со своими экземплярами одинаковых строк («ok»/«fail»,
 * подрядчик, объект, шаблон, статусы и тексты метрик). Здесь повторяющиеся строки выбранных полей
 * заменяются одним общим экземпляром. Содержимое записи НЕ меняется (те же поля и значения),
 * поэтому потребителям (аудит, история, аналитика, ТИВИ, ИИ, экспорт, геймификация, синхронизация)
 * ничего не нужно читать из базы дополнительно. Замер (V8, 10 000 проверок): −16% памяти истории.
 * Удаление «тяжёлых» полей памяти не экономит (проверено) — поэтому не применяется.
 * Чистые функции; unit-тесты — js/shared/__tests__/history-memory.utils.test.js.
 */
'use strict';

/** Поля верхнего уровня с повторяющимися значениями (имена, коды, статусы). */
const TOP_FIELDS = [
    'projectName', 'project_canonical_key', 'project_display_name', 'projectId', 'project_code',
    'inspectorName', 'inspector_name', 'engineer_name', 'owner', 'created_by',
    'contractorName', 'contractor_name', 'contractor_raw_name', 'contractor_canonical_key',
    'contractor_normalization_status', 'contractorId',
    'templateKey', 'templateTitle', 'section', 'floor', 'room', 'location', 'stageName',
    'syncStatus', 'sync_status', 'syncBlockReason', 'sync_block_reason', 'source', 'inspection_type',
    'checklistSnapshotRef'
];

/** Длинные строки (комментарии, тексты) почти не повторяются — в общий словарь не кладём. */
const MAX_LEN = 160;

/** Общий словарь строк (одна Map на приложение). */
export function createStringPool() {
    return new Map();
}

function intern(v, pool) {
    if (typeof v !== 'string' || v.length > MAX_LEN) return v;
    const x = pool.get(v);
    if (x !== undefined) return x;
    pool.set(v, v);
    return v;
}

/**
 * Облегчить проверку для памяти: на месте заменяет повторяющиеся строки общими экземплярами.
 * Значения не меняются (JSON записи до = после). Возвращает ту же запись.
 * @param {any} record запись app_history
 * @param {Map<string,string>} pool словарь из createStringPool()
 */
export function lightenInspection(record, pool) {
    if (!record || typeof record !== 'object' || !pool) return record;
    for (const k of TOP_FIELDS) {
        if (typeof record[k] === 'string') record[k] = intern(record[k], pool);
    }
    const st = record.state;
    if (st && typeof st === 'object') for (const k in st) st[k] = intern(st[k], pool);
    const det = record.details;
    if (det && typeof det === 'object') {
        for (const k in det) {
            const d = det[k];
            if (!d || typeof d !== 'object') continue;
            for (const f in d) if (f !== 'comment') d[f] = intern(d[f], pool);
        }
    }
    const m = record.metrics;
    if (m && typeof m === 'object') {
        for (const k in m) {
            const v = m[k];
            if (typeof v === 'string') m[k] = intern(v, pool);
            else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) v[i] = intern(v[i], pool);
        }
    }
    const stages = record.checkedStagesInfo;
    if (Array.isArray(stages)) for (let i = 0; i < stages.length; i++) stages[i] = intern(stages[i], pool);
    return record;
}

if (typeof window !== 'undefined') {
    const pool = createStringPool();
    window.RbiHistoryMemory = {
        createStringPool,
        lightenInspection,
        /** Облегчить запись общим словарём приложения (для мест, где история попадает в память). */
        lighten: (record) => lightenInspection(record, pool),
        poolSize: () => pool.size
    };
}
