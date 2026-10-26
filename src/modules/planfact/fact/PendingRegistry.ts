/**
 * «Факт → Ждёт подтверждения» на реестре оболочки (P2-0020): очередь РП объекта (pf_fact_pending) — фильтры по корпусу, работе,
 * прорабу, бригаде и дате, группы по корпусу, колонки, виды и ссылка; «Выбрано: N» → «Подтвердить» / «Отклонить» (одна причина
 * на все) одной операцией сервера pf_fact_decide_batch (всё или ничего; больше 500 — частями); карточка — запись, решение по ней
 * (pf_fact_decide) и история позиции (pf_fact_history). Права (planfact.fact.approve) и правила решения проверяет сервер.
 */
import { createElement as h, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { HistoryFeed, RegistryTable, SideCard, StatusBadge, queryOf, queryToState, registryRows, syncRegistryAddress } from '../../../platform/ui/index.ts';
import type { RegistryColumn, RegistryFilter, RegistryState } from '../../../platform/ui/index.ts';
import type { FactApi, FactHistoryRow, FactPendingRow } from './fact.service.ts';
import { DECIDE_BATCH_MAX } from './fact.service.ts';
import { fmtPct, fmtQty, percent } from './fact.ts';
import { fmtWhen } from './FactHistory.ts';
import { PendingDecision } from './FactPending.ts';
import { historyItem, isViaPm } from './factStatus.ts';
import { corpOf } from '../vor/PositionsRegistry.ts';
import { ruDate } from '../ks2/form.ts';

export const PENDING_LINK = '#/planfact/fact/pending';

export interface PendingRow {
  id: string; positionId: string; corp: string; place: string; work: string; unit: string;
  qty: number; plan: number; fact: number; afterPct: number | null; date: string; brigade: string; author: string;
  note: string; viaPm: boolean; correction: string; createdAt: string;
}

export function toPendingRow(e: FactPendingRow): PendingRow {
  return {
    id: e.id, positionId: e.position_id, corp: corpOf(e.location_path), place: e.location_path, work: e.work_name, unit: e.unit_code,
    qty: e.qty, plan: e.plan_qty, fact: e.fact_qty, afterPct: e.corrects_id ? null : percent(e.fact_qty + e.qty, e.plan_qty),
    date: e.work_date, brigade: e.brigade_name, author: e.created_by_email || '—', note: e.note || '', viaPm: isViaPm(e.note),
    correction: e.corrects_id ? (e.correction_reason || 'исправление') : '', createdAt: e.created_at,
  };
}

const QTY = '#,##0.###';
export const PENDING_COLUMNS: RegistryColumn<PendingRow>[] = [
  { id: 'work', label: 'Работа', value: (r) => r.work, fixed: true },
  { id: 'place', label: 'Место', value: (r) => r.place },
  { id: 'qty', label: 'Объём', value: (r) => r.qty, align: 'right', numFmt: QTY, render: (r) => `${fmtQty(r.qty)} ${r.unit}` },
  { id: 'plan', label: 'План', value: (r) => r.plan, align: 'right', numFmt: QTY },
  { id: 'fact', label: 'Принято', value: (r) => r.fact, align: 'right', numFmt: QTY },
  { id: 'after', label: 'После подтв.', value: (r) => r.afterPct, align: 'right', render: (r) => (r.afterPct === null ? '—' : fmtPct(r.afterPct)) },
  { id: 'date', label: 'Дата работ', value: (r) => r.date, render: (r) => ruDate(r.date) },
  { id: 'brigade', label: 'Бригада', value: (r) => r.brigade },
  { id: 'author', label: 'Прораб', value: (r) => r.author },
  { id: 'note', label: 'Пометка', value: (r) => r.note || null },
  { id: 'viaPm', label: 'Через РП', value: (r) => (r.viaPm ? 'да' : null), render: (r) => (r.viaPm ? h(StatusBadge, { status: 'blue', label: 'Через РП', testId: 'fp-viapm' }) : '—') },
  { id: 'correction', label: 'Исправление', value: (r) => r.correction || null },
  { id: 'corp', label: 'Корпус', value: (r) => r.corp, hidden: true },
];

export const PENDING_FILTERS: RegistryFilter<PendingRow>[] = [
  { id: 'corp', label: 'Корпус', get: (r) => r.corp },
  { id: 'work', label: 'Работа', get: (r) => r.work },
  { id: 'author', label: 'Прораб', get: (r) => r.author },
  { id: 'brigade', label: 'Бригада', get: (r) => r.brigade },
  { id: 'date', label: 'Дата работ', get: (r) => r.date, optionLabel: ruDate },
];
const GROUP = { label: 'Корпус', key: (r: PendingRow) => r.corp };

/** Решить пачкой: частями по 500 (каждая часть — всё или ничего на сервере). Ошибка части — остановка; решённые раньше части остаются. */
export async function decideInParts(api: FactApi, projectId: string, ids: string[], approve: boolean, note: string): Promise<{ done: number; error: string }> {
  let done = 0;
  for (let i = 0; i < ids.length; i += DECIDE_BATCH_MAX) {
    const part = ids.slice(i, i + DECIDE_BATCH_MAX);
    const r = await api.decideBatch(projectId, part, approve, note);
    if (!r.ok) return { done, error: r.message };
    done += approve ? r.value.approved : r.value.rejected;
  }
  return { done, error: '' };
}

function BatchActions(props: { api: FactApi; projectId: string; rows: PendingRow[]; onDone: (message: string, isError: boolean) => void }): ReactElement {
  const { rows } = props;
  const [reject, setReject] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(approve: boolean): Promise<void> {
    if (busy) return;
    if (!approve && !note.trim()) { setError('Напишите причину отказа — она одна на все выбранные записи'); return; }
    setBusy(true); setError('');
    const r = await decideInParts(props.api, props.projectId, rows.map((x) => x.id), approve, approve ? '' : note.trim());
    setBusy(false);
    if (r.error) {
      props.onDone(`${r.error}${r.done ? `. Решено ранее (частями по ${DECIDE_BATCH_MAX}): ${r.done} из ${rows.length}` : '. Ничего не изменилось'}`, true);
      return;
    }
    setReject(false); setNote('');
    props.onDone(approve ? `Подтверждено: ${r.done} — объём вошёл в итог` : `Отклонено: ${r.done} — прорабы увидят причину`, false);
  }
  return h('span', { className: 'vr-actions fp-batch', 'data-testid': 'fp-batch' },
    reject
      ? h('span', { className: 'fp-reject' },
          h('input', { type: 'text', className: 'pj-input', maxLength: 300, placeholder: 'Причина отказа (одна на все)', value: note, 'aria-label': 'Причина отказа', 'data-testid': 'fp-reject-note',
            onChange: (e) => setNote((e.target as HTMLInputElement).value) }),
          h('button', { type: 'button', className: 'pf-btn un-danger', disabled: busy, 'data-testid': 'fp-reject-yes', onClick: () => { void run(false); } }, `Отклонить ${rows.length}`),
          h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy, onClick: () => { setReject(false); setNote(''); setError(''); } }, 'Назад'))
      : h('span', { className: 'vr-actions' },
          h('button', { type: 'button', className: 'pf-btn', disabled: busy, 'data-testid': 'fp-approve', onClick: () => { void run(true); } }, `Подтвердить ${rows.length}`),
          h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy, 'data-testid': 'fp-reject', onClick: () => { setReject(true); setError(''); } }, 'Отклонить')),
    busy ? h('span', { className: 'pf-muted' }, 'Сохраняем…') : null,
    error ? h('span', { className: 'pf-error', role: 'alert', 'data-testid': 'fp-batch-error' }, error) : null);
}

function PendingCard(props: { api: FactApi; row: PendingRow; index: number; total: number; onPrev: () => void; onNext: () => void; onClose: () => void; onDecided: (m: string) => void }): ReactElement {
  const { api, row } = props;
  const [hist, setHist] = useState<FactHistoryRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setHist(null); setError('');
    void api.history(row.positionId).then((r) => { if (r.ok) setHist(r.value); else { setHist([]); setError(r.message); } });
  }, [row.id]);
  const dd = (label: string, value: string, num = false): ReactElement[] => [h('dt', { key: label + ':t' }, label), h('dd', { key: label + ':d', className: num ? 'p2-num' : undefined }, value)];
  return h(SideCard, { title: row.work, subtitle: row.place, index: props.index, total: props.total, onPrev: props.onPrev, onNext: props.onNext, onClose: props.onClose,
    head: h(StatusBadge, { status: 'blue', label: row.viaPm ? 'Ждёт РП · через РП' : row.correction ? 'Ждёт РП · исправление' : 'Ждёт РП', testId: 'fp-card-status' }) },
    h('dl', { className: 'vr-nums', 'data-testid': 'fp-card-nums' },
      dd('Объём', `${fmtQty(row.qty)} ${row.unit}`, true),
      dd('Принято / план', `${fmtQty(row.fact)} из ${fmtQty(row.plan)} ${row.unit}`, true),
      row.afterPct === null ? [] : dd('После подтверждения', fmtPct(row.afterPct), true),
      dd('Дата работ', ruDate(row.date), true), dd('Бригада', row.brigade), dd('Внёс', `${row.author}, ${fmtWhen(row.createdAt)}`),
      row.note ? dd('Пометка', row.note) : [], row.correction ? dd('Исправление', row.correction) : []),
    h(PendingDecision, { api, entryId: row.id, onDone: props.onDecided }),
    h('h4', { className: 'vr-h' }, 'История позиции'),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    hist === null ? h('div', { className: 'pf-muted' }, 'Загрузка…') : h(HistoryFeed, { items: hist.map((e) => historyItem(e, row.unit)), empty: 'Факта по позиции ещё нет' }));
}

export interface PendingRegistryProps { api: FactApi; projectId: string; companyId: string; user: string; onChanged?: () => void }

export function PendingRegistry(props: PendingRegistryProps): ReactElement {
  const { api, projectId } = props;
  const [rows, setRows] = useState<PendingRow[] | null>(null);
  const [error, setError] = useState('');
  const [state, setState] = useState<RegistryState>(() => queryToState(queryOf(window.location.hash)));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState('');
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null);

  async function reload(): Promise<void> {
    const r = await api.pending(projectId);
    if (!r.ok) { setRows([]); setError(r.message); return; }
    const next = r.value.map(toPendingRow);
    setError(''); setRows(next);
    setSelected((s) => new Set(next.filter((x) => s.has(x.id)).map((x) => x.id)));
  }
  useEffect(() => { setRows(null); setSelected(new Set()); setOpenId(''); setNotice(null); void reload(); }, [projectId]);
  const onState = (s: RegistryState): void => { setState(s); syncRegistryAddress(PENDING_LINK, s); };
  const done = async (text: string, bad: boolean): Promise<void> => {
    setNotice({ text, bad });
    if (!bad) setSelected(new Set());
    await reload(); props.onChanged?.();
  };

  const ordered = useMemo(() => registryRows(rows || [], { filters: PENDING_FILTERS, columns: PENDING_COLUMNS, state, groupBy: GROUP }), [rows, state]);
  if (rows === null) return h('div', { className: 'pf-muted' }, 'Загрузка очереди…');
  const idx = openId ? ordered.findIndex((r) => r.id === openId) : -1;
  const open = idx >= 0 ? ordered[idx] : null;

  return h('div', { className: 'pj-tab vr-tab fp-registry', 'data-testid': 'fp-registry' },
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { className: notice.bad ? 'pf-error' : 'pj-notice', role: notice.bad ? 'alert' : 'status', 'data-testid': 'fp-notice' }, notice.text) : null,
    h(RegistryTable<PendingRow>, {
      testId: 'fp-table', rows, rowKey: (r) => r.id, columns: PENDING_COLUMNS, filters: PENDING_FILTERS, state, onState, groupBy: GROUP,
      selected, onSelect: setSelected, onOpen: (r) => setOpenId(r.id), openKey: openId,
      actions: (sel) => h(BatchActions, { api, projectId, rows: sel, onDone: (m, bad) => { void done(m, bad); } }),
      empty: 'Нет записей, ожидающих подтверждения.',
      views: { registry: 'fact-pending', company: props.companyId, user: props.user }, linkBase: PENDING_LINK,
    }),
    open ? h(PendingCard, { key: open.id, api, row: open, index: idx, total: ordered.length,
      onPrev: () => setOpenId(ordered[Math.max(0, idx - 1)].id), onNext: () => setOpenId(ordered[Math.min(ordered.length - 1, idx + 1)].id), onClose: () => setOpenId(''),
      onDecided: (m) => { setOpenId(''); void done(m, false); } }) : null);
}

export const PENDING_REGISTRY_CSS = `
/* много колонок: слова не рвутся по буквам (anywhere сжимает колонки до букв) — таблица прокручивается вбок внутри рамки */
@media (min-width:761px){.fp-registry .p2-reg__table td{overflow-wrap:break-word}
.fp-registry .p2-reg__table td.p2-reg__main{min-width:150px}
.fp-registry .p2-reg__table td[data-col="place"]{min-width:120px}
.fp-registry .p2-reg__table td[data-col="date"],.fp-registry .p2-reg__table td[data-col="qty"]{white-space:nowrap}}
.fp-batch{flex:1 1 auto}
.fp-reject{display:inline-flex;flex-wrap:wrap;align-items:center;gap:8px;flex:1 1 320px}
.fp-reject .pj-input{flex:1 1 220px;min-width:0}
.ft-decide{display:flex;flex-direction:column;gap:8px}
@media (max-width:760px){.fp-reject{width:100%}.fp-reject .pf-btn{flex:1 1 calc(50% - 8px)}}
`;
