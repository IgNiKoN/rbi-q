/**
 * Манифест раздела платформы «Компания» (Platform 2.0, P2-0004b): роли, сотрудники, журнал компании.
 * С P2-0005 раздел живёт в Настройках (#/settings/company); адрес #/company перенаправляет туда.
 * Видимость — window.RBI.platformMenuAccess.company (право security.roles.assign, подтверждает сервер).
 */

export const CompanyManifest = {
    id: 'company',
    role: 'module',
    title: 'Компания',
    icon: 'users',
    version: '0.1.0',
    status: 'active',
    enabled: true,
    entry: './index.js',
    // Пункта в боковом меню нет: «Компания» — подраздел Настроек (#/settings/company), виден при праве security.roles.assign.
    routes: ['/company'],
    defaultRoute: '/company'
};
