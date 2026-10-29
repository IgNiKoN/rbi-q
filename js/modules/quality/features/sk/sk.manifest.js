/**
 * sk.manifest.js
 * Декларативный манифест модуля «ПК Стройконтроль» (СК). Метаданные для
 * будущего modules.manifest.js + module-loader. Не подключается никуда — см.
 * js/modules/sk/sk.module.js для реального контракта платформы.
 */

export const SKManifest = {
    id: 'sk',
    role: 'feature-of',
    parentModule: 'quality',
    title: 'Стройконтроль (ПК СК)',
    icon: 'clipboard-check',
    version: '1.0.0',
    status: 'active',
    entry: './index.js',
    menu: { section: 'quality', label: 'ПК СК', order: 5 },
    company: { enabledByDefault: true },
    // P2-0061: виды записей для общего правила синхронизации (standards/SYNC_AND_ACCESS.md)
    sync: [
        { kind: 'sk_record', store: 'sk_records', table: 'sk_records', title: 'Запись СК',
          author: { id: 'authorId', name: ['uploaded_by', 'sk_uploaded_by', 'imported_by', 'owner', 'author'] }, object: ['project_canonical_key', 'projectName', 'projectId', 'project'], counterparty: ['core_counterparty_id'], contractorCard: 'contractorId', mode: 'contractor', view: ['quality.view'], edit: ['quality.edit'] }
    ],
    routes: ['/sk', '/sk/:subTab'],
    defaultRoute: '/sk'
};
