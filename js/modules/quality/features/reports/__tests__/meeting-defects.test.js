/**
 * Unit (happy-dom): P2-0049 — в отчёте для совещаний невыполненный пункт веса 1 (B1) не попадает
 * в список дефектов как B2; счётчики B1 / B2 / B3 прежние.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Window } from 'happy-dom';

const KEYS = ['window', 'document', 'localStorage', 'HTMLElement', 'Node', 'navigator'];

describe('collectMeetingDefectStats: B1 не выдаётся за B2', () => {
  let collect;
  before(async () => {
    const win = new Window({ url: 'http://localhost/' });
    for (const k of KEYS) {
      if (k === 'window') globalThis.window = win; else if (win[k] && !(k in globalThis && k === 'navigator')) globalThis[k] = win[k];
    }
    globalThis.document = win.document;
    const items = [{ id: 'p1', n: 'Мелкий', w: 1 }, { id: 'p2', n: 'Значительный', w: 2 }, { id: 'p3', n: 'Критичный', w: 3 }];
    win.RBI = { services: { templates: { getUserTemplates: () => ({}), getSystemTemplates: () => ({ mono: { groups: [{ items }] } }) } } };
    globalThis.getFlatList = (g) => (g || []).flatMap((x) => x.items || []);
    win.getFlatList = globalThis.getFlatList;
    win.normalizeItemPhotos = (v) => (Array.isArray(v) ? v : v ? [v] : []);
    ({ collectMeetingDefectStats: collect } = await import('../reports.actions.js'));
  });
  after(() => {
    for (const k of KEYS) { try { delete globalThis[k]; } catch (_) { /* ignore */ } }
    delete globalThis.getFlatList;
  });

  it('B1 нет в списке дефектов, B2 и B3 — с верным классом; счётчики прежние', () => {
    const check = {
      date: '2026-09-10', contractorName: 'А', templateKey: 'sys_mono',
      state: { p1: 'fail', p2: 'fail', p3: 'fail' },
      metrics: { n_B1_fail: 1, n_B2_fail: 1, n_B3_fail: 1 }
    };
    const r = collect([check, Object.assign({}, check, { date: '2026-09-11' })], 'А');
    const names = r.defects.map((d) => d.name).sort();
    assert.deepEqual(names, ['Значительный', 'Критичный']);
    assert.equal(r.defects.find((d) => d.name === 'Значительный').kind, 'B2');
    assert.equal(r.defects.find((d) => d.name === 'Критичный').kind, 'B3');
    assert.equal(r.b1, 2);
    assert.equal(r.b2, 2);
    assert.equal(r.b3, 2);
  });
});
