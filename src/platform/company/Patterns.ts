/**
 * «Образцы» (P2-0047): витрина деталей дизайн-системы на подставных данных — администратору платформы. Каждая новая деталь
 * появляется здесь сразу (DESIGN_SYSTEM.md, «Детали и страница „Образцы“»). Запросов к серверу нет.
 */
import { createElement as h, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { EMPTY_STATE, KpiTile, MoreMenu, PageTabs, PlaceTree, ProgressBar, RecordFields, RegistryTable, Sheet, StageBadge, StageStrip, StatusBadge } from '../ui/index.ts';
import type { RegistryColumn, RegistryFilter, RegistryState } from '../ui/index.ts';

interface Row { id: string; name: string; stage: string; group: string; n: number }
const STAGES = [{ code: 'design', name: 'Проектирование' }, { code: 'tender', name: 'Тендер' }, { code: 'construction', name: 'Строительство' },
  { code: 'commissioning', name: 'Ввод' }, { code: 'warranty', name: 'Гарантия' }, { code: 'operation', name: 'Эксплуатация' }];
const ROWS: Row[] = [
  { id: 'a', name: 'ЖК Образец, 1 очередь', stage: 'construction', group: 'Дирекция «Север»', n: 3 },
  { id: 'b', name: 'ЖК Образец, 2 очередь', stage: 'design', group: 'Дирекция «Север»', n: 1 },
  { id: 'c', name: 'Школа на 600 мест', stage: 'warranty', group: 'Без подразделения', n: 1 }];
interface TNode { id: string; name: string; hasKids: boolean; kind: string; meta: string }
const T = (id: string, name: string, kind: string, meta = '', hasKids = false): TNode => ({ id, name, kind, meta, hasKids });
const TREE_ROOTS = [T('s1', 'Секция 1', 'секция', 'кв. 24', true), T('s2', 'Секция 2', 'секция', 'кв. 24', true)];
const TREE_KIDS: Record<string, TNode[]> = { s1: [T('f1', 'эт. 1', 'этаж', 'мест 4', true), T('f2', 'эт. 2', 'этаж', 'мест 4', true)],
  f1: [T('a1', 'кв. 1', 'квартира', 'стр. № 1 · БТИ 101'), T('a2', 'кв. 2', 'квартира', 'стр. № 2')], f2: [], s2: [] };
const label = (c: string): string => (STAGES.find((s) => s.code === c) || { name: c }).name;

function Block(props: { id: string; title: string; note: string; children?: ReactNode }): ReactElement {
  return h('section', { className: 'pt-block', 'data-pattern': props.id },
    h('div', { className: 'pt-block__head' }, h('h3', null, props.title), h('p', null, props.note)),
    h('div', { className: 'pt-block__body' }, props.children));
}

export function Patterns(): ReactElement {
  const [tab, setTab] = useState('a');
  const [sheet, setSheet] = useState(false);
  const [state, setState] = useState<RegistryState>(EMPTY_STATE);
  const [picked, setPicked] = useState('');
  const [treeOpen, setTreeOpen] = useState<Record<string, boolean>>({ s1: true, f1: true });
  const [treeSel, setTreeSel] = useState<string | null>('a1');
  const columns: RegistryColumn<Row>[] = [
    { id: 'name', label: 'Название', fixed: true, value: (r) => r.name, render: (r) => h('b', null, r.name) },
    { id: 'stage', label: 'Стадия', value: (r) => label(r.stage), render: (r) => h(StageBadge, { label: label(r.stage), tone: r.stage === 'construction' ? 'blue' : r.stage === 'warranty' ? 'green' : 'grey' }) },
    { id: 'n', label: 'Объектов', align: 'right', value: (r) => r.n }];
  const filters: RegistryFilter<Row>[] = [{ id: 'stage', label: 'Стадия', get: (r) => r.stage, optionLabel: label }];
  return h('div', { className: 'pt-page', 'data-testid': 'patterns' },
    h('div', { className: 'pj-titlerow' }, h('div', { className: 'pj-titlebox' }, h('h2', { className: 'pj-title' }, 'Образцы'),
      h('span', { className: 'pf-muted' }, 'Детали, из которых собираются экраны платформы. Подставные данные; ничего не сохраняется.'))),
    h(Block, { id: 'head', title: 'Шапка раздела', note: 'Заголовок, одна главная кнопка (на телефоне — внизу), редкое — в «⋯».' },
      h('div', { className: 'pj-titlerow' }, h('div', { className: 'pj-titlebox' }, h('h2', { className: 'pj-title' }, 'Проекты'), h('span', { className: 'pf-muted' }, '3 проекта')),
        h('div', { className: 'pj-head-actions' }, h(MoreMenu, { testId: 'pt-more', items: [{ id: 'x', label: 'Показать архив · 1', onClick: () => setPicked('архив') }, { id: 'y', label: 'Подразделения', hint: '2 действующих', onClick: () => setPicked('подразделения') }] }),
          h('button', { type: 'button', className: 'pf-btn' }, '+ Проект'))),
      picked ? h('div', { className: 'pf-muted' }, 'Выбрано в «⋯»: ' + picked) : null),
    h(Block, { id: 'tabs', title: 'Вкладки', note: 'Подчёркиванием, обычными буквами; на телефоне листаются вбок.' },
      h(PageTabs, { testId: 'pt-tabs', active: tab, onPick: setTab, items: [{ id: 'a', label: ['Карточка'] }, { id: 'b', label: ['Объекты и места'] }, { id: 'c', label: ['Ещё вкладка ', h('span', { key: 'n', className: 'pf-tab-n' }, '3')] }] })),
    h(Block, { id: 'directory', title: 'Справочник', note: 'Поиск, фильтр-кнопки со счётчиками, группы; строка открывает карточку; на телефоне — короткая строка.' },
      h(RegistryTable<Row>, { testId: 'pt-registry', rows: ROWS, rowKey: (r) => r.id, columns, filters, state, onState: setState, groupBy: { label: 'Подразделение', key: (r) => r.group },
        selected: new Set<string>(), onSelect: () => undefined, noSelect: true, onOpen: (r) => setPicked(r.name), quick: { filter: 'stage', all: 'Все' },
        compact: (r) => h('span', { className: 'pj-compact' }, h('span', { className: 'pj-compact__t' }, h('b', null, r.name), h('small', null, `объектов ${r.n}`)), h(StageBadge, { label: label(r.stage), tone: 'grey' })),
        empty: 'Пусто' })),
    h(Block, { id: 'record', title: 'Карточка записи', note: 'Поля «подпись — значение»: ПК — 4 колонки, планшет — 2, телефон — 1. Пустое — «—».' },
      h(StageStrip, { testId: 'pt-stages', items: STAGES, current: 'construction' }),
      h(RecordFields, { testId: 'pt-fields', fields: [{ id: 'a', label: 'Код', value: 'OBR-1' }, { id: 'b', label: 'Подразделение', value: 'Дирекция «Север»' },
        { id: 'c', label: 'Адрес', value: 'Санкт-Петербург, ул. Образцовая, 1' }, { id: 'd', label: 'Сроки (план)', value: '01.03.2026 — 31.12.2027' },
        { id: 'e', label: 'Руководитель проекта', value: 'Иванов И. И.' }, { id: 'f', label: 'Наша роль', value: 'Генподрядчик' }, { id: 'g', label: 'Заказчик', value: null }, { id: 'h', label: 'Часовой пояс · страна', value: 'Moscow · RU' }] })),
    h(Block, { id: 'tree', title: 'Дерево мест', note: 'Раскрытие ▸/▾, вид и короткая сводка, нажатие — карточка места, «⋯» — действия строки. Длинный список — «ещё N».' },
      h(PlaceTree<TNode>, { testId: 'pt-tree', roots: TREE_ROOTS, kids: TREE_KIDS, open: treeOpen, onToggle: (n) => setTreeOpen({ ...treeOpen, [n.id]: !treeOpen[n.id] }),
        selected: treeSel, onSelect: (n) => setTreeSel(n.id), kind: (n) => n.kind, meta: (n) => n.meta,
        menu: (n) => [{ id: 'add', label: 'Добавить внутрь', onClick: () => setPicked('добавить внутрь: ' + n.name) }, { id: 'edit', label: 'Изменить', onClick: () => setPicked('изменить: ' + n.name) }] })),
    h(Block, { id: 'badges', title: 'Метки', note: 'Цвет и слово вместе: цвет не единственный признак.' },
      h('div', { className: 'pt-row' }, STAGES.map((s, i) => h(StageBadge, { key: s.code, label: s.name, tone: (['grey', 'grey', 'blue', 'yellow', 'green', 'grey'] as const)[i] })),
        h(StatusBadge, { status: 'red', label: 'Просрочено' }))),
    h(Block, { id: 'sheet', title: 'Лист снизу / панель справа', note: 'Ввод и правка: на телефоне — снизу, на ПК — справа; Esc и нажатие мимо — закрыть.' },
      h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'pt-sheet-open', onClick: () => setSheet(true) }, 'Открыть форму'),
      sheet ? h(Sheet, { title: 'Новый проект', sub: 'Остальное — в карточке после создания', testId: 'pt-sheet', onClose: () => setSheet(false) },
        h('label', { className: 'pf-field' }, 'Название', h('input', { className: 'pj-input', style: { minHeight: '44px', fontSize: '16px' } })),
        h('div', { className: 'pj-formfoot' }, h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setSheet(false) }, 'Отмена'), h('button', { type: 'button', className: 'pf-btn', onClick: () => setSheet(false) }, 'Создать проект'))) : null),
    h(Block, { id: 'kpi', title: 'Плитки итогов и полоса готовности', note: 'Из P2-0010 / P2-0046: 3–4 плитки, полоса с отметкой «план на сегодня».' },
      h('div', { className: 'pt-kpis' }, h(KpiTile, { label: 'Объектов', value: '3', metric: 'pt-a' }), h(KpiTile, { label: 'Мест', value: '218', metric: 'pt-b', hint: 'квартир 204' })),
      h(ProgressBar, { value: 46, label: 'Готовность', marker: 52, markerLabel: 'план на сегодня' })));
}

export const PATTERNS_CSS = `
.pt-page{display:flex;flex-direction:column;gap:18px;min-width:0}
.pt-block{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border:1px dashed var(--card-border);border-radius:14px}
.pt-block__head h3{margin:0;font-size:15px;font-weight:600}
.pt-block__head p{margin:2px 0 0;font-size:13px;color:var(--text-muted)}
.pt-block__body{display:flex;flex-direction:column;gap:10px;min-width:0}
.pt-row{display:flex;flex-wrap:wrap;gap:8px}
.pt-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,220px));gap:10px}
`;
