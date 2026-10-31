/**
 * P2-0053: пошаговое обучение Платформы (образец — tutorial.js Качества): шаг = экран (адрес) + элемент на нём + пояснение;
 * подсветка элемента (затемнение вокруг), карточка «Шаг N из M» с «Назад / Далее / Закончить»; на телефоне карточка —
 * снизу экрана. Тексты туров — данные (tours.json), не код. Элемента на экране нет (роль его не видит, экран другой ширины) —
 * шаг пропускается без ошибки. Прогресс — на устройстве (продолжить с того же шага). Обучение ничего не записывает.
 */

export interface TourStep {
  /** экран: адрес роутера оболочки (#/…); нет — тот же экран */
  path?: string;
  /** цель: CSS-селектор; text — среди найденных элемент с этим текстом */
  target?: string;
  text?: string;
  title: string;
  body: string;
  /** «Далее» сначала нажимает на цель (открыть план этажа, вкладку) */
  click?: boolean;
  /** запасные цели на том же экране (другая раскладка: телефон / ПК); «Далее» на запасную цель не нажимает */
  alt?: { target: string; text?: string }[];
}
export interface TourDef { title: string; role: string; summary: string; steps: TourStep[]; final?: { title: string; body: string } }
export type Tours = Record<string, TourDef>;

export const TOUR_PREFIX = 'platform2_tour_';
export const TOUR_PENDING_KEY = 'platform2_tour_pending';

export interface TourProgress { step: number; done: boolean }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;

export function readProgress(s: Store, id: string): TourProgress {
  try {
    const v = JSON.parse((s && s.getItem(TOUR_PREFIX + id)) || 'null') as TourProgress | null;
    return v && typeof v.step === 'number' ? { step: Math.max(0, v.step | 0), done: !!v.done } : { step: 0, done: false };
  } catch { return { step: 0, done: false }; }
}
export function writeProgress(s: Store, id: string, p: TourProgress): void {
  try { if (s) s.setItem(TOUR_PREFIX + id, JSON.stringify(p)); } catch { /* приватный режим — без запоминания */ }
}

/** С какого шага начать: незаконченный тур — с того же шага; пройденный — сначала. */
export function startStep(p: TourProgress, total: number): number {
  return p.done || p.step >= total ? 0 : p.step;
}

export interface TourDeps {
  doc: Document;
  go(path: string): void;
  currentPath(): string;
  storage: Store;
  /** сколько ждать появления цели на экране, мс */
  waitMs?: number;
  /** итог: 'leave' — «Выйти из демо и повторить в своей компании», 'done' — закончить, 'close' — закрыть */
  onEnd(how: 'leave' | 'done' | 'close', stats: { shown: number; skipped: number }): void;
}

/** Цель шага на экране (видимая); null — нет. С текстом — самый маленький элемент с этим текстом (кнопка, а не весь экран). */
export function findTarget(doc: Document, step: TourStep): HTMLElement | null {
  if (!step.target) return null;
  for (const t of [{ target: step.target, text: step.text }, ...(step.alt || [])]) {
    const el = findOne(doc, t.target, t.text);
    if (el) return el;
  }
  return null;
}
function findOne(doc: Document, target: string, text?: string): HTMLElement | null {
  const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();
  let best: HTMLElement | null = null, area = Infinity;
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(target))) {
    if (text && !norm(el.textContent || '').includes(text.toLowerCase())) continue;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) continue;
    if (text && (r.width < 16 || r.height < 16)) continue;   // крошечный (свёрнутый) двойник — не цель
    if (!text) return el;
    if (r.width * r.height < area) { best = el; area = r.width * r.height; }
  }
  return best;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const TOUR_CSS = `
.p2t-hole{position:fixed;z-index:10001;border-radius:12px;box-shadow:0 0 0 9999px rgba(15,23,42,.55);outline:3px solid var(--accent,#c2964b);outline-offset:2px;
  pointer-events:none;transition:all .25s ease}
.p2t-hole.p2t-none{left:50%;top:40%;width:0;height:0;outline:0}
.p2t-card{position:fixed;z-index:10002;box-sizing:border-box;width:min(380px,calc(100vw - 24px));padding:16px;border-radius:16px;background:var(--card-bg,#fff);
  color:var(--text-main,#111);border:1px solid var(--card-border,#ddd);box-shadow:0 12px 32px rgba(0,0,0,.25);font-family:inherit}
.p2t-step{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent-text,#8a6a2f)}
.p2t-title{font-size:17px;font-weight:700;margin:6px 0 6px;line-height:1.25}
.p2t-body{font-size:15px;line-height:1.5;color:var(--text-muted,#555);margin:0 0 14px}
.p2t-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.p2t-row button{min-height:44px;padding:0 14px;border-radius:12px;font:600 15px/1 inherit;font-family:inherit;cursor:pointer;border:1px solid var(--card-border,#ccc);
  background:var(--card-bg,#fff);color:var(--text-main,#111)}
.p2t-row .p2t-next{margin-left:auto;background:var(--accent,#c2964b);border-color:var(--accent,#c2964b);color:#fff}
.p2t-row .p2t-close{border:0;background:none;color:var(--text-muted,#666);padding:0 8px}
.p2t-row button:focus-visible{outline:2px solid var(--accent,#c2964b);outline-offset:2px}
.p2t-card.p2t-wait .p2t-row{opacity:.5;pointer-events:none}.p2t-card.p2t-wait .p2t-title::after{content:' · открываем экран…';font-weight:400;color:var(--text-muted,#666)}
@media (max-width:767px){.p2t-card{left:12px!important;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px)!important;top:auto!important;width:auto}}`;

export interface TourRun { stop(): void; index(): number; next(): Promise<void>; back(): Promise<void> }

/** Запустить тур. Карточка и подсветка — в doc.body; уход с экрана роутером не мешает: шаг сам открывает свой экран. */
export function runTour(id: string, tour: TourDef, d: TourDeps): TourRun {
  const doc = d.doc;
  const steps = tour.steps;
  const total = steps.length + (tour.final ? 1 : 0);
  let i = startStep(readProgress(d.storage, id), total);
  let alive = true;
  let shown = 0, skipped = 0;
  let target: HTMLElement | null = null;
  let cur: TourStep | null = null;
  const hole = doc.createElement('div');
  hole.className = 'p2t-hole';
  hole.setAttribute('data-testid', 'p2-tour-hole');
  const card = doc.createElement('div');
  card.className = 'p2t-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  card.setAttribute('data-testid', 'p2-tour-card');
  doc.body.append(hole, card);
  const win = doc.defaultView;

  function place(): void {
    if (!alive) return;
    // экран перерисовался (элемент заменён новым) — найти цель шага заново
    if (cur && (!target || !target.isConnected) && cur.target) target = findTarget(doc, cur);
    const r = target ? target.getBoundingClientRect() : null;
    hole.classList.toggle('p2t-none', !r);
    if (r) Object.assign(hole.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
    const vw = win ? win.innerWidth : 1024, vh = win ? win.innerHeight : 768;
    if (vw < 768) return;   // телефон — карточка снизу (CSS)
    const cw = Math.min(380, vw - 24), ch = card.offsetHeight || 200;
    let left = r ? Math.min(Math.max(12, r.left), vw - cw - 12) : (vw - cw) / 2;
    let top = r ? (r.bottom + 12 + ch < vh ? r.bottom + 12 : r.top - ch - 12) : vh / 2 - ch / 2;
    if (r && top < 12) { top = Math.min(vh - ch - 12, Math.max(12, r.top)); left = r.right + 12 + cw < vw ? r.right + 12 : Math.max(12, r.left - cw - 12); }
    Object.assign(card.style, { left: left + 'px', top: Math.max(12, top) + 'px' });
  }
  const onMove = (): void => place();
  win?.addEventListener('resize', onMove);
  win?.addEventListener('scroll', onMove, true);

  async function waitTarget(step: TourStep): Promise<HTMLElement | null> {
    const until = Date.now() + (d.waitMs ?? 4000);
    for (;;) {
      const el = findTarget(doc, step);
      if (el || Date.now() > until || !alive) return el;
      await new Promise((res) => setTimeout(res, 150));
    }
  }

  function draw(title: string, body: string, isFinal: boolean): void {
    const n = i + 1;
    card.innerHTML = `<div class="p2t-step">${esc(tour.title)} · шаг ${n} из ${total}</div>` +
      `<div class="p2t-title">${esc(title)}</div><p class="p2t-body">${esc(body)}</p><div class="p2t-row">` +
      (i > 0 ? `<button type="button" class="p2t-back" data-testid="p2-tour-back">Назад</button>` : '') +
      `<button type="button" class="p2t-close" data-testid="p2-tour-close">Закрыть</button>` +
      (isFinal ? `<button type="button" class="p2t-next" data-testid="p2-tour-leave">Выйти из демо и повторить у себя</button>` +
        `<button type="button" class="p2t-done" data-testid="p2-tour-done">Закончить</button>`
        : `<button type="button" class="p2t-next" data-testid="p2-tour-next">${n === total ? 'Закончить' : 'Далее'}</button>`) + `</div>`;
    card.querySelector('[data-testid=p2-tour-back]')?.addEventListener('click', () => void run.back());
    card.querySelector('[data-testid=p2-tour-close]')?.addEventListener('click', () => finish('close'));
    card.querySelector('[data-testid=p2-tour-next]')?.addEventListener('click', () => void run.next());
    card.querySelector('[data-testid=p2-tour-leave]')?.addEventListener('click', () => finish('leave'));
    card.querySelector('[data-testid=p2-tour-done]')?.addEventListener('click', () => finish('done'));
    place();
    (card.querySelector('.p2t-next') as HTMLElement | null)?.focus?.();
  }

  /** Показать шаг i (dir — куда пропускать, если цели нет). */
  async function show(dir: 1 | -1): Promise<void> {
    while (alive) {
      if (i >= steps.length) {
        if (!tour.final) { finish('done'); return; }
        target = null; cur = null;
        writeProgress(d.storage, id, { step: i, done: false });
        draw(tour.final.title, tour.final.body, true);
        return;
      }
      const step = steps[i];
      cur = null;
      if (step.path && d.currentPath() !== step.path) d.go(step.path);
      card.classList.add('p2t-wait');
      const el = step.target ? await waitTarget(step) : null;
      if (!alive) return;
      card.classList.remove('p2t-wait');
      if (step.target && !el) {   // цели нет — шаг пропускается
        skipped++;
        if (dir < 0 && i === 0) dir = 1;
        i += dir;
        if (i < 0) i = 0;
        continue;
      }
      target = el;
      cur = step;
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      shown++;
      writeProgress(d.storage, id, { step: i, done: false });
      draw(step.title, step.body, false);
      setTimeout(place, 350);
      return;
    }
  }

  function finish(how: 'leave' | 'done' | 'close'): void {
    if (!alive) return;
    alive = false;
    writeProgress(d.storage, id, how === 'close' ? { step: i, done: false } : { step: 0, done: true });
    hole.remove(); card.remove();
    win?.removeEventListener('resize', onMove);
    win?.removeEventListener('scroll', onMove, true);
    d.onEnd(how, { shown, skipped });
  }

  const run: TourRun = {
    stop: () => finish('close'),
    index: () => i,
    async next() {
      const step = steps[i];
      if (step && step.click && target && step.target) {
        if (!target.isConnected) target = findTarget(doc, step);
        // запасную цель (другая раскладка) не нажимаем
        if (target && findOne(doc, step.target, step.text) === target) { target.click(); await new Promise((res) => setTimeout(res, 600)); }
      }
      if (i + 1 >= total) { finish('done'); return; }
      i++;
      await show(1);
    },
    async back() {
      if (i === 0) return;
      i--;
      await show(-1);
    }
  };
  void show(1);
  return run;
}
