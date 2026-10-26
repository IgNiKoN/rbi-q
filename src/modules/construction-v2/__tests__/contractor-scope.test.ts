// P2-0044: подрядчик видит записи своей фирмы по номеру контрагента (core_counterparty_id), а не по написанию названия.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterDefectsForRole, ownsRecord } from '../contractor-scope.ts';

type Win = { RBI?: unknown; appSettings?: Record<string, unknown> };
function setup(role: string, assignedName: string, cp: string, dirIdByName: Record<string, string>): void {
  const w = globalThis as unknown as { window: Win };
  w.window = {
    appSettings: { assignedCounterpartyId: cp },
    RBI: { services: {
      permissions: { getCurrentRole: () => role, getAssignedContractor: () => assignedName },
      contractors: { resolveIdFromNormalized: (o: Record<string, string>) => dirIdByName[o.display_name] ?? null }
    } }
  };
}

test('своя фирма: по номеру контрагента, написание названия не важно', () => {
  assert.equal(ownsRecord({ core_counterparty_id: 'cp1', contractorId: 'чужая-карточка' }, 'cp1', null), true);
  assert.equal(ownsRecord({ core_counterparty_id: 'cp2', contractorId: 'dir1' }, 'cp1', 'dir1'), false, 'номер чужой — не своя, даже если карточка совпала');
  assert.equal(ownsRecord({ contractorId: 'dir1' }, 'cp1', 'dir1'), true, 'без номера (создана на устройстве) — по карточке');
  assert.equal(ownsRecord({ contractorId: 'dir1' }, 'cp1', null), false);
});

test('подрядчик: справочник не узнаёт название назначения — записи с номером его фирмы всё равно видны', () => {
  setup('contractor', 'ООО «Ромашка»', 'cp1', {});
  const rows = [{ id: 'a', core_counterparty_id: 'cp1', contractorId: 'd-x' }, { id: 'b', core_counterparty_id: 'cp2', contractorId: 'd-y' },
    { id: 'c', contractorId: 'd-x' }];
  assert.deepEqual(filterDefectsForRole(rows).map((r) => r.id), ['a']);
});

test('подрядчик без фирмы — ничего; инженер — всё', () => {
  setup('contractor', '', '', {});
  const one: Array<{ id: string; core_counterparty_id?: string }> = [{ id: 'a', core_counterparty_id: 'cp1' }];
  assert.deepEqual(filterDefectsForRole(one), []);
  setup('engineer', '', '', {});
  const two: Array<{ id: string; contractorId?: string }> = [{ id: 'a' }, { id: 'b' }];
  assert.equal(filterDefectsForRole(two).length, 2);
});
