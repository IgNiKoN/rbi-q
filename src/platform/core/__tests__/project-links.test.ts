/// <reference types="node" />
/** Объект ↔ контрагенты (P2-0015, этап 4): подстановка реквизитов заказчика в КС-2 и выбор заказчика/генподрядчика в «Объектах». */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import type { CompanyAccess, CoreApi } from '../core.service.ts';
import type { Counterparty, CounterpartyCard } from '../counterparties.ts';
import type { ProjectItem, ProjectsApi } from '../projects.service.ts';
import type { Result } from '../../company/company.service.ts';
import type { Ks2ActData } from '../../../modules/planfact/ks2/ks2.service.ts';
import { actHeader } from '../../../modules/planfact/ks2/model.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
// Глобалы нужны ДО загрузки react-dom (иначе React не слушает событие input у полей) — поэтому динамический import.
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { ProjectsTab } = await import('../../company/ProjectsTab.ts');

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const click = (b: N) => b.dispatchEvent(new win.Event('click', { bubbles: true }));
const submit = (f: N) => f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));

const CARD: CounterpartyCard = { id: 'k1', name: 'ООО Заказчик', inn: '7701234567', kpp: '770101001', kinds: ['customer'],
  requisites: { address: 'г. Москва', signer: 'Директор Иванов И. И.' }, archived: false };
function act(p: Partial<Ks2ActData> = {}): Ks2ActData {
  return { act: { id: 'a1', project_id: 'p1', act_no: '3', act_date: '2026-10-23', period_from: '2026-10-01', period_to: '2026-10-23', status: 'draft',
    kp_revision_id: 'kp', annul_reason: null }, requisites: {}, proposal: [], last_revision: null, customer: CARD, ...p };
}

test('КС-2: пустые реквизиты заказчика — из карточки заказчика объекта (строка и подписант)', () => {
  const h = actHeader(act());
  assert.equal(h.customer, 'ООО Заказчик, ИНН 7701234567, КПП 770101001, г. Москва');
  assert.equal(h.customer_signer, 'Директор Иванов И. И.');
  assert.equal(h.act_no, '3', 'номер — из акта');
});

test('КС-2: заполненное вручную сильнее карточки; без заказчика у объекта — как раньше', () => {
  const h = actHeader(act({ requisites: { customer: 'ЗАО Ручной', customer_signer: 'Петров' } }));
  assert.equal(h.customer, 'ЗАО Ручной');
  assert.equal(h.customer_signer, 'Петров');
  const h2 = actHeader(act({ customer: null, requisites: { contractor: 'Мы' } }));
  assert.equal(h2.customer, ''); assert.equal(h2.contractor, 'Мы');
});

test('КС-2: у акта уже есть редакция — шапка из редакции, карточка не подмешивается', () => {
  const header = { investor: '', customer: '', contractor: '', construction: '', object: '', contract_no: '', contract_date: '',
    act_no: '3', act_date: '', period_from: '', period_to: '', customer_signer: '', contractor_signer: '' };
  const h = actHeader(act({ last_revision: { id: 'r1', revision_no: 1, snapshot: { header, rows: [] }, total: 0, created_at: '' } as N }));
  assert.equal(h.customer, '', 'сохранённая (пустая) шапка редакции не перезаписывается');
});

const ACCESS: CompanyAccess = { company_id: 'c1', company_name: 'Альфа', can_manage_projects: true, can_manage_units: true, can_manage_roles: true, can_manage_counterparties: true };
const cp = (id: string, name: string, kinds: Counterparty['kinds'], archived_at: string | null = null): Counterparty =>
  ({ id, name, inn: '7700000000', kpp: null, kinds, requisites: {}, archived_at, updated_at: '' });

function fakes(project: Partial<ProjectItem> = {}) {
  const calls: string[] = [];
  let projects: ProjectItem[] = [{ id: 'p1', name: 'Спутник', code: null, archived_at: null, created_at: '', can_manage: true, ...project }];
  const ok = (): Result => ({ ok: true, value: null });
  const api = {
    myAccess: async () => [ACCESS], listProjects: async () => projects,
    updateProject: async (id: string, name: string) => { calls.push(`update:${id}:${name}`); return ok(); }
  } as unknown as ProjectsApi;
  const parties = [cp('k1', 'ООО Заказчик', ['customer']), cp('k2', 'АО Генподряд', ['general_contractor', 'customer']),
    cp('k3', 'ООО Поставщик', ['supplier']), cp('k4', 'ООО Старый', ['customer'], '2026-10-01')];
  const core = {
    listCounterparties: async () => parties,
    setProjectCounterparties: async (id: string, c: string | null, gc: string | null) => {
      calls.push(`parties:${id}:${c}:${gc}`);
      projects = projects.map((p) => (p.id !== id ? p : { ...p, customer_id: c, customer_name: parties.find((x) => x.id === c)?.name || null,
        general_contractor_id: gc, general_contractor_name: parties.find((x) => x.id === gc)?.name || null }));
      return ok();
    }
  } as unknown as CoreApi;
  return { api, core, calls };
}

async function mount(f: ReturnType<typeof fakes>) {
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const root = createRoot(el as unknown as HTMLElement);
  flushSync(() => root.render(createElement(ProjectsTab, { api: f.api, company: ACCESS, core: f.core })));
  await settle();
  return { el: el as N, root };
}

test('«Объекты»: выбор заказчика и генподрядчика — только подходящие и действующие, сохранение и строка у объекта', async () => {
  const f = fakes();
  const { el, root } = await mount(f);
  click(el.querySelector('[data-testid="pj-rename"]')); await settle();
  const cust = el.querySelector('[data-testid="pj-customer"]'), gc = el.querySelector('[data-testid="pj-general_contractor"]');
  assert.deepEqual([...cust.options].map((o: N) => o.textContent), ['— не указан —', 'ООО Заказчик', 'АО Генподряд'], 'заказчики без поставщика и архивного');
  assert.deepEqual([...gc.options].map((o: N) => o.textContent), ['— не указан —', 'АО Генподряд']);
  cust.value = 'k1'; gc.value = 'k2';
  submit(el.querySelector('[data-project-id="p1"]')); await settle();
  assert.deepEqual(f.calls, ['update:p1:Спутник', 'parties:p1:k1:k2']);
  assert.equal(el.querySelector('[data-testid="pj-party-line"]').textContent, 'Заказчик: ООО Заказчик · Генподрядчик: АО Генподряд');
  root.unmount();
});

test('«Объекты»: архивный заказчик объекта остаётся в выборе; без изменений контрагентов — только сохранение объекта', async () => {
  const f = fakes({ customer_id: 'k4', customer_name: 'ООО Старый' });
  const { el, root } = await mount(f);
  assert.match(el.querySelector('[data-testid="pj-party-line"]').textContent, /Заказчик: ООО Старый/);
  click(el.querySelector('[data-testid="pj-rename"]')); await settle();
  const cust = el.querySelector('[data-testid="pj-customer"]');
  assert.equal(cust.value, 'k4');
  assert.ok([...cust.options].some((o: N) => o.textContent === 'ООО Старый (архив)'));
  submit(el.querySelector('[data-project-id="p1"]')); await settle();
  assert.deepEqual(f.calls, ['update:p1:Спутник']);
  root.unmount();
});
