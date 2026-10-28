/* Файл: js/shared/pwa-update.utils.js */
// P2-0066: обновление приложения без плашки. Кэш приложения (sw.js) ставит новую версию целиком в фоне; здесь:
// - строка версии <p2-app-version> («Настройки → Помощь и о программе»): номер и дата, ход скачивания, «Перезапустить сейчас»;
// - переключение: при запуске (ранний участок index.html) и при возврате из фона ≥ 30 мин, если всё отправлено и ничего
//   не вводится (правила — app-update.policy.js); «Перезапустить сейчас» и «Проверить обновления»;
// - вкладка = версия: другие открытые вкладки не перезагружаются, остаются на своей версии до закрытия.
import { RETURN_AFTER_MS, shouldSwitchOnReturn, versionView } from './app-update.policy.js';

let swRegistration = null;
// новую версию включила эта вкладка — перезагрузиться; другие вкладки остаются на своей версии
let switchRequested = false;
let lastCheckAt = 0;
let hiddenAt = 0;
const state = { version: '', date: '', state: 'idle', done: 0, total: 0, newVersion: '', reason: '' };

// ---------- «Идёт ввод» (appBusy) — общая функция платформы: модули сообщают об открытых формах (RBI.appBusy.set),
// плюс видимые признаки: поле ввода в фокусе, открытое модальное окно.
const busyKeys = new Set();
function appBusy() {
    if (busyKeys.size) return true;
    const a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return true;
    const vis = (el) => !!el && !el.classList.contains('hidden') && el.offsetParent !== null;
    return vis(document.getElementById('modal-overlay')) || !!document.querySelector('dialog[open], [aria-modal="true"]:not([hidden])');
}
window.RBI = window.RBI || {};
window.RBI.appBusy = { set: (key, on) => { if (on) busyKeys.add(String(key)); else busyKeys.delete(String(key)); }, isBusy: appBusy };

// ---------- Строка версии
const CSS = '.p2v{display:block;background:var(--card-bg);color:var(--text-main);border:1px solid var(--card-border);border-radius:16px;overflow:hidden}' +
    '.p2v__head{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 16px}.p2v__head>div:nth-child(2){flex:1 1 200px;min-width:0}' +
    '.p2v__ico{width:44px;height:44px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center}' +
    '.p2v__ico--ok{color:var(--success,#3f8f5e);background:color-mix(in srgb,var(--success,#3f8f5e) 14%,transparent)}' +
    '.p2v__ico--warn{color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 14%,transparent)}' +
    '.p2v__ico--info{color:var(--text-muted);background:color-mix(in srgb,var(--text-muted) 14%,transparent)}' +
    '.p2v__title{display:block;font-size:16px;font-weight:800;line-height:1.25;overflow-wrap:anywhere}' +
    '.p2v__sub{display:block;font-size:13px;color:var(--text-muted);margin-top:2px;overflow-wrap:anywhere}' +
    '.p2v__btns{display:flex;flex-wrap:wrap;gap:8px;flex:1 1 100%}' +
    '.p2v__btn{flex:1 1 160px;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);font-weight:700;font-size:13px;cursor:pointer}' +
    '.p2v__btn--main{border:0;background:var(--accent,var(--primary,#c49a5f));color:#fff;font-weight:800}' +
    '.p2v__btn:focus-visible{outline:2px solid var(--warning,#b8844a);outline-offset:2px}' +
    '.p2v__bar{height:6px;margin:0 16px 14px;border-radius:999px;background:color-mix(in srgb,var(--text-muted) 16%,transparent);overflow:hidden}' +
    '.p2v__bar>i{display:block;height:100%;background:var(--accent,var(--primary,#c49a5f));border-radius:999px;transition:width .3s}' +
    '.p2v__foot{display:flex;flex-wrap:wrap;gap:6px 16px;padding:10px 16px;border-top:1px solid var(--card-border);font-size:12.5px;color:var(--text-muted)}' +
    '@media (min-width:768px){.p2v__btns{flex:none;margin-left:auto}.p2v__btn{flex:none}}';
const ICON = {
    ok: '<path d="M20 6 9 17l-5-5"/>',
    info: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    ready: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    failed: '<path d="M2 2l20 20"/><path d="M5.8 10.1A5 5 0 0 0 7 18h10.5"/><path d="M20.9 16.6A4 4 0 0 0 19 10a5 5 0 0 0-7.6-4.3"/>'
};
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderRow(el) {
    if (!document.getElementById('p2v-css')) {
        const st = document.createElement('style'); st.id = 'p2v-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const v = versionView(state);
    const icon = ICON[state.state === 'ready' ? 'ready' : state.state === 'failed' ? 'failed' : v.tone === 'info' ? 'info' : 'ok'];
    el.className = 'p2v';
    el.setAttribute('role', 'status');
    el.setAttribute('data-testid', 'p2-app-version');
    el.setAttribute('data-state', state.state);
    el.innerHTML = '<div class="p2v__head"><div class="p2v__ico p2v__ico--' + v.tone + '"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icon + '</svg></div>' +
        '<div><b class="p2v__title">' + esc(v.title) + '</b><span class="p2v__sub">' + esc(v.sub) + '</span></div><div class="p2v__btns">' +
        (v.restart ? '<button class="p2v__btn p2v__btn--main" type="button" data-shell-action="restartToNewVersion" data-testid="p2-app-restart">Перезапустить сейчас</button>' : '') +
        '<button class="p2v__btn" type="button" data-shell-action="checkForUpdates" data-testid="p2-app-check">Проверить обновления</button></div></div>' +
        (v.progress !== null ? '<div class="p2v__bar"><i style="width:' + Math.round(v.progress * 100) + '%"></i></div>' : '') +
        (v.foot ? '<div class="p2v__foot"><span>' + esc(v.foot) + '</span></div>' : '');
}
const rows = new Set();
if (!customElements.get('p2-app-version')) {
    customElements.define('p2-app-version', class extends HTMLElement {
        connectedCallback() { rows.add(this); renderRow(this); }
        disconnectedCallback() { rows.delete(this); }
    });
}
function paint() {
    rows.forEach(renderRow);
    // один номер для диагностики «Данные на устройстве» и «Скопировать отчёт для разработчика»
    if (state.version) {
        window.RBI_APP_VERSION = { app: state.version, sw: state.version, buildDate: state.date };
        window.APP_VERSION = state.version;
    }
}

// ---------- Связь с кэшем приложения
const ask = (worker) => { try { if (worker) worker.postMessage({ type: 'P2_APP_VERSION' }); } catch (e) { /* нет связи с кэшем */ } };
function onMessage(e) {
    const d = e.data || {};
    if (d.type === 'P2_APP_VERSION') {
        const fromActive = navigator.serviceWorker.controller && e.source === navigator.serviceWorker.controller;
        if (fromActive || !state.version) { state.version = d.version || ''; state.date = d.date || ''; }
        if (!fromActive && swRegistration && e.source === swRegistration.waiting) { state.state = 'ready'; state.newVersion = d.version || ''; }
        paint();
    }
    if (d.type === 'P2_APP_UPDATE' && d.version && d.version !== state.version) {
        state.state = d.state === 'idle' ? state.state : d.state;
        state.done = d.done || 0; state.total = d.total || 0; state.reason = d.reason || ''; state.newVersion = d.version;
        paint();
    }
}
function watchWorker(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) { state.state = 'ready'; ask(worker); paint(); }
        if (worker.state === 'redundant' && state.state === 'downloading') { state.state = 'failed'; paint(); }
    });
}
function syncFromRegistration() {
    const reg = swRegistration;
    if (!reg) return;
    if (reg.waiting && navigator.serviceWorker.controller) { state.state = 'ready'; ask(reg.waiting); }
    else if (reg.installing) { state.state = 'downloading'; watchWorker(reg.installing); }
    paint();
}

/** Спросить сервер о новой версии (не чаще раза в 30 мин, если не force). */
function checkNow(force) {
    if (!swRegistration || (!force && Date.now() - lastCheckAt < RETURN_AFTER_MS)) return Promise.resolve(false);
    lastCheckAt = Date.now();
    return swRegistration.update().then(() => { syncFromRegistration(); return true; });
}

/** Включить скачанную версию в этой вкладке: SKIP_WAITING → controllerchange → перезагрузка. */
function switchNow() {
    const w = swRegistration && swRegistration.waiting;
    if (!w) return false;
    switchRequested = true;
    w.postMessage('SKIP_WAITING');
    // страховка: controllerchange не пришёл — всё равно перезагрузить (новая версия уже действует)
    setTimeout(() => { window.location.reload(); }, 4000);
    return true;
}

// «Проверить обновления» — кнопка в строке версии (data-shell-action)
window.checkForUpdates = function () {
    const toast = (m) => { if (typeof showToast === 'function') showToast(m); };
    if (!('serviceWorker' in navigator) || !swRegistration) { toast('❌ Кэш приложения не активен — проверка недоступна'); return; }
    toast('🔄 Проверяем наличие новых версий...');
    checkNow(true).then(() => {
        setTimeout(() => {
            syncFromRegistration();
            if (state.state === 'ready') toast('✅ Новая версия скачана — включится при следующем запуске');
            else if (state.state === 'downloading' || (swRegistration && swRegistration.installing)) toast('⬇️ Скачивается новая версия — можно работать дальше');
            else toast('✅ У вас установлена самая актуальная версия!');
        }, 1500);
    }).catch(() => toast('❌ Не удалось проверить обновления — нет связи с сервером'));
};
// «Перезапустить сейчас» — по кнопке человека: неотправленное лежит на устройстве и уйдёт после перезапуска
window.restartToNewVersion = function () { if (!switchNow()) window.checkForUpdates(); };

// ---------- Возврат из фона: проверить обновление; скачанная версия включается, если всё отправлено и ничего не вводится
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    const hiddenMs = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (hiddenMs < RETURN_AFTER_MS || !swRegistration) return;
    const net = window.RBI && window.RBI.netStatus && typeof window.RBI.netStatus.get === 'function' ? window.RBI.netStatus.get() : { unsent: 0 };
    const s = { waiting: !!(swRegistration.waiting && navigator.serviceWorker.controller), hiddenMs, unsent: Number(net.unsent) || 0, syncing: !!window.isSyncing, busy: appBusy() };
    if (shouldSwitchOnReturn(s)) { switchNow(); return; }
    checkNow(false).catch(() => {});
});
// для стенда: «вкладка пробыла в фоне ms» (визуально тот же путь, что visibilitychange)
window.RBI.appUpdate = { state, simulateReturn: (ms) => { hiddenAt = Date.now() - ms; document.dispatchEvent(new Event('visibilitychange')); } };

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', onMessage);
    window.addEventListener('load', () => {
        let hadControllerAtLoad = !!navigator.serviceWorker.controller;
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                swRegistration = registration;
                ask(navigator.serviceWorker.controller);
                syncFromRegistration();
                registration.addEventListener('updatefound', () => {
                    if (navigator.serviceWorker.controller) { state.state = 'downloading'; state.done = 0; state.total = 0; paint(); }
                    watchWorker(registration.installing);
                });
                checkNow(false).catch(() => {});   // при запуске — спросить сервер о новой версии
            })
            .catch((error) => { console.log('Ошибка регистрации Service Worker:', error); });

        // новая версия взяла управление: перезагружается только вкладка, которая её включила (вкладка = версия)
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!hadControllerAtLoad) { hadControllerAtLoad = true; ask(navigator.serviceWorker.controller); return; }   // первая установка
            if (refreshing || !switchRequested) return;
            refreshing = true;
            window.location.reload();
        });
    });
}
