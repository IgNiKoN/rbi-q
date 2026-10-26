/// <reference types="node" />
/** «Факт → Журнал» (P2-0020, этап 3) на подставном сервере: период (по умолчанию 30 дней, «7 дней», свой; начало позже конца —
 *  без запроса), все статусы палитрой реестра, фильтры (корпус, работа, бригада, автор, статус), выгрузка в Excel — видимые колонки,
 *  список или выбранные; карточка — запись и история позиции; предел 2 000 — подсказка; отказ сервера; адрес #/planfact/fact/journal. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { makeFakeFact } from './fact-fake.ts';
import type { FakePos } from './fact-fake.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/#/planfact/fact/journal' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
g.HTMLInputElement = win.HTMLInputElement; g.KeyboardEvent = win.KeyboardEvent;
const { createElement: h } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { FactJournal, JOURNAL_COLUMNS, shiftDate, toJournalRow } = await import('../fact/FactJournal.ts');
const { canonicalHash, factSubFromHash, FACT_SUBS } = await import('../PlanfactApp.ts');
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const tick = (): Promise<void> => settle();
const TODAY = '2026-10-24';

const POS: FakePos[] = [
  { id: 'a5', ancestors: [], location_id: 'f5', location_path: 'Корпус 1 · 5 этаж', location_type: 'floor', work: 'Штукатурка стен', unit: 'м²', plan: 100 },
  { id: 'b6', ancestors: [], location_id: 'g6', location_path: 'Корпус 2 · 6 этаж', location_type: 'floor', work: 'Стяжка пола', unit: 'м²', plan: 100 }];

function stand(opts: { failJournal?: boolean } = {}) {
  const f = makeFakeFact(POS);
  const add = (id: string, pos: string, qty: number, date: string, status: string, by: string, brigade: string, extra: Record<string, unknown> = {}) => f.entries.push({
    id, position_id: pos, status, qty, work_date: date, brigade_name: brigade, workers: 3, man_hours: 24, note: null, corrects_id: null, correction_reason: null, batch_id: null,
    created_by_email: by, created_at: `${date}T08:00:00Z`, decided_by_email: null, decided_at: null, decision_note: null, ...extra } as N);
  add('j1', 'a5', 10, '2026-10-24', 'accepted', 'ivanov@test.invalid', 'Иванов');
  add('j2', 'a5', 120, '2026-10-23', 'pending_approval', 'petrov@test.invalid', 'Петров', { note: 'Закрытие через РП' });
  add('j3', 'b6', 30, '2026-10-20', 'rejected', 'ivanov@test.invalid', 'Иванов', { decided_by_email: 'pm@test.invalid', decided_at: '2026-10-21T09:00:00Z', decision_note: 'нет актов' });
  add('j4', 'b6', 15, '2026-10-01', 'superseded', 'petrov@test.invalid', 'Петров', { decided_by_email: 'pm@test.invalid', decided_at: '2026-10-02T09:00:00Z', decision_note: 'перемерили' });
  add('j5', 'b6', 12, '2026-10-01', 'accepted', 'petrov@test.invalid', 'Петров', { corrects_id: 'j4', correction_reason: 'перемерили' });
  add('j6', 'a5', 5, '2026-09-01', 'accepted', 'ivanov@test.invalid', 'Иванов');
  if (opts.failJournal) f.api.journal = async () => ({ ok: false, message: 'Нет права видеть факт' });
  return f;
}
async function mount(el: N): Promise<N> {
  const box = win.document.createElement('div');
  win.document.body.appendChild(box);
  flushSync(() => createRoot(box as unknown as HTMLElement).render(el));
  await tick(); await tick();
  return box;
}
const click = (el: N): void => flushSync(() => { el.click(); });
const qa = (box: N, sel: string): N[] => Array.from(box.querySelectorAll(sel));
const rowIds = (box: N): string[] => qa(box, '[data-testid="fj-table"] tr[data-row]').map((r) => r.getAttribute('data-row'));
function typeIn(input: N, value: string): void {
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
}
const journal = (f: ReturnType<typeof stand>, extra: Record<string, unknown> = {}) =>
  h(FactJournal, { api: f.api, projectId: 'pr1', companyId: 'c1', user: 'pto@test.invalid', today: TODAY, ...extra } as N);
async function filterBy(box: N, filter: string, value: string): Promise<void> {
  click(box.querySelector('[data-testid="p2-reg-filter"]'));
  click(box.querySelector(`[data-filter="${filter}"] [data-value="${value}"]`));
  click(box.querySelector('[data-testid="p2-reg-panel-apply"]'));
  await tick();
}
const journalCalls = (f: ReturnType<typeof stand>) => f.calls.filter((c) => c.fn === 'journal').map((c) => c.args);

test('период: по умолчанию 30 дней (запрос с границами и пределом 2 000), «7 дней», свой; начало позже конца — без запроса', async () => {
  win.history.replaceState(null, '', '#/planfact/fact/journal');
  const f = stand();
  const box = await mount(journal(f));
  assert.deepEqual(journalCalls(f)[0], { from: '2026-09-25', to: TODAY, limit: 2000 });
  assert.deepEqual(rowIds(box).sort(), ['j1', 'j2', 'j3', 'j4', 'j5'], 'за 30 дней (с 25.09) — без записи 1 сентября');
  assert.equal(box.querySelector('[data-testid="fj-from"]').value, '2026-09-25');
  click(box.querySelector('[data-testid="fj-7"]')); await tick();
  assert.deepEqual(journalCalls(f).slice(-1)[0], { from: '2026-10-18', to: TODAY, limit: 2000 });
  typeIn(box.querySelector('[data-testid="fj-from"]'), '2026-09-01'); await tick();
  click(box.querySelector('[data-testid="fj-apply"]')); await tick();
  assert.deepEqual(rowIds(box).sort(), ['j1', 'j2', 'j3', 'j4', 'j5', 'j6']);
  const n = journalCalls(f).length;
  typeIn(box.querySelector('[data-testid="fj-from"]'), '2026-10-25'); await tick();
  click(box.querySelector('[data-testid="fj-apply"]')); await tick();
  assert.equal(journalCalls(f).length, n, 'запроса нет');
  assert.match(box.querySelector('[data-testid="fj-error"]').textContent, /Начало периода позже конца/);
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
});

test('статусы палитрой, группы по корпусу со счётчиками, фильтры статус / автор / корпус / бригада / работа', async () => {
  const f = stand();
  const box = await mount(journal(f));
  typeIn(box.querySelector('[data-testid="fj-from"]'), '2026-09-01'); await tick();
  click(box.querySelector('[data-testid="fj-apply"]')); await tick();
  const st = (id: string) => box.querySelector(`tr[data-row="${id}"] [data-testid="fj-status"]`);
  assert.deepEqual(['j1', 'j2', 'j3', 'j4'].map((id) => [st(id).textContent, st(id).className.match(/--(\w+)/)?.[1]]),
    [['Принято', 'green'], ['Ждёт РП', 'blue'], ['Отклонено', 'red'], ['Заменено', 'grey']]);
  assert.match(box.querySelector('tr[data-row="j3"] [data-col="decision"]').textContent, /pm@test\.invalid: нет актов/);
  assert.deepEqual(qa(box, '[data-testid="p2-reg-group"] b').map((b) => b.textContent), ['Корпус 1', 'Корпус 2']);
  assert.ok(qa(box, '[data-testid="p2-reg-count"]').length >= 4, 'мини-счётчики статусов');
  await filterBy(box, 'status', 'accepted');
  assert.deepEqual(rowIds(box).sort(), ['j1', 'j5', 'j6']);
  await filterBy(box, 'author', 'petrov@test.invalid');
  assert.deepEqual(rowIds(box), ['j5'], 'статус И автор');
  assert.match(win.location.hash, /^#\/planfact\/fact\/journal\?f\.author=.*&f\.status=accepted$/, 'вид — в адресе');
  click(box.querySelector('[data-testid="p2-reg-reset"]')); await tick();
  await filterBy(box, 'corp', 'Корпус 2');
  assert.deepEqual(rowIds(box).sort(), ['j3', 'j4', 'j5']);
  click(box.querySelector('[data-testid="p2-reg-reset"]')); await tick();
  await filterBy(box, 'brigade', 'Иванов');
  assert.deepEqual(rowIds(box).sort(), ['j1', 'j3', 'j6']);
  click(box.querySelector('[data-testid="p2-reg-reset"]')); await tick();
  await filterBy(box, 'work', 'Стяжка пола');
  assert.deepEqual(rowIds(box).sort(), ['j3', 'j4', 'j5']);
  win.history.replaceState(null, '', '#/planfact/fact/journal');
});

test('выгрузка в Excel: видимые колонки, отфильтрованный список и выбранные (файл читается ExcelJS)', async () => {
  const ExcelJS: N = (await import('exceljs')).default;
  const files: { bytes: Uint8Array; name: string }[] = [];
  const f = stand();
  const box = await mount(journal(f, { save: (bytes: Uint8Array, name: string) => files.push({ bytes, name }) }));
  await filterBy(box, 'status', 'pending_approval');
  assert.equal(box.querySelector('[data-testid="fj-export-all"]').textContent, 'Выгрузить список в Excel (1)');
  click(box.querySelector('[data-testid="fj-export-all"]')); await tick();
  assert.equal(files.length, 1);
  assert.match(files[0].name, /^Журнал факта \d\d\.\d\d\.\d{4}\.xlsx$/);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(files[0].bytes);
  const vals = (i: number) => (wb.worksheets[0].getRow(i).values as N[]).slice(1);
  assert.deepEqual(vals(1), JOURNAL_COLUMNS.filter((c) => !c.hidden).map((c) => c.label));
  assert.deepEqual(vals(2).slice(0, 6), ['Штукатурка стен', 'Корпус 1 · 5 этаж', '2026-10-23', 120, 'Ждёт РП', 'Петров']);
  assert.equal(wb.worksheets[0].rowCount, 2);
  click(box.querySelector('[data-testid="p2-reg-reset"]')); await tick();
  click(box.querySelector('tr[data-row="j1"] [data-testid="p2-reg-select"]'));
  click(box.querySelector('tr[data-row="j3"] [data-testid="p2-reg-select"]'));
  click(box.querySelector('[data-testid="fj-export-selected"]')); await tick();
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(files[1].bytes);
  assert.equal(wb2.worksheets[0].rowCount, 3, 'заголовок и 2 выбранные');
});

test('карточка: запись (люди, чел.-ч, решение РП с причиной) и история позиции', async () => {
  const f = stand();
  const box = await mount(journal(f));
  click(box.querySelector('tr[data-row="j3"] [data-testid="p2-reg-open"]')); await tick();
  assert.equal(box.querySelector('[data-testid="fj-card-status"]').textContent, 'Отклонено');
  const nums = box.querySelector('[data-testid="fj-card-nums"]').textContent;
  for (const s of ['30 м²', '20.10.2026', 'Иванов', 'Люди3', 'Чел.-ч24', 'pm@test.invalid', 'Причинанет актов']) assert.ok(nums.includes(s), s);
  assert.ok(f.calls.some((c) => c.fn === 'history' && c.args === 'b6'), 'история позиции — pf_fact_history');
  assert.ok(box.querySelector('[data-testid="p2-side"] [data-testid="p2-history"]'));
});

test('предел 2 000 — подсказка сузить период; отказ сервера показан', async () => {
  const f = stand();
  const real = f.api.journal;
  f.api.journal = async (...a: Parameters<typeof real>) => {
    const r = await real(...a);
    return r.ok ? { ok: true, value: Array.from({ length: 2000 }, (_, i) => ({ ...r.value[0], id: 'z' + i })) } : r;
  };
  const box = await mount(journal(f));
  assert.match(box.querySelector('[data-testid="fj-limit"]').textContent, /последние 2\s000/);
  const box2 = await mount(journal(stand({ failJournal: true })));
  assert.match(box2.querySelector('[data-testid="fj-error"]').textContent, /Нет права видеть факт/);
  assert.match(box2.textContent, /За выбранный период записей факта нет/);
});

test('строка журнала: корпус, автор, исправление', () => {
  const r = toJournalRow({ id: 'x', position_id: 'p', location_path: 'Корпус 7 · 1 этаж', work_name: 'W', unit_code: 'м', qty: 1, work_date: TODAY, status: 'accepted',
    brigade_name: 'Б', workers: null, man_hours: null, note: null, corrects_id: 'y', correction_reason: null, batch_id: null, created_by_email: null,
    created_at: TODAY + 'T08:00:00Z', decided_by_email: null, decided_at: null, decision_note: null });
  assert.deepEqual([r.corp, r.author, r.correction, r.decidedBy], ['Корпус 7', '—', 'исправление', '']);
});

test('адрес #/planfact/fact/journal[?вид] — подвкладка «Журнал» (без права подтверждения тоже)', () => {
  const all = { company: true, estimate: true, ks2: true, fact: true, brigades: true };
  assert.equal(factSubFromHash('#/planfact/fact/journal'), 'journal');
  assert.equal(factSubFromHash('#/planfact/fact/journal?f.status=accepted'), 'journal');
  assert.equal(canonicalHash('#/planfact/fact/journal?f.status=accepted', all), null);
  assert.equal(canonicalHash('#/planfact/fact/journalx', all), '#/planfact/fact');
  assert.equal(FACT_SUBS.find((t) => t.id === 'journal')?.approve, undefined, 'вкладка для всех с fact.view');
});

test('P2-0022: запись «за период» — в журнале «за период dd.mm–dd.mm», в карточке «с — по»; запись за день — дата', async () => {
  const f = stand();
  f.entries.push({ ...f.entries[0], id: 'jp', qty: 28, work_date: '2026-10-24', period_from: '2026-10-11', created_at: '2026-10-24T09:00:00Z' } as N);
  const box = await mount(journal(f));
  const cellOf = (row: string) => box.querySelector(`[data-testid="fj-table"] tr[data-row="${row}"] [data-col="date"]`) || box.querySelector(`[data-testid="fj-table"] tr[data-row="${row}"]`);
  assert.match(cellOf('jp').textContent, /за период 11\.10–24\.10/);
  assert.doesNotMatch(cellOf('j1').textContent, /за период/);
  click(box.querySelector('tr[data-row="jp"] [data-testid="p2-reg-open"]')); await tick();
  assert.ok(box.querySelector('[data-testid="fj-card-nums"]').textContent.includes('11.10.2026 — 24.10.2026'));
});
