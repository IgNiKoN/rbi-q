/**
 * P2-0026: общие правила группировки «Истории» (телефон и ПК) — history.group.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupByContractorWork, avgFinalUrk, avgUrkStatusCls, contractorNameOf, workTypeNameOf
} from '../../modules/quality/features/history/history.group.js';

const rec = (id, contractor, work, urk) => ({ id, contractorName: contractor, templateTitle: work, metrics: urk == null ? {} : { final: urk } });

describe('history.group', () => {
  it('Подрядчик → Вид работ по алфавиту, все записи на месте, числа групп = числу записей', () => {
    const items = [
      rec('1', 'СтройМонтаж', 'Штукатурка', 80), rec('2', 'АкваТерм', 'Кровля', 60),
      rec('3', 'СтройМонтаж', 'Армирование', 90), rec('4', 'СтройМонтаж', 'Штукатурка', 70), rec('5', '', '', null)
    ];
    const g = groupByContractorWork(items);
    assert.deepEqual(g.map((c) => c.name), ['АкваТерм', 'Не указан', 'СтройМонтаж']);
    const sm = g[2];
    assert.deepEqual(sm.works.map((w) => w.name), ['Армирование', 'Штукатурка']);
    assert.deepEqual(sm.works[1].items.map((r) => r.id), ['1', '4'], 'порядок внутри вида работ сохраняется');
    assert.equal(sm.items.length, 3);
    assert.equal(g.reduce((n, c) => n + c.items.length, 0), items.length);
    assert.equal(g[1].works[0].name, 'Неизвестный вид работ');
  });

  it('средний УрК и цвет — как раньше на телефоне (пороги 70 / 85, без УрК — null и синий)', () => {
    assert.equal(avgFinalUrk([rec('1', 'a', 'w', 80), rec('2', 'a', 'w', 71), rec('3', 'a', 'w', null)]), 76);
    assert.equal(avgFinalUrk([rec('1', 'a', 'w', null)]), null);
    assert.equal(avgUrkStatusCls(null), 'tag-blue');
    assert.equal(avgUrkStatusCls(69), 'tag-red');
    assert.equal(avgUrkStatusCls(70), 'tag-yellow');
    assert.equal(avgUrkStatusCls(85), 'tag-green');
    assert.equal(contractorNameOf({}), 'Не указан');
    assert.equal(workTypeNameOf({ templateTitle: 'X' }), 'X');
  });
});
