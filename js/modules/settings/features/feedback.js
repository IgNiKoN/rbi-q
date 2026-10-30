// ============================================================================
// МОДУЛЬ ОБРАТНОЙ СВЯЗИ (ФИДБЕК И ИДЕИ)
// Перенесён из app.js (Step 39)
// ============================================================================

// --- Приватные хелперы ---

let _ctx = null;
function bindCtx(ctx) { _ctx = ctx; }

function _storage() {
    if (_ctx && _ctx.storage) return _ctx.storage;
    if (window.RBI?.services?.storage) return window.RBI.services.storage;
    return {
        get:    (store, id) => typeof dbGet    === 'function' ? dbGet(store, id)       : Promise.resolve(null),
        getAll: (store)     => typeof dbGetAll === 'function' ? dbGetAll(store)         : Promise.resolve([]),
        put:    (store, v)  => typeof dbPut    === 'function' ? dbPut(store, v)         : Promise.resolve(),
        delete: (store, id) => typeof dbDelete === 'function' ? dbDelete(store, id)     : Promise.resolve(),
        stores: function () { return typeof STORES !== 'undefined' ? STORES : {}; },
    };
}

function _syncEnqueue(type, payload) {
    if (_ctx && _ctx.sync && _ctx.sync.enqueue) return _ctx.sync.enqueue(type, payload);
    if (window.RBI?.services?.sync?.enqueue) return window.RBI.services.sync.enqueue(type, payload);
    if (window.SyncQueueManager?.enqueue) return window.SyncQueueManager.enqueue(type, payload);
}

function _triggerSync(mode) {
    const m = mode || 'silent';
    if (_ctx && _ctx.sync) return _ctx.sync.trigger(m);
    if (window.RBI && window.RBI.services && window.RBI.services.sync) return window.RBI.services.sync.trigger(m);
    if (typeof triggerSync === 'function') return triggerSync(m);
    return Promise.resolve(false);
}

function _getSetting(key) {
    const svc = (_ctx && _ctx.settings) || window.RBI.services.settings;
    return svc.get(key);
}

function _isDemoMode() {
    const svc = (_ctx && _ctx.appMode) || window.RBI.services.appMode;
    return svc.isDemo();
}

// --- Guard-инициализация ---
if (!Array.isArray(window.rbi_feedbackData)) {
    window.rbi_feedbackData = [];
}

// Глобальный флаг-замок (инициализируем только если не задан)
if (typeof window.isFeedbackEditing === 'undefined') {
    window.isFeedbackEditing = false;
}

// Блокировка перерисовки, пока админ/инженер работает с полями бэклога
let rbiDisableFeedbackRerender = false;
let _feedbackRerenderPending = false;
let _feedbackUnlockTimer = null;

// --- Константа статусов и групп бэклога ---
const STATUS_MAP = {
    'new':         { text: 'Ждёт ответа', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    'in_progress': { text: 'В работе',    color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
    'done':        { text: 'Ответ дан',   color: 'bg-green-100 text-green-700 border-green-200' },
    'rejected':    { text: 'Отклонено',   color: 'bg-slate-100 text-slate-500 border-slate-300' }
};

const STATUS_GROUPS = [
    { key: 'new',         title: 'Ждут ответа',  empty: 'Нет новых обращений' },
    { key: 'in_progress', title: 'В работе',     empty: 'Нет задач в работе' },
    { key: 'done',        title: 'Ответ дан',    empty: 'Пока нет закрытых' },
    { key: 'rejected',    title: 'Отклонено',    empty: 'Пусто' }
];

function _escAttr(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function _isFeedbackUiTarget(el) {
    if (!el || !el.closest) return false;
    return !!(
        el.closest('#manager-dev-list') ||
        el.closest('#manager-roadmap-list') ||
        el.closest('#feedback-list-container') ||
        el.closest('#feedback-edit-modal') ||
        el.id === 'feedback-input-text' ||
        el.id === 'dev-roadmap-input'
    );
}

function _feedbackUiBusy() {
    if (rbiDisableFeedbackRerender || window.isFeedbackEditing) return true;
    return _isFeedbackUiTarget(document.activeElement);
}

function _lockFeedbackRerender() {
    rbiDisableFeedbackRerender = true;
    window.isFeedbackEditing = true;
    if (_feedbackUnlockTimer) {
        clearTimeout(_feedbackUnlockTimer);
        _feedbackUnlockTimer = null;
    }
}

function _unlockFeedbackRerenderSoon(delayMs) {
    if (_feedbackUnlockTimer) clearTimeout(_feedbackUnlockTimer);
    _feedbackUnlockTimer = setTimeout(() => {
        // Не снимаем замок, если фокус всё ещё в поле бэклога
        if (_isFeedbackUiTarget(document.activeElement)) return;
        rbiDisableFeedbackRerender = false;
        window.isFeedbackEditing = false;
        _feedbackUnlockTimer = null;
        if (_feedbackRerenderPending) {
            _feedbackRerenderPending = false;
            if (typeof rbi_renderDevFeedbackTab === 'function') rbi_renderDevFeedbackTab();
            if (typeof rbi_renderFeedbackTab === 'function') rbi_renderFeedbackTab();
        }
    }, typeof delayMs === 'number' ? delayMs : 1200);
}

function _ensureFeedbackUiGuards() {
    if (window._feedbackUiGuardsBound) return;
    window._feedbackUiGuardsBound = true;

    document.addEventListener('focusin', (e) => {
        if (_isFeedbackUiTarget(e.target)) _lockFeedbackRerender();
    }, true);

    document.addEventListener('focusout', (e) => {
        if (!_isFeedbackUiTarget(e.target)) return;
        setTimeout(() => {
            if (_isFeedbackUiTarget(document.activeElement)) return;
            _unlockFeedbackRerenderSoon(1500);
        }, 0);
    }, true);

    document.addEventListener('input', (e) => {
        const t = e.target;
        if (!t) return;
        if ((t.id && t.id.startsWith('dev-note-')) || t.id === 'feedback-input-text' || t.id === 'dev-roadmap-input') {
            _lockFeedbackRerender();
        }
    }, true);
}

function _sortFeedbackItems(a, b) {
    const likesDiff = (b.likes?.length || 0) - (a.likes?.length || 0);
    if (likesDiff !== 0) return likesDiff;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

function _groupFeedbackByStatus(items) {
    const map = { new: [], in_progress: [], done: [], rejected: [] };
    items.forEach((f) => {
        const key = STATUS_MAP[f.status] ? f.status : 'new';
        map[key].push(f);
    });
    Object.keys(map).forEach((k) => map[k].sort(_sortFeedbackItems));
    return map;
}

window.rbi_lockFeedbackUi = _lockFeedbackRerender;
window.rbi_onDevNoteBlur = function (id, el) {
    const idx = window.rbi_feedbackData.findIndex(f => f.id === id);
    if (idx === -1) {
        _unlockFeedbackRerenderSoon(400);
        return;
    }
    const note = (el && el.value != null ? el.value : '').trim();
    const prev = (window.rbi_feedbackData[idx].developer_notes || '').trim();
    if (note === prev) {
        _unlockFeedbackRerenderSoon(800);
        return;
    }
    rbi_updateFeedbackNotes(id, null, { silent: true, fromBlur: true });
};

// --- Публичные функции ---

function rbi_renderFeedbackTab() {
    _ensureFeedbackUiGuards();
    if (_feedbackUiBusy()) {
        _feedbackRerenderPending = true;
        return;
    }

    const container = document.getElementById('feedback-list-container');
    if (!container) return;

    if (!window.rbi_feedbackData || window.rbi_feedbackData.length === 0) {
        container.innerHTML = `<div class="text-center py-6 text-slate-400 text-[10px] font-bold uppercase tracking-widest border border-dashed border-slate-300 rounded-xl">Информации пока нет</div>`;
        return;
    }

    const currentEng = _getSetting('engineerName') || 'Инженер';
    const allActive = [...window.rbi_feedbackData].filter(f => !f._deleted);

    const roadmaps = allActive.filter(f => f.is_roadmap).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const feedback = allActive.filter(f => !f.is_roadmap);
    const grouped = _groupFeedbackByStatus(feedback);

    let html = '';

    // --- БЛОК: ПЛАНЫ РАЗРАБОТЧИКА ---
    if (roadmaps.length > 0) {
        html += `<div class="mb-4">
            <div class="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2 flex items-center gap-1.5 border-b border-indigo-100 pb-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Планы разработчика (Roadmap)
            </div>
            <div class="space-y-2">`;

        roadmaps.forEach(rm => {
            const likesCount = rm.likes ? rm.likes.length : 0;
            const iLiked = rm.likes && rm.likes.includes(currentEng);

            html += `
                <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-3 shadow-sm">
                    <div class="text-[12px] font-bold text-indigo-900 leading-tight mb-2">${rm.text}</div>
                    <button onclick="rbi_toggleFeedbackLike('${rm.id}')" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${iLiked ? 'bg-indigo-600 border-indigo-700 text-white shadow-md' : 'bg-white border-indigo-200 text-indigo-600'} active:scale-95 transition-colors text-[10px] font-black w-fit">
                        <svg class="w-3.5 h-3.5" fill="${iLiked ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"></path></svg>
                        Жду эту функцию! (${likesCount})
                    </button>
                </div>
            `;
        });
        html += `</div></div>`;
    }

    // --- БЛОК: ИДЕИ ПО ГРУППАМ СТАТУСА ---
    if (feedback.length > 0) {
        html += `<div class="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 border-b border-slate-200 pb-1">Идеи и баги от команды</div>`;

        STATUS_GROUPS.forEach((group) => {
            const items = grouped[group.key] || [];
            if (items.length === 0) return;
            const openAttr = (group.key === 'new' || group.key === 'in_progress') ? 'open' : '';
            html += `
            <details class="mb-3 group/fb [&_summary::-webkit-details-marker]:hidden" ${openAttr}>
                <summary class="py-2 cursor-pointer flex justify-between items-center select-none border-b border-slate-200 dark:border-slate-700 mb-2">
                    <span class="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">${group.title} <span class="text-slate-400 font-bold">(${items.length})</span></span>
                    <span class="text-slate-400 transition-transform group-open/fb:rotate-180">▼</span>
                </summary>
                <div class="space-y-3">`;

            items.forEach(f => {
                const st = STATUS_MAP[f.status] || STATUS_MAP['new'];
                const likesCount = f.likes ? f.likes.length : 0;
                const iLiked = f.likes && f.likes.includes(currentEng);
                const isOwner = f.author === currentEng;

                let contentHtml = f.normalized_text
                    ? `<div class="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300 mb-2">${f.normalized_text.replace(/\n/g, '<br>')}</div>`
                    : `<div class="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300 mb-2 italic">«${f.text}»</div>`;

                let notesHtml = f.developer_notes
                    ? `<div class="mt-2 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800 p-2 rounded-lg text-[10px] text-emerald-800 dark:text-emerald-400"><b>Ответ:</b> ${_escAttr(f.developer_notes)}</div>`
                    : '';

                html += `
                <div class="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm transition-colors">
                    <div class="flex justify-between items-start mb-2 border-b border-slate-200 dark:border-slate-700 pb-2">
                        <div>
                            <div class="text-[10px] font-black text-slate-800 dark:text-white uppercase">${f.author}</div>
                            <div class="text-[8px] text-slate-400 font-bold">${new Date(f.createdAt).toLocaleDateString('ru-RU')}</div>
                        </div>
                        <div class="text-[9px] font-black px-2 py-0.5 rounded border ${st.color} uppercase tracking-widest">${st.text}</div>
                    </div>
                    ${contentHtml}
                    ${notesHtml}
                    <div class="mt-2 flex justify-between items-center pt-2">
                        <button onclick="rbi_toggleFeedbackLike('${f.id}')" class="flex items-center gap-1.5 px-2 py-1 rounded-lg border ${iLiked ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500'} active:scale-95 transition-colors text-[10px] font-bold">
                            <svg class="w-3.5 h-3.5" fill="${iLiked ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"></path></svg>
                            Поддерживаю (${likesCount})
                        </button>
                        ${isOwner ? `
                        <div class="flex gap-1.5">
                            <button onclick="rbi_editFeedback('${f.id}')" class="text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 active:scale-95 shadow-sm transition-colors">Изменить</button>
                            <button onclick="rbi_deleteFeedback('${f.id}')" class="text-[10px] font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 active:scale-95 shadow-sm transition-colors">Удалить</button>
                        </div>
                        ` : ''}
                    </div>
                </div>`;
            });

            html += `</div></details>`;
        });
    }

    container.innerHTML = html;
}

// Общая логика сохранения предложения (ИИ-нормализация + запись в storage +
// синхронизация) — используется и формой на вкладке «Настройки» (DOM-инпут,
// rbi_submitFeedback), и быстрой отправкой с экрана-заглушки модуля
// (prompt-based, rbi_sendIdeaFromPlaceholder). Возвращает Promise<boolean> —
// true при успешном сохранении.
async function _saveFeedbackText(text) {
    text = (text || '').trim();
    if (!text) { showToast("⚠️ Напишите предложение!"); return false; }

    let normalizedText = null;
    if (_getSetting('aiEnabled')) {
        const aiSvc = (_ctx && _ctx.ai) || window.RBI.services.ai;
        normalizedText = await aiSvc.rbi_normalizeFeedbackAi(text);
    }

    const currentEng = _getSetting('engineerName') || 'Инженер';

    const fb = {
        id: window.RbiIds.newId(),
        text: text,
        normalized_text: normalizedText,
        author: currentEng,
        owner: currentEng,
        status: 'new',
        developer_notes: '',
        likes: [currentEng],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _deleted: false
    };

    window.rbi_feedbackData.unshift(fb);
    await _storage().put(_storage().stores().FEEDBACK_LIST, fb);

    localStorage.setItem('rbi_cloud_dirty', '1');
    _triggerSync('silent');
    return true;
}

async function rbi_submitFeedback() {
    const inputEl = document.getElementById('feedback-input-text');
    const btn = document.getElementById('feedback-submit-btn');
    const text = inputEl.value.trim();
    if (!text) return showToast("⚠️ Напишите предложение!");

    btn.innerHTML = `<span class="animate-pulse">⏳ ИИ нормализует текст...</span>`;
    btn.disabled = true;

    await _saveFeedbackText(text);

    inputEl.value = '';
    btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg> Отправить разработчику`;
    btn.disabled = false;

    showToast("✅ Предложение отправлено!");
    rbi_renderFeedbackTab();
}

// Быстрая отправка идеи с экрана-заглушки модуля («Отправить идею разработчику»,
// #tab-mode-placeholder) — тот же storage/AI-конвейер, что rbi_submitFeedback(),
// но без открытия вкладки «Настройки» (prompt() вместо формы, раздел не имеет
// собственного UI). Дублирует канал попадания в тот же список FEEDBACK_LIST,
// который видит разработчик — по прямому решению пользователя (одна очередь,
// не отдельная сущность).
async function rbi_sendIdeaFromPlaceholder() {
    const moduleTitle = document.querySelector('#tab-mode-placeholder h2')?.innerText || '';
    const text = window.prompt('Ваша идея/пожелание по модулю' + (moduleTitle ? ' ' + moduleTitle : '') + ':');
    if (text === null) return;
    const ok = await _saveFeedbackText(text);
    if (ok) showToast("✅ Идея отправлена разработчику!");
}

async function rbi_toggleFeedbackLike(id) {
    const idx = window.rbi_feedbackData.findIndex(f => f.id === id);
    if (idx === -1) return;

    const currentEng = _getSetting('engineerName') || 'Инженер';
    let likes = window.rbi_feedbackData[idx].likes || [];

    if (likes.includes(currentEng)) {
        likes = likes.filter(l => l !== currentEng);
    } else {
        likes.push(currentEng);
    }

    window.rbi_feedbackData[idx].likes = likes;
    window.rbi_feedbackData[idx].updatedAt = new Date().toISOString();

    window.rbi_feedbackData[idx].sync_status = 'not_synced';
    window.rbi_feedbackData[idx].syncStatus = 'not_synced';
    window.rbi_feedbackData[idx].source = 'local';

    await _storage().put(_storage().stores().FEEDBACK_LIST, window.rbi_feedbackData[idx]);
    localStorage.setItem('rbi_cloud_dirty', '1');
    _triggerSync('silent');

    rbi_renderFeedbackTab();
}

async function rbi_deleteFeedback(id) {
    const idx = window.rbi_feedbackData.findIndex(f => f.id === id);
    if (idx === -1) return;

    const f = window.rbi_feedbackData[idx];
    const permSvc = (_ctx && _ctx.permissions) || window.RBI.services.permissions;
    const currentEng = permSvc ? permSvc.getCurrentEngineerName() : (_getSetting('engineerName') || 'Инженер');
    const isOwner = f.author === currentEng;
    const isAdmin = permSvc ? permSvc.isAdmin() : false;

    if (!isOwner && !isAdmin) return showToast("⚠️ Нет прав на удаление");

    const msg = (isAdmin && !isOwner) ? "Удалить предложение пользователя из бэклога?" : "Вы уверены, что хотите удалить свое предложение?";
    if (!confirm(msg)) return;

    window.rbi_feedbackData[idx]._deleted = true;
    window.rbi_feedbackData[idx].is_deleted = true;
    window.rbi_feedbackData[idx]._deletedAt = new Date().toISOString();
    window.rbi_feedbackData[idx].updatedAt = window.rbi_feedbackData[idx]._deletedAt;

    window.rbi_feedbackData[idx].source = 'local';
    window.rbi_feedbackData[idx].syncStatus = 'not_synced';
    window.rbi_feedbackData[idx].sync_status = 'not_synced';

    await _storage().put('feedback_list', window.rbi_feedbackData[idx]);

    localStorage.setItem('rbi_cloud_dirty', '1');
    _triggerSync('silent');

    showToast("🗑️ Предложение удалено");

    if (typeof rbi_renderFeedbackTab === 'function') rbi_renderFeedbackTab();
    if (typeof rbi_renderDevFeedbackTab === 'function') rbi_renderDevFeedbackTab();
}

function rbi_editFeedback(id) {
    const idx = window.rbi_feedbackData.findIndex(f => f.id === id);
    if (idx === -1) return;
    const f = window.rbi_feedbackData[idx];

    const currentText = f.normalized_text || f.text;

    const modalHtml = `
    <div id="feedback-edit-modal" class="fixed inset-0 bg-slate-900/80 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
        <div class="bg-[var(--card-bg)] w-full max-w-md p-6 rounded-2xl shadow-2xl border border-[var(--card-border)] flex flex-col animate-fadeIn">
            <div class="font-black text-[13px] uppercase tracking-tight mb-4 text-slate-800 dark:text-white flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
                <span class="flex items-center gap-2">✏️ Редактировать текст</span>
                <button onclick="document.getElementById('feedback-edit-modal').remove()" class="text-slate-400 hover:text-red-500 active:scale-90 px-2 text-lg">✕</button>
            </div>
            <textarea id="feedback-edit-input" class="input-base text-[12px] h-48 resize-none mb-4 p-3 leading-relaxed shadow-inner">${currentText}</textarea>
            <div class="flex gap-2">
                <button onclick="document.getElementById('feedback-edit-modal').remove()" class="flex-1 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 py-3.5 rounded-xl font-bold text-[11px] uppercase active:scale-95 border border-slate-200 dark:border-slate-700 transition-colors">Отмена</button>
                <button onclick="rbi_saveEditedFeedback('${id}')" class="flex-1 bg-indigo-600 text-white py-3.5 rounded-xl font-black text-[11px] uppercase shadow-md active:scale-95 transition-transform">💾 Сохранить</button>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function rbi_saveEditedFeedback(id) {
    const newText = document.getElementById('feedback-edit-input').value.trim();
    if (!newText) return showToast("⚠️ Текст не может быть пустым!");

    const idx = window.rbi_feedbackData.findIndex(f => f.id === id);
    if (idx === -1) return;

    window.rbi_feedbackData[idx].normalized_text = newText;
    window.rbi_feedbackData[idx].updatedAt = new Date().toISOString();

    await _storage().put(_storage().stores().FEEDBACK_LIST, window.rbi_feedbackData[idx]);

    localStorage.setItem('rbi_cloud_dirty', '1');
    _triggerSync('silent');

    document.getElementById('feedback-edit-modal').remove();
    showToast("✅ Текст успешно обновлен!");
    rbi_renderFeedbackTab();
}

function _renderDevFeedbackCard(f) {
    // Theme tokens: rbi-dark-v3 remaps text-slate-800→light, but bg-white stays white → unreadable.
    const textDisplay = f.normalized_text
        ? `<div class="text-[11px] text-[var(--text-main)] bg-[var(--hover-bg)] border border-[var(--card-border)] p-2 rounded mb-2 font-medium">${f.normalized_text.replace(/\n/g, '<br>')}</div><details><summary class="text-[9px] text-[var(--text-muted)] cursor-pointer">Оригинал</summary><div class="text-[10px] italic text-[var(--text-muted)] mt-1">${_escAttr(f.text)}</div></details>`
        : `<div class="text-[11px] text-[var(--text-main)] bg-[var(--hover-bg)] border border-[var(--card-border)] p-2 rounded mb-2 italic">«${_escAttr(f.text)}»</div>`;

    return `
        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 shadow-sm mb-3" data-feedback-id="${f.id}">
            <div class="flex justify-between items-center mb-2 border-b border-[var(--card-border)] pb-2">
                <div class="text-[11px] font-black uppercase text-[var(--text-main)]">${_escAttr(f.author)} <span class="text-[9px] font-normal text-[var(--text-muted)] normal-case ml-2">${new Date(f.createdAt).toLocaleDateString('ru-RU')}</span></div>
                <div class="flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-800">❤️ ${f.likes?.length || 0}</div>
            </div>
            ${textDisplay}
            
            <div class="mt-3 pt-3 border-t border-[var(--card-border)] grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label class="text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Статус</label>
                    <select class="input-base text-[11px] !py-1.5 transition-colors duration-300"
                        onfocus="rbi_lockFeedbackUi()"
                        onchange="rbi_updateFeedbackStatus('${f.id}', this.value, this)">
                        <option value="new" ${f.status === 'new' ? 'selected' : ''}>🔵 Ждёт ответа</option>
                        <option value="in_progress" ${f.status === 'in_progress' ? 'selected' : ''}>🟡 В работе</option>
                        <option value="done" ${f.status === 'done' ? 'selected' : ''}>🟢 Ответ дан</option>
                        <option value="rejected" ${f.status === 'rejected' ? 'selected' : ''}>⚪ Отклонено</option>
                    </select>
                </div>
                <div>
                    <label class="text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Ответ разработчика</label>
                    <div class="flex gap-1">
                        <input type="text" id="dev-note-${f.id}" class="input-base text-[11px] !py-1.5"
                            placeholder="Напишите ответ..."
                            value="${_escAttr(f.developer_notes || '')}"
                            onfocus="rbi_lockFeedbackUi()"
                            onblur="rbi_onDevNoteBlur('${f.id}', this)"
                            onkeydown="if(event.key==='Enter'){event.preventDefault();rbi_updateFeedbackNotes('${f.id}', this.nextElementSibling);}">
                        <button type="button" onclick="rbi_updateFeedbackNotes('${f.id}', this)" class="bg-emerald-600 text-white px-3 rounded-lg text-[10px] font-bold active:scale-95 shadow-sm transition-colors duration-300 w-10 shrink-0">OK</button>
                    </div>
                    <div class="text-[8px] text-[var(--text-muted)] font-medium mt-1">Сохраняется по OK / Enter / уходу из поля. Список не прыгает, пока пишете.</div>
                </div>
            </div>
            <div class="mt-3 pt-2 border-t border-[var(--card-border)] flex justify-end">
                <button onclick="rbi_deleteFeedback('${f.id}')" class="text-[9px] font-bold text-red-500 hover:text-red-700 uppercase flex items-center gap-1 active:scale-95"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg> Удалить из бэклога</button>
            </div>
        </div>`;
}

function rbi_renderDevFeedbackTab() {
    _ensureFeedbackUiGuards();
    if (_feedbackUiBusy()) {
        _feedbackRerenderPending = true;
        return;
    }

    const listContainer = document.getElementById('manager-dev-list');
    const roadmapContainer = document.getElementById('manager-roadmap-list');
    if (!listContainer || !roadmapContainer) return;

    const allData = (window.rbi_feedbackData || []).filter(f => !f._deleted);

    // 1. Отрисовка планов (Roadmap)
    const roadmaps = allData.filter(f => f.is_roadmap);
    if (roadmaps.length === 0) {
        roadmapContainer.innerHTML = `<div class="text-[10px] text-slate-400 italic text-center">Опубликованных планов нет</div>`;
    } else {
        roadmapContainer.innerHTML = roadmaps.map(rm => `
            <div class="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 p-3 rounded-xl flex justify-between items-center shadow-sm">
                <div class="flex-1 min-w-0 pr-3">
                    <div class="text-[12px] font-bold text-indigo-900 dark:text-indigo-200 leading-tight">${_escAttr(rm.text)}</div>
                    <div class="text-[9px] font-black text-indigo-500 dark:text-indigo-300 uppercase mt-1">❤️ Лайков от команды: ${rm.likes?.length || 0}</div>
                </div>
                <button onclick="rbi_deleteRoadmapItem('${rm.id}')" class="w-8 h-8 bg-[var(--card-bg)] rounded-full flex items-center justify-center text-red-500 font-black shadow-sm active:scale-90 border border-indigo-100 dark:border-indigo-800 shrink-0">✕</button>
            </div>
        `).join('');
    }

    // 2. Бэклог по группам статусов
    const feedback = allData.filter(f => !f.is_roadmap);
    if (feedback.length === 0) {
        listContainer.innerHTML = `<div class="text-center py-6 text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-widest border border-dashed border-[var(--card-border)] rounded-xl bg-[var(--card-bg)]">Бэклог пуст</div>`;
        return;
    }

    const grouped = _groupFeedbackByStatus(feedback);
    let html = '';
    STATUS_GROUPS.forEach((group) => {
        const items = grouped[group.key] || [];
        const openAttr = (group.key === 'new' || group.key === 'in_progress') ? 'open' : '';
        html += `
        <details class="mb-4 group/devfb [&_summary::-webkit-details-marker]:hidden bg-slate-50/80 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden" ${openAttr}>
            <summary class="p-3 cursor-pointer flex justify-between items-center select-none bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
                <span class="text-[11px] font-black uppercase tracking-widest text-slate-800 dark:text-white">${group.title} <span class="text-slate-400">(${items.length})</span></span>
                <span class="text-slate-400 text-[10px] transition-transform group-open/devfb:rotate-180">▼</span>
            </summary>
            <div class="p-3 ${items.length ? '' : 'py-6'}">
                ${items.length
                    ? items.map(_renderDevFeedbackCard).join('')
                    : `<div class="text-[10px] text-slate-400 italic text-center">${group.empty}</div>`}
            </div>
        </details>`;
    });
    listContainer.innerHTML = html;
}

async function rbi_updateFeedbackStatus(id, newStatus, selectEl) {
    _lockFeedbackRerender();

    const idx = window.rbi_feedbackData.findIndex(f => f.id === id);
    if (idx === -1) return;

    window.rbi_feedbackData[idx].status = newStatus;
    window.rbi_feedbackData[idx].updatedAt = new Date().toISOString();
    window.rbi_feedbackData[idx].sync_status = 'not_synced';
    window.rbi_feedbackData[idx].syncStatus = 'not_synced';
    window.rbi_feedbackData[idx].source = 'local';

    await _storage().put(_storage().stores().FEEDBACK_LIST, window.rbi_feedbackData[idx]);
    localStorage.setItem('rbi_cloud_dirty', '1');
    _triggerSync('silent');

    if (selectEl) {
        const originalBg = selectEl.style.backgroundColor;
        selectEl.style.backgroundColor = '#dcfce7';
        setTimeout(() => { selectEl.style.backgroundColor = originalBg; }, 1000);
    }
    showToast('✅ Статус обновлён (список перегруппируется, когда закончите правку)');
    // Не перерисовываем сразу — карточка остаётся на месте, пока пишете ответ
    _unlockFeedbackRerenderSoon(2500);
}

async function rbi_updateFeedbackNotes(id, btnEl, options) {
    options = options || {};
    _lockFeedbackRerender();

    const idx = window.rbi_feedbackData.findIndex(f => f.id === id);
    if (idx === -1) return;
    const noteEl = document.getElementById(`dev-note-${id}`);
    const note = noteEl ? noteEl.value.trim() : '';

    window.rbi_feedbackData[idx].developer_notes = note;
    // Если ответили на «новое» — автоматически «в работе», чтобы не терялось в очереди
    if (note && window.rbi_feedbackData[idx].status === 'new') {
        window.rbi_feedbackData[idx].status = 'in_progress';
        const sel = document.querySelector(`[data-feedback-id="${id}"] select`);
        if (sel) sel.value = 'in_progress';
    }
    window.rbi_feedbackData[idx].updatedAt = new Date().toISOString();
    window.rbi_feedbackData[idx].sync_status = 'not_synced';
    window.rbi_feedbackData[idx].syncStatus = 'not_synced';
    window.rbi_feedbackData[idx].source = 'local';

    await _storage().put(_storage().stores().FEEDBACK_LIST, window.rbi_feedbackData[idx]);
    localStorage.setItem('rbi_cloud_dirty', '1');
    _triggerSync('silent');

    if (btnEl && btnEl.tagName === 'BUTTON') {
        const originalText = btnEl.innerHTML;
        btnEl.innerHTML = '✓';
        btnEl.classList.replace('bg-emerald-600', 'bg-green-500');
        setTimeout(() => {
            btnEl.innerHTML = originalText;
            btnEl.classList.replace('bg-green-500', 'bg-emerald-600');
        }, 2000);
    }
    if (!options.silent) showToast('✅ Ответ сохранён');

    _unlockFeedbackRerenderSoon(options.fromBlur ? 900 : 2000);
}

function rbi_exportFeedbackJson() {
    const dataStr = JSON.stringify(window.rbi_feedbackData.filter(f => !f._deleted), null, 4);
    downloadFile(dataStr, `RBI_Feedback_${new Date().toLocaleDateString('ru-RU')}.json`, 'application/json');
    showToast("JSON выгружен");
}

async function rbi_addRoadmapItem() {
    const inputEl = document.getElementById('dev-roadmap-input');
    const text = inputEl.value.trim();
    if (!text) return showToast("⚠️ Введите текст плана!");

    const rb = {
        id: window.RbiIds.newId(),
        text: text,
        normalized_text: text,
        author: 'Разработчик',
        owner: 'Разработчик',
        status: 'roadmap',
        is_roadmap: true,
        likes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _deleted: false
    };

    window.rbi_feedbackData.unshift(rb);
    await _storage().put(_storage().stores().FEEDBACK_LIST, rb);
    localStorage.setItem('rbi_cloud_dirty', '1');
    _triggerSync('silent');

    inputEl.value = '';
    showToast("✅ План опубликован для команды!");
    rbi_renderDevFeedbackTab();
    if (typeof rbi_renderFeedbackTab === 'function') rbi_renderFeedbackTab();
}

async function rbi_deleteRoadmapItem(id) {
    if (!confirm("Удалить этот пункт из планов?")) return;
    const idx = window.rbi_feedbackData.findIndex(f => f.id === id);
    if (idx > -1) {
        window.rbi_feedbackData[idx]._deleted = true;
        window.rbi_feedbackData[idx].is_deleted = true;
        window.rbi_feedbackData[idx].source = 'local';
        window.rbi_feedbackData[idx].syncStatus = 'not_synced';
        window.rbi_feedbackData[idx].sync_status = 'not_synced';
        window.rbi_feedbackData[idx].updatedAt = new Date().toISOString();
        window.rbi_feedbackData[idx].updated_at = window.rbi_feedbackData[idx].updatedAt;

        await _storage().put(_storage().stores().FEEDBACK_LIST, window.rbi_feedbackData[idx]);
        window.rbi_feedbackData.splice(idx, 1);
        localStorage.setItem('rbi_cloud_dirty', '1');
        _triggerSync('silent');
        rbi_renderDevFeedbackTab();
    }
}

// Guards сразу при загрузке модуля — до первого синка
_ensureFeedbackUiGuards();

// --- Именной экспорт ---
const FeedbackModule = { id: 'feedback', bindCtx };
window.FeedbackShared = { bindCtx };
export {
    FeedbackModule,
    bindCtx,
    rbi_renderFeedbackTab,
    rbi_submitFeedback,
    rbi_sendIdeaFromPlaceholder,
    rbi_toggleFeedbackLike,
    rbi_deleteFeedback,
    rbi_editFeedback,
    rbi_saveEditedFeedback,
    rbi_renderDevFeedbackTab,
    rbi_updateFeedbackStatus,
    rbi_updateFeedbackNotes,
    rbi_exportFeedbackJson,
    rbi_addRoadmapItem,
    rbi_deleteRoadmapItem
};
