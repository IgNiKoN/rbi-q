/**
 * knowledge.manifest.js
 * Декларативный манифест top-level platform module «База знаний» (БЗ).
 * Путь: js/modules/knowledge/ — peer business-модуль (не feature-of quality).
 */

export const KnowledgeManifest = {
    id: 'knowledge',
    role: 'module',
    title: 'База знаний',
    icon: 'book-open',
    version: '1.0.0',
    status: 'active',
    entry: './index.js',
    menu: { section: 'main', label: 'БЗ', order: 9 },
    company: { enabledByDefault: true },
    // P2-0060: что модуль умеет без сети (сервис «Офлайн и синхронизация», MODULES.md): view — смотреть, input — вводы ('*' — свой движок), files — фото и PDF заранее
    offline: { view: true, input: [], files: true },
    // P2-0061: виды записей для общего правила синхронизации (библиотека компании — quality.can на сервере)
    sync: [
        { kind: 'practice', objectType: 'practice', memory: 'rbi_practicesData', store: 'rbi_practices', table: 'shared_practices', title: 'Практика', author: { id: 'authorId', name: ['owner', 'author'] }, mode: 'shared', view: ['quality.view'], edit: ['quality.edit'] },
        { kind: 'twi', objectType: 'custom_twi_card', memory: 'customTwiCards', store: 'twi_cards', table: 'shared_twi_cards', title: 'Карта TWI', author: { id: 'authorId', name: ['owner', 'author'] }, mode: 'shared', view: ['quality.view'], edit: ['quality.edit'] }
    ],
    routes: ['/knowledge', '/knowledge/twi', '/knowledge/docs', '/knowledge/nodes', '/knowledge/etalons'],
    defaultRoute: '/knowledge'
};
