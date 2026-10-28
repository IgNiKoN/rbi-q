// P2-0066: стенд «выкладка во время работы». Две версии приложения (A — как есть, B — «новая выкладка») собираются из файлов
// этой папки; в каждый .js дописывается метка версии (self.__REL[путь] = 'A' | 'B'), в index.html — self.__HTML. Смесь версий —
// в одной вкладке файлы разных версий. Сценарии: r-deploy, r-middeploy, r-partial, r-tabs, r-chunk, r-requests, r-delta, r-allow (+ r-size — опись).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listAppFiles } from '../../scripts/app-files.mjs';
import { start, stop, site, resetSite, COMPANY } from './servers.mjs';
import { freshProfile, go, launch, note, ok, signIn } from './lib.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
export const releaseMeasures = [];
/** Часть План/Факта с отпечатком в имени: в B у неё новое имя (как после пересборки), прежнего файла на сервере нет. */
const CHUNK_DIR = 'js/dist/planfact/chunks/';
const chunkOf = (dir, prefix) => {
  const list = execFileSync('ls', [join(dir, CHUNK_DIR)], { encoding: 'utf8' }).split('\n');
  return list.find((n) => n.startsWith(prefix) && n.endsWith('.js'));
};

/** Файлы приложения — то же правило, что у выпуска и описи версии. */
export const appFiles = (root = ROOT) => listAppFiles(root);

const mark = (path, tag) => `\n;(function(){try{var g=typeof self!=='undefined'?self:globalThis;(g.__REL=g.__REL||{})[${JSON.stringify('/' + path)}]=${JSON.stringify(tag)};}catch(e){}})();\n`;

/** Собрать версию tag в папку dir. B: новый номер в sw.js и новое имя части xlsx-reader. */
export function makeRelease(dir, tag) {
  rmSync(dir, { recursive: true, force: true });
  for (const p of appFiles()) {
    const to = join(dir, p);
    mkdirSync(dirname(to), { recursive: true });
    if (p.endsWith('.js') && p !== 'sw.js') writeFileSync(to, readFileSync(join(ROOT, p), 'utf8') + mark(p, tag));
    else if (p === 'index.html') writeFileSync(to, readFileSync(join(ROOT, p), 'utf8').replace('<head>', `<head><script>self.__HTML=${JSON.stringify(tag)}</script>`));
    else cpSync(join(ROOT, p), to);
  }
  if (tag !== 'A') {
    const sw = join(dir, 'sw.js');
    writeFileSync(sw, readFileSync(sw, 'utf8').replace(/const SW_VERSION = '([^']+)'/, `const SW_VERSION = '$1-${tag}'`));
    const old = chunkOf(dir, 'xlsx-reader-');
    if (old) {
      const neu = old.replace(/-[A-Za-z0-9_-]+\.js$/, `-${tag}${tag}${tag}.js`);
      renameSync(join(dir, CHUNK_DIR, old), join(dir, CHUNK_DIR, neu));
      for (const p of appFiles().filter((x) => x.startsWith('js/dist/planfact/') && x.endsWith('.js'))) {
        const f = join(dir, p.replace(old, neu));
        if (existsSync(f)) writeFileSync(f, readFileSync(f, 'utf8').split(old).join(neu));
      }
    }
  }
  // P2-0066 этап 2+: если есть опись версии — пересобрать её для этой папки (как сделает сборка перед выкладкой)
  const gen = join(ROOT, 'scripts/app-version.mjs');
  if (existsSync(gen)) execFileSync('node', [gen, '--root', dir, '--date', '2026-10-29'], { stdio: 'ignore' });
  return dir;
}

/** Метки версии во вкладке: index.html и все выполненные .js. */
const versions = (page) => page.evaluate(() => {
  const r = self.__REL || {};
  const tags = {};
  for (const t of Object.values(r)) tags[t] = (tags[t] || 0) + 1;
  const html = self.__HTML || null;
  return { html, tags, other: Object.entries(r).filter(([, t]) => t !== html).map(([p]) => p).slice(0, 4) };
}).catch((e) => ({ err: e.message.split('\n')[0] }));
const mixed = (v) => !!v && !v.err && (Object.keys(v.tags).length > 1 || Object.keys(v.tags).some((t) => t !== v.html));
const fmt = (v) => v.err ? 'ошибка: ' + v.err : `html ${v.html}, скрипты ${JSON.stringify(v.tags)}${v.other.length ? ', чужие: ' + v.other.join(' ') : ''}`;

/** Кэши приложения: имена и сколько в них кода План/Факта и «Компании». */
const census = (page) => page.evaluate(async () => {
  const r = { caches: await caches.keys(), planfact: 0, company: 0 };
  for (const n of r.caches) for (const q of await (await caches.open(n)).keys()) {
    if (/\/js\/dist\/planfact\//.test(q.url)) r.planfact++;
    if (/\/js\/dist\/company\//.test(q.url)) r.company++;
  }
  return r;
}).catch(() => ({ caches: [], planfact: -1, company: -1 }));

/** Попросить браузер проверить обновление и дождаться, пока новая версия установится (waiting) или установка не удастся. */
const fetchUpdate = (page, ms = 60000) => page.evaluate(async (ms) => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'нет регистрации';
  await reg.update().catch(() => {});
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (reg.waiting) return 'waiting';
    if (!reg.installing && !reg.waiting) return 'нет новой версии / установка не удалась';
    await new Promise((r) => setTimeout(r, 500));
  }
  return 'не дождались';
}, ms).catch((e) => 'ошибка: ' + e.message.split('\n')[0]);

/** Включить новую версию так, как сейчас делает кнопка «Обновить» (SKIP_WAITING → перезагрузка). */
async function applyUpdate(page) {
  await page.evaluate(async () => {
    const btn = document.getElementById('pwa-update-btn');
    if (btn) { btn.click(); return; }
    const r = await navigator.serviceWorker.getRegistration(); if (r && r.waiting) r.waiting.postMessage('SKIP_WAITING');
  }).catch(() => {});
  await page.waitForTimeout(6000);
}

const sections = ['#/planfact', '#/settings/company/objects', '#/quality/engineer'];

/** Вход и прогрев на версии A: разделы открыты, кэш заполнен. */
async function warm(out, tag, A) {
  freshProfile(out, tag);
  resetSite(); site.root = A;
  await start();
  const { ctx, page } = await launch(out, tag, { width: 1440, height: 900 });
  await signIn(page);
  for (const h of sections) await go(page, h, 4000);
  await page.reload(); await page.waitForTimeout(6000);
  const v = await versions(page);
  ok(v.html === 'A' && !mixed(v), `${tag}: до выкладки вкладка на версии A`, fmt(v));
  return { ctx, page };
}

function measure(tag, data) { releaseMeasures.push({ tag, ...data }); }

export function releaseScenarios(outDir) {
  const A = join(outDir, 'rel-A'), B = join(outDir, 'rel-B');
  let built = false;
  const build = () => { if (!built) { makeRelease(A, 'A'); makeRelease(B, 'B'); built = true; } };

  /** (а) открыта A → на сервере B → работа → три открытия подряд: смесь? */
  async function deploy() {
    const tag = 'r-deploy'; build();
    note(`== ${tag}: была версия A → выкладка B → открыть ×3 (со 2-го — зайти в разделы)`);
    const { ctx, page } = await warm(outDir, tag, A);
    site.root = B;
    await page.goto('about:blank');
    const loads = [];
    for (let i = 1; i <= 3; i++) {
      // открыл приложение (с утра), на втором и третьем открытии — зашёл в разделы
      await page.goto('http://localhost:8891/').catch(() => {}); await page.waitForTimeout(7000);
      if (i > 1) for (const h of sections) await go(page, h, 3000);
      const v = await versions(page);
      loads.push({ load: i, mixed: mixed(v), html: v.html, tags: v.tags });
      note(`открытие ${i}: ${fmt(v)}`);
    }
    const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { waiting: !!(r && r.waiting) }; }).catch(() => ({}));
    note('новая версия ждёт кнопку: ' + JSON.stringify(reg));
    const n = loads.filter((l) => l.mixed).length;
    ok(n === 0, `${tag}: ни одного открытия со смесью версий`, `смесь в ${n} из 3`);
    measure(tag, { mixedLoads: n, loads, waiting: reg.waiting });
    await ctx.close(); await stop();
  }

  /** (б) выкладка в процессе (половина файлов старые) в момент установки → выкладка закончена → «Обновить». */
  async function midDeploy() {
    const tag = 'r-middeploy'; build();
    note(`== ${tag}: установка новой версии, пока на сервере половина файлов старые → выкладка закончена → «Обновить»`);
    const { ctx, page } = await warm(outDir, tag, A);
    let i = 0; const half = new Map();
    site.pick = (p) => { if (p === '/sw.js' || p === '/index.html') return B; if (!half.has(p)) half.set(p, (i++ % 2) ? B : A); return half.get(p); };
    const st = await fetchUpdate(page);
    note('установка: ' + st);
    site.pick = null; site.root = B;
    const st2 = st === 'waiting' ? st : await fetchUpdate(page);
    note('после выкладки — повтор установки: ' + st2);
    await applyUpdate(page);
    const loads = [];
    for (let k = 1; k <= 2; k++) {
      if (k > 1) { await page.reload(); await page.waitForTimeout(7000); }
      const v = await versions(page);
      loads.push({ load: k, mixed: mixed(v), html: v.html, tags: v.tags });
      note(`после «Обновить», открытие ${k}: ${fmt(v)}`);
    }
    const n = loads.filter((l) => l.mixed).length;
    ok(st !== 'waiting' || n === 0, `${tag}: смесь не установлена как новая версия`, `установка: ${st}; смесь в ${n} из 2`);
    ok(st2 === 'waiting' && loads.every((l) => l.html === 'B' && !l.mixed), `${tag}: после выкладки версия B ставится целиком и включается`, `повтор: ${st2}; ${loads.map((l) => l.html).join(', ')}`);
    measure(tag, { install: st, retry: st2, mixedLoads: n, loads });
    await ctx.close(); await stop();
  }

  /** (в) при установке часть файлов не скачалась → «Обновить» → без сети: что открывается. */
  async function partial() {
    const tag = 'r-partial'; build();
    note(`== ${tag}: установка B со сбоем части файлов → «Обновить» → без сети перезапуск`);
    let { ctx, page } = await warm(outDir, tag, A);
    site.root = B;
    site.fail = /^\/(libs\/xlsx\.full\.min\.js|js\/dist\/rbi-locations\.js|css\/rbi-ui\.css)$/;
    const st = await fetchUpdate(page);
    note('установка: ' + st);
    site.fail = null;
    const st2 = st === 'waiting' ? st : await fetchUpdate(page);
    note('связь восстановилась — повтор установки: ' + st2);
    if (st2 === 'waiting') await applyUpdate(page);
    const c = await census(page);
    note('кэш после обновления: ' + JSON.stringify(c));
    await ctx.close(); await stop();
    ({ ctx, page } = await launch(outDir, tag, { width: 1440, height: 900, offline: true }));
    const failed = [];
    page.on('requestfailed', (r) => { const u = new URL(r.url()); if (u.port === '8891') failed.push(u.pathname); });
    page.on('response', (r) => { const u = new URL(r.url()); if (u.port === '8891' && r.status() >= 400) failed.push(u.pathname + ' ' + r.status()); });
    await page.goto('http://localhost:8891/').catch(() => {}); await page.waitForTimeout(9000);
    const shown = {};
    for (const h of sections) {
      await go(page, h, 4000);
      shown[h] = await page.evaluate(() => (document.querySelector('main, #app-content, #content') || document.body).innerText.replace(/\s+/g, ' ').trim().length).catch(() => 0);
    }
    const v = await versions(page);
    note('без сети: ' + fmt(v) + '; не загрузилось: ' + JSON.stringify([...new Set(failed)].slice(0, 12)));
    note('текст разделов без сети (символов): ' + JSON.stringify(shown));
    ok(st !== 'waiting', `${tag}: версия с недокачанными файлами не устанавливается`, st);
    ok(st2 === 'waiting' && v.html === 'B' && !mixed(v), `${tag}: после повтора без сети работает версия B целиком`, `повтор: ${st2}; ${fmt(v)}`);
    ok(failed.length === 0, `${tag}: без сети после обновления все файлы на месте`, `не загрузилось ${new Set(failed).size}`);
    ok(c.planfact > 0 && c.company > 0, `${tag}: после обновления код План/Факта и «Компании» в кэше`, JSON.stringify({ planfact: c.planfact, company: c.company }));
    measure(tag, { install: st, retry: st2, failedOffline: [...new Set(failed)], cacheAfter: c, shown });
    await ctx.close();
  }

  /** (г) две вкладки на A → во второй «Обновить» → первая вкладка догружает файл. */
  async function tabs() {
    const tag = 'r-tabs'; build();
    note(`== ${tag}: две вкладки на A → выкладка B → во второй «Обновить» → первая догружает часть`);
    const { ctx, page } = await warm(outDir, tag, A);
    const page2 = await ctx.newPage();
    await page2.goto('http://localhost:8891/'); await page2.waitForTimeout(8000);
    site.root = B;
    const st = await fetchUpdate(page2);
    note('установка: ' + st);
    await applyUpdate(page2);
    const v2 = await versions(page2);
    note('вкладка 2: ' + fmt(v2));
    const chunk = chunkOf(A, 'exceljs.min-');
    const res = await page.evaluate(async (u) => { try { await import(u); return 'ok'; } catch (e) { return 'ошибка: ' + e.message; } }, '/' + CHUNK_DIR + chunk);
    const v1 = await versions(page);
    note(`вкладка 1 после догрузки ${chunk}: ${res}; ${fmt(v1)}`);
    ok(!mixed(v1), `${tag}: первая вкладка осталась одной версии`, fmt(v1));
    ok(v1.html === 'A', `${tag}: первая вкладка не перезагрузилась сама посреди работы`, v1.html === 'A' ? 'осталась на A' : 'перезагрузилась на ' + v1.html);
    measure(tag, { install: st, tab1: v1, tab1Load: res, tab2: v2 });
    await ctx.close(); await stop();
  }

  /** (д) на A, выкладка B (часть пересобрана с новым именем), «Обновить» не нажато → A просит прежнюю часть. */
  async function chunk() {
    const tag = 'r-chunk'; build();
    note(`== ${tag}: открыта A → выкладка B (часть xlsx-reader с новым именем) → A загружает свою часть`);
    const { ctx, page } = await warm(outDir, tag, A);
    site.root = B;
    const name = chunkOf(A, 'xlsx-reader-');
    const res = await page.evaluate(async (u) => { try { await import(u); return 'ok'; } catch (e) { return 'ошибка: ' + e.message.split('\n')[0]; } }, '/' + CHUNK_DIR + name);
    note(`загрузка ${name}: ${res}`);
    ok(res === 'ok', `${tag}: старая вкладка загружает свою часть после выкладки`, res);
    measure(tag, { chunk: name, result: res });
    await ctx.close(); await stop();
  }

  /** Сколько запросов к файлам приложения при обычном открытии (кэш прогрет, выкладки нет). */
  async function requests() {
    const tag = 'r-requests'; build();
    note(`== ${tag}: запросы к серверу при открытии (кэш прогрет)`);
    const { ctx, page } = await warm(outDir, tag, A);
    await page.reload(); await page.waitForTimeout(7000);
    site.requests.length = 0;
    await page.reload(); await page.waitForTimeout(9000);
    const n = site.requests.length;
    note(`запросов к файлам приложения: ${n}; примеры: ${site.requests.slice(0, 6).join(' ')}`);
    ok(n <= 5, `${tag}: при открытии ≤ 5 запросов к файлам приложения`, String(n));
    measure(tag, { requests: n });
    await ctx.close(); await stop();
  }

  /** Выкладка с одним изменённым файлом: скачивается он один (остальное — копией из прежней версии). */
  async function delta() {
    const tag = 'r-delta'; build();
    note(`== ${tag}: на сервере версия, где изменён один файл → что скачивается при установке`);
    const C = join(outDir, 'rel-C');
    rmSync(C, { recursive: true, force: true }); cpSync(A, C, { recursive: true });
    const f = join(C, 'js/shared/theme.utils.js');
    writeFileSync(f, readFileSync(f, 'utf8') + '\n// P2-0066 r-delta\n');
    const gen = join(ROOT, 'scripts/app-version.mjs');
    if (existsSync(gen)) execFileSync('node', [gen, '--root', C, '--date', '2026-10-30'], { stdio: 'ignore' });
    const { ctx, page } = await warm(outDir, tag, A);
    site.root = C; site.requests.length = 0;
    const st = await fetchUpdate(page);
    const got = site.requests.filter((p) => p !== '/sw.js' && p !== '/js/services/config.service.js');
    note(`установка: ${st}; скачано файлов приложения: ${got.length} — ${got.slice(0, 6).join(' ')}`);
    ok(st === 'waiting' && got.length === 1 && got[0] === '/js/shared/theme.utils.js', `${tag}: скачан только изменённый файл`, `${st}; ${got.length}`);
    measure(tag, { install: st, downloaded: got });
    await ctx.close(); await stop();
  }

  /** P2-0013: у компании только Качество — кода План/Факта и «Компании» в кэше нет (и после обновления). */
  async function allow() {
    const tag = 'r-allow'; build();
    note(`== ${tag}: у компании только Качество → в кэше версии нет кода План/Факта`);
    const saved = COMPANY.modules.slice();
    COMPANY.modules.splice(0, COMPANY.modules.length, 'quality');
    try {
      const { ctx, page } = await warm(outDir, tag, A);
      const c1 = await census(page);
      site.root = B;
      const st = await fetchUpdate(page);
      await applyUpdate(page);
      const c2 = await census(page);
      note(`до обновления: ${JSON.stringify({ planfact: c1.planfact })}; обновление: ${st}; после: ${JSON.stringify({ planfact: c2.planfact })}`);
      ok(c1.planfact === 0 && st === 'waiting' && c2.planfact === 0, `${tag}: код План/Факта не скачан ни до, ни после обновления`, `${c1.planfact} / ${c2.planfact}`);
      measure(tag, { before: c1.planfact, install: st, after: c2.planfact });
      await ctx.close(); await stop();
    } finally { COMPANY.modules.splice(0, COMPANY.modules.length, ...saved); }
  }

  /** Размер описи: всё приложение, оболочка и модули. */
  async function size() {
    const tag = 'r-size';
    const files = appFiles();
    const by = {};
    let total = 0;
    for (const p of files) {
      const b = statSync(join(ROOT, p)).size; total += b;
      const g = (p.match(/^js\/dist\/(planfact|company|platform-admin)\//) || p.match(/^js\/modules\/(quality|construction-v2|construction)\//) || [])[1] || 'оболочка';
      by[g] = (by[g] || 0) + b;
    }
    const mb = (b) => Math.round(b / 1048576 * 10) / 10;
    note(`== ${tag}: файлов ${files.length}, всего ${mb(total)} МБ; ` + Object.entries(by).map(([g, b]) => `${g} ${mb(b)} МБ`).join(', '));
    ok(total < 35 * 1048576, `${tag}: опись без .map меньше 35 МБ (решение владельца 29.10)`, mb(total) + ' МБ');
    measure(tag, { files: files.length, totalMB: mb(total), byGroupMB: Object.fromEntries(Object.entries(by).map(([g, b]) => [g, mb(b)])) });
  }

  return { 'r-deploy': deploy, 'r-middeploy': midDeploy, 'r-partial': partial, 'r-tabs': tabs, 'r-chunk': chunk, 'r-requests': requests, 'r-delta': delta, 'r-allow': allow, 'r-size': size };
}
