/**
 * P2-0077 (ТД 415): настройки компании с сервера (матрица ролей, официальные шаблоны) применяются на каждом проходе
 * синхронизации. Раньше зеркало в appSettings писалось всегда → settingsUpdatedAt = now → профиль инженера
 * «свежее последней отправки» (sync-engine) и уходил каждый проход: в журнале «отправлено 1» при пустом проходе.
 * Теперь неизменённое не пишется (сравнение не зависит от порядка ключей); реальная смена — как раньше.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

function load() {
  const puts = [];
  const window = { appSettings: {}, RBI: { services: {}, events: { emit() {} } } };
  const ctx = vm.createContext({ window, console: { log() {}, warn() {}, error: console.error }, localStorage: { setItem() {}, getItem() { return null; } },
    dbPut: async (_s, d) => { puts.push(d); } });
  vm.runInContext(read('../../services/settings.service.js'), ctx);
  vm.runInContext(read('../../services/company.service.js'), ctx);
  return { window, company: window.RBI.services.company, puts };
}

/** Условие отправки профиля в проходе синхронизации (sync-engine.core.js): свежесть настроек позже последней отправки. */
const profileWouldSend = (w, lastPushAt) => Number(w.appSettings.settingsUpdatedAt || 0) > lastPushAt;
const tick = () => new Promise((r) => setTimeout(r, 5));

const ROLES = { engineer: { canCreate: true, allowedModules: ['quality', 'knowledge'] }, manager: { canDeleteAll: true } };
const ROLES_REORDERED = { manager: { canDeleteAll: true }, engineer: { allowedModules: ['quality', 'knowledge'], canCreate: true } };
const OFFICIAL = { sys_a: { type: 'system', version: 2, updatedAt: '2026-10-01', updatedBy: 'Админ' }, usr_b: { type: 'user', ref: 'b1', version: 1 } };
const OFFICIAL_REORDERED = { usr_b: { version: 1, ref: 'b1', type: 'user' }, sys_a: { updatedBy: 'Админ', updatedAt: '2026-10-01', version: 2, type: 'system' } };

describe('P2-0077 / ТД 415: настройки компании с сервера не делают профиль «свежим» без изменений', () => {
  let h;
  beforeEach(() => { h = load(); });

  it('два прохода подряд без изменений → во втором профиль не уходит («отправлено 0»)', async () => {
    // проход 1: настройки пришли впервые — зеркало записано, профиль уйдёт (как раньше)
    h.company.applyRoleMatrixOverridesFromCloud(ROLES, '2026-10-31T08:00:00Z');
    h.company.applyOfficialTemplatesFromCloud(OFFICIAL, '2026-10-31T08:00:00Z');
    await tick();
    assert.ok(profileWouldSend(h.window, 0), 'проход 1: новые настройки — профиль уходит');
    const lastPushAt = Date.now();
    const putsAfter1 = h.puts.length;
    await tick();
    // проход 2: сервер отдал то же самое (ключи в другом порядке)
    h.company.applyRoleMatrixOverridesFromCloud(ROLES_REORDERED, '2026-10-31T08:01:00Z');
    h.company.applyOfficialTemplatesFromCloud(OFFICIAL_REORDERED, '2026-10-31T08:01:00Z');
    await tick();
    assert.equal(profileWouldSend(h.window, lastPushAt), false, 'проход 2: без изменений — профиль не уходит');
    assert.equal(h.puts.length, putsAfter1, 'проход 2: настройки на устройстве не перезаписывались');
  });

  it('реальная смена настроек компании по-прежнему записывается и профиль уходит', async () => {
    h.company.applyRoleMatrixOverridesFromCloud(ROLES);
    h.company.applyOfficialTemplatesFromCloud(OFFICIAL);
    await tick();
    let lastPushAt = Date.now();
    await tick();
    h.company.applyRoleMatrixOverridesFromCloud({ ...ROLES, engineer: { canCreate: false, allowedModules: ['quality'] } });
    await tick();
    assert.ok(profileWouldSend(h.window, lastPushAt), 'матрица ролей изменилась — профиль уходит');
    assert.equal(h.window.appSettings.roleMatrixOverrides.engineer.canCreate, false, 'новая матрица в зеркале');
    lastPushAt = Date.now();
    await tick();
    h.company.applyOfficialTemplatesFromCloud({ ...OFFICIAL, sys_a: { ...OFFICIAL.sys_a, version: 3 } });
    await tick();
    assert.ok(profileWouldSend(h.window, lastPushAt), 'официальная версия шаблона сменилась — профиль уходит');
    assert.equal(h.window.appSettings.officialTemplates.sys_a.version, 3);
  });

  it('очистка настроек (сервер отдал пусто) — тоже изменение', async () => {
    h.company.applyRoleMatrixOverridesFromCloud(ROLES);
    await tick();
    const lastPushAt = Date.now();
    await tick();
    h.company.applyRoleMatrixOverridesFromCloud(null);
    await tick();
    assert.ok(profileWouldSend(h.window, lastPushAt));
    assert.equal(JSON.stringify(h.window.appSettings.roleMatrixOverrides), '{}');
  });
});
