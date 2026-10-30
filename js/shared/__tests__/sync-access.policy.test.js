/** P2-0061: правило устройства «кто я, что моё, можно ли отправить» (sync-access.policy.js) — режимы как на сервере,
 *  переходное правило по ФИО, id главнее подписи, без входа — ничего не уходит. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessStamp, canAct, canChange, canSend, fineFromLegacy, isMine, keepPulled, kindOf, kindsFrom, meFrom, qualityFromLegacy, stampAuthor, visible } from '../../services/sync/sync-access.policy.js';

const K = kindOf('inspection');
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222', CP = '33333333-3333-4333-8333-333333333333';
const eng = (o = {}) => meFrom({ userId: U1, name: 'Иванов Иван', email: 'ivanov@test.invalid', names: ['Иванов И.'], actions: ['quality.view', 'quality.edit'], objects: null, ...o });
const rec = (o = {}) => ({ id: 'i1', inspectorName: 'Иванов Иван', project_canonical_key: 'ЖК Север', source: 'local', ...o });
// P2-0070: действия Стройконтроля 2.0 (перенос ролей 052: edit → все; подрядчик → видеть, в работу, устранено, записаться)
const CE = ['construction.view', 'construction.edit', 'construction.defects.view', 'construction.defects.create', 'construction.defects.assign',
  'construction.defects.start', 'construction.defects.fix', 'construction.defects.close', 'construction.defects.reject', 'construction.defects.delete',
  'construction.acceptance.view', 'construction.acceptance.book', 'construction.acceptance.schedule', 'construction.acceptance.conduct', 'construction.transfer.edit'];
// P2-0071: участие Качества (quality.my_access → quality): объекты ЖК Север → P1, ЖК Юг → P2, контейнер C — «без объектов»
const P1 = 'p1', P2 = 'p2', C = 'c0';
const QA = qualityFromLegacy(['quality.view', 'quality.edit']);
const qArea = (grants) => ({ quality: { admin: false, container: C,
  unplaced: { 'quality.inspections.view': 'all', 'quality.inspections.create': 'own', 'quality.inspections.delete': 'own', 'quality.meetings.view': 'all', 'quality.meetings.edit': 'own' },
  objects: [{ id: 'o1', key: 'ЖК Север', name: 'ЖК Север', synonyms: [], project: P1 }, { id: 'o2', key: 'ЖК Юг', name: 'ЖК Юг', synonyms: [], project: P2 }],
  grants: grants.map(([project, place, actions]) => ({ project, place, places: place ? [place] : null, actions: actions || QA, counterparty: null })) } });
const CC = ['construction.view', 'construction.edit', 'construction.defects.view', 'construction.defects.start', 'construction.defects.fix',
  'construction.acceptance.view', 'construction.acceptance.book'];

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

test('инженер (P2-0071): видит все записи области; своё правит, чужое — «запись другого сотрудника (ФИО)»; без «Просмотр всех» — только своё', () => {
  const me = eng();
  assert.deepEqual(canSend(rec(), K, me), { ok: true });
  assert.equal(visible(rec({ inspectorName: 'Петров Пётр' }), K, me), true, 'инженер видит объект целиком');
  assert.equal(canChange(rec(), K, me).ok, true, 'своё — можно');
  const r = canChange(rec({ inspectorName: 'Петров Пётр' }), K, me);
  assert.equal(r.ok, false); assert.equal(r.code, 'foreign');
  assert.equal(r.reason, 'Не отправлено: запись другого сотрудника (Петров Пётр)');
  assert.match(r.hint, /руководитель или автор/);
  assert.equal(canAct(rec({ inspectorName: 'Петров Пётр' }), K, me, 'quality.inspections.edit_any').ok, false, 'кнопка «Редактирование чужих» — нет');
  const own = eng({ actions: ['quality.view', 'quality.edit', 'quality.inspections.create', 'quality.inspections.delete'] });
  assert.equal(visible(rec({ inspectorName: 'Петров Пётр' }), K, own), false, 'без «Просмотр всех» — только своё, как сервер');
  assert.equal(visible(rec(), K, own), true);
});

test('руководитель (manage) и вся компания — чужое уходит; только просмотр — видит, но не отправляет', () => {
  assert.equal(canSend(rec({ authorId: U2 }), K, eng({ actions: ['quality.view', 'quality.edit', 'quality.manage'] })).ok, true);
  assert.equal(canSend(rec({ authorId: U2 }), K, eng({ actions: ['quality.view', 'quality.edit', 'quality.scope.company'] })).ok, true);
  const viewer = eng({ actions: ['quality.view'] });
  assert.equal(visible(rec({ authorId: U2 }), K, viewer), true);
  assert.equal(canSend(rec({ authorId: U2 }), K, viewer).code, 'right');
});

test('объекты (P2-0071): участие на объект — записи объекта; чужой — «вне участия»; без объекта — вся компания и автор; «без объектов» — ничего', () => {
  const me = eng({ areas: qArea([[P1]]) });
  assert.equal(visible(rec({ inspectorName: 'Петров' }), K, me), true, 'объект по справочнику (ЖК Север → P1) — все записи');
  assert.equal(canSend(rec({ project_canonical_key: 'ЖК Юг' }), K, me).code, 'area');
  assert.equal(visible(rec({ project_canonical_key: 'ЖК Юг', core_object_id: P1 }), K, me), true, 'объект сервера главнее названия');
  assert.equal(visible(rec({ project_canonical_key: '', inspectorName: 'Петров' }), K, me), false, 'чужая без объекта — нет');
  assert.equal(canSend(rec({ project_canonical_key: '' }), K, me).ok, true, 'своя без объекта — да (право хоть где-то)');
  const all = eng({ areas: qArea([['']]) });
  assert.equal(visible(rec({ project_canonical_key: '', inspectorName: 'Петров' }), K, all), true, 'на всю компанию — и без объекта');
  const none = eng({ areas: qArea([[C]]) });
  assert.equal(visible(rec({ inspectorName: 'Петров' }), K, none), false, '«без объектов» — записей объектов нет');
  assert.equal(canSend(rec({ project_canonical_key: '' }), K, none).ok, false, '«без объектов» — и своей без объекта нет');
  const sec = eng({ areas: qArea([[P1, 's1']]) });
  assert.equal(visible(rec({ inspectorName: 'Петров' }), K, sec), true, 'часть объекта — все записи без места');
  assert.equal(canChange(rec({ inspectorName: 'Петров' }), K, sec).ok, false, 'часть объекта — чужое не правит');
  assert.equal(canChange(rec({ authorId: U1 }), K, sec).ok, true, 'часть объекта — своё правит');
  assert.equal(visible({ id: 'm', author: 'Петров', project_canonical_key: 'ЖК Север' }, kindOf('meeting'), sec), true, 'совещание объекта — видит');
  assert.equal(canChange({ id: 'm', author: 'Петров', project_canonical_key: 'ЖК Север' }, kindOf('meeting'), sec).ok, false, 'чужое совещание — нет');
});

test('подрядчик: своя фирма по id — да, чужая или без фирмы — «запись другой фирмы»', () => {
  const me = eng({ actions: ['quality.view', 'quality.edit', 'quality.scope.contractor'], contractorId: CP });
  assert.equal(canSend(rec({ core_counterparty_id: CP, inspectorName: 'Петров' }), K, me).ok, true);
  assert.equal(canSend(rec({ core_counterparty_id: 'другая' }), K, me).code, 'contractor');
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
    // чужое уходит по правилу строк сервера; изменить / удалить на экране — P2-0071 (area): по «Редактирование» группы (у задач —
    // «Редактирование чужих», у инженера его нет); библиотека — только своё (ТД 238)
    const anyEdit = k.mode === 'area' && (k.editAny || []).every((a) => QA.includes(a));
    assert.equal(canSend(other, k, me).ok, k.mode === 'area' ? anyEdit : k.mode !== 'author', name + ': чужое уходит по праву (как сторож сервера) ' + k.mode);
    assert.equal(canChange(other, k, me).ok, anyEdit, name + ': чужое изменить / удалить — по праву группы');
    assert.equal(canChange(own, k, me).ok, true, name + ': своё — можно');
    assert.equal(canChange(other, k, eng({ actions: ['quality.view', 'quality.edit', 'quality.manage'] })).ok, true, name + ': руководитель — можно');
  }
  const t = kindOf('task');
  assert.equal(isMine({ id: 't', engineerName: 'Петров', assignedToId: U1 }, t, me), true, 'задача, назначенная мне, — моя');
});

test('этап 2: подрядчик — в режиме «команда объекта» только своя фирма; библиотека — по праву', () => {
  const me = eng({ actions: ['quality.view', 'quality.edit', 'quality.scope.contractor'], contractorId: CP });
  assert.equal(canSend({ id: 'm', author: 'Петров', core_counterparty_id: CP }, kindOf('meeting'), me).ok, true);
  assert.equal(canSend({ id: 'm', author: 'Петров', core_counterparty_id: 'чужая' }, kindOf('meeting'), me).code, 'contractor');
  assert.equal(canSend({ id: 'p', author: 'Петров' }, kindOf('practice'), me).ok, true);
});

test('этап 5: модуль выключен у компании — «Не отправлено: модуль … выключен», запись не теряется; включён — как обычно', () => {
  const me = eng({ actions: ['quality.view', 'quality.edit', ...CE], modules: ['quality', 'planfact'] });
  const r = canSend({ id: 'd', owner: 'Иванов Иван' }, kindOf('defect_v2'), me);
  assert.equal(r.code, 'module');
  assert.equal(r.reason, 'Не отправлено: модуль «Стройконтроль» выключен у компании');
  assert.match(r.hint, /сохранена на телефоне/);
  assert.equal(canSend(rec(), K, me).ok, true, 'Качество включено — осмотр уходит');
  assert.equal(canSend({ id: 'd', owner: 'Иванов Иван' }, kindOf('defect_v2'), { ...me, modules: null }).ok, true, 'модули неизвестны — решает сервер');
});

test('этап 5: отбор после скачивания — по правилу; «Только мои» — по id автора, чужое ФИО со своим id — моё', () => {
  const me = eng({ areas: qArea([[P1]]) });   // P2-0071: объект — по участию
  const meet = kindOf('meeting');
  assert.equal(keepPulled({ id: 'm', author: 'Петров', project_canonical_key: 'ЖК Север' }, meet, me, false), true);
  assert.equal(keepPulled({ id: 'm', author: 'Петров', project_canonical_key: 'ЖК Юг' }, meet, me, false), false, 'чужой объект');
  assert.equal(keepPulled({ id: 'm', author: 'Петров', project_canonical_key: 'ЖК Север' }, meet, me, true), false, '«Только мои» — чужое нет');
  assert.equal(keepPulled({ id: 'm', author: 'Петров', authorId: U1, project_canonical_key: 'ЖК Север' }, meet, me, true), true, 'моё по id');
  assert.equal(keepPulled({ id: 'm' }, meet, null, true), true, 'без «кто я» — решает сервер');
  const ctr = eng({ actions: ['quality.view', 'quality.edit', 'quality.scope.contractor'], contractorId: CP });
  assert.equal(keepPulled({ id: 'm', author: 'Петров', core_counterparty_id: CP }, meet, ctr, true), true, 'подрядчику «Только мои» не сужает его фирму (как раньше)');
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

test('доработка Б1/Б2: своя фирма — по id контрагента; без него — по карточке справочника своей фирмы; карточку с id фирмы не путать', () => {
  const me = eng({ actions: ['quality.view', 'quality.edit', 'quality.scope.contractor', ...CC], contractorId: CP, contractorCards: ['card-1'] });
  const acc = kindOf('acceptance_v2'), insp = K;
  assert.equal(canSend({ id: 'a', owner: 'Петров', contractorId: 'card-1' }, acc, me).ok, true, 'Б1: новая заявка подрядчика (только карточка) — уходит');
  assert.equal(canSend({ id: 'a', owner: 'Петров', contractorId: 'card-2' }, acc, me).code, 'contractor', 'чужая карточка — другая фирма');
  assert.equal(canSend({ id: 'i', inspectorName: 'Петров', contractorId: 'card-9', core_counterparty_id: CP }, insp, me).ok, true, 'Б2: id фирмы главнее карточки');
  assert.equal(keepPulled({ id: 'i', inspectorName: 'Петров', contractorId: 'card-9', core_counterparty_id: CP }, insp, me, true), true, 'Б2: скачанное своей фирмы не выбрасывается');
  assert.equal(canSend({ id: 'i', inspectorName: 'Петров', contractorId: CP }, insp, me).code, 'contractor', 'id фирмы в поле карточки — не совпадение');
});

test('доработка Б3: исполнитель задачи её автором не становится; автор задачи по id может её менять', () => {
  const t = kindOf('task');
  const B = eng({ userId: U2, name: 'Петров Пётр', email: 'p@test.invalid', names: [] });
  const task = { id: 't', engineerName: 'Иванов Иван', assignedToId: U2 };
  assert.equal(isMine(task, t, B), true, 'исполнитель — моя (видна, можно отправить)');
  assert.equal(stampAuthor(task, t, B), false, 'но автором не записывается');
  assert.equal(task.authorId, undefined);
  const A = eng();
  assert.equal(canChange({ ...task, authorId: U1 }, t, A).ok, true, 'автор по id — может менять');
});

test('доработка З4/З9: права ещё не пришли — скачанное не отбирается; Стройконтроль — управление construction.manage', () => {
  assert.equal(keepPulled({ id: 'm', author: 'Петров', project_canonical_key: 'ЖК Юг' }, kindOf('meeting'), eng({ actions: [], objects: ['ЖК Север'] }), true), true);
  const mgr = eng({ actions: [...CE, 'construction.manage'] });
  assert.equal(canChange({ id: 'd', owner: 'Петров', core_counterparty_id: '' }, kindOf('defect_v2'), mgr).ok, true);
});

test('P2-0070: Стройконтроль 2.0 по участию — объект, секция, своё без места, подрядчик, кнопки по действию', () => {
  const D = kindOf('defect_v2'), A = kindOf('acceptance_v2');
  const P1 = 'p1', P2 = 'p2', S1 = 's1', F1 = 'f1', S2 = 's2';
  const area = (grants) => ({ admin: false, enabled: true, grants });
  const g = (project, place, places, actions, counterparty = null) => ({ project, place, places, actions, counterparty });
  const objEng = eng({ actions: CE, area: area([g(P1, null, null, CE)]) });
  const secEng = eng({ actions: CE, area: area([g(P1, S1, [S1, F1], CE)]) });
  const d = (o) => ({ id: 'd', owner: 'Петров', authorId: U2, core_project_id: P1, core_location_id: F1, ...o });
  assert.equal(visible(d(), D, objEng), true, 'инженер объекта ЖК-1 видит его записи');
  assert.equal(visible(d({ core_project_id: P2, core_location_id: '' }), D, objEng), false, 'и не видит ЖК-2');
  assert.equal(canSend(d({ core_project_id: P2 }), D, objEng).code, 'area');
  assert.match(canSend(d({ core_project_id: P2 }), D, objEng).hint, /Компания → Сотрудники/);
  assert.equal(visible(d(), D, secEng), true, 'участие на секцию — этаж в ней виден');
  assert.equal(visible(d({ core_location_id: S2 }), D, secEng), false, 'секция 2 — нет');
  assert.equal(visible(d({ core_location_id: '' }), D, secEng), false, 'без места, чужое — нет');
  assert.equal(visible(d({ core_location_id: '', authorId: U1 }), D, secEng), true, 'без места, своё — видно');
  assert.equal(canSend(d({ core_location_id: '', authorId: U1 }), D, secEng).ok, false, '…но не правится');
  // кнопки по действию
  const noClose = eng({ actions: CE.filter((x) => x !== 'construction.defects.close'), area: area([g(null, null, null, CE.filter((x) => x !== 'construction.defects.close'))]) });
  assert.equal(canAct(d(), D, noClose, 'construction.defects.close').ok, false, 'без «Закрыть» — кнопки нет');
  assert.equal(canAct(d(), D, noClose, 'construction.defects.reject').ok, true, '«Вернуть» — есть');
  assert.equal(canChange(d(), D, noClose).ok, true, 'чужое замечание инженер правит (видит всё, правит всё)');
  // подрядчик: своя фирма, «в работу» — да, «закрыть» — нет; запись на телефоне — по карточке
  const ctr = eng({ actions: CC, contractorId: CP, contractorCards: ['card-1'],
    area: area([g(null, null, null, [...CC, 'quality.scope.contractor'], CP)]) });
  assert.equal(canAct(d({ core_counterparty_id: CP }), D, ctr, 'construction.defects.start').ok, true);
  assert.equal(canAct(d({ core_counterparty_id: CP }), D, ctr, 'construction.defects.close').ok, false);
  assert.equal(canSend(d({ core_counterparty_id: 'чужая' }), D, ctr).code, 'contractor');
  assert.equal(canAct({ id: 'a', contractorId: 'card-1' }, A, ctr, 'construction.acceptance.book').ok, true, 'новая заявка подрядчика уходит');
  assert.equal(canAct({ id: 'a', contractorId: 'card-1' }, A, ctr, 'construction.acceptance.schedule').ok, false, 'время подтверждает инженер');
  // запись на телефоне без полей сервера — объект и место по дереву мест
  const sec2 = eng({ actions: CE, area: area([g(P1, S1, [S1, F1], CE)]), placeOf: (r) => (r.locationId === 'n-f1' ? { project: P1, location: F1 } : null) });
  assert.equal(canSend({ id: 'n', owner: 'Иванов Иван', locationId: 'n-f1' }, D, sec2).ok, true, 'новая запись в своей секции уходит');
  // администратор платформы; права изменились — «Не отправлено» перепроверяется
  assert.equal(canAct(d(), D, eng({ actions: [], area: { admin: true, grants: [] } }), 'construction.defects.close').ok, true);
  assert.notEqual(accessStamp(objEng), accessStamp(secEng), 'отпечаток доступа учитывает участие');
});

test('P2-0070: приложение новее сервера (сервер без 052) — новые действия по прежним, как перенос ролей; сервер с 052 — как прислал', () => {
  const D = kindOf('defect_v2');
  const old = eng({ actions: ['quality.view', 'construction.view', 'construction.edit'] });
  assert.equal(canAct({ id: 'd' }, D, old, 'construction.defects.close').ok, true, 'инженер со старыми ключами — как раньше');
  const oldCtr = eng({ actions: ['construction.view', 'construction.edit', 'quality.scope.contractor'], contractorId: CP });
  assert.equal(canAct({ id: 'd', core_counterparty_id: CP }, D, oldCtr, 'construction.defects.fix').ok, true);
  assert.equal(canAct({ id: 'd', core_counterparty_id: CP }, D, oldCtr, 'construction.defects.close').ok, false);
  assert.deepEqual(fineFromLegacy(['construction.view']), ['construction.view', 'construction.defects.view', 'construction.acceptance.view']);
  const fresh = ['construction.view', 'construction.edit', 'construction.defects.view'];
  assert.deepEqual(fineFromLegacy(fresh), fresh, 'новые ключи есть — сервер с 052, ничего не добавлять (снятая галочка остаётся снятой)');
});

test('P2-0070: участие по модулям — у каждого модуля своё (Стройконтроль и План/Факт), одно правило', async () => {
    const { areasFrom, kindOf: kOf, canAct: act } = await import('../../services/sync/sync-access.policy.js');
    const g = (actions, place, places) => ({ project: 'p1', place, places, actions, counterparty: null });
    const me = meFrom({ userId: U1, name: 'Иванов', actions: [], areas: {
        construction: { grants: [g(['construction.defects.view', 'construction.defects.close'], null, null)] },
        planfact: { grants: [g(['planfact.fact.view', 'planfact.fact.create'], 's1', ['s1', 'f1'])] } } });
    const pf = kOf('pf_fact'), d = kOf('defect_v2');
    assert.equal(act({ project: 'p1', location_id: 'f1' }, pf, me, 'planfact.fact.create').ok, true, 'факт в своей секции');
    assert.equal(act({ project: 'p1', location_id: 's2' }, pf, me, 'planfact.fact.create').ok, false, 'факт вне участия');
    assert.equal(act({ project: 'p1', location_id: 's2' }, pf, me, 'planfact.fact.create').code, 'area');
    assert.equal(act({ core_project_id: 'p1', core_location_id: 's2' }, d, me, 'construction.defects.close').ok, true, 'Стройконтроль — свой участок: весь объект');
    assert.deepEqual(Object.keys(areasFrom(null, { grants: [] })), ['construction'], 'area без карты — участие Стройконтроля');
});

test('удаление (P2-0071): своё — «Удаление»; чужое — ещё и «Редактирование чужих»; совещание — по «Редактирование»', async () => {
  const { canRemove } = await import('../../services/sync/sync-access.policy.js');
  const me = eng({ areas: qArea([[P1]]) });
  assert.equal(canRemove(rec({ authorId: U1 }), K, me).ok, true, 'своя проверка');
  assert.equal(canRemove(rec({ inspectorName: 'Петров' }), K, me).code, 'foreign', 'чужая без «Редактирование чужих»');
  const noDel = eng({ areas: qArea([[P1, null, ['quality.view', 'quality.inspections.view', 'quality.inspections.create']]]) });
  assert.equal(canRemove(rec({ authorId: U1 }), K, noDel).ok, false, 'без «Удаление» — и своё нет');
  const boss = eng({ areas: qArea([[P1, null, [...QA, 'quality.inspections.edit_any']]]) });
  assert.equal(canRemove(rec({ inspectorName: 'Петров' }), K, boss).ok, true, 'руководитель — чужое');
  assert.equal(canRemove({ id: 'm', author: 'Петров', project_canonical_key: 'ЖК Север' }, kindOf('meeting'), me).ok, true, 'совещание объекта — по «Редактирование»');
});
