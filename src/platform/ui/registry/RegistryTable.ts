/**
 * Реестр оболочки Platform 2.0 (P2-0019, пакет А): таблица с выбором колонок (1.7) и сортировкой, чипы фильтров с «×» и панель
 * «Фильтрация» (1.2; на телефоне — на весь экран), кнопка «Только просроченные» (1.3), выбор строк и плашка «Выбрано: N» с местом
 * под действия модуля (1.4), группы-аккордеоны «Всего: N» с мини-счётчиками статусов (1.1), пустое состояние, сохранённые виды
 * и «Скопировать ссылку» (1.6). Вид (фильтры, сортировка, колонки, группировка) хранит модуль (state / onState); выбор — тоже.
 * P2-0041: панель — одна строка «Фильтр · Показано | (действия модуля, например Excel) · ⋯»; «Только просроченные» — в «Фильтре»,
 * группировка, колонки, виды и ссылка — в меню «⋯». На телефоне — та же одна строка.
 * P2-0046: quick — фильтр одним нажатием, кнопками со счётчиками («Все 6 · Черновики 1 · Выданы 4»); compact — строка телефона
 * (2–3 главных поля одной строкой вместо карточки «подпись: значение»); selectMode — галочки появляются после «Выбрать».
 * Цвета — только токены дизайн-системы (tokens.ts, StatusBadge). Бизнес-API не вызывает.
 */
import { createElement as h, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { StatusBadge } from '../primitives.ts';
import type { Status } from '../primitives.ts';
import type { RegistryColumn, RegistryFilter, RegistryState } from './model.ts';
import { EMPTY_STATE, chipsOf, countTones, filterOptions, filterRows, groupRows, linkFor, sortRows, toggleValue, visibleColumns } from './model.ts';
import type { ViewScope } from './views.ts';
import { deleteView, listViews, saveView, viewState } from './views.ts';

export interface RegistryGroupBy<T> { label: string; key: (r: T) => string }

/** Строки в порядке экрана: фильтры → сортировка → (при группировке) по группам. Тот же порядок — у «пред./след.» карточки. */
export function registryRows<T>(rows: T[], o: { filters: RegistryFilter<T>[]; columns: RegistryColumn<T>[]; state: RegistryState; isOverdue?: (r: T) => boolean; groupBy?: RegistryGroupBy<T> }): T[] {
  const list = sortRows(filterRows(rows, o.filters, o.state, o.isOverdue), o.columns, o.state.sort);
  return o.groupBy && o.state.group ? groupRows(list, o.groupBy.key).flatMap((g) => g.rows) : list;
}

const TONES: Status[] = ['red', 'yellow', 'blue', 'green', 'grey'];

export interface RegistryProps<T> {
  testId: string;
  rows: T[];
  rowKey: (r: T) => string;
  columns: RegistryColumn<T>[];
  filters: RegistryFilter<T>[];
  state: RegistryState;
  onState: (s: RegistryState) => void;
  /** «Только просроченные»: признак строки; overdueHint — почему кнопка недоступна (например, «нет срока объекта»). */
  isOverdue?: (r: T) => boolean;
  overdueHint?: string;
  groupBy?: RegistryGroupBy<T>;
  /** Тон строки для мини-счётчиков группы; подписи тонов — для подсказки счётчика. */
  toneOf?: (r: T) => Status;
  toneLabel?: Partial<Record<Status, string>>;
  selected: Set<string>;
  onSelect: (next: Set<string>) => void;
  /** Действия плашки «Выбрано: N» (выбранные строки в порядке экрана). */
  actions?: (rows: T[]) => ReactNode;
  onOpen?: (r: T) => void;
  openKey?: string;
  empty: string;
  /** Личные виды (на устройстве) и база ссылки (#/…); без них — кнопок видов и ссылки нет. */
  views?: ViewScope;
  linkBase?: string;
  /** P2-0041: свои кнопки модуля в правой части панели (Excel); lead — в левой, перед «Фильтром» (период «Журнала»). */
  tools?: ReactNode;
  lead?: ReactNode;
  /** Подменяется в тестах. */
  copy?: (text: string) => Promise<boolean>;
  /** P2-0046: фильтр-кнопки над списком по одному из filters (id) — «Все N» и значения со счётчиками. */
  quick?: { filter: string; all?: string };
  /** P2-0046: строка на телефоне (≤ 760 px) — вместо карточки со всеми колонками. */
  compact?: (r: T) => ReactNode;
  /** P2-0046: галочки выбора скрыты, пока не нажали «Выбрать» (или пока что-то выбрано). */
  selectMode?: boolean;
  /** P2-0046: действия строки в последней колонке (например, «Принять / Отклонить»); на телефоне — в compact. */
  rowActions?: (r: T) => ReactNode;
}

/** P2-0041: кнопка «Excel» панели реестра — коротко «Excel (N)»; на телефоне — «Excel»; полная подпись — для диктора и подсказки. */
export function RegistryExport(props: { count: number; testId: string; onClick: () => void }): ReactElement {
  const full = `Выгрузить список в Excel (${props.count})`;
  return h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': props.testId, disabled: !props.count, title: full, 'aria-label': full, onClick: props.onClick },
    'Excel', h('span', { className: 'p2-reg__long' }, ` (${props.count})`));
}

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function RegistryTable<T>(p: RegistryProps<T>): ReactElement {
  const { rows, rowKey, columns, filters, state, onState, selected, onSelect } = p;
  const [panel, setPanel] = useState<RegistryState | null>(null);
  const [colsOpen, setColsOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLSpanElement | null>(null);
  // Меню «⋯», «Колонки», «Виды» закрываются нажатием мимо них и клавишей Esc.
  const anyPop = moreOpen || colsOpen || viewsOpen;
  useEffect(() => {
    if (!anyPop) return undefined;
    const close = (e: Event): void => {
      if (e instanceof KeyboardEvent ? e.key !== 'Escape' : moreRef.current && moreRef.current.contains(e.target as Node)) return;
      setMoreOpen(false); setColsOpen(false); setViewsOpen(false);
    };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [anyPop]);
  const [viewName, setViewName] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState('');
  const [link, setLink] = useState('');
  const [, bump] = useState(0);
  const [picking, setPicking] = useState(false);
  const checks = !p.selectMode || picking || selected.size > 0;

  const visible = visibleColumns(columns, state);
  const list = useMemo(() => sortRows(filterRows(rows, filters, state, p.isOverdue), columns, state.sort), [rows, filters, state, p.isOverdue, columns]);
  const groups = p.groupBy && state.group ? groupRows(list, p.groupBy.key) : null;
  const ordered = groups ? groups.flatMap((g) => g.rows) : list;
  const chips = chipsOf(state, filters);
  const nFilters = Object.values(state.f).reduce((a, v) => a + v.length, 0);
  const selRows = ordered.filter((r) => selected.has(rowKey(r)));
  const allSel = ordered.length > 0 && selRows.length === ordered.length;
  const saved = p.views ? listViews(p.views) : [];

  const setSort = (id: string): void => {
    const cur = state.sort && state.sort.id === id ? state.sort.dir : null;
    onState({ ...state, sort: cur === 'asc' ? { id, dir: 'desc' } : cur === 'desc' ? null : { id, dir: 'asc' } });
  };
  const toggleRow = (k: string): void => { const n = new Set(selected); if (n.has(k)) n.delete(k); else n.add(k); onSelect(n); };
  const toggleAll = (): void => onSelect(allSel ? new Set() : new Set(ordered.map(rowKey)));
  const toggleCol = (id: string): void => {
    const cur = visible.filter((c) => !c.fixed).map((c) => c.id);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    onState({ ...state, cols: columns.filter((c) => !c.fixed && next.includes(c.id)).map((c) => c.id) });
  };
  async function share(): Promise<void> {
    const base = `${window.location.origin}${window.location.pathname}`;
    const url = base + linkFor(p.linkBase || '', state);
    const ok = await (p.copy || copyText)(url);
    setLink(ok ? '' : url);
    setNotice(ok ? 'Ссылка на этот вид скопирована' : 'Скопируйте ссылку вручную');
  }

  const cell = (c: RegistryColumn<T>, r: T): ReactNode => (c.render ? c.render(r) : (() => { const v = c.value(r); return v === null ? '—' : typeof v === 'number' ? v.toLocaleString('ru-RU', { maximumFractionDigits: 3 }) : v; })());
  const rowEl = (r: T): ReactElement => {
    const k = rowKey(r);
    return h('tr', { key: k, className: 'p2-reg__row' + (selected.has(k) ? ' p2-reg__row--sel' : '') + (p.openKey === k ? ' p2-reg__row--open' : ''), 'data-row': k },
      checks ? h('td', { className: 'p2-reg__check' },
        h('input', { type: 'checkbox', checked: selected.has(k), 'aria-label': 'Выбрать строку', 'data-testid': 'p2-reg-select', onChange: () => toggleRow(k) })) : null,
      p.compact ? h('td', { className: 'p2-reg__compact', 'data-testid': 'p2-reg-compact' },
        p.onOpen && !checks ? h('button', { type: 'button', className: 'p2-reg__cbtn', onClick: () => p.onOpen!(r) }, p.compact(r)) : p.compact(r)) : null,
      visible.map((c, i) => h('td', { key: c.id, 'data-col': c.id, 'data-label': c.label, className: (c.align === 'right' ? 'p2-num p2-reg__r' : '') + (i === 0 ? ' p2-reg__main' : '') },
        i === 0 && p.onOpen
          ? h('button', { type: 'button', className: 'p2-reg__open', 'data-testid': 'p2-reg-open', onClick: () => p.onOpen!(r) }, cell(c, r))
          : cell(c, r))),
      p.rowActions ? h('td', { className: 'p2-reg__acts' }, p.rowActions(r)) : null);
  };

  const head = h('thead', null, h('tr', null,
    checks ? h('th', { className: 'p2-reg__check' }, h('input', { type: 'checkbox', checked: allSel, 'aria-label': 'Выбрать все строки списка', 'data-testid': 'p2-reg-select-all', onChange: toggleAll, disabled: !ordered.length })) : null,
    p.compact ? h('th', { className: 'p2-reg__compact' }) : null,
    visible.map((c) => {
      const dir = state.sort && state.sort.id === c.id ? state.sort.dir : null;
      return h('th', { key: c.id, className: c.align === 'right' ? 'p2-reg__r' : '', 'aria-sort': dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none' },
        h('button', { type: 'button', className: 'p2-reg__sort', 'data-testid': 'p2-reg-sort', 'data-col': c.id, onClick: () => setSort(c.id) },
          c.label, dir ? h('span', { 'aria-hidden': 'true' }, dir === 'asc' ? ' ↑' : ' ↓') : null));
    }),
    p.rowActions ? h('th', { className: 'p2-reg__acts' }) : null));

  const counters = (rs: T[]): ReactNode => {
    if (!p.toneOf) return null;
    const c = countTones(rs, p.toneOf);
    return h('span', { className: 'p2-reg__counts' }, TONES.filter((t) => c[t]).map((t) =>
      h(StatusBadge, { key: t, status: t, label: String(c[t]), title: p.toneLabel?.[t], testId: 'p2-reg-count' })));
  };

  const body = groups
    ? groups.map((g) => {
        const open = !closed[g.key];
        return h('tbody', { key: g.key, 'data-group': g.key },
          h('tr', { className: 'p2-reg__group' }, h('td', { colSpan: visible.length + (checks ? 1 : 0) + (p.compact ? 1 : 0) + (p.rowActions ? 1 : 0) },
            h('button', { type: 'button', className: 'p2-reg__gbtn', 'aria-expanded': open, 'data-testid': 'p2-reg-group', onClick: () => setClosed({ ...closed, [g.key]: open }) },
              h('span', { 'aria-hidden': 'true', className: 'p2-reg__chev' }, open ? '▾' : '▸'),
              h('b', null, g.key), h('span', { className: 'p2-reg__total' }, `Всего: ${g.rows.length}`)),
            counters(g.rows))),
          open ? g.rows.map(rowEl) : null);
      })
    : h('tbody', null, list.map(rowEl));

  const draft = panel || state;
  const overdueOn = !!p.isOverdue || p.overdueHint !== undefined;
  const closeMenus = (): void => { setColsOpen(false); setViewsOpen(false); setMoreOpen(false); };
  const filterPanel = panel
    ? h('div', { className: 'p2-reg__overlay', 'data-testid': 'p2-reg-panel', role: 'dialog', 'aria-label': 'Фильтр' },
        h('div', { className: 'p2-reg__panel' },
          h('div', { className: 'p2-reg__panel-head' }, h('b', null, 'Фильтр'),
            h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setPanel(null) }, 'Закрыть')),
          h('div', { className: 'p2-reg__panel-body' },
            overdueOn
              ? h('div', { className: 'p2-reg__fs' },
                  h('button', { type: 'button', className: 'p2-reg__toggle' + (state.overdue ? ' p2-reg__toggle--on' : ''), 'aria-pressed': state.overdue, 'data-testid': 'p2-reg-overdue',
                    disabled: !!p.overdueHint && !state.overdue, title: p.overdueHint || '',
                    onClick: () => { const next = { ...state, overdue: !state.overdue }; onState(next); setPanel({ ...draft, overdue: next.overdue }); } }, 'Только просроченные'),
                  p.overdueHint ? h('div', { className: 'p2-reg__muted', 'data-testid': 'p2-reg-overdue-hint' }, p.overdueHint) : null)
              : null,
            filters.map((d) => h('fieldset', { key: d.id, className: 'p2-reg__fs', 'data-filter': d.id },
              h('legend', null, d.label),
              filterOptions(rows, d).map((o) => h('label', { key: o.value, className: 'p2-reg__opt' },
                h('input', { type: 'checkbox', checked: (draft.f[d.id] || []).includes(o.value), 'data-testid': 'p2-reg-opt', 'data-value': o.value,
                  onChange: () => setPanel(toggleValue(draft, d.id, o.value)) }),
                h('span', null, o.label), h('span', { className: 'p2-num p2-reg__muted' }, String(o.count))))))),
          h('div', { className: 'p2-reg__panel-foot' },
            h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'p2-reg-panel-reset', onClick: () => setPanel({ ...draft, f: {} }) }, 'Сбросить'),
            h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'p2-reg-panel-apply', onClick: () => { onState(draft); setPanel(null); } }, 'Применить'))))
    : null;

  const colsPop = colsOpen
    ? h('div', { className: 'p2-reg__pop p2-reg__pop--right', 'data-testid': 'p2-reg-cols' },
        columns.filter((c) => !c.fixed).map((c) => h('label', { key: c.id, className: 'p2-reg__opt' },
          h('input', { type: 'checkbox', checked: visible.some((v) => v.id === c.id), 'data-col': c.id, onChange: () => toggleCol(c.id) }), h('span', null, c.label))),
        h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => onState({ ...state, cols: null }) }, 'Как было'))
    : null;

  const viewsPop = viewsOpen && p.views
    ? h('div', { className: 'p2-reg__pop p2-reg__pop--right', 'data-testid': 'p2-reg-views' },
        saved.length
          ? saved.map((v) => h('div', { key: v.name, className: 'p2-reg__view' },
              h('button', { type: 'button', className: 'p2-reg__open', 'data-testid': 'p2-reg-view', onClick: () => { onState(viewState(v)); setViewsOpen(false); setNotice(`Вид «${v.name}»`); } }, v.name),
              h('button', { type: 'button', className: 'p2-reg__x', 'aria-label': `Удалить вид ${v.name}`, onClick: () => { deleteView(p.views!, v.name); bump((x) => x + 1); } }, '×')))
          : h('div', { className: 'p2-reg__muted' }, 'Сохранённых видов пока нет'),
        h('div', { className: 'p2-reg__view-save' },
          h('input', { type: 'text', className: 'pj-input', maxLength: 60, placeholder: 'Название вида', value: viewName, 'data-testid': 'p2-reg-view-name', onChange: (e) => setViewName((e.target as HTMLInputElement).value) }),
          h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'p2-reg-view-save', disabled: !viewName.trim(),
            onClick: () => { const ok = saveView(p.views!, viewName, state); setNotice(ok ? `Вид «${viewName.trim()}» сохранён на этом устройстве` : 'Не удалось сохранить вид на этом устройстве'); setViewName(''); bump((x) => x + 1); } }, 'Сохранить')))
    : null;

  // P2-0046: фильтр-кнопки — одно нажатие вместо панели «Фильтр»; выбранная — единственное значение фильтра quick.filter.
  const qd = p.quick ? filters.find((d) => d.id === p.quick!.filter) : undefined;
  const qVal = qd ? state.f[qd.id] || [] : [];
  const quickRow = qd
    ? h('div', { className: 'p2-reg__quick', role: 'group', 'aria-label': qd.label, 'data-testid': 'p2-reg-quick' },
        h('button', { type: 'button', className: 'p2-reg__q' + (!qVal.length ? ' p2-reg__q--on' : ''), 'aria-pressed': !qVal.length, 'data-value': '',
          onClick: () => { const f = { ...state.f }; delete f[qd.id]; onState({ ...state, f }); } }, p.quick!.all || 'Все', h('span', { className: 'p2-reg__qn' }, String(rows.length))),
        filterOptions(rows, qd).map((o) => {
          const on = qVal.length === 1 && qVal[0] === o.value;
          return h('button', { key: o.value, type: 'button', className: 'p2-reg__q' + (on ? ' p2-reg__q--on' : ''), 'aria-pressed': on, 'data-value': o.value, 'data-testid': 'p2-reg-q',
            onClick: () => onState({ ...state, f: { ...state.f, [qd.id]: on ? [] : [o.value] } }) }, o.label, h('span', { className: 'p2-reg__qn' }, String(o.count)));
        }))
    : null;

  return h('div', { className: 'p2-reg' + (p.compact ? ' p2-reg--compact' : '') + (checks ? '' : ' p2-reg--nocheck'), 'data-testid': p.testId },
    quickRow,
    h('div', { className: 'p2-reg__tools' },
      p.lead || null,
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'p2-reg-filter', onClick: () => { setPanel(state); closeMenus(); } },
        'Фильтр', nFilters + (state.overdue ? 1 : 0) ? h('span', { className: 'p2-reg__n' }, String(nFilters + (state.overdue ? 1 : 0))) : null),
      h('span', { className: 'p2-reg__muted p2-num p2-reg__shown', 'data-testid': 'p2-reg-shown' }, h('span', { className: 'p2-reg__long' }, 'Показано: '), `${list.length} из ${rows.length}`),
      h('span', { className: 'p2-reg__right' },
        p.tools || null,
        p.selectMode
          ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'aria-pressed': checks, 'data-testid': 'p2-reg-pick',
              onClick: () => { if (checks) { setPicking(false); onSelect(new Set()); } else setPicking(true); } }, checks ? 'Готово' : 'Выбрать')
          : null,
        h('span', { className: 'p2-reg__wrap', ref: moreRef },
          h('button', { type: 'button', className: 'pf-btn pf-btn--ghost p2-reg__more', 'aria-expanded': anyPop, 'aria-label': 'Ещё: группировка, колонки, виды, ссылка',
            'data-testid': 'p2-reg-more', onClick: () => { const o = anyPop; closeMenus(); setMoreOpen(!o); } }, '⋯'),
          // Пункты меню всегда в разметке (скрыты, пока меню закрыто) — так «Колонки» / «Виды» открывают своё окно на том же месте.
          h('div', { className: 'p2-reg__pop p2-reg__pop--right', 'data-testid': 'p2-reg-menu', hidden: !moreOpen },
            p.groupBy
              ? h('label', { className: 'p2-reg__opt p2-reg__groupby' }, h('input', { type: 'checkbox', checked: state.group, 'data-testid': 'p2-reg-groupby', onChange: () => onState({ ...state, group: !state.group }) }), `Группировать: ${p.groupBy.label.toLowerCase()}`)
              : null,
            h('button', { type: 'button', className: 'p2-reg__item', 'aria-expanded': colsOpen, 'data-testid': 'p2-reg-cols-open', onClick: () => { setMoreOpen(false); setViewsOpen(false); setColsOpen(!colsOpen); } }, 'Колонки…'),
            p.views ? h('button', { type: 'button', className: 'p2-reg__item', 'aria-expanded': viewsOpen, 'data-testid': 'p2-reg-views-open', onClick: () => { setMoreOpen(false); setColsOpen(false); setViewsOpen(!viewsOpen); } }, 'Виды…') : null,
            p.linkBase !== undefined ? h('button', { type: 'button', className: 'p2-reg__item', 'data-testid': 'p2-reg-share', onClick: () => { setMoreOpen(false); void share(); } }, 'Скопировать ссылку') : null),
          colsPop, viewsPop))),
    chips.length || state.overdue
      ? h('div', { className: 'p2-reg__chips', 'data-testid': 'p2-reg-chips' },
          state.overdue ? h('span', { className: 'p2-reg__chip' }, 'Только просроченные',
            h('button', { type: 'button', className: 'p2-reg__x', 'aria-label': 'Убрать: только просроченные', onClick: () => onState({ ...state, overdue: false }) }, '×')) : null,
          chips.map((c) => h('span', { key: c.filter + ':' + c.value, className: 'p2-reg__chip', 'data-testid': 'p2-reg-chip' }, c.label,
            h('button', { type: 'button', className: 'p2-reg__x', 'aria-label': `Убрать фильтр ${c.label}`, 'data-testid': 'p2-reg-chip-x', onClick: () => onState(toggleValue(state, c.filter, c.value)) }, '×'))),
          h('button', { type: 'button', className: 'p2-reg__link', 'data-testid': 'p2-reg-reset', onClick: () => onState({ ...EMPTY_STATE, sort: state.sort, cols: state.cols, group: state.group }) }, 'Сбросить всё'))
      : null,
    notice ? h('div', { className: 'pj-notice', role: 'status', 'data-testid': 'p2-reg-notice' }, notice,
      link ? h('input', { type: 'text', readOnly: true, className: 'pj-input', value: link, 'aria-label': 'Ссылка на вид', onFocus: (e) => (e.target as HTMLInputElement).select() }) : null) : null,
    selRows.length
      ? h('div', { className: 'p2-reg__selbar', role: 'region', 'aria-label': 'Действия с выбранными', 'data-testid': 'p2-reg-selbar' },
          h('b', { className: 'p2-num', 'data-testid': 'p2-reg-selected' }, `Выбрано: ${selRows.length}`),
          p.actions ? p.actions(selRows) : null,
          h('button', { type: 'button', className: 'p2-reg__link', 'data-testid': 'p2-reg-unselect', onClick: () => onSelect(new Set()) }, 'Снять выбор'))
      : null,
    list.length
      ? h('div', { className: 'p2-reg__scroll' }, h('table', { className: 'p2-reg__table' }, head, body))
      : h('div', { className: 'pf-card pj-empty p2-reg__muted', 'data-testid': 'p2-reg-empty' }, rows.length ? 'Ничего не найдено — измените или сбросьте фильтры.' : p.empty),
    filterPanel);
}
