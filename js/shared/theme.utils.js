/* Файл: js/shared/theme.utils.js */
/* P2-0051: единый список тем, разрешение «Авто», перенос со старой темы по умолчанию и ранняя установка темы.
   Подключается обычным <script> в <head> index.html (до отрисовки) — без вспышки старой темы.
   Владелец выбора темы — js/services/settings.service.js (appSettings.theme, IndexedDB user_prefs);
   localStorage `rbi_theme_preference` — только зеркало для ранней отрисовки. */
(function (root) {
    'use strict';

    var DEFAULT_THEME = 'std-auto';
    /** Прежняя тема по умолчанию (до P2-0051): кто её не менял — переходит на «Стандартную · Авто» один раз. */
    var LEGACY_DEFAULT = 'rbi-auto-v3';
    var PREF_KEY = 'rbi_theme_preference';
    /** Время (мс) переноса на этом устройстве; после него явный выбор «RBI · Авто» сохраняется. */
    var MIGRATED_KEY = 'rbi_theme_std_migrated_at';

    /** Режим «Авто» → [светлая, тёмная]. */
    var AUTO = {
        'std-auto': ['std-light', 'std-dark'],
        'auto': ['light', 'dark'],
        'rbi-auto': ['rbi-light', 'rbi-dark'],
        'rbi-auto-v2': ['rbi-light-v2', 'rbi-dark-v2'],
        'rbi-auto-v3': ['rbi-light-v3', 'rbi-dark-v3']
    };
    var LIGHT = ['std-light', 'light', 'rbi-light', 'rbi-light-v2', 'rbi-light-v3'];
    var DARK = ['std-dark', 'dark', 'rbi-dark', 'rbi-dark-v2', 'rbi-dark-v3'];
    var RESOLVED = LIGHT.concat(DARK);
    var ALLOWED = [
        'std-auto', 'std-light', 'std-dark',
        'auto', 'light', 'dark',
        'rbi-light', 'rbi-dark', 'rbi-auto',
        'rbi-light-v2', 'rbi-dark-v2', 'rbi-auto-v2',
        'rbi-light-v3', 'rbi-dark-v3', 'rbi-auto-v3'
    ];

    function _ls() {
        try { return root.localStorage || null; } catch (e) { return null; }
    }

    function isAllowed(theme) { return ALLOWED.indexOf(theme) !== -1; }
    function normalize(theme) { return isAllowed(theme) ? theme : DEFAULT_THEME; }
    function isAuto(theme) { return Object.prototype.hasOwnProperty.call(AUTO, theme); }
    function isDark(resolved) { return DARK.indexOf(resolved) !== -1; }

    function prefersDark() {
        try { return !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { return false; }
    }

    /** Выбранная тема (в т. ч. «Авто») → конкретная тема для data-theme. */
    function resolve(theme, dark) {
        var t = normalize(theme);
        if (isAuto(t)) return AUTO[t][(dark === undefined ? prefersDark() : dark) ? 1 : 0];
        return RESOLVED.indexOf(t) !== -1 ? t : 'std-light';
    }

    function migratedAt(storage) {
        var s = storage || _ls();
        if (!s) return 0;
        try { return Number(s.getItem(MIGRATED_KEY)) || 0; } catch (e) { return 0; }
    }

    /**
     * Перенос со старой темы по умолчанию. `rbi-auto-v3`, сохранённая до переноса на этом устройстве
     * (updatedAt — метка настроек, 0/нет = никогда не менял), → `std-auto`. Явный выбор другой темы и
     * выбор «RBI · Авто» после переноса — не трогаются. Возвращает итоговую тему.
     */
    function migrate(theme, updatedAt, storage) {
        if (theme !== LEGACY_DEFAULT) return theme;
        var at = migratedAt(storage);
        if (at && Number(updatedAt) > at) return theme;
        return DEFAULT_THEME;
    }

    /** Отметить, что перенос на этом устройстве выполнен (один раз). */
    function markMigrated(storage) {
        var s = storage || _ls();
        if (!s) return;
        try { if (!s.getItem(MIGRATED_KEY)) s.setItem(MIGRATED_KEY, String(Date.now())); } catch (e) { /* ignore */ }
    }

    /** Поставить тему на <html>: data-theme + классы (Tailwind darkMode: 'class'). Возвращает конкретную тему. */
    function apply(theme, doc) {
        var d = doc || root.document;
        var resolved = resolve(theme);
        if (!d || !d.documentElement) return resolved;
        var el = d.documentElement;
        el.setAttribute('data-theme', resolved);
        for (var i = 0; i < RESOLVED.length; i++) el.classList.remove(RESOLVED[i]);
        el.classList.add(resolved);
        if (isDark(resolved)) { el.classList.add('dark'); el.classList.remove('light'); }
        else { el.classList.add('light'); el.classList.remove('dark'); }
        return resolved;
    }

    /** Ранняя установка (до загрузки настроек): зеркало localStorage, с учётом переноса. */
    function early() {
        var s = _ls();
        var saved = null;
        try { saved = s ? s.getItem(PREF_KEY) : null; } catch (e) { saved = null; }
        // После переноса зеркало повторяет выбор пользователя; до переноса старая тема по умолчанию → «Стандартная».
        // Отметку о переносе ставит загрузка настроек (settings.actions.js), не ранняя установка.
        var theme = !isAllowed(saved) ? DEFAULT_THEME
            : (saved === LEGACY_DEFAULT && !migratedAt(s) ? DEFAULT_THEME : saved);
        return apply(theme);
    }

    root.RBI_THEME = {
        DEFAULT_THEME: DEFAULT_THEME,
        LEGACY_DEFAULT: LEGACY_DEFAULT,
        PREF_KEY: PREF_KEY,
        MIGRATED_KEY: MIGRATED_KEY,
        ALLOWED: ALLOWED.slice(),
        DARK: DARK.slice(),
        LIGHT: LIGHT.slice(),
        RESOLVED: RESOLVED.slice(),
        isAllowed: isAllowed,
        normalize: normalize,
        isAuto: isAuto,
        isDark: isDark,
        resolve: resolve,
        migrate: migrate,
        markMigrated: markMigrated,
        migratedAt: migratedAt,
        apply: apply,
        early: early
    };

    if (root.document && root.document.documentElement && !root.__RBI_THEME_NO_EARLY) {
        try { early(); } catch (e) { /* ignore */ }
    }
}(typeof window !== 'undefined' ? window : globalThis));
