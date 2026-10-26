/**
 * «КС-2 → список актов» на реестре оболочки (P2-0020): акты объекта (Ks2Api.acts → pf_ks2_list_acts) — номер, дата, период, статус,
 * сумма, редакции, кто выдал; фильтры — статус, год и месяц периода (по дате «по»); колонки, виды и ссылка; «Выгрузить в Excel»
 * (видимые колонки — список или выбранные). Нажатие на номер открывает акт как раньше (Ks2Act). Суммы считает сервер; без права
 * planfact.money.view колонки «Сумма» нет ни на экране, ни в выгрузке (сервер и так присылает null).
 */
import { createElement as h, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { RegistryTable, StatusBadge, buildRegistryXlsx, queryOf, queryToState, registryFileName, registryRows, saveXlsx, syncRegistryAddress } from '../../../platform/ui/index.ts';
import type { RegistryColumn, RegistryFilter, RegistryState, Status } from '../../../platform/ui/index.ts';
import type { Ks2ActItem, Ks2Status } from './ks2.service.ts';
import { STATUS_LABEL } from './model.ts';
import { ruDate } from './form.ts';
import { money } from '../estimate/prices.ts';
import { todayMoscow } from '../fact/fact.ts';

export const KS2_LINK = '#/planfact/ks2';
const STATUS_ORDER: Ks2Status[] = ['draft', 'issued', 'annulled'];
const STATUS_TONE: Record<Ks2Status, Status> = { draft: 'yellow', issued: 'green', annulled: 'grey' };
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** «2026-10» → «Октябрь 2026». */
export const monthLabel = (ym: string): string => { const m = Number(ym.slice(5, 7)); return m >= 1 && m <= 12 ? `${cap(MONTHS[m - 1])} ${ym.slice(0, 4)}` : ym; };

const statusText = (a: Ks2ActItem): string => STATUS_LABEL[a.status] + (a.annul_reason ? `: ${a.annul_reason}` : '');

export function ks2Columns(canMoney: boolean): RegistryColumn<Ks2ActItem>[] {
  const cols: RegistryColumn<Ks2ActItem>[] = [
    { id: 'no', label: '№ акта', value: (a) => a.act_no, fixed: true, render: (a) => `№ ${a.act_no}` },
    { id: 'date', label: 'Дата акта', value: (a) => a.act_date, render: (a) => ruDate(a.act_date) },
    { id: 'period', label: 'Период', value: (a) => `${ruDate(a.period_from)} — ${ruDate(a.period_to)}` },
    { id: 'status', label: 'Статус', value: statusText,
      render: (a) => h('span', { className: 'k2r-status' }, h(StatusBadge, { status: STATUS_TONE[a.status], label: cap(STATUS_LABEL[a.status]), testId: 'k2r-status' }),
        a.annul_reason ? h('span', { className: 'pf-muted k2-reason' }, a.annul_reason) : null) },
    { id: 'sum', label: 'Сумма, ₽', value: (a) => a.total, align: 'right', numFmt: '#,##0.00', render: (a) => (a.total === null ? '—' : money(a.total)) },
    { id: 'revisions', label: 'Редакций', value: (a) => a.revisions, align: 'right' },
    { id: 'issued', label: 'Выдал', value: (a) => (a.issued_by_email ? `${a.issued_by_email}${a.issued_at ? ', ' + ruDate(a.issued_at.slice(0, 10)) : ''}` : null) },
  ];
  return canMoney ? cols : cols.filter((c) => c.id !== 'sum');
}

export const KS2_FILTERS: RegistryFilter<Ks2ActItem>[] = [
  { id: 'status', label: 'Статус', get: (a) => a.status, options: STATUS_ORDER.map((s) => ({ value: s, label: cap(STATUS_LABEL[s]) })) },
  { id: 'year', label: 'Год периода', get: (a) => a.period_to.slice(0, 4) },
  { id: 'month', label: 'Месяц периода', get: (a) => a.period_to.slice(0, 7), optionLabel: monthLabel },
];
const TONE_LABEL: Partial<Record<Status, string>> = { yellow: 'черновик', green: 'выдан', grey: 'аннулирован' };

type Save = (bytes: Uint8Array, name: string) => void;
async function exportActs(columns: RegistryColumn<Ks2ActItem>[], rows: Ks2ActItem[], save: Save): Promise<void> {
  const bytes = await buildRegistryXlsx('Акты КС-2', columns, rows);
  save(bytes, registryFileName('Акты КС-2', ruDate(todayMoscow())));
}

export interface Ks2RegistryProps { acts: Ks2ActItem[]; canMoney: boolean; onOpen: (actId: string) => void; companyId: string; user: string; save?: Save }

export function Ks2Registry(props: Ks2RegistryProps): ReactElement {
  const { acts, canMoney } = props;
  const save = props.save || saveXlsx;
  const [state, setState] = useState<RegistryState>(() => queryToState(queryOf(window.location.hash)));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const columns = useMemo(() => ks2Columns(canMoney), [canMoney]);
  const onState = (s: RegistryState): void => { setState(s); syncRegistryAddress(KS2_LINK, s); };
  const ordered = useMemo(() => registryRows(acts, { filters: KS2_FILTERS, columns, state }), [acts, columns, state]);
  const visibleCols = columns.filter((c) => c.fixed || (state.cols ? state.cols.includes(c.id) : !c.hidden));

  return h('div', { className: 'k2r', 'data-testid': 'k2-registry' },
    h('div', { className: 'pj-actions' },
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'k2r-export-all', disabled: !ordered.length,
        onClick: () => { void exportActs(visibleCols, ordered, save); } }, `Выгрузить список в Excel (${ordered.length})`)),
    h(RegistryTable<Ks2ActItem>, {
      testId: 'k2r-table', rows: acts, rowKey: (a) => a.id, columns, filters: KS2_FILTERS, state, onState,
      toneOf: (a) => STATUS_TONE[a.status], toneLabel: TONE_LABEL,
      selected, onSelect: setSelected, onOpen: (a) => props.onOpen(a.id),
      actions: (sel) => h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'k2r-export-selected', onClick: () => { void exportActs(visibleCols, sel, save); } }, 'Выгрузить в Excel'),
      empty: 'Актов пока нет.',
      views: { registry: 'ks2-acts', company: props.companyId, user: props.user }, linkBase: KS2_LINK,
    }));
}

export const KS2_REGISTRY_CSS = `
.k2r{display:flex;flex-direction:column;gap:10px;min-width:0}
.k2r-status{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px 8px}
.k2r .p2-reg__table td[data-col="status"]{text-align:left}
@media (min-width:761px){.k2r .p2-reg__table td{overflow-wrap:break-word}.k2r .p2-reg__table td[data-col="date"],.k2r .p2-reg__table td[data-col="sum"]{white-space:nowrap}}
`;
