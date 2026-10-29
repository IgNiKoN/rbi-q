// P2-0061: локальная копия схемы и правил сервера в PGlite — все миграции *_up.sql по порядку + модели «только для PGlite»
// (роли и auth — 015_rbi_model, public-таблицы Качества — 018_public_model, Storage — 018d_storage_model, auth GoTrue — 032_auth_model).
// Боевой сервер не используется. PGlite в репозиторий не входит: путь к пакету — P2_PGLITE (папка с node_modules/@electric-sql/pglite).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MIG = join(ROOT, 'supabase/migrations');
const SRV = join(ROOT, 'tests/server');
/** Модель «только для PGlite» — перед миграцией с этим номером. */
const MODELS = { '001': ['015_rbi_model.pglite.sql'], '018': ['018_public_model.pglite.sql'], '018d': ['018d_storage_model.pglite.sql'], '032': ['032_auth_model.pglite.sql'] };

export async function loadPGlite() {
  const base = process.env.P2_PGLITE;
  if (!base) throw new Error('нет P2_PGLITE: папка, где установлен @electric-sql/pglite (npm i @electric-sql/pglite@0.3.2)');
  const mod = await import(pathToFileURL(join(base, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
  return mod.PGlite;
}

/** Номер миграции: «018d_quality_storage_up.sql» → «018d». */
const num = (f) => f.split('_')[0];

/** База со всеми миграциями до (включительно) upto; по умолчанию — все. */
export async function serverDb({ upto } = {}) {
  const PGlite = await loadPGlite();
  const db = new PGlite();
  // «040a_…» раньше «040a1_…» (порядок, в котором миграции применялись на сервере)
  const key = (f) => f.replace(/_/g, ' ');
  const ups = readdirSync(MIG).filter((f) => f.endsWith('_up.sql')).sort((a, b) => (key(a) < key(b) ? -1 : 1));
  const done = new Set();
  // роли Supabase, которых нет в чистом Postgres (на сервере их создаёт платформа)
  await db.exec(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then create role supabase_storage_admin nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'postgres') then create role postgres; end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  -- pgcrypto в PGlite не подключён: 032 (пароли сотрудников) зовёт эти функции — заглушки только для локальной копии
  create schema if not exists extensions;
  create or replace function extensions.gen_random_bytes(n int) returns bytea language sql volatile as
    $f$ select substring(decode(md5(random()::text) || md5(random()::text) || md5(random()::text) || md5(random()::text), 'hex') from 1 for n) $f$;
  create or replace function extensions.gen_salt(t text) returns text language sql volatile as $f$ select '$pglite$' || md5(random()::text) $f$;
  create or replace function extensions.crypt(p text, salt text) returns text language sql immutable as $f$ select salt || md5(salt || p) $f$;
  grant usage on schema extensions to anon, authenticated, service_role;`);
  for (const f of ups) {
    const n = num(f);
    if (upto && n > upto) break;
    for (const m of MODELS[n] || []) if (!done.has(m)) { await run(db, join(SRV, m), m); done.add(m); }
    await run(db, join(MIG, f), f);
  }
  return db;
}

async function run(db, path, name) {
  try { await db.exec(readFileSync(path, 'utf8')); } catch (e) { throw new Error(`${name}: ${e.message}`); }
}
