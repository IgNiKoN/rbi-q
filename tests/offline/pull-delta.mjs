// P2-0078 этап 4: синхронизация Качества — только изменения. s-pull-delta: новое устройство скачивает всё (12 таблиц, которые
// прежде читались целиком каждый проход, и реестр файлов) → повторный проход без изменений — 0 строк данных (запросы «изменено
// после») → изменённая на сервере запись приходит и обновляется на устройстве. Боевой сервер не используется.
import { start, stop, stand, served, resetNet, COMPANY } from './servers.mjs';
import { freshProfile, launch, note, ok, signIn } from './lib.mjs';

const AGO = new Date(Date.now() - 2 * 3600e3).toISOString();
const base = (t, i) => ({ id: `pd-${t}-${i}`, project_code: 'p-1', core_company_id: COMPANY.id, updated_at: AGO, created_at: AGO, is_deleted: false });
const three = (t, extra) => [1, 2, 3].map((i) => ({ ...base(t, i), ...extra(i) }));
/** Таблица → [хранилище на устройстве, строки сервера]. contractors дописывает реквизиты в карточки справочника (тот же id). */
function rowsOf() {
  return {
    contractor_directory: ['CONTRACTOR_DIRECTORY', three('cd', (i) => ({ canonical_key: 'фирма ' + i, display_name: 'Фирма ' + i }))],
    contractor_aliases: ['CONTRACTOR_ALIASES', three('ca', (i) => ({ raw_name: 'Фирма ' + i + ' ООО', canonical_key: 'фирма ' + i }))],
    contractor_normalization_queue: ['CONTRACTOR_QUEUE', three('cq', (i) => ({ raw_name: 'Новая фирма ' + i, status: 'pending' }))],
    contractors: [null, three('cd', (i) => ({ legal_name: 'ООО «Фирма ' + i + '»', inn: '77000000' + i }))],
    contracts: ['CONTRACTS', three('ct', (i) => ({ contractor_id: 'pd-cd-' + i, number: 'Д-' + i }))],
    location_nodes: ['LOCATION_NODES', three('ln', (i) => ({ nodeType: 'building', displayName: 'Корпус ' + i, parentId: null }))],
    construction_floors_v2: ['CONST_FLOORS_V2', three('fl', () => ({ locationId: 'pd-ln-1' }))],
    construction_defects_v2: ['CONST_DEFECTS_V2', three('df', (i) => ({ locationId: 'pd-ln-1', status: 'issued', text: 'Замечание ' + i, history: [] }))],
    construction_acceptance_v2: ['CONST_ACCEPTANCE_V2', three('ac', () => ({ locationId: 'pd-ln-1', status: 'requested' }))],
    construction_units_v2: ['CONST_UNITS_V2', three('un', (i) => ({ locationId: 'pd-ln-1', name: String(i), type: 'КВ', status: 'none', sort_order: i }))],
    sk_records: ['SK_RECORDS', three('sk', (i) => ({ sk_number: String(i), sk_unique_key: 'pd-sk-' + i, text: 'СК ' + i, status_normalized: 'open' }))],
    file_registry: ['FILE_REGISTRY', three('fr', (i) => ({ bucket: 'inspection-photos', storage_path: 'p/pd-' + i + '.jpg', entity_type: 'inspection',
      entity_id: 'pd-' + i, cache_status: 'cloud_only' }))]
  };
}

const onDevice = (page, map) => page.evaluate(async (m) => {
  const out = {};
  for (const [t, [store, ids]] of Object.entries(m)) {
    if (!store) continue;
    const all = (await window.RBI.services.storage.getAll(STORES[store])) || [];
    out[t] = ids.filter((id) => all.some((r) => String(r.id) === id || String(r.sk_unique_key || '') === id)).length;
  }
  const dir = (await window.RBI.services.storage.getAll(STORES.CONTRACTOR_DIRECTORY)) || [];
  out.contractors = dir.filter((r) => String(r.id).startsWith('pd-cd-') && /ООО «Фирма/.test(r.legal_name || '')).length;
  const ln = (await window.RBI.services.storage.getAll(STORES.LOCATION_NODES)) || [];
  out.renamed = ln.filter((r) => /изменён/.test(r.displayName || r.display_name || '')).length;
  return out;
}, map).catch((e) => ({ err: e.message }));

async function pass(page) {
  const before = await page.evaluate(() => localStorage.getItem('rbi_sync_last_pull_at')).catch(() => null);
  for (let k = 0; k < 20 && (await page.evaluate(() => !!window.isSyncing).catch(() => false)); k++) await page.waitForTimeout(500);
  await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {});
  for (let k = 0; k < 40; k++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => ({ at: localStorage.getItem('rbi_sync_last_pull_at'), busy: !!window.isSyncing })).catch(() => ({}));
    if (s.at && s.at !== before && !s.busy) break;
  }
  await page.waitForTimeout(1500);   // реестр файлов — в конце прохода
}
const snap = () => Object.fromEntries([...served.entries()].map(([t, c]) => [t, { ...c }]));
const diff = (a, b) => Object.fromEntries(Object.keys(rowsOf()).map((t) => [t, {
  queries: ((b[t] || {}).queries || 0) - ((a[t] || {}).queries || 0), rows: ((b[t] || {}).rows || 0) - ((a[t] || {}).rows || 0),
  delta: ((b[t] || {}).delta || 0) - ((a[t] || {}).delta || 0) }]));

async function pullDelta(out) {
  const tag = 's-pull-delta';
  note(`== ${tag}: новое устройство — всё скачано → повторный проход без изменений — 0 строк → изменённая запись приходит`);
  freshProfile(out, tag); resetNet();
  const R = rowsOf();
  stand.serve = Object.fromEntries(Object.entries(R).map(([t, [, rows]]) => [t, rows]));
  const want = Object.fromEntries(Object.entries(R).map(([t, [store, rows]]) => [t, [store, rows.map((r) => r.sk_unique_key || r.id)]]));
  try {
    await start();
    const { ctx, page } = await launch(out, tag);
    const warns = [];
    page.on('console', (m) => { const t = m.text(); if (/Sync|StorageManager/.test(t) && /Не удалось|ошиб|rror|Полный|пуст/i.test(t)) warns.push(t.slice(0, 220)); });
    await signIn(page);
    // у инженера есть проверки и база знаний (пустые — прежнее правило «загрузить всё» каждый проход: ТД P2-0078)
    await page.evaluate(async () => {
      const S = window.RBI.services.storage, at = new Date().toISOString(), synced = { source: 'cloud', syncStatus: 'synced', sync_status: 'synced', updatedAt: at };
      await S.put('app_history', { id: 'pd-insp-1', date: at, object: 'PD', template: 'Земляные работы', status: 'done', ...synced });
      await S.put('custom_docs', { id: 'pd-doc-1', title: 'Документ PD', ...synced });
    }).catch(() => {});
    await pass(page);
    const d1 = await onDevice(page, want);
    note('на устройстве после первого прохода: ' + JSON.stringify(d1));
    if (warns.length) note('журнал синхронизации: ' + JSON.stringify(warns.slice(0, 10)));
    const all = Object.keys(R).every((t) => d1[t] === 3);
    ok(all, `${tag}: новое устройство — все строки 12 таблиц на месте (по 3), реквизиты фирм дописаны`, JSON.stringify(d1));
    const s1 = snap();
    await pass(page);
    const p2 = diff(s1, snap());
    note('второй проход (без изменений): ' + JSON.stringify(p2));
    const asked = Object.entries(p2).filter(([, c]) => c.queries > 0);
    ok(asked.length >= 11 && asked.every(([, c]) => c.rows === 0 && c.delta === c.queries),
      `${tag}: повторный проход без изменений — 0 строк данных, каждый запрос «изменено после»`,
      asked.map(([t, c]) => `${t}: ${c.rows}/${c.queries}`).join(', '));
    // изменение на сервере: узел места переименован, замечание СК — новое время
    const now = new Date().toISOString();
    stand.serve.location_nodes[0] = { ...stand.serve.location_nodes[0], displayName: 'Корпус 1 (изменён)', updated_at: now };
    stand.serve.sk_records[1] = { ...stand.serve.sk_records[1], text: 'СК 2 (изменено)', updated_at: now };
    const s2 = snap();
    await pass(page);
    const p3 = diff(s2, snap());
    const d3 = await onDevice(page, want);
    const skText = await page.evaluate(async () => ((await window.RBI.services.storage.getAll(STORES.SK_RECORDS)) || [])
      .filter((r) => /изменено/.test(r.text || '')).length).catch(() => -1);
    note('третий проход (изменены 2 строки): ' + JSON.stringify(p3) + ' устройство: ' + JSON.stringify({ ...d3, skText }));
    ok(p3.location_nodes.rows === 1 && p3.sk_records.rows === 1 && d3.renamed === 1 && skText === 1,
      `${tag}: изменённые на сервере записи пришли и обновились на устройстве (место, замечание СК)`,
      `строк ${p3.location_nodes.rows}/${p3.sk_records.rows}, на устройстве ${d3.renamed}/${skText}`);
    ok(Object.entries(p3).every(([t, c]) => ['location_nodes', 'sk_records'].includes(t) || c.rows === 0),
      `${tag}: остальные таблицы — 0 строк`, JSON.stringify(p3));
    await ctx.close();
  } finally { stand.serve = null; await stop().catch(() => {}); }
}

export function pullDeltaScenarios(out) {
  return { 's-pull-delta': () => pullDelta(out) };
}
