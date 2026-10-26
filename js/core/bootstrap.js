/* Файл: js/core/bootstrap.js — App Shell: глобальный state, appSettings, DOMContentLoaded-инициализация */
/* Перенесено 1:1 из js/app.js (разделы 1, 2, 4) */

// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
// state/details/photos/currentTemplateKey/currentChecklist/customExpertConclusions —
// владение перенесено в js/services/session.service.js; contractorArray —
// в js/services/inspection.service.js; etalonActsArray — в
// js/services/knowledge.service.js; reportsArray — в js/services/report.service.js
// (Реальная изоляция модулей, часть 3, Группа C, критичный шаг). Все 4 сервиса
// подключены раньше bootstrap.js в index.html и уже установили соответствующие
// window.* живые ссылки.
function assignPhotosMap(next) {
    const src = next || {};
    Object.keys(window.photos).forEach((k) => delete window.photos[k]);
    Object.assign(window.photos, src);
}
window.assignPhotosMap = assignPhotosMap;
window.activeTaskId = null; // Глобальная переменная для отслеживания текущей выполняемой задачи
// currentPhotoId — перенесена в photo-editor.utils.js
// chartInstances — владение уже полностью в js/modules/quality/features/analytics/analytics.state.js
// (AnalyticsState), подтверждено Волной 1 «части 2». Дублирующее объявление
// убрано (Реальная изоляция модулей, часть 3, Группа A).
window.twiOwnerFilter = 'ALL'; // Глобальный фильтр для TWI карт
window.kbShowTwiInspector = true; // TWI: технадзор
window.kbShowTwiWorker = true;    // TWI: инструкция
window.kbShowTwiPdf = true;       // TWI: регламент
window.nodeOwnerFilter = 'ALL'; // Глобальный фильтр для Узлов
window.docOwnerFilter = 'ALL';
window.practiceOwnerFilter = 'ALL';
// auditOriginalData — владение перенесено в js/modules/quality/features/audit/audit.state.js
// (AuditState), Реальная изоляция модулей, часть 3, Группа A. audit.state.js
// (через audit.module.js) подключается позже bootstrap.js в index.html — до
// этого момента window.auditOriginalData не читается ни одним потребителем
// (только внутри функций, вызываемых после полной загрузки всех модулей).

// currentZoom/isDragging/startX/startY/translateX/translateY — перенесены в photo-editor.utils.js

// Демо-режим
window.rbi_feedbackData = [];
let realFeedbackData = [];

// Настройки приложения (v16.0)
// appSettings — владение перенесено в js/services/settings.service.js
// (Реальная изоляция модулей, часть 3, Группа B). settings.service.js
// подключён раньше bootstrap.js в index.html и уже установил window.appSettings
// (тот же объект-литерал по умолчанию, без изменений полей). Потребители не
// меняются — appSettings никогда не переприсваивается целиком, только мутация
// свойств живого объекта (appSettings.prop = x), которая продолжает работать
// без изменений через живую ссылку window.appSettings.
// Универсальный помощник для статусов синхронизации
window.setSyncStatus = function (record, status, reason = '') {
    record.source = status === 'synced' ? 'cloud' : 'local';
    record.syncStatus = status;
    record.sync_status = status;
    record.syncBlockReason = reason;
    record.sync_block_reason = reason;
    return record;
};


document.addEventListener("DOMContentLoaded", async () => {
    try {
        // i18n v1 — словари + applyDom до первого рендера chrome
        var i18nEarly = window.RBI && window.RBI.services && window.RBI.services.i18n;
        if (i18nEarly && typeof i18nEarly.init === 'function') {
            try { await i18nEarly.init(); } catch (e) { console.warn('[bootstrap] i18n.init failed', e); }
        }
        if (i18nEarly && typeof i18nEarly.applyDom === 'function') {
            try { i18nEarly.applyDom(document); } catch (e) { /* ignore */ }
        }
        // Notify listeners (desk chrome) that catalogs are ready — even if locale unchanged.
        try {
            if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') {
                var locEarly = i18nEarly && typeof i18nEarly.getLocale === 'function'
                    ? i18nEarly.getLocale() : null;
                window.RBI.events.emit('i18n:localeChanged', { locale: locEarly });
            }
        } catch (eEmit) { /* ignore */ }
        if (window.RBI && window.RBI.services && window.RBI.services.shell &&
            typeof window.RBI.services.shell.renderSidebar === 'function') {
            try { window.RBI.services.shell.renderSidebar(); } catch (e) { /* ignore */ }
        }

        if (window.RBI && window.RBI.services && window.RBI.services.shell && window.RBI.services.shell.shouldShowAuthGate()) {
            window.RBI.services.shell.showAuthGate();
        }
        // --- НОВОЕ: Автоматическая синхронизация при появлении интернета ---
        window.addEventListener('online', () => {
            if (window.syncConfig && window.syncConfig.enabled) {
                if (typeof showToast === 'function') showToast("🌐 Интернет восстановлен. Синхронизируем...");
                if (typeof triggerSync === 'function') triggerSync('silent');
            }
        });
        // -------------------------------------------------------------------
        
        // Мгновенное сохранение черновика + purge PDF / blob-кэша фото в фоне
        function rbiPurgeOpenPdfOnBackground() {
            var sheetOpen = typeof window.rbiIsPdfDocumentSheetOpen === 'function'
                ? window.rbiIsPdfDocumentSheetOpen()
                : (function () {
                    var m = document.getElementById('rbi-pdf-open-sheet');
                    return !!(m && !m.classList.contains('hidden'));
                })();
            if (sheetOpen && typeof window.rbiClosePdfDocumentSheet === 'function') {
                window.rbiClosePdfDocumentSheet();
            }
            // Legacy TWI PDF.js doc (если ещё жив) — тот же полный purge (внутри также закрывает sheet).
            if (window._rbiActivePdfDoc && typeof window._rbiDestroyActivePdfDoc === 'function') {
                Promise.resolve(window._rbiDestroyActivePdfDoc()).catch(function () { /* ignore */ });
            }
        }
        function rbiReleaseHeavyUiOnBackground() {
            rbiPurgeOpenPdfOnBackground();
            var ph = window.rbiPhotoPlaceholder
                || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="100%" height="100%" fill="%23f1f5f9"/></svg>';
            var imgs = document.querySelectorAll('img[data-photo-ref]');
            for (var i = 0; i < imgs.length; i++) {
                var img = imgs[i];
                var ref = img.getAttribute('data-photo-ref');
                if (!ref) continue;
                img.src = ph;
                img.setAttribute('data-local-src', ref);
            }
            // P2-0023: отзываем только адреса, которых больше нет на странице. Фото без
            // data-photo-ref (эталоны, разборы) держат свой адрес — иначе ломаются после возврата.
            if (typeof PhotoManager !== 'undefined' && typeof PhotoManager.sweepUnusedUrls === 'function') {
                PhotoManager.sweepUnusedUrls({ force: true });
            } else if (typeof PhotoManager !== 'undefined' && typeof PhotoManager.clearMemory === 'function') {
                PhotoManager.clearMemory();
            }
        }
        window.rbiReleaseHeavyUiOnBackground = rbiReleaseHeavyUiOnBackground;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                if (typeof saveSessionData === 'function') window.saveSessionData();
                rbiReleaseHeavyUiOnBackground();
            } else if (document.visibilityState === 'visible') {
                // Re-queue imgs restored with data-local-src after background release
                if (typeof window.rbiObserveLocalSrcImgs === 'function') {
                    window.rbiObserveLocalSrcImgs();
                } else if (typeof window.rbiHydrateLocalImages === 'function') {
                    window.rbiHydrateLocalImages();
                }
            }
        });
        window.addEventListener('pagehide', rbiReleaseHeavyUiOnBackground);

        // -------------------------------------------------------------------
        // Запускаем облако до загрузки остальных настроек
        if (typeof initSync === 'function') await initSync();
        if (
            window.syncConfig &&
            window.syncConfig.enabled &&
            !localStorage.getItem('rbi_sync_last_pull_at')
        ) {
            localStorage.setItem('rbi_force_full_pull', '1');
            localStorage.setItem('rbi_cloud_dirty', '1');

            setTimeout(() => {
                if (typeof triggerSync === 'function') triggerSync('manual');
            }, 1500);
        }

        // Settings: раньше статичные теги до DCL; теперь early loadModule + guards
        if (typeof window.loadSettings !== 'function') {
            var _ml = window.RBI && window.RBI.moduleLoader;
            if (_ml && typeof _ml.loadModule === 'function') {
                var _ctx = (window.RBI.createContext && window.RBI.createContext()) || {};
                await _ml.loadModule('settings', _ctx);
            }
        }
        if (typeof window.loadSettings === 'function') {
            await window.loadSettings();
        } else if (
            window.RBI && window.RBI.services && window.RBI.services.settings &&
            typeof window.RBI.services.settings.load === 'function'
        ) {
            await window.RBI.services.settings.load();
        }
        if (typeof window.applySettingsToUI === 'function') {
            window.applySettingsToUI();
        }

        // После init AppMode / renderBottomNav — снова применить i18n к chrome
        var i18nLate = window.RBI && window.RBI.services && window.RBI.services.i18n;
        if (i18nLate && typeof i18nLate.applyDom === 'function') {
            try { i18nLate.applyDom(document); } catch (e) { /* ignore */ }
        }
        if (window.RBI && window.RBI.services && window.RBI.services.shell &&
            typeof window.RBI.services.shell.renderSidebar === 'function') {
            try { window.RBI.services.shell.renderSidebar(); } catch (e) { /* ignore */ }
        }

        // РАДАР ВЫСОТЫ ШАПКИ
        const headerEl = document.getElementById('main-header');
        window.addEventListener('resize', updateBodyPadding);

        let lastScroll = 0;
        window.addEventListener('scroll', () => {
            if (!headerEl) {
                lastScroll = window.scrollY;
                return;
            }
            const currentScroll = window.scrollY;
            const isCollapsed = headerEl.classList.contains('header-collapsed');
            let nextCollapsed = isCollapsed;
            if (currentScroll > 50 && currentScroll > lastScroll) nextCollapsed = true;
            else if (currentScroll < 50) nextCollapsed = false;

            if (nextCollapsed !== isCollapsed) {
                // Высота шапки меняется — синхронизируем body.paddingTop.
                // updateBodyPadding всегда меряет развёрнутую высоту (см. layout.utils),
                // поэтому после collapse запас сверху сохраняется и пункт не уезжает под шапку.
                if (nextCollapsed) headerEl.classList.add('header-collapsed');
                else headerEl.classList.remove('header-collapsed');
                if (typeof updateBodyPadding === 'function') {
                    try { updateBodyPadding(); } catch (_) { /* ignore */ }
                }
            }
            lastScroll = currentScroll;
        }, { passive: true });

        // ИСПРАВЛЕНИЕ: Правильная загрузка ВСЕХ созданных шаблонов из базы
        // Владение userTemplates — js/services/template.service.js (Реальная
        // изоляция модулей, часть 3, Группа A). Запись идёт через сеттер сервиса,
        // не через bare `userTemplates=`.
        const storedTmpls = await window.RBI.services.storage.getAll(STORES.TEMPLATES);
        if (storedTmpls && storedTmpls.length > 0) {
            const loadedTemplates = {};
            storedTmpls.forEach(t => { loadedTemplates[t.slug] = t.data; });
            window.RBI.services.templates.replaceUserTemplates(loadedTemplates);
        } else {
            window.RBI.services.templates.replaceUserTemplates(
                JSON.parse(localStorage.getItem('rbi_audit_user_templates_ent_v12') || '{}')
            );
        }

        document.dispatchEvent(new CustomEvent('bootstrap:selectorReady'));
        await restoreSession();
        // RBI NEW: мягкий запуск менеджера хранилища
        try {
            if (window.RbiStorageManager) {
                await window.RbiStorageManager.requestPersistentStorageOnce();
                await window.RbiStorageManager.syncFileRegistryFromCloud();

                if (typeof window.RbiStorageManager.backfillLocalFileRegistryCache === 'function') {
                    await window.RbiStorageManager.backfillLocalFileRegistryCache();
                }

                setTimeout(async () => {
                    try {
                        if (
                            window.RbiStorageManager &&
                            typeof window.RbiStorageManager.getStorageSnapshot === 'function' &&
                            typeof window.RbiStorageManager.runAdaptiveStorageCleanup === 'function'
                        ) {
                            const snap = await window.RbiStorageManager.getStorageSnapshot();

                            if (snap && snap.mode && snap.mode !== 'keep_all') {
                                window.RbiStorageManager.runAdaptiveStorageCleanup('app_start');
                            }
                        }
                    } catch (e) {
                        console.warn('[StorageManager] Ошибка мягкой проверки памяти при старте:', e);
                    }
                }, 3000);
            }
        } catch (e) {
            console.warn('[StorageManager] Ошибка запуска:', e);
        }
        // Загрузка фидбека из новой таблицы
        const storedFb = await window.RBI.services.storage.getAll(STORES.FEEDBACK_LIST);
        if (storedFb) window.rbi_feedbackData = storedFb.filter(f => !f._deleted);
        if (typeof rbi_renderFeedbackTab === 'function') rbi_renderFeedbackTab();

        // DOM аудита монтируется при loadModule('quality') — на DCL узлов может не быть.
        var emptyStateEl = document.getElementById('empty-checklist-state');
        var auditItemsEl = document.getElementById('audit-items');
        var auditActionsEl = document.getElementById('audit-actions');
        if (!window.currentTemplateKey) {
            if (emptyStateEl) emptyStateEl.style.display = 'block';
            if (auditItemsEl) auditItemsEl.style.display = 'none';
            if (auditActionsEl) auditActionsEl.style.display = 'none';
        } else {
            if (emptyStateEl) emptyStateEl.style.display = 'none';
            if (auditItemsEl) auditItemsEl.style.display = 'block';
            if (auditActionsEl) auditActionsEl.style.display = 'grid';
            document.dispatchEvent(new CustomEvent('bootstrap:checklistReady'));
        }

        initHorizontalMouseScroll();
        // P2-0023: ленивая загрузка фото — один механизм window.RbiPhotoLoader
        // (storage-photo-loader.js): только видимые, ≤4 разом, без лимита 80 адресов.
        let imgDebounceTimer = null;
        const observeLocalSrcImgs = () => {
            if (window.RbiPhotoLoader) window.RbiPhotoLoader.observeAll(document);
        };
        window.rbiObserveLocalSrcImgs = observeLocalSrcImgs;
        const domObserver = new MutationObserver((mutations) => {
            let hasNewNodes = false;
            for (let i = 0; i < mutations.length; i++) {
                if (mutations[i].addedNodes.length > 0) {
                    hasNewNodes = true; break;
                }
            }
            if (hasNewNodes) {
                clearTimeout(imgDebounceTimer);
                imgDebounceTimer = setTimeout(() => {
                    const imgs = Array.from(document.querySelectorAll(
                        'img[src^="local://"]:not([data-local-src]), img[src^="cloud://"]:not([data-local-src])'
                    )).filter(img => !img.closest('[data-no-observe]'));

                    for (let i = 0; i < imgs.length; i++) {
                        const img = imgs[i];
                        img.setAttribute('data-local-src', img.src);
                        img.src = window.rbiPhotoPlaceholder
                            || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="100%" height="100%" fill="%23f1f5f9"/></svg>';
                    }
                    // Также все явно помеченные data-local-src (https/local/cloud превью)
                    observeLocalSrcImgs();
                }, 150);
            }
        });
        domObserver.observe(document.body, { childList: true, subtree: true });
        // <-- ВСТАВКА: Принудительно отрисовываем тумблеры после загрузки всех данных
        setTimeout(() => {
            if (typeof renderSettingsTab === 'function') renderSettingsTab();
        }, 500);
    } catch (error) { console.error("Ошибка при загрузке:", error); }
});

// rbiBlockAndroidPullToRefreshOnly — перенесена в js/shared/touch-gestures.utils.js

/* ============================================================================ */
/* БЛОК 20 — Engineer Module: fallback-регистрация (legacy-заглушка)            */
/* Если ES-модуль engineer.module.js не загрузился — регистрируем заглушку.     */
/* ES-модуль перезапишет её при загрузке (_isLegacyStub будет отсутствовать).   */
/* ============================================================================ */
(function () {
  if (typeof window === 'undefined') return;
  if (!window.RBI || !window.RBI.registry) return;
  if (window.RBI.registry.has('module.engineer')) return;

  window.RBI.registry.register('module.engineer', {
    id: 'engineer',
    _isLegacyStub: true,
    routes: ['/engineer', '/engineer/:subTab'],
    dependencies: ['storage', 'tasks', 'game', 'analytics'],
    init: function () {},
    mount: function () {
      if (window.EngineerActions && typeof window.EngineerActions.renderEngineerTab === 'function') {
        window.EngineerActions.renderEngineerTab();
      } else if (typeof window.rbi_renderEngineerTab === 'function') {
        window.rbi_renderEngineerTab();
      }
    },
    unmount: function () {}
  });
})();
