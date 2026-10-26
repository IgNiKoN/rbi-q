/* Файл: js/shared/system-templates-locale.js */
/* i18n v1.16: runtime-подмена title/group/n/t в window.SYSTEM_TEMPLATES по текущей локали.
   RU (data/system_templates.js) не редактируется — этот модуль мутирует те же 4 поля
   in-place при смене локали и восстанавливает RU из pristine-снэпшота при возврате на 'ru'.
   Overlay-данные: data/system_templates.en.js / data/system_templates.sr-Latn.js / data/system_templates.ka.js (plain script,
   должны быть подключены раньше этого модуля и раньше/после SYSTEM_TEMPLATES — не важно порядок
   относительно overlay, важно что SYSTEM_TEMPLATES уже существует к моменту applySystemTemplatesLocale). */

let _pristine = null; // { [templateKey]: { title, groups: [group names...] , items: { [id]: { n, t } } } }

function _snapshotPristine() {
    if (_pristine) return _pristine;
    const templates = window.SYSTEM_TEMPLATES;
    _pristine = {};
    if (!templates) return _pristine;
    for (const key in templates) {
        const tpl = templates[key];
        if (!tpl || !Array.isArray(tpl.groups)) continue;
        const entry = { title: tpl.title, groups: [], items: {} };
        for (const grp of tpl.groups) {
            entry.groups.push(grp.group);
            if (!Array.isArray(grp.items)) continue;
            for (const item of grp.items) {
                entry.items[item.id] = { n: item.n, t: item.t };
            }
        }
        _pristine[key] = entry;
    }
    return _pristine;
}

function _overlayFor(locale) {
    if (locale === 'en') return window.SYSTEM_TEMPLATES_LOCALE_EN;
    if (locale === 'sr-Latn') return window.SYSTEM_TEMPLATES_LOCALE_SR_LATN;
    if (locale === 'ka') return window.SYSTEM_TEMPLATES_LOCALE_KA;
    return null;
}

function applySystemTemplatesLocale(locale) {
    const templates = window.SYSTEM_TEMPLATES;
    if (!templates) {
        console.warn('[system-templates-locale] SYSTEM_TEMPLATES not available yet');
        return;
    }
    const pristine = _snapshotPristine();

    if (locale === 'ru') {
        for (const key in templates) {
            const tpl = templates[key];
            const snap = pristine[key];
            if (!tpl || !snap) continue;
            tpl.title = snap.title;
            let gi = 0;
            for (const grp of tpl.groups) {
                grp.group = snap.groups[gi++];
                if (!Array.isArray(grp.items)) continue;
                for (const item of grp.items) {
                    const s = snap.items[item.id];
                    if (s) {
                        item.n = s.n;
                        item.t = s.t;
                    }
                }
            }
        }
        return;
    }

    const overlay = _overlayFor(locale);
    if (!overlay) {
        console.warn('[system-templates-locale] no overlay for locale', locale);
        return;
    }

    for (const key in templates) {
        const tpl = templates[key];
        const snap = pristine[key];
        if (!tpl || !snap) continue;
        const tplOverlay = overlay.templates && overlay.templates[key];
        if (tplOverlay && typeof tplOverlay.title === 'string') {
            tpl.title = tplOverlay.title;
        } else {
            console.warn('[system-templates-locale] missing title translation', locale, key);
            tpl.title = snap.title;
        }

        let gi = 0;
        for (const grp of tpl.groups) {
            const groupName = tplOverlay && Array.isArray(tplOverlay.groups) ? tplOverlay.groups[gi] : undefined;
            if (typeof groupName === 'string') {
                grp.group = groupName;
            } else {
                console.warn('[system-templates-locale] missing group translation', locale, key, gi);
                grp.group = snap.groups[gi];
            }
            gi++;

            if (!Array.isArray(grp.items)) continue;
            for (const item of grp.items) {
                const itemOverlay = overlay.items && overlay.items[item.id];
                const snapItem = snap.items[item.id];
                if (itemOverlay && typeof itemOverlay.n === 'string' && typeof itemOverlay.t === 'string') {
                    item.n = itemOverlay.n;
                    item.t = itemOverlay.t;
                } else {
                    console.warn('[system-templates-locale] missing item translation', locale, item.id);
                    if (snapItem) {
                        item.n = snapItem.n;
                        item.t = snapItem.t;
                    }
                }
            }
        }
    }
}

async function _init() {
    if (window.RBI && window.RBI.services && window.RBI.services.i18n && typeof window.RBI.services.i18n.init === 'function') {
        await window.RBI.services.i18n.init();
    }
    if (window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function') {
        window.RBI.events.on('i18n:localeChanged', function (payload) {
            applySystemTemplatesLocale(payload && payload.locale);
        });
    }
    const currentLocale = window.RBI && window.RBI.services && window.RBI.services.i18n && typeof window.RBI.services.i18n.getLocale === 'function'
        ? window.RBI.services.i18n.getLocale()
        : 'ru';
    applySystemTemplatesLocale(currentLocale);
}

window.RBI = window.RBI || {};
window.RBI.services = window.RBI.services || {};
window.RBI.services.systemTemplatesLocale = { apply: applySystemTemplatesLocale };
if (window.RBI.registry && typeof window.RBI.registry.register === 'function') {
    window.RBI.registry.register('service.systemTemplatesLocale', window.RBI.services.systemTemplatesLocale);
}

_init();

export { applySystemTemplatesLocale };
