/// <reference types="node" />
/** P2-0048 этап 3: «Требует внимания» на главной «Настроек» — счёт по людям, а не по строкам назначений; пустое — без строк. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attentionFrom, attentionLines, plural } from '../CompanyHome.ts';
import type { MemberRow } from '../company.service.ts';

const row = (u: string, x: Partial<MemberRow> = {}): MemberRow => ({ user_id: u, email: u + '@x', assignment_id: null, role_id: null, role_name: null,
  project_id: null, project_name: null, valid_from: null, valid_to: null, is_active: null, ...x });

test('счётчики по людям', () => {
  const rows = [
    row('a', { role_id: 'r1', is_active: true }), row('a', { role_id: 'r2', is_active: true, must_change_password: true }),
    row('b'), row('c'), row('d', { role_id: 'r1', is_active: true, must_change_password: true }),
    row('e', { disabled_at: '2026-10-01', must_change_password: true })
  ];
  assert.deepEqual(attentionFrom(rows), { noRole: 2, mustChange: 2, disabled: 1 });
  assert.deepEqual(attentionLines(attentionFrom(rows)).map((l) => l.text),
    ['2 сотрудника без ролей', '2 не сменили временный пароль', '1 сотрудник отключён']);
  assert.deepEqual(attentionLines(attentionFrom([row('a', { role_id: 'r', is_active: true })])), [], 'всё в порядке — блока нет');
});

test('склонение', () => {
  assert.deepEqual([1, 2, 5, 11, 12, 21, 22, 25].map((n) => plural(n, 'о', 'н', 'м')), ['о', 'н', 'м', 'м', 'м', 'о', 'н', 'м']);
});

test('этап 5: места без ответственного за факт — только в проектах, где ответственные уже назначаются; секции и объекты без секций', async () => {
  const { placesWithoutOwner, gapLine } = await import('../CompanyHome.ts');
  const rows = [
    row('iv', { assignment_id: 'a1', role_id: 'f', is_active: true, project_id: 'pa', project_name: 'ЖК Альфа', location_id: 'pa-s1', fact_owner: true }),
    row('iv', { assignment_id: 'a2', role_id: 'f', is_active: true, project_id: 'pa', project_name: 'ЖК Альфа', location_id: 'pa-s2', fact_owner: true }),
    row('pe', { assignment_id: 'a3', role_id: 'f', is_active: true, project_id: 'pa', project_name: 'ЖК Альфа', location_id: 'pa-s3', fact_owner: false }),
    row('pe', { assignment_id: 'a4', role_id: 'f', is_active: true, project_id: 'pb', project_name: 'ЖК Бета', location_id: null, fact_owner: false })];
  const tree: Record<string, { id: string; parent_id: string | null; name: string; node_type: string; path: string; hasKids: boolean }[]> = {
    'pa|': [{ id: 'pa-k1', parent_id: null, name: 'Корпус 1', node_type: 'object', path: 'Корпус 1', hasKids: true },
      { id: 'pa-park', parent_id: null, name: 'Паркинг', node_type: 'object', path: 'Паркинг', hasKids: false }],
    'pa|pa-k1': [1, 2, 3].map((i) => ({ id: 'pa-s' + i, parent_id: 'pa-k1', name: 'Секция ' + i, node_type: 'section', path: 'Корпус 1 · Секция ' + i, hasKids: true })) };
  const asked: string[] = [];
  const gaps = await placesWithoutOwner(rows, async (p, parent) => { asked.push(p + '|' + (parent || '')); return tree[p + '|' + (parent || '')] || []; });
  assert.deepEqual(gaps, [{ project: 'ЖК Альфа', place: 'Секция 3' }, { project: 'ЖК Альфа', place: 'Паркинг' }]);
  assert.ok(!asked.some((x) => x.startsWith('pb|')), 'ЖК Бета без ответственных — дерево не грузится, пункт не шумит');
  assert.equal(gapLine(gaps)!.text, 'Места без ответственного за факт: ЖК Альфа — Секция 3, ЖК Альфа — Паркинг');
  assert.equal(gapLine([]), null);
});
