// P2-0058: стенд «без сети» — статика приложения из этой папки (config → подставной сервер) + подставной Supabase.
// Боевой сервер не трогается: в браузере rbi-q.ru отрезан (lib.mjs). Основа — reports/P2-0058/baseline/servers.mjs.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const APP_PORT = Number(process.env.P2_OFFLINE_APP_PORT || 8891);
const API_PORT = Number(process.env.P2_OFFLINE_API_PORT || 8892);
export const APP = 'http://localhost:' + APP_PORT;
export const API = 'http://localhost:' + API_PORT;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.map': 'application/json', '.jpg': 'image/jpeg', '.pdf': 'application/pdf' };

/** Журнал запросов к подставному серверу и записи-метки (…-MARK), дошедшие до него. */
export const log = [];
export const marks = [];
/** Поведение сервера в сценарии: refresh — 'ok' | 'invalid_grant' (вход недействителен). */
export const mode = { refresh: 'ok' };

export const COMPANY = { id: '11111111-2222-3333-4444-555555555555', name: 'Тест-Строй', is_test: true, roles: ['Руководство'], modules: ['quality', 'construction', 'planfact'], can_manage_company: true };
export const USER = { id: 'u-1', email: 'test@stand.local', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
export const USER2 = { ...USER, id: 'u-2', email: 'other@stand.local' };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function session(user, ttl = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  return { access_token: b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp }) + '.sig',
    token_type: 'bearer', expires_in: ttl, expires_at: exp, refresh_token: 'rt-' + user.id + '-' + exp, user };
}
const ACCESS = { actions: ['quality.manage', 'quality.edit', 'quality.view', 'construction.manage', 'construction.view', 'construction.edit'], templates: [], projects: null, contractor: null, objects: null, container: null };
const RPC = {
  pf_my_platform: (u) => ({ is_platform_admin: false, companies: u.id === USER.id ? [COMPANY] : [] }),
  pf_my_profile: (u) => ({ full_name: u.id === USER.id ? 'Иванов Иван' : 'Петров Пётр', must_change_password: false, user_id: u.id }),
  pf_company_projects: () => [{ id: 'p-1', name: 'ЖК Тестовый', archived_at: null }],
  pf_my_projects: () => [{ id: 'p-1', name: 'ЖК Тестовый', company_id: COMPANY.id }],
  my_access: () => ACCESS
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'content-range, x-total-count');
}
const json = (res, code, body, extra = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...extra }); res.end(JSON.stringify(body)); };
function who(req, body) {
  const tok = String(req.headers.authorization || '').replace(/^Bearer /, '');
  try { const p = JSON.parse(Buffer.from(tok.split('.')[1] || '', 'base64url').toString()); if (p.sub === USER2.id) return USER2; } catch { /* anon */ }
  if (/other@stand\.local|rt-u-2-/.test(body)) return USER2;
  return USER;
}

function api(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const u = new URL(req.url, API);
    log.push(req.method + ' ' + u.pathname + u.search.slice(0, 60));
    const mk = body.match(/[A-Z]+-MARK/g); if (mk && req.method !== 'GET') marks.push(req.method + ' ' + u.pathname + ' ' + [...new Set(mk)].join(','));
    const user = who(req, body);
    if (u.pathname === '/auth/v1/token') {
      if (u.searchParams.get('grant_type') === 'refresh_token' && mode.refresh === 'invalid_grant') {
        return json(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found', error: 'invalid_grant' });
      }
      return json(res, 200, session(user));
    }
    if (u.pathname === '/auth/v1/user') return json(res, 200, user);
    if (u.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end(); }
    const m = u.pathname.match(/^\/rest\/v1\/rpc\/([a-z_0-9]+)/);
    if (m) return json(res, 200, RPC[m[1]] ? RPC[m[1]](user) : null);
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
  await Promise.all([new Promise((r) => servers[0].listen(APP_PORT, r)), new Promise((r) => servers[1].listen(API_PORT, r))]);
}
export async function stop() {
  await Promise.all(servers.map((s) => new Promise((r) => { s.closeAllConnections?.(); s.close(() => r()); })));
  servers = [];
}
