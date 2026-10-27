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
