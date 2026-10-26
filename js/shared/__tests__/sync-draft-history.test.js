/**
 * P2-0025 этап 1: черновик осмотра «к отправке» только при правке; удаление в «Истории» —
 * сначала сохранить, потом пометить в памяти; «История» из памяти перестраивается при замене истории.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { draftFingerprint, draftNeedsPushAfterSync } from '../../services/sync/sync-retry.policy.js';
import {
  HistoryState, deletedHistoryCopy, deletedHistoryFlags
} from '../../modules/quality/features/history/history.state.js';

describe('draftFingerprint', () => {
  it('то же содержимое (другой порядок полей, другое время) — тот же отпечаток', () => {
    const a = { templateKey: 't', state: { a: 'ok', b: 'bad' }, details: { b: { c: 1 } }, timestamp: 1 };
    const b = { timestamp: 999, details: { b: { c: 1 } }, state: { b: 'bad', a: 'ok' }, templateKey: 't' };
    assert.equal(draftFingerprint(a), draftFingerprint(b));
  });
  it('изменён статус, комментарий, поле шапки или фото — отпечаток другой', () => {
    const base = { project: 'P', state: { a: 'ok' }, details: { a: { comment: 'x' } }, photos: { a: ['data:' + 'A'.repeat(5000)] } };
    const fp = draftFingerprint(base);
    assert.notEqual(fp, draftFingerprint({ ...base, state: { a: 'bad' } }));
    assert.notEqual(fp, draftFingerprint({ ...base, details: { a: { comment: 'y' } } }));
    assert.notEqual(fp, draftFingerprint({ ...base, project: 'Q' }));
    assert.notEqual(fp, draftFingerprint({ ...base, photos: { a: ['data:' + 'A'.repeat(4999) + 'B'] } }));
    assert.notEqual(fp, draftFingerprint({ ...base, photos: { a: ['data:' + 'A'.repeat(5000), 'p2'] } }));
  });
  it('доработка 1: замена буквы в середине длинного текста той же длины — отпечаток другой', () => {
    const text = 'Трещина в стяжке, '.repeat(20) + 'середина' + ' требуется ремонт.'.repeat(20);
    const edited = text.replace('середина', 'серёдина');
    assert.ok(text.length > 300 && edited.length === text.length);
    assert.notEqual(
      draftFingerprint({ details: { a: { comment: text } } }),
      draftFingerprint({ details: { a: { comment: edited } } })
    );
  });
  it('доработка 1: фото 1 МБ (data: и голый base64) — по-прежнему длиной и краями, дёшево', () => {
    const mb = 'A'.repeat(1024 * 1024);
    const t0 = Date.now();
    const fpData = draftFingerprint({ photos: { a: ['data:image/jpeg;base64,' + mb] } });
    const fpRaw = draftFingerprint({ photos: { a: [mb] } });
    assert.ok(Date.now() - t0 < 200, 'отпечаток фото не перебирает весь мегабайт');
    assert.ok(Number(fpData.split(':')[0]) < 400 && Number(fpRaw.split(':')[0]) < 400, 'в строку отпечатка попали только края');
  });
});

describe('draftNeedsPushAfterSync', () => {
  it('правок не было / были до начала — не помечать; после начала (с запасом на запись) — помечать', () => {
    assert.equal(draftNeedsPushAfterSync(0, 10_000), false);
    assert.equal(draftNeedsPushAfterSync(5_000, 10_000), false);
    assert.equal(draftNeedsPushAfterSync(9_500, 10_000), true, 'запись черновика могла не успеть до чтения');
    assert.equal(draftNeedsPushAfterSync(12_000, 10_000), true);
    assert.equal(draftNeedsPushAfterSync(5_000, undefined), true, 'начало неизвестно — как раньше');
  });
});

describe('AuditActions: черновик и «к отправке»', () => {
  let win, AuditActions;
  before(async () => {
    win = new Window({ url: 'http://localhost/' });
    globalThis.window = win;
    globalThis.document = win.document;
    globalThis.localStorage = win.localStorage;
    globalThis.CustomEvent = win.CustomEvent;
    globalThis.AuditState = { currentTemplateKey: 'tpl', state: {}, details: {}, photos: {} };
    win.AuditState = globalThis.AuditState;
    win.RBI = { services: { reports: { getExpertConclusions: () => ({}) } } };
    win.RbiSyncRetryPolicy = { draftFingerprint, draftNeedsPushAfterSync };
    win.isDemoMode = true; // saveSession в тесте не пишет в базу
    document.body.innerHTML = '<input id="inp-project" value="Объект"><input id="inp-inspector"><input id="inp-contractor"><input id="inp-location">';
    ({ AuditActions } = await import('../../modules/quality/features/audit/audit.actions.js'));
  });
  after(() => {
    clearTimeout(win.__saveSessionTimer);
    for (const k of ['window', 'document', 'localStorage', 'CustomEvent', 'AuditState']) delete globalThis[k];
  });

  it('первая правка помечает; повтор без изменений — нет; изменение — снова помечает', () => {
    localStorage.setItem('rbi_cloud_dirty', '0');
    AuditState.state.a = 'ok';
    AuditActions.scheduleSessionSave();
    assert.equal(localStorage.getItem('rbi_cloud_dirty'), '1');
    localStorage.setItem('rbi_cloud_dirty', '0'); // синхронизация отправила
    AuditActions.scheduleSessionSave();
    assert.equal(localStorage.getItem('rbi_cloud_dirty'), '0', 'без изменений — не к отправке');
    AuditState.details.a = { comment: 'трещина' };
    AuditActions.scheduleSessionSave();
    assert.equal(localStorage.getItem('rbi_cloud_dirty'), '1', 'с изменением — к отправке');
  });

  it('после синхронизации без правок — не помечает (раньше — каждый раз → синхронизация раз в минуту)', () => {
    localStorage.setItem('rbi_cloud_dirty', '0');
    AuditActions._lastDraftChangeAt = Date.now() - 60_000;
    for (let i = 0; i < 5; i++) {
      AuditActions.onSyncCompleted({ startedAt: Date.now() - 2_000 });
      assert.equal(localStorage.getItem('rbi_cloud_dirty'), '0');
    }
  });

  it('правка во время синхронизации — снова «к отправке» (правка не теряется)', () => {
    localStorage.setItem('rbi_cloud_dirty', '0');
    const startedAt = Date.now() - 3_000;
    AuditActions._lastDraftChangeAt = Date.now() - 1_000; // правка после начала, метку сняла синхронизация
    AuditActions.onSyncCompleted({ startedAt });
    assert.equal(localStorage.getItem('rbi_cloud_dirty'), '1');
  });

  it('черновик изменился, но scheduleSessionSave не вызывался — после синхронизации помечает', () => {
    localStorage.setItem('rbi_cloud_dirty', '0');
    AuditActions._lastDraftChangeAt = 0;
    AuditState.state.b = 'bad';
    AuditActions.onSyncCompleted({ startedAt: Date.now() });
    assert.equal(localStorage.getItem('rbi_cloud_dirty'), '1');
  });
});

describe('удаление в «Истории»: сохранить, затем пометить', () => {
  it('копия с пометкой — запись в памяти не меняется до сохранения; флаги переносятся после', () => {
    const item = { id: '1', date: '2026-10-01', payload: { a: 1 }, syncStatus: 'synced' };
    const copy = deletedHistoryCopy(item, '2026-10-24T00:00:00.000Z');
    assert.equal(item._deleted, undefined);
    assert.equal(item.syncStatus, 'synced');
    assert.equal(copy._deleted, true);
    assert.equal(copy.syncStatus, 'not_synced');
    assert.equal(copy.payload, item.payload, 'содержимое то же');
    Object.assign(item, deletedHistoryFlags(copy));
    assert.equal(item._deleted, true);
    assert.equal(item.updated_at, '2026-10-24T00:00:00.000Z');
    assert.deepEqual(Object.keys(deletedHistoryFlags(copy)).includes('payload'), false);
  });
});

describe('«История» из памяти после замены истории синхронизацией', () => {
  it('замена/дополнение window.contractorArray → список перестраивается; порционный список не трогается', () => {
    globalThis.window = { contractorArray: [{ id: 'a', date: '2026-10-01' }] };
    try {
      HistoryState.setRecordsFromMemory(window.contractorArray);
      assert.equal(HistoryState.refreshFromMemoryIfStale(), false);
      window.contractorArray = [{ id: 'a', date: '2026-10-01' }, { id: 'b', date: '2026-10-02' }];
      assert.equal(HistoryState.refreshFromMemoryIfStale(), true);
      assert.deepEqual(HistoryState.allRecords.map(r => r.id), ['b', 'a']);
      window.contractorArray.push({ id: 'c', date: '2026-10-03' });
      assert.equal(HistoryState.refreshFromMemoryIfStale(), true, 'добавление в тот же массив');
      assert.deepEqual(HistoryState.allRecords.map(r => r.id), ['c', 'b', 'a']);
      HistoryState.setRecords([{ id: 'x', date: '2026-10-01' }]); // порционный из базы
      window.contractorArray = [];
      assert.equal(HistoryState.refreshFromMemoryIfStale(), false);
      assert.deepEqual(HistoryState.allRecords.map(r => r.id), ['x']);
    } finally {
      delete globalThis.window;
      HistoryState.setRecords([]);
    }
  });
});

describe('deleteSelectedHistory: сбой записи на устройстве', () => {
  it('сбой put — запись в памяти не помечена и остаётся; удалённые до сбоя — убраны; отправка только за удалённые', async () => {
    const win = new Window({ url: 'http://localhost/' });
    const g = { window: win, document: win.document, localStorage: win.localStorage, CustomEvent: win.CustomEvent };
    Object.assign(globalThis, g);
    const toasts = [];
    globalThis.showToast = (m) => toasts.push(m);
    globalThis.confirm = () => true;
    globalThis.updateDataSummary = () => {};
    const recs = [{ id: 'r1', date: '2026-10-03' }, { id: 'r2', date: '2026-10-02' }, { id: 'r3', date: '2026-10-01' }];
    win.contractorArray = recs.slice();
    const saved = [];
    const storage = {
      stores: () => ({ HISTORY: 'app_history' }),
      put: async (_s, rec) => { if (rec.id === 'r2') throw new Error('QuotaExceededError'); saved.push(rec); }
    };
    let syncs = 0;
    win.triggerSync = () => { syncs++; };
    win.RBI = { services: { storage } };
    document.body.innerHTML = '<div id="history-list"></div>' + recs.map(r => `<input type="checkbox" class="hist-checkbox" value="${r.id}" checked>`).join('');
    try {
      const { HistoryActions } = await import('../../modules/quality/features/history/history.actions.js');
      HistoryActions._ctx = { storage, permissions: null };
      HistoryState.setRecordsFromMemory(win.contractorArray);
      localStorage.setItem('rbi_cloud_dirty', '0');
      await HistoryActions.deleteSelectedHistory();
      assert.deepEqual(saved.map(r => r.id), ['r1']);
      assert.equal(recs[0]._deleted, true, 'сохранённая — помечена');
      assert.equal(recs[1]._deleted, undefined, 'не сохранённая — не помечена');
      assert.equal(recs[2]._deleted, undefined, 'после сбоя — не трогали');
      assert.deepEqual(win.contractorArray.map(r => r.id), ['r2', 'r3']);
      assert.deepEqual(HistoryState.allRecords.map(r => r.id), ['r2', 'r3']);
      assert.equal(localStorage.getItem('rbi_cloud_dirty'), '1');
      assert.match(toasts[toasts.length - 1], /Удалено 1 из 3/);
    } finally {
      for (const k of ['window', 'document', 'localStorage', 'CustomEvent', 'showToast', 'confirm', 'updateDataSummary']) delete globalThis[k];
      HistoryState.setRecords([]);
    }
  });
});
