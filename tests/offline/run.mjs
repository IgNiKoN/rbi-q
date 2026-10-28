// P2-0058: стенд «без сети» (npm run test:offline). node tests/offline/run.mjs [сценарий …] [--out <папка>]
// Сценарии: cold375, cold1440 — холодный запуск без сети и запись без сети; rescue — «ничьи» записи общей базы PLATFORM2_DB.
// Нужен Chromium playwright-core (npx playwright-core install chromium). Боевой сервер не используется.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start, stop, log as apiLog, marks, COMPANY } from './servers.mjs';
import { count, freshProfile, launch, note, ok, open, readStore, results, saveMark, signIn, state } from './lib.mjs';

const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const out = oi >= 0 ? args[oi + 1] : join(tmpdir(), 'p2-offline');
const pick = args.filter((a, i) => !a.startsWith('--') && (oi < 0 || i !== oi + 1));
const BASE = 'PLATFORM2_DB';
const companyDb = (db) => typeof db === 'string' && db.startsWith(BASE + '_' + COMPANY.id + '_');

/** Холодный запуск без сети: база компании, прежние осмотры; запись без сети уходит на сервер ровно 1 раз после возврата сети. */
async function cold(width, height) {
  const tag = 'cold' + width;
  note(`== ${tag}: вход с сетью → закрыть → без сети открыть заново → записать осмотр → сеть → открыть`);
  freshProfile(out, tag);
  marks.length = 0;
  await start();
  let { ctx, page } = await launch(out, tag, { width, height });
  await signIn(page);
  await saveMark(page, 'ONLINE-MARK');
  await page.waitForTimeout(3000);
  await page.reload(); await page.waitForTimeout(6000);
  const on = await state(page);
  ok(companyDb(on.db), `${tag}: с сетью база компании`, on.db);
  await ctx.close(); await stop();

  ({ ctx, page } = await launch(out, tag, { width, height, offline: true }));
  await open(page);
  const s1 = await state(page);
  note('без сети: ' + JSON.stringify({ db: s1.db, platform: s1.platform, records: s1.records, login: s1.login }));
  ok(companyDb(s1.db), `${tag}: без сети база = база компании`, s1.db);
  ok(Array.isArray(s1.records) && s1.records.includes('ONLINE-MARK'), `${tag}: без сети прежние осмотры на месте`, JSON.stringify(s1.records));
  ok(!s1.login, `${tag}: без сети нет экрана «Вход»`);
  const id = await saveMark(page, 'OFFLINE-MARK');
  await page.waitForTimeout(1500);
  const s2 = await state(page);
  ok(companyDb(s2.db) && Array.isArray(s2.records) && s2.records.includes('OFFLINE-MARK'), `${tag}: осмотр без сети записан в базу компании`, String(id));
  const shared = await readStore(page, BASE, 'app_history');
  ok(!(shared || []).some((r) => r.object === 'OFFLINE-MARK'), `${tag}: в общей базе PLATFORM2_DB нового нет`);
  await ctx.close();

  await start();
  ({ ctx, page } = await launch(out, tag, { width, height }));
  await open(page, 15000);
  const s3 = await state(page);
  note('сеть вернулась: ' + JSON.stringify({ db: s3.db, platform: s3.platform, dirty: s3.dirty }) + ' дошло: ' + JSON.stringify(marks));
  ok(count(marks, 'OFFLINE-MARK') === 1, `${tag}: осмотр без сети дошёл до сервера ровно 1 раз`, String(count(marks, 'OFFLINE-MARK')));
  await ctx.close(); await stop();
}

/** «Ничьи» записи: засев в PLATFORM2_DB (как до P2-0058) → лист → «Перенести» → дошла 1 раз; демо — нет; повтор — без листа. */
async function rescue() {
  const tag = 'rescue';
  note(`== ${tag}: записи без связи в общей базе → лист → «Перенести и отправить»`);
  freshProfile(out, tag);
  marks.length = 0;
  await start();
  const { ctx, page } = await launch(out, tag, { width: 375, height: 812 });
  // как до P2-0058: устройство без компании (общая база PLATFORM2_DB) — приложение само пишет туда осмотры
  await open(page, 6000);
  const before = await state(page);
  ok(before.db === BASE, `${tag}: до входа открыта общая база`, before.db);
  note('записано без компании: ' + JSON.stringify([await saveMark(page, 'RESCUE-MARK'),
    await page.evaluate(() => window.RBI.services.inspections.save({ id: 'demo_rescue', date: new Date().toISOString(), object: 'DEMO-MARK', template: 'Земляные работы', status: 'done' }).then((r) => r && r.id)).catch((e) => e.message)]));
  await page.waitForTimeout(1500);
  await signIn(page);
  await page.waitForTimeout(2000);
  await page.reload(); await page.waitForTimeout(8000);
  const sheet = page.locator('[data-testid=p2-rescue]');
  ok(await sheet.isVisible().catch(() => false), `${tag}: лист «Найдено … записей» показан`);
  const items = await page.locator('[data-testid=p2-rescue-list] li').allInnerTexts().catch(() => []);
  note('в листе: ' + JSON.stringify(items));
  ok(items.length === 1 && /RESCUE-MARK/.test(items[0]) && /Осмотр/.test(items[0]), `${tag}: в списке только запись человека (демо и задачи, созданные системой, — нет)`);
  await page.click('[data-testid=p2-rescue-move]');
  await page.waitForTimeout(15000);
  const s = await state(page);
  note('после переноса: ' + JSON.stringify({ db: s.db, records: s.records, dirty: s.dirty }) + ' дошло: ' + JSON.stringify(marks));
  ok(Array.isArray(s.records) && s.records.includes('RESCUE-MARK'), `${tag}: запись видна в базе компании`);
  ok(count(marks, 'RESCUE-MARK') === 1, `${tag}: перенесённая запись дошла до сервера ровно 1 раз`, String(count(marks, 'RESCUE-MARK')));
  ok(count(marks, 'DEMO-MARK') === 0, `${tag}: демо-запись не отправлена`);
  const shared = (await readStore(page, BASE, 'app_history')) || [];
  const r1 = shared.find((r) => r.object === 'RESCUE-MARK');
  ok(!!r1 && typeof r1.p2_moved_to === 'string' && r1.p2_moved_to.startsWith(COMPANY.id), `${tag}: в PLATFORM2_DB запись осталась с пометкой «перенесена»`, r1 && r1.p2_moved_to);
  ok(shared.some((r) => r.id === 'demo_rescue' && !r.p2_moved_to), `${tag}: демо-запись осталась в PLATFORM2_DB без изменений`);
  await page.reload(); await page.waitForTimeout(8000);
  ok(!(await sheet.isVisible().catch(() => false)), `${tag}: повторное открытие — листа нет (повтор не создаёт дубль)`);
  ok(count(marks, 'RESCUE-MARK') === 1, `${tag}: после повторного открытия на сервере всё ещё 1`);
  await ctx.close(); await stop();
}

const SCENARIOS = { cold375: () => cold(375, 812), cold1440: () => cold(1440, 900), rescue };
const list = pick.length ? pick : Object.keys(SCENARIOS);
for (const n of list) {
  if (!SCENARIOS[n]) { ok(false, 'нет сценария ' + n); continue; }
  try { await SCENARIOS[n](); } catch (e) { ok(false, n + ': сценарий упал', e.message.split('\n')[0]); await stop().catch(() => {}); }
}
const fail = results.filter((r) => r.startsWith('FAIL')).length;
const pass = results.filter((r) => r.startsWith('PASS')).length;
console.log(`\nИтог: PASS ${pass}, FAIL ${fail}. Запросов к подставному серверу: ${apiLog.length}. Журнал: ${join(out, 'report.txt')}`);
writeFileSync(join(out, 'report.txt'), results.join('\n') + `\nИтог: PASS ${pass}, FAIL ${fail}\n`);
process.exit(fail ? 1 : 0);
