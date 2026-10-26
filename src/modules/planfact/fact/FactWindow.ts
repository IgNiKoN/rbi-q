/**
 * Окно факта по позиции (P2-0022) для «Факт → Ввод»: та же форма, что в «Шахматке» (FactEntryForm, режим quick: «−/+», плитки
 * «до 25/50/75/100 %», «Внесено / Осталось», «День / Период», «История»). На телефоне — шторка снизу, на ПК — панель справа.
 * Запись, допуск перебора и права — на сервере (FactApi.add); здесь только показ.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { Brigade, FactApi, FactPosition } from './fact.service.ts';
import { FactEntryForm } from './FactEntryForm.ts';
import { FactHistory } from './FactHistory.ts';

export function FactWindow(props: {
  api: FactApi; pos: FactPosition; place: string; brigades: Brigade[]; lastBrigade: string; onBrigade: (id: string) => void;
  me: string; canCreate: boolean; canApprove: boolean; onClose: () => void; onSaved: (msg: string) => void; onChanged: () => void;
}): ReactElement {
  const { api, pos, place, onClose } = props;
  const [count, setCount] = useState<number | null>(null);
  const [history, setHistory] = useState(false);
  useEffect(() => { void api.history(pos.position_id).then((r) => setCount(r.ok ? r.value.length : null)); }, [pos.position_id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return h('div', { className: 'ft-win-wrap' },
    h('div', { className: 'ft-win-backdrop', onClick: onClose, 'aria-hidden': 'true', 'data-testid': 'ft-win-backdrop' }),
    h('div', { className: 'pf-card ft-win', role: 'dialog', 'aria-modal': 'true', 'aria-label': pos.work_name, 'data-testid': 'ft-win' },
      h('div', { className: 'ft-sheet-head' },
        h('div', { className: 'ft-win-title' }, h('b', null, pos.work_name), place ? h('span', { className: 'pf-muted' }, place) : null),
        h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'ft-win-close', onClick: onClose }, 'Закрыть')),
      history
        ? h(FactHistory, { api, pos, me: props.me, canApprove: props.canApprove, canCreate: props.canCreate, onClose: () => setHistory(false), onChanged: props.onChanged })
        : props.canCreate
          ? h(FactEntryForm, { api, pos, brigades: props.brigades, lastBrigade: props.lastBrigade, onBrigade: props.onBrigade, onCancel: onClose, onSaved: props.onSaved,
              quick: { historyCount: count, onHistory: () => setHistory(true) } })
          : null));
}

export const FACT_WINDOW_CSS = `
.ft-win-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:1190}
.ft-win{position:fixed;left:0;right:0;bottom:0;z-index:1200;display:flex;flex-direction:column;gap:10px;max-height:88vh;overflow-y:auto;padding:12px 14px calc(14px + env(safe-area-inset-bottom,0px));border-radius:16px 16px 0 0;box-shadow:0 -6px 24px rgba(0,0,0,.25)}
.ft-win-title{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
.ft-win-title .pf-muted{font-size:12px}
@media (min-width:900px){.ft-win{left:auto;top:0;bottom:0;width:440px;max-height:none;border-radius:16px 0 0 16px;box-shadow:-6px 0 24px rgba(0,0,0,.25)}}
`;
