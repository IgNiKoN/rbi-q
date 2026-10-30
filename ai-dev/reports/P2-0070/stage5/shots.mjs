// P2-0070 этап 5: настоящий экран «Сотрудники и доступ → Кто что может» и «Роли и права» в оболочке на стенде
// (tests/offline/servers.mjs), ответы сервера — снятые с локальной копии теми же функциями (data.mjs: pf_who_can,
// pf_project_places, каталог, роли, сотрудники). Переход — роутером оболочки (history.pushState). Боевой сервер не используется.
// node shots.mjs <data.json> <out-dir>
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
  pf_my_projects: () => data.projects.map((p) => ({ ...p, company_id: '11111111-2222-3333-4444-555555555555', archived_at: null })),
  pf_project_places: (_u, a) => data.tree[a.p_project + '|' + (a.p_parent || '')] || [],
  pf_who_can: (_u, a) => data.who[a.p_project + '|' + (a.p_location || '')] || []
};
const checks = [];
async function shot(width, scheme, name, steps) {
  const prof = join(tmpdir(), 'p70-profiles');
  freshProfile(prof, name);
  const { ctx, page } = await launch(prof, name, { width, height: width < 768 ? 812 : 900, scheme });
  await signIn(page);
  // переход роутером оболочки, не только сменой hash
  await page.evaluate(() => { history.pushState(null, '', '#/settings/company/who'); window.dispatchEvent(new HashChangeEvent('hashchange')); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForTimeout(3500);
  if (steps) await steps(page);
  await page.waitForTimeout(700);
  const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  checks.push(`${name}: горизонтальная прокрутка страницы ${scrollX > 0 ? 'ЕСТЬ ' + scrollX + 'px' : 'нет'}`);
  if (width < 768) await page.addStyleTag({ content: '.bottom-nav{display:none!important}' });
  await page.screenshot({ path: join(out, `${name}.jpg`), fullPage: true, type: 'jpeg', quality: 80 });
  checks.push(`${name}: ` + await page.evaluate(() => {
    const t = document.querySelector('[data-testid=co-who-table]'), c = document.querySelectorAll('.cw-list .cw-p');
    return t ? `таблица: строк ${t.querySelectorAll('tbody tr').length}, колонок ${t.querySelectorAll('thead tr:last-child th').length}; карточек ${c.length}`
      : document.querySelector('[data-testid=co-who]') ? 'экран есть, таблицы нет' : 'ЭКРАНА НЕТ';
  }));
  await ctx.close();
}
const sel = (testid, label) => async (page) => {
  await page.locator(`[data-testid=${testid}]`).selectOption({ label }); await page.waitForTimeout(800);
};
const mod = (code) => async (page) => { await page.locator(`[data-mod=${code}]`).click(); await page.waitForTimeout(500); };
const both = (...fs) => async (page) => { for (const f of fs) await f(page); };

await start();
try {
  await shot(1440, 'dark', 'who-sk-1440-dark', mod('construction'));
  await shot(1440, 'light', 'who-sk-sec1-1440', both(sel('co-who-place', '— Секция 1'), mod('construction')));
  await shot(1280, 'light', 'who-pf-1280', mod('planfact'));
  await shot(375, 'light', 'who-sk-375', mod('construction'));
  await shot(375, 'dark', 'who-pf-sec2-375-dark', both(sel('co-who-place', '— Секция 2'), mod('planfact')));
} finally { await stop(); }
console.log(checks.join('\n'));
