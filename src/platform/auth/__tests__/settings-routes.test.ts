/// <reference types="node" />
/** P2-0038 этап 1: адреса «Настроек» двух зон (js/modules/settings/settings.routes.js) — старые адреса ведут в новое место,
 *  адрес ↔ ключ панели, зона ключа. Права здесь не проверяются (их проверяет settings.render.js по ответу сервера). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error — модуль оболочки на JS без типов
import * as R from '../../../../js/modules/settings/settings.routes.js';

test('старые адреса «Настроек» → новые', () => {
  const cases: [string, string][] = [
    ['#/settings', '#/settings/my/profile'],
    ['#/settings/', '#/settings/my/profile'],
    ['#/settings/platform', '#/settings/my/profile'],
    ['#/settings/construction', '#/settings/my/profile'],
    ['#/settings/quality', '#/settings/my/quality'],
    ['#/settings/admin', '#/settings/modules/quality'],
    ['#/settings/directories', '#/settings/modules/quality'],
    ['#/settings/platform-admin', '#/settings/platform/companies'],
    ['#/settings/my', '#/settings/my/profile'],
    ['#/settings/my/xxx', '#/settings/my/profile'],
    ['#/settings/modules', '#/settings/modules/quality'],
    ['#/settings/platform/xxx', '#/settings/platform/companies'],
    ['#/settings/unknown', '#/settings/my/profile']
  ];
  for (const [from, to] of cases) assert.equal(R.settingsLegacyRedirect(from), to, from);
});

test('новые адреса и чужие маршруты не меняются', () => {
  for (const p of ['#/settings/my/profile', '#/settings/my/help', '#/settings/my/quality', '#/settings/modules/quality',
    '#/settings/platform/companies', '#/settings/company', '#/settings/company/members', '#/settings/company/audit',
    '#/planfact/vor', '#/quality/audit', '#/settingsx']) {
    assert.equal(R.settingsLegacyRedirect(p), p, p);
  }
});

test('адрес ↔ ключ панели, зона', () => {
  for (const key of R.SETTINGS_KEYS) {
    const path = R.settingsPathForKey(key);
    assert.equal(R.settingsLegacyRedirect(path), path, key);
    assert.equal(R.settingsKeyFromHash(path), key, key);
  }
  assert.equal(R.settingsKeyFromHash('#/settings/company/members'), 'company');
  assert.equal(R.settingsKeyFromHash('#/settings/admin'), 'admin');
  assert.equal(R.settingsKeyFromHash('#/settings/platform'), 'my-profile');
  assert.equal(R.settingsKeyFromHash('#/planfact'), null);
  assert.equal(R.settingsPathForKey('нет такого'), '#/settings/my/profile');
  assert.deepEqual(R.SETTINGS_KEYS.filter((k: string) => R.settingsZoneForKey(k) === 'admin'), ['company', 'admin', 'platform-admin']);
  assert.ok(R.SETTINGS_KEYS.filter((k: string) => R.settingsZoneForKey(k) === 'my').every((k: string) => k.startsWith('my-')));
});
