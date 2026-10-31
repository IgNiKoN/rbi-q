// P2-0053 этап 3. План/Факт «ЖК Демо»: ВОР своей формы на три корпуса и паркинг (ПТО) → смета с ценами и договорная КП →
// факт прорабов: Корпус 3 — работы закрыты 16…6 недель назад, Корпус 2 — работы объекта раньше и 4 недели этажей (одно
// исправление), Корпус 1 — без факта → КС-2 №1 и №2 выданы, №3 — черновик. Всё функциями экранов под учётками ролей.
import { createHash } from 'node:crypto';

const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

export async function seedPlanfact(ctx, core) {
  const { DATA, as, ok, day, log, rand } = ctx;
  const { projectId, objects, places, workTypes, brigades } = core;
  const pto = await as('pto');
  const V = DATA.vor;
  const sha = createHash('sha256').update('ЖК Демо · ВОР · P2-0053').digest('hex');

  // строки ВОР: объект → работы объекта; секция → этаж снизу вверх → работы этажа (+ материал); паркинг
  const rows = [];
  let no = 10;
  const kids = (parent, type) => places.filter((p) => p.parent_id === parent && (!type || p.node_type === type))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
  for (const o of DATA.objects) {
    const objId = objects[o.key];
    const list = o.kind === 'parking' ? V.parking : V.per_object;
    for (const w of list) rows.push({ row_no: no++, kind: 'work', work: w.work, name: `${workTypes[w.work].name} (${o.name})`, qty: w.qty, price: w.price,
      location: objId, object: o.key, scope: 'object' });
    if (o.kind === 'parking') continue;
    for (const sec of kids(objId, 'section')) {
      for (const fl of kids(sec.id, 'floor')) {
        const floorNo = Number(fl.name.replace(/\D/g, ''));
        for (const w of V.per_floor) {
          const k = 0.92 + rand() * 0.16;
          const wr = { row_no: no++, kind: 'work', work: w.work, name: `${workTypes[w.work].name}, ${sec.name}, ${fl.name}`, qty: round(w.qty * k, w.qty < 50 ? 1 : 0),
            price: w.price, location: fl.id, object: o.key, section: sec.name, floor: floorNo, scope: 'floor' };
          rows.push(wr);
          if (w.material) rows.push({ row_no: no++, kind: 'material', name: w.material.name, unit: w.material.unit, qty: round(wr.qty * w.material.per, 0),
            norm: w.material.per, parent: wr.row_no, price: w.material.price });
        }
      }
    }
  }
  const unitText = (r) => (r.kind === 'material' ? r.unit : DATA.work_types.find((w) => w.key === r.work).unit.replace('²', '2').replace('³', '3'));
  const imp = ok(await pto.rpc('pf_vor_create_import', { p_project: projectId, p_file_name: V.file_name, p_sha256: sha, p_sheet: V.sheet, p_profile: null,
    p_totals: { rows: rows.length } }), 'ВОР: загрузка');
  for (let i = 0; i < rows.length; i += 200) {
    ok(await pto.rpc('pf_vor_add_rows', { p_import: imp, p_rows: rows.slice(i, i + 200).map((r) => ({ row_no: r.row_no, kind: r.kind, name: r.name,
      unit_text: unitText(r), qty: r.qty, ...(r.kind === 'material' ? { norm: r.norm, parent_row_no: r.parent } : {}) })) }), 'ВОР: строки');
  }
  const works = rows.filter((r) => r.kind === 'work');
  ok(await pto.rpc('pf_vor_resolve_rows', { p_import: imp, p_items: works.map((r) => ({ row_no: r.row_no, location_id: r.location,
    work_type_id: workTypes[r.work].id, unit_id: workTypes[r.work].unit, match: 'green' })) }), 'ВОР: разбор');
  ok(await pto.rpc('pf_vor_confirm', { p_import: imp }), 'ВОР: подтвердить');
  const positions = ok(await pto.rpc('pf_vor_positions', { p_project: projectId, p_location: null }), 'позиции');
  for (const r of works) {
    const p = positions.find((x) => x.import_id === imp && x.source_row_no === r.row_no);
    if (!p) throw new Error('нет позиции для строки ВОР ' + r.row_no);
    r.position = p.id;
  }

  // смета: цены строк ВОР; КП — договорная (для КС-2)
  const est = ok(await pto.rpc('pf_estimate_create', { p_project: projectId, p_name: 'Смета ЖК Демо', p_imports: [imp], p_area: 21500 }), 'смета');
  const erows = ok(await pto.rpc('pf_estimate_rows', { p_estimate: est }), 'строки сметы');
  const byNo = new Map(rows.map((r) => [r.row_no, r]));
  ok(await pto.rpc('pf_estimate_set_prices', { p_estimate: est, p_items: erows.map((e) => {
    const r = byNo.get(e.row_no);
    return e.kind === 'material' ? { source_row_id: e.source_row_id, price_material: r.price } : { source_row_id: e.source_row_id, price_labor: r.price };
  }) }), 'цены сметы');
  const total = round(rows.reduce((s, r) => s + r.qty * r.price, 0), 2);
  const kp = ok(await pto.rpc('pf_kp_create', { p_estimate: est, p_file_sha256: sha, p_snapshot: { version: 1, rows: rows.map((r) => ({ import_id: imp, row_no: r.row_no,
    kind: r.kind, price_labor: r.kind === 'work' ? r.price : null, price_material: r.kind === 'material' ? r.price : null })) }, p_total: total,
    p_note: 'Договорная редакция' }), 'КП');
  ok(await pto.rpc('pf_ks2_set_contract', { p_project: projectId, p_kp_revision: kp.id }), 'КП → договор КС-2');

  // факт: Корпус 3 — всё закрыто в окне from…to (двумя записями); Корпус 2 — работы объекта раньше, этажи — последние 4 недели
  const f1 = await as('foreman1'), f2 = await as('foreman2');
  const frame = new Set(['slab', 'walls', 'gas', 'earth', 'found', 'hydro', 'roof']);
  const plan = [];
  const k3 = DATA.fact.k3;
  const order = (r) => (r.scope === 'object' ? (['earth', 'found', 'hydro'].includes(r.work) ? 0 : 99) : r.floor + (frame.has(r.work) ? 0 : 20));
  const k3sorted = works.filter((r) => r.object === 'k3').sort((a, b) => order(a) - order(b) || a.row_no - b.row_no);
  k3sorted.forEach((r, i) => {
    const d = k3.from_days + Math.floor((i / k3sorted.length) * (k3.to_days - k3.from_days - 5));
    const part = round(r.qty * 0.6, 1);
    const br = frame.has(r.work) ? brigades.b1 : brigades.b2;
    plan.push({ date: day(d), who: 2, brigade: br, position: r.position, qty: part });
    plan.push({ date: day(d + 5), who: 2, brigade: br, position: r.position, qty: round(r.qty - part, 1) });
  });
  const k2 = DATA.fact.k2;
  for (const r of works.filter((x) => x.object === 'k2' && x.scope === 'object' && ['earth', 'found', 'hydro'].includes(x.work))) {
    plan.push({ date: day(-70 + order(r) * 5 + ['earth', 'found', 'hydro'].indexOf(r.work) * 8), who: 2, brigade: brigades.b1, position: r.position, qty: r.qty });
  }
  const span = k2.weeks * 7;
  for (const r of works.filter((x) => x.object === 'k2' && x.scope === 'floor')) {
    const isFrame = frame.has(r.work);
    const lim = isFrame ? k2.frame_floors : k2.finish_floors;
    if (r.floor > lim) continue;
    const d = Math.min(-span + Math.floor(((r.floor - 1) / lim) * (span - k2.step_days)) + (isFrame ? 0 : 3), 0);
    const top = r.floor === lim;   // верхний этаж — в работе (половина объёма)
    plan.push({ date: day(d), who: r.section === 'Секция 1' ? 1 : 2, brigade: isFrame ? brigades.b1 : brigades.b2, position: r.position,
      qty: top ? round(r.qty / 2, 1) : r.qty });
  }
  // пачка = дата + прораб + бригада (как «Факт за день» на экране)
  const batches = new Map();
  for (const x of plan.filter((x) => x.qty > 0)) {
    const k = `${x.date}|${x.who}|${x.brigade}`;
    if (!batches.has(k)) batches.set(k, { ...x, items: [] });
    batches.get(k).items.push({ position_id: x.position, qty: x.qty });
  }
  let entries = 0, pending = 0;
  for (const b of [...batches.values()].sort((a, b) => a.date.localeCompare(b.date) || a.who - b.who)) {
    const res = ok(await (b.who === 1 ? f1 : f2).rpc('pf_fact_add_batch', { p_project: projectId, p_brigade: b.brigade, p_date: b.date, p_items: b.items,
      p_workers: 4 + Math.floor(rand() * 5), p_note: null, p_require_approval: false }), `факт ${b.date}`);
    entries += Number(res.accepted || 0) + Number(res.pending || 0);
    pending += Number(res.pending || 0);
  }
  // одно исправление прораба (ошибся в объёме) — последняя запись прораба секции 1
  const journal = ok(await f1.rpc('pf_fact_journal', { p_project: projectId, p_from: day(-span), p_to: day(0) }), 'журнал факта');
  const rowOf = new Map(works.map((r) => [r.position, r.row_no]));
  const mine = (Array.isArray(journal) ? journal : []).filter((e) => e.status === 'accepted' && Number(e.qty) > 2)
    .sort((a, b) => String(b.work_date).localeCompare(String(a.work_date)) || (rowOf.get(a.position_id) || 0) - (rowOf.get(b.position_id) || 0));
  let corrected = 0;
  const factByPos = new Map();
  for (const x of plan.filter((x) => x.qty > 0)) factByPos.set(x.position, (factByPos.get(x.position) || 0) + x.qty);
  if (mine[0]) {
    factByPos.set(mine[0].position_id, factByPos.get(mine[0].position_id) - 1);
    ok(await f1.rpc('pf_fact_correct', { p_entry: mine[0].id, p_qty: round(Number(mine[0].qty) - 1, 1), p_reason: 'Ошибся в объёме: пересчитал по исполнительной схеме', p_note: null }), 'исправление факта');
    corrected = 1;
  }

  // КС-2: №1 и №2 выданы, №3 — черновик текущего периода
  const acts = [];
  for (const a of DATA.ks2) {
    const id = ok(await pto.rpc('pf_ks2_act_create', { p_project: projectId, p_act_no: a.no, p_act_date: day(a.to_days), p_from: day(a.from_days), p_to: day(a.to_days) }), `КС-2 №${a.no}`);
    ok(await pto.rpc('pf_ks2_save', { p_act: id, p_header: { customer: 'ООО «Девелопмент Демо»', contract_no: 'Д-ЖКД-01', contract_date: day(DATA.project.planned_start_days) },
      p_rows: [], p_note: null }), `КС-2 №${a.no}: шапка`);
    if (a.issue) ok(await pto.rpc('pf_ks2_issue', { p_act: id }), `КС-2 №${a.no}: выдать`);
    acts.push({ id, ...a });
  }
  // ожидаемые деньги факта по данным засева (цены КП; материал — объём работы × норма × цена материала)
  const matOf = new Map(rows.filter((r) => r.kind === 'material').map((m) => [m.parent, m]));
  let expectedDone = 0;
  const doneByObject = {};
  for (const r of works) {
    const q = factByPos.get(r.position) || 0;
    const m = matOf.get(r.row_no);
    const v = q * r.price + (m ? q * m.norm * m.price : 0);
    expectedDone += v;
    doneByObject[r.object] = (doneByObject[r.object] || 0) + v;
  }
  const summary = { vorRows: rows.length, expectedDone: round(expectedDone, 2), doneByObject: Object.fromEntries(Object.entries(doneByObject).map(([k, v]) => [k, round(v, 2)])), positions: works.length, kpTotal: total, factEntries: entries, pending, corrected, ks2: acts.length,
    ks2Issued: acts.filter((a) => a.issue).length };
  log(`План/Факт: строк ВОР ${rows.length}, позиций ${works.length}, КП ${total.toLocaleString('ru-RU')} ₽, записей факта ${entries} (на проверке ${pending}), исправлений ${corrected}, КС-2 ${acts.length}`);
  return { importId: imp, estimateId: est, kpId: kp.id, acts, works, summary };
}
