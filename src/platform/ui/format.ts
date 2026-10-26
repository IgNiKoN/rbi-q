/** Форматы чисел для подписей графиков дизайн-системы (P2-0010): короткие суммы «1,57 млн», даты «22.10». Только отображение. */
const nf = (d: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: 0 });

/** Короткая сумма: 1 565 152 → «1,57 млн», 156 658 → «157 тыс.», 950 → «950». */
export function compactNumber(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${nf(2).format(v / 1e9)} млрд`;
  if (a >= 1e6) return `${nf(2).format(v / 1e6)} млн`;
  if (a >= 1e4) return `${nf(0).format(v / 1e3)} тыс.`;
  return nf(0).format(v);
}
export const compactRub = (v: number | null): string => (v === null ? '—' : `${compactNumber(v)} ₽`);

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
/** ISO-дата → «22.10» */
export function dayMonth(iso: string): string { return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`; }
/** ISO-дата → «окт» (январь — с годом: «янв 27») */
export function monthLabel(iso: string): string {
  const m = Number(iso.slice(5, 7)) - 1;
  return m === 0 ? `${MONTHS[0]} ${iso.slice(2, 4)}` : MONTHS[m];
}
/** Дни между ISO-датами (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
}
/** «Красивый» шаг шкалы: 1, 2, 2,5, 5 × 10ⁿ, не меньше max / ticks. */
export function niceStep(max: number, ticks = 4): number {
  if (!(max > 0)) return 1;
  const raw = max / ticks;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= raw) return k * p;
  return 10 * p;
}
