/**
 * P2-0070: кнопки Стройконтроля 2.0 — по действию роли в области участия в проекте. Правило — одно на платформу:
 * js/services/sync/sync-access.policy.js → canAct (зеркало серверного core.row_allowed, миграция 052).
 * Без входа почтой (старый вход по PIN — «кто я» нет) — прежний признак экрана (роль профиля); запись всё равно проверит сервер.
 */

type Decision = { ok: boolean; reason?: string };
type SyncAccess = {
  deviceMe?: () => unknown;
  kindOf?: (k: string) => unknown;
  canAct?: (rec: unknown, kind: unknown, me: unknown, action: string) => Decision;
};

/** Подписи действий для отказа на экране без сети — копия подписей каталога сервера (core.permission_catalog.label, 052);
 *  сервер отвечает тем же текстом. Сверяет unit-тест rights.test.ts с миграцией. */
export const ACTION_LABELS: Record<string, string> = {
  'construction.defects.create': 'Выдать замечание',
  'construction.defects.assign': 'Назначить подрядчика и срок',
  'construction.defects.start': 'Взять замечание в работу',
  'construction.defects.fix': 'Отметить «Устранено»',
  'construction.defects.close': 'Закрыть замечание',
  'construction.defects.reject': 'Вернуть замечание на доработку',
  'construction.defects.delete': 'Удалить замечание',
  'construction.acceptance.book': 'Записаться на приёмку',
  'construction.acceptance.schedule': 'Подтвердить или перенести время приёмки',
  'construction.acceptance.conduct': 'Провести приёмку',
  'construction.transfer.edit': 'Вести передачу квартир'
};

function access(): SyncAccess | null {
  const w = (typeof window !== 'undefined' ? window : globalThis) as unknown as { RbiSyncAccess?: SyncAccess };
  return w.RbiSyncAccess || null;
}

/** Можно ли действие над записью (rec — замечание / заявка или черновик с locationId). null — «кто я» нет (вход по PIN). */
export function allowed(action: string, rec?: object | null): boolean | null {
  const A = access();
  if (!A?.deviceMe || !A.kindOf || !A.canAct) return null;
  const me = A.deviceMe();
  if (!me) return null;
  const kind = A.kindOf(action.startsWith('construction.acceptance.') ? 'acceptance_v2' : 'defect_v2');
  if (!kind) return null;
  return !!A.canAct(rec || {}, kind, me, action).ok;
}

/** Решение по действию; без «кто я» — прежний признак экрана legacy. */
export function can(action: string, rec: object | null | undefined, legacy: boolean): boolean {
  const a = allowed(action, rec);
  return a === null ? legacy : a;
}

/** Текст отказа на экране: «Нет права «Закрыть замечание»». */
export function noRightText(action: string): string {
  return 'Нет права «' + (ACTION_LABELS[action] || action) + '»';
}
