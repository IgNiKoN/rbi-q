/// <reference types="node" />
/** Контрагенты (P2-0015): модель (проверка ввода, строка реквизитов) и экран «Компания → Контрагенты». Подставной API, DOM — happy-dom. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { counterpartyProblem, cleanRequisites, requisitesLine, kindLabels } from '../counterparties.ts';
import type { Counterparty, CounterpartyDraft } from '../counterparties.ts';
import type { CoreApi, CompanyAccess } from '../core.service.ts';
import type { Result } from '../../company/company.service.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
// Глобалы нужны ДО загрузки react-dom (иначе React не слушает событие input у полей) — поэтому динамический import.
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { CounterpartiesTab, matchCounterparty } = await import('../../company/CounterpartiesTab.ts');
const { tabFromHash } = await import('../../company/CompanyApp.ts');
const { auditText } = await import('../../company/CompanyAudit.ts');
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const click = (b: N) => b.dispatchEvent(new win.Event('click', { bubbles: true }));
const submit = (f: N) => f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
function typeIn(el: N, v: string): void {
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, v); el.dispatchEvent(new win.Event('input', { bubbles: true }));
}

const draft = (p: Partial<CounterpartyDraft> = {}): CounterpartyDraft => ({ name: 'ООО Заказчик', inn: '7701234567', kpp: '', kinds: ['customer'], requisites: {}, ...p });

test('модель: проверка ввода — как на сервере', () => {
  assert.equal(counterpartyProblem(draft()), '');
  assert.equal(counterpartyProblem(draft({ inn: '7701 234 567' })), '', 'пробелы в ИНН допустимы');
  assert.equal(counterpartyProblem(draft({ inn: '770200000012' })), '', 'ИП — 12 цифр');
  assert.match(counterpartyProblem(draft({ name: '  ' })), /название/);
  assert.match(counterpartyProblem(draft({ inn: '12345' })), /ИНН/);
  assert.match(counterpartyProblem(draft({ kpp: '12' })), /КПП/);
  assert.equal(counterpartyProblem(draft({ kpp: '7701ab001' })), '', 'КПП с буквами (причина постановки) — можно');
  assert.match(counterpartyProblem(draft({ kinds: [] })), /заказчик/);
});

test('модель: реквизиты без пустых полей и строка для документов', () => {
  assert.deepEqual(cleanRequisites({ address: ' Москва ', phone: '', bank: '  ' }), { address: 'Москва' });
  const c = { name: 'ООО Заказчик', inn: '7701234567', kpp: '770101001',
    requisites: { address: 'г. Москва, ул. 1', phone: '+7 495 000', account: '40702', bank: 'ПАО Банк', bik: '044525' } };
  assert.equal(requisitesLine(c), 'ООО Заказчик, ИНН 7701234567, КПП 770101001, г. Москва, ул. 1, тел. +7 495 000, р/с 40702 в ПАО Банк БИК 044525');
  assert.equal(requisitesLine({ name: 'ИП Иванов', inn: '770200000012', kpp: null, requisites: {} }), 'ИП Иванов, ИНН 770200000012');
  assert.equal(kindLabels(['supplier', 'customer']), 'Заказчик, Поставщик');
});

test('адрес вкладки: #/settings/company/counterparties → «Контрагенты»', () => {
  assert.equal(tabFromHash('#/settings/company/counterparties'), 'counterparties');
  assert.equal(tabFromHash('#/settings/company/xxx'), 'roles');
});

test('журнал компании: записи о контрагентах — по-русски', () => {
  const base = { at: '', actor_email: null, record_id: 'x', subject_email: null, table_name: 'counterparties' };
  assert.equal(auditText({ ...base, action: 'INSERT', old_data: null, new_data: { name: 'ООО А', inn: '7701234567' } }), 'Добавлен контрагент «ООО А», ИНН 7701234567');
  assert.equal(auditText({ ...base, action: 'UPDATE', old_data: { name: 'ООО А', archived: false }, new_data: { name: 'ООО А', archived: true } }), 'Контрагент «ООО А» перенесён в архив');
  assert.equal(auditText({ ...base, action: 'UPDATE', old_data: { name: 'ООО', archived: false }, new_data: { name: 'ООО А', archived: false } }), 'Изменён контрагент «ООО А»');
});

const cp = (id: string, name: string, inn: string, p: Partial<Counterparty> = {}): Counterparty =>
  ({ id, name, inn, kpp: null, kinds: ['customer'], requisites: {}, archived_at: null, updated_at: '', ...p });

test('поиск: по части названия или цифрам ИНН', () => {
  const c = cp('1', 'ООО «Заказчик»', '7701234567');
  assert.ok(matchCounterparty(c, 'заказ'));
  assert.ok(matchCounterparty(c, '7701 23'));
  assert.ok(!matchCounterparty(c, 'поставщик'));
  assert.ok(matchCounterparty(c, ''));
});

function fakeCore(canManage: boolean, draftRow = false) {
  const log: string[] = [];
  let list: Counterparty[] = [cp('k1', 'ООО Заказчик', '7701234567'), cp('k2', 'ИП Поставщик', '770200000012', { kinds: ['supplier'] })];
  if (draftRow) list = [...list, { ...cp('k9', 'ООО Новострой', ''), inn: null, kinds: ['contractor'], draft: true }];
  const access: CompanyAccess = { company_id: 'c1', company_name: 'Альфа', can_manage_projects: canManage, can_manage_units: canManage,
    can_manage_roles: canManage, can_manage_counterparties: canManage };
  const api: CoreApi = {
    myAccess: async () => [access],
    listCounterparties: async (_c, arch) => list.filter((x) => arch || !x.archived_at),
    saveCounterparty: async (_c, id, d): Promise<Result<string>> => {
      log.push(`save ${id ?? 'new'} ${d.name} ${d.inn} ${d.kinds.join('+')} ${JSON.stringify(d.requisites)}`);
      if (list.some((x) => x.inn === d.inn.replace(/\s/g, '') && x.id !== id)) return { ok: false, message: 'Контрагент с таким ИНН уже есть: ООО Заказчик' };
      if (id) list = list.map((x) => (x.id === id ? { ...x, name: d.name, kinds: d.kinds, requisites: d.requisites } : x));
      else list = [...list, cp('k3', d.name, d.inn, { kinds: d.kinds, requisites: d.requisites })];
      return { ok: true, value: id || 'k3' };
    },
    archiveCounterparty: async (id, a): Promise<Result> => {
      log.push(`archive ${id} ${a}`);
      list = list.map((x) => (x.id === id ? { ...x, archived_at: a ? '2026-10-23' : null } : x)); return { ok: true, value: null };
    },
    projectCounterparties: async () => ({ customer: null, general_contractor: null }),
    setProjectCounterparties: async (): Promise<Result> => ({ ok: true, value: null })
  };
  return { api, log };
}

async function render(canManage: boolean, draftRow = false) {
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const f = fakeCore(canManage, draftRow);
  const root = createRoot(el as unknown as HTMLElement);
  flushSync(() => root.render(createElement(CounterpartiesTab, { core: f.api, companyId: 'c1' })));
  await settle();
  return { el: el as N, ...f, root };
}

test('экран: список, добавить, ошибка ввода — без вызова сервера, дубль ИНН — текст сервера', async () => {
  const { el, log, root } = await render(true);
  assert.equal(el.querySelectorAll('.cp-row').length, 2);
  assert.match(el.querySelector('[data-cp-id="k1"]').textContent, /ООО Заказчик.*ИНН 7701234567.*Заказчик/);
  click(el.querySelector('[data-testid="cp-add"]')); await settle();
  const form = el.querySelector('[data-testid="cp-form"]');
  typeIn(form.querySelector('input[name="name"]'), 'ООО Новый'); typeIn(form.querySelector('input[name="inn"]'), '123'); await settle();
  submit(form); await settle();
  assert.match(el.querySelector('[role="alert"]').textContent, /ИНН/);
  assert.equal(log.length, 0, 'неверный ИНН — сервер не вызывается');
  typeIn(form.querySelector('input[name="inn"]'), '7701234567');
  form.querySelector('[data-kind="general_contractor"]').click(); await settle();
  submit(form); await settle();
  assert.match(el.querySelector('[role="alert"]').textContent, /таким ИНН уже есть/);
  typeIn(el.querySelector('input[name="inn"]'), '7709999999');
  typeIn(el.querySelector('input[name="address"]'), 'г. Москва'); await settle();
  submit(el.querySelector('[data-testid="cp-form"]')); await settle();
  assert.equal(log[1], 'save new ООО Новый 7709999999 general_contractor {"address":"г. Москва"}');
  assert.match(el.querySelector('[role="status"]').textContent, /добавлен/);
  assert.equal(el.querySelectorAll('.cp-row').length, 3);
  assert.equal(el.querySelector('[data-testid="cp-form"]'), null, 'форма закрыта после сохранения');
  root.unmount();
});

test('экран: правка, поиск, архив и «показать архив»', async () => {
  const { el, log, root } = await render(true);
  click(el.querySelector('[data-cp-id="k1"]')); await settle();
  assert.equal(el.querySelector('input[name="name"]').value, 'ООО Заказчик');
  typeIn(el.querySelector('input[name="signer"]'), 'Директор Иванов И. И.'); await settle();
  submit(el.querySelector('[data-testid="cp-form"]')); await settle();
  assert.equal(log[0], 'save k1 ООО Заказчик 7701234567 customer {"signer":"Директор Иванов И. И."}');
  typeIn(el.querySelector('[data-testid="cp-search"]'), '7702'); await settle();
  assert.equal(el.querySelectorAll('.cp-row').length, 1);
  typeIn(el.querySelector('[data-testid="cp-search"]'), ''); await settle();
  click(el.querySelector('[data-cp-id="k2"]')); await settle();
  click(el.querySelector('[data-testid="cp-archive"]')); await settle();
  assert.equal(log[1], 'archive k2 true');
  assert.equal(el.querySelectorAll('.cp-row').length, 1, 'архивный скрыт');
  el.querySelector('[data-testid="cp-show-archived"]').click(); await settle();
  assert.equal(el.querySelectorAll('.cp-row').length, 2);
  assert.match(el.querySelector('[data-cp-id="k2"]').textContent, /архив/);
  click(el.querySelector('[data-cp-id="k2"]')); await settle();
  assert.equal(el.querySelector('[data-testid="cp-archive"]').textContent, 'Вернуть из архива');
  root.unmount();
});

test('экран: без права — только просмотр (нет «Добавить», поля заблокированы, нет «Сохранить»)', async () => {
  const { el, root } = await render(false);
  assert.ok(el.querySelector('[data-testid="cp-readonly"]'));
  assert.equal(el.querySelector('[data-testid="cp-add"]'), null);
  click(el.querySelector('[data-cp-id="k1"]')); await settle();
  assert.ok(el.querySelector('input[name="name"]').disabled);
  assert.equal(el.querySelector('[data-testid="cp-save"]'), null);
  assert.equal(el.querySelector('[data-testid="cp-archive"]'), null);
  root.unmount();
});

test('P2-0016: подрядчик из Качества без ИНН — «из Качества · нужен ИНН», поиск не падает, в форме ИНН пустой', async () => {
  const { el, root } = await render(true, true);
  const row = Array.from(el.querySelectorAll('.cp-row') as N[]).find((r: N) => r.textContent.includes('Новострой')) as N;
  assert.ok(row.querySelector('[data-testid=cp-draft]'));
  assert.match(row.textContent, /ИНН не указан/);
  assert.ok(!matchCounterparty({ ...cp('x', 'Новострой', ''), inn: null }, '7701'));
  flushSync(() => row.click());
  await settle();
  assert.equal((el.querySelector('input[name=inn]') as N).value, '');
  root.unmount();
});
