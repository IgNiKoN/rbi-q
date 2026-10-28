/**
 * Деталь «дерево мест» (P2-0047, DESIGN_SYSTEM.md «Детали»; на странице «Образцы»): строки с раскрытием ▸/▾, подпись вида
 * и короткая сводка, выбор строки (открывает карточку), меню «⋯» строки. Данных не грузит: дети — от экрана (ленивая загрузка
 * при раскрытии — забота экрана), id узла — ключ. На телефоне строка во всю ширину, отступ уровня меньше.
 */
import { createElement as h } from 'react';
import type { DragEvent, ReactElement, ReactNode } from 'react';
import { MoreMenu } from './page.ts';
import type { MoreItem } from './page.ts';

export interface TreeItem { id: string; name: string; hasKids: boolean }
/** P2-0055: куда бросить перетаскиваемую строку — перед, после или внутрь строки. */
export type DropWhere = 'before' | 'after' | 'inside';
export interface TreeDrag<T> {
  can: (n: T) => boolean; start: (n: T) => void; end: () => void;
  /** Можно ли бросить сюда (экран заодно запоминает подсказку для hint). */
  over: (n: T, where: DropWhere) => boolean; drop: (n: T, where: DropWhere) => void;
  hint: { id: string; where: DropWhere; ok: boolean; reason?: string } | null;
}

export function PlaceTree<T extends TreeItem>(props: {
  testId: string; roots: T[]; kids: Record<string, T[] | undefined>; open: Record<string, boolean>;
  onToggle: (n: T) => void; selected?: string | null; onSelect?: (n: T) => void;
  kind: (n: T) => string; meta?: (n: T) => string; menu?: (n: T) => MoreItem[];
  /** Длинный список детей — первые limit и «ещё N» (раскрывает весь). */
  limit?: number; more?: Record<string, boolean>; onMore?: (parentId: string) => void;
  /** P2-0048: выбор галочками (вместо открытия строки) — строка становится подписью к галочке. */
  check?: (n: T) => { checked: boolean; onChange: () => void; disabled?: boolean } | null;
  /** P2-0048: содержимое под названием (кто назначен, предупреждение) и кнопка справа (до меню «⋯»). */
  extra?: (n: T) => ReactNode; action?: (n: T) => ReactNode;
  /** P2-0055: правка названия на месте — вместо подписи строки id показывается node (поле ввода). */
  editing?: { id: string; node: ReactNode } | null;
  /** P2-0055: двойной щелчок по названию — правка на месте. */
  onRename?: (n: T) => void;
  /** P2-0055: перетаскивание мышью (только ПК): строка берётся за ⋮⋮, полоса показывает место вставки. */
  drag?: TreeDrag<T>;
}): ReactElement {
  const { kids, open } = props;
  const nameEl = (n: T, meta: string): ReactElement => {
    const label = [h('b', { key: 'b' }, n.name), h('span', { key: 'k', className: 'p2-tree__kind' }, props.kind(n) + (meta ? ' · ' + meta : ''))];
    const chk = props.check ? props.check(n) : null;
    const el = chk
      ? h('label', { className: 'p2-tree__name p2-tree__name--check' },
          h('input', { type: 'checkbox', checked: chk.checked, disabled: chk.disabled, onChange: chk.onChange, 'data-testid': 'p2-tree-check', 'aria-label': n.name }), ...label)
      : props.editing && props.editing.id === n.id ? h('div', { className: 'p2-tree__name p2-tree__name--edit' }, props.editing.node)
      : h('button', { type: 'button', className: 'p2-tree__name', 'data-testid': 'p2-tree-open', 'aria-current': props.selected === n.id ? 'true' : undefined,
          onClick: () => (props.onSelect ? props.onSelect(n) : props.onToggle(n)),
          onDoubleClick: props.onRename ? () => props.onRename!(n) : undefined }, ...label);
    const extra = props.extra ? props.extra(n) : null;
    return extra ? h('div', { className: 'p2-tree__main' }, el, h('div', { className: 'p2-tree__extra' }, extra)) : el;
  };
  const row = (n: T, level: number): ReactElement => {
    const isOpen = !!open[n.id];
    const list = kids[n.id];
    const menu = props.menu ? props.menu(n) : [];
    const meta = props.meta ? props.meta(n) : '';
    const d = props.drag;
    const canDrag = !!d && d.can(n);
    const hint = d && d.hint && d.hint.id === n.id ? d.hint : null;
    const whereOf = (e: { clientY: number; currentTarget: EventTarget }): DropWhere => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const y = e.clientY - r.top;
      return y < r.height * 0.28 ? 'before' : y > r.height * 0.72 ? 'after' : 'inside';
    };
    const dnd = d ? {
      draggable: canDrag || undefined,
      onDragStart: canDrag ? (e: DragEvent) => { if (e.dataTransfer) { e.dataTransfer.setData('text/plain', n.id); e.dataTransfer.effectAllowed = 'move'; } d.start(n); } : undefined,
      onDragOver: (e: DragEvent) => { const ok = d.over(n, whereOf(e)); if (ok) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } else if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'; },
      onDrop: (e: DragEvent) => { e.preventDefault(); d.drop(n, whereOf(e)); },
      onDragEnd: () => d.end()
    } : {};
    return h('li', { key: n.id, className: 'p2-tree__item', 'data-node-id': n.id },
      h('div', { className: 'p2-tree__row' + (props.selected === n.id ? ' is-sel' : '') + (hint ? ` is-drop-${hint.where}${hint.ok ? '' : ' is-drop-no'}` : ''),
        style: { ['--p2-tree-level' as string]: String(level) }, title: hint && !hint.ok ? hint.reason : undefined, ...dnd },
        d ? h('span', { className: 'p2-tree__grip' + (canDrag ? '' : ' is-off'), 'aria-hidden': 'true' }, '⋮⋮') : null,
        n.hasKids
          ? h('button', { type: 'button', className: 'p2-tree__tog', 'aria-expanded': isOpen, 'aria-label': (isOpen ? 'Свернуть ' : 'Раскрыть ') + n.name,
              'data-testid': 'p2-tree-toggle', onClick: () => props.onToggle(n) }, isOpen ? '▾' : '▸')
          : h('span', { className: 'p2-tree__tog p2-tree__tog--leaf', 'aria-hidden': 'true' }),
        nameEl(n, meta),
        props.action ? props.action(n) : null,
        menu.length ? h(MoreMenu, { testId: 'p2-tree-more', items: menu, label: 'Действия: ' + n.name }) : null,
        hint && !hint.ok && hint.reason ? h('span', { className: 'p2-tree__drop-no', role: 'status' }, '⦸ ' + hint.reason) : null),
      isOpen && list ? group(list, n.id, level + 1) : isOpen ? h('div', { className: 'p2-tree__wait' }, 'Загрузка…') : null);
  };
  const group = (list: T[], parentId: string, level: number): ReactElement => {
    const cut = props.limit && list.length > props.limit + 2 && !(props.more && props.more[parentId]) ? props.limit : list.length;
    return h('ul', { className: 'p2-tree__list' }, list.slice(0, cut).map((n) => row(n, level)),
      cut < list.length ? h('li', { key: '__more', className: 'p2-tree__item' },
        h('button', { type: 'button', className: 'p2-tree__more', 'data-testid': 'p2-tree-more-rows', style: { ['--p2-tree-level' as string]: String(level) },
          onClick: () => props.onMore && props.onMore(parentId) }, `ещё ${list.length - cut}`)) : null);
  };
  return h('div', { className: 'p2-tree', 'data-testid': props.testId }, group(props.roots, '', 0));
}

export const P2_TREE_CSS = `
.p2-tree{background:var(--card-bg);border:1px solid var(--card-border);border-radius:14px;padding:6px}
.p2-tree__list{list-style:none;margin:0;padding:0}
.p2-tree__row{display:flex;align-items:center;gap:4px;min-height:44px;padding:0 4px 0 calc(var(--p2-tree-level,0) * 20px);border-radius:10px;min-width:0}
.p2-tree__row:hover{background:var(--hover-bg,rgba(0,0,0,.04))}
.p2-tree__row.is-sel{background:color-mix(in srgb,var(--p2-chart-fact,#2a6f9e) 14%,transparent)}
.p2-tree__tog{flex:0 0 36px;height:36px;border:0;background:transparent;color:var(--text-muted);font-size:15px;border-radius:8px;cursor:pointer}
.p2-tree__tog--leaf{cursor:default}
.p2-tree__tog:focus-visible,.p2-tree__name:focus-visible,.p2-tree__more:focus-visible{outline:2px solid var(--accent,var(--primary));outline-offset:1px}
.p2-tree__name{font:inherit;flex:1 1 auto;min-width:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;text-align:left;border:0;background:transparent;color:var(--text-main);padding:8px 4px;cursor:pointer;overflow-wrap:anywhere}
.p2-tree__name b{font-size:14px;font-weight:600}
.p2-tree__name--check{align-items:center;cursor:pointer;min-height:44px}
.p2-tree__name--check input{width:20px;height:20px;flex:none;margin:0 6px 0 0;accent-color:var(--accent,var(--primary))}
.p2-tree__main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}
.p2-tree__main .p2-tree__name{flex:none}
.p2-tree__extra{display:flex;flex-wrap:wrap;gap:4px 6px;padding:0 4px 8px;min-width:0}
.p2-tree__kind{font-size:12.5px;color:var(--text-muted)}
.p2-tree__row .p2-more__btn{min-height:36px;min-width:40px;border-color:transparent;background:transparent;color:var(--text-muted)}
.p2-tree__row:hover .p2-more__btn,.p2-tree__row .p2-more__btn[aria-expanded=true]{color:var(--text-main);border-color:var(--card-border)}
.p2-tree__wait{font-size:12.5px;color:var(--text-muted);padding:6px 0 6px 56px}
.p2-tree__more{font:inherit;font-size:13px;font-weight:600;border:0;background:transparent;color:var(--p2-chart-fact,var(--primary));min-height:40px;padding:0 0 0 calc(var(--p2-tree-level,0) * 20px + 40px);cursor:pointer}
.p2-tree__row{position:relative}
.p2-tree__grip{flex:0 0 14px;color:var(--text-muted);font-size:12px;letter-spacing:-2px;opacity:0;cursor:grab;user-select:none}
.p2-tree__row:hover .p2-tree__grip,.p2-tree__row.is-sel .p2-tree__grip{opacity:1}
.p2-tree__grip.is-off{visibility:hidden}
.p2-tree__row[draggable=true]{cursor:default}
.p2-tree__row.is-drop-before{box-shadow:inset 0 2px 0 var(--accent,var(--primary))}
.p2-tree__row.is-drop-after{box-shadow:inset 0 -2px 0 var(--accent,var(--primary))}
.p2-tree__row.is-drop-inside{background:var(--sel-bg,rgba(196,154,95,.12));box-shadow:inset 0 0 0 1px var(--accent,var(--primary))}
.p2-tree__row.is-drop-no{background:transparent;box-shadow:none;outline:1px dashed var(--color-red,#9f4c45);outline-offset:-1px;cursor:not-allowed}
.p2-tree__drop-no{position:absolute;right:8px;top:calc(100% - 4px);z-index:6;background:var(--text-main);color:var(--card-bg);font-size:12px;padding:6px 9px;border-radius:8px;max-width:320px;pointer-events:none}
.p2-tree__name--edit{cursor:default;flex-direction:column;align-items:stretch}
@media (max-width:599.98px){.p2-tree__row{padding-left:calc(var(--p2-tree-level,0) * 12px)}.p2-tree__more{padding-left:calc(var(--p2-tree-level,0) * 12px + 40px)}}
`;
