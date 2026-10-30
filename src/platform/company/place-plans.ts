/**
 * P2-0057: PDF-планы мест — логика без экрана. Разбор имени файла («Этаж 3.pdf», «3 этаж», «эт.-1», «кв 45», «Секция 2 эт 5»)
 * и сопоставление файлов с этажами и квартирами объекта (или секции), куда их бросили. Этаж с тем же номером в нескольких секциях
 * — план получают все (схема типового этажа), выбор можно сузить. Квартира — по номеру в названии или строительному номеру.
 */
import type { PlaceNode, PlacePlan } from '../core/projects.service.ts';

export interface PlanName { kind: 'floor' | 'apartment' | null; num: number | null; section: number | null }

const norm = (s: string): string => s.toLowerCase().replace(/ё/g, 'е').replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim();

/** Что в имени файла: этаж / квартира, номер, секция (если указана). */
export function parsePlanName(fileName: string): PlanName {
  const s = norm(fileName);
  const sec = s.match(/(?:^|[^а-яa-z])(?:секция|секц|сек|с)\.?\s*№?\s*(\d+)/);
  const section = sec ? Number(sec[1]) : null;
  const rest = sec ? s.replace(sec[0], ' ') : s;
  const apt = rest.match(/(?:^|[^а-яa-z])(?:квартира|кв|помещение|пом|apt|flat)\.?\s*№?\s*(\d+)/);
  if (apt) return { kind: 'apartment', num: Number(apt[1]), section };
  const fl = rest.match(/(?:^|[^а-яa-z])(?:этаж|эт)\.?\s*№?\s*(-?\d+)/) || rest.match(/(-?\d+)\s*-?\s*(?:й|ой|ый)?\s*(?:этаж|эт)(?![а-я])/);
  if (fl) return { kind: 'floor', num: Number(fl[1]), section };
  const only = rest.match(/^(-?\d+)$/);
  return only ? { kind: null, num: Number(only[1]), section } : { kind: null, num: null, section };
}

/** Номер в конце названия места: «эт. 3» → 3, «эт. -1» → -1, «кв. 45» → 45, «Секция 2» → 2 (как core.place_num). */
export function placeNum(name: string): number | null {
  const m = String(name).trim().match(/(-?\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

export interface PlanSlot { place: PlaceNode; section: PlaceNode | null; label: string }
/** Этажи и квартиры внутри места (по загруженным детям), с секцией и подписью «Секция 1 · эт. 3». */
export function planSlots(root: PlaceNode, kids: Record<string, PlaceNode[] | undefined>): PlanSlot[] {
  const out: PlanSlot[] = [];
  const walk = (n: PlaceNode, section: PlaceNode | null, path: string[]): void => {
    for (const c of kids[n.id] || []) {
      const sec = c.node_type === 'section' ? c : section;
      const p = [...path, c.name];
      if (c.node_type === 'floor' || c.node_type === 'apartment') out.push({ place: c, section: sec, label: p.join(' · ') });
      walk(c, sec, p);
    }
  };
  if (root.node_type === 'floor' || root.node_type === 'apartment') out.push({ place: root, section: null, label: root.name });
  walk(root, root.node_type === 'section' ? root : null, []);
  return out;
}

export interface PlanMatch { file: string; parsed: PlanName; targets: string[]; options: string[][]; reason: string }
/**
 * Сопоставить файлы с местами. targets — куда загрузить (id мест; пусто — «не нашлось — выберите»); options — варианты для выбора
 * (каждый — список мест; первый — найденный). Два файла на одно место — у второго targets пусто и причина.
 */
export function matchPlanFiles(files: string[], slots: PlanSlot[]): PlanMatch[] {
  const floors = slots.filter((s) => s.place.node_type === 'floor');
  const apts = slots.filter((s) => s.place.node_type === 'apartment');
  const secNo = (s: PlanSlot): number | null => (s.section ? placeNum(s.section.name) : null);
  const used = new Set<string>();
  return files.map((file) => {
    const parsed = parsePlanName(file);
    let found: PlanSlot[] = [];
    if (parsed.num !== null && parsed.kind !== 'floor') {
      found = apts.filter((s) => placeNum(s.place.name) === parsed.num || String(s.place.build_no || '') === String(parsed.num));
      if (parsed.section !== null && found.length > 1) found = found.filter((s) => secNo(s) === parsed.section);
    }
    if (!found.length && parsed.num !== null && parsed.kind !== 'apartment') {
      found = floors.filter((s) => placeNum(s.place.name) === parsed.num && (parsed.section === null || secNo(s) === parsed.section));
    }
    // квартира с тем же номером в разных секциях — неоднозначно: выбирают вручную
    if (found.length > 1 && found[0].place.node_type === 'apartment') {
      return { file, parsed, targets: [], options: found.map((s) => [s.place.id]), reason: 'Квартир с таким номером несколько — выберите' };
    }
    const ids = found.map((s) => s.place.id);
    const options = ids.length > 1 ? [ids, ...ids.map((id) => [id])] : ids.length ? [ids] : [];
    if (!ids.length) return { file, parsed, targets: [], options, reason: parsed.num === null ? 'В имени нет номера этажа или квартиры — выберите' : 'Не нашлось — выберите' };
    if (ids.some((id) => used.has(id))) return { file, parsed, targets: [], options, reason: 'На это место уже есть файл выше — выберите другое' };
    ids.forEach((id) => used.add(id));
    return { file, parsed, targets: ids, options, reason: '' };
  });
}

/** Текущая версия и все версии по местам (ответ pf_place_plans: новые сверху). */
export function plansByPlace(list: PlacePlan[]): Record<string, { current: PlacePlan | null; versions: PlacePlan[] }> {
  const out: Record<string, { current: PlacePlan | null; versions: PlacePlan[] }> = {};
  for (const p of list) {
    const x = out[p.location_id] || (out[p.location_id] = { current: null, versions: [] });
    x.versions.push(p);
    if (p.is_current) x.current = p;
  }
  for (const k of Object.keys(out)) out[k].versions.sort((a, b) => b.version_no - a.version_no);
  return out;
}

/** «1,2 МБ», «340 КБ». */
export function sizeText(bytes: number): string {
  if (!bytes) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

/** «31.10.2026». */
export function dateText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Подсказка при замене плана с точками замечаний. */
export function pinsText(n: number): string {
  if (!n) return '';
  const w = n % 10 === 1 && n % 100 !== 11 ? 'замечание' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'замечания' : 'замечаний';
  return `На этом плане ${n} ${w} — точки останутся на тех же местах листа.`;
}
