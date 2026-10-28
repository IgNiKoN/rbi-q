/**
 * P2-0059: журнал синхронизации на телефоне — ≤ 500 событий, без текста записей и ФИО, отчёт для разработчика.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JOURNAL_MAX, journalKey, errorKind, sanitizeEvent, journalAppend, eventLine, journalReport } from '../../services/sync/sync-journal.policy.js';

describe('журнал синхронизации (С9)', () => {
  it('хранит не больше 500 событий — последние', () => {
    let j = [];
    for (let i = 0; i < 520; i++) j = journalAppend(j, { k: 'start', pushed: i }, JOURNAL_MAX, 't' + i);
    assert.equal(j.length, 500);
    assert.equal(j[0].pushed, 20);
    assert.equal(j[499].pushed, 519);
  });
  it('без текста записей и ФИО: лишние поля отбрасываются, ошибка — только вид', () => {
    const e = sanitizeEvent({ k: 'error', text: 'Трещина в стене', engineer: 'Иванов Иван', comment: 'x', object: 'ЖК',
      err: { message: 'invalid input syntax for type uuid: "Иванов Иван"', code: '22P02' },
      ids: [{ type: 'inspection', id: 'p2w-1-1730000' }, { type: 'inspection', id: 'Иванов Иван' }] }, '2026-10-28T10:00:00Z');
    const s = JSON.stringify(e);
    assert.ok(!/Иванов|Трещина|ЖК|comment/.test(s), s);
    assert.equal(e.err, 'отклонено 22P02');
    assert.deepEqual(e.ids, [{ type: 'inspection', id: 'p2w-1-1730000' }]);
  });
  it('повторная очистка события не меняет вид ошибки', () => {
    const once = sanitizeEvent({ k: 'error', err: { message: 'new row violates row-level security policy' }, rejected: 1 }, 't');
    assert.equal(sanitizeEvent(once, 't').err, 'нет прав');
    assert.equal(sanitizeEvent({ k: 'error', err: 'Иванов Иван' }, 't').err, 'сбой');
  });
  it('вид ошибки', () => {
    assert.equal(errorKind(new TypeError('Failed to fetch')), 'нет связи');
    assert.equal(errorKind({ code: 'RBI_REQUEST_TIMEOUT', message: 'x' }), 'нет ответа');
    assert.equal(errorKind({ status: 503, message: 'Service Unavailable' }), 'сервер 503');
    assert.equal(errorKind({ message: 'new row violates row-level security policy' }), 'нет прав');
    assert.equal(errorKind({ code: 'RBI_MISSING_LOCAL_FILE', message: 'Фото не найдено: local://x' }), 'нет фото на устройстве');
  });
  it('у каждой базы устройства (компания + пользователь) свой журнал', () => {
    assert.notEqual(journalKey('PLATFORM2_DB_c1_u1'), journalKey('PLATFORM2_DB_c1_u2'));
  });
  it('строка и отчёт для разработчика', () => {
    const j = journalAppend([], { k: 'end', net: 'online', pushed: 5, pulled: 2, ms: 3400 }, 500, '2026-10-28T10:00:00Z');
    assert.equal(eventLine(j[0]), 'конец · связь есть · отправлено 5 · получено 2 · 3.4 с');
    const r = journalReport(j, { version: '18.104.0', unsent: 0, lastOk: '10:00', onLine: true, now: 'n', ua: 'UA' });
    assert.match(r, /Журнал синхронизации RBI-Q/);
    assert.match(r, /Версия приложения: 18\.104\.0/);
    assert.match(r, /2026-10-28T10:00:00Z  конец · связь есть · отправлено 5/);
  });
});
