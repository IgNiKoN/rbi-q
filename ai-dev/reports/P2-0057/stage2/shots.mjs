// P2-0057 этап 2–3: настоящий экран «Компания → Проекты → Объекты и места» в оболочке на стенде (tests/offline/servers.mjs).
// Подставной сервер мест и планов — в памяти (те же правила, что у 055: версии, одна текущая, «снять», точки замечаний).
// «Сейчас» — код main (--root <папка main>), «предлагаю» — код ветки. Боевой сервер не используется.
// node shots.mjs <out-dir> [--root <папка>] [--now] [--only имя,имя]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { start, stop, stand, site, COMPANY, API } from '../../../../tests/offline/servers.mjs';
import { freshProfile, launch, signIn } from '../../../../tests/offline/lib.mjs';

const args = process.argv.slice(2);
const out = args[0];
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
if (opt('--root')) site.root = opt('--root').replace(/\/$/, '');
const NOW = args.includes('--now');
const only = opt('--only') ? opt('--only').split(',') : null;
mkdirSync(out, { recursive: true });

// ---------- данные: ЖК Тестовый — Корпус 1 (2 секции × 9 этажей × 4 кв.), Паркинг ----------
const PR = 'p-1';
const places = [];
const add = (id, parent, type, name, extra = {}) => { places.push({ id, parent_id: parent, node_type: type, object_kind: null, name, build_no: null, bti_no: null,
  sort_order: places.filter((x) => x.parent_id === parent).length + 1, area: null, rooms: null, ...extra }); return id; };
add('k1', null, 'object', 'Корпус 1', { object_kind: 'building' });
add('k2', null, 'object', 'Паркинг', { object_kind: 'parking' });
let no = 1;
for (const s of [1, 2]) {
  const sid = add(`s${s}`, 'k1', 'section', `Секция ${s}`);
  for (let f = 1; f <= 9; f++) {
    const fid = add(`s${s}f${f}`, sid, 'floor', `эт. ${f}`);
    for (let a = 0; a < 4; a++) { add(`a${no}`, fid, 'apartment', `кв. ${no}`, { build_no: String(no), area: [38.4, 54.3, 61.2, 72][a], rooms: [1, 2, 2, 3][a] }); no++; }
  }
}
const byId = (id) => places.find((x) => x.id === id);
const kidsOf = (id) => places.filter((x) => x.parent_id === id);
const sub = (id) => kidsOf(id).flatMap((k) => [k, ...sub(k.id)]);
const pathOf = (x) => (x.parent_id ? pathOf(byId(x.parent_id)) + ' · ' : '') + x.name;
// планы: у части этажей и квартир — уже есть (эт. 1–4 секции 1, у эт. 5 — две версии), у кв. 1 — план
let docs = [];
let seq = 0;
const doc = (loc, name, when, author = 'Кондратьев Игорь') => {
  docs.filter((d) => d.location_id === loc).forEach((d) => { d.is_current = false; });
  const v = docs.filter((d) => d.location_id === loc).length + 1;
  const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  docs.push({ id, location_id: loc, version_no: v, is_current: true, file_name: name, file_size: 1200000 + seq * 37000,
    file_url: `${API}/storage/v1/object/public/core-place-plans/${COMPANY.id}/${PR}/${loc}/${id}.pdf`, created_by: 'u-1', author, created_at: when });
  return { id, version_no: v };
};
if (!NOW) {
  for (const f of [1, 2, 3, 4]) doc(`s1f${f}`, `Этаж ${f}.pdf`, '2026-10-20T10:00:00Z');
  doc('s1f5', 'Секция 1 этаж 5.pdf', '2026-10-12T09:00:00Z', 'Петров Пётр');
  doc('s1f5', 'Секция 1 этаж 5 (изм. 1).pdf', '2026-10-28T15:30:00Z');
  doc('a1', 'кв 1.pdf', '2026-10-25T11:00:00Z');
}
const err = (message, code = '22023') => ({ __status: 400, message, code });
stand.rpc = {
  pf_project_dicts: () => ({ stages: [{ code: 'construction', name: 'Строительство', sort_order: 1 }],
    object_kinds: [{ code: 'building', name: 'Корпус', sort_order: 1 }, { code: 'parking', name: 'Паркинг', sort_order: 2 }, { code: 'other', name: 'Прочее', sort_order: 7 }],
    roles: [] }),
  pf_company_divisions: () => [],
  pf_project_catalog: () => [{ id: PR, company_id: COMPANY.id, name: 'ЖК Тестовый', code: 'ЖКТ', archived_at: null, created_at: '2026-06-01T00:00:00Z', can_manage: true,
    division_id: null, division_name: null, address: 'Москва', planned_start: '2026-06-01', planned_finish: '2027-03-31', manager_user_id: null, manager_name: null,
    stage: 'construction', our_role: null, timezone: 'Europe/Moscow', country: 'RU', object_count: 2, place_count: places.length, places_led_by_quality: false }],
  pf_project_places: (_u, a) => kidsOf(a.p_parent || null).map((x) => {
    const s = sub(x.id);
    return { ...x, depth: pathOf(x).split(' · ').length, path: pathOf(x), child_count: kidsOf(x.id).length,
      apartment_count: x.node_type === 'object' || x.node_type === 'section' ? s.filter((y) => y.node_type === 'apartment').length : null };
  }),
  pf_next_build_no: () => no,
  pf_place_plans: (_u, a) => (a.p_project === PR ? docs.slice().sort((x, y) => (x.location_id < y.location_id ? -1 : x.location_id > y.location_id ? 1 : y.version_no - x.version_no)) : err('Нет доступа к проекту', '42501')),
  pf_add_place_plan: (_u, a) => {
    if (docs.some((d) => d.id === a.p_id)) return { id: a.p_id, version_no: docs.find((d) => d.id === a.p_id).version_no, repeat: true };
    if (!/\.pdf$/i.test(a.p_name || '')) return err('Нужен файл PDF');
    const prev = docs.find((d) => d.location_id === a.p_location && d.is_current) || null;
    docs.filter((d) => d.location_id === a.p_location).forEach((d) => { d.is_current = false; });
    const v = docs.filter((d) => d.location_id === a.p_location).length + 1;
    docs.push({ id: a.p_id, location_id: a.p_location, version_no: v, is_current: true, file_name: a.p_name, file_size: a.p_size, file_url: a.p_url,
      created_by: 'u-1', author: 'Иванов Иван', created_at: new Date().toISOString() });
    return { id: a.p_id, version_no: v, previous: prev ? prev.id : null, repeat: false };
  },
  pf_set_place_plan: (_u, a) => {
    const d = docs.find((x) => x.id === a.p_id); if (!d) return err('Версия плана не найдена');
    const prev = docs.find((x) => x.location_id === d.location_id && x.is_current) || null;
    docs.filter((x) => x.location_id === d.location_id).forEach((x) => { x.is_current = x.id === d.id; });
    return { id: d.id, version_no: d.version_no, previous: prev ? prev.id : null };
  },
  pf_remove_place_plan: (_u, a) => {
    const prev = docs.find((x) => x.location_id === a.p_location && x.is_current) || null;
    docs.filter((x) => x.location_id === a.p_location).forEach((x) => { x.is_current = false; });
    return { previous: prev ? prev.id : null };
  },
  pf_place_pins: (_u, a) => (a.p_location === 's1f5' ? 3 : 0)
};

// ---------- снимки ----------
const checks = [];
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
async function open(width, scheme, name) {
  const prof = join(tmpdir(), 'p57-profiles');
  freshProfile(prof, name);
  const { ctx, page } = await launch(prof, name, { width, height: width < 768 ? 812 : 900, scheme });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
  await signIn(page);
  await page.evaluate(() => { history.pushState(null, '', '#/settings/company/objects'); window.dispatchEvent(new HashChangeEvent('hashchange')); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForTimeout(3000);
  await page.locator('text=ЖК Тестовый >> visible=true').first().click(); await page.waitForTimeout(800);
  await page.locator('text=Объекты и места >> visible=true').first().click(); await page.waitForTimeout(1500);
  return { ctx, page, errs };
}
const row = (page, name) => page.locator('.p2-tree__row', { has: page.locator(`.p2-tree__name b:text-is("${name}")`) }).first();
async function expand(page, names) {
  for (const n of names) {
    const t = row(page, n).locator('[data-testid=p2-tree-toggle]');
    if (await t.count() && (await t.getAttribute('aria-expanded')) !== 'true') { await t.click(); await page.waitForTimeout(500); }
  }
}
async function selectRow(page, name) { await row(page, name).locator('[data-testid=p2-tree-open]').click(); await page.waitForTimeout(700); }
async function dragFiles(page, selector, names, release) {
  await page.evaluate(async ({ selector, names, b64, release }) => {
    const el = document.querySelector(selector);
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer(); names.forEach((n) => dt.items.add(new File([bin], n, { type: 'application/pdf' })));
    for (const ev of ['dragenter', 'dragover']) el.dispatchEvent(new DragEvent(ev, { bubbles: true, cancelable: true, dataTransfer: dt }));
    if (release) el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, { selector, names, b64: PDF.toString('base64'), release });
  await page.waitForTimeout(release ? 1500 : 300);
}
async function shot(page, name, errs) {
  await page.waitForTimeout(400);
  const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  checks.push(`${name}: горизонтальная прокрутка страницы ${scrollX > 0 ? 'ЕСТЬ ' + scrollX + 'px' : 'нет'}; ошибок страницы ${errs.length}${errs.length ? ' — ' + errs.join(' | ') : ''}`);
  if ((await page.viewportSize()).width < 768) await page.addStyleTag({ content: '.bottom-nav{display:none!important}' });
  await page.screenshot({ path: join(out, `${name}.jpg`), fullPage: true, type: 'jpeg', quality: 80 });
}
const scenes = {
  // карточка этажа с планом и версиями (ПК)
  async card(width, scheme, tag) {
    const { ctx, page, errs } = await open(width, scheme, 'card' + tag);
    await expand(page, ['Секция 1']); await selectRow(page, 'эт. 5');
    if (await page.locator('[data-testid=op-plan-versions-toggle]').count()) { await page.locator('[data-testid=op-plan-versions-toggle]').first().click(); await page.waitForTimeout(300); }
    checks.push(`card${tag}: в дереве «есть план» у ${await page.locator('.p2-tree__kind', { hasText: 'есть план' }).count()} строк; блок «План» ${await page.locator('[data-testid=op-plan]').count() ? 'есть' : 'нет'}`);
    await shot(page, `${NOW ? 'now' : 'new'}-card-${tag}`, errs); await ctx.close();
  },
  // квартира без плана (ПК): «Загрузить план»
  async apt(width, scheme, tag) {
    const { ctx, page, errs } = await open(width, scheme, 'apt' + tag);
    await expand(page, ['Секция 1', 'эт. 2']); await selectRow(page, 'кв. 5');
    await shot(page, `${NOW ? 'now' : 'new'}-apt-${tag}`, errs); await ctx.close();
  },
  // файл над строкой «эт. 6» — подсветка строки и подсказка; затем бросить — версия 1, плашка
  async drop(width, scheme, tag) {
    const { ctx, page, errs } = await open(width, scheme, 'drop' + tag);
    await expand(page, ['Секция 1']);
    const sel = '[data-node-id="s1f6"] > .p2-tree__row .p2-tree__name';
    await dragFiles(page, sel, ['Этаж 6.pdf'], false);
    checks.push(`drop${tag}: подсветка строки — ${await page.locator('.p2-tree__row.op-file-row').count()}; «нельзя» на строке — ${await page.locator('.p2-tree__row.is-drop-no').count()}`);
    await shot(page, `new-drop-over-${tag}`, errs);
    await dragFiles(page, sel, ['Этаж 6.pdf'], true);
    await page.waitForTimeout(800);
    checks.push(`drop${tag}: после броска — ${await page.locator('[data-testid=op-toast]').textContent().catch(() => 'нет плашки')}`);
    await shot(page, `new-drop-done-${tag}`, errs); await ctx.close();
  },
  // замена плана с точками (эт. 5) — плашка с подсказкой
  async replace(width, scheme, tag) {
    const { ctx, page, errs } = await open(width, scheme, 'repl' + tag);
    await expand(page, ['Секция 1']); await selectRow(page, 'эт. 5');
    await page.locator('[data-testid=op-plan-file]').first().setInputFiles({ name: 'Секция 1 этаж 5 (изм. 2).pdf', mimeType: 'application/pdf', buffer: PDF });
    await page.waitForTimeout(1500);
    checks.push(`replace${tag}: ${await page.locator('[data-testid=op-toast]').textContent().catch(() => 'нет плашки')}`);
    await shot(page, `new-replace-${tag}`, errs); await ctx.close();
  },
  // 9 файлов на корпус — лист сопоставления
  async match(width, scheme, tag) {
    const { ctx, page, errs } = await open(width, scheme, 'match' + tag);
    const files = ['Этаж 1.pdf', '2 этаж.pdf', 'эт.3.pdf', 'Этаж 4.pdf', 'Секция 2 этаж 5.pdf', 'Этаж 6.pdf', 'кв 7.pdf', 'Этаж 9.pdf', 'Общий план.pdf'];
    await dragFiles(page, '[data-testid=op-object]', files, true);
    checks.push(`match${tag}: строк ${await page.locator('[data-testid=op-pm-row]').count()}; итог «${await page.locator('[data-testid=op-pm-sum]').textContent().catch(() => '')}»`);
    await shot(page, `new-match-${tag}`, errs);
    if (tag === '1440') {
      await page.locator('[data-testid=op-pm-go]').click(); await page.waitForTimeout(3000);
      checks.push(`match${tag}: после «Загрузить» — ${await page.locator('[data-testid=op-toast]').textContent().catch(() => 'нет плашки')}`);
      await page.locator('[data-testid=op-view-chess]').click(); await page.waitForTimeout(1500);
      checks.push(`chess${tag}: этажей с планом ${await page.locator('.op-chess__fl.has-plan').count()}, помещений с планом ${await page.locator('.op-chess__cell.has-plan').count()}`);
      await shot(page, `new-chess-${tag}`, errs);
    }
    await ctx.close();
  },
  // шахматка (как сейчас / с планами)
  async chess(width, scheme, tag) {
    const { ctx, page, errs } = await open(width, scheme, 'chess' + tag);
    await page.locator('[data-testid=op-view-chess]').click(); await page.waitForTimeout(1500);
    await page.locator('.op-chess__row[data-floor-id="s1f5"] .op-chess__fl').click(); await page.waitForTimeout(800);
    await shot(page, `${NOW ? 'now' : 'new'}-chess-${tag}`, errs); await ctx.close();
  }
};
const plan = NOW
  ? [['card', 1440, 'light', '1440'], ['card', 375, 'light', '375'], ['chess', 1440, 'light', '1440']]
  : [['card', 1440, 'light', '1440'], ['card', 1440, 'dark', '1440-dark'], ['card', 375, 'light', '375'], ['card', 375, 'dark', '375-dark'], ['apt', 1440, 'light', '1440'],
     ['drop', 1440, 'light', '1440'], ['replace', 1440, 'light', '1440'], ['match', 1440, 'light', '1440'], ['match', 375, 'light', '375'], ['match', 1440, 'dark', '1440-dark'],
     ['chess', 1440, 'dark', '1440-dark'], ['chess', 375, 'light', '375'],
     ['card', 768, 'light', '768'], ['card', 1024, 'light', '1024'], ['card', 1920, 'light', '1920']];
await start();
try {
  for (const [s, w, sc, tag] of plan) {
    if (only && !only.includes(s + tag) && !only.includes(s)) continue;
    await scenes[s](w, sc, tag);
  }
} finally { await stop(); }
writeFileSync(join(out, NOW ? 'checks-now.txt' : 'checks-new.txt'), checks.join('\n') + '\n');
console.log(checks.join('\n'));
