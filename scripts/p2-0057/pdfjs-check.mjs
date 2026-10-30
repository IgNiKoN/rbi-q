// P2-0057 этап 0: pdf.js 5 в настоящей оболочке (стенд tests/offline) — с сетью и без сети.
// node scripts/p2-0057/pdfjs-check.mjs [--out <папка>] [--jpg <файл.jpg>] [--jp2 <файл.jp2>]
// Проверяет: загрузку по требованию (window.rbiPdfjs), версию, отрисовку PDF (текст, JPEG, JPEG2000 через wasm),
// предпросмотр «Открыть PDF» (rbiOpenPdfDocument), то же без сети из кэша приложения; в библиотеке нет new Function.
import { readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start, stop } from '../../tests/offline/servers.mjs';
import { freshProfile, launch, note, ok, open, results } from '../../tests/offline/lib.mjs';

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const out = arg('--out') || join(tmpdir(), 'p2-0057-pdfjs');
const ROOT = new URL('../../', import.meta.url).pathname;

/** Минимальный PDF: страница 200×200 pt, текст Helvetica, прямоугольник и (по желанию) картинка. */
function makePdf({ image = null, filter = '' } = {}) {
  const objs = [];
  const content = 'q 0.9 0.1 0.1 rg 10 10 80 40 re f Q BT /F1 18 Tf 20 150 Td (P2-0057 plan) Tj ET' + (image ? ' q 100 0 0 100 90 40 cm /Im1 Do Q' : '');
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >>' + (image ? ' /XObject << /Im1 6 0 R >>' : '') + ' >> >>');
  objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const parts = [Buffer.from('%PDF-1.7\n')];
  const offsets = [];
  let len = parts[0].length;
  const push = (b) => { parts.push(b); len += b.length; };
  objs.forEach((o, i) => { offsets.push(len); push(Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`)); });
  if (image) {
    offsets.push(len);
    const cs = filter === 'DCTDecode' ? ' /ColorSpace /DeviceRGB /BitsPerComponent 8' : '';
    push(Buffer.from(`6 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.w} /Height ${image.h}${cs} /Filter /${filter} /Length ${image.bytes.length} >>\nstream\n`));
    push(image.bytes);
    push(Buffer.from('\nendstream\nendobj\n'));
  }
  const xref = len;
  const n = offsets.length + 1;
  push(Buffer.from(`xref\n0 ${n}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')
    + `trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return Buffer.concat(parts);
}

const pdfs = { text: makePdf() };
const jpg = arg('--jpg'); const jp2 = arg('--jp2');
if (jpg && existsSync(jpg)) pdfs.jpeg = makePdf({ image: { w: 512, h: 512, bytes: readFileSync(jpg) }, filter: 'DCTDecode' });
if (jp2 && existsSync(jp2)) pdfs.jpx = makePdf({ image: { w: 512, h: 512, bytes: readFileSync(jp2) }, filter: 'JPXDecode' });
const b64 = Object.fromEntries(Object.entries(pdfs).map(([k, v]) => [k, v.toString('base64')]));

/** В странице: загрузить pdf.js, отрисовать каждый PDF, посчитать «закрашенные» точки (не белые). */
const renderAll = (page) => page.evaluate(async (files) => {
  const lib = await window.rbiPdfjs();
  const res = { version: lib.version, worker: lib.GlobalWorkerOptions.workerSrc, pages: {} };
  for (const [name, data] of Object.entries(files)) {
    try {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const pdf = await lib.getDocument({ data: bytes.buffer }).promise;
      const pg = await pdf.getPage(1);
      const vp = pg.getViewport({ scale: 2 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: cx, viewport: vp }).promise;
      const px = cx.getImageData(0, 0, c.width, c.height).data;
      let ink = 0; let colored = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] < 240 || px[i + 1] < 240 || px[i + 2] < 240) ink++;
        if (Math.abs(px[i] - px[i + 1]) > 40 || Math.abs(px[i + 1] - px[i + 2]) > 40) colored++;
      }
      // картинка — в правой нижней части листа (90..190 × 40..140 pt → ×2)
      const img = cx.getImageData(200, 130, 160, 160).data; let imgInk = 0;
      for (let i = 0; i < img.length; i += 4) if (img[i] < 240 || img[i + 1] < 240 || img[i + 2] < 240) imgInk++;
      res.pages[name] = { ink, colored, imgInk };
      await pdf.destroy();
    } catch (e) { res.pages[name] = { error: String(e && e.message || e) }; }
  }
  // Предпросмотр «Открыть PDF» (js/shared/pdf-open.utils.js)
  try {
    const bytes = Uint8Array.from(atob(files.text), (c) => c.charCodeAt(0));
    await window.rbiOpenPdfDocument({ title: 'Проверка', fileName: 'check.pdf', arrayBuffer: bytes.buffer });
    await new Promise((r) => setTimeout(r, 2500));
    const sheet = document.getElementById('rbi-pdf-open-sheet');
    res.preview = { open: !!sheet, canvases: sheet ? sheet.querySelectorAll('canvas').length : 0, text: sheet ? sheet.innerText.slice(0, 120) : '' };
    if (window.rbiClosePdfDocumentSheet) window.rbiClosePdfDocumentSheet();
  } catch (e) { res.preview = { error: String(e && e.message || e) }; }
  return res;
}, b64);

function check(tag, r) {
  ok(r.version === '5.7.284', `${tag}: pdf.js версии 5.7.284`, r.version);
  for (const name of Object.keys(pdfs)) {
    const p = r.pages[name] || {};
    ok(!p.error && p.ink > 500, `${tag}: PDF «${name}» отрисован`, p.error || `точек ${p.ink}`);
    if (name !== 'text') ok(!p.error && p.imgInk > 2000, `${tag}: картинка «${name}» на листе`, p.error || `точек ${p.imgInk}`);
  }
  ok(r.preview && r.preview.open && r.preview.canvases > 0, `${tag}: предпросмотр «Открыть PDF» показал страницу`, JSON.stringify(r.preview));
}

// 1) Статика: в новой библиотеке нет компиляции шрифта через new Function (CVE-2024-4367)
for (const f of ['libs/pdfjs/pdf.min.js', 'libs/pdfjs/pdf.worker.min.js']) {
  const s = readFileSync(join(ROOT, f), 'utf8');
  ok(!/new Function\(/.test(s), `${f}: нет new Function(`);
}
ok(!/libs\/pdfjs\/pdf\.min\.js/.test(readFileSync(join(ROOT, 'index.html'), 'utf8')), 'index.html: pdf.js не грузится на первом экране');

freshProfile(out, 'pdf');
await start();
let { ctx, page } = await launch(out, 'pdf', { width: 1440, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
await open(page, 6000);
const before = await page.evaluate(() => !!window.pdfjsLib);
ok(!before, 'с сетью: до открытия PDF библиотека не загружена');
check('с сетью', await renderAll(page));
// дождаться, пока приложение скачает версию целиком (pdf.js, worker, wasm — в кэше)
const cached = await page.evaluate(async () => {
  for (let i = 0; i < 60; i++) {
    const names = await caches.keys();
    for (const n of names) {
      const c = await caches.open(n);
      if (await c.match(new URL('libs/pdfjs/wasm/openjpeg.wasm', location.href).pathname) || await c.match('libs/pdfjs/wasm/openjpeg.wasm')) return n;
      const keys = await c.keys();
      if (keys.some((k) => k.url.endsWith('libs/pdfjs/wasm/openjpeg.wasm'))) return n;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
});
ok(!!cached, 'pdf.js и wasm в кэше приложения', String(cached));
await ctx.close();

({ ctx, page } = await launch(out, 'pdf', { width: 375, height: 812, offline: true }));
page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
await open(page, 6000);
check('без сети', await renderAll(page));
await ctx.close();
await stop();
note('ошибки страницы: ' + (errors.length ? errors.join(' | ') : 'нет'));
const fail = results.filter((l) => l.startsWith('FAIL')).length;
console.log(`ИТОГ: PASS ${results.filter((l) => l.startsWith('PASS')).length}, FAIL ${fail}`);
process.exit(fail ? 1 : 0);
