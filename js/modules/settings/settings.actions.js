/**
 * settings.actions.js
 * Реальная бизнес-логика модуля настроек (owner-module 'quality.settings').
 * Перенесено 1:1 из settings.legacy.js (удалён). Рендер/DOM-отрисовка —
 * в settings.render.js (window.renderSettingsTab/applySettingsToUI).
 *
 * SettingsActions — фасад для settings.module.js (ctx.settings), методы
 * loadSettings/get/set/renderTab/applyToUI вызывают локальные функции
 * этого же файла напрямую (не делегируют в window.*, кроме renderTab/
 * applyToUI — они резолвятся в settings.render.js).
 */

(function () {
    'use strict';

    // ─── Вспомогательные константы ───────────────────────────────────────────

    var RBI_ALLOWED_THEMES_LOCAL = [
        'auto', 'light', 'dark',
        'rbi-light', 'rbi-dark', 'rbi-auto',
        'rbi-light-v2', 'rbi-dark-v2', 'rbi-auto-v2',
        'rbi-light-v3', 'rbi-dark-v3', 'rbi-auto-v3'
    ];

    // ─── Вспомогательные функции изоляции ────────────────────────────────────

    // Фаза 92: единая точка доступа к IndexedDB через StorageService или fallback
    function _storage() {
        var svc = (window.SettingsActions && window.SettingsActions._ctx && window.SettingsActions._ctx.storage) ||
                  (window.RBI && window.RBI.services && window.RBI.services.storage);
        if (svc) {
            return svc;
        }
        return {
            stores: function() { return typeof window.STORES !== 'undefined' ? window.STORES : {}; },
            get: function(store, key) { return window.dbGet(store, key); },
            put: function(store, data) { return window.dbPut(store, data); }
        };
    }

    function _setGameActionLogs(arr) {
        var svc = (window.SettingsActions && window.SettingsActions._ctx && window.SettingsActions._ctx.game) || window.RBI.services.game;
        return svc.setGameActionLogsSync(arr);
    }

    // Фаза 64: изоляция записи appSettings через SettingsService с fallback
    function _setSetting(key, value) {
        var svc = (window.SettingsActions && window.SettingsActions._ctx && window.SettingsActions._ctx.settings) ||
                  (window.RBI && window.RBI.services && window.RBI.services.settings);
        if (svc) {
            svc.set(key, value);
            return;
        }
        if (window.appSettings) window.appSettings[key] = value;
    }

    // Фаза 141: единая точка чтения настроек через SettingsService или fallback
    function _getSetting(key) {
        var svc = (window.SettingsActions && window.SettingsActions._ctx && window.SettingsActions._ctx.settings) ||
                  (window.RBI && window.RBI.services && window.RBI.services.settings);
        if (svc) {
            return svc.get(key);
        }
        return window.appSettings ? window.appSettings[key] : undefined;
    }

    // ─── Приватные функции ────────────────────────────────────────────────────

    function _rbiGetSavedThemePreference() {
        var value = localStorage.getItem('rbi_theme_preference');
        return RBI_ALLOWED_THEMES_LOCAL.includes(value) ? value : null;
    }

    function _rbiSaveThemePreference(value) {
        var theme = RBI_ALLOWED_THEMES_LOCAL.includes(value) ? value : 'rbi-auto-v3';
        localStorage.setItem('rbi_theme_preference', theme);
        return theme;
    }

    async function _loadSettings() {
        try {
            var data = await _storage().get(_storage().stores().SETTINGS, 'user_prefs');
            if (data) Object.assign(window.appSettings, data);

            // IDB/user_prefs — источник истины после sync между устройствами.
            // localStorage только зеркало для ранней отрисовки; раньше он
            // перетирал облачную тему при reload.
            if (RBI_ALLOWED_THEMES_LOCAL.includes(window.appSettings.theme)) {
                _rbiSaveThemePreference(window.appSettings.theme);
            } else {
                var savedTheme = _rbiGetSavedThemePreference();
                window.appSettings.theme = savedTheme || 'rbi-auto-v3';
                _rbiSaveThemePreference(window.appSettings.theme);
            }

        } catch (e) {
            console.error('Ошибка загрузки настроек', e);
            window.appSettings.theme = _rbiGetSavedThemePreference() || 'rbi-auto-v3';
        }
    }

    async function _saveSettings(key, value) {
        if (key === 'theme') {
            value = _rbiSaveThemePreference(value);
        }

        _setSetting(key, value);
        // Метка для sync профиля: иначе prefs не уходят в облако
        // (push профиля раньше смотрел только session/XP/plan).
        if (key !== 'settingsUpdatedAt') {
            _setSetting('settingsUpdatedAt', Date.now());
        }

        if (typeof window.applySettingsToUI === 'function') window.applySettingsToUI();

        try {
            await _storage().put(_storage().stores().SETTINGS, Object.assign({ key: 'user_prefs' }, window.appSettings));
        } catch (e) {
            console.error('Ошибка сохранения настроек', e);
        }
    }

    function _toggleSetting(settingKey, element) {
        var val = element.type === 'checkbox' ? element.checked : element.value;

        // Режим карточки/список по вкладкам — единая точка входа (сохранение + перерисовка)
        var setKbViewMode = window.setKnowledgeViewMode;
        var kbScopeMap = {
            knowledgeViewModeTwi: 'twi',
            knowledgeViewModeDocs: 'docs',
            knowledgeViewModeNodes: 'nodes',
            knowledgeViewModePractices: 'practices',
            knowledgeViewModeReports: 'reports',
            knowledgeViewModeMeetings: 'meetings',
            knowledgeViewModeFmea: 'fmea',
            // legacy: пишем во все scope (миграция со старого единого ключа)
            knowledgeViewMode: null
        };
        if (Object.prototype.hasOwnProperty.call(kbScopeMap, settingKey) && typeof setKbViewMode === 'function') {
            var scope = kbScopeMap[settingKey];
            if (scope) {
                setKbViewMode(scope, val);
            } else {
                ['twi', 'docs', 'nodes', 'practices', 'reports', 'meetings', 'fmea'].forEach(function (s) {
                    setKbViewMode(s, val);
                });
            }
            return;
        }

        _setSetting(settingKey, val);

        if (settingKey === 'brandColor') {
            _setSetting('isBrandingCustomized', true);
            _saveSettings('isBrandingCustomized', true);
        }

        _saveSettings(settingKey, val);

        // Включили автокэш — сразу запросить полное копирование (на случай «застрявшего» флага done).
        if (settingKey === 'autoCacheCloudFiles' && val === true) {
            if (typeof window.rbiRequestFullOfflineCache === 'function') {
                window.rbiRequestFullOfflineCache('settings_toggle_on');
            }
            if (typeof window.rbiScheduleFullOfflineCacheIfEnabled === 'function') {
                window.rbiScheduleFullOfflineCacheIfEnabled(500);
            }
        }
    }

    /** i18n v1 — язык UI только localStorage, не в sync'd appSettings */
    function _setAppLocale(code) {
        var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
        if (i18n && typeof i18n.setLocale === 'function') {
            i18n.setLocale(code);
        }
    }

    function _resetSettingsToDefault() {
        if (!confirm('Сбросить все настройки к значениям по умолчанию?')) return;

        var svc = (window.SettingsActions && window.SettingsActions._ctx && window.SettingsActions._ctx.settings) ||
                  (window.RBI && window.RBI.services && window.RBI.services.settings);
        var defaults = (svc && typeof svc.getDefaults === 'function')
            ? svc.getDefaults()
            : {
                theme: 'rbi-auto-v3', fontSize: 'medium', navPosition: 'auto', dashboardMode: 'compact',
                autoCollapseFilters: 'manual', uiMotionEnabled: true, swipeEnabled: false
            };

        // Роль/объекты/имя — из профиля sync, не трогаем «заводским» сбросом UI
        var AUTH_KEEP = {
            userRole: 1,
            cloudStatus: 1,
            assignedProjects: 1,
            pendingAssignedProjects: 1,
            pendingUnassignProjects: 1,
            assignedContractor: 1,
            contractorName: 1,
            engineerName: 1,
            defaultProject: 1
        };
        var preserved = {};
        Object.keys(AUTH_KEEP).forEach(function (k) {
            if (window.appSettings && Object.prototype.hasOwnProperty.call(window.appSettings, k)) {
                preserved[k] = window.appSettings[k];
            }
        });

        // Мутируем существующий объект, чтобы не разрывать ссылку с app.js (let appSettings)
        Object.keys(window.appSettings).forEach(function (k) { delete window.appSettings[k]; });
        Object.assign(window.appSettings, defaults, preserved);
        window.appSettings.theme = 'rbi-auto-v3';
        window.appSettings.settingsUpdatedAt = Date.now();
        _rbiSaveThemePreference('rbi-auto-v3');

        _saveSettings('theme', 'rbi-auto-v3');
        if (typeof window.renderSettingsTab === 'function') window.renderSettingsTab();
        if (typeof window.applySettingsToUI === 'function') window.applySettingsToUI();

        setTimeout(function () {
            if (typeof window.updateBodyPadding === 'function') window.updateBodyPadding();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            document.body.classList.remove('modal-open');
        }, 100);

        if (typeof window.showToast === 'function') {
            var i18nToast = window.RBI && window.RBI.services && window.RBI.services.i18n;
            var resetMsg = (i18nToast && typeof i18nToast.t === 'function')
                ? i18nToast.t('toast.settingsReset')
                : 'Настройки сброшены!';
            window.showToast(resetMsg);
        }
    }

    /** Scope: all | days30 | knowledge | reports → downloadMissingCloudFiles(false, scope) */
    function _downloadOfflineCacheScope(scope) {
        var resolved = scope || 'all';
        if (typeof window.downloadMissingCloudFiles !== 'function') {
            if (typeof window.showToast === 'function') {
                window.showToast('⚠️ Офлайн-кэш недоступен');
            }
            return;
        }
        return window.downloadMissingCloudFiles(false, resolved);
    }

    async function _clearPdfCache() {
        var ok = confirm(
            'Очистить локальный кэш файлов?\n\n' +
            'Будут удалены только локальные копии файлов, которые уже есть в облаке.\n' +
            'Проверки, история, задачи, документы и файлы в Supabase не удаляются.\n\n' +
            'Без интернета очищенные файлы могут быть недоступны, но загрузятся снова при подключении.'
        );

        if (!ok) return;

        if (!window.RbiStorageManager || typeof window.RbiStorageManager.runManualRecoverableCacheCleanup !== 'function') {
            if (typeof window.showToast === 'function') window.showToast('⚠️ Менеджер хранилища не загружен');
            return;
        }

        if (typeof window.showToast === 'function') window.showToast('⏳ Очищаем восстановимый кэш...');
        await window.RbiStorageManager.runManualRecoverableCacheCleanup();
    }

    async function _previewStorageCleanup() {
        if (!window.RbiStorageManager || typeof window.RbiStorageManager.previewAdaptiveStorageCleanup !== 'function') {
            if (typeof window.showToast === 'function') window.showToast('⚠️ Менеджер хранилища не загружен');
            return;
        }

        if (typeof window.showToast === 'function') window.showToast('⏳ Проверяем файловый кэш...');

        try {
            var result = await window.RbiStorageManager.previewAdaptiveStorageCleanup('manual_preview');

            if (!result || result.error) {
                console.error('[previewStorageCleanup]', result && result.error);
                if (typeof window.showToast === 'function') {
                    window.showToast('❌ Не удалось проверить кэш' + (result && result.error ? (': ' + result.error) : ''));
                }
                return;
            }

            var usagePct = Number(result.usagePercent || 0).toFixed(1);
            var freeMb = Number(result.freeMB || 0).toFixed(1);
            var usedMb = Number(result.usedMB || 0).toFixed(1);
            var autoMb = Number(result.totalMB || 0).toFixed(1);
            var manualMb = Number(result.manualRecoverableMB || 0).toFixed(1);

            var msg =
                'Предпросмотр очистки файлового кэша:\n\n' +
                'Занято (как в браузере): ' + usedMb + ' МБ (' + usagePct + '%)\n' +
                'Свободно по квоте: ' + freeMb + ' МБ\n' +
                'Режим автоочистки: ' + (result.mode || '—') + '\n\n' +
                'Автоочистка сейчас сняла бы (по TTL / режиму):\n' +
                (result.candidatesCount || 0) + ' файлов / ' + autoMb + ' МБ\n' +
                '• фото проверок: ' + (result.inspectionPhotos || 0) + '\n' +
                '• PDF-отчёты: ' + (result.reports || 0) + '\n' +
                '• документы / БЗ: ' + (result.docs || 0) + '\n' +
                '• TWI: ' + (result.twi || 0) + '\n' +
                '• узлы: ' + (result.nodes || 0) + '\n' +
                '• практики: ' + (result.practices || 0) + '\n' +
                '• эталоны: ' + (result.etalons || 0) + '\n' +
                '• прочее: ' + (result.other || 0) + '\n\n' +
                'Кнопка «Очистить кэш» снимет все облачные копии:\n' +
                (result.manualRecoverableFiles || 0) + ' файлов / ' + manualMb + ' МБ\n' +
                'Несинхронизированные локальные не трогаем: ' +
                (result.localOnlyFiles || 0) + ' / ' + Number(result.localOnlyMB || 0).toFixed(1) + ' МБ\n\n' +
                'Файлы сейчас НЕ удалены — только проверка.';

            alert(msg);
        } catch (e) {
            console.error('[previewStorageCleanup]', e);
            if (typeof window.showToast === 'function') {
                window.showToast('❌ Ошибка проверки кэша: ' + (e && e.message ? e.message : e));
            }
        }
    }

    // === ОКНО "О ПРИЛОЖЕНИИ" (перенесено 1:1 из settings.legacy.js) ===
    function _showAboutApp() {
        const modal = document.getElementById('modal-overlay');
        document.getElementById('modal-icon').innerHTML = `<div class="w-14 h-14 bg-surface text-ink rounded-[14px] flex items-center justify-center border border-surface mx-auto"><svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></div>`;
        document.getElementById('modal-title').innerHTML = `
    <div style="text-align: center;">
        RBI <span class="splash-pro">Platform</span>
    </div>
`;

        document.getElementById('modal-body').innerHTML = `
        <div class="space-y-4 text-rbi-body leading-relaxed text-ink">
            
            <div class="text-center font-bold text-brand mb-2">
                Construction OS<br>
                <span class="font-medium text-rbi-label text-muted">Операционная система управления строительством</span>
            </div>

            <div class="bg-brand-soft border border-brand-soft p-4 rounded-xl shadow-sm">
                <h4 class="font-black text-brand mb-2 uppercase tracking-wider flex items-center gap-1.5"><span class="text-lg"></span> Архитектура и Безопасность</h4>
                <p class="mb-2">Платформа построена по технологии <b>PWA (Progressive Web App)</b> и работает полностью автономно.</p>
                <ul class="list-disc pl-4 space-y-1.5 text-rbi-label text-brand mb-3">
                    <li><b>Offline-First:</b> Клиентский контейнер: проверки, фото, PDF и справочники живут <b>в IndexedDB вашего устройства</b>.</li>
                    <li><b>Локальные вычисления:</b> Аналитика и PDF собираются на устройстве — данные не уходят на сторонние серверы для обработки.</li>
                </ul>
                <div class="bg-white/60 dark:bg-brand-soft p-2.5 rounded-lg border border-brand-soft text-rbi-caption font-bold leading-snug text-brand">
                    🔒 <b>О размещении:</b> Каркас (HTML/CSS/JS) отдаётся с <b>rbi-q.ru</b>. Демо и системные чек-листы — из открытых источников (ГОСТ, СП). Коммерческие данные строек <b>не покидают устройство без явного согласия и подключения синхронизации</b>.
                </div>
            </div>

            <div class="bg-surface border border-surface p-4 rounded-xl shadow-sm">
    <h4 class="font-black text-ink dark:text-white mb-3 uppercase tracking-wider flex items-center gap-1.5">
        <svg class="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
        Продукты на едином ядре платформы
    </h4>

    <div class="space-y-3 text-rbi-label">
        <div>
            <b class="text-ink dark:text-white text-rbi-body">1. RBI Quality — управление качеством:</b><br>
            Осмотр по чек‑листам (B1/B2/B3), эскалация >1,5x, фото с разметкой. Расчёт УрК, ИУрК, ИКО, Impact Score, стабильности подрядчика. Геймификация инженеров (XP, ранги, ачивки), планировщик задач с ИИ.
        </div>
        <div class="border-t border-surface pt-2">
            <b class="text-ink dark:text-white text-rbi-body">2. RBI Construction Control — стройконтроль:</b><br>
            Иерархия объект → корпус → этаж, PDF‑планы, дефекты с координатами. Журнал приёмки, зоны на плане. Импорт из ПК Стройконтроль, ИСД, CMI, KPI инженеров СК, AI‑письма прорабам.
        </div>
        <div class="border-t border-surface pt-2">
            <b class="text-ink dark:text-white text-rbi-body">3. Аналитика и отчёты:</b><br>
            Тренды, Парето, тепловые карты, One‑Pager с ИИ‑резюме, QR для публичного доступа. Сводки, рейтинги, PDF/Excel, брендирование.
        </div>
        <div class="border-t border-surface pt-2">
            <b class="text-ink dark:text-white text-rbi-body">4. База знаний (TWI, узлы, НД):</b><br>
            Визуальные стандарты TWI, технические узлы, ГОСТ/СП с поиском и AI‑чатом. Практики и эталоны, привязка к чек‑листам.
        </div>
        <div class="border-t border-surface pt-2">
            <b class="text-ink dark:text-white text-rbi-body">5. Offline‑синхронизация и роли:</b><br>
            Offline‑First + sync через Supabase. Роли от гостя до администратора, RLS и клиентская маршрутизация по объектам.
        </div>
        <div class="border-t border-surface pt-2">
            <b class="text-ink dark:text-white text-rbi-body">6. ИИ (DeepSeek):</b><br>
            Управленческие резюме, прогноз рисков, FMEA/TWI, чат по НД, маршрутизация задач — онлайн и гибрид.
        </div>
    </div>

    <div class="mt-3 pt-2 border-t border-surface text-rbi-caption text-muted italic">
        ⚙️ Дальше на ядре: передача квартир, гарантия, охрана труда, УК и другие продукты жизненного цикла объекта.
    </div>
</div>

            <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 p-4 rounded-xl shadow-sm">
                <h4 class="font-black text-amber-800 dark:text-amber-400 mb-2 uppercase tracking-wider flex items-center gap-1.5"><span class="text-lg">🚀</span> Ближайшее развитие (Roadmap)</h4>
                <ul class="list-disc pl-4 text-rbi-label text-amber-900 dark:text-amber-200 space-y-1.5">
                    <li><b>Завершение Beta:</b> обкатка на реальных объектах, стабилизация.</li>
                    <li><b>Оптимизация:</b> рендер больших данных, сжатие фото.</li>
                    <li><b>База знаний:</b> СП/ГОСТ, системные чек‑листы, узлы и TWI по основным видам СМР.</li>
                </ul>
            </div>
            
            <div class="text-center text-rbi-caption text-muted uppercase tracking-widest font-black mt-6 border-t border-surface pt-4">
                RBI Platform · Construction OS<br>
                Операционная система управления строительством
            </div>
        </div>
    `;
        document.body.classList.add('modal-open');
        modal.style.display = 'flex';
    }

    // === ПОЛНАЯ ОЧИСТКА ИСТОРИИ (перенесено 1:1 из settings.legacy.js) ===
    async function _clearHistory() {
        var _ctxLocal = window.SettingsActions && window.SettingsActions._ctx;
        var _permSvc = (_ctxLocal && _ctxLocal.permissions) || window.RBI.services.permissions;
        if (_permSvc && !_permSvc.isAdmin()) {
            return showToast("⛔ Полная очистка истории доступна только администратору или заместителю");
        }
        if (!confirm('Удалить ВСЮ историю проверок? Сами чек-листы и настройки останутся.')) return;

        // Очищаем массивы в памяти и в IndexedDB
        var _inspSvc = (_ctxLocal && _ctxLocal.inspections) || window.RBI.services.inspections;
        var _knowSvc = (_ctxLocal && _ctxLocal.knowledge) || window.RBI.services.knowledge;
        _inspSvc.setAllSync([]);
        _knowSvc.setEtalonActsSync([]);
        await _storage().clear(_storage().stores().HISTORY);
        await _storage().clear(_storage().stores().ETALON_ACTS);

        // Очищаем память умного автозаполнения (чтобы старые подрядчики не вылезали при вводе)
        localStorage.removeItem('smart_input_cache');

        // Очищаем логи геймификации HR
        _setGameActionLogs([]);
        await _storage().put(_storage().stores().GAME_LOGS, { id: 'main', data: [] });

        // Принудительно обновляем все связанные экраны
        if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') window.RBI.events.emit('history:renderRequested', {});
        if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') window.RBI.events.emit('analytics:renderRequested', {});
        window.updateDataSummary();

        showToast('🗑️ История проверок полностью очищена');
    }

    // === ПОЛНЫЙ СБРОС ПРИЛОЖЕНИЯ (перенесено 1:1 из settings.legacy.js) ===
    async function _fullFactoryReset() {
        if (!confirm('УДАЛИТЬ ВООБЩЕ ВСЁ?\n\nЭто действие необратимо! Все ваши проверки, настройки, TWI-карты и загруженные документы будут уничтожены. Приложение вернется к первоначальному виду.')) return;

        // Показываем лоадер
        const loader = document.getElementById('global-loader');
        const loaderText = document.getElementById('global-loader-text');
        if (loader && loaderText) {
            loaderText.innerText = "Уничтожение базы данных...";
            loader.style.display = 'flex';
            setTimeout(() => loader.classList.remove('opacity-0'), 10);
        }

        try {
            // 1. Очищаем локальные хранилища
            localStorage.clear();
            sessionStorage.clear();

            // 2. Закрываем активное соединение с БД, чтобы избежать блокировок
            if (typeof window._dbPromise !== 'undefined' && window._dbPromise) {
                try {
                    const db = await window._dbPromise;
                    db.close();
                } catch (e) { }
                window._dbPromise = null;
            }

            // 3. ЖЕСТКО удаляем всю базу данных целиком (самый надежный способ)
            // имя базы — то, с которым открыта (storage-db.core.js; P2-0016 — своя у компании)
            const req = indexedDB.deleteDatabase(window.RBI_DB_NAME || (window.APP_CONFIG && window.APP_CONFIG.LOCAL_DB_NAME) || 'PLATFORM2_DB');

            await new Promise((resolve) => {
                req.onsuccess = resolve;
                req.onerror = resolve; // Игнорируем ошибки, идем дальше
                req.onblocked = () => {
                    console.warn("БД заблокирована другим процессом, браузер удалит ее при перезапуске.");
                    resolve();
                };
            });

            // 4. Очистка кэша PWA (удаление старых файлов)
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            }

            // 5. Сброс Service Worker
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                }
            }

            // 6. Перезагрузка страницы со сбросом кэша
            window.location.href = window.location.pathname + '?reset=' + Date.now();

        } catch (e) {
            console.error('Сбой при очистке:', e);
            // Резервный выход: если что-то упало, всё равно чистим LS и перезагружаем
            localStorage.clear();
            window.location.href = window.location.pathname + '?reset=' + Date.now();
        }
    }

    /* RBI NEW: Рендер реестра бэкапов в Настройках (перенесено 1:1 из settings.legacy.js) */
    async function _rbi_renderBackupRegistry() {
        const listEl = document.getElementById('rbi-backup-registry-list');
        if (!listEl) return;

        let logs = [];
        try {
            const logsObj = await _storage().get(_storage().stores().BACKUP_LOGS, 'main');
            if (logsObj && logsObj.data) logs = logsObj.data;
        } catch (e) { }

        if (logs.length === 0) {
            listEl.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-rbi-caption text-muted italic">Реестр выгрузок пуст</td></tr>`;
            return;
        }

        listEl.innerHTML = logs.map(l => `
        <tr class="border-b border-surface hover:bg-surface transition-colors">
            <td class="py-2 pr-2 text-rbi-caption text-muted whitespace-nowrap">${l.dateStr}</td>
            <td class="py-2 px-2 text-rbi-caption font-bold text-ink">${l.type}</td>
            <td class="py-2 px-2 text-rbi-caption text-muted text-center">${l.stats?.checks || 0}</td>
            <td class="py-2 pl-2 text-rbi-caption text-muted truncate max-w-[80px]" title="${l.fileName}">${l.fileName}</td>
        </tr>
    `).join('');
    }

    // ─── SettingsActions (facade для settings.module.js) ─────────────────────

    var SettingsActions = {

        _ctx: null,

        bindCtx: function (ctx) {
            this._ctx = ctx;
        },

        _getService: function () {
            return (this._ctx && this._ctx.settings) ||
                   (window.RBI && window.RBI.services && window.RBI.services.settings);
        },

        loadSettings: function () {
            return _loadSettings();
        },

        get: function (key) {
            return _getSetting(key);
        },

        set: async function (key, value) {
            return _setSetting(key, value);
        },

        renderTab: function () {
            if (typeof window.renderSettingsTab === 'function') {
                return window.renderSettingsTab();
            }
        },

        applyToUI: function () {
            if (typeof window.applySettingsToUI === 'function') {
                return window.applySettingsToUI();
            }
        }
    };

    window.SettingsActions = SettingsActions;

    // ─── Модуль ───────────────────────────────────────────────────────────────

    var settingsModule = {
        _version: '1.0',
        _name: 'quality.settings',

        init: function () {
            console.log('[RBI Module] quality.settings v2.0 loaded (hard override)');
        },

        mount: function () {
            if (typeof window.renderSettingsTab === 'function') window.renderSettingsTab();
        },

        unmount: function () {
        },

        loadSettings: _loadSettings,
        saveSettings: _saveSettings,
        renderSettingsTab: function () { if (typeof window.renderSettingsTab === 'function') return window.renderSettingsTab(); },
        toggleSetting: _toggleSetting,
        setAppLocale: _setAppLocale,
        resetSettingsToDefault: _resetSettingsToDefault,
        applySettingsToUI: function () { if (typeof window.applySettingsToUI === 'function') return window.applySettingsToUI(); },
        clearPdfCache: _clearPdfCache,
        previewStorageCleanup: _previewStorageCleanup,
        downloadOfflineCacheScope: _downloadOfflineCacheScope,
        rbiGetSavedThemePreference: _rbiGetSavedThemePreference,
        rbiSaveThemePreference: _rbiSaveThemePreference
    };

    // ─── Регистрация ──────────────────────────────────────────────────────────

    if (window.RBI && window.RBI.registry) {
        window.RBI.registry.register('quality.settings', settingsModule);
    }

    settingsModule.init();

    // ─── Window-прокси (для вызовов из index.html) ────────────────────────────
    // renderSettingsTab/applySettingsToUI устанавливаются в settings.render.js.

    window.loadSettings = _loadSettings;
    window.saveSettings = _saveSettings;
    window.toggleSetting = _toggleSetting;
    window.resetSettingsToDefault = _resetSettingsToDefault;
    window.clearPdfCache = _clearPdfCache;
    window.previewStorageCleanup = _previewStorageCleanup;
    window.downloadOfflineCacheScope = _downloadOfflineCacheScope;
    window.rbiGetSavedThemePreference = _rbiGetSavedThemePreference;
    window.rbiSaveThemePreference = _rbiSaveThemePreference;
    window.showAboutApp = _showAboutApp;
    window.clearHistory = _clearHistory;
    window.fullFactoryReset = _fullFactoryReset;
    window.rbi_renderBackupRegistry = _rbi_renderBackupRegistry;

    console.log('[SettingsActions] settings.actions.js loaded (real logic, v2.0)');
}());

export const SettingsActions = window.SettingsActions;
