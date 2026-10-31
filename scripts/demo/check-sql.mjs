// P2-0053 доработка 2. Проверочный SQL (*.check.sql) на стенде с засевом «ЖК Демо» и тяжёлой учёткой — «все объекты» стенда.
// P2_PGLITE=… P2_CHECK_SQL=tests/server/058b_ks2_rows_fence.check.sql node scripts/demo/check-sql.mjs [P2_CHECK_DOWN=058b_ks2_rows_fence_down.sql]
// (файл — переменной: browser.mjs при импорте читает первый аргумент как папку снимков)
// Порты — P2_DEMO_API_PORT / P2_DEMO_APP_PORT. Боевой не используется.
import { readFileSync } from 'node:fs';
import { demoStandWithApp } from './browser.mjs';
import { addHeavy } from './heavy.mjs';

const file = process.env.P2_CHECK_SQL;
if (!file) throw new Error('нет P2_CHECK_SQL');
const st = await demoStandWithApp();
let code = 0;
try {
  await addHeavy(st.db);
  if (process.env.P2_CHECK_DOWN) await st.db.exec(readFileSync(new URL('../../supabase/migrations/' + process.env.P2_CHECK_DOWN, import.meta.url), 'utf8'));
  try { await st.db.exec(readFileSync(file, 'utf8')); console.log('нет отчёта'); code = 1; }
  catch (e) { const m = String(e.message); console.log(m); code = /FAIL всего: 0\s*$/.test(m) ? 0 : 1; }
} finally { await st.stopApp(); }
process.exit(code);
