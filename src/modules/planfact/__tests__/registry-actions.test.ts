/// <reference types="node" />
/** «ВОР → Позиции», «Выбрано: N» (P2-0019, этап 5): «Закрыть выбранные» (пачка = остатки выбранных, как обычный факт),
 *  «Закрыть через РП» (всё ждёт РП → «Ждёт подтверждения» +N), больше 500 — частями, выполненные не попадают в пачку,
 *  без права fact.create — кнопок нет, отказ сервера показан, «Выгрузить» — выбранные строки и видимые колонки. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/#/planfact/vor/positions' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
g.KeyboardEvent = win.KeyboardEvent;
const { createElement: h } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { PositionsRegistry } = await import('../vor/PositionsRegistry.ts');
const { positionRegistryActions } = await import('../vor/PositionActions.ts');
const { makeStand, standPositions } = await import('./registry-fake.ts');
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const T = '2026-10-24';
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await tick(); };
const click = (el: N) => flushSync(() => { el.click(); });
const qa = (box: N, sel: string): N[] => Array.from(box.querySelectorAll(sel));
function setValue(el: N, v: string): void {
  flushSync(() => {
    const proto = el.tagName === 'SELECT' ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
    el.dispatchEvent(new win.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

async function mountReg(stand: N, perms: string[], o: { archived?: boolean; saved?: N[] } = {}): Promise<N> {
  win.history.replaceState(null, '', '#/planfact/vor/positions?group=0');
  win.localStorage.clear();
  const save = (bytes: Uint8Array, name: string) => { o.saved?.push({ bytes, name }); };
  const box = win.document.createElement('div');
  win.document.body.appendChild(box);
  flushSync(() => createRoot(box as unknown as HTMLElement).render(h(PositionsRegistry, { fact: stand.fact, summary: stand.summary, projectId: 'pr1', companyId: 'c1', user: 'pto@x', today: T,
    ...positionRegistryActions(stand.fact, perms, 'pr1', 'c1', !!o.archived, save) })));
  await settle();
  return box;
}
const pick = (box: N, ids: string[]) => { for (const id of ids) click(box.querySelector(`tr[data-row="${id}"] [data-testid="p2-reg-select"]`)); };
const dialog = () => win.document.querySelector('[data-testid="vr-close-dialog"]') as N;
async function send(): Promise<void> {
  await settle();
  const d = dialog();
  setValue(d.querySelector('[data-testid="ft-close-brigade"]'), 'b1');
  click(d.querySelector('[data-testid="ft-close-send"]'));
  await settle(10);
}

test('«Закрыть через РП»: 3 позиции → пачка остатков с флагом, все ждут РП, «Ждёт подтверждения» +3; выполненная не попадает', async () => {
  const stand = makeStand(standPositions(1, 1, 5), { finish: '2026-12-31' });
  stand.add('p1-1-2', 40, stand.minus(T, 2));
  stand.add('p1-1-3', 100, stand.minus(T, 2));     // выполнена
  const before = (await stand.fact.pending('pr1') as N).value.length;
  const box = await mountReg(stand, ['planfact.fact.view', 'planfact.fact.create']);
  pick(box, ['p1-1-1', 'p1-1-2', 'p1-1-3', 'p1-1-4']);
  assert.match(box.querySelector('[data-testid="p2-reg-selected"]').textContent, /Выбрано: 4/);
  assert.match(box.querySelector('[data-testid="vr-done-skip"]').textContent, /выполненные \(1\)/);
  click(box.querySelector('[data-testid="vr-close-pm"]'));
  await settle();
  assert.ok(dialog(), 'окно закрытия — в body поверх страницы');
  assert.match(dialog().textContent, /Закрыть через РП: 3 поз\./);
  assert.ok(dialog().querySelector('[data-testid="ft-close-via-pm"]'));
  assert.deepEqual(qa(dialog(), '[data-testid="ft-close-qty"]').map((i) => i.value), ['100', '60', '100'], 'остатки');
  await send();
  const call = stand.calls.filter((c: N) => c.fn === 'addBatch').map((c: N) => c.args);
  assert.equal(call.length, 1);
  assert.equal(call[0].requireApproval, true);
  assert.deepEqual(call[0].items, [{ position_id: 'p1-1-1', qty: 100 }, { position_id: 'p1-1-2', qty: 60 }, { position_id: 'p1-1-4', qty: 100 }]);
  assert.equal((await stand.fact.pending('pr1') as N).value.length, before + 3, '«Ждёт подтверждения» +3');
  assert.equal(dialog(), null, 'окно закрылось');
  assert.equal(box.querySelector('[data-testid="vr-notice"]').textContent, 'Записано строк: 3, из них ждут подтверждения РП: 3');
  await settle();
  assert.equal(box.querySelector('[data-testid="p2-reg-selbar"]'), null, 'выбор снят');
  assert.equal(box.querySelector('tr[data-row="p1-1-1"] [data-testid="vr-status"]').textContent, 'Ждёт РП', 'список перечитан');
  assert.equal(box.querySelector('tr[data-row="p1-1-1"] td[data-col="fact"]').textContent, '0', 'в факт не вошло до решения РП');
});

test('«Закрыть выбранные» — как обычный факт (без флага): принято сразу; > 500 строк — частями по 500', async () => {
  const stand = makeStand(standPositions(3, 10, 20), { finish: '2026-12-31' });   // 600
  const box = await mountReg(stand, ['planfact.fact.view', 'planfact.fact.create']);
  click(box.querySelector('[data-testid="p2-reg-select-all"]'));
  assert.match(box.querySelector('[data-testid="p2-reg-selected"]').textContent, /Выбрано: 600/);
  click(box.querySelector('[data-testid="vr-close"]'));
  await send();
  const calls = stand.calls.filter((c: N) => c.fn === 'addBatch').map((c: N) => c.args);
  assert.deepEqual(calls.map((c: N) => c.items.length), [500, 100]);
  assert.ok(calls.every((c: N) => !('requireApproval' in c)), 'обычное закрытие — без флага (прежний вызов)');
  assert.equal(stand.entries.filter((e: N) => e.status === 'accepted').length, 600);
  assert.equal(box.querySelector('tr[data-row="p1-1-1"] [data-testid="vr-status"]').textContent, 'Выполнено');
});

test('без права fact.create и на архивном объекте — кнопок закрытия нет; выгрузка — есть', async () => {
  const stand = makeStand(standPositions(1, 1, 3));
  for (const [perms, archived] of [[['planfact.fact.view'], false], [['planfact.fact.view', 'planfact.fact.create'], true]] as [string[], boolean][]) {
    const box = await mountReg(stand, perms, { archived });
    pick(box, ['p1-1-1']);
    assert.equal(box.querySelector('[data-testid="vr-close"]'), null);
    assert.equal(box.querySelector('[data-testid="vr-close-pm"]'), null);
    assert.ok(box.querySelector('[data-testid="vr-export-selected"]'));
  }
});

test('отказ сервера показывается в окне; при ошибке второй части — сказано, сколько уже записано', async () => {
  const deny = makeStand(standPositions(1, 1, 3), { canCreate: false });
  let box = await mountReg(deny, ['planfact.fact.view', 'planfact.fact.create']);
  pick(box, ['p1-1-1']);
  click(box.querySelector('[data-testid="vr-close-pm"]'));
  await send();
  assert.match(dialog().querySelector('[role="alert"]').textContent, /Нет права вносить факт/);
  click(dialog().querySelector('[data-testid="ft-close-cancel"]'));
  await settle();

  const part = makeStand(standPositions(3, 10, 20), { failBatchAt: 2, batchError: 'Позиция не найдена в проекте' });
  box = await mountReg(part, ['planfact.fact.view', 'planfact.fact.create']);
  click(box.querySelector('[data-testid="p2-reg-select-all"]'));
  click(box.querySelector('[data-testid="vr-close"]'));
  await send();
  assert.match(dialog().querySelector('[role="alert"]').textContent, /Записано строк: 500 из 600; остальные не записаны: Позиция не найдена/);
  assert.match(box.querySelector('[data-testid="vr-close-notice"]').textContent, /500 из 600/);
  click(dialog().querySelector('[data-testid="ft-close-cancel"]'));
  await settle();
});

test('«Выгрузить в Excel»: выбранные строки и видимые колонки; «Выгрузить список» — весь отфильтрованный', async () => {
  const ExcelJS: N = (await import('exceljs')).default;
  const stand = makeStand(standPositions(1, 2, 3));
  const saved: N[] = [];
  const box = await mountReg(stand, ['planfact.fact.view'], { saved });
  pick(box, ['p1-1-2', 'p1-2-3']);
  click(box.querySelector('[data-testid="vr-export-selected"]'));
  await settle(20);
  assert.equal(saved.length, 1);
  assert.match(saved[0].name, /^Позиции ВОР \d\d\.\d\d\.\d{4}\.xlsx$/);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(saved[0].bytes);
  const ws = wb.worksheets[0];
  assert.deepEqual((ws.getRow(1).values as N[]).slice(1), ['Работа', 'Место', 'ЕИ', 'План', 'Факт', '%', 'Остаток', 'Статус']);
  assert.equal(ws.rowCount, 3);
  assert.deepEqual((ws.getRow(2).values as N[]).slice(1, 5), ['Работа 2', 'Корпус 1 · 1 этаж', 'шт.', 100]);
  assert.match(box.querySelector('[data-testid="vr-export-all"]').textContent, /\(6\)/);
  click(box.querySelector('[data-testid="vr-export-all"]'));
  await settle(20);
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(saved[1].bytes);
  assert.equal(wb2.worksheets[0].rowCount, 7);
});
