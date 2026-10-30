// P2-0059 (С8, С9): «что не ушло и почему» — причины, названия, разметка карточки и журнала.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reasonFor, itemTitle, toItems, statusHtml, whenLabel, plural } from '../sync-status.ts';
import { isRejected } from '../offline-rescue.ts';

const NOW = new Date(2026, 9, 28, 14, 31).getTime();
const base = { offline: false, now: NOW, retryAfter: 0, retryKind: '' };

test('P2-0059: причины — нет связи, нет фото, отклонено, ждёт повтора, ждёт отправки', () => {
  const rec = { id: 'a', syncStatus: 'not_synced', source: 'local' };
  assert.deepEqual(reasonFor(rec, false, { ...base, offline: true }), { chip: 'net', why: 'Нет связи', hint: 'отправим сами, как появится' });
  const att = { id: 'b', syncStatus: 'needs_attention', syncBlockReason: 'Не отправлено: нет фото пункта «Армирование»' };
  const r2 = reasonFor(att, false, { ...base, offline: true });
  assert.equal(r2.chip, 'photo'); assert.equal(r2.why, 'Нет фото пункта «Армирование»'); assert.equal(r2.act, 'drop_photos');
  const rej = { id: 'c', syncStatus: 'blocked', syncBlockReason: 'Ошибка прав доступа (RLS)' };
  assert.equal(isRejected(rej), true);
  assert.deepEqual(reasonFor(rej, true, base).why, 'Сервер отклонил: нет прав');
  assert.equal(reasonFor(rej, true, base).chip, 'bad');
  const wait = reasonFor(rec, false, { ...base, retryAfter: NOW + 11 * 60000, retryKind: 'server' });
  assert.equal(wait.why, 'Сервер не ответил'); assert.equal(wait.hint, 'повтор в 14:42');
  assert.equal(reasonFor(rec, false, { ...base, retryAfter: NOW + 60000, retryKind: 'net' }).why, 'Нет ответа сервера');
  assert.equal(reasonFor(rec, false, base).chip, 'queue');
});

test('P2-0059: название записи и время', () => {
  assert.equal(itemTitle('app_history', { id: 1, templateTitle: 'Кладка', projectName: 'ЖК Тестовый', section: 'Секция 2', floor: 'этаж 5' }), 'Осмотр · Кладка · ЖК Тестовый · Секция 2, этаж 5');
  assert.equal(whenLabel(new Date(2026, 9, 28, 14, 5).toISOString(), NOW), 'сегодня 14:05');
  assert.equal(whenLabel(new Date(2026, 9, 27, 17, 12).toISOString(), NOW), 'вчера 17:12');
  assert.equal(whenLabel('', NOW), '');
  assert.equal(plural(1, 'событие', 'события', 'событий'), 'событие');
  assert.equal(plural(3, 'событие', 'события', 'событий'), 'события');
  assert.equal(plural(12, 'событие', 'события', 'событий'), 'событий');
});

test('P2-0059: карточка — «не отправлено: N», отклонённые отдельно, текст экранирован; журнал', () => {
  const items = toItems([
    { store: 'app_history', rec: { id: 'x1', syncStatus: 'not_synced', source: 'local', projectName: '<b>ЖК</b>' }, rejected: false },
    { store: 'sk_records', rec: { id: 'x2', syncStatus: 'blocked', syncBlockReason: 'Объект не назначен пользователю' }, rejected: true }
  ], { ...base, offline: true });
  assert.deepEqual(items.map((i) => i.id), ['x1', 'x2']);
  const html = statusHtml({ ...base, offline: true, items, lastOkAt: new Date(2026, 9, 28, 11, 58).toISOString(), probe: 'offline', probeAt: NOW,
    journal: [{ t: '14:31', text: 'не начат · нет ответа сервера', tone: 'warn' }], journalTotal: 1 }, false);
  assert.match(html, /Нет связи · не отправлено: 1/);
  assert.match(html, /Не ушло, нужно действие: 1/);   // P2-0061: одна группа «само не уйдёт» с кнопкой
  assert.match(html, /data-act="retry"[^>]*>Отправить снова/);
  assert.match(html, /Сервер отклонил: объект не назначен/);
  assert.match(html, /Последняя успешная отправка: сегодня 11:58/);
  assert.match(html, /Проверка связи: нет ответа, 14:31/);
  assert.match(html, /Журнал синхронизации <small>· 1 событие/);
  assert.ok(!html.includes('<b>ЖК</b>'));
  const ok = statusHtml({ ...base, items: [], lastOkAt: '', probe: null, probeAt: 0, journal: [], journalTotal: 0 }, true);
  assert.match(ok, /Всё отправлено/);
  assert.match(ok, /Событий пока нет/);
  assert.match(ok, /data-testid="p2-sync-journal" open/);
});

test('P2-0061: «Не отправлено: …» (решило устройство) и «Сервер отклонил: …» — как записаны, с подсказкой; только такие — «Не ушло: N»', () => {
  const foreign = { id: 'f', syncStatus: 'blocked', syncBlockReason: 'Не отправлено: запись другого сотрудника (Петров Пётр)', syncBlockHint: 'Отправит руководитель или автор, войдя на этом телефоне' };
  const rej = { id: 'r', syncStatus: 'blocked', syncBlockReason: 'Сервер отклонил: нет прав на эту запись', syncBlockHint: 'Уйдёт сама, когда вам дадут права, или нажмите «Отправить снова»' };
  const a = reasonFor(foreign, true, base), b = reasonFor(rej, true, base);
  assert.deepEqual([a.chip, a.why, a.hint], ['bad', 'Не отправлено: запись другого сотрудника (Петров Пётр)', 'Отправит руководитель или автор, войдя на этом телефоне']);
  assert.deepEqual([b.why, b.hint], ['Сервер отклонил: нет прав на эту запись', 'Уйдёт сама, когда вам дадут права, или нажмите «Отправить снова»']);
  const items = toItems([{ store: 'app_history', rec: foreign, rejected: true }, { store: 'rbi_tasks', rec: rej, rejected: true }], base);
  const html = statusHtml({ ...base, items, lastOkAt: '', probe: null, probeAt: 0, journal: [], journalTotal: 0 }, false);
  assert.match(html, /<b class="p2s__title">Не ушло: 2<\/b>/);
  assert.ok(!/Всё отправлено/.test(html), 'не «Всё отправлено», когда само не уйдёт');
  assert.match(html, /Не ушло, нужно действие: 2/);
});

test('P2-0073: карточка «Отправка» до подсчёта — «считаем…», не «Всё отправлено»; при пересчёте — прежний список и время', () => {
  const empty = { ...base, items: [], lastOkAt: '', probe: null, probeAt: 0, journal: [], journalTotal: 0 };
  const first = statusHtml({ ...empty, counting: 'first' }, false);
  assert.match(first, /Считаем, что не отправлено…/);
  assert.doesNotMatch(first, /Всё отправлено/);
  assert.match(first, /Журнал синхронизации/, 'журнал — сразу');
  const items = toItems([{ store: 'app_history', rec: { id: 'x1', syncStatus: 'not_synced', object: 'ЖК Тестовый' }, rejected: false }], base);
  const again = statusHtml({ ...empty, items, counting: 'refresh', countedAt: new Date(2026, 9, 28, 14, 20).getTime() }, false);
  assert.match(again, /не отправлено: 1/);
  assert.match(again, /Обновляем · список на 14:20/);
  assert.doesNotMatch(statusHtml({ ...empty, items }, false), /Обновляем/, 'подсчёт закончен — без пометки');
});
