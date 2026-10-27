/**
 * «План/Факт → Факт» (P2-0007): прораб с телефона. Объект → корпус → секция → этаж → работы места (позиции ВОР) с планом,
 * накопленным фактом и %; внести объём за дату или период (P2-0022: окно как в «Шахматке») с обязательной бригадой; история и исправление; «закрыть этаж целиком»;
 * у РП — подвкладка «Ждёт подтверждения» (P2-0020: реестр, решение пачкой). Накопленный факт и % считает сервер (Σ принятых
 * записей); права и допуск перебора — тоже.
 */
import { StatusBadge } from '../../../platform/ui/index.ts';
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { VorApi, VorProject } from '../vor/vor.service.ts';
import type { LocationNode, ProjectsApi } from '../../../platform/core/projects.service.ts';
import type { Brigade, FactApi, FactPosition } from './fact.service.ts';
import { FACT_APPROVE, FACT_CREATE, FACT_VIEW } from './fact.service.ts';
import { fmtPct, fmtQty, percent, remainder, vorHints } from './fact.ts';
import type { HintRow } from './fact.ts';
import { FactHistory } from './FactHistory.ts';
import { PendingRegistry, PENDING_REGISTRY_CSS } from './PendingRegistry.ts';
import { FactJournal, FACT_JOURNAL_CSS } from './FactJournal.ts';
import { FloorClose } from './FloorClose.ts';
import { ChessboardTab } from './ChessboardTab.ts';
import { FactWindow, FACT_WINDOW_CSS } from './FactWindow.ts';
import { initialProjectId, isArchived, ProjectPicker } from '../ProjectPicker.ts';
import { emptyText, useMyArea } from '../area.ts';
import { isTopPlace } from '../../../services/locations/types.ts';

const PAGE = 100;
const NODE_LABEL: Record<string, string> = { object: 'Объект', building: 'Корпус', section: 'Секция', floor: 'Этаж', apartment: 'Квартира', other: 'Место' };
const lastKey = (company: string): string => `pf-last-brigade:${company}`;
/** Последняя бригада на устройстве (общая для «Факта» и закрытия из реестра позиций). */
export function readLast(company: string): string { try { return window.localStorage.getItem(lastKey(company)) || ''; } catch { return ''; } }
export function writeLast(company: string, id: string): void { try { window.localStorage.setItem(lastKey(company), id); } catch { /* без хранилища — просто не запомним */ } }

/** P2-0046: состояние строки «Ввода» для фильтр-кнопок: ждёт РП и отклонено — важнее объёма. */
export type RowState = 'pending' | 'rejected' | 'done' | 'work' | 'none';
export function rowState(p: FactPosition): RowState {
  if (p.pending_count) return 'pending';
  if (p.last_rejected_note) return 'rejected';
  return p.plan_qty > 0 && p.fact_qty >= p.plan_qty - 1e-9 ? 'done' : p.fact_qty > 0 ? 'work' : 'none';
}
export function countStates(rows: FactPosition[]): Record<RowState, number> {
  const c: Record<RowState, number> = { pending: 0, rejected: 0, done: 0, work: 0, none: 0 };
  for (const p of rows) c[rowState(p)]++;
  return c;
}

export type FactMode = 'entry' | 'chessboard' | 'pending' | 'journal';
/** mode — подвкладка «Факта»: «Ввод» (по умолчанию), «Шахматка» (P2-0017), «Ждёт подтверждения», «Журнал» (P2-0020); объект — общим
 *  списком. onApprove — число записей, ждущих РП в выбранном объекте, или null без права fact.approve (подвкладки тогда нет). */
export function FactTab(props: { api: FactApi; vor: VorApi; projects: ProjectsApi; me: string; mode?: FactMode; onApprove?: (count: number | null) => void }): ReactElement {
  const { api, vor, projects, me } = props;
  const mode = props.mode || 'entry';
  const [list, setList] = useState<VorProject[] | null>(null);
  const [perms, setPerms] = useState<Record<string, string[]>>({});
  const [projectId, setProjectId] = useState('');
  const [path, setPath] = useState<LocationNode[]>([]);
  const [children, setChildren] = useState<LocationNode[]>([]);
  const [positions, setPositions] = useState<FactPosition[] | null>(null);
  const [hints, setHints] = useState<Map<string, string>>(new Map());
  const [brigades, setBrigades] = useState<Brigade[]>([]);
  const [lastBrigade, setLastBrigade] = useState('');
  const [openId, setOpenId] = useState('');
  const [historyId, setHistoryId] = useState('');
  const [closing, setClosing] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [roots, setRoots] = useState<LocationNode[]>([]);                    // P2-0046: дерево мест на ПК — корни
  const [kids, setKids] = useState<Record<string, LocationNode[]>>({});      // и раскрытые узлы пути
  const [only, setOnly] = useState<RowState | ''>('');                        // фильтр-кнопка списка работ
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const project = list?.find((p) => p.id === projectId);
  const myPerms = perms[projectId] || [];
  const canCreate = myPerms.includes(FACT_CREATE) && !isArchived(project);   // архивный объект — только просмотр
  const canApprove = myPerms.includes(FACT_APPROVE);
  const place = path.length ? path[path.length - 1] : null;
  const area = useMyArea(projectId);

  useEffect(() => {
    void (async () => {
      const all = await vor.listProjects();
      const ok: VorProject[] = []; const map: Record<string, string[]> = {};
      for (const p of all) { const pr = await vor.permissions(p.id); if (pr.includes(FACT_VIEW)) { ok.push(p); map[p.id] = pr; } }
      setPerms(map); setList(ok);
      if (ok.length) setProjectId(initialProjectId(ok, window.location.hash));   // P2-0021: объект из перехода
    })();
  }, []);

  async function loadPending(pid: string, approve: boolean): Promise<void> {
    if (!approve) { props.onApprove?.(null); return; }
    const r = await api.pending(pid);
    props.onApprove?.(r.ok ? r.value.length : 0);
  }
  async function loadPositions(pid: string, loc: LocationNode | null): Promise<void> {
    setPositions(null);
    const r = await api.positions(pid, loc ? loc.id : null);
    if (r.ok) { setPositions(r.value); setError(''); } else { setPositions([]); setError(r.message); }
  }
  async function enterPlace(pid: string, nextPath: LocationNode[]): Promise<void> {
    setPath(nextPath); setOpenId(''); setHistoryId(''); setClosing(false); setShown(PAGE); setOnly('');
    const loc = nextPath.length ? nextPath[nextPath.length - 1] : null;
    const next = await projects.listLocations(pid, loc ? loc.id : null);
    setChildren(next);
    if (loc) setKids((k) => ({ ...k, [loc.id]: next })); else setRoots(next);
    if (loc) await loadPositions(pid, loc); else setPositions([]);
  }
  useEffect(() => {
    if (!projectId || !project) return;
    setNotice(''); setError(''); setKids({}); setRoots([]);
    void enterPlace(projectId, []);
    setLastBrigade(readLast(project.company_id));
    void api.listBrigades(project.company_id, false).then(setBrigades);
    void loadPending(projectId, (perms[projectId] || []).includes(FACT_APPROVE));
    void loadHints(projectId);
  }, [projectId]);

  /** Номер и раздел ВОР у позиций проекта (подсказка под названием работы). Не загрузилось — список без подсказок. */
  async function loadHints(pid: string): Promise<void> {
    setHints(new Map());
    try {
      const pos = await vor.positions(pid, null);
      const byImport = new Map<string, HintRow[]>();
      for (const imp of Array.from(new Set(pos.map((p) => p.import_id)))) byImport.set(imp, await vor.importRows(imp));
      setHints(vorHints(pos, byImport));
    } catch { /* подсказка необязательна */ }
  }

  const refresh = async (): Promise<void> => { await loadPositions(projectId, place); await loadPending(projectId, canApprove); };
  const rememberBrigade = (id: string): void => { setLastBrigade(id); if (project) writeLast(project.company_id, id); };

  if (list === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  if (!list.length) return h('div', { className: 'pf-muted', 'data-testid': 'ft-noaccess' }, 'Нет доступа к факту: раздел доступен прорабу, руководителю проекта и другим ролям с правом просмотра факта.');

  if (mode === 'pending') {
    return h('div', { className: 'pj-tab ft-tab ft-tab--wide', 'data-testid': 'ft-tab' },
      h(ProjectPicker, { list, value: projectId, onChange: setProjectId }),
      !projectId || !project ? null
        : canApprove ? h(PendingRegistry, { key: projectId, api, projectId, companyId: project.company_id, user: me, onChanged: () => { void loadPending(projectId, true); } })
        : h('div', { className: 'pf-card pj-empty pf-muted', 'data-testid': 'ft-noapprove' }, 'Подтверждать факт в этом проекте может руководитель проекта (право «Факт: подтверждение»).'));
  }

  if (mode === 'journal') {
    return h('div', { className: 'pj-tab ft-tab ft-tab--wide', 'data-testid': 'ft-tab' },
      h(ProjectPicker, { list, value: projectId, onChange: setProjectId }),
      projectId && project ? h(FactJournal, { key: projectId, api, projectId, companyId: project.company_id, user: me }) : null);
  }

  if (mode === 'chessboard') {
    return h('div', { className: 'pj-tab ft-tab ft-tab--wide', 'data-testid': 'ft-tab' },
      h(ProjectPicker, { list, value: projectId, onChange: setProjectId }),
      projectId ? h(ChessboardTab, { projects, ctx: { api, projectId, me, canCreate, canApprove, brigades, lastBrigade, onBrigade: rememberBrigade } }) : null);
  }

  const rel = (pos: FactPosition): string => {
    const base = place ? place.path : '';
    const own = pos.location_path;
    return base && own.startsWith(base) ? own.slice(base.length).replace(/^\s*·\s*/, '') : (place ? '' : own);
  };

  /** P2-0022: «Внести факт» открывает то же окно, что в «Шахматке» (на телефоне — шторка). */
  function entryWindow(pos: FactPosition): ReactElement {
    return h(FactWindow, { key: pos.position_id, api, pos, place: pos.location_path, brigades, lastBrigade, onBrigade: rememberBrigade, me, canCreate, canApprove, projectId,
      onClose: () => setOpenId(''), onSaved: (msg) => { setOpenId(''); setNotice(msg); void refresh(); }, onChanged: () => { void refresh(); } });
  }

  const nav = h('div', { className: 'ft-crumbs', 'data-testid': 'ft-crumbs' },
    h('button', { type: 'button', className: 'ft-crumb' + (path.length ? '' : ' ft-crumb--cur'), 'data-testid': 'ft-root', onClick: () => { void enterPlace(projectId, []); } }, 'Проект'),
    path.map((n, i) => h('span', { key: n.id, className: 'ft-crumb-wrap' }, h('span', { className: 'pf-muted' }, '›'),
      h('button', { type: 'button', className: 'ft-crumb' + (i === path.length - 1 ? ' ft-crumb--cur' : ''), onClick: () => { void enterPlace(projectId, path.slice(0, i + 1)); } }, n.name))));

  const rows = positions || [];
  // P2-0046 (утверждённый макет): место — одна карточка с итогом; работы — компактный список, фильтр-кнопки по состоянию;
  // нажатие на работу открывает окно ввода (телефон — снизу, ПК — справа); на ПК слева — дерево корпусов и этажей.
  const counts = countStates(rows);
  const visibleRows = only ? rows.filter((p) => rowState(p) === only) : rows;
  const avg = rows.length ? rows.reduce((a, p) => a + Math.min(100, percent(p.fact_qty, p.plan_qty)), 0) / rows.length : 0;
  const pendingN = rows.reduce((a, p) => a + (p.pending_count ? 1 : 0), 0);
  const tree = roots.length
    ? h('nav', { className: 'pf-card ft-tree', 'aria-label': 'Места проекта', 'data-testid': 'ft-tree' }, treeNodes(roots, []))
    : null;
  function treeNodes(nodes: LocationNode[], above: LocationNode[]): ReactElement[] {
    return nodes.map((n) => {
      const on = path.length > above.length && path[above.length].id === n.id;
      const cur = on && path.length === above.length + 1;
      const open = on && kids[n.id] && kids[n.id].length;
      return h('div', { key: n.id, className: 'ft-tnode' },
        h('button', { type: 'button', className: 'ft-titem' + (cur ? ' ft-titem--cur' : '') + (on ? ' ft-titem--on' : ''), style: { paddingLeft: `${10 + above.length * 16}px` },
          'aria-current': cur ? 'true' : undefined, 'data-location-id': n.id, onClick: () => { void enterPlace(projectId, [...above, n]); } },
          // стрелка — у узлов, где ещё есть уровни (корпус, секция) или уже открытые дети; этаж — без стрелки
          isTopPlace(n.node_type) || n.node_type === 'section' || open ? h('span', { className: 'ft-tchev' + (open ? ' ft-tchev--open' : ''), 'aria-hidden': 'true' }) : h('span', { className: 'ft-tdot', 'aria-hidden': 'true' }), n.name),
        open ? h('div', { className: 'ft-tkids' }, treeNodes(kids[n.id], [...above, n])) : null);
    });
  }
  const chip = (id: RowState | '', label: string, n: number): ReactElement | null => (id && !n ? null
    : h('button', { key: id || 'all', type: 'button', className: 'p2-reg__q' + (only === id ? ' p2-reg__q--on' : ''), 'aria-pressed': only === id, 'data-testid': 'ft-only', 'data-value': id,
        onClick: () => setOnly(only === id ? '' : id) }, label, h('span', { className: 'p2-reg__qn' }, String(n))));
  const placeCard = place
    ? h('div', { className: 'pf-card ft-place-card', 'data-testid': 'ft-place-card' },
        h('div', { className: 'ft-place-top' }, nav,
          place && canCreate && rows.length && !closing
            ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost ft-close-btn', 'data-testid': 'ft-close-open', onClick: () => { setClosing(true); setOpenId(''); setHistoryId(''); } }, 'Закрыть этаж целиком')
            : null),
        rows.length
          ? h('div', { className: 'ft-place-sum' }, h('span', null, 'Выполнено ', h('b', null, fmtPct(Math.round(avg))), ` · работ: ${rows.length}`, pendingN ? ` · ждут РП: ${pendingN}` : ''),
              h('div', { className: 'ft-bar', 'aria-hidden': 'true' }, h('div', { className: 'ft-bar-fill', style: { width: `${Math.min(100, avg)}%` } })))
          : null)
    : nav;
  const body = h('div', { className: 'pj-tab ft-main' }, placeCard,
        children.length
          ? h('div', { className: 'ft-tiles' + (tree ? ' ft-tiles--tree' : ''), 'data-testid': 'ft-children' }, children.map((c) => h('button', { key: c.id, type: 'button', className: 'ft-tile', 'data-location-id': c.id,
              onClick: () => { void enterPlace(projectId, [...path, c]); } }, h('span', { className: 'ft-tile-type' }, NODE_LABEL[c.node_type] || ''), h('b', null, c.name))))
          : null,
        !place ? h('div', { className: 'pf-muted', 'data-testid': 'ft-pick' }, children.length ? 'Выберите корпус, секцию или этаж.' : 'В проекте пока нет мест — их создаёт ПТО в «Компания → Проекты → Объекты и места».') : null,
        notice ? h('div', { className: 'pj-notice', role: 'status', 'data-testid': 'ft-notice' }, notice) : null,
        error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
        closing && place
          ? h(FloorClose, { api, projectId, place: { id: place.id, name: place.name }, positions: rows, brigades, lastBrigade, onBrigade: rememberBrigade, me, onClose: () => setClosing(false),
              onDone: (msg) => { setClosing(false); setNotice(msg); void refresh(); } })
          : null,
        historyId && rows.find((p) => p.position_id === historyId)
          ? h(FactHistory, { api, pos: rows.find((p) => p.position_id === historyId)!, me, canApprove, canCreate, onClose: () => setHistoryId(''), onChanged: () => { void refresh(); } })
          : null,
        place && positions === null ? h('div', { className: 'pf-muted' }, 'Загрузка…') : null,
        place && positions && !rows.length ? h('div', { className: 'pf-card pj-empty pf-muted', 'data-testid': 'ft-empty' }, emptyText(area, 'Для этого места нет работ: позиции появляются после подтверждения ВОР.')) : null,
        rows.length > 1
          ? h('div', { className: 'p2-reg__quick', role: 'group', 'aria-label': 'Состояние работ', 'data-testid': 'ft-chips' },
              chip('', 'Все', rows.length), chip('work', 'В работе', counts.work), chip('pending', 'Ждёт РП', counts.pending), chip('rejected', 'Отклонено', counts.rejected),
              chip('done', 'Готово', counts.done), chip('none', 'Не начато', counts.none))
          : null,
        visibleRows.length
          ? h('div', { className: 'pf-card ft-list' }, visibleRows.slice(0, shown).map((p) => {
              const pct = percent(p.fact_qty, p.plan_qty);
              const where = rel(p);
              // P2-0006b: снятая в новой редакции ВОР — новый факт не вносится, открывается история (исправить запись можно)
              const entry = canCreate && !p.withdrawn;
              const open = (): void => { if (entry) { setOpenId(p.position_id); setHistoryId(''); } else setHistoryId(historyId === p.position_id ? '' : p.position_id); setClosing(false); };
              return h('div', { key: p.position_id, className: 'ft-row', 'data-position-id': p.position_id },
                h('button', { type: 'button', className: 'ft-row-main', onClick: open, 'aria-label': `${p.work_name}: ${entry ? 'внести факт' : 'история'}` },
                  h('span', { className: 'ft-name' }, h('b', null, p.work_name),
                    p.withdrawn ? h(StatusBadge, { status: 'red', label: 'Снята в новой редакции ВОР', title: 'Факт сохранён, в план не считается', testId: 'ft-withdrawn' }) : null,
                    where ? h('span', { className: 'pf-muted ft-place' }, where) : null,
                    hints.get(p.position_id) ? h('span', { className: 'pf-muted ft-vor', 'data-testid': 'ft-vor' }, hints.get(p.position_id)) : null),
                  h('span', { className: 'ft-line' },
                    h('span', { className: 'ft-nums', 'data-testid': 'ft-nums' }, `${fmtQty(p.fact_qty)} из ${fmtQty(p.plan_qty)} ${p.unit_code}`),
                    h('span', { className: 'ft-bar', role: 'progressbar', 'aria-valuenow': Math.min(100, pct), 'aria-valuemin': 0, 'aria-valuemax': 100 },
                      h('span', { className: 'ft-bar-fill' + (pct >= 100 ? ' ft-bar-fill--done' : '') + (pct > 100 ? ' ft-bar-fill--over' : ''), style: { width: `${Math.min(100, pct)}%` } })),
                    h('span', { className: 'pf-muted ft-rest' }, `осталось ${fmtQty(remainder(p.plan_qty, p.fact_qty))}`)),
                  p.pending_count ? h('span', { className: 'ft-pending', 'data-testid': 'ft-pending-badge' }, `Ждёт РП: ${fmtQty(p.pending_qty)} ${p.unit_code}`) : null,
                  p.last_rejected_note ? h('span', { className: 'ft-bad', 'data-testid': 'ft-rejected' }, `Отклонено РП: ${p.last_rejected_note}`) : null),
                h('b', { className: 'ft-pct' + (pct > 100 ? ' ft-pct--over' : ''), 'data-testid': 'ft-pct' }, fmtPct(pct)),
                h('span', { className: 'ft-acts' },
                  canCreate ? h('button', { type: 'button', className: 'pf-btn ft-small-btn', 'data-testid': 'ft-enter', onClick: () => { setOpenId(p.position_id); setHistoryId(''); setClosing(false); } }, 'Внести') : null,
                  h('button', { type: 'button', className: 'pf-btn pf-btn--ghost ft-small-btn', 'data-testid': 'ft-history-btn', onClick: () => { setHistoryId(historyId === p.position_id ? '' : p.position_id); setClosing(false); } }, 'История')),
                h('span', { className: 'ft-chev', 'aria-hidden': 'true' }));
            }))
          : null,
        openId && canCreate && rows.find((p) => p.position_id === openId) ? entryWindow(rows.find((p) => p.position_id === openId)!) : null,
        visibleRows.length > shown ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'ft-more', onClick: () => setShown(shown + PAGE) }, `Показать ещё (${visibleRows.length - shown})`) : null);

  return h('div', { className: 'pj-tab ft-tab', 'data-testid': 'ft-tab' },
    h(ProjectPicker, { list, value: projectId, onChange: setProjectId }),
    h('div', { className: 'ft-entry' + (tree ? ' ft-entry--tree' : '') }, tree, body));
}

export const FACT_CSS = PENDING_REGISTRY_CSS + FACT_JOURNAL_CSS + FACT_WINDOW_CSS + `
.ft-tab{min-width:0}
.ft-tab--wide{max-width:none}
.ft-crumbs{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center}
.ft-crumb-wrap{display:inline-flex;gap:6px;align-items:center}
.ft-crumb{border:0;background:transparent;color:var(--primary);font-weight:700;font-size:14px;min-height:36px;padding:0 6px;border-radius:8px;cursor:pointer}
.ft-crumb--cur{color:var(--text-main);cursor:default}
.ft-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.ft-tile{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-height:56px;padding:10px 12px;border:1px solid var(--card-border);border-radius:12px;background:var(--card-bg);color:var(--text-main);cursor:pointer;text-align:left;overflow-wrap:anywhere}
.ft-tile-type{font-size:11px;font-weight:500;color:var(--text-muted)}
.ft-card{display:flex;flex-direction:column;gap:8px;padding:12px 14px}
/* P2-0046: место — карточка с итогом; работы — компактный список; на ПК — дерево мест слева */
.ft-entry{display:flex;flex-direction:column;gap:12px;min-width:0}
.ft-main{min-width:0}
.ft-tree{display:none}
.ft-titem{font:inherit;font-size:14px;display:flex;align-items:center;gap:8px;width:100%;min-height:36px;padding:0 10px;border:0;border-radius:9px;background:transparent;color:var(--text-main);cursor:pointer;text-align:left}
.ft-titem:hover{background:var(--hover-bg)}
.ft-titem--on{font-weight:600}
.ft-titem--cur{background:var(--p2-status-blue-bg);color:var(--p2-status-blue-fg)}
.ft-tchev{width:7px;height:7px;border-right:2px solid var(--text-muted);border-bottom:2px solid var(--text-muted);transform:rotate(-45deg);flex:0 0 auto}
.ft-tchev--open{transform:rotate(45deg)}
.ft-tdot{width:7px;flex:0 0 auto}
.ft-place-card{padding:10px 14px;display:flex;flex-direction:column;gap:8px}
.ft-place-top{display:flex;align-items:center;justify-content:space-between;gap:6px 10px;flex-wrap:wrap}
.ft-close-btn{min-height:36px;padding:6px 12px;font-size:13px}
.ft-place-sum{display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text-muted)}
.ft-place-sum b{color:var(--text-main)}
.ft-place-sum .ft-bar{flex:1 1 auto;min-width:60px}
.ft-list{padding:0;overflow:hidden}
.ft-row{display:flex;align-items:center;gap:12px;padding:10px 14px;border-top:1px solid var(--card-border)}
.ft-row:first-child{border-top:0}
.ft-row-main{flex:1 1 auto;min-width:0;font:inherit;color:inherit;background:transparent;border:0;padding:0;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:5px}
.ft-row-main:focus-visible{outline:2px solid var(--accent,var(--primary));outline-offset:2px}
.ft-name{display:flex;flex-wrap:wrap;gap:2px 10px;align-items:baseline;overflow-wrap:anywhere}
.ft-name b{font-weight:600;font-size:14.5px}
.ft-line{display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--text-muted);min-width:0}
.ft-line .ft-nums{white-space:nowrap;font-variant-numeric:tabular-nums}
.ft-line .ft-bar{display:block;flex:1 1 auto;min-width:50px;height:6px}
.ft-rest{white-space:nowrap}
.ft-acts{display:none;gap:6px;flex:0 0 auto}
.ft-small-btn{min-height:36px;padding:6px 12px;font-size:13px}
.ft-chev{width:8px;height:8px;border-right:2px solid var(--text-muted);border-bottom:2px solid var(--text-muted);transform:rotate(-45deg);flex:0 0 auto}
.ft-row .ft-pct{font-size:15px;font-weight:600;min-width:52px;text-align:right;flex:0 0 auto}
@media (min-width:768px){.ft-acts{display:inline-flex}.ft-chev{display:none}}
@media (max-width:767.98px){.ft-rest{display:none}}
@media (min-width:1024px){
.ft-entry--tree{display:grid;grid-template-columns:240px minmax(0,1fr);gap:16px;align-items:start}
.ft-tree{display:flex;flex-direction:column;gap:2px;padding:8px;position:sticky;top:12px;max-height:calc(100vh - 140px);overflow-y:auto}
.ft-tiles--tree{display:none}
}
.ft-place{font-size:12px}
.ft-vor{font-size:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.ft-nums{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;font-variant-numeric:tabular-nums}
.ft-pct{font-size:18px}
.ft-pct--over,.ft-warn{color:var(--color-yellow)}
.ft-warn{font-size:12px;font-weight:700}
.ft-bad{color:var(--color-red);font-size:13px}
.ft-bar{height:8px;border-radius:6px;background:var(--hover-bg);overflow:hidden}
.ft-bar-fill{display:block;height:100%;background:var(--p2-chart-fact,var(--color-green));border-radius:6px}
.ft-bar-fill--done{background:var(--color-green)}
.ft-bar-fill--over{background:var(--color-yellow)}
.ft-pending{font-size:12.5px;font-weight:600;color:var(--p2-status-blue-fg,var(--color-yellow))}
.ft-form{display:flex;flex-direction:column;gap:10px;padding:10px;border-radius:12px;background:var(--hover-bg)}
.ft-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.ft-sheet{display:flex;flex-direction:column;gap:10px;padding:12px 14px}
.ft-sheet-head{display:flex;gap:8px;align-items:center;justify-content:space-between}
.ft-sheet-head b{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
.ft-sheet-head .pf-btn{flex:0 0 auto}
.ft-mode-pct{display:inline-flex;flex-wrap:nowrap;gap:8px;align-items:center}
.ft-hrow{display:flex;flex-direction:column;gap:4px;padding:8px 0;border-bottom:1px solid var(--card-border)}
.ft-hrow:last-child{border-bottom:0}
.ft-hrow--superseded .ft-hmain b{text-decoration:line-through;color:var(--text-muted)}
.ft-hmain{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.ft-hmeta{font-size:12px;overflow-wrap:anywhere}
.ft-badge{font-size:12px;font-weight:600;padding:1px 6px;border-radius:6px;border:1px solid var(--card-border)}
.ft-badge--accepted{color:var(--color-green)}
.ft-badge--pending_approval{color:var(--color-yellow)}
.ft-badge--rejected{color:var(--color-red)}
.ft-badge--superseded{color:var(--text-muted)}
.ft-edit{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.ft-small{align-self:flex-start;min-height:36px}
.ft-modes{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}
.ft-pct-in,.ft-pct{font-variant-numeric:tabular-nums}
.ft-modes .ft-pct{width:80px;font-size:16px}
.ft-close-list{display:flex;flex-direction:column;border:1px solid var(--card-border);border-radius:12px;overflow:hidden}
.ft-close-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1.4fr) auto;gap:6px 12px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--card-border)}
.ft-close-row:last-child{border-bottom:0}
.ft-close-row--off{opacity:.5}
.ft-close-nums{font-size:12px}
.ft-close-qty{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ft-close-qty .pj-input{width:110px;text-align:right}
.ft-total{font-weight:700}
@media (max-width:760px){.ft-close-row{grid-template-columns:minmax(0,1fr)}.ft-close-qty .pj-input{flex:1 1 110px}}
`;
