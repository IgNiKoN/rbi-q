/**
 * «План/Факт → Факт → Шахматка» (P2-0017): что сделано на каждом этаже. Два вида с переключателем (выбор запоминается на устройстве):
 * «Этажи × секции» (корпус и вид работ на выбор) и «Этажи/квартиры × виды работ» (корпус и секция; этаж раскрывается до квартир).
 * Данные — те же pf_fact_positions (план, принятый факт, «ждёт подтверждения» считает сервер) и дерево мест ядра; расчёт ячеек —
 * fact/chessboard.ts. Своих данных экран не хранит. Права (просмотр, ввод) проверяет сервер.
 */
import { createElement as h, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { ProjectsApi } from '../../../platform/core/projects.service.ts';
import type { Brigade, FactApi, FactPosition } from './fact.service.ts';
import { FactEntryForm } from './FactEntryForm.ts';
import { FactHistory } from './FactHistory.ts';
import { FloorClose } from './FloorClose.ts';
import { ChessCell, ChessScale, CHESS_STATE_LABEL } from '../../../platform/ui/index.ts';
import { buildingsOf, cellKey, cellPositions, indexPlaces, loadPlaces, placePositions, sectionGrid, sectionsOf, unplacedIn, workGrid, workTypesOf } from './chessboard.ts';
import type { CellValue, Grid, PlaceIndex, Placement, Ref } from './chessboard.ts';
import { fmtPct, fmtQty, percent, remainder } from './fact.ts';

const ALL = '';
type View = 'sections' | 'works';
const VIEW_KEY = 'pf-chess-view';
function readView(): View { try { return window.localStorage.getItem(VIEW_KEY) === 'works' ? 'works' : 'sections'; } catch { return 'sections'; } }
function writeView(v: View): void { try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* без хранилища — просто не запомним */ } }

/** Главное число и подпись ячейки: % по объёму или «закрыто X из Y». */
export function cellText(v: CellValue): { main: string; sub: string } {
  if (v.kind === 'empty') return { main: '—', sub: '' };
  if (v.kind === 'volume') return { main: fmtPct(v.pct), sub: `${fmtQty(v.fact)} ${v.unit}` };
  return { main: `${v.closed}/${v.total}`, sub: 'поз.' };
}
/** Подсказка ячейки (title / aria-label): место, статус, план, факт, остаток, позиции, «ждёт подтверждения». */
export function cellLabel(row: string, col: string, v: CellValue): string {
  if (v.kind === 'empty') return `${row} · ${col}: нет работ`;
  const parts = [`${row} · ${col}: ${CHESS_STATE_LABEL[v.state].toLowerCase()}`];
  if (v.kind === 'volume') parts.push(`факт ${fmtQty(v.fact)} из ${fmtQty(v.plan)} ${v.unit} (${fmtPct(v.pct)}), остаток ${fmtQty(remainder(v.plan, v.fact))} ${v.unit}`);
  parts.push(`закрыто позиций ${v.closed} из ${v.total}`);
  if (v.pending) parts.push(`ждёт подтверждения РП: ${v.pending}`);
  if (v.rejected) parts.push(`отклонено РП: ${v.rejected}`);
  return parts.join('; ');
}

interface Sel { row: string; col: string }

/** Таблица шахматки: первая колонка закреплена, прокрутка вбок — внутри таблицы. */
function GridTable(props: { grid: Grid; corner: string; sel: Sel | null; onPick: (s: Sel) => void; testId: string; open?: Set<string>; onToggle?: (row: string) => void }): ReactElement {
  const { grid, corner, sel, onPick, testId, open, onToggle } = props;
  const rows = grid.rows.filter((r) => !r.parent || (open && open.has(r.parent)));
  return h('div', { className: 'p2-chess', 'data-testid': testId },
    h('table', { className: 'p2-chess__table' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, corner),
        grid.cols.map((c) => h('th', { key: c.id, scope: 'col', title: c.name, className: sel && sel.col === c.id ? 'p2-chess__hot' : undefined }, c.name)))),
      h('tbody', null, rows.map((r) => h('tr', { key: r.key, 'data-row': r.key, className: r.parent ? 'cb-sub' : undefined },
        h('th', { scope: 'row', className: sel && sel.row === r.key ? 'p2-chess__hot' : undefined },
          r.childCount && onToggle
            ? h('button', { type: 'button', className: 'cb-toggle', 'aria-expanded': !!open && open.has(r.key), 'data-testid': 'cb-toggle', title: 'Квартиры этажа', onClick: () => onToggle(r.key) },
                h('span', { 'aria-hidden': 'true', className: 'cb-caret' }, open && open.has(r.key) ? '▾' : '▸'), r.label, h('span', { className: 'cb-kids' }, String(r.childCount)))
            : r.label),
        grid.cols.map((c) => {
          const v = grid.cells.get(cellKey(r.key, c.id))!;
          const t = cellText(v);
          const isSel = !!sel && sel.row === r.key && sel.col === c.id;
          return h('td', { key: c.id, 'data-col': c.id },
            h(ChessCell, { state: v.state, main: t.main, sub: t.sub, pending: v.pending, rejected: v.rejected, selected: isSel,
              hot: !!sel && !isSel && (sel.row === r.key || sel.col === c.id), label: cellLabel(r.label, c.name, v), onClick: () => onPick({ row: r.key, col: c.id }) }));
        }))))));
}

/** Где позиция внутри ячейки: квартира («Секция 1 · кв. 5») или «на этаже»; путь без названия корпуса. */
const where = (p: FactPosition): string => (p.location_type === 'apartment' ? p.location_path.split(' · ').slice(1).filter((x) => !/^эт\.|этаж/i.test(x)).join(' · ') : 'на этаже');

export interface CellCtx { api: FactApi; projectId: string; me: string; canCreate: boolean; canApprove: boolean; brigades: Brigade[]; lastBrigade: string; onBrigade: (id: string) => void }

/** Панель ячейки: сводка, позиции места, окно быстрого ввода по позиции, «История», «Закрыть этаж». На ПК — сбоку, на телефоне — шторкой. */
function CellPanel(props: { ctx: CellCtx; title: string; v: CellValue; list: FactPosition[]; floor: boolean; onClose: () => void; onChanged: (msg: string) => void }): ReactElement {
  const { ctx, title, v, list, floor, onClose, onChanged } = props;
  const [openId, setOpenId] = useState('');
  const [historyId, setHistoryId] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState('');
  const openForm = (id: string): void => {
    setOpenId(openId === id ? '' : id); setHistoryId(''); setClosing(false); setNotice(''); setCount(null);
    if (openId !== id) void ctx.api.history(id).then((r) => setCount(r.ok ? r.value.length : null));
  };
  const done = (msg: string): void => { setOpenId(''); setClosing(false); setNotice(msg); onChanged(msg); };
  const histPos = historyId ? list.find((p) => p.position_id === historyId) : undefined;
  return h('div', { className: 'cb-panel-wrap' },
    h('div', { className: 'cb-backdrop', onClick: onClose, 'aria-hidden': 'true' }),
    h('div', { className: 'pf-card cb-info cb-panel', role: 'dialog', 'aria-label': title, 'data-testid': 'cb-info' },
      h('div', { className: 'ft-sheet-head' }, h('b', null, title), h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'cb-close', onClick: onClose }, 'Закрыть')),
      h('div', { className: 'cb-info-nums' },
        v.kind === 'volume' ? h('span', null, `План ${fmtQty(v.plan)} ${v.unit} · факт ${fmtQty(v.fact)} ${v.unit} · ${fmtPct(v.pct)}`) : null,
        v.kind === 'volume' ? h('span', null, `Остаток ${fmtQty(remainder(v.plan, v.fact))} ${v.unit}`) : null,
        h('span', null, `Закрыто позиций ${v.closed} из ${v.total}`),
        v.pending ? h('span', { className: 'ft-pending' }, `Ждёт подтверждения РП: ${v.pending} поз. (${fmtQty(v.pendingQty)})`) : null,
        v.rejected ? h('span', { className: 'ft-bad' }, `Отклонено РП: ${v.rejected} поз.`) : null),
      notice ? h('div', { className: 'pj-notice', role: 'status', 'data-testid': 'cb-notice' }, notice) : null,
      floor && ctx.canCreate && !closing && list.some((p) => remainder(p.plan_qty, p.fact_qty) > 0)
        ? h('div', { className: 'pj-actions' }, h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'cb-floor-close', onClick: () => { setClosing(true); setOpenId(''); setHistoryId(''); } }, 'Закрыть этаж'))
        : null,
      closing ? h(FloorClose, { api: ctx.api, projectId: ctx.projectId, place: { id: '', name: title }, positions: list, brigades: ctx.brigades, lastBrigade: ctx.lastBrigade, onBrigade: ctx.onBrigade,
        onClose: () => setClosing(false), onDone: done }) : null,
      histPos ? h(FactHistory, { api: ctx.api, pos: histPos, me: ctx.me, canApprove: ctx.canApprove, canCreate: ctx.canCreate, onClose: () => setHistoryId(''), onChanged: () => onChanged('') }) : null,
      h('div', { className: 'cb-list', 'data-testid': 'cb-list' }, list.map((p) => {
        const pct = percent(p.fact_qty, p.plan_qty);
        return h('div', { key: p.position_id, className: 'cb-pos', 'data-position-id': p.position_id },
          h('div', { className: 'cb-pos-head' },
            h('div', { className: 'cb-pos-name' }, h('b', null, p.work_name), h('span', { className: 'pf-muted' }, where(p))),
            h('span', { className: 'cb-pos-nums' }, `${fmtQty(p.fact_qty)} из ${fmtQty(p.plan_qty)} ${p.unit_code}`, h('b', null, ` ${fmtPct(pct)}`))),
          p.pending_count ? h('div', { className: 'ft-pending' }, `Ждёт подтверждения РП: ${fmtQty(p.pending_qty)} ${p.unit_code}`) : null,
          p.last_rejected_note ? h('div', { className: 'ft-bad' }, `Отклонено РП: ${p.last_rejected_note}`) : null,
          openId === p.position_id
            ? h(FactEntryForm, { api: ctx.api, pos: p, brigades: ctx.brigades, lastBrigade: ctx.lastBrigade, onBrigade: ctx.onBrigade, onCancel: () => setOpenId(''), onSaved: done,
                quick: { historyCount: count, onHistory: () => { setHistoryId(p.position_id); setOpenId(''); } } })
            : h('div', { className: 'pj-actions' },
                ctx.canCreate ? h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'cb-enter', onClick: () => openForm(p.position_id) }, 'Внести факт') : null,
                h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'cb-history', onClick: () => { setHistoryId(historyId === p.position_id ? '' : p.position_id); setOpenId(''); setClosing(false); } }, 'История')));
      }))));
}

export function ChessboardTab(props: { projects: ProjectsApi; ctx: CellCtx }): ReactElement {
  const { projects, ctx } = props;
  const { api, projectId } = ctx;
  const [data, setData] = useState<{ idx: PlaceIndex; positions: FactPosition[]; pl: Placement } | null>(null);
  const [error, setError] = useState('');
  const [building, setBuilding] = useState<string | null>(null);
  const [work, setWork] = useState(ALL);
  const [sel, setSel] = useState<Sel | null>(null);
  const [view, setView] = useState<View>(readView);
  const [section, setSection] = useState(ALL);
  const [open, setOpen] = useState<Set<string>>(new Set());

  async function load(pid: string): Promise<void> {
    setData(null); setError(''); setSel(null);
    const none = { idx: indexPlaces([]), positions: [], pl: { placed: [], unplaced: [] } };
    try {
      const [nodes, r] = await Promise.all([loadPlaces((parent) => projects.listLocations(pid, parent)), api.positions(pid, null)]);
      if (!r.ok) { setError(r.message); setData(none); return; }
      const idx = indexPlaces(nodes);
      setData({ idx, positions: r.value, pl: placePositions(r.value, idx) });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Не удалось загрузить места объекта');
      setData(none);
    }
  }
  /** После ввода: перечитать позиции с сервера (сетка и панель пересчитываются, выбор ячейки сохраняется). */
  async function refresh(): Promise<void> {
    const r = await api.positions(projectId, null);
    if (r.ok) setData((d) => (d ? { idx: d.idx, positions: r.value, pl: placePositions(r.value, d.idx) } : d));
  }
  useEffect(() => { if (projectId) { setBuilding(null); setWork(ALL); setSection(ALL); setOpen(new Set()); void load(projectId); } }, [projectId]);

  const blds: Ref[] = useMemo(() => (data ? buildingsOf(data.idx) : []), [data]);
  const b = building !== null && blds.some((x) => x.id === building) ? building : (blds[0] ? blds[0].id : null);
  const works = useMemo(() => (data ? workTypesOf(data.pl.placed.filter((it) => (it.floor.building ? it.floor.building.id : '') === b).map((it) => it.pos)) : []), [data, b]);
  const w = work && works.some((x) => x.id === work) ? work : null;
  const secs = useMemo(() => (data && b !== null ? sectionsOf(data.idx, b) : []), [data, b]);
  const sc = view === 'works' && section !== ALL && secs.some((x) => x.id === section) ? section : null;
  const grid = useMemo(() => (data && b !== null ? (view === 'works' ? workGrid(data.idx, data.pl, b, sc) : sectionGrid(data.idx, data.pl, b, w)) : null), [data, b, w, view, sc]);
  const loose = data && b !== null ? unplacedIn(data.idx, data.pl, b, view === 'works' ? null : w) : [];
  const pickView = (v: View): void => { setView(v); writeView(v); setSel(null); };
  const toggle = (row: string): void => { const n = new Set(open); if (n.has(row)) n.delete(row); else n.add(row); setOpen(n); };

  if (!data) return h('div', { className: 'pf-muted', 'data-testid': 'cb-loading' }, 'Загрузка…');
  if (error) return h('div', { className: 'pf-error', role: 'alert' }, error);
  if (!grid || !grid.rows.length || !data.pl.placed.length) {
    const n = data.positions.length;
    return h('div', { className: 'pf-card pj-empty pf-muted', 'data-testid': 'cb-empty' },
      !n ? 'Для этого объекта нет работ: позиции появляются после подтверждения ВОР.'
        : `Объёмы этого объекта не разнесены по этажам — шахматку построить не из чего (позиций на корпусах и секциях: ${n}). Факт по ним вносится во вкладке «Ввод».`);
  }
  const rowLabel = (key: string): string => grid.rows.find((r) => r.key === key)?.label || '';
  const colLabel = (id: string): string => grid.cols.find((c) => c.id === id)?.name || '';
  const selV = sel ? grid.cells.get(cellKey(sel.row, sel.col)) : undefined;

  return h('div', { className: 'cb-root', 'data-testid': 'cb-root' },
    h('div', { className: 'pf-seg cb-views', role: 'tablist', 'data-testid': 'cb-views' },
      ([['sections', 'Этажи × секции'], ['works', 'Этажи × виды работ']] as [View, string][]).map(([id, label]) => h('button', { key: id, type: 'button', role: 'tab', 'aria-selected': view === id,
        'data-view': id, className: 'pf-seg-btn' + (view === id ? ' pf-seg-btn--active' : ''), onClick: () => pickView(id) }, label))),
    h('div', { className: 'cb-filters' },
      blds.length > 1 ? h('label', { className: 'pf-field' }, 'Корпус',
        h('select', { className: 'pj-input', value: b || '', 'data-testid': 'cb-building', onChange: (e) => { setBuilding((e.target as HTMLSelectElement).value); setSel(null); } },
          blds.map((x) => h('option', { key: x.id, value: x.id }, x.name)))) : null,
      view === 'sections'
        ? h('label', { className: 'pf-field' }, 'Вид работ',
            h('select', { className: 'pj-input', value: w || ALL, 'data-testid': 'cb-work', onChange: (e) => { setWork((e.target as HTMLSelectElement).value); setSel(null); } },
              h('option', { value: ALL }, 'Все виды работ'), works.map((x) => h('option', { key: x.id, value: x.id }, x.name))))
        : secs.length > 1 ? h('label', { className: 'pf-field' }, 'Секция',
            h('select', { className: 'pj-input', value: sc || ALL, 'data-testid': 'cb-section', onChange: (e) => { setSection((e.target as HTMLSelectElement).value); setSel(null); setOpen(new Set()); } },
              h('option', { value: ALL }, 'Все секции'), secs.map((x) => h('option', { key: x.id, value: x.id }, x.name)))) : null),
    h('div', { className: 'pf-muted cb-mode', 'data-testid': 'cb-mode' },
      view === 'works' ? 'В ячейке — % выполнения вида работ по объёму; если у вида разные единицы — «закрыто позиций X из Y». Нажмите на этаж, чтобы увидеть квартиры.'
        : w ? 'В ячейке — % выполнения по объёму; если у вида работ разные единицы — «закрыто позиций X из Y».' : 'В ячейке — «закрыто позиций X из Y» по всем видам работ.'),
    h(ChessScale, null),
    loose.length ? h('div', { className: 'pf-muted cb-loose', 'data-testid': 'cb-loose' }, `Не разнесено по этажам: ${loose.length} поз. (на корпусе или секции) — в шахматку не входят, факт по ним — во вкладке «Ввод».`) : null,
    h('div', { className: 'cb-layout' + (selV ? ' cb-layout--side' : '') },
      h(GridTable, { grid, corner: view === 'works' ? 'Этаж / квартира' : 'Этаж', sel, onPick: (s) => setSel(sel && sel.row === s.row && sel.col === s.col ? null : s), testId: 'cb-grid',
        open: view === 'works' ? open : undefined, onToggle: view === 'works' ? toggle : undefined }),
      selV && sel ? h(CellPanel, { key: `${sel.row}|${sel.col}`, ctx, title: `${rowLabel(sel.row)} · ${colLabel(sel.col)}`, v: selV, list: cellPositions(data.positions, selV),
        floor: !grid.rows.find((r) => r.key === sel.row)?.parent, onClose: () => setSel(null), onChanged: () => { void refresh(); } }) : null));
}

export const CHESSBOARD_CSS = `
.cb-root{display:flex;flex-direction:column;gap:10px;min-width:0}
.cb-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
.cb-mode,.cb-loose{font-size:12px}
.cb-views .pf-seg-btn{flex:1 1 auto;padding:8px 10px;letter-spacing:.04em}
.cb-toggle{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer;white-space:nowrap}
.cb-caret{display:inline-block;width:12px;color:var(--text-muted)}
.cb-kids{font-size:11px;font-weight:400;color:var(--text-muted)}
.p2-chess__table tr.cb-sub th[scope=row]{padding-left:28px;font-weight:400;font-size:12px}
.cb-layout{display:flex;flex-direction:column;gap:10px;min-width:0}
.cb-info{display:flex;flex-direction:column;gap:8px;padding:12px 14px}
.cb-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:1190}
.cb-panel{position:fixed;left:0;right:0;bottom:0;z-index:1200;max-height:85vh;overflow-y:auto;border-radius:16px 16px 0 0;padding-bottom:calc(14px + env(safe-area-inset-bottom,0px));box-shadow:0 -6px 24px rgba(0,0,0,.25)}
.cb-list{display:flex;flex-direction:column}
.cb-pos{display:flex;flex-direction:column;gap:6px;padding:10px 0;border-top:1px solid var(--card-border)}
.cb-pos-head{display:flex;flex-wrap:wrap;gap:4px 12px;justify-content:space-between;align-items:baseline}
.cb-pos-name{display:flex;flex-direction:column;gap:2px;min-width:0;overflow-wrap:anywhere}
.cb-pos-name .pf-muted{font-size:12px}
.cb-pos-nums{font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap}
.cb-info-nums{display:flex;flex-direction:column;gap:4px;font-size:13px;font-variant-numeric:tabular-nums}
@media (min-width:1100px){.cb-layout--side{display:grid;grid-template-columns:minmax(0,1fr) 380px;align-items:start}.cb-backdrop{display:none}
.cb-panel{position:sticky;top:12px;left:auto;right:auto;bottom:auto;z-index:auto;max-height:calc(100vh - 120px);border-radius:var(--rbi-radius-md,8px);box-shadow:none;padding-bottom:14px}}
`;
