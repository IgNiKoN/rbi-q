/**
 * Статусы записи факта на экране (P2-0020, вынесено из vor/PositionsRegistry.ts — одно место для «Позиций», «Ждёт подтверждения»
 * и «Журнала»): подпись и тон палитры реестра; запись → строка ленты «История» (решение РП — «Ждёт РП → Принято / Отклонено»).
 */
import type { HistoryItem, Status } from '../../../platform/ui/index.ts';
import type { FactHistoryRow, FactStatus } from './fact.service.ts';
import { fmtPeriod, fmtQty } from './fact.ts';
import { ruDate } from '../ks2/form.ts';

export const FACT_LABEL: Record<FactStatus, { label: string; tone: Status }> = {
  accepted: { label: 'Принято', tone: 'green' }, pending_approval: { label: 'Ждёт РП', tone: 'blue' },
  rejected: { label: 'Отклонено', tone: 'red' }, superseded: { label: 'Заменено', tone: 'grey' },
};
export const FACT_STATUS_ORDER: FactStatus[] = ['pending_approval', 'accepted', 'rejected', 'superseded'];
/** Пометка записи «Закрыть через РП» (миграция 027) — начало пометки. */
export const VIA_PM_NOTE = 'Закрытие через РП';
export const isViaPm = (note: string | null): boolean => String(note || '').startsWith(VIA_PM_NOTE);

/** Запись факта → строка ленты: решение РП — «Ждёт РП → Принято / Отклонено», замена — «Принято → Заменено». */
export function historyItem(e: FactHistoryRow, unit: string): HistoryItem {
  const decided = !!e.decided_at;
  const from = e.status === 'superseded' ? FACT_LABEL.accepted : decided && (e.status === 'accepted' || e.status === 'rejected') ? FACT_LABEL.pending_approval : null;
  const parts = [`${fmtQty(e.qty)} ${unit}`, e.brigade_name, e.period_from ? fmtPeriod(e.period_from, e.work_date) : `за ${ruDate(e.work_date)}`];   // P2-0022: запись «за период»
  if (e.correction_reason) parts.push(`исправление: ${e.correction_reason}`);
  if (e.note) parts.push(e.note);
  return {
    id: e.id, when: ruDate((decided ? e.decided_at! : e.created_at).slice(0, 10)), who: decided ? e.decided_by_email : e.created_by_email,
    text: parts.join(' · '), from, to: FACT_LABEL[e.status], note: e.decision_note ? `Решение: ${e.decision_note}` : null,
  };
}
