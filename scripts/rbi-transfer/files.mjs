// P2-0027 (ADR-068 п. 5). Копирование файлов РБИ в закрытые бакеты компании по списку quality.rbi_transfer_files (031).
// Бакеты РБИ — только чтение (копия, не перенос). Путь в бакете компании: quality-<бакет>/<компания>/<старый путь> (018d).
// Ключ сервиса — только из .env.local (P2_SERVICE_ROLE_KEY), не печатается.
// Запуск: node scripts/rbi-transfer/files.mjs copy <id компании>   — скопировать ещё не скопированные (повтор безопасен)
//         node scripts/rbi-transfer/files.mjs clear <id компании>  — удалить скопированные файлы компании и список (откат)
import { readFileSync, existsSync } from 'node:fs';

const envFile = new URL('../../.env.local', import.meta.url);
if (!existsSync(envFile)) { console.error('нет .env.local'); process.exit(2); }
const env = Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const URL_ = env.P2_SUPABASE_URL, KEY = env.P2_SERVICE_ROLE_KEY;
const [cmd, company] = process.argv.slice(2);
if (!URL_ || !KEY) { console.error('нужны P2_SUPABASE_URL и P2_SERVICE_ROLE_KEY в .env.local'); process.exit(2); }
if (!['copy', 'clear'].includes(cmd) || !/^[0-9a-f-]{36}$/i.test(company || '')) {
  console.error('использование: files.mjs copy|clear <id компании>'); process.exit(2);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const REST = { ...H, 'Accept-Profile': 'quality', 'Content-Profile': 'quality', 'Content-Type': 'application/json' };
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
export const destKey = (companyId, name) => `${companyId}/${name}`;

async function rows(filter) {
  const r = await fetch(`${URL_}/rest/v1/rbi_transfer_files?core_company_id=eq.${company}&${filter}&select=old_bucket,old_name&limit=1000`, { headers: REST });
  if (!r.ok) throw new Error(`список файлов: ${r.status} ${await r.text()}`);
  return r.json();
}
async function mark(f, patch) {
  const q = `core_company_id=eq.${company}&old_bucket=eq.${encodeURIComponent(f.old_bucket)}&old_name=eq.${encodeURIComponent(f.old_name)}`;
  const r = await fetch(`${URL_}/rest/v1/rbi_transfer_files?${q}`, { method: 'PATCH', headers: REST, body: JSON.stringify(patch) });
  if (!r.ok) throw new Error(`отметка: ${r.status}`);
}

async function copyOne(f) {
  const dest = destKey(company, f.old_name), bucket = 'quality-' + f.old_bucket;
  // 1) копия на сервере (без скачивания)
  let r = await fetch(`${URL_}/storage/v1/object/copy`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId: f.old_bucket, sourceKey: f.old_name, destinationBucket: bucket, destinationKey: dest }) });
  if (r.ok) return 'copy';
  const t = await r.text();
  if (/already exists|Duplicate/i.test(t)) return 'exists';
  // 2) запасной путь: скачать из бакета РБИ и загрузить в бакет компании
  const src = await fetch(`${URL_}/storage/v1/object/${f.old_bucket}/${enc(f.old_name)}`, { headers: H });
  if (!src.ok) throw new Error(`копия ${r.status} ${t.slice(0, 120)}; чтение ${src.status}`);
  r = await fetch(`${URL_}/storage/v1/object/${bucket}/${enc(dest)}`, { method: 'POST',
    headers: { ...H, 'Content-Type': src.headers.get('content-type') || 'application/octet-stream', 'x-upsert': 'true' },
    body: Buffer.from(await src.arrayBuffer()) });
  if (!r.ok) throw new Error(`загрузка ${r.status} ${(await r.text()).slice(0, 120)}`);
  return 'upload';
}

const t0 = Date.now();
if (cmd === 'copy') {
  const stat = { copy: 0, exists: 0, upload: 0, error: 0 };
  for (;;) {
    const list = await rows('copied_at=is.null&error=is.null');
    if (!list.length) break;
    let i = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (i < list.length) {
        const f = list[i++];
        try { stat[await copyOne(f)]++; await mark(f, { copied_at: new Date().toISOString(), error: null }); }
        catch (e) { stat.error++; await mark(f, { error: String(e.message).slice(0, 300) }); }
      }
    }));
    console.log(`… ${JSON.stringify(stat)}`);
  }
  console.log(`ИТОГ copy: ${JSON.stringify(stat)} за ${Math.round((Date.now() - t0) / 1000)} с`);
  console.log('ошибки (повтор после исправления: сбросить error в списке):', (await rows('error=not.is.null')).length);
} else {
  let n = 0;
  for (;;) {
    const list = await rows('copied_at=not.is.null');
    if (!list.length) break;
    const by = {};
    for (const f of list) (by[f.old_bucket] ||= []).push(destKey(company, f.old_name));
    for (const [b, names] of Object.entries(by)) {
      for (let k = 0; k < names.length; k += 100) {
        const r = await fetch(`${URL_}/storage/v1/object/quality-${b}`, { method: 'DELETE', headers: { ...H, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: names.slice(k, k + 100) }) });
        if (!r.ok) throw new Error(`удаление ${b}: ${r.status} ${(await r.text()).slice(0, 120)}`);
      }
    }
    for (const f of list) await mark(f, { copied_at: null });
    n += list.length;
  }
  const r = await fetch(`${URL_}/rest/v1/rbi_transfer_files?core_company_id=eq.${company}`, { method: 'DELETE', headers: REST });
  if (!r.ok) throw new Error(`очистка списка: ${r.status}`);
  console.log(`ИТОГ clear: удалено файлов ${n}, список очищен, ${Math.round((Date.now() - t0) / 1000)} с`);
}
