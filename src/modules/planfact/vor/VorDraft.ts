/**
 * Черновик загрузки ВОР (P2-0006): разбор по шагам. Этап 4 — «Места»: места строк-работ → узлы дерева объекта
 * (то же дерево, что «Справочники → Объекты»), список недостающих узлов и «Создать недостающие» (право planfact.projects.manage
 * проверяет сервер в pf_add_location). Привязка сохраняется в строки черновика (pf_vor_resolve_rows).
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ChangeEvent, FocusEvent, KeyboardEvent, ReactElement } from 'react';
import type { ProjectsApi } from '../../../platform/core/projects.service.ts';
import type { PlanNodeType } from '../../../services/locations/types.ts';
import { placeOf, placeNote, bindPlaces, missingList, createMissing, nodeNumber, sheetBuilding, WHOLE_OBJECT as WHOLE } from './places.ts';
import type { Binding, BlockChoice, Place, TreeNode } from './places.ts';
import type { Resolution, VorApi, VorImport, VorRow } from './vor.service.ts';
import { VorWorks } from './VorWorks.ts';
import { VorPositions } from './VorPositions.ts';

export interface DraftProps {
  api: VorApi; projects: ProjectsApi | null; projectId: string; companyId: string; imp: VorImport;
  canManage: boolean; canProjects: boolean; canUnits: boolean; onBack: () => void; onChanged: () => void;
}

interface PlaceInfo { place: Place; rows: number; binding: Binding | null }

/** Решение строки для сервера: место + уже сохранённые вид работ / ЕИ / цвет (pf_vor_resolve_rows перезаписывает все четыре). */
export function withLocation(r: VorRow, locationId: string | null): Resolution {
  return { row_no: r.row_no, location_id: locationId, work_type_id: r.work_type_id, unit_id: r.unit_id, match: r.match };
}

export function VorDraft(props: DraftProps): ReactElement {
  const { api, projects, projectId, companyId, imp, canManage, canProjects, canUnits, onBack, onChanged } = props;
  const editable = canManage && imp.status === 'draft';
  const [rows, setRows] = useState<VorRow[] | null>(null);
  const [places, setPlaces] = useState<PlaceInfo[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [blocks, setBlocks] = useState<Record<number, BlockChoice>>({});
  // «Корпус листа» (P2-0009, К1): куда ложатся строки без корпуса; null — «Весь объект». Угадывается по названию листа.
  const [sheet, setSheet] = useState<BlockChoice | null>(null);
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [showPlaces, setShowPlaces] = useState(false);

  const works = (rows || []).filter((r) => r.kind === 'work');

  async function loadChildren(parent: string | null): Promise<TreeNode[]> {
    if (!projects) return [];
    return (await projects.listLocations(projectId, parent)).map((n) => ({ id: n.id, parent_id: n.parent_id, node_type: n.node_type, name: n.name, path: n.path }));
  }

  /** Привязать места строк к дереву; изменившиеся привязки — в черновик (если можно править). */
  async function bind(input: VorRow[], choice: Record<number, BlockChoice> = blocks, sh: BlockChoice | null = sheet): Promise<void> {
    let list = input;
    const uniq = new Map<string, PlaceInfo>();
    for (const r of list) if (r.kind === 'work') {
      const pl = placeOf(r.context || {}, choice, sh);
      const cur = uniq.get(pl.key);
      if (cur) cur.rows++; else uniq.set(pl.key, { place: pl, rows: 1, binding: null });
    }
    const infos = Array.from(uniq.values());
    const bindings = await bindPlaces(infos.map((i) => i.place), loadChildren);
    infos.forEach((i, k) => { i.binding = bindings[k]; });
    // Сначала сохранить привязку, потом показать разделы (виды работ пишут те же строки — без гонки).
    if (editable) {
      const byKey = new Map(bindings.map((b) => [b.key, b]));
      // Блок без выбранного корпуса: уже сохранённое место (выбрано раньше) не сбрасываем.
      const changed = list.filter((r) => r.kind === 'work').map((r) => {
        const b = byKey.get(placeOf(r.context || {}, choice, sh).key);
        return { r, loc: b && b.pendingBlock ? r.location_id : (b ? b.nodeId : null) };
      }).filter((x) => x.r.location_id !== x.loc);
      if (changed.length) {
        const res = await api.resolveRows(imp.id, changed.map((x) => withLocation(x.r, x.loc)));
        if (!res.ok) setError(res.message);
        else list = list.map((r) => { const c = changed.find((x) => x.r.row_no === r.row_no); return c ? { ...r, location_id: c.loc } : r; });
      }
    }
    setRows(list);
    setPlaces(infos);
    setRoots((await loadChildren(null)).filter((n) => n.node_type === 'building'));
  }

  function chooseSheet(name: string): void {
    const next = name ? { value: nodeNumber(name) || name, name } : null;
    setSheet(next);
    if (rows) void bind(rows, blocks, next);
  }

  function chooseBlock(block: number, value: string): void {
    const node = roots.find((n) => n.id === value);
    const next = { ...blocks };
    if (node) next[block] = { value: (node.name.match(/(\d+[\p{L}]?)/u) || [node.name])[0], name: node.name };
    else if (value.trim()) next[block] = { value: value.trim(), name: `Корпус ${value.trim()}` };
    else delete next[block];
    setBlocks(next);
    if (rows) void bind(rows, next);
  }

  /** Решения строк → черновик; локальные строки обновляются после ответа сервера. */
  async function save(items: Resolution[]): Promise<boolean> {
    const r = await api.resolveRows(imp.id, items);
    if (!r.ok) { setError(r.message); return false; }
    const by = new Map(items.map((i) => [i.row_no, i]));
    setRows((prev) => prev ? prev.map((x) => { const i = by.get(x.row_no); return i ? { ...x, location_id: i.location_id, work_type_id: i.work_type_id, unit_id: i.unit_id, match: i.match } : x; }) : prev);
    return true;
  }

  async function load(): Promise<void> {
    const list = await api.importRows(imp.id);
    // Корпус листа: уже сохранённое место строк без места (черновик открыт повторно) — иначе догадка по названию листа.
    const empty = (r: VorRow): boolean => { const c = r.context || {}; return !c.building && !c.block && !c.section && !c.floor; };
    const saved = list.find((r) => r.kind === 'work' && empty(r) && r.location_id);
    let sh = sheetBuilding(imp.sheet_name);
    if (saved) {
      const b = (await loadChildren(null)).find((n) => n.id === saved.location_id && n.node_type === 'building');
      sh = b ? { value: nodeNumber(b.name) || b.name, name: b.name } : null;
    }
    setSheet(sh);
    await bind(list, blocks, sh);
  }
  useEffect(() => { void load(); }, [imp.id]);

  async function createAll(): Promise<void> {
    if (!projects || !places || busy) return;
    setBusy('Создаю узлы…'); setError(''); setNotice('');
    try {
      const n = await createMissing(places.map((p) => p.binding as Binding), places.map((p) => p.place), async (parent, type, name) => {
        const r = await projects.addLocation(projectId, parent, type as PlanNodeType, name);
        if (!r.ok) throw new Error(r.message);
        return r.value;
      });
      setNotice(`Создано узлов: ${n}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать узлы');
    }
    setBusy('');
    if (rows) await bind(rows);
    onChanged();
  }

  async function confirmImport(): Promise<void> {
    if (busy) return;
    setBusy('Подтверждаю ВОР…'); setError(''); setNotice('');
    const r = await api.confirm(imp.id);
    setBusy('');
    if (!r.ok) { setError(r.message); return; }
    setNotice(`ВОР подтверждён: создано позиций — ${r.value}. Дальше загрузка не меняется.`);
    onChanged();
  }

  const head = h('div', { className: 'vor-draft-head' },
    h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: onBack, 'data-testid': 'vor-back' }, '← Загрузки'),
    h('div', { className: 'pj-name' }, h('b', null, imp.file_name), h('span', { className: 'pf-muted' }, `лист «${imp.sheet_name}»`),
      h('span', { className: 'pj-badge' + (imp.status === 'confirmed' ? ' vor-badge--ok' : '') }, imp.status === 'confirmed' ? 'Подтверждён' : 'Черновик')));

  if (imp.status === 'confirmed') {
    return h('div', { className: 'pj-tab vor-draft', 'data-testid': 'vor-draft' }, head,
      notice ? h('div', { className: 'pj-notice', role: 'status' }, notice) : null,
      h('div', { className: 'pf-muted', 'data-testid': 'vor-confirmed' },
        `Подтверждён ${imp.confirmed_at ? new Date(imp.confirmed_at).toLocaleString('ru-RU') : ''}. Строки, места и виды работ этой загрузки больше не меняются.`),
      rows ? h(VorPositions, { api, projectId, importId: imp.id, rows }) : h('div', { className: 'pf-muted' }, 'Загрузка…'));
  }

  if (rows === null || places === null) return h('div', { className: 'pf-muted' }, 'Загрузка черновика…');
  const missing = missingList(places.map((p) => p.binding as Binding), places.map((p) => p.place));
  // Блоки без корпуса (выбранные и нет) — список остаётся на экране, выбор можно поменять.
  const blockRows = works.filter((r) => r.context && r.context.block && !r.context.building);
  const pendingBlocks = Array.from(new Set(blockRows.map((r) => r.context.block as number))).sort((a, b) => a - b)
    .map((block) => {
      const rs = blockRows.filter((r) => r.context.block === block);
      const secs = Array.from(new Set(rs.map((r) => r.context.section).filter(Boolean)));
      return { block, rows: rs.length, label: secs.length ? 'секции ' + secs.join(', ') : 'без секций' };
    });
  const boundRows = works.filter((r) => r.location_id).length;

  const ready = {
    places: works.filter((r) => r.location_id).length,
    types: works.filter((r) => r.match === 'green' && r.work_type_id).length,
    units: works.filter((r) => r.unit_id).length,
    qty: works.filter((r) => r.qty !== null).length
  };
  const canConfirm = editable && works.length > 0 && Object.values(ready).every((n) => n === works.length);
  const confirmBlock = h('div', { className: 'pf-card vor-missing', 'data-testid': 'vor-confirm-block' },
    h('h3', { className: 'pf-title un-title' }, 'Подтверждение'),
    h('ul', { className: 'vor-ready' },
      ([['places', 'Места привязаны'], ['types', 'Виды работ подтверждены (🟢)'], ['units', 'ЕИ распознаны'], ['qty', 'Объём указан']] as [keyof typeof ready, string][])
        .map(([k, label]) => h('li', { key: k, className: ready[k] === works.length ? 'vor-stat--ok' : 'vor-stat--bad', 'data-ready': k },
          `${ready[k] === works.length ? '✓' : '✗'} ${label}: ${ready[k]} из ${works.length}`))),
    editable
      ? h('button', { type: 'button', className: 'pf-btn', disabled: !canConfirm || !!busy, 'data-testid': 'vor-confirm', onClick: () => { void confirmImport(); } },
          busy === 'Подтверждаю ВОР…' ? busy : 'Подтвердить ВОР')
      : h('div', { className: 'pf-muted' }, 'Подтверждать ВОР может ПТО, РП или администратор.'),
    canConfirm ? h('div', { className: 'pf-muted' }, `Будет создано позиций: ${works.length} (по одной на строку-работу). После подтверждения загрузку изменить нельзя.`) : null);

  return h('div', { className: 'pj-tab vor-draft', 'data-testid': 'vor-draft' },
    head,
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { className: 'pj-notice', role: 'status' }, notice) : null,
    h('h3', { className: 'pf-title un-title' }, 'Места'),
    h('div', { className: 'vor-summary' },
      h('span', { className: 'vor-stat' + (boundRows === works.length ? ' vor-stat--ok' : ' vor-stat--bad'), 'data-testid': 'vor-bound' },
        `Привязано строк-работ: ${boundRows} из ${works.length}`)),
    editable
      ? h('label', { className: 'pf-field vor-sheet-pick' }, `Корпус листа «${imp.sheet_name}» — для строк, где корпус не указан`,
          h('select', { className: 'pj-input', 'data-testid': 'vor-sheet-building', value: sheet ? sheet.name : '', disabled: !!busy,
            onChange: (e: ChangeEvent<HTMLSelectElement>) => chooseSheet(e.currentTarget.value) },
            h('option', { value: '' }, `— без корпуса: «${WHOLE}» —`),
            roots.map((n) => h('option', { key: n.id, value: n.name }, n.name)),
            sheet && !roots.some((n) => n.name === sheet.name) ? h('option', { value: sheet.name }, `${sheet.name} (нет в дереве — создать ниже)`) : null))
      : null,
    boundRows === works.length && !showPlaces && !pendingBlocks.length
      ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'vor-show-places', onClick: () => setShowPlaces(true) },
          `Все места привязаны — показать (${places.length})`)
      : h('div', { className: 'pf-card pj-list', 'data-testid': 'vor-places' },
      places.map((p) => h('div', { key: p.place.key, className: 'pj-row vor-place-row', 'data-place': p.place.key },
        h('div', { className: 'pj-name' }, h('b', null, p.place.label), h('span', { className: 'pf-muted' }, `${p.rows} строк`)),
        p.binding && p.binding.nodeId
          ? h('span', { className: 'vor-stat--ok' }, '→ ' + p.binding.path)
          : p.place.pendingBlock
            ? h('span', { className: 'vor-stat--bad' }, 'выберите корпус блока')
            : h('span', { className: 'vor-stat--bad' }, 'нет в дереве объекта')))),
    pendingBlocks.length
      ? h('div', { className: 'pf-card vor-missing', 'data-testid': 'vor-blocks' },
          h('b', null, 'Корпус в файле не указан, а номера секций начинаются заново — это разные корпуса. Выберите корпус для каждого блока (если в дереве корпуса нет — впишите номер, затем «Создать недостающие»):'),
          pendingBlocks.map((b) => h('label', { key: b.block, className: 'pf-field' }, `Блок ${b.block} (${b.label}, ${b.rows} строк)`,
            editable
              ? h('span', { className: 'vor-block-pick' },
                  h('select', { className: 'pj-input', 'data-testid': 'vor-block-select', 'data-block': b.block, value: roots.find((n) => blocks[b.block] && n.name === blocks[b.block].name)?.id || '',
                    onChange: (e: ChangeEvent<HTMLSelectElement>) => chooseBlock(b.block, e.currentTarget.value) },
                    h('option', { value: '' }, '— корпус из дерева объекта —'),
                    roots.map((n) => h('option', { key: n.id, value: n.id }, n.name))),
                  h('input', { type: 'text', className: 'pj-input', placeholder: 'или № нового корпуса', maxLength: 20, 'data-testid': 'vor-block-new',
                    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') chooseBlock(b.block, e.currentTarget.value); },
                    onBlur: (e: FocusEvent<HTMLInputElement>) => { if (e.currentTarget.value.trim()) chooseBlock(b.block, e.currentTarget.value); } }))
              : null)))
      : null,
    missing.length
      ? h('div', { className: 'pf-card vor-missing', 'data-testid': 'vor-missing' },
          h('div', null, h('b', null, `Не хватает узлов в дереве объекта (${missing.length}):`)),
          h('ul', null, missing.map((m) => h('li', { key: m }, m))),
          editable && canProjects && projects
            ? h('button', { type: 'button', className: 'pf-btn', disabled: !!busy, 'data-testid': 'vor-create-missing', onClick: () => { void createAll(); } },
                busy || 'Создать недостающие')
            : h('div', { className: 'pf-muted', 'data-testid': 'vor-no-create' },
                editable ? 'Создавать узлы может РП или администратор (право «Проекты и дерево локаций») — «Справочники → Объекты».' : 'Просмотр.'))
      : null,
    h('div', { className: 'pf-muted vor-rule' },
      'Правила: «Этажи 4–12» — позиция на секции с пометкой «эт. 4–12»; «кв. 3, 16…» — позиция на ближайшем узле с пометкой квартир; строки без корпуса — на корпус листа, а без него — на узел «Весь объект».'),
    works.some((r) => placeNote(r.context || {}))
      ? h('div', { className: 'pf-muted' }, `Строк с пометкой (диапазон этажей / квартиры): ${works.filter((r) => placeNote(r.context || {})).length}`)
      : null,
    h(VorWorks, { api, projects, projectId, companyId, rows, editable, canUnits, save }),
    confirmBlock);
}

export const VOR_DRAFT_CSS = `
.vor-draft-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.vor-place-row .vor-stat--ok,.vor-place-row .vor-stat--bad{font-size:12px;overflow-wrap:anywhere}
.vor-missing{padding:12px 14px;display:flex;flex-direction:column;gap:8px;font-size:13px}
.vor-missing ul{margin:0;padding-left:18px}
.vor-rule{font-size:11px}
.vor-ready{margin:0;padding-left:0;list-style:none;display:flex;flex-direction:column;gap:4px}
.vor-block-pick{display:flex;flex-wrap:wrap;gap:6px}
.vor-sheet-pick{max-width:520px}
.vor-sheet-pick select{min-height:40px}
.vor-block-pick select,.vor-block-pick input{flex:1 1 200px;min-width:0;min-height:40px}
@media (max-width:600px){.vor-missing .pf-btn{width:100%}}
`;
