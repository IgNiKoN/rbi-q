/* Файл: js/services/sync/sync-access.policy.js — P2-0061 «Единый механизм синхронизации и прав» (standards/SYNC_AND_ACCESS.md).
 * Правило устройства «кто я, что моё, можно ли отправить, что видно» — одно на платформу, зеркало серверного
 * quality.record_visible / assignment_sees_id (039a): права — по действиям и области из quality.my_access, не по названию роли;
 * автор — по id учётной записи (authorId ↔ core_created_by), объект — по ключу объекта Качества, фирма — по id контрагента.
 * Переходное правило (решение владельца 29.10.2026): запись без authorId — моя, если подпись = моё текущее или прежнее ФИО
 * (или почта — как member_by_email на сервере); stampAuthor дописывает authorId. Модули подключаются описанием `sync` в манифесте.
 * Чистые функции; unit — js/shared/__tests__/sync-access.policy.test.js, зеркало сервера — tests/server/sync-access.mirror.mjs.
 */
'use strict';

import { ModulesManifest } from '../../modules/modules.manifest.js';

/** Виды записей из описаний `sync` манифестов: kind → описание (+ module — id модуля). */
export function kindsFrom(manifests) {
    const out = {};
    for (const m of manifests || []) {
        for (const k of (m && Array.isArray(m.sync) ? m.sync : [])) {
            if (k && k.kind && !out[k.kind]) out[k.kind] = Object.assign({ module: m.id }, k);
        }
    }
    return out;
}
const KINDS = kindsFrom(ModulesManifest);
/** Описание вида записи по имени или по хранилищу. */
export function kindOf(nameOrStore, kinds = KINDS) {
    if (kinds[nameOrStore]) return kinds[nameOrStore];
    return Object.values(kinds).find((k) => k.store === nameOrStore) || null;
}

const clean = (v) => String(v == null ? '' : v).trim();
const low = (v) => clean(v).toLowerCase();
/** Ключ объекта для сравнения — как quality.object_clean: без регистра, лишних пробелов и кавычек. */
const objClean = (v) => low(v).replace(/[«»"'`]/g, '').replace(/\s+/g, ' ');

/**
 * Кто я: userId — id учётной записи; names — текущее и прежние ФИО и почта (переходное правило); actions — действия с сервера;
 * objects — ключи закреплённых объектов Качества (null — все объекты); contractorId — фирма назначения.
 */
export function meFrom(src) {
    const s = src || {};
    const userId = clean(s.userId);
    if (!userId) return null;
    const names = [];
    for (const n of [s.name, s.email].concat(Array.isArray(s.names) ? s.names : [])) {
        const v = clean(n);
        if (v && !names.some((x) => low(x) === low(v))) names.push(v);
    }
    return {
        userId, names,
        actions: Array.isArray(s.actions) ? s.actions.map(String) : [],
        objects: Array.isArray(s.objects) ? s.objects.map(objClean).filter(Boolean) : null,
        contractorId: clean(s.contractorId),
        // как запись узнаёт свой объект: на устройстве — справочник объектов (по id, ключу, синонимам), как record_keys сервера
        inObject: typeof s.inObject === 'function' ? s.inObject : null
    };
}

const get = (rec, field) => (rec && field ? rec[field] : undefined);
const authorIdOf = (rec, kind) => clean(get(rec, (kind.author || {}).id || 'authorId'));
const authorNameOf = (rec, kind) => {
    const f = (kind.author || {}).name;
    for (const n of Array.isArray(f) ? f : [f]) { const v = clean(get(rec, n)); if (v) return v; }
    return '';
};

/** Моя запись: по id автора (или исполнителя); без id — переходное правило по подписи (ФИО / почта). id главнее подписи. */
export function isMine(rec, kind, me) {
    if (!rec || !kind || !me) return false;
    const aid = authorIdOf(rec, kind);
    const asg = clean(get(rec, kind.assignee));
    if (asg && asg === me.userId) return true;
    if (aid) return aid === me.userId;
    const nm = authorNameOf(rec, kind);
    return !!nm && me.names.some((x) => low(x) === low(nm));
}

/** Автор записи — id: моей записи без authorId (переходное правило) и новой записи без подписи автора (создана сейчас
 *  на этом устройстве вошедшим) дописать мой id; ничего другого не меняет, чужую не трогает. true — дописан. */
export function stampAuthor(rec, kind, me) {
    if (!rec || !kind || !me || authorIdOf(rec, kind)) return false;
    if (!isMine(rec, kind, me) && authorNameOf(rec, kind)) return false;
    rec[(kind.author || {}).id || 'authorId'] = me.userId;
    return true;
}

const has = (me, a) => me.actions.includes(a);
/** Признаки объекта записи (id, ключ, название) — без пустых и «unknown». */
const objectKeys = (rec, kind) => (Array.isArray(kind.object) ? kind.object : [kind.object])
    .map((f) => objClean(get(rec, f))).filter((v) => v && v !== 'unknown');

/** Решение по действию view / edit: { ok, code, reason, hint }. Порядок — как assignment_sees_id сервера. */
function decide(rec, kind, me, what) {
    if (!kind) return { ok: false, code: 'kind', reason: 'Не отправлено: неизвестный вид записи', hint: 'Обновите приложение' };
    if (!me) return { ok: false, code: 'login', reason: 'Не отправлено: нужно войти', hint: 'Войдите на этом телефоне — запись уйдёт сама' };
    const acts = (what === 'view' ? kind.view : kind.edit) || [];
    if (!acts.some((a) => has(me, a))) {
        return { ok: false, code: 'right', reason: 'Не отправлено: нет права на эти записи', hint: 'Попросите администратора компании дать право' };
    }
    const mod = kind.module === 'construction' || String(acts[0] || '').startsWith('construction.') ? 'construction' : 'quality';
    const mine = isMine(rec, kind, me);
    let mode = kind.mode || 'author';
    if (mode === 'owner') {
        if (has(me, mod + '.manage') || mine) return { ok: true };
        return foreign(rec, kind);
    }
    if (me.objects !== null) {
        const keys = objectKeys(rec, kind);
        if (!keys.length) { if (!mine) return foreign(rec, kind); }
        else if (!(me.inObject ? me.inObject(rec) : keys.some((k) => me.objects.includes(k)))) {
            return { ok: false, code: 'object', reason: 'Не отправлено: объект записи не назначен вам', hint: 'Попросите администратора назначить объект' };
        } else if (what === 'view') mode = 'contractor';
    }
    if (has(me, 'quality.scope.company') || has(me, mod + '.manage')) return { ok: true };
    if (has(me, 'quality.scope.contractor')) {
        let cp = '';
        for (const f of [].concat(kind.counterparty || 'counterpartyId')) { cp = clean(get(rec, f)); if (cp) break; }
        if (me.contractorId && cp && cp === me.contractorId) return { ok: true };
        return { ok: false, code: 'contractor', reason: 'Не отправлено: запись другой фирмы', hint: 'Отправит сотрудник этой фирмы или руководитель' };
    }
    if (mode === 'author' && has(me, mod + '.edit') && !mine) return foreign(rec, kind);
    return { ok: true };
}
function foreign(rec, kind) {
    const nm = authorNameOf(rec, kind);
    return { ok: false, code: 'foreign', reason: 'Не отправлено: запись другого сотрудника' + (nm ? ' (' + nm + ')' : ''),
        hint: 'Отправит руководитель или автор, войдя на этом телефоне' };
}

/** Можно ли отправить (правка на сервере). */
export const canSend = (rec, kind, me) => decide(rec, kind, me, 'edit');
/** Видна ли запись (отбор после скачивания). */
export const visible = (rec, kind, me) => decide(rec, kind, me, 'view').ok;
/** Отпечаток доступа: изменился с прошлой попытки — «Не отправлено» перепроверяется (ТД 313). */
export function accessStamp(me) {
    if (!me) return '';
    return [me.userId, me.actions.slice().sort().join(','), me.objects === null ? '*' : me.objects.slice().sort().join(','), me.contractorId].join('|');
}

/** «Кто я» на этом устройстве — из моста Качества (ответ сервера quality.my_access, P2-0035b/P2-0061), не из названия роли.
 *  Нет моста (не вошли почтой) — null: ничего не уходит, причина «нужно войти». */
export function deviceMe(w = typeof window !== 'undefined' ? window : {}) {
    const qs = (w.RBI && w.RBI.qualitySync) || null;
    if (!qs) return null;
    const c = w.syncConfig || {};
    const st = w.appSettings || {};
    const P = w.RBI.services && w.RBI.services.permissions;
    return meFrom({ userId: c.authUserId || qs.userId, name: c.engineerName || qs.engineerName, email: qs.email,
        names: qs.names || c.previousNames, actions: qs.actions, objects: qs.objects === undefined ? null : qs.objects,
        contractorId: st.assignedCounterpartyId,
        inObject: P && typeof P.isRecordInAssignedProjects === 'function' ? (rec) => !!P.isRecordInAssignedProjects(rec, P.getAssignedProjects()) : null });
}

if (typeof window !== 'undefined') {
    window.RbiSyncAccess = { kindsFrom, kindOf, meFrom, deviceMe, isMine, stampAuthor, canSend, visible, accessStamp, KINDS };
}
