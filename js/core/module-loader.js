/**
 * module-loader.js
 * ES-модуль: загружает ModulesManifest и регистрирует window.RBI.moduleLoader.
 * loadModule(key) динамически импортирует модуль через manifest.entry и
 * вызывает init(ctx). Автозапуска при старте нет — только ручной вызов.
 */

import { ModulesManifest, getModuleManifest, isModuleEnabled } from '../modules/modules.manifest.js';

window.RBI = window.RBI || {};

/**
 * Резолвит базовый URL директории манифеста по его id.
 * Маппинг строится по той же структуре, что и modules.manifest.js.
 */
var MODULE_BASE_URLS = {
    'quality':      './js/modules/quality/',
    'sk':           './js/modules/quality/features/sk/',
    'settings':     './js/modules/settings/',
    'knowledge':    './js/modules/knowledge/',
    'construction':    './js/modules/construction/',
    'construction-v2': './js/modules/construction-v2/',
    'game':            './js/modules/quality/features/gamification/',
    'ai':              './js/modules/quality/features/ai/',
    'planfact':        './js/modules/planfact/',
    'company':         './js/modules/company/'
};

window.RBI.moduleLoader = {
    /** Once-cache: id → Promise<module> (повторный loadModule не зовёт init снова). */
    _loaded: Object.create(null),

    /** Возвращает копию массива всех манифестов. */
    getAll: function () {
        return ModulesManifest.slice();
    },

    /** Возвращает манифест по id или null. */
    getById: function (id) {
        return getModuleManifest(id);
    },

    /**
     * Возвращает массив пунктов меню всех модулей,
     * отсортированных по menu.order (не мутирует исходный массив).
     */
    getMenuItems: function () {
        return ModulesManifest
            .filter(function (m) { return m.menu && isModuleEnabled(m); })
            .map(function (m) {
                return {
                    id:      m.id,
                    label:   m.menu.label  || m.title,
                    section: m.menu.section || null,
                    order:   m.menu.order  != null ? m.menu.order : 999,
                    icon:    m.icon        || null,
                    path:    m.menu.path   || null,
                    requiresAccess: m.menu.requiresAccess === true
                };
            })
            .sort(function (a, b) { return a.order - b.order; });
    },

    /** Возвращает массив маршрутов модуля по id или пустой массив. */
    getRoutes: function (id) {
        var manifest = getModuleManifest(id);
        return manifest && manifest.routes ? manifest.routes : [];
    },

    /**
     * Динамически загружает и инициализирует модуль по id.
     * Читает manifest.entry, строит URL, делает import(), вызывает init(ctx).
     * ctx — необязателен; если не передан, берётся window.RBI.ctx или {}.
     * Идемпотентен: повторный вызов того же id возвращает тот же Promise (без повторного init).
     * Возвращает Promise<module>.
     */
    loadModule: function (id, ctx) {
        var self = this;
        if (self._loaded[id]) {
            console.log('[module-loader] loadModule: cache-hit ' + id);
            return self._loaded[id];
        }
        var manifest = getModuleManifest(id);
        if (!manifest) {
            console.error('[module-loader] loadModule: манифест не найден для id=' + id);
            return Promise.reject(new Error('module-loader: manifest not found: ' + id));
        }
        if (!isModuleEnabled(manifest)) {
            console.log('[module-loader] loadModule: модуль выключен (enabled:false) id=' + id);
            return Promise.reject(new Error('module-loader: module disabled: ' + id));
        }
        if (!manifest.entry) {
            console.error('[module-loader] loadModule: поле entry отсутствует в манифесте id=' + id);
            return Promise.reject(new Error('module-loader: manifest.entry missing: ' + id));
        }
        var baseUrl = MODULE_BASE_URLS[id];
        if (!baseUrl) {
            console.error('[module-loader] loadModule: неизвестный baseUrl для id=' + id);
            return Promise.reject(new Error('module-loader: unknown baseUrl for id: ' + id));
        }
        var relativeUrl = baseUrl + manifest.entry.replace(/^\.\//, '');
        var entryUrl = new URL(relativeUrl, document.baseURI).href;
        var resolvedCtx = ctx || (window.RBI && window.RBI.ctx) || {};
        console.log('[module-loader] loadModule: загружаю ' + id + ' → ' + entryUrl);
        var promise = import(entryUrl).then(function (mod) {
            if (typeof mod.init === 'function') {
                return Promise.resolve(mod.init(resolvedCtx)).then(function () {
                    console.log('[module-loader] loadModule: init выполнен для ' + id);
                    return mod;
                });
            }
            console.log('[module-loader] loadModule: модуль загружен (нет init) ' + id);
            return mod;
        }).catch(function (err) {
            delete self._loaded[id];
            console.error('[module-loader] loadModule: ошибка при загрузке ' + id, err);
            return Promise.reject(err);
        });
        self._loaded[id] = promise;
        return promise;
    },

    /**
     * Алиас loadModule для early-ensure (views/bootstrap) — тот же once-cache.
     */
    ensureLoaded: function (id, ctx) {
        return this.loadModule(id, ctx);
    }
};

console.log('[module-loader] window.RBI.moduleLoader готов, модулей: ' + ModulesManifest.length);
