/**
 * Сводка → «Требует внимания» и «Полнота данных» (P2-0010, этап 4): что выставить заказчику и что исправить в данных — со ссылкой
 * в нужный раздел (КС-2, Смета, Факт, даты проекта). Счётчики, строки и доли — с сервера (pf_summary_attention); ₽ — только при праве.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { SummaryApi, SummaryAttention, SummaryProject } from './summary.service.ts';
import { pctText, rub } from './model.ts';
import { ProgressBar, StatusBadge } from '../../../platform/ui/index.ts';
import { fmtQty } from '../fact/fact.ts';

export type SummaryPage = 'ks2' | 'estimate' | 'fact';
export interface SummaryLinks { go?: (page: SummaryPage) => void; can?: Partial<Record<SummaryPage, boolean>> }

interface Item { id: string; title: string; detail?: string; status: 'red' | 'yellow'; action?: { label: string; run: () => void }; rows?: string[]; total?: number }

export function Attention(props: { api: SummaryApi; p: SummaryProject; links?: SummaryLinks; onDates?: () => void }): ReactElement {
  const { api, p, links, onDates } = props;
  const [a, setA] = useState<SummaryAttention | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void api.attention(p.project_id).then((r) => { if (!alive) return; if (r.ok) setA(r.value); else { setError(r.message); } });
    return () => { alive = false; };
  }, [p.project_id]);

  const link = (page: SummaryPage, label: string) => (links && links.go && (!links.can || links.can[page] !== false)
    ? { label, run: () => links.go!(page) } : undefined);
  const items: Item[] = [];
  if (a) {
    const c = a.counts;
    if (c.no_kp) items.push({ id: 'no_kp', status: 'red', title: 'Нет договорной КП', detail: 'Без неё нет цен, готовности в рублях и КС-2', action: link('ks2', 'Выбрать в КС-2') });
    if (c.no_dates) items.push({ id: 'no_dates', status: 'red', title: 'Не заданы плановые даты проекта', detail: 'Без дат нет плана на сегодня, отставания и светофора',
      action: onDates ? { label: 'Указать даты', run: onDates } : undefined });
    if (c.gap_rows) items.push({ id: 'gap', status: 'yellow', title: `Сделано, не выставлено в КС-2${c.gap_money !== null ? ` на ${rub(c.gap_money)}` : ''} — строк: ${c.gap_rows}`,
      detail: 'Можно включить в следующий акт', action: link('ks2', 'Открыть КС-2'),
      total: c.gap_rows, rows: a.gap.map((g) => `${g.number ? `${g.number} ` : ''}${g.name} — ${fmtQty(g.qty)} ${g.unit || ''}${g.money !== null ? ` · ${rub(g.money)}` : ''}`) });
    if (c.unpriced_rows) items.push({ id: 'unpriced', status: 'yellow', title: `Строк ВОР без цены в договорной КП: ${c.unpriced_rows}`,
      detail: 'Не входят в готовность по деньгам', action: link('estimate', 'Открыть смету'),
      total: c.unpriced_rows, rows: a.unpriced.map((u) => `${u.number ? `${u.number} ` : ''}${u.name} — ${fmtQty(u.qty)} ${u.unit || ''}`) });
    if (c.stale_positions) items.push({ id: 'stale', status: 'yellow', title: `Позиций без факта больше ${a.stale_days} дней: ${c.stale_positions}`,
      detail: 'Объект начат, а по этим работам выполнения нет', action: link('fact', 'Открыть факт'),
      total: c.stale_positions, rows: a.stale.map((s) => `${s.work_name} · ${s.location_path} — ${fmtQty(s.fact_qty)} из ${fmtQty(s.plan_qty)} ${s.unit}, ${s.idle_days} дн. без факта`) });
    if (c.pending_entries) items.push({ id: 'pending', status: 'yellow', title: `Факт ждёт подтверждения — записей: ${c.pending_entries}`,
      detail: 'Пока не подтверждён, в «сделано» не входит', action: link('fact', 'Подтвердить') });
  }
  const done = a ? a.completeness : null;
  return h('div', { className: 'db-row' },
    h('section', { className: 'p2-chart db-main', 'data-testid': 'sm-attention', 'aria-label': 'Требует внимания' },
      h('h2', { className: 'p2-chart__title' }, 'Требует внимания'),
      error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
      !a && !error ? h('div', { className: 'pf-muted' }, 'Загрузка…') : null,
      a && !items.length ? h('div', { className: 'pf-muted', 'data-testid': 'sm-attention-ok' }, 'Замечаний нет: всё выставлено, цены и даты на месте.') : null,
      items.map((it) => h('div', { key: it.id, className: 'at-item', 'data-attention': it.id },
        h('div', { className: 'at-head' },
          h(StatusBadge, { status: it.status, label: it.status === 'red' ? 'Важно' : 'Проверить' }),
          h('b', { className: 'at-title' }, it.title),
          it.action ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost at-go', 'data-testid': 'sm-attention-go', onClick: it.action.run }, it.action.label) : null),
        it.detail ? h('span', { className: 'pf-muted at-detail' }, it.detail) : null,
        it.rows && it.rows.length
          ? h('details', { className: 'at-rows' }, h('summary', null, it.total && it.total > it.rows.length ? `Строки (первые ${it.rows.length} из ${it.total})` : `Строки (${it.rows.length})`),
              h('ul', null, it.rows.map((r, i) => h('li', { key: i }, r))))
          : null))),
    h('section', { className: 'p2-chart db-side', 'data-testid': 'sm-completeness', 'aria-label': 'Полнота данных' },
      h('h2', { className: 'p2-chart__title' }, 'Полнота данных'),
      !done ? h('div', { className: 'pf-muted' }, error ? '—' : 'Загрузка…') : h('div', { className: 'at-full' },
        full('Строки ВОР с ценой в договорной КП', done.priced_pct, done.rows_total ? `${done.rows_priced} из ${done.rows_total}` : 'нет договорной КП', 'priced'),
        full('Плановые даты объекта', done.dates_pct, done.dates_pct === 100 ? 'заданы' : 'не заданы', 'dates'),
        full('Позиции с местом ниже корпуса (секция, этаж, квартира)', done.placed_pct, `${done.positions_placed} из ${done.positions_total}`, 'placed'))));
}

function full(label: string, pct: number | null, sub: string, id: string): ReactElement {
  return h('div', { className: 'db-place', 'data-full': id },
    h('div', { className: 'db-place-head' }, h('span', null, label), h('b', { className: 'p2-num' }, pctText(pct))),
    h(ProgressBar, { value: pct, label }),
    h('span', { className: 'pf-muted db-place-sub' }, sub));
}

export const ATTENTION_CSS = `
.at-item{display:flex;flex-direction:column;gap:4px;padding:10px 0;border-top:1px solid var(--card-border)}
.at-item:first-of-type{border-top:0;padding-top:0}
.at-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
.at-title{font-size:13px;min-width:0;overflow-wrap:anywhere;flex:1 1 200px}
.at-go{margin-left:auto}
.at-detail{font-size:12px}
.at-rows{font-size:12px}
.at-rows summary{cursor:pointer;color:var(--text-main);padding:4px 0;min-height:32px;display:flex;align-items:center}
.at-rows ul{margin:4px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:3px;max-height:260px;overflow:auto}
.at-full{display:flex;flex-direction:column;gap:14px}
@media (max-width:760px){.at-go{margin-left:0;width:100%}}
`;
