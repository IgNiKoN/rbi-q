// P2-0053. «Песочница» клиента — своя тестовая компания на боевом, тем же путём, что в памятке docs/DEMO.md (функции экранов
// «Администрирование платформы» и «Компания → Сотрудники», права проверяет сервер): тестовая компания → модули (План/Факт,
// Качество, Стройконтроль; ИИ выключен) → администратор платформы — её администратор → учётки клиента: администратор компании
// и по одной на роли (руководитель, РП, ПТО, прораб, инженер качества, экономист, заказчик, представитель подрядчика) с
// временными паролями (при первом входе клиент меняет). У прораба и инженера качества участие пустое (объекта ещё нет) —
// назначает администратор клиента после загрузки ВОР; у представителя подрядчика — фирма назначается так же.
// Логины и временные пароли — ТОЛЬКО в файл --out (вне git); в консоль — только число учёток.
//
// node scripts/demo/sandbox.mjs --name "Песочница — Клиент 1" --key k1 --out "<файл.md>" [--domain sandbox.rbi-q.ru]
//   сервер, ключ и вход администратора платформы — .env.local: P2_SUPABASE_URL, P2_SUPABASE_ANON_KEY,
//   P2_PLATFORM_ADMIN_EMAIL, P2_PLATFORM_ADMIN_PASSWORD (стенд: runSandbox({ url, anonKey, admin }) из scripts/demo/check-sandbox.mjs).
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readEnv } from './accounts.mjs';

const require = createRequire(import.meta.url);

/** Учётки песочницы: ключ почты → шаблон роли, подпись и ФИО. */
export const SANDBOX_USERS = [
  { key: 'admin', role: 'company_admin', title: 'Администратор компании (клиент)', name: 'Администратор Клиента', keep: true },
  { key: 'rukovoditel', role: 'management', title: 'Руководитель', name: 'Руководитель Клиента', keep: true },
  { key: 'rp', role: 'project_manager', title: 'Руководитель проекта', name: 'РП Клиента', keep: true },
  { key: 'pto', role: 'pto', title: 'Инженер ПТО', name: 'ПТО Клиента', keep: true },
  { key: 'prorab', role: 'foreman', title: 'Прораб', name: 'Прораб Клиента', keep: false },
  { key: 'inzhener', role: 'qc_engineer', title: 'Инженер качества', name: 'Инженер Клиента', keep: false },
  { key: 'ekonomist', role: 'economist', title: 'Экономист', name: 'Экономист Клиента', keep: true },
  { key: 'zakazchik', role: 'customer', title: 'Заказчик', name: 'Заказчик Клиента', keep: true },
  { key: 'podryadchik', role: 'contractor_rep', title: 'Представитель подрядчика', name: 'Подрядчик Клиента', keep: false }
];
export const MODULES = { planfact: true, quality: true, construction: true, ai: false };

export async function runSandbox({ url, anonKey, admin, name, key, domain = 'sandbox.rbi-q.ru', log = console.log }) {
  const { createClient } = require('@supabase/supabase-js');
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
  const s = await c.auth.signInWithPassword({ email: admin.email, password: admin.password });
  if (s.error) throw new Error('вход администратора платформы: ' + s.error.message);
  const list = ok(await c.rpc('pf_platform_companies'), 'список компаний');
  if (list.some((x) => x.name.toLowerCase() === name.toLowerCase())) throw new Error(`Компания «${name}» уже есть — новая песочница: другое название (Клиент 2, …)`);
  // 1. тестовая компания и модули (экран «Администрирование платформы»)
  const company = ok(await c.rpc('pf_platform_create_company', { p_name: name, p_is_test: true }), 'компания');
  for (const [m, on] of Object.entries(MODULES)) ok(await c.rpc('pf_platform_set_module', { p_company: company, p_module: m, p_enabled: on }), 'модуль ' + m);
  // 2. администратор платформы — администратор компании (чтобы завести сотрудников; клиенту виден в «Сотрудниках»)
  ok(await c.rpc('pf_platform_set_company_admin', { p_company: company, p_email: admin.email }), 'администратор компании');
  // 3. сотрудники с ролями и временными паролями (экран «Компания → Сотрудники → Добавить»)
  const roles = ok(await c.rpc('pf_list_company_roles', { p_company: company }), 'роли');
  const out = [];
  for (const u of SANDBOX_USERS) {
    const email = `${u.key}.${key}@${domain}`;
    const role = roles.find((r) => r.template_code === u.role);
    if (!role) throw new Error('нет роли ' + u.role);
    const r = ok(await c.rpc('pf_company_add_member', { p_company: company, p_email: email, p_full_name: u.name, p_role: role.id, p_project: null }), 'учётка ' + u.key);
    const row = Array.isArray(r) ? r[0] : r;
    if (!row || !row.temp_password) throw new Error(`учётка ${u.key}: сервер не выдал временный пароль (почта уже занята?)`);
    if (!u.keep) {   // участие пустое: объекта ещё нет — назначит администратор клиента
      const members = ok(await c.rpc('pf_list_company_members', { p_company: company }), 'сотрудники');
      for (const m of members.filter((x) => x.user_id === row.user_id && x.assignment_id)) ok(await c.rpc('pf_revoke_assignment', { p_assignment: m.assignment_id }), 'участие ' + u.key);
    }
    out.push({ ...u, email, password: row.temp_password });
  }
  await c.auth.signOut();
  log(`песочница «${name}»: компания создана, модулей ${Object.values(MODULES).filter(Boolean).length}, учёток ${out.length}`);
  return { company, accounts: out, verify: () => verifySignIn(createClient, url, anonKey, out, log) };
}

/** Вход каждой учёткой временным паролем (пароль не меняется — это сделает клиент при первом входе). Вызывать ПОСЛЕ записи
 *  файла доступов: при сбое пароли не теряются. */
async function verifySignIn(createClient, url, anonKey, out, log) {
  let signed = 0;
  for (const a of out) {
    const u = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const r = await u.auth.signInWithPassword({ email: a.email, password: a.password });
    if (!r.error) { signed++; await u.auth.signOut().catch(() => {}); }
  }
  log(`вход проверен у ${signed} из ${out.length}`);
  if (signed !== out.length) throw new Error(`вход не прошёл у ${out.length - signed} учёток — разобраться до передачи клиенту (файл доступов записан)`);
  return signed;
}

/** Файл доступов владельцу (вне git): адрес, «до передачи клиенту», таблица учёток, как войти и что дальше. */
export function accessFile({ name, accounts, app = 'https://app.rbi-q.ru', date = new Date().toISOString().slice(0, 10) }) {
  const rows = accounts.map((a) => `| ${a.title} | \`${a.email}\` | \`${a.password}\` | ${a.keep ? 'да' : 'нет — назначьте участок (см. ниже)'} |`).join('\n');
  return `# ${name} — доступы для клиента

> **До передачи клиенту:** закройте открытые снаружи порты сервера 5432, 6543, 8000, 8443, 4000 — «Настройки сети» Beget (шаги — \`docs/DEMO.md\`, раздел «Закрыть порты»). Приложение через эти порты не ходит: только https://api.rbi-q.ru (порт 443).

Создано ${date} (P2-0053). Адрес: **${app}**. Пароли — **временные**: при первом входе приложение попросит придумать свой.
Этот файл — только у владельца (iCloud, вне git). Клиенту передавайте учётки лично или в защищённом сообщении; после передачи файл можно удалить.

| Роль | Логин (почта) | Временный пароль | Сразу видит объект |
|---|---|---|---|
${rows}

## Как войти и поставить на телефон (для клиента)

1. Откройте **${app}** в Chrome (Android) или Safari (iPhone).
2. Введите почту и временный пароль из таблицы → придумайте свой пароль (не короче 8 знаков).
3. Телефон: Safari — «Поделиться» → «На экран „Домой“»; Chrome — меню ⋮ → «Установить приложение».
4. Приложение работает и без сети: факт, проверки и замечания сохраняются на телефоне и уходят, когда появится интернет.
5. Если что-то не так — «Настройки → Помощь и о программе → Перезапустить сейчас».

## Что дальше в своей компании

- **Администратор компании** (клиент): «Компания → Проекты» — создать объект, загрузить структуру мест (Excel со списком квартир — образец \`docs/demo-files/\`), PDF-планы этажей; «План/Факт → ВОР» — загрузить свою ВОР.
- **Прораб и инженер качества:** после появления объекта — «Компания → Сотрудники → [человек] → Где работает» — выбрать объект или секцию (прорабу — отметка «ответственный за факт»).
- **Представитель подрядчика:** «Компания → Контрагенты» — завести фирму-подрядчика, затем «Сотрудники → [человек] → Фирма».
- **Демо и обучение:** «Демо» на экране приветствия (или «Настройки → Мой профиль») — заполненный «ЖК Демо» глазами любой роли и пошаговые туры «План/Факт», «Качество», «Стройконтроль».
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (n, d = null) => (a.includes(n) ? a[a.indexOf(n) + 1] : d);
  const env = readEnv();
  try {
    const name = opt('--name'), key = opt('--key'), outFile = opt('--out');
    if (!name || !key || !outFile) throw new Error('нужно --name, --key и --out');
    if (existsSync(outFile)) throw new Error('файл доступов уже есть — не перезаписываю: ' + outFile);
    for (const k of ['P2_SUPABASE_URL', 'P2_SUPABASE_ANON_KEY', 'P2_PLATFORM_ADMIN_EMAIL', 'P2_PLATFORM_ADMIN_PASSWORD']) if (!env[k]) throw new Error('нет ' + k + ' в .env.local');
    const r = await runSandbox({ url: env.P2_SUPABASE_URL, anonKey: env.P2_SUPABASE_ANON_KEY, admin: { email: env.P2_PLATFORM_ADMIN_EMAIL, password: env.P2_PLATFORM_ADMIN_PASSWORD },
      name, key, domain: opt('--domain', 'sandbox.rbi-q.ru') });
    writeFileSync(outFile, accessFile({ name, accounts: r.accounts }), { mode: 0o600 });
    await r.verify();
    console.log(`Готово: учёток ${r.accounts.length}; логины и временные пароли — в файле доступов (в консоль не выводятся).`);
    process.exit(0);
  } catch (e) {
    console.error('ОШИБКА:', e.message);
    process.exit(1);
  }
}
