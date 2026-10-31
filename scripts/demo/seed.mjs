// P2-0053. «ЖК Демо» кнопки «Демо» — одной командой, с теми же числами при каждом запуске (данные — data/demo.json, «зерно»
// фиксированное, даты — от --today). Пишет только функциями и таблицами сервера, которые зовут экраны, под учётками ролей
// демо-компании zd-dd-…@demo.invalid (права проверяет сервер; MODULES §9 п. 11). Боевой и стенд — один код (supabase-js).
//
// Боевой (по «Автономии» карточки P2-0053): 057 → SQL учёток (node scripts/demo/accounts.mjs) → node scripts/demo/seed.mjs [--today ГГГГ-ММ-ДД]
//   адрес и ключ — P2_SUPABASE_URL / P2_SUPABASE_ANON_KEY из .env.local (как приложение), пароль — P2_ZHK_DEMO_PASSWORD.
// Стенд (PGlite, без сети): node scripts/demo/stand.mjs — поднимает базу, учётки и вызывает runSeed сам.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DATA, emailOf, readEnv } from './accounts.mjs';
import { seedCore } from './steps/core.mjs';
import { seedPlanfact } from './steps/planfact.mjs';
import { seedQuality } from './steps/quality.mjs';

const require = createRequire(import.meta.url);

export function supabaseFactory() {
  // одна копия библиотеки — из node_modules приложения
  const { createClient } = require('@supabase/supabase-js');
  return createClient;
}

/** Детерминированный генератор (mulberry32) — «зерно» засева: одинаковые числа при каждом запуске. */
export function rng(seed = 53) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Наполнение. url / anonKey — сервер (стенд или боевой), password — пароль демо-учёток. Возвращает сводку для проверок. */
export async function runSeed({ url, anonKey, password, today = null, log = console.log }) {
  const createClient = supabaseFactory();
  const clients = new Map();
  /** Клиент под учёткой роли (вход один раз на роль). */
  async function as(user) {
    if (clients.has(user)) return clients.get(user);
    const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email: emailOf(user), password });
    if (error) throw new Error(`вход ${emailOf(user)}: ${error.message}`);
    clients.set(user, c);
    return c;
  }
  /** Клиент Качества и Стройконтроля: заголовок x-company-id (как мост Качества в приложении) — компанию строки ставит сервер. */
  const qclients = new Map();
  async function asCompany(user, company) {
    const k = user + '|' + company;
    if (qclients.has(k)) return qclients.get(k);
    const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { 'x-company-id': company } } });
    const { error } = await c.auth.signInWithPassword({ email: emailOf(user), password });
    if (error) throw new Error(`вход ${emailOf(user)}: ${error.message}`);
    qclients.set(k, c);
    return c;
  }
  const ok = (r, what) => {
    if (!r || r.error) throw new Error(`${what}: ${r && r.error ? r.error.message : 'нет ответа'}`);
    return r.data;
  };
  const base = today || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) throw new Error('--today — дата ГГГГ-ММ-ДД');
  if (base > new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10)) throw new Error('--today не позже сегодняшнего дня: сервер не принимает факт в будущем');
  const day = (d) => { const t = new Date(base + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
  const ctx = { DATA, as, asCompany, ok, day, log, rand: rng(53), url, today: base };
  const core = await seedCore(ctx);
  const planfact = await seedPlanfact(ctx, core);
  const quality = await seedQuality(ctx, core, planfact);
  for (const c of [...clients.values(), ...qclients.values()]) await c.auth.signOut().catch(() => {});
  return { today: base, core: core.summary, planfact: planfact.summary, quality: quality.summary };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (n) => (a.includes(n) ? a[a.indexOf(n) + 1] : null);
  const env = readEnv();
  try {
    if (!env.P2_SUPABASE_URL || !env.P2_SUPABASE_ANON_KEY || !env.P2_ZHK_DEMO_PASSWORD) throw new Error('Нет P2_SUPABASE_URL, P2_SUPABASE_ANON_KEY или P2_ZHK_DEMO_PASSWORD в .env.local');
    const s = await runSeed({ url: env.P2_SUPABASE_URL, anonKey: env.P2_SUPABASE_ANON_KEY, password: env.P2_ZHK_DEMO_PASSWORD, today: opt('--today') });
    console.log('Готово:', JSON.stringify(s));
    process.exit(0);
  } catch (e) {
    console.error('ОШИБКА:', e.message);
    process.exit(1);
  }
}
