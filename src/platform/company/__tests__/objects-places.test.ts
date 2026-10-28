/// <reference types="node" />
/** «Объекты и места» (P2-0047, этап 4; P2-0055 — редактор): объекты верхним уровнем, мастер объекта, «Добавить этажи»,
 *  «+» с автоименем без окна, правка названия в строке, «Выше / Ниже», «Дублировать рядом», удаление с «Отменить» (объект — с
 *  подтверждением), «Добавить другое…» с номерами, номера в карточке, без сети — только просмотр; только просмотр (нет права,
 *  архив, Качество). Подставной сервер. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { fillNodeCount } from '../../core/projects.service.ts';
import type { FillParams, PlaceNode, ProjectCard, ProjectsApi } from '../../core/projects.service.ts';
import type { Result } from '../company.service.ts';
import type { PlanNodeType } from '../../../services/locations/types.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { ObjectsPlaces, fillSummary, nextName } = await import('../ObjectsPlaces.ts');
const tick = (): Promise<void> => settle();
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const click = (b: N) => b.dispatchEvent(new win.Event('click', { bubbles: true }));
const submit = (f: N) => f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
function setValue(el: N, value: string): void {
  const proto = el.tagName === 'SELECT' ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new win.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}
function setCheck(el: N, on: boolean): void { if (!!el.checked !== on) el.click(); }

const PROJECT: ProjectCard = { id: 'p1', name: 'ЖК Тест', code: null, archived_at: null, created_at: '', can_manage: true, division_id: null, division_name: null,
  address: null, planned_start: null, planned_finish: null, manager_user_id: null, manager_name: null, stage: 'construction', our_role: null,
  timezone: 'Europe/Moscow', country: 'RU', object_count: 0, place_count: 0, places_led_by_quality: false };
const KINDS = [{ code: 'building', name: 'Корпус', sort_order: 1 }, { code: 'parking', name: 'Паркинг', sort_order: 2 }, { code: 'other', name: 'Прочее', sort_order: 5 }];

interface Row { id: string; parent: string | null; type: PlanNodeType; kind: string | null; name: string; order: number; build: string | null; bti: string | null; deleted: boolean; group?: number }
/** Сервер в памяти: те же правила, что в 045 (верх — только объект, повтор id — та же запись, номера квартир по объекту). */
function fakeServer(opts: { fail?: string; failSave?: string } = {}) {
  const rows: Row[] = []; const calls: string[] = []; let seq = 0; let grp = 0;
  const live = (p: string | null) => rows.filter((r) => !r.deleted && r.parent === p).sort((a, b) => a.order - b.order);
  const byId = (id: string) => rows.find((r) => r.id === id)!;
  const path = (r: Row): string => (r.parent ? path(byId(r.parent)) + ' · ' : '') + r.name;
  const sub = (id: string): Row[] => live(id).flatMap((c) => [c, ...sub(c.id)]);
  const objOf = (r: Row): Row => (r.parent ? objOf(byId(r.parent)) : r);
  const nextNo = (o: Row) => sub(o.id).filter((x) => x.type === 'apartment' && /^\d+$/.test(x.build || '')).reduce((m, x) => Math.max(m, Number(x.build)), 0) + 1;
  const ins = (parent: string | null, type: PlanNodeType, name: string, extra: Partial<Row> = {}): string => {
    const id = extra.id || 'n' + (++seq);
    rows.push({ id, parent, type, kind: null, name, order: live(parent).length + 1, build: null, bti: null, deleted: false, ...extra }); return id;
  };
  const node = (r: Row): PlaceNode => ({ id: r.id, parent_id: r.parent, node_type: r.type, object_kind: r.kind, name: r.name, build_no: r.build, bti_no: r.bti,
    sort_order: r.order, depth: 1, path: path(r), child_count: live(r.id).length,
    apartment_count: r.type === 'object' || r.type === 'section' ? sub(r.id).filter((x) => x.type === 'apartment').length : null });
  const fail = <T>(): Result<T> => ({ ok: false, message: opts.fail! });
  const api = {
    async projectPlaces(_p: string, parent: string | null) { calls.push('list:' + parent); return live(parent).map(node); },
    async savePlace(_p: string, id: string, parent: string | null, type: PlanNodeType, name: string, kind?: string | null, b?: string | null, t?: string | null) {
      calls.push(`save:${parent}:${type}:${name}:${kind ?? ''}:${b ?? ''}:${t ?? ''}`);
      if (opts.fail) return fail<string>();
      if (opts.failSave) return { ok: false, message: opts.failSave };
      const old = rows.find((r) => r.id === id);
      if (old) { Object.assign(old, { name, kind: old.type === 'object' ? kind || old.kind : null, build: b ?? null, bti: t ?? null }); return { ok: true, value: id }; }
      if (!parent && type !== 'object') return { ok: false, message: 'Верхний уровень — только объект' };
      ins(parent, type, name, { id, kind: type === 'object' ? kind || 'other' : null, build: b ?? null, bti: t ?? null }); return { ok: true, value: id };
    },
    async removePlace(id: string) { calls.push('remove:' + id); const all = [byId(id), ...sub(id)]; grp++; all.forEach((r) => { r.deleted = true; r.group = grp; }); return { ok: true, value: all.length }; },
    async restorePlace(id: string) { calls.push('restore:' + id); const g = byId(id).group; const all = rows.filter((r) => r.deleted && r.group === g); all.forEach((r) => { r.deleted = false; }); return { ok: true, value: all.length }; },
    async nextBuildNo(id: string) { calls.push('nextno:' + id); return { ok: true, value: nextNo(objOf(byId(id))) }; },
    async movePlace(id: string, parent: string | null, before: string | null) {
      calls.push(`move:${id}:${parent}:${before}`);
      const r = byId(id); const old = live(r.parent); const i = old.findIndex((x) => x.id === id);
      const res = { changed: true, oldParentId: r.parent, oldBeforeId: old[i + 1] ? old[i + 1].id : null };
      const list = live(parent).filter((x) => x.id !== id); const at = before ? list.findIndex((x) => x.id === before) : -1;
      list.splice(at < 0 ? list.length : at, 0, r); r.parent = parent; list.forEach((x, k) => { x.order = k + 1; });
      return { ok: true, value: res };
    },
    async fillObject(p: FillParams) {
      calls.push(`fill:${p.sections}x${p.floors}x${p.apartmentsPerFloor}:${p.firstFloor}:${p.numbering}:${p.startNo}:${p.basement}:${p.roof}`);
      if (opts.fail) return fail<number>();
      for (let s = 1; s <= p.sections; s++) {
        const sid = ins(p.objectId, 'section', 'Секция ' + s);
        if (p.basement) ins(sid, 'floor', 'Подвал');
        for (let f = 1; f <= p.floors; f++) {
          const fid = ins(sid, 'floor', 'эт. ' + (p.firstFloor + f - 1));
          for (let a = 1; a <= p.apartmentsPerFloor; a++) {
            const no = p.startNo - 1 + (p.numbering === 'through' ? (s - 1) * p.floors * p.apartmentsPerFloor : 0) + (f - 1) * p.apartmentsPerFloor + a;
            ins(fid, 'apartment', 'кв. ' + no, { build: String(no) });
          }
        }
        if (p.roof) ins(sid, 'other', 'Кровля');
      }
      return { ok: true, value: fillNodeCount(p.sections, p.floors, p.apartmentsPerFloor, p.basement, p.roof) };
    },
    async addFloors(ids: string[], from: number, to: number, apf: number) {
      calls.push(`floors:${ids.join(',')}:${from}-${to}:${apf}`); let n = 0;
      for (const id of ids) { let no = nextNo(objOf(byId(id)));
        for (let f = from; f <= to; f++) { const fid = ins(id, 'floor', 'эт. ' + f); n++; for (let a = 0; a < apf; a++) { ins(fid, 'apartment', 'кв. ' + no, { build: String(no) }); no++; n++; } } }
      return { ok: true, value: n };
    },
    async copyPlace(src: string, id: string, name: string, target?: string) { calls.push(`copy:${src}:${name}` + (target ? ':' + target : '')); const s = byId(src); ins(target || s.parent, s.type, name, { id }); return { ok: true, value: id }; }
  } as unknown as ProjectsApi;
  return { api, calls, rows, ins, live };
}

function mount(api: ProjectsApi, project: ProjectCard = PROJECT) {
  const el: N = win.document.createElement('div'); win.document.body.appendChild(el);
  const root = createRoot(el);
  flushSync(() => root.render(createElement(ObjectsPlaces, { api, project, kinds: KINDS })));
  return { el, root };
}
const q = (el: N, id: string): N => el.querySelector(`[data-testid="${id}"]`);
const rowOf = (el: N, name: string): N => [...el.querySelectorAll('[data-node-id]')].find((n: N) => n.querySelector('.p2-tree__name b')?.textContent === name);
const openMenu = async (el: N, name: string, item: string) => {
  click(rowOf(el, name).querySelector('[data-testid="p2-tree-more"]')); await tick();
  click(rowOf(el, name).querySelector(`[data-item="${item}"]`)); await tick();
};

test('формулы: мастер = секции·(1 + подвал + кровля + этажи·(1 + квартиры)); сводка номеров; следующее название', () => {
  assert.equal(fillNodeCount(2, 9, 6, false, false), 2 * (1 + 9 * 7));
  assert.equal(fillNodeCount(1, 5, 4, true, true), 1 + 1 + 1 + 25);
  const base = { sections: '2', floors: '9', apf: '6', first: '1', numbering: 'through' as const, start: '1', basement: false, roof: false };
  assert.match(fillSummary(base).text, /квартир 108, квартиры № 1–108/);
  assert.match(fillSummary({ ...base, numbering: 'per_section' }).text, /в каждой секции № 1–54/);
  assert.equal(fillSummary({ ...base, floors: '0' }).ok, false);
  assert.equal(fillSummary({ ...base, sections: '40', floors: '30', apf: '10' }).ok, false, 'больше 5000 мест за раз');
  assert.equal(nextName([{ name: 'Секция 1' }, { name: 'Секция 2' }], 'Секция 1'), 'Секция 3');
  assert.equal(nextName([], 'Паркинг'), 'Паркинг (копия)');
});

test('пустой проект: подсказка и «+ Объект»; корень грузится один раз', async () => {
  const s = fakeServer(); const { el, root } = mount(s.api); await tick();
  assert.ok(q(el, 'op-empty').textContent.includes('+ Объект'));
  assert.ok(q(el, 'op-add-object'));
  assert.deepEqual(s.calls, ['list:null']);
  root.unmount();
});

test('«+ Объект» корпус с мастером: объект — верхним уровнем с id приложения, затем секции × этажи × квартиры; объект выбран, дерево видно', async () => {
  const s = fakeServer(); const { el, root } = mount(s.api); await tick();
  click(q(el, 'op-add-object')); await tick();
  assert.equal(q(el, 'op-kind').value, 'building'); assert.equal(q(el, 'op-name').value, 'Корпус 1');
  assert.equal(q(el, 'op-fill-now').checked, true, 'для корпуса мастер включён сразу');
  setValue(q(el, 'op-f-sections'), '2'); setValue(q(el, 'op-f-floors'), '3'); setValue(q(el, 'op-f-apf'), '4'); await tick();
  assert.match(q(el, 'op-fill-sum').textContent, /секций 2, этажей 6, квартир 24, квартиры № 1–24/);
  submit(q(el, 'op-new-form')); await tick(); await tick();
  assert.deepEqual(s.calls.filter((c) => !c.startsWith('list')), ['save:null:object:Корпус 1:building::', 'fill:2x3x4:1:through:1:false:false']);
  assert.match(s.rows[0].id, /^[0-9a-f-]{36}$/, 'id объекта создаёт приложение');
  assert.ok(q(el, 'op-notice').textContent.includes('мест создано: 32'));
  assert.equal(el.querySelectorAll('[data-testid="op-objects"] [data-object-id]').length, 1);
  assert.ok(el.querySelector('[data-testid="op-objects"] .is-on').textContent.includes('квартир 24'));
  assert.ok(rowOf(el, 'Секция 1') && rowOf(el, 'Секция 2'));
  click(rowOf(el, 'Секция 2').querySelector('[data-testid="p2-tree-toggle"]')); await tick();
  click(rowOf(el, 'эт. 1').querySelector('[data-testid="p2-tree-toggle"]')); await tick();
  assert.ok(rowOf(el, 'кв. 13'), 'сквозная нумерация: секция 2 начинается с 13');
  assert.match(rowOf(el, 'кв. 13').textContent, /стр\. № 13/);
  root.unmount();
});

test('мастер: больше 5000 мест — сводка красная, на сервер не уходит; паркинг — без мастера, только объект', async () => {
  const s = fakeServer(); const { el, root } = mount(s.api); await tick();
  click(q(el, 'op-add-object')); await tick();
  setValue(q(el, 'op-f-sections'), '40'); setValue(q(el, 'op-f-floors'), '30'); setValue(q(el, 'op-f-apf'), '10'); await tick();
  assert.ok(q(el, 'op-fill-sum').classList.contains('is-bad'));
  submit(q(el, 'op-new-form')); await tick();
  assert.deepEqual(s.calls, ['list:null'], 'ничего не создано');
  setValue(q(el, 'op-kind'), 'parking'); await tick();
  assert.equal(q(el, 'op-fill-now').checked, false, 'у паркинга мастер выключен');
  assert.equal(q(el, 'op-name').value, 'Паркинг');
  submit(q(el, 'op-new-form')); await tick();
  assert.deepEqual(s.calls.filter((c) => !c.startsWith('list')), ['save:null:object:Паркинг:parking::']);
  assert.ok(q(el, 'op-fill-open'), 'пустой объект можно заполнить позже');
  root.unmount();
});

test('«Добавить этажи» в две секции: номера квартир идут дальше по объекту', async () => {
  const s = fakeServer(); const o = s.ins(null, 'object', 'Корпус 1', { kind: 'building' });
  const s1 = s.ins(o, 'section', 'Секция 1'), s2 = s.ins(o, 'section', 'Секция 2');
  const { el, root } = mount(s.api); await tick(); await tick();
  await openMenu(el, 'Секция 1', 'floors');
  const form = q(el, 'op-floors-form');
  const boxes = [...form.querySelectorAll('input[name=sec]')];
  assert.deepEqual(boxes.map((b: N) => b.checked), [true, false], 'отмечена секция, из которой открыли');
  (boxes[1] as N).checked = true;
  form.elements.namedItem('from').value = '10'; form.elements.namedItem('to').value = '11'; form.elements.namedItem('apf').value = '2';
  submit(form); await tick(); await tick();
  assert.equal(s.calls.find((c) => c.startsWith('floors')), `floors:${s1},${s2}:10-11:2`);
  assert.equal(s.live(s2).length, 2);
  root.unmount();
});

test('«Дублировать рядом»: название по соседям, копия рядом без окна; «Отменить» удаляет копию', async () => {
  const s = fakeServer(); const o = s.ins(null, 'object', 'Корпус 1', { kind: 'building' });
  const s1 = s.ins(o, 'section', 'Секция 1'); s.ins(o, 'section', 'Секция 2');
  const { el, root } = mount(s.api); await tick(); await tick();
  await openMenu(el, 'Секция 1', 'dup'); await tick();
  assert.ok(s.calls.includes(`copy:${s1}:Секция 3`));
  assert.ok(rowOf(el, 'Секция 3'));
  assert.match(q(el, 'op-toast').textContent, /Скопировано: «Секция 3»/);
  click(q(el, 'op-undo')); await tick(); await tick();
  assert.ok(!rowOf(el, 'Секция 3'), 'отмена — копия удалена');
  root.unmount();
});

test('«Добавить другое…»: квартира с номерами внутрь этажа; карточка места; номера правятся в карточке', async () => {
  const s = fakeServer(); const o = s.ins(null, 'object', 'Корпус 1', { kind: 'building' });
  const sec = s.ins(o, 'section', 'Секция 1'); const fl = s.ins(sec, 'floor', 'эт. 1');
  const { el, root } = mount(s.api); await tick(); await tick();
  click(rowOf(el, 'Секция 1').querySelector('[data-testid="p2-tree-toggle"]')); await tick();
  await openMenu(el, 'эт. 1', 'add');
  assert.equal(q(el, 'op-type').value, 'apartment', 'под этажом подсказка — квартира');
  const f = q(el, 'op-add-form');
  f.elements.namedItem('name').value = 'кв. 7'; f.elements.namedItem('build_no').value = '7'; f.elements.namedItem('bti_no').value = '107';
  submit(f); await tick(); await tick();
  assert.ok(s.calls.includes(`save:${fl}:apartment:кв. 7::7:107`));
  const card = q(el, 'op-place');
  assert.ok(card, 'новое место выбрано — карточка открыта');
  assert.match(card.textContent, /Корпус 1 › Секция 1 › эт\. 1/);
  assert.equal(q(el, 'op-c-build').value, '7'); assert.equal(q(el, 'op-c-bti').value, '107');
  const bti = q(el, 'op-c-bti'); setValue(bti, '207'); bti.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true })); await tick(); await tick();
  assert.equal(s.rows.find((r) => r.name === 'кв. 7')!.bti, '207');
  assert.equal(s.rows.find((r) => r.name === 'кв. 7')!.build, '7', 'строительный номер не потерян');
  root.unmount();
});

test('«+» без окна: у секции — следующий этаж по образцу соседей, у этажа — квартира со следующим строительным номером объекта; «Отменить»', async () => {
  const s = fakeServer(); const o = s.ins(null, 'object', 'Корпус 1', { kind: 'building' });
  const sec = s.ins(o, 'section', 'Секция 1'); const f1 = s.ins(sec, 'floor', 'эт. 1'); s.ins(sec, 'floor', 'эт. 2');
  s.ins(f1, 'apartment', 'кв. 1', { build: '1' }); s.ins(f1, 'apartment', 'кв. 2', { build: '2' });
  const { el, root } = mount(s.api); await tick(); await tick();
  click(rowOf(el, 'Секция 1').querySelector('[data-testid="op-row-plus"]')); await tick(); await tick();
  assert.ok(s.calls.some((c) => c === `save:${sec}:floor:эт. 3:::`), 'этаж «эт. 3» — без окна (' + s.calls.filter((c) => c.startsWith('save')).join(';') + ')');
  assert.ok(!q(el, 'op-add'), 'окна нет');
  assert.ok(rowOf(el, 'эт. 3'), 'ветка раскрыта, новый этаж виден');
  assert.equal(q(el, 'op-place').querySelector('b').textContent, 'эт. 3', 'новое место выбрано');
  assert.match(q(el, 'op-toast').textContent, /Добавлено «эт\. 3»/);
  click(q(el, 'op-undo')); await tick(); await tick();
  assert.ok(!rowOf(el, 'эт. 3'), '«Отменить» удалило добавленное');
  click(rowOf(el, 'эт. 2').querySelector('[data-testid="op-row-plus"]')); await tick(); await tick();
  assert.ok(s.calls.some((c) => c === `save:${s.live(sec).find((r) => r.name === 'эт. 2')!.id}:apartment:кв. 3::3:`), 'квартира — следующий номер объекта: кв. 3');
  root.unmount();
});

test('название — в строке: двойной щелчок, Enter сохраняет; отказ сервера — под полем, ввод не теряется; Esc — отмена; «Отменить» возвращает', async () => {
  const s = fakeServer(); const o = s.ins(null, 'object', 'Корпус 1', { kind: 'building' });
  const sec = s.ins(o, 'section', 'Секция 1');
  const { el, root } = mount(s.api); await tick(); await tick();
  const dbl = (b: N) => b.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
  dbl(rowOf(el, 'Секция 1').querySelector('[data-testid="p2-tree-open"]')); await tick();
  const inp = q(el, 'op-rename'); assert.ok(inp, 'поле в строке');
  setValue(inp, 'Секция А'); await tick();
  inp.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await tick(); await tick();
  assert.equal(s.rows.find((r) => r.id === sec)!.name, 'Секция А');
  assert.ok(rowOf(el, 'Секция А') && !q(el, 'op-rename'));
  click(q(el, 'op-undo')); await tick(); await tick();
  assert.equal(s.rows.find((r) => r.id === sec)!.name, 'Секция 1', 'отмена вернула название');
  root.unmount();
  const s2 = fakeServer({ failSave: 'Место с таким названием уже есть на этом уровне' }); const o2 = s2.ins(null, 'object', 'Корпус 1', { kind: 'building' });
  s2.ins(o2, 'section', 'Секция 1');
  const m = mount(s2.api); await tick(); await tick();
  dbl(rowOf(m.el, 'Секция 1').querySelector('[data-testid="p2-tree-open"]')); await tick();
  setValue(q(m.el, 'op-rename'), 'Секция 2'); await tick();
  q(m.el, 'op-rename').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await tick(); await tick();
  assert.equal(q(m.el, 'op-rename-error').textContent, 'Место с таким названием уже есть на этом уровне');
  assert.equal(q(m.el, 'op-rename').value, 'Секция 2', 'ввод не потерян');
  q(m.el, 'op-rename').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick();
  assert.ok(!q(m.el, 'op-rename') && rowOf(m.el, 'Секция 1'), 'Esc — прежнее название');
  m.root.unmount();
});

test('«Выше / Ниже»: порядок соседей; у края — неактивно с причиной; «Отменить» возвращает', async () => {
  const s = fakeServer(); const o = s.ins(null, 'object', 'Корпус 1', { kind: 'building' });
  const a = s.ins(o, 'section', 'Секция 1'), b = s.ins(o, 'section', 'Секция 2'), c = s.ins(o, 'section', 'Секция 3');
  const { el, root } = mount(s.api); await tick(); await tick();
  const names = () => [...el.querySelectorAll('[data-testid="op-tree"] > ul > li .p2-tree__name b')].map((x: N) => x.textContent).join(',');
  click(rowOf(el, 'Секция 1').querySelector('[data-testid="p2-tree-more"]')); await tick();
  assert.equal(rowOf(el, 'Секция 1').querySelector('[data-item="up"]').disabled, true, 'первая — «Выше» неактивно');
  click(rowOf(el, 'Секция 1').querySelector('[data-item="down"]')); await tick(); await tick();
  assert.ok(s.calls.includes(`move:${a}:${o}:${c}`), 'ниже = встать перед «Секция 3»');
  assert.equal(names(), 'Секция 2,Секция 1,Секция 3');
  click(q(el, 'op-undo')); await tick(); await tick();
  assert.ok(s.calls.includes(`move:${a}:${o}:${b}`), 'отмена — обратно перед «Секция 2»');
  assert.equal(names(), 'Секция 1,Секция 2,Секция 3');
  root.unmount();
});

test('удалить ветку — сразу, с плашкой «Отменить»; отмена возвращает ветку; объект — с подтверждением', async () => {
  const s = fakeServer(); const o = s.ins(null, 'object', 'Корпус 1', { kind: 'building' });
  const sec = s.ins(o, 'section', 'Секция 1'); s.ins(sec, 'floor', 'эт. 1');
  const { el, root } = mount(s.api); await tick(); await tick();
  await openMenu(el, 'Секция 1', 'remove'); await tick();
  assert.ok(s.calls.includes('remove:' + sec), 'без окна');
  assert.ok(!rowOf(el, 'Секция 1'));
  assert.match(q(el, 'op-toast').textContent, /Удалено «Секция 1»/);
  click(q(el, 'op-undo')); await tick(); await tick();
  assert.ok(s.calls.includes('restore:' + sec));
  assert.ok(rowOf(el, 'Секция 1') && s.rows.every((r) => !r.deleted), 'ветка вернулась целиком');
  click(q(el, 'op-obj-more')); await tick();
  click(el.querySelector('[data-testid="op-obj-more-menu"] [data-item="remove"]')); await tick();
  assert.ok(!s.calls.includes('remove:' + o), 'объект — только после подтверждения');
  assert.match(q(el, 'op-remove').textContent, /вместе со всем, что внутри/);
  click(q(el, 'op-remove-go')); await tick(); await tick();
  assert.ok(s.calls.includes('remove:' + o));
  root.unmount();
});

test('без сети — правка недоступна с пояснением; связь вернулась — снова можно', async () => {
  const s = fakeServer(); const o = s.ins(null, 'object', 'Корпус 1', { kind: 'building' }); s.ins(o, 'section', 'Секция 1');
  const nav = globalThis.navigator as N; const desc = Object.getOwnPropertyDescriptor(nav, 'onLine');
  Object.defineProperty(nav, 'onLine', { configurable: true, get: () => false });
  const { el, root } = mount(s.api); await tick(); await tick();
  assert.ok(q(el, 'op-offline'));
  assert.ok(!q(el, 'op-add-object') && !el.querySelector('[data-testid="op-row-plus"]') && !el.querySelector('[data-testid="p2-tree-more"]'));
  Object.defineProperty(nav, 'onLine', { configurable: true, get: () => true });
  win.dispatchEvent(new win.Event('online')); await tick();
  assert.ok(!q(el, 'op-offline') && q(el, 'op-add-object') && el.querySelector('[data-testid="op-row-plus"]'));
  if (desc) Object.defineProperty(nav, 'onLine', desc); else delete nav.onLine;
  root.unmount();
});

test('без права, архив, Качество — только просмотр: нет «+ Объект», мастера и меню строк; у Качества — пометка', async () => {
  for (const p of [{ ...PROJECT, can_manage: false }, { ...PROJECT, archived_at: '2026-10-01' }, { ...PROJECT, places_led_by_quality: true }]) {
    const s = fakeServer(); const o = s.ins(null, 'object', 'Корпус 1', { kind: 'building' }); s.ins(o, 'section', 'Секция 1');
    const { el, root } = mount(s.api, p); await tick(); await tick();
    assert.ok(rowOf(el, 'Секция 1'), 'дерево видно');
    assert.ok(!q(el, 'op-add-object') && !q(el, 'op-add-inside') && !q(el, 'op-fill-open'));
    assert.ok(!el.querySelector('[data-testid="p2-tree-more"]') && !q(el, 'op-obj-more'));
    assert.equal(!!q(el, 'op-from-quality'), p.places_led_by_quality);
    root.unmount();
  }
});

test('отказ сервера показан текстом сервера', async () => {
  const s = fakeServer({ fail: 'Нет права управлять проектами' }); const { el, root } = mount(s.api); await tick();
  click(q(el, 'op-add-object')); await tick();
  setCheck(q(el, 'op-fill-now'), false); await tick();
  submit(q(el, 'op-new-form')); await tick();
  assert.equal(el.querySelector('[role="alert"]').textContent, 'Нет права управлять проектами');
  root.unmount();
});

test('копировать секцию → вставить в другой корпус: копия с названием, свободным там; «Отменить» удаляет копию', async () => {
  const s = fakeServer(); const k1 = s.ins(null, 'object', 'Корпус 1', { kind: 'building' }); const k2 = s.ins(null, 'object', 'Корпус 2', { kind: 'building' });
  const s1 = s.ins(k1, 'section', 'Секция 1'); s.ins(k2, 'section', 'Секция 1');
  const { el, root } = mount(s.api); await tick(); await tick();
  await openMenu(el, 'Секция 1', 'copy');
  assert.match(q(el, 'op-clip').textContent, /Скопировано: Секция 1/);
  click(el.querySelector(`[data-object-id="${k2}"]`)); await tick(); await tick();
  assert.equal(q(el, 'op-obj-paste').disabled, false);
  click(q(el, 'op-obj-paste')); await tick(); await tick();
  assert.ok(s.calls.includes(`copy:${s1}:Секция 2:${k2}`), 'копия в Корпус 2 под именем «Секция 2» (' + s.calls.filter((c) => c.startsWith('copy')).join(';') + ')');
  assert.ok(rowOf(el, 'Секция 2'));
  assert.ok(q(el, 'op-clip'), 'скопированное можно вставлять ещё раз');
  click(q(el, 'op-undo')); await tick(); await tick();
  assert.ok(!rowOf(el, 'Секция 2'), 'отмена удалила копию');
  root.unmount();
});

test('вырезать этаж → вставить в другую секцию того же корпуса = перенос; в другой корпус — нельзя, с причиной; «Отменить» возвращает', async () => {
  const s = fakeServer(); const k1 = s.ins(null, 'object', 'Корпус 1', { kind: 'building' }); const k2 = s.ins(null, 'object', 'Корпус 2', { kind: 'building' });
  const s1 = s.ins(k1, 'section', 'Секция 1'), s2 = s.ins(k1, 'section', 'Секция 2'); const f = s.ins(s1, 'floor', 'эт. 9'); s.ins(k2, 'section', 'Секция 1');
  const { el, root } = mount(s.api); await tick(); await tick();
  click(rowOf(el, 'Секция 1').querySelector('[data-testid="p2-tree-toggle"]')); await tick();
  await openMenu(el, 'эт. 9', 'cut');
  assert.match(q(el, 'op-clip').textContent, /Вырезано: эт\. 9/);
  click(rowOf(el, 'Секция 1').querySelector('[data-testid="p2-tree-more"]')); await tick();
  const same = rowOf(el, 'Секция 1').querySelector('[data-item="paste"]');
  assert.equal(same.disabled, true, 'в ту же секцию — неактивно');
  assert.match(same.textContent, /уже здесь/);
  click(rowOf(el, 'Секция 1').querySelector('[data-testid="p2-tree-more"]')); await tick();
  await openMenu(el, 'Секция 2', 'paste'); await tick();
  assert.ok(s.calls.includes(`move:${f}:${s2}:null`));
  assert.equal(s.rows.find((r) => r.id === f)!.parent, s2);
  assert.ok(!q(el, 'op-clip'), 'после переноса буфер пуст');
  click(q(el, 'op-undo')); await tick(); await tick();
  assert.equal(s.rows.find((r) => r.id === f)!.parent, s1, 'отмена — этаж на прежнем месте');
  // вырезать и выбрать другой корпус — вставка неактивна с причиной
  await openMenu(el, 'эт. 9', 'cut');
  click(el.querySelector(`[data-object-id="${k2}"]`)); await tick(); await tick();
  assert.equal(q(el, 'op-obj-paste').disabled, true);
  assert.match(q(el, 'op-obj-paste').title, /только внутри объекта; в другой объект — копировать и вставить/);
  await openMenu(el, 'Секция 1', 'paste');
  assert.ok(!s.calls.some((c) => c.startsWith(`move:${f}:`) && !c.includes(s2) && !c.includes(s1)), 'на сервер не ушло');
  root.unmount();
});

test('клавиши на выбранной строке: Ctrl+C, Ctrl+V (вставка внутрь выбранного), Ctrl+Z; в поле ввода — не перехватываются', async () => {
  const s = fakeServer(); const k1 = s.ins(null, 'object', 'Корпус 1', { kind: 'building' });
  const s1 = s.ins(k1, 'section', 'Секция 1'); const f = s.ins(s1, 'floor', 'эт. 1'); s.ins(k1, 'section', 'Секция 2');
  const { el, root } = mount(s.api); await tick(); await tick();
  const key = (target: N, k: string, code: string) => target.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, code, ctrlKey: true, bubbles: true }));
  click(rowOf(el, 'Секция 1').querySelector('[data-testid="p2-tree-toggle"]')); await tick();
  click(rowOf(el, 'эт. 1').querySelector('[data-testid="p2-tree-open"]')); await tick();
  key(rowOf(el, 'эт. 1').querySelector('[data-testid="p2-tree-open"]'), 'с', 'KeyC'); await tick();
  assert.match(q(el, 'op-clip').textContent, /Скопировано: эт\. 1/, 'русская раскладка: Ctrl+С тоже копирует');
  click(rowOf(el, 'Секция 2').querySelector('[data-testid="p2-tree-open"]')); await tick();
  key(rowOf(el, 'Секция 2').querySelector('[data-testid="p2-tree-open"]'), 'v', 'KeyV'); await tick(); await tick();
  assert.ok(s.calls.some((c) => c.startsWith(`copy:${f}:эт. 1:`)), 'Ctrl+V — копия в «Секция 2»');
  key(el.querySelector('[data-testid="op-root"]'), 'z', 'KeyZ'); await tick(); await tick();
  assert.equal(s.live(s.rows.find((r) => r.name === 'Секция 2')!.id).length, 0, 'Ctrl+Z — копия удалена');
  const bti = el.querySelector('input'); if (bti) { key(bti, 'v', 'KeyV'); await tick(); }
  root.unmount();
});

test('перетаскивание — только на широком экране: строки с ⋮⋮ на ПК, на телефоне нет', async () => {
  const s = fakeServer(); const k1 = s.ins(null, 'object', 'Корпус 1', { kind: 'building' }); s.ins(k1, 'section', 'Секция 1');
  const mm = (g.window as N).matchMedia;
  const as = (wide: boolean) => { (g.window as N).matchMedia = () => ({ matches: wide, addEventListener() {}, removeEventListener() {} }); };
  as(false);
  const narrow = mount(s.api); await tick(); await tick();
  assert.equal(narrow.el.querySelectorAll('[draggable="true"]').length, 0);
  assert.ok(!narrow.el.querySelector('.p2-tree__grip'));
  narrow.root.unmount();
  as(true);
  const w = mount(s.api); await tick(); await tick();
  assert.equal(w.el.querySelectorAll('[draggable="true"]').length, 1, 'секция берётся мышью');
  assert.ok(w.el.querySelector('.p2-tree__grip'));
  assert.ok(q(w.el, 'op-place-empty'), 'место под карточку есть до выбора');
  w.root.unmount();
  (g.window as N).matchMedia = mm;
});

test('шахматка: «Дерево / Шахматка» у корпуса с секциями; клетка → карточка; «+» в строке = то же, что в дереве; не по шаблону — подпись', async () => {
  const s = fakeServer(); const k1 = s.ins(null, 'object', 'Корпус 1', { kind: 'building' });
  const s1 = s.ins(k1, 'section', 'Секция 1'), s2 = s.ins(k1, 'section', 'Секция 2');
  const f11 = s.ins(s1, 'floor', 'эт. 1'); s.ins(s1, 'floor', 'эт. 2'); s.ins(s2, 'floor', 'эт. 1');
  s.ins(f11, 'apartment', 'кв. 1', { build: '1' }); s.ins(f11, 'apartment', 'кв. 2', { build: '2' });
  const k2 = s.ins(null, 'object', 'Паркинг', { kind: 'parking' }); s.ins(k2, 'other', 'Уровень -1');
  const { el, root } = mount(s.api); await tick(); await tick();
  click(q(el, 'op-view-chess')); await tick(); await tick(); await tick();
  const ch = q(el, 'op-chess'); assert.ok(ch, 'шахматка видна');
  assert.deepEqual([...ch.querySelectorAll('[role="rowheader"]')].map((x: N) => x.textContent), ['эт. 2', 'эт. 1'], 'верхний этаж сверху');
  assert.deepEqual([...ch.querySelectorAll('.op-chess__sec')].map((x: N) => x.textContent), ['Секция 1', 'Секция 2']);
  assert.equal(ch.querySelectorAll('.op-chess__none').length, 1, 'у Секции 2 нет эт. 2 — пустая клетка');
  click(ch.querySelector('[data-place-id]')); await tick();
  assert.equal(q(el, 'op-place').querySelector('b').textContent, 'кв. 1', 'клетка → карточка места');
  click(ch.querySelector(`[data-floor-id="${f11}"] [data-testid="op-chess-plus-place"]`)); await tick(); await tick(); await tick();
  assert.ok(s.calls.some((c) => c === `save:${f11}:apartment:кв. 3::3:`), '«+» в строке — следующее помещение (кв. 3)');
  assert.ok([...q(el, 'op-chess').querySelectorAll('[data-place-id] b')].some((x: N) => x.textContent === 'кв. 3'), 'клетка появилась');
  click(q(el, 'op-chess').querySelector('[data-testid="op-chess-plus-floor"]')); await tick(); await tick(); await tick();
  assert.ok(s.calls.some((c) => c === `save:${s1}:floor:эт. 3:::`), '«+ эт.» над секцией — следующий этаж');
  click(q(el, 'op-view-tree')); await tick();
  assert.ok(q(el, 'op-tree') && !q(el, 'op-chess'), 'обратно в дерево');
  click(el.querySelector(`[data-object-id="${k2}"]`)); await tick(); await tick();
  assert.ok(!q(el, 'op-view-chess'), 'у объекта без секций переключателя нет');
  root.unmount();
});
