/// <reference types="node" />
/** P2-0021 этап 2: красные точки меню из pf_my_inbox — обёртка модуля js/modules/planfact/index.js, сразу после входа и без загрузки
 *  бандла: «Факт» = ждёт подтверждения + мои отклонённые, «КС-2» = черновики, «Входящие» и пункт модуля = сумма; «не выставлено» и
 *  «стоят» в точки не идут. Перечитываются: вход / выход / смена компании, заход в модуль, своё действие модуля, возврат на вкладку;
 *  нет входа почтой или модуль не положен — точек нет; ошибка сервера — прежние числа. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { rowTasks, withInboxRefresh, INBOX_CHANGED_EVENT } from '../inbox/inbox.ts';
import type { InboxRow } from '../summary/summary.service.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const row = (o: Partial<InboxRow>): InboxRow => ({ project_id: 'p', name: 'ЖК', code: null, pending: null, my_rejected: null, my_rejected_from: null, ks2_drafts: null,
  ks2_gap: null, ks2_gap_money: null, stale: null, stale_days: null, ...o });
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

let seq = 0;
async function wrapper(opts: { mode?: string; allowed?: boolean; rows?: InboxRow[] | string; rpc?: boolean } = {}): Promise<N> {
  const win: N = new Window({ url: 'http://localhost/#/settings' });
  const g = globalThis as N;
  g.window = win; g.document = win.document; g.location = win.location;
  const st = { mode: opts.mode ?? 'email', allowed: opts.allowed ?? true, rows: opts.rows ?? [] as InboxRow[] | string };
  const badges: (Record<string, number> | null)[] = []; const calls: string[] = [];
  win.AppRouter = { addRoute: () => {} };
  win.RBI = {
    platform2: { getState: () => ({ mode: st.mode }),
      ...(opts.rpc === false ? {} : { rpc: async (fn: string) => { calls.push(fn); return typeof st.rows === 'string' ? { data: null, error: { message: st.rows } } : { data: st.rows.map((r) => ({ ...r })), error: null }; } }) },
    services: { shell: { isPlatformModuleAllowed: () => st.allowed, platformEntryMode: () => st.mode,
      setNavBadges: (scope: string, map: Record<string, number> | null) => { if (scope === 'planfact') badges.push(map); } } }
  };
  const url = new URL('../../../../js/modules/planfact/index.js', import.meta.url).href + '?t=' + (++seq);
  const mod: N = await import(url);
  mod.init({});
  await settle();
  return { win, mod, st, badges, calls, last: () => badges[badges.length - 1] };
}

test('правило точек: только «дела», сумма по объектам; null и 0 не считаются', async () => {
  const { mod } = await wrapper();
  const rows = [row({ project_id: 'a', pending: 8, my_rejected: 2, ks2_drafts: 1, ks2_gap: 12, stale: 30, stale_days: 14 }),
    row({ project_id: 'b', pending: 0, my_rejected: null, ks2_drafts: 3, ks2_gap: 5 })];
  assert.deepEqual(mod.inboxBadges(rows), { '#/planfact/fact': 10, '#/planfact/ks2': 4, '#/planfact/inbox': 14, 'module:planfact': 14 });
  assert.deepEqual(mod.inboxBadges([]), { '#/planfact/fact': 0, '#/planfact/ks2': 0, '#/planfact/inbox': 0, 'module:planfact': 0 });
  assert.equal(rowTasks(rows[0]), 11, 'страница считает «дела» объекта по тому же правилу');
});

test('сразу после входа (без открытия модуля): точки из pf_my_inbox; бандл не загружен', async () => {
  const w = await wrapper({ rows: [row({ pending: 2, my_rejected: 1, ks2_drafts: 1, ks2_gap: 40, stale: 9 })] });
  assert.deepEqual(w.last(), { '#/planfact/fact': 3, '#/planfact/ks2': 1, '#/planfact/inbox': 4, 'module:planfact': 4 });
  assert.deepEqual(w.calls, ['pf_my_inbox']);
  assert.equal(w.mod.isMounted(), false, 'модуль (бандл) не загружался');
});

test('перечитать: своё действие модуля, заход в модуль, возврат на вкладку, вход / смена компании', async () => {
  const w = await wrapper({ rows: [row({ pending: 2 })] });
  w.st.rows = [row({ pending: 1 })];
  w.win.dispatchEvent(new w.win.Event(INBOX_CHANGED_EVENT)); await settle();
  assert.equal(w.last()['#/planfact/fact'], 1, 'после решения РП — меньше');
  w.win.dispatchEvent(new w.win.Event('planfact:route')); await settle();
  w.win.document.dispatchEvent(new w.win.Event('visibilitychange')); await settle();
  w.win.dispatchEvent(new w.win.Event('rbi:platform-access')); await settle();
  assert.equal(w.calls.length, 5);
});

test('выход / модуль не положен / демо — точек нет и запроса нет; ошибка сервера — прежние числа', async () => {
  const w = await wrapper({ rows: [row({ pending: 5 })] });
  assert.equal(w.last()['module:planfact'], 5);
  const k = w.badges.length;
  w.st.rows = 'Нет связи';
  w.win.dispatchEvent(new w.win.Event(INBOX_CHANGED_EVENT)); await settle();
  assert.equal(w.badges.length, k, 'ошибка сервера — числа не трогаем');
  w.st.mode = 'none';
  w.win.dispatchEvent(new w.win.Event('rbi:platform-access')); await settle();
  assert.equal(w.last(), null, 'выход — точки убраны');
  for (const o of [{ allowed: false }, { mode: 'demo' }, { rpc: false }]) {
    const x = await wrapper({ ...o, rows: [row({ pending: 5 })] });
    assert.equal(x.last(), null, JSON.stringify(o));
    assert.equal(x.calls.length, 0, JSON.stringify(o));
  }
});

test('withInboxRefresh: сигнал «изменилось» только после успешного действия из списка', async () => {
  const win: N = new Window({ url: 'http://localhost/' });
  (globalThis as N).window = win;
  let n = 0; win.addEventListener(INBOX_CHANGED_EVENT, () => { n++; });
  (globalThis as N).Event = win.Event;
  const api = withInboxRefresh({ async decide(ok: boolean) { return ok ? { ok: true } : { ok: false, message: 'нет' }; }, async read() { return { ok: true }; } }, ['decide'])!;
  await api.decide(true); await api.decide(false); await api.read();
  assert.equal(n, 1);
  assert.equal(withInboxRefresh(null, []), null);
});
