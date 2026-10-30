/** P2-0072: сервис номеров платформы (record-id.service.js) — v4 и запасной путь без randomUUID, v5 детерминирован и совпадает
 *  с эталоном RFC 4122 (SHA-1 Node), номер ребёнка от uuid-родителя устойчив, от старого родителя — прежний составной. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RECORDS_NAMESPACE, childId, isUuid, newId, stableId, uuidV5 } from '../../services/record-id.service.js';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const nodeV5 = (name, ns) => {
  const h = createHash('sha1').update(Buffer.concat([Buffer.from(ns.replace(/-/g, ''), 'hex'), Buffer.from(name, 'utf8')])).digest().subarray(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};

test('newId: uuid v4, разные номера', () => {
  const a = newId(), b = newId();
  assert.match(a, V4); assert.notEqual(a, b);
});

test('newId: запасной путь без crypto.randomUUID (старый браузер) — тоже uuid v4', () => {
  const ids = new Set();
  for (let i = 0; i < 500; i++) { const x = newId({ noNative: true }); assert.match(x, V4); ids.add(x); }
  assert.equal(ids.size, 500);
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try { assert.match(newId(), V4); } finally { Object.defineProperty(globalThis, 'crypto', saved); }
});

test('uuidV5 = эталон RFC 4122 (python.org в DNS) и пространство платформы выведено из NAMESPACE_URL', () => {
  assert.equal(uuidV5('python.org', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'), '886313e1-3b8a-5372-9b90-0c9aee199e5d');
  assert.equal(RECORDS_NAMESPACE, nodeV5('https://app.rbi-q.ru/records', '6ba7b811-9dad-11d1-80b4-00c04fd430c8'));
  for (const s of ['', 'а', 'Проверка №1 — ЖК «Север»', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'ё'.repeat(300)]) {
    assert.equal(uuidV5(s, RECORDS_NAMESPACE), nodeV5(s, RECORDS_NAMESPACE), s.slice(0, 10));
  }
});

test('stableId: тот же вход → тот же номер, разные → разные, склейка частей не путается', () => {
  const p = newId();
  assert.match(stableId(p, 'item', '12'), V5);
  assert.equal(stableId(p, 'item', '12'), stableId(p, 'item', '12'));
  assert.equal(stableId(p, 'item', 12), stableId(p, 'item', '12'));
  assert.notEqual(stableId(p, 'item', '12'), stableId(p, 'item', '13'));
  assert.notEqual(stableId(p, 'item', '1'), stableId(p, 'photo', '1'));
  assert.notEqual(stableId('a_b', 'c'), stableId('a', 'b_c'));
  assert.notEqual(stableId(newId(), 'item', '12'), stableId(p, 'item', '12'));
});

test('childId: uuid-родитель → устойчивый номер; старый родитель → прежний составной номер (досылка после обновления)', () => {
  const p = newId();
  assert.equal(childId(p, `${p}_7`, 'item', '7'), stableId(p, 'item', '7'));
  assert.equal(childId(p, `${p}_7_0`, 'photo', '7', 0), stableId(p, 'photo', '7', 0));
  assert.equal(childId('1730000000123', '1730000000123_7', 'item', '7'), '1730000000123_7');
  assert.equal(childId('s-rename-old-1', 's-rename-old-1_7_2', 'photo', '7', 2), 's-rename-old-1_7_2');
  assert.equal(childId(null, 'draft_x', 'draft'), 'draft_x');
});

test('isUuid', () => {
  assert.equal(isUuid(newId()), true);
  assert.equal(isUuid('1730000000123'), false);
  assert.equal(isUuid('task_man_abc'), false);
  assert.equal(isUuid(null), false);
});

// Сторож кода (карточка P2-0072 §3а): номер записи — только из сервиса номеров. «Приставка + время» вне dist/ и тестов — только
// служебные метки устройства и экрана из списка ниже (на сервер записью таблицы не уходят), у каждой — причина.
const ALLOWED = [
  ['js/modules/quality/features/etalon/etalon-v18.actions.js', "'etv18_control_' + Date.now()", 'имя группы переключателей на экране'],
  ['js/modules/construction/features/admin.js', '`plan_${Date.now()}.pdf`', 'имя файла плана в хранилище'],
  ['src/services/locations/locations.service.ts', '`plan_${Date.now()}.pdf`', 'имя файла плана в хранилище'],
  ['src/services/construction-units/construction-units.service.ts', '`plan_${Date.now()}.pdf`', 'имя файла плана в хранилище'],
  ['js/services/sync/sync-engine.core.js', 'String(Date.now() + delay)', 'время следующей попытки, не номер'],
  ['js/modules/knowledge/features/reference.js', 'Date.now() % 100000', 'номер пункта чек-листа — число по устройству чек-листа (audit.render: parseInt)'],
  ['js/services/sync/sync-core.state.js', "'dev_' + Date.now().toString(36)", 'номер устройства'],
  ['js/services/storage/storage-file-queue.actions.js', "'cacheq_' + Date.now().toString(36)", 'очередь кэша файлов на устройстве'],
  ['js/services/storage/storage-photo-manager.js', "'local://' + prefix + '_' + Date.now().toString(36)", 'ключ фото в памяти телефона (local://)'],
  ['js/services/storage/storage-photo-manager.js', "'localreg_' + Date.now().toString(36)", 'реестр файлов на устройстве (с сервера — только чтение)'],
  ['js/services/storage/storage-cache-manager.js', "'localreg_' + Date.now().toString(36)", 'реестр файлов на устройстве (с сервера — только чтение)'],
  ['js/services/storage/storage-cache-manager.js', "'storage_event_' + Date.now().toString(36)", 'журнал событий хранилища на устройстве'],
  ['src/modules/planfact/estimate/OverheadsEditor.ts', "'l' + Date.now().toString(36)", 'План/Факт: ключ строки формы накладных, не запись']
];
const PATTERN = /['"][\w:/.-]*_['"]\s*\+\s*Date\.now\(\)|`[\w:/.-]*_\$\{Date\.now\(\)|String\(Date\.now\(\)\s*\+|Date\.now\(\)\.toString\(36\)|Date\.now\(\) % /;

test('сторож кода: генераторов номеров «приставка + время» вне dist/ и тестов нет (кроме служебных меток устройства с причиной)', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join, relative } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const found = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (f === 'dist' || f === '__tests__' || f === 'node_modules') continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|ts|tsx)$/.test(f) && !/\.d\.ts$/.test(f) && !/record-id\.service\.js$/.test(f)) {
        readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
          if (!PATTERN.test(line)) return;
          const rel = relative(root, p);
          if (!ALLOWED.some(([file, snippet]) => file === rel && line.includes(snippet))) found.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
        });
      }
    }
  };
  walk(join(root, 'js'));
  walk(join(root, 'src'));
  assert.deepEqual(found, [], 'номер записи — window.RbiIds.newId() / stableId() (js/services/record-id.service.js)');
  assert.ok(ALLOWED.every(([, , why]) => why), 'у каждого исключения — причина');
});
