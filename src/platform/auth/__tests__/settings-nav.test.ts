/// <reference types="node" />
/** P2-0048 этап 3: структура «Настроек» по варианту В (js/modules/settings/settings.nav.js) — группы и названия,
 *  адрес → пункт левой колонки, поиск по настройкам только среди видимых пунктов. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error — модуль оболочки на JS без типов
import * as N from '../../../../js/modules/settings/settings.nav.js';
// @ts-expect-error — модуль оболочки на JS без типов
import * as R from '../../../../js/modules/settings/settings.routes.js';

type Item = { id: string; key: string; label: string; icon: string; path?: string; tab?: string; group: string };

test('группы и пункты — ровно как в варианте В', () => {
  const g = N.SETTINGS_NAV.map((x: { title: string; items: Item[] }) => [x.title, x.items.map((i) => i.label)]);
  assert.deepEqual(g, [
    ['Личные', ['Мой профиль', 'Вид и удобство', 'Уведомления', 'Данные на устройстве', 'Осмотр', 'Помощь и о программе']],
    ['Компания', ['Сотрудники и доступ', 'Проекты и объекты', 'Контрагенты', 'Справочники', 'Фирменный стиль и отчёты', 'Модули', 'Журнал изменений']],
    ['Модули', ['Качество', 'План/Факт']],
    ['Платформа', ['Платформа', 'Образцы экранов']]
  ]);
  for (const it of N.settingsNavItems() as Item[]) {
    assert.ok(N.SETTINGS_ICONS[it.icon], 'иконка ' + it.id);
    assert.ok(R.SETTINGS_KEYS.includes(it.key), 'панель ' + it.id);
    const path = it.path || R.settingsPathForKey(it.key);
    assert.equal(R.settingsLegacyRedirect(path), path, 'адрес канонический ' + it.id);
    assert.equal(N.settingsNavIdFromHash(path), it.id, 'адрес → пункт ' + it.id);
  }
});

test('адрес → пункт: главная, роли внутри «Сотрудники и доступ», старые адреса', () => {
  assert.equal(N.settingsNavIdFromHash('#/settings'), 'home');
  assert.equal(N.settingsNavIdFromHash('#/settings/home'), 'home');
  assert.equal(N.settingsNavIdFromHash('#/settings/company/roles'), 'company/members');
  assert.equal(N.settingsNavIdFromHash('#/settings/company/objects?p=1'), 'company/objects');
  assert.equal(N.settingsNavIdFromHash('#/settings/company'), 'company');
  assert.equal(N.settingsNavIdFromHash('#/settings/admin'), 'admin');
  assert.equal(N.settingsNavIdFromHash('#/settings/platform-admin'), 'platform-admin');
  assert.equal(N.settingsNavIdFromHash('#/quality/audit'), null);
});

test('поиск: разделы и настройки, только видимые пункты', () => {
  const all = (N.settingsNavItems() as Item[]).map((i) => i.id);
  const r = N.searchSettings('пароль', all) as { title: string; id: string }[];
  assert.ok(r.some((x) => x.id === 'my-profile'), 'свой пароль');
  assert.ok(r.some((x) => x.id === 'company/members'), 'пароль сотрудника');
  const foreman = all.filter((id) => id.startsWith('my-'));
  assert.ok((N.searchSettings('пароль', foreman) as { id: string }[]).every((x) => x.id.startsWith('my-')), 'прорабу — без разделов компании');
  assert.deepEqual((N.searchSettings('контраг', all) as { id: string }[]).map((x) => x.id)[0], 'company/counterparties', 'раздел — первым');
  assert.deepEqual(N.searchSettings('  ', all), []);
  assert.deepEqual(N.searchSettings('нет такого слова', all), []);
});
