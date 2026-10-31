/**
 * P2-0077 (ТД 413): автоплан задач Качества на устройстве админа.
 * Журнал iPhone владельца 31.10.2026: после каждого прохода синхронизации «отправлено 84», затем «85» —
 * пересчёт плана на всех инженеров сдвигал сроки их задач («Приёмка эталона» — на «сейчас») и помечал их к отправке.
 * Теперь: автоматический пересчёт — только свой план; срок существующей задачи не двигается;
 * к отправке — только реально изменённое. План «на всех» — только по кнопке «Синхронизировать».
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../../modules/quality/features/tasks/tasks.module.js', import.meta.url), 'utf8')
  .replace(/^import .*$/m, 'var meetingRichToPlain = function (x) { return x; }; var meetingRichToSafeHtml = meetingRichToPlain;')
  .replace(/^export const /m, 'const ');
const gameSrc = readFileSync(new URL('../../services/game.service.js', import.meta.url), 'utf8');

const ADMIN = 'Админ А.А.';
const ENG = 'Иванов И.И.';

function load() {
  const me = { name: ENG, admin: false };
  const store = new Map();
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const inspections = [];
  // у Иванова — 3 пары «подрядчик × вид работ» без акта-эталона, по 2 проверки (новый подрядчик → «Инспекция» 7 шт.)
  ['Альфа', 'Бета', 'Гамма'].forEach((c, i) => {
    for (let k = 0; k < 2; k++) {
      inspections.push({
        id: `chk-${i}-${k}`, inspectorName: ENG, contractorName: c, templateKey: `usr_t${i}`, templateTitle: `Работа ${i}`,
        projectName: 'Объект 1', date: daysAgo(20 + k), metrics: { checkedCount: 5 }, state: {}
      });
    }
  });
  const window = {
    syncConfig: { projectCode: 'rbi' },
    RBI: {
      services: {
        settings: { get: () => '' },
        appMode: { isDemo: () => false },
        inspections: { getAllSync: () => inspections },
        knowledge: { getEtalonActsSync: () => [], getTwiCardsSync: () => [] },
        templates: { getUserTemplates: () => ({}), getSystemTemplates: () => ({}), getByKey: () => null },
        storage: { stores: () => ({ TASKS: 'rbi_tasks' }), put: async (_s, t) => { store.set(t.id, t); } },
        permissions: {
          getCurrentRole: () => (me.admin ? 'manager' : 'engineer'),
          canViewWeeklyPlan: () => true,
          getCurrentEngineerName: () => me.name,
          isAdmin: () => me.admin
        },
        shell: { getModalsRoot: () => null }
      }
    },
    localStorage: { setItem() {}, getItem() { return null; } },
    rbi_fmeaRecords: []
  };
  const ctx = vm.createContext({
    window, console: { log() {}, warn() {}, error: console.error }, localStorage: window.localStorage,
    document: { getElementById: () => null },
    getContractorMetrics: () => ({ finalC: 90, n_изделий_с_B3: 0 }), getFlatList: () => [],
    showToast() {}, setTimeout
  });
  vm.runInContext(gameSrc, ctx);
  vm.runInContext(src, ctx);
  const tasks = () => window.rbi_tasksData.filter((t) => !t._deleted && !t.is_deleted);
  const toSend = () => tasks().filter((t) => (t.syncStatus || t.sync_status) !== 'synced');
  const markSynced = () => tasks().forEach((t) => { t.syncStatus = 'synced'; t.sync_status = 'synced'; });
  const tick = () => new Promise((r) => setTimeout(r, 5));
  return { window, me, tasks, toSend, markSynced, tick };
}

describe('P2-0077: автоплан админа не переписывает и не шлёт задачи инженеров', () => {
  let h;
  let engTasksFromServer;
  beforeEach(async () => {
    h = load();
    // устройство Иванова составило его план, задачи ушли на сервер и пришли на устройство админа
    await h.window.gameGenerateWeeklyPlan(false);
    h.markSynced();
    engTasksFromServer = JSON.parse(JSON.stringify(h.tasks()));
    assert.ok(engTasksFromServer.some((t) => t.taskType === 'Эталон'), 'у инженера есть «Приёмка эталона»');
    h.me.name = ADMIN;
    h.me.admin = true;
    await h.tick();
  });

  it('два прохода после синхронизации: во втором 0 к отправке, задачи инженера не тронуты', async () => {
    await h.window.gameForceUpdatePlan(true);   // как sync-engine после прохода
    const engAfter1 = h.tasks().filter((t) => t.engineerName === ENG);
    assert.equal(engAfter1.filter((t) => t.syncStatus !== 'synced').length, 0, 'проход 1: задачи инженера к отправке не помечены');
    h.markSynced();
    await h.tick();
    await h.window.gameForceUpdatePlan(true);
    assert.equal(h.toSend().length, 0, 'проход 2: к отправке 0');
    const engAfter2 = h.tasks().filter((t) => t.engineerName === ENG);
    assert.equal(engAfter2.length, engTasksFromServer.length, 'чужих задач не прибавилось');
    for (const was of engTasksFromServer) {
      const now = engAfter2.find((t) => t.id === was.id);
      assert.ok(now, `задача ${was.title} на месте с тем же id`);
      assert.equal(now.date, was.date, `срок «${was.title}» не сдвинут`);
      assert.equal(now.target, was.target, `цель «${was.title}» прежняя`);
      assert.equal(now.status, was.status, `статус «${was.title}» прежний`);
    }
  });

  it('смена недели и пересчёт с force (открытие базы / смена компании) — тоже только свой план', async () => {
    h.window.weeklyPlanData = { weekId: '2000-W1', tasks: [], completed: false };
    await h.window.gameGenerateWeeklyPlan(true);
    assert.equal(h.tasks().filter((t) => t.engineerName === ENG && t.syncStatus !== 'synced').length, 0);
  });

  it('кнопка «Синхронизировать» у админа: план на всех создаёт недостающее, существующее чужое не меняет', async () => {
    // одной задачи инженера на устройстве админа нет — кнопка её досоздаст
    const missing = h.window.rbi_tasksData.find((t) => t.engineerName === ENG && t.taskType === 'Аудит');
    h.window.rbi_tasksData = h.window.rbi_tasksData.filter((t) => t !== missing);
    await h.window.gameForceUpdatePlan(false, { allEngineers: true });
    const sent = h.toSend();
    assert.ok(sent.some((t) => t.id === missing.id), 'недостающая задача инженера создана и уходит');
    const engExisting = sent.filter((t) => t.engineerName === ENG && t.id !== missing.id);
    assert.equal(JSON.stringify(engExisting.map((t) => t.title)), '[]', 'существующие задачи инженера не уходят');
    h.markSynced();
    await h.tick();
    await h.window.gameForceUpdatePlan(false, { allEngineers: true });
    assert.equal(h.toSend().length, 0, 'повторное нажатие — 0 к отправке');
  });

  it('свои задачи: новая и закрытая — к отправке, как раньше', async () => {
    h.me.name = ENG;
    h.me.admin = false;
    const mine = h.tasks().find((t) => t.taskType === 'Эталон');
    // закрытие своей задачи (окно деталей в тесте не нарисовано — его закрытие падает уже после отметки)
    await h.window.rbi_markTaskDone(mine.id, true).catch(() => {});
    assert.equal(mine.status, 'done');
    assert.equal(mine.syncStatus, 'pending', 'закрытая своя задача уходит');
    // новая своя задача: появилась новая пара «подрядчик × вид работ»
    h.window.RBI.services.inspections.getAllSync().push({
      id: 'chk-new', inspectorName: ENG, contractorName: 'Дельта', templateKey: 'usr_t9', templateTitle: 'Работа 9',
      projectName: 'Объект 1', date: new Date().toISOString(), metrics: { checkedCount: 5 }, state: {}
    });
    await h.window.gameForceUpdatePlan(true);
    assert.ok(h.toSend().some((t) => t.contractor === 'Дельта'), 'новая своя задача уходит');
  });
});
