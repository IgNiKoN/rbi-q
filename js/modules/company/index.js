/**
 * Platform entry wrapper раздела «Компания» (P2-0013): подраздел Настроек «Компания» и старый адрес #/company регистрирует обёртка;
 * бандл js/dist/company/company.js (React, ≈1 МБ) скачивается динамически — только у кого есть право управлять компанией
 * (RBI.platformMenuAccess.company — ответ сервера через вход платформы). Исходники — src/platform/company/**.
 */
export { CompanyManifest } from './company.manifest.js';

var bundle = null;
var loaded = null;

function allowed() {
    var a = (window.RBI && window.RBI.platformMenuAccess) || {};
    return a.company === true;
}

function loadBundle() {
    if (!bundle) {
        bundle = import('../../dist/company/company.js').then(function (m) { loaded = m; return m; })
            .catch(function (e) { bundle = null; throw e; });
    }
    return bundle;
}

export function mount(el) {
    if (!allowed()) return Promise.resolve();
    return loadBundle().then(function (m) { if (allowed() && el.isConnected) m.mount(el); });
}
export function unmount() { if (loaded) loaded.unmount(); }
export function isMounted() { return !!(loaded && loaded.isMounted()); }

/** Старый адрес #/company → подраздел Настроек «Компания» (решение владельца 21.10.2026). */
function showView() {
    var router = window.AppRouter;
    if (router && typeof router.navigate === 'function') router.navigate('#/settings/company', true);
}

export function init() {
    var rbi = (window.RBI = window.RBI || {});
    rbi.platformPanels = Object.assign(rbi.platformPanels || {}, { company: { mount: mount, unmount: unmount } });
    // Право пропало (выход, смена компании) — снять экран.
    window.addEventListener('rbi:platform-access', function () { if (!allowed()) unmount(); });
    var router = window.AppRouter;
    if (router && typeof router.addRoute === 'function') {
        router.addRoute('#/company', showView);
        if (String(location.hash || '').indexOf('#/company') === 0) showView();
    }
}
