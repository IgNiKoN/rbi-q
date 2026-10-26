/* Файл: js/services/sync/sync-retry.policy.js — P2-0023 этап 4.
 * Синхронизация без бесконечного круга (чистые функции, unit-тесты — js/shared/__tests__/sync-retry.policy.test.js):
 * - ошибка отправки больше не включает полную загрузку; успешная загрузка ставит метку даже при ошибке отправки;
 * - повтор после ошибки — с нарастающей паузой, а не каждую минуту;
 * - объект с фото, которого нет на устройстве, помечается «нужно внимание» и не роняет синхронизацию снова;
 *   доработка 2: автоповтор с той же паузой, после ATTENTION_ASK_USER_AFTER неудач — «Отправить без этого фото»;
 * - одно и то же сообщение об ошибке показывается один раз.
 */
'use strict';

export const MISSING_LOCAL_FILE = 'RBI_MISSING_LOCAL_FILE';
export const ATTENTION_STATUS = 'needs_attention';
export const ATTENTION_REASON_MISSING_PHOTO = 'Нужно внимание: фото не найдено на устройстве — переснимите или удалите его';

/** Ошибка «локального файла нет» (а не сеть/сервер). */
export function makeMissingFileError(ref) {
    const e = new Error('Фото не найдено на устройстве: ' + String(ref || ''));
    e.code = MISSING_LOCAL_FILE;
    e.ref = String(ref || '');
    return e;
}

export function isMissingFileError(e) {
    return !!(e && (e.code === MISSING_LOCAL_FILE || /Локальный файл не найден в IndexedDB/.test(String(e.message || ''))));
}

/**
 * Флаги после синхронизации. Раньше любая ошибка ставила rbi_force_full_pull, а метка
 * последней загрузки не ставилась → полная загрузка каждую минуту и «первый запуск» навсегда.
 * @param {{ pushErrors: number, pullErrors: number, referencePullErrors: number, referenceOk: boolean }} r
 * @param {{ transientPushErrors?: number }} r  из них — сеть/сервер (доработка 5)
 * @returns {{ pullOk: boolean, pushOk: boolean, setLastPull: boolean, clearForceFullPull: boolean, pause: boolean, dirty: boolean }}
 */
export function completionFlags(r) {
    const pullOk = !(r && (r.pullErrors > 0 || r.referencePullErrors > 0)) && !!(r && r.referenceOk !== false);
    const pushOk = !(r && r.pushErrors > 0);
    // Доработка 5: transientPushErrors не передан (старый вызов) — считаем все ошибки отправки сетевыми.
    const transient = r && r.transientPushErrors !== undefined ? Number(r.transientPushErrors) || 0 : (r && r.pushErrors) || 0;
    return {
        pullOk,
        pushOk,
        // загрузка прошла — метку ставим независимо от отправки; не прошла — следующая
        // догрузка начнётся с прошлой метки (полная загрузка для этого не нужна)
        setLastPull: pullOk,
        clearForceFullPull: pullOk,
        // пауза автоповтора — только если не удалась загрузка или отправка упала по сети/серверу;
        // отклонённые сервером записи (права, данные) паузу не ставят
        pause: !pullOk || transient > 0,
        dirty: !pushOk && transient > 0
    };
}

/**
 * Доработка 5: временная ли ошибка (сеть/сервер → повтор с паузой) или сервер отклонил запись
 * (права RLS, неверные данные → пауза не нужна, запись остаётся неотправленной).
 * Неизвестная ошибка считается временной — безопаснее подождать, чем крутить круг.
 */
export function isTransientSyncError(e) {
    if (!e) return true;
    if (isMissingFileError(e)) return false;
    const status = Number(e.status || e.statusCode || 0);
    if (status) return status >= 500 || status === 408 || status === 429;
    const code = String(e.code || '');
    if (/^PGRST/.test(code)) return false;
    // код Postgres (SQLSTATE): 08 связь, 40 откат/взаимоблокировка, 53 ресурсы, 57 сервер — временные
    if (/^[0-9A-Z]{5}$/.test(code)) return /^(08|40|53|57)/.test(code);
    const m = String(e.message || e || '');
    if (/row-level security|permission denied|violates|invalid input|duplicate key/i.test(m)) return false;
    return true;
}

/** Пауза перед автоповтором после n-й подряд неудачной синхронизации (мс): 2, 5, 10, 30 мин. */
export function retryDelayMs(failCount) {
    const steps = [2, 5, 10, 30];
    const n = Math.max(1, Number(failCount) || 1);
    return steps[Math.min(n, steps.length) - 1] * 60 * 1000;
}

/**
 * Можно ли автоматически (таймер/возврат в приложение) запускать синхронизацию сейчас.
 * Ручной запуск пользователем не ограничивается.
 * @param {{ now: number, retryAfter: number }} p
 */
export function autoSyncAllowed(p) {
    const retryAfter = Number(p && p.retryAfter) || 0;
    return !retryAfter || (Number(p && p.now) || 0) >= retryAfter;
}

/** Объект «нужно внимание» (фото нет на устройстве). */
export function isAttention(rec) {
    if (!rec) return false;
    return rec.syncStatus === ATTENTION_STATUS || rec.sync_status === ATTENTION_STATUS;
}

/** Доработка 2: после стольких неудачных попыток подряд — плашка с действием для пользователя. */
export const ATTENTION_ASK_USER_AFTER = 4;

/**
 * Пометить объект «нужно внимание» (сохранять вызывающему). Доработка 2: считаем попытки и ставим
 * время следующей (2/5/10/30 мин) — файл мог просто не успеть записаться (гонка), повтор его заберёт.
 */
export function markAttention(rec, reason, now) {
    if (!rec) return rec;
    rec.syncStatus = ATTENTION_STATUS;
    rec.sync_status = ATTENTION_STATUS;
    rec.syncBlockReason = reason || ATTENTION_REASON_MISSING_PHOTO;
    rec.sync_block_reason = rec.syncBlockReason;
    rec.syncAttentionAttempts = (Number(rec.syncAttentionAttempts) || 0) + 1;
    rec.syncAttentionRetryAt = (now === undefined ? Date.now() : Number(now) || 0) + retryDelayMs(rec.syncAttentionAttempts);
    return rec;
}

/** Пора ли автоматически повторить отправку объекта «нужно внимание» (без времени — пора). */
export function attentionRetryDue(rec, now) {
    if (!isAttention(rec)) return true;
    const at = Number(rec.syncAttentionRetryAt) || 0;
    return !at || (Number(now) || 0) >= at;
}

/** Попытки исчерпаны — показать пользователю причину и «Отправить без этого фото». */
export function attentionNeedsUser(rec) {
    return isAttention(rec) && (Number(rec.syncAttentionAttempts) || 0) >= ATTENTION_ASK_USER_AFTER;
}

/** Снять «нужно внимание» (после успешной отправки). */
export function clearAttention(rec) {
    if (!rec) return rec;
    delete rec.syncAttentionAttempts;
    delete rec.syncAttentionRetryAt;
    delete rec.syncMissingPhotos;
    return rec;
}

/** Понятная причина для плашки: «Не отправлено: нет фото пункта «…»». */
export function missingPhotoReason(itemNames) {
    const names = (itemNames || []).map((n) => String(n || '').trim()).filter(Boolean);
    if (!names.length) return 'Не отправлено: фото пункта не найдено на устройстве';
    const shown = names.slice(0, 2).map((n) => '«' + (n.length > 60 ? n.substring(0, 57) + '…' : n) + '»').join(', ');
    const more = names.length > 2 ? ' и ещё ' + (names.length - 2) : '';
    return 'Не отправлено: нет фото ' + (names.length > 1 ? 'пунктов ' : 'пункта ') + shown + more;
}

/**
 * «Отправить без этого фото»: отсутствующие фото убираются из проверки и запоминаются в missingPhotos,
 * остальное уходит обычной отправкой. Сохранить запись и запустить синхронизацию — вызывающему.
 * @param {object} rec проверка с rec.syncMissingPhotos = [{ itemId, ref }]
 * @returns {number} сколько фото убрано
 */
export function dropMissingPhotos(rec, nowIso) {
    if (!rec) return 0;
    const missing = Array.isArray(rec.syncMissingPhotos) ? rec.syncMissingPhotos : [];
    let dropped = 0;
    const photos = rec.photos || {};
    missing.forEach((m) => {
        const key = String(m && m.itemId);
        if (!(key in photos)) return;
        const arr = Array.isArray(photos[key]) ? photos[key] : [photos[key]];
        const left = arr.filter((p) => String(p) !== String(m.ref));
        dropped += arr.length - left.length;
        if (left.length) photos[key] = left; else delete photos[key];
    });
    rec.missingPhotos = (Array.isArray(rec.missingPhotos) ? rec.missingPhotos : [])
        .concat(missing.map((m) => ({ itemId: String(m.itemId), ref: String(m.ref), at: nowIso || new Date().toISOString() })));
    clearAttention(rec);
    rec.syncStatus = 'not_synced';
    rec.sync_status = 'not_synced';
    rec.syncBlockReason = '';
    rec.sync_block_reason = '';
    rec.source = 'local';
    return dropped;
}

/**
 * Показывать ли сообщение об ошибке: одна и та же причина — один раз, пока не было успеха.
 * @param {string} lastShownKey ключ последнего показанного сообщения ('' — после успеха)
 * @param {string} key ключ текущей ошибки
 */
export function shouldShowErrorOnce(lastShownKey, key) {
    return !!key && String(lastShownKey || '') !== String(key);
}

/** Понятная причина ошибки отправки для пользователя. */
export function humanSyncReason(e) {
    if (isMissingFileError(e)) return 'фото не найдено на устройстве — запись помечена «нужно внимание»';
    const m = String((e && e.message) || e || '').trim();
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'нет связи с сервером, повторим позже';
    if (/row-level security|RLS|permission|42501/i.test(m)) return 'нет прав на отправку этой записи';
    return m ? m.substring(0, 80) : 'сбой отправки';
}

/**
 * P2-0025: отпечаток черновика осмотра по содержимому (без времени сохранения).
 * Длинные фото (data:/base64) — длиной и краями: дёшево, а замена фото меняет отпечаток.
 * Обычный текст — целиком (доработка 1: правка середины длинного замечания меняет отпечаток).
 * Ключи объектов — по порядку, чтобы перестановка полей не считалась изменением.
 */
function _looksLikeBinaryText(v) {
    if (v.startsWith('data:')) return true;
    // «голый» base64: начало строки — только символы base64, без пробелов
    return /^[A-Za-z0-9+/=_-]{256}$/.test(v.slice(0, 256));
}

export function draftFingerprint(draft) {
    const seen = typeof WeakSet === 'function' ? new WeakSet() : null;
    const norm = (v) => {
        if (v === undefined) return null;
        if (typeof v === 'string') {
            return (v.length > 256 && _looksLikeBinaryText(v)) ? `~${v.length}:${v.slice(0, 64)}:${v.slice(-64)}` : v;
        }
        if (!v || typeof v !== 'object') return v;
        if (seen) { if (seen.has(v)) return '~cycle'; seen.add(v); }
        if (Array.isArray(v)) return v.map(norm);
        if (typeof Blob !== 'undefined' && v instanceof Blob) return `~blob:${v.size}:${v.type}`;
        const out = {};
        Object.keys(v).sort().forEach((k) => {
            if (k === 'timestamp') return;
            out[k] = norm(v[k]);
        });
        return out;
    };
    const s = JSON.stringify(norm(draft || {}));
    let h = 0x811c9dc5; // FNV-1a 32
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return `${s.length}:${(h >>> 0).toString(36)}`;
}

/**
 * P2-0025: нужно ли снова пометить черновик «к отправке» после синхронизации.
 * Синхронизация в конце снимает метку; правка, сделанная после её начала (с запасом на
 * задержку записи черновика), могла не попасть в отправку — тогда пометить снова.
 * Без правок с начала синхронизации — не помечать (раньше помечалось всегда → круг раз в минуту).
 */
export function draftNeedsPushAfterSync(lastChangeAt, syncStartedAt, saveDelayMs = 1000) {
    const changed = Number(lastChangeAt) || 0;
    if (!changed) return false;
    const started = Number(syncStartedAt) || 0;
    if (!started) return true; // начало неизвестно — как раньше, безопасно
    return changed >= started - (Number(saveDelayMs) || 0);
}

if (typeof window !== 'undefined') {
    window.RbiSyncRetryPolicy = {
        MISSING_LOCAL_FILE, ATTENTION_STATUS, ATTENTION_REASON_MISSING_PHOTO,
        makeMissingFileError, isMissingFileError, isTransientSyncError, completionFlags, retryDelayMs,
        autoSyncAllowed, isAttention, markAttention, shouldShowErrorOnce, humanSyncReason,
        ATTENTION_ASK_USER_AFTER, attentionRetryDue, attentionNeedsUser, clearAttention,
        missingPhotoReason, dropMissingPhotos, draftFingerprint, draftNeedsPushAfterSync
    };
}
