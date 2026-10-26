/**
 * Unit: pf-ai — серверная проверка учётки и права перед вызовом DeepSeek (P2-0034). Сеть подменена.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHandler } from '../pf-ai/handler.ts';

const COMPANY = '11111111-2222-3333-4444-555555555555';
const ENV: Record<string, string> = { SUPABASE_URL: 'http://kong:8000', SUPABASE_ANON_KEY: 'anon', DEEPSEEK_API_KEY: 'ds-key' };

type Call = { url: string; init: RequestInit };

/** Подставной сервер: токен «good» — учётка есть; право quality.ai — по флагу; модуль «ИИ» у компании — по флагу; DeepSeek отвечает текстом. */
function fakeServer(opts: { allowed?: boolean; module?: boolean; dsStatus?: number } = {}) {
  const calls: Call[] = [];
  const doFetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const h = new Headers(init.headers);
    if (url.endsWith('/auth/v1/user')) {
      return h.get('Authorization') === 'Bearer good'
        ? new Response(JSON.stringify({ id: 'u1' }), { status: 200 })
        : new Response('{}', { status: 401 });
    }
    if (url.endsWith('/rest/v1/rpc/can')) {
      const args = JSON.parse(String(init.body));
      const ok = opts.allowed !== false && args.p_company === h.get('x-company-id') && args.p_actions.join() === 'quality.ai';
      return new Response(JSON.stringify(ok), { status: 200 });
    }
    if (url.endsWith('/rest/v1/rpc/pf_my_platform')) {
      const mods = opts.module === false ? ['quality'] : ['quality', 'ai'];
      return new Response(JSON.stringify({ companies: [{ id: COMPANY, modules: mods }, { id: 'other', modules: ['ai'] }] }), { status: 200 });
    }
    if (url.startsWith('https://api.deepseek.com/')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ответ' } }] }), { status: opts.dsStatus ?? 200 });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  return { calls, handler: createHandler((k) => ENV[k], doFetch) };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://x/pf-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer good', 'x-company-id': COMPANY, ...headers },
    body: JSON.stringify(body),
  });
}

const MSG = { messages: [{ role: 'user', content: 'привет' }] };

describe('pf-ai', () => {
  it('OPTIONS — CORS с x-company-id', async () => {
    const r = await fakeServer().handler(new Request('http://x', { method: 'OPTIONS' }));
    assert.equal(r.status, 200);
    assert.match(r.headers.get('Access-Control-Allow-Headers') || '', /x-company-id/);
    assert.equal(r.headers.get('x-pf-ai-version'), '3');
  });

  it('без токена → 401, DeepSeek не вызывается', async () => {
    const s = fakeServer();
    const r = await s.handler(post(MSG, { Authorization: '' }));
    assert.equal(r.status, 401);
    assert.equal(s.calls.length, 0);
  });

  it('просроченный/чужой токен (в т. ч. старый корпоративный пароль) → 401', async () => {
    const s = fakeServer();
    const r = await s.handler(post(MSG, { Authorization: 'Bearer 12345' }));
    assert.equal(r.status, 401);
    assert.ok(!s.calls.some((c) => c.url.includes('deepseek')));
  });

  it('без компании → 403', async () => {
    const r = await fakeServer().handler(post(MSG, { 'x-company-id': 'nope' }));
    assert.equal(r.status, 403);
  });

  it('модуль «ИИ-помощник» выключен у компании (P2-0031) → 403, DeepSeek не вызывается', async () => {
    const s = fakeServer({ module: false });
    const r = await s.handler(post(MSG));
    assert.equal(r.status, 403);
    assert.match((await r.json()).error, /выключен для вашей компании/);
    assert.ok(!s.calls.some((c) => c.url.includes('deepseek')));
    const pm = s.calls.find((c) => c.url.endsWith('/rpc/pf_my_platform'));
    assert.equal(new Headers(pm!.init.headers).get('Authorization'), 'Bearer good', 'модуль проверяется от имени пользователя');
  });

  it('модуль включён у другой компании, но не у этой → 403', async () => {
    const s = fakeServer({ module: false });
    const r = await s.handler(post(MSG));
    assert.equal(r.status, 403);
  });

  it('нет права «ИИ-помощник» (или не член компании) → 403 с понятным текстом', async () => {
    const s = fakeServer({ allowed: false });
    const r = await s.handler(post(MSG));
    assert.equal(r.status, 403);
    assert.match((await r.json()).error, /ИИ-помощник/);
    assert.ok(!s.calls.some((c) => c.url.includes('deepseek')));
  });

  it('учётка и компания в порядке → ответ ИИ в прежнем формате', async () => {
    const s = fakeServer();
    const r = await s.handler(post(MSG));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).choices[0].message.content, 'ответ');
    const rpc = s.calls.find((c) => c.url.includes('/rpc/'))!;
    const h = new Headers(rpc.init.headers);
    assert.equal(h.get('Authorization'), 'Bearer good', 'права проверяются от имени пользователя');
    assert.equal(h.get('Content-Profile'), 'quality');
    assert.deepEqual(JSON.parse(String(rpc.init.body)), { p_company: COMPANY, p_project: null, p_actions: ['quality.ai'] });
  });

  it('имя инженера, код объекта, пароль и модель из запроса не передаются; max_tokens ≤ 2000', async () => {
    const s = fakeServer();
    await s.handler(post({ ...MSG, engineer_name: 'Иванов', project_code: 'rbi-test', password: 'x', model: 'deepseek-reasoner', max_tokens: 99999 }));
    const ds = s.calls.find((c) => c.url.includes('deepseek'))!;
    const sent = JSON.parse(String(ds.init.body));
    assert.deepEqual(Object.keys(sent).sort(), ['max_tokens', 'messages', 'model', 'temperature']);
    assert.equal(sent.model, 'deepseek-chat');
    assert.equal(sent.max_tokens, 2000);
    assert.equal(new Headers(ds.init.headers).get('Authorization'), 'Bearer ds-key');
  });

  it('пустой запрос → 400; DeepSeek с ошибкой → 502', async () => {
    assert.equal((await fakeServer().handler(post({ messages: [] }))).status, 400);
    assert.equal((await fakeServer({ dsStatus: 500 }).handler(post(MSG))).status, 502);
  });

  it('сервер без ключа DeepSeek → 500 «не настроен»', async () => {
    const h = createHandler((k) => (k === 'DEEPSEEK_API_KEY' ? undefined : ENV[k]), (async () => new Response('{}')) as typeof fetch);
    const r = await h(post(MSG));
    assert.equal(r.status, 500);
    assert.match((await r.json()).error, /не настроен/);
  });
});
