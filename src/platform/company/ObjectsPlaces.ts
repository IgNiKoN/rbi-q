/**
 * «Проект → Объекты и места» (P2-0047, утверждённый макет reports/P2-0047/compare/, экран 3). Верх дерева — объекты (корпус,
 * паркинг, сети…; вид — справочник сервера), под ними секции, этажи, помещения со строительным номером и номером БТИ.
 * Структура заводится пакетом, не «плюсиками»: мастер объекта (секции × этажи × квартиры, нумерация, подвал, кровля),
 * «Добавить этажи» в несколько секций, «Копировать секцию»; поштучно — только исключения. id нового места даёт приложение.
 * Права ядра без модулей (pf_project_places / pf_save_place / pf_fill_object …); места, которые ведёт Качество, — только просмотр.
 * Права и проверки — на сервере; дети грузятся при раскрытии.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { FormEvent, ReactElement, ReactNode } from 'react';
import { fillNodeCount, GENERATE_LIMIT, newId } from '../core/projects.service.ts';
import type { DictItem, PlaceNode, ProjectCard, ProjectsApi } from '../core/projects.service.ts';
import type { PlanNodeType } from '../../services/locations/types.ts';
import type { Result } from './company.service.ts';
import { MoreMenu, PlaceTree, RecordFields, Sheet } from '../ui/index.ts';
import type { MoreItem } from '../ui/index.ts';

const TYPE_LABEL: Record<string, string> = { object: 'объект', building: 'корпус', section: 'секция', floor: 'этаж', apartment: 'квартира', other: 'прочее' };
const INNER: PlanNodeType[] = ['section', 'floor', 'apartment', 'other'];
const SUGGEST: Record<string, PlanNodeType> = { object: 'section', building: 'section', section: 'floor', floor: 'apartment', apartment: 'other', other: 'other' };
const KIND_FALLBACK: DictItem[] = [{ code: 'building', name: 'Корпус', sort_order: 1 }, { code: 'parking', name: 'Паркинг', sort_order: 2 },
  { code: 'networks', name: 'Сети', sort_order: 3 }, { code: 'landscaping', name: 'Благоустройство', sort_order: 4 }, { code: 'other', name: 'Прочее', sort_order: 5 }];

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
  | { kind: 'object' } | { kind: 'fill'; obj: PlaceNode } | { kind: 'add'; parent: PlaceNode } | { kind: 'edit'; node: PlaceNode }
  | { kind: 'floors'; obj: PlaceNode; section: PlaceNode } | { kind: 'copy'; node: PlaceNode } | { kind: 'remove'; node: PlaceNode };

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

export function ObjectsPlaces(props: { api: ProjectsApi; project: ProjectCard; kinds: DictItem[]; onChanged?: () => void }): ReactElement {
  const { api, project } = props;
  const kinds = props.kinds.length ? props.kinds : KIND_FALLBACK;
  const manage = !!api.savePlace && project.can_manage && !project.archived_at && !project.places_led_by_quality;
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
  const wide = useWide('(min-width: 1100px)');

  const load = async (parent: string | null): Promise<PlaceNode[]> => {
    const list = api.projectPlaces ? await api.projectPlaces(project.id, parent) : [];
    setKids((k) => ({ ...k, [parent || '']: list }));
    return list;
  };
  useEffect(() => { void load(null).then((l) => { if (l.length) { setObjId(l[0].id); void load(l[0].id); } }); }, []);

  const objects = kids[''];
  const obj = objects && objId ? objects.find((o) => o.id === objId) || null : null;
  const all = Object.values(kids).flatMap((l) => l || []);
  const sel = selId ? all.find((n) => n.id === selId) || null : null;
  const kindName = (code: string | null): string => (kinds.find((k) => k.code === code) || { name: code || 'прочее' }).name;
  const typeOf = (n: PlaceNode): string => (n.node_type === 'object' ? kindName(n.object_kind).toLowerCase() : TYPE_LABEL[n.node_type] || n.node_type);

  /** После изменения — заново открытые уровни, объекты (счётчики) и сам объект. */
  async function refresh(extra: string[] = []): Promise<void> {
    const ids = new Set<string>([...Object.keys(kids).filter((k) => k && open[k]), ...(objId ? [objId] : []), ...extra]);
    await Promise.all([load(null), ...[...ids].map((id) => load(id))]);
    props.onChanged?.();
  }
  async function run(p: Promise<Result<unknown>>, done: string, extra: string[] = []): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    const r = await p;
    setBusy(false);
    if (!r.ok) { setError(r.message || 'Не удалось выполнить'); return false; }
    setNotice(done); setDialog(null); await refresh(extra); return true;
  }
  function openDialog(d: Dialog): void { setError(''); setNotice(''); setDialog(d); }
  async function toggle(n: PlaceNode): Promise<void> {
    const next = !open[n.id];
    setOpen((o) => ({ ...o, [n.id]: next }));
    if (next && !kids[n.id]) await load(n.id);
  }
  function pickObject(o: PlaceNode): void { setObjId(o.id); setSelId(null); if (!kids[o.id]) void load(o.id); }

  // ---------- действия ----------
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
    setNotice(r.value ? `Объект заполнен: мест ${r.value}` : 'У объекта уже есть места — используйте «Добавить этажи» или «Копировать секцию»');
    setDialog(null); setFill(FILL0); await refresh([o.id]);
  }
  async function onAdd(ev: FormEvent, parent: PlaceNode): Promise<void> {
    ev.preventDefault(); if (busy || !api.savePlace) return;
    const f = ev.currentTarget as HTMLFormElement;
    const name = val(f, 'name'), type = (val(f, 'type') || 'other') as PlanNodeType;
    if (!name) { setError('Введите название'); return; }
    setOpen((o) => ({ ...o, [parent.id]: true }));
    await run(api.savePlace(project.id, newId(), parent.id, type, name, null, type === 'apartment' ? val(f, 'build_no') || null : null,
      type === 'apartment' ? val(f, 'bti_no') || null : null), `«${name}» добавлено`, [parent.id]);
  }
  async function onEdit(ev: FormEvent, n: PlaceNode): Promise<void> {
    ev.preventDefault(); if (busy || !api.savePlace) return;
    const f = ev.currentTarget as HTMLFormElement;
    const name = val(f, 'name');
    if (!name) { setError('Введите название'); return; }
    const apt = n.node_type === 'apartment';
    await run(api.savePlace(project.id, n.id, n.parent_id, n.node_type, name, n.node_type === 'object' ? val(f, 'kind') : null,
      apt ? val(f, 'build_no') || null : n.build_no, apt ? val(f, 'bti_no') || null : n.bti_no), 'Сохранено');
  }
  async function onFloors(ev: FormEvent, o: PlaceNode): Promise<void> {
    ev.preventDefault(); if (busy || !api.addFloors) return;
    const f = ev.currentTarget as HTMLFormElement;
    const ids = [...f.querySelectorAll('input[name=sec]:checked')].map((x) => (x as HTMLInputElement).value);
    const from = int(val(f, 'from'), NaN), to = int(val(f, 'to'), NaN), apf = int(val(f, 'apf'), -1);
    if (!ids.length) { setError('Отметьте хотя бы одну секцию'); return; }
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to || apf < 0) { setError('Проверьте этажи (с — по) и число квартир'); return; }
    ids.forEach((id) => setOpen((x) => ({ ...x, [id]: true })));
    await run(api.addFloors(ids, from, to, apf), 'Этажи добавлены', [o.id, ...ids]);
  }
  async function onCopy(ev: FormEvent, n: PlaceNode): Promise<void> {
    ev.preventDefault(); if (busy || !api.copyPlace) return;
    const name = val(ev.currentTarget as HTMLFormElement, 'name');
    if (!name) { setError('Введите название копии'); return; }
    await run(api.copyPlace(n.id, newId(), name), `Скопировано: «${name}»`, n.parent_id ? [n.parent_id] : []);
  }
  async function onRemove(n: PlaceNode): Promise<void> {
    if (busy || !api.removePlace) return;
    if (await run(api.removePlace(n.id), `Удалено: «${n.name}»`)) {
      if (selId === n.id) setSelId(null);
      if (objId === n.id) setObjId(null);
    }
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
      return h(Sheet, { title: 'Добавить внутрь', sub: p.path, testId: 'op-add', onClose: close }, errorBox,
        h('form', { className: 'op-form', onSubmit: (e: FormEvent) => { void onAdd(e, p); }, 'data-testid': 'op-add-form' },
          field('Что добавить', h('select', { name: 'type', className: 'pj-input', defaultValue: SUGGEST[p.node_type] || 'other', 'data-testid': 'op-type' },
            INNER.map((t) => h('option', { key: t, value: t }, TYPE_LABEL[t][0].toUpperCase() + TYPE_LABEL[t].slice(1))))),
          field('Название', input('name', '')),
          field('Строительный номер (для квартиры)', input('build_no', '', { maxLength: 40 })),
          field('Номер БТИ (для квартиры)', input('bti_no', '', { maxLength: 40 })),
          foot('Добавить', 'op-add-go')));
    }
    if (dialog.kind === 'edit') {
      const n = dialog.node;
      return h(Sheet, { title: 'Изменить', sub: n.path, testId: 'op-edit', onClose: close }, errorBox,
        h('form', { className: 'op-form', onSubmit: (e: FormEvent) => { void onEdit(e, n); }, 'data-testid': 'op-edit-form' },
          field('Название', input('name', n.name), true),
          n.node_type === 'object' ? field('Вид объекта', h('select', { name: 'kind', className: 'pj-input', defaultValue: n.object_kind || 'other', 'data-testid': 'op-kind' },
            kinds.map((k) => h('option', { key: k.code, value: k.code }, k.name)))) : null,
          n.node_type === 'apartment' ? field('Строительный номер', input('build_no', n.build_no || '', { maxLength: 40 })) : null,
          n.node_type === 'apartment' ? field('Номер БТИ', input('bti_no', n.bti_no || '', { maxLength: 40 })) : null,
          foot('Сохранить', 'op-edit-go')));
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
    if (dialog.kind === 'copy') {
      const n = dialog.node;
      const sibs = (kids[n.parent_id || ''] || []);
      return h(Sheet, { title: n.node_type === 'section' ? 'Копировать секцию' : 'Копировать', sub: `${n.name} — со всем, что внутри; квартиры получат новые номера`, testId: 'op-copy', onClose: close }, errorBox,
        h('form', { className: 'op-form', onSubmit: (e: FormEvent) => { void onCopy(e, n); }, 'data-testid': 'op-copy-form' },
          field('Название копии', input('name', nextName(sibs, n.name)), true), foot('Копировать', 'op-copy-go')));
    }
    const n = dialog.node;
    return h(Sheet, { title: 'Удалить?', sub: n.path, testId: 'op-remove', onClose: close }, errorBox,
      h('p', { className: 'op-p' }, n.child_count ? `«${n.name}» будет удалено вместе со всем, что внутри.` : `«${n.name}» будет удалено.`),
      h('div', { className: 'op-foot' }, h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: close }, 'Нет'),
        h('button', { type: 'button', className: 'pf-btn op-danger', disabled: busy, 'data-testid': 'op-remove-go', onClick: () => { void onRemove(n); } },
          n.child_count ? 'Да, удалить с вложенными' : 'Да, удалить')));
  }

  // ---------- меню и карточка места ----------
  function menu(n: PlaceNode, o: PlaceNode | null): MoreItem[] {
    if (!manage) return [];
    const items: MoreItem[] = [];
    if (n.node_type !== 'apartment') items.push({ id: 'add', label: 'Добавить внутрь', hint: 'поштучно — для исключений', onClick: () => openDialog({ kind: 'add', parent: n }) });
    if (n.node_type === 'section' && o && api.addFloors) items.push({ id: 'floors', label: 'Добавить этажи', hint: 'в одну или несколько секций', onClick: () => openDialog({ kind: 'floors', obj: o, section: n }) });
    if ((n.node_type === 'section' || n.node_type === 'floor') && api.copyPlace) items.push({ id: 'copy', label: n.node_type === 'section' ? 'Копировать секцию' : 'Копировать этаж', onClick: () => openDialog({ kind: 'copy', node: n }) });
    items.push({ id: 'edit', label: 'Изменить', onClick: () => openDialog({ kind: 'edit', node: n }) });
    if (api.removePlace) items.push({ id: 'remove', label: 'Удалить', danger: true, onClick: () => openDialog({ kind: 'remove', node: n }) });
    return items;
  }
  const meta = (n: PlaceNode): string => {
    if (n.node_type === 'apartment') return [n.build_no ? `стр. № ${n.build_no}` : '', n.bti_no ? `БТИ ${n.bti_no}` : ''].filter(Boolean).join(' · ');
    if (n.apartment_count) return `кв. ${n.apartment_count}`;
    if (n.node_type === 'floor' && n.child_count) return `мест ${n.child_count}`;
    return '';
  };
  function placeCard(n: PlaceNode): ReactElement {
    return h('div', { className: 'op-card', 'data-testid': 'op-place' },
      h('div', { className: 'op-card__head' }, h('b', null, n.name),
        manage ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'op-place-edit', onClick: () => openDialog({ kind: 'edit', node: n }) }, 'Изменить') : null),
      h(RecordFields, { testId: 'op-place-fields', cols: 1, fields: [
        { id: 'path', label: 'Где', value: n.path.split(' · ').slice(0, -1).join(' › ') || 'верхний уровень' },
        { id: 'type', label: 'Тип', value: typeOf(n) },
        ...(n.node_type === 'apartment' ? [{ id: 'build', label: 'Строительный номер', value: n.build_no }, { id: 'bti', label: 'Номер БТИ', value: n.bti_no }] : []),
        ...(n.child_count ? [{ id: 'inside', label: 'Внутри мест', value: String(n.child_count) }] : []),
        ...(n.apartment_count ? [{ id: 'apts', label: 'Квартир', value: String(n.apartment_count) }] : [])] }));
  }

  // ---------- экран ----------
  const head = h('div', { className: 'op-head' },
    h('div', { className: 'op-head__t' }, h('b', null, 'Объекты'), objects ? h('span', { className: 'pf-tab-n' }, String(objects.length)) : null),
    manage ? h('button', { type: 'button', className: 'pf-btn op-main', 'data-testid': 'op-add-object', onClick: () => { setNewKind('building'); setFillNow(true); setFill(FILL0); openDialog({ kind: 'object' }); } }, '+ Объект') : null);
  const notes = [
    project.places_led_by_quality ? h('div', { key: 'q', className: 'pj-led', role: 'note', 'data-testid': 'op-from-quality' },
      'Места этого проекта ведутся в Качестве — здесь только просмотр. Добавить или изменить корпус, этаж, квартиру можно в Качестве.') : null,
    project.archived_at ? h('div', { key: 'a', className: 'pf-muted' }, 'Проект в архиве — только просмотр.') : null,
    error && !dialog ? h('div', { key: 'e', className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { key: 'n', className: 'pj-notice', role: 'status', 'data-testid': 'op-notice' }, notice) : null];

  if (objects === undefined) return h('div', { className: 'op-root' }, head, h('div', { className: 'pf-muted' }, 'Загрузка…'));
  if (!objects.length) return h('div', { className: 'op-root', 'data-testid': 'op-root' }, head, ...notes,
    h('div', { className: 'pf-card op-empty', 'data-testid': 'op-empty' }, manage ? 'Объектов пока нет — нажмите «+ Объект»: корпус можно сразу заполнить секциями, этажами и квартирами.'
      : project.places_led_by_quality ? 'Мест пока нет — добавьте корпус в Качестве.' : 'Объектов пока нет.'), sheet());

  const cards = h('div', { className: 'op-objs', role: 'list', 'data-testid': 'op-objects' }, objects.map((o) => h('button', {
    key: o.id, type: 'button', role: 'listitem', className: 'op-obj' + (o.id === objId ? ' is-on' : ''), 'aria-pressed': o.id === objId, 'data-object-id': o.id, onClick: () => pickObject(o) },
    h('b', null, o.name), h('span', { className: 'op-obj__k' }, kindName(o.object_kind)),
    h('span', { className: 'op-obj__m' }, o.apartment_count ? `квартир ${o.apartment_count}` : o.child_count ? `мест внутри ${o.child_count}` : 'пока пусто'))));
  const inner = obj ? kids[obj.id] : undefined;
  const objMenu = obj ? menu(obj, obj).filter((m) => m.id !== 'add') : [];
  const objBox = obj ? h('div', { className: 'op-obj-box', 'data-testid': 'op-object', 'data-object-id': obj.id },
    h('div', { className: 'op-obj-head' },
      h('button', { type: 'button', className: 'op-obj-title', onClick: () => setSelId(obj.id) }, h('b', null, obj.name), h('span', null, kindName(obj.object_kind))),
      h('div', { className: 'op-obj-actions' },
        manage && api.fillObject && !obj.child_count ? h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'op-fill-open', onClick: () => { setFill(FILL0); openDialog({ kind: 'fill', obj }); } }, 'Заполнить объект') : null,
        manage ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'op-add-inside', onClick: () => openDialog({ kind: 'add', parent: obj }) }, '+ Внутрь') : null,
        h(MoreMenu, { testId: 'op-obj-more', items: objMenu, label: 'Действия: ' + obj.name }))),
    inner === undefined ? h('div', { className: 'pf-muted' }, 'Загрузка…')
      : inner.length ? h(PlaceTree<PlaceNode & { hasKids: boolean }>, {
          testId: 'op-tree', roots: inner.map((n) => ({ ...n, hasKids: n.child_count > 0 })),
          kids: Object.fromEntries(Object.entries(kids).map(([k, l]) => [k, l ? l.map((n) => ({ ...n, hasKids: n.child_count > 0 })) : l])),
          open, onToggle: (n) => { void toggle(n); }, selected: selId, onSelect: (n) => setSelId(n.id),
          kind: (n) => typeOf(n), meta, menu: (n) => menu(n, obj), limit: 30, more, onMore: (id) => setMore((m) => ({ ...m, [id]: true })) })
      : h('div', { className: 'pf-muted op-empty' }, manage ? 'Внутри пока пусто — «Заполнить объект» создаст секции, этажи и квартиры одной формой.' : 'Внутри пока пусто.')) : null;

  return h('div', { className: 'op-root', 'data-testid': 'op-root' }, head, ...notes, cards,
    h('div', { className: 'op-split' + (wide && sel ? ' has-side' : '') }, objBox, wide && sel ? h('aside', { className: 'op-side' }, placeCard(sel)) : null),
    !wide && sel && !dialog ? h(Sheet, { title: 'Место', sub: sel.path, testId: 'op-place-sheet', onClose: () => setSelId(null) }, placeCard(sel)) : null,
    sheet());
}

export const OBJECTS_CSS = `
.op-root{display:flex;flex-direction:column;gap:12px;min-width:0}
.op-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.op-head__t{display:flex;align-items:center;gap:8px;font-size:15px}
.op-objs{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.op-obj{font:inherit;text-align:left;display:flex;flex-direction:column;gap:2px;padding:10px 12px;min-height:64px;border:1px solid var(--card-border);border-radius:12px;background:var(--card-bg);color:var(--text-main);cursor:pointer;min-width:0;overflow-wrap:anywhere}
.op-obj b{font-size:14px;font-weight:600}
.op-obj__k,.op-obj__m{font-size:12.5px;color:var(--text-muted)}
.op-obj.is-on{border-color:var(--p2-chart-fact,var(--primary));box-shadow:inset 0 0 0 1px var(--p2-chart-fact,var(--primary))}
.op-obj:focus-visible{outline:2px solid var(--accent,var(--primary));outline-offset:2px}
.op-split{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}
.op-split.has-side{grid-template-columns:minmax(0,1fr) 320px}
.op-side{position:sticky;top:80px}
.op-obj-box{display:flex;flex-direction:column;gap:8px;min-width:0}
.op-obj-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.op-obj-title{font:inherit;display:flex;align-items:baseline;gap:8px;border:0;background:transparent;color:var(--text-main);padding:4px 0;cursor:pointer;overflow-wrap:anywhere;text-align:left}
.op-obj-title b{font-size:16px;font-weight:600}
.op-obj-title span{font-size:13px;color:var(--text-muted)}
.op-obj-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.op-empty{padding:16px;font-size:14px}
.op-card{display:flex;flex-direction:column;gap:10px}
.op-card__head{display:flex;align-items:center;justify-content:space-between;gap:8px;overflow-wrap:anywhere}
.op-card__head b{font-size:16px}
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
@media (max-width:599.98px){.op-form{grid-template-columns:1fr}.op-objs{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:767.98px){
  .op-head>.op-main{position:fixed;z-index:900;left:max(16px,env(safe-area-inset-left,0px));right:max(16px,env(safe-area-inset-right,0px));
    bottom:calc(65px + env(safe-area-inset-bottom,0px) + 12px);min-height:50px;font-size:16px;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.22)}
  .op-root:has(.op-main){padding-bottom:84px}
}
`;
