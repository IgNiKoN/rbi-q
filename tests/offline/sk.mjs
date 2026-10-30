// P2-0076: стенд «Внешний СК по номерам» — загрузка Excel → шаг сопоставления → «Разобрать» → Аналитика по id «Компании».
// node tests/offline/sk.mjs [sk375 sk1440 sk375dark sk1440dark sk768 sk1024 sk1920] [--out <папка>]  (без сценариев — все)
// Подставной сервер (servers.mjs) отвечает на функции 056 по той же логике, что сервер (сама логика сервера проверена в PGlite:
// tests/server/056_sk_core_ids*.sql): соответствие текста → запись «Компании», выбор человека главнее автоподбора, «сторож» ставит
// id замечаниям при отдаче на телефон. Порты — P2_OFFLINE_APP_PORT / P2_OFFLINE_API_PORT (как у run.mjs). Боевой сервер не используется.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { start, stop, stand, rows } from './servers.mjs';
import { freshProfile, launch, note, ok, results, signIn } from './lib.mjs';

const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const out = oi >= 0 ? args[oi + 1] : join(tmpdir(), 'p2-sk');
const pick = args.filter((a, i) => !a.startsWith('--') && (oi < 0 || i !== oi + 1));

// ---------- «Компания» стенда и логика сервера 056 (упрощённое зеркало quality.sk_*) ----------
const CP = [{ id: 'cp-1', name: 'ООО Ромашка' }, { id: 'cp-2', name: 'Лютик Строй' }, { id: 'cp-3', name: 'Ромашка-Сервис' }];
// категория в записи — как её сохраняет импорт (sk_getCleanCategoryName: шаблон Качества или «Без категории»)
const WT = [{ id: 'wt-1', name: 'Инженерные сети (ПК СК)' }, { id: 'wt-2', name: 'Охрана труда' }, { id: 'wt-3', name: 'Монолитные работы' }];
const PL = [
  { id: 'k2', parent: null, type: 'object', name: 'Корпус 2' },
  { id: 'k2s1', parent: 'k2', type: 'section', name: 'Корпус 2 / Секция 1' },
  ...[1, 2, 3, 4, 5].map((n) => ({ id: 'k2s1e' + n, parent: 'k2s1', type: 'floor', name: 'Корпус 2 / Секция 1 / эт. ' + n })),
  { id: 'k2s2', parent: 'k2', type: 'section', name: 'Корпус 2 / Секция 2' },
  ...[1, 2, 3].map((n) => ({ id: 'k2s2e' + n, parent: 'k2s2', type: 'floor', name: 'Корпус 2 / Секция 2 / эт. ' + n }))
];
const key = (t) => { const s = String(t ?? '').toLowerCase().replace(/ё/g, 'е').replace(/["'«»„“”`]/g, '').replace(/\s+/g, ' ').trim(); return s || null; };
const firm = (t) => (key(t) || '').replace(/(^|\s)(ооо|ао|ип)(?=\s|$)/g, ' ').replace(/[^a-zа-я0-9]+/g, ' ').trim();
const recText = (kind, r) => kind === 'contractor' ? (String(r.contractor_raw || '').trim() || String(r.contractor_name || '').trim() || null)
  : kind === 'category' ? (key(r.category) === 'без категории' ? null : String(r.category || '').trim() || null)
  : (String(r.project_raw_path || '').trim() || String(r.project_loc || '').trim() || null);
const ID = { contractor: 'core_counterparty_id', category: 'core_work_type_id', place: 'core_location_id' };
// автоподбор: фирма — по названию контрагента (как 039a — ключ названия), вид работ — по названию, место — «Корпус 2 / Секция N / этаж»
function auto(kind, text) {
  if (kind === 'contractor') { const f = CP.find((c) => key(c.name) === key(text)); return f ? f.id : null; }
  if (kind === 'category') { const w = WT.find((x) => key(x.name) === key(text)); return w ? w.id : null; }
  const m = String(text || '').match(/корпус\s*2\D+секция\s*(\d)\D*?(\d+)?\s*$/i);   // «Корпус 7 …» — не узнано
  if (!m) return null;
  const sec = 'k2s' + m[1]; if (!PL.find((p) => p.id === sec)) return null;
  return m[2] && PL.find((p) => p.id === sec + 'e' + m[2]) ? sec + 'e' + m[2] : sec;
}
const links = new Map();   // «вид|текст» → { kind, text, target, by }
function resolve(kind, text, save) {
  const k = key(text); if (!k) return null;
  const l = links.get(kind + '|' + k);
  if (l && l.by === 'person' && l.target) return l.target;
  const a = auto(kind, text);
  if (save) {
    if (!l) links.set(kind + '|' + k, { kind, text: String(text).trim(), target: a, by: a ? 'auto' : null });
    else if (l.target !== a) Object.assign(l, { target: a, by: a ? 'auto' : null });
  }
  return a;
}
const stamped = new Map();   // id замечания → время, когда сторож поменял его id (устройство подтянет)
function stamp(r) {
  const v = { ...r };
  for (const kind of Object.keys(ID)) v[ID[kind]] = resolve(kind, recText(kind, r), true);
  const was = stamped.get(r.id);
  const sig = JSON.stringify([v.core_counterparty_id, v.core_work_type_id, v.core_location_id]);
  if (!was || was.sig !== sig) stamped.set(r.id, { sig, at: new Date().toISOString() });
  const at = stamped.get(r.id).at;
  if (!v.updated_at || at > v.updated_at) v.updated_at = at;
  return v;
}
const records = () => [...(rows.get('sk_records') || new Map()).values()].filter((r) => !r.is_deleted);
const calls = [];
const RPC = {
  sk_core_choices: () => ({ counterparties: CP, work_types: WT, places: PL }),
  sk_links_register: (u, a) => { calls.push('register'); return (a.p_items || []).filter((it) => key(it.text) && !(it.kind === 'category' && key(it.text) === 'без категории'))
    .map((it) => { const t = resolve(it.kind, it.text, true); return { kind: it.kind, text: it.text, target: t, matched_by: t ? (links.get(it.kind + '|' + key(it.text)).by || 'auto') : null }; }); },
  sk_links_list: (u, a) => {
    calls.push('list');
    const cnt = new Map();
    for (const r of records()) for (const kind of Object.keys(ID)) { const k = key(recText(kind, r)); if (k) cnt.set(kind + '|' + k, (cnt.get(kind + '|' + k) || 0) + 1); }
    const items = [...links.entries()].filter(([k, l]) => cnt.get(k) && (a.p_all || !l.target)).map(([k, l]) => ({ id: k, kind: l.kind, text: l.text, target: l.target, matched_by: l.by, records: cnt.get(k) }));
    return { items, can_edit: true, can_edit_contractor: true, can_create_counterparty: false };
  },
  sk_link_set: (u, a) => {
    calls.push('set');
    const k = a.p_kind + '|' + key(a.p_text);
    const was = links.get(k);
    const prev = was ? was.target : null;
    links.set(k, { kind: a.p_kind, text: was ? was.text : a.p_text, target: a.p_target || null, by: a.p_target ? 'person' : null });
    let n = 0;
    for (const r of records()) if (key(recText(a.p_kind, r)) === key(a.p_text)) { n++; stamped.delete(r.id); }
    if (!a.p_target) resolve(a.p_kind, a.p_text, true);
    const l = links.get(k);
    return { link_id: k, kind: l.kind, text: l.text, target: l.target, matched_by: l.by, previous: prev, previous_by: was ? was.by : null, records: n };
  }
};

// ---------- Excel выгрузки ПК СК ----------
const HEAD = ['№ п/п', '№ замечания', 'Замечание', 'Категория замечания', 'Дата выдачи', 'Ответственная организация',
  'Представитель ответственной организации', 'Требуемый срок устранения', 'Отметка об устранении', 'Фактическая дата устранения',
  'Представитель организации выдавший предписание', 'Представитель организации снявший предписание', 'Элемент структуры', 'Расположение в проекте'];
const day = (d) => { const x = new Date(Date.now() + d * 86400000); return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}.${x.getFullYear()}`; };
// фирма в двух написаниях, известная категория и новая, «Корпус 2, секция 1, этаж 5», путь «ЖК / Корпус 2 / Секция 2 / 3», нераспознаваемые места
const ROWS = [
  [1, 'СК-101', 'Кабель без гофры', 'Электромонтаж', day(-20), 'ООО Ромашка', 'Петров', day(-5), 'Не устранено', '', 'Иванов Иван', '', '', 'ЖК Тестовый/Корпус 2, секция 1, этаж 5'],
  [2, 'СК-102', 'Не закреплён воздуховод', 'Вентиляция', day(-15), 'Ромашка ООО', 'Петров', day(-2), 'Не устранено', '', 'Иванов Иван', '', '', 'ЖК Тестовый/Корпус 2/Секция 2/3'],
  [3, 'СК-103', 'Нет ограждения проёма', 'Охрана труда', day(-12), 'Ромашка ООО', 'Сидоров', day(10), 'Не устранено', '', 'Иванов Иван', '', '', 'ЖК Тестовый/Корпус 2/Секция 1/2'],
  [4, 'СК-104', 'Мусор на этаже', 'Без категории', day(-9), 'Лютик Строй', 'Сидоров', day(-1), 'Устранено', day(-3), 'Иванов Иван', '', '', 'Склад у забора'],
  [5, 'СК-105', 'Нет огнетушителя', 'Пожарная безопасность', day(-6), 'ИП Новиков', 'Новиков', day(20), 'Не устранено', '', 'Иванов Иван', '', '', 'ЖК Тестовый/Корпус 7/Секция 1/1']
];
async function makeXlsx(path) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('ПК СК');
  ws.addRow(HEAD); ROWS.forEach((r) => ws.addRow(r));
  await wb.xlsx.writeFile(path);
}

// ---------- шаги на экране ----------
async function openSk(page) {
  await page.evaluate(() => { location.hash = '#/quality/analytics/sk'; }).catch(() => {});
  await page.waitForTimeout(6000);
}
async function upload(page, file) {
  await page.setInputFiles('#sk-excel-input', file);
  await page.waitForFunction(() => /Сопоставление с «Компанией»|узнаны в «Компании»/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
}
const pending = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sk-link-item]')].map((e) => e.querySelector('.font-black')?.textContent.trim()));
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function scenario(tag, width, height, scheme) {
  note(`== ${tag}: загрузка → шаг сопоставления → «Разобрать» → выбор / «Отменить» → Аналитика по id → повторная загрузка → фильтр по месту`);
  freshProfile(out, tag);
  links.clear(); stamped.clear(); calls.length = 0;
  await start();
  Object.assign(stand, { rpc: RPC, serve: { get sk_records() { return records().map(stamp); } } });
  const file = join(out, 'pk-sk.xlsx');
  await makeXlsx(file);
  const { ctx, page } = await launch(out, tag, { width, height, scheme });
  try {
    await signIn(page);
    await openSk(page);
    await page.screenshot({ path: join(out, `${tag}-0-before.png`), fullPage: false });

    // 1. Загрузка: известное подставлено, новое — в «Разобрать»
    await upload(page, file);
    const sum = await page.evaluate(() => document.getElementById('modal-body')?.innerText || '');
    ok(/Фирмы\s*узнано 2 · новых 2/.test(sum) && /Категории\s*узнано 1 · новых 1/.test(sum) && /Места\s*узнано 3 · новых 2/.test(sum),
      `${tag}: шаг сопоставления — фирмы узнано 2 / новых 2, категории 1 / 1, места 3 / 2`, sum.replace(/\s+/g, ' ').slice(0, 200));
    const local = await page.evaluate(() => (window.skRecords || []).map((r) => [r.sk_number, r.core_counterparty_id || '', r.core_work_type_id || '', r.core_location_id || '']));
    ok(JSON.stringify(local.find((x) => x[0] === 'СК-101')) === JSON.stringify(['СК-101', 'cp-1', 'wt-1', 'k2s1e5']), `${tag}: известное подставлено в запись сразу`, JSON.stringify(local));
    ok(JSON.stringify(local.find((x) => x[0] === 'СК-102')) === JSON.stringify(['СК-102', '', 'wt-1', 'k2s2e3']), `${tag}: «ЖК / Корпус 2 / Секция 2 / 3» → этаж`, JSON.stringify(local));
    ok(!local.find((x) => x[0] === 'СК-102')[1], `${tag}: второе написание фирмы — без контрагента (в «Разобрать»)`);
    await page.screenshot({ path: join(out, `${tag}-1-summary.png`) });

    // 2. «Разобрать»: новое со счётчиком, 3 похожих
    await page.click('text=Разобрать сейчас');
    await page.waitForSelector('[data-sk-link-item]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    let list = await pending(page);
    const want = ['Ромашка ООО', 'ИП Новиков', 'Охрана труда и ПБ (ПК СК)', 'ЖК Тестовый/Корпус 7/Секция 1/1', 'Склад у забора'];
    ok(list.length === 5 && want.every((x) => list.includes(x)), `${tag}: «Разобрать» — 2 фирмы, 1 категория, 2 места`, JSON.stringify(list));
    const badge = await page.evaluate(() => document.querySelector('[data-sk-links-count]')?.textContent.trim());
    ok(badge === '5', `${tag}: счётчик на подвкладке — 5`, badge);
    const firmIdx = await page.evaluate(() => [...document.querySelectorAll('[data-sk-link-item]')].find((e) => /Ромашка ООО/.test(e.innerText))?.getAttribute('data-sk-link-item'));
    const sugg = await page.evaluate((i) => [...document.querySelectorAll(`[data-sk-link-item="${i}"] [data-sk-link-pick]`)].map((b) => b.textContent.trim()), firmIdx);
    ok(sugg[0] === 'ООО Ромашка' && sugg.length <= 3, `${tag}: похожие для «Ромашка ООО» — первая «ООО Ромашка», не больше 3`, JSON.stringify(sugg));
    ok(await overflow(page) <= 0, `${tag}: без горизонтальной прокрутки`);
    await page.screenshot({ path: join(out, `${tag}-2-links.png`), fullPage: true });

    // 3. Выбор → все замечания с этим текстом; «Отменить» возвращает
    await page.click(`[data-sk-link-item="${firmIdx}"] [data-sk-link-pick]`);
    await page.waitForSelector('[data-sk-link-undo]', { timeout: 15000 }).catch(() => {});
    list = await pending(page);
    const bar = await page.evaluate(() => document.querySelector('[data-sk-link-undo]')?.parentElement.innerText.replace(/\s+/g, ' '));
    ok(!list.includes('Ромашка ООО') && /замечаний 2/.test(bar || ''), `${tag}: выбор применён к 2 замечаниям, текст ушёл из списка`, bar);
    await page.screenshot({ path: join(out, `${tag}-3-picked.png`), fullPage: true });
    await page.click('[data-sk-link-undo]');
    await page.waitForTimeout(1500);
    list = await pending(page);
    ok(list.includes('Ромашка ООО'), `${tag}: «Отменить» — текст вернулся в «Разобрать»`, JSON.stringify(list));
    const firmIdx2 = await page.evaluate(() => [...document.querySelectorAll('[data-sk-link-item]')].find((e) => /Ромашка ООО/.test(e.innerText))?.getAttribute('data-sk-link-item'));
    await page.click(`[data-sk-link-item="${firmIdx2}"] [data-sk-link-pick]`);
    await page.waitForTimeout(1500);
    // категория — выбором из списка
    const catIdx = await page.evaluate(() => [...document.querySelectorAll('[data-sk-link-item]')].find((e) => /Охрана труда и ПБ/.test(e.innerText))?.getAttribute('data-sk-link-item'));
    await page.selectOption(`[data-sk-link-select="${catIdx}"]`, 'wt-2');
    await page.click(`[data-sk-link-apply="${catIdx}"]`);
    await page.waitForTimeout(1500);
    list = await pending(page);
    ok(list.length === 3 && !list.includes('Охрана труда и ПБ (ПК СК)'), `${tag}: категория сопоставлена из списка — осталось 3`, JSON.stringify(list));

    // 4. Аналитика: два написания → один подрядчик, несопоставленное — «не разобрано»; синхронизация подтянула id
    await page.evaluate(() => window.RBI?.services?.sync?.trigger?.('manual')).catch(() => {});
    await page.waitForTimeout(6000);
    await page.click('#sk-btn-dashboard');
    await page.waitForTimeout(2500);
    const ana = await page.evaluate(() => {
      const recs = window.skRecords || [];
      return { ids: recs.map((r) => [r.sk_number, r.core_counterparty_id || '']).sort(),
        text: document.querySelector(document.querySelector('#sub-sk.ana-desk-sk') ? '#ana-desk-sk-panel' : '#sk-view-dashboard')?.textContent || '' };   // таблицы — в свёрнутых блоках
    });
    ok(ana.ids.filter((x) => x[1] === 'cp-1').length === 3, `${tag}: после синхронизации у трёх замечаний — один контрагент «ООО Ромашка»`, JSON.stringify(ana.ids));
    ok(/ООО Ромашка/.test(ana.text) && !/Ромашка ООО(?! ·)/.test(ana.text), `${tag}: Аналитика — один подрядчик «ООО Ромашка»`);
    ok(/ИП Новиков · не разобрано/.test(ana.text), `${tag}: несопоставленная фирма — «не разобрано»`);
    await page.screenshot({ path: join(out, `${tag}-4-analytics.png`), fullPage: true });

    // 5. Повторная загрузка того же файла — «Разобрать» не растёт
    const before = (await page.evaluate(() => document.querySelector('[data-sk-links-count]')?.textContent.trim())) || '0';
    await upload(page, file);
    const sum2 = await page.evaluate(() => document.getElementById('modal-body')?.innerText || document.body.innerText.slice(0, 300));
    await page.evaluate(() => { if (typeof window.closeModal === 'function') window.closeModal(); });
    await page.click('#sk-btn-links');
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => document.querySelector('[data-sk-links-count]')?.textContent.trim());
    ok(after === before && (await pending(page)).length === Number(before), `${tag}: повторная загрузка — «Разобрать» не вырос (${before} → ${after})`, sum2.replace(/\s+/g, ' ').slice(0, 120));

    // 6. Фильтр по месту: секция 1 → только её этажи
    await page.click('#sk-btn-dashboard');
    await page.waitForTimeout(2000);
    // раскладку выбирает приложение (компьютерная — с какой ширины решает оболочка), тест смотрит по факту
    const desk = await page.evaluate(() => !!document.querySelector('#sub-sk.ana-desk-sk'));
    const sel = desk ? '#ana-desk-sk-panel [data-sk-place-filter]' : '#sk-view-dashboard select[onchange*="sk_setPlaceFilter"]';
    const opts = await page.evaluate((s) => [...(document.querySelector(s)?.options || [])].map((o) => o.textContent), sel);
    ok(opts.includes('Корпус 2 / Секция 1 / эт. 5') && opts.includes('Корпус 2 / Секция 1'), `${tag}: фильтр по месту — до этажа`, JSON.stringify(opts));
    await page.selectOption(sel, 'k2s1');
    await page.waitForTimeout(2000);
    const filtered = await page.evaluate(() => {
      // компьютер — панель дашборда (мобильные копии лежат спрятанными рядом), телефон — вид «Дашборд»
      const box = document.querySelector('#sub-sk.ana-desk-sk') ? document.getElementById('ana-desk-sk-panel') : document.getElementById('sk-view-dashboard');
      return box ? box.textContent : '';
    });
    ok(/Лютик Строй/.test(filtered) === false && /ООО Ромашка/.test(filtered), `${tag}: фильтр «Корпус 2 / Секция 1» — только её замечания`);
    await page.screenshot({ path: join(out, `${tag}-5-place-filter.png`), fullPage: true });
    await page.selectOption(sel, '');
    await page.waitForTimeout(1000);
    ok(await overflow(page) <= 0, `${tag}: Аналитика без горизонтальной прокрутки`);
    note(`${tag}: вызовы сервера — ${calls.join(', ')}`);
  } catch (e) {
    ok(false, `${tag}: сценарий оборвался`, e.message.split('\n')[0]);
    await page.screenshot({ path: join(out, `${tag}-error.png`), fullPage: true }).catch(() => {});
  } finally {
    stand.rpc = null; stand.serve = null;
    await ctx.close().catch(() => {}); await stop().catch(() => {});
  }
}

const ALL = { sk375: [375, 812, 'light'], sk375dark: [375, 812, 'dark'], sk768: [768, 1024, 'light'], sk1024: [1024, 768, 'light'],
  sk1440: [1440, 900, 'light'], sk1440dark: [1440, 900, 'dark'], sk1920: [1920, 1080, 'light'] };
for (const [tag, [w, h, scheme]] of Object.entries(ALL)) if (!pick.length || pick.includes(tag)) await scenario(tag, w, h, scheme);
writeFileSync(join(out, 'sk-results.txt'), results.join('\n') + '\n');
const fails = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\nИтого: PASS ${results.filter((r) => r.startsWith('PASS')).length}, FAIL ${fails}; снимки — ${out}`);
process.exit(fails ? 1 : 0);
