/**
 * meetings.module.js — Step 35: полный перенос бизнес-логики модуля «Протоколы Совещаний».
 *
 * Бизнес-функции перенесены из app.js (блок МОДУЛЬ СОВЕЩАНИЙ И ПРОТОКОЛОВ, строки 6876–7669).
 * Глобальные window.rbi_* присвоения вынесены в meetings.legacy.js.
 * Вспомогательные функции _meetingsStorage / _meetingsSync — здесь же (изолированы в модуле).
 *
 * Зависимости из app.js, которые остаются глобальными:
 *   window.rbi_meetingsData, appSettings,
 *   PhotoManager, compressImageToBase64,
 *   window.getPhotoSrc, window.activeTaskId, window.rbi_tasksData,
 *   getObjectIntegralMetrics, getContractorMetrics, getFlatList,
 *   showToast, closeModal, openPhotoViewer, openUniversalActionSheet,
 *   copyExpertText, RbiRoles, gameLogAction, gameGenerateWeeklyPlan,
 *   switchTab, rbi_switchEngineerSubTab, window.SyncQueueManager
 */

import {
    AGENDA_KIND,
    agendaItemSourceKey,
    buildMeetingAgenda,
    buildMeetingProtocolHtml,
    collectAgendaFromDom,
    collectMeetingDraftFromDom,
    collectParticipantsFromDom
} from './meetings.protocol.js';
import './meetings.docx-export.js'; // side-effect: публикует exportMeetingDocx / rbi_exportMeetingDocx


function _t(key, fallback, vars) {
    try {
        var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
        if (i18n && typeof i18n.t === 'function') {
            var s = vars ? i18n.t(key, vars) : i18n.t(key);
            if (s && s !== key) return s;
        }
    } catch (e) {}
    if (vars && fallback) {
        return String(fallback).replace(/\{(\w+)\}/g, function (_m, k) {
            return vars[k] != null ? String(vars[k]) : '';
        });
    }
    return fallback;
}

function _dispProjectLabel(raw) {
    var s = String(raw || '').trim();
    if (!s || s === 'Без объекта') return _t('quality.meetings.project.none', 'Без объекта');
    if (s === 'Все объекты') return _t('quality.meetings.project.all', 'Все объекты');
    return s;
}

function _periodLabelFromCode(code, periodText) {
    if (code === 'MONTH') return _t('quality.meetings.period.30d', '30 дней');
    if (code === 'ALL') return _t('quality.meetings.period.all', 'Всё время');
    if (code === 'WEEK') return _t('quality.meetings.period.7d', '7 дней');
    var pt = String(periodText || '');
    if (pt === '30 дней') return _t('quality.meetings.period.30d', '30 дней');
    if (pt === 'Всё время') return _t('quality.meetings.period.all', 'Всё время');
    if (pt === '7 дней') return _t('quality.meetings.period.7d', '7 дней');
    return pt;
}

/* ── хелперы storage / sync ──────────────────────────────────────────────────── */

let _ctx = null;
/** baseline snapshot редактора протокола (dirty-check перед PDF/Word/выходом) */
let _savedMeetingBaselineMemo = '';
let _savedMeetingEditorBaseline = '';
/** последний черновик для preview/print без save */
let _meetingPreviewDraft = null;
/** не пересохранять черновик при закрытии после успешного save */
let _meetingDraftSkipSave = false;

function _objects() {
    try {
        if (_ctx && _ctx.services && _ctx.services.objects) {
            return _ctx.services.objects;
        }
        if (_ctx && _ctx.objects) {
            return _ctx.objects;
        }
    } catch (e) {}
    return (window.RBI && window.RBI.services && window.RBI.services.objects) || null;
}
function _contractors() {
    try {
        if (_ctx && _ctx.services && _ctx.services.contractors) {
            return _ctx.services.contractors;
        }
        if (_ctx && _ctx.contractors) {
            return _ctx.contractors;
        }
    } catch (e) {}
    return (window.RBI && window.RBI.services && window.RBI.services.contractors) || null;
}
function _objectList() {
    var o = _objects();
    if (!o) return [];
    if (typeof o.list === 'function') {
        var l = o.list();
        return Array.isArray(l) ? l : [];
    }
    return Array.isArray(o.objects) ? o.objects : [];
}
function _contractorList() {
    var c = _contractors();
    if (!c) return [];
    if (typeof c.list === 'function') {
        var l = c.list();
        return Array.isArray(l) ? l : [];
    }
    return Array.isArray(c.contractors) ? c.contractors : [];
}

function _escTa(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** HTML-мемо → читаемый текст для превью карточки (без сырых &lt;b&gt; и т.п.). */
function _meetingPlainPreview(html, maxLen) {
    let s = String(html == null ? '' : html);
    s = s
        .replace(/<\s*br\s*\/?>/gi, ' ')
        .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
    if (!s) return _t('quality.meetings.memo.empty', 'Без текста мемо');
    if (maxLen && s.length > maxLen) s = s.slice(0, maxLen - 1) + '…';
    return _escTa(s);
}

function _meetingPhotoPlaceholder(size) {
    const isThumb = size === 'thumb';
    const iconCls = isThumb ? 'w-5 h-5' : 'w-6 h-6';
    const boxCls = isThumb
        ? 'w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/50 dark:to-slate-900'
        : 'w-full h-full flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100/80 dark:from-orange-950/40 dark:via-slate-900 dark:to-slate-950';
    const badge = isThumb
        ? ''
        : '<span class="text-rbi-caption font-black uppercase tracking-widest text-orange-500/80 dark:text-orange-400/70">' + _t('quality.meetings.photo.none', 'Без фото') + '</span>';
    return `<div class="${boxCls}">
        <div class="${isThumb ? 'w-8 h-8' : 'w-11 h-11'} rounded-xl bg-surface text-orange-500 dark:text-orange-400 flex items-center justify-center shadow-sm border border-orange-100 dark:border-orange-900/50">
            <svg class="${iconCls}" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        </div>
        ${badge}
    </div>`;
}

function _ensureMeetingProtocolEditorView() {
    if (document.getElementById('meeting-protocol-editor-view')) return;
    const root = (window.RBI && window.RBI.services && window.RBI.services.shell
        && typeof window.RBI.services.shell.getModalsRoot === 'function')
        ? window.RBI.services.shell.getModalsRoot()
        : (document.getElementById('app-modals') || document.body);
    if (!root) return;
    root.insertAdjacentHTML('beforeend', `
    <div id="meeting-protocol-editor-view"
        class="hidden bg-[var(--bg-main)] fixed inset-0 z-[3000] h-screen overflow-y-auto custom-scrollbar">
        <div class="bg-surface backdrop-blur-md border-b border-surface p-3 sm:p-4 mb-4 shadow-sm sticky top-0 z-40 flex justify-between items-center gap-2">
            <button type="button" onclick="rbi_closeMeetingProtocolEditor()"
                class="text-rbi-label font-bold text-muted flex items-center gap-1 active:scale-95 bg-surface px-3 py-2 rounded-lg transition-colors shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"></path></svg>
                ${_t('quality.meetings.btn.back', 'Назад')}
            </button>
            <div id="meeting-protocol-editor-title"
                class="text-rbi-label sm:text-rbi-body font-black text-ink dark:text-white uppercase tracking-widest text-center flex-1 truncate px-1">
                ${_t('quality.meetings.title.protocol', 'Протокол')}
            </div>
            <div class="flex gap-1 sm:gap-1.5 shrink-0 flex-wrap justify-end">
                <button type="button" onclick="rbi_saveEditedMeeting()"
                    class="text-rbi-caption font-bold text-ink bg-surface border border-surface px-2.5 sm:px-3 py-2 rounded-lg active:scale-95 shadow-sm">${_t('quality.meetings.btn.save', 'Сохранить')}</button>
                <button type="button" onclick="rbi_printSavedMeetingDirty(window.currentEditingMeetingId,'script')"
                    class="text-rbi-caption font-bold text-brand bg-brand-soft border border-brand-soft px-2.5 sm:px-3 py-2 rounded-lg active:scale-95 shadow-sm">PDF</button>
                <button type="button" onclick="rbi_printSavedMeetingDirty(window.currentEditingMeetingId,'browser')"
                    class="text-rbi-caption font-bold text-ink bg-surface border border-surface px-2.5 sm:px-3 py-2 rounded-lg active:scale-95 shadow-sm hidden sm:inline-flex">${_t('quality.meetings.btn.print', 'Печать')}</button>
                <button type="button" onclick="rbi_exportMeetingDocxDirty(window.currentEditingMeetingId)"
                    class="text-rbi-caption font-bold text-white bg-sky-600 px-2.5 sm:px-3 py-2 rounded-lg active:scale-95 shadow-md">Word</button>
            </div>
        </div>
        <div id="meeting-protocol-editor-body" class="space-y-4 px-3 pb-28 max-w-3xl mx-auto"></div>
        <div class="fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-surface backdrop-blur-md px-3 py-3 sm:hidden">
            <div class="max-w-3xl mx-auto flex gap-2">
                <button type="button" onclick="rbi_printSavedMeetingDirty(window.currentEditingMeetingId,'browser')"
                    class="flex-1 bg-surface text-ink border border-surface py-3 rounded-xl font-bold text-rbi-caption uppercase">${_t('quality.meetings.btn.print', 'Печать')}</button>
                <button type="button" onclick="rbi_exportMeetingDocxDirty(window.currentEditingMeetingId)"
                    class="flex-1 bg-sky-600 text-white py-3 rounded-xl font-bold text-rbi-caption uppercase shadow-md">Word</button>
                <button type="button" onclick="copyExpertText('btn-copy-saved','saved-memo-text')" id="btn-copy-saved-mobile"
                    class="flex-1 bg-brand text-white py-3 rounded-xl font-bold text-rbi-caption uppercase shadow-md">${_t('quality.meetings.btn.copy_short', 'Копир.')}</button>
            </div>
        </div>
    </div>`);
}

function _collectMeetingEditorSnapshot() {
    const memo = document.getElementById('saved-memo-text')?.value || '';
    const notes = document.getElementById('saved-notes-text')?.value || '';
    const agenda = [];
    document.querySelectorAll('[data-agenda-idx]').forEach(function (row) {
        const idx = parseInt(row.getAttribute('data-agenda-idx'), 10);
        if (Number.isNaN(idx)) return;
        agenda.push({
            idx: idx,
            comment: row.querySelector('.mpe-comment')?.value || '',
            resp: (row.querySelector('.mpe-resp')?.value || '').trim(),
            date: row.querySelector('.mpe-date')?.value || '',
            isDone: !!row.querySelector('.mpe-done')?.checked
        });
    });
    agenda.sort(function (a, b) { return a.idx - b.idx; });
    const participants = collectParticipantsFromDom(document.getElementById('saved-participants-list'));
    return JSON.stringify({ memo: memo, notes: notes, agenda: agenda, participants: participants });
}

function _meetingEditorIsDirty() {
    if (!document.getElementById('meeting-protocol-editor-view')) return false;
    if (!document.getElementById('saved-memo-text')) return false;
    return _collectMeetingEditorSnapshot() !== _savedMeetingEditorBaseline;
}

async function _flushMeetingEditorIfDirty(promptMsg) {
    if (!_meetingEditorIsDirty()) return true;
    if (!confirm(promptMsg || _t('quality.meetings.confirm.save_before_continue', 'Сохранить правки перед продолжением?'))) return true;
    await saveEditedMeeting();
    return true;
}

/** Строка «Должность | ФИО | ✕» конструктора участников совещания. */
function _renderParticipantRowHtml(p) {
    const role = _escTa((p && p.role) || '');
    const name = _escTa((p && p.name) || '');
    return `
        <div class="meeting-participant-row flex gap-2 items-center">
            <input type="text" class="mp-role input-base !py-1.5 !text-rbi-caption w-[38%]" placeholder="${_t('quality.meetings.ph.participant_role', 'Должность')}" value="${role}">
            <input type="text" class="mp-name input-base !py-1.5 !text-rbi-caption flex-1" placeholder="${_t('quality.meetings.ph.participant_name', 'ФИО')}" value="${name}">
            <button type="button" onclick="rbi_removeMeetingParticipantRow(this)" class="text-muted hover:text-danger active:scale-90 font-black px-1.5 shrink-0">✕</button>
        </div>`;
}

/** Добавить пустую строку участника в список (конструктор совещания или редактор). */
export function addMeetingParticipantRow(listId) {
    const list = document.getElementById(listId || 'meeting-participants-list');
    if (!list) return;
    list.insertAdjacentHTML('beforeend', _renderParticipantRowHtml());
}

/** Убрать строку участника (оставить минимум одну пустую строку в списке). */
export function removeMeetingParticipantRow(btn) {
    const row = btn && btn.closest('.meeting-participant-row');
    if (!row) return;
    const list = row.parentElement;
    row.remove();
    if (list && !list.querySelector('.meeting-participant-row')) {
        list.insertAdjacentHTML('beforeend', _renderParticipantRowHtml());
    }
}

function _rbiCollectMeetingWsDraft() {
    const notesEl = document.getElementById('rbi-meeting-notes');
    if (!notesEl) return null;
    const notes = notesEl.value.trim();
    const memo = document.getElementById('rbi-meeting-memo-text')?.value.trim() || '';
    const photo = document.getElementById('meeting-photo-preview')?.dataset?.photo || '';
    const agenda = collectAgendaFromDom();
    const participants = collectParticipantsFromDom(document.getElementById('meeting-participants-list'));
    const agendaTouched = agenda.some(a => a.isDone || a.date || a.resp || a.comment);
    if (!notes && !memo && !photo && !agendaTouched && !participants.length) return null;
    return { notes, memo, photo, agenda, participants };
}

function _rbiApplyMeetingWsDraft(payload) {
    if (!payload) return;
    const notesEl = document.getElementById('rbi-meeting-notes');
    const memoEl = document.getElementById('rbi-meeting-memo-text');
    if (notesEl && payload.notes) notesEl.value = payload.notes;
    if (memoEl && payload.memo) memoEl.value = payload.memo;
    if (payload.photo) {
        const box = document.getElementById('meeting-photo-preview');
        if (box) {
            box.dataset.photo = payload.photo;
            box.classList.remove('hidden');
            const src = window.getPhotoSrc(payload.photo);
            box.innerHTML = `<img src="${src}" class="w-full h-full object-cover"><div onclick="event.stopPropagation(); document.getElementById('meeting-photo-preview').dataset.photo=''; document.getElementById('meeting-photo-preview').classList.add('hidden');" class="absolute top-2 right-2 bg-danger text-white w-6 h-6 rounded-full flex items-center justify-center font-black shadow-md cursor-pointer">✕</div>`;
            if (typeof PhotoManager !== 'undefined' && PhotoManager.getAsyncUrl) {
                PhotoManager.getAsyncUrl(payload.photo).then(realSrc => {
                    const img = box.querySelector('img');
                    if (img && realSrc) img.src = realSrc;
                });
            }
        }
    }
    if (Array.isArray(payload.participants) && payload.participants.length) {
        const list = document.getElementById('meeting-participants-list');
        if (list) {
            list.innerHTML = payload.participants.map(_renderParticipantRowHtml).join('');
        }
    }
    if (Array.isArray(payload.agenda)) {
        payload.agenda.forEach(draftItem => {
            const rows = document.querySelectorAll('.meeting-agenda-row');
            let row = null;
            rows.forEach(r => {
                const sk = r.querySelector('.agenda-meta-source-key')?.value || '';
                const id = r.querySelector('.agenda-meta-id')?.value || '';
                if (row) return;
                if (draftItem.sourceKey && sk === draftItem.sourceKey) row = r;
                else if (draftItem.id && id === draftItem.id) row = r;
            });
            if (!row) return;
            const cb = row.querySelector('.agenda-done-cb');
            if (cb) cb.checked = !!draftItem.isDone;
            const dateEl = row.querySelector('.agenda-date');
            if (dateEl && draftItem.date) dateEl.value = draftItem.date.split('T')[0];
            const respEl = row.querySelector('.agenda-resp');
            if (respEl && draftItem.resp) respEl.value = draftItem.resp;
            const commentEl = row.querySelector('.agenda-comment');
            if (commentEl && draftItem.comment) commentEl.value = draftItem.comment;
        });
    }
}

function _meetingsStorage() {
    if (_ctx && _ctx.storage) return _ctx.storage;
    if (window.RBI && window.RBI.services && window.RBI.services.storage) {
        return window.RBI.services.storage;
    }
    return {
        stores: function () { return typeof STORES !== 'undefined' ? STORES : {}; },
        get: function (store, key) { return dbGet(store, key); },
        getAll: function (store) { return dbGetAll(store); },
        put: function (store, data) { return dbPut(store, data); },
        delete: function (store, key) { return dbDelete(store, key); }
    };
}

function _isDemoMode() {
    return ((_ctx && _ctx.appMode) || window.RBI.services.appMode).isDemo();
}

function _getAllInspections() {
    if (_ctx && _ctx.inspections) return _ctx.inspections.getAllSync();
    if (window.RBI && window.RBI.services && window.RBI.services.inspections) {
        return window.RBI.services.inspections.getAllSync();
    }
    return Array.isArray(contractorArray) ? contractorArray : [];
}

function _meetingsSync(mode) {
    var m = mode || 'silent';
    if (_ctx && _ctx.sync) return _ctx.sync.trigger(m);
    if (window.RBI && window.RBI.services && window.RBI.services.sync) {
        return window.RBI.services.sync.trigger(m);
    }
    if (typeof triggerSync === 'function') return triggerSync(m);
    return Promise.resolve(false);
}

function _getSetting(key) {
    return ((_ctx && _ctx.settings) || window.RBI.services.settings).get(key);
}

function _getSkRecords() {
    if (_ctx && _ctx.sk) return _ctx.sk.getRecordsSync();
    if (window.RBI && window.RBI.services && window.RBI.services.sk) {
        return window.RBI.services.sk.getRecordsSync();
    }
    return Array.isArray(window.skRecords) ? window.skRecords : [];
}

function _gameLogAction(actionType, targetId) {
    if (_ctx && _ctx.game) return _ctx.game.logAction(actionType, targetId);
    if (window.RBI && window.RBI.services && window.RBI.services.game) {
        return window.RBI.services.game.logAction(actionType, targetId);
    }
    if (typeof gameLogAction === 'function') return gameLogAction(actionType, targetId);
}
function _getSkContractorMap() {
    if (_ctx && _ctx.sk) return _ctx.sk.getContractorMapSync();
    if (window.RBI && window.RBI.services && window.RBI.services.sk) {
        return window.RBI.services.sk.getContractorMapSync();
    }
    return window.skContractorMap || {};
}

function _getTasks() {
    if (_ctx && _ctx.tasks) return _ctx.tasks.getTasksSync();
    if (window.RBI && window.RBI.services && window.RBI.services.tasks) {
        return window.RBI.services.tasks.getTasksSync();
    }
    return typeof window.rbi_tasksData !== 'undefined' ? window.rbi_tasksData : [];
}

function _templates() {
    if (_ctx && _ctx.templates) return _ctx.templates;
    if (window.RBI && window.RBI.services && window.RBI.services.templates) {
        return window.RBI.services.templates;
    }
    return {
        getUserTemplates: function () {
            return typeof window.userTemplates !== 'undefined' ? window.userTemplates : {};
        },
        getSystemTemplates: function () {
            return typeof window.SYSTEM_TEMPLATES !== 'undefined' ? window.SYSTEM_TEMPLATES : {};
        }
    };
}

/* ── UI: счётчики замечаний / сводка типов у подрядчика ─────────────────────── */

function _zamechWord(n) {
    const abs = Math.abs(n) % 100;
    const d = abs % 10;
    if (abs > 10 && abs < 20) return _t('quality.meetings.remarks.many', 'замечаний');
    if (d === 1) return _t('quality.meetings.remarks.one', 'замечание');
    if (d >= 2 && d <= 4) return _t('quality.meetings.remarks.few', 'замечания');
    return _t('quality.meetings.remarks.many', 'замечаний');
}

/** Общее число замечаний в пункте (count или сумма ×N в details). */
function _totalRemarks(item, detailsArr) {
    const c = parseInt(item && item.count, 10);
    if (c > 0) return c;
    let sum = 0;
    (detailsArr || item?.details || []).forEach(d => {
        const m = String(d).match(/×(\d+)/);
        sum += m ? (parseInt(m[1], 10) || 1) : 1;
    });
    return sum || 1;
}

function _countChipHtml(total, tone = 'blue') {
    const cls = ({
        blue: 'bg-blue-600 text-white border-blue-700 dark:bg-blue-500 dark:border-blue-400',
        purple: 'bg-purple-600 text-white border-purple-700 dark:bg-purple-500 dark:border-purple-400',
        indigo: 'bg-brand text-white border-brand',
        red: 'bg-danger text-white border-danger',
        orange: 'bg-orange-500 text-white border-orange-600 dark:bg-orange-500 dark:border-orange-400'
    })[tone] || 'bg-blue-600 text-white border-blue-700 dark:bg-blue-500 dark:border-blue-400';
    return `<span class="text-rbi-caption font-black border px-1.5 py-0.5 rounded ${cls}">${total} ${_zamechWord(total)}</span>`;
}

/**
 * Долг: два вида по происхождению.
 * SK — незакрытый пункт ПК СК с прошлой планерки;
 * AUDIT — незакрытый пункт аудита (B3/B2).
 */
function _carryDebtKind(item) {
    if (!item || item.kind !== AGENDA_KIND.CARRY) return null;
    const ok = item.originKind || (String(item.sourceKey || '').split('|')[1] || '');
    const t = String(item.title || item.defect || '');
    if (ok === AGENDA_KIND.SK || /пк\s*ск|просрочено/i.test(t)) return 'SK';
    return 'AUDIT';
}

/** Визуал долга: фиолетовый = аудиты, индиго = ПК СК (не emerald-решения). */
function _carryVisual(item) {
    if (_carryDebtKind(item) === 'SK') {
        return {
            debtKind: 'SK',
            tone: 'indigo',
            badgeShort: _t('quality.meetings.debt.badge_sk', 'ДОЛГ СК'),
            title: _t('quality.meetings.debt.title_sk', 'Долг ПК СК — просроч. не решены с прошлой планерки'),
            badgeSolid: 'bg-brand text-white border-brand',
            softChip: 'bg-brand-soft text-brand border-brand-soft',
            catChip: 'bg-surface text-brand border-brand-soft',
            border: 'border-brand bg-brand-soft',
            cardBadge: 'bg-brand-soft text-brand'
        };
    }
    return {
        debtKind: 'AUDIT',
        tone: 'purple',
        badgeShort: _t('quality.meetings.debt.badge_audit', 'ДОЛГ АУД'),
        title: _t('quality.meetings.debt.title_audit', 'Долг аудит (не решено / повторно)'),
        badgeSolid: 'bg-purple-600 text-white border-purple-700 dark:bg-purple-500 dark:border-purple-400',
        softChip: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/50 dark:text-purple-200 dark:border-purple-700',
        catChip: 'bg-surface text-purple-800 border-purple-200 dark:text-purple-200 dark:border-purple-700',
        border: 'border-purple-500 bg-purple-50 dark:border-purple-400 dark:bg-purple-950/40',
        cardBadge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200'
    };
}

let _manualAgendaSeq = 0;
/** Уникальный id для вручную добавленного пункта повестки (используется и как основа sourceKey). */
function _makeManualAgendaId() {
    _manualAgendaSeq += 1;
    return `ag_manual_${Date.now()}_${_manualAgendaSeq}`;
}

/** Пересчитать disabled-состояние кнопок ▲/▼ на границах каждой agenda-группы. */
function _refreshAgendaGroupBoundaries(root) {
    root.querySelectorAll('[data-agenda-group-body]').forEach(groupBody => {
        const rows = Array.from(groupBody.querySelectorAll(':scope > .meeting-agenda-row'));
        rows.forEach((row, i) => {
            const upBtn = row.querySelector('[data-agenda-action="up"]');
            const downBtn = row.querySelector('[data-agenda-action="down"]');
            if (upBtn) {
                const disabled = i === 0;
                upBtn.disabled = disabled;
                upBtn.classList.toggle('opacity-20', disabled);
                upBtn.classList.toggle('pointer-events-none', disabled);
            }
            if (downBtn) {
                const disabled = i === rows.length - 1;
                downBtn.disabled = disabled;
                downBtn.classList.toggle('opacity-20', disabled);
                downBtn.classList.toggle('pointer-events-none', disabled);
            }
        });
    });
}

/**
 * Один делегированный click-обработчик editor'а повестки на контейнере воркспейса
 * (add/remove/up/down пункта). Перевешивается на каждый рендер workspace (container
 * переиспользуется между открытиями), без новых window.*-точек/inline onclick.
 */
function _bindAgendaEditorDelegation(container, renderAgendaRow) {
    if (container.__agendaClickHandler) {
        container.removeEventListener('click', container.__agendaClickHandler);
    }
    const handler = (e) => {
        const btn = e.target.closest('[data-agenda-action]');
        if (!btn || btn.disabled) return;
        const action = btn.dataset.agendaAction;

        if (action === 'add') {
            const groupKey = btn.dataset.agendaGroup || '';
            const groupBody = Array.from(container.querySelectorAll('[data-agenda-group-body]'))
                .find(el => el.dataset.agendaGroupBody === groupKey);
            if (!groupBody) return;
            const id = _makeManualAgendaId();
            const contr = (groupKey === '__misc__' || groupKey === '—') ? '' : groupKey;
            const newItem = {
                id, contr, kind: AGENDA_KIND.MANUAL, title: '', defect: '', details: [],
                count: 1, isDone: false, date: '', resp: '', comment: '', reopened: false, resolvedAt: null
            };
            newItem.sourceKey = agendaItemSourceKey({ contr, kind: AGENDA_KIND.MANUAL, name: id });
            groupBody.insertAdjacentHTML('beforeend', renderAgendaRow(newItem));
            _refreshAgendaGroupBoundaries(container);
            const newRow = groupBody.lastElementChild;
            const textarea = newRow && newRow.querySelector('.agenda-manual-text');
            if (textarea) textarea.focus();
            return;
        }

        const row = btn.closest('.meeting-agenda-row');
        if (!row) return;
        if (action === 'remove') {
            if (!window.confirm(_t('quality.meetings.confirm.remove_agenda_item', 'Удалить этот пункт повестки?'))) return;
            row.remove();
            _refreshAgendaGroupBoundaries(container);
            return;
        }
        if (action === 'up' || action === 'down') {
            const groupBody = row.parentElement;
            if (!groupBody) return;
            const rows = Array.from(groupBody.querySelectorAll(':scope > .meeting-agenda-row'));
            const idx = rows.indexOf(row);
            if (action === 'up' && idx > 0) groupBody.insertBefore(row, rows[idx - 1]);
            if (action === 'down' && idx >= 0 && idx < rows.length - 1) groupBody.insertBefore(rows[idx + 1], row);
            _refreshAgendaGroupBoundaries(container);
        }
    };
    container.__agendaClickHandler = handler;
    container.addEventListener('click', handler);
}

/** Корзина типа для UI-блоков (не сводки). */
function _agendaTypeBucket(item) {
    if (!item) return null;
    const k = item.kind;
    const t = String(item.title || '');
    const ok = item.originKind || (String(item.sourceKey || '').split('|')[1] || '');
    if (k === AGENDA_KIND.MANUAL) return 'MANUAL';
    if (k === AGENDA_KIND.CARRY) {
        return _carryDebtKind(item) === 'SK' ? 'CARRY_SK' : 'CARRY_AUDIT';
    }
    if (k === AGENDA_KIND.SK || ok === AGENDA_KIND.SK || /пк\s*ск|просрочено/i.test(t)) return 'SK';
    if (k === AGENDA_KIND.B3 || ok === AGENDA_KIND.B3 || /крит\.?\s*деф|^\s*b3\b/i.test(t)) return 'B3';
    if (k === AGENDA_KIND.B2 || ok === AGENDA_KIND.B2 || /повторяющ|^\s*b2\b/i.test(t)) return 'B2';
    if (k === AGENDA_KIND.REOPENED) {
        if (/крит\.?\s*деф|^\s*b3\b/i.test(t)) return 'B3';
        if (/повторяющ|^\s*b2\b/i.test(t)) return 'B2';
        if (/пк\s*ск|просрочено/i.test(t)) return 'SK';
    }
    return null;
}

function _isAuditB3(item) {
    const t = String(item.title || '');
    const ok = item.originKind || (String(item.sourceKey || '').split('|')[1] || '');
    return item.kind === AGENDA_KIND.B3 || ok === AGENDA_KIND.B3
        || /крит\.?\s*деф|^\s*b3\b/i.test(t);
}

function _isAuditB2(item) {
    const t = String(item.title || '');
    const ok = item.originKind || (String(item.sourceKey || '').split('|')[1] || '');
    return item.kind === AGENDA_KIND.B2 || ok === AGENDA_KIND.B2
        || /повторяющ|^\s*b2\b/i.test(t);
}

/**
 * Сводка у подрядчика:
 * Аудит (B2/B3) · Долг аудит не решено/повторно (B2/B3) · ПК СК · Долг ПК СК
 */
function _contrTypeSummaryHtml(items) {
    const s = { auditB2: 0, auditB3: 0, debtB2: 0, debtB3: 0, sk: 0, debtSk: 0 };
    (items || []).forEach(item => {
        const n = _totalRemarks(item, item.details);
        const k = item.kind;
        const isReopened = k === AGENDA_KIND.REOPENED || !!item.reopened;

        if (k === AGENDA_KIND.CARRY) {
            if (_carryDebtKind(item) === 'SK') {
                s.debtSk += n;
            } else if (_isAuditB3(item)) {
                s.debtB3 += n;
            } else {
                s.debtB2 += n;
            }
            return;
        }
        if (k === AGENDA_KIND.SK || /пк\s*ск|просрочено/i.test(String(item.title || ''))) {
            // повторно открытый СК тоже в «текущий ПК СК» (свежая просрочка)
            s.sk += n;
            return;
        }
        if (isReopened) {
            if (_isAuditB3(item)) s.debtB3 += n;
            else if (_isAuditB2(item)) s.debtB2 += n;
            return;
        }
        if (k === AGENDA_KIND.B3) s.auditB3 += n;
        else if (k === AGENDA_KIND.B2) s.auditB2 += n;
    });

    const chip = (label, n, cls) => (n
        ? `<span class="text-rbi-caption font-black border px-1.5 py-0.5 rounded ${cls}">${label} · ${n}</span>`
        : '');
    const numChip = (n, cls) => (n
        ? `<span class="text-rbi-caption font-black border px-1.5 py-0.5 rounded ${cls}">${n}</span>`
        : '');
    const group = (label, labelCls, inner) => (inner
        ? `<span class="inline-flex flex-wrap items-center gap-1">
                <span class="text-rbi-caption font-black uppercase tracking-wide ${labelCls}">${label}</span>
                ${inner}
           </span>`
        : '');

    // solid chips — одинаково читаются в light/dark
    const b2Cls = 'bg-orange-500 text-white border-orange-600 dark:bg-orange-500 dark:border-orange-400';
    const b3Cls = 'bg-danger text-white border-danger';
    const skCls = 'bg-blue-600 text-white border-blue-700 dark:bg-blue-500 dark:border-blue-400';
    const debtSkCls = 'bg-brand text-white border-brand';

    const auditInner = [chip('B2', s.auditB2, b2Cls), chip('B3', s.auditB3, b3Cls)].filter(Boolean).join('');
    const debtAuditInner = [chip('B2', s.debtB2, b2Cls), chip('B3', s.debtB3, b3Cls)].filter(Boolean).join('');
    const skInner = numChip(s.sk, skCls);
    const debtSkInner = numChip(s.debtSk, debtSkCls);

    const groups = [
        group(_t('quality.meetings.summary.audit', 'Аудит'), 'text-muted', auditInner),
        group(_t('quality.meetings.summary.debt_audit', 'Долг аудит'), 'text-purple-700 dark:text-purple-300', debtAuditInner),
        group(_t('quality.meetings.label.sk_overdue', 'Проср. в ПК СК'), 'text-blue-700 dark:text-blue-300', skInner),
        group(_t('quality.meetings.summary.debt_sk', 'Долг ПК СК · не решено'), 'text-brand', debtSkInner)
    ].filter(Boolean);

    if (!groups.length) return '';
    return `<span class="flex flex-wrap gap-x-3 gap-y-1 ml-0 sm:ml-1.5 mt-1 w-full">${groups.join('')}</span>`;
}

/* ── renderMeetingTab ────────────────────────────────────────────────────────── */

/** @param {{ listOnly?: boolean }} [options] listOnly — только список (как KB), шапка и аккордеоны не сбрасываются */
export function renderMeetingTab(options) {
    const listOnly = !!(options && options.listOnly);
    const FD = window.RBIFormDraft;
    const notesEl = document.getElementById('rbi-meeting-notes');
    if (!listOnly && FD && notesEl && !_meetingDraftSkipSave) {
        FD.saveNow(FD.KEYS.MEETING_WS, _rbiCollectMeetingWsDraft);
        FD.unbindAutoSave(FD.KEYS.MEETING_WS);
    }
    if (!listOnly) _meetingDraftSkipSave = false;

    const container = document.getElementById('rbi-meeting-container');
    if (!container) return;

    const toggleHtml = (typeof window.kbViewModeToggleHtml === 'function')
        ? window.kbViewModeToggleHtml('meetings')
        : '';

    const titleContainer = container.previousElementSibling;
    if (!listOnly && titleContainer) {
        titleContainer.className = "sticky-top-panel bg-[var(--card-border)]/80 backdrop-blur-md p-3 rounded-xl border border-[var(--card-border)] shadow-sm mb-4 z-40";
        titleContainer.innerHTML = `
            <div class="flex flex-wrap justify-between items-center gap-2">
                <h2 class="text-rbi-body font-black uppercase text-ink dark:text-white tracking-tight flex items-center gap-1.5 min-w-0">
                    <svg class="w-4 h-4 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    <span class="truncate">${_t('quality.meetings.title.list', 'Протоколы Совещаний')}</span>
                </h2>
                <div class="flex flex-wrap items-center gap-2">
                    <div id="meetings-view-mode-toggle">${toggleHtml}</div>
                    <button onclick="rbi_createMeeting()" class="bg-orange-500 text-white px-3 py-1.5 rounded-lg shadow-md active:scale-95 text-rbi-caption font-black uppercase whitespace-nowrap flex items-center gap-1">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg> ${_t('quality.meetings.btn.new', 'Новое')}
                    </button>
                </div>
            </div>
        `;
    } else if (listOnly) {
        const toggleHost = document.getElementById('meetings-view-mode-toggle');
        if (toggleHost && toggleHtml) toggleHost.innerHTML = toggleHtml;
    }

    const expanded = (typeof window._kbCaptureExpandedGroups === 'function')
        ? window._kbCaptureExpandedGroups(container)
        : null;

    if (!window.rbi_meetingsData || window.rbi_meetingsData.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-muted text-rbi-label font-bold uppercase tracking-widest bg-[var(--card-bg)] rounded-xl border border-dashed border-[var(--card-border)] shadow-sm">${_t('quality.meetings.empty.no_protocols', 'Активных протоколов нет')}</div>`;
        return;
    }

    const currentEngineer = _getSetting('engineerName') || _t('quality.meetings.label.engineer', 'Инженер');
    const sorted = [...window.rbi_meetingsData]
        .filter(m => m && m.id && m.date && m.title && m.memoText && !m._deleted)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (!sorted.length) {
        container.innerHTML = `<div class="text-center py-10 text-muted text-rbi-label font-bold uppercase tracking-widest bg-[var(--card-bg)] rounded-xl border border-dashed border-[var(--card-border)] shadow-sm">${_t('quality.meetings.empty.no_protocols', 'Активных протоколов нет')}</div>`;
        return;
    }

    const isListView = (typeof window.getKnowledgeViewMode === 'function'
        ? window.getKnowledgeViewMode('meetings')
        : 'cards') === 'list';
    const itemsWrapClass = isListView
        ? 'flex flex-col gap-1.5'
        : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3';

    const meetingGroupLabels = (m) => {
        if (Array.isArray(m.projectNames) && m.projectNames.length) {
            return [...new Set(m.projectNames.map(n => String(n).trim()).filter(Boolean))];
        }
        const raw = String(m.projectName || m.project || m.project_display_name || '').trim();
        if (!raw) return [_dispProjectLabel('')];
        if (raw === 'Все объекты') return [_dispProjectLabel(raw)];
        if (raw.includes(',')) {
            const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
            if (parts.length > 1) return [...new Set(parts)];
        }
        return [raw];
    };

    const renderMeetingItem = (m) => {
        const isOwner = !m.author || m.author === currentEngineer;
        const safeTitle = String(m.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const authorShort = m.author ? m.author.split(' ')[0] : _t('quality.meetings.label.engineer', 'Инженер');
        const resolvedCount = m.agenda ? m.agenda.filter(a => a.isDone).length : 0;
        const totalCount = m.agenda ? m.agenda.length : 0;
        const dateStr = (function (raw) {
            const s = String(raw || '').trim();
            const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) return m[3] + '.' + m[2] + '.' + m[1];
            const d = new Date(raw);
            if (Number.isNaN(d.getTime())) return '';
            return d.toLocaleDateString('ru-RU');
        })(m.date);
        const periodLabel = _periodLabelFromCode(m.period, m.periodText);
        const memoPreview = _meetingPlainPreview(m.memoText, 160);
        const thumb = m.qDayPhoto
            ? `<img ${(typeof window.rbiBuildPhotoImgAttrs === 'function') ? window.rbiBuildPhotoImgAttrs(m.qDayPhoto, { preferThumb: true }) : ('src="' + window.getPhotoSrc(m.qDayPhoto) + '"')} class="w-full h-full object-cover">`
            : _meetingPhotoPlaceholder('thumb');
        const metaLine = [
            dateStr ? _t('quality.meetings.meta.held', 'Проведено {date}', { date: dateStr }) : '',
            periodLabel ? _t('quality.meetings.meta.review_for', 'Разбор за {period}', { period: periodLabel }) : '',
            _t('quality.meetings.meta.questions', 'Вопросов {done}/{total}', { done: resolvedCount, total: totalCount }),
            authorShort
        ].filter(Boolean).join(' · ');

        if (isListView) {
            return `
            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm flex items-center gap-2.5 p-2 active:scale-[0.99] transition-transform relative cursor-pointer" onclick="rbi_openSavedMeeting('${m.id}')">
                <div class="w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-[var(--card-border)]">${thumb}</div>
                <div class="min-w-0 flex-1">
                    <div class="text-rbi-body font-bold text-ink dark:text-white leading-snug">${m.title}</div>
                    <div class="text-rbi-caption font-bold text-muted mt-0.5 leading-snug">${metaLine}</div>
                </div>
                <button onclick="event.stopPropagation(); openUniversalActionSheet('${m.id}', 'meeting', '${safeTitle}', ${isOwner})" class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-muted hover:bg-[var(--hover-bg)] active:scale-90">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
                </button>
            </div>`;
        }

        const previewHtml = m.qDayPhoto
            ? `<img ${(typeof window.rbiBuildPhotoImgAttrs === 'function') ? window.rbiBuildPhotoImgAttrs(m.qDayPhoto, { preferThumb: true }) : ('src="' + window.getPhotoSrc(m.qDayPhoto) + '"')} class="w-full h-full object-cover">`
            : _meetingPhotoPlaceholder('card');

        return `
        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden flex flex-col active:scale-[0.98] transition-transform relative cursor-pointer" onclick="rbi_openSavedMeeting('${m.id}')">
            <div class="h-24 sm:h-28 border-b border-[var(--card-border)] relative">
                ${previewHtml}
                <button onclick="event.stopPropagation(); openUniversalActionSheet('${m.id}', 'meeting', '${safeTitle}', ${isOwner})" class="absolute top-2 right-2 w-8 h-8 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white active:scale-90 transition-transform shadow-md border border-white/20">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
                </button>
            </div>
            <div class="p-3 flex flex-col flex-1 min-w-0">
                <div class="text-rbi-body font-black text-ink dark:text-white uppercase tracking-tight mb-1 leading-snug">${m.title}</div>
                <div class="text-rbi-caption font-bold text-[var(--text-muted)] mb-2 leading-snug">${metaLine}</div>
                <div class="text-rbi-caption text-muted leading-snug line-clamp-2 mb-2 flex-1">
                    ${memoPreview}
                </div>
                <div class="mt-auto border-t border-[var(--card-border)] pt-2 flex justify-between items-center gap-2">
                    <div class="text-rbi-caption font-bold text-[var(--text-muted)] min-w-0 leading-snug">
                        <svg class="w-3 h-3 inline-block mr-0.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                        ${authorShort}
                    </div>
                    <div class="text-rbi-caption font-black text-muted shrink-0">${dateStr}</div>
                </div>
            </div>
        </div>`;
    };

    const grouped = {};
    sorted.forEach((m) => {
        meetingGroupLabels(m).forEach((pName) => {
            if (!grouped[pName]) grouped[pName] = [];
            grouped[pName].push(m);
        });
    });
    const collator = new Intl.Collator('ru');
    const groupKeys = Object.keys(grouped).sort((a, b) => {
        if (a === 'Без объекта') return 1;
        if (b === 'Без объекта') return -1;
        if (a === 'Все объекты') return 1;
        if (b === 'Все объекты') return -1;
        return collator.compare(a, b);
    });

    let groupIndex = 0;
    container.innerHTML = groupKeys.map((pName) => {
        const items = grouped[pName];
        const safeGroupId = `meetings-group-${groupIndex++}`;
        const cardsHtml = items.map(renderMeetingItem).join('');
        return `
            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-[14px] shadow-sm mb-2 overflow-hidden">
                <div class="flex justify-between items-center p-2.5 cursor-pointer active:bg-[var(--hover-bg)] transition-colors select-none" onclick="
                    const body = document.getElementById('${safeGroupId}');
                    const icon = this.querySelector('.chevron-icon');
                    if (body.classList.contains('hidden')) {
                        body.classList.remove('hidden');
                        icon.style.transform = 'rotate(180deg)';
                    } else {
                        body.classList.add('hidden');
                        icon.style.transform = 'rotate(0deg)';
                    }
                ">
                    <div class="flex items-center gap-2.5 min-w-0 pr-2">
                        <div class="w-8 h-8 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-[10px] flex items-center justify-center shrink-0 border border-orange-100 dark:border-orange-800">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                        </div>
                        <div class="min-w-0">
                            <div class="text-rbi-body font-black text-ink dark:text-white truncate leading-tight">${String(_dispProjectLabel(pName)).replace(/</g, '&lt;')}</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0 pl-1">
                        <span class="text-rbi-caption font-bold text-muted bg-[var(--hover-bg)] px-1.5 py-0.5 rounded-md border border-[var(--card-border)]">${_t('quality.meetings.meta.pcs', '{n} шт', { n: items.length })}</span>
                        <svg class="w-4 h-4 text-muted transition-transform duration-300 transform rotate-0 chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
                <div id="${safeGroupId}" class="hidden border-t border-[var(--card-border)] bg-surface p-2.5">
                    <div class="${itemsWrapClass}">${cardsHtml}</div>
                </div>
            </div>`;
    }).join('');

    if (typeof window._kbRestoreExpandedGroups === 'function') {
        window._kbRestoreExpandedGroups(container, expanded);
    }
    if (typeof window.rbiHydrateLocalImages === 'function') {
        window.rbiHydrateLocalImages(container);
    }
}

/* ── openSavedMeeting ────────────────────────────────────────────────────────── */

export async function openSavedMeeting(id) {
    const meet = window.rbi_meetingsData.find(m => m.id === id);
    if (!meet) return;

    window.currentEditingMeetingId = id;
    _savedMeetingBaselineMemo = meet.memoText || '';

    let photoHtml = '';
    if (meet.qDayPhoto) {
        const realSrc = await PhotoManager.getAsyncUrl(meet.qDayPhoto) || window.getPhotoSrc(meet.qDayPhoto);
        photoHtml = `
            <div class="mb-4 rounded-xl overflow-hidden border border-surface shadow-sm h-48 sm:h-56 relative bg-surface">
                <img src="${realSrc}" class="w-full h-full object-cover cursor-pointer active:scale-95 transition-transform" onclick="setTimeout(() => openPhotoViewer('${meet.qDayPhoto}'), 100)">
                <div class="absolute top-2 left-2 bg-black/50 text-white text-rbi-caption font-black uppercase px-2 py-1 rounded backdrop-blur-sm">${_t('quality.meetings.photo.capture', '📸 Фото фиксация')}</div>
            </div>`;
    }

    let agendaHtml = '';
    if (meet.agenda && meet.agenda.length > 0) {
        const _bulletList = (detailsArr) => {
            const items = detailsArr.map(d => {
                let raw = String(d || '')
                    .replace(/просрочено\s+в\s+пк\s*ск\s*[·:.—–\-]?\s*/giu, '')
                    .replace(/просрочено\s+в\s+ск\s*[·:.—–\-]?\s*/giu, '');
                let count = 0;
                let reopened = false;
                raw = raw.replace(/\s·\s×(\d+)\s*$/u, (_, n) => {
                    count = parseInt(n, 10) || 0;
                    return '';
                });
                raw = raw.replace(/\s·\s↻\s*повторно\s*$/iu, () => { reopened = true; return ''; });
                raw = raw.replace(/\s·\s↻\s*$/u, () => { reopened = true; return ''; });
                const body = raw.replace(/\r\n/g, '\n').replace(/\t+/g, ' ')
                    .replace(/^[\s]*[-*•●]\s+/gm, '').trim();
                const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
                const head = (lines[0] || body).replace(/</g, '&lt;');
                const rest = lines.slice(1).map(l => ` ${l.replace(/</g, '&lt;')}`).join('');
                const meta = [
                    count > 1 ? `×${count}` : '',
                    reopened ? '↻' : ''
                ].filter(Boolean).join(' ');
                return `<li class="text-rbi-label text-ink leading-snug">${head}${rest}${meta ? ` <span class="text-muted font-semibold">${meta}</span>` : ''}</li>`;
            }).join('');
            return items ? `<ul class="mt-1.5 list-disc pl-4 space-y-0.5">${items}</ul>` : '';
        };

        const _renderSavedItemBody = (a) => {
            const reopen = a.reopened || a.kind === AGENDA_KIND.REOPENED
                ? `<span class="bg-amber-100 text-amber-800 border-amber-200 px-2 py-1 rounded border uppercase tracking-widest">${_t('quality.meetings.badge.reopened_after', '↻ Повторно после решения')}</span>`
                : '';
            const bucket = _agendaTypeBucket(a);
            const isSk = bucket === 'SK';
            const isCarry = bucket === 'CARRY_SK' || bucket === 'CARRY_AUDIT' || a.kind === AGENDA_KIND.CARRY;
            const isB3 = bucket === 'B3';
            const isB2 = bucket === 'B2';
            let defectHtml;
            if (isCarry) {
                const vis = _carryVisual(a);
                const ok = a.originKind || (String(a.sourceKey || '').split('|')[1] || '');
                const titleRaw = String(a.title || '');
                const sm = titleRaw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
                const cat = (sm ? sm[1] : titleRaw).replace(/просрочено в пк\s*ск\s*[·:.—–-]?\s*/i, '').trim();
                const stats = sm ? sm[2] : '';
                let typeLabel = _t('quality.meetings.label.open_item', 'Незакрытый пункт');
                let catLabel = '';
                if (ok === 'B3' || /крит/i.test(titleRaw)) typeLabel = 'Крит. деф. (B3)';
                else if (ok === 'B2' || /повторяющ/i.test(titleRaw)) typeLabel = 'Повторяющиеся нарушения (B2)';
                else if (ok === 'SK' || /пк\s*ск|просрочено/i.test(titleRaw)) {
                    typeLabel = _t('quality.meetings.label.sk_overdue', 'Проср. в ПК СК');
                    if (cat && !/долг|просрочено/i.test(cat)) catLabel = cat;
                }
                const stripNoise = (s) => String(s || '')
                    .replace(/^просрочено в пк\s*ск\s*[·:.—–-]?\s*/i, '')
                    .replace(/^пк\s*ск\s*[·:.—–-]?\s*/i, '')
                    .trim();
                const dets = (Array.isArray(a.details) && a.details.length
                    ? a.details
                    : String(a.defect || '').split('\n').map(l => l.replace(/^[\s]*[•●\-]\s*/, '').trim()))
                    .map(stripNoise)
                    .filter(l => l && !/:$/.test(l) && !/^(просрочено|пк\s*ск|долг с прошл|долг по аудит|долг пк)/i.test(l));
                const total = _totalRemarks(a, dets);
                const chips = [
                    `<span class="text-rbi-caption font-bold border px-1.5 py-0.5 rounded ${vis.softChip}">${typeLabel}</span>`,
                    catLabel ? `<span class="text-rbi-caption font-bold border px-1.5 py-0.5 rounded ${vis.catChip}">${catLabel.replace(/</g, '&lt;')}</span>` : '',
                    _countChipHtml(total, vis.tone),
                    ...(stats ? stats.split(',').map(p => p.trim()).filter(Boolean)
                        .filter(p => !/^\d+\s*шт/i.test(p) && !/замечан/i.test(p))
                        .map(p => `<span class="text-rbi-caption font-bold bg-surface px-1.5 py-0.5 rounded border border-surface">${p.replace(/</g, '&lt;')}</span>`) : [])
                ].filter(Boolean).join('');
                defectHtml = `
                    <div class="mb-2 flex flex-wrap items-center gap-1.5">
                        <span class="text-rbi-caption font-black border px-1.5 py-0.5 rounded ${vis.badgeSolid}">${vis.badgeShort}</span>
                        <span class="font-black">${vis.title}</span>
                        ${chips}
                    </div>
                    ${_bulletList(dets)}`;
            } else if (isSk && Array.isArray(a.details) && a.details.length > 0) {
                const t = String(a.title || '');
                const m = t.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
                const name = (m ? m[1] : t).trim().replace(/</g, '&lt;');
                const total = _totalRemarks(a, a.details);
                const extra = m ? m[2].split(',').map(p => p.trim()).filter(Boolean)
                    .filter(p => !/^\d+\s*шт/i.test(p) && !/замечан/i.test(p))
                    .map(p => `<span class="text-rbi-caption font-bold bg-surface px-1.5 py-0.5 rounded border border-surface">${p.replace(/</g, '&lt;')}</span>`).join('') : '';
                defectHtml = `<div class="mb-1 flex flex-wrap items-center gap-1.5"><span class="font-black">${_t('quality.meetings.label.sk_overdue', 'Проср. в ПК СК')} · ${name}</span>${_countChipHtml(total, 'blue')}${extra}</div>`
                    + _bulletList(a.details);
            } else if (isB3 || isB2) {
                const tone = isB3 ? 'red' : 'orange';
                const label = String(a.title || (isB3 ? 'Крит. деф. (B3)' : 'Повторяющиеся нарушения')).replace(/</g, '&lt;');
                const dets = Array.isArray(a.details) ? a.details : [];
                const total = _totalRemarks(a, dets);
                defectHtml = `<div class="mb-1 flex flex-wrap items-center gap-1.5"><span class="font-black">${label}</span>${_countChipHtml(total, tone)}</div>`
                    + (dets.length
                        ? _bulletList(dets)
                        : `<div>${String(a.defect || '').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>`);
            } else if (Array.isArray(a.details) && a.details.length > 0) {
                const t = a.title ? `<div class="font-bold mb-1">${String(a.title).replace(/</g, '&lt;')}</div>` : '';
                defectHtml = `${t}<ul class="list-disc pl-4 space-y-0.5"><li>${a.details.map(d => String(d).replace(/</g, '&lt;').replace(/\n/g, '<br>')).join('</li><li>')}</li></ul>`;
            } else {
                defectHtml = String(a.defect || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
            }
            const aIdx = meet.agenda.indexOf(a);
            const dateVal = a.date ? String(a.date).slice(0, 10) : '';
            return `
            <div class="border border-surface p-3 rounded-xl mb-2 bg-surface" data-agenda-idx="${aIdx}">
                <div class="text-rbi-label text-ink font-medium mb-3 leading-snug">${defectHtml}</div>
                ${reopen ? `<div class="mb-2">${reopen}</div>` : ''}
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    <label class="block">
                        <span class="text-rbi-caption font-black uppercase text-muted tracking-widest">${_t('quality.meetings.field.responsible', 'Ответственный')}</span>
                        <input type="text" class="mpe-resp input-base text-rbi-label mt-1" value="${_escTa(a.resp || '')}" placeholder="${_t('quality.meetings.ph.fio_role', 'ФИО / роль')}">
                    </label>
                    <label class="block">
                        <span class="text-rbi-caption font-black uppercase text-muted tracking-widest">${_t('quality.meetings.field.deadline', 'Срок')}</span>
                        <input type="date" class="mpe-date input-base text-rbi-label mt-1" value="${_escTa(dateVal)}">
                    </label>
                </div>
                <label class="block mb-2">
                    <span class="text-rbi-caption font-black uppercase text-muted tracking-widest">${_t('quality.meetings.field.decision', 'Решение / комментарий')}</span>
                    <textarea class="mpe-comment input-base text-rbi-label mt-1 h-20 resize-none custom-scrollbar" placeholder="${_t('quality.meetings.ph.decision', 'Решение по пункту...')}">${_escTa(a.comment || '')}</textarea>
                </label>
                <label class="inline-flex items-center gap-2 text-rbi-label font-bold text-ink">
                    <input type="checkbox" class="mpe-done w-4 h-4 rounded border-surface" ${a.isDone ? 'checked' : ''}>
                    ${_t('quality.meetings.checkbox.done', 'Решено')}
                </label>
            </div>`;
        };

        const byContr = {};
        meet.agenda.forEach(a => {
            const c = a.contr || '—';
            if (!byContr[c]) byContr[c] = [];
            byContr[c].push(a);
        });
        agendaHtml = Object.keys(byContr).map(cName => `
            <div class="bg-surface border border-surface rounded-xl mb-3 shadow-sm overflow-hidden">
                <div class="px-3 pt-2.5 pb-2 bg-surface/90 border-b border-surface/80">
                    <div class="text-rbi-body font-black text-ink uppercase">
                        <div>${String(cName).replace(/</g, '&lt;')}</div>
                        ${_contrTypeSummaryHtml(byContr[cName])}
                    </div>
                </div>
                <div class="p-3">
                    ${byContr[cName].map(_renderSavedItemBody).join('')}
                </div>
            </div>
        `).join('');
    } else {
        agendaHtml = `<div class="text-rbi-caption text-muted italic text-center py-4 bg-surface rounded-xl border border-dashed border-surface">${_t('quality.meetings.empty.agenda_not_saved', 'Детальная повестка не сохранена')}</div>`;
    }

    const projectLabelRaw = String(meet.projectName || meet.project || meet.project_display_name || '').trim();
    const projectLabel = _dispProjectLabel(projectLabelRaw);
    const canBind = _meetingCanBindMeeting(meet);
    const bindBtn = canBind
        ? `<button type="button" onclick="rbi_openMeetingBindModal('${String(meet.id).replace(/'/g, "\\'")}')" class="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-1 rounded-lg text-rbi-caption font-black uppercase active:scale-95 shrink-0">${_t('quality.meetings.btn.change_project', 'Изменить объект')}</button>`
        : '';
    const dateLabel = new Date(meet.date).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    _ensureMeetingProtocolEditorView();
    const view = document.getElementById('meeting-protocol-editor-view');
    const body = document.getElementById('meeting-protocol-editor-body');
    const titleEl = document.getElementById('meeting-protocol-editor-title');
    if (!view || !body) return;

    if (titleEl) {
        titleEl.textContent = !projectLabelRaw
            ? _t('quality.meetings.title.protocol_dated', 'Протокол · {date}', { date: dateLabel })
            : projectLabel;
    }

    body.innerHTML = `
        <div class="bg-surface border border-surface rounded-2xl p-4 shadow-sm space-y-3">
            <div class="text-rbi-body font-black uppercase text-brand border-b border-surface pb-2">
                ${_t('quality.meetings.section.requisites', 'Реквизиты протокола')}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-rbi-label">
                <div><span class="text-rbi-caption font-black uppercase text-muted tracking-widest block mb-1">${_t('quality.meetings.field.author', 'Автор')}</span>
                    <span class="font-bold text-ink">${_escTa(meet.author || '—')}</span></div>
                <div><span class="text-rbi-caption font-black uppercase text-muted tracking-widest block mb-1">${_t('quality.meetings.field.composed', 'Составлено')}</span>
                    <span class="font-bold text-ink">${_escTa(dateLabel)}</span></div>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2 bg-surface border border-surface rounded-xl px-3 py-2">
                <div class="min-w-0 text-rbi-label font-bold text-ink">
                    <span class="text-rbi-caption font-black uppercase text-muted tracking-widest mr-1.5">${_t('quality.meetings.field.project', 'Объект')}</span>
                    <span>${projectLabel.replace(/</g, '&lt;')}</span>
                </div>
                ${bindBtn}
            </div>
        </div>

        <div class="bg-surface border border-surface rounded-2xl p-4 shadow-sm">
            <div class="text-rbi-body font-black uppercase text-ink border-b border-surface pb-2 mb-3">
                ${_t('quality.meetings.workspace.participants', 'Участники совещания')}
            </div>
            <div id="saved-participants-list" class="space-y-2 mb-2">${
                (Array.isArray(meet.participants) && meet.participants.length
                    ? meet.participants.map(_renderParticipantRowHtml).join('')
                    : _renderParticipantRowHtml({ role: '', name: meet.author || _meetingCurrentEngineerName() }))
            }</div>
            <button type="button" onclick="rbi_addMeetingParticipantRow('saved-participants-list')" class="w-full bg-surface border border-dashed border-surface text-muted py-2 rounded-lg font-bold text-rbi-caption uppercase active:scale-95 transition-colors hover:border-surface">${_t('quality.meetings.btn.add_participant', '+ Добавить участника')}</button>
        </div>

        ${photoHtml}

        <div class="bg-surface border border-surface rounded-2xl p-4 shadow-sm">
            <div class="text-rbi-body font-black uppercase text-green-600 dark:text-green-400 border-b border-surface pb-2 mb-3">
                ${_t('quality.meetings.section.memo', '1. Итоговое решение (мемо)')}
            </div>
            <textarea id="saved-memo-text"
                class="w-full text-rbi-body leading-relaxed text-ink bg-surface p-3 sm:p-4 rounded-xl border border-surface shadow-inner whitespace-pre-wrap font-medium min-h-[220px] resize-y outline-none focus:ring-2 focus:ring-indigo-300 custom-scrollbar"
                placeholder="${_t('quality.meetings.ph.memo', 'Текст итогового решения...')}">${_escTa(meet.memoText || '')}</textarea>
            <div class="mt-2 flex justify-end">
                <button type="button" onclick="copyExpertText('btn-copy-saved','saved-memo-text')" id="btn-copy-saved"
                    class="hidden sm:inline-flex text-rbi-caption font-bold text-brand bg-brand-soft border border-brand-soft px-3 py-1.5 rounded-lg active:scale-95">${_t('quality.meetings.btn.copy_memo', 'Копировать мемо')}</button>
            </div>
        </div>

        <div class="bg-surface border border-surface rounded-2xl p-4 shadow-sm">
            <div class="text-rbi-body font-black uppercase text-amber-600 dark:text-amber-400 border-b border-surface pb-2 mb-3">
                ${_t('quality.meetings.section.notes', '2. Дополнительные тезисы')}
            </div>
            <textarea id="saved-notes-text"
                class="w-full text-rbi-label leading-relaxed text-ink bg-amber-50/60 p-3 rounded-xl border border-amber-200 shadow-inner whitespace-pre-wrap min-h-[110px] resize-y outline-none focus:ring-2 focus:ring-amber-300 custom-scrollbar"
                placeholder="${_t('quality.meetings.ph.notes', 'Дополнительные тезисы (необязательно)...')}">${_escTa(meet.notes || '')}</textarea>
        </div>

        <div class="bg-surface border border-surface rounded-2xl p-4 shadow-sm">
            <div class="text-rbi-body font-black uppercase text-ink border-b border-surface pb-2 mb-3">
                ${_t('quality.meetings.section.agenda', '3. Повестка и решения')}
            </div>
            <div class="space-y-1">${agendaHtml}</div>
        </div>
    `;

    // закрыть обычную модалку, если была открыта
    const modal = document.getElementById('modal-overlay');
    if (modal) modal.style.display = 'none';

    view.classList.remove('hidden');
    document.body.classList.add('modal-open');
    view.scrollTo(0, 0);
    _savedMeetingBaselineMemo = meet.memoText || '';
    _savedMeetingEditorBaseline = _collectMeetingEditorSnapshot();
}

/** Закрыть полноэкранный редактор протокола. */
export async function closeMeetingProtocolEditor() {
    const view = document.getElementById('meeting-protocol-editor-view');
    if (!view || view.classList.contains('hidden')) return;
    if (_meetingEditorIsDirty()) {
        if (confirm(_t('quality.meetings.confirm.save_before_exit', 'Сохранить изменения перед выходом?'))) {
            await saveEditedMeeting();
        }
    }
    view.classList.add('hidden');
    const body = document.getElementById('meeting-protocol-editor-body');
    if (body) body.innerHTML = '';
    document.body.classList.remove('modal-open');
    window.currentEditingMeetingId = null;
    _savedMeetingEditorBaseline = '';
    _savedMeetingBaselineMemo = '';
}

/** Печать/PDF из редактора с dirty-check. */
export async function printSavedMeetingDirty(id, mode = 'browser') {
    await _flushMeetingEditorIfDirty(_t('quality.meetings.confirm.save_before_print', 'Сохранить правки перед печатью?'));
    if (typeof window.rbi_printMeetingPdf === 'function') {
        return window.rbi_printMeetingPdf(id, mode);
    }
}

/** Word (.docx) из редактора с dirty-check. */
export async function exportMeetingDocxDirty(id) {
    await _flushMeetingEditorIfDirty(_t('quality.meetings.confirm.save_before_word', 'Сохранить правки перед экспортом Word?'));
    if (typeof window.rbi_exportMeetingDocx === 'function') {
        return window.rbi_exportMeetingDocx(id);
    }
    if (typeof window.exportMeetingDocx === 'function') {
        return window.exportMeetingDocx(id);
    }
}

/* ── saveEditedMeeting ───────────────────────────────────────────────────────── */

export async function saveEditedMeeting() {
    if (!window.currentEditingMeetingId) return;
    const meet = window.rbi_meetingsData.find(m => m.id === window.currentEditingMeetingId);
    if (!meet) return;

    const memoEl = document.getElementById('saved-memo-text');
    const notesEl = document.getElementById('saved-notes-text');
    if (memoEl) meet.memoText = memoEl.value;
    if (notesEl) meet.notes = notesEl.value;
    const savedParticipantsList = document.getElementById('saved-participants-list');
    if (savedParticipantsList) {
        meet.participants = collectParticipantsFromDom(savedParticipantsList);
    }

    if (Array.isArray(meet.agenda)) {
        document.querySelectorAll('[data-agenda-idx]').forEach(function (row) {
            const idx = parseInt(row.getAttribute('data-agenda-idx'), 10);
            if (Number.isNaN(idx) || !meet.agenda[idx]) return;
            const item = meet.agenda[idx];
            item.comment = row.querySelector('.mpe-comment')?.value || '';
            item.resp = (row.querySelector('.mpe-resp')?.value || '').trim();
            item.date = row.querySelector('.mpe-date')?.value || '';
            item.isDone = !!row.querySelector('.mpe-done')?.checked;
            item.resolvedAt = item.isDone ? (item.resolvedAt || new Date().toISOString()) : null;
        });
    }

    meet.updatedAt = new Date().toISOString();
    meet.updated_at = meet.updatedAt;

    meet.source = 'local';
    meet.syncStatus = 'not_synced';
    meet.sync_status = 'not_synced';
    meet.syncBlockReason = '';
    meet.sync_block_reason = '';

    await _meetingsStorage().put(_meetingsStorage().stores().MEETINGS, meet);
    localStorage.setItem('rbi_cloud_dirty', '1');
    _meetingsSync('silent');
    _savedMeetingBaselineMemo = meet.memoText || '';
    _savedMeetingEditorBaseline = _collectMeetingEditorSnapshot();

    showToast(_t('quality.meetings.toast.edits_saved', 'Правки протокола сохранены'));
}

/* ── Привязка протокола к объекту (админ — любые, инженер — свои) ───────────── */

function _setMeetingWideModalLayout(on, flag = 'meetingWide') {
    const modal = document.getElementById('modal-overlay');
    const box = modal && modal.querySelector('.modal-content');
    if (!box) return;
    const defaultClose = box.querySelector(':scope > button[data-notify-action="closeModal"]');
    if (on) {
        box.style.maxWidth = 'min(960px, 96vw)';
        box.style.width = '96vw';
        box.style.maxHeight = '94vh';
        box.style.padding = '16px 16px';
        if (window.matchMedia && window.matchMedia('(min-width: 640px)').matches) {
            box.style.padding = '20px 24px';
        }
        if (defaultClose) defaultClose.style.display = 'none';
        modal.dataset[flag] = '1';
        modal.dataset.meetingPreviewWide = '1';
    } else if (modal.dataset[flag] === '1' || modal.dataset.meetingPreviewWide === '1') {
        box.style.maxWidth = '';
        box.style.width = '';
        box.style.maxHeight = '';
        box.style.padding = '';
        if (defaultClose) defaultClose.style.display = '';
        delete modal.dataset[flag];
        delete modal.dataset.meetingPreviewWide;
    }
}

export function closeMeetingBindModal() {
    _setMeetingWideModalLayout(false, 'meetingBindWide');
    if (typeof closeModal === 'function') closeModal();
}

export function openMeetingBindModal(meetingId) {
    const meet = (window.rbi_meetingsData || []).find(m => m.id === meetingId);
    if (!meet) return showToast(_t('quality.meetings.toast.not_found', '⚠️ Протокол не найден'));
    if (!_meetingCanBindMeeting(meet)) {
        return showToast(_t('quality.meetings.toast.no_bind_rights', '⚠️ Нет прав менять привязку чужого протокола'));
    }

    const isAdmin = _meetingIsAdmin();
    const options = _meetingSelectableBindProjectNames();
    if (!isAdmin && !options.length) {
        return showToast(_t('quality.meetings.toast.no_assigned_projects', '⚠️ Нет закреплённых объектов — обратитесь к администратору'));
    }

    const current = _meetingCurrentBindSelection(meet);
    // инженер не может оставить «Все объекты», если оно было; админ — может
    let defaultAll = isAdmin && current.isAll;
    let defaultSelected = current.selected.filter(n => options.includes(n));
    if (!isAdmin) {
        defaultAll = false;
        if (!defaultSelected.length && options.length === 1) defaultSelected = [options[0]];
    } else if (!defaultAll && !defaultSelected.length && current.isAll) {
        defaultAll = true;
    }

    const projBoxes = options.map((p) => {
        const safe = p.replace(/"/g, '&quot;');
        const checked = !defaultAll && defaultSelected.includes(p) ? 'checked' : '';
        return `
            <label class="flex items-center gap-3 p-3 bg-surface rounded-xl cursor-pointer border border-surface shadow-sm active:scale-[0.99]">
                <input type="checkbox" value="${safe}" class="meet-bind-proj-cb w-5 h-5 accent-orange-600 rounded cursor-pointer" ${checked} onchange="rbi_onMeetingBindProjectChange()">
                <span class="text-rbi-body font-bold text-ink truncate">${p}</span>
            </label>`;
    }).join('');

    const allBlock = isAdmin ? `
        <label class="flex items-center gap-3 p-3 mb-2 bg-orange-50 dark:bg-orange-950/30 rounded-xl cursor-pointer border border-orange-200 dark:border-orange-800">
            <input type="checkbox" id="meet-bind-proj-all" class="w-5 h-5 accent-orange-600 rounded cursor-pointer" ${defaultAll ? 'checked' : ''} onchange="rbi_onMeetingBindProjectAllChange()">
            <span class="text-rbi-body font-black text-orange-700 dark:text-orange-300">${_t('quality.meetings.project.all', 'Все объекты')}</span>
        </label>` : '';

    const curLabel = _dispProjectLabel(String(meet.projectName || '').trim());
    const safeId = String(meetingId).replace(/'/g, "\\'");

    document.getElementById('modal-icon').innerHTML = '';
    document.getElementById('modal-title').innerHTML = `
        <div class="flex justify-between items-center w-full gap-2">
            <span class="text-[14px] uppercase font-black text-ink dark:text-white">${_t('quality.meetings.bind.title', '🏗 Привязка к объекту')}</span>
            <button onclick="rbi_closeMeetingBindModal()" class="text-muted hover:text-danger active:scale-90 px-2 text-lg shrink-0">✕</button>
        </div>`;

    document.getElementById('modal-body').innerHTML = `
        <div class="max-h-[calc(94vh-140px)] overflow-y-auto custom-scrollbar pr-0.5">
            <div class="text-rbi-label text-muted mb-3 border-b border-surface pb-3">
                <div class="font-bold text-ink mb-1">${String(meet.title || _t('quality.meetings.title.protocol', 'Протокол')).replace(/</g, '&lt;')}</div>
                <div>${_t('quality.meetings.bind.current', 'Сейчас:')} <b class="text-ink">${curLabel.replace(/</g, '&lt;')}</b>
                    ${isAdmin ? '' : _t('quality.meetings.bind.only_yours', ' · доступны только ваши объекты')}
                </div>
            </div>
            <label class="text-rbi-caption font-bold text-muted uppercase tracking-widest mb-2 block">${_t('quality.meetings.field.project', 'Объект')} <span class="text-orange-500">*</span></label>
            ${allBlock}
            <div id="meet-bind-project-list" class="space-y-2 mb-4">
                ${projBoxes || `<div class="text-rbi-label text-muted font-bold py-6 text-center">${_t('quality.meetings.bind.no_projects', 'Нет доступных объектов')}</div>`}
            </div>
            <p class="text-rbi-caption text-muted font-bold mb-4">${isAdmin ? _t('quality.meetings.bind.hint_admin', 'Можно выбрать все, один или несколько') : _t('quality.meetings.bind.hint_user', 'Выберите один или несколько своих объектов')}</p>
        </div>
        <div class="flex flex-col sm:flex-row gap-2 sticky bottom-0 bg-[var(--card-bg)] pt-1">
            <button onclick="rbi_closeMeetingBindModal()" class="flex-1 bg-surface text-muted py-3.5 rounded-xl font-bold text-rbi-label uppercase border border-surface">${_t('quality.meetings.btn.cancel', 'Отмена')}</button>
            <button onclick="rbi_saveMeetingBind('${safeId}')" class="flex-1 bg-orange-500 text-white py-3.5 rounded-xl font-black text-rbi-label uppercase shadow-md active:scale-95">${_t('quality.meetings.bind.save', 'Сохранить привязку')}</button>
        </div>`;

    _setMeetingWideModalLayout(true, 'meetingBindWide');
    if (!window.__meetingBindCloseHooked) {
        window.__meetingBindCloseHooked = true;
        const prevClose = window.closeModal;
        window.closeModal = function () {
            _setMeetingWideModalLayout(false, 'meetingBindWide');
            if (typeof prevClose === 'function') return prevClose.apply(this, arguments);
        };
    }

    const modal = document.getElementById('modal-overlay');
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
}

export function onMeetingBindProjectAllChange() {
    const allCb = document.getElementById('meet-bind-proj-all');
    if (allCb && allCb.checked) {
        document.querySelectorAll('.meet-bind-proj-cb').forEach(cb => { cb.checked = false; });
    }
}

export function onMeetingBindProjectChange() {
    const any = document.querySelectorAll('.meet-bind-proj-cb:checked').length > 0;
    if (any) {
        const allCb = document.getElementById('meet-bind-proj-all');
        if (allCb) allCb.checked = false;
    }
}

export async function saveMeetingBind(meetingId) {
    if (_isDemoMode()) return showToast(_t('quality.meetings.toast.demo_save_disabled', 'В демо-режиме сохранение отключено'));
    const meet = (window.rbi_meetingsData || []).find(m => m.id === meetingId);
    if (!meet) return showToast(_t('quality.meetings.toast.not_found', '⚠️ Протокол не найден'));
    if (!_meetingCanBindMeeting(meet)) {
        return showToast(_t('quality.meetings.toast.no_bind_rights', '⚠️ Нет прав менять привязку чужого протокола'));
    }

    const isAdmin = _meetingIsAdmin();
    const allowed = _meetingSelectableBindProjectNames();
    const allCb = document.getElementById('meet-bind-proj-all');
    const isAll = !!(isAdmin && allCb && allCb.checked);
    let selected = Array.from(document.querySelectorAll('.meet-bind-proj-cb:checked'))
        .map(cb => String(cb.value || '').trim())
        .filter(Boolean);

    if (!isAdmin) {
        selected = selected.filter(n => allowed.includes(n));
    }

    if (!isAll && selected.length === 0) {
        return showToast(isAdmin
            ? _t('quality.meetings.toast.pick_project_admin', '⚠️ Выберите объект: все, один или несколько')
            : _t('quality.meetings.toast.pick_project_user', '⚠️ Выберите один или несколько своих объектов'));
    }

    _meetingApplyProjectFieldsToRecord(meet, isAll, selected);
    meet.updatedAt = new Date().toISOString();
    meet.updated_at = meet.updatedAt;
    meet.source = 'local';
    meet.syncStatus = 'not_synced';
    meet.sync_status = 'not_synced';
    meet.syncBlockReason = '';
    meet.sync_block_reason = '';

    await _meetingsStorage().put(_meetingsStorage().stores().MEETINGS, meet);
    if (window.SyncQueueManager && !_isDemoMode()) {
        window.SyncQueueManager.enqueue('SAVE_MEETING', meet);
    }
    localStorage.setItem('rbi_cloud_dirty', '1');
    _meetingsSync('silent');

    closeMeetingBindModal();
    rbi_renderMeetingTab();
    showToast(_t('quality.meetings.toast.project_updated', '✅ Объект протокола обновлён'));
}

/* ── deleteMeeting ───────────────────────────────────────────────────────────── */

export async function deleteMeeting(id) {
    const meetIndex = window.rbi_meetingsData.findIndex(m => m.id === id);
    var permSvc = (_ctx && _ctx.permissions) || (window.RBI && window.RBI.services && window.RBI.services.permissions);
    if (meetIndex !== -1 && permSvc && !permSvc.canDelete(window.rbi_meetingsData[meetIndex], 'meeting')) return showToast(_t('quality.meetings.toast.no_delete_rights', '⚠️ Нет прав на удаление чужого протокола!'));

    if (!confirm(_t('quality.meetings.confirm.delete', 'Удалить этот протокол?'))) return;
    if (meetIndex !== -1) {
        window.rbi_meetingsData[meetIndex]._deleted = true;
        window.rbi_meetingsData[meetIndex].is_deleted = true;
        window.rbi_meetingsData[meetIndex]._deletedAt = new Date().toISOString();
        window.rbi_meetingsData[meetIndex].updatedAt = window.rbi_meetingsData[meetIndex]._deletedAt;

        window.rbi_meetingsData[meetIndex].source = 'local';
        window.rbi_meetingsData[meetIndex].syncStatus = 'not_synced';
        window.rbi_meetingsData[meetIndex].sync_status = 'not_synced';

        await _meetingsStorage().put(_meetingsStorage().stores().MEETINGS, window.rbi_meetingsData[meetIndex]);
    }

    window.rbi_meetingsData = window.rbi_meetingsData.filter(m => !m._deleted);
    rbi_renderMeetingTab();
    if (typeof gameGenerateWeeklyPlan === 'function') gameGenerateWeeklyPlan(true);
    showToast(_t('quality.meetings.toast.deleted', '🗑️ Протокол удален'));

    localStorage.setItem('rbi_cloud_dirty', '1');
    _meetingsSync('silent');
}

/* ── helpers: объекты в setup совещания ──────────────────────────────────────── */

function _meetingInspectionProjectLabel(c) {
    return String(c?.project_display_name || c?.projectName || c?.project || '').trim();
}

function _meetingCollectSetupProjectNames() {
    const fromInspections = _getAllInspections()
        .map(_meetingInspectionProjectLabel)
        .filter(Boolean);
    const assignedKeys = _meetingGetAssignedProjectKeys();
    const fromAssigned = assignedKeys.map((key) => _meetingResolveProjectDisplayName(key)).filter(Boolean);
    return [...new Set([...fromInspections, ...fromAssigned])].sort((a, b) => a.localeCompare(b, 'ru'));
}

function _meetingGetAssignedProjectKeys() {
    try {
        const perm = window.RBI && window.RBI.services && window.RBI.services.permissions;
        if (perm && typeof perm.getAssignedProjects === 'function') {
            const keys = perm.getAssignedProjects();
            if (Array.isArray(keys) && keys.length) return keys;
        }
    } catch (_) { /* ignore */ }
    if (typeof appSettings !== 'undefined' && Array.isArray(appSettings.assignedProjects)) {
        return appSettings.assignedProjects;
    }
    return [];
}

function _meetingResolveProjectDisplayName(key) {
    const raw = String(key || '').trim();
    if (!raw) return '';
    // assignedProjects хранит UUID узла locations.object (§ object-directory) —
    // прямое сравнение по canonical_key/display_name его не резолвит.
    var od = _objects();
    if (od && typeof od.getDisplayForAssignedRef === 'function') {
        const resolved = String(od.getDisplayForAssignedRef(raw) || '').trim();
        if (resolved && resolved !== raw) return resolved;
    }
    var meetObjList = _objectList();
    if (meetObjList.length) {
        const obj = meetObjList.find(o => o.id === raw || o.canonical_key === raw || o.display_name === raw);
        if (obj) return String(obj.display_name || obj.canonical_key || raw).trim();
    }
    const hit = _getAllInspections().find(c =>
        c.project_canonical_key === raw
        || c.projectName === raw
        || c.project_display_name === raw
    );
    if (hit) return _meetingInspectionProjectLabel(hit) || raw;
    return raw;
}

function _meetingDefaultSelectedProjects(allNames) {
    const assignedKeys = _meetingGetAssignedProjectKeys();
    if (!assignedKeys.length) return { all: true, names: [] };
    const names = [];
    assignedKeys.forEach((key) => {
        const display = _meetingResolveProjectDisplayName(key);
        const match = allNames.find(n => n === display || n === key)
            || allNames.find(n => n.toLowerCase() === String(display).toLowerCase());
        if (match && !names.includes(match)) names.push(match);
        else if (display && allNames.includes(display) && !names.includes(display)) names.push(display);
    });
    if (!names.length) return { all: true, names: [] };
    return { all: false, names };
}

function _meetingReadSetupProjectSelection() {
    const allCb = document.getElementById('meet-setup-proj-all');
    const selected = Array.from(document.querySelectorAll('.meet-setup-proj-cb:checked'))
        .map(cb => String(cb.value || '').trim())
        .filter(Boolean);
    const isAll = !!(allCb && allCb.checked);
    return { isAll, selected };
}

function _meetingInspectionMatchesProjects(c, isAll, selected) {
    if (isAll) return true;
    if (!selected.length) return false;
    const label = _meetingInspectionProjectLabel(c);
    const key = String(c?.project_canonical_key || '').trim();
    return selected.includes(label) || (key && selected.includes(key));
}

function _meetingFormatProjectNameForSave(isAll, selected) {
    if (isAll) return 'Все объекты';
    if (selected.length === 1) return selected[0];
    return selected.join(', ');
}

/** canonical_key для колонок push (pull фильтрует по assignedProjects = keys). */
function _meetingResolveCanonicalKey(displayOrKey) {
    const raw = String(displayOrKey || '').trim();
    if (!raw || raw === 'Все объекты') return '';
    var od = _objects();
    if (od && typeof od.resolveObjectRef === 'function') {
        const obj = od.resolveObjectRef(raw);
        if (obj && obj.canonical_key) return String(obj.canonical_key).trim();
    }
    var meetObjList2 = _objectList();
    if (meetObjList2.length) {
        const byId = meetObjList2.find(o => o.id === raw);
        if (byId) return String(byId.canonical_key || '').trim();
        const byKey = meetObjList2.find(o => o.canonical_key === raw);
        if (byKey) return String(byKey.canonical_key || '').trim();
        const byName = meetObjList2.find(o => o.display_name === raw);
        if (byName) return String(byName.canonical_key || '').trim();
    }
    const hit = _getAllInspections().find(c =>
        c.project_display_name === raw
        || c.projectName === raw
        || c.project_canonical_key === raw
    );
    if (hit) return String(hit.project_canonical_key || '').trim();
    return '';
}

/**
 * Пишет UI-поля + sync-колонки. Один объект → canonical_key;
 * «Все» / несколько → пустой key (pull считает запись «глобальной», как раньше без объекта).
 */
function _meetingApplyProjectFieldsToRecord(meet, isAll, selected) {
    const names = Array.isArray(selected) ? selected.map(s => String(s).trim()).filter(Boolean) : [];
    meet.projectName = _meetingFormatProjectNameForSave(isAll, names);
    meet.projectNames = isAll ? [] : names.slice();
    meet.project = meet.projectName;
    if (isAll) {
        meet.project_display_name = 'Все объекты';
        meet.project_canonical_key = '';
    } else if (names.length === 1) {
        meet.project_display_name = names[0];
        meet.project_canonical_key = _meetingResolveCanonicalKey(names[0]);
    } else {
        meet.project_display_name = names.join(', ');
        meet.project_canonical_key = '';
    }
}

function _meetingPermSvc() {
    return (_ctx && _ctx.permissions)
        || (window.RBI && window.RBI.services && window.RBI.services.permissions)
        || null;
}

function _meetingIsAdmin() {
    const perm = _meetingPermSvc();
    return !!(perm && typeof perm.isAdmin === 'function' && perm.isAdmin());
}

function _meetingCurrentEngineerName() {
    return (document.getElementById('inp-inspector')?.value
        || (typeof appSettings !== 'undefined' && (appSettings.inspectorName || appSettings.inspector_name))
        || '').trim();
}

function _meetingCanBindMeeting(meet) {
    if (!meet) return false;
    if (_meetingIsAdmin()) return true;
    const me = _meetingCurrentEngineerName();
    return !meet.author || !me || meet.author === me;
}

/** Список объектов для выбора: админ — все, инженер — только закреплённые. */
function _meetingSelectableBindProjectNames() {
    const all = _meetingCollectSetupProjectNames();
    if (_meetingIsAdmin()) return all;
    const assignedKeys = _meetingGetAssignedProjectKeys();
    if (!assignedKeys.length) return [];
    const names = [];
    assignedKeys.forEach((key) => {
        const display = _meetingResolveProjectDisplayName(key);
        if (display && !names.includes(display)) names.push(display);
    });
    return names.sort((a, b) => a.localeCompare(b, 'ru'));
}

function _meetingCurrentBindSelection(meet) {
    if (!meet) return { isAll: false, selected: [] };
    if (Array.isArray(meet.projectNames) && meet.projectNames.length) {
        return { isAll: false, selected: meet.projectNames.map(n => String(n).trim()).filter(Boolean) };
    }
    const raw = String(meet.projectName || meet.project || meet.project_display_name || '').trim();
    if (!raw || raw === 'Без объекта') return { isAll: false, selected: [] };
    if (raw === 'Все объекты') return { isAll: true, selected: [] };
    if (raw.includes(',')) {
        return { isAll: false, selected: raw.split(',').map(s => s.trim()).filter(Boolean) };
    }
    return { isAll: false, selected: [raw] };
}

/* ── openMeetingSetupModal ───────────────────────────────────────────────────── */

export function openMeetingSetupModal(taskId = null) {
    // Админ — все объекты; инженер — только закреплённые (как при смене привязки).
    const uniqueProjects = _meetingIsAdmin()
        ? _meetingCollectSetupProjectNames()
        : _meetingSelectableBindProjectNames();
    const defaults = _meetingDefaultSelectedProjects(
        uniqueProjects.length ? uniqueProjects : _meetingCollectSetupProjectNames()
    );
    // если у инженера есть свои объекты — не даём стартовать с «Все» по умолчанию
    if (!_meetingIsAdmin() && uniqueProjects.length) {
        defaults.all = false;
        if (!defaults.names.length) defaults.names = uniqueProjects.slice(0, 1);
        defaults.names = defaults.names.filter(n => uniqueProjects.includes(n));
        if (!defaults.names.length) defaults.names = uniqueProjects.slice(0, 1);
    }
    const projBoxes = uniqueProjects.map((p) => {
        const safe = p.replace(/"/g, '&quot;');
        const checked = !defaults.all && defaults.names.includes(p) ? 'checked' : '';
        return `
            <label class="flex items-center gap-2.5 px-2.5 py-2 bg-surface rounded-lg cursor-pointer border border-surface shadow-sm active:scale-[0.99]">
                <input type="checkbox" value="${safe}" class="meet-setup-proj-cb w-4 h-4 accent-orange-600 rounded cursor-pointer" ${checked} onchange="rbi_onMeetingSetupProjectChange()">
                <span class="text-rbi-label font-bold text-ink truncate">${p}</span>
            </label>`;
    }).join('');

    const modal = document.getElementById('modal-overlay');
    document.getElementById('modal-icon').innerHTML = `<div class="w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-2 border border-orange-200">👥</div>`;
    document.getElementById('modal-title').innerHTML = `<div class="text-center font-black uppercase text-lg">${_t('quality.meetings.setup.title', 'Повестка Совещания')}</div>`;

    document.getElementById('modal-body').innerHTML = `
        <div class="mb-3">
            <label class="text-rbi-caption font-bold text-muted uppercase tracking-widest mb-1.5 block">${_t('quality.meetings.field.project', 'Объект')} <span class="text-orange-500">*</span></label>
            ${_meetingIsAdmin() ? `
            <label class="flex items-center gap-2.5 px-2.5 py-2 mb-1.5 bg-orange-50 dark:bg-orange-950/30 rounded-lg cursor-pointer border border-orange-200 dark:border-orange-800">
                <input type="checkbox" id="meet-setup-proj-all" class="w-4 h-4 accent-orange-600 rounded cursor-pointer" ${defaults.all ? 'checked' : ''} onchange="rbi_onMeetingSetupProjectAllChange()">
                <span class="text-rbi-label font-black text-orange-700 dark:text-orange-300">${_t('quality.meetings.project.all', 'Все объекты')}</span>
            </label>` : `
            <p class="text-rbi-caption text-muted font-bold mb-1.5 px-0.5">${_t('quality.meetings.setup.assigned_only', 'Доступны только ваши закреплённые объекты')}</p>`}
            <div id="meet-setup-project-list" class="space-y-1 max-h-[22vh] overflow-y-auto custom-scrollbar pr-0.5 ${uniqueProjects.length ? '' : 'hidden'}">
                ${projBoxes || `<div class="text-rbi-caption text-muted font-bold px-1 py-2">${_t('quality.meetings.setup.no_projects_all_only', 'Нет объектов в проверках — доступен только «Все объекты»')}</div>`}
            </div>
            <p class="text-rbi-caption text-muted font-bold mt-1 px-0.5">${_t('quality.meetings.setup.required_projects', 'Обязательно: все, один или несколько')}</p>
        </div>
        <div class="mb-4">
            <label class="text-rbi-caption font-bold text-muted uppercase tracking-widest mb-1 block">${_t('quality.meetings.setup.period', 'Период')}</label>
            <select id="meet-setup-period" class="input-base !py-2 text-rbi-label font-bold" onchange="rbi_updateMeetingSetupList()">
                <option value="WEEK" selected>${_t('quality.meetings.setup.period_week', 'Неделя')}</option>
                <option value="MONTH">${_t('quality.meetings.setup.period_month', 'Месяц')}</option>
                <option value="ALL">${_t('quality.meetings.period.all', 'Всё время')}</option>
            </select>
        </div>
        
        <div class="flex justify-between items-center mb-2 px-1 border-t border-surface pt-2">
            <span class="text-rbi-caption font-black uppercase text-muted">${_t('quality.meetings.setup.contractors', 'Список подрядчиков')}</span>
            <button onclick="document.querySelectorAll('.meet-setup-cb').forEach(cb=>cb.checked=true)" class="text-orange-600 text-rbi-caption font-bold hover:underline">${_t('quality.meetings.setup.select_all', 'Выбрать всех')}</button>
        </div>
        
        <div id="meet-setup-checkboxes" class="space-y-2 mb-6 max-h-[30vh] overflow-y-auto custom-scrollbar pr-1">
            <!-- Чекбоксы загрузятся сюда -->
        </div>

        <div class="flex gap-2">
            <button onclick="closeModal()" class="flex-1 bg-surface text-muted py-3.5 rounded-xl font-bold text-rbi-label uppercase active:scale-95 shadow-sm border border-surface">${_t('quality.meetings.btn.cancel', 'Отмена')}</button>
            <button onclick="rbi_executeMeetingSetup('${taskId || ''}')" class="flex-1 bg-orange-500 text-white py-3.5 rounded-xl font-black text-rbi-label uppercase shadow-md active:scale-95 flex items-center justify-center gap-2">▶ ${_t('quality.meetings.setup.start', 'Начать разбор')}</button>
        </div>
    `;

    document.body.classList.add('modal-open');
    modal.style.display = 'flex';

    rbi_updateMeetingSetupList();
}

export function onMeetingSetupProjectAllChange() {
    const allCb = document.getElementById('meet-setup-proj-all');
    if (allCb && allCb.checked) {
        document.querySelectorAll('.meet-setup-proj-cb').forEach(cb => { cb.checked = false; });
    }
    rbi_updateMeetingSetupList();
}

export function onMeetingSetupProjectChange() {
    const any = document.querySelectorAll('.meet-setup-proj-cb:checked').length > 0;
    if (any) {
        const allCb = document.getElementById('meet-setup-proj-all');
        if (allCb) allCb.checked = false;
    }
    rbi_updateMeetingSetupList();
}

/* ── updateMeetingSetupList ──────────────────────────────────────────────────── */

export function updateMeetingSetupList() {
    const periodEl = document.getElementById('meet-setup-period');
    const container = document.getElementById('meet-setup-checkboxes');
    if (!periodEl || !container) return;

    const { isAll, selected } = _meetingReadSetupProjectSelection();
    const period = periodEl.value;

    let baseData = _getAllInspections();
    baseData = baseData.filter(c => _meetingInspectionMatchesProjects(c, isAll, selected));

    const now = new Date();
    if (period === 'WEEK') {
        const d = new Date(now); d.setDate(d.getDate() - 7);
        baseData = baseData.filter(c => new Date(c.date) >= d);
    } else if (period === 'MONTH') {
        const d = new Date(now); d.setDate(d.getDate() - 30);
        baseData = baseData.filter(c => new Date(c.date) >= d);
    }

    const uniqueContrs = [...new Set(baseData.map(c => c.contractorName).filter(Boolean))].sort();

    if (!isAll && selected.length === 0) {
        container.innerHTML = `<div class="text-center text-rbi-caption font-bold text-orange-500 py-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg">${_t('quality.meetings.setup.pick_project', 'Выберите объект (все / один / несколько)')}</div>`;
        return;
    }

    if (uniqueContrs.length === 0) {
        container.innerHTML = `<div class="text-center text-rbi-caption font-bold text-muted py-4 bg-[var(--hover-bg)] rounded-lg">${_t('quality.meetings.setup.no_inspections', 'Нет проверок за этот период')}</div>`;
        return;
    }

    container.innerHTML = uniqueContrs.map(c => `
        <label class="flex items-center gap-3 p-3 bg-surface rounded-xl cursor-pointer border border-surface shadow-sm active:scale-[0.98] transition-all hover:border-orange-300">
            <input type="checkbox" value="${c.replace(/"/g, '&quot;')}" class="meet-setup-cb w-5 h-5 accent-orange-600 rounded cursor-pointer" checked>
            <span class="text-rbi-body font-bold text-ink truncate flex-1">${c}</span>
        </label>
    `).join('');
}

/* ── executeMeetingSetup ─────────────────────────────────────────────────────── */

export async function executeMeetingSetup(taskId) {
    let { isAll, selected } = _meetingReadSetupProjectSelection();
    if (!_meetingIsAdmin()) {
        isAll = false;
        const allowed = _meetingSelectableBindProjectNames();
        selected = selected.filter(n => allowed.includes(n));
    }
    if (!isAll && selected.length === 0) {
        return showToast(_meetingIsAdmin()
            ? _t('quality.meetings.toast.pick_project_admin', '⚠️ Выберите объект: все, один или несколько')
            : _t('quality.meetings.toast.pick_project_user', '⚠️ Выберите один или несколько своих объектов'));
    }

    const checkedBoxes = document.querySelectorAll('.meet-setup-cb:checked');
    const selectedContrs = Array.from(checkedBoxes).map(cb => cb.value);

    if (selectedContrs.length === 0) return showToast(_t('quality.meetings.toast.pick_contractor', '⚠️ Выберите хотя бы одного подрядчика!'));

    const period = document.getElementById('meet-setup-period')?.value || 'WEEK';
    window._meetingSetupProject = _meetingFormatProjectNameForSave(isAll, selected);
    window._meetingSetupProjects = isAll ? ['__ALL__'] : selected.slice();
    window._meetingSetupPeriod = period;
    window._meetingSetupPeriodText =
        period === 'MONTH' ? '30 дней' : period === 'ALL' ? 'Всё время' : '7 дней';

    let finalData = _getAllInspections().filter(c => selectedContrs.includes(c.contractorName));
    finalData = finalData.filter(c => _meetingInspectionMatchesProjects(c, isAll, selected));

    const now = new Date();
    if (period === 'WEEK') {
        const d = new Date(now); d.setDate(d.getDate() - 7);
        finalData = finalData.filter(c => new Date(c.date) >= d);
    } else if (period === 'MONTH') {
        const d = new Date(now); d.setDate(d.getDate() - 30);
        finalData = finalData.filter(c => new Date(c.date) >= d);
    }

    if (typeof closeModal === 'function') closeModal();

    if (taskId && taskId !== 'null') window.activeTaskId = taskId;

    switchTab('tab-engineer');
    const btns = document.querySelectorAll('#engineer-subtabs-block .sub-tab-btn');
    if (btns[2]) await rbi_switchEngineerSubTab('eng-sub-meetings', btns[2]);

    rbi_createMeeting(finalData);
}

/* ── createMeeting ───────────────────────────────────────────────────────────── */

export function createMeeting(customData = null) {
    if (!customData) {
        rbi_openMeetingSetupModal(null);
        return;
    }

    const container = document.getElementById('rbi-meeting-container');
    const d = new Date();
    let weekChecks = customData;

    let periodText = "7 дней";
    const selectedPeriod = document.getElementById('meet-setup-period')?.value || window._meetingSetupPeriod;
    if (selectedPeriod === 'MONTH') periodText = "30 дней";
    if (selectedPeriod === 'ALL') periodText = "Всё время";
    if (selectedPeriod) {
        window._meetingSetupPeriod = selectedPeriod;
        window._meetingSetupPeriodText = periodText;
    }

    const weekMetrics = typeof getObjectIntegralMetrics === 'function' ? getObjectIntegralMetrics(weekChecks, _templates().getUserTemplates()) : null;
    const iko = weekMetrics ? weekMetrics.IKO : '0.00';
    const ikoColor = weekMetrics ? weekMetrics.ikoColor : 'text-muted';

    let defectPhotosHtml = '';
    let b3Photos = [];
    weekChecks.forEach(c => {
        if (c.state && c.photos) {
            Object.keys(c.state).forEach(id => {
                if ((c.state[id] === 'fail' || c.state[id] === 'fail_escalated') && c.photos[id]) {
                    b3Photos.push({ src: c.photos[id], contr: c.contractorName });
                }
            });
        }
    });
    b3Photos = b3Photos.sort(() => 0.5 - Math.random()).slice(0, 4);
    if (b3Photos.length > 0) {
        defectPhotosHtml = `
            <div class="mt-3 bg-surface p-3 rounded-xl border border-[var(--card-border)] shadow-sm">
                <div class="text-rbi-caption font-black text-danger uppercase mb-2">${_t('quality.meetings.workspace.defect_photos', '📸 Фотофиксация брака (Рандом)')}</div>
                <div class="flex gap-2 overflow-x-auto no-scrollbar">
                    ${b3Photos.map(p => `
                        <div class="shrink-0 w-24 h-24 sm:w-32 sm:h-32 rounded-lg overflow-hidden border border-danger-soft relative">
                            <img ${(typeof window.rbiBuildPhotoImgAttrs === 'function') ? window.rbiBuildPhotoImgAttrs(p.src, { preferThumb: true }) : ('src="' + window.getPhotoSrc(p.src) + '"')} class="w-full h-full object-cover">
                            <div class="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-rbi-caption truncate px-1 pb-0.5">${p.contr}</div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    }

    let b3Count = 0;
    let goodContrs = [];
    let badContrs = [];
    const contrMap = {};

    weekChecks.forEach(c => { contrMap[c.contractorName] = contrMap[c.contractorName] || []; contrMap[c.contractorName].push(c); });

    for (let cName in contrMap) {
        const m = getContractorMetrics(contrMap[cName], _templates().getUserTemplates());
        if (m) {
            if (m.finalC >= 85 && m.n_изделий_с_B3 === 0) goodContrs.push(cName);
            if (m.finalC < 70 || m.n_изделий_с_B3 > 0) badContrs.push(cName);
        }
        contrMap[cName].forEach(c => {
            if (c.metrics) b3Count += c.metrics.n_B3_fail;
        });
    }

    const agendaItems = buildMeetingAgenda({
        inspections: weekChecks,
        skRecords: _getSkRecords(),
        skContractorMap: _getSkContractorMap(),
        pastMeetings: typeof window.rbi_meetingsData !== 'undefined' ? window.rbi_meetingsData : [],
        templates: _templates(),
        getFlatList: typeof getFlatList === 'function' ? getFlatList : window.getFlatList
    });
    const skOverdueCount = agendaItems
        .filter(a => a.kind === AGENDA_KIND.SK || (a.kind === AGENDA_KIND.REOPENED && a.title && /пк\s*ск/i.test(a.title)))
        .reduce((s, a) => s + (a.count || 1), 0);

    let goodContrsHtml = goodContrs.length > 0
        ? goodContrs.map(c => `<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-rbi-caption font-black mr-1 mb-1 inline-block">${c}</span>`).join('')
        : '<span class="text-rbi-caption text-muted font-bold">' + _t('quality.meetings.workspace.no_excellent', 'Отличников нет') + '</span>';

    let badContrsHtml = badContrs.length > 0
        ? badContrs.map(c => `<span class="bg-danger-soft text-danger px-2 py-0.5 rounded text-rbi-caption font-black mr-1 mb-1 inline-block">${c}</span>`).join('')
        : '<span class="text-rbi-caption text-muted font-bold">' + _t('quality.meetings.workspace.no_critical', 'Критических нет') + '</span>';

    const badgeFor = (item) => {
        if (item.kind === AGENDA_KIND.MANUAL) {
            return '<span class="text-rbi-caption bg-slate-600 dark:bg-slate-500 text-white px-1.5 py-0.5 rounded font-black">' + _t('quality.meetings.badge.manual', '✎ Вручную') + '</span>';
        }
        if (item.kind === AGENDA_KIND.B3 || (item.reopened && item.title && /b3/i.test(item.title))) {
            return '<span class="text-rbi-caption bg-danger text-white px-1.5 py-0.5 rounded font-black">B3</span>';
        }
        if (item.kind === AGENDA_KIND.B2) {
            return '<span class="text-rbi-caption bg-orange-500 text-white dark:bg-orange-500 px-1.5 py-0.5 rounded font-black">B2</span>';
        }
        if (item.kind === AGENDA_KIND.SK || (item.title && /пк\s*ск/i.test(item.title))) {
            return '<span class="text-rbi-caption bg-blue-600 text-white dark:bg-blue-500 px-1.5 py-0.5 rounded font-black">' + _t('quality.meetings.badge.sk_short', 'Проср. ПК СК') + '</span>';
        }
        if (item.kind === AGENDA_KIND.CARRY) {
            const v = _carryVisual(item);
            return `<span class="text-rbi-caption ${v.badgeSolid} border px-1.5 py-0.5 rounded font-black">${v.badgeShort}</span>`;
        }
        return '<span class="text-rbi-caption bg-amber-600 text-white px-1.5 py-0.5 rounded font-black">↻</span>';
    };

    const borderFor = (item) => {
        if (item.kind === AGENDA_KIND.MANUAL) {
            return 'border-surface bg-surface';
        }
        if (item.kind === AGENDA_KIND.B3 || (item.reopened && item.title && /b3/i.test(item.title))) {
            return 'border-danger bg-danger-soft';
        }
        if (item.kind === AGENDA_KIND.B2) {
            return 'border-orange-500 bg-orange-50 dark:border-orange-400 dark:bg-orange-950/40';
        }
        if (item.kind === AGENDA_KIND.SK || (item.title && /пк\s*ск/i.test(item.title))) {
            return 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/40';
        }
        if (item.kind === AGENDA_KIND.CARRY) return _carryVisual(item).border;
        return 'border-amber-500 bg-amber-50 dark:border-amber-400 dark:bg-amber-950/40';
    };

    /** Только UI: убрать md-маркеры / табы, не меняя сохранённые данные. */
    const _escUi = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const _cleanUiText = (s) => String(s || '')
        .replace(/\r\n/g, '\n')
        .replace(/\t+/g, ' ')
        .replace(/[*_]{1,2}([^*_\n]+)[*_]{1,2}/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^[\s]*[-*•●]\s+/gm, '')
        .replace(/`+/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

    /**
     * Пункт списком (•), без белых карточек.
     * Мета ×N / ↻ снимается только с хвоста — не режем текст по « · ».
     */
    const _renderDetailBullet = (detailLine) => {
        let raw = _stripSkNoise(String(detailLine || ''));
        let count = 0;
        let reopened = false;
        raw = raw.replace(/\s·\s×(\d+)\s*$/u, (_, n) => {
            count = parseInt(n, 10) || 0;
            return '';
        });
        raw = raw.replace(/\s·\s↻\s*повторно\s*$/iu, () => {
            reopened = true;
            return '';
        });
        raw = raw.replace(/\s·\s↻\s*$/u, () => {
            reopened = true;
            return '';
        });
        raw = _stripSkNoise(raw).replace(/просрочено\s+в\s+пк\s*ск\s*[·:.—–-]?\s*/giu, '');
        const body = _cleanUiText(raw);
        const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
        const head = lines[0] || body || _t('quality.meetings.label.item', 'Пункт');
        const rest = lines.slice(1).map(l => ` ${_escUi(l)}`).join('');
        const meta = [
            count > 1 ? `×${count}` : '',
            reopened ? '↻' : ''
        ].filter(Boolean).join(' ');
        return `<li class="text-rbi-label text-ink leading-snug">${_escUi(head)}${rest}${meta ? ` <span class="text-muted font-semibold">${_escUi(meta)}</span>` : ''}</li>`;
    };
    const _detailsBulletList = (arr) => {
        const items = (arr || []).map(_renderDetailBullet).filter(Boolean);
        return items.length
            ? `<ul class="mt-1.5 list-disc pl-4 space-y-0.5 marker:text-muted dark:marker:text-muted">${items.join('')}</ul>`
            : '';
    };

    /** Убрать шаблон «Просрочено в ПК СК · …» (только UI; в т.ч. повтор в каждой строке). */
    const _stripSkNoise = (s) => String(s || '')
        .replace(/просрочено\s+в\s+пк\s*ск\s*[·:.—–\-]?\s*/giu, '')
        .replace(/просрочено\s+в\s+ск\s*[·:.—–\-]?\s*/giu, '')
        // одинокий префикс «ПК СК ·» в начале строки детали (не трогаем чипы заголовка)
        .replace(/^пк\s*ск\s*[·:.—–\-]\s*/imu, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    /** Явная подпись: откуда долг (B3 / B2 / ПК СК / …) — без дублей. */
    const _carryOriginMeta = (item) => {
        const ok = item.originKind
            || (String(item.sourceKey || '').split('|')[1] || '')
            || '';
        const title = String(item.title || '');
        const statsMatch = title.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
        const catName = (statsMatch ? statsMatch[1] : title)
            .replace(/просрочено в пк\s*ск\s*[·:.—–-]?\s*/i, '')
            .trim();
        const stats = statsMatch ? statsMatch[2] : '';

        if (ok === AGENDA_KIND.B3 || /крит\.?\s*деф|^\s*b3\b/i.test(title)) {
            return { type: 'B3', label: _t('quality.meetings.label.b3', 'Крит. деф. (B3)'), cat: '', stats: '' };
        }
        if (ok === AGENDA_KIND.B2 || /повторяющ|^\s*b2\b/i.test(title)) {
            return { type: 'B2', label: _t('quality.meetings.label.b2', 'Повторяющиеся нарушения (B2)'), cat: '', stats: '' };
        }
        if (ok === AGENDA_KIND.SK || /пк\s*ск|просрочено/i.test(title) || /\|SK\|/i.test(item.sourceKey || '')) {
            const cat = catName && !/долг|прошл|просрочено/i.test(catName) ? catName : '';
            return { type: 'SK', label: _t('quality.meetings.label.sk_overdue', 'Проср. в ПК СК'), cat, stats };
        }
        if (title && !/долг с прошл/i.test(title)) {
            return { type: 'OTHER', label: catName || title, cat: '', stats };
        }
        return { type: 'OTHER', label: _t('quality.meetings.label.open_item', 'Незакрытый пункт'), cat: '', stats: '' };
    };

    const _carryDetails = (item) => {
        const raw = (Array.isArray(item.details) && item.details.length)
            ? item.details.slice()
            : (() => {
                const defect = String(item.defect || '');
                if (defect.includes('•')) {
                    return defect.split('\n')
                        .map(l => l.replace(/^[\s]*[•●\-]\s*/, '').trim())
                        .filter(Boolean);
                }
                const cleaned = _cleanUiText(defect);
                return cleaned ? [cleaned] : [];
            })();

        return raw
            .map(_stripSkNoise)
            .map(l => _cleanUiText(l))
            .filter(l => l
                && !/:$/.test(l)
                && !/^(крит\.?\s*деф|повторяющ|просрочено|долг с прошл|пк\s*ск)\b/i.test(l)
                // отбросить строки, которые только повторяют категорию из title
                && l !== String(item.title || '').replace(/\s*\([^)]*\)\s*$/, '').trim());
    };

    /** Заголовок категории СК: «Проср. в ПК СК · категория» + число (+ уник./повтор.). */
    const _renderSkTitleHtml = (rawTitle, item, detailsArr) => {
        const t = String(rawTitle || _t('quality.meetings.label.sk_remarks', 'Просроченные замечания в ПК СК'));
        const m = t.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
        let name = (m ? m[1] : t).trim();
        // если в title уже только категория (Отделка) — добавим явную метку
        if (name && !/пк\s*ск|просроч/i.test(name)) {
            name = `${_t('quality.meetings.label.sk_overdue', 'Проср. в ПК СК')} · ${name}`;
        } else if (!name) {
            name = _t('quality.meetings.label.sk_remarks', 'Просроченные замечания в ПК СК');
        }
        name = _escUi(name);
        const total = _totalRemarks(item || {}, detailsArr || []);
        const extra = [];
        if (m) {
            m[2].split(',').map(p => p.trim()).filter(Boolean).forEach(p => {
                // «N шт.» / «N замечаний» уже покрыто общим чипом
                if (/^\d+\s*шт/i.test(p) || /замечан/i.test(p)) return;
                extra.push(`<span class="text-rbi-caption font-bold bg-surface text-muted border border-surface px-1.5 py-0.5 rounded">${_escUi(p)}</span>`);
            });
        }
        return `<span class="font-black text-ink">${name}</span><span class="inline-flex flex-wrap gap-1 ml-1.5 align-middle">${_countChipHtml(total, 'blue')}${extra.join('')}</span>`;
    };

    const renderAgendaRow = (item) => {
        const details = Array.isArray(item.details) ? item.details : [];
        const typeBucket = _agendaTypeBucket(item);
        const isManual = typeBucket === 'MANUAL';
        const isSk = typeBucket === 'SK';
        const isCarry = typeBucket === 'CARRY_SK' || typeBucket === 'CARRY_AUDIT' || item.kind === AGENDA_KIND.CARRY;
        const isB3 = typeBucket === 'B3';
        const isB2 = typeBucket === 'B2';
        const title = item.title || '';
        let bodyHtml = '';
        let displayTitleHtml = _escUi(title || item.defect || '');
        if (isManual) {
            displayTitleHtml = '';
            bodyHtml = `<textarea class="agenda-meta-defect agenda-manual-text input-base mt-1 h-16 resize-none text-rbi-label !bg-surface" placeholder="${_t('quality.meetings.ph.manual_item', 'Текст пункта повестки...')}">${_escUi(item.defect || '')}</textarea>`;
        } else if (isSk && details.length) {
            displayTitleHtml = _renderSkTitleHtml(title || _t('quality.meetings.label.sk_remarks', 'Просроченные замечания в ПК СК'), item, details);
            bodyHtml = _detailsBulletList(details);
        } else if (isB3 || isB2) {
            const tone = isB3 ? 'red' : 'orange';
            const label = title || (isB3 ? _t('quality.meetings.label.b3', 'Крит. деф. (B3)') : _t('quality.meetings.label.b2_short', 'Повторяющиеся нарушения'));
            const total = _totalRemarks(item, details);
            displayTitleHtml = `
                <span class="font-black">${_escUi(label)}</span>
                <span class="inline-flex flex-wrap gap-1 ml-1.5 align-middle">${_countChipHtml(total, tone)}</span>`;
            bodyHtml = details.length
                ? _detailsBulletList(details)
                : (() => {
                    const lines = _cleanUiText(item.defect || '').split('\n').map(l => l.trim()).filter(Boolean);
                    return lines.length
                        ? `<ul class="mt-1.5 list-disc pl-4 space-y-0.5">${lines.map(l => `<li class="text-rbi-label text-ink">${_escUi(l)}</li>`).join('')}</ul>`
                        : '';
                })();
        } else if (isCarry) {
            const vis = _carryVisual(item);
            const meta = _carryOriginMeta(item);
            const carryDetails = _carryDetails(item);
            const total = _totalRemarks(item, carryDetails);
            // происхождение + категория + общее число; заголовок различает аудит / ПК СК
            const chips = [
                `<span class="text-rbi-caption font-bold border px-1.5 py-0.5 rounded ${vis.softChip}">${_escUi(meta.label)}</span>`,
                meta.cat ? `<span class="text-rbi-caption font-bold border px-1.5 py-0.5 rounded ${vis.catChip}">${_escUi(meta.cat)}</span>` : '',
                _countChipHtml(total, vis.tone),
                ...(meta.stats ? meta.stats.split(',').map(p => p.trim()).filter(Boolean)
                    .filter(p => !/^\d+\s*шт/i.test(p) && !/замечан/i.test(p))
                    .map(p => `<span class="text-rbi-caption font-bold bg-surface text-muted px-1.5 py-0.5 rounded border border-surface">${_escUi(p)}</span>`) : [])
            ].filter(Boolean).join('');
            displayTitleHtml = `
                <span class="font-black">${_escUi(vis.title)}</span>
                <span class="inline-flex flex-wrap gap-1 ml-1.5 align-middle">${chips}</span>`;
            bodyHtml = carryDetails.length
                ? _detailsBulletList(carryDetails)
                : `<div class="mt-1 text-rbi-caption text-muted italic">${_t('quality.meetings.empty.no_item_detail', 'Нет детального текста пункта')}</div>`;
        } else if (details.length) {
            bodyHtml = `<ul class="list-disc pl-4 mt-1 space-y-0.5">${details.map(d => {
                const lines = _cleanUiText(d).split('\n').map(l => l.trim()).filter(Boolean);
                if (lines.length <= 1) return `<li>${_escUi(lines[0] || d)}</li>`;
                return `<li><span class="font-semibold">${_escUi(lines[0])}</span>${lines.slice(1).map(l => `<div class="text-rbi-caption text-muted font-normal">${_escUi(l)}</div>`).join('')}</li>`;
            }).join('')}</ul>`;
        } else {
            const lines = _cleanUiText(item.defect || '').split('\n').map(l => l.trim()).filter(Boolean);
            bodyHtml = lines.length
                ? `<div class="mt-0.5 space-y-0.5">${lines.map(l => `<div>${_escUi(l)}</div>`).join('')}</div>`
                : '';
        }
        const defDeadline = item.date ? ` value="${String(item.date).split('T')[0]}"` : '';
        const defResp = item.resp ? ` value="${String(item.resp).replace(/"/g, '&quot;')}"` : '';
        const reopenBadge = item.reopened
            ? '<span class="text-rbi-caption bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/50 dark:text-amber-200 dark:border-amber-700 px-1.5 py-0.5 rounded font-bold">' + _t('quality.meetings.badge.reopened', '↻ повторно') + '</span>'
            : '';
        const detailsJson = JSON.stringify(details).replace(/"/g, '&quot;');
        // MANUAL: сам текст пункта — видимая .agenda-meta-defect textarea в bodyHtml (та же
        // читается collectAgendaFromDom без правок), скрытое hidden-поле для неё не рендерим,
        // иначе querySelector('.agenda-meta-defect') находил бы первым hidden-инпут.
        const defectHiddenField = isManual
            ? ''
            : `<input type="hidden" class="agenda-meta-defect" value="${String(item.defect || '').replace(/"/g, '&quot;')}">`;

        return `
                <div class="meeting-agenda-row relative">
                    <input type="hidden" class="agenda-meta-contr" value="${String(item.contr || '').replace(/"/g, '&quot;')}">
                    ${defectHiddenField}
                    <input type="hidden" class="agenda-meta-kind" value="${item.kind || ''}">
                    <input type="hidden" class="agenda-meta-source-key" value="${String(item.sourceKey || '').replace(/"/g, '&quot;')}">
                    <input type="hidden" class="agenda-meta-count" value="${item.count || 1}">
                    <input type="hidden" class="agenda-meta-reopened" value="${item.reopened ? '1' : '0'}">
                    <input type="hidden" class="agenda-meta-id" value="${String(item.id || '').replace(/"/g, '&quot;')}">
                    <input type="hidden" class="agenda-meta-title" value="${String(title).replace(/"/g, '&quot;')}">
                    <input type="hidden" class="agenda-meta-details" value="${detailsJson}">
                    <input type="hidden" class="agenda-meta-origin-kind" value="${String(item.originKind || '').replace(/"/g, '&quot;')}">

                    <div class="absolute top-0.5 right-0.5 flex items-center gap-0.5 z-10">
                        <button type="button" data-agenda-action="up" title="${_t('quality.meetings.btn.agenda_up', '▲ Вверх')}" class="w-5 h-5 flex items-center justify-center text-rbi-caption leading-none text-muted hover:text-brand dark:hover:text-brand active:scale-90 transition-colors">▲</button>
                        <button type="button" data-agenda-action="down" title="${_t('quality.meetings.btn.agenda_down', '▼ Вниз')}" class="w-5 h-5 flex items-center justify-center text-rbi-caption leading-none text-muted hover:text-brand dark:hover:text-brand active:scale-90 transition-colors">▼</button>
                        <button type="button" data-agenda-action="remove" title="${_t('quality.meetings.btn.agenda_remove', '✕ Удалить')}" class="w-5 h-5 flex items-center justify-center text-rbi-caption leading-none text-muted hover:text-danger dark:hover:text-danger active:scale-90 transition-colors">✕</button>
                    </div>

                    <div class="border-l-2 ${borderFor(item)} pl-2 py-1.5 pr-16 rounded-r-lg">
                        <div class="text-rbi-label font-medium text-ink leading-snug">
                            <div class="font-bold flex items-center gap-1.5 flex-wrap text-ink">${badgeFor(item)} <span class="min-w-0">${displayTitleHtml}</span> ${reopenBadge}</div>
                            ${bodyHtml}
                        </div>
                    </div>

                    <div class="mt-1.5 ml-0 rounded-lg border border-emerald-300 bg-emerald-50/90 dark:border-emerald-600 dark:bg-emerald-950/50 p-2.5 shadow-sm">
                        <div class="text-rbi-caption font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300 mb-1.5">${_t('quality.meetings.workspace.decision_row', 'Решение · срок · ответственный')}</div>
                        <div class="flex flex-wrap gap-2">
                            <label class="flex items-center gap-1 text-rbi-caption font-bold text-emerald-900 dark:text-emerald-100 bg-surface px-2 py-1 rounded border border-emerald-200 dark:border-emerald-700 cursor-pointer active:scale-95 transition-transform">
                                <input type="checkbox" class="agenda-done-cb w-3.5 h-3.5 accent-emerald-600"> ${_t('quality.meetings.checkbox.done', 'Решено')}
                            </label>
                            <input type="date" class="agenda-date input-base !py-1 !text-rbi-caption !w-auto flex-1 min-w-[90px] !bg-surface !border-emerald-200 dark:!border-emerald-700"${defDeadline}>
                            <input type="text" class="agenda-resp input-base !py-1 !text-rbi-caption !w-auto flex-1 min-w-[90px] !bg-surface !border-emerald-200 dark:!border-emerald-700" placeholder="${_t('quality.meetings.ph.responsible', 'Ответственный...')}"${defResp}>
                        </div>
                        <textarea class="agenda-comment input-base mt-2 h-10 resize-none text-rbi-caption !bg-surface !border-emerald-200 dark:!border-emerald-700" placeholder="${_t('quality.meetings.ph.block_decision', 'Что решили по этому блоку проблем...')}">${item.comment ? String(item.comment).replace(/</g, '&lt;') : ''}</textarea>
                    </div>
                </div>
            `;
    };

    // группировка строк UI по подрядчику
    const byContrUi = {};
    agendaItems.forEach(item => {
        const c = item.contr || '—';
        if (!byContrUi[c]) byContrUi[c] = [];
        byContrUi[c].push(item);
    });

    const _addAgendaItemBtnHtml = (groupKey) => `
        <div class="px-3 pb-3">
            <button type="button" data-agenda-action="add" data-agenda-group="${_escUi(groupKey)}" class="w-full bg-surface border border-dashed border-surface text-muted py-1.5 rounded-lg font-bold text-rbi-caption uppercase active:scale-95 transition-colors hover:border-surface">${_t('quality.meetings.btn.add_agenda_item', '+ Добавить пункт повестки')}</button>
        </div>`;

    let agendaHtml = '';
    Object.keys(byContrUi).forEach(cName => {
        const items = byContrUi[cName];
        agendaHtml += `
            <div class="bg-surface rounded-xl mb-3 border border-surface shadow-sm overflow-hidden">
                <div class="px-3 pt-2.5 pb-2 bg-surface/90 border-b border-surface/80">
                    <div class="text-rbi-body font-black text-ink uppercase">
                        <div class="flex flex-wrap items-baseline gap-x-1">👷‍♂️ ${_escUi(cName)}</div>
                        ${_contrTypeSummaryHtml(items)}
                    </div>
                </div>
                <div class="p-3 space-y-3" data-agenda-group-body="${_escUi(cName)}">
                    ${items.map(renderAgendaRow).join('')}
                </div>
                ${_addAgendaItemBtnHtml(cName)}
            </div>`;
    });

    if (!agendaHtml) agendaHtml = `<div class="text-rbi-label text-green-600 font-bold text-center py-4 bg-surface rounded-xl border border-dashed border-[var(--card-border)]">${_t('quality.meetings.workspace.no_defects', 'Дефектов за {period} не выявлено. Идеально!', { period: _periodLabelFromCode(selectedPeriod, periodText) })}</div>`;

    // «Разное» — отдельная всегда доступная группа для вручную добавленных пунктов без
    // привязки к подрядчику (не путать с '—' — авто-группой уже сгенерированных пунктов без contr).
    const MISC_AGENDA_GROUP = '__misc__';
    agendaHtml += `
        <div class="bg-surface rounded-xl mb-3 border border-dashed border-surface shadow-sm overflow-hidden">
            <div class="px-3 pt-2.5 pb-2 bg-surface/80 border-b border-surface">
                <div class="text-rbi-body font-black text-muted uppercase">📝 ${_t('quality.meetings.workspace.misc_group', 'Разное')}</div>
            </div>
            <div class="p-3 space-y-3 empty:p-0" data-agenda-group-body="${MISC_AGENDA_GROUP}"></div>
            ${_addAgendaItemBtnHtml(MISC_AGENDA_GROUP)}
        </div>`;

    const html = `
    <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm relative animate-fadeIn overflow-hidden flex flex-col max-h-[85vh]">
        <!-- ШАПКА -->
        <div class="p-4 border-b border-[var(--card-border)] bg-[var(--hover-bg)] flex justify-between items-center shrink-0">
            <div>
                <div class="text-rbi-caption font-black text-brand uppercase tracking-widest mb-0.5">${_t('quality.meetings.workspace.kicker', 'Meeting Workspace')}</div>
                <div class="font-black text-[14px] text-ink dark:text-white uppercase">${_t('quality.meetings.workspace.plan_from', 'Планерка от {date}', { date: d.toLocaleDateString('ru-RU') })}</div>
            </div>
            <button onclick="rbi_renderMeetingTab()" class="text-muted hover:text-danger active:scale-95 transition-colors font-black px-2 text-lg">✕</button>
        </div>
        
        <!-- ЕДИНАЯ КОЛОНКА (СВЕРХУ ИНФО, СНИЗУ ДЕФЕКТЫ) -->
        <div class="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-4">

            <!-- УЧАСТНИКИ (в начале, как в оффлайн-протоколе) -->
            <div class="bg-[var(--hover-bg)] p-3 rounded-xl border border-[var(--card-border)] mb-5">
                <label class="text-rbi-caption font-black text-[var(--text-muted)] uppercase mb-2 block">${_t('quality.meetings.workspace.participants', 'Участники совещания')}</label>
                <div id="meeting-participants-list" class="space-y-2 mb-2">${_renderParticipantRowHtml({ role: '', name: _meetingCurrentEngineerName() })}</div>
                <button type="button" onclick="rbi_addMeetingParticipantRow()" class="w-full bg-surface border border-dashed border-surface text-muted py-2 rounded-lg font-bold text-rbi-caption uppercase active:scale-95 transition-colors hover:border-surface">${_t('quality.meetings.btn.add_participant', '+ Добавить участника')}</button>
            </div>

            <!-- БЛОК АНАЛИТИКИ -->
            <div class="mb-5">
                <div class="text-rbi-label font-black text-ink dark:text-white uppercase tracking-widest mb-3 border-b border-[var(--card-border)] pb-2">${_t('quality.meetings.workspace.status_of', '📈 Статус Объекта ({period})', { period: _periodLabelFromCode(selectedPeriod, periodText) })}</div>
                
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                    <div class="bg-surface border border-[var(--card-border)] p-3 rounded-xl shadow-sm flex flex-col justify-center">
                        <div class="text-rbi-caption font-bold text-muted uppercase tracking-widest mb-1">${_t('quality.meetings.workspace.iko', 'Индекс Риска (ИКО)')}</div>
                        <div class="text-[20px] font-black leading-none ${ikoColor}">${iko}</div>
                    </div>
                    <div class="bg-surface border border-[var(--card-border)] p-3 rounded-xl shadow-sm flex flex-col justify-center">
                        <div class="text-rbi-caption font-bold text-muted uppercase tracking-widest mb-1">${_t('quality.meetings.label.b3', 'Крит. деф. (B3)')}</div>
                        <div class="text-[20px] font-black leading-none ${b3Count > 0 ? 'text-danger' : 'text-green-600'}">${b3Count}</div>
                    </div>
                    <div class="bg-surface border border-[var(--card-border)] p-3 rounded-xl shadow-sm flex flex-col justify-center col-span-2 sm:col-span-1">
                        <div class="text-rbi-caption font-bold text-muted uppercase tracking-widest mb-1">${_t('quality.meetings.workspace.sk_overdue', 'Просрочено в ПК СК')}</div>
                        <div class="text-[20px] font-black leading-none text-danger">${skOverdueCount}</div>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-1">
                    <div class="bg-danger-soft border border-danger-soft p-3 rounded-xl shadow-sm">
                        <div class="text-rbi-caption font-black text-danger uppercase mb-2 tracking-widest">${_t('quality.meetings.workspace.risk_zone', '🚨 Зона риска (B3 или УрК < 70)')}</div>
                        <div>${badContrsHtml}</div>
                    </div>
                    <div class="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50 p-3 rounded-xl shadow-sm">
                        <div class="text-rbi-caption font-black text-green-600 dark:text-green-400 uppercase mb-2 tracking-widest">${_t('quality.meetings.workspace.etalon_quality', '✅ Эталонное качество')}</div>
                        <div>${goodContrsHtml}</div>
                    </div>
                </div>
                
                ${defectPhotosHtml}
            </div>

            <!-- БЛОК РЕШЕНИЙ -->
            <div>
                <div class="text-rbi-label font-black text-ink dark:text-white uppercase tracking-widest mb-3 border-b border-[var(--card-border)] pb-2 flex items-center gap-2">${_t('quality.meetings.workspace.agenda_title', '📋 Повестка и Решения')}</div>
                <div class="text-rbi-caption text-muted mb-3 bg-surface p-2.5 rounded-lg border border-surface">${_t('quality.meetings.workspace.agenda_hint', 'Отмечайте решенные вопросы прямо на совещании. В конце нажмите кнопку внизу — нейросеть соберет их в готовый официальный протокол.')}</div>
                
                <div class="mb-4">
                    ${agendaHtml}
                </div>
                
                <div class="bg-[var(--hover-bg)] p-3 rounded-xl border border-[var(--card-border)] mb-4">
                    <label class="text-rbi-caption font-black text-[var(--text-muted)] uppercase mb-2 block">${_t('quality.meetings.workspace.extra_notes', 'Дополнительные тезисы / Разное')}</label>
                    <textarea id="rbi-meeting-notes" class="input-base h-24 resize-none text-rbi-label" placeholder="${_t('quality.meetings.ph.extra_notes', 'Что еще обсудили на планерке, кроме указанных дефектов...')}"></textarea>
                </div>

                <div class="mb-4">
                    <button onclick="document.getElementById('meeting-photo-upload').click()" class="w-full bg-surface border border-dashed border-surface text-muted py-3 rounded-xl font-bold text-rbi-caption uppercase shadow-sm active:scale-95 flex items-center justify-center gap-2 transition-colors hover:border-surface">
                        ${_t('quality.meetings.btn.attach_photo', '📸 Прикрепить общее фото совещания')}
                    </button>
                    <div id="meeting-photo-preview" class="hidden mt-2 relative w-full h-40 sm:h-48 rounded-xl overflow-hidden border border-surface shadow-sm" data-photo=""></div>
                </div>
            </div>

            <!-- РЕЗУЛЬТАТ / РУЧНОЙ ВВОД -->
            <div id="rbi-meeting-result" class="border-t border-[var(--card-border)] bg-[var(--hover-bg)] p-3 sm:p-4 rounded-xl mt-4 mb-2">
                <div class="flex justify-between items-center mb-2">
                    <div class="text-rbi-label font-black text-ink uppercase tracking-widest">${_t('quality.meetings.workspace.memo_title', 'Итоговый текст (Мемо)')}</div>
                    <button onclick="copyExpertText('btn-copy-memo', 'rbi-meeting-memo-text')" id="btn-copy-memo" class="text-rbi-caption font-bold text-brand bg-brand-soft border border-brand-soft px-2 py-1 rounded active:scale-95 transition-colors">${_t('quality.meetings.btn.copy', '📋 Копировать')}</button>
                </div>
                <textarea id="rbi-meeting-memo-text" class="w-full bg-surface border border-[var(--card-border)] rounded-xl p-3 text-rbi-label outline-none resize-none text-ink h-32 shadow-inner font-medium leading-relaxed custom-scrollbar transition-all" placeholder="${_t('quality.meetings.ph.memo_workspace', 'Можно написать текст вручную или нажать кнопку ИИ внизу...')}"></textarea>
            </div>

        </div>

        <!-- ПОДВАЛ (КНОПКИ СОХРАНЕНИЯ / PREVIEW / ИИ) -->
        <div id="meeting-footer-btn" class="p-3 sm:p-4 border-t border-[var(--card-border)] bg-surface shrink-0 backdrop-blur-md z-10 flex gap-2">
            <button onclick="rbi_saveMeetingMemo()" class="flex-1 bg-surface text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 py-3.5 rounded-xl font-black text-rbi-caption sm:text-rbi-label uppercase tracking-widest shadow-sm active:scale-95 transition-transform flex justify-center items-center gap-1.5">
                ${_t('quality.meetings.btn.save_memo', '💾 Сохранить')}
            </button>
            <button onclick="rbi_previewMeetingProtocol()" class="flex-1 bg-surface text-brand border border-brand-soft py-3.5 rounded-xl font-black text-rbi-caption sm:text-rbi-label uppercase tracking-widest shadow-sm active:scale-95 transition-transform flex justify-center items-center gap-1.5">
                ${_t('quality.meetings.btn.pdf', '👁 PDF')}
            </button>
            <button onclick="window.RBI.services.ai.rbi_generateMeetingMemo()" id="btn-gen-memo" class="flex-[1.5] bg-brand text-white py-3.5 rounded-xl font-black text-rbi-caption sm:text-rbi-label uppercase tracking-widest shadow-md active:scale-95 transition-transform flex items-center justify-center gap-1.5">
                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                <span class="truncate">${_t('quality.meetings.btn.ai_build', 'Собрать (ИИ)')}</span>
            </button>
        </div>
    </div>`;

    container.innerHTML = html;
    _bindAgendaEditorDelegation(container, renderAgendaRow);
    _refreshAgendaGroupBoundaries(container);

    const FD = window.RBIFormDraft;
    if (FD) {
        FD.unbindAutoSave(FD.KEYS.MEETING_WS);
        const decision = FD.askRestore(FD.KEYS.MEETING_WS, _t('quality.meetings.draft.name', 'Совещание'));
        if (decision === 'continue') {
            const d = FD.get(FD.KEYS.MEETING_WS);
            if (d && d.payload) _rbiApplyMeetingWsDraft(d.payload);
        }
        FD.bindAutoSave(container, FD.KEYS.MEETING_WS, _rbiCollectMeetingWsDraft);
    }
}

/** Крупное окно только для предпросмотра протокола (общий modal max-width 480px). */
function _setMeetingPreviewModalLayout(on) {
    const modal = document.getElementById('modal-overlay');
    const box = modal && modal.querySelector('.modal-content');
    if (!box) return;
    const defaultClose = box.querySelector(':scope > button[data-notify-action="closeModal"]');
    if (on) {
        box.style.maxWidth = 'min(960px, 96vw)';
        box.style.width = '96vw';
        box.style.maxHeight = '94vh';
        box.style.padding = '20px 24px';
        if (defaultClose) defaultClose.style.display = 'none';
        modal.dataset.meetingPreviewWide = '1';
    } else if (modal.dataset.meetingPreviewWide === '1') {
        box.style.maxWidth = '';
        box.style.width = '';
        box.style.maxHeight = '';
        box.style.padding = '';
        if (defaultClose) defaultClose.style.display = '';
        delete modal.dataset.meetingPreviewWide;
    }
}

function _closeMeetingPreviewModal() {
    _setMeetingPreviewModalLayout(false);
    if (typeof closeModal === 'function') closeModal();
}

/** Предпросмотр PDF без сохранения в архив. */
export async function previewMeetingProtocol() {
    const draft = collectMeetingDraftFromDom({
        memoText: document.getElementById('rbi-meeting-memo-text')?.value || ''
    });
    if (!draft.memoText) {
        draft.memoText = 'Черновик без текста мемо. Детали — в повестке ниже.';
    }
    _meetingPreviewDraft = draft;
    showToast(_t('quality.meetings.toast.preview_building', '⏳ Формируем предпросмотр...'));
    const content = await buildMeetingProtocolHtml(draft);

    const modal = document.getElementById('modal-overlay');
    document.getElementById('modal-icon').innerHTML = '';
    document.getElementById('modal-title').innerHTML = `
        <div class="flex justify-between items-center w-full">
            <span class="text-[14px] uppercase font-black text-ink dark:text-white">${_t('quality.meetings.preview.title', '👁 Предпросмотр PDF')}</span>
            <button onclick="rbi_closeMeetingPreviewModal()" class="text-muted hover:text-danger active:scale-90 px-2 text-lg">✕</button>
        </div>`;
    document.getElementById('modal-body').innerHTML = `
        <div class="bg-surface border border-surface rounded-xl p-4 sm:p-6 max-h-[calc(94vh-140px)] overflow-y-auto custom-scrollbar text-ink shadow-inner mb-3" id="meeting-preview-body">
            ${content}
        </div>
        <div class="flex gap-2 sticky bottom-0 bg-[var(--card-bg)] pt-1">
            <button onclick="rbi_closeMeetingPreviewModal()" class="flex-1 bg-surface text-ink border border-surface py-3 rounded-xl font-bold text-rbi-caption uppercase">${_t('quality.meetings.btn.close', 'Закрыть')}</button>
            <button onclick="rbi_printMeetingDraftBrowser()" class="flex-1 bg-brand text-white py-3 rounded-xl font-bold text-rbi-caption uppercase shadow-md">${_t('quality.meetings.btn.print_draft', 'Печать черновика')}</button>
        </div>`;
    _setMeetingPreviewModalLayout(true);
    // клик по затемнению / общий closeModal — тоже сбрасываем ширину
    if (!window.__meetingPreviewCloseHooked) {
        window.__meetingPreviewCloseHooked = true;
        const prevClose = window.closeModal;
        window.closeModal = function () {
            _setMeetingPreviewModalLayout(false);
            if (typeof prevClose === 'function') return prevClose.apply(this, arguments);
        };
    }
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
}

export async function printMeetingDraftBrowser() {
    const draft = _meetingPreviewDraft || collectMeetingDraftFromDom({
        memoText: document.getElementById('rbi-meeting-memo-text')?.value
            || 'Черновик без текста мемо. Детали — в повестке ниже.'
    });
    const content = await buildMeetingProtocolHtml(draft);
    if (typeof printPdfShell === 'function') {
        printPdfShell(_t('quality.meetings.print.draft_title', 'Черновик протокола {date}', { date: new Date().toLocaleDateString('ru-RU') }), content, 'A4', 'portrait', 'browser');
    }
}

/* ── handleMeetingPhotoUpload ────────────────────────────────────────────────── */

export function handleMeetingPhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    showToast(_t('quality.meetings.toast.photo_processing', '⚙️ Обработка фото...'));
    window.compressImageToBase64(file, 1000, 0.8, async (base64) => {
        const localUrl = await PhotoManager.saveLocal(base64, 'meet');
        const box = document.getElementById('meeting-photo-preview');
        box.dataset.photo = localUrl;
        box.classList.remove('hidden');

        const realSrc = await PhotoManager.getAsyncUrl(localUrl) || window.getPhotoSrc(localUrl);

        box.innerHTML = `<img src="${realSrc}" class="w-full h-full object-cover"><div onclick="event.stopPropagation(); document.getElementById('meeting-photo-preview').dataset.photo=''; document.getElementById('meeting-photo-preview').classList.add('hidden');" class="absolute top-2 right-2 bg-danger text-white w-6 h-6 rounded-full flex items-center justify-center font-black shadow-md cursor-pointer">✕</div>`;
        event.target.value = '';
        if (window.RBIFormDraft) {
            window.RBIFormDraft.saveNow(window.RBIFormDraft.KEYS.MEETING_WS, _rbiCollectMeetingWsDraft);
        }
    });
}

/* ── saveMeetingMemo ─────────────────────────────────────────────────────────── */

export async function saveMeetingMemo() {
    if (_isDemoMode()) return showToast(_t('quality.meetings.toast.demo_save_disabled', 'В демо-режиме сохранение отключено'));
    let text = document.getElementById('rbi-meeting-memo-text').value.trim();
    if (!text) {
        text = "Протокол сохранен без генерации ИИ. Детали решений смотрите в блоке повестки.";
    }

    const agendaData = collectAgendaFromDom();
    const meetDate = new Date().toISOString();
    agendaData.forEach(a => {
        if (a.isDone && !a.resolvedAt) a.resolvedAt = meetDate;
    });

    const participants = collectParticipantsFromDom(document.getElementById('meeting-participants-list'));
    const extraNotes = document.getElementById('rbi-meeting-notes')?.value.trim() || '';
    const author = document.getElementById('inp-inspector')?.value.trim() || 'Инженер';

    let projectName = String(window._meetingSetupProject || '').trim();
    if (!projectName) {
        // fallback, если setup ещё открыт (не должно случаться после execute)
        const sel = _meetingReadSetupProjectSelection();
        if (sel.isAll || sel.selected.length) {
            projectName = _meetingFormatProjectNameForSave(sel.isAll, sel.selected);
        }
    }
    if (!projectName) {
        return showToast(_t('quality.meetings.toast.no_meeting_project', '⚠️ Не выбран объект совещания — откройте повестку заново'));
    }
    const isAllProjects = projectName === 'Все объекты'
        || (Array.isArray(window._meetingSetupProjects) && window._meetingSetupProjects.includes('__ALL__'));
    const projectNames = isAllProjects
        ? []
        : (Array.isArray(window._meetingSetupProjects)
            ? window._meetingSetupProjects.filter(p => p && p !== '__ALL__')
            : projectName.split(',').map(s => s.trim()).filter(Boolean));
    const meet = {
        id: 'meet_' + Date.now().toString(36),
        date: meetDate,
        author: author,
        engineer_name: author,
        inspector_name: author,
        title: `Совещание от ${new Date().toLocaleDateString('ru-RU')}`,
        memoText: text,
        agenda: agendaData,
        participants: participants,
        notes: extraNotes,
        period: window._meetingSetupPeriod || 'WEEK',
        periodText: window._meetingSetupPeriodText || '7 дней',
        qDayPhoto: document.getElementById('meeting-photo-preview')?.dataset?.photo || null,
        createdAt: meetDate,
        updatedAt: meetDate
    };
    _meetingApplyProjectFieldsToRecord(meet, isAllProjects, projectNames);

    window.rbi_meetingsData.push(meet);
    await _meetingsStorage().put(_meetingsStorage().stores().MEETINGS, meet);
    if (window.SyncQueueManager && !_isDemoMode()) {
        window.SyncQueueManager.enqueue('SAVE_MEETING', meet);
    }

    localStorage.setItem('rbi_cloud_dirty', '1');
    _gameLogAction('meeting_memo_created', meet.id);
    _meetingsSync('silent');

    if (Array.isArray(_getTasks())) {
        if (window.activeTaskId) {
            const task = _getTasks().find(t => t.id === window.activeTaskId);
            if (task) {
                task.status = 'done';
                task.resultComment = 'Протокол сформирован';
                task.updatedAt = new Date().toISOString();
                if (typeof dbPut === 'function') await _meetingsStorage().put(_meetingsStorage().stores().TASKS, task);
            }
            window.activeTaskId = null;
        }

        const autoTasks = _getTasks().filter(t =>
            t.status === 'pending' &&
            (t.title === 'Еженедельный разбор качества' || t.taskType === 'Аналитика СК')
        );
        for (let t of autoTasks) {
            t.status = 'done';
            t.resultComment = 'Протокол сформирован';
            t.updatedAt = new Date().toISOString();
            if (typeof dbPut === 'function') await _meetingsStorage().put(_meetingsStorage().stores().TASKS, t);
        }
    }
    showToast(_t('quality.meetings.toast.saved_archive', '💾 Протокол сохранен в архив!'));
    const FD = window.RBIFormDraft;
    if (FD) {
        FD.clear(FD.KEYS.MEETING_WS);
        FD.unbindAutoSave(FD.KEYS.MEETING_WS);
    }
    _meetingDraftSkipSave = true;
    rbi_renderMeetingTab();
}

/* ── bindMeetingsActionDelegation ─────────────────────────────────────────────
 * Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
 * (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-meetings-action).
 */
function bindMeetingsActionDelegation() {
    if (window.__meetingsActionDelegationBound) return;
    window.__meetingsActionDelegationBound = true;

    const readArg = (el, valType, evt) => {
        switch (valType) {
            case 'element': return el;
            case 'event': return evt;
            case 'checked': return el.checked;
            case 'int': return parseInt(el.value, 10);
            case 'value': return el.value;
            default: return undefined;
        }
    };

    const dispatch = (el, evt) => {
        const action = el.dataset.meetingsAction;
        const fn = window[action];
        if (typeof fn !== 'function') return;
        const valType = el.dataset.meetingsActionValType;
        const arg = valType ? readArg(el, valType, evt) : el.dataset.actionArg;
        if (arg === undefined) {
            fn();
        } else {
            fn(arg);
        }
    };

    const resolveActionElement = (target, wantsChange) => {
        let el = target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.meetingsAction) {
                if (!!(el.dataset.actionEvent === 'change') === wantsChange) return el;
            }
            const inlineOnclick = el.getAttribute && el.getAttribute('onclick');
            if (!wantsChange && inlineOnclick && inlineOnclick.includes('stopPropagation')) return null;
            el = el.parentElement;
        }
        return null;
    };

    document.addEventListener('click', (e) => {
        const el = resolveActionElement(e.target, false);
        if (el) dispatch(el, e);
    }, true);

    document.addEventListener('change', (e) => {
        const el = resolveActionElement(e.target, true);
        if (el) dispatch(el, e);
    }, true);
}

/* ── MeetingsModule (платформенный контракт) ────────────────────────────────── */

export const MeetingsModule = {
    id: 'meetings',
    routes: ['/meetings'],
    dependencies: ['storage', 'tasks'],

    _syncUnsubscribe: null,

    async init(ctx) {
        _ctx = ctx;
        if (window.MeetingsActions) window.MeetingsActions.bindCtx(ctx);
        if (window.MeetingsState) window.MeetingsState.syncFromLegacy();

        bindMeetingsActionDelegation();

        const events = (ctx && ctx.events) || (window.RBI && window.RBI.events);

        if (events && typeof events.on === 'function') {
            const syncHandler = function () {
                if (window.MeetingsState) window.MeetingsState.syncFromLegacy();
            };
            events.on('sync:completed', syncHandler);
            MeetingsModule._syncUnsubscribe = function () {
                if (events.off) events.off('sync:completed', syncHandler);
            };
        }


        if (events && typeof events.on === 'function' && !MeetingsModule._i18nBound) {
            MeetingsModule._i18nBound = true;
            events.on('i18n:localeChanged', function () {
                try {
                    var editor = document.getElementById('meeting-protocol-editor-view');
                    if (editor && !editor.classList.contains('hidden') && window.currentEditingMeetingId) {
                        openSavedMeeting(window.currentEditingMeetingId);
                        return;
                    }
                    if (document.getElementById('rbi-meeting-container')) {
                        renderMeetingTab();
                    }
                } catch (_e) { /* ignore */ }
            });
        }

        if (events && typeof events.emit === 'function') {
            events.emit('meetings:initialized', {});
        }

        console.log('[MeetingsModule] init complete');
    },

    mount(container, ctx) {
        renderMeetingTab();
    },

    unmount() {
        if (typeof MeetingsModule._syncUnsubscribe === 'function') {
            MeetingsModule._syncUnsubscribe();
            MeetingsModule._syncUnsubscribe = null;
        }
    }
};

if (typeof window !== 'undefined' && window.RBI && window.RBI.registry) {
    window.RBI.registry.register('module.meetings', MeetingsModule);
}

/* ── window.rbi_* accessors (legacy compatibility) ──────────────────────────── */
/* Перезаписывают stub-заглушки из app.js сразу при загрузке ES-модуля.         */
/* meetings.legacy.js дублирует это — оба варианта идемпотентны.                */
if (typeof window !== 'undefined') {
    window.rbi_renderMeetingTab       = renderMeetingTab;
    window.rbi_openSavedMeeting       = openSavedMeeting;
    window.rbi_saveEditedMeeting      = saveEditedMeeting;
    window.rbi_deleteMeeting          = deleteMeeting;
    window.rbi_openMeetingSetupModal  = openMeetingSetupModal;
    window.rbi_updateMeetingSetupList = updateMeetingSetupList;
    window.rbi_onMeetingSetupProjectAllChange = onMeetingSetupProjectAllChange;
    window.rbi_onMeetingSetupProjectChange = onMeetingSetupProjectChange;
    window.rbi_openMeetingBindModal   = openMeetingBindModal;
    window.rbi_closeMeetingBindModal  = closeMeetingBindModal;
    window.rbi_saveMeetingBind        = saveMeetingBind;
    window.rbi_onMeetingBindProjectAllChange = onMeetingBindProjectAllChange;
    window.rbi_onMeetingBindProjectChange = onMeetingBindProjectChange;
    window.rbi_executeMeetingSetup    = executeMeetingSetup;
    window.rbi_createMeeting          = createMeeting;
    window.rbi_handleMeetingPhotoUpload = handleMeetingPhotoUpload;
    window.rbi_saveMeetingMemo        = saveMeetingMemo;
    window.rbi_addMeetingParticipantRow = addMeetingParticipantRow;
    window.rbi_removeMeetingParticipantRow = removeMeetingParticipantRow;
    window.rbi_previewMeetingProtocol = previewMeetingProtocol;
    window.rbi_printMeetingDraftBrowser = printMeetingDraftBrowser;
    window.rbi_printSavedMeetingDirty = printSavedMeetingDirty;
    window.rbi_exportMeetingDocxDirty = exportMeetingDocxDirty;
    window.rbi_closeMeetingProtocolEditor = closeMeetingProtocolEditor;
    window.rbi_closeMeetingPreviewModal = _closeMeetingPreviewModal;
}

console.log('[MeetingsModule] meetings.module.js loaded (ES module, Step 35 — full business logic)');
