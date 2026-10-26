/**
 * Манифест модуля «План/Факт» (Platform 2.0, P2-0002).
 * enabled — выключатель модуля в сборке: false → нет пункта меню и модуль не загружается. Кому положен — сервер (модуль компании ∩ права, P2-0013).
 * menu.section 'platform' — пункт рисуется общим блоком меню оболочки (app-shell.renderPlatformMenu).
 */

export const PlanfactManifest = {
    id: 'planfact',
    role: 'module',
    title: 'План/Факт',
    icon: 'table',
    version: '0.1.0',
    status: 'active',
    enabled: true,
    entry: './index.js',
    menu: { section: 'platform', label: 'План/Факт', order: 50, path: '#/planfact', demo: true },   // demo — виден в «Посмотреть без входа» (разбор ВОР без сервера), P2-0013
    /** Подвкладки модуля: нижний таббар (телефон/планшет) и nav2 (≥1280) — как у Quality. Новые разделы добавляются сюда.
     *  requiresAccess — пункт виден, когда сервер подтвердил доступ: true — к компании, 'estimate' — право на цены и сметы, 'ks2' — право на КС-2.
     *  P2-0009: первым — «Сводка» на адресе #/planfact (#/planfact/summary — тоже она); старая демо-таблица «Работы» из меню убрана (код не удалён). */
    nav: [
        { id: 'summary', label: 'Сводка', path: '#/planfact', requiresAccess: true,
          icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
        // P2-0021: «Требует моего участия» по всем объектам; красная точка с числом — сумма дел (обёртка index.js)
        { id: 'inbox', label: 'Входящие', path: '#/planfact/inbox', requiresAccess: true,
          icon: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4' },
        { id: 'vor', label: 'ВОР', path: '#/planfact/vor', requiresAccess: true,
          icon: 'M9 17v-2m3 2v-4m3 4v-6M5 21h14a2 2 0 002-2V7.414a1 1 0 00-.293-.707l-4.414-4.414A1 1 0 0015.586 2H5a2 2 0 00-2 2v15a2 2 0 002 2z' },
        { id: 'fact', label: 'Факт', path: '#/planfact/fact', requiresAccess: true,
          icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
        { id: 'estimate', label: 'Смета', path: '#/planfact/estimate', requiresAccess: 'estimate',
          icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
        { id: 'ks2', label: 'КС-2', path: '#/planfact/ks2', requiresAccess: 'ks2',
          icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        { id: 'directories', label: 'Справочники', path: '#/planfact/directories', requiresAccess: true,
          icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' }
    ],
    routes: ['/planfact'],
    defaultRoute: '/planfact'
};
