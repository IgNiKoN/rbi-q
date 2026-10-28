/**
 * Шахматка объекта (P2-0055): столбцы — секции, строки — этажи (верхний сверху), клетки — помещения (название и стр. №).
 * Частный вид дерева мест «Объектов и мест»: те же данные (дети, загруженные экраном), тот же выбор места (карточка) и те же
 * действия «+» (следующий этаж секции, следующее помещение этажа). Сетку строит buildChess; структура не по шаблону — подпись.
 * На телефоне шахматка листается вбок внутри своего блока, страница — нет.
 */
import { createElement as h } from 'react';
import type { ReactElement } from 'react';
import type { PlaceNode } from '../core/projects.service.ts';
import { buildChess } from './places-editor.ts';

export function PlacesChess(props: {
  sections: PlaceNode[]; kids: Record<string, PlaceNode[] | undefined>; selected: string | null; onSelect: (n: PlaceNode) => void;
  /** «+»: у секции — следующий этаж, у этажа — следующее помещение; null — правка недоступна. */
  onPlus: ((parent: PlaceNode) => void) | null; plusTitle: (parent: PlaceNode) => string; busy?: boolean;
}): ReactElement {
  const { sections, kids, selected } = props;
  const g = buildChess(sections, kids, kids);
  if (!g.ok) return h('div', { className: 'pf-muted op-empty', 'data-testid': 'op-chess-na' }, 'Шахматка недоступна для этой структуры — смотрите дерево.');
  const plus = (parent: PlaceNode, label: string, cls: string): ReactElement | null => props.onPlus
    ? h('button', { type: 'button', className: cls, title: props.plusTitle(parent), 'aria-label': props.plusTitle(parent), disabled: props.busy,
        'data-testid': parent.node_type === 'section' ? 'op-chess-plus-floor' : 'op-chess-plus-place', onClick: () => props.onPlus!(parent) }, label)
    : null;
  const sel = (n: PlaceNode): string => (selected === n.id ? ' is-sel' : '');
  return h('div', { className: 'op-chess', 'data-testid': 'op-chess' },
    h('div', { className: 'op-chess__scroll' }, h('div', { className: 'op-chess__grid', role: 'grid', style: { gridTemplateColumns: `auto repeat(${g.cols.length}, max-content)` } },
      h('div', { className: 'op-chess__corner', role: 'columnheader' }),
      g.cols.map((c) => h('div', { key: c.section.id, className: 'op-chess__head', role: 'columnheader' },
        h('button', { type: 'button', className: 'op-chess__sec' + sel(c.section), onClick: () => props.onSelect(c.section) }, c.section.name),
        plus(c.section, '+ эт.', 'op-chess__add'))),
      g.rows.flatMap((r) => [
        h('div', { key: 'l' + r.key, className: 'op-chess__floor', role: 'rowheader' }, r.label),
        ...g.cols.map((c) => {
          const cell = c.cells[r.key];
          if (!cell) return h('div', { key: c.section.id + r.key, className: 'op-chess__none', 'aria-hidden': 'true' });
          return h('div', { key: c.section.id + r.key, className: 'op-chess__row', role: 'gridcell', 'data-floor-id': cell.floor.id },
            h('button', { type: 'button', className: 'op-chess__fl' + sel(cell.floor), title: cell.floor.name, 'aria-label': `${c.section.name} · ${cell.floor.name}`,
              onClick: () => props.onSelect(cell.floor) }, '⋮'),
            cell.places.length ? cell.places.map((p) => h('button', { key: p.id, type: 'button', className: 'op-chess__cell' + sel(p), 'data-place-id': p.id,
              'aria-label': `${c.section.name} · ${cell.floor.name} · ${p.name}`, onClick: () => props.onSelect(p) },
              h('b', null, p.name), p.build_no ? h('small', null, 'стр. ' + p.build_no) : null))
              : h('span', { className: 'op-chess__empty' }, 'пусто'),
            cell.floor.node_type === 'floor' ? plus(cell.floor, '+', 'op-chess__cell op-chess__cell--add') : null);
        })]))),
    h('div', { className: 'op-chess__legend' }, 'Столбцы — секции, строки — этажи (верхний сверху), клетки — помещения: название и строительный №. ',
      'Щелчок по клетке — карточка места; «⋮» в начале строки — карточка этажа; «+» — следующее помещение или этаж, как в дереве.'));
}

export const CHESS_CSS = `
.op-chess{border:1px solid var(--card-border);border-radius:14px;background:var(--card-bg);padding:10px;max-width:100%;box-sizing:border-box;min-width:0}
.op-chess__scroll{overflow-x:auto;max-width:100%}
.op-chess__grid{display:grid;gap:6px 14px;align-items:center;min-width:max-content}
.op-chess__head{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:2px 0 6px;border-bottom:1px solid var(--card-border)}
.op-chess__sec{font:inherit;font-size:13.5px;font-weight:600;border:0;background:transparent;color:var(--text-main);padding:4px 6px;border-radius:8px;cursor:pointer}
.op-chess__floor{font-size:12.5px;color:var(--text-muted);text-align:right;white-space:nowrap;padding-right:2px}
.op-chess__row{display:flex;align-items:stretch;gap:4px}
.op-chess__fl{font:inherit;width:18px;border:0;border-radius:6px;background:transparent;color:var(--text-muted);cursor:pointer;padding:0}
.op-chess__cell{font:inherit;width:58px;min-height:44px;border:1px solid var(--card-border);border-radius:8px;background:var(--card-bg-2,var(--card-bg));color:var(--text-main);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font-size:12px;line-height:1.2;cursor:pointer;padding:2px}
.op-chess__cell b{font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.op-chess__cell small{font-size:11px;color:var(--text-muted)}
.op-chess__cell--add,.op-chess__add{font:inherit;color:var(--accent-text,var(--primary));background:transparent;border:1px dashed var(--line-strong,var(--card-border));border-radius:8px;cursor:pointer;font-weight:600}
.op-chess__cell--add{width:40px}
.op-chess__add{font-size:12.5px;min-height:32px;padding:0 8px}
.op-chess__empty{display:flex;align-items:center;padding:0 10px;min-height:44px;border:1px dashed var(--card-border);border-radius:8px;font-size:12px;color:var(--text-muted)}
.op-chess .is-sel{border-color:var(--accent,var(--primary));box-shadow:inset 0 0 0 1px var(--accent,var(--primary));background:var(--sel-bg,rgba(196,154,95,.1))}
.op-chess__fl.is-sel,.op-chess__sec.is-sel{color:var(--text-main)}
.op-chess button:focus-visible{outline:2px solid var(--accent,var(--primary));outline-offset:1px}
.op-chess__legend{font-size:12px;color:var(--text-muted);margin-top:10px;line-height:1.45;max-width:72ch}
.op-seg{display:inline-flex;border:1px solid var(--card-border);border-radius:10px;overflow:hidden;background:var(--card-bg)}
.op-seg button{font:inherit;font-size:13px;border:0;background:transparent;color:var(--text-muted);padding:0 14px;min-height:36px;cursor:pointer}
.op-seg button[aria-pressed=true]{background:var(--sel-bg,rgba(196,154,95,.1));color:var(--text-main);font-weight:600}
@media (max-width:899.98px){.op-chess__cell,.op-chess__cell--add{min-height:48px}.op-seg button{min-height:44px}}
`;
