/**
 * Действия реестра «ВОР → Позиции» (P2-0019): «Выгрузить в Excel» (выбранные или весь отфильтрованный список, видимые колонки),
 * «Закрыть выбранные» (факт = остаток каждой позиции, как обычный факт) и «Закрыть через РП» (то же, но всё ждёт подтверждения РП).
 * Закрытие — форма «Закрыть этаж» (FloorClose: бригада, дата, правка объёмов) → pf_fact_add_batch, больше 500 строк — частями.
 * Кнопки закрытия — только при праве planfact.fact.create (из pf_my_permissions) и не архивном объекте; отказ сервера показывается.
 */
import { createElement as h, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactElement, ReactNode } from 'react';
import { buildRegistryXlsx, registryFileName, saveXlsx } from '../../../platform/ui/index.ts';
import type { RegistryColumn } from '../../../platform/ui/index.ts';
import type { Brigade, FactApi, FactPosition } from '../fact/fact.service.ts';
import { FACT_CREATE } from '../fact/fact.service.ts';
import { FloorClose } from '../fact/FloorClose.ts';
import { readLast, writeLast } from '../fact/FactTab.ts';
import { todayMoscow } from '../fact/fact.ts';
import { ruDate } from '../ks2/form.ts';
import type { PositionRow, PositionsRegistryProps } from './PositionsRegistry.ts';

type Save = (bytes: Uint8Array, name: string) => void;

/** Строка реестра → позиция формы закрытия (план и накопленный факт — те же числа сервера). */
export const toFactPosition = (r: PositionRow): FactPosition => ({
  position_id: r.id, location_id: '', location_path: r.place, location_type: r.placeType, work_type_id: '', work_name: r.work, unit_code: r.unit,
  plan_qty: r.plan, fact_qty: r.fact, pending_qty: r.pendingQty, pending_count: r.pendingCount, last_rejected_note: r.rejectedNote,
});

async function exportRows(columns: RegistryColumn<PositionRow>[], rows: PositionRow[], save: Save): Promise<void> {
  const bytes = await buildRegistryXlsx('Позиции ВОР', columns, rows);
  save(bytes, registryFileName('Позиции ВОР', ruDate(todayMoscow())));
}

function SelectedActions(props: { fact: FactApi; rows: PositionRow[]; columns: RegistryColumn<PositionRow>[]; canClose: boolean; projectId: string; companyId: string;
  reload: () => Promise<void>; clear: () => void; notify: (msg: string) => void; save: Save }): ReactElement {
  const { fact, rows, columns, canClose, projectId, companyId } = props;
  const [mode, setMode] = useState<'' | 'close' | 'pm'>('');
  const [brigades, setBrigades] = useState<Brigade[] | null>(null);
  const [last, setLast] = useState(readLast(companyId));
  const [msg, setMsg] = useState('');
  const open = rows.filter((r) => r.rest > 0);   // выполненные в пачку не попадают
  useEffect(() => { if (mode && brigades === null) void fact.listBrigades(companyId, false).then(setBrigades); }, [mode]);

  // Окно — в body: плашка выбора «прилипает» (свой слой) и не должна обрезать окно и прятать его под меню оболочки.
  const form = mode
    ? createPortal(h('div', { className: 'p2-reg__overlay vr-modal', role: 'dialog', 'aria-label': mode === 'pm' ? 'Закрыть через РП' : 'Закрыть выбранные', 'data-testid': 'vr-close-dialog' },
        h('div', { className: 'vr-modal__box' },
          brigades === null ? h('div', { className: 'pf-muted' }, 'Загрузка бригад…')
            : !brigades.length ? h('div', { className: 'pf-card pf-muted' }, 'Нет бригад — их добавляет ПТО в «Справочники → Бригады».',
                h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setMode('') }, 'Закрыть'))
            : h(FloorClose, { api: fact, projectId, place: { id: '', name: '' }, positions: open.map(toFactPosition), brigades, lastBrigade: last,
                title: `${mode === 'pm' ? 'Закрыть через РП' : 'Закрыть выбранные'}: ${open.length} поз.`, requireApproval: mode === 'pm',
                onBrigade: (id) => { setLast(id); writeLast(companyId, id); }, onClose: () => setMode(''),
                onDone: (m, partial) => { if (partial) setMsg(m); else { props.notify(m); setMode(''); props.clear(); } void props.reload(); } }))), document.body)
    : null;

  return h('span', { className: 'vr-actions', 'data-testid': 'vr-actions' },
    h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'vr-export-selected', onClick: () => { void exportRows(columns, rows, props.save); } }, 'Выгрузить в Excel'),
    canClose ? h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'vr-close', disabled: !open.length, title: open.length ? '' : 'Выбранные позиции уже выполнены',
      onClick: () => { setMsg(''); props.notify(''); setMode('close'); } }, 'Закрыть выбранные') : null,
    canClose ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'vr-close-pm', disabled: !open.length,
      onClick: () => { setMsg(''); props.notify(''); setMode('pm'); } }, 'Закрыть через РП') : null,
    canClose && open.length < rows.length ? h('span', { className: 'pf-muted', 'data-testid': 'vr-done-skip' }, `выполненные (${rows.length - open.length}) не закрываются`) : null,
    msg ? h('span', { className: 'pj-notice', role: 'status', 'data-testid': 'vr-close-notice' }, msg) : null,
    form);
}

/** Действия и кнопка «Выгрузить список» для PositionsRegistry. perms — права проекта с сервера (pf_my_permissions). */
export function positionRegistryActions(fact: FactApi, perms: string[], projectId: string, companyId: string, archived: boolean, save: Save = saveXlsx): {
  actions: NonNullable<PositionsRegistryProps['actions']>; tools: NonNullable<PositionsRegistryProps['tools']>;
} {
  const canClose = perms.includes(FACT_CREATE) && !archived;
  return {
    actions: (rows, ctx): ReactNode => h(SelectedActions, { fact, rows, columns: ctx.columns, canClose, projectId, companyId, reload: ctx.reload, clear: ctx.clear, notify: ctx.notify, save }),
    tools: (ctx): ReactNode => h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'vr-export-all', disabled: !ctx.rows.length,
      onClick: () => { void exportRows(ctx.columns, ctx.rows, save); } }, `Выгрузить список в Excel (${ctx.rows.length})`),
  };
}

export const POSITION_ACTIONS_CSS = `
.vr-actions{display:inline-flex;flex-wrap:wrap;align-items:center;gap:8px}
.vr-modal{justify-content:center;align-items:flex-start;overflow-y:auto;padding:24px 12px}
.vr-modal__box{width:min(760px,100%);background:var(--card-bg);color:var(--text-main);border-radius:12px;font-family:inherit}
.vr-modal__box .ft-sheet{margin:0}
@media (max-width:760px){.vr-modal{padding:0}.vr-modal__box{border-radius:0;min-height:100%}.vr-actions{width:100%}.vr-actions .pf-btn{flex:1 1 calc(50% - 8px)}}
`;
