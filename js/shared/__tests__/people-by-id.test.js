/**
 * P2-0035b (ADR-070): «своё» в Качестве — по номеру учётки. canDelete: при номере владельца и своём номере сравниваются номера
 * (переименование и однофамилец не влияют); без номера — по ФИО, как раньше.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function permissions(syncConfig) {
  const window = { syncConfig: { enabled: true, ...syncConfig }, RBI: {} };
  const ctx = vm.createContext({ window, console, appSettings: { userRole: 'engineer' } });   // инженер: удаляет только своё
  vm.runInContext(readFileSync(new URL('../../services/permission.service.js', import.meta.url), 'utf8'), ctx);
  return window.RBI.services.permissions;
}

describe('P2-0035b: удалить своё — по номеру учётки', () => {
  it('свой номер = номер владельца → можно, даже если ФИО другое (переименовали)', () => {
    const p = permissions({ authUserId: 'u-iv', engineerName: 'Иванов-Строй И.И.' });
    assert.equal(p.canDelete('Иванов И.И.', 'u-iv'), true);
  });
  it('однофамилец: то же ФИО, другой номер → нельзя', () => {
    const p = permissions({ authUserId: 'u-p1', engineerName: 'Петров П.П.' });
    assert.equal(p.canDelete('Петров П.П.', 'u-p2'), false);
  });
  it('старая запись без номера → по ФИО, как раньше', () => {
    const p = permissions({ authUserId: 'u-iv', engineerName: 'Иванов И.И.' });
    assert.equal(p.canDelete('Иванов И.И.'), true);
    assert.equal(p.canDelete('Петров П.П.'), false);
  });
});
