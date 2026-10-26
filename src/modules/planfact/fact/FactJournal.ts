/**
 * «Факт → Журнал» на реестре оболочки (P2-0020): все записи факта объекта за период по дате работ (pf_fact_journal, миграция 028;
 * по умолчанию 30 дней) — кто, когда, сколько, статус, решение РП, исправление. Фильтры — корпус, работа, бригада, автор, статус;
 * статус — палитра реестра (FACT_LABEL); группы по корпусу, колонки, виды и ссылка; «Выгрузить в Excel» (видимые колонки,
 * отфильтрованный список или выбранные); карточка — запись и история позиции (pf_fact_history). Только чтение: право
 * planfact.fact.view проверяет сервер.
 */
import { createElement as h, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { HistoryFeed, RegistryTable, SideCard, StatusBadge, buildRegistryXlsx, queryOf, queryToState, registryFileName, registryRows, saveXlsx, syncRegistryAddress } from '../../../platform/ui/index.ts';
import type { RegistryColumn, RegistryFilter, RegistryState, Status } from '../../../platform/ui/index.ts';
import type { FactApi, FactHistoryRow, FactJournalRow, FactStatus } from './fact.service.ts';
import { fmtPeriod, fmtQty, todayMoscow } from './fact.ts';
import { fmtWhen } from './FactHistory.ts';
import { FACT_LABEL, FACT_STATUS_ORDER, historyItem } from './factStatus.ts';
import { corpOf } from '../vor/PositionsRegistry.ts';
import { ruDate } from '../ks2/form.ts';
import { hashParam } from '../ProjectPicker.ts';

export const JOURNAL_LINK = '#/planfact/fact/journal';
/** Записей за один запрос (сервер отдаёт не больше; постраничность — ТД). */
export const JOURNAL_LIMIT = 2000;
export const JOURNAL_DAYS = 30;

export interface JournalRow {
  id: string; positionId: string; corp: string; place: string; work: string; unit: string; qty: number; date: string; periodFrom: string | null;
  status: FactStatus; brigade: string; workers: number | null; manHours: number | null; author: string; createdAt: string;
  decidedBy: string; decidedAt: string | null; decision: string; note: string; correction: string;
}

export function toJournalRow(e: FactJournalRow): JournalRow {
  return {
    id: e.id, positionId: e.position_id, corp: corpOf(e.location_path), place: e.location_path, work: e.work_name, unit: e.unit_code,
    qty: e.qty, date: e.work_date, periodFrom: e.period_from ?? null, status: e.status, brigade: e.brigade_name, workers: e.workers, manHours: e.man_hours,
    author: e.created_by_email || '—', createdAt: e.created_at, decidedBy: e.decided_by_email || '', decidedAt: e.decided_at,
    decision: e.decision_note || '', note: e.note || '', correction: e.corrects_id ? (e.correction_reason || 'исправление') : '',
  };
}

/** Дата (ГГГГ-ММ-ДД) ± дни. */
export function shiftDate(d: string, days: number): string {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

const QTY = '#,##0.###';
export const JOURNAL_COLUMNS: RegistryColumn<JournalRow>[] = [
  { id: 'work', label: 'Работа', value: (r) => r.work, fixed: true },
  { id: 'place', label: 'Место', value: (r) => r.place },
  { id: 'date', label: 'Дата работ', value: (r) => r.date, render: (r) => (r.periodFrom ? fmtPeriod(r.periodFrom, r.date) : ruDate(r.date)) },
  { id: 'periodFrom', label: 'Период с', value: (r) => r.periodFrom, render: (r) => (r.periodFrom ? ruDate(r.periodFrom) : ''), hidden: true },
  { id: 'qty', label: 'Объём', value: (r) => r.qty, align: 'right', numFmt: QTY, render: (r) => `${fmtQty(r.qty)} ${r.unit}` },
  { id: 'unit', label: 'ЕИ', value: (r) => r.unit, hidden: true },
  { id: 'status', label: 'Статус', value: (r) => FACT_LABEL[r.status].label, render: (r) => h(StatusBadge, { status: FACT_LABEL[r.status].tone, label: FACT_LABEL[r.status].label, testId: 'fj-status' }) },
  { id: 'brigade', label: 'Бригада', value: (r) => r.brigade },
  { id: 'author', label: 'Внёс', value: (r) => r.author },
  { id: 'workers', label: 'Люди', value: (r) => r.workers, align: 'right', hidden: true },
  { id: 'manHours', label: 'Чел.-ч', value: (r) => r.manHours, align: 'right', hidden: true, numFmt: QTY },
  { id: 'decision', label: 'Решение РП', value: (r) => (r.decidedBy ? `${r.decidedBy}${r.decision ? ': ' + r.decision : ''}` : null) },
  { id: 'note', label: 'Пометка', value: (r) => r.note || null },
  { id: 'correction', label: 'Исправление', value: (r) => r.correction || null, hidden: true },
  { id: 'created', label: 'Внесено', value: (r) => r.createdAt.slice(0, 16).replace('T', ' '), render: (r) => fmtWhen(r.createdAt), hidden: true },
  { id: 'corp', label: 'Корпус', value: (r) => r.corp, hidden: true },
];

export const JOURNAL_FILTERS: RegistryFilter<JournalRow>[] = [
  { id: 'corp', label: 'Корпус', get: (r) => r.corp },
  { id: 'work', label: 'Работа', get: (r) => r.work },
  { id: 'brigade', label: 'Бригада', get: (r) => r.brigade },
  { id: 'author', label: 'Внёс', get: (r) => r.author },
  { id: 'status', label: 'Статус', get: (r) => r.status, options: FACT_STATUS_ORDER.map((s) => ({ value: s, label: FACT_LABEL[s].label })) },
];
const GROUP = { label: 'Корпус', key: (r: JournalRow) => r.corp };
const TONE_LABEL: Partial<Record<Status, string>> = { blue: 'ждёт РП', green: 'принято', red: 'отклонено', grey: 'заменено' };

type Save = (bytes: Uint8Array, name: string) => void;
async function exportRows(columns: RegistryColumn<JournalRow>[], rows: JournalRow[], save: Save): Promise<void> {
  const bytes = await buildRegistryXlsx('Журнал факта', columns, rows);
  save(bytes, registryFileName('Журнал факта', ruDate(todayMoscow())));
}

function JournalCard(props: { api: FactApi; row: JournalRow; index: number; total: number; onPrev: () => void; onNext: () => void; onClose: () => void }): ReactElement {
  const { api, row } = props;
  const [hist, setHist] = useState<FactHistoryRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setHist(null); setError('');
    void api.history(row.positionId).then((r) => { if (r.ok) setHist(r.value); else { setHist([]); setError(r.message); } });
  }, [row.id]);
  const st = FACT_LABEL[row.status];
  const dd = (label: string, value: string, num = false): ReactElement[] => [h('dt', { key: label + ':t' }, label), h('dd', { key: label + ':d', className: num ? 'p2-num' : undefined }, value)];
  return h(SideCard, { title: row.work, subtitle: row.place, index: props.index, total: props.total, onPrev: props.onPrev, onNext: props.onNext, onClose: props.onClose,
    head: h(StatusBadge, { status: st.tone, label: st.label, testId: 'fj-card-status' }) },
    h('dl', { className: 'vr-nums', 'data-testid': 'fj-card-nums' },
      dd('Объём', `${fmtQty(row.qty)} ${row.unit}`, true), dd('Дата работ', row.periodFrom ? `${ruDate(row.periodFrom)} — ${ruDate(row.date)}` : ruDate(row.date), true), dd('Бригада', row.brigade),
      row.workers !== null ? dd('Люди', String(row.workers), true) : [], row.manHours !== null ? dd('Чел.-ч', fmtQty(row.manHours), true) : [],
      dd('Внёс', `${row.author}, ${fmtWhen(row.createdAt)}`),
      row.decidedBy ? dd(row.status === 'superseded' ? 'Заменил' : 'Решение РП', `${row.decidedBy}${row.decidedAt ? ', ' + fmtWhen(row.decidedAt) : ''}`) : [],
      row.decision ? dd('Причина', row.decision) : [], row.note ? dd('Пометка', row.note) : [], row.correction ? dd('Исправление', row.correction) : []),
    h('h4', { className: 'vr-h' }, 'История позиции'),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    hist === null ? h('div', { className: 'pf-muted' }, 'Загрузка…') : h(HistoryFeed, { items: hist.map((e) => historyItem(e, row.unit)), empty: 'Факта по позиции ещё нет' }));
}

export interface FactJournalProps { api: FactApi; projectId: string; companyId: string; user: string; today?: string; save?: Save }

export function FactJournal(props: FactJournalProps): ReactElement {
  const { api, projectId } = props;
  const save = props.save || saveXlsx;
  const today = props.today || todayMoscow();
  // P2-0021: переход «Мои отклонённые» — период с даты самой ранней записи (from=ГГГГ-ММ-ДД), если она раньше 30 дней
  const [from, setFrom] = useState(() => { const d = shiftDate(today, -(JOURNAL_DAYS - 1)); const f = hashParam(window.location.hash, 'from');
    return /^\d{4}-\d{2}-\d{2}$/.test(f) && f < d ? f : d; });
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<JournalRow[] | null>(null);
  const [error, setError] = useState('');
  const [state, setState] = useState<RegistryState>(() => queryToState(queryOf(window.location.hash)));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState('');

  async function load(f: string, t: string): Promise<void> {
    if (f && t && f > t) { setError('Начало периода позже конца'); return; }
    setRows(null); setError('');
    const r = await api.journal(projectId, f || null, t || null, JOURNAL_LIMIT);
    if (!r.ok) { setRows([]); setError(r.message); return; }
    const next = r.value.map(toJournalRow);
    setRows(next);
    setSelected((s) => new Set(next.filter((x) => s.has(x.id)).map((x) => x.id)));
  }
  useEffect(() => { setSelected(new Set()); setOpenId(''); void load(from, to); }, [projectId]);
  const onState = (s: RegistryState): void => { setState(s); syncRegistryAddress(JOURNAL_LINK, s); };

  const ordered = useMemo(() => registryRows(rows || [], { filters: JOURNAL_FILTERS, columns: JOURNAL_COLUMNS, state, groupBy: GROUP }), [rows, state]);
  const visibleCols = JOURNAL_COLUMNS.filter((c) => c.fixed || (state.cols ? state.cols.includes(c.id) : !c.hidden));
  const idx = openId ? ordered.findIndex((r) => r.id === openId) : -1;
  const open = idx >= 0 ? ordered[idx] : null;
  const preset = (days: number): void => { const f = shiftDate(today, -(days - 1)); setFrom(f); setTo(today); void load(f, today); };

  return h('div', { className: 'pj-tab vr-tab fp-registry', 'data-testid': 'fj-journal' },
    h('div', { className: 'fj-period', role: 'group', 'aria-label': 'Период по дате работ', 'data-testid': 'fj-period' },
      h('label', { className: 'pf-field' }, 'С', h('input', { type: 'date', className: 'pj-input', value: from, max: to || undefined, 'data-testid': 'fj-from', onChange: (e) => setFrom((e.target as HTMLInputElement).value) })),
      h('label', { className: 'pf-field' }, 'По', h('input', { type: 'date', className: 'pj-input', value: to, min: from || undefined, 'data-testid': 'fj-to', onChange: (e) => setTo((e.target as HTMLInputElement).value) })),
      h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'fj-apply', onClick: () => { void load(from, to); } }, 'Показать'),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'fj-7', onClick: () => preset(7) }, '7 дней'),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'fj-30', onClick: () => preset(JOURNAL_DAYS) }, '30 дней')),
    error ? h('div', { className: 'pf-error', role: 'alert', 'data-testid': 'fj-error' }, error) : null,
    rows && rows.length >= JOURNAL_LIMIT ? h('div', { className: 'pj-notice', role: 'status', 'data-testid': 'fj-limit' }, `Показаны последние ${JOURNAL_LIMIT.toLocaleString('ru-RU')} записей периода — сузьте период, чтобы увидеть остальные.`) : null,
    rows === null ? h('div', { className: 'pf-muted' }, 'Загрузка журнала…') : h('div', { className: 'pj-actions' },
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'fj-export-all', disabled: !ordered.length,
        onClick: () => { void exportRows(visibleCols, ordered, save); } }, `Выгрузить список в Excel (${ordered.length})`)),
    rows === null ? null : h(RegistryTable<JournalRow>, {
      testId: 'fj-table', rows, rowKey: (r) => r.id, columns: JOURNAL_COLUMNS, filters: JOURNAL_FILTERS, state, onState, groupBy: GROUP,
      toneOf: (r) => FACT_LABEL[r.status].tone, toneLabel: TONE_LABEL,
      selected, onSelect: setSelected, onOpen: (r) => setOpenId(r.id), openKey: openId,
      actions: (sel) => h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'fj-export-selected', onClick: () => { void exportRows(visibleCols, sel, save); } }, 'Выгрузить в Excel'),
      empty: 'За выбранный период записей факта нет.',
      views: { registry: 'fact-journal', company: props.companyId, user: props.user }, linkBase: JOURNAL_LINK,
    }),
    open ? h(JournalCard, { key: open.id, api, row: open, index: idx, total: ordered.length,
      onPrev: () => setOpenId(ordered[Math.max(0, idx - 1)].id), onNext: () => setOpenId(ordered[Math.min(ordered.length - 1, idx + 1)].id), onClose: () => setOpenId('') }) : null);
}

export const FACT_JOURNAL_CSS = `
.fj-period{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px}
.fj-period .pf-field{min-width:150px}
.fj-period .pf-btn{min-height:40px}
@media (max-width:760px){.fj-period .pf-field{flex:1 1 calc(50% - 8px);min-width:0}.fj-period .pf-btn{flex:1 1 auto}}
`;
