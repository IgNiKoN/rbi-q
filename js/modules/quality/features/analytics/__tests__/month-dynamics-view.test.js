/**
 * Unit (happy-dom): P2-0049 переключатель «Сводка / Динамика за месяц» внутри «Сводки».
 * Обычная Сводка не перерисовывается — только скрывается; выбор вида запоминается.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Window } from 'happy-dom';

const KEYS = ['window', 'document', 'localStorage', 'HTMLElement', 'Node'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function chk(date, final) {
  return {
    date, contractorName: 'Подрядчик А', projectName: 'ЖК 1', inspectorName: 'Орлов', templateKey: 'sys_mono', templateTitle: 'Монолит',
    metrics: { final, baseUrkPerc: final, checkedCount: 10, n_B1_fail: 1, n_B2_fail: 0, n_B3_fail: 0, b3_found: false }
  };
}

describe('«Сводка / Динамика за месяц»', () => {
  let win, view;
  before(async () => {
    win = new Window({ url: 'http://localhost/' });
    for (const k of KEYS) {
      if (k === 'window') globalThis.window = win; else if (win[k]) globalThis[k] = win[k];
    }
    globalThis.document = win.document;
    win.document.body.innerHTML = '<div id="sub-onepager"><div id="onepager-content-container"><p id="summary-mark">Сводка</p></div></div>';
    const now = new Date();
    const checks = [];
    for (let i = 1; i <= 8; i++) checks.push(chk(new Date(now.getFullYear(), now.getMonth(), Math.min(i, now.getDate()), 9).toISOString(), 80 + i));
    win.AnalyticsActions = { getMonthDynamicsSourceData: () => checks };
    view = await import('../month-dynamics.view.js');
  });
  after(() => {
    for (const k of KEYS) delete globalThis[k];
  });

  it('по умолчанию — обычная Сводка, переключатель над ней', async () => {
    view.syncMonthDynamics();
    await wait(60);
    const sec = document.getElementById('sub-onepager');
    assert.equal(sec.firstElementChild.id, 'md-view-switch');
    assert.equal(view.getOnepagerView(), 'summary');
    assert.equal(document.getElementById('onepager-content-container').classList.contains('hidden'), false);
    assert.equal(document.getElementById('md-root').classList.contains('hidden'), true);
  });

  it('«Динамика за месяц»: Сводка скрыта, но не тронута; экран месяца нарисован; выбор запомнен', async () => {
    document.querySelector('[data-md-view="month"]').click();
    await wait(10);
    const summary = document.getElementById('onepager-content-container');
    assert.equal(summary.classList.contains('hidden'), true);
    assert.ok(document.getElementById('summary-mark'), 'Сводка не перерисована');
    const root = document.getElementById('md-root');
    assert.equal(root.classList.contains('hidden'), false);
    assert.match(root.textContent, /8 проверок/);
    assert.match(root.textContent, /Объём выборки/);
    assert.equal(localStorage.getItem('rbi_onepager_view'), 'month');
    assert.equal(document.querySelector('[data-md-view="month"]').getAttribute('aria-pressed'), 'true');
  });

  it('обратно на «Сводку» — экран месяца скрыт, Сводка видна', async () => {
    document.querySelector('[data-md-view="summary"]').click();
    await wait(10);
    assert.equal(document.getElementById('onepager-content-container').classList.contains('hidden'), false);
    assert.equal(document.getElementById('md-root').classList.contains('hidden'), true);
    assert.equal(view.getOnepagerView(), 'summary');
  });
});
