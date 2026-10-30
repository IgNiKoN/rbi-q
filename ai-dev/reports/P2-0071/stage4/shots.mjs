// P2-0071 этап 4: настоящие экраны «Сотрудники и доступ» в оболочке на стенде (tests/offline/servers.mjs), ответы сервера — снятые
// с локальной копии теми же функциями (data.mjs): «Роли» — группы Качества и «Доступ к модулю»; мастер назначения — «Все объекты /
// Выбранные объекты / Без объектов»; «Кто что может» — Качество на объекте. Основа — reports/P2-0070/stage5/shots.mjs.
// Боевой сервер не используется. node shots.mjs <data.json> <out-dir>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { start, stop, stand } from '../../../../tests/offline/servers.mjs';
import { freshProfile, launch, signIn } from '../../../../tests/offline/lib.mjs';

const [dataPath, out] = process.argv.slice(2);
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
stand.rpc = {
  pf_permission_catalog: () => data.catalog,
  pf_list_company_roles: () => data.roles,
  pf_list_company_members: () => data.members,
  pf_quality_container: () => data.container,
  pf_my_projects: () => data.projects.map((p) => ({ ...p, company_id: '11111111-2222-3333-4444-555555555555', archived_at: null })),
  pf_project_places: (_u, a) => data.tree[a.p_project + '|' + (a.p_parent || '')] || [],
  pf_who_can: (_u, a) => data.who[a.p_project + '|' + (a.p_location || '')] || []
};
const checks = [];
async function shot(width, scheme, name, tab, steps) {
  const prof = join(tmpdir(), 'p71-profiles');
  freshProfile(prof, name);
  const { ctx, page } = await launch(prof, name, { width, height: width < 768 ? 812 : 900, scheme });
  await signIn(page);
  await page.evaluate((t) => { history.pushState(null, '', '#/settings/company/' + t); window.dispatchEvent(new HashChangeEvent('hashchange')); window.dispatchEvent(new PopStateEvent('popstate')); }, tab);
  await page.waitForTimeout(3500);
  if (steps) await steps(page);
  await page.waitForTimeout(700);
  const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  checks.push(`${name}: горизонтальная прокрутка страницы ${scrollX > 0 ? 'ЕСТЬ ' + scrollX + 'px' : 'нет'}`);
  if (width < 768) await page.addStyleTag({ content: '.bottom-nav{display:none!important}' });
  await page.screenshot({ path: join(out, `${name}.jpg`), fullPage: true, type: 'jpeg', quality: 80 });
  checks.push(`${name}: ` + await page.evaluate(() => [
    'переключателей модуля ' + document.querySelectorAll('[data-testid=co-module-access]').length,
    'групп ' + document.querySelectorAll('[data-group]').length,
    'вариантов «Где» ' + Array.from(document.querySelectorAll('[data-scope]')).map((b) => b.textContent).join(' / '),
    'объектов ' + document.querySelectorAll('[data-testid=co-wiz-project] input').length,
    'таблица «Кто что может» ' + (document.querySelector('[data-testid=co-who-table]') ? 'есть' : 'нет')].join('; ')));
  await ctx.close();
}
const role = (name) => async (page) => { await page.locator('[data-role-id]', { hasText: name }).first().click(); await page.waitForTimeout(800); };
const wizard = (person, roleName, scope) => async (page) => {
  await page.locator('[data-testid=co-assign-open]:visible, [data-testid=co-assign-open-m]:visible').first().click(); await page.waitForTimeout(600);
  await page.locator(`[data-pick] >> text=${person}`).first().click(); await page.waitForTimeout(300);
  await page.locator('[data-testid=co-wiz-next]').click(); await page.waitForTimeout(500);
  await page.locator('[data-testid=co-wiz-role]').selectOption({ label: roleName }); await page.waitForTimeout(400);
  await page.locator(`[data-scope=${scope}]`).click(); await page.waitForTimeout(400);
  if (scope === 'project') for (const box of await page.locator('[data-testid=co-wiz-project] input').all()) await box.check();
  await page.waitForTimeout(400);
};
const mod = (code) => async (page) => { await page.locator(`[data-mod=${code}]`).click(); await page.waitForTimeout(500); };
const switchOff = async (page) => { await page.locator('[data-module=construction] [data-testid=co-module-access]').uncheck(); await page.waitForTimeout(400); };
const both = (...fs) => async (page) => { for (const f of fs) await f(page); };

await start();
try {
  await shot(1440, 'light', 'roles-engineer-1440', 'roles', role('Инженер строительного контроля'));
  await shot(1440, 'dark', 'roles-methodologist-1440-dark', 'roles', role('Методолог Качества'));
  await shot(375, 'light', 'roles-engineer-375', 'roles', role('Инженер строительного контроля'));
  await shot(375, 'dark', 'roles-switch-off-375-dark', 'roles', both(role('Методолог Качества'), switchOff));
  await shot(1440, 'light', 'wizard-objects-1440', 'members', wizard('Лебедев Антон', 'Инженер строительного контроля', 'project'));
  await shot(375, 'light', 'wizard-objects-375', 'members', wizard('Лебедев Антон', 'Инженер строительного контроля', 'project'));
  await shot(375, 'dark', 'wizard-none-375-dark', 'members', wizard('Лебедев Антон', 'Инженер строительного контроля', 'none'));
  await shot(1440, 'dark', 'members-1440-dark', 'members');
  await shot(1440, 'light', 'who-quality-1440', 'who', mod('quality'));
  await shot(375, 'dark', 'who-quality-375-dark', 'who', mod('quality'));
} finally { await stop(); }
console.log(checks.join('\n'));
