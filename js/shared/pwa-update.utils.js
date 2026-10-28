/* Файл: js/shared/pwa-update.utils.js */

// =========================================================================
// РАЗМЕТКА «pwa-update-banner» (перенос из index.html:869-877, перенос 30
// modal/overlay-блоков #app-modals в JS-рендер). HTML-строка 1:1 идентична
// прежней статичной разметке.
// =========================================================================
(function mountPwaUpdateBannerMarkup() {
    if (document.getElementById('pwa-update-banner')) return;
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getModalsRoot()
        : document.getElementById('app-modals');
    if (!root) return;
    root.insertAdjacentHTML('beforeend', `
    <div id="pwa-update-banner" class="fixed top-4 left-1/2 transform -translate-x-1/2 z-[10000] hidden bg-indigo-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex-row items-center gap-3 w-[90%] max-w-sm border border-indigo-400 animate-fadeIn" style="display: none;">
        <div class="flex-1">
            <div class="text-[12px] font-black uppercase tracking-widest mb-0.5">Доступно обновление</div>
            <div class="text-[10px] font-medium opacity-90 leading-tight">Вышла новая версия. Нажмите, чтобы применить.</div>
        </div>
        <button id="pwa-update-btn" class="bg-white text-indigo-600 px-3 py-2 rounded-xl text-[10px] font-black uppercase shadow-md active:scale-95 transition-transform shrink-0">
            Обновить
        </button>
    </div>
`);
}());

let newWorker;
let swRegistration;
// P2-0066: новую версию включила эта вкладка — перезагрузиться; другие вкладки остаются на своей версии (вкладка = версия)
let switchRequested = false;

function showUpdateBanner() {
    const banner = document.getElementById('pwa-update-banner');
    if (banner) banner.style.display = 'flex';
}

// Общий биндинг «этот воркер — кандидат на обновление»: вызывается и из
// updatefound (обнова скачалась в этой сессии), и сразу при регистрации,
// если registration.waiting уже был выставлен ДО текущей загрузки страницы
// (вкладка была открыта в фоне, обнова докачалась без updatefound в этой
// сессии) — раньше в этом случае newWorker оставался undefined навсегда,
// и клик по «Обновить» не срабатывал вообще без единой ошибки в консоли.
function bindNewWorker(worker) {
    if (!worker || worker === newWorker) return;
    newWorker = worker;
    worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
        }
    });
}

// Логика ручной проверки обновлений
window.checkForUpdates = function() {
    if ('serviceWorker' in navigator) {
        if (typeof showToast === 'function') showToast("🔄 Проверяем наличие новых версий...");
        navigator.serviceWorker.getRegistration().then(reg => {
            if (reg) {
                // Заставляем браузер сходить на сервер и проверить sw.js
                reg.update().then(() => {
                    // Ждем 1.5 секунды. Если вылезет плашка, значит обнова есть.
                    setTimeout(() => {
                        const banner = document.getElementById('pwa-update-banner');
                        if (!banner || banner.style.display === 'none') {
                            if (typeof showToast === 'function') showToast("✅ У вас установлена самая актуальная версия!");
                        }
                    }, 1500);
                }).catch(() => {
                    if (typeof showToast === 'function') showToast("❌ Не удалось проверить обновления — нет связи с сервером");
                });
            } else {
                if (typeof showToast === 'function') showToast("❌ Ошибка: Service Worker не активен");
            }
        });
    } else {
        if (typeof showToast === 'function') showToast("Ваш браузер не поддерживает обновления");
    }
};

// Логика нажатия на кнопку "Обновить"
(function bindUpdateBtn() {
    const btn = document.getElementById('pwa-update-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        // К моменту клика newWorker может быть уже устаревшей ссылкой
        // (браузер иногда пересобирает installing/waiting) — на всякий
        // случай дотягиваемся до актуального через registration.
        const worker = newWorker
            || (swRegistration && (swRegistration.waiting || swRegistration.installing));
        btn.disabled = true;
        btn.textContent = 'Обновляем…';
        if (worker) {
            switchRequested = true;
            worker.postMessage('SKIP_WAITING');
        }
        // Страховка: если controllerchange по какой-то причине не пришёл
        // (нет связи с воркером / браузер не отработал переключение) —
        // всё равно перезагружаем страницу через sw.js уже должен быть
        // обновлён на сервере, свежий index.html подхватит актуальный код.
        setTimeout(() => { window.location.reload(); }, 4000);
    });
}());

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        let hadControllerAtLoad = !!navigator.serviceWorker.controller;
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('Service Worker успешно зарегистрирован:', registration.scope);
                swRegistration = registration;

                // Обнова уже была скачана ДО этой загрузки страницы (вкладка
                // висела открытой в фоне, или предыдущая checkForUpdates уже
                // всё скачала) — updatefound в этой сессии не произойдёт.
                if (registration.waiting && hadControllerAtLoad) {
                    bindNewWorker(registration.waiting);
                    showUpdateBanner();
                }

                // Следим за появлением нового файла sw.js (нового кэша)
                registration.addEventListener('updatefound', () => {
                    bindNewWorker(registration.installing);
                });
            })
            .catch(error => {
                console.log('Ошибка регистрации Service Worker:', error);
            });

        // Когда новый Service Worker берет управление, просто перезагружаем страницу
        let refreshing;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!hadControllerAtLoad) {
                hadControllerAtLoad = true;
                console.log('Первая установка Service Worker — перезагрузка не требуется');
                return;
            }
            if (refreshing || !switchRequested) return;
            refreshing = true;
            window.location.reload();
        });
    });
}
