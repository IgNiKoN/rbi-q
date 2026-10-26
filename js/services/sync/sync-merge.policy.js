/* Файл: js/services/sync/sync-merge.policy.js — P2-0023 этап 5.
 * Совещания (и другие записи) не пропадают (чистые функции, unit-тесты — js/shared/__tests__/sync-merge.policy.test.js):
 * - автоочистка при смене назначенных объектов не трогает «Все объекты», записи по нескольким объектам
 *   (если хоть один назначен) и неотправленные записи;
 * - отправка совещаний — по назначенным объектам, а не по совпадению ФИО автора буква в букву;
 * - загрузка не затирает неотправленную местную правку (она уйдёт на сервер следующей отправкой).
 */
'use strict';

/** Статусы, при которых запись ещё ждёт отправки (местная версия — главная). */
const UNSENT_STATUSES = ['not_synced', 'pending', 'needs_attention'];

/** Запись изменена на устройстве и ещё не отправлена. 'blocked' (нет прав) сюда не входит — её не отправить. */
export function isUnsentLocal(rec) {
    if (!rec) return false;
    const st = String(rec.syncStatus || rec.sync_status || '');
    if (UNSENT_STATUSES.includes(st)) return true;
    return rec.source === 'local' && st !== 'synced' && st !== 'blocked';
}

/** «Все объекты» / пусто / системная — запись без конкретного объекта. */
export function isGlobalProjectName(name) {
    const s = String(name || '').trim().toLowerCase();
    if (!s) return true;
    return s === 'все' || s === 'все объекты' || s.startsWith('все ') || s === 'all' || s === 'системная';
}

/** Список объектов записи: projectNames[] или «A, B» в имени, иначе один ключ/имя. */
export function recordProjectNames(rec) {
    if (!rec) return [];
    if (Array.isArray(rec.projectNames) && rec.projectNames.length) {
        return rec.projectNames.map((n) => String(n).trim()).filter(Boolean);
    }
    const key = String(rec.project_canonical_key || '').trim();
    if (key) return [key];
    const raw = String(rec.projectName || rec.project || rec.project_display_name || '').trim();
    if (!raw) return [];
    return raw.includes(',') ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [raw];
}

/**
 * Оставить ли запись при автоочистке «вне назначенных объектов».
 * @param {object} rec
 * @param {(rec: object, names: string[]) => boolean} inAssigned  проверка «объект назначен» (permission.service)
 */
export function keepOnPurge(rec, inAssigned) {
    if (!rec) return false;
    if (isUnsentLocal(rec)) return true;
    // P2-0023 доработка 1: местная запись, не дошедшая до сервера (в т.ч. 'blocked' — нет прав сейчас),
    // не удаляется автоочисткой — иначе пропадёт навсегда вместе со своими local:// фото.
    const st = String(rec.syncStatus || rec.sync_status || '');
    if (rec.source === 'local' && st !== 'synced') return true;
    const names = recordProjectNames(rec);
    if (!names.length || names.every(isGlobalProjectName) || names.some(isGlobalProjectName)) return true;
    if (names.length === 1) return !!inAssigned(rec, names);
    // несколько объектов — оставляем, если назначен хотя бы один
    return names.some((n) => inAssigned(Object.assign({}, rec, {
        project_canonical_key: n, projectName: n, project: n, project_display_name: n, projectNames: [n]
    }), [n]));
}

/**
 * Можно ли не-админу отправлять совещание: своё (по ФИО) ИЛИ по назначенному объекту ИЛИ «Все объекты».
 * Окончательно права проверяет сервер (RLS).
 */
export function meetingPushAllowed(meet, ctx) {
    if (!meet) return false;
    const me = String((ctx && ctx.iName) || '').trim();
    const owner = String(meet.owner || meet.author || meet.inspectorName || meet.engineerName || '').trim();
    if (!owner || (me && owner === me)) return true;
    const names = recordProjectNames(meet);
    if (!names.length || names.some(isGlobalProjectName)) return true;
    const inAssigned = ctx && ctx.inAssigned;
    if (typeof inAssigned !== 'function') return false;
    return names.some((n) => inAssigned(Object.assign({}, meet, {
        project_canonical_key: n, projectName: n, project: n, project_display_name: n, projectNames: [n]
    }), [n]));
}

/**
 * Может ли облачная версия заменить местную при загрузке.
 * @param {{ local: object|null, cloudTime: number, localTime: number, forceReference?: boolean }} p
 */
export function cloudMayOverwrite(p) {
    const local = p && p.local;
    if (!local) return true;
    if (isUnsentLocal(local)) return false; // неотправленная правка главнее — уйдёт следующей отправкой
    if (p.forceReference) return true;
    return Number(p.cloudTime) >= Number(p.localTime);
}

/**
 * P2-0023 этап 6. Единое правило уникальности карты ТИВИ «Технадзор» на пункт чек-листа (на создании).
 * Ищет по ВСЕМ картам (и скрытым фильтром), а не только по видимым.
 * @param {object[]} cards все карты (память + база устройства; дубли по id допустимы)
 * @param {{ checklistKey: string, itemId: string, me: string, canEdit: (owner: string) => boolean }} q
 * @returns {{ action: 'none' } | { action: 'open', card: object } | { action: 'refuse', card: object }}
 *          open — карта своя (или её можно править) → открыть её; refuse — чужая.
 */
export function findTwiConflict(cards, q) {
    const list = Array.isArray(cards) ? cards : [];
    const card = list.find((c) => c && !c._deleted && !c.is_deleted && c.type === 'INSPECTOR'
        && c.checklistKey === q.checklistKey && String(c.itemId) === String(q.itemId));
    if (!card) return { action: 'none' };
    const owner = String(card.owner || '').trim();
    const mine = !owner || (q.me && owner === String(q.me).trim());
    if (mine || (typeof q.canEdit === 'function' && q.canEdit(owner))) return { action: 'open', card };
    return { action: 'refuse', card };
}

if (typeof window !== 'undefined') {
    window.RbiSyncMergePolicy = {
        isUnsentLocal, isGlobalProjectName, recordProjectNames, keepOnPurge, meetingPushAllowed, cloudMayOverwrite,
        findTwiConflict
    };
}
