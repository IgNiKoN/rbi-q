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
    // P2-0061: виды записей для общего правила синхронизации (standards/SYNC_AND_ACCESS.md). На сервере — row_visible_id (043):
    // объекты в правах Стройконтроля не участвуют (objects: false), подрядчик — своя фирма по id контрагента; помещения — quality.can
    sync: [
        { kind: 'defect_v2', store: 'construction_defects_v2', table: 'construction_defects_v2', title: 'Замечание',
          author: { id: 'authorId', name: ['owner', 'created_by', 'author'] }, counterparty: ['core_counterparty_id'], contractorCard: 'contractorId', objects: false,
          mode: 'contractor', view: ['construction.view'], edit: ['construction.edit'], ownFirst: true },
        { kind: 'acceptance_v2', store: 'construction_acceptance_v2', table: 'construction_acceptance_v2', title: 'Приёмка',
          author: { id: 'authorId', name: ['owner', 'created_by', 'author'] }, counterparty: ['core_counterparty_id'], contractorCard: 'contractorId', objects: false,
          mode: 'contractor', view: ['construction.view'], edit: ['construction.edit'] },
        { kind: 'unit_v2', store: 'construction_units_v2', table: 'construction_units_v2', title: 'Помещение',
          author: { id: 'authorId', name: ['owner', 'created_by', 'author'] }, mode: 'shared', view: ['construction.view'], edit: ['construction.edit'] }
    ],
    routes: ['/construction-v2', '/construction-v2/:subTab'],
    defaultRoute: '/construction-v2'
};
