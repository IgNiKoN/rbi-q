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
var dirsProjects = false;
var dirsUnits = false;
var dirsSeq = 0;

function allowed() {
    var a = (window.RBI && window.RBI.platformMenuAccess) || {};
    return a.company === true || dirsAllowed;
}

/**
 * P2-0048: права вкладок «Компании» без загрузки бандла — для левой колонки и главной «Настроек».
 * admin — управление компанией (RBI.platformMenuAccess.company, ответ сервера); projects / units — pf_my_company_access
 * (тот же ответ, что и выше); platform — администратор платформы (RBI.platform2, как в CompanyApp.rightsFrom).
 */
function rights() {
    var a = (window.RBI && window.RBI.platformMenuAccess) || {};
    var p2 = window.RBI && window.RBI.platform2;
    var st = p2 && typeof p2.getState === 'function' ? p2.getState() : null;
    return { admin: a.company === true, projects: dirsProjects, units: dirsUnits, platform: !!(st && st.isPlatformAdmin) };
}
/** Вкладка → нужное право; порядок и права — как TABS / visibleTabs в src/platform/company/CompanyApp.ts (сверяет unit-тест). */
export var COMPANY_TAB_NEEDS = [
    ['members', 'admin'], ['roles', 'admin'], ['objects', 'projects'], ['counterparties', 'admin'], ['directories', 'units'],
    ['branding', 'admin'], ['modules', 'admin'], ['audit', 'admin'], ['patterns', 'platform']
];
/** Какие вкладки CompanyApp показал бы при правах r (без права вкладки нет). */
export function companyTabsFor(r) {
    return COMPANY_TAB_NEEDS.filter(function (t) { return !!(r && r[t[1]]); }).map(function (t) { return t[0]; });
}
/** Видимые вкладки «Компании» сейчас; раздел закрыт — пусто. */
function tabs() {
    return allowed() ? companyTabsFor(rights()) : [];
}

/** Право вести объекты/единицы хотя бы в одной компании — спрашиваем сервер после каждого изменения входа/компании. */
function refreshDirs() {
    var seq = ++dirsSeq;
    var a = (window.RBI && window.RBI.platformMenuAccess) || {};
    var p2 = window.RBI && window.RBI.platform2;
    var st = p2 && typeof p2.getState === 'function' ? p2.getState() : null;
    var set = function (proj, units) {
        if (seq !== dirsSeq) return;
        var was = dirsAllowed, wasP = dirsProjects, wasU = dirsUnits;
        dirsProjects = !!proj;
        dirsUnits = !!units;
        dirsAllowed = dirsProjects || dirsUnits;
        var v = dirsAllowed;
        if (was !== v || wasP !== dirsProjects || wasU !== dirsUnits) {
            if (!allowed()) unmount();
            try { window.dispatchEvent(new Event('rbi:company-access')); } catch (_) { /* ignore */ }
        }
    };
    if (!a.planfact || !st || st.mode !== 'email' || typeof p2.rpc !== 'function') { set(false, false); return; }
    p2.rpc('pf_my_company_access', {}).then(function (res) {
        var rows = res && Array.isArray(res.data) ? res.data : [];
        set(rows.some(function (r) { return r.can_manage_projects === true; }), rows.some(function (r) { return r.can_manage_units === true; }));
    }, function () { set(false, false); });
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
    return loadBundle().then(function (m) { if (allowed() && el.isConnected) m.mount(el); }, function (e) {
        // P2-0058: без связи код раздела не скачан (не открывали с сетью) — «Нужен интернет», а не пустой экран
        var ns = window.RBI && window.RBI.netStatus;
        if (ns && typeof ns.isOffline === 'function' && ns.isOffline() && el.isConnected) { ns.needInternet(el, '«Компания»'); return; }
        throw e;
    });
}
export function unmount() { if (loaded) loaded.unmount(); }

/** P2-0048: блок «Требует внимания» на главной «Настроек» — только администратору компании (бандл грузится только ему). */
export function mountHome(el) {
    if (!el) return Promise.resolve();
    if (!rights().admin) { el.replaceChildren(); return Promise.resolve(); }
    return loadBundle().then(function (m) {
        if (rights().admin && el.isConnected && typeof m.mountHome === 'function') return m.mountHome(el);
        el.replaceChildren();
        return undefined;
    });
}
export function isMounted() { return !!(loaded && loaded.isMounted()); }

/** Старый адрес #/company → подраздел Настроек «Компания» (решение владельца 21.10.2026). */
function showView() {
    var router = window.AppRouter;
    if (router && typeof router.navigate === 'function') router.navigate('#/settings/company', true);
}

/**
 * P2-0060: «держать без сети» ядра платформы — заранее скачать экраны «Компании» в копию для просмотра (в бандле: prefetchOffline).
 * Тому, кто управляет компанией, объектами или единицами; связь подтверждена сервером; на устройстве прошлый раз — больше суток назад
 * (точное «пора» по «компания + пользователь» и выбор «держать без сети» проверяет бандл). Через 10 с после запуска. По кнопке — offlinePrefetch.
 */
var PREFETCH_DEVICE_KEY = 'platform2_offline_prefetch_last:company';
var PREFETCH_EVERY_MS = 24 * 3600 * 1000;
var prefetchAsked = false;
function prefetchNow(force) {
    return loadBundle().then(function (m) { return typeof m.prefetchOffline === 'function' ? m.prefetchOffline({ force: !!force }) : null; });
}
function maybePrefetch() {
    if (prefetchAsked) return;
    var p2 = window.RBI && window.RBI.platform2;
    var st = p2 && typeof p2.getState === 'function' ? p2.getState() : null;
    if (!st || st.mode !== 'email' || st.offline || st.checking || navigator.onLine === false || !allowed()) return;
    var last = 0;
    try { last = Number(localStorage.getItem(PREFETCH_DEVICE_KEY) || 0); } catch (_) { /* без localStorage — как в первый раз */ }
    if (Date.now() - last < PREFETCH_EVERY_MS) return;
    prefetchAsked = true;
    setTimeout(function () { prefetchNow(false).catch(function () { prefetchAsked = false; }); }, 10000);
}

export function init() {
    var rbi = (window.RBI = window.RBI || {});
    rbi.offlinePrefetch = Object.assign(rbi.offlinePrefetch || {}, { company: prefetchNow });   // P2-0060: «Скачать сейчас»
    window.addEventListener('rbi:platform-access', maybePrefetch);
    window.addEventListener('rbi:platform-net', maybePrefetch);
    rbi.platformPanels = Object.assign(rbi.platformPanels || {}, { company: { mount: mount, unmount: unmount, allowed: allowed, rights: rights, tabs: tabs, mountHome: mountHome } });
    // Право пропало (выход, смена компании) — снять экран; право на объекты/единицы — перепросить.
    window.addEventListener('rbi:platform-access', function () { if (!allowed()) unmount(); refreshDirs(); });
    refreshDirs();
    maybePrefetch();
    var router = window.AppRouter;
    if (router && typeof router.addRoute === 'function') {
        router.addRoute('#/company', showView);
        if (String(location.hash || '').indexOf('#/company') === 0) showView();
    }
}
