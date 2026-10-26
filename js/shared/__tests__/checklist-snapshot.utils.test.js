/**
 * P2-0024 этап 3: снимок чек-листа один раз на версию шаблона — ссылка, план перевода, чтение.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAPSHOT_MIGRATION_KEY,
  snapshotJson,
  snapshotRef,
  planSnapshotMigration,
  assignRef,
  withSnapshotRef,
  resolveSnapshot
} from '../../services/storage/checklist-snapshot.utils.js';

const SNAP_A = [{ group: 'Кладка', items: [{ id: 'k1', n: 'Перевязка швов', w: 2 }, { id: 'k2', n: 'Толщина шва', w: 1 }] }];
const SNAP_B = [{ group: 'Кладка', items: [{ id: 'k1', n: 'Перевязка швов', w: 3 }] }];

describe('snapshotRef', () => {
  it('одинаковый снимок → одна ссылка, разный → разные; не массив → пусто', () => {
    assert.equal(snapshotRef(SNAP_A), snapshotRef(JSON.parse(JSON.stringify(SNAP_A))));
    assert.notEqual(snapshotRef(SNAP_A), snapshotRef(SNAP_B));
    assert.match(snapshotRef(SNAP_A), /^cs1_[0-9a-z]+_[0-9a-z]+$/);
    assert.equal(snapshotRef(null), '');
    assert.equal(snapshotRef({}), '');
    assert.equal(SNAPSHOT_MIGRATION_KEY, 'checklist_snapshots_v1');
  });
});

describe('planSnapshotMigration', () => {
  it('3000 проверок на 3 версии шаблона → 3 снимка, у каждой проверки ссылка на побайтно тот же снимок', () => {
    const variants = [SNAP_A, SNAP_B, [{ group: 'Бетон', items: [{ id: 'b1', n: 'Прочность', w: 3 }] }]];
    const records = Array.from({ length: 3000 }, (_, i) => ({ id: String(i), checklistSnapshot: JSON.parse(JSON.stringify(variants[i % 3])) }));
    records.push({ id: 'old-no-snapshot' }, { id: 'null-snapshot', checklistSnapshot: null });
    const plan = planSnapshotMigration(records);
    assert.equal(plan.snapshots.size, 3);
    assert.equal(plan.updates.length, 3000, 'записи без снимка не трогаем');
    for (const u of plan.updates) {
      const orig = records.find(r => r.id === u.id).checklistSnapshot;
      assert.equal(plan.jsonById.get(u.ref), snapshotJson(orig));
    }
  });

  it('совпадение хэша при другом тексте → ссылка с суффиксом, снимки не путаются', () => {
    const fakeRef = snapshotRef(SNAP_A);
    const known = new Map([[fakeRef, '"другой текст с тем же хэшем"']]);
    const plan = planSnapshotMigration([{ id: '1', checklistSnapshot: SNAP_A }], known);
    assert.equal(plan.updates[0].ref, fakeRef + '_1');
    assert.equal(plan.jsonById.get(fakeRef + '_1'), snapshotJson(SNAP_A));
    assert.equal(plan.jsonById.get(fakeRef), '"другой текст с тем же хэшем"');
  });

  it('уже лежащий в хранилище тот же снимок — не кладём повторно', () => {
    const jsonById = new Map([[snapshotRef(SNAP_A), snapshotJson(SNAP_A)]]);
    const fresh = new Map();
    assert.equal(assignRef(SNAP_A, jsonById, fresh), snapshotRef(SNAP_A));
    assert.equal(fresh.size, 0);
  });
});

describe('withSnapshotRef / resolveSnapshot', () => {
  it('запись после перевода: без копии снимка, со ссылкой, остальные поля целы; исходная не меняется', () => {
    const rec = { id: '7', state: { k1: 'ok' }, details: { k1: { comment: 'x' } }, checklistSnapshot: SNAP_A, metrics: { score: 90 } };
    const out = withSnapshotRef(rec, 'cs1_x_1');
    assert.equal(out.checklistSnapshot, undefined);
    assert.equal('checklistSnapshot' in out, false);
    assert.equal(out.checklistSnapshotRef, 'cs1_x_1');
    assert.deepEqual(out.state, rec.state);
    assert.deepEqual(out.details, rec.details);
    assert.deepEqual(out.metrics, rec.metrics);
    assert.ok(Array.isArray(rec.checklistSnapshot), 'исходный объект не тронут');
  });

  it('чтение: старый формат, по ссылке, без снимка (старая проверка) → null', () => {
    const store = new Map([['r1', SNAP_B]]);
    const get = (ref) => store.get(ref);
    assert.deepEqual(resolveSnapshot({ checklistSnapshot: SNAP_A }, get), SNAP_A);
    assert.deepEqual(resolveSnapshot({ checklistSnapshotRef: 'r1' }, get), SNAP_B);
    assert.equal(resolveSnapshot({ checklistSnapshotRef: 'нет-такого' }, get), null);
    assert.equal(resolveSnapshot({ id: 'old' }, get), null);
    assert.equal(resolveSnapshot(null, get), null);
  });
});
