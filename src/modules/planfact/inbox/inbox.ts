/**
 * P2-0021: «Требует моего участия» — данные страницы (pf_my_inbox) и сигнал «изменилось» для красных точек меню.
 * Точки рисует обёртка модуля js/modules/planfact/index.js (сразу после входа, без загрузки бандла — решение владельца 24.10.2026);
 * модуль после своего действия (решение РП, исправление, ввод факта, акт КС-2) шлёт INBOX_CHANGED_EVENT — обёртка перечитывает числа.
 */
import { useEffect, useState } from 'react';
import type { InboxRow, SummaryApi } from '../summary/summary.service.ts';

/** Событие модуля: своё действие изменило то, что ждёт человека. Слушает обёртка модуля (точки) и страница «Входящие». */
export const INBOX_CHANGED_EVENT = 'planfact:inbox-changed';

const v = (n: number | null): number => (n && n > 0 ? n : 0);

/** «Дела» объекта (то же, что идёт в точку): ждёт подтверждения + мои отклонённые + черновики КС-2. */
export function rowTasks(r: InboxRow): number {
  return v(r.pending) + v(r.my_rejected) + v(r.ks2_drafts);
}

/** Сообщить, что числа надо перечитать (после своего действия). */
export function notifyInboxChanged(): void {
  window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));
}

/** Обёртка сервиса: после успешного действия из names — notifyInboxChanged() (экраны модуля не меняются). */
export function withInboxRefresh<T extends object>(api: T | null, names: (keyof T)[]): T | null {
  if (!api) return api;
  const out = { ...api } as T;
  for (const k of names) {
    const fn = api[k];
    if (typeof fn !== 'function') continue;
    (out as Record<keyof T, unknown>)[k] = async (...args: unknown[]) => {
      const r = await (fn as (...a: unknown[]) => Promise<{ ok?: boolean }>).apply(api, args);
      if (r && r.ok) notifyInboxChanged();
      return r;
    };
  }
  return out;
}

/** Строки страницы «Входящие»: читаются при показе (enabled) и по INBOX_CHANGED_EVENT. null — ещё нет; error — текст ошибки. */
export function useInboxRows(api: SummaryApi | null | undefined, enabled: boolean): { rows: InboxRow[] | null; error: string } {
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!api || !enabled) return undefined;
    let alive = true; let seq = 0;
    const load = async (): Promise<void> => {
      const my = ++seq;
      const r = await api.inbox();
      if (!alive || my !== seq) return;
      if (r.ok) { setRows(r.value); setError(''); } else setError(r.message);
    };
    void load();
    const on = (): void => { void load(); };
    window.addEventListener(INBOX_CHANGED_EVENT, on);
    return () => { alive = false; window.removeEventListener(INBOX_CHANGED_EVENT, on); };
  }, [api, enabled]);
  return { rows, error };
}
