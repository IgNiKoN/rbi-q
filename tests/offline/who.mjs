// P2-0073 этап 4: «Компания → Сотрудники и доступ → Кто что может» — нажатие на роль открывает «Роли и права» с этой ролью,
// на человека — «Сотрудники» с его назначениями (переход роутером оболочки); подсказка вверху. c-who375 (светлая), c-who1440 (тёмная).
// Ответы сервера «Компании» — подставные (page.route), боевой сервер не используется.
import { join } from 'node:path';
import { start, stop, resetNet, API } from './servers.mjs';
import { freshProfile, go, launch, note, ok, signIn } from './lib.mjs';

const SK = { module: 'construction', module_name: 'Стройконтроль', area_scoped: true };
const CATALOG = [
  { action: 'construction.defects.view', description: 'Видеть замечания', ...SK, group_name: 'Замечания', sort: 3010, label: 'Видеть замечания' },
  { action: 'construction.defects.close', description: 'Закрыть замечание', ...SK, group_name: 'Замечания', sort: 3060, label: 'Закрыть замечание' },
  { action: 'construction.acceptance.view', description: 'Видеть приёмки', ...SK, group_name: 'Приёмка', sort: 3110, label: 'Видеть приёмки' }
];
const ROLES = [
  { id: 'r-sk', name: 'Инженер СК', template_code: null, actions: ['construction.defects.view', 'construction.defects.close', 'construction.acceptance.view'], active_assignments: 1 },
  { id: 'r-pr', name: 'Прораб', template_code: null, actions: ['construction.defects.view'], active_assignments: 1 },
  { id: 'r-adm', name: 'Администратор компании', template_code: 'admin', actions: [], active_assignments: 1 }
];
const member = (user_id, full_name, email, role, project) => ({ user_id, full_name, email, assignment_id: 'a-' + user_id, role_id: role.id, role_name: role.name,
  project_id: project ? 'p-1' : null, project_name: project ? 'ЖК Тестовый' : null, valid_from: null, valid_to: null, is_active: true, managed: true, disabled_at: null,
  contractor_id: null, contractor_name: null, scope_nodes: [], must_change_password: false });
const MEMBERS = [member('u-1', 'Иванов Иван', 'test@stand.local', ROLES[2], false), member('u-7', 'Петров Пётр', 'petrov@stand.local', ROLES[0], true),
  member('u-8', 'Козлов Дмитрий', 'kozlov@stand.local', ROLES[1], true)];
const WHO = [
  { user_id: 'u-7', full_name: 'Петров Пётр', email: 'petrov@stand.local', roles: ['Инженер СК'], places: ['весь объект'], partial: false, firm: null, actions: ROLES[0].actions },
  { user_id: 'u-8', full_name: 'Козлов Дмитрий', email: 'kozlov@stand.local', roles: ['Прораб'], places: ['Корпус 1'], partial: true, firm: null, actions: ROLES[1].actions }
];
const RPC = { pf_permission_catalog: CATALOG, pf_list_company_roles: ROLES, pf_list_company_members: MEMBERS, pf_who_can: WHO, pf_quality_container: null, pf_list_quality_objects: [] };

async function who(out, width, scheme) {
  const tag = 'c-who' + width;
  note(`== ${tag}: «Кто что может» → роль → «Роли и права»; → человек → «Сотрудники»`);
  freshProfile(out, tag); resetNet();
  await start();
  const { ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900, scheme });
  await page.route(API + '/rest/v1/rpc/**', (r) => {
    const fn = new URL(r.request().url()).pathname.split('/').pop();
    return fn in RPC ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[fn]) }) : r.fallback();
  });
  try {
    await signIn(page);
    const openWho = async () => { await go(page, '#/settings/company/who', 5000); await page.waitForSelector('[data-testid=co-who-help]', { timeout: 15000 }).catch(() => {}); };
    await openWho();
    const help = await page.locator('[data-testid=co-who-help]').innerText().catch(() => '');
    ok(/Здесь только смотреть\. Что может роль — «Роли и права»; кому какая роль и где — «Сотрудники»/.test(help), `${tag}: подсказка вверху`, help);
    const fs = await page.locator('[data-testid=co-who-help]').evaluate((e) => parseFloat(getComputedStyle(e).fontSize)).catch(() => 0);
    ok(fs >= 14, `${tag}: подсказка обычного размера (не мелкая)`, fs + ' px');
    const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    ok(wide <= 0, `${tag}: без прокрутки вбок`, String(wide));
    await page.screenshot({ path: join(out, `${tag}-who.png`) });
    // роль Козлова → «Роли и права», роль «Прораб» открыта
    const scope = width < 768 ? '.cw-list .cw-p[data-user=u-8]' : '[data-testid=co-who-table] tbody tr[data-user=u-8]';
    await page.locator(`${scope} [data-testid=co-who-role]`).click();
    await page.waitForSelector('[data-testid=co-roles]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => ({ hash: location.hash, active: (document.querySelector('.co-list-item--active') || {}).dataset?.roleId || '',
      detail: (document.querySelector('[data-testid=co-roles]') || {}).dataset?.detail || '', title: (document.querySelector('[data-testid=co-role-panel] input[name=roleName]') || {}).value || '' }));
    ok(r.hash === '#/settings/company/roles?role=r-pr' && r.active === 'r-pr' && r.title === 'Прораб', `${tag}: роль → «Роли и права», открыта эта роль`, JSON.stringify(r));
    if (width < 768) ok(r.detail === '1', `${tag}: на телефоне сразу галочки роли`, r.detail);
    await page.screenshot({ path: join(out, `${tag}-role.png`) });
    // назад → человек Петров → «Сотрудники», открыт он
    await page.goBack(); await page.waitForTimeout(2500);
    ok(await page.locator('[data-testid=co-who-help]').count() === 1, `${tag}: «Назад» — снова «Кто что может»`);
    await page.locator(`${width < 768 ? '.cw-list .cw-p[data-user=u-7]' : '[data-testid=co-who-table] tbody tr[data-user=u-7]'} [data-testid=co-who-person]`).click();
    await page.waitForSelector('[data-testid=co-person]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const m = await page.evaluate(() => ({ hash: location.hash, user: (document.querySelector('[data-testid=co-person]') || {}).dataset?.userId || '',
      text: ((document.querySelector('[data-testid=co-person]') || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 120) }));
    ok(m.hash === '#/settings/company/members?user=u-7' && m.user === 'u-7' && /Петров Пётр/.test(m.text) && /Инженер СК/.test(m.text), `${tag}: человек → «Сотрудники», открыт он и его роль`, JSON.stringify(m));
    await page.screenshot({ path: join(out, `${tag}-person.png`) });
  } finally {
    await ctx.close(); await stop();
  }
}

export function whoScenarios(out) {
  return { 'c-who375': () => who(out, 375, 'light'), 'c-who1440': () => who(out, 1440, 'dark') };
}
