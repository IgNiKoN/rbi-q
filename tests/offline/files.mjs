// P2-0060 этап 4: «Фото и PDF заранее» по роли — стенд test:offline. В Качество кладутся 300 осмотров с фото по 3 объектам за 90 дней
// (в памяти страницы, как после синхронизации), докачка — тем же вызовом, что автокэш после синхронизации (охват 'auto').
// f-field — прораб (инженер, закреплён «Объект 1»): скачано только своё за 30 дней + фото открытых замечаний своего объекта, без сети
// его фото открываются; f-manager — руководитель: заранее 0. В обоих — неотправленный осмотр с фото на месте и уходит ровно 1 раз.
// Боевой сервер не используется (servers.mjs — подставной, lib.mjs отрезает rbi-q.ru). Замер — files.json в папке --out.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, stop, resetNet, stand, log, sends, API } from './servers.mjs';
import { freshProfile, launch, note, ok, signIn } from './lib.mjs';

export const filesMeasures = [];
const DAY = 864e5;
const OBJECTS = ['Объект 1', 'Объект 2', 'Объект 3'];
/** Номера объектов ядра (UUID) — по ним Качество сверяет запись с закреплёнными объектами (object-directory.service). */
const IDS = ['0b1e0000-0000-4000-8000-000000000001', '0b1e0000-0000-4000-8000-000000000002', '0b1e0000-0000-4000-8000-000000000003'];
const photo = (o, i, item) => `${API}/storage/v1/object/public/stand-photos/o${o + 1}/i${i}-${item}.jpg`;

/** 300 осмотров: 3 объекта × 100, раз в 0,9 дня за 90 дней; пункт 1 «не принят» в каждом 10-м (разовый шаблон), пункт 2 — «принят». */
function seed(now) {
  const list = [];
  for (let o = 0; o < 3; o++) for (let i = 0; i < 100; i++) {
    const at = now - Math.round(i * 0.9 * DAY);
    // пункт 1 «не принят» — в каждом 10-м осмотре по разовому шаблону (повторного осмотра нет — замечание открыто)
    const tpl = i % 10 === 0 ? 'Разовый ' + i : 'Шаблон ' + (i % 5);
    list.push({ id: `seed-${o}-${i}`, date: new Date(at).toISOString(), projectId: IDS[o], project: OBJECTS[o], object: OBJECTS[o], template: tpl, templateKey: 'user_stand' + (i % 5), status: 'done',
      engineer: 'Иванов Иван', state: { '1': i % 10 === 0 ? 'fail' : 'ok', '2': 'ok' }, photos: { '1': [photo(o, i, 1)], '2': [photo(o, i, 2)] }, syncStatus: 'synced' });
  }
  return list;
}
/** Ожидаемое для прораба (Объект 1) — считается здесь независимо от приложения: за 30 дней — оба фото; старше — фото пункта 1,
 *  если по этому шаблону более поздние осмотры его не приняли. */
function expectedField(list, now) {
  const want = new Set();
  const mine = list.filter((r) => r.project === OBJECTS[0]);
  for (const r of mine) if (now - Date.parse(r.date) <= 30 * DAY) { want.add(r.photos['1'][0]); want.add(r.photos['2'][0]); }
  for (const r of mine) {
    if (r.state['1'] !== 'fail' || now - Date.parse(r.date) <= 30 * DAY) continue;
    const later = mine.some((x) => x.template === r.template && Date.parse(x.date) > Date.parse(r.date));
    if (!later) want.add(r.photos['1'][0]);
  }
  return want;
}

async function run(out, tag, role) {
  note(`== ${tag}: 300 осмотров по 3 объектам за 90 дней → докачка «заранее» по роли (${role})`);
  freshProfile(out, tag); resetNet();
  stand.quality = role === 'field'
    ? { actions: ['quality.edit', 'quality.view'], templates: [], projects: null, contractor: null, objects: [{ key: IDS[0] }], container: null }
    : null;   // руководитель — права стенда по умолчанию (quality.manage)
  try {
    await start();
    const { ctx, page } = await launch(out, tag, { width: 375, height: 812 });
    await signIn(page);
    await page.waitForTimeout(4000);
    // закреплённый объект прораба — из ответа сервера (my_access.objects, P2-0033) через мост
    const mine = await page.evaluate((ids) => { const p = window.RBI.services.permissions; const a = p.getAssignedProjects();
      return [p.isRecordInAssignedProjects({ projectId: ids[0] }, a), p.isRecordInAssignedProjects({ projectId: ids[1] }, a)]; }, IDS).catch(() => null);
    if (role === 'field') ok(!!mine && mine[0] && !mine[1], `${tag}: закреплён «Объект 1» — свои осмотры отличаются от чужих`, JSON.stringify(mine));
    const role0 = await page.evaluate(() => window.RBI.qualitySync && window.RBI.qualitySync.role).catch(() => null);
    const scope = await page.evaluate(() => window.rbiAutoCacheScope && window.rbiAutoCacheScope()).catch(() => null);
    note(`роль экрана: ${role0}, охват: ${scope}`);
    ok(role === 'field' ? scope === 'mine30' : scope === 'none', `${tag}: охват по роли — ${role === 'field' ? 'мои объекты за 30 дней' : 'не скачивать заранее'}`, String(scope));
    // неотправленный осмотр с фото (записан без сети)
    await ctx.setOffline(true);
    const unsent = await page.evaluate(async ([pid, pname]) => {
      const S = window.RBI.services; const ref = 'local://p2f-' + Date.now();
      await S.storage.put('app_photos', { id: ref, data: new Uint8Array(4096).buffer, mimeType: 'image/jpeg', sizeBytes: 4096 });
      // на своём объекте (подрядчику / инженеру с закреплёнными объектами Качество отправляет только свои объекты)
      const r = await S.inspections.save({ id: 'p2f-' + Date.now(), date: new Date().toISOString(), projectId: pid, project: pname, object: 'FILES-MARK', template: 'Земляные работы', status: 'done',
        engineer: 'Иванов Иван', state: { '1': 'bad' }, details: { '1': { comment: 'стенд' } }, photos: { '1': [ref] } });
      return { id: r && r.id, ref };
    }, [IDS[0], OBJECTS[0]]);
    await ctx.setOffline(false);
    const now = await page.evaluate(() => Date.now());
    const list = seed(now);
    await page.evaluate((l) => { contractorArray.push(...l); }, list);
    const n0 = log.length;
    await page.evaluate(() => window.downloadMissingCloudFiles(true, 'auto')).catch((e) => note('докачка: ' + e.message.split('\n')[0]));
    await page.waitForTimeout(1500);
    const got = new Set(log.slice(n0).filter((x) => /^GET \/storage\/v1\/object\/public\/stand-photos\//.test(x)).map((x) => API + x.slice(4).split('?')[0]));
    const want = role === 'field' ? expectedField(list, now) : new Set();
    const extra = [...got].filter((u) => !want.has(u)), missing = [...want].filter((u) => !got.has(u));
    filesMeasures.push({ tag, role: role0, scope, photos: list.length * 2, wanted: want.size, downloaded: got.size, extra: extra.length, missing: missing.length });
    note(`фото всего ${list.length * 2}, ожидалось ${want.size}, скачано ${got.size}, лишних ${extra.length}, не хватает ${missing.length}`);
    ok(extra.length === 0 && missing.length === 0, `${tag}: скачано ровно положенное по роли`, `скачано ${got.size} из ${list.length * 2}` + (extra[0] ? ', лишнее ' + extra[0] : '') + (missing[0] ? ', нет ' + missing[0] : ''));
    if (role === 'field') {
      const otherObj = [...got].filter((u) => !/\/o1\//.test(u)).length;
      ok(otherObj === 0, `${tag}: фото чужих объектов не скачаны`);
      const oldOpen = [...got].filter((u) => list.some((r) => r.photos['1'][0] === u && now - Date.parse(r.date) > 30 * DAY)).length;
      ok(oldOpen > 0, `${tag}: фото открытых замечаний старше 30 дней — скачаны`, String(oldOpen));
      // без сети свои фото открываются из памяти телефона
      await ctx.setOffline(true);
      const sample = [...want].slice(0, 5);
      const cached = await page.evaluate(async (urls) => { let n = 0; for (const u of urls) { const r = await dbGet(STORES.PHOTOS, u); if (r && r.data) n++; } return n; }, sample);
      ok(cached === sample.length, `${tag}: без сети свои фото — на телефоне`, `${cached} из ${sample.length}`);
      await ctx.setOffline(false);
    }
    // неотправленное после докачки: либо ждёт отправки и его фото на телефоне, либо уже ушло (фото загружено — ссылка облачная)
    const local = () => page.evaluate(async (u) => {
      const all = await window.RBI.services.inspections.getActive();
      const r = all.find((x) => x.id === u.id);
      const p = await dbGet('app_photos', u.ref);
      const st = r && (r.syncStatus || r.sync_status);
      const ph = r && r.photos && r.photos['1'] && r.photos['1'][0];
      return { has: !!r, st, blob: !!(p && p.data), cloud: typeof ph === 'string' && ph.startsWith('http') };
    }, unsent).catch((e) => ({ err: e.message }));
    const l1 = await local();
    ok(l1.has && ((l1.st !== 'synced' && l1.blob) || (l1.st === 'synced' && l1.cloud)), `${tag}: неотправленный осмотр после докачки — на месте (фото на телефоне или уже ушло)`, JSON.stringify(l1));
    let sent = 0;
    for (let i = 0; i < 20 && sent === 0; i++) { sent = sends.get(unsent.id) || 0; if (sent) break; await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {}); await page.waitForTimeout(4000); }
    await page.waitForTimeout(3000);
    sent = sends.get(unsent.id) || 0;
    const l2 = await local();
    // P2-0061: осмотр инженера с закреплённым объектом уходит (автор — id учётной записи, правило устройства = серверу)
    ok(sent === 1 && l2.st === 'synced' && l2.cloud, `${tag}: неотправленный осмотр с фото ушёл на сервер ровно 1 раз`, `отправок ${sent}, ${JSON.stringify(l2)}`);
    await ctx.close();
  } finally { stand.quality = null; await stop().catch(() => {}); }
}

export function filesScenarios(out) {
  return { 'f-field': () => run(out, 'f-field', 'field'), 'f-manager': () => run(out, 'f-manager', 'manager') };
}
export function saveFilesMeasures(out) { if (filesMeasures.length) writeFileSync(join(out, 'files.json'), JSON.stringify(filesMeasures, null, 2)); }
