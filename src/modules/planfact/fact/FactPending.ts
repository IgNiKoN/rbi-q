/**
 * Решение РП по одной записи (P2-0007; с P2-0020 — в карточке реестра «Ждёт подтверждения»): «Подтвердить» (запись входит в итог)
 * или «Отклонить» с причиной (прораб видит причину). pf_fact_decide; право planfact.fact.approve проверяет сервер.
 */
import { createElement as h, useState } from 'react';
import type { ReactElement } from 'react';
import type { FactApi } from './fact.service.ts';

export function PendingDecision(props: { api: FactApi; entryId: string; onDone: (message: string) => void }): ReactElement {
  const { api, entryId, onDone } = props;
  const [reject, setReject] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function decide(approve: boolean): Promise<void> {
    if (busy) return;
    if (!approve && !note.trim()) { setError('Напишите причину отказа'); return; }
    setBusy(true); setError('');
    const r = await api.decide(entryId, approve, approve ? '' : note.trim());
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setReject(false); setNote('');
    onDone(approve ? 'Подтверждено — объём вошёл в итог' : 'Отклонено — прораб увидит причину');
  }

  return h('div', { className: 'ft-decide', 'data-testid': 'ft-decide' },
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    reject
      ? h('div', { className: 'ft-edit' },
          h('label', { className: 'pf-field pj-grow' }, 'Причина отказа', h('input', { type: 'text', className: 'pj-input', value: note, maxLength: 300, 'data-testid': 'ft-reject-note', onChange: (ev) => setNote((ev.target as HTMLInputElement).value) })),
          h('span', { className: 'pj-actions' },
            h('button', { type: 'button', className: 'pf-btn un-danger', disabled: busy, 'data-testid': 'ft-reject-yes', onClick: () => { void decide(false); } }, 'Отклонить'),
            h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => { setReject(false); setNote(''); setError(''); } }, 'Назад')))
      : h('span', { className: 'pj-actions' },
          h('button', { type: 'button', className: 'pf-btn', disabled: busy, 'data-testid': 'ft-approve', onClick: () => { void decide(true); } }, 'Подтвердить'),
          h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy, 'data-testid': 'ft-reject', onClick: () => { setReject(true); setError(''); } }, 'Отклонить')));
}
