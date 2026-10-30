// P2-0057 этап 3: Качество и СК 2.0 открывают копию плана из бакета ядра тем же путём, что свои планы (без правки их экранов).
// Просмотрщики Качества (quality-plan-pin.js, plan-pin-print.js) и СК 2.0 (plan-viewer.ts) берут файл через
// window.rbiLoadCloudPdfArrayBuffer(pdf_url); «Фото и PDF заранее» — через window.rbiCacheCloudPdf. Здесь — эти же функции в
// настоящей оболочке со входом: ссылка …/public/core-place-plans/… → кэш приложения берёт …/authenticated/… с токеном; PDF
// рисуется pdf.js 5; без сети — из офлайн-кэша; после выхода закрытые файлы удалены из кэша. Сравнение — ссылка Качества quality-*.
// Подставной сервер, боевой не используется. node modules-open.mjs <out-dir>
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { start, stop, stand, COMPANY, API } from '../../../../tests/offline/servers.mjs';
import { freshProfile, launch, note, ok, open, results, signIn } from '../../../../tests/offline/lib.mjs';

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R>>endobj 4 0 obj<</Length 33>>stream\n0.8 0.1 0.1 rg 20 20 160 160 re f\nendstream endobj\n' +
  'trailer<</Root 1 0 R>>\n%%EOF');
const CORE = `${API}/storage/v1/object/public/core-place-plans/${COMPANY.id}/p-1/11111111-0000-4000-8000-000000000005/22222222-0000-4000-8000-000000000001.pdf`;
const QUAL = `${API}/storage/v1/object/public/quality-custom-assets/${COMPANY.id}/location_plans/f5/plan_1.pdf`;
const seen = [];

await start();
try {
  freshProfile(out, 'mods');
  let { ctx, page } = await launch(out, 'mods', { width: 1440, height: 900 });
  // файл с сервера — только по закрытому адресу и с входом (как Storage на сервере); запросы — в журнал
  stand.storage = (path, headers) => {
    const auth = String(headers.authorization || '');
    seen.push({ url: API + path, auth: auth ? 'Bearer …' : '' });
    if (path.includes('/object/authenticated/') && auth.startsWith('Bearer ')) return { status: 200, type: 'application/pdf', body: PDF };
    return { status: 400, type: 'application/json', body: '{"error":"not public"}' };
  };
  await signIn(page);
  await page.waitForTimeout(4000);
  const run = (url) => page.evaluate(async (u) => {
    try {
      const buf = await window.rbiLoadCloudPdfArrayBuffer(u);
      const bytes = buf.byteLength;
      const lib = await window.rbiPdfjs();
      const pdf = await lib.getDocument({ data: buf }).promise;
      const pg = await pdf.getPage(1); const vp = pg.getViewport({ scale: 1 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      const cx = c.getContext('2d'); await pg.render({ canvasContext: cx, viewport: vp }).promise;
      const px = cx.getImageData(100, 100, 1, 1).data;
      return { bytes, red: px[0] > 150 && px[1] < 80 };
    } catch (e) { return { error: String(e && e.message || e) }; }
  }, url);
  const sw = await page.evaluate(() => !!navigator.serviceWorker.controller);
  ok(sw, 'кэш приложения управляет страницей');
  const rq = await run(QUAL);
  ok(rq.red, 'план Качества (quality-*) — как раньше: открыт и нарисован', JSON.stringify(rq));
  const rc = await run(CORE);
  ok(rc.red, 'копия плана из ядра (core-place-plans) — открыта той же функцией и нарисована', JSON.stringify(rc));
  const hit = seen.filter((s) => s.url.includes('core-place-plans'));
  ok(hit.length > 0 && hit.every((s) => s.url.includes('/object/authenticated/') && s.auth),
    'запрос файла ядра — по закрытому адресу с входом (не публичный)', JSON.stringify(hit));
  const cached = await page.evaluate(async (u) => (await window.rbiCacheCloudPdf(u, { skipMemoryCache: true })).ok, CORE);
  ok(cached, '«Фото и PDF заранее»: файл ядра скачан на устройство');
  await ctx.close();

  ({ ctx, page } = await launch(out, 'mods', { width: 375, height: 812, offline: true }));
  await open(page, 6000);
  const off = await run(CORE);
  ok(off.red, 'без сети: копия плана ядра открывается из устройства', JSON.stringify(off));
  await ctx.close();
} finally { await stop(); }
note('запросы к Storage: ' + seen.map((s) => s.url.replace(API, '').replace(COMPANY.id, '<компания>') + (s.auth ? ' [вход]' : '')).join(' | '));
writeFileSync(join(out, 'modules-open.txt'), results.join('\n') + '\n');
const fail = results.filter((l) => l.startsWith('FAIL')).length;
console.log(`ИТОГ: PASS ${results.filter((l) => l.startsWith('PASS')).length}, FAIL ${fail}`);
process.exit(fail ? 1 : 0);
