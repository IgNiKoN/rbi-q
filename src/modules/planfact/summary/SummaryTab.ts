/**
 * «План/Факт → Сводка» (P2-0008, P2-0010): дашборд руководителя — фильтр объекта и периода, дашборд объекта (плитки, графики,
 * корпуса, крупнейшие не начатые работы; ниже — виды работ, «Сделано ↔ КС-2», Excel), таблица объектов (сортировка по отставанию);
 * плановые даты проекта правит РП (право projects.manage). Все числа — с сервера (единый расчёт summary_project); без права money.view
 * сервер не присылает ₽, общий % и отставание.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { SummaryApi, SummaryProject } from './summary.service.ts';
import { LIGHT_LABEL, dateOr, lagDaysText, lightText, pctText, rub } from './model.ts';
import { ProjectView } from './ProjectView.ts';
import { Ks2Gap } from './Ks2Gap.ts';
import { Dashboard, PERIODS } from './Dashboard.ts';
import type { Period } from './Dashboard.ts';
import { StatusBadge } from '../../../platform/ui/index.ts';
import type { SummaryLinks } from './Attention.ts';
import { hashParam } from '../ProjectPicker.ts';

/** Порядок объектов: сначала самые отстающие (дни отставания с сервера), без данных — в конце. */
export function byLag(a: SummaryProject, b: SummaryProject): number {
  const x = a.lag_days, y = b.lag_days;
  if (x !== y) { if (x === null) return 1; if (y === null) return -1; return y - x; }
  return a.name.localeCompare(b.name, 'ru');
}

export function SummaryTab(props: { api: SummaryApi; save?: (b: Uint8Array, n: string) => void; links?: SummaryLinks }): ReactElement {
  const { api, save, links } = props;
  const [list, setList] = useState<SummaryProject[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [thresholds, setThresholds] = useState(false);
  // P2-0021: переход «Требует моего участия» → объект (p=…) и блок «Требует внимания» (focus=attention)
  const [sel, setSel] = useState(() => hashParam(window.location.hash, 'p') || 'all');
  const [focus] = useState(() => hashParam(window.location.hash, 'focus'));
  const [period, setPeriod] = useState<Period>(8);

  async function load(): Promise<void> {
    setError('');
    const r = await api.portfolio();
    if (!r.ok) { setError(r.message); setList([]); return; }
    setList(r.value);
    setSel((x) => (x === 'all' || r.value.some((p) => p.project_id === x) ? x : 'all'));   // объект из перехода, которого нет, — «Все объекты»
  }
  useEffect(() => { void load(); }, []);
  // Блок «Требует внимания» появляется после загрузки панели объекта — ждём его до ~2 с, прокручиваем, пока он не окажется вверху.
  useEffect(() => {
    if (focus !== 'attention' || list === null) return undefined;
    let n = 0; let t: ReturnType<typeof setTimeout> | undefined;
    const attempt = (): void => {
      const el = document.querySelector('[data-testid="sm-attention"]') as (HTMLElement & { scrollIntoView?: (o?: object) => void }) | null;
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'start' });
        if (Math.abs(el.getBoundingClientRect().top) < 40) return;
      }
      if (++n < 8) t = setTimeout(attempt, 250);
    };
    attempt();
    return () => { if (t) clearTimeout(t); };
  }, [focus, list]);

  if (list === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  const sorted = [...list].sort(byLag);
  const opened = sel === 'all' ? (list.length === 1 ? list[0] : null) : list.find((p) => p.project_id === sel) || null;
  const pick = (id: string): void => { setEditing(false); setThresholds(false); setSel(id); };
  const chip = (on: boolean, label: string, onClick: () => void, key: string, testId?: string) =>
    h('button', { key, type: 'button', className: 'sm-chip' + (on ? ' sm-chip--on' : ''), 'aria-pressed': on, 'data-testid': testId, onClick }, label);
  const filters = list.length
    ? h('div', { className: 'sm-filters', 'data-testid': 'sm-filters' },
        h('div', { className: 'sm-chips', role: 'group', 'aria-label': 'Объект' },
          h('span', { className: 'pf-muted sm-flabel' }, 'Объект'),
          chip(sel === 'all', `Все объекты (${list.length})`, () => pick('all'), 'all', 'sm-chip-all'),
          sorted.map((p) => chip(sel === p.project_id, p.name, () => pick(p.project_id), p.project_id, 'sm-chip-project'))),
        h('div', { className: 'sm-chips', role: 'group', 'aria-label': 'Период' },
          h('span', { className: 'pf-muted sm-flabel' }, 'Период'),
          PERIODS.map((w) => chip(period === w, `${w} недель`, () => setPeriod(w), String(w), 'sm-chip-period'))))
    : null;
  const dash = (p: SummaryProject): ReactElement => h('div', { className: 'sm-dash' },
    h(Dashboard, { api, p, period, links, onDates: p.can_manage ? () => setEditing(true) : undefined, actions: p.can_manage || p.can_thresholds
      ? [p.can_manage ? h('button', { key: 'd', type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'sm-dates-btn', onClick: () => setEditing(!editing) }, editing ? 'Закрыть даты' : 'Даты проекта') : null,
         p.can_thresholds ? h('button', { key: 't', type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'sm-th-btn', onClick: () => setThresholds(!thresholds) }, thresholds ? 'Закрыть пороги' : 'Пороги светофора') : null]
      : null }),
    editing && p.can_manage ? h(DatesForm, { api, p, onSaved: () => { setEditing(false); void load(); } }) : null,
    thresholds && p.can_thresholds ? h(ThresholdsForm, { api, p, onSaved: () => { setThresholds(false); void load(); } }) : null);
  return h('div', { className: 'pj-tab sm-tab', 'data-testid': 'sm-tab' },
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    !error && !list.length ? h('div', { className: 'pf-card pj-empty pf-muted', 'data-testid': 'sm-empty' }, 'Нет объектов: сводка видна по проектам, где у вас есть право просмотра факта.') : null,
    filters,
    opened
      ? h(ProjectView, { key: opened.project_id, api, p: opened, card: dash(opened), onBack: list.length > 1 ? () => pick('all') : undefined,
          ks2: (x) => h(Ks2Gap, { api, p: x }), save })
      : null,
    list.length && (!opened || list.length > 1) ? h(Objects, { list: sorted, onOpen: pick }) : null);
}

/** Таблица объектов: статус (светофор ТЗ 8.2), готовность, отставание в днях, сделано, не выставлено, прогноз — сверху самые отстающие. */
function Objects(props: { list: SummaryProject[]; onOpen: (id: string) => void }): ReactElement {
  const { list, onOpen } = props;
  const anyMoney = list.some((p) => p.can_money);
  return h('section', { className: 'p2-chart sm-objects', 'data-testid': 'sm-objects', 'aria-label': 'Объекты' },
    h('h2', { className: 'p2-chart__title' }, 'Объекты'),
    anyMoney ? null : h('div', { className: 'pf-muted sm-note', 'data-testid': 'sm-nomoney-list' }, 'Суммы в рублях, общий % и отставание видят РП, ПТО, экономист и руководство.'),
    h('div', { className: 'p2-chart__body' }, h('table', { className: 'p2-chart__table sm-otable' },
      h('thead', null, h('tr', null, ['Объект', 'Статус', 'Готовность', 'Отставание', 'Сделано', 'Не выставлено', 'Прогноз'].map((c) => h('th', { key: c, scope: 'col' }, c)))),
      h('tbody', null, list.map((p) => h('tr', { key: p.project_id, 'data-project-id': p.project_id },
        h('td', null, h('button', { type: 'button', className: 'sm-olink', 'data-testid': 'sm-open', onClick: () => onOpen(p.project_id) }, p.name)),
        h('td', null, h(StatusBadge, { status: p.light, label: LIGHT_LABEL[p.light], title: lightText(p), testId: 'sm-olight' })),
        h('td', null, pctText(p.pct_money)),
        h('td', { 'data-testid': 'sm-olag' }, lagDaysText(p.lag_days)),
        h('td', null, rub(p.done_money)),
        h('td', null, rub(p.gap_money)),
        h('td', null, dateOr(p.forecast_finish))))))));
}

function DatesForm(props: { api: SummaryApi; p: SummaryProject; onSaved: () => void }): ReactElement {
  const { api, p, onSaved } = props;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    if (busy) return;
    const f = ev.currentTarget as HTMLFormElement;
    const val = (k: string): string | null => (f.elements.namedItem(k) as HTMLInputElement).value.trim() || null;
    const start = val('start'), finish = val('finish');
    if (start && finish && start > finish) { setError('Дата начала позже даты окончания'); return; }
    setBusy(true); setError('');
    const r = await api.setDates(p.project_id, start, finish);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onSaved();
  }
  return h('form', { className: 'pj-form sm-dates', onSubmit: (e: FormEvent) => { void submit(e); }, 'data-testid': 'sm-dates-form' },
    h('label', { className: 'pf-field' }, 'Плановое начало', h('input', { name: 'start', type: 'date', className: 'pj-input', defaultValue: p.planned_start || '', 'data-testid': 'sm-start' })),
    h('label', { className: 'pf-field' }, 'Плановое окончание', h('input', { name: 'finish', type: 'date', className: 'pj-input', defaultValue: p.planned_finish || '', 'data-testid': 'sm-finish' })),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    h('div', { className: 'pj-actions' }, h('button', { type: 'submit', className: 'pf-btn', disabled: busy, 'data-testid': 'sm-dates-save' }, 'Сохранить')));
}

/** Пороги светофора объекта (ТЗ 8.2 «пороги в настройках объекта»): у кого право planfact.thresholds.edit (РП, руководство). Проверяет сервер. */
function ThresholdsForm(props: { api: SummaryApi; p: SummaryProject; onSaved: () => void }): ReactElement {
  const { api, p, onSaved } = props;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    if (busy) return;
    const f = ev.currentTarget as HTMLFormElement;
    const num = (k: string): number => Number(String((f.elements.namedItem(k) as HTMLInputElement).value).replace(',', '.'));
    const y = num('yellow'), r = num('red'), d = num('days');
    if (![y, r, d].every(Number.isFinite) || y < 0 || y >= r || r > 100 || d < 0 || d > 60 || !Number.isInteger(d)) {
      setError('Пороги: 0 ≤ жёлтый < красный ≤ 100 п.п., дни — целое число от 0 до 60'); return;
    }
    setBusy(true); setError('');
    const res = await api.setThresholds(p.project_id, y, r, d);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    onSaved();
  }
  const field = (name: string, label: string, value: number, step: string) => h('label', { className: 'pf-field' }, label,
    h('input', { name, type: 'number', inputMode: 'decimal', min: 0, max: name === 'days' ? 60 : 100, step, className: 'pj-input', defaultValue: String(value), 'data-testid': `sm-th-${name}` }));
  return h('form', { className: 'pf-card pj-form sm-th', onSubmit: (e: FormEvent) => { void submit(e); }, 'data-testid': 'sm-th-form' },
    h('b', null, 'Пороги светофора объекта'),
    h('div', { className: 'pf-muted sm-note' }, 'Зелёный — отставание не больше жёлтого порога и меньше порога дней; жёлтый — между порогами, или отставание не меньше порога дней, ',
      'или до окончания ≤ 5 рабочих дней при отставании больше жёлтого порога; красный — больше красного порога или срок прошёл, а сделано меньше 100 %.'),
    h('div', { className: 'sm-dates' },
      field('yellow', 'Жёлтый порог, п.п.', p.light_yellow_pp, '0.1'),
      field('red', 'Красный порог, п.п.', p.light_red_pp, '0.1'),
      field('days', 'Порог дней отставания', p.light_overdue_days, '1')),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    h('div', { className: 'pj-actions' }, h('button', { type: 'submit', className: 'pf-btn', disabled: busy, 'data-testid': 'sm-th-save' }, 'Сохранить')));
}

export const SUMMARY_CSS = `
.sm-tab{max-width:1400px;display:flex;flex-direction:column;gap:14px}
.sm-note{font-size:12px}
.sm-filters{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px}
.sm-chips{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
.sm-flabel{font-size:12px;margin-right:2px}
.sm-chip{font:inherit;font-size:12px;font-weight:600;padding:8px 14px;min-height:40px;border-radius:999px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sm-chip--on{background:var(--primary);border-color:var(--primary);color:var(--card-bg)}
.sm-chip:focus-visible,.sm-olink:focus-visible{outline:2px solid var(--p2-chart-fact);outline-offset:2px}
.sm-dash{display:flex;flex-direction:column;gap:12px}
.sm-olink{font:inherit;font-weight:600;color:var(--text-main);background:none;border:0;padding:6px 0;min-height:32px;cursor:pointer;text-align:left;text-decoration:underline;text-underline-offset:3px}
.sm-otable{min-width:720px}
.sm-dates{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:flex-end}
.sm-th{display:flex;flex-direction:column;gap:10px;padding:14px 16px}
@media (max-width:760px){
/* P2-0030: nowrap — колонка с переносом растягивала ряд кнопок по самому длинному, правые обрезались; теперь ряд = ширине экрана и листается */
.sm-filters{flex-direction:column;flex-wrap:nowrap;align-items:stretch}
.sm-chips{flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px}
.sm-chip{flex-shrink:0}
.sm-dates .pf-field{flex:1 1 140px}
}
`;
