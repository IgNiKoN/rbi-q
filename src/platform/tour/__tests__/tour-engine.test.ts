/// <reference types="node" />
/** P2-0053: движок обучения — шаги по экранам, подсветка цели, «Назад / Далее / Закончить», шаг без цели пропускается,
 *  прогресс на устройстве (продолжить с того же шага; пройденный — сначала), итог «Выйти из демо»; туры — данные tours.json. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { findTarget, readProgress, runTour, startStep, TOUR_PREFIX, writeProgress } from '../tour-engine.ts';
import type { TourDef } from '../tour-engine.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
const tick = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms));

function page(html: string) {
  const win: any = new Window({ url: 'http://localhost/#/a', width: 1440, height: 900 });
  win.document.body.innerHTML = html;
  // happy-dom не считает раскладку: видимые элементы — с размером
  for (const el of win.document.querySelectorAll('[data-box]')) el.getBoundingClientRect = () => ({ left: 10, top: 10, right: 110, bottom: 60, width: 100, height: 50, x: 10, y: 10 });
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
  return { win, doc: win.document as Document, mem, storage };
}

const TOUR: TourDef = { title: 'Тест', role: 'pto', summary: '', steps: [
  { path: '#/a', target: '#one', title: 'Первый', body: 'раз' },
  { path: '#/b', target: '#missing', title: 'Нет цели', body: 'пропуск' },
  { path: '#/a', target: 'button', text: 'Два', title: 'Второй', body: 'два', click: true },
  { title: 'Без цели', body: 'по центру' }
], final: { title: 'Итог', body: 'у себя' } };

test('цель: видимая, с текстом — самая маленькая', () => {
  const { doc } = page('<div id="one" data-box></div><section data-box><button data-box>Два</button></section><button id="hid">Два</button>');
  assert.equal(findTarget(doc, { target: '#one', title: '', body: '' })!.id, 'one');
  assert.equal(findTarget(doc, { target: '#hid', title: '', body: '' }), null, 'без размера — не видна');
  assert.equal(findTarget(doc, { target: 'button', text: 'два', title: '', body: '' })!.tagName, 'BUTTON');
  assert.equal(findTarget(doc, { title: '', body: '' }), null);
});

test('тур: шаги, пропуск без цели, «Назад», нажатие на цель, итог «Выйти из демо»', async () => {
  const { doc, storage, mem } = page('<div id="one" data-box></div><button data-box id="b2">Два</button>');
  const paths: string[] = [];
  let cur = '#/a';
  let clicked = 0;
  doc.getElementById('b2')!.addEventListener('click', () => clicked++);
  const ends: string[] = [];
  const run = runTour('t1', TOUR, { doc, storage, waitMs: 60, currentPath: () => cur, go: (p) => { paths.push(p); cur = p; }, onEnd: (how, s) => ends.push(how + ' ' + s.shown + '/' + s.skipped) });
  await tick();
  const step = (): string => doc.querySelector('.p2t-step')!.textContent || '';
  assert.match(step(), /шаг 1 из 5/);
  assert.ok(!doc.querySelector('.p2t-hole')!.classList.contains('p2t-none'), 'цель подсвечена');
  assert.equal(doc.querySelector('[data-testid=p2-tour-back]'), null, 'на первом шаге «Назад» нет');
  await run.next();
  assert.match(step(), /шаг 3 из 5/, 'шаг без цели пропущен');
  assert.deepEqual(paths, ['#/b', '#/a']);
  assert.equal(JSON.parse(mem.get(TOUR_PREFIX + 't1')!).step, 2, 'прогресс на устройстве');
  await run.back();
  assert.match(step(), /шаг 1 из 5/, '«Назад» перескакивает шаг без цели');
  await run.next();
  await run.next();
  assert.equal(clicked, 1, '«Далее» нажал на цель шага');
  assert.match(step(), /шаг 4 из 5/);
  assert.ok(doc.querySelector('.p2t-hole')!.classList.contains('p2t-none'), 'шаг без цели — карточка по центру');
  await run.next();
  assert.match(doc.querySelector('.p2t-title')!.textContent || '', /Итог/);
  (doc.querySelector('[data-testid=p2-tour-leave]') as HTMLElement).click();
  assert.equal(doc.querySelector('[data-testid=p2-tour-card]'), null, 'карточка убрана');
  assert.deepEqual(ends, ['leave 5/3'], 'показано 5 (шаг 1 — дважды из-за «Назад»), пропущено 3');
  assert.deepEqual(readProgress(storage, 't1'), { step: 0, done: true });
});

test('прогресс: «Закрыть» — продолжить с того же шага; пройденный — сначала', async () => {
  assert.equal(startStep({ step: 3, done: false }, 5), 3);
  assert.equal(startStep({ step: 3, done: true }, 5), 0);
  assert.equal(startStep({ step: 9, done: false }, 5), 0);
  const { doc, storage } = page('<div id="one" data-box></div><button data-box>Два</button>');
  writeProgress(storage, 't2', { step: 2, done: false });
  const ends: string[] = [];
  runTour('t2', TOUR, { doc, storage, waitMs: 40, currentPath: () => '#/a', go: () => {}, onEnd: (h) => ends.push(h) });
  await tick();
  assert.match(doc.querySelector('.p2t-step')!.textContent || '', /шаг 3 из 5/);
  (doc.querySelector('[data-testid=p2-tour-close]') as HTMLElement).click();
  assert.deepEqual(ends, ['close']);
  assert.deepEqual(readProgress(storage, 't2'), { step: 2, done: false });
  assert.deepEqual(readProgress(storage, 'нет'), { step: 0, done: false });
});

test('туры — данные: План/Факт 8–12 шагов, Качество и Стройконтроль 4–6, роль из демо-ролей, у каждого итог «у себя»', () => {
  const tours = JSON.parse(readFileSync(new URL('../tours.json', import.meta.url), 'utf8')) as Record<string, TourDef>;
  const demo = JSON.parse(readFileSync(new URL('../../../../scripts/demo/data/demo.json', import.meta.url), 'utf8')) as { demo_roles: { code: string }[] };
  const count = (id: string): number => tours[id].steps.length + (tours[id].final ? 1 : 0);
  assert.ok(count('planfact') >= 8 && count('planfact') <= 12, 'План/Факт: ' + count('planfact'));
  for (const id of ['quality', 'construction']) assert.ok(count(id) >= 4 && count(id) <= 6, id + ': ' + count(id));
  for (const [id, t] of Object.entries(tours)) {
    assert.ok(demo.demo_roles.some((r) => r.code === t.role), id + ': роль тура есть среди демо-ролей');
    assert.ok(t.final && /своей компании|у себя|Выйдите|выйдите/i.test(t.final.body + t.final.title), id + ': итог — повторить в своей компании');
    for (const s of t.steps) assert.ok(s.title && s.body && (!s.path || s.path.startsWith('#/')), id + ': шаг ' + s.title);
  }
});
