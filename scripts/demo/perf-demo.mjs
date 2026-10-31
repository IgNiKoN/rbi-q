// P2-0053 доработка 2. Замер «Демо» и План/Факта у тяжёлой учётки (как владелец на боевом; heavy.mjs: 39 проектов, ~11 800 мест):
// админ платформы вне демо, обычный сотрудник с 20 объектами, посетитель демо. Стенд PGlite, боевой не используется.
// P2_PGLITE=… node scripts/demo/perf-demo.mjs [режим]; порты — P2_DEMO_API_PORT / P2_DEMO_APP_PORT.
//   (без режима)     pf_summary_portfolio / pf_my_inbox / pf_my_projects — мс (медиана из 3) и сколько объектов
//   --calls          сколько раз за вызов зовутся функции прав (has_permission, my_area, «админ ли», разбор заголовка) — до/после 058
//   --before-after   время до/после 058 на одной базе; --hdr-cost N / --cost N — разбор заголовка / проверка права стоят N мс
//   --browser        браузер: вход в демо → План/Факт → «ЖК Демо»; --slow <адрес>:<мс>[:сколько] — медленный ответ, --prewarm, --wide
import { fileURLToPath } from 'node:url';
import { demoStandWithApp } from './browser.mjs';
import { visit } from './check.mjs';

export { HEAVY, addHeavy } from './heavy.mjs';
import { HEAVY, addHeavy } from './heavy.mjs';

async function as(db, user, company) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false),
    set_config('request.jwt.claims', '${JSON.stringify({ sub: user, role: 'authenticated' })}', false),
    set_config('request.headers', '${company ? JSON.stringify({ 'x-company-id': company }) : '{}'}', false); set role authenticated;`);
}
export async function timeCall(db, user, company, sql, n = 3) {
  const ms = []; let rows = [];
  for (let i = 0; i < n; i++) {
    await as(db, user, company);
    const t = performance.now();
    rows = (await db.query(sql)).rows;
    ms.push(Math.round(performance.now() - t));
    await db.exec('reset role');
  }
  return { ms: ms.sort((a, b) => a - b)[Math.floor(n / 2)], rows };
}

/** Замер сервера: [метка, мс, сколько объектов, названия] — админ платформы (вне демо и в демо), обычный сотрудник, посетитель. */
export async function serverTimes(db, demoCompany) {
  const out = [];
  const run = async (label, user, company, fn) => {
    const r = await timeCall(db, user, company, `select project_id, name from public.${fn}()`.replace('project_id, name from public.pf_my_projects', 'id project_id, name from public.pf_my_projects'));
    out.push([label + ': ' + fn, r.ms, r.rows.length, [...new Set(r.rows.map((x) => x.name))].slice(0, 2)]);
  };
  const FNS = ['pf_summary_portfolio', 'pf_my_inbox', 'pf_my_projects'];
  for (const fn of FNS) await run('админ платформы, вне демо', HEAVY.user, HEAVY.company, fn);
  for (const fn of FNS) await run('сотрудник (20 объектов)', HEAVY.staff, HEAVY.company, fn);
  for (const role of ['management', 'project_manager']) {
    await visit(db, HEAVY.user, role);
    for (const fn of FNS) await run(`посетитель демо (${role})`, HEAVY.user, demoCompany, fn);
  }
  await db.exec(`select set_config('request.jwt.claim.sub', '${HEAVY.user}', false); select public.pf_demo_leave(); select set_config('request.jwt.claim.sub', '', false);`);
  return out;
}


/** Сколько раз за один вызов «Сводки» / «Входящих» зовутся функции прав (обёртки-счётчики на стенде; до и после 058). */
export async function callCounts(db, demoCompany, log = console.log) {
  const { readFileSync } = await import('node:fs');
  const mig = (f) => readFileSync(new URL('../../supabase/migrations/' + f, import.meta.url), 'utf8');
  const W = [['planfact.has_permission', 'p_project uuid, p_action text', 'boolean', 'p_project, p_action'],
    ['core.my_area', 'p_project uuid', 'uuid[]', 'p_project'],
    ['planfact.is_platform_admin', '', 'boolean', ''],
    ['core.request_company_text', '', 'text', '']];
  for (const [fn, args, ret, call] of W) {
    const [sch, name] = fn.split('.');
    await db.exec(`alter function ${fn}(${args}) rename to ${name}_orig;
      create function ${fn}(${args}) returns ${ret} language plpgsql stable security definer set search_path = pg_catalog as $w$
      begin perform set_config('cnt.${name}', (coalesce(nullif(current_setting('cnt.${name}', true), ''), '0')::int + 1)::text, false);
        return ${sch}.${name}_orig(${call}); end $w$;
      grant execute on function ${fn}(${args}) to authenticated, anon;`);
  }
  const run = async (label, user, company, fn) => {
    await db.exec(`reset role; ${W.map(([f]) => `select set_config('cnt.${f.split('.')[1]}', '0', false);`).join(' ')}
      select set_config('request.jwt.claim.sub', '${user}', false), set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', false),
        set_config('request.headers', '${JSON.stringify({ 'x-company-id': company })}', false); set role authenticated;`);
    const n = (await db.query(`select count(*)::int n from public.${fn}()`)).rows[0].n;
    await db.exec('reset role');
    const c = (await db.query(`select ${W.map(([f]) => `current_setting('cnt.${f.split('.')[1]}', true) "${f.split('.')[1]}"`).join(', ')}`)).rows[0];
    return [label, fn, n, ...W.map(([f]) => Number(c[f.split('.')[1]]))];
  };
  const pass = async () => {
    const out = [];
    for (const fn of ['pf_summary_portfolio', 'pf_my_inbox']) out.push(await run('админ платформы, вне демо', HEAVY.user, HEAVY.company, fn));
    for (const fn of ['pf_summary_portfolio', 'pf_my_inbox']) out.push(await run('сотрудник (20 объектов)', HEAVY.staff, HEAVY.company, fn));
    await visit(db, HEAVY.user, 'project_manager');
    for (const fn of ['pf_summary_portfolio', 'pf_my_inbox']) out.push(await run('посетитель демо (РП)', HEAVY.user, demoCompany, fn));
    await db.exec(`select set_config('request.jwt.claim.sub', '${HEAVY.user}', false); select public.pf_demo_leave(); select set_config('request.jwt.claim.sub', '', false);`);
    return out;
  };
  await db.exec(mig('058_demo_fast_down.sql')); const before = await pass();
  await db.exec(mig('058_demo_fast_up.sql')); const after = await pass();
  log('| Кто | Функция | строк | ' + W.map(([f]) => f + ' до → после').join(' | ') + ' |');
  log('|---|---|---|' + W.map(() => '---|').join(''));
  before.forEach((b, i) => log(`| ${b[0]} | ${b[1]} | ${b[2]} → ${after[i][2]} | ${W.map((_, k) => `${b[3 + k]} → ${after[i][3 + k]}`).join(' | ')} |`));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = Date.now();
  // порты — P2_DEMO_API_PORT / P2_DEMO_APP_PORT (параллельно с browser.mjs / tours.mjs)
  const st = await demoStandWithApp({ apiPort: Number(process.env.P2_DEMO_API_PORT || 18893), appPort: Number(process.env.P2_DEMO_APP_PORT || 8891) });
  try {
    const places = await addHeavy(st.db);
    const demo = (await st.db.query(`select id from core.companies where is_demo and deleted_at is null limit 1`)).rows[0].id;
    console.log(`тяжёлая учётка: мест в двух компаниях ${places}`);
    // --cost N: проверка права на проект на стенде стоит N мс, как на боевом (31.10: 70–180 мс; на PGlite — меньше 1 мс)
    const cost = process.argv.includes('--cost') ? Number(process.argv[process.argv.indexOf('--cost') + 1]) : 0;
    if (cost) await st.db.exec(`alter function planfact.has_permission(uuid, text) rename to has_permission_fast;
      create function planfact.has_permission(p_project uuid, p_action text) returns boolean language plpgsql stable security definer
        set search_path = pg_catalog, planfact, core as $c$ begin perform pg_sleep(${cost / 1000}); return planfact.has_permission_fast(p_project, p_action); end $c$;
      grant execute on function planfact.has_permission(uuid, text) to authenticated;`);
    // --hdr-cost N: разбор заголовка запроса (core.request_company_text, его зовёт проверка «админ ли платформы» в демо) стоит N мс —
    // по боевому 31.10: «Сводка» в демо (≈300 разборов на стенде) 6,5–7,3 с, вне демо (3 разбора) 0,36 с → ≈ 20 мс на разбор
    const hdr = process.argv.includes('--hdr-cost') ? Number(process.argv[process.argv.indexOf('--hdr-cost') + 1]) : 0;
    if (hdr) await st.db.exec(`alter function core.request_company_text() rename to request_company_text_fast;
      create function core.request_company_text() returns text language plpgsql stable set search_path = pg_catalog as $c$
        begin perform pg_sleep(${hdr / 1000}); return core.request_company_text_fast(); end $c$;
      revoke all on function core.request_company_text() from public, anon, authenticated;`);
    console.log(`проектов на стенде: ${(await st.db.query('select count(*)::int n from core.projects')).rows[0].n}${cost ? `, проверка права — ${cost} мс` : ''}${hdr ? `, разбор заголовка — ${hdr} мс` : ''}`);
    if (process.argv.includes('--calls')) await callCounts(st.db, demo);
    else if (process.argv.includes('--before-after')) {   // «до» — 058 откатить на этой же базе, «после» — применить снова
      const { readFileSync } = await import('node:fs');
      const mig = (f) => readFileSync(new URL('../../supabase/migrations/' + f, import.meta.url), 'utf8');
      await st.db.exec(mig('058_demo_fast_down.sql'));
      const before = await serverTimes(st.db, demo);
      await st.db.exec(mig('058_demo_fast_up.sql'));
      const after = await serverTimes(st.db, demo);
      console.log('| Кто | Функция | до 058, мс (объектов) | после 058, мс (объектов) |\n|---|---|---|---|');
      before.forEach(([l, ms, n], i) => { const [who, fn] = l.split(': '); console.log(`| ${who} | ${fn} | ${ms} (${n}) | ${after[i][1]} (${after[i][2]}) |`); });
    } else for (const [l, ms, n, names] of await serverTimes(st.db, demo)) console.log(`${l}: ${ms} мс, объектов ${n} ${JSON.stringify(names)}`);
    const delay = process.argv.includes('--delay') ? Number(process.argv[process.argv.indexOf('--delay') + 1]) : 0;
    const prewarm = process.argv.includes('--prewarm');
    const slowArg = process.argv.includes('--slow') ? process.argv[process.argv.indexOf('--slow') + 1].split(':') : null;
    const slow = slowArg ? [slowArg[0], Number(slowArg[1]), Number(slowArg[2] || 0) || Infinity] : null;
    const widths = process.argv.includes('--wide') ? [1440] : [1440, 375];
    if (process.argv.includes('--browser')) for (const w of widths) for (const role of ['management', 'project_manager']) await browserRun(st, { width: w, role, delay, prewarm, slow });
    if (process.argv.includes('--keep')) { console.log(`стенд: ${st.appUrl}, вход ${HEAVY.email}`); await new Promise(() => {}); }
  } finally {
    if (!process.argv.includes('--keep')) { await st.stopApp(); await st.stand.stop?.(); }
    console.log(`(${Math.round((Date.now() - t0) / 1000)} с)`);
  }
}

/** Браузер: тяжёлая учётка входит в демо ролью → План/Факт → «ЖК Демо»; запросы к серверу дольше 300 мс и что на экране. */
export async function browserRun(st, { width = 1440, role = 'management', log = console.log, prewarm = false, delay = 0, slow = null } = {}) {
  const { chromium } = await import('playwright-core');
  const { signIn, chooseRole } = await import('./browser.mjs');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'p2-heavy-')), { viewport: { width, height: width < 768 ? 812 : 900 },
    isMobile: width < 768, hasTouch: width < 768, locale: 'ru-RU' });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.route(/rbi-q\.ru/, (r) => r.abort());
  // медленный сервер (как боевой у большой учётки): каждый ответ /rest/v1 — позже на delay мс
  if (delay) await page.route(/\/rest\/v1\//, async (r) => { await new Promise((ok) => setTimeout(ok, delay)); await r.continue(); });
  // один медленный запрос (как «Входящие» владельца на боевом): slow = [часть адреса, мс] — только после входа в демо
  let slowOn = false;
  let slowLeft = slow ? (slow[2] || Infinity) : 0;   // slow[2] — сколько первых ответов задержать (по умолчанию все)
  if (slow) await page.route(new RegExp(slow[0]), async (r) => { if (slowOn && slowLeft > 0) { slowLeft--; await new Promise((ok) => setTimeout(ok, slow[1])); } await r.continue(); });
  const reqs = [];
  page.on('requestfinished', (r) => { const t = r.timing(); if (/\/rest\/v1\//.test(r.url())) reqs.push([Math.round(t.responseEnd), r.url().replace(/^.*\/rest\/v1\//, '').slice(0, 70), Date.now()]); });
  page.on('requestfailed', (r) => { if (/\/rest\/v1\//.test(r.url())) reqs.push([-1, 'FAILED ' + r.url().replace(/^.*\/rest\/v1\//, '').slice(0, 70), Date.now()]); });
  page.on('pageerror', (e) => log(`  [ошибка страницы] ${e.message.split('\n')[0]}`));
  await signIn(page, st.appUrl, HEAVY.email);
  if (prewarm) {   // как у владельца: сначала своя компания — План/Факт, выбран свой объект (запомнен на устройстве)
    await page.evaluate(() => { history.pushState(null, '', '#/planfact'); window.dispatchEvent(new HashChangeEvent('hashchange')); window.dispatchEvent(new PopStateEvent('popstate')); });
    for (let i = 0; i < 40 && !(await page.locator('select[data-testid=sm-project] option').count()); i++) await page.waitForTimeout(500);
    const own = await page.locator('select[data-testid=sm-project] option').allInnerTexts().catch(() => []);
    const pick = own.find((o) => /Объект 05/.test(o));
    if (pick) { await page.locator('select[data-testid=sm-project]').selectOption({ label: pick }); await page.waitForTimeout(5000); }
    const v = await page.evaluate(() => { const st = window.RBI.platform2.getState(); const c = st.companies.find((x) => x.id === st.companyId);
      return (c && c.name) + ' | ' + location.hash + ' | ' + (document.querySelector('.view-section.active') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 300); });
    log(`  своя компания: объектов в выборе ${own.length}, выбран ${pick || '—'} | ${v}`);
  }
  slowOn = true;
  await chooseRole(page, role);
  const shot = async (tag) => page.evaluate(() => ({ hash: location.hash,
    text: (document.querySelector('.view-section.active') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 220) })).then((v) => log(`  ${tag}: ${v.hash} | ${v.text}`));
  const mark = Date.now();
  await page.evaluate(() => { history.pushState(null, '', '#/planfact'); window.dispatchEvent(new HashChangeEvent('hashchange')); window.dispatchEvent(new PopStateEvent('popstate')); });
  const t0 = Date.now();
  let opts = [];
  for (let i = 0; i < 60 && !opts.some((o) => /ЖК Демо/.test(o)); i++) { await page.waitForTimeout(250); opts = await page.locator('select[data-testid=sm-project] option').allInnerTexts().catch(() => []); }
  log(`${width} ${role}: «Сводка» — выбор объекта через ${Date.now() - t0} мс: ${JSON.stringify(opts)}`);
  await shot('Сводка');
  if (opts.some((o) => /ЖК Демо/.test(o))) {
    // как человек: посмотрел «Сводку» 10 с, выбрал «Все проекты», потом «ЖК Демо»
    await page.waitForTimeout(10000);
    const silent = await page.evaluate(() => window.RBI.offlineCopy && window.RBI.offlineCopy.serverSilent());
    log(`  через 10 с: «сервер молчит» (копия вместо сервера 60 с) = ${silent}`);
    await page.locator('select[data-testid=sm-project]').selectOption({ index: 0 });
    await page.waitForTimeout(1500);
    const t1 = Date.now();
    await page.locator('select[data-testid=sm-project]').selectOption({ label: opts.find((o) => /ЖК Демо/.test(o)) });
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) { await page.waitForTimeout(250); ok = (await page.locator('[data-testid=sm-places]:visible').count()) > 0; }
    log(`${width} ${role}: «ЖК Демо» — панель ${ok ? 'открылась' : 'НЕ открылась'} через ${Date.now() - t1} мс`);
    await shot('ЖК Демо');
    await page.waitForTimeout(10000);
    const badge = await page.evaluate(() => /Нужен интернет/.test(document.body.innerText));
    log(`  ещё через 10 с: плашка «Нужен интернет» ${badge ? 'ЕСТЬ' : 'нет'}; «сервер молчит» = ${await page.evaluate(() => window.RBI.offlineCopy.serverSilent())}`);
    await page.screenshot({ path: join(tmpdir(), `p2-heavy-zhk-${role}-${width}.jpg`), type: 'jpeg', quality: 70 });
  }
  for (const [ms, u, at] of reqs) if (at >= mark && (ms > 300 || ms < 0)) log(`  запрос ${ms} мс: ${u}`);
  await page.screenshot({ path: join(tmpdir(), `p2-heavy-${role}-${width}.jpg`), type: 'jpeg', quality: 70 });
  await ctx.close();
}
