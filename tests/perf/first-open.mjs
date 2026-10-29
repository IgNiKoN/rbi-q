// P2-0067a: замер «первое открытие» — чистый браузер (как новый телефон), сеть и процессор с ограничением, до формы входа.
// node tests/perf/first-open.mjs [адрес] [--profile 4g|slow|none] [--cpu 4] [--width 375] [--runs 1]
// Пишет JSON в консоль: пустой экран (первая отрисовка), форма входа, скачано и запросов к показу формы, сколько ответов пришло сжатыми.
// Методика — как разбор Архитектора 29.10 (P2-0067a, раздел 2): ограничение на вкладку через CDP, задержка 150 мс, отдача 750 Кбит/с.
// Основа для «сторожа веса» в P2-0067. Ничего не пишет на сервер: только открывает страницу входа.
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const url = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) || 'https://app.rbi-q.ru/';
const PROFILES = { none: null, '4g': { mbit: 9, latency: 150 }, slow: { mbit: 1.6, latency: 150 } };
const profileName = opt('profile', '4g');
const profile = PROFILES[profileName];
if (profile === undefined) { console.error('профиль: 4g | slow | none'); process.exit(2); }
const cpu = Number(opt('cpu', 4));
const width = Number(opt('width', 375));
const runs = Number(opt('runs', 1));
const LOGIN = 'input[type=password]';

async function once() {
  const browser = await chromium.launch();
  const phone = width < 768;
  const ctx = await browser.newContext({ viewport: { width, height: phone ? 812 : 900 }, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  if (profile) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency,
    downloadThroughput: profile.mbit * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const net = { bytes: 0, reqs: 0, gzip: 0, plain: 0 };
  cdp.on('Network.responseReceived', (e) => {
    const h = Object.fromEntries(Object.entries(e.response.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    if (!/^https?:/.test(e.response.url) || !/javascript|css|json/.test(h['content-type'] || '')) return;
    if (/gzip|br/.test(h['content-encoding'] || '')) net.gzip++; else net.plain++;
  });
  cdp.on('Network.loadingFinished', (e) => { net.bytes += e.encodedDataLength; net.reqs++; });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit', timeout: 300000 });
  let loginMs = null;
  try { await page.waitForSelector(LOGIN, { state: 'visible', timeout: 180000 }); loginMs = Date.now() - t0; } catch { /* не дождались */ }
  const shown = { ...net };
  const paint = await page.evaluate(() => Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0)).catch(() => 0);
  await browser.close();
  return { url, profile: profileName, cpu, width, firstPaintMs: paint, loginFormMs: loginMs,
    mbToLogin: +(shown.bytes / 1e6).toFixed(2), requestsToLogin: shown.reqs, codeResponsesGzip: shown.gzip, codeResponsesPlain: shown.plain };
}

for (let i = 0; i < runs; i++) console.log(JSON.stringify(await once()));
