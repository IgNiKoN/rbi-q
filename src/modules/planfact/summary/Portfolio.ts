/**
 * P2-0046: «Сводка → Все объекты» по утверждённому макету — сначала «Требует внимания» (с кнопкой, куда идти), четыре итога портфеля,
 * ниже объекты: на ПК — таблица с полосой «сделано / план на сегодня», на телефоне — карточки. Все числа — с сервера
 * (pf_summary_portfolio, единый расчёт summary_project); здесь только отбор и подписи. Без права money.view ₽ нет — плитки денег не показываются.
 */
import { createElement as h } from 'react';
import type { ReactElement } from 'react';
import type { SummaryProject } from './summary.service.ts';
import { LIGHT_LABEL, VERDICT_LABEL, dateOr, lagDaysText, lightText, pctText, rub } from './model.ts';
import type { SummaryLinks } from './Attention.ts';
import { KpiTile, ProgressBar, StatusBadge, compactRub } from '../../../platform/ui/index.ts';

export interface PortfolioItem { id: string; tone: 'red' | 'yellow'; title: string; detail: string; action?: { label: string; run: () => void } }

const n1 = (v: number): string => v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const records = (n: number): string => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'запись' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'записи' : 'записей'}`;

/** «Требует внимания» по всем объектам — из строк портфеля, без лишних запросов: просрочка и красный светофор, невыставленное, ждёт РП. */
export function portfolioAttention(list: SummaryProject[], links: SummaryLinks | undefined, open: (id: string) => void): PortfolioItem[] {
  const to = (path: string, page: 'ks2' | 'fact'): ((() => void) | undefined) => (links && links.to && (!links.can || links.can[page] !== false) ? () => links.to!(path) : undefined);
  const out: PortfolioItem[] = [];
  for (const p of list) {
    const pace = p.pace_verdict ? ` · темп: ${VERDICT_LABEL[p.pace_verdict].toLowerCase()}` : '';
    if (p.light === 'red') {
      out.push({ id: `light:${p.project_id}`, tone: 'red', title: p.light_reason === 'overdue' ? `${p.name}: срок окончания прошёл` : `${p.name}: отставание`,
        detail: `${p.pct_money !== null ? `Выполнено ${pctText(p.pct_money)}` : lightText(p)}${p.lag_days !== null ? ` · отстаёт на ${lagDaysText(p.lag_days)}` : ''}${pace}`,
        action: { label: 'Открыть', run: () => open(p.project_id) } });
    }
  }
  for (const p of list) {
    if (p.gap_money !== null && p.gap_money > 0) {
      const run = to(`ks2?p=${encodeURIComponent(p.project_id)}`, 'ks2');
      out.push({ id: `gap:${p.project_id}`, tone: 'yellow', title: 'Сделано, но не выставлено в КС-2', detail: `${p.name} · ${rub(p.gap_money)}`, action: run ? { label: 'К КС-2', run } : undefined });
    }
  }
  for (const p of list) {
    if (p.pending > 0) {
      const run = to(`fact/pending?p=${encodeURIComponent(p.project_id)}`, 'fact');
      out.push({ id: `pending:${p.project_id}`, tone: 'yellow', title: 'Факт ждёт подтверждения РП', detail: `${p.name} · ${records(p.pending)}`, action: run ? { label: 'Проверить', run } : undefined });
    }
  }
  return out;
}

export function PortfolioHead(props: { list: SummaryProject[]; links?: SummaryLinks; open: (id: string) => void }): ReactElement {
  const { list, links, open } = props;
  const items = portfolioAttention(list, links, open);
  const money = list.filter((p) => p.can_money);
  const sum = (k: 'done_money' | 'plan_money' | 'gap_money'): number => money.reduce((a, p) => a + (p[k] || 0), 0);
  const done = sum('done_money'), plan = sum('plan_money'), gap = sum('gap_money');
  const lagging = list.filter((p) => p.light === 'red' || p.light === 'yellow').length;
  const overdue = list.filter((p) => p.light_reason === 'overdue').length;
  const pending = list.reduce((a, p) => a + p.pending, 0);
  return h('div', { className: 'pt-head', 'data-testid': 'sm-portfolio' },
    items.length
      ? h('section', { className: 'pt-att', 'aria-label': 'Требует внимания', 'data-testid': 'pt-attention' },
          h('h2', { className: 'pt-sec' }, 'Требует внимания'),
          h('div', { className: 'pt-att-list' }, items.map((it) => h('div', { key: it.id, className: 'pt-att-item', 'data-tone': it.tone, 'data-testid': 'pt-att-item' },
            h('span', { className: 'pt-dot pt-dot--' + it.tone, 'aria-hidden': 'true' }),
            h('div', { className: 'pt-att-tx' }, h('b', null, it.title), h('span', null, it.detail)),
            it.action ? h('button', { type: 'button', className: 'pt-go', 'data-testid': 'pt-att-go', onClick: it.action.run }, it.action.label) : null))))
      : null,
    h('section', { className: 'pt-kpis', 'aria-label': 'Итоги по объектам' },
      money.length ? h(KpiTile, { label: 'Сделано по договорам', value: compactRub(done), metric: 'pt-done', hint: plan > 0 ? `${n1(done / plan * 100)} % от ${compactRub(plan)}` : undefined }) : null,
      money.length ? h(KpiTile, { label: 'Не выставлено в КС-2', value: compactRub(gap), metric: 'pt-gap', hint: `объектов: ${money.filter((p) => (p.gap_money || 0) > 0).length}` }) : null,
      h(KpiTile, { label: 'Объекты с отставанием', value: `${lagging} из ${list.length}`, metric: 'pt-lag', tone: overdue ? 'red' : lagging ? 'yellow' : undefined,
        hint: overdue ? `срок прошёл: ${overdue}` : undefined }),
      h(KpiTile, { label: 'Ждёт подтверждения', value: records(pending), metric: 'pt-pending', hint: 'факт прорабов' })));
}

/** Карточки объектов для телефона (на ПК — таблица Objects). */
export function ObjectCards(props: { list: SummaryProject[]; onOpen: (id: string) => void }): ReactElement {
  return h('div', { className: 'pt-cards', 'data-testid': 'pt-cards' }, h('h2', { className: 'pt-sec' }, 'Объекты'), props.list.map((p) => h('button', { key: p.project_id, type: 'button', className: 'pf-card pt-card', 'data-card-id': p.project_id,
      onClick: () => props.onOpen(p.project_id) },
    h('span', { className: 'pt-card-hd' }, h('b', null, p.name), h(StatusBadge, { status: p.light, label: LIGHT_LABEL[p.light], title: lightText(p) })),
    p.can_money
      ? h('span', { className: 'pt-card-pct' }, h('span', null, 'Готовность ', h('b', null, pctText(p.pct_money))), p.plan_pct_today !== null ? h('span', null, `план на сегодня ${pctText(p.plan_pct_today)}`) : null)
      : null,
    p.can_money ? h(ProgressBar, { value: p.pct_money, label: `Готовность ${p.name}`, marker: p.plan_pct_today, markerLabel: 'план на сегодня' }) : null,
    h('span', { className: 'pt-kv' },
      h('span', null, 'Отставание'), h('b', null, lagDaysText(p.lag_days) + (p.lag_pp !== null && p.lag_pp > 0 ? ` · ${n1(p.lag_pp)} п.п.` : '')),
      p.can_money ? [h('span', { key: 'a' }, 'Сделано'), h('b', { key: 'b' }, rub(p.done_money)), h('span', { key: 'c' }, 'Не выставлено'), h('b', { key: 'd' }, rub(p.gap_money))] : null,
      h('span', null, 'Прогноз окончания'), h('b', null, dateOr(p.forecast_finish))))));
}

export const PORTFOLIO_CSS = `
.pt-head{display:flex;flex-direction:column;gap:14px}
.pt-sec{font-size:13px;font-weight:600;color:var(--text-muted);margin:0 0 8px}
.pt-att-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.pt-att-item{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1px solid var(--card-border);border-radius:14px;background:var(--card-bg);min-width:0}
.pt-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto;margin-top:5px}
.pt-dot--red{background:var(--p2-status-red-fg)}
.pt-dot--yellow{background:var(--accent,var(--p2-status-yellow-fg))}
.pt-att-tx{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px;overflow-wrap:anywhere}
.pt-att-tx b{font-weight:600;font-size:14px}
.pt-att-tx span{font-size:12.5px;color:var(--text-muted)}
.pt-go{font:inherit;font-size:13px;font-weight:600;color:var(--p2-chart-fact);background:transparent;border:0;padding:4px 0;min-height:32px;cursor:pointer;white-space:nowrap;flex:0 0 auto}
.pt-go:focus-visible,.pt-card:focus-visible{outline:2px solid var(--p2-chart-fact);outline-offset:2px}
.pt-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.pt-cards{display:none}
.pt-card{font:inherit;color:inherit;text-align:left;display:flex;flex-direction:column;gap:10px;padding:14px;cursor:pointer;width:100%}
.pt-card-hd{display:flex;justify-content:space-between;align-items:center;gap:8px;min-width:0}
.pt-card-hd b{font-size:15px;font-weight:600;overflow-wrap:anywhere}
.pt-card-pct{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--text-muted)}
.pt-card-pct b{color:var(--text-main);font-size:15px}
.pt-kv{display:grid;grid-template-columns:1fr auto;gap:4px 12px;font-size:13px}
.pt-kv span{color:var(--text-muted)}
.pt-kv b{font-weight:600;text-align:right;font-variant-numeric:tabular-nums}
@media (max-width:1023.98px){
.pt-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
/* планшет книжно: объекты — карточками в две колонки (таблица из 7 колонок в 600 px не помещается) */
.pt-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.pt-cards .pt-sec{grid-column:1/-1;margin:4px 0 0}
.sm-objects--all{display:none}
}
@media (max-width:767.98px){
.pt-att-list{display:flex;flex-direction:column;gap:0;border:1px solid var(--card-border);border-radius:14px;background:var(--card-bg);overflow:hidden}
.pt-att-item{border:0;border-top:1px solid var(--card-border);border-radius:0;align-items:center}
.pt-att-item:first-child{border-top:0}
.pt-dot{margin-top:0}
.pt-kpis{gap:10px}
.pt-cards{display:flex;flex-direction:column;gap:10px}
}
`;
