/**
 * P2-0024 этап 4: «облегчить проверку» — одинаковые строки истории в памяти одним экземпляром,
 * содержимое записи не меняется.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStringPool, lightenInspection } from '../../services/storage/history-memory.utils.js';

// Копия как из базы устройства: строки — отдельные экземпляры (как после структурного клонирования).
const fresh = (s) => (' ' + s).slice(1);
function record(i) {
  return {
    id: String(1700000000000 + i), date: new Date(1792867000000 - i * 3600e3).toISOString(),
    projectName: fresh('ЖК Северный'), contractorName: fresh('СтройМонтаж'), templateKey: fresh('sys_masonry'),
    templateTitle: fresh('Кладка'), syncStatus: fresh('synced'), source: fresh('cloud'),
    state: { k1: fresh('ok'), k2: fresh('fail'), k3: fresh('ok') },
    details: { k2: { comment: fresh('Шов ' + i), causeCode: fresh('C02'), fact: fresh('12'), tolerance: fresh('10') } },
    metrics: { final: 70 + (i % 5), statusTxt: fresh('Норма'), statusCls: fresh('text-green'), warnings: [fresh('мало данных')], b3_found: false },
    photos: { k2: ['https://x/' + i + '.jpg'] },
    checkedStagesInfo: [fresh('Кладка')], checklistSnapshotRef: fresh('cs1_abc_1z'), long: 'x'.repeat(500) + i
  };
}

describe('lightenInspection', () => {
  it('содержимое записи не меняется (JSON до = после), возвращает ту же запись', () => {
    const pool = createStringPool();
    for (let i = 0; i < 50; i++) {
      const r = record(i);
      const before = JSON.stringify(r);
      assert.equal(lightenInspection(r, pool), r);
      assert.equal(JSON.stringify(r), before);
    }
  });

  it('повторяющиеся строки разных записей — один общий экземпляр в словаре', () => {
    const pool = createStringPool();
    const recs = Array.from({ length: 200 }, (_, i) => lightenInspection(record(i), pool));
    assert.ok(pool.has('ok') && pool.has('СтройМонтаж') && pool.has('C02') && pool.has('Норма') && pool.has('cs1_abc_1z'));
    // словарь не растёт от числа проверок: только повторяющиеся значения (+ уникальное «Шов i» не кладётся — комментарий)
    assert.ok(pool.size < 20, 'словарь: ' + pool.size);
    assert.equal(recs[0].state.k1, recs[199].state.k3);
  });

  it('комментарии, длинные строки, числа, фото и даты не попадают в словарь', () => {
    const pool = createStringPool();
    const r = lightenInspection(record(1), pool);
    assert.equal(pool.has(r.details.k2.comment), false);
    assert.equal(pool.has(r.long), false);
    assert.equal(pool.has(r.date), false);
    assert.equal(pool.has(r.photos.k2[0]), false);
    assert.equal(r.metrics.final, 71);
    assert.equal(r.metrics.b3_found, false);
  });

  it('пустые и старые записи (без state/details/metrics) — без ошибок', () => {
    const pool = createStringPool();
    assert.equal(lightenInspection(null, pool), null);
    assert.deepEqual(lightenInspection({ id: 'old' }, pool), { id: 'old' });
    assert.deepEqual(lightenInspection({ id: 'x', details: { a: null }, state: null }, pool), { id: 'x', details: { a: null }, state: null });
    const r = { id: 'y' };
    assert.equal(lightenInspection(r, undefined), r);
  });
});
