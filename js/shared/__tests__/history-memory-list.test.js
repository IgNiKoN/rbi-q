/**
 * P2-0024: список Журнала из истории в памяти — тот же набор и порядок, что у индекса by_date ('prev').
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { historyListFromMemory, HistoryState } from '../../modules/quality/features/history/history.state.js';

describe('historyListFromMemory', () => {
  it('новые сверху; при равной дате — больший id выше; удалённые и без даты — нет', () => {
    const recs = [
      { id: 'a', date: '2026-10-01T10:00:00.000Z' },
      { id: 'c', date: '2026-10-03T10:00:00.000Z' },
      { id: 'b', date: '2026-10-03T10:00:00.000Z' },
      { id: 'd', date: '2026-10-02T10:00:00.000Z', _deleted: true },
      { id: 'e', date: '2026-10-02T10:00:00.000Z', is_deleted: true },
      { id: 'f' },
      { id: 'g', date: '2026-10-02T10:00:00.000Z' },
      null
    ];
    assert.deepEqual(historyListFromMemory(recs).map(r => r.id), ['c', 'b', 'g', 'a']);
  });

  it('числовые ключи — ниже строковых (порядок ключей IndexedDB); объекты не копируются', () => {
    const s = { id: '2', date: '2026-01-01' }, n = { id: '1', date: 1700000000000 };
    const out = historyListFromMemory([n, s]);
    assert.deepEqual(out.map(r => r.id), ['2', '1']);
    assert.equal(out[0], s);
  });

  it('пустая история — пусто', () => {
    assert.deepEqual(historyListFromMemory([]), []);
    assert.deepEqual(historyListFromMemory(null), []);
  });
});

describe('HistoryState.useMemoryHistoryIfReady', () => {
  it('порционный список меняется на историю из памяти; повторно и без памяти — нет', () => {
    globalThis.window = { contractorArray: [{ id: 'x', date: '2026-10-01' }, { id: 'y', date: '2026-10-02' }] };
    try {
      HistoryState.setRecords([{ id: 'y', date: '2026-10-02' }]);
      HistoryState.setPageState({ pageHasMore: true });
      assert.equal(HistoryState.useMemoryHistoryIfReady(), true);
      assert.deepEqual(HistoryState.allRecords.map(r => r.id), ['y', 'x']);
      assert.equal(HistoryState.pageHasMore, false);
      assert.equal(HistoryState.useMemoryHistoryIfReady(), false, 'уже из памяти');
      globalThis.window.contractorArray = [];
      HistoryState.setPageState({ pageHasMore: true });
      assert.equal(HistoryState.useMemoryHistoryIfReady(), false, 'памяти нет — остаётся порционный');
    } finally {
      delete globalThis.window;
    }
  });
});

describe('доработка 1: версия списка (ревью №3 — дубли в гонке с догрузкой)', () => {
  it('замена списка повышает listGen; переход на память сбрасывает «идёт догрузка»', () => {
    globalThis.window = { contractorArray: [{ id: 'x', date: '2026-10-01' }] };
    try {
      HistoryState.setRecords([]);
      const g0 = HistoryState.listGen;
      HistoryState.setPageState({ pageHasMore: true, isLoadingPage: true });
      assert.equal(HistoryState.useMemoryHistoryIfReady(), true);
      assert.ok(HistoryState.listGen > g0, 'версия выросла — порция из базы будет отброшена');
      assert.equal(HistoryState.isLoadingPage, false);
      const g1 = HistoryState.listGen;
      HistoryState.appendRecords([{ id: 'z', date: '2026-09-01' }]);
      assert.equal(HistoryState.listGen, g1, 'добавление порции версию не меняет');
    } finally {
      delete globalThis.window;
    }
  });
});
