/**
 * Манифест нового модуля construction-v2 (параллельно legacy construction).
 * Entry → index.js → бандл js/dist/construction-v2.js (Vite/TS).
 */

export const ConstructionV2Manifest = {
    id: 'construction-v2',
    role: 'module',
    title: 'Стройконтроль (новый)',
    icon: 'hard-hat',
    version: '0.1.0',
    status: 'active',
    entry: './index.js',
    menu: { section: 'construction', label: 'СК (новый)', order: 11 },
    company: { enabledByDefault: true },
    // P2-0061: виды записей для общего правила синхронизации (standards/SYNC_AND_ACCESS.md). P2-0070: замечания и приёмки —
    // режим `area` единого механизма прав (на сервере — core.row_allowed и сторож действий, 052): действия роли в области
    // участия в проекте (место записи — по id ядра), подрядчик — своя фирма по id контрагента; помещения — quality.can (без изменений)
    sync: [
        { kind: 'defect_v2', store: 'construction_defects_v2', table: 'construction_defects_v2', coreId: 'core_id', title: 'Замечание',
          author: { id: 'authorId', name: ['owner', 'created_by', 'author'] }, counterparty: ['core_counterparty_id'], contractorCard: 'contractorId',
          place: { project: 'core_project_id', location: 'core_location_id' },
          mode: 'area', view: ['construction.defects.view'],
          edit: ['construction.defects.create', 'construction.defects.assign', 'construction.defects.start', 'construction.defects.fix',
                 'construction.defects.close', 'construction.defects.reject', 'construction.defects.delete'], ownFirst: true },
        { kind: 'acceptance_v2', store: 'construction_acceptance_v2', table: 'construction_acceptance_v2', coreId: 'core_id', title: 'Приёмка',
          author: { id: 'authorId', name: ['owner', 'created_by', 'author'] }, counterparty: ['core_counterparty_id'], contractorCard: 'contractorId',
          place: { project: 'core_project_id', location: 'core_location_id' },
          mode: 'area', view: ['construction.acceptance.view'],
          edit: ['construction.acceptance.book', 'construction.acceptance.schedule', 'construction.acceptance.conduct'] },
        { kind: 'unit_v2', store: 'construction_units_v2', table: 'construction_units_v2', coreId: 'core_id', title: 'Помещение',
          author: { id: 'authorId', name: ['owner', 'created_by', 'author'] }, mode: 'shared', view: ['construction.view'], edit: ['construction.edit'] }
    ],
    routes: ['/construction-v2', '/construction-v2/:subTab'],
    defaultRoute: '/construction-v2'
};
