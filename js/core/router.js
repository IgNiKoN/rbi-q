/* Файл: js/core/router.js */

window.AppRouter = {
    routes: {},
    scrollPositions: {}, // Память прокрутки для каждой вкладки
    /** Путь, для которого UI считается «смонтированным» после последнего renderRoute */
    activePath: null,

    /**
     * Подвкладки: bare `#/quality/engineer` → `#/quality/engineer/tasks`,
     * Back ходит между slug'ами одной семьи без heavy teardown.
     */
    subTabMaps: {
        '#/quality/engineer': {
            defaultSlug: 'tasks',
            slugToId: {
                tasks: 'eng-sub-tasks',
                badges: 'eng-sub-badges',
                meetings: 'eng-sub-meetings',
                impact: 'eng-sub-impact',
                fmea: 'eng-sub-fmea'
            },
            idToSlug: {
                'eng-sub-tasks': 'tasks',
                'eng-sub-badges': 'badges',
                'eng-sub-meetings': 'meetings',
                'eng-sub-impact': 'impact',
                'eng-sub-fmea': 'fmea'
            }
        },
        '#/quality/analytics': {
            defaultSlug: 'contractors',
            slugToId: {
                contractors: 'sub-contractors',
                onepager: 'sub-onepager',
                schedule: 'sub-schedule',
                sk: 'sub-sk',
                history: 'sub-history'
            },
            idToSlug: {
                'sub-contractors': 'contractors',
                'sub-onepager': 'onepager',
                'sub-schedule': 'schedule',
                'sub-sk': 'sk',
                'sub-history': 'history'
            }
        },
        '#/quality/reference': {
            defaultSlug: 'checklists',
            slugToId: {
                checklists: 'ref-sub-checklists',
                docs: 'ref-sub-docs',
                nodes: 'ref-sub-nodes',
                twi: 'ref-sub-twi',
                practices: 'ref-sub-practices'
            },
            idToSlug: {
                'ref-sub-checklists': 'checklists',
                'ref-sub-docs': 'docs',
                'ref-sub-nodes': 'nodes',
                'ref-sub-twi': 'twi',
                'ref-sub-practices': 'practices'
            }
        },
        '#/knowledge': {
            defaultSlug: 'checklists',
            slugToId: {
                checklists: 'ref-sub-checklists',
                docs: 'ref-sub-docs',
                nodes: 'ref-sub-nodes',
                twi: 'ref-sub-twi',
                practices: 'ref-sub-practices'
            },
            idToSlug: {
                'ref-sub-checklists': 'checklists',
                'ref-sub-docs': 'docs',
                'ref-sub-nodes': 'nodes',
                'ref-sub-twi': 'twi',
                'ref-sub-practices': 'practices'
            }
        },
        '#/construction/reference': {
            defaultSlug: 'checklists',
            slugToId: {
                checklists: 'ref-sub-checklists',
                docs: 'ref-sub-docs',
                nodes: 'ref-sub-nodes',
                twi: 'ref-sub-twi',
                practices: 'ref-sub-practices'
            },
            idToSlug: {
                'ref-sub-checklists': 'checklists',
                'ref-sub-docs': 'docs',
                'ref-sub-nodes': 'nodes',
                'ref-sub-twi': 'twi',
                'ref-sub-practices': 'practices'
            }
        },
        '#/settings': {
            defaultSlug: 'platform',
            slugToId: {
                platform: 'platform',
                company: 'company',
                'platform-admin': 'platform-admin',
                admin: 'admin',
                quality: 'quality',
                construction: 'construction'
            },
            idToSlug: {
                platform: 'platform',
                company: 'company',
                'platform-admin': 'platform-admin',
                admin: 'admin',
                quality: 'quality',
                construction: 'construction'
            }
        }
    },

    /**
     * Тяжёлые маршруты: полный teardown view при уходе (не CSS-hide).
     * Перед очисткой DOM — flush черновиков (RBIFormDraft).
     * Remount каркаса — ensure* / rbiEnsureTabMarkup в AppViews.render*.
     */
    heavyRoutes: {
        '#/quality/analytics': {
            containerId: 'tab-analytics',
            teardown: function () {
                var mod = window.AnalyticsModule
                    || (window.RBI && window.RBI.registry && typeof window.RBI.registry.get === 'function'
                        ? window.RBI.registry.get('module.analytics')
                        : null);
                if (mod && typeof mod.teardownView === 'function') {
                    mod.teardownView();
                    return;
                }
                if (typeof window.rbiTeardownTabView === 'function') {
                    window.rbiTeardownTabView('tab-analytics', function () {
                        try {
                            if (window.AnalyticsDesktopRender && typeof window.AnalyticsDesktopRender.teardown === 'function') {
                                window.AnalyticsDesktopRender.teardown();
                            }
                        } catch (_) { /* ignore */ }
                        try {
                            if (window.AnalyticsState && window.AnalyticsState.chartInstances) {
                                Object.values(window.AnalyticsState.chartInstances).forEach(function (ch) {
                                    try { if (ch && typeof ch.destroy === 'function') ch.destroy(); } catch (e) { /* ignore */ }
                                });
                                if (typeof window.AnalyticsState.setChartInstances === 'function') {
                                    window.AnalyticsState.setChartInstances({});
                                }
                            }
                        } catch (_) { /* ignore */ }
                        if (typeof window.clearAnalyticsViewRuntimeCaches === 'function') {
                            try { window.clearAnalyticsViewRuntimeCaches(); } catch (_) { /* ignore */ }
                        }
                    });
                }
            }
        },
        '#/quality/audit': {
            containerId: 'tab-audit',
            teardown: function () {
                // Desktop shell живёт sibling'ом в #app-root (не внутри #tab-audit) —
                // сначала вернуть DOM-куски и снять shell, иначе Осмотр остаётся поверх СК.
                try {
                    if (window.__auditDesktop && typeof window.__auditDesktop.teardown === 'function') {
                        window.__auditDesktop.teardown();
                    }
                } catch (_) { /* ignore */ }
                if (typeof window.rbiTeardownTabView === 'function') {
                    window.rbiTeardownTabView('tab-audit');
                } else {
                    var el = document.getElementById('tab-audit');
                    if (el) el.innerHTML = '';
                }
            }
        },
        '#/quality/engineer': {
            containerId: 'tab-engineer',
            teardown: function () {
                try {
                    if (window.__engineerDesktop && typeof window.__engineerDesktop.teardown === 'function') {
                        window.__engineerDesktop.teardown();
                    } else if (window.EngineerDesktopRender && typeof window.EngineerDesktopRender.teardown === 'function') {
                        window.EngineerDesktopRender.teardown();
                    }
                } catch (_) { /* ignore */ }
                if (typeof window.rbiTeardownTabView === 'function') {
                    window.rbiTeardownTabView('tab-engineer');
                } else {
                    var el = document.getElementById('tab-engineer');
                    if (el) el.innerHTML = '';
                }
            }
        },
        '#/quality/reference': {
            containerId: 'tab-reference',
            teardown: function () {
                try {
                    if (window.__knowledgeDesktop && typeof window.__knowledgeDesktop.teardown === 'function') {
                        window.__knowledgeDesktop.teardown();
                    } else if (window.KnowledgeDesktopRender && typeof window.KnowledgeDesktopRender.teardown === 'function') {
                        window.KnowledgeDesktopRender.teardown();
                    }
                } catch (_) { /* ignore */ }
                if (typeof window.rbiTeardownTabView === 'function') {
                    window.rbiTeardownTabView('tab-reference');
                } else {
                    var el = document.getElementById('tab-reference');
                    if (el) el.innerHTML = '';
                }
            }
        },
        '#/knowledge': {
            containerId: 'tab-reference',
            teardown: function () {
                try {
                    if (window.__knowledgeDesktop && typeof window.__knowledgeDesktop.teardown === 'function') {
                        window.__knowledgeDesktop.teardown();
                    } else if (window.KnowledgeDesktopRender && typeof window.KnowledgeDesktopRender.teardown === 'function') {
                        window.KnowledgeDesktopRender.teardown();
                    }
                } catch (_) { /* ignore */ }
                if (typeof window.rbiTeardownTabView === 'function') {
                    window.rbiTeardownTabView('tab-reference');
                } else {
                    var el = document.getElementById('tab-reference');
                    if (el) el.innerHTML = '';
                }
            }
        },

        '#/settings': {
            containerId: 'tab-settings',
            teardown: function () {
                try {
                    if (window.__settingsDesktop && typeof window.__settingsDesktop.teardown === 'function') {
                        window.__settingsDesktop.teardown();
                    }
                } catch (_) { /* ignore */ }
                if (typeof window.rbiTeardownTabView === 'function') {
                    window.rbiTeardownTabView('tab-settings');
                } else {
                    var el = document.getElementById('tab-settings');
                    if (el) el.innerHTML = '';
                }
            }
        },
        '#/construction/defects': {
            containerId: 'tab-construction-defects',
            teardown: function () {
                if (typeof window.rbiTeardownTabView === 'function') {
                    window.rbiTeardownTabView('tab-construction-defects');
                }
            }
        },
        '#/construction/acceptance': {
            containerId: 'tab-construction-acceptance',
            teardown: function () {
                if (typeof window.rbiTeardownTabView === 'function') {
                    window.rbiTeardownTabView('tab-construction-acceptance');
                }
            }
        },
        '#/construction/transfer': {
            containerId: 'tab-transfer',
            teardown: function () {
                if (typeof window.rbiTeardownTabView === 'function') {
                    window.rbiTeardownTabView('tab-transfer');
                }
            }
        },
        '#/construction/reference': {
            // тот же #tab-reference
            containerId: 'tab-reference',
            teardown: function () {
                try {
                    if (window.__knowledgeDesktop && typeof window.__knowledgeDesktop.teardown === 'function') {
                        window.__knowledgeDesktop.teardown();
                    } else if (window.KnowledgeDesktopRender && typeof window.KnowledgeDesktopRender.teardown === 'function') {
                        window.KnowledgeDesktopRender.teardown();
                    }
                } catch (_) { /* ignore */ }
                if (typeof window.rbiTeardownTabView === 'function') {
                    window.rbiTeardownTabView('tab-reference');
                } else {
                    var el = document.getElementById('tab-reference');
                    if (el) el.innerHTML = '';
                }
            }
        }
    },

    init() {
        console.log("Умный Роутер запущен");

        window.addEventListener('popstate', () => this.renderRoute());

        document.body.addEventListener('click', (e) => {
            const navItem = e.target.closest('[data-path]');
            if (navItem) {
                e.preventDefault();
                this.navigate(navItem.dataset.path);
            }
        });

        let startHash = window.location.hash || '';
        // Пустой hash → последний модульный экран или Осмотр.
        // Settings hash оставляем как есть (chrome); фоновый увод на settings
        // чинится в settings.render (_renderSettingsTab fromRouter).
        if (!startHash || startHash === '#/') {
            const restored = this._readLastModuleHash() || '#/quality/audit';
            this.navigate(restored, true);
        } else {
            this._rememberModuleHash(startHash);
            this.renderRoute();
        }

        // Модули (разметка вкладок) грузятся на window.load после AppRouter.init.
        // Первый renderRoute часто не находит #tab-* — повторяем после platform:ready.
        try {
            var self = this;
            function _rerenderAfterModules() {
                queueMicrotask(function () {
                    try { self.renderRoute(); } catch (_) { /* ignore */ }
                });
            }
            if (window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function') {
                window.RBI.events.on('platform:ready', _rerenderAfterModules);
            }
            window.addEventListener('load', function () {
                setTimeout(_rerenderAfterModules, 0);
                setTimeout(_rerenderAfterModules, 250);
            });
        } catch (_) { /* ignore */ }
    },

    _isSettingsPath(path) {
        const p = String(path || '');
        return /^#\/settings(\/|$)/i.test(p) || /^#\/quality\/settings(\/|$)/i.test(p);
    },

    _readLastModuleHash() {
        try {
            const h = localStorage.getItem('rbi_last_module_hash') || '';
            if (!h || h === '#/' || this._isSettingsPath(h)) return '';
            return h;
        } catch (_) {
            return '';
        }
    },

    _rememberModuleHash(path) {
        const p = String(path || '');
        if (!p || p === '#/' || this._isSettingsPath(p)) return;
        try {
            localStorage.setItem('rbi_last_module_hash', p);
        } catch (_) { /* ignore */ }
    },

    addRoute(path, renderFunction) {
        this.routes[path] = renderFunction;
    },

    /** Самый длинный ключ heavyRoutes / subTabMaps / routes, который является prefix path. */
    familyBase(path) {
        const p = String(path || '');
        let best = null;
        let bestLen = -1;
        const consider = (key) => {
            if (!key || key === '*') return;
            if (p === key || p.startsWith(key + '/')) {
                if (key.length > bestLen) {
                    best = key;
                    bestLen = key.length;
                }
            }
        };
        Object.keys(this.heavyRoutes || {}).forEach(consider);
        Object.keys(this.subTabMaps || {}).forEach(consider);
        Object.keys(this.routes || {}).forEach(consider);
        return best;
    },

    sameFamily(a, b) {
        const fa = this.familyBase(a);
        const fb = this.familyBase(b);
        return !!(fa && fb && fa === fb);
    },

    /** Bare `#/quality/engineer` → `#/quality/engineer/tasks`.
     * Legacy `#/quality/settings` → `#/settings/...` (platform surface). */
    normalizeSubPath(path) {
        let p = String(path || '');
        // Alias: старый quality-scoped путь → платформенный
        if (p === '#/quality/settings' || p.indexOf('#/quality/settings/') === 0) {
            p = '#/settings' + p.slice('#/quality/settings'.length);
        }
        const maps = this.subTabMaps || {};
        for (const base of Object.keys(maps)) {
            if (p === base || p === base + '/') {
                return base + '/' + maps[base].defaultSlug;
            }
        }
        return p;
    },

    resolveRoute(path) {
        const p = String(path || '');
        if (this.routes[p]) return this.routes[p];
        let bestFn = null;
        let bestLen = -1;
        Object.keys(this.routes || {}).forEach((key) => {
            if (key === '*') return;
            if ((p === key || p.startsWith(key + '/')) && key.length > bestLen) {
                bestFn = this.routes[key];
                bestLen = key.length;
            }
        });
        return bestFn || this.routes['*'] || null;
    },

    resolveHeavy(path) {
        const p = String(path || '');
        if (this.heavyRoutes[p]) return { base: p, entry: this.heavyRoutes[p] };
        let best = null;
        let bestLen = -1;
        Object.keys(this.heavyRoutes || {}).forEach((key) => {
            if ((p === key || p.startsWith(key + '/')) && key.length > bestLen) {
                best = key;
                bestLen = key.length;
            }
        });
        return best ? { base: best, entry: this.heavyRoutes[best] } : null;
    },

    subTabIdFromPath(path, base) {
        const map = this.subTabMaps && this.subTabMaps[base];
        if (!map) return null;
        const p = String(path || '');
        if (p !== base && !p.startsWith(base + '/')) {
            return map.slugToId[map.defaultSlug] || null;
        }
        const rest = p.slice(base.length).replace(/^\//, '');
        const slug = (rest.split('/')[0] || map.defaultSlug);
        return map.slugToId[slug] || map.slugToId[map.defaultSlug] || null;
    },

    slugFromSubTabId(base, tabId) {
        const map = this.subTabMaps && this.subTabMaps[base];
        if (!map) return null;
        if (map.idToSlug[tabId]) return map.idToSlug[tabId];
        if (map.slugToId[tabId]) return tabId;
        return map.defaultSlug;
    },

    /**
     * Переход на подвкладку: `navigateSub('#/quality/engineer', 'eng-sub-meetings')`
     * или slug `'meetings'`.
     */
    navigateSub(base, slugOrId, replace) {
        const map = this.subTabMaps && this.subTabMaps[base];
        if (!map) {
            this.navigate(base, !!replace);
            return;
        }
        const slug = this.slugFromSubTabId(base, slugOrId) || map.defaultSlug;
        const path = base + '/' + slug;
        if ((window.location.hash || '') === path) return;
        this.navigate(path, !!replace);
    },

    navigate(path, replace = false) {
        // 1. Запоминаем скролл текущей вкладки перед уходом
        const currentPath = window.location.hash || '#/quality/audit';
        this.scrollPositions[currentPath] = window.scrollY;

        // 2. Делаем тихий переход
        if (replace) {
            window.history.replaceState(null, '', path);
        } else {
            window.history.pushState(null, '', path);
        }
        this._rememberModuleHash(path);
        this.renderRoute();
    },

    _teardownHeavyIfNeeded(leavingPath, enteringPath) {
        if (!leavingPath || leavingPath === enteringPath) return;
        // Подвкладки одной семьи (engineer/tasks → engineer/meetings) — без wipe
        if (this.sameFamily(leavingPath, enteringPath)) return;

        const resolved = this.resolveHeavy(leavingPath);
        if (!resolved || !resolved.entry || typeof resolved.entry.teardown !== 'function') return;
        const entry = resolved.entry;

        // Глобальный flush отложенных scheduleSave (localStorage), до любого DOM wipe
        try {
            if (window.RBIFormDraft && typeof window.RBIFormDraft.flushPending === 'function') {
                window.RBIFormDraft.flushPending();
            }
        } catch (_) { /* ignore */ }

        try {
            entry.teardown();
        } catch (err) {
            console.warn('[AppRouter] heavy teardown failed for', leavingPath, err);
        }
        // Страховка: контейнер пуст даже если teardown не дошёл до innerHTML
        if (entry.containerId) {
            const el = document.getElementById(entry.containerId);
            if (el && el.innerHTML) el.innerHTML = '';
        }
    },

    renderRoute() {
        let path = window.location.hash || '#/quality/audit';
        const normalized = this.normalizeSubPath(path);
        if (normalized !== path) {
            this.navigate(normalized, true);
            return;
        }

        const renderFunction = this.resolveRoute(path);

        if (renderFunction) {
            this._teardownHeavyIfNeeded(this.activePath, path);
            renderFunction();
            this.activePath = path;
            this.updateNavHighlight(path);
            // P2-0011: модули платформы (План/Факт …) узнают, что показан другой маршрут — переход через pushState не даёт hashchange.
            try { window.dispatchEvent(new CustomEvent('rbi:route', { detail: { path: path } })); } catch (_) { /* ignore */ }

            // 3. Восстанавливаем скролл.
            // Ждем 60мс, чтобы скрипт шапки успел пересчитать отступы (padding)
            setTimeout(() => {
                const savedScroll = this.scrollPositions[path] || 0;
                window.scrollTo(0, savedScroll);
            }, 60);
        }
    },

    updateNavHighlight(path) {
        const p = String(path || '');
        // Longest data-path wins — иначе parent (`#/construction-v2` = Планы)
        // остаётся active вместе с дочерней вкладкой (`…/defects` и т.д.).
        // P2-0011: уровни считаются отдельно — подвкладки (нижний таббар + nav2) и боковое меню; раньше общий «самый длинный»
        // путь подвкладки гасил пункт модуля платформы в боковом меню (#/planfact при открытом #/planfact/vor).
        const matches = (itemPath) => !!(itemPath && (p === itemPath || p.startsWith(itemPath + '/')));
        const highlight = (selector) => {
            const items = Array.from(document.querySelectorAll(selector));
            let bestLen = -1;
            items.forEach((item) => {
                const itemPath = item.dataset.path || '';
                if (matches(itemPath) && itemPath.length > bestLen) bestLen = itemPath.length;
            });
            items.forEach((item) => {
                const itemPath = item.dataset.path || '';
                item.classList.toggle('active', itemPath.length === bestLen && matches(itemPath));
            });
        };
        highlight('#main-bottom-nav .nav-item[data-path], #app-nav2 .app-nav2-item[data-path]');
        highlight('#app-sidebar [data-path]');
        // Mode icons in sidebar: path-independent — sync with AppModeManager.
        // Settings is chrome (footer): keep the current business module highlighted too.
        // P2-0011: открыт модуль платформы (пункт с data-path, напр. План/Факт) — подсвечен он, а не бизнес-модуль режима.
        // Настройки из модуля платформы (его подвкладки ещё в RBI.platformNav) — текущим модулем остаётся он.
        const pnav = window.RBI && window.RBI.platformNav;
        let platformOpen = false;
        document.querySelectorAll('#app-sidebar [data-sidebar-module-id][data-path]').forEach((el) => {
            const own = matches(el.dataset.path || '') || !!(pnav && pnav.id === el.getAttribute('data-sidebar-module-id') && this._isSettingsPath(p));
            if (own) { el.classList.add('active'); platformOpen = true; }
        });
        let mode = null;
        try {
            mode = window.AppModeManager && window.AppModeManager.currentMode;
        } catch (_) { mode = null; }
        document.querySelectorAll('#app-sidebar [data-sidebar-module-id]').forEach(function (el) {
            if (el.hasAttribute('data-path')) return;   // пункт модуля платформы — по пути (выше)
            const id = el.getAttribute('data-sidebar-module-id');
            el.classList.toggle('active', !platformOpen && !!(mode && id === mode));
        });
    }
};

window.switchTab = function (tabId, navElement = null) {
    const routeMap = {
        'tab-audit': '#/quality/audit',
        'tab-engineer': '#/quality/engineer',
        'tab-analytics': '#/quality/analytics',
        'tab-reference': '#/quality/reference',
        'tab-settings': '#/settings'
    };

    if (routeMap[tabId]) {
        AppRouter.navigate(routeMap[tabId]);
    }
};
