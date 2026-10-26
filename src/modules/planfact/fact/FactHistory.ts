/**
 * История факта по позиции (P2-0007): все записи — принятые, ждущие РП, отклонённые и заменённые — кто, когда, почему.
 * Исправление — новой записью с обязательной причиной; «Отменить запись» = исправление на 0. Старая запись не удаляется.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { FactApi, FactHistoryRow, FactPosition, FactStatus } from './fact.service.ts';
import { fmtPeriod, fmtQty, parseQty } from './fact.ts';

const STATUS: Record<FactStatus, string> = { accepted: 'Принято', pending_approval: 'Ждёт РП', rejected: 'Отклонено', superseded: 'Заменено' };
export const fmtWhen = (iso: string): string => { try { return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; } };
const fmtDate = (d: string): string => { try { return new Date(d + 'T00:00:00').toLocaleDateString('ru-RU'); } catch { return d; } };

export function FactHistory(props: { api: FactApi; pos: FactPosition; me: string; canApprove: boolean; canCreate: boolean; onClose: () => void; onChanged: () => void }): ReactElement {
  const { api, pos, me, canApprove, canCreate, onClose, onChanged } = props;
  const [rows, setRows] = useState<FactHistoryRow[] | null>(null);
  const [editId, setEditId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function load(): Promise<void> {
    const r = await api.history(pos.position_id);
    if (r.ok) setRows(r.value); else { setRows([]); setError(r.message); }
  }
  useEffect(() => { void load(); }, [pos.position_id]);

  const canEdit = (e: FactHistoryRow): boolean => (e.status === 'accepted' || e.status === 'pending_approval')
    && !(rows || []).some((x) => x.corrects_id === e.id && (x.status === 'accepted' || x.status === 'pending_approval'))
    && (canApprove || (canCreate && e.created_by_email === me));

  async function correct(ev: FormEvent, e: FactHistoryRow, cancel: boolean): Promise<void> {
    ev.preventDefault();
    if (busy) return;
    const f = (ev.currentTarget as HTMLElement).closest('form') as HTMLFormElement;
    const reason = (f.elements.namedItem('reason') as HTMLInputElement).value.trim();
    const qty = cancel ? 0 : parseQty((f.elements.namedItem('qty') as HTMLInputElement).value);
    if (qty === null || (!cancel && qty <= 0)) { setError('Введите объём больше нуля или нажмите «Отменить запись»'); return; }
    if (!reason) { setError('Укажите причину исправления'); return; }
    setBusy(true); setError(''); setNotice('');
    const r = await api.correct(e.id, qty, reason);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setEditId('');
    setNotice(cancel ? 'Запись отменена, она осталась в истории' : r.value.status === 'pending_approval' ? 'Исправление больше допуска — ждёт подтверждения РП' : 'Исправлено, прежняя запись осталась в истории');
    await load(); onChanged();
  }

  return h('div', { className: 'pf-card ft-sheet', 'data-testid': 'ft-history' },
    h('div', { className: 'ft-sheet-head' }, h('b', null, `История: ${pos.work_name}`),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: onClose, 'data-testid': 'ft-history-close' }, 'Закрыть')),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { className: 'pj-notice', role: 'status' }, notice) : null,
    rows === null ? h('div', { className: 'pf-muted' }, 'Загрузка…')
    : !rows.length ? h('div', { className: 'pf-muted' }, 'Записей пока нет.')
    : rows.map((e) => h('div', { key: e.id, className: 'ft-hrow ft-hrow--' + e.status, 'data-entry-id': e.id, 'data-status': e.status },
        h('div', { className: 'ft-hmain' },
          h('span', { className: 'ft-badge ft-badge--' + e.status }, STATUS[e.status]),
          h('b', null, `${fmtQty(e.qty)} ${pos.unit_code}`),
          h('span', { className: 'pf-muted', 'data-testid': 'ft-hdate' }, `${e.period_from ? fmtPeriod(e.period_from, e.work_date) : fmtDate(e.work_date)} · ${e.brigade_name}${e.workers ? ` · ${e.workers} чел.` : ''}${e.man_hours ? ` · ${fmtQty(e.man_hours)} чел.-ч` : ''}`)),
        h('div', { className: 'ft-hmeta pf-muted' },
          `${e.created_by_email || '—'}, ${fmtWhen(e.created_at)}`,
          e.batch_id ? ' · закрытие пачкой' : '',
          e.corrects_id ? ` · исправление: ${e.correction_reason || ''}` : '',
          e.note ? ` · ${e.note}` : ''),
        e.status === 'superseded' && e.decision_note ? h('div', { className: 'ft-hmeta pf-muted' }, `Заменено${e.decided_by_email ? ` (${e.decided_by_email})` : ''}: ${e.decision_note}`) : null,
        e.status === 'rejected' ? h('div', { className: 'ft-hmeta ft-bad' }, `Отклонено${e.decided_by_email ? ` (${e.decided_by_email})` : ''}: ${e.decision_note || ''}`) : null,
        canEdit(e)
          ? (editId === e.id
              ? h('form', { className: 'ft-edit', onSubmit: (ev: FormEvent) => { void correct(ev, e, false); }, 'data-testid': 'ft-correct-form' },
                  h('label', { className: 'pf-field' }, 'Новый объём', h('input', { name: 'qty', type: 'text', inputMode: 'decimal', className: 'pj-input pf-num', defaultValue: String(e.qty).replace('.', ',') })),
                  h('label', { className: 'pf-field pj-grow' }, 'Причина', h('input', { name: 'reason', type: 'text', className: 'pj-input', maxLength: 300 })),
                  h('span', { className: 'pj-actions' },
                    h('button', { type: 'submit', className: 'pf-btn', disabled: busy, 'data-testid': 'ft-correct-save' }, 'Исправить'),
                    h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy, 'data-testid': 'ft-correct-cancel', onClick: (ev) => { void correct(ev as unknown as FormEvent, e, true); } }, 'Отменить запись'),
                    h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setEditId('') }, 'Назад')))
              : h('button', { type: 'button', className: 'pf-btn pf-btn--ghost ft-small', 'data-testid': 'ft-correct', onClick: () => { setEditId(e.id); setError(''); } }, 'Исправить'))
          : null)));
}
