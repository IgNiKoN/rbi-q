/* Файл: js/services/sync/sync-net.policy.js — P2-0059 «Отправка при плохой связи».
 * Правила отправки чистыми функциями (unit-тесты — js/shared/__tests__/sync-net.policy.test.js):
 * - проверка связи по делу (С1): короткий запрос к своему серверу, ответ за PROBE_TIMEOUT_MS; «сеть есть» у телефона ≠ связь;
 * - ограничение времени на запрос (С2): REQUEST_TIMEOUT_MS, для файлов — по размеру; зависший запрос прерывается;
 * - один проход за раз (С3): запасной замок-аренда для браузеров без navigator.locks; «стоп» прохода — только если
 *   ничего не происходит PASS_IDLE_LIMIT_MS (медленная, но живая отправка не прерывается);
 * - порции (С4): записи уходят по PUSH_CHUNK, после каждой порции — отметка «отправлено»;
 * - умные паузы (С6): после сбоя связи — проверка связи каждую минуту и отправка сразу, как только сервер ответил;
 *   после ошибки сервера (5xx) — пауза 2 / 5 / 10 мин (sync-retry.policy.js).
 */
'use strict';

export const PROBE_TIMEOUT_MS = 4000;
export const REQUEST_TIMEOUT_MS = 25000;
/** Ниже этой скорости отправки файла (байт/с, ≈ 32 кбит/с) связь считаем непригодной — запрос прерывается. */
export const UPLOAD_MIN_BYTES_PER_SEC = 4000;
export const REQUEST_TIMEOUT_MAX_MS = 10 * 60 * 1000;
export const PASS_IDLE_LIMIT_MS = 90000;
export const PUSH_CHUNK = 5;
export const LEASE_MS = 30000;
export const TIMEOUT_CODE = 'RBI_REQUEST_TIMEOUT';

/** Размер тела запроса в байтах (строка, Blob, ArrayBuffer, FormData — по файлам). */
export function bodyBytes(body) {
    if (!body) return 0;
    if (typeof body === 'string') return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(body).length : body.length;
    if (typeof body.size === 'number') return body.size;
    if (typeof body.byteLength === 'number') return body.byteLength;
    if (typeof body.forEach === 'function' && typeof body.append === 'function') {
        let n = 0;
        body.forEach((v) => { n += typeof v === 'string' ? v.length : (v && v.size) || 0; });
        return n;
    }
    return 0;
}

/** Сколько ждать ответа на запрос: обычный — 25 с; отправка файла — 25 с + время на файл при ≥ 32 кбит/с, не больше 10 мин. */
export function requestTimeoutMs(p) {
    const bytes = Math.max(0, Number(p && p.bytes) || 0);
    const method = String((p && p.method) || 'GET').toUpperCase();
    const isUpload = /\/storage\/v1\/object\//.test(String((p && p.url) || '')) && (method === 'POST' || method === 'PUT');
    const extra = isUpload || bytes > 64 * 1024 ? Math.ceil(bytes / UPLOAD_MIN_BYTES_PER_SEC * 1000) : 0;
    return Math.min(REQUEST_TIMEOUT_MAX_MS, REQUEST_TIMEOUT_MS + extra);
}

export function makeTimeoutError(ms) {
    const e = new Error('Нет ответа сервера за ' + Math.round(ms / 1000) + ' с');
    e.code = TIMEOUT_CODE;
    e.name = 'TimeoutError';
    return e;
}

/**
 * fetch с ограничением времени (С2) и общей отменой прохода. activity — счётчик для «стопа» прохода:
 * inflight (сколько запросов в пути) и lastSettledAt (когда пришёл последний ответ или ошибка).
 * @param {Function} baseFetch
 * @param {{ passSignal?: () => (AbortSignal|null), activity?: { inflight: number, lastSettledAt: number }, now?: () => number,
 *           setTimer?: Function, clearTimer?: Function }} [o]
 */
export function makeTimedFetch(baseFetch, o = {}) {
    const now = o.now || (() => Date.now());
    const setT = o.setTimer || ((f, ms) => setTimeout(f, ms));
    const clearT = o.clearTimer || ((t) => clearTimeout(t));
    return function timedFetch(input, init) {
        const opts = init || {};
        const url = typeof input === 'string' ? input : String((input && input.url) || input || '');
        const method = opts.method || (input && input.method) || 'GET';
        const ms = requestTimeoutMs({ url, method, bytes: bodyBytes(opts.body) });
        const ctl = new AbortController();
        const outer = [opts.signal, o.passSignal ? o.passSignal() : null].filter(Boolean);
        const onAbort = () => { if (!ctl.signal.aborted) ctl.abort(); };
        let timedOut = false;
        outer.forEach((s) => { if (s.aborted) onAbort(); else s.addEventListener('abort', onAbort, { once: true }); });
        const t = setT(() => { timedOut = true; ctl.abort(); }, ms);
        const act = o.activity;
        if (act) act.inflight = (act.inflight || 0) + 1;
        const done = () => {
            clearT(t);
            outer.forEach((s) => s.removeEventListener('abort', onAbort));
            if (act) { act.inflight = Math.max(0, (act.inflight || 0) - 1); act.lastSettledAt = now(); }
        };
        return Promise.resolve()
            .then(() => baseFetch(input, Object.assign({}, opts, { signal: ctl.signal })))
            .then((r) => { done(); return r; }, (e) => { done(); throw timedOut ? makeTimeoutError(ms) : e; });
    };
}

/**
 * Вердикт проверки связи (С1). r: { status?: number, error?: any, timedOut?: boolean }
 * 'online' — сервер ответил (любой ответ < 500, даже 404: связь есть); 'server' — сервер ответил 5xx;
 * 'offline' — нет ответа за PROBE_TIMEOUT_MS или ошибка сети.
 */
export function probeVerdict(r) {
    if (!r || r.timedOut || r.error) return 'offline';
    const s = Number(r.status) || 0;
    if (!s) return 'offline';
    return s >= 500 ? 'server' : 'online';
}

/** Запускать ли проход: телефон без сети — нет; проверка связи не ответила — нет; сервер болеет — нет. */
export function shouldStartSync(p) {
    if (p && p.onLine === false) return { start: false, reason: 'no_network' };
    const v = p && p.probe;
    if (v === 'offline') return { start: false, reason: 'no_answer' };
    if (v === 'server') return { start: false, reason: 'server_error' };
    return { start: true, reason: '' };
}

/**
 * Таймер автосинхронизации (раз в минуту), когда есть что отправить (С6).
 * retryKind 'net' — прошлый сбой был связью: пауза не ждётся, сначала проверка связи → ответила — отправка сразу.
 * retryKind 'server' (или неизвестно) — ждём паузу 2 / 5 / 10 мин.
 * @returns {'run'|'probe'|'wait'}
 */
export function autoSyncDecision(p) {
    const now = Number(p && p.now) || Date.now();
    const after = Number(p && p.retryAfter) || 0;
    if (!after || now >= after) return 'run';
    return p && p.retryKind === 'net' ? 'probe' : 'wait';
}

/** Порции по size (С4). */
export function chunks(list, size = PUSH_CHUNK) {
    const arr = Array.isArray(list) ? list : [];
    const n = Math.max(1, Number(size) || PUSH_CHUNK);
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
}

/** Своё неотправленное — первым (С5): записи «к отправке» раньше, порядок внутри групп сохраняется. */
export function ownFirst(list, isUnsent) {
    const arr = Array.isArray(list) ? list : [];
    return arr.filter((x) => isUnsent(x)).concat(arr.filter((x) => !isUnsent(x)));
}

/** Запасной замок (без navigator.locks): аренда { owner, until } свободна, если её нет, она своя или истекла. */
export function leaseFree(lease, now, owner) {
    if (!lease || !lease.owner) return true;
    if (lease.owner === owner) return true;
    return !(Number(lease.until) > Number(now));
}

/** «Стоп» прохода: ни одного запроса в пути и ни одного ответа за PASS_IDLE_LIMIT_MS. */
export function passIdleTooLong(activity, now, startedAt, limit = PASS_IDLE_LIMIT_MS) {
    const a = activity || {};
    if ((a.inflight || 0) > 0) return false;
    const last = Math.max(Number(a.lastSettledAt) || 0, Number(startedAt) || 0);
    return Number(now) - last >= limit;
}

/** Классификация ошибки для паузы: 'net' (нет связи / нет ответа) или 'server' (ответ 5xx, 408, 429). */
export function retryKindOf(e) {
    if (!e) return 'net';
    if (e.code === TIMEOUT_CODE) return 'net';
    const status = Number(e.status || e.statusCode || 0);
    if (status >= 500 || status === 408 || status === 429) return 'server';
    return 'net';
}

if (typeof window !== 'undefined') {
    window.RbiSyncNetPolicy = {
        PROBE_TIMEOUT_MS, REQUEST_TIMEOUT_MS, UPLOAD_MIN_BYTES_PER_SEC, REQUEST_TIMEOUT_MAX_MS, PASS_IDLE_LIMIT_MS, PUSH_CHUNK, LEASE_MS, TIMEOUT_CODE,
        bodyBytes, requestTimeoutMs, makeTimeoutError, makeTimedFetch, probeVerdict, shouldStartSync, autoSyncDecision,
        chunks, ownFirst, leaseFree, passIdleTooLong, retryKindOf
    };
}
