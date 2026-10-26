/**
 * Platform entry wrapper раздела «Компания» (P2-0013): подраздел Настроек «Компания» и старый адрес #/company регистрирует обёртка;
 * бандл js/dist/company/company.js (React, ≈1 МБ) скачивается динамически — только у кого есть право управлять компанией
 * (RBI.platformMenuAccess.company — ответ сервера через вход платформы). Исходники — src/platform/company/**.
 * P2-0038: «Компания» видна и тем, кто ведёт объекты/единицы (planfact.projects.manage / planfact.units.manage — ответ
 * сервера pf_my_company_access, тот же, что раньше открывал эти справочники в План/Факте); событие rbi:company-access.
 */
export { CompanyManifest } from './company.manifest.js';

var bundle = null;
var loaded = null;

var dirsAllowed = false;
var dirsSeq = 0;

function allowed() {
    var a = (window.RBI && window.RBI.platformMenuAccess) || {};
    return a.company === true || dirsAllowed;
}

/** Право вести объекты/единицы хотя бы в одной компании — спрашиваем сервер после каждого изменения входа/компании. */
function refreshDirs() {
    var seq = ++dirsSeq;
    var a = (window.RBI && window.RBI.platformMenuAccess) || {};
    var p2 = window.RBI && window.RBI.platform2;
    var st = p2 && typeof p2.getState === 'function' ? p2.getState() : null;
    var set = function (v) {
        if (seq !== dirsSeq) return;
        var was = dirsAllowed;
        dirsAllowed = v;
        if (was !== v) {
            if (!allowed()) unmount();
            try { window.dispatchEvent(new Event('rbi:company-access')); } catch (_) { /* ignore */ }
        }
    };
    if (!a.planfact || !st || st.mode !== 'email' || typeof p2.rpc !== 'function') { set(false); return; }
    p2.rpc('pf_my_company_access', {}).then(function (res) {
        var rows = res && Array.isArray(res.data) ? res.data : [];
        set(rows.some(function (r) { return r.can_manage_projects === true || r.can_manage_units === true; }));
    }, function () { set(false); });
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
    rbi.platformPanels = Object.assign(rbi.platformPanels || {}, { company: { mount: mount, unmount: unmount, allowed: allowed } });
    // Право пропало (выход, смена компании) — снять экран; право на объекты/единицы — перепросить.
    window.addEventListener('rbi:platform-access', function () { if (!allowed()) unmount(); refreshDirs(); });
    refreshDirs();
    var router = window.AppRouter;
    if (router && typeof router.addRoute === 'function') {
        router.addRoute('#/company', showView);
        if (String(location.hash || '').indexOf('#/company') === 0) showView();
    }
}
