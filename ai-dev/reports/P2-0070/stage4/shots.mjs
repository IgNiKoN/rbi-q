// P2-0070 этап 4: снимки «Настройки → Сотрудники и доступ» («Роли и права», «Кто что может») в настоящей оболочке на стенде
// (tests/offline/servers.mjs папки <repo>: «сейчас» — копия main, «предлагаю» — ветка блока), данные — data.mjs (локальная копия
// сервера). Боевой сервер не используется. Во всю длину страницы.
// node shots.mjs <repo> <data.json> <out-dir> <now|new> [mock.js]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const [repo, dataPath, out, prefix, mockPath] = process.argv.slice(2);
const { start, stop, stand } = await import(pathToFileURL(join(repo, 'tests/offline/servers.mjs')).href);
const { freshProfile, launch, signIn, go } = await import(pathToFileURL(join(repo, 'tests/offline/lib.mjs')).href);
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const mock = mockPath ? readFileSync(mockPath, 'utf8') : '';
stand.rpc = {
  pf_permission_catalog: () => data.catalog,
  pf_list_company_roles: () => data.roles,
  pf_list_company_members: () => data.members,
  pf_company_projects: () => data.projects.map((p) => ({ ...p, archived_at: null }))
};

async function shot(width, scheme, name, steps) {
  const tag = `p70-${prefix}-${name}`;
  const prof = join(tmpdir(), 'p70-profiles');   // профили браузера — вне репозитория
  freshProfile(prof, tag);
  const { ctx, page } = await launch(prof, tag, { width, height: width < 768 ? 812 : 900, scheme });
  await signIn(page);
  await page.evaluate((d) => { window.__P70_DATA = d; }, data);
  if (mock) await page.evaluate((src) => (0, eval)(src), mock);
  await go(page, '#/settings/company/roles', 3500);
  if (steps) await steps(page);
  await page.waitForTimeout(700);
  if (width < 768) await page.addStyleTag({ content: '.bottom-nav{display:none!important}' });
  await page.screenshot({ path: join(out, `${prefix}-${name}.jpg`), fullPage: true, type: 'jpeg', quality: 80 });
  console.log('ok', prefix, name);
  await ctx.close();
}
const pick = (role) => async (page) => {
  await page.locator(`[data-testid=co-roles] .co-list-item:has-text("${role}")`).first().click();
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelectorAll('[data-testid=co-role-panel] details').forEach((d) => { d.open = true; }));
};
const who = (o) => async (page) => {
  await page.locator('[data-tab=who]').click(); await page.waitForTimeout(800);
  if (o) { await page.evaluate((x) => window.__P70_SET(x), o); await page.waitForTimeout(300); }
};

await start();
try {
  await shot(1440, 'dark', 'roles-1440-dark', pick('Инженер строительного контроля'));
  await shot(375, 'light', 'roles-375', pick('Инженер строительного контроля'));
  await shot(1440, 'light', 'roles-pm-1440', pick('Руководитель проекта'));
  await shot(375, 'light', 'roles-list-375');
  if (prefix === 'new') {
    await shot(1440, 'dark', 'who-sk-1440-dark', who({ mod: 'construction' }));
    await shot(1440, 'light', 'who-sk-sec1-1440', who({ mod: 'construction', place: data.places.find((p) => p.name === 'Секция 1' && p.project_id === data.projects[0].id).id }));
    await shot(1440, 'light', 'who-pf-1440', who({ mod: 'planfact' }));
    await shot(375, 'light', 'who-sk-375', who({ mod: 'construction' }));
    await shot(375, 'dark', 'who-pf-375-dark', who({ mod: 'planfact', place: data.places.find((p) => p.name === 'Секция 2' && p.project_id === data.projects[0].id).id }));
  }
} finally { await stop(); }
