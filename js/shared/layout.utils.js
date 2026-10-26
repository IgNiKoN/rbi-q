/* Файл: js/shared/layout.utils.js */
/* Генерические DOM-утилиты компоновки — перенесено из js/app.js */

// === ДИНАМИЧЕСКИЕ ОТСТУПЫ ===
function updateBodyPadding() {
    const headerEl = document.getElementById('main-header');

    // Ищем нижнюю панель по новому ID или по классу
    const navEl = document.getElementById('main-bottom-nav') || document.querySelector('.bottom-nav');

    const isNavTop = (document.body.classList.contains('nav-pos-top')) ||
        (document.body.classList.contains('nav-pos-auto') && window.innerWidth >= 768);

    // Sidebar icon-rail (App Shell, §29 п.9, вариант A) — виден только на ПК,
    // ширина отступа задаётся CSS-переменной, синхронной с шириной #app-sidebar.
    const sidebarEl = document.getElementById('app-sidebar');
    const hasSidebar = !!sidebarEl && window.innerWidth >= 768 && getComputedStyle(sidebarEl).display !== 'none';
    document.body.classList.toggle('has-app-sidebar', hasSidebar);

    // Shell B chrome (nav2 / desk topbar ≥1280) — js/core/app-shell.desktop.js
    // Icon-rail (≥768) выше; 768–1279: rail + bottom-nav без nav2.
    var deskChrome = (window.RBI && window.RBI.shellDesktop && typeof window.RBI.shellDesktop.updateChrome === 'function')
        ? window.RBI.shellDesktop.updateChrome()
        : { hasNav2: false, hasDeskTopbar: false };
    var hasNav2 = !!deskChrome.hasNav2;
    var hasDeskTopbar = !!deskChrome.hasDeskTopbar;

    // Проверяем, активны ли вкладки, где нужна шапка
    const isAuditActive = document.getElementById('tab-audit')?.classList.contains('active');
    const isDefects = document.getElementById('tab-construction-defects')?.classList.contains('active');
    const isAcceptance = document.getElementById('tab-construction-acceptance')?.classList.contains('active');
    const isTransfer = document.getElementById('tab-transfer')?.classList.contains('active'); // <-- НОВОЕ
    const isConstructionV2 = document.getElementById('tab-construction-v2')?.classList.contains('active');
    const isPlaceholder = document.getElementById('tab-mode-placeholder')?.classList.contains('active');

    // Шапка нужна на любой из этих вкладок
    const needsHeader = isAuditActive || isDefects || isAcceptance || isTransfer || isConstructionV2 || isPlaceholder;

    // Снимаем дефолтный отступ контента
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.classList.remove('pt-4');

    let totalTop = 0;

    // Shell B: slim desk topbar всегда занимает 52px сверху на ПК
    if (hasDeskTopbar) totalTop += 52;

    if (needsHeader) {
        if (isNavTop && navEl && !hasNav2) totalTop += navEl.offsetHeight;

        if (headerEl && headerEl.style.display !== 'none') {
            // paddingTop всегда от РАЗВЁРНУТОЙ высоты.
            // 1) collapsed → кэш (не снимаем класс — иначе мигание).
            // 2) mid CSS-transition при expand/collapse → offsetHeight занижен;
            //    не переписываем кэш меньшим значением.
            const wasCollapsed = headerEl.classList.contains('header-collapsed');
            let expandedH = 0;
            // P2-0030: у каждого модуля своя шапка (Качество — с чек-листом и полями, Стройконтроль в2 — одна строка):
            // высота из кэша другого модуля давала огромный отступ сверху при первом входе в в2 — кэш только своего модуля.
            const headerMode = (window.AppModeManager && window.AppModeManager.currentMode) || '';
            if (window._rbiExpandedHeaderHeightMode !== headerMode) {
                window._rbiExpandedHeaderHeight = 0;
                window._rbiExpandedHeaderHeightMode = headerMode;
            }
            const cached = window._rbiExpandedHeaderHeight || 0;
            if (wasCollapsed && cached > 0) {
                expandedH = cached;
            } else if (wasCollapsed) {
                const collapsibles = headerEl.querySelectorAll('.header-collapsible');
                const savedTransitions = [];
                for (let i = 0; i < collapsibles.length; i++) {
                    savedTransitions.push(collapsibles[i].style.transition);
                    collapsibles[i].style.transition = 'none';
                }
                headerEl.classList.remove('header-collapsed');
                void headerEl.offsetHeight;
                expandedH = headerEl.offsetHeight;
                headerEl.classList.add('header-collapsed');
                void headerEl.offsetHeight;
                for (let j = 0; j < collapsibles.length; j++) {
                    collapsibles[j].style.transition = savedTransitions[j];
                }
                window._rbiExpandedHeaderHeight = expandedH;
            } else {
                const measured = headerEl.offsetHeight;
                // P2-0030: кэш главнее только пока шапка анимируется (раскрытие) — иначе шапка стала ниже по-настоящему
                // (другой режим/скрыты строки), и старая высота давала пустую полосу сверху
                const animating = typeof headerEl.getAnimations === 'function'
                    && headerEl.getAnimations({ subtree: true }).length > 0;
                if (cached > 0 && animating && measured < cached * 0.9) {
                    expandedH = cached;
                } else {
                    expandedH = measured;
                    window._rbiExpandedHeaderHeight = measured;
                }
            }
            totalTop += expandedH;
        }

        document.body.style.paddingTop = `${totalTop + 15}px`;
        if (mainEl) mainEl.classList.add('pt-4'); // Для красоты внутри Осмотра/Дефектов
    } else {
        if (hasDeskTopbar) {
            document.body.style.paddingTop = `${totalTop + 12}px`;
        } else if (isNavTop && navEl) {
            // Навигация сверху: Высота меню (60px) + зазор 10px = 70px
            document.body.style.paddingTop = `70px`;
        } else {
            // Навигация снизу (Телефон): Жесткий безопасный отступ от верха экрана 20px
            document.body.style.paddingTop = `20px`;
        }
    }
}

// === ГОРИЗОНТАЛЬНЫЙ СКРОЛЛ МЫШКОЙ (ДЛЯ ПК) ===
function initHorizontalMouseScroll() {
    let isDown = false;
    let startX;
    let scrollLeft;
    let slider = null;

    // Вешаем слушатели на весь документ, но фильтруем цели
    document.addEventListener('mousedown', (e) => {
        // Ищем ближайший контейнер со скроллом
        slider = e.target.closest('.overflow-x-auto, .custom-scrollbar, .no-scrollbar');

        // Запрещаем скролл мышкой, если кликнули по кнопке, инпуту или фото (чтобы не блокировать их нажатие)
        if (!slider || e.target.closest('button, input, select, a, img')) {
            slider = null;
            return;
        }

        isDown = true;
        slider.style.cursor = 'grabbing';
        slider.style.userSelect = 'none'; // Запрет выделения текста при скролле

        startX = e.pageX - slider.offsetLeft;
        scrollLeft = slider.scrollLeft;
    });

    document.addEventListener('mouseleave', () => {
        if (!isDown || !slider) return;
        isDown = false;
        slider.style.cursor = '';
        slider.style.userSelect = '';
    });

    document.addEventListener('mouseup', () => {
        if (!isDown || !slider) return;
        isDown = false;
        slider.style.cursor = '';
        slider.style.userSelect = '';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDown || !slider) return;
        e.preventDefault(); // Останавливает стандартные браузерные события
        const x = e.pageX - slider.offsetLeft;
        const walk = (x - startX) * 1.5; // Скорость прокрутки (1.5x)
        slider.scrollLeft = scrollLeft - walk;
    });
}

window.updateBodyPadding = updateBodyPadding;
window.initHorizontalMouseScroll = initHorizontalMouseScroll;

/**
 * Remount каркаса вкладки после route-teardown (innerHTML='').
 * Узел #tabId сохраняется; markerSelector — признак «каркас на месте».
 * markupHtml может содержать несколько корневых .view-section (construction).
 */
window.rbiEnsureTabMarkup = function (tabId, markupHtml, markerSelector) {
    var tab = document.getElementById(tabId);
    if (tab && markerSelector && tab.querySelector(markerSelector)) return true;
    if (tab && !markerSelector && tab.innerHTML && tab.innerHTML.trim().length > 40) return true;

    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getContentRoot()
        : document.getElementById('app-content');

    var html = typeof markupHtml === 'function' ? markupHtml() : markupHtml;
    if (!html) return false;

    if (!tab) {
        if (!root) return false;
        root.insertAdjacentHTML('beforeend', html);
        tab = document.getElementById(tabId);
        var okNew = !!(tab && (!markerSelector || tab.querySelector(markerSelector)));
        if (okNew) {
            try {
                var i18nNew = window.RBI && window.RBI.services && window.RBI.services.i18n;
                if (i18nNew && typeof i18nNew.applyDom === 'function') i18nNew.applyDom(tab);
            } catch (_) { /* ignore */ }
        }
        return okNew;
    }

    var tmp = document.createElement('div');
    tmp.innerHTML = String(html).trim();
    var fresh = tmp.querySelector('#' + tabId) || tmp.firstElementChild;
    if (!fresh) return false;
    tab.innerHTML = fresh.innerHTML;
    var ok = !!(markerSelector ? tab.querySelector(markerSelector) : tab.innerHTML.trim().length > 0);
    if (ok) {
        try {
            var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
            if (i18n && typeof i18n.applyDom === 'function') i18n.applyDom(tab);
        } catch (_) { /* ignore */ }
    }
    return ok;
};

/** Flush черновиков + очистка view-section (общий route-teardown). */
window.rbiTeardownTabView = function (containerId, extraCleanup) {
    var el = document.getElementById(containerId);
    var FD = window.RBIFormDraft;
    if (FD) {
        try { if (typeof FD.flushPending === 'function') FD.flushPending(); } catch (_) { /* ignore */ }
        try { if (el && typeof FD.flushBindingsIn === 'function') FD.flushBindingsIn(el); } catch (_) { /* ignore */ }
    }
    if (typeof extraCleanup === 'function') {
        try { extraCleanup(); } catch (err) {
            console.warn('[rbiTeardownTabView] extraCleanup failed', containerId, err);
        }
    }
    if (el) el.innerHTML = '';
};
