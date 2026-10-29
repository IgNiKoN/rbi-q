/** P2-0061: правило устройства «кто я, что моё, можно ли отправить» (sync-access.policy.js) — режимы как на сервере,
 *  переходное правило по ФИО, id главнее подписи, без входа — ничего не уходит. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessStamp, canChange, canSend, isMine, keepPulled, kindOf, kindsFrom, meFrom, stampAuthor, visible } from '../../services/sync/sync-access.policy.js';

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

test('этап 2: каждый вид Качества, СК и Базы знаний описан и решается правилом — моё / чужое / без id', async () => {
  const { RECORD_STORES } = await import('../../../src/platform/auth/offline-rescue.ts');
  const me = eng();
  const cases = { task: 'engineerName', meeting: 'author', intervention: 'owner', fmea: 'author', schedule: 'owner', report: 'created_by',
    sk_record: 'uploaded_by', etalon: 'owner', document: 'owner', practice: 'author', twi: 'owner' };
  for (const [name, field] of Object.entries(cases)) {
    const k = kindOf(name);
    assert.ok(k && k.store && k.table && k.title, name + ': описание');
    assert.equal(RECORD_STORES[k.store], k.title, name + ': в списке «не отправлено» из описания');
    const own = { id: 'x', [field]: 'Иванов Иван', project_canonical_key: 'ЖК Север' };
    const other = { id: 'y', [field]: 'Петров Пётр', project_canonical_key: 'ЖК Север' };
    assert.equal(isMine(own, k, me), true, name + ': моё по ФИО');
    assert.equal(isMine({ ...other, authorId: U1 }, k, me), true, name + ': моё по id');
    assert.equal(canSend(own, k, me).ok, true, name + ': своё уходит');
    // чужое: «только автор» — нет; «команда объекта» и «библиотека» — как сервер, да; изменить / удалить на экране — только своё
    assert.equal(canSend(other, k, me).ok, k.mode !== 'author', name + ': чужое уходит по режиму сервера ' + k.mode);
    assert.equal(canChange(other, k, me).ok, false, name + ': чужое изменить / удалить нельзя');
    assert.equal(canChange(own, k, me).ok, true, name + ': своё — можно');
    assert.equal(canChange(other, k, eng({ actions: ['quality.view', 'quality.edit', 'quality.manage'] })).ok, true, name + ': руководитель — можно');
  }
  const t = kindOf('task');
  assert.equal(isMine({ id: 't', engineerName: 'Петров', assignedToId: U1 }, t, me), true, 'задача, назначенная мне, — моя');
});

test('этап 2: подрядчик — в режиме «команда объекта» только своя фирма; библиотека — по праву', () => {
  const me = eng({ actions: ['quality.view', 'quality.edit', 'quality.scope.contractor'], contractorId: CP });
  assert.equal(canSend({ id: 'm', author: 'Петров', contractorId: CP }, kindOf('meeting'), me).ok, true);
  assert.equal(canSend({ id: 'm', author: 'Петров', contractorId: 'чужая' }, kindOf('meeting'), me).code, 'contractor');
  assert.equal(canSend({ id: 'p', author: 'Петров' }, kindOf('practice'), me).ok, true);
});

test('этап 5: модуль выключен у компании — «Не отправлено: модуль … выключен», запись не теряется; включён — как обычно', () => {
  const me = eng({ actions: ['quality.view', 'quality.edit', 'construction.view', 'construction.edit'], modules: ['quality', 'planfact'] });
  const r = canSend({ id: 'd', owner: 'Иванов Иван' }, kindOf('defect_v2'), me);
  assert.equal(r.code, 'module');
  assert.equal(r.reason, 'Не отправлено: модуль «Стройконтроль» выключен у компании');
  assert.match(r.hint, /сохранена на телефоне/);
  assert.equal(canSend(rec(), K, me).ok, true, 'Качество включено — осмотр уходит');
  assert.equal(canSend({ id: 'd', owner: 'Иванов Иван' }, kindOf('defect_v2'), { ...me, modules: null }).ok, true, 'модули неизвестны — решает сервер');
});

test('этап 5: отбор после скачивания — по правилу; «Только мои» — по id автора, чужое ФИО со своим id — моё', () => {
  const me = eng({ objects: ['ЖК Север'] });
  const meet = kindOf('meeting');
  assert.equal(keepPulled({ id: 'm', author: 'Петров', project_canonical_key: 'ЖК Север' }, meet, me, false), true);
  assert.equal(keepPulled({ id: 'm', author: 'Петров', project_canonical_key: 'ЖК Юг' }, meet, me, false), false, 'чужой объект');
  assert.equal(keepPulled({ id: 'm', author: 'Петров', project_canonical_key: 'ЖК Север' }, meet, me, true), false, '«Только мои» — чужое нет');
  assert.equal(keepPulled({ id: 'm', author: 'Петров', authorId: U1, project_canonical_key: 'ЖК Север' }, meet, me, true), true, 'моё по id');
  assert.equal(keepPulled({ id: 'm' }, meet, null, true), true, 'без «кто я» — решает сервер');
  const ctr = eng({ actions: ['quality.view', 'quality.edit', 'quality.scope.contractor'], contractorId: CP });
  assert.equal(keepPulled({ id: 'm', author: 'Петров', contractorId: CP }, meet, ctr, true), true, 'подрядчику «Только мои» не сужает его фирму (как раньше)');
  assert.equal(keepPulled({ id: 'm', author: 'Петров' }, meet, eng({ actions: ['quality.view', 'quality.edit', 'quality.manage'] }), true), true, 'руководителю — тоже');
  assert.equal(keepPulled({ id: 'x' }, null, me, true), true, 'вид без описания — как раньше');
});

test('этап 5: новый вид записи — одна строка описания: он в списке «не отправлено», в правиле и в отправке «объектов»', async () => {
  const { recordStoresFrom } = await import('../../../src/platform/auth/offline-rescue.ts');
  const manifests = [{ id: 'demo', sync: [{ kind: 'note', store: 'demo_notes', table: 'demo_notes', title: 'Заметка', objectType: 'demo_note',
    author: { id: 'authorId', name: ['owner'] }, mode: 'author', view: ['quality.view'], edit: ['quality.edit'], ownFirst: true }] }];
  const kinds = kindsFrom(manifests);
  assert.equal(recordStoresFrom(manifests).demo_notes, 'Заметка');
  const k = kindOf('demo_notes', kinds);
  assert.equal(canSend({ id: 'n', owner: 'Иванов Иван' }, k, eng()).ok, true);
  assert.equal(canSend({ id: 'n', owner: 'Петров' }, k, eng()).code, 'foreign');
  const { objectKinds } = await import('../../services/sync/sync-access.policy.js');
  assert.deepEqual(objectKinds(kinds).map((x) => x.kind), ['note'], 'отправка «объектов» берёт вид из описания');
});
