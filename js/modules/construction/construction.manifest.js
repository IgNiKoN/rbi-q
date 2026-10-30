/**
 * construction.manifest.js
 * Декларативный манифест модуля «Стройконтроль» (Construction — дефекты на
 * плане, шахматка, передача квартир, приёмка работ). Метаданные для будущего
 * modules.manifest.js + module-loader. Не подключается никуда — см.
 * js/modules/construction/construction.module.js для реального контракта платформы.
 */

export const ConstructionManifest = {
    id: 'construction',
    role: 'module',
    title: 'Стройконтроль',
    // P2-0074: строка «что тут делают» на плитке приветствия (src/platform/auth/welcome-screen.ts)
    summary: 'Замечания подрядчикам на плане, приёмка работ, передача квартир',
    icon: 'hard-hat',
    version: '1.0.0',
    status: 'active',
    entry: './index.js',
    menu: { section: 'construction', label: 'Стройконтроль', order: 10 },
    company: { enabledByDefault: true },
    // P2-0060: что модуль умеет без сети (сервис «Офлайн и синхронизация», MODULES.md): view — смотреть, input — вводы ('*' — свой движок), files — фото и PDF заранее
    offline: { view: true, input: ['*'], files: true },
    routes: ['/construction', '/construction/:subTab'],
    defaultRoute: '/construction'
};
