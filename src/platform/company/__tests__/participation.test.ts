/// <reference types="node" />
/** P2-0048 этап 4: правила экрана «Сотрудники и доступ» без React — группы назначений, «где работает», итог мастера, ответственный за факт. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { counts, groupsOf, hasFactOwner, initials, matches, people, resultText, roleKind, shortPlaces, whereLine, whoByNode, wizardSummary, dateInput } from '../participation.ts';
import type { MemberRow } from '../company.service.ts';

const R = (x: Partial<MemberRow>): MemberRow => ({ user_id: 'u1', email: 'u1@x', assignment_id: 'a', role_id: 'r1', role_name: 'Прораб', project_id: 'p1',
  project_name: 'ЖК Альфа', valid_from: '2026-10-01T00:00:00Z', valid_to: null, is_active: true, full_name: 'Петров П. П.', ...x });

test('группы «роль × проект»: места, ответственный, срок; компания и Качество — отдельно', () => {
  const rows = [R({ assignment_id: 'a1', location_id: 's1', location_path: 'Корпус 1 · Секция 1', fact_owner: true }),
    R({ assignment_id: 'a2', location_id: 's2', location_path: 'Корпус 1 · Секция 2', fact_owner: true }),
    R({ assignment_id: 'a3', project_id: 'p2', project_name: 'ЖК Бета' }),
    R({ assignment_id: 'a4', role_id: 'r2', role_name: 'Инженер СК', project_id: null, project_name: null, quality_objects: [{ id: 'o1', name: 'Большевиков, 22' }] })];
  const gs = groupsOf(rows);
  assert.equal(gs.length, 3);
  assert.deepEqual(gs[0].places.map((p) => p.id), ['s1', 's2']);
  assert.equal(gs[0].factOwner, true);
  assert.equal(gs[0].status, 'бессрочно');
  const p = people(rows)[0];
  assert.equal(whereLine(p), 'Прораб · ЖК Альфа (Секция 1, Секция 2), ЖК Бета; Инженер СК · Качество: Большевиков, 22');
  assert.equal(initials(p), 'ПП');
});

test('короткие пути мест: общее начало убирается; разные корпуса — полностью', () => {
  assert.deepEqual(shortPlaces(['Корпус 1 · Секция 1', 'Корпус 1 · Секция 2']), ['Секция 1', 'Секция 2']);
  assert.deepEqual(shortPlaces(['Корпус 1 · Секция 1', 'Корпус 2 · Секция 1']), ['Корпус 1 · Секция 1', 'Корпус 2 · Секция 1']);
  assert.deepEqual(shortPlaces(['Корпус 1 · Секция 1 · 3 этаж']), ['3 этаж']);
});

test('роль: только Качество (quality.* / construction.* без planfact.*), фирма подрядчика', () => {
  const r = (actions: string[]) => ({ id: 'x', name: 'x', template_code: null, actions, active_assignments: 0 });
  assert.deepEqual(roleKind(r(['quality.view'])), { quality: true, planfact: false, qualityOnly: true, firm: false });
  assert.equal(roleKind(r(['quality.view', 'planfact.fact.view'])).qualityOnly, false);
  assert.equal(roleKind(r(['construction.view'])).qualityOnly, true);
  assert.equal(roleKind(r(['quality.view', 'quality.scope.contractor'])).firm, true);
  assert.equal(roleKind(null).quality, false);
});

test('итог мастера простыми словами и число назначений; ответ сервера — сообщение', () => {
  const s = wizardSummary({ names: ['Петров', 'Сидорова'], role: 'Прораб', project: 'ЖК Альфа', places: ['Корпус 1 · Секция 1', 'Корпус 1 · Секция 2'], factOwner: true, until: '' });
  assert.equal(s.what, 'Прораб · ЖК Альфа · Секция 1, Секция 2 · отвечают за факт · бессрочно');
  assert.equal(s.countText, 'Будет 4 назначения');
  const one = wizardSummary({ names: ['Петров'], role: 'Прораб', project: 'ЖК Альфа', places: [], factOwner: true, until: '2026-12-31' });
  assert.equal(one.what, 'Прораб · ЖК Альфа · весь проект · отвечает за факт · до 31.12.2026');
  assert.equal(one.countText, 'Будет 1 назначение');
  const q = wizardSummary({ names: ['Иванов'], role: 'Инженер СК', project: null, places: [], factOwner: true, until: '', objects: ['Объект 2'] });
  assert.equal(q.what, 'Инженер СК · вся компания · объекты Качества: Объект 2 · бессрочно');
  assert.equal(resultText({ added: 4, changed: 0, revoked: 0 }), 'Добавлено 4, изменено 0, отозвано 0 — права действуют со следующего запроса');
  assert.match(resultText({ added: 0, changed: 0, revoked: 0 }), /Ничего не изменилось/);
});

test('ответственный за факт: на узле, выше по дереву или на весь проект', () => {
  const rows = [R({ user_id: 'a', location_id: 's1', fact_owner: true }), R({ user_id: 'b', location_id: 's3' }),
    R({ user_id: 'c', project_id: 'p2', location_id: null, fact_owner: true })];
  const who = whoByNode(rows, 'p1');
  const parent: Record<string, string | null> = { s1: 'k1', s2: 'k1', s3: 'k1', f1: 's1', k1: null };
  const up = (id: string) => parent[id] ?? null;
  assert.equal(hasFactOwner('s1', who, up), true);
  assert.equal(hasFactOwner('f1', who, up), true, 'этаж секции 1 — ответственный выше');
  assert.equal(hasFactOwner('s3', who, up), false);
  assert.equal(hasFactOwner('s2', who, up), false, 'назначение в другом проекте не считается');
  const whole = whoByNode([...rows, R({ user_id: 'd', location_id: null, fact_owner: true })], 'p1');
  assert.equal(hasFactOwner('s3', whole, up), true, 'ответственный за весь проект');
});

test('фильтры и поиск; срок в поле даты — только будущий', () => {
  const list = people([R({}), R({ user_id: 'u2', assignment_id: null, role_id: null, is_active: null, must_change_password: true }),
    R({ user_id: 'u3', disabled_at: '2026-10-01', assignment_id: null, role_id: null })]);
  assert.deepEqual(counts(list), { all: 3, norole: 1, mustchange: 1, disabled: 1 });
  assert.equal(matches(list[0], 'all', 'альфа петров'), true);
  assert.equal(matches(list[0], 'norole', ''), false);
  assert.equal(dateInput('2020-01-01T00:00:00Z'), '');
  assert.equal(dateInput('2099-06-30T20:59:59Z').slice(0, 4), '2099');
});
