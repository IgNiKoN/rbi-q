/** P2-0061: правило устройства «кто я, что моё, можно ли отправить» (sync-access.policy.js) — режимы как на сервере,
 *  переходное правило по ФИО, id главнее подписи, без входа — ничего не уходит. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessStamp, canSend, isMine, kindOf, kindsFrom, meFrom, stampAuthor, visible } from '../../services/sync/sync-access.policy.js';

const K = kindOf('inspection');
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222', CP = '33333333-3333-4333-8333-333333333333';
const eng = (o = {}) => meFrom({ userId: U1, name: 'Иванов Иван', email: 'ivanov@test.invalid', names: ['Иванов И.'], actions: ['quality.view', 'quality.edit'], objects: null, ...o });
const rec = (o = {}) => ({ id: 'i1', inspectorName: 'Иванов Иван', project_canonical_key: 'ЖК Север', source: 'local', ...o });

test('описание из манифеста: осмотр — app_history / rbi_inspections, по хранилищу и по имени', () => {
  assert.equal(K.store, 'app_history');
  assert.equal(K.table, 'rbi_inspections');
  assert.equal(K.module, 'quality');
  assert.equal(kindOf('app_history'), K);
  assert.deepEqual(Object.keys(kindsFrom([{ id: 'x', sync: [{ kind: 'a', store: 's' }] }, { id: 'y' }])), ['a']);
});

test('кто я: без id учётной записи — никто; имена без повторов, почта — тоже подпись', () => {
  assert.equal(meFrom({ name: 'Иванов Иван' }), null);
  assert.deepEqual(eng().names, ['Иванов Иван', 'ivanov@test.invalid', 'Иванов И.']);
  assert.equal(eng({ objects: ['  ЖК «Север» '] }).objects[0], 'жк север');
});

test('моё: по id; id главнее подписи; без id — текущее или прежнее ФИО или почта; чужое ФИО — не моё', () => {
  const me = eng();
  assert.equal(isMine(rec({ authorId: U1, inspectorName: 'Петров' }), K, me), true);
  assert.equal(isMine(rec({ authorId: U2 }), K, me), false, 'чужой id и моё ФИО — чужая');
  assert.equal(isMine(rec(), K, me), true);
  assert.equal(isMine(rec({ inspectorName: 'иванов и.' }), K, me), true, 'прежнее ФИО');
  assert.equal(isMine(rec({ inspectorName: 'IVANOV@test.invalid' }), K, me), true, 'почта');
  assert.equal(isMine(rec({ inspectorName: 'Петров Пётр' }), K, me), false);
  assert.equal(isMine(rec({ inspectorName: '' }), K, me), false, 'без подписи — не моё');
});

test('stampAuthor: моей записи без id — мой id; чужой и с id — не трогает', () => {
  const me = eng();
  const a = rec(); assert.equal(stampAuthor(a, K, me), true); assert.equal(a.authorId, U1);
  const b = rec({ inspectorName: 'Петров' }); assert.equal(stampAuthor(b, K, me), false); assert.equal(b.authorId, undefined);
  const c = rec({ authorId: U2 }); assert.equal(stampAuthor(c, K, me), false); assert.equal(c.authorId, U2);
  const d = rec({ inspectorName: '' }); assert.equal(stampAuthor(d, K, me), true, 'новая запись без подписи — автор я'); assert.equal(d.authorId, U1);
});

test('инженер: своё уходит, чужое — «запись другого сотрудника (ФИО)» с подсказкой', () => {
  const me = eng();
  assert.deepEqual(canSend(rec(), K, me), { ok: true });
  const r = canSend(rec({ inspectorName: 'Петров Пётр' }), K, me);
  assert.equal(r.ok, false); assert.equal(r.code, 'foreign');
  assert.equal(r.reason, 'Не отправлено: запись другого сотрудника (Петров Пётр)');
  assert.match(r.hint, /руководитель или автор/);
  assert.equal(visible(rec({ inspectorName: 'Петров Пётр' }), K, me), false, 'инженер с правкой видит только своё — как сервер');
});

test('руководитель (manage) и вся компания — чужое уходит; только просмотр — видит, но не отправляет', () => {
  assert.equal(canSend(rec({ authorId: U2 }), K, eng({ actions: ['quality.view', 'quality.edit', 'quality.manage'] })).ok, true);
  assert.equal(canSend(rec({ authorId: U2 }), K, eng({ actions: ['quality.view', 'quality.edit', 'quality.scope.company'] })).ok, true);
  const viewer = eng({ actions: ['quality.view'] });
  assert.equal(visible(rec({ authorId: U2 }), K, viewer), true);
  assert.equal(canSend(rec({ authorId: U2 }), K, viewer).code, 'right');
});

test('объекты: не назначенный — причина «объект», назначенный — по правилу; без объекта — только своё; просмотр в своём объекте — всё', () => {
  const me = eng({ objects: ['ЖК Север'] });
  assert.equal(canSend(rec({ project_canonical_key: 'ЖК Юг' }), K, me).code, 'object');
  assert.equal(canSend(rec(), K, me).ok, true);
  assert.equal(canSend(rec({ project_canonical_key: '', projectName: '', inspectorName: 'Петров' }), K, me).code, 'foreign');
  assert.equal(canSend(rec({ project_canonical_key: 'unknown', projectName: '' }), K, me).ok, true, 'без объекта — своё');
  assert.equal(visible(rec({ inspectorName: 'Петров' }), K, me), true, 'просмотр в назначенном объекте — все записи');
  assert.equal(canSend(rec({ inspectorName: 'Петров' }), K, me).code, 'foreign', 'правка — только своё');
});

test('подрядчик: своя фирма по id — да, чужая или без фирмы — «запись другой фирмы»', () => {
  const me = eng({ actions: ['quality.view', 'quality.edit', 'quality.scope.contractor'], contractorId: CP });
  assert.equal(canSend(rec({ contractorId: CP, inspectorName: 'Петров' }), K, me).ok, true);
  assert.equal(canSend(rec({ contractorId: 'другая' }), K, me).code, 'contractor');
  assert.equal(canSend(rec(), K, me).code, 'contractor');
});

test('без входа — «нужно войти»; неизвестный вид — причина; отпечаток доступа меняется с правами', () => {
  assert.equal(canSend(rec(), K, null).code, 'login');
  assert.equal(canSend(rec(), null, eng()).code, 'kind');
  assert.notEqual(accessStamp(eng()), accessStamp(eng({ objects: ['ЖК Север'] })));
  assert.equal(accessStamp(eng()), accessStamp(eng()));
  assert.equal(accessStamp(null), '');
});
