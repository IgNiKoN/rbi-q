/// <reference types="node" />
/** P2-0060 этап 4: правило по роли (5 ролей экрана Качества), выбор человека важнее; охват mine30 — мои объекты за 30 дней
 *  + фото открытых замечаний моих объектов независимо от даты; закрытое более поздним осмотром замечание — не качается. Стенд — tests/offline/files.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDocsScope, defaultFilesScope, filesScopeFor, mine30Photos } from '../files-rule.ts';
import type { InspectionLike } from '../files-rule.ts';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const day = (n: number): string => new Date(NOW - n * 864e5).toISOString();

test('правило по роли: инженер и подрядчик — мои объекты за 30 дней; руководитель, директор, гость — не скачивать заранее', () => {
  assert.equal(defaultFilesScope('engineer'), 'mine30');
  assert.equal(defaultFilesScope('contractor'), 'mine30');
  assert.equal(defaultFilesScope('manager'), 'none');
  assert.equal(defaultFilesScope('director'), 'none');
  assert.equal(defaultFilesScope('guest'), 'none');
  assert.equal(defaultFilesScope('что-то новое'), 'none', 'неизвестная роль — без фото заранее');
});

test('выбор человека важнее правила по роли; неверный выбор — правило', () => {
  assert.equal(filesScopeFor('all', 'manager'), 'all');
  assert.equal(filesScopeFor('none', 'engineer'), 'none');
  assert.equal(filesScopeFor(null, 'engineer'), 'mine30');
  assert.equal(filesScopeFor('всё подряд', 'director'), 'none');
});

test('mine30: свои объекты за 30 дней — все фото; старше — только фото открытых замечаний; чужие объекты — ничего', () => {
  const list: InspectionLike[] = [
    { id: 'a-new', object: 'obj-1', template: 'Кладка', date: day(3), state: { '1': 'ok', '2': 'fail' }, photos: { '1': ['u1'], '2': ['u2'] } },
    { id: 'a-old-open', object: 'obj-1', template: 'Кладка', date: day(60), state: { '7': 'fail', '8': 'ok' }, photos: { '7': ['u7'], '8': ['u8'] } },
    { id: 'a-old-closed', object: 'obj-1', template: 'Бетон', date: day(70), state: { '5': 'fail' }, photos: { '5': ['u5'] } },
    { id: 'a-recheck', object: 'obj-1', template: 'Бетон', date: day(40), state: { '5': 'ok' }, photos: {} },
    { id: 'b-new', object: 'obj-2', template: 'Кладка', date: day(1), state: { '1': 'fail' }, photos: { '1': ['b1'] } }
  ];
  const mine = (r: InspectionLike): boolean => r.object === 'obj-1';
  const pick = mine30Photos(list, mine, NOW);
  assert.equal(pick.get('a-new'), 'all', 'свой объект, 3 дня — все фото');
  assert.deepEqual(pick.get('a-old-open'), ['7'], '60 дней, замечание по пункту 7 не закрыто — только его фото');
  assert.equal(pick.has('a-old-closed'), false, 'замечание по пункту 5 закрыто более поздним осмотром того же шаблона');
  assert.equal(pick.has('a-recheck'), false, 'осмотр старше 30 дней без замечаний — не качается');
  assert.equal(pick.has('b-new'), false, 'чужой объект — ничего');
});

test('mine30: закреплённых объектов нет (вся компания) — «мои» все; повторное замечание в свежем осмотре — все фото осмотра', () => {
  const list: InspectionLike[] = [
    { id: 'x1', object: 'obj-9', template: 'Т', date: day(45), state: { '1': 'fail' }, photos: { '1': ['p'] } },
    { id: 'x2', object: 'obj-9', template: 'Т', date: day(10), state: { '1': 'fail' }, photos: { '1': ['q'] } }
  ];
  const pick = mine30Photos(list, () => true, NOW);
  assert.equal(pick.get('x2'), 'all');
  assert.equal(pick.has('x1'), false, 'замечание то же — его последнее фото уже в свежем осмотре');
});

test('База знаний заранее (решение владельца 29.10): инженеру и подрядчику — все документы, руководству и гостю — не скачивать', () => {
  assert.deepEqual(['engineer', 'contractor', 'manager', 'director', 'guest'].map(defaultDocsScope), ['all', 'all', 'none', 'none', 'none']);
});
