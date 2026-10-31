// P2-0053. Путь «доступ клиенту» на стенде (PGlite, боевой не используется), тем же кодом, что для боевого (sandbox.mjs):
// администратор платформы создаёт «Песочница — Клиент 0» → модули → 9 учёток с временными паролями (файл доступов — во
// временную папку, пароли в консоль не выводятся) → клиент: объект → места из образца Excel → прорабу участок и «ответственный
// за факт» → ВОР из образца своей формы → смета и КП → факт прораба → КС-2 выдан. Плюс: приложение не ходит на порты
// 5432/6543/8000/8443/4000 (адрес сервера — только https, порт 443). Выход 1 при расхождении.
// P2_PGLITE=… node scripts/demo/check-sandbox.mjs
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { accessFile, runSandbox, SANDBOX_USERS } from './sandbox.mjs';
import { standDb, startStand } from './stand-server.mjs';
import { standClient } from './checks.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
let bad = 0;
const t = (c, l) => { console.log((c ? 'OK   ' : 'FAIL ') + l); if (!c) bad++; };

/** Порты, через которые приложение не должно ходить (открыты снаружи на сервере до P2-0062). */
export function portsUsed() {
  const hits = [];
  const scan = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (/node_modules|\.git|dist\/.*\.map$|ai-dev|tests|scripts|docs|supabase/.test(p)) continue;
      const s = statSync(p);
      if (s.isDirectory()) { scan(p); continue; }
      if (!/\.(js|mjs|html|json)$/.test(f) || s.size > 5e6) continue;
      const txt = readFileSync(p, 'utf8');
      const m = txt.match(/api\.rbi-q\.ru:(5432|6543|8000|8443|4000)\b|155\.212\.217\.171:(5432|6543|8000|8443|4000)\b/g);
      if (m) hits.push(p.slice(ROOT.length) + ': ' + [...new Set(m)].join(', '));
    }
  };
  scan(join(ROOT, 'js'));
  for (const f of ['index.html', 'sw.js']) {
    const txt = readFileSync(join(ROOT, f), 'utf8');
    if (/:(5432|6543|8000|8443|4000)\b/.test(txt.replace(/localhost:\d+/g, ''))) hits.push(f);
  }
  const cfg = readFileSync(join(ROOT, 'js/services/config.service.js'), 'utf8').match(/P2_SUPABASE_URL:\s*'([^']+)'/);
  return { hits, url: cfg ? cfg[1] : null };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const p = portsUsed();
    t(p.hits.length === 0 && /^https:\/\/api\.rbi-q\.ru$/.test(p.url || ''), `приложение ходит только на ${p.url} (порт 443); прямых обращений к 5432/6543/8000/8443/4000 нет${p.hits.length ? ': ' + p.hits.join('; ') : ''}`);

    const db = await standDb();
    const OWNER = '0d000000-0000-4000-8000-00000000000a';
    await db.exec(`insert into auth.users(id, email, email_confirmed_at) values ('${OWNER}', 'owner@stand.test.invalid', now());
      insert into core.platform_admins(user_id) values ('${OWNER}');`);
    const stand = await startStand({ db, apiPort: 18894, appPort: 0 });
    const logs = [];
    const r = await runSandbox({ url: stand.apiUrl, anonKey: 'stand', admin: { email: 'owner@stand.test.invalid', password: 'stand' },
      name: 'Песочница — Клиент 0', key: 'k0', domain: 'sandbox.test.invalid', log: (s) => logs.push(s) });
    const dir = mkdtempSync(join(tmpdir(), 'p2-0053-sandbox-'));
    const file = join(dir, 'Песочница — Клиент 0.md');
    writeFileSync(file, accessFile({ name: 'Песочница — Клиент 0', accounts: r.accounts }), { mode: 0o600 });
    const text = readFileSync(file, 'utf8');
    t(r.accounts.length === 9 && r.accounts.every((a) => text.includes(a.email) && text.includes(a.password)), `файл доступов: 9 учёток с логином и временным паролем (${file})`);
    t(!logs.join('\n').match(new RegExp(r.accounts.map((a) => a.password.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'))), 'в журнале скрипта паролей нет: ' + logs.join(' | '));
    t(/^> \*\*До передачи клиенту:\*\* закройте/m.test(text), 'файл доступов: первая строка — «закрыть порты до передачи клиенту»');
    t((statSync(file).mode & 0o777) === 0o600, 'файл доступов — только владельцу (права 600)');

    const q = async (sql, args = []) => (await db.query(sql, args)).rows;
    const co = (await q(`select id, is_test, is_demo from core.companies where name = 'Песочница — Клиент 0'`))[0];
    const mods = (await q(`select module, enabled from core.company_modules where company_id = $1 order by 1`, [co.id])).map((x) => x.module + (x.enabled ? '+' : '-')).join(' ');
    t(co.is_test && !co.is_demo && /planfact\+/.test(mods) && /quality\+/.test(mods) && /construction\+/.test(mods) && !/ai\+/.test(mods), `компания тестовая, не демо; модули: ${mods}`);
    const prof = await q(`select u.email, coalesce(p.must_change_password, false) m, p.managed_company_id = $1 own,
        (select count(*)::int from core.role_assignments a where a.user_id = u.id and a.company_id = $1 and a.revoked_at is null) asg
      from auth.users u join core.user_profiles p on p.user_id = u.id where u.email like '%.k0@sandbox.test.invalid' order by 1`, [co.id]);
    t(prof.length === 9 && prof.every((x) => x.m && x.own), 'все 9 учёток — «сменить пароль при первом входе», учётки компании клиента');
    const empty = SANDBOX_USERS.filter((u) => !u.keep).map((u) => u.key);
    t(prof.every((x) => (empty.includes(x.email.split('.')[0]) ? x.asg === 0 : x.asg === 1)), `участие пустое у ${empty.join(', ')}; у остальных — роль`);

    // клиент: вход каждой учёткой
    for (const a of r.accounts) {
      const c = standClient(stand.apiUrl);
      const s = await c.auth.signInWithPassword({ email: a.email, password: a.password });
      const pl = s.error ? null : (await c.rpc('pf_my_platform')).data;
      const seen = pl && pl.companies.some((x) => x.id === co.id);
      t(!s.error && (a.keep ? seen : !seen), `${a.title}: вход ${s.error ? 'НЕТ' : 'да'}, компания в списке — ${seen ? 'да' : 'нет (участок не назначен)'}`);
    }
    // путь клиента: объект → места из Excel → прорабу участок → ВОР из образца → смета и КП → факт → КС-2
    const adm = standClient(stand.apiUrl); await adm.auth.signInWithPassword({ email: 'admin.k0@sandbox.test.invalid', password: 'x' });
    const ok = (x, w) => { if (x.error) throw new Error(w + ': ' + x.error.message); return x.data; };
    const pid = randomUUID();
    ok(await adm.rpc('pf_save_project', { p_company: co.id, p_id: pid, p_card: { name: 'Мой первый объект', timezone: 'Europe/Moscow', country: 'RU' } }), 'объект');
    const { readWorkbook } = await import('../../src/platform/services/excel/xlsx-reader.ts');
    const { findPlaceHeader, sheetRows } = await import('../../src/platform/company/places-import.ts');
    const { parseSheet } = await import('../../src/modules/planfact/vor/parse.ts');
    const pw = await readWorkbook(readFileSync(join(ROOT, 'docs/demo-files/Образец — список квартир.xlsx')));
    const rows = sheetRows(pw.sheets[0], findPlaceHeader(pw.sheets[0].rows), null);
    const imp = ok(await adm.rpc('pf_import_places', { p_project: pid, p_batch: randomUUID(), p_rows: rows, p_dry_run: false }), 'места из Excel');
    const places = (await q(`select id, parent_id, node_type, name from core.locations where project_id = $1 and deleted_at is null`, [pid]));
    t(places.filter((x) => x.node_type === 'apartment').length === 40, `места из образца Excel: квартир ${places.filter((x) => x.node_type === 'apartment').length}, всего мест ${places.length} (${imp && imp.ok !== false ? 'загружено' : 'ошибка'})`);
    const users = ok(await adm.rpc('pf_list_company_members', { p_company: co.id }), 'сотрудники');
    const roles = ok(await adm.rpc('pf_list_company_roles', { p_company: co.id }), 'роли');
    const sec1 = places.find((x) => x.node_type === 'section' && x.name === 'Секция 1');
    ok(await adm.rpc('pf_set_participation', { p_users: [users.find((u) => u.email.startsWith('prorab.')).user_id], p_role: roles.find((x) => x.template_code === 'foreman').id,
      p_project: pid, p_locations: [sec1.id], p_fact_owner: true, p_valid_to: null, p_objects: null, p_counterparty: null }), 'прорабу участок');
    const pto = standClient(stand.apiUrl); await pto.auth.signInWithPassword({ email: 'pto.k0@sandbox.test.invalid', password: 'x' });
    const vw = await readWorkbook(readFileSync(join(ROOT, 'docs/demo-files/Образец — ВОР своей формы.xlsx')));
    const pr = parseSheet(vw.sheets[0]);
    const sha = createHash('sha256').update(readFileSync(join(ROOT, 'docs/demo-files/Образец — ВОР своей формы.xlsx'))).digest('hex');
    const vimp = ok(await pto.rpc('pf_vor_create_import', { p_project: pid, p_file_name: 'Образец — ВОР своей формы.xlsx', p_sha256: sha, p_sheet: 'ВОР', p_profile: null, p_totals: {} }), 'ВОР');
    const works = pr.rows.filter((x) => x.kind === 'work');
    ok(await pto.rpc('pf_vor_add_rows', { p_import: vimp, p_rows: works.map((w) => ({ row_no: w.rowNo, kind: 'work', name: w.name, unit_text: w.unitText, qty: w.qty })) }), 'строки ВОР');
    const unitM = Object.fromEntries((ok(await pto.rpc('pf_list_units', { p_company: co.id }), 'единицы')).map((u) => [u.code, u.id]));
    const wts = ok(await pto.rpc('pf_vor_add_work_types', { p_project: pid, p_items: [...new Set(works.map((w) => w.name + '|' + w.unitText))].map((k) => ({ name: k.split('|')[0],
      unit_id: unitM[{ м3: 'м³', м2: 'м²', шт: 'шт.' }[k.split('|')[1]]] })) }), 'виды работ');
    const floorOf = (w) => { const s = places.find((x) => x.node_type === 'section' && x.name === 'Секция ' + w.context.section);
      return places.find((x) => x.parent_id === s.id && x.node_type === 'floor' && Number(x.name.replace(/\D/g, '')) === w.context.floor.from).id; };
    ok(await pto.rpc('pf_vor_resolve_rows', { p_import: vimp, p_items: works.map((w) => { const wt = wts.find((x) => x.name === w.name);
      return { row_no: w.rowNo, location_id: floorOf(w), work_type_id: wt.id, unit_id: wt.unit_id, match: 'green' }; }) }), 'разбор ВОР');
    ok(await pto.rpc('pf_vor_confirm', { p_import: vimp }), 'подтвердить ВОР');
    const est = ok(await pto.rpc('pf_estimate_create', { p_project: pid, p_name: 'Моя смета', p_imports: [vimp], p_area: null }), 'смета');
    const kp = ok(await pto.rpc('pf_kp_create', { p_estimate: est, p_file_sha256: sha, p_snapshot: { version: 1, rows: works.map((w) => ({ import_id: vimp, row_no: w.rowNo, kind: 'work', price_labor: 100, price_material: null })) },
      p_total: works.reduce((s, w) => s + w.qty * 100, 0), p_note: null }), 'КП');
    ok(await pto.rpc('pf_ks2_set_contract', { p_project: pid, p_kp_revision: kp.id }), 'договор КС-2');
    const pos = ok(await pto.rpc('pf_vor_positions', { p_project: pid, p_location: null }), 'позиции');
    const fore = standClient(stand.apiUrl); await fore.auth.signInWithPassword({ email: 'prorab.k0@sandbox.test.invalid', password: 'x' });
    const today = new Date().toISOString().slice(0, 10);
    const mine = pos.filter((x) => /Секция 1/.test(x.location_path)).slice(0, 3);
    const brig = ok(await adm.rpc('pf_brigade_save', { p_company: co.id, p_id: null, p_name: 'Моя бригада', p_leader: null, p_phone: null }), 'бригада');
    const f = ok(await fore.rpc('pf_fact_add_batch', { p_project: pid, p_brigade: brig, p_date: today, p_items: mine.map((x) => ({ position_id: x.id, qty: 1 })),
      p_workers: 3, p_note: null, p_require_approval: false }), 'факт прораба');
    t(Number(f.accepted) === 3, `факт прораба на своём участке: принято ${f.accepted}`);
    const act = ok(await pto.rpc('pf_ks2_act_create', { p_project: pid, p_act_no: '1', p_act_date: today, p_from: today, p_to: today }), 'КС-2');
    ok(await pto.rpc('pf_ks2_save', { p_act: act, p_header: {}, p_rows: [], p_note: null }), 'КС-2 шапка');
    ok(await pto.rpc('pf_ks2_issue', { p_act: act }), 'КС-2 выдать');
    const a = (ok(await pto.rpc('pf_ks2_acts', { p_project: pid }), 'акты'))[0];
    t(a.status === 'issued' && Number(a.total) === 300, `КС-2 №1 выдан из факта: ${a.total} ₽`);
    await stand.stop();
  } catch (e) {
    console.error('ОШИБКА:', e.stack || e.message);
    bad++;
  }
  console.log(`FAIL всего: ${bad}`);
  process.exit(bad ? 1 : 0);
}
