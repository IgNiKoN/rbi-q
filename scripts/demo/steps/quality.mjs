// P2-0053 этап 3. Качество и Стройконтроль «ЖК Демо» (как пишет телефон: таблицы quality.* с заголовком компании):
// карточки подрядчиков; 10 проверок по чек-листам (системные шаблоны Качества = чек-листы видов работ) с нарушениями и
// фото-заглушками; 30 замечаний Стройконтроля — Корпус 2 на PDF-планах этажей и рядом (открыты, в работе, устранены),
// Корпус 3 — закрыты; 3 приёмки (Корпус 3 — принята, Корпус 2 — запись подрядчика и возврат на доработку).
import { createHash, randomUUID } from 'node:crypto';
import { stubPhoto } from './png.mjs';
import { TEMPLATES } from './templates.mjs';

const DEFECTS = [
  ['Отклонение стены от вертикали более 8 мм', 'monolit', 'frame'],
  ['Раковины и сколы бетона на колонне', 'monolit', 'frame'],
  ['Оголение арматуры перекрытия', 'armature', 'frame'],
  ['Неполное заполнение швов кладки', 'gazobeton', 'frame'],
  ['Трещина в штукатурном слое', 'otdelka_shtukaturka', 'finish'],
  ['Штукатурка: неровность более 3 мм на 2 м', 'otdelka_shtukaturka', 'finish'],
  ['Стяжка: отклонение от горизонтали', 'polusuhaya_styazhka', 'finish'],
  ['Окно: монтажный шов без пароизоляции', 'okna_pvh', 'finish'],
  ['Окно: отклонение рамы от вертикали', 'okna_pvh', 'finish'],
  ['Мусор и остатки раствора в МОП', 'sdacha_mop', 'finish']
];
const K2_STATUS = ['open', 'open', 'in_progress', 'fixed', 'open', 'in_progress', 'closed', 'open', 'rejected'];

/** Ключ фирмы — как quality.contractor_key на сервере (по нему карточка связывается с контрагентом ядра). */
export const contractorKey = (name) => String(name || '').toLowerCase().replace(/ё/g, 'е').replace(/["'«»„“”]/g, '').replace(/[.,;:()№]/g, ' ')
  .replace(/\s+/g, ' ').trim().replace(/[^a-zа-я0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown_contractor';

/** Первая квартира этажа (сквозная нумерация объекта, как pf_fill_object). */
export function firstApt(DATA, objKey, section, floor) {
  const o = DATA.objects.find((x) => x.key === objKey);
  return (section - 1) * o.floors * o.apartments + (floor - 1) * o.apartments + 1;
}

export async function seedQuality(ctx, core) {
  const { DATA, asCompany, ok, day, log, url } = ctx;
  const { companyId, projectId, at } = core;
  const admin = await asCompany('admin', companyId);
  const qc = await asCompany('qc', companyId);
  const contractorRep = await asCompany('contractor', companyId);
  const qcName = DATA.company.users.find((u) => u.key === 'qc').name;
  const repName = DATA.company.users.find((u) => u.key === 'contractor').name;
  const cpName = (k) => DATA.counterparties.find((c) => c.key === k).name;
  const iso = (d, hm = '09:00') => new Date(day(d) + 'T' + hm + ':00+03:00').toISOString();

  // карточки подрядчиков Качества / СК: сервер заводит их сам по контрагентам ядра; нет — заводим, как экран «Подрядчики»
  const cards = {};
  const have = ok(await admin.schema('quality').from('contractor_directory').select('id,canonical_key,project_code').eq('is_deleted', false), 'карточки подрядчиков');
  for (const k of ['frame', 'finish', 'networks']) {
    const key = contractorKey(cpName(k));
    const found = have.find((c) => c.canonical_key === key && (c.project_code === projectId || !c.project_code));
    if (found) { cards[k] = found.id; continue; }
    cards[k] = randomUUID();
    ok(await admin.schema('quality').from('contractor_directory').insert({ id: cards[k], project_code: projectId, canonical_key: key, display_name: cpName(k), synonyms: [],
      inn: DATA.counterparties.find((c) => c.key === k).inn, created_by: DATA.company.users[0].name }), 'карточка подрядчика');
  }

  // фото: закрытый бакет компании, путь как у синхронизации Качества (первая папка — компания)
  async function photo(bucket, folder, kind, seed) {
    const png = stubPhoto(kind, seed);
    const path = `${companyId}/${folder}/photo_${createHash('sha256').update(png).digest('hex').slice(0, 32)}.png`;
    const r = await qc.storage.from(bucket).upload(path, png, { contentType: 'image/png', upsert: true });
    if (r.error) throw new Error(`фото ${bucket}: ${r.error.message}`);
    return { url: `${url}/storage/v1/object/public/${bucket}/${path}`, path };
  }

  // проверки Качества
  const insp = [
    { tpl: 'otdelka_shtukaturka', obj: 'k3', sec: 1, fl: 2, days: -60, fails: 0, cp: 'finish' },
    { tpl: 'otdelka_plitka', obj: 'k3', sec: 2, fl: 4, days: -52, fails: 0, cp: 'finish' },
    { tpl: 'okna_pvh', obj: 'k3', sec: 1, fl: 6, days: -48, fails: 1, cp: 'finish' },
    { tpl: 'armature', obj: 'k2', sec: 1, fl: 5, days: -12, fails: 1, cp: 'frame' },
    { tpl: 'monolit', obj: 'k2', sec: 1, fl: 5, days: -10, fails: 2, cp: 'frame' },
    { tpl: 'monolit', obj: 'k2', sec: 2, fl: 6, days: -6, fails: 1, cp: 'frame' },
    { tpl: 'gazobeton', obj: 'k2', sec: 1, fl: 3, days: -8, fails: 1, cp: 'frame' },
    { tpl: 'otdelka_shtukaturka', obj: 'k2', sec: 1, fl: 3, days: -3, fails: 2, cp: 'finish' },
    { tpl: 'polusuhaya_styazhka', obj: 'k2', sec: 2, fl: 2, days: -2, fails: 1, cp: 'finish' },
    { tpl: 'okna_pvh', obj: 'k2', sec: 1, fl: 2, days: -1, fails: 0, cp: 'finish' }
  ];
  const inspections = [], items = [], photos = [];
  for (const [n, x] of insp.entries()) {
    const id = randomUUID();
    const t = TEMPLATES[x.tpl];
    const obj = DATA.objects.find((o) => o.key === x.obj);
    const floorId = at(`${x.obj}/Секция ${x.sec}/эт. ${x.fl}`);
    const list = t.items.slice(0, 6);
    const failIdx = new Set(list.map((_, i) => i).sort((a, b) => (list[b].w - list[a].w) || a - b).slice(0, x.fails));
    let b2 = 0, b3 = 0, wOk = 0, wAll = 0;
    for (const [i, it] of list.entries()) {
      const fail = failIdx.has(i);
      wAll += it.w; if (!fail) wOk += it.w; else if (it.w >= 3) b3++; else b2++;
      const comment = fail ? (x.tpl === 'monolit' ? 'Отклонение 9 мм — переделать' : x.tpl === 'okna_pvh' ? 'Монтажный шов не закрыт' : 'Устранить до следующей проверки') : '';
      items.push({ id: randomUUID(), inspection_id: id, project_code: projectId, project_canonical_key: DATA.project.name, source: 'cloud', sync_status: 'synced',
        sync_block_reason: '', item_id: String(it.id), item_name: it.n, item_weight: it.w, status: fail ? 'fail' : 'ok', comment, cause_code: fail ? 'C01' : '',
        fact_value: '', tolerance_value: '', details: fail ? { comment, causeCode: 'C01', name: it.n, weight: it.w } : {} });
      if (fail) {
        const p = await photo('quality-inspection-photos', `${projectId}/inspections/${id}/${it.id}_0`, 'bad', n * 7 + i);
        photos.push({ id: randomUUID(), inspection_id: id, project_code: projectId, project_canonical_key: DATA.project.name, source: 'cloud', sync_status: 'synced',
          sync_block_reason: '', item_id: String(it.id), photo_index: 0, photo_type: 'inspection', bucket_name: 'quality-inspection-photos',
          storage_path: p.path, public_url: p.url });
      }
    }
    const score = Math.round((wOk / wAll) * 100);
    const pin = x.obj === 'k2' && x.sec === 1 && [3, 5].includes(x.fl) ? { planPin: { locationId: floorId, x: 20 + (n * 13) % 60, y: 25 + (n * 17) % 50 } } : {};
    inspections.push({ id, project_code: projectId, project_name: DATA.project.name, project_canonical_key: DATA.project.name, project_display_name: DATA.project.name,
      engineer_name: qcName, inspector_name: qcName, contractor_name: cpName(x.cp), template_key: 'sys_' + x.tpl, template_title: t.title,
      location: `${obj.name}, Секция ${x.sec}, эт. ${x.fl}`, section: `Секция ${x.sec}`, floor: `эт. ${x.fl}`, room: '', inspection_date: iso(x.days, `1${n % 8}:${10 + n}`),
      metrics: { final: score, baseUrkPerc: score, checkedCount: list.length, totalCount: list.length, n_B1_fail: 0, n_B2_fail: b2, n_B3_fail: b3,
        b3_found: b3 > 0, kc: b2 > 2 ? 0.85 : 1, kcrit: b3 > 0 ? 0.5 : 1, isDanger: b3 > 0, ...pin },
      is_completed: true, is_deleted: false, inspection_type: 'rbi_audit', source: 'cloud', sync_status: 'synced', sync_block_reason: '', projectId });
  }
  ok(await qc.schema('quality').from('rbi_inspections').upsert(inspections, { onConflict: 'core_company_id,id' }), 'проверки Качества');
  ok(await qc.schema('quality').from('rbi_inspection_items').upsert(items, { onConflict: 'core_company_id,id' }), 'пункты проверок');
  if (photos.length) ok(await qc.schema('quality').from('rbi_inspection_photos').upsert(photos, { onConflict: 'core_company_id,id' }), 'фото проверок');

  // замечания Стройконтроля: Корпус 2 — на этажах с PDF-планами (точки) и рядом; Корпус 3 — закрыты
  const floors = [
    { id: at('k2/Секция 1/эт. 5'), obj: 'k2', n: 9, plan: true },
    { id: at('k2/Секция 1/эт. 3'), obj: 'k2', n: 9, plan: true },
    { id: at('k2/Секция 2/эт. 4'), obj: 'k2', n: 6, plan: false },
    { id: at('k3/Секция 1/эт. 2'), obj: 'k3', n: 6, plan: true }
  ];
  const defects = [];
  let k = 0;
  for (const f of floors) {
    for (let i = 0; i < f.n; i++, k++) {
      const [text, tpl, firm] = DEFECTS[k % DEFECTS.length];
      const status = f.obj === 'k3' ? 'closed' : K2_STATUS[i % K2_STATUS.length];
      const created = f.obj === 'k3' ? -70 + i * 3 : -20 + i * 2;
      const id = randomUUID();
      const p = await photo('quality-construction-defects', `defects/${id}`, 'bad', 100 + k);
      const hist = [{ at: iso(created), status: 'open', by: qcName }];
      if (status !== 'open') hist.push({ at: iso(Math.min(created + 3, 0), '15:00'), status, by: ['in_progress', 'fixed'].includes(status) ? repName : qcName });
      defects.push({ id, locationId: f.id, x: f.plan ? 12 + ((k * 37) % 76) : null, y: f.plan ? 14 + ((k * 53) % 72) : null,
        template_key: 'sys_' + tpl, item_name: text, text, category: k % 4 === 0 ? 'Критическое' : 'Значительное', description: text,
        deadline: iso(f.obj === 'k3' ? created + 10 : created + 10, '18:00'), contractorId: cards[firm], photo: p.url, status,
        history: hist, created_by: qcName, is_deleted: false, created_at: iso(created) });
    }
  }
  ok(await qc.schema('quality').from('construction_defects_v2').insert(defects), 'замечания СК');

  // приёмки
  const accept = [
    { loc: at(`k3/Секция 1/эт. 2/кв. ${firstApt(DATA, 'k3', 1, 2)}`), tpl: 'sdacha_kv_bez_otdelki', wt: 'Этап сдачи: квартира без отделки', status: 'accepted', days: -45 },
    { loc: at('k2/Секция 1/эт. 3'), tpl: 'otdelka_shtukaturka', wt: 'Штукатурка стен', status: 'pending', days: 2 },
    { loc: at('k2/Секция 1/эт. 2'), tpl: 'okna_pvh', wt: 'Окна ПВХ', status: 'rejected', days: -4 }
  ];
  const acceptances = accept.map((a) => ({ id: randomUUID(), locationId: a.loc, zone: null, template_key: 'sys_' + a.tpl, work_type: a.wt, volume: '1 этаж',
    requested_date: day(a.days), requested_time: '10:00', contractorId: cards.finish, status: a.status, created_by: qcName, is_deleted: false,
    checklist_results: a.status === 'pending' ? null : { result: a.status, comment: a.status === 'rejected' ? 'Монтажный шов не закрыт — повторная приёмка' : 'Принято без замечаний' } }));
  ok(await qc.schema('quality').from('construction_acceptance_v2').insert(acceptances), 'приёмки');

  // подрядчик видит только свою фирму (проверка засева)
  const mine = ok(await contractorRep.schema('quality').from('construction_defects_v2').select('id'), 'замечания глазами подрядчика');
  const summary = { inspections: inspections.length, inspectionFails: items.filter((i) => i.status === 'fail').length, photos: photos.length + defects.length,
    defects: defects.length, defectsOnPlans: defects.filter((d) => d.x !== null).length, acceptances: acceptances.length,
    contractorSees: mine.length, contractorOwn: defects.filter((d) => d.contractorId === cards.finish).length };
  log(`Качество и СК: проверок ${summary.inspections} (нарушений ${summary.inspectionFails}), замечаний СК ${summary.defects} (на планах ${summary.defectsOnPlans}), приёмок ${summary.acceptances}, фото ${summary.photos}; подрядчик видит ${summary.contractorSees} из своих ${summary.contractorOwn}`);
  return { cards, summary };
}
