/**
 * history.state.js
 * Изолированное состояние модуля History.
 *
 * Единый источник правды для данных истории проверок.
 * Все модули читают данные через window.HistoryState.allRecords.
 */

/**
 * P2-0024: список Журнала из истории в памяти — тот же набор и порядок, что даёт индекс by_date
 * (direction 'prev'): только живые записи с ключом даты (строка/число), новые сверху; числа ниже строк
 * (порядок ключей IndexedDB), при равной дате — по id по убыванию. Объекты общие с contractorArray (без копий).
 */
function _idbKeyCmp(a, b) {
    const ta = typeof a === 'number' ? 0 : 1, tb = typeof b === 'number' ? 0 : 1;
    if (ta !== tb) return ta - tb;
    return a < b ? -1 : (a > b ? 1 : 0);
}
export function historyListFromMemory(arr) {
    const list = [];
    for (const i of arr || []) {
        if (!i || i._deleted === true || i.is_deleted === true) continue;
        const d = i.date;
        if (typeof d !== 'string' && !(typeof d === 'number' && Number.isFinite(d))) continue;
        list.push(i);
    }
    list.sort((x, y) => _idbKeyCmp(y.date, x.date) || _idbKeyCmp(y.id, x.id));
    return list;
}

const DELETE_FLAG_KEYS = ['_deleted', 'is_deleted', '_deletedAt', 'updatedAt', 'updated_at', 'source',
    'syncStatus', 'sync_status', 'syncBlockReason'];

/** P2-0025: копия записи с пометкой удаления (для сохранения в базу; сама запись не меняется). */
export function deletedHistoryCopy(item, nowIso) {
    const now = nowIso || new Date().toISOString();
    return Object.assign({}, item, {
        _deleted: true,
        is_deleted: true,
        _deletedAt: now,
        updatedAt: now,
        updated_at: now,
        source: 'local',
        syncStatus: 'not_synced',
        sync_status: 'not_synced',
        syncBlockReason: ''
    });
}

/** P2-0025: только поля пометки удаления из сохранённой копии — перенести на запись в памяти. */
export function deletedHistoryFlags(copy) {
    const out = {};
    DELETE_FLAG_KEYS.forEach((k) => { out[k] = copy[k]; });
    return out;
}

export const HistoryState = {

    records: [],
    allRecords: [],
    selectedIds: [],

    filters: {
        period: 'all',
        contractor: '',
        object: '',
        status: '',
        searchText: ''
    },

    visibleGroupCount: 20,
    hasMore: false,

    // Постраничная (курсорная) загрузка Журнала (см. отчёт по оптимизации
    // журнала/аналитики). pageCursorKey — значение поля `date` последней
    // полученной записи, pageCursorPrimaryKey — её id (используются ВМЕСТЕ как
    // точная граница для следующей страницы через индекс by_date — см.
    // dbGetPageByIndex, storage-db.core.js: одного только значения даты
    // недостаточно при совпадающих датах у нескольких записей).
    // pageHasMore — есть ли ещё записи в базе за текущим курсором.
    // isLoadingPage — защита от повторного параллельного запроса следующей страницы.
    // initialObjectTarget — сколько верхнеуровневых объектов (площадок) набрать
    // при первом заходе, докручивая страницы без участия пользователя.
    pageCursorKey: null,
    pageCursorPrimaryKey: null,
    pageHasMore: false,
    isLoadingPage: false,
    pageSize: 50,
    initialObjectTarget: 20,

    /* ── Сеттеры ─────────────────────────────────────────────────────── */

    // P2-0024 доработка 1: номер версии списка — порция из базы, пришедшая после замены списка, отбрасывается
    listGen: 0,

    setRecords(arr) {
        this.allRecords = arr || [];
        this.records = this.allRecords;
        this.listGen++;
        this.memorySource = null;
        this.memorySourceLen = 0;
    },

    // P2-0025: список построен из истории в памяти — запоминаем, из какого массива (и его длину),
    // чтобы заметить замену window.contractorArray синхронизацией (или добавление в него).
    memorySource: null,
    memorySourceLen: 0,

    setRecordsFromMemory(mem) {
        this.setRecords(historyListFromMemory(mem));
        this.memorySource = mem;
        this.memorySourceLen = mem ? mem.length : 0;
    },

    /**
     * P2-0025: список из памяти, а история в памяти с тех пор заменена/дополнена — перестроить.
     * Возвращает true, если список перестроен (порционный список из базы не трогается).
     */
    refreshFromMemoryIfStale() {
        if (!this.memorySource) return false;
        const mem = (typeof window !== 'undefined' && Array.isArray(window.contractorArray)) ? window.contractorArray : null;
        // пустая история в памяти (ещё не загружена / выход) — список не трогаем, как раньше
        if (!mem || !mem.length || (mem === this.memorySource && mem.length === this.memorySourceLen)) return false;
        this.setRecordsFromMemory(mem);
        return true;
    },

    appendRecords(arr) {
        var toAppend = arr || [];
        this.allRecords = this.allRecords.concat(toAppend);
        this.records = this.allRecords;
    },

    setPageState(patch) {
        if (patch && typeof patch === 'object') {
            Object.assign(this, patch);
        }
    },

    /**
     * P2-0024: список Журнала из истории в памяти (вместо порций-копий из базы), если она уже загружена,
     * а список ещё порционный. Возвращает true, если список заменён.
     */
    useMemoryHistoryIfReady() {
        const mem = (typeof window !== 'undefined' && Array.isArray(window.contractorArray)) ? window.contractorArray : null;
        if (this.refreshFromMemoryIfStale()) return true;
        if (!mem || !mem.length || !this.pageHasMore) return false;
        this.setRecordsFromMemory(mem);
        this.pageCursorKey = null;
        this.pageCursorPrimaryKey = null;
        this.pageHasMore = false;
        this.isLoadingPage = false; // идущая догрузка порции из базы будет отброшена (listGen сменился)
        return true;
    },

    resetPagination() {
        this.pageCursorKey = null;
        this.pageCursorPrimaryKey = null;
        this.pageHasMore = false;
        this.isLoadingPage = false;
    },

    setFilters(patch) {
        if (patch && typeof patch === 'object') {
            Object.assign(this.filters, patch);
        }
    },

    resetFilters() {
        this.filters = {
            period: 'all',
            contractor: '',
            object: '',
            status: '',
            searchText: ''
        };
    },

    setSelectedIds(ids) {
        this.selectedIds = Array.isArray(ids) ? ids : [];
    },

    setVisibleGroupCount(n) {
        this.visibleGroupCount = typeof n === 'number' && n > 0 ? n : 20;
    }
};

if (typeof window !== 'undefined') {
    window.HistoryState = HistoryState;
}

console.log('[HistoryState] history.state.js loaded');
