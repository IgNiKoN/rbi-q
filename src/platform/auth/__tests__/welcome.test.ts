// P2-0074: экран приветствия — плитки только доступных разделов (подписи из манифестов), анимация по признаку, плитка → раздел.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { renderWelcome, welcomeTiles, COMPANY_HOME, HELP_PATH } from '../welcome-screen.ts';
import { ModulesManifest } from '../../../../js/modules/modules.manifest.js';

test('P2-0074: плитки — только доступные разделы, в порядке меню, подписи из манифестов', () => {
  const ids = (a: Record<string, boolean>) => welcomeTiles(a, ModulesManifest).map((t) => t.id);
  assert.deepEqual(ids({ quality: true }), ['quality'], 'только Качество');
  assert.deepEqual(ids({ construction: true, quality: true }), ['quality', 'construction'], 'Качество и Стройконтроль');
  assert.deepEqual(ids({ planfact: true, quality: true, construction: true, company: true, platformAdmin: true }), ['quality', 'construction', 'planfact', 'company']);
  assert.deepEqual(ids({ planfact: true }), ['planfact'], 'у компании только План/Факт — Качества нигде нет');
  assert.deepEqual(ids({ quality: false, knowledge: true, 'construction-v2': true }), [], 'выключенный и служебные разделы — не плитки');
  const all = welcomeTiles({ quality: true, construction: true, planfact: true, company: true }, ModulesManifest);
  assert.deepEqual(all.map((t) => t.path), ['#/quality/audit', '#/construction/defects', '#/planfact', COMPANY_HOME]);
  for (const t of all) {
    const m = ModulesManifest.find((x) => x.id === t.id)!;
    assert.equal(t.title, m.title); assert.equal(t.summary, m.summary, t.id + ': строка «что тут делают» — из манифеста');
    assert.ok(t.summary.length > 10 && t.summary.length < 80, t.id + ': одна строка');
  }
  assert.deepEqual(welcomeTiles({ quality: true }, [{ id: 'quality', title: 'Качество' }]), [], 'нет строки в манифесте — нет плитки');
});

test('P2-0074: экран — имя, компания и роль, анимация по признаку, плитка и ссылки ведут через open', () => {
  const win = new Window();
  const host = win.document.createElement('div') as unknown as HTMLElement;
  const opened: string[] = [];
  const tiles = welcomeTiles({ quality: true, construction: true }, ModulesManifest);
  renderWelcome(host, { name: 'Иванов <Иван>', company: 'Тест-Строй', role: 'Инженер', tiles, animate: true, open: (p) => opened.push(p) });
  const sec = host.querySelector('[data-testid=p2-welcome]')!;
  assert.equal(sec.getAttribute('data-animate'), '1');
  assert.ok(sec.classList.contains('p2w-anim'));
  assert.match(host.querySelector('h1')!.textContent || '', /^Добро пожаловать, Иванов <Иван>$/, 'имя как текст, не разметка');
  assert.equal(host.querySelector('.p2w-eyebrow')!.textContent, 'Тест-Строй · Инженер');
  const btns = host.querySelectorAll('[data-testid=p2-welcome-tile]');
  assert.equal(btns.length, 2);
  (btns[1] as unknown as HTMLElement).click();
  (host.querySelector('[data-testid=p2-welcome-help]') as HTMLElement).click();
  (host.querySelector('[data-testid=p2-welcome-settings]') as HTMLElement).click();
  assert.deepEqual(opened, ['#/construction/defects', HELP_PATH, '#/settings']);

  renderWelcome(host, { name: 'a@b.ru', company: null, role: null, tiles: tiles.slice(0, 1), animate: false, open: () => {} });
  assert.equal(host.querySelector('[data-testid=p2-welcome]')!.getAttribute('data-animate'), '0', 'повтор — без анимации');
  assert.ok(!host.querySelector('.p2w-anim') && !host.querySelector('[style*=animation]'));
  assert.equal(host.querySelector('.p2w-eyebrow'), null, 'без компании — без подписи');
  assert.ok(host.querySelector('.p2w-grid.p2w-one'), 'одна плитка — не растягивается на две колонки');
});
