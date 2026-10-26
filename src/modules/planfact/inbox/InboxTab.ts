/**
 * P2-0021: страница «Требует моего участия» (#/planfact/inbox) — по каждому своему объекту, что ждёт именно этого человека по его
 * правам (pf_my_inbox, миграция 029): «Ждёт подтверждения», «Мои отклонённые», «Черновики КС-2» — дела; «Сделано, не выставлено»
 * и «Стоят больше 14 дней» — для сведения. Нажатие открывает готовый список с нужным видом и объектом (только переход, решений
 * здесь нет). Числа и права — с сервера; цвета — палитра статусов (StatusBadge). Пусто — «Всё сделано».
 */
import { createElement as h } from 'react';
import type { ReactElement } from 'react';
import { StatusBadge, linkFor, EMPTY_STATE } from '../../../platform/ui/index.ts';
import type { Status } from '../../../platform/ui/index.ts';
import type { InboxRow, SummaryApi } from '../summary/summary.service.ts';
import { rub } from '../summary/model.ts';
import { FACT_LABEL } from '../fact/factStatus.ts';
import { rowTasks, useInboxRows } from './inbox.ts';

export type InboxKind = 'pending' | 'my_rejected' | 'ks2_drafts' | 'ks2_gap' | 'stale';

/** Куда ведёт строка: готовый список, вид в адресе (как «Скопировать ссылку» реестра) + объект p=… (и период from=… для «Журнала»). */
export function inboxLink(kind: InboxKind, r: InboxRow, me: string): string {
  const p = 'p=' + encodeURIComponent(r.project_id);
  const join = (base: string, ...extra: string[]): string => base + (base.includes('?') ? '&' : '?') + extra.join('&');
  if (kind === 'pending') return join('#/planfact/fact/pending', p);
  if (kind === 'my_rejected') {
    const f: Record<string, string[]> = { status: ['rejected'] };
    if (me) f.author = [me];
    return join(linkFor('#/planfact/fact/journal', { ...EMPTY_STATE, f }), ...(r.my_rejected_from ? ['from=' + r.my_rejected_from] : []), p);
  }
  if (kind === 'ks2_drafts') return join(linkFor('#/planfact/ks2', { ...EMPTY_STATE, f: { status: ['draft'] } }), p);
  return join('#/planfact/summary', p, 'focus=attention');   // «#/planfact?…» роутер оболочки не узнаёт
}

interface Item { kind: InboxKind; label: string; value: string; tone: Status; hint: string }

/** Строки объекта: только виды, на которые есть право (не null) и где что-то есть (> 0); сначала дела, затем сведения. */
export function inboxItems(r: InboxRow): Item[] {
  const out: Item[] = [];
  const n = (v: number | null): number => (v && v > 0 ? v : 0);
  if (n(r.pending)) out.push({ kind: 'pending', label: 'Ждёт подтверждения', value: String(r.pending), tone: FACT_LABEL.pending_approval.tone, hint: 'записей факта — решить' });
  if (n(r.my_rejected)) out.push({ kind: 'my_rejected', label: 'Мои отклонённые', value: String(r.my_rejected), tone: FACT_LABEL.rejected.tone, hint: 'записей — исправить или внести заново' });
  if (n(r.ks2_drafts)) out.push({ kind: 'ks2_drafts', label: 'Черновики КС-2', value: String(r.ks2_drafts), tone: 'yellow', hint: 'актов не выдано' });
  if (n(r.ks2_gap)) out.push({ kind: 'ks2_gap', label: 'Сделано, не выставлено', value: `${r.ks2_gap} поз.`, tone: 'grey',
    hint: r.ks2_gap_money !== null ? `на ${rub(r.ks2_gap_money)}` : 'строк сметы' });
  if (n(r.stale)) out.push({ kind: 'stale', label: `Стоят больше ${r.stale_days ?? 14} дней`, value: `${r.stale} поз.`, tone: 'grey', hint: 'позиций без факта' });
  return out;
}

const CHEVRON = h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', className: 'ib-chevron' },
  h('path', { d: 'M9 6l6 6-6 6' }));

export function InboxTab(props: { api: SummaryApi; me: string; go: (path: string) => void }): ReactElement {
  const { api, me, go } = props;
  const { rows, error } = useInboxRows(api, true);
  if (rows === null) return error ? h('div', { className: 'pf-error', role: 'alert' }, error) : h('div', { className: 'pf-muted' }, 'Загрузка…');
  const groups = rows.map((r) => ({ r, items: inboxItems(r) })).filter((g) => g.items.length);
  const tasks = rows.reduce((a, r) => a + rowTasks(r), 0);
  return h('div', { className: 'ib-tab', 'data-testid': 'ib-tab' },
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    groups.length
      ? h('div', { className: 'pf-muted ib-total', 'data-testid': 'ib-total' }, tasks ? `Дел: ${tasks} · объектов: ${groups.length}` : `Дел нет · объектов со сведениями: ${groups.length}`)
      : h('div', { className: 'pf-card ib-empty', 'data-testid': 'ib-empty' },
          h('div', { className: 'ib-empty__title' }, 'Всё сделано'),
          h('div', { className: 'pf-muted' }, 'Ничего не ждёт вашего участия. Новое появится здесь и красной точкой в меню.')),
    groups.map(({ r, items }) => h('section', { key: r.project_id, className: 'pf-card ib-group', 'data-testid': 'ib-group', 'data-project-id': r.project_id, 'aria-label': r.name },
      h('div', { className: 'ib-group__head' },
        h('h3', { className: 'ib-group__title' }, r.name, r.code ? h('span', { className: 'pf-muted ib-code' }, ' · ' + r.code) : null),
        rowTasks(r) ? h('span', { className: 'ib-group__n', 'data-testid': 'ib-group-tasks' }, `Дел: ${rowTasks(r)}`) : null),
      h('div', { className: 'ib-items' }, items.map((it) => h('button', { key: it.kind, type: 'button', className: 'ib-item', 'data-kind': it.kind, 'data-testid': 'ib-item',
          'aria-label': `${it.label}: ${it.value} — открыть`, onClick: () => go(inboxLink(it.kind, r, me)) },
        h(StatusBadge, { status: it.tone, label: it.value, testId: 'ib-count' }),
        h('span', { className: 'ib-item__text' }, h('span', { className: 'ib-item__label' }, it.label), h('span', { className: 'pf-muted ib-item__hint' }, it.hint)),
        CHEVRON))))));
}

export const INBOX_CSS = `
.ib-tab{display:flex;flex-direction:column;gap:12px}
.ib-total{font-size:13px}
.ib-empty{padding:24px 16px;display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.ib-empty__title{font-size:15px;font-weight:900;color:var(--text-main)}
.ib-group{padding:12px;display:flex;flex-direction:column;gap:10px;overflow:visible}
.ib-group__head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap}
.ib-group__title{margin:0;font-size:15px;font-weight:900;color:var(--text-main);min-width:0;overflow-wrap:anywhere}
.ib-code{font-weight:600;font-size:13px}
.ib-group__n{font-size:12px;font-weight:700;color:var(--text-muted)}
.ib-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px}
.ib-item{display:flex;align-items:center;gap:10px;min-height:56px;padding:10px 12px;border:1px solid var(--card-border);border-radius:12px;background:var(--card-bg);color:var(--text-main);cursor:pointer;text-align:left;font:inherit}
.ib-item:hover{background:var(--hover-bg)}
.ib-item:focus-visible{outline:2px solid var(--focus,var(--accent));outline-offset:2px}
.ib-item .p2-badge{flex:0 0 auto;font-variant-numeric:tabular-nums}
.ib-item__text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}
.ib-item__label{font-size:13px;font-weight:800}
.ib-item__hint{font-size:12px}
.ib-chevron{flex:0 0 auto;color:var(--text-muted)}
@media (max-width:760px){.ib-items{grid-template-columns:1fr}}
`;
