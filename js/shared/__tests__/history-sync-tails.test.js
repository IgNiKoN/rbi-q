/**
 * P2-0025 доработка 1: «История» после замены истории синхронизацией —
 * объект раскрывается с первого нажатия; «Выбрать все» отмечает все проверки списка.
 * Настоящий history.render.js в happy-dom.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const today = new Date().toISOString().slice(0, 10);
const rec = (id, project, contractor) => ({
  id, date: today, timestamp: Date.now(), projectName: project, contractorName: contractor,
  templateTitle: 'Армирование', inspectorName: 'И', location: 'Секция 1', state: {}
});

describe('«История» после синхронизации (доработка 1)', () => {
  let win, HistoryState, HistoryRender;
  before(async () => {
    win = new Window({ url: 'http://localhost/' });
    for (const k of ['window', 'document', 'localStorage', 'CustomEvent', 'HTMLElement', 'Node', 'IntersectionObserver']) {
      if (k === 'window') globalThis.window = win; else if (win[k]) globalThis[k] = win[k];
    }
    globalThis.document = win.document;
    win.document.body.innerHTML = '<div id="hist-empty-msg"></div><div id="history-list"></div>';
    ({ HistoryState } = await import('../../modules/quality/features/history/history.state.js'));
    ({ HistoryRender } = await import('../../modules/quality/features/history/history.render.js'));
    globalThis.toggleAllHistory = undefined;
  });
  after(() => {
    for (const k of ['window', 'document', 'localStorage', 'CustomEvent', 'HTMLElement', 'Node', 'IntersectionObserver']) delete globalThis[k];
  });

  const list = () => document.getElementById('history-list');
  const header = (p) => list().querySelector(`[data-hist-project="${p}"]`).firstElementChild;
  const bodyOf = (p) => list().querySelector(`[data-hist-project="${p}"] [data-hist-project-body]`);

  // happy-dom не выполняет встроенные onclick — выполнить текст обработчика из разметки как браузер
  const tap = (el) => new Function(el.getAttribute('onclick')).call(el);

  function showFromMemory(arr) {
    win.contractorArray = arr;
    HistoryState.setRecordsFromMemory(arr);
    HistoryRender.render();
  }

  it('синхронизация заменила историю → одно нажатие на объект → объект раскрыт', () => {
    showFromMemory([rec('a1', 'Объект А', 'П1'), rec('b1', 'Объект Б', 'П2')]);
    assert.equal(bodyOf('Объект А').classList.contains('is-open'), false);
    win.contractorArray = [rec('a1', 'Объект А', 'П1'), rec('a2', 'Объект А', 'П3'), rec('b1', 'Объект Б', 'П2')];

    tap(header('Объект А'));

    const body = bodyOf('Объект А');
    assert.equal(body.classList.contains('is-open'), true, 'раскрыт с первого нажатия');
    assert.equal(body.hasAttribute('data-hist-lazy'), false, 'тело дорисовано');
    assert.equal(body.querySelectorAll('.hist-checkbox').length, 2, 'в теле — актуальная история (2 проверки)');
    tap(header('Объект А'));
    assert.equal(bodyOf('Объект А').classList.contains('is-open'), false, 'второе нажатие сворачивает');
  });

  it('«Выбрать все» после синхронизации отмечает все проверки (число = числу записей)', () => {
    showFromMemory([rec('a1', 'Объект А', 'П1'), rec('b1', 'Объект Б', 'П2')]);
    const fresh = [
      rec('a1', 'Объект А', 'П1'), rec('a2', 'Объект А', 'П3'),
      rec('b1', 'Объект Б', 'П2'), rec('c1', 'Объект В', 'П4'), rec('c2', 'Объект В', 'П4')
    ];
    win.contractorArray = fresh;

    win.rbiHistMaterializeAllProjects();
    const boxes = list().querySelectorAll('.hist-checkbox');
    assert.equal(boxes.length, fresh.length);
    assert.equal(list().querySelectorAll('[data-hist-lazy="1"]').length, 0, 'ленивых объектов не осталось');
  });
});

describe('P2-0026: отмеченные проверки без повторов', () => {
  it('галочка той же проверки в таблице ПК и в скрытом телефонном списке — id один раз', async () => {
    const { Window: W } = await import('happy-dom');
    const w = new W({ url: 'http://localhost/' });
    const prev = { window: globalThis.window, document: globalThis.document };
    globalThis.window = w; globalThis.document = w.document;
    try {
      w.document.body.innerHTML = '<div id="history-list"><input type="checkbox" class="hist-checkbox" value="a" checked>'
        + '<input type="checkbox" class="hist-checkbox" value="b" checked></div>'
        + '<div id="ana-desk-hist-checks"><input type="checkbox" class="hist-checkbox" value="a" checked>'
        + '<input type="checkbox" class="hist-checkbox" value="b" checked><input type="checkbox" class="hist-checkbox" value="c"></div>';
      const { HistoryActions } = await import('../../modules/quality/features/history/history.actions.js');
      assert.deepEqual(HistoryActions.getSelectedHistoryIds(), ['a', 'b']);
    } finally {
      globalThis.window = prev.window; globalThis.document = prev.document;
    }
  });
});
