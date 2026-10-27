// P2-0054: места ведёт «Компания» — шахматка СК 2.0 показывает все квартиры дерева, ссылки ведут в «Компанию».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apartmentCellName, corePlacesHintHtml, floorApartmentCells, isCoreLed, CORE_PLACES_HREF } from '../core-places.ts';

const node = (id: string, parentId: string | null, nodeType: string, displayName: string) =>
  ({ id, parentId, nodeType, displayName, companyId: 'rbi', sort_order: 0 }) as never;

test('признак «ведёт Компания»: есть у службы мест — по ней; старая служба без признака — нет', () => {
  assert.equal(isCoreLed({ isCoreLed: (id) => id === 'a1' }, 'a1'), true);
  assert.equal(isCoreLed({ isCoreLed: (id) => id === 'a1' }, 'x'), false);
  assert.equal(isCoreLed({}, 'a1'), false);
  assert.equal(isCoreLed(null, 'a1'), false);
});

test('клетки этажа: все квартиры дерева по порядку, помещение СК — где заведено, иначе пусто', () => {
  const kids: Record<string, unknown[]> = { f1: [node('a1', 'f1', 'apartment', 'кв. 1'), node('a2', 'f1', 'apartment', 'кв. 2'), node('o', 'f1', 'other', 'Тех. помещение')] };
  const loc = { getChildren: (id: string | null) => (kids[String(id)] || []) as never[] };
  const cells = floorApartmentCells(loc, 'f1', [{ locationId: 'a2', id: 'u2' }, { locationId: 'f1', id: 'legacy' }]);
  assert.deepEqual(cells.map((c) => [c.apartment.id, c.unit ? (c.unit as { id: string }).id : null]), [['a1', null], ['a2', 'u2']]);
});

test('короткое имя клетки и подсказка со ссылкой в «Компанию»', () => {
  assert.equal(apartmentCellName({ displayName: 'кв. 12' }), '12');
  assert.equal(apartmentCellName({ displayName: 'Кв 7' }), '7');
  assert.equal(apartmentCellName({ displayName: 'Офис 3' }), 'Офис 3');
  const html = corePlacesHintHtml('Места — в «Компании».', 'Править <в> Компании →', (s) => s.replace(/</g, '&lt;'));
  assert.ok(html.includes(`href="${CORE_PLACES_HREF}"`) && html.includes('Править &lt;в> Компании') && html.includes('bg-brand-soft'));
});
