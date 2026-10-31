// P2-0053. Стенд «как боевой сервер» на локальной копии схемы (PGlite со всеми миграциями, tests/server/pglite-db.mjs):
// вход (/auth/v1), функции и таблицы (/rest/v1 — основное из PostgREST: select, фильтры, or, order, range, вставка / upsert /
// правка / удаление, rpc, Accept-Profile / Content-Profile) и файлы (/storage/v1 — положить, взять, список, ссылка).
// Права проверяет сама база: каждый запрос — в транзакции под ролью authenticated (anon) с sub учётки и заголовками запроса,
// как у PostgREST. Боевой сервер не используется. Пароли на стенде не проверяются (crypt в PGlite — заглушка): вход по почте.
// Тот же засев (scripts/demo/seed.mjs) идёт сюда и на боевой одним кодом — через supabase-js.
//
// Отдельно: node scripts/demo/stand-server.mjs [--api 8892] [--app 8891] [--load база.tgz] — сервер и статика приложения
// (config.service.js → адрес стенда). Нужен P2_PGLITE (папка с @electric-sql/pglite), см. tests/server/pglite-db.mjs.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const ident = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Вход стенда: токен без подписи (JWT alg none) — его читает только этот сервер. */
export function tokenFor(user, ttl = 3600) {
  const now = Math.floor(Date.now() / 1000);
  return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + ttl }) + '.stand';
}
function claimsOf(req) {
  const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try { const p = JSON.parse(Buffer.from(tok.split('.')[1] || '', 'base64url').toString()); return p && p.sub ? p : null; } catch { return null; }
}

/** Значение фильтра PostgREST → SQL с параметром. */
function cond(col, expr, params) {
  const c = ident(col);
  let neg = false;
  if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4); }
  const dot = expr.indexOf('.');
  const op = dot < 0 ? expr : expr.slice(0, dot);
  let v = dot < 0 ? '' : expr.slice(dot + 1);
  const p = (x) => { params.push(x); return '$' + params.length; };
  let sql;
  switch (op) {
    case 'eq': sql = `${c}::text = ${p(v)}`; break;
    case 'neq': sql = `${c}::text is distinct from ${p(v)}`; break;
    case 'gt': sql = `${c} > ${p(v)}`; break;
    case 'gte': sql = `${c} >= ${p(v)}`; break;
    case 'lt': sql = `${c} < ${p(v)}`; break;
    case 'lte': sql = `${c} <= ${p(v)}`; break;
    case 'like': sql = `${c}::text like ${p(v.replace(/\*/g, '%'))}`; break;
    case 'ilike': sql = `${c}::text ilike ${p(v.replace(/\*/g, '%'))}`; break;
    case 'is': sql = `${c} is ${v === 'null' ? 'null' : v === 'true' ? 'true' : v === 'false' ? 'false' : 'unknown'}`; break;
    case 'in': {
      const items = splitList(v.replace(/^\(/, '').replace(/\)$/, '')).map(unquote);
      sql = items.length ? `${c}::text = any(${p(items)}::text[])` : 'false';
      break;
    }
    case 'cs': sql = `${c} @> ${p(v)}`; break;
    case 'cd': sql = `${c} <@ ${p(v)}`; break;
    case 'ov': sql = `${c} && ${p(v)}`; break;
    default: throw Object.assign(new Error(`стенд: фильтр «${op}» не поддержан`), { code: 'PGRST100', status: 400 });
  }
  return neg ? `not (${sql})` : sql;
}
const unquote = (s) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1).replace(/\\"/g, '"') : s);
/** «a,b,(c,d)» → верхний уровень через запятую (скобки и кавычки — целиком). */
function splitList(s) {
  const out = []; let depth = 0, cur = '', q = false;
  for (const ch of s) {
    if (ch === '"') q = !q;
    if (!q && ch === '(') depth++;
    if (!q && ch === ')') depth--;
    if (!q && depth === 0 && ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur !== '') out.push(cur);
  return out;
}
/** or=(a.eq.1,and(b.is.null,c.gt.2)) → SQL. */
function logic(kind, body, params) {
  const parts = splitList(body.replace(/^\(/, '').replace(/\)$/, '')).map((t) => {
    const m = t.match(/^(not\.)?(and|or)\((.*)\)$/);
    if (m) { const s = logic(m[2], '(' + m[3] + ')', params); return m[1] ? `not (${s})` : s; }
    const d = t.indexOf('.');
    return cond(t.slice(0, d), t.slice(d + 1), params);
  });
  return '(' + (parts.join(kind === 'and' ? ' and ' : ' or ') || 'true') + ')';
}
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function whereOf(sp, params) {
  const w = [];
  for (const [k, v] of sp) {
    if (RESERVED.has(k)) continue;
    if (k === 'or' || k === 'and') w.push(logic(k, v, params));
    else if (k === 'not.or' || k === 'not.and') w.push(`not ${logic(k.slice(4), v, params)}`);
    else w.push(cond(k, v, params));
  }
  return w.length ? ' where ' + w.join(' and ') : '';
}
function selectList(s) {
  if (!s || s === '*') return '*';
  return splitList(s).map((x) => x.trim()).filter(Boolean).map((x) => {
    if (x.includes('(')) throw Object.assign(new Error('стенд: вложенные выборки не поддержаны: ' + x), { code: 'PGRST100', status: 400 });
    const [a, b] = x.includes(':') ? x.split(':') : [null, x];
    const [col, cast] = b.split('::');
    return (cast ? `${ident(col)}::${cast}` : ident(col)) + (a ? ' as ' + ident(a) : '');
  }).join(', ');
}
function orderOf(s) {
  if (!s) return '';
  return ' order by ' + s.split(',').map((x) => {
    const [col, ...mods] = x.split('.');
    return ident(col) + (mods.includes('desc') ? ' desc' : ' asc') + (mods.includes('nullsfirst') ? ' nulls first' : mods.includes('nullslast') ? ' nulls last' : '');
  }).join(', ');
}

const STATUS = { '42501': 403, '42P01': 404, '42883': 404, PGRST202: 404, '23505': 409, '23503': 409, P0001: 400, '22023': 400, '22P02': 400, PGRST116: 406 };

/** API стенда над базой db. Возвращает обработчик http. */
export function createApi(db, { log = null } = {}) {
  const files = new Map();   // «бакет/путь» → { body, type }
  const fnCache = new Map();

  async function as(req, fn) {
    const claims = claimsOf(req);
    const h = {};
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') h[k.toLowerCase()] = v;
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.headers', $3, true)`,
        [claims ? claims.sub : '', claims ? JSON.stringify(claims) : '', JSON.stringify(h)]);
      await tx.exec(`set local role ${claims ? 'authenticated' : 'anon'}`);
      return fn(tx, claims);
    });
  }

  async function fnInfo(schema, name, keys) {
    const ck = schema + '.' + name + '|' + keys.slice().sort().join(',');
    if (fnCache.has(ck)) return fnCache.get(ck);
    const r = await db.query(`
      select p.proretset as retset, t.typtype as rettyp, t.typname as retname,
             coalesce(p.proargnames, '{}') as names, coalesce(p.proargmodes::text[], '{}') as modes,
             array(select format_type(x, null) from unnest(p.proargtypes) x) as types, p.pronargdefaults as ndef,
             (select count(*) from unnest(coalesce(p.proargmodes::text[], '{}')) m where m in ('o', 't'))::int as nout
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
       where n.nspname = $1 and p.proname = $2`, [schema, name]);
    const cands = r.rows.map((f) => {
      const ins = f.names.filter((_, i) => !f.modes.length || ['i', 'b', 'v'].includes(f.modes[i]));
      return { ...f, ins, required: ins.slice(0, ins.length - f.ndef) };
    }).filter((f) => keys.every((k) => f.ins.includes(k)) && f.required.every((k) => keys.includes(k)));
    if (cands.length !== 1) throw Object.assign(new Error(`Could not find the function ${schema}.${name}(${keys.join(', ')})`), { code: 'PGRST202' });
    fnCache.set(ck, cands[0]);
    return cands[0];
  }
  function argSql(v, type, params) {
    if (v === null || v === undefined) return `null::${type}`;
    if (type === 'json' || type === 'jsonb') { params.push(JSON.stringify(v)); return `$${params.length}::${type}`; }
    if (type.endsWith('[]')) {
      const arr = Array.isArray(v) ? v : [v];
      params.push('{' + arr.map((x) => (x === null ? 'NULL' : '"' + String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"')).join(',') + '}');
      return `$${params.length}::${type}`;
    }
    params.push(typeof v === 'object' ? JSON.stringify(v) : String(v));
    return `$${params.length}::${type}`;
  }

  async function rpc(req, schema, name, args) {
    const keys = Object.keys(args || {}).filter((k) => args[k] !== undefined);
    const f = await fnInfo(schema, name, keys);
    const params = [];
    const list = keys.map((k) => `${ident(k)} => ${argSql(args[k], f.types[f.ins.indexOf(k)], params)}`).join(', ');
    const call = `${ident(schema)}.${ident(name)}(${list})`;
    return as(req, async (tx) => {
      if (f.retset || f.rettyp === 'c' || f.nout > 1) {
        const res = await tx.query(`select * from ${call}`, params);
        const scalar = f.rettyp !== 'c' && res.fields.length === 1 && f.nout <= 1;
        const rows = scalar ? res.rows.map((x) => Object.values(x)[0]) : res.rows;
        return f.retset ? rows : (rows[0] ?? null);
      }
      const res = await tx.query(`select ${call} as v`, params);
      return f.retname === 'void' ? null : res.rows[0].v;
    });
  }

  async function table(req, u, schema, tbl, body) {
    const sp = u.searchParams;
    const params = [];
    const t = `${ident(schema)}.${ident(tbl)}`;
    const prefer = String(req.headers.prefer || '');
    const ret = /return=representation/.test(prefer);
    if (req.method === 'GET' || req.method === 'HEAD') {
      const where = whereOf(sp, params);
      let limit = sp.get('limit'), offset = sp.get('offset');
      const range = String(req.headers.range || '').match(/^(\d+)-(\d+)?$/);
      if (range) { offset = range[1]; if (range[2]) limit = String(Number(range[2]) - Number(range[1]) + 1); }
      return as(req, async (tx) => {
        const rows = (await tx.query(`select ${selectList(sp.get('select'))} from ${t}${where}${orderOf(sp.get('order'))}${limit ? ' limit ' + Number(limit) : ''}${offset ? ' offset ' + Number(offset) : ''}`, params)).rows;
        let total = null;
        if (/count=exact/.test(prefer)) total = Number((await tx.query(`select count(*)::int n from ${t}${where}`, params)).rows[0].n);
        return { rows, total, offset: Number(offset || 0) };
      });
    }
    let data; try { data = body ? JSON.parse(body) : null; } catch { data = null; }
    if (req.method === 'POST') {
      const rows = Array.isArray(data) ? data : [data];
      if (!rows.length) return { rows: [] };
      const cols = sp.get('columns') ? sp.get('columns').split(',').map((x) => x.trim().replace(/^"|"$/g, '')) : [...new Set(rows.flatMap((r) => Object.keys(r || {})))];
      params.push(JSON.stringify(rows));
      const merge = /resolution=merge-duplicates/.test(prefer), ignore = /resolution=ignore-duplicates/.test(prefer);
      let conflict = '';
      if (merge || ignore) {
        let target = sp.get('on_conflict');
        if (!target) {
          const pk = await db.query(`select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
                                      where i.indrelid = $1::regclass and i.indisprimary`, [`${schema}.${tbl}`]);
          target = pk.rows.map((x) => x.attname).join(',');
        }
        const tcols = target.split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
        conflict = ` on conflict (${tcols.map(ident).join(', ')}) do ` + (ignore ? 'nothing' : 'update set ' + (cols.filter((c) => !tcols.includes(c)).map((c) => `${ident(c)} = excluded.${ident(c)}`).join(', ') || `${ident(tcols[0])} = excluded.${ident(tcols[0])}`));
      }
      return as(req, async (tx) => ({ rows: (await tx.query(`insert into ${t} (${cols.map(ident).join(', ')}) select ${cols.map(ident).join(', ')} from json_populate_recordset(null::${t}, $1::json)${conflict} returning *`, params)).rows, ret }));
    }
    if (req.method === 'PATCH') {
      const cols = Object.keys(data || {});
      params.push(JSON.stringify(data || {}));
      const where = whereOf(sp, params);
      if (!cols.length) return { rows: [], ret };
      return as(req, async (tx) => ({ rows: (await tx.query(`update ${t} set (${cols.map(ident).join(', ')}) = (select ${cols.map(ident).join(', ')} from json_populate_record(null::${t}, $1::json))${where} returning *`, params)).rows, ret }));
    }
    if (req.method === 'DELETE') {
      const where = whereOf(sp, params);
      return as(req, async (tx) => ({ rows: (await tx.query(`delete from ${t}${where} returning *`, params)).rows, ret }));
    }
    throw Object.assign(new Error('метод не поддержан'), { status: 405 });
  }

  // Файлы: строка storage.objects — как на сервере (её правила проверяют права), содержимое — в памяти стенда.
  async function storage(req, u, raw) {
    const p = decodeURIComponent(u.pathname.slice('/storage/v1/'.length));
    let m;
    if ((m = p.match(/^object\/list\/([^/]+)$/)) && req.method === 'POST') {
      const q = JSON.parse(raw.toString() || '{}');
      const prefix = String(q.prefix || '').replace(/\/$/, '');
      const rows = await as(req, async (tx) => (await tx.query(`select name, id, created_at, updated_at, metadata from storage.objects where bucket_id = $1 and name like $2`,
        [m[1], (prefix ? prefix + '/' : '') + '%'])).rows);
      const seen = new Map();
      for (const r of rows) {
        const rest = r.name.slice(prefix ? prefix.length + 1 : 0);
        const head = rest.split('/')[0];
        if (q.search && !head.includes(q.search)) continue;
        if (!seen.has(head)) seen.set(head, rest.includes('/') ? { name: head, id: null, metadata: null } : { name: head, id: r.id, created_at: r.created_at, updated_at: r.updated_at, metadata: r.metadata || { size: 0 } });
      }
      return { json: [...seen.values()].slice(Number(q.offset || 0), Number(q.offset || 0) + Number(q.limit || 100)) };
    }
    if ((m = p.match(/^object\/sign\/([^/]+)\/(.+)$/)) && req.method === 'POST') {
      return { json: { signedURL: `/object/sign/${m[1]}/${m[2]}?token=${encodeURIComponent(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''))}` } };
    }
    if ((m = p.match(/^object\/(?:(public|authenticated|sign)\/)?([^/]+)\/(.+)$/)) && (req.method === 'GET' || req.method === 'HEAD')) {
      const [, mode, bucket, name] = m;
      const f = files.get(bucket + '/' + name);
      const fake = mode === 'sign' ? { ...req, headers: { ...req.headers, authorization: 'Bearer ' + (u.searchParams.get('token') || '') } } : req;
      const pub = (await db.query('select public from storage.buckets where id = $1', [bucket])).rows[0]?.public;
      const ok = pub || (await as(fake, async (tx) => (await tx.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, name])).rows.length > 0));
      if (!f || !ok) return { status: 400, json: { statusCode: '404', error: 'not_found', message: 'Object not found' } };
      return { bytes: f.body, type: f.type };
    }
    if ((m = p.match(/^object\/([^/]+)\/(.+)$/)) && (req.method === 'POST' || req.method === 'PUT')) {
      const [, bucket, name] = m;
      let body = raw, type = String(req.headers['content-type'] || 'application/octet-stream');
      const bnd = type.match(/multipart\/form-data;\s*boundary=(.+)$/);
      if (bnd) {
        const parts = raw.toString('latin1').split('--' + bnd[1]);
        const filePart = parts.find((x) => /filename=|name=""/.test(x)) || parts.find((x) => x.includes('\r\n\r\n') && !/name="cacheControl"/.test(x));
        const headEnd = filePart.indexOf('\r\n\r\n');
        const ct = filePart.slice(0, headEnd).match(/Content-Type:\s*([^\r\n]+)/i);
        type = ct ? ct[1] : 'application/octet-stream';
        body = Buffer.from(filePart.slice(headEnd + 4).replace(/\r\n$/, ''), 'latin1');
      }
      const upsert = String(req.headers['x-upsert'] || '') === 'true' || req.method === 'PUT';
      await as(req, async (tx, claims) => {
        const meta = JSON.stringify({ size: body.length, mimetype: type });
        const was = upsert ? (await tx.query('update storage.objects set metadata = $3::jsonb where bucket_id = $1 and name = $2 returning 1', [bucket, name, meta])).rows.length : 0;
        if (!was) await tx.query('insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4::jsonb)', [bucket, name, claims?.sub || null, meta]);
      });
      files.set(bucket + '/' + name, { body, type });
      return { json: { Key: bucket + '/' + name, Id: name } };
    }
    if ((m = p.match(/^object\/([^/]+)$/)) && req.method === 'DELETE') {
      const q = JSON.parse(raw.toString() || '{}');
      const gone = await as(req, async (tx) => (await tx.query('delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name', [m[1], q.prefixes || []])).rows);
      for (const g of gone) files.delete(m[1] + '/' + g.name);
      return { json: gone };
    }
    if ((m = p.match(/^bucket\/?([^/]*)$/)) && req.method === 'GET') {
      const rows = (await db.query('select id, name, public from storage.buckets' + (m[1] ? ' where id = $1' : ''), m[1] ? [m[1]] : [])).rows;
      return { json: m[1] ? rows[0] || null : rows };
    }
    return { status: 400, json: { statusCode: '400', error: 'unsupported', message: 'стенд: ' + req.method + ' ' + p } };
  }

  async function auth(req, u, raw) {
    const p = u.pathname.slice('/auth/v1/'.length);
    const body = (() => { try { return JSON.parse(raw.toString() || '{}'); } catch { return {}; } })();
    const userRow = async (where, v) => (await db.query(`select id::text, email, created_at, raw_app_meta_data, raw_user_meta_data from auth.users where ${where}`, [v])).rows[0] || null;
    const shape = (x) => ({ id: x.id, aud: 'authenticated', role: 'authenticated', email: x.email, email_confirmed_at: x.created_at,
      app_metadata: x.raw_app_meta_data || { provider: 'email', providers: ['email'] }, user_metadata: x.raw_user_meta_data || {}, created_at: x.created_at, identities: [] });
    const session = (x) => ({ access_token: tokenFor(x), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'stand-' + x.id, user: shape(x) });
    if (p === 'token') {
      const grant = u.searchParams.get('grant_type');
      let x = null;
      if (grant === 'password') x = await userRow('lower(email) = lower($1)', String(body.email || ''));
      if (grant === 'refresh_token' && /^stand-/.test(String(body.refresh_token || ''))) x = await userRow('id = $1::uuid', String(body.refresh_token).slice(6));
      if (!x) return { status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 400 } };
      return { json: session(x) };
    }
    const claims = claimsOf(req);
    if (p === 'user') {
      const x = claims && await userRow('id = $1::uuid', claims.sub);
      if (!x) return { status: 401, json: { msg: 'invalid JWT', code: 401 } };
      return { json: shape(x) };
    }
    if (p === 'logout') return { status: 204 };
    return { status: 404, json: { msg: 'стенд: ' + p } };
  }

  return async function handle(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'content-range, x-total-count');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const u = new URL(req.url, 'http://stand.local');
    const send = (code, body, extra = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...extra }); res.end(body === undefined ? '' : JSON.stringify(body)); };
    try {
      if (log) log(req.method + ' ' + u.pathname + u.search.slice(0, 80));
      if (u.pathname.startsWith('/auth/v1/')) { const r = await auth(req, u, raw); return r.status === 204 ? (res.writeHead(204), res.end()) : send(r.status || 200, r.json); }
      if (u.pathname.startsWith('/storage/v1/')) {
        const r = await storage(req, u, raw);
        if (r.bytes) { res.writeHead(200, { 'Content-Type': r.type || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' }); return res.end(r.bytes); }
        return send(r.status || 200, r.json);
      }
      const m = u.pathname.match(/^\/rest\/v1\/(rpc\/)?([A-Za-z0-9_]+)$/);
      if (!m) return send(404, { message: 'not found' });
      const schema = String((req.method === 'GET' || req.method === 'HEAD' ? req.headers['accept-profile'] : req.headers['content-profile']) || req.headers['accept-profile'] || 'public');
      const single = /vnd\.pgrst\.object/.test(String(req.headers.accept || ''));
      if (m[1]) {
        let args = {};
        if (req.method === 'GET') args = Object.fromEntries(u.searchParams); else { try { args = raw.length ? JSON.parse(raw.toString()) : {}; } catch { args = {}; } }
        const data = await rpc(req, schema, m[2], args);
        return send(200, single && Array.isArray(data) ? data[0] ?? null : data);
      }
      const r = await table(req, u, schema, m[2], raw.toString());
      if (req.method === 'GET' || req.method === 'HEAD') {
        const extra = { 'Content-Range': `${r.offset}-${Math.max(r.offset + r.rows.length - 1, r.offset)}/${r.total ?? '*'}` };
        if (single) { if (r.rows.length !== 1) return send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${r.rows.length} rows` }); return send(200, r.rows[0], extra); }
        return send(200, r.rows, extra);
      }
      if (!r.ret) { res.writeHead(req.method === 'POST' ? 201 : 204); return res.end(); }
      return send(req.method === 'POST' ? 201 : 200, single ? r.rows[0] ?? null : r.rows);
    } catch (e) {
      const code = e.code || 'XX000';
      return send(e.status || STATUS[code] || 400, { code, message: e.message, details: e.detail || null, hint: e.hint || null });
    }
  };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.map': 'application/json', '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.xlsx': 'application/octet-stream' };

/** Статика приложения из папки репозитория; config.service.js — адрес стенда вместо боевого. */
export function createApp(apiUrl, root = ROOT) {
  return async function app(req, res) {
    const u = new URL(req.url, 'http://app.local');
    let p = normalize(decodeURIComponent(u.pathname));
    if (p.endsWith('/')) p += 'index.html';
    if (/\/\./.test(p)) { res.writeHead(404); return res.end('not found'); }
    const f = join(root, p);
    if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
    try {
      if (!(await stat(f)).isFile()) throw new Error('dir');
      let data = await readFile(f);
      if (p === '/js/services/config.service.js') data = Buffer.from(data.toString('utf8').replace("P2_SUPABASE_URL: 'https://api.rbi-q.ru'", `P2_SUPABASE_URL: '${apiUrl}'`));
      res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch { res.writeHead(404); res.end('not found'); }
  };
}

/** База стенда: все миграции (или сохранённая база) — PGlite. */
export async function standDb(load = null) {
  const { serverDb, loadPGlite } = await import(pathToFileURL(join(ROOT, 'tests/server/pglite-db.mjs')).href);
  if (!load) return serverDb();
  const PGlite = await loadPGlite();
  return new PGlite({ loadDataDir: new Blob([readFileSync(load)]) });
}

export async function startStand({ db, apiPort = 8892, appPort = 8891, log = null }) {
  const apiUrl = 'http://localhost:' + apiPort;
  const servers = [http.createServer(createApi(db, { log })), appPort ? http.createServer(createApp(apiUrl)) : null].filter(Boolean);
  await new Promise((r) => servers[0].listen(apiPort, r));
  if (servers[1]) await new Promise((r) => servers[1].listen(appPort, r));
  return { apiUrl, appUrl: appPort ? 'http://localhost:' + appPort : null, stop: () => Promise.all(servers.map((s) => new Promise((r) => { s.closeAllConnections?.(); s.close(() => r()); }))) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (n, d) => (a.includes(n) ? a[a.indexOf(n) + 1] : d);
  const db = await standDb(opt('--load', null));
  const s = await startStand({ db, apiPort: Number(opt('--api', 8892)), appPort: Number(opt('--app', 8891)), log: a.includes('--log') ? (x) => console.log(x) : null });
  console.log(`стенд: приложение ${s.appUrl}, сервер ${s.apiUrl} (Ctrl+C — стоп)`);
}
