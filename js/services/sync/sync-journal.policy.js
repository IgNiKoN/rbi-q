/* Файл: js/services/sync/sync-journal.policy.js — P2-0059 «Журнал синхронизации на телефоне» (С9).
 * Последние JOURNAL_MAX событий: начало и конец прохода, сколько отправлено и получено, ошибка, длительность, состояние связи.
 * Только на устройстве, у базы «компания + пользователь»; без содержимого записей и персональных данных —
 * события собираются из белого списка полей, ошибка — только код и вид («нет связи», «нет прав»), не текст сервера.
 * Unit-тесты — js/shared/__tests__/sync-journal.policy.test.js.
 */
'use strict';

export const JOURNAL_MAX = 500;
export const JOURNAL_KEY_PREFIX = 'rbi_sync_journal:';

const KINDS = ['start', 'end', 'skip', 'probe', 'error', 'chunk', 'stop'];
const NETS = ['online', 'offline', 'server', 'no_network', 'unknown'];
const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

/** Ключ журнала — у базы устройства (компания + пользователь): другой пользователь на том же телефоне видит свой журнал. */
export function journalKey(dbName) {
    return JOURNAL_KEY_PREFIX + String(dbName || 'default');
}

/** Вид ошибки без текста сервера (там могут быть данные записи). */
const KINDS_RU = /^(нет ответа|нет фото на устройстве|нет прав|нет связи|сбой|сервер \d{3}|отклонено [0-9A-Z]{3,8})$/;

export function errorKind(e) {
    if (!e) return '';
    if (typeof e === 'string' && KINDS_RU.test(e)) return e; // уже вид ошибки (событие очищено раньше)
    const code = String(e.code || '');
    const status = Number(e.status || e.statusCode || 0);
    const m = String(e.message || e || '');
    if (code === 'RBI_REQUEST_TIMEOUT') return 'нет ответа';
    if (code === 'RBI_MISSING_LOCAL_FILE') return 'нет фото на устройстве';
    if (/row-level security|permission denied|42501/i.test(m) || status === 401 || status === 403) return 'нет прав';
    if (status >= 500) return 'сервер ' + status;
    if (/Failed to fetch|NetworkError|network|aborted|Load failed/i.test(m)) return 'нет связи';
    if (status) return 'отклонено ' + status;
    if (/^[0-9A-Z]{5}$/.test(code) || /^PGRST/.test(code)) return 'отклонено ' + code;
    return 'сбой';
}

const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : undefined);

/** Событие из белого списка полей: ни текста записей, ни ФИО. */
export function sanitizeEvent(ev, nowIso) {
    const e = ev || {};
    const out = { t: typeof e.t === 'string' ? e.t.slice(0, 30) : (nowIso || new Date().toISOString()), k: KINDS.includes(e.k) ? e.k : 'error' };
    if (NETS.includes(e.net)) out.net = e.net;
    for (const f of ['pushed', 'pulled', 'unsent', 'ms', 'chunk', 'attention', 'rejected']) { const v = num(e[f]); if (v !== undefined && e[f] !== undefined) out[f] = v; }
    if (e.mode === 'manual' || e.mode === 'silent') out.mode = e.mode;
    if (typeof e.ok === 'boolean') out.ok = e.ok;
    const rep = num(e.n); if (rep !== undefined && e.n !== undefined && rep > 1) out.n = rep;
    if (e.err) out.err = errorKind(e.err);
    if (typeof e.why === 'string' && /^[a-z_]{1,30}$/.test(e.why)) out.why = e.why;
    if (Array.isArray(e.ids)) {
        const ids = e.ids.map((x) => ({ type: String((x && x.type) || '').replace(/[^a-z_]/g, '').slice(0, 20), id: String((x && x.id) || '') }))
            .filter((x) => ID_RE.test(x.id)).slice(0, 20);
        if (ids.length) out.ids = ids;
    }
    return out;
}

/** Добавить событие, хранить последние max. */
export function journalAppend(list, ev, max = JOURNAL_MAX, nowIso) {
    const arr = Array.isArray(list) ? list.slice() : [];
    arr.push(sanitizeEvent(ev, nowIso));
    return arr.length > max ? arr.slice(arr.length - max) : arr;
}

const KIND_RU = { start: 'начало', end: 'конец', skip: 'не начат', probe: 'проверка связи', error: 'ошибка', chunk: 'порция', stop: 'остановлен — 90 с без ответа' };
const NET_RU = { online: 'связь есть', offline: 'нет ответа сервера', server: 'сервер не отвечает (5xx)', no_network: 'нет сети у телефона', unknown: '' };
const WHY_RU = { busy: 'идёт в другой вкладке' };

/** Последняя успешная отправка (конец прохода без ошибок) — время ISO или ''. */
export function lastOkAt(list) {
    const arr = Array.isArray(list) ? list : [];
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] && arr[i].k === 'end' && arr[i].ok === true) return arr[i].t;
    return '';
}

/** Тон строки для экрана: ok (успешный конец), bad (ошибка, остановка, конец с ошибкой), warn (не начат), '' — обычная. */
export function eventTone(e) {
    if (!e) return '';
    if (e.k === 'end') return e.ok === false ? 'bad' : 'ok';
    if (e.k === 'error' || e.k === 'stop') return 'bad';
    if (e.k === 'skip') return 'warn';
    return '';
}

/** Строка журнала для экрана. */
export function eventLine(e) {
    const parts = [KIND_RU[e.k] || e.k];
    if (e.net && NET_RU[e.net]) parts.push(NET_RU[e.net]);
    if (e.why && WHY_RU[e.why]) parts.push(WHY_RU[e.why]);
    if (e.pushed !== undefined) parts.push('отправлено ' + e.pushed);
    if (e.pulled !== undefined) parts.push('получено ' + e.pulled);
    if (e.unsent !== undefined) parts.push('не отправлено ' + e.unsent);
    if (e.rejected) parts.push('отклонено ' + e.rejected);
    if (e.attention) parts.push('нужно внимание ' + e.attention);
    if (e.err) parts.push(e.err);
    if (e.ms !== undefined) parts.push((Math.round(e.ms / 100) / 10) + ' с');
    if (e.n > 1) parts.push('×' + e.n);
    if (e.ids) parts.push(e.ids.map((x) => (x.type ? x.type + ':' : '') + x.id).join(', '));
    return parts.join(' · ');
}

/** «Скопировать отчёт для разработчика»: устройство + журнал, без данных записей. */
export function journalReport(list, meta) {
    const m = meta || {};
    const head = [
        'Журнал синхронизации RBI-Q',
        'Создан: ' + (m.now || new Date().toISOString()),
        'Версия приложения: ' + (m.version || '—'),
        'Браузер: ' + String(m.ua || '—').slice(0, 160),
        'Сеть у телефона: ' + (m.onLine === false ? 'нет' : 'есть'),
        'Не отправлено: ' + (m.unsent === undefined ? '—' : m.unsent),
        'Последняя успешная отправка: ' + (m.lastOk || '—'),
        'Событий: ' + (Array.isArray(list) ? list.length : 0),
        ''
    ];
    return head.concat((list || []).map((e) => e.t + '  ' + eventLine(e))).join('\n');
}

if (typeof window !== 'undefined') {
    window.RbiSyncJournalPolicy = { JOURNAL_MAX, JOURNAL_KEY_PREFIX, journalKey, errorKind, sanitizeEvent, journalAppend, eventLine, journalReport, lastOkAt, eventTone };
}
