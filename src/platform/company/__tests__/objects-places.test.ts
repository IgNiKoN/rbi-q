/// <reference types="node" />
/** «Объекты и места» (P2-0047, этап 4): объекты верхним уровнем, мастер объекта, «Добавить этажи», «Копировать секцию»,
 *  поштучно — исключения, номера помещения, удаление с подтверждением, только просмотр (нет права, архив, Качество). Подставной сервер. */
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

interface Row { id: string; parent: string | null; type: PlanNodeType; kind: string | null; name: string; order: number; build: string | null; bti: string | null; deleted: boolean }
/** Сервер в памяти: те же правила, что в 045 (верх — только объект, повтор id — та же запись, номера квартир по объекту). */
function fakeServer(opts: { fail?: string } = {}) {
  const rows: Row[] = []; const calls: string[] = []; let seq = 0;
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
      const old = rows.find((r) => r.id === id);
      if (old) { Object.assign(old, { name, kind: old.type === 'object' ? kind || old.kind : null, build: b ?? null, bti: t ?? null }); return { ok: true, value: id }; }
      if (!parent && type !== 'object') return { ok: false, message: 'Верхний уровень — только объект' };
      ins(parent, type, name, { id, kind: type === 'object' ? kind || 'other' : null, build: b ?? null, bti: t ?? null }); return { ok: true, value: id };
    },
    async removePlace(id: string) { calls.push('remove:' + id); const all = [byId(id), ...sub(id)]; all.forEach((r) => { r.deleted = true; }); return { ok: true, value: all.length }; },
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
    async copyPlace(src: string, id: string, name: string) { calls.push(`copy:${src}:${name}`); const s = byId(src); ins(s.parent, s.type, name, { id }); return { ok: true, value: id }; }
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

test('«Копировать секцию»: название по соседям, копия рядом', async () => {
  const s = fakeServer(); const o = s.ins(null, 'object', 'Корпус 1', { kind: 'building' });
  const s1 = s.ins(o, 'section', 'Секция 1'); s.ins(o, 'section', 'Секция 2');
  const { el, root } = mount(s.api); await tick(); await tick();
  await openMenu(el, 'Секция 1', 'copy');
  assert.equal(q(el, 'op-name').value, 'Секция 3');
  submit(q(el, 'op-copy-form')); await tick(); await tick();
  assert.ok(s.calls.includes(`copy:${s1}:Секция 3`));
  assert.ok(rowOf(el, 'Секция 3'));
  root.unmount();
});

test('поштучно: квартира с номерами внутрь этажа; карточка места; правка номеров', async () => {
  const s = fakeServer(); const o = s.ins(null, 'object', 'Корпус 1', { kind: 'building' });
  const sec = s.ins(o, 'section', 'Секция 1'); const fl = s.ins(sec, 'floor', 'эт. 1');
  const { el, root } = mount(s.api); await tick(); await tick();
  click(rowOf(el, 'Секция 1').querySelector('[data-testid="p2-tree-toggle"]')); await tick();
  await openMenu(el, 'эт. 1', 'add');
  assert.equal(q(el, 'op-type').value, 'apartment', 'под этажом подсказка — квартира');
  const f = q(el, 'op-add-form');
  f.elements.namedItem('name').value = 'кв. 7'; f.elements.namedItem('build_no').value = '7'; f.elements.namedItem('bti_no').value = '107';
  submit(f); await tick(); await tick();
  assert.ok(s.calls.includes(`save:${fl}:apartment:кв. 7:::7:107`.replace(':::', '::')));
  click(rowOf(el, 'кв. 7').querySelector('[data-testid="p2-tree-open"]')); await tick();
  const card = q(el, 'op-place');
  assert.match(card.textContent, /Корпус 1 › Секция 1 › эт\. 1/);
  assert.match(card.textContent, /Строительный номер7/); assert.match(card.textContent, /Номер БТИ107/);
  click(q(el, 'op-place-edit')); await tick();
  const e = q(el, 'op-edit-form'); e.elements.namedItem('bti_no').value = '207'; submit(e); await tick(); await tick();
  assert.equal(s.rows.find((r) => r.name === 'кв. 7')!.bti, '207');
  root.unmount();
});

test('удалить ветку — только после подтверждения', async () => {
  const s = fakeServer(); const o = s.ins(null, 'object', 'Корпус 1', { kind: 'building' });
  const sec = s.ins(o, 'section', 'Секция 1'); s.ins(sec, 'floor', 'эт. 1');
  const { el, root } = mount(s.api); await tick(); await tick();
  await openMenu(el, 'Секция 1', 'remove');
  assert.ok(!s.calls.some((c) => c.startsWith('remove')), 'без подтверждения ничего не удалено');
  assert.match(q(el, 'op-remove').textContent, /вместе со всем, что внутри/);
  click(q(el, 'op-remove-go')); await tick(); await tick();
  assert.ok(s.calls.includes('remove:' + sec));
  assert.ok(!rowOf(el, 'Секция 1'));
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
