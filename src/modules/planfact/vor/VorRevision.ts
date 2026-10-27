/**
 * «Что изменилось» — новая редакция ВОР против действующей (P2-0006b, этап 4; макет «3 Что изменилось», «4 Решение 🟡 / 🔴»).
 * Сравнение — чистая функция compareRevision (revision.ts) по «название + ЕИ + место»; база — pf_vor_revision_base.
 * 🟡 — «Та же строка» / «Разные строки»; 🔴 «факт без плана» — «Перенести факт на…» (позиция той же ЕИ) / «Оставить на снятой».
 * «Принять редакцию» — одна функция сервера pf_vor_accept_revision (всё или ничего, проверка «редакция уже сменилась» — там же);
 * кнопка недоступна, пока blockers() не пуст.
 */
import { createElement as h, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import { StatusBadge } from '../../../platform/ui/index.ts';
import type { Status } from '../../../platform/ui/index.ts';
import { compareRevision, applyYellow, blockers, acceptPayload, rowErrors } from './revision.ts';
import type { BaseRow, CompareItem, Decisions, NextRow, RowError } from './revision.ts';
import { contextLabel } from './parse.ts';
import { similarity } from './matching.ts';
import type { AcceptResult, VorApi, VorImport, VorRow } from './vor.service.ts';

type Filter = 'all' | 'todo' | 'added' | 'removed' | 'changed' | 'same';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' }, { id: 'todo', label: 'Решить' }, { id: 'added', label: 'Добавлено' },
  { id: 'removed', label: 'Удалено' }, { id: 'changed', label: 'Объём' }, { id: 'same', label: 'Без изменений' }
];
const GROUP: Record<CompareItem['group'], { status: Status; label: string }> = {
  added: { status: 'green', label: 'Новая' }, removed: { status: 'grey', label: 'Удалена' },
  changed: { status: 'blue', label: 'Объём' }, same: { status: 'grey', label: 'Без изменений' }
};
const YELLOW_TEXT: Record<NonNullable<CompareItem['yellow']>, string> = {
  duplicate: 'Одинаковые строки в одном месте — проверьте пару', similar: 'Похожее название — та же строка?',
  attrs: 'Вид работ, место или ЕИ другие — «Разные строки», или выберите тот же вид работ на шаге «Виды работ»'
};
const fmt = (n: number | null | undefined): string => n === null || n === undefined ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const PAGE = 300;

/** Строка-работа черновика → строка сравнения. */
export function nextRows(rows: VorRow[]): NextRow[] {
  return rows.filter((r) => r.kind === 'work').map((r) => ({ row_no: r.row_no, number: r.number, name: r.name, unit_text: r.unit_text,
    qty: r.qty === null ? null : Number(r.qty), context: r.context, location_id: r.location_id, work_type_id: r.work_type_id, unit_id: r.unit_id }));
}

/** Куда можно перенести факт снятой позиции: остающиеся позиции и новые строки той же ЕИ; первая — похожая в том же месте. */
export interface MoveTarget { value: string; label: string; positionId?: string; rowNo?: number }
export function moveTargets(items: CompareItem[], gone: BaseRow): MoveTarget[] {
  const out: (MoveTarget & { score: number })[] = [];
  for (const i of items) {
    if (i.group === 'removed' || !i.next || (i.base && i.base.position_id === gone.position_id)) continue;
    if (gone.unit_id && i.next.unit_id && gone.unit_id !== i.next.unit_id) continue;
    const place = contextLabel(i.next.context || {}) || 'весь объект';
    const near = (i.next.location_id && i.next.location_id === gone.location_id ? 1 : 0) + similarity(gone.name, i.next.name);
    if (i.group === 'added') out.push({ value: 'r:' + i.next.row_no, rowNo: i.next.row_no, label: `${i.next.name} · ${place} · новая строка ${i.next.row_no}`, score: near + 0.01 });
    else if (i.base && i.base.position_id) out.push({ value: 'p:' + i.base.position_id, positionId: i.base.position_id, label: `${i.next.name} · ${place} · строка ${i.next.row_no}`, score: near });
  }
  return out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'ru'));
}

/** Ошибки разбора с номером строки (PTO-01): «Строка 57 — нет ЕИ»; нажатие — onPick(номер строки). */
export function RowErrorsCard(props: { errors: RowError[]; onPick?: (rowNo: number) => void; testId?: string }): ReactElement | null {
  const { errors, onPick } = props;
  const [all, setAll] = useState(false);
  if (!errors.length) return null;
  const list = all ? errors : errors.slice(0, 10);
  return h('div', { className: 'pf-card vor-errs', 'data-testid': props.testId || 'vor-errors' },
    h('div', { className: 'vor-errs-head' }, h(StatusBadge, { status: 'red', label: `Ошибки в файле: ${errors.length}` }),
      onPick ? h('span', { className: 'pf-muted' }, 'нажмите — откроется строка') : null),
    list.map((e, k) => h('button', { key: e.rowNo + ':' + k, type: 'button', className: 'vor-err', 'data-row-error': e.rowNo, disabled: !onPick,
      onClick: () => { if (onPick) onPick(e.rowNo); } },
      h('b', { className: 'pf-num' }, `Строка ${e.rowNo}`), h('span', null, e.reason))),
    errors.length > 10 && !all ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setAll(true) }, `Показать все (${errors.length})`) : null);
}

/** Строки черновика с сервера → ошибки с номером строки (место не найдено — строка-работа без привязки к дереву). */
export function draftErrors(rows: VorRow[], placesBound: boolean): RowError[] {
  const parsed = rows.map((r) => ({ rowNo: r.row_no, kind: r.kind, number: r.number, name: r.name, unitText: r.unit_text,
    qty: r.qty === null ? null : Number(r.qty), norm: null, prices: {}, context: r.context || {}, parentRowNo: null, raw: [] }));
  return rowErrors(parsed, [], [], placesBound ? rows.filter((r) => r.kind === 'work' && !r.location_id).map((r) => r.row_no) : []);
}

export function VorRevision(props: { api: VorApi; imp: VorImport; rows: VorRow[]; canManage: boolean; onBack: () => void; onAccepted: (r: AcceptResult) => void }): ReactElement {
  const { api, imp, rows, canManage, onBack, onAccepted } = props;
  const [base, setBase] = useState<BaseRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [filter, setFilter] = useState<Filter>('todo');
  const [d, setD] = useState<Decisions>({ yellow: {}, red: {} });
  const [openRed, setOpenRed] = useState('');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    void api.revisionBase(imp.id).then((r) => { if (r.ok) setBase(r.value); else { setError(r.message); setBase([]); } });
  }, [imp.id]);

  const cmp = useMemo(() => base ? compareRevision(base, nextRows(rows)) : null, [base, rows]);
  const view = useMemo(() => cmp ? applyYellow(cmp, d.yellow) : null, [cmp, d.yellow]);
  if (!cmp || !view) return h('div', { className: 'pf-muted', 'data-testid': 'vor-rev-loading' }, error || 'Сравниваю с действующей редакцией…');

  const block = blockers(view, d).concat(blockers(cmp, d).filter((b) => b.startsWith('Не подтверждено') || b.startsWith('Место')));
  const uniqBlock = Array.from(new Set(block));
  const todo = (i: CompareItem): boolean => !!i.yellow || i.red === 'fact_without_plan';
  // Итоговый список (после «Разные строки» пара распадается: удалённая часть может стать 🔴), но 🟡 остаётся на месте своей
  // добавленной части — решение видно и его можно поменять.
  const splitYellow = new Map(cmp.items.filter((i) => i.yellow && d.yellow[i.key] === 'split' && i.next).map((i) => ['a:' + i.next!.row_no, i]));
  const list = view.items.map((i) => splitYellow.get(i.key) || i);
  const shown = list.filter((i) => filter === 'all' || (filter === 'todo' ? todo(i) || i.red === 'fact_over_qty' : inGroup(i, filter)))
    .sort((a, b) => Number(todo(b)) - Number(todo(a)));
  const counts: Record<Filter, number> = { all: list.length, todo: list.filter(todo).length, added: view.counts.added, removed: view.counts.removed,
    changed: view.counts.changed, same: view.counts.same };
  const inGroup = (i: CompareItem, f: Filter): boolean => (i.yellow && d.yellow[i.key] === 'split' ? f === 'added' : !i.yellow && i.group === f);
  const left = list.filter((i) => (i.yellow && !d.yellow[i.key]) || (i.red === 'fact_without_plan' && !d.red[i.key])).length;

  function setYellow(key: string, v: 'same' | 'split'): void { setD((x) => ({ ...x, yellow: { ...x.yellow, [key]: v } })); }
  function setRed(key: string, v: Decisions['red'][string] | null): void {
    setD((x) => { const red = { ...x.red }; if (v) red[key] = v; else delete red[key]; return { ...x, red }; });
  }

  async function accept(): Promise<void> {
    if (busy || uniqBlock.length || !view) return;
    setBusy('Принимаю редакцию…'); setError('');
    const p = acceptPayload(cmp!, d);
    const r = await api.acceptRevision(imp.id, p.items, p.red);
    setBusy('');
    if (!r.ok) { setError(r.message); return; }
    onAccepted(r.value);
  }

  function redPanel(i: CompareItem): ReactElement {
    const targets = moveTargets(view!.items, i.base!);
    const cur = d.red[i.key];
    const val = cur && cur.action === 'move' ? (cur.toPositionId ? 'p:' + cur.toPositionId : 'r:' + cur.toRowNo) : '';
    const pickMove = (v: string): void => {
      const t = targets.find((x) => x.value === v);
      setRed(i.key, t ? (t.positionId ? { action: 'move', toPositionId: t.positionId } : { action: 'move', toRowNo: t.rowNo }) : null);
    };
    return h('div', { className: 'vor-rev-dec', 'data-testid': 'vor-rev-red-panel' },
      h('div', { className: 'pf-muted' }, `В новой редакции строки нет. На позиции факт ${fmt(i.base!.fact_qty)}${i.base!.pending_qty ? ` (+${fmt(i.base!.pending_qty)} ждёт РП)` : ''} из ${fmt(i.base!.position_qty)} ${i.base!.unit_text || ''}.`),
      h('label', { className: 'vor-rev-opt' + (cur && cur.action === 'move' ? ' vor-rev-opt--on' : '') },
        h('input', { type: 'radio', name: 'red-' + i.key, checked: !!cur && cur.action === 'move', disabled: !canManage || !targets.length,
          onChange: () => pickMove(val || (targets[0] ? targets[0].value : '')) }),
        h('span', null, h('b', null, 'Перенести факт на позицию'),
          targets.length
            ? h('select', { className: 'pj-input', value: val || (targets[0] ? targets[0].value : ''), disabled: !canManage, 'data-testid': 'vor-rev-move-to',
                onChange: (e: ChangeEvent<HTMLSelectElement>) => pickMove(e.currentTarget.value) },
                targets.slice(0, 200).map((t) => h('option', { key: t.value, value: t.value }, t.label)))
            : h('span', { className: 'pf-muted' }, 'Нет позиций с той же ЕИ'))),
      h('label', { className: 'vor-rev-opt' + (cur && cur.action === 'keep' ? ' vor-rev-opt--on' : '') },
        h('input', { type: 'radio', name: 'red-' + i.key, checked: !!cur && cur.action === 'keep', disabled: !canManage, 'data-testid': 'vor-rev-keep',
          onChange: () => setRed(i.key, { action: 'keep' }) }),
        h('span', null, h('b', null, 'Оставить на снятой позиции'),
          h('span', { className: 'pf-muted' }, 'Факт сохранится, позиция будет видна с 🔴 «снята», новый факт на неё не внести'))),
      h('div', { className: 'pf-muted vor-rev-small' }, `Перенос — новыми записями с причиной «Перенос при редакции ВОР №${imp.revision_no || 2}», прежние записи останутся в истории.`));
  }

  function row(i: CompareItem): ReactElement {
    const name = (i.next || i.base)!.name;
    const place = contextLabel((i.next || i.base)!.context || {}) || 'весь объект';
    const unit = (i.next || i.base)!.unit_text || '';
    const qty = i.group === 'added' ? `— → ${fmt(i.next!.qty)}` : i.group === 'removed' ? `${fmt(i.base!.qty)} → —`
      : i.group === 'changed' ? `${fmt(i.base!.qty)} → ${fmt(i.next!.qty)}` : fmt(i.next!.qty);
    const fact = i.base ? i.base.fact_qty + i.base.pending_qty : 0;
    const rowNo = i.base && i.next ? (i.base.row_no === i.next.row_no ? String(i.next.row_no) : `${i.base.row_no} → ${i.next.row_no}`)
      : i.next ? `— → ${i.next.row_no}` : `${i.base!.row_no} → —`;
    const yel = i.yellow ? d.yellow[i.key] : undefined;
    const tone = i.red ? ' vor-rev-row--red' : i.yellow ? ' vor-rev-row--yellow' : '';
    return h('div', { key: i.key, className: 'vor-rev-row' + tone, 'data-key': i.key, 'data-group': i.group, 'data-testid': 'vor-rev-row' },
      h('span', { className: 'vor-rev-mark' },
        i.red ? h(StatusBadge, { status: 'red', label: i.red === 'fact_without_plan' ? 'Факт без плана' : 'Факт больше объёма' })
          : i.yellow ? h(StatusBadge, { status: 'yellow', label: 'Проверить' })
            : h(StatusBadge, GROUP[i.group])),
      h('span', { className: 'vor-rev-name' }, h('b', null, name),
        i.yellow && i.base && i.next && i.base.name !== i.next.name ? h('span', { className: 'pf-muted' }, `было: ${i.base.name}`) : null,
        h('span', { className: 'pf-muted' }, `${place} · стр. ${rowNo}`),
        i.yellow ? h('span', { className: 'vor-rev-why' }, YELLOW_TEXT[i.yellow]) : null),
      h('span', { className: 'vor-rev-qty pf-num' }, h('b', null, qty), h('span', { className: 'pf-muted' }, unit + (fact ? ` · факт ${fmt(fact)}` : ''))),
      i.yellow
        ? h('span', { className: 'vor-rev-act' },
            h('button', { type: 'button', className: 'pf-btn' + (yel === 'same' ? '' : ' pf-btn--ghost'), disabled: !canManage || i.yellow === 'attrs', 'aria-pressed': yel === 'same',
              'data-testid': 'vor-rev-same', onClick: () => setYellow(i.key, 'same') }, 'Та же строка'),
            h('button', { type: 'button', className: 'pf-btn' + (yel === 'split' ? '' : ' pf-btn--ghost'), disabled: !canManage, 'aria-pressed': yel === 'split',
              'data-testid': 'vor-rev-split', onClick: () => setYellow(i.key, 'split') }, 'Разные строки'))
        : i.red === 'fact_without_plan'
          ? h('span', { className: 'vor-rev-act' },
              h('button', { type: 'button', className: 'pf-btn' + (d.red[i.key] ? ' pf-btn--ghost' : ''), 'data-testid': 'vor-rev-decide',
                onClick: () => setOpenRed(openRed === i.key ? '' : i.key) },
                d.red[i.key] ? (d.red[i.key].action === 'keep' ? 'Оставить ✓' : 'Перенести ✓') : 'Решить'))
          : null,
      openRed === i.key && i.red === 'fact_without_plan' ? redPanel(i) : null);
  }

  return h('div', { className: 'pj-tab vor-rev', 'data-testid': 'vor-revision' },
    h('div', { className: 'vor-draft-head' },
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: onBack, 'data-testid': 'vor-rev-back' }, '← Ошибки и места'),
      h('div', { className: 'pj-name vor-rev-title' }, h('b', null, `Что изменилось: редакция №${imp.revision_no || 2} ← №${(imp.revision_no || 2) - 1}`),
        h('span', { className: 'pf-muted' }, `${imp.file_name} · сопоставление «название + ЕИ + место»; сдвиг номеров строк — не изменение`))),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    h('div', { className: 'pf-seg vor-filter vor-rev-filter', role: 'tablist' }, FILTERS.map((f) => h('button', { key: f.id, type: 'button', role: 'tab',
      'aria-selected': filter === f.id, 'data-filter': f.id, className: 'pf-seg-btn' + (filter === f.id ? ' pf-seg-btn--active' : ''),
      onClick: () => { setFilter(f.id); setLimit(PAGE); } }, `${f.label} ${counts[f.id]}`))),
    h('div', { className: 'pf-card vor-rev-list', 'data-testid': 'vor-rev-list' },
      shown.length ? shown.slice(0, limit).map(row)
        : h('div', { className: 'pj-empty pf-muted' }, filter === 'todo' ? 'Решать нечего — можно принимать.' : 'Нет строк этой группы.'),
      shown.length > limit ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setLimit(limit + PAGE) }, `Показать ещё (${shown.length - limit})`) : null),
    h('div', { className: 'vor-rev-bar', 'data-testid': 'vor-rev-bar' },
      left || uniqBlock.length
        ? h('span', { className: 'vor-stat--bad', 'data-testid': 'vor-rev-left' }, uniqBlock.join(' · ') || `Осталось решить: ${left}`)
        : h('span', { className: 'vor-stat--ok' }, 'Всё решено. Факт останется на своих позициях, сводка пересчитается.'),
      canManage
        ? h('button', { type: 'button', className: 'pf-btn', disabled: !!busy || uniqBlock.length > 0, 'data-testid': 'vor-rev-accept', onClick: () => { void accept(); } },
            busy || `Принять редакцию №${imp.revision_no || 2}`)
        : h('span', { className: 'pf-muted' }, 'Принимать редакцию может ПТО, РП или администратор.')));
}

export const VOR_REVISION_CSS = `
.vor-errs{display:flex;flex-direction:column;border-color:var(--p2-status-red-line)}
.vor-errs-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 14px;border-bottom:1px solid var(--card-border);font-size:12px}
.vor-err{display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px;align-items:baseline;text-align:left;padding:9px 14px;border:0;border-bottom:1px solid var(--card-border);
  background:none;color:var(--text-main);font:inherit;font-size:13px;cursor:pointer;min-height:40px}
.vor-err:disabled{cursor:default}
.vor-err:hover:not(:disabled){background:var(--hover-bg)}
.vor-err:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
.vor-err b{white-space:nowrap}
.vor-row--flash{animation:vorflash 1.6s ease-out}
@keyframes vorflash{0%{background:var(--p2-status-yellow-bg)}100%{background:transparent}}
@media (prefers-reduced-motion:reduce){.vor-row--flash{animation:none;background:var(--p2-status-yellow-bg)}}
.vor-rev-list{display:flex;flex-direction:column}
.vor-rev-title{display:flex;flex-direction:column;gap:2px;min-width:0}
.vor-rev-title b{font-size:16px}
.vor-rev-row{display:grid;grid-template-columns:150px minmax(0,1fr) 150px minmax(0,250px);grid-template-areas:"mark name qty act";gap:6px 14px;align-items:start;padding:10px 14px;border-bottom:1px solid var(--card-border);font-size:13px}
.vor-rev-mark{grid-area:mark}.vor-rev-name{grid-area:name}.vor-rev-qty{grid-area:qty}.vor-rev-act{grid-area:act}
@media (min-width:768px) and (max-width:1279.98px){.vor-rev-row{grid-template-columns:130px minmax(0,1fr) 130px;grid-template-areas:"mark name qty" ". act act"}
  .vor-rev-act{justify-content:flex-start}}
.vor-rev-row:last-child{border-bottom:0}
.vor-rev-row--red{background:var(--p2-status-red-bg)}
.vor-rev-row--yellow{background:var(--p2-status-yellow-bg)}
.vor-rev-name{display:flex;flex-direction:column;gap:2px;min-width:0;overflow-wrap:anywhere}
.vor-rev-name b{font-size:14px}
.vor-rev-why{font-size:12px;font-weight:600;color:var(--p2-status-yellow-fg)}
.vor-rev-qty{display:flex;flex-direction:column;align-items:flex-end;gap:2px;text-align:right}
.vor-rev-act{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
.vor-rev-dec{grid-column:1/-1;display:flex;flex-direction:column;gap:8px;padding:10px 0 2px}
.vor-rev-opt{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg)}
.vor-rev-opt--on{border-color:var(--primary);box-shadow:inset 0 0 0 1px var(--primary)}
.vor-rev-opt>span{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1 1 auto}
.vor-rev-opt select{width:100%;min-height:40px}
.vor-rev-opt input[type=radio]{width:18px;height:18px;margin-top:2px;flex:none}
.vor-rev-small{font-size:12px}
.vor-rev-filter{flex-wrap:wrap}
.vor-rev-bar{position:sticky;bottom:0;z-index:2;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;padding:12px 14px;
  background:var(--card-bg);border:1px solid var(--card-border);border-radius:12px;box-shadow:0 -6px 18px rgba(0,0,0,.08);font-size:13px}
@media (max-width:767.98px){
  .vor-rev-row{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"name qty" "mark mark" "act act";padding:11px 12px}
  .vor-rev-name{grid-area:name}.vor-rev-qty{grid-area:qty}.vor-rev-mark{grid-area:mark}.vor-rev-act{grid-area:act;justify-content:flex-start}
  .vor-rev-act .pf-btn{flex:1 1 0}
  .vor-rev-bar{bottom:calc(64px + env(safe-area-inset-bottom,0px));flex-direction:column;align-items:stretch;text-align:center}
  .vor-rev-bar .pf-btn{width:100%;min-height:48px}
}
`;
