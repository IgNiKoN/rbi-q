/**
 * Сводка → объект → «Сделано ↔ КС-2» (P2-0008, этап 4): по строкам заказчика договорной КП — сделано (принятый факт через связки),
 * выставлено (итог ПТО выданных, не аннулированных актов), разрыв = сделано − выставлено. Объёмы — всем с правом просмотра факта,
 * ₽ по цене договорной КП — только с money.view (сервер иначе присылает null). Итог разрыва объекта — из сводки (с сервера).
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { Ks2GapRow, SummaryApi, SummaryProject } from './summary.service.ts';
import { rub } from './model.ts';
import { fmtQty } from '../fact/fact.ts';
import { money } from '../estimate/prices.ts';

export function Ks2Gap(props: { api: SummaryApi; p: SummaryProject }): ReactElement {
  const { api, p } = props;
  const [rows, setRows] = useState<Ks2GapRow[] | null>(null);
  const [error, setError] = useState('');
  const [onlyGap, setOnlyGap] = useState(true);
  useEffect(() => {
    void (async () => {
      const r = await api.ks2Gap(p.project_id);
      if (!r.ok) { setError(r.message); setRows([]); return; }
      setRows(r.value);
    })();
  }, [p.project_id]);
  if (rows === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  const m = p.can_money;
  const shown = onlyGap ? rows.filter((r) => r.gap_qty !== 0) : rows;
  return h('div', { className: 'pf-card sm-gap', 'data-testid': 'sm-gap' },
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    !error && m ? h('div', { className: 'sm-gap-total', 'data-testid': 'sm-gap-total' },
      h('span', null, 'Сделано, но не выставлено в КС-2: ', h('b', null, rub(p.gap_money))),
      h('span', { className: 'pf-muted' }, `сделано ${rub(p.done_money)} · выставлено ${rub(p.issued_money)}`)) : null,
    !error ? h('label', { className: 'sm-gap-only' }, h('input', { type: 'checkbox', checked: onlyGap, 'data-testid': 'sm-gap-only', onChange: () => setOnlyGap(!onlyGap) }), ' Только строки с разрывом') : null,
    !error && !shown.length ? h('div', { className: 'pf-muted pj-empty', 'data-testid': 'sm-gap-empty' }, rows.length ? 'Всё сделанное выставлено в КС-2.' : 'Нет факта и актов по строкам договорной КП.') : null,
    shown.length
      ? h('div', { className: 'sm-grow sm-grow--head' + (m ? ' sm-grow--money' : '') }, h('span', null, 'Строка заказчика'), h('span', { className: 'pf-num' }, 'Сделано'),
          h('span', { className: 'pf-num' }, 'Выставлено'), h('span', { className: 'pf-num' }, 'Разрыв'), m ? h('span', { className: 'pf-num' }, 'Цена, ₽') : null, m ? h('span', { className: 'pf-num' }, 'Разрыв, ₽') : null)
      : null,
    shown.map((r) => h('div', { key: r.source_row_id, className: 'sm-grow' + (m ? ' sm-grow--money' : '') + (r.gap_qty < 0 ? ' sm-grow--over' : ''), 'data-row': r.row_no },
      h('span', { className: 'sm-gname' }, h('span', { className: 'pf-muted' }, `стр. ${r.row_no}${r.number ? ` · ${r.number}` : ''} `), r.name,
        r.kind === 'material' ? h('span', { className: 'pf-muted' }, ' (материал)') : null),
      h('span', { className: 'pf-num', 'data-label': 'Сделано' }, `${fmtQty(r.done_qty)} ${r.unit_text || ''}`),
      h('span', { className: 'pf-num', 'data-label': 'Выставлено' }, fmtQty(r.issued_qty)),
      h('b', { className: 'pf-num', 'data-label': 'Разрыв', 'data-testid': 'sm-gap-qty' }, fmtQty(r.gap_qty)),
      m ? h('span', { className: 'pf-num', 'data-label': 'Цена, ₽' }, r.price === null ? 'нет цены' : money(r.price)) : null,
      m ? h('b', { className: 'pf-num', 'data-label': 'Разрыв, ₽', 'data-testid': 'sm-gap-money' }, r.gap_money === null ? '—' : money(r.gap_money)) : null)));
}

export const SUMMARY_GAP_CSS = `
.sm-gap{display:flex;flex-direction:column;padding:12px 16px;gap:4px;overflow:visible}
.sm-gap-total{display:flex;flex-wrap:wrap;gap:4px 16px;align-items:baseline;font-size:14px;padding-bottom:6px}
.sm-gap-only{font-size:13px;display:flex;align-items:center;gap:6px;min-height:36px}
.sm-grow{display:grid;grid-template-columns:minmax(0,3fr) repeat(3,minmax(0,1fr));gap:4px 12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--card-border);font-size:13px}
.sm-grow--money{grid-template-columns:minmax(0,3fr) repeat(5,minmax(0,1fr))}
.sm-grow:last-child{border-bottom:0}
.sm-grow--head{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted)}
.sm-grow--over [data-testid="sm-gap-qty"]{color:var(--color-yellow)}
.sm-gname{overflow-wrap:anywhere}
@media (max-width:760px){
.sm-grow--head{display:none}
.sm-grow,.sm-grow--money{grid-template-columns:minmax(0,1fr) minmax(0,1fr);padding:10px 0}
.sm-gname{grid-column:1/-1;font-weight:700}
.sm-grow .pf-num{text-align:left}
.sm-grow [data-label]::before{content:attr(data-label) ': ';font-size:11px;color:var(--text-muted);font-weight:400}
}
`;
