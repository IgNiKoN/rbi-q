// P2-0009. Наполнение «Демо-компании»: объект «ЖК «Спутник» (демо)» по реальной ВОР заказчика → смета и КП → факт прораба
// за ~4 недели с исправлением → выданный КС-2 → плановые даты. Всё — от имени ролей через те же сервисы и функции public.pf_*,
// что у экранов (вход почта+пароль, права проверяет сервер). Прямой записи в таблицы нет.
// Файл заказчика читается с диска (в репозиторий НЕ кладётся). Пароли — только из .env.local (P2_DEMO_*_PASSWORD), не печатаются.
//
// Запуск (общий сервер — только по разрешению владельца):
//   node scripts/demo-seed.mjs "<путь к 0_СЕБЕС…Спутник….xlsx>"
// Локальный стенд (127.0.0.1, учётки *@demo.local, пароль стенда):
//   node scripts/demo-seed.mjs "<файл>" --url http://localhost:8796 --domain demo.local --stand-password stand
// Учётки и компанию скрипт не создаёт — это SQL владельца (docs/DEMO.md «Сброс демо»).
import { readFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const file = args.find((a, i) => !a.startsWith('--') && !['--url', '--domain', '--stand-password', '--today'].includes(args[i - 1]));
if (!file || !existsSync(file)) { console.error('Укажите путь к файлу ВОР «Спутник» (.xlsx)'); process.exit(2); }

const envFile = new URL('../.env.local', import.meta.url);
const env = existsSync(envFile)
  ? Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
  : {};
const url = opt('--url') || env.P2_SUPABASE_URL;
const standPassword = opt('--stand-password');
if (standPassword && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url || '')) { console.error('--stand-password — только для локального стенда'); process.exit(2); }
const domain = opt('--domain') || 'demo.invalid';
const USERS = { admin: 'ADMIN', pto: 'PTO', foreman: 'FOREMAN', pm: 'PM', boss: 'BOSS' };
const email = (k) => `demo-${k}@${domain}`.replace(/^demo-(\w+)@demo\.local$/, '$1@demo.local');
const password = (k) => standPassword || env[`P2_DEMO_${USERS[k]}_PASSWORD`];
for (const k of Object.keys(USERS)) if (!password(k)) { console.error(`Нет пароля P2_DEMO_${USERS[k]}_PASSWORD в .env.local`); process.exit(2); }
globalThis.APP_CONFIG = { P2_SUPABASE_URL: url, P2_SUPABASE_ANON_KEY: env.P2_SUPABASE_ANON_KEY || 'stand' };

const { createAuthService, readAuthConfig } = await import('../src/platform/auth/auth.service.ts');
const { createProjectsService } = await import('../src/platform/company/projects.service.ts');
const { createVorService } = await import('../src/modules/planfact/vor/vor.service.ts');
const { createEstimateService } = await import('../src/modules/planfact/estimate/estimate.service.ts');
const { createFactService } = await import('../src/modules/planfact/fact/fact.service.ts');
const { createKs2Service } = await import('../src/modules/planfact/ks2/ks2.service.ts');
const { createSummaryService } = await import('../src/modules/planfact/summary/summary.service.ts');
const { readWorkbook, sha256Hex } = await import('../src/modules/planfact/vor/xlsx-reader.ts');
const { parseSheet } = await import('../src/modules/planfact/vor/parse.ts');
const { placeOf, bindPlaces, sheetBuilding } = await import('../src/modules/planfact/vor/places.ts');
const { verdicts } = await import('../src/modules/planfact/vor/VorWorks.ts');
const { canonName, unitKey, workTypeName } = await import('../src/modules/planfact/vor/matching.ts');
const { guessPriceColumns, guessTotalColumns, unitPrice } = await import('../src/modules/planfact/estimate/prices.ts');
const { buildSnapshot, guessKpColumns, kpWrites } = await import('../src/modules/planfact/estimate/kp.ts');
const { patchXlsx } = await import('../src/modules/planfact/vor/xlsx-writer.ts');
const { actHeader, actRowsOf, toEdits } = await import('../src/modules/planfact/ks2/model.ts');

const auth = createAuthService(readAuthConfig());
const projects = createProjectsService(), vor = createVorService(), est = createEstimateService();
const fact = createFactService(), ks2 = createKs2Service(), summary = createSummaryService();
const ok = (r, what) => { if (!r || r.ok === false) throw new Error(`${what}: ${r ? r.message : 'нет ответа'}`); return r.value; };
async function as(k) {
  await auth.signOut();
  const r = await auth.signIn(email(k), password(k));
  if (!r.ok) throw new Error(`вход ${email(k)}: ${r.message}`);
  console.log(`— вход: ${email(k)}`);
}
const day = (d) => { const t = new Date((opt('--today') || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };

const PROJECT = 'ЖК «Спутник» (демо)';
const SHEETS = ['себес уч.2 корп. 1.1', 'себес. уч.2 корп. 1.2'];
const bytes = new Uint8Array(readFileSync(file));
const wb = await readWorkbook(bytes);
const sha = await sha256Hex(bytes);
const fileName = file.split('/').pop();

// 1. Админ: объект и корпуса (генератор, как «Справочники → Объекты»)
await as('admin');
const company = (await projects.myAccess()).find((c) => c.company_name === 'Демо-компания');
if (!company) throw new Error('Нет доступа к «Демо-компании» — сначала SQL владельца (docs/DEMO.md)');
if ((await projects.listProjects(company.company_id)).some((p) => p.name === PROJECT)) throw new Error(`«${PROJECT}» уже есть — сначала «Сброс демо» (docs/DEMO.md)`);
const projectId = ok(await projects.createProject(company.company_id, PROJECT, 'СПУТНИК'), 'объект');
for (const name of ['Корпус 1.1', 'Корпус 1.2'])
  ok(await projects.generateBuilding({ projectId, parentId: null, name, sections: 1, floors: 12, apartmentsPerFloor: 4, firstFloor: 1 }), name);
console.log(`объект: ${PROJECT}, корпуса 1.1 и 1.2`);

// 2. ПТО: ВОР обоих листов (место — корпус листа; ЕИ пустых строк — м², двери — шт.; виды работ — по словарю или новые)
await as('pto');
const loadChildren = async (parent) => (await projects.listLocations(projectId, parent)).map((n) => ({ id: n.id, parent_id: n.parent_id, node_type: n.node_type, name: n.name, path: n.path }));
const imports = [];
for (const sheet of SHEETS) {
  const res = parseSheet(wb.sheets.find((s) => s.name === sheet));
  const totals = { works: res.stats.works, materials: res.stats.materials, rows: res.rows.length, checks: res.checks };
  const imp = ok(await vor.saveDraft({ projectId, fileName, sha256: sha, sheet, profileId: null, totals }, res.rows), `черновик ${sheet}`);
  let rows = await vor.importRows(imp);
  const sh = sheetBuilding(sheet);
  const works = rows.filter((r) => r.kind === 'work');
  const places = works.map((r) => placeOf(r.context || {}, {}, sh));
  const bound = await bindPlaces(places, loadChildren);
  const units = await projects.listUnits(company.company_id);
  const unitId = (code) => units.find((u) => u.code === code)?.id || null;
  ok(await vor.resolveRows(imp, works.map((r, i) => ({ row_no: r.row_no, location_id: bound[i].nodeId, work_type_id: null,
    unit_id: r.unit_text ? null : unitId(/двер/i.test(r.name) ? 'шт.' : 'м²'), match: null }))), 'места и ЕИ');
  if (works.some((r) => r.unit_text && /^комплекс$/i.test(r.unit_text.trim())) && !unitId('комплекс')) ok(await projects.addUnit(company.company_id, 'комплекс', 'комплекс'), 'ЕИ комплекс');
  rows = await vor.importRows(imp);
  const [u2, types, dict] = await Promise.all([projects.listUnits(company.company_id), vor.listWorkTypes(projectId), vor.dictionary(projectId)]);
  const list = verdicts(rows, u2, types, dict);
  const reds = list.filter((x) => x.v.light === 'red' && x.v.unitId);
  const uniq = new Map();
  for (const x of reds) { const n = workTypeName(x.row.name); const key = canonName(n) + '|' + x.v.unitId; if (!uniq.has(key)) uniq.set(key, { name: n, unit_id: x.v.unitId }); }
  const made = uniq.size ? ok(await vor.addWorkTypes(projectId, Array.from(uniq.values())), 'виды работ') : [];
  const idOf = new Map(made.map((m) => [canonName(m.name) + '|' + m.unit_id, m.id]));
  const items = list.filter((x) => x.v.unitId && (x.v.workTypeId || x.v.light === 'red')).map((x) => ({ row: x.row, unitId: x.v.unitId,
    workTypeId: x.v.light === 'red' ? idOf.get(canonName(workTypeName(x.row.name)) + '|' + x.v.unitId) : x.v.workTypeId }));
  ok(await vor.learn(projectId, items.map((x) => ({ name: x.row.name, unit_text: unitKey(x.row.unit_text), work_type_id: x.workTypeId }))), 'словарь');
  ok(await vor.resolveRows(imp, items.map((x) => ({ row_no: x.row.row_no, location_id: x.row.location_id, work_type_id: x.workTypeId, unit_id: x.unitId, match: 'green' }))), 'виды работ строк');
  const n = ok(await vor.confirm(imp), `подтверждение ${sheet}`);
  imports.push({ id: imp, sheet, res });
  console.log(`ВОР «${sheet}»: ${works.length} работ → ${n} позиций`);
}

// 3. ПТО: бригады, смета по двум листам (цены из файла: цена, а без неё — сумма ÷ объём), КП в форме заказчика
for (const name of ['Бригада Иванова (отделка)', 'Бригада Петрова (двери, полы)']) ok(await fact.saveBrigade(company.company_id, null, name, '', ''), name);
const estimateId = ok(await est.createEstimate(projectId, 'Тендерная смета', imports.map((i) => i.id), 6364.17), 'смета');
let erows = ok(await est.estimateRows(estimateId), 'строки сметы');
const prices = [];
for (const imp of imports) {
  const src = await vor.importRows(imp.id);
  const labels = Array.from(new Set(src.flatMap((r) => Object.keys(r.prices || {}))));
  const cols = guessPriceColumns(labels), tot = guessTotalColumns(labels);
  const byNo = new Map(src.map((r) => [r.row_no, r]));
  for (const r of erows) {
    if (r.import_id !== imp.id || (r.kind !== 'work' && r.kind !== 'material')) continue;
    const s = byNo.get(r.row_no); if (!s) continue;
    const pl = r.kind === 'work' ? unitPrice(cols.labor ? s.prices[cols.labor] : null, tot.labor ? s.prices[tot.labor] : null, s.qty) : null;
    const pm = unitPrice(cols.material ? s.prices[cols.material] : null, tot.material ? s.prices[tot.material] : null, s.qty);
    if (pl !== null || pm !== null) prices.push({ source_row_id: r.source_row_id, price_labor: pl, price_material: pm });
  }
}
ok(await est.setPrices(estimateId, prices), 'цены сметы');
erows = ok(await est.estimateRows(estimateId), 'строки сметы');
let lines = ok(await est.overheads(estimateId), 'надбавки');
if (!lines.length) { lines = ok(await est.template(company.company_id), 'шаблон надбавок'); ok(await est.saveOverheads(estimateId, lines), 'надбавки сметы'); }
const snap = buildSnapshot({ id: estimateId, name: 'Тендерная смета', area_m2: 6364.17 }, erows, lines);
let kpBytes = bytes;
for (const imp of imports) kpBytes = (await patchXlsx(kpBytes, imp.sheet, kpWrites(snap, imp.id, guessKpColumns(imp.res.columns.prices)))).bytes;
const kp = ok(await est.createKp(estimateId, sha, snap, snap.totals.total, 'Демо: цены из файла заказчика'), 'КП');
console.log(`смета: прямые ${snap.totals.total.toLocaleString('ru-RU')} ₽, итог расчёта ${snap.overheads?.total?.toLocaleString('ru-RU')} ₽; КП ред. ${kp.revision_no}`);

// 4. Прораб: факт за ~4 недели по корпусу 1.1 и одно исправление с причиной
await as('foreman');
const building = (await projects.listLocations(projectId, null)).find((n) => n.name === 'Корпус 1.1');
const pos = ok(await fact.positions(projectId, building.id), 'позиции факта');
const brigades = await fact.listBrigades(company.company_id, false);
const B = (name) => brigades.find((b) => b.name.startsWith(name)).id;
const P = (name) => { const p = pos.find((x) => x.work_name === name); if (!p) throw new Error(`нет позиции «${name}»`); return p.position_id; };
const FACT = [
  ['Грунтовка потолка', 120, -24, 'Бригада Иванова', 4], ['Грунтовка потолка', 150, -16, 'Бригада Иванова', 4],
  ['Монтаж межкомнатных дверей', 40, -21, 'Бригада Петрова', 3], ['Монтаж межкомнатных дверей', 35, -8, 'Бригада Петрова', 3],
  ['Монтаж входных дверей', 20, -14, 'Бригада Петрова', 2], ['Обеспыливание, в т.ч в с/у', 900, -2, 'Бригада Иванова', 5]];
for (const [name, qty, d, br, w] of FACT) ok(await fact.add(P(name), { brigadeId: B(br), date: day(d), qty, workers: w, manHours: null, note: '' }), `факт ${name}`);
const hist = ok(await fact.history(P('Монтаж межкомнатных дверей')), 'история');
const last = hist.find((h) => h.status === 'accepted' && Number(h.qty) === 35);
ok(await fact.correct(last.id, 30, 'Пересчёт: 5 дверей не приняты технадзором'), 'исправление');
console.log(`факт: ${FACT.length} записей, исправление 35 → 30`);

// 5. ПТО: договорная КП, акт КС-2 № 1 по дату «−7 дней» — сохранить и выдать
await as('pto');
ok(await ks2.setContract(projectId, kp.id), 'договорная КП');
const actId = ok(await ks2.createAct(projectId, '1', day(-7), day(-30), day(-7)), 'акт');
const data = ok(await ks2.act(actId), 'акт');
ok(await ks2.save(actId, actHeader(data), toEdits(actRowsOf(data)), ''), 'редакция акта');
ok(await ks2.issue(actId), 'выдача акта');
console.log('КС-2 № 1 выдан');

// 6. РП: плановые даты; руководство: сводка
await as('pm');
ok(await summary.setDates(projectId, day(-51), day(250)), 'даты');
await as('boss');
const s = ok(await summary.portfolio(), 'сводка').find((p) => p.project_id === projectId);
console.log(`сводка: ${s.pct_money} %, сделано ${Number(s.done_money).toLocaleString('ru-RU')} ₽, выставлено ${Number(s.issued_money).toLocaleString('ru-RU')} ₽, разрыв ${Number(s.gap_money).toLocaleString('ru-RU')} ₽, светофор ${s.light}`);
await auth.signOut();
process.exit(0);
