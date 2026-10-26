/**
 * «ВОР → Позиции» на реестре оболочки (P2-0019): позиции проекта с планом, фактом, %, остатком и статусом; чипы и панель
 * «Фильтрация» (корпус, место, вид работ, статус), «Только просроченные» (по темпу 14 дней к сроку объекта), группы по корпусу,
 * выбор колонок, личные виды и ссылка, «Выбрано: N», боковая карточка с историей факта и шагами.
 * Данные — те же функции, что «Сводка» и «Факт» (pf_summary_positions, pf_fact_positions, pf_fact_history, срок — pf_summary_portfolio);
 * статус и «просрочено» — одна функция positionStatus (summary/model.ts). Права проверяет сервер.
 * P2-0022: в карточке — блок «Прогноз» (числа — с сервера, 030: прогноз окончания, план % на сегодня, отклонение; пороги — объекта).
 */
import { createElement as h, useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { HistoryFeed, KpiTile, RegistryTable, SideCard, StatusBadge, Steps, queryOf, queryToState, registryRows, syncRegistryAddress } from '../../../platform/ui/index.ts';
import type { RegistryColumn, RegistryFilter, RegistryState, Status } from '../../../platform/ui/index.ts';
import type { SummaryApi } from '../summary/summary.service.ts';
import type { FactApi, FactHistoryRow } from '../fact/fact.service.ts';
import { historyItem } from '../fact/factStatus.ts';
import { forecastView, POSITION_STATE_LABEL, positionStatus } from '../summary/model.ts';
import type { PositionState, PositionStatus } from '../summary/model.ts';
import { fmtPct, fmtQty, todayMoscow } from '../fact/fact.ts';
import { ruDate } from '../ks2/form.ts';

export interface PositionRow {
  id: string; corp: string; place: string; placeType: string; work: string; unit: string;
  plan: number; fact: number; pct: number | null; rest: number; fact14: number; pendingQty: number; pendingCount: number;
  rejectedNote: string | null; st: PositionStatus;
  /** Прогноз с сервера (030) и пороги светофора объекта. */
  forecast: string | null; deltaDays: number | null; planPctToday: number | null; devPp: number | null; th: { yellow: number; red: number };
}

export const POSITIONS_LINK = '#/planfact/vor/positions';
const SEP = ' · ';
/** Корпус позиции — первый узел пути места («Корпус 1 · 5 этаж · Кв. 1» → «Корпус 1»). */
export const corpOf = (path: string): string => (String(path || '').split(SEP)[0] || 'Без места').trim();

const STATE_ORDER: PositionState[] = ['rejected', 'in_work', 'pending', 'done', 'not_started'];

export async function loadPositionRows(summary: SummaryApi, fact: FactApi, projectId: string, today: string): Promise<{ ok: true; rows: PositionRow[]; finish: string | null } | { ok: false; message: string }> {
  const [sp, fp, pf] = await Promise.all([summary.positions(projectId, null), fact.positions(projectId, null), summary.portfolio()]);
  if (!sp.ok) return { ok: false, message: sp.message };
  const fx = new Map((fp.ok ? fp.value : []).map((f) => [f.position_id, f]));
  const pr = pf.ok ? pf.value.find((p) => p.project_id === projectId) : undefined;
  const finish = pr?.planned_finish || null;
  const th = { yellow: pr ? pr.light_yellow_pp : 3, red: pr ? pr.light_red_pp : 10 };
  const rows = sp.value.map((p): PositionRow => {
    const f = fx.get(p.position_id);
    const pendingCount = f ? f.pending_count : 0;
    const rejectedNote = f ? f.last_rejected_note : null;
    return {
      id: p.position_id, corp: corpOf(p.location_path), place: p.location_path, placeType: f ? f.location_type : '', work: p.work_name, unit: p.unit_code,
      plan: p.plan_qty, fact: p.fact_qty, pct: p.pct, rest: p.rest_qty, fact14: p.fact14, pendingQty: p.pending_qty, pendingCount, rejectedNote,
      forecast: p.forecast_finish, deltaDays: p.delta_days, planPctToday: p.plan_pct_today, devPp: p.dev_pp, th,
      st: positionStatus({ plan_qty: p.plan_qty, fact_qty: p.fact_qty, fact14: p.fact14, pending_qty: p.pending_qty, pending_count: pendingCount, last_rejected_note: rejectedNote }, { today, plannedFinish: finish }),
    };
  });
  return { ok: true, rows, finish };
}

const QTY = '#,##0.###';
export const POSITION_COLUMNS: RegistryColumn<PositionRow>[] = [
  { id: 'work', label: 'Работа', value: (r) => r.work, fixed: true },
  { id: 'place', label: 'Место', value: (r) => r.place },
  { id: 'unit', label: 'ЕИ', value: (r) => r.unit },
  { id: 'plan', label: 'План', value: (r) => r.plan, align: 'right', numFmt: QTY },
  { id: 'fact', label: 'Факт', value: (r) => r.fact, align: 'right', numFmt: QTY },
  { id: 'pct', label: '%', value: (r) => r.pct, align: 'right', render: (r) => (r.pct === null ? '—' : fmtPct(r.pct)) },
  { id: 'rest', label: 'Остаток', value: (r) => r.rest, align: 'right', numFmt: QTY },
  { id: 'status', label: 'Статус', value: (r) => r.st.label + (r.st.overdue && r.st.state !== 'done' ? ', просрочено' : ''), render: (r) => statusCell(r.st) },
  { id: 'pace', label: 'Темп к сроку', value: (r) => r.st.paceText, hidden: true },
  { id: 'forecast', label: 'Прогноз окончания', value: (r) => forecastView(fcOf(r), r.th).finish, hidden: true },
  { id: 'fact14', label: 'Факт за 14 дн.', value: (r) => r.fact14, align: 'right', hidden: true, numFmt: QTY },
  { id: 'pending', label: 'Ждёт РП', value: (r) => r.pendingQty, align: 'right', hidden: true, numFmt: QTY },
  { id: 'corp', label: 'Корпус', value: (r) => r.corp, hidden: true },
];

function statusCell(st: PositionStatus): ReactNode {
  return h('span', { className: 'vr-status' },
    h(StatusBadge, { status: STATE_TONE_PLAIN[st.state], label: st.label, testId: 'vr-status' }),
    st.overdue ? h(StatusBadge, { status: 'red', label: 'Просрочено', title: st.paceText, testId: 'vr-overdue' }) : null,
    st.pace === 'no_pace' ? h(StatusBadge, { status: 'grey', label: 'Нет темпа', title: st.paceText, testId: 'vr-nopace' }) : null);
}
const STATE_TONE_PLAIN: Record<PositionState, Status> = { not_started: 'grey', in_work: 'yellow', pending: 'blue', rejected: 'red', done: 'green' };

export const POSITION_FILTERS: RegistryFilter<PositionRow>[] = [
  { id: 'corp', label: 'Корпус', get: (r) => r.corp },
  { id: 'place', label: 'Место', get: (r) => r.place },
  { id: 'work', label: 'Вид работ', get: (r) => r.work },
  { id: 'status', label: 'Статус', get: (r) => r.st.state, options: STATE_ORDER.map((s) => ({ value: s, label: POSITION_STATE_LABEL[s] })) },
];
const TONE_LABEL: Partial<Record<Status, string>> = { red: 'просрочено / отклонено', yellow: 'в работе', blue: 'ждёт подтверждения РП', green: 'выполнено', grey: 'не начато' };

export { historyItem };

function PositionCard(props: { fact: FactApi; row: PositionRow; index: number; total: number; onPrev: () => void; onNext: () => void; onClose: () => void }): ReactElement {
  const { fact, row } = props;
  const [hist, setHist] = useState<FactHistoryRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setHist(null); setError('');
    void fact.history(row.id).then((r) => { if (r.ok) setHist(r.value); else { setHist([]); setError(r.message); } });
  }, [row.id]);
  const st = row.st;
  return h(SideCard, { title: row.work, subtitle: row.place, index: props.index, total: props.total, onPrev: props.onPrev, onNext: props.onNext, onClose: props.onClose,
    head: h(Steps, { steps: [{ id: 'not_started', label: 'Не начато' }, { id: 'in_work', label: 'В работе' }, { id: 'done', label: 'Выполнено' }], current: st.step,
      side: st.pending ? { label: `Ждёт РП: ${fmtQty(row.pendingQty)} ${row.unit}`, tone: 'blue' } : null }) },
    h('dl', { className: 'vr-nums', 'data-testid': 'vr-card-nums' },
      h('dt', null, 'План'), h('dd', { className: 'p2-num' }, `${fmtQty(row.plan)} ${row.unit}`),
      h('dt', null, 'Факт'), h('dd', { className: 'p2-num' }, `${fmtQty(row.fact)} ${row.unit}${row.pct === null ? '' : ` · ${fmtPct(row.pct)}`}`),
      h('dt', null, 'Остаток'), h('dd', { className: 'p2-num' }, `${fmtQty(row.rest)} ${row.unit}`),
      h('dt', null, 'Темп к сроку'), h('dd', { 'data-testid': 'vr-card-pace' }, st.paceText),
      row.rejectedNote ? h('dt', null, 'Последний отказ РП') : null, row.rejectedNote ? h('dd', null, row.rejectedNote) : null),
    h('div', { className: 'vr-status' }, statusCell(st)),
    h(ForecastBlock, { row }),
    h('h4', { className: 'vr-h' }, 'История'),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    hist === null ? h('div', { className: 'pf-muted' }, 'Загрузка…') : h(HistoryFeed, { items: hist.map((e) => historyItem(e, row.unit)), empty: 'Факта по позиции ещё нет' }));
}

const fcOf = (r: PositionRow) => ({ plan: r.plan, fact: r.fact, forecast_finish: r.forecast, delta_days: r.deltaDays, dev_pp: r.devPp });

/** Блок «Прогноз» карточки позиции (P2-0022): прогноз окончания (позже финиша объекта — красная рамка), план % на сегодня, факт %,
 *  отклонение (заливка по порогам объекта), факт за 14 дней (темп прогноза). Числа — с сервера. */
function ForecastBlock(props: { row: PositionRow }): ReactElement {
  const { row } = props;
  const v = forecastView(fcOf(row), row.th);
  return h('div', { className: 'vr-fc', 'data-testid': 'vr-forecast' },
    h('h4', { className: 'vr-h' }, 'Прогноз'),
    h('div', { className: 'vr-fc-grid' },
      h(KpiTile, { label: 'Прогноз окончания', value: v.finish, tone: v.late ? 'red' : undefined, metric: 'forecast',
        hint: row.deltaDays === null ? (row.forecast && v.finish !== 'выполнено' ? 'нет срока объекта' : undefined)
          : row.deltaDays > 0 ? `на ${row.deltaDays} дн. позже финиша объекта` : row.deltaDays < 0 ? `на ${-row.deltaDays} дн. раньше финиша объекта` : 'точно к финишу объекта' }),
      h(KpiTile, { label: 'План на сегодня', value: row.planPctToday === null ? '—' : fmtPct(row.planPctToday), metric: 'plan_pct', hint: row.planPctToday === null ? 'нет дат объекта' : undefined }),
      h(KpiTile, { label: 'Факт', value: row.pct === null ? '—' : fmtPct(row.pct), metric: 'fact_pct' }),
      h(KpiTile, { label: 'Отклонение', value: v.dev, tone: v.devTone || undefined, metric: 'dev', hint: 'план % − факт %' }),
      h(KpiTile, { label: 'Темп за 14 дней', value: `${fmtQty(row.fact14)} ${row.unit}`, metric: 'pace14', hint: v.noPace ? 'нет темпа — прогноз не считается' : 'факт за 14 дней' })));
}

export interface PositionsRegistryProps {
  fact: FactApi; summary: SummaryApi; projectId: string; companyId: string; user: string;
  /** Действия «Выбрано: N» (этап 5: выгрузка, закрытие); reload — перечитать позиции. */
  actions?: (rows: PositionRow[], ctx: { reload: () => Promise<void>; clear: () => void; notify: (msg: string) => void; columns: RegistryColumn<PositionRow>[] }) => ReactNode;
  tools?: (ctx: { rows: PositionRow[]; columns: RegistryColumn<PositionRow>[] }) => ReactNode;
  onCount?: (n: number | null) => void;
  today?: string;
}

export function PositionsRegistry(props: PositionsRegistryProps): ReactElement {
  const { fact, summary, projectId, companyId, user } = props;
  const today = props.today || todayMoscow();
  const [rows, setRows] = useState<PositionRow[] | null>(null);
  const [finish, setFinish] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [state, setState] = useState<RegistryState>(() => queryToState(queryOf(window.location.hash)));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState('');
  const [notice, setNotice] = useState('');

  async function reload(): Promise<void> {
    const r = await loadPositionRows(summary, fact, projectId, today);
    if (!r.ok) { setRows([]); setError(r.message); props.onCount?.(null); return; }
    setError(''); setRows(r.rows); setFinish(r.finish); props.onCount?.(r.rows.length);
    setSelected((s) => new Set(r.rows.filter((x) => s.has(x.id)).map((x) => x.id)));
  }
  useEffect(() => { setRows(null); setSelected(new Set()); setOpenId(''); void reload(); }, [projectId]);
  const onState = (s: RegistryState): void => { setState(s); syncRegistryAddress(POSITIONS_LINK, s); };

  const ordered = useMemo(() => registryRows(rows || [], { filters: POSITION_FILTERS, columns: POSITION_COLUMNS, state, isOverdue: (r) => r.st.overdue, groupBy: { label: 'Корпус', key: (r) => r.corp } }), [rows, state]);
  if (rows === null) return h('div', { className: 'pf-muted' }, 'Загрузка позиций…');
  const idx = openId ? ordered.findIndex((r) => r.id === openId) : -1;
  const open = idx >= 0 ? ordered[idx] : null;
  const visibleCols = POSITION_COLUMNS.filter((c) => c.fixed || (state.cols ? state.cols.includes(c.id) : !c.hidden));

  return h('div', { className: 'pj-tab vr-tab', 'data-testid': 'vor-registry' },
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { className: 'pj-notice', role: 'status', 'data-testid': 'vr-notice' }, notice) : null,
    props.tools ? h('div', { className: 'pj-actions' }, props.tools({ rows: ordered, columns: visibleCols })) : null,
    h(RegistryTable<PositionRow>, {
      testId: 'vr-table', rows, rowKey: (r) => r.id, columns: POSITION_COLUMNS, filters: POSITION_FILTERS, state, onState,
      isOverdue: (r) => r.st.overdue, overdueHint: finish ? undefined : 'Нет срока объекта: укажите плановое окончание в «Сводке» — тогда «Только просроченные» заработает.',
      groupBy: { label: 'Корпус', key: (r) => r.corp }, toneOf: (r) => r.st.tone, toneLabel: TONE_LABEL,
      selected, onSelect: setSelected, onOpen: (r) => setOpenId(r.id), openKey: openId,
      actions: props.actions ? (sel) => props.actions!(sel, { reload, clear: () => setSelected(new Set()), notify: setNotice, columns: visibleCols }) : undefined,
      empty: 'Позиций пока нет — загрузите и подтвердите ВОР во вкладке «Загрузка».',
      views: { registry: 'vor-positions', company: companyId, user }, linkBase: POSITIONS_LINK,
    }),
    open ? h(PositionCard, { key: open.id, fact, row: open, index: idx, total: ordered.length,
      onPrev: () => setOpenId(ordered[Math.max(0, idx - 1)].id), onNext: () => setOpenId(ordered[Math.min(ordered.length - 1, idx + 1)].id), onClose: () => setOpenId('') }) : null);
}

export const POSITIONS_REGISTRY_CSS = `
.vr-tab{min-width:0}
.vr-status{display:inline-flex;flex-wrap:wrap;gap:4px;justify-content:flex-end}
.p2-reg__table td[data-col="status"]{text-align:left}
.p2-reg__table td[data-col="status"] .vr-status{justify-content:flex-start}
.vr-nums{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;margin:0;font-size:13px}
.vr-nums dt{color:var(--text-muted)}
.vr-nums dd{margin:0;overflow-wrap:anywhere}
.vr-h{margin:4px 0 0;font-size:14px}
.vr-fc{display:flex;flex-direction:column;gap:8px}
.vr-fc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
`;
