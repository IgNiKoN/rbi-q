/**
 * Системные чек-листы Качества: у каждого пункта RU есть перевод en / sr-Latn / ka, разделы совпадают по числу, id уникальны.
 * Каталоги интерфейса locales/*.json — одинаковый набор ключей.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (f) => readFileSync(new URL('../../../data/' + f, import.meta.url), 'utf8');

function load() {
  const window = { formatNorms: (x) => x };
  window.window = window;
  const ctx = vm.createContext({ window, console });
  vm.runInContext(read('system_templates.js'), ctx);
  vm.runInContext(read('system_templates.en.js'), ctx);
  vm.runInContext(read('system_templates.sr-Latn.js'), ctx);
  vm.runInContext(read('system_templates.ka.js'), ctx);
  return window;
}

const { SYSTEM_TEMPLATES: T, SYSTEM_TEMPLATES_LOCALE_EN: EN, SYSTEM_TEMPLATES_LOCALE_SR_LATN: SR, SYSTEM_TEMPLATES_LOCALE_KA: KA } = load();

describe('system templates', () => {
  it('id пунктов уникальны во всех чек-листах, у пунктов есть n, t, вес 1–3', () => {
    const seen = new Map();
    for (const [key, tpl] of Object.entries(T)) {
      for (const g of tpl.groups) {
        for (const item of g.items) {
          assert.ok(!seen.has(item.id), `id ${item.id} повторяется: ${seen.get(item.id)} и ${key}`);
          seen.set(item.id, key);
          assert.ok(item.n && item.t, `пустой пункт ${item.id}`);
          assert.ok([1, 2, 3].includes(item.w), `вес ${item.id}`);
        }
      }
    }
  });

  for (const [name, ov] of [['en', EN], ['sr-Latn', SR], ['ka', KA]]) {
    it(`${name}: перевод есть для каждого чек-листа, раздела и пункта`, () => {
      for (const [key, tpl] of Object.entries(T)) {
        const t = ov.templates[key];
        assert.ok(t && t.title, `${name}: нет перевода чек-листа ${key}`);
        assert.equal(t.groups.length, tpl.groups.length, `${name}: число разделов ${key}`);
        for (const g of tpl.groups) {
          for (const item of g.items) {
            const o = ov.items[item.id];
            assert.ok(o && o.n && o.t, `${name}: нет перевода пункта ${item.id} (${key})`);
          }
        }
      }
    });
  }

  it('locales: ru / en / sr-Latn / ka — одинаковый набор ключей', () => {
    const cat = (f) => JSON.parse(readFileSync(new URL('../../../locales/' + f, import.meta.url), 'utf8'));
    const ru = Object.keys(cat('ru.json')).sort();
    for (const f of ['en.json', 'sr-Latn.json', 'ka.json']) {
      const c = cat(f);
      assert.deepEqual(Object.keys(c).sort(), ru, f + ': набор ключей отличается от ru.json');
    }
  });
});
