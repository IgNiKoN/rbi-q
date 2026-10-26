/**
 * Сводка → объект (P2-0008, этапы 3–4; P2-0010 — дашборд сверху, `card`): виды работ (план / факт / % в своих ЕИ, ₽ — при праве) → раскрытие вида → позиции по местам.
 * Разные ЕИ не суммируются: у вида работ по строке на каждую ЕИ. Все числа — с сервера (pf_summary_worktypes / pf_summary_positions).
 * P2-0022: по каждой ЕИ — «Прогноз окончания», «Δ к финишу, дн.» (позже финиша — красным), «% отклонения» с заливкой по порогам объекта.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { SummaryApi, SummaryPosition, SummaryProject, SummaryWorkType } from './summary.service.ts';
import { forecastView, pctText, rub } from './model.ts';
import type { ForecastNumbers } from './model.ts';
import { StatusBadge } from '../../../platform/ui/index.ts';
import { fmtQty, todayMoscow } from '../fact/fact.ts';
import { saveFile } from '../estimate/KpBlock.ts';
import { buildSummaryXlsx, summaryFileName } from './xlsx.ts';

type View = 'works' | 'ks2';

export function ProjectView(props: { api: SummaryApi; p: SummaryProject; card: ReactElement; onBack?: () => void; ks2?: (p: SummaryProject) => ReactElement;
  save?: (b: Uint8Array, n: string) => void }): ReactElement {
  const { api, p, card, onBack, ks2 } = props;
  const saveBytes = props.save || saveFile;
  const [view, setView] = useState<View>('works');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Excel: все строки объекта заново с сервера (виды работ, все позиции, разрыв КС-2) — числа те же, что на экране.
  async function download(): Promise<void> {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const [w, pos, gap, att] = await Promise.all([api.workTypes(p.project_id), api.positions(p.project_id, null), api.ks2Gap(p.project_id), api.attention(p.project_id)]);
      if (!w.ok) { setError(w.message); return; }
      if (!pos.ok) { setError(pos.message); return; }
      const today = todayMoscow();
      const bytes = await buildSummaryXlsx({ project: p, workTypes: w.value, positions: pos.value, gap: gap.ok ? gap.value : null, gapError: gap.ok ? '' : gap.message, today,
        attention: att.ok ? att.value : null });
      saveBytes(bytes, summaryFileName(p, today));
    } catch {
      setError('Не удалось сформировать файл Excel');
    } finally {
      setBusy(false);
    }
  }

  return h('div', { className: 'sm-project', 'data-testid': 'sm-project' },
    h('div', { className: 'pj-actions' },
      onBack ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'sm-back', onClick: onBack }, '← Все объекты') : null,
      h('button', { type: 'button', className: 'pf-btn', disabled: busy, 'data-testid': 'sm-xlsx', onClick: () => { void download(); } }, busy ? 'Готовлю файл…' : 'Скачать Excel')),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    card,
    ks2
      ? h('div', { className: 'pf-seg', role: 'tablist', 'data-testid': 'sm-views' },
          ([['works', 'Виды работ'], ['ks2', 'Сделано ↔ КС-2']] as [View, string][]).map(([id, label]) => h('button', { key: id, type: 'button', role: 'tab', 'aria-selected': view === id,
            'data-view': id, className: 'pf-seg-btn' + (view === id ? ' pf-seg-btn--active' : ''), onClick: () => setView(id) }, label)))
      : null,
    view === 'ks2' && ks2 ? ks2(p) : h(WorkTypes, { api, p }));
}

function WorkTypes(props: { api: SummaryApi; p: SummaryProject }): ReactElement {
  const { api, p } = props;
  const [rows, setRows] = useState<SummaryWorkType[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const r = await api.workTypes(p.project_id);
      if (!r.ok) { setError(r.message); setRows([]); return; }
      setRows(r.value);
    })();
  }, [p.project_id]);

  if (rows === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  return h('div', { className: 'sm-wts', 'data-testid': 'sm-worktypes' },
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    !error && !rows.length ? h('div', { className: 'pf-card pj-empty pf-muted', 'data-testid': 'sm-wt-empty' }, 'В проекте нет позиций: они появляются после подтверждения ВОР.') : null,
    rows.map((w) => {
      const key = w.work_type_id || 'none';
      const isOpen = open === key;
      return h('div', { key, className: 'pf-card sm-wt', 'data-wt': key },
        h('div', { className: 'sm-wt-head' },
          h('b', { className: 'sm-wt-name' }, w.work_name),
          p.can_money && w.plan_money !== null && w.plan_money > 0
            ? h('span', { className: 'sm-wt-money', 'data-testid': 'sm-wt-money' }, `${rub(w.done_money)} из ${rub(w.plan_money)}`, w.pct_money !== null ? h('b', null, ` · ${pctText(w.pct_money)}`) : null)
            : null),
        w.units.map((u) => h('div', { key: u.unit, className: 'sm-unit', 'data-unit': u.unit },
          h('div', { className: 'sm-unit-nums' },
            h('span', { 'data-testid': 'sm-unit-fact' }, `факт ${fmtQty(u.fact)} из ${fmtQty(u.plan)} ${u.unit}`),
            h('b', { className: 'sm-unit-pct', 'data-testid': 'sm-unit-pct' }, pctText(u.pct)),
            h('span', { className: 'pf-muted' }, `остаток ${fmtQty(u.rest)}`),
            h('span', { className: 'pf-muted', 'data-testid': 'sm-unit-pace' }, `за 7 дн. ${fmtQty(u.fact7)} · за 14 дн. ${fmtQty(u.fact14)}`),
            u.pending ? h('span', { className: 'ft-warn' }, `ждёт подтверждения ${fmtQty(u.pending)}`) : null),
          h('div', { className: 'ft-bar', role: 'progressbar', 'aria-valuenow': Math.min(100, u.pct || 0), 'aria-valuemin': 0, 'aria-valuemax': 100 },
            h('div', { className: 'ft-bar-fill', style: { width: `${Math.min(100, u.pct || 0)}%` } })),
          h(ForecastCells, { x: u, th: { yellow: p.light_yellow_pp, red: p.light_red_pp } }))),
        p.can_money && w.unpriced_rows ? h('div', { className: 'ft-warn', 'data-testid': 'sm-wt-unpriced' }, `Строк без цены в договорной КП: ${w.unpriced_rows}`) : null,
        w.work_type_id && w.positions
          ? h('div', { className: 'pj-actions' }, h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'sm-wt-toggle', onClick: () => setOpen(isOpen ? null : key) },
              isOpen ? 'Скрыть позиции' : `Позиции по местам (${w.positions})`))
          : null,
        isOpen && w.work_type_id ? h(Positions, { api, projectId: p.project_id, workTypeId: w.work_type_id }) : null);
    }));
}

/** Три колонки прогноза одной ЕИ вида работ (числа — с сервера, 030). */
function ForecastCells(props: { x: ForecastNumbers; th: { yellow: number; red: number } }): ReactElement {
  const v = forecastView(props.x, props.th);
  return h('div', { className: 'sm-fc', 'data-testid': 'sm-unit-fc' },
    h('span', { className: 'sm-fc-cell' }, h('span', { className: 'sm-fc-label' }, 'Прогноз окончания'),
      h('b', { className: v.noPace ? 'pf-muted' : '', 'data-testid': 'sm-fc-finish' }, v.finish)),
    h('span', { className: 'sm-fc-cell' }, h('span', { className: 'sm-fc-label' }, 'Δ к финишу, дн.'),
      h('b', { className: 'sm-fc-num' + (v.late ? ' sm-fc-late' : ''), 'data-testid': 'sm-fc-delta', title: v.late ? 'Позже планового окончания объекта' : undefined }, v.delta)),
    h('span', { className: 'sm-fc-cell' }, h('span', { className: 'sm-fc-label' }, '% отклонения'),
      v.devTone ? h(StatusBadge, { status: v.devTone, label: v.dev, title: 'План % на сегодня − факт %', testId: 'sm-fc-dev' })
        : h('b', { 'data-testid': 'sm-fc-dev' }, v.dev)));
}

function Positions(props: { api: SummaryApi; projectId: string; workTypeId: string }): ReactElement {
  const { api, projectId, workTypeId } = props;
  const [rows, setRows] = useState<SummaryPosition[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void (async () => {
      const r = await api.positions(projectId, workTypeId);
      if (!r.ok) { setError(r.message); setRows([]); return; }
      setRows(r.value);
    })();
  }, [projectId, workTypeId]);
  if (rows === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  return h('div', { className: 'sm-pos', 'data-testid': 'sm-positions' },
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    h('div', { className: 'sm-prow sm-prow--head' }, h('span', null, 'Место'), h('span', { className: 'pf-num' }, 'План'), h('span', { className: 'pf-num' }, 'Факт'),
      h('span', { className: 'pf-num' }, '%'), h('span', { className: 'pf-num' }, 'Остаток'), h('span', { className: 'pf-num' }, '7 / 14 дн.'), h('span', { className: 'pf-num' }, 'Прогноз')),
    rows.map((x) => h('div', { key: x.position_id, className: 'sm-prow', 'data-position-id': x.position_id },
      h('span', { className: 'sm-place' }, x.location_path, x.pending_qty ? h('span', { className: 'ft-warn' }, ` · ждёт ${fmtQty(x.pending_qty)}`) : null),
      h('span', { className: 'pf-num', 'data-label': 'План' }, `${fmtQty(x.plan_qty)} ${x.unit_code}`),
      h('span', { className: 'pf-num', 'data-label': 'Факт' }, fmtQty(x.fact_qty)),
      h('b', { className: 'pf-num', 'data-label': '%', 'data-testid': 'sm-pos-pct' }, pctText(x.pct)),
      h('span', { className: 'pf-num', 'data-label': 'Остаток' }, fmtQty(x.rest_qty)),
      h('span', { className: 'pf-num', 'data-label': '7 / 14 дн.' }, `${fmtQty(x.fact7)} / ${fmtQty(x.fact14)}`),
      posForecast(x))));
}

/** Прогноз позиции в строке: дата (или «нет темпа» / «выполнено»), Δ к финишу — красным, если позже. */
function posForecast(x: SummaryPosition): ReactElement {
  const v = forecastView({ plan: x.plan_qty, fact: x.fact_qty, forecast_finish: x.forecast_finish, delta_days: x.delta_days, dev_pp: x.dev_pp }, { yellow: 0, red: 0 });
  return h('span', { className: 'pf-num', 'data-label': 'Прогноз', 'data-testid': 'sm-pos-fc' }, v.finish,
    v.late ? h('span', { className: 'sm-fc-late' }, ` (${v.delta} дн.)`) : null);
}

export const SUMMARY_PROJECT_CSS = `
.sm-project{display:flex;flex-direction:column;gap:12px}
.sm-wts{display:flex;flex-direction:column;gap:10px}
.sm-wt{display:flex;flex-direction:column;gap:8px;padding:12px 16px;overflow:visible}
.sm-wt-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;align-items:baseline}
.sm-wt-name{font-size:14px;overflow-wrap:anywhere}
.sm-wt-money{font-size:13px}
.sm-unit{display:flex;flex-direction:column;gap:4px}
.sm-unit-nums{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;font-size:13px}
.sm-unit-pct{font-size:15px}
.sm-pos{display:flex;flex-direction:column;border-top:1px solid var(--card-border)}
.sm-fc{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 12px;font-size:13px}
.sm-fc-cell{display:flex;flex-direction:column;gap:2px;min-width:0}
.sm-fc-label{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted)}
.sm-fc-late{color:var(--color-red)}
.sm-fc-num{font-variant-numeric:tabular-nums}
.sm-prow{display:grid;grid-template-columns:minmax(0,2.4fr) repeat(6,minmax(0,1fr));gap:4px 12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--card-border);font-size:13px}
.sm-prow:last-child{border-bottom:0}
.sm-prow--head{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted)}
.sm-place{overflow-wrap:anywhere}
@media (max-width:760px){
.sm-prow--head{display:none}
.sm-prow{grid-template-columns:minmax(0,1fr) minmax(0,1fr);padding:10px 0}
.sm-place{grid-column:1/-1;font-weight:700}
.sm-fc{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.sm-fc-cell:last-child{grid-column:1/-1}
.sm-prow .pf-num{text-align:left}
.sm-prow [data-label]::before{content:attr(data-label) ': ';font-size:11px;color:var(--text-muted);font-weight:400}
}
`;
