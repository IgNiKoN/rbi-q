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
    // P2-0074: строка «что тут делают» на плитке приветствия (src/platform/auth/welcome-screen.ts)
    summary: 'Осмотры на объекте по чек-листам, замечания инженеру, аналитика',
    icon: 'check-circle',
    version: '1.0.0',
    status: 'active',
    entry: './index.js',
    menu: { section: 'quality' },
    company: { enabledByDefault: true },
    // P2-0060: что модуль умеет без сети (сервис «Офлайн и синхронизация», MODULES.md): view — смотреть, input — вводы ('*' — свой движок), files — фото и PDF заранее
    offline: { view: true, input: ['*'], files: true },
    // P2-0061: виды записей для общего правила синхронизации (standards/SYNC_AND_ACCESS.md, js/services/sync/sync-access.policy.js):
    // store — хранилище на устройстве, table — таблица сервера, objectType / memory — общая отправка «объектов» (pushCloudObject) и массив в памяти, author — поле id автора и подписи, object — ключ объекта,
    // counterparty — id фирмы, mode — как в серверной политике (author / owner / contractor; P2-0071 — area: единый механизм прав, quality.rec_ok),
    // view / edit — действия (видеть все / любое действие правки), own — действия над своей записью (автор / исполнитель), editAny —
    // «Редактирование чужих», noObject — запись на уровне объекта (без места; без объекта — назначенные на всю компанию и автор), ownFirst — «своё первым» (уходит до скачивания чужого: осмотры, задачи, замечания Стройконтроля 2.0)
    // P2-0072: coreId — номер записи по стандарту (uuid, ставит сервер 054): телефон хранит его у загруженных записей, не отправляет
    sync: [
        { kind: 'inspection', store: 'app_history', table: 'rbi_inspections', coreId: 'core_id', title: 'Осмотр',
          author: { id: 'authorId', name: ['inspectorName', 'inspector_name'] }, object: ['project_canonical_key', 'projectName', 'projectId'],
          counterparty: ['core_counterparty_id'], contractorCard: 'contractorId', mode: 'area', noObject: true,
          view: ['quality.inspections.view'], edit: ['quality.inspections.create', 'quality.inspections.edit_any', 'quality.inspections.delete'], editAny: ['quality.inspections.edit_any'],
          own: { view: ['quality.inspections.view', 'quality.inspections.create'], edit: ['quality.inspections.create', 'quality.inspections.edit_any', 'quality.inspections.delete'], change: ['quality.inspections.create'], remove: ['quality.inspections.delete'],
                 acts: ['quality.inspections.view', 'quality.inspections.create', 'quality.inspections.delete'] }, ownFirst: true },
        { kind: 'task', store: 'rbi_tasks', table: 'rbi_tasks', coreId: 'core_id', title: 'Задача', assignee: 'assignedToId',
          author: { id: 'authorId', name: ['engineerName', 'inspectorName', 'engineer_name', 'inspector_name'] }, object: ['project_canonical_key', 'projectName', 'projectId', 'project'],
          counterparty: ['core_counterparty_id'], contractorCard: 'contractorId', mode: 'area', noObject: true,
          view: ['quality.tasks.view'], edit: ['quality.tasks.create', 'quality.tasks.work', 'quality.tasks.edit_any', 'quality.tasks.delete'], editAny: ['quality.tasks.edit_any'],
          own: { view: ['quality.tasks.view', 'quality.tasks.create', 'quality.tasks.work'], edit: ['quality.tasks.create', 'quality.tasks.work', 'quality.tasks.edit_any', 'quality.tasks.delete'], change: ['quality.tasks.create', 'quality.tasks.work'], remove: ['quality.tasks.delete'],
                 acts: ['quality.tasks.view', 'quality.tasks.create', 'quality.tasks.work', 'quality.tasks.delete'] }, ownFirst: true },
        // команда объекта по действиям своей группы, подрядчик — своя фирма (quality.rec_ok на сервере, P2-0071)
        { kind: 'meeting', objectType: 'meeting', memory: 'rbi_meetingsData', store: 'rbi_meetings', table: 'project_meetings', coreId: 'core_id', title: 'Совещание',
          author: { id: 'authorId', name: ['owner', 'author', 'inspectorName', 'engineerName'] }, object: ['project_canonical_key', 'projectName', 'projectId', 'project'], counterparty: ['core_counterparty_id'], contractorCard: 'contractorId', mode: 'area', noObject: true, view: ['quality.meetings.view'], edit: ['quality.meetings.edit'], editAny: ['quality.meetings.edit'], own: { view: ['quality.meetings.view', 'quality.meetings.edit'], edit: ['quality.meetings.edit'], change: ['quality.meetings.edit'], acts: ['quality.meetings.view', 'quality.meetings.edit'] } },
        { kind: 'intervention', objectType: 'intervention', memory: 'rbi_interventionsData', store: 'rbi_interventions', table: 'project_interventions', coreId: 'core_id', title: 'Вмешательство',
          author: { id: 'authorId', name: ['owner', 'author', 'inspectorName', 'engineerName'] }, object: ['project_canonical_key', 'projectName', 'projectId', 'project'], counterparty: ['core_counterparty_id'], contractorCard: 'contractorId', mode: 'area', noObject: true, view: ['quality.meetings.view'], edit: ['quality.meetings.edit'], editAny: ['quality.meetings.edit'], own: { view: ['quality.meetings.view', 'quality.meetings.edit'], edit: ['quality.meetings.edit'], change: ['quality.meetings.edit'], acts: ['quality.meetings.view', 'quality.meetings.edit'] } },
        { kind: 'fmea', objectType: 'fmea', memory: 'rbi_fmeaRecords', store: 'rbi_fmea', table: 'project_fmea', coreId: 'core_id', title: 'FMEA',
          author: { id: 'authorId', name: ['owner', 'author', 'inspectorName', 'engineerName'] }, object: ['project_canonical_key', 'projectName', 'projectId', 'project'], counterparty: ['core_counterparty_id'], contractorCard: 'contractorId', mode: 'area', noObject: true, view: ['quality.method.view'], edit: ['quality.method.edit'], editAny: ['quality.method.edit'], own: { view: ['quality.method.view', 'quality.method.edit'], edit: ['quality.method.edit'], change: ['quality.method.edit'], acts: ['quality.method.view', 'quality.method.edit'] } },
        { kind: 'schedule', objectType: 'schedule', memory: 'rbi_scheduleData', store: 'rbi_schedule_stages', table: 'project_schedule_stages', coreId: 'core_id', title: 'Этап графика',
          author: { id: 'authorId', name: ['owner', 'author', 'inspectorName', 'engineerName'] }, object: ['project_canonical_key', 'projectName', 'projectId', 'project'], counterparty: ['core_counterparty_id'], contractorCard: 'contractorId', mode: 'area', noObject: true, view: ['quality.method.view'], edit: ['quality.method.edit'], editAny: ['quality.method.edit'], own: { view: ['quality.method.view', 'quality.method.edit'], edit: ['quality.method.edit'], change: ['quality.method.edit'], acts: ['quality.method.view', 'quality.method.edit'] } },
        { kind: 'report', store: 'app_reports', table: 'shared_reports', coreId: 'core_id', title: 'Отчёт',
          author: { id: 'authorId', name: ['created_by', 'owner', 'author'] }, object: ['project_canonical_key', 'projectName', 'projectId', 'project'], counterparty: ['core_counterparty_id'], contractorCard: 'contractorId', mode: 'area', noObject: true, view: ['quality.reports.view'], edit: ['quality.reports.edit'], editAny: ['quality.reports.edit'], own: { view: ['quality.reports.view', 'quality.reports.edit'], edit: ['quality.reports.edit'], change: ['quality.reports.edit'], acts: ['quality.reports.view', 'quality.reports.edit'] } },
        // библиотека компании — все, у кого есть право (quality.can на сервере)
        { kind: 'etalon', objectType: 'etalon', memory: 'etalonActsArray', store: 'rbi_etalon_acts', table: 'shared_etalons', coreId: 'core_id', title: 'Акт эталона',
          author: { id: 'authorId', name: ['owner', 'author', 'inspectorName', 'engineerName'] }, mode: 'shared', view: ['quality.view'], edit: ['quality.edit'] },
        { kind: 'document', objectType: 'custom_doc', memory: 'customDocs', store: 'custom_docs', table: 'shared_docs', coreId: 'core_id', title: 'Документ',
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
