/**
 * settings.nav.js — структура «Настроек» по варианту В (P2-0048 этап 3, решение владельца 27.10.2026):
 * группы «Личные · Компания · Модули · Платформа», пункты (иконка, название, короткая подпись), поиск по настройкам.
 *
 * Пункт ведёт либо на панель (key — id панели data-settings-panel в settings.render.js), либо — для «Компании» —
 * на вкладку экрана CompanyApp (#/settings/company/<вкладка>; панель одна — 'company').
 * Права здесь не проверяются: видимость пунктов решает settings.render.js (ответы сервера, как раньше у вкладок).
 * Иконки — SVG-набор прототипа (ai-dev/reports/P2-0048/mockups/settings-v.html), без эмодзи.
 */
import { settingsKeyFromHash } from './settings.routes.js';

/** Контуры иконок 24×24 (stroke). */
export const SETTINGS_ICONS = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1.1.2-2.2 1.4-2.2H17a4 4 0 0 0 4-4c0-5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    drive: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M5 13l3-8h8l3 8"/><circle cx="17" cy="16.5" r=".8"/>',
    inspect: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12l2 2 4-4M9 17h6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.6-5 6.5-5s5.5 1.5 6.5 5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.2 2.2 3.5 5"/>',
    building: '<path d="M4 21V5l8-2v18M12 8l8 2v11M3 21h18M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2"/>',
    partners: '<path d="M3 12l4-4 3 2 3-3 4 4M7 8l-4 4 5 5 2-2M17 11l4 1-5 5-2-2"/><path d="M10 15l2 2M12 13l2 2"/>',
    ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
    puzzle: '<path d="M9 3h4v3a2 2 0 1 0 4 0V3h4v6h-3a2 2 0 1 0 0 4h3v8h-6v-3a2 2 0 1 0-4 0v3H3v-8h3a2 2 0 1 0 0-4H3V3z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    quality: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    wrench: '<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19l-3 1 1-3 7.5-7.5zM5 5l4 4M3 7l4-4"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17v.01"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chev: '<path d="M9 5l7 7-7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
};

export function settingsIcon(name, size) {
    const sz = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + sz + '" height="' + sz + '" fill="none" stroke="currentColor" stroke-width="1.8"'
        + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (SETTINGS_ICONS[name] || '') + '</svg>';
}

const CO = '#/settings/company/';

/**
 * Группы и пункты. id пункта: для панелей — ключ панели; для «Компании» — 'company/<вкладка>'.
 * tab — вкладка CompanyApp (видимость — по правам, как у вкладок CompanyApp: visibleTabs).
 */
export const SETTINGS_NAV = [
    { id: 'my', title: 'Личные', items: [
        { id: 'my-profile', key: 'my-profile', icon: 'user', label: 'Мой профиль', desc: 'имя, почта, пароль, выход' },
        { id: 'my-interface', key: 'my-interface', icon: 'palette', label: 'Вид и удобство', desc: 'тема, язык, масштаб, меню' },
        { id: 'my-notifications', key: 'my-notifications', icon: 'bell', label: 'Уведомления', desc: 'push-уведомления' },
        { id: 'my-device', key: 'my-device', icon: 'drive', label: 'Данные на устройстве', desc: 'синхронизация, хранилище, резервные копии' },
        { id: 'my-quality', key: 'my-quality', icon: 'inspect', label: 'Осмотр', desc: 'жесты, свёртывание, ИИ-помощник, отчёты' },
        { id: 'my-help', key: 'my-help', icon: 'help', label: 'Помощь и о программе', desc: 'обучение, что нового, сброс, о платформе' }
    ] },
    { id: 'company', title: 'Компания', items: [
        { id: 'company/members', key: 'company', tab: 'members', path: CO + 'members', icon: 'users', label: 'Сотрудники и доступ', desc: 'сотрудники, роли и права' },
        { id: 'company/objects', key: 'company', tab: 'objects', path: CO + 'objects', icon: 'building', label: 'Проекты и объекты', desc: 'проекты, объекты, места, подразделения' },
        { id: 'company/counterparties', key: 'company', tab: 'counterparties', path: CO + 'counterparties', icon: 'partners', label: 'Контрагенты', desc: 'заказчики, подрядчики' },
        { id: 'company/directories', key: 'company', tab: 'directories', path: CO + 'directories', icon: 'ruler', label: 'Справочники', desc: 'единицы измерения' },
        { id: 'company/branding', key: 'company', tab: 'branding', path: CO + 'branding', icon: 'tag', label: 'Фирменный стиль и отчёты', desc: 'логотип, фирменный цвет' },
        { id: 'company/modules', key: 'company', tab: 'modules', path: CO + 'modules', icon: 'puzzle', label: 'Модули', desc: 'что включено у компании' },
        { id: 'company/audit', key: 'company', tab: 'audit', path: CO + 'audit', icon: 'history', label: 'Журнал изменений', desc: 'кто что менял' }
    ] },
    { id: 'modules', title: 'Модули', items: [
        { id: 'admin', key: 'admin', icon: 'quality', label: 'Качество', desc: 'объекты и планы, подрядчики, чек-листы' },
        { id: 'modules-planfact', key: 'modules-planfact', icon: 'chart', label: 'План/Факт', desc: 'пороги светофора объектов' }
    ] },
    { id: 'platform', title: 'Платформа', items: [
        { id: 'platform-admin', key: 'platform-admin', icon: 'wrench', label: 'Платформа', desc: 'компании, модули компаний' },
        { id: 'company/patterns', key: 'company', tab: 'patterns', path: CO + 'patterns', icon: 'layers', label: 'Образцы экранов', desc: 'детали, из которых собираются экраны' }
    ] }
];

/** Все пункты списком (с названием группы). */
export function settingsNavItems() {
    const out = [];
    SETTINGS_NAV.forEach(function (g) { g.items.forEach(function (it) { out.push(Object.assign({ group: g.title }, it)); }); });
    return out;
}

/** Вкладка CompanyApp → пункт (Роли — внутри «Сотрудники и доступ»). */
const COMPANY_TAB_TO_NAV = { roles: 'company/members', who: 'company/members' };

/** Адрес → id пункта; 'home' — главная; не «Настройки» — null; «Компания» без вкладки — 'company'. */
export function settingsNavIdFromHash(hash) {
    const key = settingsKeyFromHash(hash);
    if (!key) return null;
    if (key !== 'company') return key;
    const tab = String(hash || '').replace(/^#\/settings\/company\/?/, '').split(/[/?]/)[0];
    if (!tab) return 'company';
    return COMPANY_TAB_TO_NAV[tab] || ('company/' + tab);
}

/** Пункт по id (или undefined). */
export function settingsNavItem(id) {
    return settingsNavItems().filter(function (it) { return it.id === id; })[0];
}

/**
 * Указатель поиска: название настройки → пункт. Только то, что есть на экранах сейчас (названия разделов ищутся отдельно).
 */
export const SETTINGS_SEARCH_INDEX = [
    ['Как вы вошли, выйти', 'my-profile'], ['ФИО — изменить', 'my-profile'], ['Пароль — сменить свой', 'my-profile'], ['Выбор компании', 'my-profile'],
    ['Тема приложения (светлая, тёмная)', 'my-interface'], ['Язык интерфейса', 'my-interface'], ['Масштаб интерфейса (размер текста)', 'my-interface'],
    ['Позиция меню (сверху / снизу)', 'my-interface'], ['Фильтры при прокрутке', 'my-interface'], ['Анимации интерфейса', 'my-interface'],
    ['Блокировка обновления свайпом', 'my-interface'], ['Вернуть корпоративный стиль', 'my-interface'],
    ['Push-уведомления', 'my-notifications'],
    ['Синхронизация команды', 'my-device'], ['Хранилище, резервные копии', 'my-device'], ['Авто-кэш облачных файлов', 'my-device'],
    ['История выгрузок', 'my-device'], ['День автобэкапа', 'my-device'],
    ['Мини-дашборд осмотра', 'my-quality'], ['Свайпы вправо / влево', 'my-quality'], ['Схлопывать пройденные (OK)', 'my-quality'],
    ['Группы свёрнуты', 'my-quality'], ['Быстрый режим', 'my-quality'], ['ИИ-помощник (DeepSeek)', 'my-quality'], ['База знаний — вид', 'my-quality'],
    ['Отображение архивов', 'my-quality'], ['Визуализация аналитики', 'my-quality'], ['Расписание рутинных задач', 'my-quality'], ['Авто-отчёты', 'my-quality'],
    ['Сбросить настройки', 'my-help'], ['Обратная связь, предложить улучшение', 'my-help'], ['Онбординг платформы (обучение)', 'my-help'],
    ['История обновлений (что нового)', 'my-help'], ['Методология RBI', 'my-help'], ['Проверить обновления', 'my-help'], ['Полный сброс', 'my-help'], ['О платформе', 'my-help'],
    ['Добавить сотрудника', 'company/members'], ['Сбросить пароль сотрудника', 'company/members'], ['Назначить роль', 'company/members'],
    ['Отключить сотрудника', 'company/members'], ['Объекты Качества у инженера', 'company/members'], ['Роли и права', 'company/members'],
    ['Проекты', 'company/objects'], ['Объекты и места', 'company/objects'], ['Подразделения', 'company/objects'],
    ['Контрагенты: заказчики, подрядчики, ИНН', 'company/counterparties'],
    ['Единицы измерения', 'company/directories'],
    ['Логотип компании', 'company/branding'], ['Фирменный цвет', 'company/branding'],
    ['Модули компании', 'company/modules'], ['Журнал изменений компании', 'company/audit'],
    ['Объекты и планы Качества', 'admin'], ['Заявки на объекты', 'admin'], ['Справочник подрядчиков', 'admin'], ['Заявки на подрядчиков', 'admin'],
    ['Команда (доступы и объекты)', 'admin'], ['Заявки на доступ', 'admin'], ['Активные пользователи', 'admin'], ['Облако — удалённые, битые ссылки', 'admin'],
    ['Официальные версии чек-листов', 'admin'], ['Шаблоны отчётов (PDF)', 'admin'], ['AI-оптимизатор системы', 'admin'],
    ['Пороги светофора объектов', 'modules-planfact'],
    ['Компании платформы', 'platform-admin'], ['Образцы экранов', 'company/patterns']
];

/**
 * Поиск по настройкам среди видимых пунктов (visibleIds — Set или массив id).
 * Результат: [{ title, id, where }] — сначала разделы, потом отдельные настройки; без повторов.
 */
export function searchSettings(query, visibleIds) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const vis = visibleIds instanceof Set ? visibleIds : new Set(visibleIds || []);
    const items = settingsNavItems().filter(function (it) { return vis.has(it.id); });
    const byId = {};
    items.forEach(function (it) { byId[it.id] = it; });
    const where = function (it) { return it.group + ' › ' + it.label; };
    const out = [];
    const seen = new Set();
    items.forEach(function (it) {
        if ((it.label + ' ' + it.desc).toLowerCase().indexOf(q) === -1) return;
        seen.add(it.label + '|' + it.id);
        out.push({ title: it.label, id: it.id, where: it.group });
    });
    SETTINGS_SEARCH_INDEX.forEach(function (row) {
        const it = byId[row[1]];
        if (!it || row[0].toLowerCase().indexOf(q) === -1 || seen.has(row[0] + '|' + it.id)) return;
        seen.add(row[0] + '|' + it.id);
        out.push({ title: row[0], id: it.id, where: where(it) });
    });
    return out;
}
