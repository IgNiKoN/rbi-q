/* Файл: js/services/sync/sync-access.policy.js — P2-0061 «Единый механизм синхронизации и прав» (standards/SYNC_AND_ACCESS.md).
 * Правило устройства «кто я, что моё, можно ли отправить, что видно» — одно на платформу, зеркало серверного
 * quality.record_visible / assignment_sees_id (039a): права — по действиям и области из quality.my_access, не по названию роли;
 * автор — по id учётной записи (authorId ↔ core_created_by), объект — по ключу объекта Качества, фирма — по id контрагента.
 * Переходное правило (решение владельца 29.10.2026): запись без authorId — моя, если подпись = моё текущее или прежнее ФИО
 * (или почта — как member_by_email на сервере); stampAuthor дописывает authorId. Модули подключаются описанием `sync` в манифесте.
 * P2-0070: режим `area` — единый механизм прав (зеркало core.row_allowed / core.assignment_allows, миграция 052) для любого
 * модуля: действие роли в области участия в проекте (место участия и всё под ним; без места — весь проект), запись без места
 * участник части проекта только видит, и только свою. Участие модуля — с сервера (core.my_grants: Стройконтроль — в
 * quality.my_access → construction, План/Факт — в pf_my_area → grants).
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
/** Виды, которые уходят общей отправкой «объектов» (pushCloudObject): у описания есть objectType. Новый такой вид — одна строка. */
export function objectKinds(kinds = KINDS) {
    return Object.values(kinds).filter((k) => k && k.objectType && k.store);
}
/** Описание вида записи по имени, хранилищу устройства или таблице сервера. */
export function kindOf(nameOrStore, kinds = KINDS) {
    if (kinds[nameOrStore]) return kinds[nameOrStore];
    return Object.values(kinds).find((k) => k.store === nameOrStore) || Object.values(kinds).find((k) => k.table === nameOrStore) || null;
}

const MODULE_TITLES = { quality: 'Качество', construction: 'Стройконтроль' };
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
        // Б1/Б2: карточки справочника подрядчиков своей фирмы (id quality.contractor_directory) — для записей без id контрагента
        contractorCards: Array.isArray(s.contractorCards) ? s.contractorCards.map(clean).filter(Boolean) : [],
        // модули, включённые у компании (null — неизвестно: решает сервер); выключенный — записи на телефоне, причина видна
        modules: Array.isArray(s.modules) ? s.modules.map(String) : null,
        // как запись узнаёт свой объект: на устройстве — справочник объектов (по id, ключу, синонимам), как record_keys сервера
        inObject: typeof s.inObject === 'function' ? s.inObject : null,
        // P2-0070: участие × действия по модулям ({ construction, planfact, … } — core.my_grants); area — прежнее имя для
        // Стройконтроля; нет модуля — сервер ещё не ответил
        areas: areasFrom(s.areas, s.area),
        // объект и место записи, созданной на телефоне (ещё без core_project_id / core_location_id) — по дереву мест устройства
        placeOf: typeof s.placeOf === 'function' ? s.placeOf : null
    };
}

/** Участие по модулям: { модуль: участие }; `area` без карты — участие Стройконтроля (ответ quality.my_access). */
export function areasFrom(map, construction) {
    const out = {};
    if (map && typeof map === 'object') for (const [m, v] of Object.entries(map)) { const a = areaFrom(v); if (a) out[m] = a; }
    const c = areaFrom(construction);
    if (c && !out.construction) out.construction = c;
    return out;
}

/** Участие из ответа сервера: { admin, enabled, grants: [{ project, place, places: Set | null, actions: Set, counterparty }] }. */
export function areaFrom(src) {
    if (!src || typeof src !== 'object' || !Array.isArray(src.grants)) return null;
    return {
        admin: src.admin === true,
        enabled: src.enabled !== false,
        grants: src.grants.filter((g) => g && typeof g === 'object').map((g) => ({
            project: clean(g.project), place: clean(g.place),
            places: Array.isArray(g.places) ? new Set(g.places.map(clean)) : null,
            actions: new Set(Array.isArray(g.actions) ? g.actions.map(String) : []),
            counterparty: clean(g.counterparty)
        }))
    };
}

const get = (rec, field) => (rec && field ? rec[field] : undefined);
const authorIdOf = (rec, kind) => clean(get(rec, (kind.author || {}).id || 'authorId'));
const authorNameOf = (rec, kind) => {
    const f = (kind.author || {}).name;
    for (const n of Array.isArray(f) ? f : [f]) { const v = clean(get(rec, n)); if (v) return v; }
    return '';
};

/** Я — автор: по id автора; без id — переходное правило по подписи (ФИО / почта). id главнее подписи. */
function isAuthor(rec, kind, me) {
    const aid = authorIdOf(rec, kind);
    if (aid) return aid === me.userId;
    const nm = authorNameOf(rec, kind);
    return !!nm && me.names.some((x) => low(x) === low(nm));
}
/** Моя запись: я автор или исполнитель (задача, назначенная мне). */
export function isMine(rec, kind, me) {
    if (!rec || !kind || !me) return false;
    const asg = clean(get(rec, kind.assignee));
    if (asg && asg === me.userId) return true;
    return isAuthor(rec, kind, me);
}

/** Автор записи — id: моей записи без authorId (переходное правило) и новой записи без подписи автора (создана сейчас
 *  на этом устройстве вошедшим) дописать мой id; ничего другого не меняет, чужую не трогает. true — дописан. */
export function stampAuthor(rec, kind, me) {
    if (!rec || !kind || !me || authorIdOf(rec, kind)) return false;
    // Б3: только по авторству — исполнитель задачи её автором не становится
    if (!isAuthor(rec, kind, me) && authorNameOf(rec, kind)) return false;
    rec[(kind.author || {}).id || 'authorId'] = me.userId;
    return true;
}

const has = (me, a) => me.actions.includes(a);
/** Признаки объекта записи (id, ключ, название) — без пустых и «unknown». */
const objectKeys = (rec, kind) => (Array.isArray(kind.object) ? kind.object : [kind.object])
    .map((f) => objClean(get(rec, f))).filter((v) => v && v !== 'unknown');

/** Своя фирма (Б1/Б2): по id контрагента ядра (`counterparty`, его ставит сервер); у записи без него (создана на телефоне,
 *  ещё не отправлена) — по карточке справочника подрядчиков (`contractorCard`), как `ownsRecord` Стройконтроля 2.0. */
function ownFirm(rec, kind, me) {
    let cp = '';
    for (const f of [].concat(kind.counterparty || [])) { cp = clean(get(rec, f)); if (cp) break; }
    if (cp) return !!me.contractorId && cp === me.contractorId;
    const card = clean(get(rec, kind.contractorCard));
    return !!card && me.contractorCards.includes(card);
}
/** Модуль вида — по его действиям (quality / construction). */
const moduleOf = (kind) => String(((kind.edit || kind.view || [])[0]) || 'quality.').split('.')[0];

/** Объект и место записи: поля сервера (core_project_id / core_location_id), у созданной на телефоне — по дереву мест. */
function placeOfRec(rec, kind, me) {
    const pf = kind.place || {};
    let project = clean(get(rec, pf.project || 'core_project_id'));
    let location = clean(get(rec, pf.location || 'core_location_id'));
    if (!project && me.placeOf) {
        const p = me.placeOf(rec) || {};
        project = clean(p.project);
        if (!location) location = clean(p.location);
    }
    return { project, location };
}
/** Одно участие и одно действие — как core.assignment_allows (052). */
function grantAllows(g, act, rec, kind, me, pl) {
    if (!g.actions.has(act)) return false;
    if (g.actions.has('quality.scope.company')) return true;
    if (pl.project && g.project && g.project !== pl.project) return false;
    if (g.place) {
        // запись без места участник части проекта только видит, и только свою (по id автора, как сервер)
        if (!pl.location) return /\.view$/.test(act) && !!authorIdOf(rec, kind) && authorIdOf(rec, kind) === me.userId;
        if (!g.places || !g.places.has(pl.location)) return false;
    }
    if (g.actions.has(String(act).split('.')[0] + '.manage')) return true;
    if (g.actions.has('quality.scope.contractor')) {
        let cp = '';
        for (const f of [].concat(kind.counterparty || [])) { cp = clean(get(rec, f)); if (cp) break; }
        if (cp) return !!g.counterparty && cp === g.counterparty;
        // запись без id контрагента (создана на телефоне, ещё не отправлена) — по карточке справочника своей фирмы
        const card = clean(get(rec, kind.contractorCard));
        return !!card && me.contractorCards.includes(card);
    }
    return true;
}
/** Новые действия Стройконтроля по прежним — то же правило, что перенос ролей в 052.
 *  Нужно, когда сервер ещё без 052 (или 052 откачена): прежние ключи есть, новых нет — кнопки и отправка как раньше. */
export function fineFromLegacy(actions) {
    const a = new Set(actions || []);
    if ([...a].some((x) => /^construction\.(defects|acceptance|transfer)\./.test(x))) return [...a];
    if (!a.has('construction.view') && !a.has('construction.edit')) return [...a];
    const add = !a.has('construction.edit') ? ['construction.defects.view', 'construction.acceptance.view']
        : a.has('quality.scope.contractor') ? ['construction.defects.view', 'construction.defects.start', 'construction.defects.fix',
            'construction.acceptance.view', 'construction.acceptance.book']
        : ['construction.defects.view', 'construction.defects.create', 'construction.defects.assign', 'construction.defects.start',
            'construction.defects.fix', 'construction.defects.close', 'construction.defects.reject', 'construction.defects.delete',
            'construction.acceptance.view', 'construction.acceptance.book', 'construction.acceptance.schedule',
            'construction.acceptance.conduct', 'construction.transfer.edit'];
    return [...a, ...add];
}
/** Режим `area` (P2-0070): одно из действий acts в области участия. Сервер ещё не прислал участие (или он без 052) — одно
 *  участие на всю компанию из моих действий и фирмы назначения (как до P2-0070); остальное решит сервер. */
function decideArea(rec, kind, me, acts) {
    const A = (me.areas || {})[moduleOf(kind)]
        || { admin: false, grants: [{ project: '', place: '', places: null, actions: new Set(fineFromLegacy(me.actions)), counterparty: me.contractorId }] };
    if (A.admin) return { ok: true };
    const pl = placeOfRec(rec, kind, me);
    if (acts.some((a) => A.grants.some((g) => grantAllows(g, a, rec, kind, me, pl)))) return { ok: true };
    if (!acts.some((a) => A.grants.some((g) => g.actions.has(a)))) {
        return { ok: false, code: 'right', reason: 'Не отправлено: нет права на эти записи', hint: 'Попросите администратора компании дать право' };
    }
    if (A.grants.some((g) => g.actions.has('quality.scope.contractor') && acts.some((a) => g.actions.has(a)))
        && !A.grants.some((g) => !g.actions.has('quality.scope.contractor') && acts.some((a) => g.actions.has(a)))) {
        return { ok: false, code: 'contractor', reason: 'Не отправлено: запись другой фирмы', hint: 'Отправит сотрудник этой фирмы или руководитель' };
    }
    return { ok: false, code: 'area', reason: 'Не отправлено: место записи вне вашего участия в проекте',
        hint: 'Попросите администратора добавить участие на это место («Компания → Сотрудники»)' };
}

/** Решение по действию view / edit: { ok, code, reason, hint }. Порядок — как assignment_sees_id сервера. */
function decide(rec, kind, me, what, only) {
    if (!kind) return { ok: false, code: 'kind', reason: 'Не отправлено: неизвестный вид записи', hint: 'Обновите приложение' };
    if (!me) return { ok: false, code: 'login', reason: 'Не отправлено: нужно войти', hint: 'Войдите на этом телефоне — запись уйдёт сама' };
    const acts = only ? [only] : (what === 'view' ? kind.view : kind.edit) || [];
    const modKey = String(acts[0] || '').split('.')[0];
    if (me.modules && modKey && !me.modules.includes(modKey)) {
        return { ok: false, code: 'module', reason: 'Не отправлено: модуль «' + (MODULE_TITLES[modKey] || modKey) + '» выключен у компании',
            hint: 'Запись сохранена на телефоне; уйдёт, когда администратор компании включит модуль' };
    }
    if (kind.mode === 'area') return decideArea(rec, kind, me, acts);
    if (!acts.some((a) => has(me, a))) {
        return { ok: false, code: 'right', reason: 'Не отправлено: нет права на эти записи', hint: 'Попросите администратора компании дать право' };
    }
    const mod = kind.module === 'construction' || String(acts[0] || '').startsWith('construction.') ? 'construction' : 'quality';
    let mode = kind.mode || 'author';
    if (mode === 'shared') return { ok: true };   // библиотека компании: право есть — можно (quality.can)
    const mine = isMine(rec, kind, me);
    if (mode === 'owner') {
        if (has(me, mod + '.manage') || mine) return { ok: true };
        return foreign(rec, kind);
    }
    if (me.objects !== null && kind.objects !== false) {   // objects: false — права модуля без объектов (Стройконтроль 2.0, row_visible_id)
        const keys = objectKeys(rec, kind);
        if (!keys.length) { if (!mine) return foreign(rec, kind); }
        else if (!(me.inObject ? me.inObject(rec) : keys.some((k) => me.objects.includes(k)))) {
            return { ok: false, code: 'object', reason: 'Не отправлено: объект записи не назначен вам', hint: 'Попросите администратора назначить объект' };
        } else if (what === 'view') mode = 'contractor';
    }
    if (has(me, 'quality.scope.company') || has(me, mod + '.manage')) return { ok: true };
    if (has(me, 'quality.scope.contractor')) {
        if (ownFirm(rec, kind, me)) return { ok: true };
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
/** Можно ли одно действие над записью (кнопка экрана: «Закрыть», «В работу», «Записаться» …) — то же правило, что у сервера. */
export const canAct = (rec, kind, me, action) => decide(rec || {}, kind, me, 'edit', action);
/** Изменить / удалить на экране: можно отправить И (запись моя или я управляю модулем / вся компания). Строже сервера для
 *  режимов «команда объекта» и «библиотека» — чужое меняет только руководитель (как было на экранах до P2-0061, ТД 238). */
export function canChange(rec, kind, me) {
    const d = canSend(rec, kind, me);
    if (!d.ok || !kind || !me) return d;
    if (kind.mode === 'area') return d;   // P2-0070: что можно — решают действия роли в области участия (кнопки — canAct)
    const mod = moduleOf(kind);   // З9: Стройконтроль 2.0 — construction.manage
    if (isMine(rec, kind, me) || has(me, mod + '.manage') || has(me, 'quality.scope.company')) return d;
    return foreign(rec, kind);
}
/** Видна ли запись (отбор после скачивания). */
export const visible = (rec, kind, me) => decide(rec, kind, me, 'view').ok;
/** Отбор после скачивания (ТД 149): видна по правилу (сервер уже отобрал — это страховка, а не замена) и, в режиме «Только мои»,
 *  моя по id автора (переходно — по подписи). Без «кто я» — оставить (решает сервер), чтобы не потерять скачанное. */
export function keepPulled(rec, kind, me, personal) {
    // З4: права с сервера ещё не пришли (пустые действия) — не отбирать: сервер уже отдал видимое этому человеку
    if (!kind || !me || !me.actions.length) return true;
    if (!visible(rec, kind, me)) return false;
    return !personal || !personalApplies(kind, me) || isMine(rec, kind, me);
}
/** «Только мои» сужает того, кто правит только своё (как раньше — инженер); руководителю, «вся компания» и подрядчику (его фирма) — нет. */
function personalApplies(kind, me) {
    const mod = String((kind.edit || [])[0] || 'quality.').split('.')[0];
    return has(me, mod + '.edit') && !has(me, mod + '.manage') && !has(me, 'quality.scope.company') && !has(me, 'quality.scope.contractor');
}
/** Отпечаток доступа: изменился с прошлой попытки — «Не отправлено» перепроверяется (ТД 313). */
export function accessStamp(me) {
    if (!me) return '';
    const area = Object.keys(me.areas || {}).sort().map((m) => m + '=' + me.areas[m].grants
        .map((g) => [g.project, g.place, [...g.actions].sort().join('+'), g.counterparty].join(':')).sort().join(';')).join('/');
    return [me.userId, me.actions.slice().sort().join(','), me.objects === null ? '*' : me.objects.slice().sort().join(','), me.contractorId, area].join('|');
}

/** Карточки справочника подрядчиков своей фирмы: по ключам фирмы из my_access (contractor.keys) и по названию назначения. */
function myContractorCards(w, qs) {
    const C = w.RBI && w.RBI.services && w.RBI.services.contractors;
    if (!C || typeof C.resolveIdFromNormalized !== 'function') return [];
    const out = [];
    const add = (v) => { const id = clean(v); if (id && id !== 'pending' && !out.includes(id)) out.push(id); };
    for (const key of Array.isArray(qs.contractorKeys) ? qs.contractorKeys : []) add(C.resolveIdFromNormalized({ canonical_key: key }));
    const name = clean((w.appSettings || {}).assignedContractor || (w.appSettings || {}).contractorName);
    if (name) add(C.resolveIdFromNormalized({ display_name: name, contractor_name: name }));
    return out;
}
/** Объект и место записи по дереву мест устройства (узлы Качества): место — core_location_id узла "locationId", объект —
 *  по корневому узлу-объекту (my_access → construction.object_nodes). Нужно записям, созданным на телефоне до отправки. */
function placeResolver(w, qs) {
    const L = w.RBI && w.RBI.services && w.RBI.services.locations;
    const map = (qs.construction && qs.construction.object_nodes) || {};
    if (!L || typeof L.getPath !== 'function') return null;
    return (rec) => {
        const path = L.getPath(clean(rec && rec.locationId)) || [];
        if (!path.length) return null;
        const node = path[path.length - 1];
        return { project: clean(map[clean(path[0].id)]), location: node === path[0] ? '' : clean(node.core_location_id) };
    };
}
/** «Кто я» на этом устройстве — из моста Качества (ответ сервера quality.my_access, P2-0035b/P2-0061), не из названия роли.
 *  Нет моста (не вошли почтой) — null: ничего не уходит, причина «нужно войти». */
let memo = { at: 0, w: null, me: null };
export function deviceMe(w = typeof window !== 'undefined' ? window : {}) {
    // на одну записи прохода — один расчёт (справочник подрядчиков не перебирается на каждую запись); 1,5 с — права и ФИО меняются редко
    const now = Date.now();
    if (memo.w === w && now - memo.at < 1500) return memo.me;
    const me = computeDeviceMe(w);
    memo = { at: now, w, me };
    return me;
}
function computeDeviceMe(w) {
    const qs = (w.RBI && w.RBI.qualitySync) || null;
    if (!qs) return null;
    const c = w.syncConfig || {};
    const st = w.appSettings || {};
    const P = w.RBI.services && w.RBI.services.permissions;
    const p2 = w.RBI.platform2 && typeof w.RBI.platform2.getState === 'function' ? w.RBI.platform2.getState() : null;
    const comp = p2 && Array.isArray(p2.companies) ? p2.companies.find((x) => x && x.id === qs.companyId) : null;
    return meFrom({
        modules: comp && Array.isArray(comp.modules) ? comp.modules : null, userId: c.authUserId || qs.userId, name: c.engineerName || qs.engineerName, email: qs.email,
        names: qs.names || c.previousNames, actions: qs.actions, objects: qs.objects === undefined ? null : qs.objects,
        contractorId: st.assignedCounterpartyId,
        contractorCards: myContractorCards(w, qs),
        areas: { construction: qs.construction }, placeOf: placeResolver(w, qs),
        inObject: P && typeof P.isRecordInAssignedProjects === 'function' ? (rec) => !!P.isRecordInAssignedProjects(rec, P.getAssignedProjects()) : null });
}

if (typeof window !== 'undefined') {
    window.RbiSyncAccess = { kindsFrom, objectKinds, kindOf, meFrom, areaFrom, areasFrom, fineFromLegacy, deviceMe, isMine, stampAuthor, canSend, canAct, canChange, visible, keepPulled, accessStamp, KINDS };
}
