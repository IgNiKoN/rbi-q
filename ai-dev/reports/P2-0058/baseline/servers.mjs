// Стенд офлайн-проверки: статика приложения (8881, config → подставной сервер) + подставной Supabase (8882).
// Запуск из сценария: start() / stop(). Боевой сервер не трогается (api.rbi-q.ru в браузере отрезан).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { homedir } from 'node:os';

const ROOT = join(homedir(), 'dev/platform-2-core');
export const APP = 'http://localhost:8881';
export const API = 'http://localhost:8882';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.map': 'application/json', '.jpg': 'image/jpeg', '.pdf': 'application/pdf' };

export const log = [];
export const marks = [];
const COMPANY = { id: '11111111-2222-3333-4444-555555555555', name: 'Тест-Строй', is_test: true, roles: ['Руководство'], modules: ['quality', 'construction', 'planfact'], can_manage_company: true };
const USER = { id: 'u-1', email: 'test@stand.local', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function session(ttl = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  return { access_token: b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: USER.id, email: USER.email, role: 'authenticated', aud: 'authenticated', exp }) + '.sig',
    token_type: 'bearer', expires_in: ttl, expires_at: exp, refresh_token: 'rt-' + exp, user: USER };
}
const RPC = {
  pf_my_platform: () => ({ is_platform_admin: false, companies: [COMPANY] }),
  pf_my_profile: () => ({ full_name: 'Иванов Иван', must_change_password: false, user_id: USER.id }),
  pf_company_projects: () => [{ id: 'p-1', name: 'ЖК Тестовый', archived_at: null }],
  pf_my_projects: () => [{ id: 'p-1', name: 'ЖК Тестовый', company_id: COMPANY.id }],
  my_access: () => ({ actions: ['quality.manage', 'quality.edit', 'quality.view', 'construction.manage', 'construction.view', 'construction.edit'], templates: [], projects: null, contractor: null, objects: null, container: null })
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'content-range, x-total-count');
}
const json = (res, code, body, extra = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...extra }); res.end(JSON.stringify(body)); };

function api(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const u = new URL(req.url, API);
    log.push(req.method + ' ' + u.pathname + u.search.slice(0, 60));
    const mk = body.match(/(ONLINE|OFFLINE)-MARK/g); if (mk) marks.push(req.method + ' ' + u.pathname + ' ' + [...new Set(mk)].join(','));
    if (u.pathname === '/auth/v1/token') return json(res, 200, session());
    if (u.pathname === '/auth/v1/user') return json(res, 200, USER);
    if (u.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end(); }
    const m = u.pathname.match(/^\/rest\/v1\/rpc\/([a-z_0-9]+)/);
    if (m) return json(res, 200, RPC[m[1]] ? RPC[m[1]]() : null);
    if (u.pathname.startsWith('/rest/v1/')) {
      if (req.method === 'GET' || req.method === 'HEAD') return json(res, 200, [], { 'Content-Range': '*/0' });
      return json(res, 201, []);
    }
    if (u.pathname.startsWith('/storage/v1/')) return json(res, 200, []);
    json(res, 404, { message: 'not found' });
  });
}

async function app(req, res) {
  const u = new URL(req.url, APP);
  let p = normalize(decodeURIComponent(u.pathname));
  if (p.endsWith('/')) p += 'index.html';
  const f = join(ROOT, p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    if (!(await stat(f)).isFile()) throw new Error('dir');
    let data = await readFile(f);
    if (p === '/js/services/config.service.js') data = Buffer.from(data.toString('utf8').replace("P2_SUPABASE_URL: 'https://api.rbi-q.ru'", `P2_SUPABASE_URL: '${API}'`));
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}

let servers = [];
export async function start() {
  servers = [http.createServer(app), http.createServer(api)];
  await Promise.all([new Promise((r) => servers[0].listen(8881, r)), new Promise((r) => servers[1].listen(8882, r))]);
}
export async function stop() {
  await Promise.all(servers.map((s) => new Promise((r) => { s.closeAllConnections?.(); s.close(() => r()); })));
  servers = [];
}
