/**
 * P2-0053: туры «Обучения» (данные — tours.json) и их блок на экране «Демо»: карточка тура, сколько шагов, пройден ли.
 */
import data from './tours.json';
import { readProgress } from './tour-engine.ts';
import type { Tours } from './tour-engine.ts';

export const TOURS = data as unknown as Tours;
export const TOUR_ORDER = ['planfact', 'quality', 'construction'];

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const PLAY = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/></svg>';

/** Блок «Обучение по шагам» под ролями: три тура плитками; пройденный — «пройдено», начатый — «продолжить». */
export function toursHtml(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): string {
  const tiles = TOUR_ORDER.filter((id) => TOURS[id]).map((id) => {
    const t = TOURS[id];
    const p = readProgress(storage, id);
    const state = p.done ? ' · пройдено' : p.step > 0 ? ' · продолжить' : '';
    return `<button type="button" class="p2w-tile" data-testid="p2-tour-start" data-tour-start="${esc(id)}"><span class="p2w-ico">${PLAY}</span>` +
      `<span class="p2w-txt"><span class="p2w-t">Обучение: ${esc(t.title)}${esc(state)}</span><span class="p2w-d">${esc(t.summary)}</span></span></button>`;
  }).join('');
  return `<div class="p2d-sec" id="p2-tours">Обучение по шагам</div><div class="p2w-grid">${tiles}</div>`;
}
