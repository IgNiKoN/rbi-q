/**
 * P2-0056: разбор списка помещений из Excel (наш шаблон или квартирография заказчика) — чистые функции, без сети.
 * Лист (таблица значений) → строка заголовка и роли столбцов (владелец может поправить) → строки загрузки с названиями
 * как в приложении («Корпус 1», «Секция 1», «эт. 3», «кв. 45»). «Есть / новое / ошибка» решает сервер (pf_import_places).
 */
import type { Cell, SheetData } from '../services/excel/xlsx-reader.ts';
import type { ImportResult, ImportRow } from '../core/projects.service.ts';
import { buildRegistryXlsx } from '../ui/registry/export.ts';

export type PlaceRole = 'object' | 'section' | 'floor' | 'name' | 'build_no' | 'bti_no' | 'area' | 'rooms' | 'ignore';
/** Роли по порядку столбцов шаблона и подписи для выбора «что это за столбец». */
export const PLACE_ROLES: { role: PlaceRole; label: string }[] = [
  { role: 'object', label: 'Корпус' }, { role: 'section', label: 'Секция' }, { role: 'floor', label: 'Этаж' },
  { role: 'name', label: 'Помещение' }, { role: 'build_no', label: 'Стр. №' }, { role: 'bti_no', label: '№ БТИ' },
  { role: 'area', label: 'Площадь, м²' }, { role: 'rooms', label: 'Комнат' }, { role: 'ignore', label: 'Не брать' }
];
export const TEMPLATE_LABELS = PLACE_ROLES.filter((r) => r.role !== 'ignore').map((r) => r.label);
/** Строки-примеры шаблона (без строки заголовка). */
export const TEMPLATE_EXAMPLE: (string | number | null)[][] = [
  ['Корпус 1', 1, 1, 1, 1, null, 38.4, 1],
  ['Корпус 1', 1, 1, 2, 2, null, 61.2, 2],
  ['Корпус 1', 1, 2, 3, 3, null, 38.4, 'студия']
];

const low = (s: string): string => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
export const cellStr = (v: Cell | undefined): string => (v === null || v === undefined ? '' : typeof v === 'number' ? String(v) : String(v).trim());

/** Роль столбца по подписи заголовка. */
export function roleOfLabel(label: string): PlaceRole {
  const s = low(label);
  if (!s || /п\/п|^№$|^n$|^#$/.test(s)) return 'ignore';
  if (/строит|стр\.? ?№|^стр\.?$|^стр\.? номер|условн/.test(s)) return 'build_no';
  if (/бти|почтов|кадастр/.test(s)) return 'bti_no';
  if (/тип помещ|назначени|статус|цена|стоимост|этажност/.test(s)) return 'ignore';
  if (/площад|^s$|^s,|м2|м²/.test(s)) return 'area';
  if (/комнат|комн|^тип( кв)?/.test(s)) return 'rooms';
  if (/секци|подъезд/.test(s)) return 'section';
  if (/этаж/.test(s)) return 'floor';
  if (/корпус|^дом|строени|^объект|^здани|^литер/.test(s)) return 'object';
  if (/квартир|помещени|^кв(\.|$| )|^№ ?кв|^№ ?пом|^номер$|^номер кв|^номер пом/.test(s)) return 'name';
  return 'ignore';
}

/** Роли без повторов: у каждой роли (кроме «не брать») — один столбец; из нескольких площадей берётся «общая». */
export function uniqueRoles(labels: string[], roles: PlaceRole[]): PlaceRole[] {
  const out = roles.slice();
  const areas = out.map((r, i) => (r === 'area' ? i : -1)).filter((i) => i >= 0);
  if (areas.length > 1) {
    const keep = areas.find((i) => /общ/.test(low(labels[i] || ''))) ?? areas[0];
    for (const i of areas) if (i !== keep) out[i] = 'ignore';
  }
  const seen = new Set<PlaceRole>();
  return out.map((r) => { if (r === 'ignore') return r; if (seen.has(r)) return 'ignore'; seen.add(r); return r; });
}

/** Поменять роль столбца; та же роль у другого столбца снимается. */
export function setRole(roles: PlaceRole[], col: number, role: PlaceRole): PlaceRole[] {
  return roles.map((r, i) => (i === col ? role : role !== 'ignore' && r === role ? 'ignore' : r));
}

export interface PlaceHeader { row: number; labels: string[]; roles: PlaceRole[] }
/** Строка заголовка среди первых 30: больше всего узнанных столбцов, нужен этаж или помещение. Нет — null. */
export function findPlaceHeader(rows: Cell[][]): PlaceHeader | null {
  let best: PlaceHeader | null = null; let bestScore = 1;
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const labels = (rows[r] || []).map((v) => (typeof v === 'string' ? v : ''));
    const roles = uniqueRoles(labels, labels.map(roleOfLabel));
    const score = roles.filter((x) => x !== 'ignore').length;
    if (score > bestScore && (roles.includes('floor') || roles.includes('name'))) { best = { row: r, labels: labels.map((l, i) => l || `Столбец ${i + 1}`), roles }; bestScore = score; }
  }
  return best;
}

const num = (s: string): string | null => {
  const m = s.match(/^№?\s*(-?\d+)(?:[.,]0+)?$/);
  return m ? String(Number(m[1])) : null;
};
/** Название уровня как в приложении: число → «Корпус N», «Секция N», «эт. N», «кв. N»; иначе — как в файле. */
export function placeName(kind: 'object' | 'section' | 'floor' | 'name', raw: string): string | null {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const n = num(s);
  if (kind === 'object') return n !== null ? `Корпус ${n}` : s;
  if (kind === 'section') {
    if (n !== null) return `Секция ${n}`;
    const m = low(s).match(/^(?:секция|подъезд|сек\.?|с\.?)\s*№?\s*(\d+)$/);
    return m ? `Секция ${Number(m[1])}` : s;
  }
  if (kind === 'floor') {
    if (n !== null) return `эт. ${n}`;
    const m = low(s).match(/^(?:этаж|эт\.?)\s*№?\s*(-?\d+)$/) || low(s).match(/^(-?\d+)\s*(?:-?й)?\s*(?:этаж|эт\.?)$/);
    return m ? `эт. ${Number(m[1])}` : s;
  }
  if (n !== null) return `кв. ${n}`;
  const m = s.match(/^(?:кв\.?|квартира)\s*№?\s*(\S+)$/i);
  return m ? `кв. ${m[1]}` : s;
}

/** Номер (стр., БТИ): 45 → «45» (без «.0»). */
const noStr = (s: string): string | null => (s ? num(s) ?? s : null);
/** Площадь: «54,3», «54.3 м²» → «54,3» / «54.3»; непонятное — как есть (сервер скажет, что не так). */
export function areaStr(s: string): string | null {
  if (!s) return null;
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:м2|м²|кв\.? ?м\.?)?$/i);
  return m ? m[1] : s;
}
/** Комнаты: «2», «2к», «2-комн.», «евро-2», «2Е» → «2»; «студия», «ст» → «0»; непонятное — как есть. */
export function roomsStr(s: string): string | null {
  const t = low(s);
  if (!t) return null;
  if (/^(студия|ст\.?|с)$/.test(t)) return '0';
  const m = t.match(/^(?:евро-?)?(\d{1,2})\s*(?:к|-?к\.?|-?комн\.?|-?комнатная|е|е-?к)?$/);
  return m ? String(Number(m[1])) : s;
}

const TOTAL = /^(итого|всего)/i;
/**
 * Строки загрузки из листа: после заголовка; пустые и «Итого» — пропуск; пустой корпус / секция / этаж — значение выше
 * («лесенка», объединённые ячейки), новое значение уровня сбрасывает нижние. Без столбца корпуса — defaultObject.
 * Номер строки — как в Excel. Без столбца «Стр. №» номер помещения-числа и есть строительный.
 */
export function sheetRows(sheet: SheetData, header: PlaceHeader, defaultObject: string | null): ImportRow[] {
  const col = (role: PlaceRole): number => header.roles.indexOf(role);
  const c = { object: col('object'), section: col('section'), floor: col('floor'), name: col('name'),
    build_no: col('build_no'), bti_no: col('bti_no'), area: col('area'), rooms: col('rooms') };
  const used = Object.values(c).filter((i) => i >= 0);
  const out: ImportRow[] = [];
  let obj: string | null = defaultObject, sec: string | null = null, flr: string | null = null;
  for (let r = header.row + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] || [];
    const get = (i: number): string => (i >= 0 ? cellStr(row[i]) : '');
    if (used.every((i) => !get(i))) continue;
    if (row.some((v) => typeof v === 'string' && TOTAL.test(v.trim()))) continue;
    if (c.object >= 0 && get(c.object)) { const v = placeName('object', get(c.object)); if (v !== obj) { obj = v; sec = null; flr = null; } }
    if (c.section >= 0 && get(c.section)) { const v = placeName('section', get(c.section)); if (v !== sec) { sec = v; flr = null; } }
    if (c.floor >= 0 && get(c.floor)) flr = placeName('floor', get(c.floor));
    const rawName = get(c.name);
    out.push({
      row_no: r + 1, object: obj, section: sec, floor: flr, name: placeName('name', rawName),
      build_no: c.build_no >= 0 ? noStr(get(c.build_no)) : num(rawName),
      bti_no: noStr(get(c.bti_no)), area: areaStr(get(c.area)), rooms: roomsStr(get(c.rooms))
    });
  }
  return out;
}

export type RowStatus = 'new' | 'exists' | 'differs' | 'error';
/** Статус строки по ответу сервера и подпись «что не так». */
export function rowStatus(res: ImportResult, rowNo: number): { status: RowStatus; note: string } {
  const e = res.errors.find((x) => x.row_no === rowNo);
  if (e) return { status: 'error', note: e.msg };
  const d = res.differs.find((x) => x.row_no === rowNo);
  if (d) return { status: 'differs', note: 'Уже есть, в файле иначе: ' + d.fields.map((f) => `${FIELD[f.field]} сейчас ${shown(f.now)}, в файле ${shown(f.file)}`).join('; ') + ' — не меняется' };
  if (res.existingRows.includes(rowNo)) return { status: 'exists', note: 'Уже есть' };
  return { status: 'new', note: '' };
}
const FIELD: Record<string, string> = { build_no: 'стр. №', bti_no: '№ БТИ', area: 'площадь', rooms: 'комнат' };
const shown = (v: string | number | null): string => (v === null || v === '' ? '—' : String(v).replace('.', ','));

const plural = (n: number, one: string, few: string, many: string): string => {
  const m10 = n % 10, m100 = n % 100;
  return `${n} ${m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many}`;
};
/** «Будет создано: 1 корпус, 2 секции, 24 этажа, 192 помещения» (пустые части не пишутся; ничего — «ничего нового»). */
export function createdText(c: ImportResult['created']): string {
  const parts = [c.objects ? plural(c.objects, 'корпус', 'корпуса', 'корпусов') : '', c.sections ? plural(c.sections, 'секция', 'секции', 'секций') : '',
    c.floors ? plural(c.floors, 'этаж', 'этажа', 'этажей') : '', c.apartments ? plural(c.apartments, 'помещение', 'помещения', 'помещений') : '']
    .filter(Boolean);
  return parts.length ? parts.join(', ') : 'ничего нового';
}
export const createdTotal = (c: ImportResult['created']): number => c.objects + c.sections + c.floors + c.apartments;

/** Шаблон «Список помещений.xlsx»: заголовок + строки-примеры (ExcelJS лениво). */
export function buildTemplate(): Promise<Uint8Array> {
  type R = (string | number | null)[];
  return buildRegistryXlsx<R>('Список помещений', TEMPLATE_LABELS.map((label, i) => ({ id: String(i), label, value: (r: R) => r[i] ?? null })),
    TEMPLATE_EXAMPLE);
}
