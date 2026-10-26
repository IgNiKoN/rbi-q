/**
 * Сводка (P2-0008, P2-0010): подписи светофора (ТЗ 8.2) и причин, вердикт темпа, форматирование. Чисел не считает — всё приходит с сервера (summary_project).
 */
import type { Light, LightReason, PaceVerdict, SummaryProject } from './summary.service.ts';
import { money } from '../estimate/prices.ts';
import { ruDate } from '../ks2/form.ts';
import { daysBetween } from '../../../platform/ui/format.ts';
import type { Status } from '../../../platform/ui/primitives.ts';

export const LIGHT_LABEL: Record<Light, string> = { green: 'В срок', yellow: 'Риск', red: 'Отставание', grey: 'Нет данных' };

/** Пояснение к светофору (правило ТЗ 8.2, пороги объекта): почему серый / что значит цвет. Числа — с сервера. */
export function lightText(p: Pick<SummaryProject, 'light' | 'light_reason' | 'lag_pp' | 'lag_days' | 'light_yellow_pp' | 'light_red_pp' | 'light_overdue_days'>): string {
  const r: LightReason = p.light_reason;
  const pp = p.lag_pp !== null ? `${num(p.lag_pp)} п.п.` : '';
  const dd = p.lag_days !== null ? `${num(p.lag_days)} дн.` : '';
  if (r === 'no_kp') return 'Нет договорной КП — выберите её в разделе «КС-2»';
  if (r === 'no_prices') return 'В договорной КП нет цен — готовность по деньгам не считается';
  if (r === 'no_dates') return 'Укажите плановые даты начала и окончания проекта';
  if (r === 'done') return 'Всё по ВОР выполнено';
  if (r === 'lag_red') return `Отставание ${pp || 'от плана'} — больше красного порога ${num(p.light_red_pp)} п.п.`;
  if (r === 'overdue') return 'Плановая дата окончания прошла, а выполнено меньше 100 %';
  if (r === 'finish_near') return `До окончания не больше 5 рабочих дней, отставание больше ${num(p.light_yellow_pp)} п.п.`;
  if (r === 'lag_yellow') return `Отставание ${pp || 'от плана'} — между порогами ${num(p.light_yellow_pp)} и ${num(p.light_red_pp)} п.п.`;
  if (r === 'lag_days') return `Отставание ${dd || 'в днях'} — не меньше порога ${p.light_overdue_days} дн.`;
  return `В графике: отставание не больше ${num(p.light_yellow_pp)} п.п. и меньше ${p.light_overdue_days} дн.`;
}

export const VERDICT_LABEL: Record<PaceVerdict, string> = { faster: 'Ускоряемся', slower: 'Замедляемся', steady: 'Темп ровный' };
/** Вердикт темпа (сервер: темп 7 дней против 14 дней, допуск ±10 %). */
export const verdictText = (v: PaceVerdict | null): string => (v ? VERDICT_LABEL[v] : 'За 14 дней нет выполнения');
/** Отставание в днях (D по ТЗ §9) — целое число дней; опережение — «опережаем на N дн.». */
export function lagDaysText(d: number | null): string {
  if (d === null) return '—';
  const v = Math.round(d);
  return v > 0 ? `${v.toLocaleString('ru-RU')} дн.` : v < 0 ? `опережаем на ${(-v).toLocaleString('ru-RU')} дн.` : 'нет';
}
const num = (v: number): string => v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

export const rub = (v: number | null): string => (v === null ? '—' : `${money(v)} ₽`);
export const rubDay = (v: number | null): string => (v === null ? '—' : `${money(v)} ₽/дн.`);
export const dateOr = (d: string | null, empty = '—'): string => (d ? ruDate(d) : empty);
export const pctText = (v: number | null): string => (v === null ? '—' : `${v.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %`);

/* ── P2-0019: статус позиции ВОР для реестра, карточки и выгрузки (единый источник) ── */
export type PositionState = 'not_started' | 'in_work' | 'pending' | 'rejected' | 'done';
/** Темп к сроку объекта: done — выполнено; no_finish — нет срока объекта; past — срок прошёл; late — не успевает; ok — успевает; no_pace — за 14 дней нет факта, до срока ≥ 14 дней. */
export type PositionPace = 'done' | 'no_finish' | 'past' | 'late' | 'ok' | 'no_pace';
export interface PositionStatus {
  state: PositionState; label: string; tone: Status;
  /** Шаг процесса «Не начато → В работе → Выполнено» (по факту); «Ждёт РП» — отдельно (pending). */
  step: 'not_started' | 'in_work' | 'done'; pending: boolean;
  overdue: boolean; pace: PositionPace; paceText: string;
}
export const POSITION_STATE_LABEL: Record<PositionState, string> = { not_started: 'Не начато', in_work: 'В работе', pending: 'Ждёт РП', rejected: 'Отклонено', done: 'Выполнено' };
/** Палитра реестра (DESIGN_SYSTEM): красный — просрочено / отклонено, оранжевый (токен yellow) — в работе, синий — ждёт РП, зелёный — выполнено, серый — не начато. */
const STATE_TONE: Record<PositionState, Status> = { not_started: 'grey', in_work: 'yellow', pending: 'blue', rejected: 'red', done: 'green' };
export const PACE_WINDOW_DAYS = 14;

export interface PositionNumbers { plan_qty: number; fact_qty: number; fact14: number; pending_qty: number; pending_count?: number; last_rejected_note?: string | null }

/**
 * Статус позиции и «просрочено по темпу» (решение владельца 23.10.2026): позиция не выполнена и при темпе последних 14 дней
 * (fact14 / 14 в день) не успевает к плановому окончанию объекта; срок прошёл, позиция не выполнена — тоже просрочена.
 * Темп 0: до срока меньше 14 дней — просрочена, иначе «нет темпа» (серый). Без срока объекта «просрочено» не считается.
 * Числа — как пришли с сервера (pf_summary_positions, pf_fact_positions); здесь только правило.
 */
export function positionStatus(p: PositionNumbers, ctx: { today: string; plannedFinish: string | null }): PositionStatus {
  const rest = Math.max(0, p.plan_qty - p.fact_qty);
  const done = p.plan_qty > 0 ? rest <= 1e-9 : p.fact_qty > 0;
  const pending = p.pending_qty > 0 || (p.pending_count || 0) > 0;
  const step = done ? 'done' : p.fact_qty > 0 ? 'in_work' : 'not_started';
  const state: PositionState = pending ? 'pending' : done ? 'done' : p.last_rejected_note ? 'rejected' : step;
  let pace: PositionPace; let overdue = false; let paceText: string;
  if (done) { pace = 'done'; paceText = 'Выполнено'; }
  else if (!ctx.plannedFinish) { pace = 'no_finish'; paceText = 'Нет срока объекта — «просрочено» не считается'; }
  else {
    const left = daysBetween(ctx.today, ctx.plannedFinish);
    const rate = p.fact14 / PACE_WINDOW_DAYS;
    if (left < 0) { pace = 'past'; overdue = true; paceText = `Срок объекта прошёл (${ruDate(ctx.plannedFinish)}), позиция не выполнена`; }
    else if (rate > 0) {
      const need = Math.ceil(rest / rate - 1e-9);
      overdue = need > left;
      pace = overdue ? 'late' : 'ok';
      paceText = overdue ? `При темпе 14 дней нужно ещё ${need} дн., до срока ${left} дн.` : `Успевает: нужно ${need} дн., до срока ${left} дн.`;
    } else if (left < PACE_WINDOW_DAYS) { pace = 'late'; overdue = true; paceText = `За 14 дней нет факта, до срока ${left} дн.`; }
    else { pace = 'no_pace'; paceText = `Нет темпа: за 14 дней нет факта, до срока ${left} дн.`; }
  }
  const tone: Status = state === 'pending' || state === 'done' || state === 'rejected' ? STATE_TONE[state] : overdue ? 'red' : STATE_TONE[state];
  return { state, label: POSITION_STATE_LABEL[state], tone, step, pending, overdue, pace, paceText };
}

/** Прогноз окончания вида работ / позиции (P2-0022): числа — с сервера (030: planfact.forecast — формула ТЗ §9, темп за 14 дней);
 *  здесь только подписи и цвет. Δ > 0 — позже финиша объекта (красным). % отклонения = план % на сегодня − факт %:
 *  больше порога объекта «красный» — красная заливка, больше «жёлтого» — жёлтая (те же пороги, что светофор объекта). */
export interface ForecastNumbers { plan: number; fact: number; forecast_finish: string | null; delta_days: number | null; dev_pp: number | null }
export interface ForecastView { finish: string; noPace: boolean; delta: string; late: boolean; dev: string; devTone: Status | null }
export function forecastView(x: ForecastNumbers, th: { yellow: number; red: number }): ForecastView {
  const done = x.plan > 0 && x.fact >= x.plan - 1e-9;
  const noPace = x.plan > 0 && !done && !x.forecast_finish;
  const finish = !(x.plan > 0) ? '—' : done ? 'выполнено' : noPace ? 'нет темпа' : ruDate(x.forecast_finish!);
  const d = x.delta_days;
  const delta = d === null ? '—' : d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : '0';
  const v = x.dev_pp;
  const dev = v === null ? '—' : v > 0 ? `отставание ${num(v)} %` : v < 0 ? `опережение ${num(-v)} %` : 'по плану';
  const devTone: Status | null = v === null ? null : v > th.red ? 'red' : v > th.yellow ? 'yellow' : null;
  return { finish, noPace, delta, late: d !== null && d > 0, dev, devTone };
}
