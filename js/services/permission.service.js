/* Файл: js/services/permission.service.js */
/* Permission Service — единая реализация ролей и прав доступа (перенесено из js/roles.js) */

(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    // Реальный список выбираемых бизнес-platform-модулей (не сервисов/фич —
    // sk/game/knowledge — role:'feature-of' внутри quality, settings/ai — role:'service',
    // см. PLATFORM_TARGET_ARCHITECTURE.md §31). Значение allowedModules у всех ролей
    // ниже — явное решение пользователя «не ограничивать роли сейчас» (2026-07-13,
    // §29 п.10в), не временная заглушка. Пересечение с company.enabledModules
    // остаётся на стороне user-context.service.js.
    var BUSINESS_MODULE_IDS = ['quality', 'construction', 'knowledge'];

    // === МАТРИЦА ПРАВ ДОСТУПА (DEFAULT, неизменяемая) ===
    // dataScope — декларативное правило видимости данных по роли (§29 п.10 «в»):
    //   'all'                   — видит все записи (текущий isLeadership()/isAdmin() приоритет);
    //   'ownProject'             — только записи назначенных проектов;
    //   'ownContractor'         — только записи назначенного подрядчика (+ фильтр по проекту, если назначен);
    //   'ownProjectOrOwnRecords' — назначенные проекты, либо (если проектов нет) только свои записи без проекта;
    //   'none'                  — 0 доступа к чужим данным.
    // Оверрайды (§23 Блок 2): company SoT (RBI.services.company) → fallback
    // appSettings.roleMatrixOverrides → DEFAULT. Ключи ролей не add/remove/rename.
    // Persist — sparse partial отличий от DEFAULT (не полная копия матрицы).
    const ROLE_MATRIX = {
        guest: {
            canCreate: false, canPush: false, canDeleteOwn: false, canDeleteAll: false,
            canManageRoles: false, canManageObjects: false, canEditKnowledgeBase: false, canViewKnowledgeBase: true,
            isAdmin: false, isLeadership: false, canManageSK: false, canManageHierarchy: false,
            isEngineerOrAdmin: false, canViewWeeklyPlan: false,
            dataScope: 'none', allowedModules: BUSINESS_MODULE_IDS, label: 'Гость'
        },

        contractor: {
            canCreate: false, canPush: true, canDeleteOwn: false, canDeleteAll: false,
            canManageRoles: false, canManageObjects: false, canEditKnowledgeBase: false, canViewKnowledgeBase: true,
            isAdmin: false, isLeadership: false, canManageSK: false, canManageHierarchy: false,
            isEngineerOrAdmin: false, canViewWeeklyPlan: false,
            dataScope: 'ownContractor', allowedModules: BUSINESS_MODULE_IDS, label: 'Подрядчик'
        },

        engineer: {
            canCreate: true,
            canPush: true,
            canDeleteOwn: true,
            canDeleteAll: false,
            canManageRoles: false,
            canManageObjects: false,
            canEditKnowledgeBase: true,
            canViewKnowledgeBase: true,
            isAdmin: false,
            isLeadership: false,
            canManageSK: true,
            canManageHierarchy: false,
            isEngineerOrAdmin: true, canViewWeeklyPlan: true,
            dataScope: 'ownProjectOrOwnRecords', allowedModules: BUSINESS_MODULE_IDS, label: 'Инженер СК'
        },

        project_manager: {
            canCreate: false, canPush: false, canDeleteOwn: false, canDeleteAll: false,
            canManageRoles: false, canManageObjects: false, canEditKnowledgeBase: false, canViewKnowledgeBase: true,
            isAdmin: false, isLeadership: true, canManageSK: false, canManageHierarchy: false,
            isEngineerOrAdmin: false, canViewWeeklyPlan: true,
            dataScope: 'ownProject', allowedModules: BUSINESS_MODULE_IDS, label: 'Руководитель (РП)'
        },

        deputy_manager: {
            canCreate: true, canPush: true, canDeleteOwn: true, canDeleteAll: true,
            canManageRoles: true, canManageObjects: true, canEditKnowledgeBase: true, canViewKnowledgeBase: true,
            isAdmin: true, isLeadership: true, canManageSK: true, canManageHierarchy: true,
            isEngineerOrAdmin: true, canViewWeeklyPlan: true,
            dataScope: 'all', allowedModules: BUSINESS_MODULE_IDS, label: 'Зам. руководителя'
        },

        director: {
            canCreate: false, canPush: false, canDeleteOwn: false, canDeleteAll: false,
            canManageRoles: false, canManageObjects: false, canEditKnowledgeBase: false, canViewKnowledgeBase: true,
            isAdmin: false, isLeadership: true, canManageSK: false, canManageHierarchy: true,
            isEngineerOrAdmin: false, canViewWeeklyPlan: true,
            dataScope: 'all', allowedModules: BUSINESS_MODULE_IDS, label: 'Директор'
        },

        manager: {
            canCreate: true, canPush: true, canDeleteOwn: true, canDeleteAll: true,
            canManageRoles: true, canManageObjects: true, canEditKnowledgeBase: true, canViewKnowledgeBase: true,
            isAdmin: true, isLeadership: true, canManageSK: true, canManageHierarchy: true,
            isEngineerOrAdmin: true, canViewWeeklyPlan: true,
            dataScope: 'all', allowedModules: BUSINESS_MODULE_IDS, label: 'Админ'
        }
    };

    var BOOL_PERM_KEYS = [
        'canCreate', 'canPush', 'canDeleteOwn', 'canDeleteAll',
        'canManageRoles', 'canManageObjects', 'canEditKnowledgeBase', 'canViewKnowledgeBase',
        'isAdmin', 'isLeadership', 'canManageSK', 'canManageHierarchy',
        'isEngineerOrAdmin', 'canViewWeeklyPlan'
    ];
    var DATA_SCOPE_VALUES = {
        all: 1, ownProject: 1, ownContractor: 1, ownProjectOrOwnRecords: 1, none: 1
    };
    var MODULE_ID_SET = { quality: 1, construction: 1, knowledge: 1 };
    var OVERRIDES_SETTINGS_KEY = 'roleMatrixOverrides';
    var SMOKE_MARKER = '__SMOKE_TEST__';

    // COMPANY_ROLE_MATRICES — обёртка DEFAULT ROLE_MATRIX под ключ единственной существующей
    // компании 'rbi' (§29 п.10б). DEFAULT не мутируется оверрайдами.
    const COMPANY_ROLE_MATRICES = { rbi: ROLE_MATRIX };

    function _getDefaultMatrix(companyId) {
        return COMPANY_ROLE_MATRICES[companyId] || COMPANY_ROLE_MATRICES.rbi;
    }

    function _readLocalOverrides() {
        if (typeof appSettings === 'undefined' || !appSettings) return {};
        var raw = appSettings[OVERRIDES_SETTINGS_KEY];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        return raw;
    }

    function _companySvc() {
        return (window.RBI && window.RBI.services && window.RBI.services.company) || null;
    }

    /**
     * Company SoT побеждает local только если есть хотя бы один roleKey.
     * Иначе — local prefs / {} (DEFAULT при merge).
     */
    function _readRawOverrides() {
        var company = _companySvc();
        if (company && typeof company.hasCompanyRoleMatrixOverrides === 'function' &&
            company.hasCompanyRoleMatrixOverrides() &&
            typeof company.getRoleMatrixOverrides === 'function') {
            return company.getRoleMatrixOverrides() || {};
        }
        return _readLocalOverrides();
    }

    function _cloneOverrides(src) {
        var out = {};
        var raw = src || {};
        Object.keys(raw).forEach(function (roleKey) {
            if (roleKey === SMOKE_MARKER) {
                out[SMOKE_MARKER] = raw[SMOKE_MARKER];
                return;
            }
            if (!ROLE_MATRIX[roleKey]) return;
            var entry = raw[roleKey];
            if (!entry || typeof entry !== 'object') return;
            out[roleKey] = Object.assign({}, entry);
            if (Array.isArray(entry.allowedModules)) {
                out[roleKey].allowedModules = entry.allowedModules.slice();
            }
        });
        return out;
    }

    function _modulesEqual(a, b) {
        var aa = Array.isArray(a) ? a.slice().map(String).sort() : [];
        var bb = Array.isArray(b) ? b.slice().map(String).sort() : [];
        if (aa.length !== bb.length) return false;
        for (var i = 0; i < aa.length; i++) {
            if (aa[i] !== bb[i]) return false;
        }
        return true;
    }

    /**
     * Sparse diff: только поля, отличающиеся от DEFAULT ROLE_MATRIX[roleKey].
     * Не пишет полную копию DEFAULT «на всякий случай».
     */
    function _diffFromDefault(roleKey, partial) {
        var base = ROLE_MATRIX[roleKey];
        if (!base) return {};
        var cleaned = _sanitizePartial(partial);
        var sparse = {};
        BOOL_PERM_KEYS.forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(cleaned, k) && cleaned[k] !== !!base[k]) {
                sparse[k] = cleaned[k];
            }
        });
        if (Object.prototype.hasOwnProperty.call(cleaned, 'dataScope') &&
            cleaned.dataScope !== base.dataScope) {
            sparse.dataScope = cleaned.dataScope;
        }
        if (Object.prototype.hasOwnProperty.call(cleaned, 'label') &&
            String(cleaned.label) !== String(base.label)) {
            sparse.label = cleaned.label;
        }
        if (Object.prototype.hasOwnProperty.call(cleaned, 'allowedModules') &&
            !_modulesEqual(cleaned.allowedModules, base.allowedModules)) {
            sparse.allowedModules = cleaned.allowedModules.slice();
        }
        return sparse;
    }

    function _sanitizePartial(partial) {
        var cleaned = {};
        if (!partial || typeof partial !== 'object') return cleaned;
        BOOL_PERM_KEYS.forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(partial, k)) {
                cleaned[k] = !!partial[k];
            }
        });
        if (Object.prototype.hasOwnProperty.call(partial, 'dataScope')) {
            var scope = String(partial.dataScope || '');
            if (DATA_SCOPE_VALUES[scope]) cleaned.dataScope = scope;
        }
        if (Object.prototype.hasOwnProperty.call(partial, 'label')) {
            cleaned.label = String(partial.label == null ? '' : partial.label).slice(0, 120);
        }
        if (Object.prototype.hasOwnProperty.call(partial, 'allowedModules') && Array.isArray(partial.allowedModules)) {
            cleaned.allowedModules = partial.allowedModules
                .map(function (id) { return String(id); })
                .filter(function (id) { return !!MODULE_ID_SET[id]; });
            if (cleaned.allowedModules.length === 0) {
                cleaned.allowedModules = BUSINESS_MODULE_IDS.slice();
            }
        }
        return cleaned;
    }

    function _mergeEntry(base, override) {
        var merged = Object.assign({}, base);
        if (Array.isArray(base.allowedModules)) {
            merged.allowedModules = base.allowedModules.slice();
        }
        if (!override || typeof override !== 'object') return merged;
        BOOL_PERM_KEYS.forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(override, k)) {
                merged[k] = !!override[k];
            }
        });
        if (Object.prototype.hasOwnProperty.call(override, 'dataScope') && DATA_SCOPE_VALUES[override.dataScope]) {
            merged.dataScope = override.dataScope;
        }
        if (Object.prototype.hasOwnProperty.call(override, 'label')) {
            merged.label = String(override.label == null ? merged.label : override.label);
        }
        if (Array.isArray(override.allowedModules)) {
            merged.allowedModules = override.allowedModules.slice();
        }
        return merged;
    }

    // Merged матрица (DEFAULT + оверрайды). Ключи ролей = только DEFAULT.
    function _getRoleMatrix(companyId) {
        var base = _getDefaultMatrix(companyId);
        var overrides = _readRawOverrides();
        var merged = {};
        Object.keys(base).forEach(function (roleKey) {
            merged[roleKey] = _mergeEntry(base[roleKey], overrides[roleKey]);
        });
        return merged;
    }

    function _persistOverrides(nextOverrides) {
        var safe = _cloneOverrides(nextOverrides);
        var company = _companySvc();
        // Company SoT + local mirror (offline UI) + dirty для sync push.
        if (company && typeof company.setRoleMatrixOverrides === 'function') {
            return company.setRoleMatrixOverrides(safe).then(function (res) {
                if (res && res.error) throw res.error;
                return true;
            });
        }
        // Fallback без company.service (не должно случаться в runtime).
        if (window.RBI && window.RBI.services && window.RBI.services.settings &&
            typeof window.RBI.services.settings.set === 'function') {
            return window.RBI.services.settings.set(OVERRIDES_SETTINGS_KEY, safe);
        }
        if (typeof appSettings !== 'undefined' && appSettings) {
            appSettings[OVERRIDES_SETTINGS_KEY] = safe;
            appSettings.settingsUpdatedAt = Date.now();
            if (typeof window.saveSettings === 'function') {
                return window.saveSettings(OVERRIDES_SETTINGS_KEY, safe);
            }
            if (typeof dbPut === 'function') {
                return dbPut(window.STORES ? window.STORES.SETTINGS : 'app_settings',
                    Object.assign({ key: 'user_prefs' }, appSettings));
            }
        }
        return Promise.resolve(false);
    }

    function _resolveCurrentRoleKey() {
        if (!window.syncConfig || !window.syncConfig.enabled) {
            return 'engineer';
        }
        if (typeof appSettings === 'undefined' || !appSettings.userRole) {
            return 'guest';
        }
        return appSettings.userRole;
    }

    function _callerCanManageRoles() {
        var role = _resolveCurrentRoleKey();
        var matrix = _getRoleMatrix();
        var entry = matrix[role] || matrix.guest;
        return !!(entry && (entry.isAdmin || entry.canManageRoles));
    }

    const permissions = {
        // 1. Получить текущую роль пользователя
        getCurrentRole() {
            return _resolveCurrentRoleKey();
        },

        // 2. Получить облачный статус доступа
        getCloudStatus() {
            if (typeof appSettings === 'undefined') return 'offline';
            return appSettings.cloudStatus || appSettings.cloud_status || 'pending';
        },

        // 3. Получить права по текущей (или переданной) роли, опционально для companyId.
        // Возвращает merged DEFAULT+overrides (shallow copy записи).
        getPermissions(role, companyId) {
            const r = role || this.getCurrentRole();
            const matrix = _getRoleMatrix(companyId);
            const entry = matrix[r] || matrix.guest;
            return _mergeEntry(entry, null);
        },

        // 3a. Запись роли (merged) — §23 Блок 1.
        getRoleEntry(role, companyId) {
            return this.getPermissions(role, companyId);
        },

        // 3b. Снимок всей merged-матрицы (только ключи DEFAULT).
        getMatrixSnapshot(companyId) {
            const matrix = _getRoleMatrix(companyId);
            const snap = {};
            Object.keys(matrix).forEach(function (key) {
                snap[key] = _mergeEntry(matrix[key], null);
            });
            return snap;
        },

        // 3c. Текущие оверрайды (копия). Ключи только из DEFAULT ROLE_MATRIX.
        getRoleOverrides() {
            return _cloneOverrides(_readRawOverrides());
        },

        // 3d. Установить sparse-оверрайд роли (только отличия от DEFAULT).
        // Нельзя добавить/удалить/переименовать ключ роли. Persist → company SoT.
        setRoleOverrides(roleKey, partial) {
            if (!ROLE_MATRIX[roleKey]) {
                console.warn('[permission.service] setRoleOverrides: unknown role', roleKey);
                return Promise.resolve({ error: 'unknown_role' });
            }
            if (!_callerCanManageRoles()) {
                return Promise.resolve({ error: 'forbidden' });
            }
            const sparse = _diffFromDefault(roleKey, partial);
            const next = _cloneOverrides(_readRawOverrides());
            if (Object.keys(sparse).length === 0) {
                delete next[roleKey];
            } else {
                next[roleKey] = sparse;
            }
            return Promise.resolve(_persistOverrides(next)).then(function () {
                return { error: null, overrides: _cloneOverrides(_readRawOverrides()) };
            }).catch(function (e) {
                console.error('[permission.service] setRoleOverrides', e);
                return { error: e };
            });
        },

        // 3e. Сбросить оверрайд одной роли к DEFAULT из кода.
        clearRoleOverrides(roleKey) {
            if (!ROLE_MATRIX[roleKey]) {
                console.warn('[permission.service] clearRoleOverrides: unknown role', roleKey);
                return Promise.resolve({ error: 'unknown_role' });
            }
            if (!_callerCanManageRoles()) {
                return Promise.resolve({ error: 'forbidden' });
            }
            const next = _cloneOverrides(_readRawOverrides());
            delete next[roleKey];
            return Promise.resolve(_persistOverrides(next)).then(function () {
                return { error: null, overrides: _cloneOverrides(_readRawOverrides()) };
            }).catch(function (e) {
                console.error('[permission.service] clearRoleOverrides', e);
                return { error: e };
            });
        },

        // 3f. Явная перечитка оверрайдов (company SoT / local). Симметрия API.
        loadRoleOverrides() {
            return this.getRoleOverrides();
        },

        // 3g. Эталон DEFAULT без оверрайдов (для smoke / diff UI). Не мутировать.
        getDefaultRoleEntry(roleKey) {
            var base = ROLE_MATRIX[roleKey] || ROLE_MATRIX.guest;
            return _mergeEntry(base, null);
        },

        // 4. ГРУППОВЫЕ ПРОВЕРКИ
        isAdmin() { return !!this.getPermissions().isAdmin; },
        isLeadership() { return !!this.getPermissions().isLeadership; },
        canManageSK() { return !!this.getPermissions().canManageSK; },
        canManageHierarchy() { return !!this.getPermissions().canManageHierarchy; },
        isEngineerOrAdmin() { return !!this.getPermissions().isEngineerOrAdmin; },
        canViewWeeklyPlan() { return !!this.getPermissions().canViewWeeklyPlan; },

        // 18. Роль без индивидуально закреплённых объектов (Group F §29 п.13):
        // guest → dataScope 'none', director/deputy_manager/manager → dataScope 'all'.
        hasNoOwnObjects(role) {
            const scope = this.getDataScope(role);
            return scope === 'none' || scope === 'all';
        },

        // 5. Можно ли создавать проектные данные
        canCreate() {
            if (!window.syncConfig || !window.syncConfig.enabled) return true;
            if (this.getCloudStatus() !== 'approved') return true;
            return !!this.getPermissions().canCreate;
        },

        // 6. Можно ли отправлять данные в облако
        canPush() {
            if (!window.syncConfig || !window.syncConfig.enabled) return false;
            if (this.getCloudStatus() !== 'approved') return false;
            return !!this.getPermissions().canPush;
        },

        // 7. Можно ли редактировать проектные данные
        canEdit(ownerName = '') {
            if (this.isAdmin()) return true;
            if (this.getCurrentRole() === 'engineer') {
                const currentEngineerName = this.getCurrentEngineerName();
                return !ownerName || ownerName === currentEngineerName;
            }
            return false;
        },

        // 8. Можно ли удалить конкретную запись. P2-0035b: есть номер учётки владельца и свой — сравниваем номера (ФИО — подпись)
        canDelete(ownerName, ownerId) {
            const perms = this.getPermissions();
            if (perms.canDeleteAll) return true;
            if (perms.canDeleteOwn) {
                const myId = window.syncConfig && window.syncConfig.authUserId;
                if (ownerId && myId) return ownerId === myId;
                return ownerName === this.getCurrentEngineerName();
            }
            return false;
        },

        canManageRoles() { return !!this.getPermissions().canManageRoles; },
        canManageObjects() { return !!this.getPermissions().canManageObjects; },
        canEditKnowledgeBase() { return !!this.getPermissions().canEditKnowledgeBase; },
        canViewKnowledgeBase() { return !!this.getPermissions().canViewKnowledgeBase; },

        // 13. Декларативный data-scope текущей (или переданной) роли —
        // единая точка, которую читают sk.actions.js/sync-engine.core.js/
        // sync-push-pull.core.js вместо буквальных `role === 'x'`.
        getDataScope(role, companyId) {
            const r = role || this.getCurrentRole();
            const matrix = _getRoleMatrix(companyId);
            const entry = matrix[r] || matrix.guest;
            return entry.dataScope || 'none';
        },

        // 14. Список модулей, разрешённых роли (пересечение с company.enabledModules
        // выполняет потребитель — user-context.service.js).
        getAllowedModules(role, companyId) {
            const r = role || this.getCurrentRole();
            const matrix = _getRoleMatrix(companyId);
            const entry = matrix[r] || matrix.guest;
            return (entry.allowedModules || BUSINESS_MODULE_IDS).slice();
        },

        // 15. Контракт {companyId, role, permissions} — §23.
        getContract(role, companyId) {
            const r = role || this.getCurrentRole();
            const cId = companyId || 'rbi';
            const matrix = _getRoleMatrix(cId);
            return {
                companyId: cId,
                role: r,
                permissions: matrix[r] || matrix.guest
            };
        },

        // 16. Все роли ROLE_MATRIX (или её companyId-варианта) с человекочитаемыми
        // именами (для админ-UI).
        getAllRoles(companyId) {
            const matrix = _getRoleMatrix(companyId);
            return Object.keys(matrix).map(function (key) {
                return { key: key, label: matrix[key].label || key };
            });
        },

        // 17. Единая клиентская фильтрация записей по dataScope — заменяет
        // хардкод-ветвление role === 'x' в sk_filterRecordsByAccess и т.п.
        // fieldsConfig: { projectField: [...имена полей], contractorField: [...], ownerField: [...] }
        // Семантика идентична существующей sk_filterRecordsByAccess (перенос правил, не новая логика).
        filterByDataScope(records, fieldsConfig, role, companyId) {
            if (!Array.isArray(records)) return [];
            const cfg = fieldsConfig || {};
            const projectFields = cfg.projectField || [];
            const contractorFields = cfg.contractorField || [];
            const ownerFields = cfg.ownerField || [];

            function pick(rec, fields) {
                for (let i = 0; i < fields.length; i++) {
                    const v = rec[fields[i]];
                    if (v) return v;
                }
                return '';
            }

            // Совпадение хотя бы по одному из полей группы (для contractorField,
            // где ключ-канон и человекочитаемое имя — два независимых, не приоритетных, признака).
            function matchesAny(rec, fields, target) {
                for (let i = 0; i < fields.length; i++) {
                    if (rec[fields[i]] === target) return true;
                }
                return false;
            }

            const scope = this.getDataScope(role, companyId);
            const assignedProjects = this.getAssignedProjects();
            const currentEngineer = this.getCurrentEngineerName();
            const assignedContractor = this.getAssignedContractor();

            if (scope === 'all') return records;

            if (scope === 'none') return [];

            if (scope === 'ownProject') {
                if (!assignedProjects || assignedProjects.length === 0) return [];
                const self = this;
                return records.filter(function (r) {
                    return self.isRecordInAssignedProjects(r, assignedProjects);
                });
            }

            if (scope === 'ownProjectOrOwnRecords') {
                const self = this;
                return records.filter(function (r) {
                    const recProject = pick(r, projectFields);
                    const uploadedBy = pick(r, ownerFields);
                    const isUnassignedProject = recProject === 'unknown' || recProject === '';
                    if (!assignedProjects || assignedProjects.length === 0) {
                        return isUnassignedProject && uploadedBy === currentEngineer;
                    }
                    if (self.isRecordInAssignedProjects(r, assignedProjects)) return true;
                    if (isUnassignedProject && uploadedBy === currentEngineer) return true;
                    return false;
                });
            }

            if (scope === 'ownContractor') {
                if (!assignedContractor) return [];
                const assignedContractorValue = String(assignedContractor || '').trim();
                const self = this;
                return records.filter(function (r) {
                    const contractorOk = matchesAny(r, contractorFields, assignedContractorValue);
                    const projectOk = !assignedProjects || assignedProjects.length === 0
                        || self.isRecordInAssignedProjects(r, assignedProjects);
                    return contractorOk && projectOk;
                });
            }

            return [];
        },

        // 9. Получить текущего инженера
        getCurrentEngineerName() {
            if (window.syncConfig && window.syncConfig.engineerName) return window.syncConfig.engineerName;
            if (typeof appSettings !== 'undefined' && appSettings.engineerName) return appSettings.engineerName;
            return 'Инженер';
        },

        // 10. Получить закреплённые объекты.
        // Читает оба возможных поля (assignedProjects — основное, assigned_projects —
        // алиас колонки Supabase) и берёт непустой источник; пустой массив в первом
        // поле больше не блокирует fallback на второй (было: Array.isArray([]) === true
        // "съедал" реальные данные во втором поле — см. current_plan.md §2).
        // Нормализует к UUID объекта (locations.object.id), когда справочник знает карточку.
        getAssignedProjects() {
            if (typeof appSettings === 'undefined') return [];
            const primary = Array.isArray(appSettings.assignedProjects) ? appSettings.assignedProjects : null;
            const secondary = Array.isArray(appSettings.assigned_projects) ? appSettings.assigned_projects : null;
            let raw = [];
            if (primary && primary.length > 0) raw = primary;
            else if (secondary && secondary.length > 0) raw = secondary;
            else raw = primary || secondary || [];

            const objs = window.RBI && window.RBI.services && window.RBI.services.objects;
            if (objs && typeof objs.normalizeAssignedProjectsList === 'function') {
                try { return objs.normalizeAssignedProjectsList(raw); } catch (_e) { /* fall through */ }
            }
            return raw;
        },

        /**
         * Единый match: запись ∈ assignedProjects (UUID primary, cleanString fallback).
         */
        isRecordInAssignedProjects(rec, assignedList) {
            const assigned = assignedList != null ? assignedList : this.getAssignedProjects();
            const objs = window.RBI && window.RBI.services && window.RBI.services.objects;
            if (objs && typeof objs.isRecordInAssignedProjects === 'function') {
                return objs.isRecordInAssignedProjects(rec, assigned);
            }
            // Fallback без справочника: строгое includes по типичным полям
            const list = Array.isArray(assigned) ? assigned : [];
            if (!list.length || !rec) return false;
            const candidates = [
                rec.projectId, rec.project_id,
                rec.project_canonical_key, rec.project_display_name,
                rec.projectName, rec.project
            ].map(function (x) { return String(x || '').trim(); }).filter(Boolean);
            for (let i = 0; i < candidates.length; i++) {
                if (list.indexOf(candidates[i]) >= 0) return true;
            }
            return false;
        },

        // 11. Получить подрядчика пользователя
        getAssignedContractor() {
            if (typeof appSettings === 'undefined') return '';
            return appSettings.contractorName || appSettings.contractor_name || appSettings.assignedContractor || appSettings.assigned_contractor || '';
        },

        // 19. Единая точка записи привязки «объект(ы) ↔ пользователь» в профиль
        // Supabase (`rbi_engineer_profiles`) — заменяет 3 несогласованных прямых
        // update() в game.actions.js (gameSaveUserAccess/gameBlockUserAccess) и
        // object-directory.service.js (resolveRequest), которые писали только
        // одно из двух полей профиля (assigned_projects/settings.assignedProjects),
        // из-за чего они расходились (см. current_plan.md §2). Всегда обновляет
        // ОБА поля синхронно. extraFields — дополнительные колонки профиля
        // (role/cloud_status/assigned_contractor/contractor_name и т.п.),
        // settingsPatch — дополнительные ключи settings (requestedProjects и т.п.).
        async writeUserProjectAssignment(inspectorId, projectsArray, extraFields, settingsPatch) {
            if (!window.supabaseClient || !inspectorId) return { error: 'no_client_or_id' };

            let safeProjects = Array.isArray(projectsArray) ? projectsArray : [];
            const objs = window.RBI && window.RBI.services && window.RBI.services.objects;
            if (objs && typeof objs.normalizeAssignedProjectsList === 'function') {
                safeProjects = objs.normalizeAssignedProjectsList(safeProjects);
            }
            const nowIso = new Date().toISOString();

            try {
                const { data: rows, error: readError } = await window.supabaseClient
                    .from('rbi_engineer_profiles')
                    .select('settings')
                    .eq('inspector_id', inspectorId)
                    .limit(1);

                if (readError) throw readError;

                const currentSettings = (rows && rows[0] && rows[0].settings) ? rows[0].settings : {};
                const patch = Object.assign({}, settingsPatch || {});
                if (patch.assignedProjects) {
                    patch.assignedProjects = objs && typeof objs.normalizeAssignedProjectsList === 'function'
                        ? objs.normalizeAssignedProjectsList(patch.assignedProjects)
                        : patch.assignedProjects;
                }
                const newSettings = Object.assign({}, currentSettings, patch, {
                    assignedProjects: safeProjects
                });

                const updatePayload = Object.assign({}, extraFields || {}, {
                    assigned_projects: safeProjects,
                    settings: newSettings,
                    updated_at: nowIso
                });

                const { error: writeError } = await window.supabaseClient
                    .from('rbi_engineer_profiles')
                    .update(updatePayload)
                    .eq('inspector_id', inspectorId);

                if (writeError) throw writeError;

                return { error: null, settings: newSettings };
            } catch (e) {
                console.error('[permission.service] writeUserProjectAssignment', e);
                return { error: e };
            }
        },

        // 12. Применить визуальные ограничения интерфейса
        applyUIConstraints() {
            if (this.canCreate()) {
                document.body.classList.remove('read-only-mode');
            } else {
                document.body.classList.add('read-only-mode');
            }

            document.querySelectorAll('[data-requires-create="true"]').forEach(el => {
                if (this.canCreate()) {
                    el.classList.remove('hidden');
                    el.removeAttribute('disabled');
                } else {
                    el.classList.add('hidden');
                    el.setAttribute('disabled', 'true');
                }
            });

            document.body.setAttribute('data-rbi-role', this.getCurrentRole());
            document.body.setAttribute('data-rbi-cloud-status', this.getCloudStatus());

            const aiOpt = document.getElementById('ai-optimizer-settings');
            if (aiOpt) {
                aiOpt.style.display = this.isAdmin() ? 'block' : 'none';
            }
        }
    };

    // window.RbiRoles — та же реализация, что и window.RBI.services.permissions (одна точка истины),
    // сохранена для обратной совместимости с 29 существующими потребителями.
    window.RbiRoles = permissions;

    window.RBI.services.permissions = {

        getCurrentRole: function () {
            return permissions.getCurrentRole();
        },

        getCloudStatus: function () {
            return permissions.getCloudStatus();
        },

        getPermissions: function (role, companyId) {
            return permissions.getPermissions(role, companyId);
        },

        getRoleEntry: function (role, companyId) {
            return permissions.getRoleEntry(role, companyId);
        },

        getMatrixSnapshot: function (companyId) {
            return permissions.getMatrixSnapshot(companyId);
        },

        getRoleOverrides: function () {
            return permissions.getRoleOverrides();
        },

        setRoleOverrides: function (roleKey, partial) {
            return permissions.setRoleOverrides(roleKey, partial);
        },

        clearRoleOverrides: function (roleKey) {
            return permissions.clearRoleOverrides(roleKey);
        },

        loadRoleOverrides: function () {
            return permissions.loadRoleOverrides();
        },

        getDefaultRoleEntry: function (roleKey) {
            return permissions.getDefaultRoleEntry(roleKey);
        },

        isAdmin: function () {
            return permissions.isAdmin();
        },

        isLeadership: function () {
            return permissions.isLeadership();
        },

        canManageSK: function () {
            return permissions.canManageSK();
        },

        canManageHierarchy: function () {
            return permissions.canManageHierarchy();
        },

        isEngineerOrAdmin: function () {
            return permissions.isEngineerOrAdmin();
        },

        canViewWeeklyPlan: function () {
            return permissions.canViewWeeklyPlan();
        },

        hasNoOwnObjects: function (role) {
            return permissions.hasNoOwnObjects(role);
        },

        canCreate: function () {
            return permissions.canCreate();
        },

        canPush: function () {
            return permissions.canPush();
        },

        canEdit: function (ownerName) {
            return permissions.canEdit(ownerName || '');
        },

        canDelete: function (ownerName, ownerId) {
            return permissions.canDelete(ownerName || '', ownerId);
        },

        canManageRoles: function () {
            return permissions.canManageRoles();
        },

        canManageObjects: function () {
            return permissions.canManageObjects();
        },

        canEditKnowledgeBase: function () {
            return permissions.canEditKnowledgeBase();
        },

        canViewKnowledgeBase: function () {
            return permissions.canViewKnowledgeBase();
        },

        getCurrentEngineerName: function () {
            return permissions.getCurrentEngineerName();
        },

        getAssignedProjects: function () {
            return permissions.getAssignedProjects();
        },

        isRecordInAssignedProjects: function (rec, assignedList) {
            return permissions.isRecordInAssignedProjects(rec, assignedList);
        },

        getAssignedContractor: function () {
            return permissions.getAssignedContractor();
        },

        writeUserProjectAssignment: function (inspectorId, projectsArray, extraFields, settingsPatch) {
            return permissions.writeUserProjectAssignment(inspectorId, projectsArray, extraFields, settingsPatch);
        },

        getDataScope: function (role, companyId) {
            return permissions.getDataScope(role, companyId);
        },

        getAllowedModules: function (role, companyId) {
            return permissions.getAllowedModules(role, companyId);
        },

        getContract: function (role, companyId) {
            return permissions.getContract(role, companyId);
        },

        getAllRoles: function (companyId) {
            return permissions.getAllRoles(companyId);
        },

        filterByDataScope: function (records, fieldsConfig, role, companyId) {
            return permissions.filterByDataScope(records, fieldsConfig, role, companyId);
        },

        applyUIConstraints: function () {
            return permissions.applyUIConstraints();
        },

        // Универсальная точка проверки прав для новых модулей.
        // Вызывать как ctx.permissions.can('sk', 'manage').
        // Внутренняя реализация (конфиг-матрица role×module×action) — отдельная фаза.
        can: function (module, action) {
            var self = this;
            var key = module + ':' + action;
            var map = {
                'sk:manage':         function () { return self.canManageSK(); },
                'hierarchy:manage':  function () { return self.canManageHierarchy(); },
                'knowledge:edit':    function () { return self.canEditKnowledgeBase(); },
                'knowledge:view':    function () { return self.canViewKnowledgeBase(); },
                'roles:manage':      function () { return self.canManageRoles(); },
                'objects:manage':    function () { return self.canManageObjects(); },
                'inspection:create': function () { return self.canCreate(); },
                'inspection:push':   function () { return self.canPush(); },
                'inspection:edit':   function () { return self.canEdit(); },
                'inspection:delete': function () { return self.canDelete(); }
            };
            var handler = map[key];
            if (typeof handler === 'function') {
                return handler();
            }
            console.warn('[RBI.permissions.can] unknown module:action =', key);
            return false;
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.permissions', window.RBI.services.permissions);
    }

    console.log('[RBI Service] permissions loaded');
}());
