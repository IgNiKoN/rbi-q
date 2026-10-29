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
    // P2-0061: виды записей для общего правила синхронизации (standards/SYNC_AND_ACCESS.md, js/services/sync/sync-access.policy.js):
    // store — хранилище на устройстве, table — таблица сервера, author — поле id автора и подписи, object — ключ объекта,
    // counterparty — id фирмы, mode — как в серверной политике (author / owner / contractor), view / edit — действия, ownFirst — «своё первым»
    sync: [
        { kind: 'inspection', store: 'app_history', table: 'rbi_inspections', title: 'Осмотр',
          author: { id: 'authorId', name: ['inspectorName', 'inspector_name'] }, object: ['project_canonical_key', 'projectName', 'projectId'],
          counterparty: ['contractorId', 'core_counterparty_id'], mode: 'author', view: ['quality.view'], edit: ['quality.edit'], ownFirst: true }
    ],
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
