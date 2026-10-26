// ============================================================================
// APP-UTILS MODULE — вспомогательные функции приложения
// Перенесён из app.js (Step 39): строки 6180–6656
// Содержит: функции логотипа, алиасов подрядчика, режимов приложения,
//           push-уведомлений, очистки данных вне проектов
// ============================================================================

// --- Приватные хелперы ---

let _ctx = null;
function bindCtx(ctx) { _ctx = ctx; }
window.AppModeUtilsShared = { bindCtx: bindCtx };

function _storage() {
    if (_ctx && _ctx.storage) return _ctx.storage;
    if (window.RBI?.services?.storage) return window.RBI.services.storage;
    return {
        get:    (store, id) => typeof dbGet    === 'function' ? dbGet(store, id)   : Promise.resolve(null),
        getAll: (store)     => typeof dbGetAll === 'function' ? dbGetAll(store)     : Promise.resolve([]),
        put:    (store, v)  => typeof dbPut    === 'function' ? dbPut(store, v)     : Promise.resolve(),
        delete: (store, id) => typeof dbDelete === 'function' ? dbDelete(store, id) : Promise.resolve(),
        stores: function () { return typeof STORES !== 'undefined' ? STORES : {}; },
    };
}

function _getSetting(key) {
    const svc = (_ctx && _ctx.settings) || window.RBI.services.settings;
    return svc.get(key);
}

function _setSetting(key, value) {
    const svc = (_ctx && _ctx.settings) || window.RBI.services.settings;
    return svc.set(key, value);
}

function _isDemoMode() {
    const svc = (_ctx && _ctx.appMode) || window.RBI.services.appMode;
    return svc.isDemo();
}

/** Shell label via i18n; fallback literal if service not ready yet. */
function _t(key, fallback) {
    const i18n = (_ctx && _ctx.services && _ctx.services.i18n) ||
        (window.RBI && window.RBI.services && window.RBI.services.i18n);
    if (i18n && typeof i18n.t === 'function') {
        const tr = i18n.t(key);
        if (tr && tr !== key) return tr;
    }
    return fallback;
}

function _modeLabelText(modeId) {
    var map = {
        quality: ['nav.quality', 'Качество'],
        construction: ['nav.construction', 'Стройконтроль'],
        knowledge: ['nav.knowledge', 'База знаний'],
        'construction-v2': ['nav.construction_v2', 'Стройконтроль в2 (тест)'],
        safety: ['nav.safety', 'Безопасность'],
        warranty: ['nav.warranty', 'Гарантия'],
        uk: ['nav.uk', 'УК (Упр. компания)']
    };
    var pair = map[modeId];
    if (pair) return _t(pair[0], pair[1]);
    return modeId || '';
}

function _setCurrentModeLabel(modeId) {
    var label = document.getElementById('current-mode-label');
    if (!label) return;
    label.textContent = _modeLabelText(modeId) + ' ▾';
}

var _appModeI18nBound = false;
function bindAppModeI18n() {
    if (_appModeI18nBound) return;
    _appModeI18nBound = true;
    if (!(window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function')) return;
    window.RBI.events.on('i18n:localeChanged', function () {
        try {
            if (window.AppModeManager && window.AppModeManager.currentMode) {
                _setCurrentModeLabel(window.AppModeManager.currentMode);
            }
        } catch (_e) { /* ignore */ }
    });
}

function _session() {
    if (_ctx && _ctx.session) return _ctx.session;
    if (window.RBI?.services?.session) return window.RBI.services.session;
    return {
        getState: () => window.state,
        getDetails: () => window.details,
        getPhotos: () => window.photos,
        getTemplateKey: () => window.currentTemplateKey,
        setTemplateKey: (key) => { window.currentTemplateKey = key; },
        setChecklist: (groups) => { window.currentChecklist = groups; },
        setPhotoRaw: (k, v) => { if (window.photos) window.photos[k] = v; },
        replaceState: (obj) => { window.state = obj; },
        replaceDetails: (obj) => { window.details = obj; },
        replacePhotos: (obj) => { window.photos = obj; },
    };
}

function _skSvc() { return (_ctx && _ctx.sk) || window.RBI.services.sk; }
function _tasksSvc() { return (_ctx && _ctx.tasks) || window.RBI.services.tasks; }
function _knowledgeSvc() { return (_ctx && _ctx.knowledge) || window.RBI.services.knowledge; }
function _gameSvc() { return (_ctx && _ctx.game) || window.RBI.services.game; }

function _getSkRecords() {
    return _skSvc().getRecordsSync();
}
function _getSkVolumes() {
    return _skSvc().getVolumesSync();
}
function _getSkContractorMap() {
    return _skSvc().getContractorMapSync();
}
function _templates() {
    const svc = (_ctx && _ctx.templates) || (window.RBI && window.RBI.services && window.RBI.services.templates);
    if (svc) {
        return svc;
    }
    return {
        getUserTemplates: function () {
            return typeof window.userTemplates !== 'undefined' ? window.userTemplates : {};
        },
        getSystemTemplates: function () {
            return typeof window.SYSTEM_TEMPLATES !== 'undefined' ? window.SYSTEM_TEMPLATES : {};
        }
    };
}
function _ensureSkRecords() {
    return _skSvc().ensureRecordsSync();
}
function _setSkRecords(arr) {
    return _skSvc().setRecordsSync(arr);
}
function _setSkVolumes(obj) {
    return _skSvc().setVolumesSync(obj);
}
function _setSkContractorMap(obj) {
    return _skSvc().setContractorMapSync(obj);
}

function _getTasks() {
    return _tasksSvc().getTasksSync();
}
function _ensureTasks() {
    return _tasksSvc().ensureTasksSync();
}
function _setTasks(arr) {
    return _tasksSvc().setTasksSync(arr);
}
function _getSchedule() {
    return _tasksSvc().getScheduleSync();
}
function _ensureSchedule() {
    return _tasksSvc().ensureScheduleSync();
}
function _setSchedule(arr) {
    return _tasksSvc().setScheduleSync(arr);
}
function _getFmea() {
    return _tasksSvc().getFmeaSync();
}
function _ensureFmea() {
    return _tasksSvc().ensureFmeaSync();
}
function _setFmea(arr) {
    return _tasksSvc().setFmeaSync(arr);
}
function _getPractices() {
    return _tasksSvc().getPracticesSync();
}
function _ensurePractices() {
    return _tasksSvc().ensurePracticesSync();
}
function _setPractices(arr) {
    return _tasksSvc().setPracticesSync(arr);
}
function _getInterventions() {
    return _tasksSvc().getInterventionsSync();
}
function _ensureInterventions() {
    return _tasksSvc().ensureInterventionsSync();
}
function _setInterventions(arr) {
    return _tasksSvc().setInterventionsSync(arr);
}
function _getMeetings() {
    return _tasksSvc().getMeetingsSync();
}
function _ensureMeetings() {
    return _tasksSvc().ensureMeetingsSync();
}
function _setMeetings(arr) {
    return _tasksSvc().setMeetingsSync(arr);
}

function _getTwiCards() {
    return _knowledgeSvc().getTwiCardsSync();
}
function _ensureTwiCards() {
    return _knowledgeSvc().ensureTwiCardsSync();
}
function _setTwiCards(arr) {
    return _knowledgeSvc().setTwiCardsSync(arr);
}
function _getCustomDocs() {
    return _knowledgeSvc().getCustomDocsSync();
}
function _setCustomDocs(arr) {
    return _knowledgeSvc().setCustomDocsSync(arr);
}
function _getCustomNodes() {
    return _knowledgeSvc().getCustomNodesSync();
}
function _setCustomNodes(arr) {
    return _knowledgeSvc().setCustomNodesSync(arr);
}
function _getWeeklyPlan() {
    return _gameSvc().getWeeklyPlanSync();
}
function _setWeeklyPlan(obj) {
    return _gameSvc().setWeeklyPlanSync(obj);
}
function _getGameActionLogs() {
    return _gameSvc().getGameActionLogsSync();
}
function _setGameActionLogs(arr) {
    return _gameSvc().setGameActionLogsSync(arr);
}

// --- Демо-режим (RAM-only показ демо-данных) ---
// Перенесено из app.js (блок «СОВЕРШЕННЫЙ ДЕМО-РЕЖИМ», строки 3985–4453).
// ВНИМАНИЕ: это ДРУГОЙ механизм, чем _isDemoMode() выше (тот читает
// appSettings.demoMode — настройку режима quality/construction). Не путать
// и не объединять два механизма.
let isDemoMode = window.isDemoMode || false;
window.isDemoMode = isDemoMode;
function _setIsDemoMode(v) {
    isDemoMode = v;
    window.isDemoMode = isDemoMode;
}

// «Сейфы» для реальных данных на время демо-режима
let realState = {}, realDetails = {}, realPhotos = {}, realContractorArray = [], realTemplateKey = '';
let real_rbi_tasksData = [], real_weeklyPlanData = {}, real_gameActionLogs = [];
let real_rbi_meetingsData = [], real_rbi_interventionsData = [], real_rbi_practicesData = [];
let realTwiCards = [], realCustomDocs = [], realCustomNodes = [];
let real_skRecords = [], real_skVolumes = {}, real_skContractorMap = {};
let real_rbi_fmeaRecords = [], real_rbi_scheduleData = [];

function _triggerSync(mode) {
    if (_ctx && _ctx.sync) return _ctx.sync.trigger(mode);
    if (window.RBI?.services?.sync?.trigger) return window.RBI.services.sync.trigger(mode);
    if (typeof triggerSync === 'function') return triggerSync(mode);
}

// ============================================================================
// === ФУНКЦИИ ЛОГОТИПА (С поддержкой прозрачных PNG) ===
// ============================================================================

function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return showToast("Файл слишком большой! Максимум 2 МБ.");

    const reader = new FileReader();
    reader.onload = async function (e) {
        let mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');

            if (mimeType === 'image/jpeg') {
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.drawImage(img, 0, 0);

            const base64Logo = canvas.toDataURL(mimeType, 0.9);

            saveSettings('isBrandingCustomized', true);
            saveSettings('brandLogo', base64Logo);
            renderSettingsTab();
            showToast("✅ Фирменный логотип RBI успешно сохранен!");
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function removeBrandLogo() {
    saveSettings('isBrandingCustomized', true);
    saveSettings('brandLogo', '');
    renderSettingsTab();
    showToast("🗑️ Логотип удален");
}

async function publishCorporateBranding() {
    if (!window.supabaseClient) return showToast("❌ Облако не подключено!");
    showToast("⏳ Публикация корпоративного стиля...");
    try {
        // P2-0037: при входе по почте оформление — одно на компанию (ключ — id компании входа), не на объект
        const qs = window.RBI && window.RBI.qualitySync;
        const pCode = (qs && qs.active && qs.companyId) ? qs.companyId : window.syncConfig?.projectCode;
        let logoUrl = _getSetting('brandLogo');

        if (logoUrl && (logoUrl.startsWith('data:') || logoUrl.startsWith('local://'))) {
            logoUrl = await window.rbiUploadAsset(logoUrl, 'custom-assets', `${pCode}/branding/logo`, 'photo');
        }

        const payload = {
            project_code: pCode,
            logo_url: logoUrl || '',
            brand_color: _getSetting('brandColor') || '#1c2b39',
            updated_at: new Date().toISOString()
        };

        const { error } = await window.supabaseClient.from('project_settings').upsert(payload, { onConflict: 'project_code' });
        if (error) throw error;

        saveSettings('isBrandingCustomized', false);

        showToast("✅ Корпоративный стиль опубликован для всех!");
        renderSettingsTab();
    } catch (e) {
        console.error(e);
        showToast("❌ Ошибка публикации");
    }
}

function resetToCorporateBranding() {
    saveSettings('isBrandingCustomized', false);
    localStorage.setItem('rbi_cloud_dirty', '1');
    _triggerSync('manual');
    showToast("⏳ Запрос корпоративного стиля...");
}

// ============================================================================
// === Применить связь подрядчика ко всей истории осмотров ===
// ============================================================================

async function applyContractorAliasToInspectionHistory(rawName, canonicalKey, displayName) {
    if (!rawName || !canonicalKey || !displayName) return 0;

    const records = await _storage().getAll(_storage().stores().HISTORY) || [];
    const rawClean = String(rawName || '').trim().toLowerCase();
    const nowIso = new Date().toISOString();

    let updated = 0;

    for (const rec of records) {
        if (!rec || rec._deleted || rec.is_deleted) continue;

        const recName = String(
            rec.contractor_raw_name ||
            rec.contractorName ||
            rec.contractor_name ||
            ''
        ).trim().toLowerCase();

        if (recName === rawClean) {
            rec.contractor_raw_name = rec.contractor_raw_name || rec.contractorName || rec.contractor_name || rawName;

            rec.contractorName = displayName;
            rec.contractor_name = displayName;
            rec.contractor_canonical_key = canonicalKey;
            rec.contractor_normalization_status = 'matched';

            rec.source = 'local';
            rec.syncStatus = 'not_synced';
            rec.sync_status = 'not_synced';
            rec.syncBlockReason = '';
            rec.sync_block_reason = '';

            rec.updatedAt = nowIso;
            rec.updated_at = nowIso;
            rec._updatedAt = nowIso;

            await _storage().put(_storage().stores().HISTORY, rec);
            updated++;
        }
    }

    if (updated > 0) {
        window.contractorArray = (await _storage().getAll(_storage().stores().HISTORY) || []).filter(x => !x._deleted && !x.is_deleted)
            .map(window.RbiHistoryMemory ? window.RbiHistoryMemory.lighten : (x) => x); // P2-0024

        localStorage.setItem('rbi_cloud_dirty', '1');

        if (typeof window.updateAllDynamicFilters === 'function') {
            window.updateAllDynamicFilters();
        }
    }

    console.log(`[Подрядчики] История обновлена по алиасу "${rawName}" → "${displayName}". Записей: ${updated}`);

    return updated;
}

async function openNodeAttachmentPdf(url, name, size) {
    await window.rbiOpenPdfInTwiViewer(
        url,
        name || 'PDF вложение',
        'Вложение узла',
        name || 'document.pdf',
        size || ''
    );
}

// ============================================================================
// === УПРАВЛЕНИЕ РЕЖИМАМИ ПРИЛОЖЕНИЯ (QUALITY / CONSTRUCTION и т.д.) ===
// ============================================================================

function isValidBusinessMode(mode) {
    return mode === 'quality' || mode === 'construction' || mode === 'knowledge';
}

function isConstructionV2TestMode(mode) {
    return mode === 'construction-v2';
}

/** knowledge ∈ availableModules (enabled ∩ role). Default true if context missing. */
function isKnowledgeAvailable() {
    try {
        // P2-0031: вход по почте — по выключателю «База знаний» у компании (ответ сервера), как пункт меню
        var sh = window.RBI && window.RBI.services && window.RBI.services.shell;
        if (sh && typeof sh.platformEntryMode === 'function' && sh.platformEntryMode() === 'email'
            && typeof sh.legacyModuleAllowed === 'function') {
            return sh.legacyModuleAllowed('knowledge');
        }
        var uc = window.RBI && window.RBI.services && window.RBI.services.userContext;
        if (uc && typeof uc.getUserContext === 'function') {
            var snap = uc.getUserContext();
            if (snap && Array.isArray(snap.availableModules)) {
                return snap.availableModules.indexOf('knowledge') !== -1;
            }
        }
        var company = window.RBI && window.RBI.services && window.RBI.services.company;
        if (company && typeof company.getCompany === 'function') {
            var em = company.getCompany().enabledModules;
            if (Array.isArray(em)) return em.indexOf('knowledge') !== -1;
        }
    } catch (_e) { /* ignore */ }
    return true;
}

const AppModeManager = {
    currentMode: 'quality',
    previousMode: 'quality',

    init() {
        const savedMode = localStorage.getItem('rbi_app_mode');
        this.currentMode = savedMode || 'quality';

        const shell = window.RBI?.services?.shell;
        const selectedModules = shell && typeof shell.setSelectedModules === 'function'
            ? shell.setSelectedModules(shell.getSelectedModules())
            : null;
        // construction-v2 — тестовый вход, не входит в selected business modules
        const modeAllowed = selectedModules
            && (selectedModules.indexOf(this.currentMode) !== -1
                || (isConstructionV2TestMode(this.currentMode)
                    && selectedModules.indexOf('construction') !== -1));
        if (selectedModules && !modeAllowed) {
            this.currentMode = selectedModules[0];
            localStorage.setItem('rbi_app_mode', this.currentMode);
        }
        // Peer knowledge только knowledge-only; иначе БЗ — экран Q/C (как на ПК).
        if (selectedModules && this.currentMode === 'knowledge'
            && shell && typeof shell.isKnowledgePeerVisible === 'function'
            && !shell.isKnowledgePeerVisible(selectedModules)
            && typeof shell.resolveKnowledgeEntry === 'function') {
            const entry = shell.resolveKnowledgeEntry(this.previousMode || 'quality');
            this.currentMode = entry.mode;
            localStorage.setItem('rbi_app_mode', this.currentMode);
            const hash = String(window.location.hash || '');
            if (hash.indexOf('#/knowledge') === 0) {
                const suffix = hash.slice('#/knowledge'.length);
                const nextHash = entry.path + suffix;
                try {
                    history.replaceState(null, '', window.location.pathname + window.location.search + nextHash);
                } catch (_e) { /* ignore */ }
            }
        }

        const selector = document.getElementById('app-mode-selector');
        const label = document.getElementById('current-mode-label');
        if (selector && label) {
            selector.value = this.currentMode;
            _setCurrentModeLabel(this.currentMode);
        }
        bindAppModeI18n();

        if (shell && typeof shell.renderCompanyBlock === 'function') {
            shell.renderCompanyBlock();
            if (typeof shell.onOnlineStatusChange === 'function') {
                shell.onOnlineStatusChange(() => shell.renderCompanyBlock());
            }
        }
        if (shell && typeof shell.renderSidebar === 'function') {
            shell.renderSidebar();
        }
        if (shell && typeof shell.renderMobileModuleMenu === 'function') {
            shell.renderMobileModuleMenu();
        }

        this.renderBottomNav();
        this.updateHeaderVisibility();
    },

    /**
     * opts.fromRoute — режим меняет показ маршрута (назад/вперёд, прямой адрес): экран уже нужный, никуда не переходить (P2-0011;
     * раньше переход на главную модуля уводил «назад» с «Инженера» на «Осмотр»). Переключение пользователем — новым шагом
     * истории (раньше replace: «назад» пропускал предыдущий экран); из Настроек — по-прежнему replace.
     */
    changeMode(newMode, opts) {
        const fromRoute = !!(opts && opts.fromRoute);
        const hash = window.location.hash || '';
        const onSettings = /^#\/settings(\/|$)/i.test(hash)
            || /^#\/quality\/settings(\/|$)/i.test(hash);

        // БЗ при наличии Q/C — экран reference host-модуля, не peer #/knowledge.
        if (newMode === 'knowledge') {
            const shellKb = window.RBI?.services?.shell;
            if (shellKb && typeof shellKb.resolveKnowledgeEntry === 'function') {
                const entry = shellKb.resolveKnowledgeEntry(this.currentMode);
                if (entry.mode !== 'knowledge') {
                    if (this.currentMode === entry.mode) {
                        this.renderBottomNav();
                        this.updateHeaderVisibility();
                        if (shellKb.renderSidebar) shellKb.renderSidebar();
                        if (shellKb.renderMobileModuleMenu) shellKb.renderMobileModuleMenu();
                        window.AppRouter.navigate(entry.path, true);
                        return;
                    }
                    newMode = entry.mode;
                    // Fall through to normal switch, then override home → reference.
                    this._pendingKnowledgeReferencePath = entry.path;
                }
            }
        }

        // P2-0011: открыт модуль платформы (План/Факт …, пункт меню из манифеста) — режим прежний, но экран чужой;
        // без этого клик по «Качество» из План/Факт ничего не делал (переключение «не с первого раза»).
        const platformItems = (window.RBI && window.RBI.moduleLoader && typeof window.RBI.moduleLoader.getMenuItems === 'function')
            ? window.RBI.moduleLoader.getMenuItems() : [];
        const onPlatform = platformItems.some((it) => it && it.path && (hash === it.path || hash.indexOf(it.path + '/') === 0));

        // Тот же режим, но открыты Настройки (chrome) или модуль платформы — выйти в home модуля.
        // Иначе early-return оставлял hash на #/settings и F5 снова открывал настройки.
        if (this.currentMode === newMode) {
            if (!onSettings && !onPlatform && !this._pendingKnowledgeReferencePath) return;
            // P2-0030: План/Факт прячет плашку «Стройконтроль — бета» — вернувшись в Стройконтроль, показать снова
            const bannerSame = document.getElementById('construction-warning-banner');
            if (bannerSame) bannerSame.style.display = newMode === 'construction' ? 'flex' : 'none';
            this.renderBottomNav();
            this.updateHeaderVisibility();
            const shellSame = window.RBI?.services?.shell;
            if (shellSame && typeof shellSame.renderSidebar === 'function') {
                shellSame.renderSidebar();
            }
            if (shellSame && typeof shellSame.renderMobileModuleMenu === 'function') {
                shellSame.renderMobileModuleMenu();
            }
            if (this._pendingKnowledgeReferencePath) {
                const refPath = this._pendingKnowledgeReferencePath;
                this._pendingKnowledgeReferencePath = null;
                window.AppRouter.navigate(refPath, true);
                return;
            }
            switch (newMode) {
                case 'quality':
                    window.AppRouter.navigate('#/quality/audit', !onPlatform);   // из модуля платформы — новым шагом истории («назад» вернёт)
                    break;
                case 'construction':
                    window.AppRouter.navigate('#/construction/defects', !onPlatform);
                    break;
                case 'knowledge':
                    window.AppRouter.navigate('#/knowledge', !onPlatform);
                    break;
                case 'construction-v2':
                    window.AppRouter.navigate('#/construction-v2', !onPlatform);
                    break;
                default:
                    break;
            }
            return;
        }

        const shell = window.RBI?.services?.shell;
        if (shell && typeof shell.getSelectedModules === 'function') {
            const selectedModules = shell.getSelectedModules();
            if (isConstructionV2TestMode(newMode)) {
                // Тестовый v2 доступен, если выбран обычный Стройконтроль
                if (selectedModules.indexOf('construction') === -1) return;
            } else if (selectedModules.indexOf(newMode) === -1 && isValidBusinessMode(newMode)) {
                return;
            }
        }

        this.previousMode = this.currentMode;
        this.currentMode = newMode;
        localStorage.setItem('rbi_app_mode', newMode);

        const selector = document.getElementById('app-mode-selector');
        const label = document.getElementById('current-mode-label');
        if (selector && label) {
            if ([...selector.options].some((o) => o.value === newMode)) {
                selector.value = newMode;
            }
            _setCurrentModeLabel(newMode);
        }

        this.renderBottomNav();
        this.updateHeaderVisibility();
        if (shell && typeof shell.renderSidebar === 'function') {
            shell.renderSidebar();
        }
        if (shell && typeof shell.renderMobileModuleMenu === 'function') {
            shell.renderMobileModuleMenu();
        }

        const knowledgeRef = this._pendingKnowledgeReferencePath;
        this._pendingKnowledgeReferencePath = null;

        // тот же адрес (переход вызван показом маршрута, как у «Базы знаний») — replace, без дубля шага истории
        const go = (p) => { if (!fromRoute) window.AppRouter.navigate(p, onSettings || p === hash); };
        switch (newMode) {
            case 'quality':
                document.getElementById('construction-warning-banner').style.display = 'none';
                go(knowledgeRef || '#/quality/audit');
                break;
            case 'construction':
                document.getElementById('construction-warning-banner').style.display = 'flex';
                go(knowledgeRef || '#/construction/defects');
                break;
            case 'knowledge':
                document.getElementById('construction-warning-banner').style.display = 'none';
                go('#/knowledge');
                break;
            case 'construction-v2':
                document.getElementById('construction-warning-banner').style.display = 'none';
                go('#/construction-v2');
                break;
            case 'safety':
                go('#/safety/placeholder');
                break;
            case 'warranty':
                go('#/warranty/placeholder');
                break;
            case 'uk':
                go('#/uk/placeholder');
                break;
        }

        try {
            if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') {
                window.RBI.events.emit('appMode:changed', {
                    mode: newMode,
                    previousMode: this.previousMode
                });
            }
        } catch (_) { /* ignore */ }
    },

    revertToPrevious() {
        this.changeMode(this.previousMode || 'quality');
    },

    updateHeaderVisibility(showHeader) {
        const header = document.getElementById('main-header');
        if (!header) return;

        if (!showHeader) {
            header.style.display = 'none';
            return;
        }

        header.style.display = 'block';

        const checklistContainer = document.getElementById('header-checklist-container');
        const dashboard = document.getElementById('header-dashboard');
        const dataBlock = document.getElementById('header-data-block');

        if (this.currentMode === 'quality') {
            if (checklistContainer) checklistContainer.style.display = 'flex';
            if (dashboard && _getSetting('dashboardMode') !== 'hidden') {
                dashboard.style.display = 'block';
            } else if (dashboard) {
                dashboard.style.display = 'none';
            }
            if (dataBlock) dataBlock.style.display = 'block';
        } else {
            if (checklistContainer) checklistContainer.style.display = 'none';
            if (dashboard) dashboard.style.display = 'none';
            if (dataBlock) dataBlock.style.display = 'none';
        }
    },

    renderBottomNav() {
        const nav = document.getElementById('main-bottom-nav');
        if (!nav) return;

        let html = '';
        const L = {
            audit: _t('nav.bottom.audit', 'Осмотр'),
            engineer: _t('nav.bottom.engineer', 'Инженер'),
            analytics: _t('nav.bottom.analytics', 'Аналитика'),
            knowledge: _t('nav.bottom.knowledge', 'БЗ'),
            settings: _t('nav.bottom.settings', 'Настройки'),
            defects: _t('nav.bottom.defects', 'Дефекты'),
            acceptance: _t('nav.bottom.acceptance', 'Приёмка'),
            transfer: _t('nav.bottom.transfer', 'Шахматка'),
            reportsSk: _t('nav.bottom.reports_sk', 'Отчеты СК'),
            plans: _t('nav.bottom.plans', 'Планы'),
            remarks: _t('nav.bottom.remarks', 'Замечания'),
            transferV2: _t('nav.bottom.transfer_v2', 'Передача'),
            metrics: _t('nav.bottom.metrics', 'Сроки'),
            cabinet: _t('nav.bottom.cabinet', 'Кабинет')
        };

        // Platform 2.0: модуль платформы (План/Факт …) задаёт свои подвкладки через window.RBI.platformNav —
        // тот же нижний таббар (телефон/планшет) и nav2 (≥1280), что у Quality. Пока модуль не активен, platformNav = null.
        const pnav = window.RBI && window.RBI.platformNav;
        const platformNavOn = !!(pnav && Array.isArray(pnav.items) && pnav.items.length);
        if (platformNavOn) {
            html = pnav.items.map((it) => `
                <div class="nav-item" data-path="${it.path}">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${it.icon || ''}"></path></svg>
                    <span class="nav-text">${it.label}</span>
                </div>`).join('') + `
                <div class="nav-item" data-path="#/settings">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    <span class="nav-text">${L.settings}</span>
                </div>
            `;
            nav.style.display = 'flex';
        } else if (window.RBI && window.RBI.services && window.RBI.services.shell
            && typeof window.RBI.services.shell.platformEntryMode === 'function'
            && window.RBI.services.shell.platformEntryMode() === 'email'
            && !(typeof window.RBI.services.shell.legacyModuleAllowed === 'function'
                 && window.RBI.services.shell.legacyModuleAllowed(this.currentMode))) {
            // P2-0013: вошедшему почтой подвкладки старого Quality / Стройконтроля не показываются;
            // P2-0016: кроме модулей, включённых у компании (дальше — обычные подвкладки режима).
            html = `
                <div class="nav-item" data-path="#/settings">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    <span class="nav-text">${L.settings}</span>
                </div>
            `;
            nav.style.display = 'flex';
        } else if (this.currentMode === 'quality') {
            html = `
                <div class="nav-item" data-path="#/quality/audit">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                    <span class="nav-text">${L.audit}</span>
                </div>
                <div class="nav-item" data-path="#/quality/engineer">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"></path></svg>
                    <span class="nav-text">${L.engineer}</span>
                </div>
                <div class="nav-item" data-path="#/quality/analytics">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                    <span class="nav-text">${L.analytics}</span>
                </div>
                ${isKnowledgeAvailable() ? `<div class="nav-item" data-path="#/quality/reference">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                    <span class="nav-text">${L.knowledge}</span>
                </div>` : ''}
                <div class="nav-item" data-path="#/settings">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    <span class="nav-text">${L.settings}</span>
                </div>
            `;
            nav.style.display = 'flex';
        } else if (this.currentMode === 'construction') {
            html = `
                <div class="nav-item" data-path="#/construction/defects">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>
                    <span class="nav-text">${L.defects}</span>
                </div>
                <div class="nav-item" data-path="#/construction/acceptance">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                    <span class="nav-text">${L.acceptance}</span>
                </div>
                <div class="nav-item" data-path="#/construction/transfer">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
                    <span class="nav-text">${L.transfer}</span>
                </div>
                ${isKnowledgeAvailable() ? `<div class="nav-item" data-path="#/construction/reference">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                    <span class="nav-text">${L.knowledge}</span>
                </div>` : ''}
                <div class="nav-item" data-path="#/construction/reports">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"></path></svg>
                    <span class="nav-text">${L.reportsSk}</span>
                </div>
                 <div class="nav-item" data-path="#/settings">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    <span class="nav-text">${L.settings}</span>
                </div>
            `;
            nav.style.display = 'flex';
        } else if (this.currentMode === 'knowledge') {
            html = `
                <div class="nav-item" data-path="#/knowledge">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                    <span class="nav-text">${L.knowledge}</span>
                </div>
                <div class="nav-item" data-path="#/settings">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    <span class="nav-text">${L.settings}</span>
                </div>
            `;
            nav.style.display = 'flex';
        } else if (this.currentMode === 'construction-v2') {
            html = `
                <div class="nav-item" data-path="#/construction-v2">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>
                    <span class="nav-text">${L.plans}</span>
                </div>
                <div class="nav-item" data-path="#/construction-v2/defects">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    <span class="nav-text">${L.remarks}</span>
                </div>
                <div class="nav-item" data-path="#/construction-v2/acceptance">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5h6m-3 4v6m-3-3h6"></path></svg>
                    <span class="nav-text">${L.acceptance}</span>
                </div>
                <div class="nav-item" data-path="#/construction-v2/transfer">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"></path></svg>
                    <span class="nav-text">${L.transferV2}</span>
                </div>
                <div class="nav-item" data-path="#/construction-v2/metrics">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span class="nav-text">${L.metrics}</span>
                </div>
                <div class="nav-item" data-path="#/construction-v2/cabinet">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"></path></svg>
                    <span class="nav-text">${L.cabinet}</span>
                </div>
                <div class="nav-item" data-path="#/settings">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    <span class="nav-text">${L.settings}</span>
                </div>
            `;
            nav.style.display = 'flex';
        } else {
            nav.style.display = 'none';
        }

        nav.innerHTML = html;

        if (window.RBI && window.RBI.shellDesktop && typeof window.RBI.shellDesktop.fillNav2 === 'function') {
            window.RBI.shellDesktop.fillNav2(html, platformNavOn ? 'platform' : this.currentMode);
        }

        if (typeof updateBodyPadding === 'function') updateBodyPadding();
        if (window.AppRouter) window.AppRouter.updateNavHighlight(window.location.hash);
    }
};

// Глобальные прокси-функции для вызова из HTML
function changeAppMode(mode) {
    AppModeManager.changeMode(mode);
}

// P2-0011: режим = адрес. Показан экран другого бизнес-модуля (назад/вперёд, ссылка, F5) — переключить режим без перехода,
// чтобы меню (таббар, nav2, боковое) было от открытого модуля. «База знаний» (#/knowledge) — своя логика в renderKnowledge.
function modeFromPath(path) {
    const p = String(path || '');
    if (/^#\/quality(\/|$)/.test(p)) return 'quality';
    if (/^#\/construction-v2(\/|$)/.test(p)) return 'construction-v2';
    if (/^#\/construction(\/|$)/.test(p)) return 'construction';
    return null;
}
window.addEventListener('rbi:route', function (e) {
    const m = modeFromPath(e && e.detail && e.detail.path);
    if (m && AppModeManager.currentMode !== m) AppModeManager.changeMode(m, { fromRoute: true });
});

function revertToPreviousMode() {
    AppModeManager.revertToPrevious();
}

// ============================================================================
// === МОДУЛЬ PUSH-УВЕДОМЛЕНИЙ (ТУМБЛЕР) ===
// ============================================================================

async function togglePushSettings(element) {
    const isChecked = element.checked;

    if (isChecked) {
        if (!('Notification' in window)) {
            showToast("❌ Ваш браузер/устройство не поддерживает Push-уведомления");
            element.checked = false;
            return;
        }

        const permission = await Notification.requestPermission();

        if (permission === 'granted') {
            showToast("✅ Уведомления включены!");
            _setSetting('pushEnabled', true);

            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(registration => {
                    registration.showNotification("RBI Platform", {
                        body: "Уведомления успешно настроены! Тумблер активирован.",
                        icon: "./icons/icon-512-2.png",
                        badge: "./icons/icon-512-2.png",
                        vibrate: [200, 100, 200]
                    });
                });
            }
        } else {
            showToast("⚠️ Вы запретили уведомления в настройках браузера/телефона");
            element.checked = false;
            _setSetting('pushEnabled', false);
        }
    } else {
        showToast("🔕 Уведомления отключены");
        _setSetting('pushEnabled', false);
    }
}

function initPushToggleState() {
    const toggle = document.getElementById('set-push-notifications');
    if (!toggle) return;

    if ('Notification' in window && Notification.permission === 'denied') {
        _setSetting('pushEnabled', false);
    }

    toggle.checked = !!_getSetting('pushEnabled');
}

document.addEventListener("DOMContentLoaded", () => {
    setTimeout(initPushToggleState, 500);
});

// ============================================================================
// === ФУНКЦИЯ: Очистка локальных данных при смене закрепленных объектов ===
// ============================================================================

async function purgeDataOutsideAssignedProjects(assignedKeysArray) {
    const permSvc = (_ctx && _ctx.permissions) || window.RBI.services.permissions;
    const role = permSvc ? permSvc.getCurrentRole() : 'guest';
    if (permSvc ? permSvc.canManageHierarchy() : ['director', 'deputy_manager', 'manager'].includes(role)) {
        return;
    }
    const keysToKeep = assignedKeysArray || [];
    if (typeof showToast === 'function') showToast("🧹 Обновление прав: очистка неактуальных данных...");

    const storesToClean = [
        _storage().stores().HISTORY, _storage().stores().TASKS, _storage().stores().FMEA,
        _storage().stores().MEETINGS, _storage().stores().INTERVENTIONS, _storage().stores().SK_RECORDS, _storage().stores().PRACTICES
    ];

    let deletedCount = 0;
    let photosToDelete = new Set();

    for (let store of storesToClean) {
        try {
            const items = await _storage().getAll(store);
            if (!items) continue;

            const permSvcMatch = (_ctx && _ctx.permissions) || window.RBI.services.permissions;
            const inAssigned = (rec, names) => {
                if (permSvcMatch && typeof permSvcMatch.isRecordInAssignedProjects === 'function') {
                    return permSvcMatch.isRecordInAssignedProjects(rec, keysToKeep);
                }
                return names.some((n) => keysToKeep.includes(n));
            };
            const mergePolicy = window.RbiSyncMergePolicy;

            for (let item of items) {
                // P2-0023: не трогаем «Все объекты», записи по нескольким объектам (если назначен хоть один)
                // и неотправленные записи (любой статус ожидания, не только not_synced).
                if (mergePolicy) {
                    if (mergePolicy.keepOnPurge(item, inAssigned)) continue;
                } else if (item.syncStatus === 'not_synced' || item.sync_status === 'not_synced' || item.source === 'local') {
                    continue;
                }

                const pKey = item.project_canonical_key || item.projectName || item.project || item.project_display_name || '';
                const keep = mergePolicy ? false : (() => {
                    if (!pKey || pKey === 'Все' || pKey === 'Системная') return false;
                    return inAssigned(item, [pKey]);
                })();

                if (pKey && pKey !== 'Все' && pKey !== 'Системная' && !keep) {
                    // RBI NEW (Множественные фото к пункту чек-листа, B1): значение
                    // photos[itemId] может быть массивом — нормализуем перед .startsWith.
                    if (item.photos) Object.values(item.photos).forEach(rawValue => {
                        const arr = window.normalizeItemPhotos ? window.normalizeItemPhotos(rawValue) : [rawValue];
                        arr.forEach(p => { if (String(p).startsWith('local://')) photosToDelete.add(p); });
                    });
                    if (item.photo && String(item.photo).startsWith('local://')) photosToDelete.add(item.photo);

                    await _storage().delete(store, item.id || item.slug);
                    deletedCount++;
                }
            }
        } catch (e) {
            console.warn(`[Purge] Ошибка очистки хранилища ${store}:`, e);
        }
    }

    if (photosToDelete.size > 0) {
        for (let photoId of photosToDelete) {
            await _storage().delete(_storage().stores().PHOTOS, photoId);
        }
    }

    if (deletedCount > 0) {
        console.log(`[Purge] Удалено ${deletedCount} неактуальных записей и ${photosToDelete.size} фото.`);
        setTimeout(() => { window.location.reload(); }, 1500);
    }
}

// ============================================================================
// === БЛОК: СОВЕРШЕННЫЙ ДЕМО-РЕЖИМ (ПОЛНОЕ ПОКРЫТИЕ ФУНКЦИОНАЛА) ===
// Перенесено из app.js (строки 3985–4453). Бареные обращения к состоянию
// app.js (state/details/photos/contractorArray/currentTemplateKey/
// currentChecklist/weeklyPlanData/gameActionLogs/customTwiCards/customDocs/
// customNodes) заменены на window.* — см. _ai/CURRENT_STEP.md.
// ============================================================================
function rbi_enrichDemoModeV2({ demoPhotoGood, demoPhotoBad, nowIso } = {}) {
    const now = nowIso || new Date().toISOString();
    const good = demoPhotoGood || window.rbiPhotoPlaceholder || '';
    const bad = demoPhotoBad || window.rbiPhotoPlaceholder || '';

    _ensureTasks();
    _ensureFmea();
    _ensureMeetings();
    _ensureInterventions();
    _ensurePractices();
    _ensureSkRecords();

    const twiCards = _ensureTwiCards();

    const pushUnique = (arr, item) => {
        if (!Array.isArray(arr) || !item || !item.id) return;
        if (!arr.some(x => String(x.id) === String(item.id))) arr.push(item);
    };

    pushUnique(twiCards, {
        id: 'demo_twi_windows_apply_v2',
        title: 'TWI: Герметизация примыкания окон',
        checklistKey: 'sys_okna_pvh',
        checklistName: 'Окна ПВХ',
        type: 'INSPECTOR',
        itemId: '1617',
        whyImportant: 'Риск продувания, протечек, промерзания и гарантийных обращений.',
        howToCheck: 'Проверить подготовку основания, непрерывность герметизации, примыкания по периметру и фотофиксацию до закрытия откосов.',
        photoGood: good,
        photoBad: bad,
        createdAt: now,
        updatedAt: now
    });

    pushUnique(twiCards, {
        id: 'demo_twi_finish_worker_v2',
        title: 'Инструкция: подготовка основания под отделку',
        checklistKey: 'sys_otdelka_mop',
        checklistName: 'Отделка МОП',
        type: 'WORKER',
        itemId: 'ALL',
        totalTime: 7,
        steps: [
            { order: 1, text: 'Проверить основание: нет пыли, непрочных участков и мусора.', time: 2, photo: good },
            { order: 2, text: 'Устранить дефекты основания до начала следующего слоя.', time: 3, photo: bad },
            { order: 3, text: 'Предъявить участок прорабу или инженеру до закрытия работ.', time: 2, photo: good }
        ],
        createdAt: now,
        updatedAt: now
    });

    pushUnique(_getTasks(), {
        id: 'demo_task_audit_red_contractor_v2',
        title: 'Аудит подрядчика в красной зоне',
        taskType: 'Аудит',
        type: 'control',
        category: 'Аудит',
        priority: 'high',
        status: 'open',
        contractor: 'ООО "Окна-Про"',
        projectName: 'ЖК "Демонстрационный"',
        reason: 'Повторяющиеся B2 по оконным примыканиям и низкая стабильность качества.',
        target: 3,
        done: 1,
        progress: 1,
        createdAt: now,
        updatedAt: now
    });

    pushUnique(_getTasks(), {
        id: 'demo_task_twi_magic_v2',
        title: 'Магия TWI: создать карту по OK/FAIL',
        taskType: 'TWI',
        type: 'method',
        category: 'TWI',
        priority: 'medium',
        status: 'open',
        contractor: 'ООО "Окна-Про"',
        projectName: 'ЖК "Демонстрационный"',
        reason: 'Есть фото правильного и неправильного выполнения. Нужно превратить их в TWI.',
        target: 1,
        done: 0,
        progress: 0,
        createdAt: now,
        updatedAt: now
    });

    pushUnique(_getTasks(), {
        id: 'demo_task_pcsk_analysis_v2',
        title: 'Аналитика ПК СК: проверить просрочки и CMI',
        taskType: 'ПК СК',
        type: 'analysis',
        category: 'ПК СК',
        priority: 'high',
        status: 'open',
        contractor: 'ООО "Окна-Про"',
        projectName: 'ЖК "Демонстрационный"',
        reason: 'Есть просроченные замечания и статусы «Устранено» без «Проверено».',
        target: 1,
        done: 0,
        progress: 0,
        createdAt: now,
        updatedAt: now
    });

    pushUnique(_getFmea(), {
        id: 'demo_fmea_windows_leak_v2',
        title: 'FMEA: повторная протечка оконного примыкания',
        contractor: 'ООО "Окна-Про"',
        projectName: 'ЖК "Демонстрационный"',
        failureMode: 'Нарушение герметизации оконного примыкания',
        cause: 'Нет единого порядка подготовки основания и контроля герметика.',
        effect: 'Продувание, протечки, промерзание, гарантийные обращения.',
        action: 'Создать TWI, принять эталон, проверить соседние этажи до закрытия откосов.',
        createdAt: now,
        updatedAt: now
    });

    pushUnique(_getMeetings(), {
        id: 'demo_meeting_quality_day_v2',
        date: now,
        author: 'Иванов И.И.',
        title: 'Демо: совещание по качеству',
        memoText: 'Разобраны повторяющиеся B2 по окнам, просрочки ПК СК, низкий CMI и необходимость TWI-инструктажа.',
        agenda: [
            {
                contr: 'ООО "Окна-Про"',
                defect: 'Повторная герметизация окон',
                isDone: false,
                date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
                resp: 'Прораб окон',
                comment: 'Провести TWI и предъявить 3 этажа на повторный контроль.'
            }
        ],
        createdAt: now,
        updatedAt: now
    });

    pushUnique(_getInterventions(), {
        id: 'demo_intervention_twi_windows_v2',
        date: now,
        inspector: 'Иванов И.И.',
        contractor: 'ООО "Окна-Про"',
        templateKey: 'sys_okna_pvh',
        templateTitle: 'Окна ПВХ',
        typeText: 'TWI-инструктаж',
        typeCoef: 1.2,
        comment: 'Проведён инструктаж по герметизации оконных примыканий.',
        baseUrk: 0.62,
        finalImpact: 0.18,
        deltaUrk: 0.12,
        createdAt: now,
        updatedAt: now
    });

    pushUnique(_getPractices(), {
        id: 'demo_practice_windows_twi_v2',
        title: 'Практика: TWI перед закрытием откосов',
        category: 'Окна',
        problem: 'Дефекты герметизации выявлялись после закрытия откосов.',
        solution: 'Ввели обязательный TWI-инструктаж и фотофиксацию до закрытия.',
        result: 'Снизилась повторяемость B2 и ускорился повторный контроль.',
        author: 'Иванов И.И.',
        createdAt: now,
        updatedAt: now
    });

    pushUnique(_getSkRecords(), {
        id: 'demo_sk_v2_001',
        number: 'ДЕМО-201',
        text: 'Нарушена герметизация примыкания оконного блока.',
        category: 'Окна ПВХ',
        contractor: 'ООО "Окна-Про"',
        project_name: 'ЖК "Демонстрационный"',
        deadline: new Date(Date.now() - 3 * 86400000).toISOString(),
        date_issued: new Date(Date.now() - 10 * 86400000).toISOString(),
        status: 'Не устранено',
        inspector: 'Петров А.А.',
        structure: 'Корпус 2, этаж 5'
    });

    pushUnique(_getSkRecords(), {
        id: 'demo_sk_v2_002',
        number: 'ДЕМО-202',
        text: 'Подрядчик заявил устранение, требуется проверка СК.',
        category: 'Окна ПВХ',
        contractor: 'ООО "Окна-Про"',
        project_name: 'ЖК "Демонстрационный"',
        deadline: new Date(Date.now() - 1 * 86400000).toISOString(),
        date_issued: new Date(Date.now() - 8 * 86400000).toISOString(),
        status: 'Устранено',
        inspector: 'Петров А.А.',
        structure: 'Корпус 2, этаж 6'
    });

    pushUnique(_getSkRecords(), {
        id: 'demo_sk_v2_003',
        number: 'ДЕМО-203',
        text: 'Замечание проверено строительным контролем.',
        category: 'Фасад',
        contractor: 'ООО "Фасад-Мастер"',
        project_name: 'ЖК "Демонстрационный"',
        deadline: new Date(Date.now() + 2 * 86400000).toISOString(),
        date_issued: new Date(Date.now() - 5 * 86400000).toISOString(),
        status: 'Проверено',
        inspector: 'Сидоров В.В.',
        structure: 'Корпус 1'
    });
}
function startDemoMode(silent = false) {
    // 1. БЕЗОПАСНОСТЬ: ПРЯЧЕМ РЕАЛЬНЫЕ ДАННЫЕ
    realState = JSON.parse(JSON.stringify(_session().getState()));
    realDetails = JSON.parse(JSON.stringify(_session().getDetails()));
    realPhotos = JSON.parse(JSON.stringify(_session().getPhotos()));
    realContractorArray = JSON.parse(JSON.stringify(window.contractorArray));
    realTemplateKey = _session().getTemplateKey();

    real_rbi_tasksData = JSON.parse(JSON.stringify(_getTasks()));
    real_weeklyPlanData = JSON.parse(JSON.stringify(_getWeeklyPlan()));
    real_gameActionLogs = JSON.parse(JSON.stringify(_getGameActionLogs()));
    real_rbi_meetingsData = JSON.parse(JSON.stringify(_getMeetings()));
    real_rbi_interventionsData = JSON.parse(JSON.stringify(_getInterventions()));
    real_rbi_practicesData = JSON.parse(JSON.stringify(_getPractices()));

    realTwiCards = JSON.parse(JSON.stringify(_getTwiCards()));
    realCustomDocs = JSON.parse(JSON.stringify(_getCustomDocs()));
    realCustomNodes = JSON.parse(JSON.stringify(_getCustomNodes()));

    real_skRecords = JSON.parse(JSON.stringify(_getSkRecords()));
    real_skVolumes = JSON.parse(JSON.stringify(_getSkVolumes()));
    real_skContractorMap = JSON.parse(JSON.stringify(_getSkContractorMap()));
    real_rbi_fmeaRecords = JSON.parse(JSON.stringify(_getFmea()));
    real_rbi_scheduleData = JSON.parse(JSON.stringify(_getSchedule()));

    _setIsDemoMode(true);
    document.body.classList.add('demo-mode');

    if (window.RBI && window.RBI.shellDesktop && typeof window.RBI.shellDesktop.syncDemoExitPlacement === 'function') {
        window.RBI.shellDesktop.syncDemoExitPlacement();
    } else {
        const fabExit = document.getElementById('fab-exit-demo');
        if (fabExit) {
            fabExit.classList.remove('hidden');
            fabExit.style.display = 'flex';
            fabExit.style.pointerEvents = 'auto';
            fabExit.style.visibility = 'visible';
            fabExit.style.opacity = '1';
        }
    }

    const now = new Date();
    const randomDay = (min, max) => {
        let d = new Date(); d.setDate(now.getDate() - (Math.floor(Math.random() * (max - min + 1)) + min));
        return d.toISOString();
    };

    // 2. БЛОКИРУЕМ БАЗУ ДАННЫХ (RAM-ONLY)
    window.originalDbPut = window.dbPut;
    window.originalDbDelete = window.dbDelete;
    window.originalDbClear = window.dbClear;
    window.originalDbGet = window.dbGet;
    window.originalDbGetAll = window.dbGetAll;

    window.dbPut = async () => true;
    window.dbDelete = async () => true;
    window.dbClear = async () => true;
    window.dbGet = async () => null;      // Чтобы вкладки не тянули пустые данные из реальной БД
    window.dbGetAll = async () => null;   // Чтобы вкладки не затирали наши демо-массивы

    // 3. ФОТОГРАФИИ ДЛЯ ДЕМО
    const demoPhotoGood = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='800' height='600' fill='%23f0fdf4'/><path d='M250 300 L350 400 L550 200' stroke='%2322c55e' stroke-width='40' stroke-linecap='round' stroke-linejoin='round' fill='none'/><text x='400' y='520' font-family='Arial' font-size='36' font-weight='bold' fill='%23166534' text-anchor='middle'>ЭТАЛОН (ВЕРНО)</text></svg>";
    const demoPhotoBad = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='800' height='600' fill='%23fef2f2'/><path d='M250 200 L550 400 M250 400 L550 200' stroke='%23ef4444' stroke-width='40' stroke-linecap='round' stroke-linejoin='round' fill='none'/><text x='400' y='520' font-family='Arial' font-size='36' font-weight='bold' fill='%23991b1b' text-anchor='middle'>БРАК (НАРУШЕНИЕ)</text></svg>";

    const metric = (f, b1, b2, b3) => ({ final: f, baseUrkPerc: f, checkedCount: 6, totalCount: 6, n_B1_fail: b1, n_B2_fail: b2, n_B3_fail: b3, b3_found: b3 > 0, kc: b2 > 2 ? 0.85 : 1.0, kcrit: b3 > 0 ? 0.5 : 1.0, isDanger: b3 > 0 });

    // 4. БАЗА ПРОВЕРОК (Большой массив данных)
    const demoContractorArray = [];
    for (let i = 0; i < 45; i++) {
        let hasDefect = (i % 10 === 0);
        demoContractorArray.push({ id: 100 + i, date: randomDay(1, 60), projectName: 'ЖК "Демонстрационный"', inspectorName: 'Иванов И.И.', contractorName: 'ООО "Фасад-Мастер"', templateKey: 'sys_nvf_facade', templateTitle: 'Вент. фасад', section: `Корпус 1`, floor: `Этаж ${Math.floor(i / 4) + 1}`, room: `Оси ${i}`, location: `Корпус 1, Этаж ${Math.floor(i / 4) + 1}`, stageName: "Монтаж", isCompleted: true, state: { '108': 'ok', '109': hasDefect ? 'fail' : 'ok' }, details: hasDefect ? { '109': { causeCode: 'C01', comment: 'Смещение' } } : {}, photos: hasDefect ? { '109': demoPhotoBad } : { '108': demoPhotoGood }, metrics: metric(hasDefect ? 80 : 100, 0, hasDefect ? 1 : 0, 0) });
    }
    for (let i = 0; i < 35; i++) {
        let day = Math.floor(Math.random() * 60) + 1; let hasDefect = day < 30;
        demoContractorArray.push({ id: 200 + i, date: randomDay(1, 60), projectName: 'ЖК "Демонстрационный"', inspectorName: 'Иванов И.И.', contractorName: 'ООО "Окна-Про"', templateKey: 'sys_okna_pvh', templateTitle: 'Окна ПВХ', location: `Корпус 2, Этаж ${Math.floor(i / 3) + 1}`, stageName: "Монтаж окон", isCompleted: true, state: { '1610': hasDefect ? 'fail' : 'ok', '1615': 'ok' }, details: hasDefect ? { '1610': { causeCode: 'C04', comment: 'Завал рамы' } } : {}, photos: hasDefect ? { '1610': demoPhotoBad } : {}, metrics: metric(hasDefect ? 75 : 100, 0, hasDefect ? 1 : 0, 0) });
    }
    for (let i = 0; i < 30; i++) {
        let day = Math.floor(Math.random() * 60) + 1; let hasB3 = (day < 60 && i % 4 === 0);
        demoContractorArray.push({ id: 300 + i, date: randomDay(1, 60), projectName: 'ЖК "Демонстрационный"', inspectorName: 'Иванов И.И.', contractorName: 'ИП Петров (Бетон)', templateKey: 'sys_monolit', templateTitle: 'Монолитные работы', location: `Корпус 3, Этаж 1`, stageName: "Стены", isCompleted: true, state: { '1011': 'fail', '1014': hasB3 ? 'fail_escalated' : 'ok' }, details: hasB3 ? { '1014': { causeCode: 'C01', comment: 'Арматура торчит' } } : { '1011': { causeCode: 'C01', comment: 'Смещение' } }, photos: hasB3 ? { '1014': demoPhotoBad } : { '1011': demoPhotoBad }, metrics: metric(hasB3 ? 45 : 80, 0, 1, hasB3 ? 1 : 0) });
    }
    demoContractorArray.sort((a, b) => new Date(b.date) - new Date(a.date));
    const inspSvc1 = (_ctx && _ctx.inspections) || window.RBI.services.inspections;
    inspSvc1.setAllSync(demoContractorArray);

    // 5. ДАТЫ ДЛЯ МОДУЛЕЙ
    let dOld = new Date(now); dOld.setDate(now.getDate() - 10);
    let dOverdue = new Date(now); dOverdue.setDate(now.getDate() - 2);
    let dToday = new Date(now);
    let dFuture = new Date(now); dFuture.setDate(now.getDate() + 5);
    let dFarFuture = new Date(now); dFarFuture.setDate(now.getDate() + 20);

    // 6. ЗАДАЧИ
    _setTasks([
        { id: 'dt1', type: 'auto', category: 'meeting', icon: 'Совещание', contractor: 'ИП Петров (Бетон)', project: 'ЖК "Демонстрационный"', templateKey: 'sys_monolit', workTitle: 'Монолитные работы', taskType: 'Совещание', title: 'Разбор критического брака', prompt: 'Зафиксировано 3 критических дефекта B3. Срочно проведите разбор с прорабом.', status: 'pending', priorityLvl: 4, date: dOverdue.toISOString(), done: 0, target: 1 },
        { id: 'dt2', type: 'auto', category: 'method', icon: 'ППР', contractor: 'Системная', project: 'Все', templateKey: '', workTitle: 'Аналитика СК', taskType: 'Отчет', title: 'Анализ проблем ПК СК', prompt: 'ИИ выявил аномалии в ПК Стройконтроль (высокий ИСД). Проведите сверку.', status: 'pending', priorityLvl: 3, date: dOverdue.toISOString(), done: 0, target: 1 },
        { id: 'dt3', type: 'auto', category: 'control', icon: 'Эталон', contractor: 'ООО "НовичокСтрой"', project: 'ЖК "Демонстрационный"', templateKey: 'sys_kirpich', workTitle: 'Кладка из кирпича', taskType: 'Эталон', title: 'Приемка Эталона', prompt: 'Новый подрядчик. Зафиксируйте эталон.', status: 'pending', priorityLvl: 4, date: dToday.toISOString(), done: 0, target: 1, needsEtalon: true },
        { id: 'dt4', type: 'auto', category: 'control', icon: 'Контроль', contractor: 'ООО "Окна-Про"', project: 'ЖК "Демонстрационный"', templateKey: 'sys_okna_pvh', workTitle: 'Окна ПВХ', taskType: 'Аудит', title: 'Усиленный контроль', prompt: 'Подрядчик в желтой зоне. Требуется 3 проверки на неделе.', status: 'pending', priorityLvl: 3, date: dFuture.toISOString(), done: 1, target: 3 },
        { id: 'dt5', type: 'auto', category: 'report', icon: 'Отчет', contractor: 'Системная', project: 'ЖК "Демонстрационный"', templateKey: '', workTitle: 'Отчетность', taskType: 'Отчет', title: 'Ежемесячный One-Pager', prompt: 'Отправьте руководителю выгрузку Сводного статуса.', status: 'pending', priorityLvl: 2, date: dFarFuture.toISOString(), done: 0, target: 1 }
    ]);

    // 7. СОВЕЩАНИЯ (Протоколы)
    _setMeetings([{
        id: 'm1', date: dOld.toISOString(), author: 'Иванов И.И.', title: 'Совещание штаба от ' + dOld.toLocaleDateString('ru-RU'),
        qDayPhoto: demoPhotoBad,
        agenda: [
            { contr: 'ООО "Окна-Про"', defect: 'Завал оконной рамы более 15мм', isDone: true, date: dOld.toISOString(), resp: 'Смирнов', comment: 'Проведен мастер-класс, рамы переставлены.' },
            { contr: 'ИП Петров (Бетон)', defect: 'Обнажение арматуры', isDone: false, date: dFuture.toISOString(), resp: 'Сидоров', comment: 'Ждем поставку ремсостава.' }
        ],
        notes: 'Подрядчикам строго соблюдать ППР. Усилить контроль за поставками.',
        memoText: '**ПРОТОКОЛ**\n\n1. ООО "Окна-Про": Решено.\n2. ИП Петров: В работе до пятницы.'
    }]);

    // 8. ВОЗДЕЙСТВИЯ (Impact) И ПРАКТИКИ
    _setInterventions([
        { id: 'int1', date: dOld.toISOString(), inspector: 'Иванов И.И.', contractor: 'ООО "Фасад-Мастер"', templateKey: 'sys_nvf_facade', templateTitle: 'Вент. фасад', typeText: 'Разбор с бригадой (TWI)', typeCoef: 1.5, comment: 'Проведен воркшоп с бригадой', baseUrk: 72, deltaUrk: 18 }
    ]);
    _setPractices([
        { id: 'p1', interventionId: 'int1', date: dOld.toISOString(), author: 'Иванов И.И.', title: 'Правильный крепеж кронштейнов', templateTitle: 'Вент. фасад', deltaUrk: 18, problem: 'Смещение осей кронштейнов, срыв сроков', solution: 'Внедрен алюминиевый шаблон для разметки. Бригада обучена.', photoBefore: demoPhotoBad, photoAfter: demoPhotoGood, isPublished: true },
        { id: 'p2', interventionId: null, date: dOverdue.toISOString(), author: 'Иванов И.И.', title: 'Защита пены от солнца', templateTitle: 'Окна ПВХ', deltaUrk: 0, problem: 'Пена разрушается на солнце', solution: 'Обязательное использование Смарт-скин мастики', photoBefore: demoPhotoBad, photoAfter: demoPhotoGood, isPublished: true }
    ]);

    // 9. FMEA МАТРИЦА РИСКОВ
    _setFmea([{
        id: 'f1', date: dOverdue.toISOString(), author: 'Иванов И.И.', title: 'FMEA Анализ (Ноябрь)', periodName: 'Месяц',
        defects: [
            { contractor: 'ИП Петров (Бетон)', workTitle: 'Монолитные работы', defectName: 'Обнажение арматуры', count: 8, stage: 'Ошибки СМР', cause: 'Спешка при заливке, экономия фиксаторов', effect: 'Коррозия арматуры, снижение несущей способности', fix: 'Зачеканить ремсоставом', prevent: 'Добавить пункт в акт скрытых работ по проверке 4 фиксаторов на м2', rpn: 720, photo: demoPhotoBad },
            { contractor: 'ООО "Окна-Про"', workTitle: 'Окна ПВХ', defectName: 'Монтажный шов с пустотами', count: 5, stage: 'Материалы', cause: 'Бракованная партия пены', effect: 'Промерзание откосов', fix: 'Перепенить', prevent: 'Входной контроль пены', rpn: 350, photo: demoPhotoBad }
        ]
    }]);

    // 10. ГРАФИК СМР
    _setSchedule([
        { id: 'sch1', workTitle: 'Монолит цоколя', contractor: 'ИП Петров (Бетон)', startDate: dOld.toISOString(), endDate: dToday.toISOString(), templateKey: 'sys_monolit', _deleted: false },
        { id: 'sch2', workTitle: 'Кладка наружных стен', contractor: 'ООО "Фасад-Мастер"', startDate: dOverdue.toISOString(), endDate: dFarFuture.toISOString(), templateKey: 'sys_gazobeton', _deleted: false },
        { id: 'sch3', workTitle: 'Монтаж Окон', contractor: 'ООО "Окна-Про"', startDate: dFuture.toISOString(), endDate: dFarFuture.toISOString(), templateKey: 'sys_okna_pvh', _deleted: false }
    ]);

    // 11. ДАННЫЕ СТРОЙКОНТРОЛЯ (ПК СК)
    _setSkVolumes({ 'Вент. фасад': { amount: 5000, unit: 'м2' }, 'Окна ПВХ': { amount: 300, unit: 'шт' }, 'Монолитные работы': { amount: 1200, unit: 'м3' } });
    _setSkRecords([
        { id: 'sk1', number: '101', text: 'Завал оконной рамы на 15мм', category: 'Окна ПВХ', date_issued: dOld.toISOString(), contractor: 'ООО "Окна-Про"', deadline: dOverdue.toISOString(), status: 'Не устранено', inspector: 'Петров А.А.', structure: 'Секция 1' },
        { id: 'sk2', number: '102', text: 'Отсутствует пароизоляция шва', category: 'Окна ПВХ', date_issued: dOld.toISOString(), contractor: 'ООО "Окна-Про"', deadline: dToday.toISOString(), status: 'Не устранено', inspector: 'Иванов И.И.', structure: 'Секция 2' },
        { id: 'sk3', number: '103', text: 'Обнажение арматуры пилона', category: 'Монолитные работы', date_issued: dOld.toISOString(), contractor: 'ИП Петров (Бетон)', deadline: dOld.toISOString(), status: 'Устранено', date_resolved: dToday.toISOString(), inspector: 'Сидоров В.В.', structure: 'Паркинг' },
        { id: 'sk4', number: '104', text: 'Мусор в котловане', category: 'Земляные работы', date_issued: dOverdue.toISOString(), contractor: 'СМУ-5', deadline: dFuture.toISOString(), status: 'Не устранено', inspector: 'Иванов И.И.', structure: 'Котлован' }
    ]);

    // 12. БАЗА ЗНАНИЙ (TWI)
    _setTwiCards([
        { id: "demo_twi_1", title: "Контроль установки кронштейнов", checklistKey: "sys_nvf_facade", checklistName: "Вент. фасад", type: "INSPECTOR", itemId: "109", whyImportant: "Риск обрушения фасада при ветровой нагрузке.", howToCheck: "Проверить динамометрическим ключом.", photoGood: demoPhotoGood, photoBad: demoPhotoBad },
        { id: "demo_twi_2", title: "Монтаж пароизоляции окна", checklistKey: "sys_okna_pvh", checklistName: "Окна ПВХ", type: "WORKER", itemId: "1617", totalTime: 5, steps: [{ order: 1, text: "Очистить проем от пыли", time: 2, photo: null }, { order: 2, text: "Наклеить ленту с нахлестом 10см", time: 3, photo: demoPhotoGood }] }
    ]);

    // 13. HR МЕТРИКИ И АЧИВКИ
    _setGameActionLogs([]);
    for (let i = 0; i < 80; i++) window.gameActionLogs.push({ id: 'l' + i, date: randomDay(1, 30), inspector: 'Иванов И.И.', action: ['create_twi', 'ai_generate', 'comment_written', 'task_completed_on_time', 'practice_published', 'etalon_accepted'][Math.floor(Math.random() * 6)] });

    // 14. НАСТРОЙКИ ИНТЕРФЕЙСА ДЛЯ ДЕМО
    var setVal = function (id, val) {
        var el = document.getElementById(id);
        if (el) el.value = val;
    };
    setVal('inp-project', 'ЖК "Демонстрационный"');
    setVal('inp-inspector', 'Иванов И.И.');
    setVal('inp-contractor', 'ООО "Фасад-Мастер"');
    setVal('inp-section', 'Корпус 1, секция 2');

    _session().setTemplateKey('sys_nvf_facade');
    if (document.getElementById('checklist-selector')) document.getElementById('checklist-selector').value = _session().getTemplateKey();
    _session().setChecklist(_templates().getSystemTemplates()['nvf_facade'].groups);

    window.assignPhotosMap({});
    _session().replaceState({}); _session().replaceDetails({});
    _session().getState()['108'] = 'ok'; _session().setPhotoRaw('108', demoPhotoGood);
    _session().getState()['109'] = 'fail'; _session().getDetails()['109'] = { causeCode: 'C01', comment: '[Нарушение технологии] Отклонение' }; _session().setPhotoRaw('109', demoPhotoBad);

    var emptyState = document.getElementById('empty-checklist-state');
    if (emptyState) emptyState.style.display = 'none';
    var auditItems = document.getElementById('audit-items');
    if (auditItems) auditItems.style.display = 'block';
    var auditActions = document.getElementById('audit-actions');
    if (auditActions) auditActions.style.display = 'grid';

    if (typeof window.rbi_enrichDemoModeV2 === 'function') {
        window.rbi_enrichDemoModeV2({
            demoPhotoGood,
            demoPhotoBad,
            nowIso: now.toISOString()
        });
    }
    // 15. ПРИНУДИТЕЛЬНЫЙ РЕНДЕР ВСЕГО
    window.updateDataSummary();
    if (typeof window.updateAllDynamicFilters === 'function') window.updateAllDynamicFilters();
    window.render(); window.updateUI();

    // Заставляем все вкладки "проснуться" и отрисовать демо-массивы
    if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') window.RBI.events.emit('history:renderRequested', {});
    if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') window.RBI.events.emit('analytics:renderRequested', {});
    if (typeof window.renderTwiList === 'function') window.renderTwiList();
    if (typeof window.renderDocsList === 'function') window.renderDocsList();
    if (typeof window.renderNodesList === 'function') window.renderNodesList();
    window.RBI.events.emit('tasks:refresh', {});
    if (typeof gameRenderDashboard === 'function') gameRenderDashboard();
    if (typeof rbi_renderScheduleTab === 'function') rbi_renderScheduleTab(true);
    if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') window.RBI.events.emit('sk:renderRequested', { view: 'mainTab' });
    if (typeof rbi_renderMeetingTab === 'function') rbi_renderMeetingTab();
    if (typeof rbi_renderImpactTab === 'function') rbi_renderImpactTab();
    if (typeof rbi_renderFmeaHistory === 'function') rbi_renderFmeaHistory();
    if (typeof rbi_renderPracticesTab === 'function') rbi_renderPracticesTab();

    if (!silent) {
        showToast('🎮 Демо-режим загружен: СМР, FMEA, ПК СК и HR-аналитика!');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function exitDemoMode() {
    _setIsDemoMode(false);
    document.body.classList.remove('demo-mode');

    if (window.RBI && window.RBI.shellDesktop && typeof window.RBI.shellDesktop.syncDemoExitPlacement === 'function') {
        window.RBI.shellDesktop.syncDemoExitPlacement();
    } else {
        const fabExit = document.getElementById('fab-exit-demo');
        if (fabExit) { fabExit.classList.add('hidden'); fabExit.style.display = 'none'; }
    }

    // ВОССТАНАВЛИВАЕМ ВСЁ
    _session().replaceState(JSON.parse(JSON.stringify(realState)));
    _session().replaceDetails(JSON.parse(JSON.stringify(realDetails)));
    window.assignPhotosMap(JSON.parse(JSON.stringify(realPhotos)));
    const inspSvc2 = (_ctx && _ctx.inspections) || window.RBI.services.inspections;
    inspSvc2.setAllSync(JSON.parse(JSON.stringify(realContractorArray)));
    _session().setTemplateKey(realTemplateKey);

    _setTasks(JSON.parse(JSON.stringify(real_rbi_tasksData)));
    _setWeeklyPlan(JSON.parse(JSON.stringify(real_weeklyPlanData)));
    _setGameActionLogs(JSON.parse(JSON.stringify(real_gameActionLogs)));
    _setMeetings(JSON.parse(JSON.stringify(real_rbi_meetingsData)));
    _setInterventions(JSON.parse(JSON.stringify(real_rbi_interventionsData)));
    _setPractices(JSON.parse(JSON.stringify(real_rbi_practicesData)));

    _setTwiCards(JSON.parse(JSON.stringify(realTwiCards)));
    _setCustomDocs(JSON.parse(JSON.stringify(realCustomDocs)));
    _setCustomNodes(JSON.parse(JSON.stringify(realCustomNodes)));

    _setSkRecords(JSON.parse(JSON.stringify(real_skRecords)));
    _setSkVolumes(JSON.parse(JSON.stringify(real_skVolumes)));
    _setSkContractorMap(JSON.parse(JSON.stringify(real_skContractorMap)));
    _setFmea(JSON.parse(JSON.stringify(real_rbi_fmeaRecords)));
    _setSchedule(JSON.parse(JSON.stringify(real_rbi_scheduleData)));

    ['inp-project', 'inp-inspector', 'inp-contractor', 'inp-section', 'inp-floor', 'inp-room', 'inp-location'].forEach(id => {
        if (document.getElementById(id)) {
            document.getElementById(id).value = '';
            document.getElementById(id).removeAttribute('readonly');
            document.getElementById(id).classList.remove('bg-slate-100', 'dark:bg-slate-900', 'text-slate-500', 'cursor-not-allowed');
        }
    });

    if (document.getElementById('lock-inp-inspector')) document.getElementById('lock-inp-inspector').classList.add('hidden');
    if (document.getElementById('lock-inp-project')) document.getElementById('lock-inp-project').classList.add('hidden');

    window.dbPut = window.originalDbPut;
    window.dbDelete = window.originalDbDelete;
    window.dbClear = window.originalDbClear;
    window.dbGet = window.originalDbGet;
    window.dbGetAll = window.originalDbGetAll;

    restoreSession();
    switchTab('tab-audit');
    window.changeTemplate('HOME');

    showToast('🔄 Возврат к реальным данным (БД разблокирована)');
}

// --- Именной экспорт ---
const AppUtilsModule = { id: 'app-utils', bindCtx };
export {
    AppUtilsModule,
    bindCtx,
    handleLogoUpload,
    removeBrandLogo,
    publishCorporateBranding,
    resetToCorporateBranding,
    applyContractorAliasToInspectionHistory,
    openNodeAttachmentPdf,
    AppModeManager,
    changeAppMode,
    revertToPreviousMode,
    togglePushSettings,
    initPushToggleState,
    purgeDataOutsideAssignedProjects,
    rbi_enrichDemoModeV2,
    startDemoMode,
    exitDemoMode
};
