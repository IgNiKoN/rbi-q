// P2-0061 этап 5: «что скачалось» — одни и те же ответы сервера (совещания и задачи) → какие записи остались на телефоне у подрядчика,
// у инженера в режиме «Только мои» и у инженера «Вся команда». Файл без зависимостей от P2-0061 — тот же сценарий запускается
// на прежнем коде (сравнение «до / после», reports/P2-0061/stage5/). Боевой сервер не используется.
import { start, stop, stand, resetNet, API } from './servers.mjs';
import { freshProfile, launch, note, ok, signIn } from './lib.mjs';

const CP1 = '7a7a7a7a-1111-4111-8111-111111111111', CP2 = '7b7b7b7b-2222-4222-8222-222222222222';
const T = '2026-10-20T10:00:00Z';
const meeting = (id, author, authorId, cp, firm) => ({ id, project_code: 'p', project_canonical_key: '', data: { id, author, title: 'Совещание ' + id, contractorId: 'card-' + id },
  owner: author, created_by: author, core_created_by: authorId, core_counterparty_id: cp, contractor_name: firm, updated_at: T, created_at: T, is_deleted: false });
const task = (id, author, authorId, assignee, cp, firm) => ({ id, project_code: 'p', project_canonical_key: '', engineer_name: author, core_created_by: authorId,
  assigned_to_auth_user_id: assignee, core_counterparty_id: cp, contractor_name: firm, status: 'pending', task_data: { id, engineerName: author, title: 'Задача ' + id },
  updated_at: T, created_at: T, is_deleted: false });
/** Ответ «сервера» — набор строк разных авторов и фирм (сервер уже отобрал бы по правам; здесь — проверка отбора на телефоне). */
const ROWS = {
  project_meetings: [meeting('m-own', 'Иванов Иван', 'u-1', null, ''), meeting('m-other', 'Петров Пётр', 'u-2', null, ''),
    meeting('m-f1', 'Петров Пётр', 'u-2', CP1, 'Фирма 1'), meeting('m-f2', 'Петров Пётр', 'u-2', CP2, 'Фирма 2')],
  rbi_tasks: [task('t-own', 'Иванов Иван', 'u-1', 'u-1', null, ''), task('t-other', 'Петров Пётр', 'u-2', 'u-2', null, ''),
    task('t-f1', 'Петров Пётр', 'u-2', null, CP1, 'Фирма 1'), task('t-f2', 'Петров Пётр', 'u-2', null, CP2, 'Фирма 2')]
};

async function one(out, tag, quality, mode) {
  freshProfile(out, tag); resetNet(); stand.quality = quality;
  await start();
  const { ctx, page } = await launch(out, tag);
  try {
    await page.route(new RegExp('^' + API.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/rest/v1/(project_meetings|rbi_tasks)\\?'), (r) => {
      if (r.request().method() !== 'GET') return r.continue();
      const t = new URL(r.request().url()).pathname.split('/').pop();
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROWS[t] || []) });
    });
    await signIn(page);
    if (mode) await page.evaluate((m) => { window.syncConfig.syncMode = m; localStorage.setItem('rbi_sync_config', JSON.stringify(window.syncConfig)); }, mode);
    await page.waitForTimeout(2000);
    // то, что функция скачивания «объектов» оставила на телефоне (её отбор — предмет сравнения); задачи сужает запрос к серверу
    const r = await page.evaluate(async () => {
      try {
        const o = await window.pullCloudObjects('meeting', '', 'manual');
        const SA = window.RbiSyncAccess, me = SA && SA.deviceMe ? SA.deviceMe() : null;
        const probe = SA && me ? SA.canSend({ id: 'x', author: 'Петров', core_counterparty_id: '7a7a7a7a-1111-4111-8111-111111111111' }, SA.kindOf('project_meetings'), me) : null;
        return { meetings: o.map((x) => String(x.id)).sort(), me: me ? { id: me.userId, cp: me.contractorId, acts: me.actions, mods: me.modules } : null, probe,
          kind: SA ? (SA.kindOf('project_meetings') || {}).kind : null };
      } catch (e) { return { err: e.message }; }
    });
    note(tag + ': ' + JSON.stringify(r));
    return r;
  } finally { await ctx.close(); await stop().catch(() => {}); stand.quality = null; }
}

export async function pullScope(out) {
  const tag = 's-pull-scope';
  note(`== ${tag}: одни и те же ответы сервера → что осталось на телефоне (подрядчик «Фирма 1», инженер «Только мои», инженер «Вся команда»)`);
  const ctr = { actions: ['quality.view', 'quality.edit', 'quality.scope.contractor'], templates: [], projects: null,
    contractor: { id: CP1, name: 'Фирма 1', keys: [] }, objects: null, container: null };
  const eng = { actions: ['quality.view', 'quality.edit'], templates: [], projects: null, contractor: null, objects: null, container: null };
  const res = { contractor: await one(out, tag + '-ctr', ctr), personal: await one(out, tag + '-mine', eng, 'personal'), team: await one(out, tag + '-team', eng, 'full') };
  note('скачано: ' + JSON.stringify(res));
  return res;
}

/** Ожидание P2-0061: подрядчик — своя фирма; «Только мои» — моё по id; «Вся команда» — всё, что отдал сервер. */
export function pullScopeScenario(out) {
  return async () => {
    const r = await pullScope(out);
    ok(JSON.stringify(r.contractor.meetings) === JSON.stringify(['m-f1']), 's-pull-scope: подрядчик — совещания только своей фирмы (по id)', JSON.stringify(r.contractor));
    ok(JSON.stringify(r.personal.meetings) === JSON.stringify(['m-own']), 's-pull-scope: «Только мои» — совещания по id автора', JSON.stringify(r.personal));
    ok(r.team.meetings.length === 4, 's-pull-scope: «Вся команда» — все совещания, отданные сервером', JSON.stringify(r.team));
  };
}

if (import.meta.url === 'file://' + process.argv[1]) {   // отдельный запуск (сравнение с прежним кодом)
  const out = process.argv[2] || '/tmp/p2-pull-scope';
  console.log(JSON.stringify(await pullScope(out)));
  process.exit(0);
}
