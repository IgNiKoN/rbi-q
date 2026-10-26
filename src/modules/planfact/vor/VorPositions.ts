/**
 * Позиции ВОР проекта (P2-0006, этап 6): «место (полный путь) · вид работ · ЕИ · объём · пометка» — только чтение для всех
 * членов проекта; фильтр по месту (узел и его потомки — на сервере, pf_vor_positions). Сверка: Σ позиций = объём строки заказчика.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import type { VorApi, VorPosition, VorRow } from './vor.service.ts';

export interface SumResult { rows: number; ok: number; bad: { row_no: number; expected: number; actual: number }[] }

/** Σ объёмов позиций по строке заказчика = объём строки (связки 1:1 в этом блоке; доли — на сервере). */
export function sumByRow(rows: Pick<VorRow, 'row_no' | 'kind' | 'qty'>[], positions: Pick<VorPosition, 'source_row_no' | 'qty'>[]): SumResult {
  const sum = new Map<number, number>();
  for (const p of positions) if (p.source_row_no !== null) sum.set(p.source_row_no, (sum.get(p.source_row_no) || 0) + Number(p.qty));
  const works = rows.filter((r) => r.kind === 'work');
  const bad: SumResult['bad'] = [];
  for (const r of works) {
    const actual = Math.round((sum.get(r.row_no) || 0) * 1e6) / 1e6;
    const expected = Number(r.qty || 0);
    if (Math.abs(actual - expected) > 1e-6) bad.push({ row_no: r.row_no, expected, actual });
  }
  return { rows: works.length, ok: works.length - bad.length, bad };
}

/** Порядок мест по номерам: «Корпус 7» раньше «Корпус 10». */
const byPath = (a: string, b: string): number => a.localeCompare(b, 'ru', { numeric: true });
const sortPositions = (list: VorPosition[]): VorPosition[] => list.slice().sort((x, y) => byPath(x.location_path, y.location_path) || byPath(x.work_type, y.work_type));

const fmt = (n: number): string => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 3 });

export function VorPositions(props: { api: VorApi; projectId: string; importId?: string; rows?: VorRow[] }): ReactElement {
  const { api, projectId, importId, rows } = props;
  const [all, setAll] = useState<VorPosition[] | null>(null);
  const [place, setPlace] = useState('');
  const [list, setList] = useState<VorPosition[] | null>(null);

  useEffect(() => { void api.positions(projectId, null).then((p) => { const mine = sortPositions(importId ? p.filter((x) => x.import_id === importId) : p); setAll(mine); setList(mine); }); }, [projectId, importId]);

  async function filter(loc: string): Promise<void> {
    setPlace(loc);
    if (!loc) { setList(all); return; }
    setList(null);
    const p = await api.positions(projectId, loc);
    setList(sortPositions(importId ? p.filter((x) => x.import_id === importId) : p));
  }

  if (all === null) return h('div', { className: 'pf-muted' }, 'Загрузка позиций…');
  const places = Array.from(new Map(all.map((p) => [p.location_id, p.location_path])).entries()).sort((a, b) => byPath(a[1], b[1]));
  const check = rows ? sumByRow(rows, all) : null;

  return h('div', { className: 'pj-tab', 'data-testid': 'vor-positions' },
    h('h3', { className: 'pf-title un-title' }, importId ? 'Позиции этой загрузки' : 'Позиции ВОР проекта'),
    check
      ? h('div', { className: 'vor-stat ' + (check.bad.length ? 'vor-stat--bad' : 'vor-stat--ok'), 'data-testid': 'vor-sum-check' },
          check.bad.length ? `Суммы не сходятся: ${check.bad.length} строк из ${check.rows}` : `Суммы сходятся: Σ позиций = объём строки заказчика (${check.ok} из ${check.rows})`)
      : null,
    all.length
      ? h('label', { className: 'pf-field' }, 'Место',
          h('select', { className: 'pj-input', value: place, 'data-testid': 'vor-pos-place', onChange: (e: ChangeEvent<HTMLSelectElement>) => { void filter(e.currentTarget.value); } },
            h('option', { value: '' }, `Все места (${all.length} позиций)`),
            places.map(([id, path]) => h('option', { key: id, value: id }, path))))
      : null,
    list === null
      ? h('div', { className: 'pf-muted' }, 'Загрузка…')
      : h('div', { className: 'pf-card vor-list', 'data-testid': 'vor-pos-list' },
          list.length
            ? list.map((p) => h('div', { key: p.id, className: 'vor-prow', 'data-position': p.id },
                h('span', { className: 'vor-prow-place' }, p.location_path, p.apartments_note ? h('span', { className: 'pf-muted' }, ' · ' + p.apartments_note) : null),
                h('span', { className: 'vor-prow-name' }, p.work_type),
                h('span', { className: 'pf-unit' }, p.unit_code),
                h('span', { className: 'pf-num' }, fmt(p.qty))))
            : h('div', { className: 'pj-empty pf-muted', 'data-testid': 'vor-pos-empty' }, 'Позиций пока нет — подтвердите загрузку ВОР.')));
}

export const VOR_POSITIONS_CSS = `
.vor-prow{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1.6fr) 64px 110px;gap:10px;align-items:start;padding:9px 14px;border-bottom:1px solid var(--card-border);font-size:13px}
.vor-prow:last-child{border-bottom:0}
.vor-prow-place{overflow-wrap:anywhere;font-size:12px}
.vor-prow-name{overflow-wrap:anywhere}
@media (max-width:600px){.vor-prow{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"place place" "name name" "unit qty"}
  .vor-prow-place{grid-area:place}.vor-prow-name{grid-area:name;font-weight:700}.vor-prow .pf-unit{grid-area:unit}.vor-prow .pf-num{grid-area:qty}}
`;
