/**
 * Platform entry wrapper модуля «План/Факт» (P2-0013): маршрут #/planfact держит обёртка, бандл
 * js/dist/planfact/planfact.js (React, ≈1,4 МБ) скачивается динамически — только когда модуль положен этому входу
 * (ShellService.isPlatformModuleAllowed: модуль компании ∩ права по ответу сервера; демо — разбор ВОР).
 * Не положен — экран «Модуль не подключён», файл модуля не запрашивается. Исходники — src/modules/planfact/**.
 */
import { PlanfactManifest } from './planfact.manifest.js';

var ROUTE = '#/planfact';
var VIEW_ID = 'tab-planfact';
var savedCtx = null;
var bundle = null;      // Promise<module> — один раз
var loaded = null;      // загруженный модуль

function shell() {
    return window.RBI && window.RBI.services && window.RBI.services.shell;
}

export function isAllowed() {
    var s = shell();
    return !!(s && typeof s.isPlatformModuleAllowed === 'function' && s.isPlatformModuleAllowed('planfact'));
}

function onRoute() {
    return String(location.hash || '').indexOf(ROUTE) === 0;
}

function loadBundle() {
    if (!bundle) {
        bundle = import('../../dist/planfact/planfact.js').then(function (m) {
            return Promise.resolve(m.init(Object.assign({}, savedCtx || {}, { nav: PlanfactManifest.nav, externalRoute: true }))).then(function () {
                loaded = m;
                return m;
            });
        }).catch(function (e) { bundle = null; throw e; });
    }
    return bundle;
}

function ensureView() {
    var el = document.getElementById(VIEW_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = VIEW_ID;
    el.className = 'view-section hidden';
    var anchor = document.getElementById('tab-mode-placeholder');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
    else document.body.appendChild(el);
    return el;
}

/** Модуль не положен: понятный экран вместо данных; бандл не скачивается. */
function showNotConnected() {
    if (loaded && typeof loaded.unmount === 'function') loaded.unmount();
    var el = ensureView();
    document.querySelectorAll('.view-section').forEach(function (n) { n.classList.remove('active'); });
    el.classList.add('active');
    el.classList.remove('hidden');
    var s = shell();
    var mode = s && typeof s.platformEntryMode === 'function' ? s.platformEntryMode() : 'none';
    var hint = mode === 'email'
        ? 'Модуль не включён для вашей компании или у вашей роли нет доступа. Обратитесь к администратору компании.'
        : mode === 'pin'
            ? 'Модуль работает со входом по почте и паролю. По старому входу (PIN) доступны «Качество» и «Стройконтроль».'
            : 'Войдите, чтобы открыть модуль.';
    el.innerHTML = '<div class="pf-root" data-testid="pf-not-connected" style="padding:24px 16px;max-width:560px;margin:0 auto">' +
        '<div style="border:1px solid var(--card-border);border-radius:16px;background:var(--card-bg);padding:20px;display:flex;flex-direction:column;gap:8px">' +
        '<div style="font-size:15px;font-weight:900;color:var(--text-main)">Модуль «План/Факт» не подключён</div>' +
        '<div style="font-size:13px;color:var(--text-muted);line-height:1.45">' + hint + '</div></div></div>';
}

function route() {
    if (!onRoute()) return;
    if (!(window.RBI && window.RBI.platform2)) return;   // вход платформы ещё не решил, кто вошёл — ждём rbi:platform-access
    if (!isAllowed()) { showNotConnected(); return; }
    loadBundle().then(function (m) { if (onRoute() && isAllowed()) m.showView(); }).catch(function (e) {
        console.error('[planfact] модуль не загрузился', e);
    });
}

/**
 * P2-0021: красные точки «Требует моего участия» в меню — сразу после входа, без загрузки бандла (решение владельца 24.10.2026).
 * Числа — pf_my_inbox (миграция 029) через общее соединение входа платформы (RBI.platform2.rpc); рисует оболочка (setNavBadges).
 * В точки — только «дела»: «Факт» = ждёт подтверждения + мои отклонённые; «КС-2» = черновики; «Входящие» и пункт модуля — сумма.
 * Перечитываются: при входе / выходе / смене компании (rbi:platform-access), при заходе в модуль (planfact:route), после своего
 * действия модуля (planfact:inbox-changed) и при возврате на вкладку браузера.
 */
var INBOX_CHANGED_EVENT = 'planfact:inbox-changed';
var MODULE_ROUTE_EVENT = 'planfact:route';
var inboxSeq = 0;

function pos(n) { n = Number(n); return isFinite(n) && n > 0 ? n : 0; }

export function inboxBadges(rows) {
    var fact = 0, ks2 = 0;
    (rows || []).forEach(function (r) { fact += pos(r.pending) + pos(r.my_rejected); ks2 += pos(r.ks2_drafts); });
    var total = fact + ks2;
    return { '#/planfact/fact': fact, '#/planfact/ks2': ks2, '#/planfact/inbox': total, 'module:planfact': total };
}

export function refreshInbox() {
    var s = shell();
    if (!s || typeof s.setNavBadges !== 'function') return Promise.resolve();
    var p2 = window.RBI && window.RBI.platform2;
    var st = p2 && typeof p2.getState === 'function' ? p2.getState() : null;
    var my = ++inboxSeq;
    if (!isAllowed() || !st || st.mode !== 'email' || typeof p2.rpc !== 'function') { s.setNavBadges('planfact', null); return Promise.resolve(); }
    return p2.rpc('pf_my_inbox', {}).then(function (r) {
        if (my !== inboxSeq || !r || r.error || !Array.isArray(r.data)) return;   // ошибка сети — прежние числа остаются
        s.setNavBadges('planfact', inboxBadges(r.data));
    }).catch(function () { /* прежние числа */ });
}

export function init(ctx) {
    savedCtx = ctx || null;
    var router = window.AppRouter;
    if (router && typeof router.addRoute === 'function') router.addRoute(ROUTE, route);
    // Вход / выход / смена компании: на адресе модуля — показать модуль или «не подключён».
    window.addEventListener('rbi:platform-access', function () {
        if (!onRoute()) return;
        var view = document.getElementById(VIEW_ID);
        if (!isAllowed() || !loaded || !loaded.isMounted() || !(view && view.classList.contains('active'))) route();
    });
    window.addEventListener('rbi:platform-access', function () { void refreshInbox(); });
    window.addEventListener(MODULE_ROUTE_EVENT, function () { void refreshInbox(); });
    window.addEventListener(INBOX_CHANGED_EVENT, function () { void refreshInbox(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') void refreshInbox(); });
    route();
    void refreshInbox();
}

export function mount(el) { return loadBundle().then(function (m) { m.mount(el); }); }
export function unmount() { if (loaded) loaded.unmount(); }
export function isMounted() { return !!(loaded && loaded.isMounted()); }
export { PlanfactManifest };
