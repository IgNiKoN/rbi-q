// P2-0053. «ЖК Демо» на стенде (PGlite со всеми миграциями, боевой сервер не используется): база → SQL учёток → засев через
// сервер стенда (тот же код, что для боевого) → сводка. --reset: сброс (scripts/demo/reset.sql) и засев ещё раз — числа те же;
// --save <файл.tgz> — сохранить базу (для браузерных проверок: node scripts/demo/stand-server.mjs --load <файл.tgz>);
// --serve — оставить стенд работать (приложение :8891, сервер :8892); --today ГГГГ-ММ-ДД — от какой даты считать дни.
// Нужен P2_PGLITE (папка с @electric-sql/pglite), см. tests/server/pglite-db.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { accountsSql } from './accounts.mjs';
import { runSeed } from './seed.mjs';
import { standDb, startStand } from './stand-server.mjs';

export async function demoStand({ today = null, apiPort = 18892, appPort = 0, log = console.log } = {}) {
  const db = await standDb();
  await db.exec(accountsSql('stand'));
  const s = await startStand({ db, apiPort, appPort });
  const summary = await runSeed({ url: s.apiUrl, anonKey: 'stand', password: 'stand', today, log });
  return { db, stand: s, summary };
}

export const resetSql = () => readFileSync(new URL('./reset.sql', import.meta.url), 'utf8');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (n) => (a.includes(n) ? a[a.indexOf(n) + 1] : null);
  try {
    const t0 = Date.now();
    const serve = a.includes('--serve');
    const { db, stand, summary } = await demoStand({ today: opt('--today'), apiPort: serve ? 8892 : 18892, appPort: serve ? 8891 : 0 });
    console.log('засев:', JSON.stringify(summary), `(${((Date.now() - t0) / 1000).toFixed(1)} с)`);
    if (a.includes('--reset')) {
      await db.exec(resetSql());
      await db.exec(accountsSql('stand'));
      const again = await runSeed({ url: stand.apiUrl, anonKey: 'stand', password: 'stand', today: opt('--today'), log: () => {} });
      console.log('после сброса:', JSON.stringify(again), JSON.stringify(again) === JSON.stringify(summary) ? '— те же числа' : '— ЧИСЛА РАЗОШЛИСЬ');
    }
    if (opt('--save')) { const d = await db.dumpDataDir('gzip'); writeFileSync(opt('--save'), Buffer.from(await d.arrayBuffer())); console.log('сохранено:', opt('--save')); }
    if (serve) { console.log(`стенд: приложение ${stand.appUrl}, сервер ${stand.apiUrl}`); }
    else { await stand.stop(); process.exit(0); }
  } catch (e) {
    console.error('ОШИБКА:', e.stack || e.message);
    process.exit(1);
  }
}
