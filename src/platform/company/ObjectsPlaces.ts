/**
 * «Проект → Объекты и места» — редактор структуры (P2-0055, утверждённый макет reports/P2-0055/mockups/compare.html; основа — P2-0047).
 * Верх дерева — объекты (корпус, паркинг, сети…; вид — справочник сервера), под ними секции, этажи, помещения со строительным
 * номером и номером БТИ. Правка без окон: название — в строке, «+» сразу создаёт следующее по номеру («эт. 6», «Секция 2»,
 * «кв. 21»), «Выше / Ниже», удаление с плашкой «Отменить». Пакетно — как раньше, листом: мастер объекта, «Добавить этажи»,
 * «Добавить другое…» (поштучно, с выбором вида и номерами). Карточка места — панель справа на ПК (от 900 px), лист снизу на
 * телефоне. Права и проверки — на сервере (049: перенос только внутри объекта); экран заранее показывает, что нельзя.
 * Без сети правка недоступна. Дети грузятся при раскрытии. id нового места даёт приложение.
 */
import { createElement as h, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode } from 'react';
import { fillNodeCount, GENERATE_LIMIT, newId } from '../core/projects.service.ts';
import type { DictItem, MovePlaceResult, PlaceNode, ProjectCard, ProjectsApi } from '../core/projects.service.ts';
import type { PlanNodeType } from '../../services/locations/types.ts';
import type { Result } from './company.service.ts';
import { MoreMenu, PlaceTree, RecordFields, Sheet } from '../ui/index.ts';
import type { MoreItem } from '../ui/index.ts';
import { CHILD_TYPE, nextChildName, pushUndo, stepBefore } from './places-editor.ts';
import type { UndoEntry } from './places-editor.ts';

const TYPE_LABEL: Record<string, string> = { object: 'объект', building: 'корпус', section: 'секция', floor: 'этаж', apartment: 'квартира', other: 'прочее' };
const INNER: PlanNodeType[] = ['section', 'floor', 'apartment', 'other'];
const SUGGEST: Record<string, PlanNodeType> = { object: 'section', building: 'section', section: 'floor', floor: 'apartment', apartment: 'other', other: 'other' };
const KIND_FALLBACK: DictItem[] = [{ code: 'building', name: 'Корпус', sort_order: 1 }, { code: 'parking', name: 'Паркинг', sort_order: 2 },
  { code: 'networks', name: 'Сети', sort_order: 3 }, { code: 'landscaping', name: 'Благоустройство', sort_order: 4 },
  { code: 'kindergarten', name: 'Детский сад', sort_order: 5 }, { code: 'school', name: 'Школа', sort_order: 6 }, { code: 'other', name: 'Прочее', sort_order: 7 }];
const TOAST_MS = 10000;

const int = (v: string, fallback: number): number => { const n = Number(String(v).trim().replace(',', '.')); return Number.isFinite(n) ? Math.trunc(n) : fallback; };
const numberIn = (name: string): number | null => { const m = String(name).match(/(\d+)/); return m ? Number(m[1]) : null; };
/** Следующее название по соседям: «Секция 3» после «Секция 1, 2»; без номера — «Название (копия)». */
export function nextName(siblings: { name: string }[], source: string): string {
  const base = source.replace(/\s*\d+\s*$/, '').trim();
  if (!base || numberIn(source) === null) return source + ' (копия)';
  const max = siblings.filter((s) => s.name.replace(/\s*\d+\s*$/, '').trim() === base).reduce((m, s) => Math.max(m, numberIn(s.name) || 0), 0);
  return `${base} ${max + 1}`;
}

interface Fill { sections: string; floors: string; apf: string; first: string; numbering: 'through' | 'per_section'; start: string; basement: boolean; roof: boolean }
const FILL0: Fill = { sections: '1', floors: '9', apf: '4', first: '1', numbering: 'through', start: '1', basement: false, roof: false };
/** Сводка мастера: сколько мест и какие номера квартир; null — числа неверны. */
export function fillSummary(f: Fill): { total: number; text: string; ok: boolean } {
  const s = int(f.sections, 0), fl = int(f.floors, 0), a = int(f.apf, -1), st = int(f.start, 0);
  if (s < 1 || fl < 1 || a < 0 || st < 1) return { total: 0, ok: false, text: 'Секций и этажей — от 1, квартир на этаже — от 0, номер — от 1' };
  const total = fillNodeCount(s, fl, a, f.basement, f.roof);
  if (total > GENERATE_LIMIT) return { total, ok: false, text: `Будет ${total} мест — это больше ${GENERATE_LIMIT} за раз, уменьшите числа` };
  const apts = s * fl * a;
  const nums = !a ? '' : f.numbering === 'through' ? `, квартиры № ${st}–${st + apts - 1}` : `, в каждой секции № ${st}–${st + fl * a - 1}`;
  return { total, ok: true, text: `Будет создано: секций ${s}, этажей ${s * fl}, квартир ${apts}${nums}${f.basement ? ', подвалы' : ''}${f.roof ? ', кровли' : ''} — всего мест ${total}` };
}

type Dialog = null
  | { kind: 'object' } | { kind: 'fill'; obj: PlaceNode } | { kind: 'add'; parent: PlaceNode }
  | { kind: 'floors'; obj: PlaceNode; section: PlaceNode } | { kind: 'remove'; node: PlaceNode };

function useWide(query: string): boolean {
  const mm = (): MediaQueryList | null => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null);
  const [wide, setWide] = useState<boolean>(() => !!mm()?.matches);
  useEffect(() => {
    const m = mm(); if (!m || !m.addEventListener) return undefined;
    const on = (): void => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}
/** Есть ли связь: правка мест — только онлайн (решение P2-0054 «снять и сообщить»). */
function useOnline(): boolean {
  const get = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;
  const [on, setOn] = useState<boolean>(get);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const f = (): void => setOn(get());
    window.addEventListener('online', f); window.addEventListener('offline', f);
    return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f); };
  }, []);
  return on;
}

export function ObjectsPlaces(props: { api: ProjectsApi; project: ProjectCard; kinds: DictItem[]; onChanged?: () => void }): ReactElement {
  const { api, project } = props;
  const kinds = props.kinds.length ? props.kinds : KIND_FALLBACK;
  const manage = !!api.savePlace && project.can_manage && !project.archived_at && !project.places_led_by_quality;
  const online = useOnline();
  const edit = manage && online;
  const [kids, setKids] = useState<Record<string, PlaceNode[] | undefined>>({});   // '' — объекты
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [objId, setObjId] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [fill, setFill] = useState<Fill>(FILL0);
  const [fillNow, setFillNow] = useState(true);
  const [newKind, setNewKind] = useState('building');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<{ id: string; value: string; error: string } | null>(null);
  const [undo, setUndo] = useState<UndoEntry[]>([]);
  const [toast, setToast] = useState<{ key: number; text: string; canUndo: boolean } | null>(null);
  const [nextNo, setNextNo] = useState<Record<string, number>>({});
  const wide = useWide('(min-width: 900px)');
  const kidsRef = useRef(kids); kidsRef.current = kids;
  const openRef = useRef(open); openRef.current = open;
  const seq = useRef(0);

  const load = async (parent: string | null): Promise<PlaceNode[]> => {
    const list = api.projectPlaces ? await api.projectPlaces(project.id, parent) : [];
    setKids((k) => ({ ...k, [parent || '']: list }));
    return list;
  };
  useEffect(() => { void load(null).then((l) => { if (l.length) { setObjId(l[0].id); void load(l[0].id); } }); }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast((x) => (x && x.key === toast.key ? null : x)), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast ? toast.key : 0]);

  const objects = kids[''];
  const obj = objects && objId ? objects.find((o) => o.id === objId) || null : null;
  const all = Object.values(kids).flatMap((l) => l || []);
  const byId = (id: string | null): PlaceNode | null => (id ? all.find((n) => n.id === id) || null : null);
  const sel = byId(selId);
  const kindName = (code: string | null): string => (kinds.find((k) => k.code === code) || { name: code || 'прочее' }).name;
  const typeOf = (n: PlaceNode): string => (n.node_type === 'object' ? kindName(n.object_kind).toLowerCase() : TYPE_LABEL[n.node_type] || n.node_type);
  const siblings = (n: PlaceNode): PlaceNode[] => kids[n.parent_id || ''] || [];

  // следующий строительный номер для «+ кв.» — когда выбран этаж (подпись кнопки)
  useEffect(() => {
    if (!sel || !edit || CHILD_TYPE[sel.node_type] !== 'apartment' || !api.nextBuildNo) return;
    void api.nextBuildNo(sel.id).then((r) => { if (r.ok) setNextNo((m) => ({ ...m, [sel.id]: r.value })); });
  }, [selId, sel ? sel.child_count : -1]);

  /** После изменения — заново объекты (счётчики), открытые уровни, выбранный объект и затронутые места. */
  async function refresh(extra: (string | null)[] = []): Promise<void> {
    const ids = new Set<string>([...Object.keys(kidsRef.current).filter((k) => k && openRef.current[k]), ...(objId ? [objId] : []),
      ...extra.filter((x): x is string => !!x)]);
    await Promise.all([load(null), ...[...ids].map((id) => load(id))]);
    props.onChanged?.();
  }
  function showToast(text: string, canUndo: boolean): void { seq.current += 1; setToast({ key: seq.current, text, canUndo }); }
  /** Действие на сервере: ошибка — текстом сервера; успех — плашка, а если есть обратное действие — «Отменить». */
  async function act<T>(p: Promise<Result<T>>, label: string, back: ((v: T) => (() => Promise<Result<unknown>>) | null) | null,
                        extra: (string | null)[] = []): Promise<Result<T>> {
    setBusy(true); setError(''); setNotice('');
    const r = await p;
    setBusy(false);
    if (!r.ok) { setError(r.message || 'Не удалось выполнить'); return r; }
    const u = back ? back(r.value) : null;
    if (u) { seq.current += 1; const id = seq.current; setUndo((l) => pushUndo(l, { id, label, undo: u })); }
    showToast(label, !!u);
    await refresh(extra);
    return r;
  }
  async function doUndo(): Promise<void> {
    const e = undo[undo.length - 1];
    if (!e || busy) return;
    setUndo((l) => l.filter((x) => x.id !== e.id));
    setBusy(true); setError('');
    const r = await e.undo();
    setBusy(false);
    if (!r.ok) { setError(`Не удалось отменить «${e.label}»: ${r.message || 'ошибка сервера'}`); return; }
    showToast(`Отменено: ${e.label}`, false);
    await refresh();
  }
  function openDialog(d: Dialog): void { setError(''); setNotice(''); setDialog(d); }
  async function toggle(n: PlaceNode): Promise<void> {
    const next = !open[n.id];
    setOpen((o) => ({ ...o, [n.id]: next }));
    if (next && !kids[n.id]) await load(n.id);
  }
  function select(n: PlaceNode): void { setSelId(n.id); if (n.child_count && !kids[n.id]) void load(n.id); }
  function pickObject(o: PlaceNode): void { setObjId(o.id); setSelId(null); setEditing(null); if (!kids[o.id]) void load(o.id); }

  // ---------- правка без окон ----------
  /** Подпись «+»: что появится («эт. 6»); у помещения — со следующим строительным номером. */
  function plusName(parent: PlaceNode): string | null {
    const type = CHILD_TYPE[parent.node_type];
    if (!type) return null;
    const list = kids[parent.id] || (parent.child_count === 0 ? [] : undefined);
    if (type === 'apartment') { const no = nextNo[parent.id]; return list && no ? nextChildName(list, type, no) : null; }
    return list ? nextChildName(list, type) : null;
  }
  async function addNext(parent: PlaceNode): Promise<void> {
    const type = CHILD_TYPE[parent.node_type];
    if (!type || !api.savePlace || busy) return;
    const list = kidsRef.current[parent.id] || await load(parent.id);
    let no: number | null = null;
    if (type === 'apartment') {
      const r = api.nextBuildNo ? await api.nextBuildNo(parent.id) : null;
      no = r && r.ok ? r.value : list.filter((x) => x.node_type === 'apartment').reduce((m, x) => Math.max(m, Number(x.build_no) || 0), 0) + 1;
    }
    const name = nextChildName(list, type, no);
    const id = newId();
    setOpen((o) => ({ ...o, [parent.id]: true }));
    const r = await act(api.savePlace(project.id, id, parent.id, type, name, null, no !== null ? String(no) : null, null),
      `Добавлено «${name}»`, api.removePlace ? () => () => api.removePlace!(id) : null, [parent.id, parent.parent_id]);
    if (r.ok) setSelId(id);
  }
  function startRename(n: PlaceNode): void { if (edit) { setError(''); setEditing({ id: n.id, value: n.name, error: '' }); } }
  async function commitRename(n: PlaceNode, value: string): Promise<void> {
    const v = value.trim();
    if (!v) { setEditing({ id: n.id, value, error: 'Введите название' }); return; }
    if (v === n.name) { setEditing(null); return; }
    if (!api.savePlace || busy) return;
    setBusy(true);
    const r = await api.savePlace(project.id, n.id, n.parent_id, n.node_type, v, n.object_kind, n.build_no, n.bti_no);
    setBusy(false);
    if (!r.ok) { setEditing({ id: n.id, value, error: r.message || 'Не удалось сохранить' }); return; }
    setEditing(null);
    const back = (): Promise<Result<string>> => api.savePlace!(project.id, n.id, n.parent_id, n.node_type, n.name, n.object_kind, n.build_no, n.bti_no);
    seq.current += 1; const id = seq.current;
    setUndo((l) => pushUndo(l, { id, label: `Переименовано «${n.name}» → «${v}»`, undo: back }));
    showToast(`Переименовано «${n.name}» → «${v}»`, true);
    await refresh([n.parent_id]);
  }
  /** Номера помещения и вид объекта — поля карточки, сохраняются при выходе из поля или Enter. */
  async function saveFields(n: PlaceNode, patch: { kind?: string; build?: string; bti?: string }): Promise<void> {
    if (!api.savePlace) return;
    const kind = patch.kind ?? n.object_kind, b = patch.build !== undefined ? patch.build.trim() || null : n.build_no, t = patch.bti !== undefined ? patch.bti.trim() || null : n.bti_no;
    if (kind === n.object_kind && b === n.build_no && t === n.bti_no) return;
    await act(api.savePlace(project.id, n.id, n.parent_id, n.node_type, n.name, kind, b, t), `Сохранено: «${n.name}»`,
      () => () => api.savePlace!(project.id, n.id, n.parent_id, n.node_type, n.name, n.object_kind, n.build_no, n.bti_no), [n.parent_id]);
  }
  async function step(n: PlaceNode, dir: -1 | 1): Promise<void> {
    const s = stepBefore(siblings(n), n.id, dir);
    if (!s || !api.movePlace || busy) return;
    const mv = api.movePlace;
    await act(mv(n.id, n.parent_id, s.before), `«${n.name}» — ${dir < 0 ? 'выше' : 'ниже'}`,
      (v: MovePlaceResult) => (v.changed ? () => mv(n.id, v.oldParentId, v.oldBeforeId) : null), [n.parent_id]);
  }
  /** «Дублировать рядом» — копия со всем, что внутри, рядом с местом, название — следующее по номеру (прежняя «Копировать секцию»). */
  async function duplicate(n: PlaceNode): Promise<void> {
    if (!api.copyPlace || busy || n.node_type === 'object') return;
    const id = newId(), name = nextName(siblings(n), n.name);
    const r = await act(api.copyPlace(n.id, id, name), `Скопировано: «${name}»`, api.removePlace ? () => () => api.removePlace!(id) : null, [n.parent_id]);
    if (r.ok) setSelId(id);
  }
  async function remove(n: PlaceNode): Promise<void> {
    if (!api.removePlace || busy) return;
    if (n.node_type === 'object') { openDialog({ kind: 'remove', node: n }); return; }
    const r = await act(api.removePlace(n.id), `Удалено «${n.name}»`, api.restorePlace ? () => () => api.restorePlace!(n.id) : null, [n.parent_id]);
    if (r.ok && selId === n.id) setSelId(null);
  }
  async function removeObject(n: PlaceNode): Promise<void> {
    if (!api.removePlace || busy) return;
    const r = await act(api.removePlace(n.id), `Удалён объект «${n.name}»`, api.restorePlace ? () => () => api.restorePlace!(n.id) : null);
    if (r.ok) { setDialog(null); if (selId === n.id) setSelId(null); if (objId === n.id) setObjId(null); }
  }
  function onKey(e: ReactKeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (!edit || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.code === 'KeyZ' || e.key.toLowerCase() === 'z')) { if (undo.length) { e.preventDefault(); void doUndo(); } return; }
    if (!sel) return;
    if (e.key === 'F2') { e.preventDefault(); startRename(sel); }
    else if (e.key === 'Delete' && sel.node_type !== 'object') { e.preventDefault(); void remove(sel); }
  }

  // ---------- пакетные окна (как раньше) ----------
  const val = (f: HTMLFormElement, n: string): string => { const el = f.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement | null; return el ? el.value.trim() : ''; };
  const fillParams = (objectId: string) => ({ objectId, sections: int(fill.sections, 1), floors: int(fill.floors, 1), apartmentsPerFloor: int(fill.apf, 0),
    firstFloor: int(fill.first, 1), numbering: fill.numbering, startNo: int(fill.start, 1), basement: fill.basement, roof: fill.roof });

  async function onNewObject(ev: FormEvent): Promise<void> {
    ev.preventDefault(); if (busy || !api.savePlace) return;
    const f = ev.currentTarget as HTMLFormElement;
    const name = val(f, 'name'), kind = val(f, 'kind') || 'other';
    if (!name) { setError('Введите название объекта'); return; }
    const withFill = fillNow && !!api.fillObject;
    if (withFill && !fillSummary(fill).ok) { setError(fillSummary(fill).text); return; }
    const id = newId();
    setBusy(true); setError(''); setNotice('');
    const r = await api.savePlace(project.id, id, null, 'object', name, kind);
    if (!r.ok) { setBusy(false); setError(r.message || 'Не удалось сохранить'); return; }
    let done = `Объект «${name}» добавлен`;
    if (withFill && api.fillObject) {
      const g = await api.fillObject(fillParams(id));
      if (!g.ok) { setBusy(false); setError(`Объект добавлен, но не заполнен: ${g.message}`); setObjId(id); await refresh([id]); return; }
      done += `, мест создано: ${g.value}`;
    }
    setBusy(false); setNotice(done); setDialog(null); setObjId(id); setFill(FILL0); await refresh([id]);
  }
  async function onFill(ev: FormEvent, o: PlaceNode): Promise<void> {
    ev.preventDefault(); if (busy || !api.fillObject) return;
    if (!fillSummary(fill).ok) { setError(fillSummary(fill).text); return; }
    const fn = api.fillObject;
    setBusy(true); setError('');
    const r = await fn(fillParams(o.id));
    setBusy(false);
    if (!r.ok) { setError(r.message || 'Не удалось заполнить'); return; }
    setNotice(r.value ? `Объект заполнен: мест ${r.value}` : 'У объекта уже есть места — используйте «+», «Добавить этажи» или «Копировать»');
    setDialog(null); setFill(FILL0); await refresh([o.id]);
  }
  async function onAdd(ev: FormEvent, parent: PlaceNode): Promise<void> {
    ev.preventDefault(); if (busy || !api.savePlace) return;
    const f = ev.currentTarget as HTMLFormElement;
    const name = val(f, 'name'), type = (val(f, 'type') || 'other') as PlanNodeType;
    if (!name) { setError('Введите название'); return; }
    const id = newId();
    setOpen((o) => ({ ...o, [parent.id]: true }));
    const r = await act(api.savePlace(project.id, id, parent.id, type, name, null, type === 'apartment' ? val(f, 'build_no') || null : null,
      type === 'apartment' ? val(f, 'bti_no') || null : null), `Добавлено «${name}»`, api.removePlace ? () => () => api.removePlace!(id) : null, [parent.id, parent.parent_id]);
    if (r.ok) { setDialog(null); setSelId(id); }
  }
  async function onFloors(ev: FormEvent, o: PlaceNode): Promise<void> {
    ev.preventDefault(); if (busy || !api.addFloors) return;
    const f = ev.currentTarget as HTMLFormElement;
    const ids = [...f.querySelectorAll('input[name=sec]:checked')].map((x) => (x as HTMLInputElement).value);
    const from = int(val(f, 'from'), NaN), to = int(val(f, 'to'), NaN), apf = int(val(f, 'apf'), -1);
    if (!ids.length) { setError('Отметьте хотя бы одну секцию'); return; }
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to || apf < 0) { setError('Проверьте этажи (с — по) и число квартир'); return; }
    ids.forEach((id) => setOpen((x) => ({ ...x, [id]: true })));
    const r = await act(api.addFloors(ids, from, to, apf), 'Этажи добавлены', null, [o.id, ...ids]);
    if (r.ok) setDialog(null);
  }

  // ---------- формы ----------
  const errorBox = error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null;
  const field = (label: string, input: ReactElement, wideField?: boolean): ReactElement =>
    h('label', { className: 'pf-field' + (wideField ? ' op-wide' : ''), key: label }, label, input);
  const input = (name: string, def: string, extra: Record<string, unknown> = {}): ReactElement =>
    h('input', { name, className: 'pj-input', defaultValue: def, maxLength: 200, 'data-testid': 'op-' + name, ...extra });
  const foot = (submit: string, testId: string): ReactElement => h('div', { className: 'op-foot' },
    h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setDialog(null) }, 'Отмена'),
    h('button', { type: 'submit', className: 'pf-btn', disabled: busy, 'data-testid': testId }, busy ? 'Сохраняем…' : submit));
  const numIn = (k: keyof Fill, label: string): ReactElement => field(label, h('input', { className: 'pj-input', inputMode: 'numeric', name: 'f-' + k, 'data-testid': 'op-f-' + k,
    value: fill[k] as string, onChange: (e: Event) => setFill({ ...fill, [k]: (e.target as HTMLInputElement).value }) }));
  function fillFields(): ReactNode[] {
    const sum = fillSummary(fill);
    return [numIn('sections', 'Секций'), numIn('floors', 'Этажей в секции'), numIn('apf', 'Квартир на этаже'), numIn('first', 'Первый этаж'),
      field('Нумерация квартир', h('select', { className: 'pj-input', 'data-testid': 'op-f-numbering', value: fill.numbering,
        onChange: (e: Event) => setFill({ ...fill, numbering: (e.target as HTMLSelectElement).value === 'per_section' ? 'per_section' : 'through' }) },
        h('option', { value: 'through' }, 'Сквозная по объекту'), h('option', { value: 'per_section' }, 'В каждой секции заново'))),
      numIn('start', 'С номера'),
      h('label', { className: 'op-check', key: 'basement' }, h('input', { type: 'checkbox', checked: fill.basement, 'data-testid': 'op-f-basement',
        onChange: (e: Event) => setFill({ ...fill, basement: (e.target as HTMLInputElement).checked }) }), 'Подвал в каждой секции'),
      h('label', { className: 'op-check', key: 'roof' }, h('input', { type: 'checkbox', checked: fill.roof, 'data-testid': 'op-f-roof',
        onChange: (e: Event) => setFill({ ...fill, roof: (e.target as HTMLInputElement).checked }) }), 'Кровля в каждой секции'),
      h('div', { key: 'sum', className: 'op-sum op-wide' + (sum.ok ? '' : ' is-bad'), role: 'status', 'data-testid': 'op-fill-sum' }, sum.text)];
  }

  function sheet(): ReactElement | null {
    if (!dialog) return null;
    const close = (): void => setDialog(null);
    if (dialog.kind === 'object') {
      const nBuild = (objects || []).filter((o) => o.object_kind === 'building').length;
      const defName = newKind === 'building' ? `Корпус ${nBuild + 1}` : kindName(newKind);
      return h(Sheet, { title: 'Новый объект', sub: 'Корпус, паркинг, сети… Секции, этажи и квартиры — сразу или позже', testId: 'op-new', onClose: close }, errorBox,
        h('form', { className: 'op-form', onSubmit: (e: FormEvent) => { void onNewObject(e); }, 'data-testid': 'op-new-form' },
          field('Вид объекта', h('select', { name: 'kind', className: 'pj-input', value: newKind, 'data-testid': 'op-kind',
            onChange: (e: Event) => { const k = (e.target as HTMLSelectElement).value; setNewKind(k); setFillNow(k === 'building'); } },
            kinds.map((k) => h('option', { key: k.code, value: k.code }, k.name)))),
          field('Название', input('name', defName, { key: defName }), false),
          api.fillObject ? h('label', { className: 'op-check op-wide' }, h('input', { type: 'checkbox', checked: fillNow, 'data-testid': 'op-fill-now',
            onChange: (e: Event) => setFillNow((e.target as HTMLInputElement).checked) }), 'Сразу создать секции, этажи и квартиры') : null,
          ...(fillNow && api.fillObject ? fillFields() : []),
          foot('Добавить объект', 'op-new-go')));
    }
    if (dialog.kind === 'fill') {
      const o = dialog.obj;
      return h(Sheet, { title: 'Заполнить объект', sub: o.name, testId: 'op-fill', onClose: close }, errorBox,
        h('form', { className: 'op-form', onSubmit: (e: FormEvent) => { void onFill(e, o); }, 'data-testid': 'op-fill-form' }, ...fillFields(), foot('Создать места', 'op-fill-go')));
    }
    if (dialog.kind === 'add') {
      const p = dialog.parent;
      return h(Sheet, { title: 'Добавить другое', sub: p.path, testId: 'op-add', onClose: close }, errorBox,
        h('form', { className: 'op-form', onSubmit: (e: FormEvent) => { void onAdd(e, p); }, 'data-testid': 'op-add-form' },
          field('Что добавить', h('select', { name: 'type', className: 'pj-input', defaultValue: SUGGEST[p.node_type] || 'other', 'data-testid': 'op-type' },
            INNER.map((t) => h('option', { key: t, value: t }, TYPE_LABEL[t][0].toUpperCase() + TYPE_LABEL[t].slice(1))))),
          field('Название', input('name', '')),
          field('Строительный номер (для квартиры)', input('build_no', '', { maxLength: 40 })),
          field('Номер БТИ (для квартиры)', input('bti_no', '', { maxLength: 40 })),
          foot('Добавить', 'op-add-go')));
    }
    if (dialog.kind === 'floors') {
      const secs = (kids[dialog.obj.id] || []).filter((s) => s.node_type === 'section');
      const o = dialog.obj;
      return h(Sheet, { title: 'Добавить этажи', sub: `${o.name}: квартиры получат номера дальше по объекту`, testId: 'op-floors', onClose: close }, errorBox,
        h('form', { className: 'op-form', onSubmit: (e: FormEvent) => { void onFloors(e, o); }, 'data-testid': 'op-floors-form' },
          h('fieldset', { className: 'op-secs op-wide' }, h('legend', null, 'В какие секции'),
            secs.map((s) => h('label', { key: s.id, className: 'op-check' }, h('input', { type: 'checkbox', name: 'sec', value: s.id, defaultChecked: s.id === dialog.section.id }), s.name))),
          field('С этажа', input('from', '', { inputMode: 'numeric' })), field('По этаж', input('to', '', { inputMode: 'numeric' })),
          field('Квартир на этаже', input('apf', '4', { inputMode: 'numeric' })),
          foot('Добавить этажи', 'op-floors-go')));
    }
    const n = dialog.node;
    return h(Sheet, { title: 'Удалить объект?', sub: n.path, testId: 'op-remove', onClose: close }, errorBox,
      h('p', { className: 'op-p' }, n.child_count ? `«${n.name}» будет удалён вместе со всем, что внутри. Сразу после удаления его можно вернуть кнопкой «Отменить».`
        : `«${n.name}» будет удалён.`),
      h('div', { className: 'op-foot' }, h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: close }, 'Нет'),
        h('button', { type: 'button', className: 'pf-btn op-danger', disabled: busy, 'data-testid': 'op-remove-go', onClick: () => { void removeObject(n); } },
          n.child_count ? 'Да, удалить с вложенными' : 'Да, удалить')));
  }

  // ---------- меню, «+» в строке, карточка ----------
  function menu(n: PlaceNode, o: PlaceNode | null): MoreItem[] {
    if (!edit) return [];
    const items: MoreItem[] = [{ id: 'rename', label: 'Переименовать', hint: wide ? 'F2 или двойной щелчок' : undefined, onClick: () => startRename(n) }];
    const child = CHILD_TYPE[n.node_type];
    if (child) { const nm = plusName(n); items.push({ id: 'plus', label: nm ? `+ ${nm}` : `+ ${TYPE_LABEL[child]}`, hint: 'следующий по номеру, без окна', onClick: () => { void addNext(n); } }); }
    if (n.node_type !== 'apartment') items.push({ id: 'add', label: 'Добавить другое…', hint: 'вид, название и номера — вручную', onClick: () => openDialog({ kind: 'add', parent: n }) });
    if (n.node_type === 'section' && o && api.addFloors) items.push({ id: 'floors', label: 'Добавить этажи…', hint: 'в одну или несколько секций', onClick: () => openDialog({ kind: 'floors', obj: o, section: n }) });
    if (n.node_type !== 'object' && api.copyPlace) items.push({ id: 'dup', label: 'Дублировать рядом', hint: `«${nextName(siblings(n), n.name)}» — со всем, что внутри`, onClick: () => { void duplicate(n); } });
    if (api.movePlace) {
      const sibs = siblings(n);
      const up = stepBefore(sibs, n.id, -1), down = stepBefore(sibs, n.id, 1);
      items.push({ id: 'up', label: '↑ Выше', disabled: !up, hint: up ? undefined : 'уже первое', onClick: () => { void step(n, -1); } });
      items.push({ id: 'down', label: '↓ Ниже', disabled: !down, hint: down ? undefined : 'уже последнее', onClick: () => { void step(n, 1); } });
    }
    if (api.removePlace) items.push({ id: 'remove', label: 'Удалить', danger: true, hint: n.node_type === 'object' ? 'с подтверждением' : 'можно отменить', onClick: () => { void remove(n); } });
    return items;
  }
  const meta = (n: PlaceNode): string => {
    if (n.node_type === 'apartment') return [n.build_no ? `стр. № ${n.build_no}` : '', n.bti_no ? `БТИ ${n.bti_no}` : ''].filter(Boolean).join(' · ');
    if (n.apartment_count) return `кв. ${n.apartment_count}`;
    if (n.node_type === 'floor' && n.child_count) return `мест ${n.child_count}`;
    return '';
  };
  const plusBtn = (n: PlaceNode): ReactElement | null => {
    if (!edit || !CHILD_TYPE[n.node_type]) return null;
    const nm = plusName(n);
    const label = 'Добавить ' + (nm ? `«${nm}»` : TYPE_LABEL[CHILD_TYPE[n.node_type] as string]);
    return h('button', { type: 'button', className: 'op-plus', title: label, 'aria-label': label, 'data-testid': 'op-row-plus', disabled: busy, onClick: () => { void addNext(n); } }, '+');
  };
  const renameBox = (n: PlaceNode): ReactNode => editing && editing.id === n.id ? h('div', { className: 'op-rename' },
    h('input', { className: 'op-rename__in', value: editing.value, autoFocus: true, maxLength: 200, 'aria-label': 'Название', 'data-testid': 'op-rename',
      onChange: (e: Event) => setEditing({ id: n.id, value: (e.target as HTMLInputElement).value, error: '' }),
      onKeyDown: (e: ReactKeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); void commitRename(n, editing.value); }
        else if (e.key === 'Escape') { e.preventDefault(); setEditing(null); }
      },
      onBlur: () => { void commitRename(n, editing.value); } }),
    editing.error ? h('small', { className: 'op-rename__err', role: 'alert', 'data-testid': 'op-rename-error' }, editing.error)
      : h('small', { className: 'op-rename__hint' }, 'Enter — сохранить · Esc — отмена')) : null;

  function placeCard(n: PlaceNode, inSheet = false): ReactElement {
    const o = obj;
    const child = CHILD_TYPE[n.node_type];
    const nm = plusName(n);
    const sibs = siblings(n);
    const up = stepBefore(sibs, n.id, -1), down = stepBefore(sibs, n.id, 1);
    const dis = !online || busy;
    const btn = (id: string, label: string, on: () => void, extra: { disabled?: boolean; wide?: boolean; title?: string; cls?: string } = {}): ReactElement =>
      h('button', { key: id, type: 'button', className: 'pf-btn ' + (extra.cls || 'pf-btn--ghost') + (extra.wide ? ' op-acts__wide' : ''), 'data-testid': 'op-c-' + id,
        disabled: dis || extra.disabled, title: extra.title, onClick: on }, label);
    const apt = n.node_type === 'apartment';
    const numIn2 = (key: 'build' | 'bti', label: string, value: string | null): ReactElement => field(label, h('input', {
      key: n.id + key + (value || ''), className: 'pj-input', defaultValue: value || '', maxLength: 40, disabled: !edit, 'data-testid': 'op-c-' + key,
      placeholder: 'не указан',
      onBlur: (e: Event) => { void saveFields(n, { [key]: (e.target as HTMLInputElement).value }); },
      onKeyDown: (e: ReactKeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); } }));
    return h('div', { className: 'op-card', 'data-testid': 'op-place' },
      inSheet ? h('span', { className: 'op-chip op-chip--alone' }, typeOf(n)) : h('div', { className: 'op-card__head' }, h('b', null, n.name), h('span', { className: 'op-chip' }, typeOf(n))),
      h(RecordFields, { testId: 'op-place-fields', cols: 1, fields: [
        { id: 'path', label: 'Где', value: n.path.split(' · ').slice(0, -1).join(' › ') || 'верхний уровень' },
        ...(n.child_count ? [{ id: 'inside', label: 'Внутри мест', value: String(n.child_count) }] : []),
        ...(n.apartment_count ? [{ id: 'apts', label: 'Квартир', value: String(n.apartment_count) }] : [])] }),
      apt ? h('div', { className: 'op-card__nums' }, numIn2('build', 'Строительный номер', n.build_no), numIn2('bti', 'Номер БТИ', n.bti_no)) : null,
      n.node_type === 'object' ? field('Вид объекта', h('select', { key: n.id + (n.object_kind || ''), className: 'pj-input', defaultValue: n.object_kind || 'other', disabled: !edit,
        'data-testid': 'op-c-kind', onChange: (e: Event) => { void saveFields(n, { kind: (e.target as HTMLSelectElement).value }); } },
        kinds.map((k) => h('option', { key: k.code, value: k.code }, k.name)))) : null,
      manage ? h('div', { className: 'op-acts' },
        child ? btn('plus', nm ? `+ ${nm}` : `+ ${TYPE_LABEL[child]}`, () => { void addNext(n); }, { wide: true, cls: 'op-gold' }) : null,
        api.movePlace ? btn('up', '↑ Выше', () => { void step(n, -1); }, { disabled: !up }) : null,
        api.movePlace ? btn('down', '↓ Ниже', () => { void step(n, 1); }, { disabled: !down }) : null,
        btn('rename', 'Переименовать', () => startRename(n), { wide: n.node_type === 'object' || !api.copyPlace }),
        n.node_type !== 'object' && api.copyPlace ? btn('dup', 'Дублировать рядом', () => { void duplicate(n); }, { title: `Копия «${nextName(sibs, n.name)}» рядом` }) : null,
        n.node_type === 'section' && o && api.addFloors ? btn('floors', 'Добавить этажи…', () => openDialog({ kind: 'floors', obj: o, section: n }), { wide: true }) : null,
        !apt ? btn('other', 'Добавить другое…', () => openDialog({ kind: 'add', parent: n }), { wide: true }) : null,
        api.removePlace ? btn('remove', 'Удалить', () => { void remove(n); }, { wide: true, cls: 'pf-btn--ghost op-bad' }) : null) : null,
      manage && wide ? h('div', { className: 'op-keys' }, 'На выбранной строке: F2 — переименовать, Delete — удалить, Ctrl/⌘ + Z — отменить.') : null);
  }

  // ---------- экран ----------
  const head = h('div', { className: 'op-head' },
    h('div', { className: 'op-head__t' }, h('b', null, 'Объекты'), objects ? h('span', { className: 'pf-tab-n' }, String(objects.length)) : null),
    edit ? h('button', { type: 'button', className: 'pf-btn op-main', 'data-testid': 'op-add-object', onClick: () => { setNewKind('building'); setFillNow(true); setFill(FILL0); openDialog({ kind: 'object' }); } }, '+ Объект') : null);
  const notes = [
    project.places_led_by_quality ? h('div', { key: 'q', className: 'pj-led', role: 'note', 'data-testid': 'op-from-quality' },
      'Места этого проекта ведутся в Качестве — здесь только просмотр. Добавить или изменить корпус, этаж, квартиру можно в Качестве.') : null,
    project.archived_at ? h('div', { key: 'a', className: 'pf-muted' }, 'Проект в архиве — только просмотр.') : null,
    manage && !online ? h('div', { key: 'o', className: 'pj-led', role: 'note', 'data-testid': 'op-offline' }, 'Нет связи — места меняются только онлайн. Правка вернётся, когда появится связь.') : null,
    error && !dialog ? h('div', { key: 'e', className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { key: 'n', className: 'pj-notice', role: 'status', 'data-testid': 'op-notice' }, notice) : null];
  const toastEl = toast ? h('div', { className: 'op-toast', role: 'status', 'data-testid': 'op-toast' }, h('span', null, toast.text),
    toast.canUndo && undo.length ? h('button', { type: 'button', 'data-testid': 'op-undo', disabled: busy, onClick: () => { void doUndo(); } }, 'Отменить') : null,
    h('button', { type: 'button', className: 'op-toast__x', 'aria-label': 'Скрыть', onClick: () => setToast(null) }, '✕')) : null;

  if (objects === undefined) return h('div', { className: 'op-root' }, head, h('div', { className: 'pf-muted' }, 'Загрузка…'));
  if (!objects.length) return h('div', { className: 'op-root', 'data-testid': 'op-root' }, head, ...notes,
    h('div', { className: 'pf-card op-empty', 'data-testid': 'op-empty' }, manage ? 'Объектов пока нет — нажмите «+ Объект»: корпус можно сразу заполнить секциями, этажами и квартирами.'
      : project.places_led_by_quality ? 'Мест пока нет — добавьте корпус в Качестве.' : 'Объектов пока нет.'), sheet(), toastEl);

  const cards = h('div', { className: 'op-objs', role: 'list', 'data-testid': 'op-objects' }, objects.map((o) => h('button', {
    key: o.id, type: 'button', role: 'listitem', className: 'op-obj' + (o.id === objId ? ' is-on' : ''), 'aria-pressed': o.id === objId, 'data-object-id': o.id, onClick: () => pickObject(o) },
    h('b', null, o.name), h('span', { className: 'op-obj__k' }, kindName(o.object_kind)),
    h('span', { className: 'op-obj__m' }, o.apartment_count ? `квартир ${o.apartment_count}` : o.child_count ? `мест внутри ${o.child_count}` : 'пока пусто'))));
  const inner = obj ? kids[obj.id] : undefined;
  const objPlus = obj ? plusName(obj) : null;
  const objBox = obj ? h('div', { className: 'op-obj-box', 'data-testid': 'op-object', 'data-object-id': obj.id },
    h('div', { className: 'op-obj-head' },
      h('button', { type: 'button', className: 'op-obj-title', onClick: () => select(obj) }, h('b', null, obj.name), h('span', null, kindName(obj.object_kind))),
      h('div', { className: 'op-obj-actions' },
        edit && api.fillObject && !obj.child_count ? h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'op-fill-open', onClick: () => { setFill(FILL0); openDialog({ kind: 'fill', obj }); } }, 'Заполнить объект') : null,
        edit && obj.child_count ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'op-obj-plus', disabled: busy, onClick: () => { void addNext(obj); } },
          objPlus ? `+ ${objPlus}` : '+ Секция') : null,
        h(MoreMenu, { testId: 'op-obj-more', items: menu(obj, obj).filter((m) => m.id !== 'plus'), label: 'Действия: ' + obj.name }))),
    inner === undefined ? h('div', { className: 'pf-muted' }, 'Загрузка…')
      : inner.length ? h(PlaceTree<PlaceNode & { hasKids: boolean }>, {
          testId: 'op-tree', roots: inner.map((n) => ({ ...n, hasKids: n.child_count > 0 })),
          kids: Object.fromEntries(Object.entries(kids).map(([k, l]) => [k, l ? l.map((n) => ({ ...n, hasKids: n.child_count > 0 })) : l])),
          open, onToggle: (n) => { void toggle(n); }, selected: selId, onSelect: (n) => select(n),
          kind: (n) => typeOf(n), meta, menu: (n) => menu(n, obj), limit: 30, more, onMore: (id) => setMore((m) => ({ ...m, [id]: true })),
          action: (n) => plusBtn(n), onRename: edit ? (n) => startRename(n) : undefined,
          editing: editing && byId(editing.id) ? { id: editing.id, node: renameBox(byId(editing.id) as PlaceNode) } : null })
      : h('div', { className: 'pf-muted op-empty' }, edit ? 'Внутри пока пусто — «Заполнить объект» создаст секции, этажи и квартиры одной формой.' : 'Внутри пока пусто.')) : null;

  return h('div', { className: 'op-root', 'data-testid': 'op-root', onKeyDown: onKey }, head, ...notes, cards,
    // на ПК место под карточку есть всегда — выбор строки не сдвигает дерево под мышью
    h('div', { className: 'op-split' + (wide && obj ? ' has-side' : '') }, objBox, wide && obj ? h('aside', { className: 'op-side' }, sel ? placeCard(sel)
      : h('div', { className: 'op-side__empty', 'data-testid': 'op-place-empty' }, 'Выберите место в дереве — здесь появятся его данные и действия.')) : null),
    !wide && sel && !dialog && !editing ? h(Sheet, { title: sel.name, sub: sel.path.split(' · ').slice(0, -1).join(' › ') || 'верхний уровень', testId: 'op-place-sheet', onClose: () => setSelId(null) }, placeCard(sel, true)) : null,
    sheet(), toastEl);
}

export const OBJECTS_CSS = `
.op-root{display:flex;flex-direction:column;gap:12px;min-width:0}
.op-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.op-head__t{display:flex;align-items:center;gap:8px;font-size:15px}
.op-objs{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.op-obj{font:inherit;text-align:left;display:flex;flex-direction:column;gap:2px;padding:10px 12px;min-height:64px;border:1px solid var(--card-border);border-radius:12px;background:var(--card-bg);color:var(--text-main);cursor:pointer;min-width:0;overflow-wrap:anywhere;position:relative}
.op-obj b{font-size:14px;font-weight:600}
.op-obj__k,.op-obj__m{font-size:12.5px;color:var(--text-muted)}
.op-obj.is-on{border-color:var(--accent,var(--primary));box-shadow:inset 0 0 0 1px var(--accent,var(--primary))}
.op-obj:focus-visible{outline:2px solid var(--accent,var(--primary));outline-offset:2px}
.op-split{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}
.op-split.has-side{grid-template-columns:minmax(0,1fr) 340px}
.op-side{position:sticky;top:80px;background:var(--card-bg);border:1px solid var(--card-border);border-radius:14px;padding:14px}
.op-side__empty{font-size:13.5px;color:var(--text-muted);line-height:1.5}
.op-obj-box{display:flex;flex-direction:column;gap:8px;min-width:0}
.op-obj-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.op-obj-title{font:inherit;display:flex;align-items:baseline;gap:8px;border:0;background:transparent;color:var(--text-main);padding:4px 0;cursor:pointer;overflow-wrap:anywhere;text-align:left}
.op-obj-title b{font-size:16px;font-weight:600}
.op-obj-title span{font-size:13px;color:var(--text-muted)}
.op-obj-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.op-empty{padding:16px;font-size:14px}
.op-plus{font:inherit;font-size:18px;line-height:1;font-weight:600;min-width:36px;height:36px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--accent-text,var(--primary));cursor:pointer;opacity:.35}
.p2-tree__row:hover .op-plus,.p2-tree__row.is-sel .op-plus,.op-plus:focus-visible{opacity:1;border-color:var(--card-border)}
.op-plus:focus-visible{outline:2px solid var(--accent,var(--primary));outline-offset:1px}
.op-rename{display:flex;flex-direction:column;gap:3px;padding:2px 0;min-width:0}
.op-rename__in{font:inherit;font-size:15px;font-weight:600;min-height:38px;padding:0 10px;border-radius:8px;border:2px solid var(--accent,var(--primary));background:var(--card-bg);color:var(--text-main);width:100%;max-width:360px;box-sizing:border-box}
.op-rename__err{font-size:12.5px;color:var(--bad-text,var(--color-red,#9f4c45))}
.op-rename__hint{font-size:12px;color:var(--text-muted)}
.op-card{display:flex;flex-direction:column;gap:12px}
.op-card__head{display:flex;align-items:center;gap:8px;overflow-wrap:anywhere}
.op-card__head b{font-size:17px}
.op-chip--alone{align-self:flex-start}
.op-chip{font-size:12px;color:var(--text-muted);border:1px solid var(--card-border);border-radius:999px;padding:1px 8px;white-space:nowrap}
.op-card__nums{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.op-card .pj-input{width:100%;min-height:40px;box-sizing:border-box}
.op-acts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.op-acts .pf-btn{min-height:42px;justify-content:center}
.op-acts__wide{grid-column:1/-1}
.op-gold{background:var(--btn-primary,var(--accent,#c49a5f));border-color:var(--btn-primary,var(--accent,#c49a5f));color:var(--btn-primary-text,#172330)}
.op-bad{color:var(--bad-text,var(--color-red,#9f4c45))}
.op-keys{font-size:12px;line-height:1.45;color:var(--text-muted)}
.op-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(24px + env(safe-area-inset-bottom,0px));z-index:1200;display:flex;align-items:center;gap:6px;
  background:var(--text-main);color:var(--card-bg);border-radius:12px;padding:6px 6px 6px 16px;box-shadow:0 10px 30px rgba(0,0,0,.28);font-size:14px;width:max-content;min-width:min(320px,calc(100vw - 32px));max-width:min(560px,calc(100vw - 32px));box-sizing:border-box}
.op-toast span{flex:1;min-width:0;overflow-wrap:anywhere}
.op-toast button{font:inherit;font-weight:700;color:var(--gold-2,#d8bd91);background:transparent;border:0;padding:8px 10px;border-radius:8px;min-height:40px;cursor:pointer}
.op-toast .op-toast__x{font-weight:400;opacity:.7;color:inherit}
.op-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.op-form .pf-field{min-width:0}
.op-form .pj-input{width:100%;min-height:44px;font-size:16px;box-sizing:border-box}
.op-form .op-wide,.op-foot{grid-column:1/-1}
.op-check{display:flex;align-items:center;gap:10px;font-size:14px;min-height:44px}
.op-check input{width:20px;height:20px}
.op-secs{display:flex;flex-wrap:wrap;gap:4px 16px;border:1px solid var(--card-border);border-radius:12px;padding:8px 12px;margin:0}
.op-secs legend{font-size:12.5px;color:var(--text-muted);padding:0 4px}
.op-sum{font-size:13px;padding:10px 12px;border-radius:10px;background:var(--hover-bg,rgba(0,0,0,.04))}
.op-sum.is-bad{color:var(--color-red,#b5452b)}
.op-foot{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
.op-foot .pf-btn{min-height:44px}
.op-danger{background:var(--color-red,#b5452b);border-color:var(--color-red,#b5452b);color:#fff}
.op-p{margin:0;font-size:14px}
@media (max-width:899.98px){.op-plus{opacity:1;min-width:44px;height:44px}.op-acts .pf-btn{min-height:48px;font-size:15px}}
@media (max-width:599.98px){.op-form{grid-template-columns:1fr}.op-objs{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:767.98px){
  .op-head>.op-main{position:fixed;z-index:900;left:max(16px,env(safe-area-inset-left,0px));right:max(16px,env(safe-area-inset-right,0px));
    bottom:calc(65px + env(safe-area-inset-bottom,0px) + 12px);min-height:50px;font-size:16px;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.22)}
  .op-root:has(.op-main){padding-bottom:84px}
  .op-toast{bottom:auto;top:calc(env(safe-area-inset-top,0px) + 12px)}
}
`;
