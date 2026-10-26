/**
 * settings.routes.js — адреса «Настроек» (P2-0038): две зоны и уровни.
 *
 *   Моё (видят все):          #/settings/my/<profile|interface|device|notifications|quality|help>
 *   Администрирование:        #/settings/company/<вкладка CompanyApp>
 *                             #/settings/modules/<quality>
 *                             #/settings/platform/companies
 *
 * Ключ подраздела (key) — id панели `data-settings-panel` в settings.render.js; старые ключи «admin» и «platform-admin»
 * сохранены (на них завязаны замок админки, игровая панель руководителя, монтирование «Админа платформы»).
 * Старые адреса (#/settings/platform, /platform-admin, /admin, /directories, /quality, /construction; с этапа 3 —
 * #/planfact/directories/objects|units: объекты и единицы переехали в «Компанию») перенаправляет
 * settingsLegacyRedirect — его вызывает AppRouter.normalizeSubPath (замена адреса, без лишней записи в истории).
 * Права здесь не проверяются: закрытый подраздел без права settings.render.js открывает как «Моё → Профиль».
 */

export const SETTINGS_BASE = '#/settings';

export const MY_TABS = ['profile', 'interface', 'device', 'notifications', 'quality', 'help'];
export const MODULE_TABS = ['quality'];
export const PLATFORM_TABS = ['companies'];

/** Ключ панели → адрес без базы. */
const KEY_TO_PATH = {
    'my-profile': 'my/profile',
    'my-interface': 'my/interface',
    'my-device': 'my/device',
    'my-notifications': 'my/notifications',
    'my-quality': 'my/quality',
    'my-help': 'my/help',
    company: 'company',
    admin: 'modules/quality',
    'platform-admin': 'platform/companies'
};

export const SETTINGS_KEYS = Object.keys(KEY_TO_PATH);
export const DEFAULT_KEY = 'my-profile';
/** Ключи зоны «Администрирование». */
export const ADMIN_KEYS = ['company', 'admin', 'platform-admin'];

const DEFAULT_PATH = SETTINGS_BASE + '/my/profile';

/** P2-0038 этап 3: справочники План/Факта, переехавшие в «Компанию». */
const PLANFACT_MOVED = {
    objects: SETTINGS_BASE + '/company/objects',
    units: SETTINGS_BASE + '/company/directories'
};

/** Старый одноуровневый адрес → новый. */
const LEGACY = {
    platform: DEFAULT_PATH,
    construction: DEFAULT_PATH,
    quality: SETTINGS_BASE + '/my/quality',
    admin: SETTINGS_BASE + '/modules/quality',
    directories: SETTINGS_BASE + '/modules/quality',
    'platform-admin': SETTINGS_BASE + '/platform/companies'
};

function segments(path) {
    const p = String(path || '');
    if (p !== SETTINGS_BASE && p.indexOf(SETTINGS_BASE + '/') !== 0) return null;
    return p.slice(SETTINGS_BASE.length).split('?')[0].split('/').filter(Boolean);
}

/**
 * Адрес «Настроек» → канонический адрес (тот же, если уже канонический); не «Настройки» — без изменений.
 * Старый #/settings/platform (без второго уровня) — это личная «Платформа» → «Моё»; #/settings/platform/<…> — уровень «Платформа».
 */
export function settingsLegacyRedirect(path) {
    const pf = /^#\/planfact\/directories\/(objects|units)(?:[/?]|$)/.exec(String(path || ''));
    if (pf) return PLANFACT_MOVED[pf[1]];
    const seg = segments(path);
    if (!seg) return path;
    const [a, b] = seg;
    if (!a) return DEFAULT_PATH;
    if (a === 'company') return path;
    if (a === 'my') return MY_TABS.indexOf(b) !== -1 && seg.length === 2 ? path : DEFAULT_PATH;
    if (a === 'modules') return MODULE_TABS.indexOf(b) !== -1 && seg.length === 2 ? path : SETTINGS_BASE + '/modules/' + MODULE_TABS[0];
    if (a === 'platform' && b) return PLATFORM_TABS.indexOf(b) !== -1 && seg.length === 2 ? path : SETTINGS_BASE + '/platform/' + PLATFORM_TABS[0];
    return LEGACY[a] || DEFAULT_PATH;
}

/** Адрес → ключ панели (старый адрес сначала переводится в новый); не «Настройки» — null. */
export function settingsKeyFromHash(hash) {
    const p = settingsLegacyRedirect(String(hash || ''));
    const seg = segments(p);
    if (!seg) return null;
    if (seg[0] === 'company') return 'company';
    const rest = seg.slice(0, 2).join('/');
    for (const key of SETTINGS_KEYS) {
        if (KEY_TO_PATH[key] === rest) return key;
    }
    return DEFAULT_KEY;
}

/** Ключ панели → адрес; неизвестный — «Моё → Профиль». */
export function settingsPathForKey(key) {
    return SETTINGS_BASE + '/' + (KEY_TO_PATH[key] || KEY_TO_PATH[DEFAULT_KEY]);
}

/** Ключ → зона: 'admin' (Администрирование) или 'my'. */
export function settingsZoneForKey(key) {
    return ADMIN_KEYS.indexOf(key) !== -1 ? 'admin' : 'my';
}

if (typeof window !== 'undefined') {
    window.SettingsRoutes = {
        BASE: SETTINGS_BASE,
        KEYS: SETTINGS_KEYS,
        ADMIN_KEYS: ADMIN_KEYS,
        DEFAULT_KEY: DEFAULT_KEY,
        legacyRedirect: settingsLegacyRedirect,
        keyFromHash: settingsKeyFromHash,
        pathForKey: settingsPathForKey,
        zoneForKey: settingsZoneForKey
    };
}
