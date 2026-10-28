/**
 * P2-0066: правила строки версии и переключения при возврате из фона (решения владельца «Запуск + возврат», «Тихо + строка»).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RETURN_AFTER_MS, shouldSwitchOnReturn, versionView } from '../app-update.policy.js';

const ok = { waiting: true, hiddenMs: RETURN_AFTER_MS, unsent: 0, syncing: false, busy: false };

describe('P2-0066: переключение при возврате из фона', () => {
  it('30 минут в фоне, версия скачана, всё отправлено, ничего не вводится — включить', () => {
    assert.equal(RETURN_AFTER_MS, 30 * 60 * 1000);
    assert.equal(shouldSwitchOnReturn(ok), true);
  });
  it('не включать: меньше 30 минут, нет скачанной версии, неотправленное, идёт отправка, открыта форма', () => {
    assert.equal(shouldSwitchOnReturn({ ...ok, hiddenMs: RETURN_AFTER_MS - 1 }), false);
    assert.equal(shouldSwitchOnReturn({ ...ok, waiting: false }), false);
    assert.equal(shouldSwitchOnReturn({ ...ok, unsent: 2 }), false);
    assert.equal(shouldSwitchOnReturn({ ...ok, syncing: true }), false);
    assert.equal(shouldSwitchOnReturn({ ...ok, busy: true }), false);
    assert.equal(shouldSwitchOnReturn(null), false);
  });
});

describe('P2-0066: строка версии', () => {
  const base = { version: '2026.10.29-9f5a8d91', date: '2026-10-29', done: 0, total: 0, newVersion: '', reason: '' };
  it('последняя версия — номер и дата, без «Перезапустить»', () => {
    const v = versionView({ ...base, state: 'idle' });
    assert.equal(v.title, 'Версия 2026.10.29-9f5a8d91');
    assert.equal(v.sub, 'от 29.10.2026 · это последняя версия');
    assert.equal(v.restart, false); assert.equal(v.tone, 'ok'); assert.equal(v.progress, null);
  });
  it('скачивается — N из M файлов, полоска, «ничего не перезагрузится»', () => {
    const v = versionView({ ...base, state: 'downloading', done: 120, total: 201 });
    assert.equal(v.sub, '120 из 201 файла · можно работать дальше, ничего не перезагрузится');
    assert.ok(Math.abs(v.progress - 120 / 201) < 1e-9);
    assert.equal(versionView({ ...base, state: 'downloading', done: 3, total: 5 }).sub.startsWith('3 из 5 файлов'), true);
    assert.equal(v.foot, 'Сейчас работает: 2026.10.29-9f5a8d91 от 29.10.2026');
  });
  it('скачана — «включится при следующем запуске», «Перезапустить сейчас», неотправленное не пропадёт', () => {
    const v = versionView({ ...base, state: 'ready', newVersion: '2026.11.02-1a2b3c4d' });
    assert.equal(v.title, 'Новая версия скачана');
    assert.equal(v.sub, '2026.11.02-1a2b3c4d — включится при следующем запуске');
    assert.equal(v.restart, true);
    assert.match(v.foot, /неотправленное не пропадёт/);
  });
  it('не скачалась — причина простыми словами, «повторим позже»', () => {
    assert.equal(versionView({ ...base, state: 'failed', reason: 'network' }).sub, 'Нет связи — работает текущая версия, повторим позже сами');
    assert.match(versionView({ ...base, state: 'failed', reason: 'mismatch' }).sub, /^На сервере идёт выкладка/);
    assert.match(versionView({ ...base, state: 'failed', reason: 'space' }).sub, /^Мало места на устройстве/);
  });
  it('номер ещё неизвестен (первый запуск) — без пустых слов', () => {
    const v = versionView({ version: '', date: '', state: 'idle' });
    assert.equal(v.title, 'Версия приложения');
    assert.equal(v.sub, 'это последняя версия');
  });
});
