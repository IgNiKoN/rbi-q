/// <reference types="node" />
/** P2-0028: временный пароль → «Придумайте пароль» (флаг с сервера), смена пароля (Auth + pf_password_changed), «Мой профиль». Без сети; DOM — happy-dom. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createPlatform, parseProfile } from '../platform.service.ts';
import type { AuthApi } from '../auth.service.ts';
import { checkNewPassword, mapAuthError, mapPasswordError } from '../auth.service.ts';
import { renderMyProfile, renderPasswordScreen } from '../password-screen.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const win = new Window({ url: 'http://localhost/' });
const settle = () => new Promise((r) => setTimeout(r, 0));
const submit = (f: N) => f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
const click = (b: N) => b.dispatchEvent(new win.Event('click', { bubbles: true }));
function fill(form: N, pw: string, rep: string) {
  form.querySelector('[name=password]').value = pw;
  form.querySelector('[name=repeat]').value = rep;
}

function setup(opts: { must?: boolean; authFail?: string; serverFail?: boolean } = {}) {
  let must = opts.must !== false;
  const calls: string[] = [];
  const auth: AuthApi = {
    async signIn() { return { ok: true }; }, async signOut() { calls.push('signOut'); },
    async getEmail() { return 'new@test.invalid'; }, async getAccess() { return []; },
    async changePassword(pw) { calls.push('auth.change:' + pw.length); return opts.authFail ? { ok: false, message: opts.authFail } : { ok: true }; }
  };
  const p = createPlatform({
    auth,
    rpc: async (fn) => {
      calls.push(fn);
      if (fn === 'pf_my_profile') return { data: { email: 'new@test.invalid', full_name: 'Новиков Н.Н.', must_change_password: must }, error: null };
      if (fn === 'pf_password_changed') { if (opts.serverFail) return { data: null, error: { message: 'x' } }; must = false; return { data: null, error: null }; }
      return { data: { is_platform_admin: false, companies: [] }, error: null };
    },
    storage: null, pinActive: () => false
  });
  return { p, calls };
}

test('профиль с сервера: ФИО и флаг «сменить пароль» в состоянии', async () => {
  const { p } = setup();
  const st = await p.boot();
  assert.equal(st.fullName, 'Новиков Н.Н.');
  assert.equal(st.mustChangePassword, true);
  assert.deepEqual(parseProfile(null), { fullName: null, mustChangePassword: false, userId: null });
});

test('сменить пароль: Auth → pf_password_changed → состояние обновлено, флаг снят', async () => {
  const { p, calls } = setup();
  await p.boot();
  calls.length = 0;
  assert.deepEqual(await p.changePassword('Новый-пароль-1'), { ok: true });
  assert.deepEqual(calls.slice(0, 2), ['auth.change:14', 'pf_password_changed']);
  assert.equal(p.getState().mustChangePassword, false);
});

test('Auth отказал — флаг на сервере не трогаем, текст ошибки', async () => {
  const { p, calls } = setup({ authFail: 'Новый пароль должен отличаться от прежнего' });
  await p.boot();
  calls.length = 0;
  assert.deepEqual(await p.changePassword('Новый-пароль-1'), { ok: false, message: 'Новый пароль должен отличаться от прежнего' });
  assert.deepEqual(calls, ['auth.change:14']);
  assert.equal(p.getState().mustChangePassword, true);
});

test('сервер не принял отметку — честное сообщение', async () => {
  const { p } = setup({ serverFail: true });
  await p.boot();
  const r = await p.changePassword('Новый-пароль-1');
  assert.equal(r.ok, false);
});

test('тексты ошибок: отключённый, совпадает с прежним, слабый; правило 8 знаков и совпадение', () => {
  assert.equal(mapAuthError('User is banned'), 'Доступ отключён администратором компании');
  assert.equal(mapPasswordError('New password should be different from the old password.'), 'Новый пароль должен отличаться от прежнего');
  assert.equal(mapPasswordError('Password should be at least 6 characters.'), 'Пароль слишком короткий или простой');
  assert.equal(checkNewPassword('1234567', '1234567'), 'Пароль — не короче 8 знаков');
  assert.equal(checkNewPassword('12345678', '12345679'), 'Пароли не совпадают');
  assert.equal(checkNewPassword('12345678', '12345678'), null);
});

test('«Придумайте пароль»: короткий и несовпадающий — подсказка без запроса; верный — смена; «Выйти»', async () => {
  const host = win.document.createElement('div') as N;
  const changes: string[] = []; let out = 0;
  renderPasswordScreen(host, { email: 'new@test.invalid', change: async (pw) => { changes.push(pw); return { ok: true }; }, signOut: () => { out++; } });
  assert.match(host.textContent, /Придумайте пароль/);
  assert.match(host.textContent, /new@test\.invalid/);
  const form = host.querySelector('[data-testid=p2-new-password-form]');
  fill(form, 'short', 'short'); submit(form); await settle();
  assert.match(host.querySelector('[role=alert]').textContent, /не короче 8/);
  fill(form, 'Длинный-пароль', 'Другой-пароль'); submit(form); await settle();
  assert.match(host.querySelector('[role=alert]').textContent, /не совпадают/);
  assert.deepEqual(changes, []);
  fill(form, 'Длинный-пароль', 'Длинный-пароль'); submit(form); await settle();
  assert.deepEqual(changes, ['Длинный-пароль']);
  click(host.querySelector('[data-testid=p2-new-password-signout]'));
  assert.equal(out, 1);
});

test('«Придумайте пароль»: отказ — текст ошибки, форма остаётся', async () => {
  const host = win.document.createElement('div') as N;
  renderPasswordScreen(host, { email: 'x@test.invalid', change: async () => ({ ok: false, message: 'Новый пароль должен отличаться от прежнего' }), signOut: () => undefined });
  const form = host.querySelector('[data-testid=p2-new-password-form]');
  fill(form, 'Длинный-пароль', 'Длинный-пароль'); submit(form); await settle();
  assert.match(host.querySelector('[role=alert]').textContent, /отличаться/);
  assert.equal(host.querySelector('[role=alert]').hidden, false);
});

test('«Мой профиль»: ФИО и почта; «Сменить пароль» → форма → «Пароль сменён»', async () => {
  const host = win.document.createElement('div') as N;
  const changes: string[] = [];
  renderMyProfile(host, { email: 'new@test.invalid', fullName: 'Новиков Н.Н.', change: async (pw) => { changes.push(pw); return { ok: true }; } });
  assert.equal(host.querySelector('[data-testid=p2-profile-name]').textContent, 'Новиков Н.Н.');
  assert.match(host.textContent, /new@test\.invalid/);
  const form = host.querySelector('[data-testid=p2-profile-password-form]');
  assert.equal(form.hidden, true);
  click(host.querySelector('[data-testid=p2-profile-password]'));
  assert.equal(form.hidden, false);
  fill(form, 'Длинный-пароль', 'Длинный-пароль'); submit(form); await settle();
  assert.deepEqual(changes, ['Длинный-пароль']);
  assert.equal(form.hidden, true);
  assert.equal(host.querySelector('[role=status]').hidden, false);
});

test('«Мой профиль»: «Изменить ФИО» → сохранить; отказ — текст; пусто — подсказка', async () => {
  const host = win.document.createElement('div') as N;
  const names: string[] = []; let fail = '';
  renderMyProfile(host, { email: 'new@test.invalid', fullName: 'Новиков Н.Н.', change: async () => ({ ok: true }),
    saveName: async (n) => { names.push(n); return fail ? { ok: false, message: fail } : { ok: true }; } });
  const form = host.querySelector('[data-testid=p2-profile-name-form]');
  assert.equal(form.hidden, true);
  click(host.querySelector('[data-testid=p2-profile-name-edit]'));
  assert.equal(form.hidden, false);
  assert.equal(form.querySelector('[name=full_name]').value, 'Новиков Н.Н.');
  form.querySelector('[name=full_name]').value = ' ';
  submit(form); await settle();
  assert.deepEqual(names, []);
  assert.match(form.querySelector('[role=alert]').textContent, /Укажите ФИО/);
  fail = 'ФИО: от 2 до 120 знаков, буквы';
  form.querySelector('[name=full_name]').value = 'Новиков Николай';
  submit(form); await settle();
  assert.match(form.querySelector('[role=alert]').textContent, /от 2 до 120/);
  fail = '';
  submit(form); await settle();
  assert.deepEqual(names, ['Новиков Николай', 'Новиков Николай']);
  assert.equal(form.hidden, true);
});

test('setFullName: pf_set_full_name со своим id, состояние обновлено; без входа — отказ', async () => {
  const calls: Array<[string, unknown]> = [];
  let name = 'Новиков Н.Н.';
  const p = createPlatform({
    auth: { async signIn() { return { ok: true }; }, async signOut() {}, async getEmail() { return 'new@test.invalid'; }, async getAccess() { return []; } },
    rpc: async (fn, args) => { calls.push([fn, args]);
      if (fn === 'pf_set_full_name') { name = String((args as { p_full_name: string }).p_full_name); return { data: 2, error: null }; }
      if (fn === 'pf_my_profile') return { data: { user_id: 'u-1', full_name: name, must_change_password: false }, error: null };
      return { data: { companies: [] }, error: null }; },
    storage: null, pinActive: () => false
  });
  assert.equal((await p.setFullName('X')).ok, false, 'до входа');
  await p.boot();
  assert.deepEqual(await p.setFullName('Новиков Николай'), { ok: true });
  assert.deepEqual(calls.find((c) => c[0] === 'pf_set_full_name')![1], { p_user: 'u-1', p_full_name: 'Новиков Николай' });
  assert.equal(p.getState().fullName, 'Новиков Николай');
});
