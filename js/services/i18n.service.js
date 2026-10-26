/* Файл: js/services/i18n.service.js */
/* i18n Service v1 — тонкий каркас локализации оболочки (ru / en / sr-Latn / ka) */

(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    var LOCALE_KEY = 'rbi_locale';
    var ALLOWED = ['ru', 'en', 'sr-Latn', 'ka'];
    var FALLBACK = 'ru';
    var LOCALE_URLS = {
        'ru': './locales/ru.json',
        'en': './locales/en.json',
        'sr-Latn': './locales/sr-Latn.json',
        'ka': './locales/ka.json'
    };

    var _locale = FALLBACK;
    var _catalogs = {};
    var _ready = false;
    var _initPromise = null;

    function _emit(locale) {
        if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') {
            window.RBI.events.emit('i18n:localeChanged', { locale: locale });
        }
    }

    function _lookup(catalog, key) {
        if (!catalog || !key) return undefined;
        if (Object.prototype.hasOwnProperty.call(catalog, key)) return catalog[key];
        return undefined;
    }

    function _interpolate(str, vars) {
        if (!vars || typeof str !== 'string') return str;
        return str.replace(/\{(\w+)\}/g, function (_, name) {
            return vars[name] != null ? String(vars[name]) : '{' + name + '}';
        });
    }

    function _normalizeLocale(code) {
        if (!code || typeof code !== 'string') return null;
        var c = code.trim();
        return ALLOWED.indexOf(c) !== -1 ? c : null;
    }

    function _readStoredLocale() {
        try {
            return _normalizeLocale(localStorage.getItem(LOCALE_KEY));
        } catch (e) {
            return null;
        }
    }

    function _persistLocale(code) {
        try {
            localStorage.setItem(LOCALE_KEY, code);
        } catch (e) { /* ignore */ }
    }

    async function _fetchCatalog(code) {
        if (_catalogs[code]) return _catalogs[code];
        var url = LOCALE_URLS[code];
        if (!url) return {};
        try {
            var res = await fetch(url, { cache: 'no-cache' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var data = await res.json();
            _catalogs[code] = data && typeof data === 'object' ? data : {};
        } catch (e) {
            console.warn('[RBI.i18n] failed to load', code, e);
            _catalogs[code] = _catalogs[code] || {};
        }
        return _catalogs[code];
    }

    function t(key, vars) {
        if (!key) return '';
        var cur = _lookup(_catalogs[_locale], key);
        if (cur == null && _locale !== FALLBACK) {
            cur = _lookup(_catalogs[FALLBACK], key);
        }
        if (cur == null) return key;
        return _interpolate(String(cur), vars);
    }

    function applyDom(root) {
        var scope = root && root.querySelectorAll ? root : document;
        var nodes = scope.querySelectorAll('[data-i18n]');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var key = el.getAttribute('data-i18n');
            if (!key) continue;
            var text = t(key);
            var attr = el.getAttribute('data-i18n-attr');
            if (attr) {
                el.setAttribute(attr, text);
            } else {
                el.textContent = text;
            }
        }
    }

    function getLocale() {
        return _locale;
    }

    function getAvailableLocales() {
        return ALLOWED.map(function (code) {
            return { code: code, label: t('settings.locale.' + code) };
        });
    }

    function setLocale(code) {
        var next = _normalizeLocale(code);
        if (!next) {
            console.warn('[RBI.i18n] invalid locale', code);
            return false;
        }
        var prev = _locale;
        _locale = next;
        _persistLocale(next);
        if (!_catalogs[next]) {
            // sync path: catalog missing — kick async load then re-apply
            _fetchCatalog(next).then(function () {
                applyDom(document);
                _emit(next);
            });
            return true;
        }
        applyDom(document);
        if (prev !== next) _emit(next);
        else _emit(next);
        return true;
    }

    async function init() {
        if (_ready) return true;
        if (_initPromise) return _initPromise;
        _initPromise = (async function () {
            var stored = _readStoredLocale();
            _locale = stored || FALLBACK;
            await _fetchCatalog(FALLBACK);
            if (_locale !== FALLBACK) await _fetchCatalog(_locale);
            // warm remaining in background (non-blocking for first paint)
            ALLOWED.forEach(function (code) {
                if (code !== FALLBACK && code !== _locale) {
                    _fetchCatalog(code).catch(function () { /* ignore */ });
                }
            });
            _ready = true;
            return true;
        })();
        try {
            await _initPromise;
        } finally {
            _initPromise = null;
        }
        return true;
    }

    window.RBI.services.i18n = {
        init: init,
        t: t,
        getLocale: getLocale,
        setLocale: setLocale,
        getAvailableLocales: getAvailableLocales,
        applyDom: applyDom
        // Future: tContent / entity translation fields — separate design (YAGNI v1)
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.i18n', window.RBI.services.i18n);
    }

    console.log('[RBI Service] i18n loaded');
}());
