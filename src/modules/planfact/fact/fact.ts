/**
 * Расчёты экрана «Факт» (P2-0007): процент выполнения, остаток, разбивка «закрыть этаж целиком».
 * Накопленный факт и план приходят с сервера (pf_fact_positions — единый расчёт Σ принятых записей); здесь только отображение
 * и подготовка пачки. Чистые функции — без обращения к серверу и DOM.
 */

/** Округление объёма до 3 знаков (как на сервере). */
export const round3 = (v: number): number => Math.round((v + Number.EPSILON) * 1000) / 1000;

/** Процент выполнения (факт / план). План 0 или меньше → 0. Один знак после запятой. */
export function percent(fact: number, plan: number): number {
  if (!(plan > 0) || !(fact > 0)) return 0;
  return Math.round((fact / plan) * 1000) / 10;
}

/** Остаток до плана (не меньше 0), 3 знака. */
export const remainder = (plan: number, fact: number): number => Math.max(0, round3(plan - fact));

/** Число для показа: пробел-разделитель тысяч, запятая, без лишних нулей (до 3 знаков). */
export function fmtQty(v: number): string {
  return round3(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}
export const fmtPct = (v: number): string => v.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' %';

/** Разбор введённого объёма: «12,5» / «12.5» → 12.5; пусто или не число → null. */
export function parseQty(text: string): number | null {
  const s = String(text ?? '').replace(/\s/g, '').replace(',', '.');
  if (s === '' || !/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? round3(n) : null;
}

export interface FloorItem { id: string; unit: string; plan: number; fact: number }
export type FloorMode = { kind: 'remainder' } | { kind: 'percent'; pct: number };

/**
 * Разбивка «закрыть этаж/секцию целиком»: объём каждой позиции пачки.
 *  · remainder — «100 % этажа»: остаток каждой позиции (план − факт);
 *  · percent X — X % от плана каждой позиции.
 * Позиции с разными ЕИ не суммируются: в режиме percent каждая группа по ЕИ имеет заданный итог round3(Σ план × X / 100),
 * разница округлений уходит в последнюю позицию группы — Σ объёмов группы всегда равна заданному.
 */
export function splitFloor(items: FloorItem[], mode: FloorMode): Record<string, number> {
  const out: Record<string, number> = {};
  if (mode.kind === 'remainder') {
    for (const it of items) out[it.id] = remainder(it.plan, it.fact);
    return out;
  }
  const k = Math.max(0, mode.pct) / 100;
  const groups = new Map<string, FloorItem[]>();
  for (const it of items) groups.set(it.unit, [...(groups.get(it.unit) || []), it]);
  for (const list of groups.values()) {
    const target = round3(list.reduce((s, it) => s + it.plan, 0) * k);
    let acc = 0;
    list.forEach((it, i) => {
      if (i === list.length - 1) { out[it.id] = round3(Math.max(0, target - acc)); return; }
      const q = round3(it.plan * k);
      out[it.id] = q;
      acc = round3(acc + q);
    });
  }
  return out;
}

/** Итог по ЕИ для строки «Итого» перед отправкой пачки: ЕИ → Σ объёма. */
export function sumByUnit(rows: { unit: string; qty: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.unit] = round3((out[r.unit] || 0) + r.qty);
  return out;
}

/** Сегодняшняя дата (Москва) в формате YYYY-MM-DD — та же граница «не в будущем», что на сервере. */
export function todayMoscow(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Запись «за период» (P2-0022): не больше 31 дня включительно — то же правило, что на сервере (030). */
export const PERIOD_MAX_DAYS = 31;

/** Дней между датами ГГГГ-ММ-ДД (b − a). */
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/** Проверка периода «с … по …» до отправки (сервер проверяет то же): '' — всё верно, иначе текст ошибки. */
export function periodError(from: string, to: string, today: string = todayMoscow()): string {
  if (!from || !to) return 'Укажите начало и конец периода';
  if (to > today) return 'Дата не может быть в будущем';
  if (from > to) return 'Начало периода позже конца';
  if (daysBetween(from, to) > PERIOD_MAX_DAYS - 1) return `Период — не больше ${PERIOD_MAX_DAYS} дня`;
  return '';
}

/** «за период 11.10–24.10» для записи с началом периода; запись за день — ''. */
export function fmtPeriod(from: string | null | undefined, to: string): string {
  if (!from) return '';
  const dm = (d: string): string => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  return `за период ${dm(from)}–${dm(to)}`;
}

/** Строка ВОР, нужная для подсказки (номер, тип, наименование). */
export interface HintRow { row_no: number; kind: string; number: string | null; name: string | null; context?: { note?: string } | null }
/** Позиция ВОР: из какой строки какой загрузки. */
export interface HintPosition { id: string; import_id: string; source_row_no: number | null }

/** Подсказка к позиции факта: «№ 21.2 · Двери» — номер строки заказчика и ближайший раздел над ней (P2-0009, К3:
 *  одинаковые наименования на одном месте иначе не различить). Пояснение строки Номенклатуры (P2-0012) — в конце: «… · гипсовая, жилые».
 *  Позиции без строки — без подсказки. */
export function vorHints(positions: HintPosition[], rowsByImport: Map<string, HintRow[]>): Map<string, string> {
  const out = new Map<string, string>();
  const index = new Map<string, Map<number, { number: string | null; group: string | null; note: string | null }>>();
  for (const [imp, rows] of rowsByImport) {
    const m = new Map<number, { number: string | null; group: string | null; note: string | null }>();
    let group: string | null = null;
    for (const r of [...rows].sort((a, b) => a.row_no - b.row_no)) {
      if (r.kind === 'group') group = String(r.name || '').replace(/^\s*[\d.]+\s*/, '').trim() || null;
      m.set(r.row_no, { number: r.number ? String(r.number).trim() : null, group, note: (r.context && r.context.note) || null });
    }
    index.set(imp, m);
  }
  for (const p of positions) {
    const r = p.source_row_no === null ? undefined : index.get(p.import_id)?.get(p.source_row_no);
    if (!r) continue;
    const label = [r.number ? `№ ${r.number}` : '', r.group || '', r.note || ''].filter(Boolean).join(' · ');
    if (label) out.set(p.id, label);
  }
  return out;
}
