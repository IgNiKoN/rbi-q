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
          counterparty: ['contractorId', 'core_counterparty_id'], mode: 'author', view: ['quality.view'], edit: ['quality.edit'], ownFirst: true },
        { kind: 'task', store: 'rbi_tasks', table: 'rbi_tasks', title: 'Задача', assignee: 'assignedToId',
          author: { id: 'authorId', name: ['engineerName', 'inspectorName', 'engineer_name', 'inspector_name'] }, object: ['project_canonical_key', 'projectName', 'projectId', 'project'],
          counterparty: ['contractorId', 'core_counterparty_id'], mode: 'author', view: ['quality.view'], edit: ['quality.edit'], ownFirst: true },
        // «вся команда объекта, подрядчик — своя фирма» (record_visible … 'contractor' на сервере)
        { kind: 'meeting', store: 'rbi_meetings', table: 'project_meetings', title: 'Совещание',
          author: { id: 'authorId', name: ['owner', 'author', 'inspectorName', 'engineerName'] }, object: ['project_canonical_key', 'projectName', 'projectId', 'project'], counterparty: ['contractorId', 'core_counterparty_id'], mode: 'contractor', view: ['quality.view'], edit: ['quality.edit'], ownFirst: true },
        { kind: 'intervention', store: 'rbi_interventions', table: 'project_interventions', title: 'Вмешательство',
          author: { id: 'authorId', name: ['owner', 'author', 'inspectorName', 'engineerName'] }, object: ['project_canonical_key', 'projectName', 'projectId', 'project'], counterparty: ['contractorId', 'core_counterparty_id'], mode: 'contractor', view: ['quality.view'], edit: ['quality.edit'], ownFirst: true },
        { kind: 'fmea', store: 'rbi_fmea', table: 'project_fmea', title: 'FMEA',
          author: { id: 'authorId', name: ['owner', 'author', 'inspectorName', 'engineerName'] }, object: ['project_canonical_key', 'projectName', 'projectId', 'project'], counterparty: ['contractorId', 'core_counterparty_id'], mode: 'contractor', view: ['quality.view'], edit: ['quality.edit'], ownFirst: true },
        { kind: 'schedule', store: 'rbi_schedule_stages', table: 'project_schedule_stages', title: 'Этап графика',
          author: { id: 'authorId', name: ['owner', 'author', 'inspectorName', 'engineerName'] }, object: ['project_canonical_key', 'projectName', 'projectId', 'project'], counterparty: ['contractorId', 'core_counterparty_id'], mode: 'contractor', view: ['quality.view'], edit: ['quality.edit'], ownFirst: true },
        { kind: 'report', store: 'app_reports', table: 'shared_reports', title: 'Отчёт',
          author: { id: 'authorId', name: ['created_by', 'owner', 'author'] }, object: ['project_canonical_key', 'projectName', 'projectId', 'project'], counterparty: ['contractorId', 'core_counterparty_id'], mode: 'contractor', view: ['quality.view'], edit: ['quality.edit'], ownFirst: true },
        // библиотека компании — все, у кого есть право (quality.can на сервере)
        { kind: 'etalon', store: 'rbi_etalon_acts', table: 'shared_etalons', title: 'Акт эталона',
          author: { id: 'authorId', name: ['owner', 'author', 'inspectorName', 'engineerName'] }, mode: 'shared', view: ['quality.view'], edit: ['quality.edit'] },
        { kind: 'document', store: 'custom_docs', table: 'shared_docs', title: 'Документ',
          author: { id: 'authorId', name: ['owner', 'author'] }, mode: 'shared', view: ['quality.view'], edit: ['quality.edit'] }
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
