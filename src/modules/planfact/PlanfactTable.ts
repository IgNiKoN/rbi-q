/**
 * React-экран «План/Факт»: демо-таблица работ. Цвета — только CSS-переменные оболочки
 * (--card-bg, --card-border, --text-main, --text-muted, --hover-bg, --primary, --color-*),
 * поэтому таблица следует светлой/тёмной теме без своих цветов.
 */
import { createElement as h } from 'react';
import type { ReactElement } from 'react';
import { completionPercent, formatNumber, formatPercent } from './model.ts';
import type { PlanfactDemo } from './model.ts';

function percentClass(p: number | null): string {
  if (p === null) return 'pf-pct';
  if (p >= 100) return 'pf-pct pf-pct--done';
  if (p > 0) return 'pf-pct pf-pct--progress';
  return 'pf-pct pf-pct--none';
}

export function PlanfactTable(props: { data: PlanfactDemo }): ReactElement {
  const { data } = props;
  return h('div', { className: 'pf-root' },
    h('div', { className: 'pf-head' },
      h('h2', { className: 'pf-title' }, 'План/Факт'),
      h('div', { className: 'pf-sub' }, data.project, ' · демо-данные')
    ),
    h('div', { className: 'pf-card' },
      h('table', { className: 'pf-table' },
        h('thead', null,
          h('tr', null,
            h('th', null, 'Наименование работ'),
            h('th', null, 'Ед.'),
            h('th', { className: 'pf-num' }, 'План'),
            h('th', { className: 'pf-num' }, 'Факт'),
            h('th', { className: 'pf-num' }, '%')
          )
        ),
        h('tbody', null,
          data.works.map((w) => {
            const p = completionPercent(w.plan, w.fact);
            return h('tr', { key: w.id, 'data-work-id': w.id },
              h('td', null, w.name),
              h('td', { className: 'pf-unit' }, w.unit),
              h('td', { className: 'pf-num' }, formatNumber(w.plan)),
              h('td', { className: 'pf-num' }, formatNumber(w.fact)),
              h('td', { className: 'pf-num' }, h('span', { className: percentClass(p) }, formatPercent(p)))
            );
          })
        )
      )
    )
  );
}

export const PLANFACT_CSS = `
.pf-root{padding:24px;max-width:1100px;color:var(--text-main)}
.pf-head{margin-bottom:16px}
.pf-title{font-weight:900;font-size:15px;text-transform:uppercase;letter-spacing:-.01em;margin:0}
.pf-sub{font-size:12px;color:var(--text-muted);margin-top:4px}
.pf-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;overflow-x:auto;box-shadow:var(--shadow-card)}
.pf-table{width:100%;border-collapse:collapse;font-size:13px}
.pf-table th{text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);padding:10px 14px;border-bottom:1px solid var(--card-border);white-space:nowrap}
.pf-table td{padding:10px 14px;border-bottom:1px solid var(--card-border)}
.pf-table tbody tr:last-child td{border-bottom:0}
.pf-table tbody tr:hover{background:var(--hover-bg)}
.pf-num,.pf-table th.pf-num,.pf-table td.pf-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.pf-unit{color:var(--text-muted);white-space:nowrap}
.pf-pct{font-weight:700}
.pf-pct--done{color:var(--color-green)}
.pf-pct--progress{color:var(--primary)}
.pf-pct--none{color:var(--text-muted)}
`;
