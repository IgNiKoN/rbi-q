/* Файл: js/modules/settings/features/tutorial.js */
// Онбординг RBI Platform · Construction OS — адаптивный desk/mobile тур.
// Actions: window.startInteractiveTutorial / next|prev|skipChapter|stopTutorial
// (data-settings-action → window[action]).

let currentTutStep = 0;
let tutOverlay, tutHighlightBox, tutTooltip, tutText, tutStepNum, tutNextBtn, tutChapterEl;
let _tutShowTimer = null;
let _tutInnerTimer = null;
let _tutStopTimer = null;

let _ctx = null;
function bindCtx(ctx) { _ctx = ctx; }
window.TutorialShared = { bindCtx: bindCtx };

function _isDemoMode() {
    try {
        var svc = (_ctx && _ctx.appMode) || (window.RBI && window.RBI.services && window.RBI.services.appMode);
        return !!(svc && typeof svc.isDemo === 'function' && svc.isDemo());
    } catch (_) {
        return false;
    }
}

function isDesk() {
    return !!(window.matchMedia && window.matchMedia('(min-width: 1280px)').matches);
}

function isWideRail() {
    return !!(window.matchMedia && window.matchMedia('(min-width: 768px)').matches);
}

function isVisibleEl(el) {
    if (!el || !el.isConnected) return false;
    var st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
}

function go(hash) {
    if (window.AppRouter && typeof window.AppRouter.navigate === 'function') {
        window.AppRouter.navigate(hash);
        return;
    }
    var map = {
        '#/quality/audit': 'tab-audit',
        '#/quality/engineer': 'tab-engineer',
        '#/quality/analytics': 'tab-analytics',
        '#/quality/reference': 'tab-reference',
        '#/settings': 'tab-settings',
        '#/settings/my/profile': 'tab-settings'
    };
    var tab = map[hash];
    if (!tab && hash && hash.indexOf('#/settings') === 0) tab = 'tab-settings';
    if (tab && typeof window.switchTab === 'function') window.switchTab(tab);
    else if (hash) window.location.hash = hash;
}

/** P2-0038: подраздел «Настроек» по ключу панели (адреса двух зон — settings.routes.js). */
function goSettings(key) {
    var routes = window.SettingsRoutes;
    var path = routes && typeof routes.pathForKey === 'function' ? routes.pathForKey(key) : '#/settings';
    if (window.AppRouter && typeof window.AppRouter.navigate === 'function') window.AppRouter.navigate(path);
    else go(path);
}

function goSub(base, subId) {
    if (window.AppRouter && typeof window.AppRouter.navigateSub === 'function') {
        window.AppRouter.navigateSub(base, subId);
        return;
    }
    go(base);
}

function ensureQualityMode() {
    try {
        var mode = window.AppModeManager && window.AppModeManager.currentMode;
        if (mode && mode !== 'quality' && typeof window.changeAppMode === 'function') {
            window.changeAppMode('quality');
        }
    } catch (_) { /* ignore */ }
}

/** SVG-плейсхолдеры демо (те же, что в startDemoMode) — для re-seed без полного demo restart. */
function _demoPhotoGood() {
    return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='800' height='600' fill='%23f0fdf4'/><path d='M250 300 L350 400 L550 200' stroke='%2322c55e' stroke-width='40' stroke-linecap='round' stroke-linejoin='round' fill='none'/><text x='400' y='520' font-family='Arial' font-size='36' font-weight='bold' fill='%23166534' text-anchor='middle'>ЭТАЛОН (ВЕРНО)</text></svg>";
}
function _demoPhotoBad() {
    return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='800' height='600' fill='%23fef2f2'/><path d='M250 200 L550 400 M250 400 L550 200' stroke='%23ef4444' stroke-width='40' stroke-linecap='round' stroke-linejoin='round' fill='none'/><text x='400' y='520' font-family='Arial' font-size='36' font-weight='bold' fill='%23991b1b' text-anchor='middle'>БРАК (НАРУШЕНИЕ)</text></svg>";
}

/** Вернуть демо-статусы/фото 108(ok)+109(fail), если пропали после remount. */
function ensureDemoFilledSample() {
    if (!_isDemoMode()) return;
    try {
        var st = (window.AuditState && window.AuditState.state) || window.state || null;
        var details = (window.AuditState && window.AuditState.details) || window.details || null;
        if (!st) return;
        var needOk = st['108'] !== 'ok' && st[108] !== 'ok';
        var needFail = st['109'] !== 'fail' && st[109] !== 'fail';
        if (needOk) st['108'] = 'ok';
        if (needFail) st['109'] = 'fail';
        if (details && (!details['109'] || !details['109'].comment)) {
            details['109'] = { causeCode: 'C01', comment: '[Нарушение технологии] Отклонение' };
        }
        var photos = window.photos || (window.AuditState && window.AuditState.photos) || null;
        if (photos) {
            if (!photos['108'] && !photos[108]) photos['108'] = _demoPhotoGood();
            if (!photos['109'] && !photos[109]) photos['109'] = _demoPhotoBad();
        } else if (typeof window.setPhoto === 'function') {
            try { window.setPhoto('108', _demoPhotoGood()); } catch (_) { /* ignore */ }
            try { window.setPhoto('109', _demoPhotoBad()); } catch (_) { /* ignore */ }
        }
        // Session bridge (если есть)
        try {
            var sess = window.RBI && window.RBI.services && window.RBI.services.session;
            if (sess) {
                if (typeof sess.getState === 'function') {
                    var gs = sess.getState();
                    if (gs) { gs['108'] = 'ok'; gs['109'] = 'fail'; }
                }
                if (typeof sess.getDetails === 'function') {
                    var gd = sess.getDetails();
                    if (gd) gd['109'] = { causeCode: 'C01', comment: '[Нарушение технологии] Отклонение' };
                }
                if (typeof sess.setPhotoRaw === 'function') {
                    if (needOk || !(window.photos && (window.photos['108'] || window.photos[108]))) {
                        sess.setPhotoRaw('108', _demoPhotoGood());
                    }
                    if (needFail || !(window.photos && (window.photos['109'] || window.photos[109]))) {
                        sess.setPhotoRaw('109', _demoPhotoBad());
                    }
                }
            }
        } catch (_) { /* ignore */ }
    } catch (_) { /* ignore */ }
}

/** Раскрыть группу, в которой лежит карточка (defaultGroupsCollapsed / display:none). */
function revealChecklistCard(cardEl) {
    if (!cardEl) return;
    try {
        var parent = cardEl.parentElement;
        while (parent && parent.id !== 'audit-items') {
            if (parent.id && String(parent.id).indexOf('group_content_') === 0) {
                parent.style.display = 'block';
                var gIdx = String(parent.id).replace('group_content_', '');
                var title = document.getElementById('group-title-' + gIdx);
                if (title && title.innerText && title.innerText.indexOf('▶') === 0) {
                    title.innerText = title.innerText.replace(/^▶/, '▼');
                }
                break;
            }
            parent = parent.parentElement;
        }
        // ok-карточки могут быть свёрнуты autoCollapseOk
        var inner = cardEl.querySelector('.card-audit.card-collapsed');
        if (inner && typeof window.expandCard === 'function') {
            var idAttr = cardEl.id || '';
            var id = idAttr.replace(/^card_wrapper_/, '');
            if (id) {
                try { window.expandCard(id); } catch (_) { /* ignore */ }
            }
        }
    } catch (_) { /* ignore */ }
}

/** Карточка с наглядными демо-данными (fail 109 → ok 108 → любая filled). */
function filledChecklistCard() {
    var prefer = ['109', '108'];
    for (var p = 0; p < prefer.length; p++) {
        var el = document.getElementById('card_wrapper_' + prefer[p]);
        if (el) {
            revealChecklistCard(el);
            var r0 = el.getBoundingClientRect();
            if (isVisibleEl(el) || (r0.width > 2 && r0.height > 2)) return el;
            return el; // после reveal всё равно цель для scroll/highlight
        }
    }
    var cards = document.querySelectorAll('[id^="card_wrapper_"]');
    for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        var filled = c.querySelector('.bg-red-500, .bg-green-500, .bg-red-50, .bg-green-50, img, .indicator-ok, .indicator-2, .indicator-3');
        if (!filled) continue;
        revealChecklistCard(c);
        return c;
    }
    return null;
}

function firstChecklistCard() {
    var filled = filledChecklistCard();
    if (filled) return filled;
    var cards = document.querySelectorAll('[id^="card_wrapper_"]');
    for (var i = 0; i < cards.length; i++) {
        revealChecklistCard(cards[i]);
        if (isVisibleEl(cards[i])) return cards[i];
        var r = cards[i].getBoundingClientRect();
        if (r.width > 2 && r.height > 2) return cards[i];
    }
    return cards.length ? cards[0] : null;
}

/** После teardown #tab-audit DOM = welcome, но session (демо-state/фото) жива.
 *  Нельзя звать changeTemplate каждый раз — он resetSession и стирает демо.
 *  Soft-restore: показать чек-лист + render/updateUI. changeTemplate — только если ключа нет. */
function ensureTutorialChecklist() {
    ensureQualityMode();
    go('#/quality/audit');

    if (typeof window.ensureAuditMarkup === 'function') {
        try { window.ensureAuditMarkup(); } catch (_) { /* ignore */ }
    }
    if (typeof window.renderSelector === 'function') {
        try { window.renderSelector(); } catch (_) { /* ignore */ }
    }

    var key = '';
    try {
        key = String((window.AuditState && window.AuditState.currentTemplateKey) || window.currentTemplateKey || '').trim();
    } catch (_) { key = ''; }

    var groups = null;
    try {
        groups = (window.AuditState && window.AuditState.currentChecklist)
            || window.currentChecklist
            || null;
    } catch (_) { groups = null; }
    var hasGroups = Array.isArray(groups) && groups.length > 0;

    if (!key || key === 'HOME' || !hasGroups) {
        var pick = '';
        var sel = document.getElementById('checklist-selector') || document.getElementById('fake-checklist-selector');
        if (sel && sel.options) {
            for (var i = 0; i < sel.options.length; i++) {
                if (String(sel.options[i].value || '') === 'sys_nvf_facade') {
                    pick = 'sys_nvf_facade';
                    break;
                }
            }
            if (!pick) {
                for (var j = 0; j < sel.options.length; j++) {
                    var opt = sel.options[j];
                    var v = String(opt && opt.value || '').trim();
                    if (!v || v === 'HOME' || opt.disabled) continue;
                    pick = v;
                    break;
                }
            }
        }
        key = pick || 'sys_nvf_facade';
        if (typeof window.changeTemplate === 'function') {
            try { window.changeTemplate(key); } catch (_) { /* ignore */ }
        }
        // После первого changeTemplate — сразу засеять демо-sample (если демо)
        ensureDemoFilledSample();
        try {
            if (typeof window.render === 'function') window.render();
            if (typeof window.updateUI === 'function') window.updateUI();
        } catch (_) { /* ignore */ }
        if (window.__auditDesktop && typeof window.__auditDesktop.sync === 'function') {
            try { window.__auditDesktop.sync(); } catch (_) { /* ignore */ }
        }
        filledChecklistCard();
        return key;
    }

    // Soft restore UI after remount — сохранить демо state/details/photos
    try {
        var sel2 = document.getElementById('checklist-selector');
        if (sel2) sel2.value = key;
        var fake = document.getElementById('fake-checklist-selector');
        if (fake) fake.value = key;
    } catch (_) { /* ignore */ }

    var emptyState = document.getElementById('empty-checklist-state');
    if (emptyState) emptyState.style.display = 'none';
    var auditItems = document.getElementById('audit-items');
    if (auditItems) auditItems.style.display = 'block';
    var auditActions = document.getElementById('audit-actions');
    if (auditActions) auditActions.style.display = 'grid';

    // Демо-поля шапки + sample 108/109 до render
    try {
        if (_isDemoMode()) {
            var setVal = function (id, val) {
                var el = document.getElementById(id);
                if (el) el.value = val;
            };
            setVal('inp-project', 'ЖК "Демонстрационный"');
            setVal('inp-inspector', 'Иванов И.И.');
            setVal('inp-contractor', 'ООО "Фасад-Мастер"');
            setVal('inp-section', 'Корпус 1, секция 2');
            ensureDemoFilledSample();
        }
    } catch (_) { /* ignore */ }

    try {
        if (typeof window.updateDataSummary === 'function') window.updateDataSummary();
        if (typeof window.render === 'function') window.render();
        if (typeof window.updateUI === 'function') window.updateUI();
    } catch (_) { /* ignore */ }

    // Desktop shell: checklist живёт в #audit-desktop-check — sync после remount
    try {
        if (window.__auditDesktop && typeof window.__auditDesktop.sync === 'function') {
            window.__auditDesktop.sync();
        }
    } catch (_) { /* ignore */ }

    // Раскрыть группу с заполненными пунктами (иначе highlight = пустая область)
    filledChecklistCard();

    return key;
}

function ensureConstructionMode() {
    try {
        if (typeof window.changeAppMode === 'function') window.changeAppMode('construction');
    } catch (_) { /* ignore */ }
}

function pickTarget(step) {
    var list = [];
    if (step.targets && step.targets.length) list = step.targets.slice();
    else if (step.targetId) list = ['#' + step.targetId];
    else if (step.targetSelector) list = [step.targetSelector];

    for (var i = 0; i < list.length; i++) {
        var sel = list[i];
        if (!sel) continue;
        var el = null;
        // Специальный маркер: заполненная демо-карточка, не пустой shell
        if (sel === '@filled-card' || sel === '@demo-card') {
            el = filledChecklistCard();
            if (el) return el;
            continue;
        }
        try {
            el = document.querySelector(sel);
        } catch (_) {
            el = null;
        }
        // card_wrapper_* может быть в свёрнутой группе — раскрыть и проверить снова
        if (el && el.id && String(el.id).indexOf('card_wrapper_') === 0) {
            revealChecklistCard(el);
        }
        if (isVisibleEl(el)) return el;
        // После reveal высота могла появиться без полного isVisible (opacity на предке)
        if (el && el.isConnected) {
            var r = el.getBoundingClientRect();
            if (r.width > 2 && r.height > 2) return el;
        }
    }
    return null;
}

function scrollTarget(el) {
    if (!el || typeof el.scrollIntoView !== 'function') return;
    try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth', inline: 'nearest' });
    } catch (_) {
        el.scrollIntoView(true);
    }
}

// ============================================================================
// Обучающие карточки в истории
// ============================================================================
window.rbiShowTutorialHistoryCard = function (mode) {
    mode = mode || 'history';
    ensureQualityMode();
    goSub('#/quality/analytics', 'sub-history');

    setTimeout(function () {
        if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') {
            window.RBI.events.emit('history:renderRequested', {});
        }
        if (typeof window.initCollapsiblePanel === 'function') {
            window.initCollapsiblePanel('hist-sticky-panel', 'hist-panel-body', 'hist-panel-header', 'hist-panel-toggle-icon');
        }

        var subHistory = document.getElementById('sub-history');
        var list = document.getElementById('history-list');
        var checksView = document.getElementById('history-checks-view');
        var emptyMsg = document.getElementById('hist-empty-msg');
        var host = list || checksView || subHistory;
        if (!host) return;

        document.querySelectorAll('.tutorial-history-card').forEach(function (el) { el.remove(); });
        if (emptyMsg) emptyMsg.style.display = 'none';

        var cards = {
            sync: {
                id: 'tutorial-history-sync-card',
                badge: 'офлайн → облако',
                title: 'Как данные попадают в историю',
                text: 'После сохранения осмотр сначала появляется на устройстве. Затем при наличии интернета, прав и успешной синхронизации он уходит в облако.',
                points: [
                    'Осмотр сохраняется локально (Offline-First)',
                    'Фото могут загружаться дольше текста',
                    'После sync данные видны другим по ролям'
                ],
                color: 'indigo'
            },
            history: {
                id: 'tutorial-history-list-card',
                badge: 'история проверок',
                title: 'Что смотреть в истории',
                text: 'История — не просто архив: объект, подрядчик, дефекты, фото и динамика качества.',
                points: [
                    'Проверяйте объект, подрядчика и локацию',
                    'Открывайте карточку проверки для деталей',
                    'Используйте для повторяемости, отчётов и разбора'
                ],
                color: 'blue'
            },
            day: {
                id: 'tutorial-history-day-card',
                badge: 'конец дня',
                title: 'Как правильно завершить рабочий день',
                text: 'Убедитесь: проверки сохранены, фото на месте, черновики не забыты, синхронизация выполнена.',
                points: [
                    'Проверьте сохранённые осмотры',
                    'Убедитесь, что фото открываются',
                    'Запустите синхронизацию перед закрытием дня'
                ],
                color: 'emerald'
            }
        };

        var card = cards[mode] || cards.history;
        var colorMap = {
            indigo: { bg: 'bg-indigo-50 dark:bg-indigo-900/30', text: 'text-indigo-600 dark:text-indigo-300', border: 'border-indigo-100 dark:border-indigo-800', solid: 'bg-indigo-600' },
            blue: { bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-300', border: 'border-blue-100 dark:border-blue-800', solid: 'bg-blue-600' },
            emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-300', border: 'border-emerald-100 dark:border-emerald-800', solid: 'bg-emerald-600' }
        };
        var c = colorMap[card.color] || colorMap.indigo;
        var pointsHtml = (card.points || []).map(function (p) {
            return '<div class="flex items-start gap-2"><div class="w-1.5 h-1.5 rounded-full ' + c.solid + ' mt-1.5 shrink-0"></div><div>' + p + '</div></div>';
        }).join('');

        var wrap = document.createElement('div');
        wrap.id = card.id;
        wrap.className = 'tutorial-history-card mb-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[24px] shadow-sm overflow-hidden';
        wrap.innerHTML =
            '<div class="p-4 ' + c.bg + ' border-b ' + c.border + '">' +
            '<div class="text-[9px] font-black uppercase tracking-widest ' + c.text + ' mb-1">' + card.badge + '</div>' +
            '<div class="text-[14px] font-black text-slate-800 dark:text-white">' + card.title + '</div>' +
            '<div class="text-[11px] text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">' + card.text + '</div></div>' +
            '<div class="p-4 space-y-2 text-[11px] text-slate-600 dark:text-slate-300">' + pointsHtml + '</div>';

        if (list && list.firstChild) list.insertBefore(wrap, list.firstChild);
        else host.insertBefore(wrap, host.firstChild);

        setTimeout(function () { scrollTarget(wrap); }, 80);
    }, 280);
};

// ============================================================================
// Главы и шаги онбординга
// ============================================================================
var TUT_CHAPTERS = {
    platform: 'Платформа',
    shell: 'Оболочка',
    audit: 'Осмотр',
    engineer: 'Инженер',
    analytics: 'Аналитика',
    knowledge: 'База знаний',
    construction: 'Стройконтроль',
    settings: 'Настройки'
};

var NAV_AUDIT = [
    '#app-nav2 .app-nav2-item[data-path="#/quality/audit"]',
    '#main-bottom-nav .nav-item[data-path="#/quality/audit"]'
];
var NAV_ENG = [
    '#app-nav2 .app-nav2-item[data-path="#/quality/engineer"]',
    '#main-bottom-nav .nav-item[data-path="#/quality/engineer"]'
];
var NAV_ANA = [
    '#app-nav2 .app-nav2-item[data-path="#/quality/analytics"]',
    '#main-bottom-nav .nav-item[data-path="#/quality/analytics"]'
];
var NAV_REF = [
    '#app-nav2 .app-nav2-item[data-path="#/quality/reference"]',
    '#main-bottom-nav .nav-item[data-path="#/quality/reference"]'
];
var NAV_SETTINGS = [
    '#app-sidebar [data-sidebar-settings]',
    '#app-sidebar [data-path="#/settings"]',
    '#main-bottom-nav .nav-item[data-path="#/quality/settings"]',
    '#main-bottom-nav .nav-item[data-path="#/settings"]'
];

var tutorialSteps = [
    {
        chapter: 'platform',
        title: '1. RBI Platform',
        text: 'RBI Platform — Construction OS: операционная система управления строительством. На едином ядре живут продукты: RBI Quality (качество) и RBI Construction Control (стройконтроль). Это не второй журнал замечаний, а контур данных, рисков и решений.',
        deskText: 'На ПК слева — rail модулей, рядом nav2 экранов продукта, сверху desk-topbar. Сейчас пройдём весь контур с пояснениями.',
        targets: ['#app-sidebar', '#empty-checklist-state', '#audit-desktop-shell', '#tab-audit'],
        action: function () {
            ensureQualityMode();
            go('#/quality/audit');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    },
    {
        chapter: 'platform',
        title: '2. Обучение в демо',
        text: 'Тур включает демо-режим: можно нажимать кнопки и изучать модули без изменения рабочих данных. Выйти из демо можно кнопкой «Выйти из демо».',
        targets: ['#fab-exit-demo', '.app-nav2-label-row', '#app-nav2'],
        action: function () {
            if (!_isDemoMode() && typeof window.startDemoMode === 'function') window.startDemoMode(true);
        }
    },
    {
        chapter: 'platform',
        title: '3. Роли и доступ',
        text: 'Данные видны по роли и закреплениям объектов: гость, подрядчик, инженер, РП, заместитель, директор, администратор. Один и тот же осмотр по-разному доступен разным людям — это нормально.',
        targets: NAV_SETTINGS.concat(['#settings-subnav', '#empty-checklist-state']),
        action: function () {
            ensureQualityMode();
            goSettings('my-profile');
        }
    },
    {
        chapter: 'shell',
        title: '4. Модули платформы',
        text: 'В боковой панели переключаются бизнес-модули: Качество и Стройконтроль (и тестовый СК v2). Модуль меняет весь контур экранов и прав.',
        deskText: 'Icon-rail слева — «приложения» Construction OS. Сейчас активен Quality.',
        targets: ['#app-sidebar [data-sidebar-module-id="quality"]', '#app-sidebar'],
        action: function () {
            ensureQualityMode();
            go('#/quality/audit');
        }
    },
    {
        chapter: 'shell',
        title: '5. Экраны модуля',
        text: 'Внутри Quality: Осмотр, Инженер, Аналитика, База знаний. На телефоне — нижнее меню; на широком ПК — вертикальный nav2.',
        targets: NAV_AUDIT.concat(['#app-nav2', '#main-bottom-nav']),
        action: function () {
            ensureQualityMode();
            go('#/quality/audit');
        }
    },
    {
        chapter: 'shell',
        title: '6. Шапка и контекст',
        text: 'В шапке — бренд, индикаторы sync/режима и контекст текущего экрана. На ПК desk-topbar дублирует заголовок модуля и быстрые действия.',
        targets: ['#app-desk-topbar', '#main-header', '.audit-desk-topbar-strip', '#header-brand-icon'],
        action: function () {
            ensureQualityMode();
            go('#/quality/audit');
        }
    },
    {
        chapter: 'shell',
        title: '7. Где настройки',
        text: 'Настройки платформы: на ПК — кнопка внизу rail; на телефоне — пункт меню. Две зоны: «Моё» (профиль, интерфейс, устройство, уведомления, Качество, помощь) и «Администрирование» (Компания, Модули, Платформа — по правам).',
        targets: NAV_SETTINGS,
        action: function () {
            goSettings('my-profile');
        }
    },
    {
        chapter: 'audit',
        title: '8. Осмотр',
        text: 'Осмотр — фактическая проверка по чек-листу. От выбора объекта, подрядчика и статусов зависят УрК, задачи, отчёты и аналитика.',
        deskText: 'Desktop-shell Осмотра: данные и чек-лист, зона работы и план при наличии.',
        // Сначала заполненная демо-карточка (не пустой shell)
        targets: ['@filled-card', '#card_wrapper_109', '#audit-items', '#audit-desktop-check', '#checklist-container', '#tab-audit'].concat(NAV_AUDIT),
        waitMs: 1100,
        action: function () {
            ensureTutorialChecklist();
            setTimeout(function () {
                var card = filledChecklistCard();
                if (card) scrollTarget(card);
            }, 350);
        }
    },
    {
        chapter: 'audit',
        title: '9. Выбор чек-листа',
        text: 'Начните с выбора или продолжения чек-листа. Системные и корпоративные шаблоны живут в Базе знаний; здесь вы применяете их на объекте. Переключатель — в шапке Осмотра.',
        targets: ['#checklist-selector', '#header-checklist-container', '[data-audit-desk-slot-checklist]', '#start-checklist-wrap'],
        waitMs: 1000,
        action: function () {
            ensureTutorialChecklist();
            setTimeout(function () {
                var wrap = document.getElementById('header-checklist-container')
                    || document.querySelector('[data-audit-desk-slot-checklist]')
                    || document.getElementById('start-checklist-wrap');
                if (wrap) scrollTarget(wrap);
            }, 250);
        }
    },
    {
        chapter: 'audit',
        title: '10. Данные проверки',
        text: 'Заполните объект, подрядчика и локацию. Эти поля связывают осмотр с ролями, рейтингом подрядчика, ПК СК и аналитикой.',
        targets: ['#inp-project', '#inp-contractor', '[data-audit-desk-slot-data]', '#data-block-content', '#header-data-block'],
        waitMs: 1000,
        action: function () {
            ensureTutorialChecklist();
            setTimeout(function () {
                if (typeof window.toggleDataBlock === 'function') {
                    try { window.toggleDataBlock(true); } catch (_) { /* ignore */ }
                }
                var f = document.getElementById('inp-project') || document.getElementById('inp-contractor');
                if (f) scrollTarget(f);
            }, 200);
        }
    },
    {
        chapter: 'audit',
        title: '11. Мини-дашборд',
        text: 'В шапке видно качество текущего осмотра и накопленную надёжность подрядчика — быстрый индикатор риска на площадке.',
        targets: ['#header-dashboard', '[data-audit-desk-slot-dash]', '#dash-expanded-view', '#audit-desktop-metrics'],
        waitMs: 1000,
        action: function () {
            ensureTutorialChecklist();
            var icon = document.getElementById('dash-expand-icon');
            var exp = document.getElementById('dash-expanded-view');
            if (icon && exp && exp.classList.contains('hidden')) icon.click();
        }
    },
    {
        chapter: 'audit',
        title: '12. Статусы пунктов',
        text: '«Соответствует» — реально проверено и ок. «Не соответствует» — есть дефект. «Не проверялось» — нельзя проверить сейчас. «Не применимо» — пункт не относится к зоне.',
        targets: ['@filled-card', '#card_wrapper_109', '#card_wrapper_108'],
        waitMs: 1200,
        action: function () {
            ensureTutorialChecklist();
            setTimeout(function () {
                var card = filledChecklistCard();
                if (card) scrollTarget(card);
            }, 450);
        }
    },
    {
        chapter: 'audit',
        title: '13. B1 / B2 / B3',
        text: 'B1 — мелкая доработка, B2 — значимый технологический дефект, B3 — критический риск. B2/B3 сильно влияют на УрК, задачи и управленческие выводы.',
        // 109 = B2 fail с комментарием — наглядно вес B*
        targets: ['@filled-card', '#card_wrapper_109', '#card_wrapper_108'],
        waitMs: 1200,
        action: function () {
            ensureTutorialChecklist();
            setTimeout(function () {
                var card = filledChecklistCard();
                if (card) scrollTarget(card);
            }, 450);
        }
    },
    {
        chapter: 'audit',
        title: '14. Фото, комментарии, TWI',
        text: 'Хорошее замечание: место, суть, требуемое действие и фото. Если к пункту привязана TWI — покажите прорабу эталон и брак прямо из карточки.',
        targets: ['@filled-card', '#card_wrapper_109', '#card_wrapper_108'],
        waitMs: 1200,
        action: function () {
            ensureTutorialChecklist();
            setTimeout(function () {
                var card = filledChecklistCard();
                if (card) scrollTarget(card);
            }, 450);
        }
    },
    {
        chapter: 'audit',
        title: '15. Сохранение и Offline-First',
        text: 'Сначала данные пишутся на устройство, потом уходят в облако при сети и правах. Пока sync не завершён — не удаляйте данные приложения и дождитесь загрузки фото.',
        targets: ['#tutorial-history-sync-card', '#sub-history', '#history-list'],
        action: function () {
            if (typeof window.rbiShowTutorialHistoryCard === 'function') window.rbiShowTutorialHistoryCard('sync');
        }
    },
    {
        chapter: 'engineer',
        title: '16. Раздел Инженер',
        text: 'Профиль инженера: задачи, ачивки, совещания, Impact Score и FMEA. Это рабочий стол Quality Business Partner.',
        targets: NAV_ENG,
        action: function () {
            ensureQualityMode();
            go('#/quality/engineer');
        }
    },
    {
        chapter: 'engineer',
        title: '17. Задачи',
        text: 'Планировщик — карта рисков: где нужен аудит, TWI, FMEA, эталон, совещание или разбор ПК СК.',
        targets: ['#engineer-subtabs-block button[data-action-arg="eng-sub-tasks"]', '#eng-sub-tasks', '#eng-desk-tasks'],
        action: function () {
            ensureQualityMode();
            goSub('#/quality/engineer', 'eng-sub-tasks');
        }
    },
    {
        chapter: 'engineer',
        title: '18. Как читать задачу',
        text: 'Задача показывает риск, но решение принимает инженер: доступность зоны, готовность работ, безопасность и график.',
        targets: ['#eng-sub-tasks', '#eng-desk-tasks', '#engineer-subtabs-block button[data-action-arg="eng-sub-tasks"]'],
        action: function () { goSub('#/quality/engineer', 'eng-sub-tasks'); }
    },
    {
        chapter: 'engineer',
        title: '19. Ачивки и геймификация',
        text: 'Бейджи и XP отмечают полезное поведение: закрытие рисков, обучение подрядчика, качество данных — не охоту за числом замечаний.',
        targets: ['#engineer-subtabs-block button[data-action-arg="eng-sub-badges"]', '#eng-sub-badges'],
        action: function () { goSub('#/quality/engineer', 'eng-sub-badges'); }
    },
    {
        chapter: 'engineer',
        title: '20. Совещания',
        text: 'Совещание должно заканчиваться решениями: ответственный, срок, повторный контроль, TWI, FMEA или эталон.',
        targets: ['#engineer-subtabs-block button[data-action-arg="eng-sub-meetings"]', '#eng-sub-meetings'],
        action: function () { goSub('#/quality/engineer', 'eng-sub-meetings'); }
    },
    {
        chapter: 'engineer',
        title: '21. Impact Score',
        text: 'Эффективность инженера — влияние на снижение повторяемости и улучшение процесса, а не число найденных дефектов.',
        targets: ['#engineer-subtabs-block button[data-action-arg="eng-sub-impact"]', '#eng-sub-impact'],
        action: function () { goSub('#/quality/engineer', 'eng-sub-impact'); }
    },
    {
        chapter: 'engineer',
        title: '22. FMEA',
        text: 'FMEA — когда дефект повторяется или риск критичен. Результат: действия (TWI, чек-лист, эталон, обучение), а не только таблица.',
        targets: ['#engineer-subtabs-block button[data-action-arg="eng-sub-fmea"]', '#eng-sub-fmea'],
        action: function () { goSub('#/quality/engineer', 'eng-sub-fmea'); }
    },
    {
        chapter: 'analytics',
        title: '23. Аналитика',
        text: 'Аналитика превращает проверки в управленческие выводы: УрК, ИУрК, ИКО, стабильность, повторяемость и зоны риска.',
        targets: NAV_ANA,
        action: function () {
            ensureQualityMode();
            goSub('#/quality/analytics', 'sub-contractors');
        }
    },
    {
        chapter: 'analytics',
        title: '24. Подрядчики и зоны',
        text: 'Цвет подрядчика — сигнал риска. Красная зона требует действий: усиленный контроль, TWI, FMEA, эталон или совещание.',
        targets: ['#analytics-subtabs-block button[data-action-arg="sub-contractors"]', '#sub-contractors', '#contractors-list'],
        action: function () { goSub('#/quality/analytics', 'sub-contractors'); }
    },
    {
        chapter: 'analytics',
        title: '25. One-Pager',
        text: 'One-Pager — короткий управленческий отчёт: риски, подрядчики, дефекты, метрики и действия.',
        deskText: 'На ПК One-Pager часто в desktop-layout с расширенными блоками и экспортом.',
        targets: ['#analytics-subtabs-block button[data-action-arg="sub-onepager"]', '#sub-onepager', '#onepager-content-container'],
        action: function () { goSub('#/quality/analytics', 'sub-onepager'); }
    },
    {
        chapter: 'analytics',
        title: '26. График СМР',
        text: 'График помогает планировать контроль: старт работ, ППР, инструктаж, финал и зоны будущего риска.',
        targets: ['#analytics-subtabs-block button[data-action-arg="sub-schedule"]', '#sub-schedule'],
        action: function () { goSub('#/quality/analytics', 'sub-schedule'); }
    },
    {
        chapter: 'analytics',
        title: '27. ПК СК в аналитике',
        text: 'RBI не заменяет ПК Стройконтроль. Здесь данные ПК СК идут в анализ: просрочки, CMI, ИСД, формальные закрытия и расхождения.',
        targets: ['#analytics-subtabs-block button[data-action-arg="sub-sk"]', '#sub-sk'],
        action: function () { goSub('#/quality/analytics', 'sub-sk'); }
    },
    {
        chapter: 'analytics',
        title: '28. История проверок',
        text: 'История — вход в детали осмотра, фото и УрК. Используйте фильтры и карточки для повторяемости и разбора.',
        targets: ['#tutorial-history-list-card', '#sub-history', '#history-list'],
        action: function () {
            if (typeof window.rbiShowTutorialHistoryCard === 'function') window.rbiShowTutorialHistoryCard('history');
        }
    },
    {
        chapter: 'analytics',
        title: '29. Завершение дня',
        text: 'В конце смены: осмотры сохранены, фото открываются, черновики закрыты, sync выполнен, критичные дефекты ушли в отчёт или задачу.',
        targets: ['#tutorial-history-day-card', '#sub-history'],
        action: function () {
            if (typeof window.rbiShowTutorialHistoryCard === 'function') window.rbiShowTutorialHistoryCard('day');
        }
    },
    {
        chapter: 'analytics',
        title: '30. Отчёты и выгрузка',
        text: 'FAB «Скачать» / меню экспорта — PDF, Excel и презентации для совещаний. Отчёт фиксирует факты, фото, риски и решения.',
        targets: ['#fab-download-btn', '#app-desk-topbar'].concat(NAV_ANA),
        action: function () {
            goSub('#/quality/analytics', 'sub-onepager');
            if (typeof window.closeFabExportMenu === 'function') window.closeFabExportMenu();
            var fab = document.getElementById('fab-download-btn');
            if (fab) {
                fab.style.display = 'flex';
                fab.classList.add('fab-visible');
            }
        }
    },
    {
        chapter: 'knowledge',
        title: '31. База знаний',
        text: 'Справочник инженера: чек-листы, НД, TWI, узлы, практики и эталоны. Знания привязываются к пунктам осмотра и задачам.',
        deskText: 'На ПК — desktop-shell БЗ с rail разделов и сценой контента.',
        targets: NAV_REF,
        action: function () {
            ensureQualityMode();
            goSub('#/quality/reference', 'ref-sub-checklists');
        }
    },
    {
        chapter: 'knowledge',
        title: '32. Чек-листы',
        text: 'Здесь живут шаблоны осмотров. Системные и корпоративные чек-листы — основа стандартизации контроля.',
        targets: ['#reference-subtabs-block button[data-action-arg="ref-sub-checklists"]', '#ref-sub-checklists'],
        action: function () { goSub('#/quality/reference', 'ref-sub-checklists'); }
    },
    {
        chapter: 'knowledge',
        title: '33. Документы (НД)',
        text: 'ГОСТ, СП и проектная документация с поиском — чтобы обосновать требование и снизить споры с подрядчиком.',
        targets: ['#reference-subtabs-block button[data-action-arg="ref-sub-docs"]', '#ref-sub-docs'],
        action: function () { goSub('#/quality/reference', 'ref-sub-docs'); }
    },
    {
        chapter: 'knowledge',
        title: '34. TWI',
        text: 'TWI — короткая инструкция на рабочем месте: правильный пример, брак и методика проверки.',
        targets: ['#reference-subtabs-block button[data-action-arg="ref-sub-twi"]', '#ref-sub-twi'],
        action: function () { goSub('#/quality/reference', 'ref-sub-twi'); }
    },
    {
        chapter: 'knowledge',
        title: '35. Узлы',
        text: 'Технические узлы со спецификациями — эталон сборки/примыканий. Связывайте с чек-листами и TWI.',
        targets: ['#reference-subtabs-block button[data-action-arg="ref-sub-nodes"]', '#ref-sub-nodes'],
        action: function () { goSub('#/quality/reference', 'ref-sub-nodes'); }
    },
    {
        chapter: 'knowledge',
        title: '36. Практики, эталоны, FAQ',
        text: 'Практики сохраняют рабочие решения; эталоны — образцы «как надо». FAQ / ИИ-помощник — по приложению и методологии.',
        targets: ['#reference-subtabs-block button[data-action-arg="ref-sub-practices"]', '#ref-sub-practices'],
        action: function () { goSub('#/quality/reference', 'ref-sub-practices'); }
    },
    {
        chapter: 'construction',
        title: '37. Модуль Стройконтроль',
        text: 'RBI Construction Control — отдельный продукт на том же ядре: планы, дефекты, приёмка, иерархия объекта. Переключается в rail рядом с Quality.',
        targets: ['#app-sidebar [data-sidebar-module-id="construction"]', '#app-sidebar'],
        action: function () { ensureConstructionMode(); }
    },
    {
        chapter: 'construction',
        title: '38. Контур СК',
        text: 'Типичный контур: объект → корпус → этаж, PDF-планы, дефекты с координатами, заявки на приёмку, зоны на плане.',
        targets: ['#app-nav2', '#app-sidebar', 'body'],
        action: function () { ensureConstructionMode(); }
    },
    {
        chapter: 'construction',
        title: '39. Quality ↔ СК',
        text: 'Quality анализирует риски и качество; СК ведёт операционный контур замечаний/приёмки. Внешний ПК СК RBI не заменяет — дополняет данными и аналитикой.',
        targets: ['#app-sidebar [data-sidebar-module-id="quality"]', '#app-sidebar [data-sidebar-module-id="construction"]', '#app-sidebar'],
        action: function () { /* rail visible */ }
    },
    {
        chapter: 'construction',
        title: '40. Возврат в Quality',
        text: 'Вернитесь в модуль Качество — дальше настройки платформы и финал онбординга.',
        targets: ['#app-sidebar [data-sidebar-module-id="quality"]'].concat(NAV_AUDIT),
        action: function () {
            ensureQualityMode();
            go('#/quality/audit');
        }
    },
    {
        chapter: 'settings',
        title: '41. Настройки платформы',
        text: '«Моё» — личные настройки (профиль, интерфейс, устройство и данные, уведомления, Качество, помощь); «Администрирование» — Компания, Модули, Платформа (видно по правам).',
        targets: ['#settings-subnav', '#settings-panel-my-profile'].concat(NAV_SETTINGS),
        action: function () {
            ensureQualityMode();
            goSettings('my-profile');
        }
    },
    {
        chapter: 'settings',
        title: '42. Синхронизация и офлайн-кэш',
        text: 'Подключение команды, права push/pull, автокэш облачных файлов и очистка хранилища — основа Offline-First на объектах без сети.',
        targets: ['#sync-settings-block', '#settings-panel-my-device'],
        action: function () {
            goSettings('my-device');
            var det = document.querySelector('#settings-panel-my-device details');
            if (det && !det.open) det.open = true;
        }
    },
    {
        chapter: 'settings',
        title: '43. Интерфейс',
        text: 'Тема, шрифт, навигация, автосворачивание фильтров (ручное/авто), анимации и жесты — подстройте под телефон или ПК.',
        targets: ['#set-theme', '#set-auto-collapse-filters', '#settings-panel-my-interface'],
        action: function () {
            goSettings('my-interface');
            var theme = document.getElementById('set-theme');
            if (theme) scrollTarget(theme);
        }
    },
    {
        chapter: 'settings',
        title: '44. Финал',
        text: 'Главная логика: инженер качества как Business Quality Partner — видеть риски, предотвращать дефекты и улучшать процесс. Construction OS даёт общий каркас данных и модулей. Тур можно пройти снова из Настроек или пустого Осмотра.',
        deskText: 'На ПК запуск — из блока «Онбординг платформы» в Настройках.',
        targets: NAV_AUDIT.concat(['#audit-desktop-shell', '#audit-desktop-check', '#tab-audit']),
        waitMs: 900,
        action: function () {
            ensureTutorialChecklist();
        },
        isEnd: true
    }
];

// ============================================================================
// Движок
// ============================================================================
function cacheTutDom() {
    tutOverlay = document.getElementById('tutorial-overlay');
    tutHighlightBox = document.getElementById('tut-highlight-box');
    tutTooltip = document.getElementById('tutorial-tooltip');
    tutText = document.getElementById('tut-text');
    tutStepNum = document.getElementById('tut-step');
    tutNextBtn = document.getElementById('tut-next-btn');
    tutChapterEl = document.getElementById('tut-chapter');
}

function placeHighlight(target) {
    if (!tutHighlightBox) return;
    if (!target) {
        tutHighlightBox.style.opacity = '0';
        return;
    }
    var rect = target.getBoundingClientRect();
    tutHighlightBox.style.position = 'fixed';
    tutHighlightBox.style.top = (rect.top - 4) + 'px';
    tutHighlightBox.style.left = (rect.left - 4) + 'px';
    tutHighlightBox.style.width = (rect.width + 8) + 'px';
    tutHighlightBox.style.height = (rect.height + 8) + 'px';
    tutHighlightBox.style.opacity = '1';
}

function placeTooltip(target) {
    if (!tutTooltip) return;
    var screenH = window.innerHeight || 800;
    var desk = isDesk();
    var rail = isWideRail();

    tutTooltip.style.maxWidth = desk ? '420px' : '280px';
    tutTooltip.style.top = 'auto';
    tutTooltip.style.bottom = 'auto';

    if (rail) {
        tutTooltip.style.left = desk ? '108px' : '96px';
        tutTooltip.style.right = '16px';
        tutTooltip.style.marginLeft = 'auto';
        tutTooltip.style.marginRight = 'auto';
    }

    if (target) {
        var tr = target.getBoundingClientRect();
        var center = tr.top + tr.height / 2;
        if (center < screenH / 2) tutTooltip.style.bottom = desk ? '32px' : '60px';
        else tutTooltip.style.top = desk ? '88px' : '90px';
    } else {
        tutTooltip.style.top = '38%';
    }
}

function showDemoExitFab() {
    if (window.RBI && window.RBI.shellDesktop && typeof window.RBI.shellDesktop.syncDemoExitPlacement === 'function') {
        window.RBI.shellDesktop.syncDemoExitPlacement();
        return;
    }
    var fabExit = document.getElementById('fab-exit-demo');
    if (!fabExit) return;
    fabExit.classList.remove('hidden');
    fabExit.style.display = 'flex';
    fabExit.style.pointerEvents = 'auto';
    fabExit.style.visibility = 'visible';
    fabExit.style.opacity = '1';
    fabExit.setAttribute('aria-hidden', 'false');
}

function hideTutorialChrome() {
    if (_tutShowTimer) { clearTimeout(_tutShowTimer); _tutShowTimer = null; }
    if (_tutInnerTimer) { clearTimeout(_tutInnerTimer); _tutInnerTimer = null; }
    if (_tutStopTimer) { clearTimeout(_tutStopTimer); _tutStopTimer = null; }

    var ov = document.getElementById('tutorial-overlay');
    var tip = document.getElementById('tutorial-tooltip');
    var hl = document.getElementById('tut-highlight-box');

    if (hl) {
        hl.style.opacity = '0';
        hl.style.width = '0';
        hl.style.height = '0';
        hl.style.top = '-9999px';
        hl.style.left = '-9999px';
    }
    if (tip) {
        tip.classList.remove('tut-active');
        tip.classList.add('hidden');
        tip.style.display = 'none';
        tip.style.visibility = 'hidden';
        tip.style.opacity = '0';
        tip.style.pointerEvents = 'none';
    }
    if (ov) {
        ov.classList.add('hidden');
        ov.style.display = 'none';
        ov.style.pointerEvents = 'none';
    }
    tutOverlay = ov;
    tutTooltip = tip;
    tutHighlightBox = hl;
}

function openTutorialChrome() {
    cacheTutDom();
    if (tutOverlay) {
        tutOverlay.classList.remove('hidden');
        tutOverlay.style.display = '';
        tutOverlay.style.pointerEvents = 'auto';
    }
    if (tutTooltip) {
        tutTooltip.classList.remove('hidden');
        tutTooltip.style.display = '';
        tutTooltip.style.pointerEvents = '';
        tutTooltip.style.visibility = '';
        tutTooltip.style.opacity = '';
    }
}

function startInteractiveTutorial() {
    try {
        if (!_isDemoMode() && typeof window.startDemoMode === 'function') {
            window.startDemoMode(true);
        }
    } catch (e) {
        console.warn('[Tutorial] demo start', e);
    }
    // silent demo не показывает FAB — на ПК кнопка нужна сразу
    showDemoExitFab();

    setTimeout(function () {
        currentTutStep = 0;
        openTutorialChrome();
        if (!tutOverlay || !tutTooltip) {
            console.warn('[Tutorial] markup missing');
            return;
        }
        var total = document.getElementById('tut-total');
        if (total) total.innerText = String(tutorialSteps.length);
        showTutorialStep();
    }, 480);
}
window.startInteractiveTutorial = startInteractiveTutorial;

function showTutorialStep() {
    var step = tutorialSteps[currentTutStep];
    if (!step) return stopTutorial();
    cacheTutDom();
    if (_tutShowTimer) {
        clearTimeout(_tutShowTimer);
        _tutShowTimer = null;
    }
    if (_tutInnerTimer) {
        clearTimeout(_tutInnerTimer);
        _tutInnerTimer = null;
    }

    try {
        if (typeof step.action === 'function') step.action();
    } catch (e) {
        console.warn('[Tutorial] action', e);
    }

    var delay = step.waitMs != null ? step.waitMs : (isDesk() ? 780 : 700);
    _tutShowTimer = setTimeout(function () {
        _tutShowTimer = null;
        var target = pickTarget(step);
        if (target) scrollTarget(target);

        _tutInnerTimer = setTimeout(function () {
            _tutInnerTimer = null;
            // Если тур уже остановлен — не реанимируем chrome
            var ov = document.getElementById('tutorial-overlay');
            if (!ov || ov.classList.contains('hidden') || ov.style.display === 'none') return;

            target = pickTarget(step) || target;
            placeHighlight(target);

            if (tutStepNum) tutStepNum.innerText = String(currentTutStep + 1);
            if (tutChapterEl) {
                var ch = TUT_CHAPTERS[step.chapter] || '';
                var keys = Object.keys(TUT_CHAPTERS);
                var idx = keys.indexOf(step.chapter);
                tutChapterEl.innerText = ch
                    ? ('Глава ' + (idx + 1) + '/' + keys.length + ' · ' + ch)
                    : 'Онбординг';
            }

            var body = (isDesk() && step.deskText) ? (step.text + ' ' + step.deskText) : step.text;
            if (tutText) {
                tutText.innerHTML =
                    '<strong class="block text-[14px] mb-2 text-indigo-700 dark:text-indigo-400">' + step.title + '</strong>' +
                    '<span class="text-slate-600 dark:text-slate-300 leading-relaxed font-medium">' + body + '</span>';
            }

            placeTooltip(target);

            if (tutNextBtn) {
                if (step.isEnd) {
                    tutNextBtn.innerText = 'Завершить';
                    tutNextBtn.className = 'bg-green-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md hover:bg-green-500 active:scale-95 transition-all';
                } else {
                    tutNextBtn.innerText = 'Далее';
                    tutNextBtn.className = 'bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md hover:bg-indigo-500 active:scale-95 transition-all';
                }
            }

            var prevBtn = document.getElementById('tut-prev-btn');
            if (prevBtn) prevBtn.classList.toggle('invisible', currentTutStep === 0);

            if (tutTooltip) {
                tutTooltip.classList.remove('hidden');
                tutTooltip.style.display = '';
                tutTooltip.style.pointerEvents = 'auto';
                tutTooltip.classList.add('tut-active');
            }
        }, 120);
    }, delay);
}

function nextTutorialStep() {
    var step = tutorialSteps[currentTutStep];
    if (tutTooltip) tutTooltip.classList.remove('tut-active');
    if (tutHighlightBox) tutHighlightBox.style.opacity = '0';
    setTimeout(function () {
        if (step && step.isEnd) stopTutorial();
        else {
            currentTutStep++;
            showTutorialStep();
        }
    }, 320);
}
window.nextTutorialStep = nextTutorialStep;

function prevTutorialStep() {
    if (currentTutStep <= 0) return;
    if (tutTooltip) tutTooltip.classList.remove('tut-active');
    if (tutHighlightBox) tutHighlightBox.style.opacity = '0';
    setTimeout(function () {
        currentTutStep--;
        showTutorialStep();
    }, 280);
}
window.prevTutorialStep = prevTutorialStep;

function skipTutorialChapter() {
    var step = tutorialSteps[currentTutStep];
    if (!step || step.isEnd) {
        stopTutorial();
        return;
    }
    var ch = step.chapter;
    var i = currentTutStep + 1;
    while (i < tutorialSteps.length && tutorialSteps[i].chapter === ch) i++;
    if (tutTooltip) tutTooltip.classList.remove('tut-active');
    if (tutHighlightBox) tutHighlightBox.style.opacity = '0';
    setTimeout(function () {
        if (i >= tutorialSteps.length) stopTutorial();
        else {
            currentTutStep = i;
            showTutorialStep();
        }
    }, 280);
}
window.skipTutorialChapter = skipTutorialChapter;

function stopTutorial() {
    hideTutorialChrome();

    var expView = document.getElementById('dash-expanded-view');
    if (expView && !expView.classList.contains('hidden')) expView.classList.add('hidden');

    var fab = document.getElementById('fab-download-btn');
    if (fab) {
        fab.classList.remove('fab-visible');
        setTimeout(function () { fab.style.display = 'none'; }, 300);
    }
    if (typeof window.closeTwiConstructor === 'function') {
        try { window.closeTwiConstructor(); } catch (_) { /* ignore */ }
    }
    document.querySelectorAll('.tutorial-history-card').forEach(function (el) { el.remove(); });

    ensureQualityMode();
    go('#/quality/audit');

    // Демо остаётся — кнопка выхода должна быть видна (особенно на ПК у rail)
    if (_isDemoMode() || document.body.classList.contains('demo-mode')) {
        showDemoExitFab();
    }

    if (typeof window.updateBodyPadding === 'function') window.updateBodyPadding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.stopTutorial = stopTutorial;

(function mountTutorialMarkup() {
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getModalsRoot()
        : document.getElementById('app-modals');
    if (!root) return;

    // Upgrade legacy markup (без глав / Назад / Пропуск главы)
    var existingTip = document.getElementById('tutorial-tooltip');
    var existingOv = document.getElementById('tutorial-overlay');
    if (existingTip && !document.getElementById('tut-chapter')) {
        existingTip.remove();
        if (existingOv) existingOv.remove();
    }
    if (document.getElementById('tutorial-overlay')) return;

    root.insertAdjacentHTML('beforeend',
        '<div id="tutorial-overlay" class="fixed inset-0 z-[9998] hidden pointer-events-auto overflow-hidden">' +
        '<div id="tut-highlight-box" class="fixed shadow-[0_0_0_9999px_rgba(15,23,42,0.85)] border-2 border-indigo-500 rounded-xl transition-all duration-500 ease-in-out pointer-events-none opacity-0"></div>' +
        '</div>' +
        '<div id="tutorial-tooltip" class="fixed z-[9999] bg-white dark:bg-slate-800 text-slate-800 dark:text-white p-5 rounded-2xl shadow-2xl max-w-[280px] w-[min(420px,92vw)] transition-all duration-500 ease-in-out transform scale-90 opacity-0 hidden border border-slate-200 dark:border-slate-700">' +
        '<div class="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1 flex justify-between items-center gap-2">' +
        '<span class="truncate">Онбординг (<span id="tut-step">1</span>/<span id="tut-total">44</span>)</span>' +
        '<button type="button" data-settings-action="stopTutorial" class="text-slate-400 hover:text-red-500 active:scale-90 text-lg leading-none shrink-0" aria-label="Закрыть">✕</button>' +
        '</div>' +
        '<div id="tut-chapter" class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Глава</div>' +
        '<div id="tut-text" class="text-[12px] font-bold leading-relaxed mb-5">Текст подсказки</div>' +
        '<div class="flex flex-wrap justify-between items-center gap-2 pt-2">' +
        '<div class="flex items-center gap-3">' +
        '<button type="button" id="tut-prev-btn" data-settings-action="prevTutorialStep" class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Назад</button>' +
        '<button type="button" data-settings-action="skipTutorialChapter" class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Глава ▸</button>' +
        '<button type="button" data-settings-action="stopTutorial" class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Стоп</button>' +
        '</div>' +
        '<button type="button" id="tut-next-btn" data-settings-action="nextTutorialStep" class="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md hover:bg-indigo-500 active:scale-95 transition-all">Далее</button>' +
        '</div></div>'
    );
}());
