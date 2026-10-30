/**
 * Unit: P2-0076 — внешний СК по номерам «Компании»: нормализация текста как на сервере (quality.sk_link_key), тексты файла
 * для шага сопоставления, подстановка известного, 3 похожих, подписи Аналитики по id (два написания фирмы — один подрядчик,
 * без соответствия — «не разобрано»), фильтр по месту; число просрочек на тех же данных не меняется.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  skLinkKey, skRecordText, skLinkItems, skApplyRegister, skSuggest, skChoiceMaps, skCoreView, skPlaceMatches
} from '../../sk/sk.links.js';
import { buildContrMap } from '../sk.desktop.content.js';

// подбор похожих импорта (sk.actions.js sk_similarity) — та же формула, без window
function similarity(s1, s2) {
  if (!s1 || !s2) return 0;
  let longer = s1.toLowerCase(); let shorter = s2.toLowerCase();
  if (s1.length < s2.length) { longer = s2.toLowerCase(); shorter = s1.toLowerCase(); }
  if (!longer.length) return 1;
  const costs = [];
  for (let i = 0; i <= shorter.length; i++) costs[i] = i;
  for (let i = 1; i <= longer.length; i++) {
    costs[0] = i; let nw = i - 1;
    for (let j = 1; j <= shorter.length; j++) {
      const cj = Math.min(1 + Math.min(costs[j], costs[j - 1]), shorter[j - 1] === longer[i - 1] ? nw : nw + 1);
      nw = costs[j]; costs[j] = cj;
    }
  }
  return (longer.length - costs[shorter.length]) / longer.length;
}

const CH = {
  counterparties: [{ id: 'f1', name: 'ООО Ромашка' }, { id: 'f2', name: 'Лютик' }, { id: 'f3', name: 'Ромашка-Строй' }, { id: 'f4', name: 'Василёк' }],
  work_types: [{ id: 'w1', name: 'Кладочные работы' }, { id: 'w2', name: 'Отделка' }],
  places: [
    { id: 'k2', parent: null, type: 'object', name: 'Корпус 2' },
    { id: 's1', parent: 'k2', type: 'section', name: 'Корпус 2 / Секция 1' },
    { id: 'e5', parent: 's1', type: 'floor', name: 'Корпус 2 / Секция 1 / эт. 5' },
    { id: 's2', parent: 'k2', type: 'section', name: 'Корпус 2 / Секция 2' },
    { id: 'e3', parent: 's2', type: 'floor', name: 'Корпус 2 / Секция 2 / эт. 3' }
  ]
};

describe('P2-0076: текст соответствия — как на сервере', () => {
  it('регистр, ё/е, кавычки, пробелы; пустое — нет ключа', () => {
    assert.equal(skLinkKey('ООО  «Ромашка» '), 'ооо ромашка');
    assert.equal(skLinkKey('"Ёлка"'), 'елка');
    assert.equal(skLinkKey('Кладочные  работы'), skLinkKey('кладочные работы'));
    assert.equal(skLinkKey('   '), null);
    assert.equal(skLinkKey(null), null);
    assert.equal(skLinkKey('я'.repeat(600)).length, 500);
  });
  it('текст замечания по виду: фирма как в файле, «Без категории» — нет, место — путь', () => {
    const r = { contractor_raw: 'Ромашка (ООО)', contractor_name: 'Ромашка', category: 'Без категории', project_raw_path: 'ЖК/Корпус 2/Секция 1/5', project_loc: 'x' };
    assert.equal(skRecordText('contractor', r), 'Ромашка (ООО)');
    assert.equal(skRecordText('contractor', { contractor_name: 'Лютик' }), 'Лютик');
    assert.equal(skRecordText('category', r), null);
    assert.equal(skRecordText('place', r), 'ЖК/Корпус 2/Секция 1/5');
    assert.equal(skRecordText('place', { project_loc: 'Корпус 3' }), 'Корпус 3');
  });
});

describe('P2-0076: шаг сопоставления при загрузке', () => {
  const recs = () => [
    { contractor_raw: 'ООО Ромашка', category: 'Кладочные работы', project_raw_path: 'Корпус 2, секция 1, этаж 5', project_raw_name: 'Корпус 2, секция 1, этаж 5', project_block: 'Общее', project_floor: '' },
    { contractor_raw: 'Ромашка (ООО)', category: 'кладочные  работы', project_raw_path: 'Склад', project_raw_name: 'Склад' },
    { contractor_raw: 'ромашка (ооо)', category: 'Без категории', project_raw_path: 'Склад' }
  ];
  it('тексты файла — по одному на вид и ключ', () => {
    const items = skLinkItems(recs());
    const by = (k) => items.filter((x) => x.kind === k).map((x) => x.text);
    assert.deepEqual(by('contractor'), ['ООО Ромашка', 'Ромашка (ООО)']);
    assert.deepEqual(by('category'), ['Кладочные работы']);
    assert.deepEqual(by('place'), ['Корпус 2, секция 1, этаж 5', 'Склад']);
    const place = items.find((x) => x.kind === 'place');
    assert.equal(place.project_raw_name, 'Корпус 2, секция 1, этаж 5');
  });
  it('известное подставлено в записи файла, новое — пусто; сводка «узнано / новых»', () => {
    const r = recs();
    const summary = skApplyRegister(r, [
      { kind: 'contractor', text: 'ООО Ромашка', target: 'f1' }, { kind: 'contractor', text: 'Ромашка (ООО)', target: null },
      { kind: 'category', text: 'Кладочные работы', target: 'w1' },
      { kind: 'place', text: 'Корпус 2, секция 1, этаж 5', target: 'e5' }, { kind: 'place', text: 'Склад', target: null }
    ]);
    assert.equal(r[0].core_counterparty_id, 'f1');
    assert.equal(r[1].core_counterparty_id, null);
    assert.equal(r[2].core_counterparty_id, null, 'другой регистр — тот же текст');
    assert.equal(r[1].core_work_type_id, 'w1');
    assert.equal(r[2].core_work_type_id, undefined, '«Без категории» не трогается');
    assert.equal(r[0].core_location_id, 'e5');
    assert.deepEqual([summary.contractor, summary.category, summary.place, summary.fresh],
      [{ known: 1, fresh: 1 }, { known: 1, fresh: 0 }, { known: 1, fresh: 1 }, 2]);
  });
});

describe('P2-0076: 3 похожих записи «Компании»', () => {
  it('фирмы — по подбору импорта: без «ООО» и порядка слов, не больше трёх, самые похожие первыми', () => {
    const s = skSuggest('Ромашка (ООО)', CH.counterparties, similarity, 3, true);
    assert.equal(s[0].id, 'f1');
    assert.ok(s.some((x) => x.id === 'f3'));
    assert.ok(!s.some((x) => x.id === 'f2' || x.id === 'f4'));
    const many = Array.from({ length: 6 }, (_, i) => ({ id: 'm' + i, name: 'Ромашка ' + i }));
    assert.equal(skSuggest('Ромашка', many, similarity, 3, true).length, 3);
  });
  it('виды работ и места — вхождение и последняя часть пути; совсем непохожего нет', () => {
    assert.equal(skSuggest('Монолит', [{ id: 'm', name: 'Монолитные работы' }, { id: 'k', name: 'Кровля' }], similarity, 3)[0].id, 'm');
    assert.equal(skSuggest('секция 2', CH.places, similarity, 3)[0].id, 's2');
    assert.deepEqual(skSuggest('Бетонный завод', CH.work_types, similarity, 3), []);
  });
});

describe('P2-0076: Аналитика по id «Компании»', () => {
  const maps = skChoiceMaps(CH);
  const past = '2026-01-01'; const due = '2026-02-01';
  const data = [
    { contractor: 'ООО Ромашка', contractor_raw: 'ООО Ромашка', core_counterparty_id: 'f1', category: 'Кладка', core_work_type_id: 'w1', date_issued: past, deadline: due, status_normalized: 'open', core_location_id: 'e5' },
    { contractor: 'Ромашка ООО', contractor_raw: 'Ромашка (ООО)', core_counterparty_id: 'f1', category: 'Кладочные', core_work_type_id: 'w1', date_issued: past, deadline: due, status_normalized: 'open', core_location_id: 'e3' },
    { contractor: 'Неизвестная', contractor_raw: 'Неизвестная', core_counterparty_id: null, category: 'Прочее', date_issued: past, deadline: due, status_normalized: 'open', block: 'Склад', project_raw_path: 'Склад' }
  ];
  it('два написания фирмы — один подрядчик; без соответствия — «не разобрано»; вид работ — по id', () => {
    const v = data.map((r) => skCoreView(r, maps));
    assert.equal(v[0].contractor, 'ООО Ромашка');
    assert.equal(v[1].contractor, 'ООО Ромашка');
    assert.equal(v[2].contractor, 'Неизвестная · не разобрано');
    assert.equal(v[1].category, 'Кладочные работы');
    assert.equal(v[2].category, 'Прочее', 'категория без соответствия — прежний текст (объёмы ИСД)');
    assert.equal(data[1].contractor, 'Ромашка ООО', 'хранимая запись не меняется');
  });
  it('место по id: этаж и корпус · секция; без соответствия — пометка', () => {
    const v = skCoreView(data[0], maps);
    assert.equal(v.floor, '5');
    assert.equal(v.block, 'Корпус 2 · Секция 1');
    assert.equal(skCoreView(data[2], maps).block, 'Склад · не разобрано');
  });
  it('фильтр по месту: секция — со своими этажами', () => {
    assert.ok(skPlaceMatches(data[0], 's1', maps));
    assert.ok(!skPlaceMatches(data[1], 's1', maps));
    assert.ok(skPlaceMatches(data[1], 'k2', maps));
    assert.ok(!skPlaceMatches(data[2], 'k2', maps));
    assert.ok(skPlaceMatches(data[2], '', maps));
  });
  it('числа просрочек на тех же данных не меняются, подрядчиков — меньше', () => {
    const before = buildContrMap(data);
    const after = buildContrMap(data.map((r) => skCoreView(r, maps)));
    const sum = (p) => Object.values(p.map).reduce((a, d) => a + d.overdueCount, 0);
    assert.equal(sum(after), sum(before));
    assert.equal(after.totalIssues, before.totalIssues);
    assert.equal(after.totalOpen, before.totalOpen);
    assert.equal(Object.keys(before.map).length, 3);
    assert.equal(Object.keys(after.map).length, 2);
    assert.equal(after.map['ООО Ромашка'].total, 2);
  });
});
