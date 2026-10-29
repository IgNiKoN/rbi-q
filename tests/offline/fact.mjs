// P2-0064: сценарии стенда «Факт без сети» — запись факта на телефоне и отправка сервисом платформы (device-send.ts) через
// pf_fact_submit (повтор с тем же id — прежний ответ). Боевой сервер не используется.
// pf-offline — без сети внести факт через экран «Факт» → «сохранено на телефоне», значок «не отправлено: 1», запросов нет →
//   связь появилась → на сервере одна запись, на телефоне ничего не ждёт;
// pf-drop — со связью, обрыв после записи на сервере (ответ потерян) → запись на телефоне → повтор тем же id → одна запись;
// pf-batch (375, 1440 тёмная) — без сети: пачка «Закрыть этаж целиком», перерасход, запись, которую сервер отклонит; пометки
//   «Не отправлено» у работы, в шахматке и журнале → связь: пачка и перерасход ушли (перерасход — «на проверке»), отклонённая —
//   «Сервер отклонил: причина» у работы и в «Данные на устройстве» → «Отправить снова» → ушла.
import { start, stop, resetNet, net, fact } from './servers.mjs';
import { freshProfile, go, launch, note, ok, signIn } from './lib.mjs';

const pending = (page) => page.evaluate(async () => (await window.RBI.deviceSend.pending()).map((r) => ({ id: r.id, st: r.syncStatus, why: r.syncBlockReason || '', title: r.view && r.view.title })))
  .catch((e) => [{ err: e.message }]);
const chip = async (page) => (await page.locator('[data-testid=p2-net]').count() ? (await page.locator('[data-testid=p2-net]').first().getAttribute('aria-label')) : null);

/** «Факт» → Корпус 1 → Секция 1 → Этаж 1 (со связью — копия для просмотра заполняется по пути). */
async function toFloor(page) {
  await go(page, '#/planfact/fact', 6000);
  for (const id of ['b-1', 's-1', 'f-1']) {
    const t = page.locator(`[data-location-id="${id}"]:visible`).first();
    if (await t.count()) { await t.click(); await page.waitForTimeout(1500); } else note('нет места ' + id);
  }
}
/** Внести факт формой экрана (первая работа места). */
async function enter(page, qty, note = '') {
  // телефон — нажатие на работу; ПК — кнопка «Внести»
  const btn = page.locator('[data-testid=ft-enter]:visible');
  if (await btn.count()) await btn.first().click(); else await page.locator('.ft-row-main:visible').first().click();
  await page.waitForTimeout(800);
  const v = (t) => page.locator(`[data-testid=${t}]:visible`).first();
  await v('ft-qty').fill(String(qty));
  await v('ft-brigade').selectOption('br-1');
  if (note) await page.locator('[data-testid=ft-form]:visible input[name=note]').first().fill(note);
  await v('ft-save').click();
  await page.waitForTimeout(2500);
  const n = page.locator('[data-testid=ft-notice]:visible, [role=alert]:visible');
  return (await n.count()) ? (await n.first().innerText()) : '';
}
async function waitSent(page, sec = 90) {
  for (let i = 0; i < sec / 3; i++) { const p = await pending(page); if (Array.isArray(p) && !p.length && fact.entries) return true; await page.waitForTimeout(3000); }
  return false;
}

async function offline(out, width = 375) {
  const tag = 'pf-offline' + (width === 375 ? '' : width);
  note(`== ${tag}: без сети внести факт на экране «Факт» → сохранён на телефоне → связь появилась → на сервере одна запись`);
  freshProfile(out, tag); resetNet();
  try {
    await start();
    const { ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900 });
    await signIn(page);
    await toFloor(page);
    await ctx.setOffline(true);
    await page.waitForTimeout(1500);
    const enabled = await page.evaluate(() => { const b = document.querySelector('[data-testid=ft-enter]'); return !!b && !b.disabled; });
    ok(enabled, `${tag}: без сети кнопка «Внести» активна`);
    const msg = await enter(page, 3);
    ok(/Сохранено на телефоне/.test(msg), `${tag}: без сети — «Сохранено на телефоне … уйдёт само»`, msg);
    const p = await pending(page);
    ok(Array.isArray(p) && p.length === 1 && p[0].st === 'not_synced' && /Кладка стен/.test(p[0].title || ''), `${tag}: запись на телефоне ждёт отправки`, JSON.stringify(p));
    ok(fact.calls.size === 0, `${tag}: без сети запросов на сервер нет`, String(fact.calls.size));
    const c = await chip(page);
    ok(/не отправлено: 1/.test(c || ''), `${tag}: значок «не отправлено: 1»`, String(c));
    await page.screenshot({ path: `${out}/${tag}-saved.png` });
    await ctx.setOffline(false);
    const sent = await waitSent(page);
    ok(sent, `${tag}: связь появилась — факт ушёл сам`);
    ok(fact.entries === 1 && [...fact.calls.values()].every((n) => n === 1), `${tag}: на сервере одна запись, один вызов`, `записей ${fact.entries}, вызовы ${JSON.stringify([...fact.calls.values()])}`);
    await page.waitForTimeout(16000);
    ok((await chip(page)) === null, `${tag}: значок «не отправлено» исчез`);
    await ctx.close();
  } finally { await stop().catch(() => {}); }
}

async function drop(out) {
  const tag = 'pf-drop';
  note(`== ${tag}: со связью, сервер записал факт, ответ потерян (обрыв) → запись на телефоне → повтор тем же id → одна запись`);
  freshProfile(out, tag); resetNet();
  try {
    await start();
    const { ctx, page } = await launch(out, tag);
    await signIn(page);
    await toFloor(page);
    net.drops = [{ re: /^RPC pf_fact_submit$/, left: 1 }];
    const msg = await enter(page, 2);
    // обрыв: запись остаётся на телефоне и уходит повтором тем же id — сразу (сервер снова ответил) или по таймеру
    ok(/Сохранено на телефоне|Записано: 2/.test(msg), `${tag}: обрыв — запись не потеряна (на телефоне или уже повтором)`, msg);
    ok(fact.entries === 1, `${tag}: сервер уже записал`, String(fact.entries));
    const sent = await waitSent(page, 120);
    ok(sent, `${tag}: повтор — ушла (ответ сервера получен)`);
    const calls = [...fact.calls.values()];
    ok(fact.entries === 1 && calls.length === 1 && calls[0] === 2, `${tag}: тот же id пришёл 2 раза — запись одна`, `записей ${fact.entries}, вызовы ${JSON.stringify(calls)}`);
    await ctx.close();
  } finally { await stop().catch(() => {}); }
}

const text = async (page, sel) => ((await page.locator(sel).count()) ? (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ') : '');

async function batch(out, width = 375, scheme = 'light') {
  const tag = 'pf-batch' + (width === 375 ? '' : width + '-' + scheme);
  note(`== ${tag}: без сети пачка «Закрыть этаж», перерасход и запись, которую сервер отклонит → связь → статусы от сервера; «Отправить снова»`);
  freshProfile(out, tag); resetNet();
  try {
    await start();
    const { ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900, scheme });
    await signIn(page);
    await go(page, '#/planfact/fact/chessboard', 5000);   // шахматка — в копию для просмотра
    await toFloor(page);
    await ctx.setOffline(true);
    await page.waitForTimeout(1500);
    // 1) пачка: «Закрыть этаж целиком» (остаток 33 м³)
    await page.locator('[data-testid=ft-close-open]:visible').first().click();
    await page.waitForTimeout(800);
    await page.locator('[data-testid=ft-close-brigade]:visible').first().selectOption('br-1');
    await page.locator('[data-testid=ft-close-send]:visible').first().click();
    await page.waitForTimeout(2500);
    const m1 = await text(page, '[data-testid=ft-notice]:visible');
    ok(/Сохранено на телефоне строк: 1/.test(m1), `${tag}: пачка без сети — сохранена на телефоне`, m1);
    // 2) перерасход сверх плана (сервер стенда: > 40 — на проверку); 3) запись, которую сервер отклонит
    fact.reject = /REJECT-MARK/;
    const m2 = await enter(page, 45);
    const m3 = await enter(page, 1, 'REJECT-MARK');
    ok(/Сохранено на телефоне/.test(m2) && /Сохранено на телефоне/.test(m3), `${tag}: ещё две записи — на телефоне`, m2 + ' | ' + m3);
    const p1 = await pending(page);
    ok(Array.isArray(p1) && p1.length === 3 && fact.calls.size === 0, `${tag}: на телефоне 3 записи, запросов нет`, JSON.stringify(p1.map((x) => x.title)));
    const mark = await text(page, '[data-testid=ft-unsent]:visible');
    ok(/Не отправлено: 79 м³/.test(mark), `${tag}: у работы — «Не отправлено: 79 м³» (33 + 45 + 1)`, mark);
    await page.screenshot({ path: `${out}/${tag}-1-floor.png` });
    await go(page, '#/planfact/fact/journal', 4000);
    const jr = await page.locator('[data-testid=fj-unsent-row]').count();
    ok(jr === 3, `${tag}: журнал — блок «С этого телефона ещё не ушло: 3»`, String(jr));
    await page.screenshot({ path: `${out}/${tag}-2-journal.png`, fullPage: true });
    await go(page, '#/planfact/fact/chessboard', 4000);
    const cm = await page.locator('[data-mark=unsent]').count();
    ok(cm >= 1, `${tag}: шахматка — значок «не отправлено» в ячейке и в шкале`, String(cm));
    await page.screenshot({ path: `${out}/${tag}-3-chess.png` });
    // связь
    await ctx.setOffline(false);
    for (let i = 0; i < 30 && fact.entries < 2; i++) await page.waitForTimeout(3000);
    await page.waitForTimeout(3000);
    ok(fact.entries === 2 && [...fact.byId.values()].some((v) => v.status === 'pending_approval'), `${tag}: ушли пачка и перерасход (перерасход — «на проверке»)`,
      JSON.stringify([...fact.byId.values()]));
    const p2 = await pending(page);
    ok(p2.length === 1 && p2[0].st === 'blocked' && p2[0].why === 'Сервер отклонил: Бригада в архиве — выберите действующую', `${tag}: отклонённая — на телефоне с причиной сервера`, JSON.stringify(p2));
    await go(page, '#/planfact/fact', 4000);
    await toFloor(page);
    const bad = await text(page, '[data-testid=ft-unsent]:visible');
    ok(/Сервер отклонил: Бригада в архиве/.test(bad), `${tag}: у работы — причина отказа`, bad);
    await go(page, '#/settings/my/device', 5000);
    const dev = await text(page, '[data-testid=p2-sync-item]');
    ok(/Факт · Кладка стен/.test(dev) && /Сервер отклонил: Бригада в архиве/.test(dev), `${tag}: «Данные на устройстве → Отправка» — факт с причиной`, dev);
    await page.screenshot({ path: `${out}/${tag}-4-device.png`, fullPage: true });
    fact.reject = null;
    await page.locator('[data-testid=p2-sync-retry]').first().click();
    for (let i = 0; i < 20 && fact.entries < 3; i++) await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    ok(fact.entries === 3 && !(await pending(page)).length, `${tag}: «Отправить снова» — ушла, на телефоне пусто`, String(fact.entries));
    ok([...fact.calls.values()].filter((n) => n > 1).length === 1, `${tag}: повтор — только у отклонённой (тот же id)`, JSON.stringify([...fact.calls.values()]));
    await ctx.close();
  } finally { await stop().catch(() => {}); }
}

export function factScenarios(out) {
  return { 'pf-offline': () => offline(out), 'pf-offline1440': () => offline(out, 1440), 'pf-drop': () => drop(out),
    'pf-batch': () => batch(out), 'pf-batch1440-dark': () => batch(out, 1440, 'dark') };
}
