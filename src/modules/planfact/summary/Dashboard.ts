/**
 * Сводка → дашборд объекта руководителя (P2-0010, макет одобрен владельцем 22.10.2026): плитки (план, сделано и «по плану сегодня»,
 * выставлено КС-2, сделано не выставлено, отставание в днях и светофор по ТЗ 8.2, прогноз), график «план/факт» нарастающим итогом,
 * «сделано за неделю» с линией нужного темпа, трендом и вердиктом, готовность по корпусам, крупнейшие не начатые работы.
 * Все числа — с сервера (summary_project, pf_summary_weekly / places / worktypes); экран только рисует. Компоненты и цвета —
 * дизайн-система Platform 2.0 (src/platform/ui). Без права money.view сервер не присылает ₽ — рублёвые плитки и графики не рисуются.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { SummaryApi, SummaryPlace, SummaryPosition, SummaryProject, SummaryWeek, SummaryWorkType } from './summary.service.ts';
import { Attention } from './Attention.ts';
import type { SummaryLinks } from './Attention.ts';
import { LIGHT_LABEL, dateOr, lagDaysText, lightText, pctText, rub, rubDay, verdictText } from './model.ts';
import { BarChart, ChartCard, KpiTile, LineChart, ProgressBar, StatusBadge, compactNumber, compactRub, dayMonth, daysBetween } from '../../../platform/ui/index.ts';
import { fmtQty, todayMoscow } from '../fact/fact.ts';

export const PERIODS = [4, 8, 12] as const;
export type Period = (typeof PERIODS)[number];

/** Сколько недель запросить для графика: от плановой даты начала до сегодня (не меньше периода столбцов, не больше 52). */
export function weeksFor(p: Pick<SummaryProject, 'planned_start'>, today: string, period: number): number {
  const since = p.planned_start && p.planned_start <= today ? Math.ceil((daysBetween(p.planned_start, today) + 1) / 7) : 0;
  return Math.min(52, Math.max(period, since));
}
const unitsText = (u: { unit: string; qty: number }[]): string => u.map((x) => `${fmtQty(x.qty)} ${x.unit}`).join(', ');

export function Dashboard(props: { api: SummaryApi; p: SummaryProject; period: Period; actions?: ReactNode; links?: SummaryLinks; onDates?: () => void }): ReactElement {
  const { api, p, period, actions, links, onDates } = props;
  const [weeks, setWeeks] = useState<SummaryWeek[] | null>(null);
  const [places, setPlaces] = useState<SummaryPlace[] | null>(null);
  const [works, setWorks] = useState<SummaryWorkType[] | null>(null);
  const [error, setError] = useState('');
  const today = todayMoscow();
  const n = weeksFor(p, today, period);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [w, pl, wt] = await Promise.all([api.weekly(p.project_id, n), api.places(p.project_id, null), api.workTypes(p.project_id)]);
      if (!alive) return;
      setError(!w.ok ? w.message : !pl.ok ? pl.message : !wt.ok ? wt.message : '');
      setWeeks(w.ok ? w.value : []); setPlaces(pl.ok ? pl.value : []); setWorks(wt.ok ? wt.value : []);
    })();
    return () => { alive = false; };
  }, [p.project_id, n, p.planned_start, p.planned_finish]);

  const m = p.can_money;
  const badge = h(StatusBadge, { status: p.light, label: LIGHT_LABEL[p.light], title: lightText(p), testId: 'sm-light' });
  return h('div', { className: 'db', 'data-testid': 'sm-dashboard', 'data-project-id': p.project_id },
    h('div', { className: 'db-head' },
      h('div', { className: 'db-title' }, h('b', null, p.name), p.code ? h('span', { className: 'pf-muted' }, ` · ${p.code}`) : null),
      badge,
      actions ? h('div', { className: 'pj-actions db-actions' }, actions) : null),
    h('div', { className: 'pf-muted db-why', 'data-testid': 'sm-why' }, lightText(p)),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    m ? null : h('div', { className: 'pf-muted sm-note', 'data-testid': 'sm-nomoney' },
      'Суммы в рублях, общий % и отставание видят РП, ПТО, экономист и руководство. Объёмы — в «Видах работ» ниже.'),
    h(Tiles, { p }),
    m && weeks ? h('div', { className: 'db-row' }, h(PlanFactChart, { p, weeks, today }), h(PlacesPanel, { api, p, places })) : h(PlacesPanel, { api, p, places }),
    m && weeks ? h('div', { className: 'db-row' }, h(WeeksChart, { p, weeks: weeks.slice(-period) }), h(NotStarted, { works })) : null,
    !m && weeks ? h(WeeksVolume, { weeks: weeks.slice(-period) }) : null,
    h(Attention, { api, p, links, onDates }));
}

function Tiles(props: { p: SummaryProject }): ReactElement {
  const { p } = props;
  const tone = p.light === 'red' || p.light === 'yellow' ? p.light : undefined;
  const dates = p.planned_start || p.planned_finish ? `${dateOr(p.planned_start)} — ${dateOr(p.planned_finish)}` : 'не заданы';
  if (!p.can_money) {
    return h('section', { className: 'db-tiles db-tiles--4', 'aria-label': 'Итоги' },
      h(KpiTile, { label: 'По плану на сегодня', value: pctText(p.plan_pct_today), metric: 'plan-today', hint: 'равномерно от начала до окончания' }),
      h(KpiTile, { label: 'Плановые сроки', value: dates, metric: 'dates', hint: p.days_left !== null && p.days_left > 0 ? `до окончания ${p.days_left} дн.` : undefined }),
      h(KpiTile, { label: 'Темп', value: verdictText(p.pace_verdict), metric: 'verdict', hint: 'за 7 дней против 14 дней' }),
      h(KpiTile, { label: 'Позиций ВОР', value: String(p.positions), metric: 'positions', hint: p.pending ? `ждут подтверждения: ${p.pending}` : undefined }));
  }
  return h('section', { className: 'db-tiles', 'aria-label': 'Итоги' },
    h(KpiTile, { label: 'План по договорной КП', value: compactRub(p.plan_money), metric: 'plan', hint: `${rub(p.plan_money)} · ${p.positions} позиций` }),
    h(KpiTile, { label: 'Сделано', value: compactRub(p.done_money), metric: 'done', hint: h('span', { 'data-testid': 'sm-pct' }, `${pctText(p.pct_money)} готовности · по плану сегодня ${pctText(p.plan_pct_today)}`) },
      h(ProgressBar, { value: p.pct_money, marker: p.plan_pct_today, label: 'Готовность по деньгам договорной КП', markerLabel: 'по плану сегодня' })),
    h(KpiTile, { label: 'Выставлено в КС-2', value: compactRub(p.issued_money), metric: 'issued', hint: rub(p.issued_money) }),
    h(KpiTile, { label: 'Сделано, не выставлено', value: compactRub(p.gap_money), metric: 'gap', hint: 'можно включить в следующий акт КС-2' }),
    h(KpiTile, { label: 'Отставание', value: lagDaysText(p.lag_days), metric: 'lag', tone,
      hint: p.lag_pp !== null ? `${p.lag_pp.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} п.п. от плана на сегодня` : 'нужны КП, цены и даты' },
      h(StatusBadge, { status: p.light, label: LIGHT_LABEL[p.light], title: lightText(p) })),
    h(KpiTile, { label: 'Прогноз окончания', value: dateOr(p.forecast_finish), metric: 'forecast', hint: `план ${dateOr(p.planned_finish, 'не задан')}` }));
}

function PlanFactChart(props: { p: SummaryProject; weeks: SummaryWeek[]; today: string }): ReactElement {
  const { p, weeks, today } = props;
  const start = p.planned_start || (weeks[0] ? weeks[0].week_start : today);
  const end = p.planned_finish && p.planned_finish > today ? p.planned_finish : today;
  const fact = weeks.filter((w) => w.done_money_cum !== null).map((w) => ({ x: w.week_end, y: w.done_money_cum as number }));
  if (p.planned_start && weeks[0] && weeks[0].week_start > p.planned_start) fact.unshift({ x: weeks[0].week_start, y: (weeks[0].done_money_cum || 0) - (weeks[0].done_money || 0) });
  else if (p.planned_start && fact.length) fact.unshift({ x: p.planned_start, y: 0 });
  const plan = p.planned_start && p.planned_finish && p.plan_money !== null ? [{ x: p.planned_start, y: 0 }, { x: p.planned_finish, y: p.plan_money }] : [];
  const byEnd = new Map(weeks.map((w) => [w.week_end, w]));
  const tipAt = (x: string): string => {
    const w = byEnd.get(x);
    if (!w) return '';
    const base = `на ${dateOr(x)}: план ${rub(w.plan_money_cum)} · факт ${rub(w.done_money_cum)}`;
    return x === today && p.lag_days !== null ? `${base} · отставание ${lagDaysText(p.lag_days)}` : base;
  };
  return h('div', { className: 'db-main' }, h(ChartCard, {
    title: 'Накопительно: план и факт, ₽', testId: 'sm-chart-pf',
    legend: [{ label: 'План', kind: 'plan', mark: 'dash' }, { label: 'Факт', kind: 'fact' }],
    table: { head: ['Неделя до', 'План, ₽', 'Факт, ₽', 'Выставлено, ₽'], rows: weeks.map((w) => [dateOr(w.week_end), rub(w.plan_money_cum), rub(w.done_money_cum), rub(w.issued_money_cum)]) },
    note: p.planned_start && p.planned_finish
      ? `Плановая линия — равномерно от ${dateOr(p.planned_start)} до ${dateOr(p.planned_finish)} (графика работ ещё нет; с ГПР линия станет точной).`
      : 'Плановой линии нет: укажите плановые даты проекта.',
  }, h(LineChart, { ariaLabel: `План ${compactRub(p.plan_money)} к ${dateOr(p.planned_finish)}, факт ${compactRub(p.done_money)} на ${dateOr(today)}`,
    start, end, today, yFormat: compactNumber, hoverX: weeks.map((w) => w.week_end), tipAt, defaultTip: tipAt(today) || 'Наведите на график или нажмите — план и факт на дату',
    series: [{ id: 'plan', label: 'План', kind: 'plan', dashed: true, points: plan }, { id: 'fact', label: 'Факт', kind: 'fact', points: fact }] })));
}

function WeeksChart(props: { p: SummaryProject; weeks: SummaryWeek[] }): ReactElement {
  const { p, weeks } = props;
  const need = p.need_pace !== null ? Math.round(p.need_pace * 7) : null;   // ₽ в день (сервер) → в неделю
  const bars = weeks.map((w) => ({ key: w.week_end, label: dayMonth(w.week_start), value: w.done_money || 0,
    tip: `${dateOr(w.week_start)} — ${dateOr(w.week_end)}: сделано ${rub(w.done_money)}${w.units.length ? ` (${unitsText(w.units)})` : ''}` }));
  return h('div', { className: 'db-main' }, h(ChartCard, {
    title: 'Сделано за неделю, ₽', testId: 'sm-chart-weeks',
    legend: need ? [{ label: 'Сделано', kind: 'fact', mark: 'bar' }, { label: 'Нужно в неделю', kind: 'plan', mark: 'dash' }, { label: 'Тренд', kind: 'reference', mark: 'dash' }] : undefined,
    table: { head: ['Неделя', 'Сделано, ₽', 'Объём'], rows: weeks.map((w) => [`${dateOr(w.week_start)} — ${dateOr(w.week_end)}`, rub(w.done_money), unitsText(w.units) || '—']) },
    note: h('span', { 'data-testid': 'sm-verdict' }, h('b', null, verdictText(p.pace_verdict)), ` · за 7 дней ${rubDay(p.pace7)}, за 14 дней ${rubDay(p.pace14)}`,
      p.need_pace !== null ? `, нужно ${rubDay(p.need_pace)}` : ''),
  }, h(BarChart, { ariaLabel: `Сделано по неделям за ${weeks.length} нед.${need ? `; нужно ${compactRub(need)} в неделю` : ''}`, bars, yFormat: compactNumber, trend: true,
    reference: need ? { value: need, label: `нужно ${compactNumber(need)} в неделю` } : null, defaultTip: 'Наведите на столбец или нажмите — сделано за неделю' })));
}

function WeeksVolume(props: { weeks: SummaryWeek[] }): ReactElement {
  return h(ChartCard, { title: 'Сделано за неделю (объёмы)', testId: 'sm-weeks-volume' },
    h('table', { className: 'p2-chart__table' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Неделя'), h('th', { scope: 'col' }, 'Объём'))),
      h('tbody', null, props.weeks.map((w) => h('tr', { key: w.week_end }, h('td', null, `${dateOr(w.week_start)} — ${dateOr(w.week_end)}`), h('td', null, unitsText(w.units) || '—'))))));
}

interface Crumb { id: string; name: string; node_type: string; here: number }

/** Готовность по местам с проваливанием: корпус → секция → этаж → позиции (pf_summary_places, pf_summary_positions). */
function PlacesPanel(props: { api: SummaryApi; p: SummaryProject; places: SummaryPlace[] | null }): ReactElement {
  const { api, p } = props;
  const [path, setPath] = useState<Crumb[]>([]);
  const [rows, setRows] = useState<SummaryPlace[] | null>(null);
  const [pos, setPos] = useState<SummaryPosition[] | null>(null);
  const [error, setError] = useState('');
  const node = path.length ? path[path.length - 1] : null;
  useEffect(() => {
    let alive = true;
    setError('');
    if (!node) { setRows(props.places); setPos(null); return; }
    setRows(null); setPos(null);
    void (async () => {
      const [r, ps] = await Promise.all([api.places(p.project_id, node.id), node.here ? api.positions(p.project_id, null) : Promise.resolve(null)]);
      if (!alive) return;
      const bad = !r.ok ? r.message : ps && !ps.ok ? ps.message : '';
      if (bad) setError(bad);
      setRows(r.ok ? r.value : []);
      setPos(ps && ps.ok ? ps.value.filter((x) => x.location_id === node.id) : null);
    })();
    return () => { alive = false; };
  }, [node ? node.id : '', props.places]);
  const open = (x: SummaryPlace): void => setPath([...path, { id: x.location_id, name: x.name, node_type: x.node_type, here: x.here_positions }]);
  const list = node ? rows : props.places;
  return h('section', { className: 'p2-chart db-side', 'data-testid': 'sm-places', 'aria-label': 'Готовность по местам' },
    h('h2', { className: 'p2-chart__title' }, 'Готовность по местам'),
    path.length ? h('nav', { className: 'db-crumbs', 'aria-label': 'Путь', 'data-testid': 'sm-crumbs' },
      h('button', { type: 'button', className: 'db-crumb', onClick: () => setPath([]) }, 'Все'),
      path.map((c, i) => h('span', { key: c.id }, ' › ', i === path.length - 1 ? h('b', null, c.name)
        : h('button', { type: 'button', className: 'db-crumb', onClick: () => setPath(path.slice(0, i + 1)) }, c.name)))) : null,
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    list === null ? h('div', { className: 'pf-muted' }, 'Загрузка…')
      : !list.length && !node ? h('div', { className: 'pf-muted' }, 'Мест в проекте нет.')
      : list.map((x) => h('div', { key: x.location_id, className: 'db-place', 'data-location-id': x.location_id },
          h('div', { className: 'db-place-head' },
            x.positions ? h('button', { type: 'button', className: 'db-crumb db-open', 'data-testid': 'sm-place-open', onClick: () => open(x) }, x.name) : h('b', null, x.name),
            h('span', { className: 'p2-num' }, p.can_money ? pctText(x.pct_money) : `${x.positions} поз.`)),
          p.can_money ? h(ProgressBar, { value: x.pct_money, label: `Готовность: ${x.name}` }) : null,
          h('span', { className: 'pf-muted p2-num db-place-sub' }, p.can_money && x.plan_money !== null
            ? `${compactRub(x.done_money)} из ${compactRub(x.plan_money)} · ${x.positions} поз.`
            : x.units.map((u) => `${fmtQty(u.fact)} из ${fmtQty(u.plan)} ${u.unit}`).join(' · ') || 'позиций нет'))),
    node && node.here && node.node_type === 'building'
      ? h('div', { className: 'ft-warn', 'data-testid': 'sm-not-split' }, `Объёмы не разнесены по этажам: ${node.here} поз. записаны на корпус целиком. Разнесение по этажам — в блоке прораба.`)
      : null,
    node && pos && pos.length ? h('div', { className: 'db-pos', 'data-testid': 'sm-place-positions' },
      h('span', { className: 'pf-muted db-small' }, `Позиции на уровне «${node.name}»: ${pos.length}`),
      h('ul', null, pos.map((x) => h('li', { key: x.position_id, 'data-position-id': x.position_id },
        h('span', { className: 'db-ellipsis' }, x.work_name), h('span', { className: 'p2-num' }, `${fmtQty(x.fact_qty)} из ${fmtQty(x.plan_qty)} ${x.unit_code} · ${pctText(x.pct)}`))))) : null,
    !node && p.can_money ? h('div', { className: 'db-pace' },
      h('span', { className: 'pf-muted' }, 'Темп'),
      h('div', { className: 'db-pace-row' }, h('span', null, 'За 14 дней'), h('b', { className: 'p2-num' }, rubDay(p.pace14))),
      h('div', { className: 'db-pace-row' }, h('span', null, `Нужно до ${dateOr(p.planned_finish, '—')}`), h('b', { className: 'p2-num' }, rubDay(p.need_pace))),
      h('b', { className: 'db-verdict' }, verdictText(p.pace_verdict))) : null);
}

function NotStarted(props: { works: SummaryWorkType[] | null }): ReactElement {
  const list = (props.works || []).filter((w) => (w.done_money || 0) === 0 && (w.plan_money || 0) > 0)
    .sort((a, b) => (b.plan_money || 0) - (a.plan_money || 0)).slice(0, 6);
  const top = list.length ? list[0].plan_money || 1 : 1;
  return h('section', { className: 'p2-chart db-side', 'data-testid': 'sm-not-started', 'aria-label': 'Крупнейшие работы, ещё не начаты' },
    h('h2', { className: 'p2-chart__title' }, 'Крупнейшие работы, ещё не начаты'),
    h('span', { className: 'pf-muted db-small' }, 'По стоимости в договорной КП'),
    !list.length ? h('div', { className: 'pf-muted' }, 'Все виды работ начаты.') : null,
    list.map((w) => h('div', { key: w.work_type_id || 'none', className: 'db-place' },
      h('div', { className: 'db-place-head' }, h('span', { className: 'db-ellipsis' }, w.work_name), h('b', { className: 'p2-num' }, compactRub(w.plan_money))),
      h(ProgressBar, { value: ((w.plan_money || 0) / top) * 100, label: `Доля от крупнейшей: ${w.work_name}` }))));
}

export const DASHBOARD_CSS = `
.db{display:flex;flex-direction:column;gap:14px}
.db-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}
.db-title{font-size:16px;min-width:0;overflow-wrap:anywhere}
.db-actions{margin-left:auto}
.db-why{font-size:12px;margin-top:-8px}
.db-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
@media (min-width:1500px){.db-tiles{grid-template-columns:repeat(6,minmax(0,1fr))}}
.db-tiles.db-tiles--4{grid-template-columns:repeat(4,minmax(0,1fr))}
.db-row{display:flex;flex-wrap:wrap;gap:14px}
.db-main{flex:999 1 600px;min-width:0;display:flex;flex-direction:column}
.db-main>.p2-chart{flex:1}
.db-side{flex:1 1 300px;min-width:0}
.db-place{display:flex;flex-direction:column;gap:6px}
.db-place-head{display:flex;justify-content:space-between;gap:8px;font-size:13px;min-width:0}
.db-place-head>:last-child{white-space:nowrap;flex-shrink:0}
.db-place-sub,.db-small{font-size:12px}
.db-ellipsis{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.db-pace{border-top:1px solid var(--card-border);padding-top:12px;display:flex;flex-direction:column;gap:8px;font-size:13px}
.db-pace-row{display:flex;justify-content:space-between;gap:8px}
.db-verdict{font-size:13px}
.db-crumbs{font-size:12px;color:var(--text-muted);overflow-wrap:anywhere}
.db-crumb{font:inherit;color:var(--text-main);background:none;border:0;padding:6px 0;min-height:32px;cursor:pointer;text-decoration:underline;text-underline-offset:3px;text-align:left}
.db-open{font-weight:700;font-size:13px;padding:2px 0;min-height:28px;min-width:0;overflow-wrap:anywhere}
.db-crumb:focus-visible{outline:2px solid var(--p2-chart-fact);outline-offset:2px}
.db-pos ul{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:4px;max-height:320px;overflow:auto;font-size:12px}
.db-pos li{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid var(--card-border);padding:4px 0}
.db-pos li>:last-child{white-space:nowrap;flex-shrink:0}
@media (max-width:760px){
.db-tiles,.db-tiles.db-tiles--4{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
.db-actions{margin-left:0}
.db-main,.db-side{flex-basis:100%}
}
`;
