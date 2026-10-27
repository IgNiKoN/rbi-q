/**
 * P2-0051: тема «Стандартная» — список тем, «Авто», перенос со старой темы по умолчанию, ранняя установка,
 * полнота токенов и правил компонентов в css/style.css, порядок выбора в Настройках.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = readFileSync(join(ROOT, 'js/shared/theme.utils.js'), 'utf8');

function store(init = {}) {
    const m = new Map(Object.entries(init));
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
function load({ ls = store(), dark = false } = {}) {
    const classes = new Set();
    const attrs = {};
    const documentElement = {
        setAttribute: (k, v) => { attrs[k] = v; },
        getAttribute: (k) => attrs[k],
        classList: { add: (c) => classes.add(c), remove: (...c) => c.forEach((x) => classes.delete(x)), contains: (c) => classes.has(c) }
    };
    const win = { localStorage: ls, matchMedia: () => ({ matches: dark }), document: { documentElement } };
    vm.runInNewContext(SRC, { window: win, globalThis: win });
    return { T: win.RBI_THEME, attrs, classes, ls };
}

describe('RBI_THEME: список и «Авто»', () => {
    it('Стандартная — первой, по умолчанию std-auto; прежние темы на месте', () => {
        const { T } = load();
        assert.deepEqual([...T.ALLOWED.slice(0, 3)], ['std-auto', 'std-light', 'std-dark']);
        for (const t of ['auto', 'light', 'dark', 'rbi-auto', 'rbi-light', 'rbi-dark', 'rbi-auto-v2', 'rbi-light-v2', 'rbi-dark-v2', 'rbi-auto-v3', 'rbi-light-v3', 'rbi-dark-v3']) {
            assert.ok(T.isAllowed(t), t);
        }
        assert.equal(T.DEFAULT_THEME, 'std-auto');
        assert.equal(T.normalize('мусор'), 'std-auto');
    });
    it('std-auto следует настройке устройства; std-dark — тёмная', () => {
        const { T } = load();
        assert.equal(T.resolve('std-auto', false), 'std-light');
        assert.equal(T.resolve('std-auto', true), 'std-dark');
        assert.equal(T.resolve('rbi-auto-v3', true), 'rbi-dark-v3');
        assert.ok(T.isDark('std-dark'));
        assert.ok(!T.isDark('std-light'));
    });
});

describe('RBI_THEME: перенос со старой темы по умолчанию', () => {
    it('rbi-auto-v3, не менял сам → std-auto; явный выбор другой темы — свой', () => {
        const { T } = load();
        assert.equal(T.migrate('rbi-auto-v3', 0), 'std-auto');
        assert.equal(T.migrate('rbi-dark-v3', 0), 'rbi-dark-v3');
        assert.equal(T.migrate('dark', 123), 'dark');
    });
    it('после переноса выбор «RBI · Авто» сохраняется; облачная старая — снова переносится', () => {
        const ls = store({ rbi_theme_std_migrated_at: '1000' });
        const { T } = load({ ls });
        assert.equal(T.migrate('rbi-auto-v3', 2000), 'rbi-auto-v3', 'выбрал после переноса');
        assert.equal(T.migrate('rbi-auto-v3', 500), 'std-auto', 'снимок настроек старше переноса');
    });
    it('отметка ставится один раз', () => {
        const ls = store();
        const { T } = load({ ls });
        T.markMigrated();
        const first = ls.getItem('rbi_theme_std_migrated_at');
        assert.ok(Number(first) > 0);
        ls.setItem('rbi_theme_std_migrated_at', '42');
        T.markMigrated();
        assert.equal(ls.getItem('rbi_theme_std_migrated_at'), '42');
    });
});

describe('RBI_THEME: ранняя установка до загрузки настроек', () => {
    it('новый пользователь → Стандартная (тёмная на тёмном устройстве), класс dark', () => {
        const { attrs, classes } = load({ dark: true });
        assert.equal(attrs['data-theme'], 'std-dark');
        assert.ok(classes.has('dark'));
    });
    it('сохранена старая по умолчанию, переноса не было → std-light', () => {
        const { attrs, classes } = load({ ls: store({ rbi_theme_preference: 'rbi-auto-v3' }) });
        assert.equal(attrs['data-theme'], 'std-light');
        assert.ok(classes.has('light'));
    });
    it('явный выбор сохраняется: rbi-dark-v2; rbi-auto-v3 после переноса', () => {
        assert.equal(load({ ls: store({ rbi_theme_preference: 'rbi-dark-v2' }) }).attrs['data-theme'], 'rbi-dark-v2');
        const ls = store({ rbi_theme_preference: 'rbi-auto-v3', rbi_theme_std_migrated_at: '1' });
        assert.equal(load({ ls }).attrs['data-theme'], 'rbi-light-v3');
    });
});

describe('css/style.css: «Стандартная» получает все правила v3 и полный набор токенов', () => {
    const css = readFileSync(join(ROOT, 'css/style.css'), 'utf8');
    const block = (sel) => {
        const i = css.indexOf(sel + ' {');
        assert.ok(i >= 0, sel);
        return css.slice(i, css.indexOf('}', i));
    };
    const props = (b) => new Set([...b.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    it('каждый токен тем v3 задан и в std-light / std-dark', () => {
        for (const [v3, std] of [['rbi-light-v3', 'std-light'], ['rbi-dark-v3', 'std-dark']]) {
            const need = props(block(`html[data-theme="${v3}"]`));
            const have = props(block(`html[data-theme="${std}"]`));
            for (const p of need) assert.ok(have.has(p), `${std}: нет ${p}`);
            for (const p of ['--card-bg-2', '--sel-bg', '--accent-text', '--btn-primary-text', '--color-violet', '--ok-text', '--warn-text', '--bad-text']) {
                assert.ok(have.has(p), `${std}: нет ${p}`);
            }
        }
    });
    it('палитра карточки §2', () => {
        const l = block('html[data-theme="std-light"]');
        const d = block('html[data-theme="std-dark"]');
        for (const v of ['--bg-main: #f7f4ee', '--card-bg: #ffffff', '--card-bg-2: #fbf9f5', '--text-main: #172330', '--color-green: #5f7f6d', '--color-yellow: #b8844a', '--color-red: #9f4c45', '--color-blue: #4c7288', '--color-violet: #7a6aa0']) {
            assert.ok(l.includes(v), `светлая ${v}`);
        }
        for (const v of ['--bg-main: #101923', '--card-bg: #172330', '--card-bg-2: #1c2b39', '--text-main: #f7f4ee', '--text-muted: #a8b2bd', '--color-green: #7a9a88', '--color-yellow: #d9b45a', '--color-red: #c46b63', '--color-blue: #7a9bb0', '--color-violet: #a493c4']) {
            assert.ok(d.includes(v), `тёмная ${v}`);
        }
    });
    it('у каждого правила компонентов v3 есть пара std-*', () => {
        const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
        const rules = [...noComments.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
        let checked = 0;
        for (const sel of rules) {
            if (!sel.includes('rbi-dark-v3') && !sel.includes('rbi-light-v3')) continue;
            const s = sel;
            if (/^html\[data-theme="rbi-(light|dark)-v3"\]$/.test(s)) continue; // блоки токенов
            if (sel.includes('rbi-dark-v3')) assert.ok(sel.includes('std-dark'), `нет std-dark: ${s.slice(-120)}`);
            if (sel.includes('rbi-light-v3')) assert.ok(sel.includes('std-light'), `нет std-light: ${s.slice(-120)}`);
            checked++;
        }
        assert.ok(checked > 60, `проверено правил: ${checked}`);
    });
});

describe('Настройки: выбор темы', () => {
    it('«Стандартная · Авто / Светлая / Тёмная» первыми, прежние — в группе «Прежние темы»', () => {
        const src = readFileSync(join(ROOT, 'js/modules/settings/settings.render.js'), 'utf8');
        const sel = src.slice(src.indexOf('<select id="set-theme"'), src.indexOf('</select>', src.indexOf('<select id="set-theme"')));
        const values = [...sel.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual(values.slice(0, 3), ['std-auto', 'std-light', 'std-dark']);
        assert.equal(values.length, 15);
        assert.ok(sel.indexOf('Прежние темы') > sel.indexOf('std-dark'));
    });
});
