// P2-0068: скорость основных экранов на слабом телефоне (основа — замер Архитектора 29.10.2026, reports/P2-0068/baseline/). Запуск из корня репозитория.
// Стенд «без сети» (подставной сервер) + наполнение крупным объектом: 3 секции × 25 этажей × 12 квартир = 900 квартир, 4500 позиций ВОР.
// node tests/perf/screens-weak.mjs --cpu 6 [--only planfact] [--width 1440 — экран ПК, по умолчанию телефон 375 px] [--shots end] [--check positions — сценарий карточки P2-0068 на том же наполнении, лучше с --width 1440] [--out папка]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { start, stop, APP, API, COMPANY } from '../offline/servers.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const CPU = Number(opt('cpu', 6));
const OUT = opt('out', 'perf-out');
const QUALITY_N = Number(opt('quality', 1000));
const WIDTH = Number(opt('width', 375));
const SHOT_END = opt('shots') === 'end';
mkdirSync(OUT, { recursive: true });

// ---- наполнение: дерево мест и позиции
const SECTIONS = 3, FLOORS = 25, APTS = 12;
const WT = [['wt1', 'Штукатурка стен', 'м2', 60], ['wt2', 'Стяжка пола', 'м2', 45], ['wt3', 'Электромонтаж', 'точка', 30], ['wt4', 'Сантехника', 'шт', 8], ['wt5', 'Окна', 'шт', 4]];
const nodes = [];
const add = (n) => { nodes.push(n); return n; };
const root = add({ id: 'o1', parent_id: null, node_type: 'object', object_kind: 'residential', name: 'Корпус 1', path: 'Корпус 1', depth: 0 });
for (let s = 1; s <= SECTIONS; s++) {
  const sec = add({ id: `s${s}`, parent_id: root.id, node_type: 'section', name: `Секция ${s}`, path: `${root.path} · Секция ${s}`, depth: 1 });
  for (let f = 1; f <= FLOORS; f++) {
    const fl = add({ id: `s${s}f${f}`, parent_id: sec.id, node_type: 'floor', name: `эт. ${f}`, path: `${sec.path} · эт. ${f}`, depth: 2 });
    for (let a = 1; a <= APTS; a++) {
      const no = ((s - 1) * FLOORS + (f - 1)) * APTS + a;
      add({ id: `s${s}f${f}a${a}`, parent_id: fl.id, node_type: 'apartment', name: `кв. ${no}`, path: `${fl.path} · кв. ${no}`, depth: 3, build_no: String(no), bti_no: String(no), area: 40 + (no % 50), rooms: no % 4 });
    }
  }
}
nodes.forEach((n, i) => { n.sort_order = i; n.child_count = nodes.filter((c) => c.parent_id === n.id).length; n.area = n.area ?? null; n.build_no = n.build_no ?? null; n.bti_no = n.bti_no ?? null;
  n.object_kind = n.object_kind ?? null; n.apartment_count = n.node_type === 'apartment' ? null : 0; n.rooms = n.rooms ?? null; });
const apts = nodes.filter((n) => n.node_type === 'apartment');
const vorPos = [], factPos = [];
apts.forEach((n, i) => WT.forEach(([wid, wname, unit, qty], j) => {
  const id = `pos-${i}-${j}`;
  vorPos.push({ id, location_id: n.id, location_path: n.path, work_type_id: wid, work_type: wname, unit_code: unit, qty, apartments_note: null, import_id: 'imp1', file_name: 'ВОР корпус 1.xlsx', source_row_no: i * 5 + j + 2, withdrawn: false, revision_no: 1 });
  factPos.push({ position_id: id, location_id: n.id, location_path: n.path, location_type: 'apartment', work_type_id: wid, work_name: wname, unit_code: unit, plan_qty: qty,
    fact_qty: (i * 7 + j * 13) % 3 === 0 ? qty : (i % 5) * qty / 5, pending_qty: i % 11 === 0 ? 1 : 0, pending_count: i % 11 === 0 ? 1 : 0, last_rejected_note: null, withdrawn: false });
}));
const children = (p) => nodes.filter((n) => n.parent_id === (p ?? null));
const byLoc = (list, loc, key = 'location_id') => {
  if (!loc) return list;
  const ids = new Set([loc]); let grew = true;
  while (grew) { grew = false; for (const n of nodes) if (n.parent_id && ids.has(n.parent_id) && !ids.has(n.id)) { ids.add(n.id); grew = true; } }
  return list.filter((p) => ids.has(p[key]));
};
const PERMS = ['planfact.works.edit', 'planfact.money.view', 'planfact.audit.view', 'planfact.projects.manage', 'planfact.units.manage',
  'planfact.vor.import', 'planfact.vor.manage', 'planfact.fact.add', 'planfact.fact.view', 'planfact.fact.create', 'planfact.fact.approve', 'planfact.estimate.view', 'planfact.ks2.view'];
const SEED = {
  pf_my_permissions: () => PERMS,
  pf_my_area: () => ({ full: true, locations: [], fact_owner: ['project'], can_on_behalf: true }),
  pf_my_company_access: () => [{ company_id: COMPANY.id, company_name: COMPANY.name, can_manage_projects: true, can_manage_units: true, can_manage_roles: true, can_manage_counterparties: true }],
  pf_list_locations: (a) => children(a.p_parent),
  pf_project_places: (a) => children(a.p_parent),
  pf_vor_positions: (a) => byLoc(vorPos, a.p_location),
  pf_fact_positions: (a) => byLoc(factPos, a.p_location),
  pf_project_catalog: () => [{ id: 'p-1', project_id: 'p-1', name: 'ЖК Тестовый', company_id: COMPANY.id, archived_at: null, code: 'ЖК-1', division_id: null, division_name: null, address: 'г. Тест', planned_start: null, planned_finish: null,
    manager_user_id: null, manager_name: null, stage: 'construction', our_role: null, timezone: 'Europe/Moscow', country: 'RU', object_count: 1, place_count: nodes.length, places_led_by_quality: false }],
  pf_summary_portfolio: () => [{ project_id: 'p-1', name: 'ЖК Тестовый', code: 'ЖК-1', planned_start: '2026-03-01', planned_finish: '2027-06-30', can_money: true, can_manage: true, has_kp: false,
    plan_money: null, done_money: null, issued_money: null, gap_money: null, pct_money: null, pace7: 1.2, pace14: 1.1, need_pace: 1.4, days_left: 240, forecast_finish: '2027-08-01',
    light: 'yellow', light_reason: 'lag', unpriced_rows: 0, positions: vorPos.length, pending: 82, plan_pct_today: 48, lag_pp: 9, lag_days: 21, pace_verdict: 'slow', work_days_left: 170,
    light_yellow_pp: 5, light_red_pp: 15, light_overdue_days: 0, can_thresholds: true }],
  pf_summary_positions: (a) => factPos.filter((p) => !a.p_work_type || p.work_type_id === a.p_work_type).map((p) => ({ position_id: p.position_id, location_id: p.location_id, location_path: p.location_path,
    work_type_id: p.work_type_id, work_name: p.work_name, unit_code: p.unit_code, plan_qty: p.plan_qty, fact_qty: p.fact_qty, pct: Math.round(100 * p.fact_qty / p.plan_qty), rest_qty: p.plan_qty - p.fact_qty,
    fact7: 1, fact14: 2, pending_qty: p.pending_qty, forecast_finish: '2027-05-01', delta_days: 10, plan_pct_today: 48, dev_pp: -5, withdrawn: false })),
  pf_summary_worktypes: () => WT.map(([id, name, unit, qty]) => ({ work_type_id: id, work_name: name, unit_code: unit, plan_qty: qty * apts.length, fact_qty: qty * apts.length * 0.45, pct: 45, positions: apts.length })),
  pf_vor_list_imports: () => [{ id: 'imp1', file_name: 'ВОР корпус 1.xlsx', sheet_name: 'ВОР', status: 'confirmed', row_count: 5, works: 5, positions: vorPos.length, created_at: '2026-10-01T10:00:00Z', created_by_email: 'pto@stand.local', confirmed_at: '2026-10-02T10:00:00Z', profile_id: null, revision_no: 1, previous_import_id: null, root_import_id: 'imp1', is_current: true, confirmed_by_email: 'pto@stand.local' }]
};

// ---- экраны
const SCREENS = [
  ['Качество — осмотр', '#/quality/audit'],
  ['Качество — инженер (список осмотров)', '#/quality/engineer'],
  ['Качество — аналитика', '#/quality/analytics'],
  ['План/Факт — сводка', '#/planfact'],
  ['План/Факт — ВОР', '#/planfact/vor'],
  ['План/Факт — позиции ВОР', '#/planfact/vor/positions'],
  ['План/Факт — факт', '#/planfact/fact'],
  ['План/Факт — шахматка', '#/planfact/fact/chessboard'],
  ['Компания — проекты и места', '#/settings/company/objects']
].filter(([, h]) => !opt('only') || h.includes(opt('only')));

const rpcSeen = new Set();
const browser = await chromium.launch();
await start();
const phone = WIDTH < 768;
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: phone ? 812 : 900 }, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1, locale: 'ru-RU' });
const page = await ctx.newPage();
await page.route(/rbi-q\.ru/, (r) => r.abort());
await page.route(API + '/rest/v1/rpc/**', async (r) => {
  const fn = new URL(r.request().url()).pathname.split('/').pop();
  rpcSeen.add(fn + (SEED[fn] ? '+' : ''));
  if (!SEED[fn]) return r.continue();
  let a = {}; try { a = JSON.parse(r.request().postData() || '{}'); } catch { /* пусто */ }
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEED[fn](a)) });
});
await page.addInitScript(() => {
  window.__lt = [];
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true }); } catch { /* нет */ }
});
let pending = 0, lastNet = Date.now();
page.on('request', () => { pending++; lastNet = Date.now(); });
const done = () => { pending = Math.max(0, pending - 1); lastNet = Date.now(); };
page.on('requestfinished', done); page.on('requestfailed', done);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

// вход (стенд: тестовая почта и пароль из tests/offline/lib.mjs), без ограничения процессора
await page.goto(APP + '/'); await page.waitForTimeout(3000);
await page.fill('[data-testid=p2-login-email] input[name=email]', 'test@stand.local');
await page.fill('[data-testid=p2-login-email] input[name=password]', 'x12345678');
await page.click('[data-testid=p2-login-email] button[type=submit]');
await page.waitForTimeout(8000);
// осмотры Качества на устройстве — как у активного инженера
const saved = await page.evaluate(async (N) => {
  const s = window.RBI && window.RBI.services && window.RBI.services.inspections; if (!s) return 'нет сервиса';
  const objs = ['Корпус 1', 'Корпус 2', 'Паркинг'], tpl = ['Земляные работы', 'Армирование', 'Бетонирование', 'Кладка', 'Штукатурка'];
  let ok = 0;
  for (let i = 0; i < N; i++) {
    try { await s.save({ id: 'perf-' + i, date: new Date(Date.now() - i * 3600e3 * 7).toISOString(), object: objs[i % 3], template: tpl[i % 5],
      status: i % 4 ? 'done' : 'draft', engineer: 'Иванов Иван', score: 60 + (i % 40), comment: 'Замечание по месту ' + i }); ok++; } catch { /* дальше */ }
  }
  return ok;
}, QUALITY_N).catch((e) => 'ошибка ' + e.message);
await page.waitForTimeout(15000);   // фон: версия для офлайна докачивается — даём ей закончить, чтобы не мешала замеру

// --check positions: «Позиции» 4500 → порция 100 → долистать (дорисовка) → «Ждёт РП» → снова порция, 410 → «Выбрать всё» 410 → Excel 410 строк
const checks = [];
const expect = (cond, label, extra = '') => { const line = (cond ? 'PASS ' : 'FAIL ') + label + (extra !== '' ? ' — ' + extra : ''); checks.push(line); console.log(line); };
if (opt('check') === 'positions') {
  const rowsNow = () => page.locator('tr[data-row]').count();
  const moreText = async () => (await page.locator('[data-testid=p2-reg-more-rows]').count()) ? page.locator('[data-testid=p2-reg-more-rows]').innerText() : '';
  await page.evaluate(() => { location.hash = '#/planfact/vor/positions'; });
  await page.waitForSelector('[data-testid=p2-reg-more-rows]', { timeout: 30000 });
  expect(await rowsNow() === 100, 'позиции: первая порция — 100 строк', String(await rowsNow()));
  expect(await moreText() === 'Показать ещё (4400)', 'позиции: «Показать ещё (4400)»', await moreText());
  for (let i = 0; i < 6; i++) { await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight)); await page.waitForTimeout(600); }
  const scrolled = await rowsNow();
  expect(scrolled > 100, 'позиции: при прокрутке строки дорисовываются сами', String(scrolled));
  await page.evaluate(() => window.scrollTo(0, 0));
  const q = page.locator('[data-testid=p2-reg-q]', { hasText: 'Ждёт РП' });
  expect((await q.innerText()).replace(/\s+/g, ' ') === 'Ждёт РП 410', 'позиции: счётчик «Ждёт РП» — 410', await q.innerText());
  await q.click(); await page.waitForTimeout(500);
  expect(await rowsNow() === 100 && await moreText() === 'Показать ещё (310)', 'позиции: фильтр — снова первая порция из 410', `${await rowsNow()} · ${await moreText()}`);
  await page.click('[data-testid=p2-reg-pick]'); await page.click('[data-testid=p2-reg-select-all]'); await page.waitForTimeout(300);
  const sel = await page.locator('[data-testid=p2-reg-selected]').innerText();
  expect(sel === 'Выбрано: 410', 'позиции: «Выбрать всё» — 410', sel);
  const label = await page.locator('[data-testid=vr-export-all]').getAttribute('aria-label');
  expect(label === 'Выгрузить список в Excel (410)', 'позиции: кнопка Excel — 410', label);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-testid=vr-export-all]')]);
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(await dl.path());
  expect(wb.worksheets[0].rowCount === 411, 'позиции: в файле Excel 410 строк (+ заголовок)', String(wb.worksheets[0].rowCount - 1));
  await page.click('[data-testid=p2-reg-pick]');
  await page.locator('[data-testid=p2-reg-quick] button').first().click(); await page.waitForTimeout(300);
}

const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

async function measure(label, hash, pass) {
  const lt0 = await page.evaluate(() => window.__lt.length);
  const t0 = Date.now();
  await page.evaluate((h) => { location.hash = h; }, hash);
  let ready = null;
  while (Date.now() - t0 < 90000) {
    await page.waitForTimeout(250);
    const st = await page.evaluate((n) => { const l = window.__lt.slice(n); const last = l.length ? Math.max(...l.map(([s, d]) => s + d)) : 0; return { quiet: performance.now() - last, had: l.length > 0 }; }, lt0);
    if (pending === 0 && Date.now() - lastNet > 800 && st.quiet > 800) { ready = Math.max(lastNet, st.had ? Date.now() - st.quiet : t0, t0) - t0; break; }
  }
  const info = await page.evaluate((n) => {
    const l = window.__lt.slice(n);
    return { longTasks: l.length, blockedMs: Math.round(l.reduce((a, [, d]) => a + d, 0)), worstMs: Math.round(Math.max(0, ...l.map(([, d]) => d))),
      dom: document.getElementsByTagName('*').length, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1e6).toFixed(0) : null,
      text: (document.querySelector('#app-content, main') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 110) };
  }, lt0);
  const shot = `${OUT}/cpu${CPU}-w${WIDTH}-${pass}-${hash.replace(/[#/]+/g, '_')}`;
  await page.screenshot({ path: shot + '.png' }).catch(() => {});   // экран сразу после открытия, до прокрутки
  // прокрутка: самый длинный прокручиваемый блок, 3 с, сколько кадров успел нарисовать телефон
  const scroll = await page.evaluate(() => new Promise((res) => {
    const els = [document.scrollingElement, ...document.querySelectorAll('*')].filter((e) => e && e.scrollHeight - e.clientHeight > 300 && (e === document.scrollingElement || /auto|scroll/.test(getComputedStyle(e).overflowY)));
    const el = els.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
    if (!el) return res(null);
    el.scrollTop = 0; let frames = 0, slow = 0, prev = performance.now(); const t0 = prev;
    const step = (t) => { frames++; if (t - prev > 50) slow++; prev = t; el.scrollTop += 40;
      if (t - t0 < 3000) requestAnimationFrame(step); else { el.scrollTop = 0; res({ fps: Math.round(frames / 3), slowFrames: slow, heightPx: el.scrollHeight }); } };
    requestAnimationFrame(step);
  }));
  if (SHOT_END && scroll) {   // --shots end: второй снимок — после прокрутки к концу (видно, что строки дорисовываются)
    await page.evaluate(() => { const e = document.scrollingElement; e.scrollTop = e.scrollHeight; });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot + '-end.png' }).catch(() => {});
    await page.evaluate(() => { document.scrollingElement.scrollTop = 0; });
  }
  const row = { label, pass, cpu: CPU, readyMs: ready, ...info, scroll };
  console.log(JSON.stringify(row));
  return row;
}

const out = [{ seeded: { places: nodes.length, apartments: apts.length, vorPositions: vorPos.length, quality: saved } }];
console.log(JSON.stringify(out[0]));
for (const pass of ['первый', 'повтор']) for (const [label, hash] of SCREENS) out.push(await measure(label, hash, pass));
out.push({ errors: [...new Set(errors)].slice(0, 20), rpc: [...rpcSeen].sort(), checks });
console.log(JSON.stringify(out.at(-1)));
writeFileSync(`${OUT}/cpu${CPU}${phone ? '' : '-w' + WIDTH}.json`, JSON.stringify(out, null, 1));
await browser.close(); await stop();
process.exit(0);
