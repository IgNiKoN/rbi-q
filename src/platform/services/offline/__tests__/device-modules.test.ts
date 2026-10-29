/// <reference types="node" />
/** P2-0060 этап 6: «Офлайн по модулям» — мои модули по правам (у компании только Качество — только Качество), что умеют без сети
 *  (из манифеста; без поля — «Только онлайн»), размеры (код по описи версии, файлы по реестру), разметка. Стенд — tests/offline/device.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abilityLabel, codeBytesByModule, fileBytes, mb, modulesHtml, myRows } from '../device-modules.ts';
import { offlineOf } from '../offline-read.ts';

const MAN: Record<string, unknown> = {
  quality: { offline: { view: true, input: ['*'], files: true } }, planfact: { offline: { view: true, input: [], files: false } },
  company: { offline: { view: true, input: [] } }, knowledge: { offline: { view: true, input: [], files: true } }, ai: {}
};
const manifest = (id: string) => offlineOf(MAN[id] as { offline?: unknown });

test('мои модули: только положенные этому человеку; Качество и Стройконтроль — одной строкой; у компании только Качество — только Качество', () => {
  const all = myRows(() => true, manifest).map((r) => r.id);
  assert.deepEqual(all, ['quality', 'planfact', 'company', 'knowledge', 'ai']);
  assert.deepEqual(myRows((id) => id === 'quality', manifest).map((r) => r.id), ['quality'], 'у компании только Качество');
  assert.deepEqual(myRows((id) => id === 'construction', manifest).map((r) => r.id), ['quality'], 'один Стройконтроль — та же строка');
  assert.deepEqual(myRows((id) => id === 'planfact', manifest).map((r) => r.id), ['planfact'], 'без «Компании» строки ядра нет');
});

test('что умеет без сети — по манифесту: свой движок — «смотреть и вносить», копия — «смотреть», без поля — «Только онлайн»', () => {
  assert.deepEqual(abilityLabel(manifest('quality')), { text: 'Без сети: смотреть и вносить', kind: 'rw' });
  assert.deepEqual(abilityLabel(manifest('planfact')), { text: 'Без сети: смотреть', kind: 'ro' });
  assert.deepEqual(abilityLabel(manifest('ai')), { text: 'Только онлайн', kind: 'on' });
  const html = modulesHtml([{ row: myRows(() => true, manifest)[4], keep: true, codeBytes: 0, copyBytes: 0, fileBytes: 0, scope: null, roleScope: null, last: '' }], { used: 0, free: 0 }, 'гость');
  assert.ok(html.includes('Только онлайн') && !html.includes('Держать без сети'), 'модуль без офлайна — без переключателя, экран не дорабатывался');
});

test('размеры: код — по описи версии (модуль файла), файлы — по реестру (Качество и База знаний отдельно, только то, что на телефоне)', () => {
  const sw = `const APP_RELEASE = {\n  files: {\n    "index.html": ["aa",1000,""],\n    "js/dist/planfact/planfact.js": ["bb",2000000,"planfact"],\n    "js/dist/planfact/chunk.js": ["cc",500000,"planfact"],\n    "js/modules/quality/a.js": ["dd",300,"quality"]\n  }\n};`;
  assert.deepEqual(codeBytesByModule(sw), { '': 1000, planfact: 2500000, quality: 300 });
  const reg = [{ cache_status: 'cached_cloud', size_bytes: 100, entity_type: 'inspection_photo' }, { cache_status: 'cached_local', size_bytes: 50, entity_type: 'inspection_photo' },
    { cache_status: 'cloud_only', size_bytes: 999, entity_type: 'inspection_photo' }, { cacheStatus: 'cached_cloud', sizeBytes: 70, entityType: 'twi_pdf' }];
  assert.deepEqual(fileBytes(reg), { quality: 150, knowledge: 70 });
  assert.equal(mb(5 * 1024), '5,0 КБ');
  assert.equal(mb(0), '0 КБ');
  assert.equal(mb(386 * 1048576), '386 МБ');
  assert.equal(mb(2.1 * 1073741824), '2,1 ГБ');
});

test('разметка: выбор по роли помечен «· по роли»; «держать без сети» выключено — выбор и «Скачать сейчас» неактивны; «Очистить» есть всегда', () => {
  const q = myRows(() => true, manifest)[0];
  const on = modulesHtml([{ row: q, keep: true, codeBytes: 1, copyBytes: 0, fileBytes: 386 * 1048576, scope: 'mine30', roleScope: 'mine30', last: 'x' }], { used: 1, free: 1 }, 'инженер качества');
  assert.ok(on.includes('Мои объекты за 30 дней · по роли'));
  assert.ok(on.includes('по вашей роли: инженер качества'));
  const off = modulesHtml([{ row: q, keep: false, codeBytes: 1, copyBytes: 0, fileBytes: 0, scope: 'none', roleScope: 'mine30', last: 'x' }], { used: 1, free: 1 }, 'инженер качества');
  assert.ok(/id="p2o-scope-quality" disabled/.test(off) && /data-act="download" data-mod="quality" disabled/.test(off));
  assert.ok(off.includes('data-testid="p2o-clear-quality"'));
});
