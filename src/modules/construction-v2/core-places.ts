/**
 * P2-0054: места проекта ведёт «Компания → Объекты и места» — СК 2.0 их только выбирает.
 * Шахматка: клетки — все квартиры дерева (помещение СК заводится при первом открытии); вместо кнопок, меняющих места, —
 * подсказка со ссылкой в «Компанию».
 */

import type { LocationNode } from '../../services/locations/types';

export const CORE_PLACES_HREF = '#/settings/company/objects';

type CoreLoc = {
  getChildren: (parentId: string | null) => LocationNode[];
  isCoreLed?: (id: string | null | undefined) => boolean;
};

/** Место из проекта, места которого ведёт «Компания». Старая служба мест (без признака) — нет. */
export function isCoreLed(loc: Partial<CoreLoc> | null | undefined, id: string | null | undefined): boolean {
  return !!(loc && typeof loc.isCoreLed === 'function' && loc.isCoreLed(id));
}

/** Клетки этажа проекта «Компании»: квартиры дерева по порядку, у каждой — помещение СК или null (ещё не заведено). */
export function floorApartmentCells<U extends { locationId: string }>(
  loc: CoreLoc,
  floorId: string,
  floorUnits: U[]
): { apartment: LocationNode; unit: U | null }[] {
  return (loc.getChildren(floorId) || [])
    .filter((n) => n && n.nodeType === 'apartment')
    .map((apartment) => ({ apartment, unit: floorUnits.find((u) => u.locationId === apartment.id) || null }));
}

/** Короткое имя клетки: «кв. 12» → «12». */
export function apartmentCellName(n: { displayName?: string }): string {
  const s = String(n.displayName || '').trim();
  return s.replace(/^кв\.?\s*/i, '') || s;
}

/** Подсказка «места ведёт Компания» со ссылкой — цвета приложения (как кнопки шахматки). */
export function corePlacesHintHtml(text: string, linkText: string, esc: (s: string) => string): string {
  return `<div data-c2-core-places-hint class="mt-4 w-full rounded-xl border border-brand-soft bg-brand-soft px-4 py-3 text-rbi-label font-bold text-ink">
      ${esc(text)}
      <a href="${CORE_PLACES_HREF}" class="ml-1 font-black text-brand underline">${esc(linkText)}</a>
    </div>`;
}
