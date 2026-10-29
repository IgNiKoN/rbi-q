/**
 * manifest.js
 * Единый паспорт platform module «quality» (Compact Module Restructure, шаг 1).
 * Агрегирующий манифест, заменяет 9 переходных quality-манифестов
 * (history, audit, analytics, tasks, etalon, reports, engineer, schedule,
 * meetings). Физический перенос файлов — предмет следующего блока
 * (см. _ai/COMPACT_MODULE_RESTRUCTURE_PLAN.md, шаг 4).
 */

export const QualityManifest = {
    id: 'quality',
    role: 'module',
    title: 'Качество',
    icon: 'check-circle',
    version: '1.0.0',
    status: 'active',
    entry: './index.js',
    menu: { section: 'quality' },
    company: { enabledByDefault: true },
    // P2-0060: что модуль умеет без сети (сервис «Офлайн и синхронизация», MODULES.md): view — смотреть, input — вводы ('*' — свой движок), files — фото и PDF заранее
    offline: { view: true, input: ['*'], files: true },
    routes: [
        '/history', '/history/:id',
        '/audit', '/audit/:id',
        '/analytics', '/analytics/:subTab',
        '/tasks', '/tasks/calendar', '/tasks/schedule',
        '/etalon', '/etalon/:id',
        '/reports', '/reports/:type',
        '/engineer', '/engineer/:subTab',
        '/schedule',
        '/meetings'
    ],
    defaultRoute: '/audit'
};
