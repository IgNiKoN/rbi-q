/**
 * P2-0074: экран приветствия (#/welcome) — оболочка платформы, не модуль. «Добро пожаловать, <имя>», компания и роль,
 * плитки только доступных разделов (модуль компании × «Доступ к модулю» роли — решает сервер, здесь PlatformAccess),
 * строка «что тут делают» — из манифеста модуля. Нажатие на плитку — первый экран раздела (роутер запоминает его последним).
 * Анимация — только CSS, около 1 с, один раз (первый вход учётки на устройстве); «Уменьшить движение» — без неё.
 * Макет, одобренный владельцем 30.10.2026, — ai-dev/reports/P2-0074/mockup/compare.html.
 */
import { MODULE_HOME } from './platform.service.ts';
import type { PlatformAccess } from './platform.service.ts';

export const COMPANY_HOME = '#/settings/company';
export const HELP_PATH = '#/settings/my/help';
/** Класс на body, пока открыт экран: оболочка прячет подвкладки модуля (nav2, нижний таббар) и шапку Качества. */
export const WELCOME_BODY_CLASS = 'p2-welcome-on';

export interface WelcomeTile { id: string; title: string; summary: string; path: string }
export interface WelcomeManifest { id: string; title?: unknown; summary?: unknown }

const ORDER = ['quality', 'construction', 'planfact', 'company'];

/** Плитки — доступные разделы в порядке меню; раздел без строки в манифесте не показывается. */
export function welcomeTiles(a: PlatformAccess, manifests: WelcomeManifest[]): WelcomeTile[] {
  const out: WelcomeTile[] = [];
  for (const id of ORDER) {
    if (a[id] !== true) continue;
    const m = manifests.find((x) => x.id === id);
    if (!m || typeof m.title !== 'string' || typeof m.summary !== 'string' || !m.summary) continue;
    out.push({ id, title: m.title, summary: m.summary, path: id === 'company' ? COMPANY_HOME : MODULE_HOME[id] });
  }
  return out;
}

// Значки — те же, что у разделов в боковом меню оболочки (js/core/app-shell.js), «Компания» — здание.
const ICONS: Record<string, string> = {
  quality: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>',
  construction: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>',
  planfact: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  company: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-5h6v5"/><path d="M9 10h.01M12 10h.01M15 10h.01"/>'
};
const svg = (inner: string, size: number): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const CHEVRON = svg('<path d="M9 6l6 6-6 6"/>', 20);
const BOOK = svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>', 18);
const GEAR = svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 18);

/** Стили экрана — токены темы «Стандартная» (css/style.css); подвкладки модуля и шапка Качества на этом экране не показываются.
 *  ПК ≥1280: второй столбец меню (nav2) сжат до нуля, но остаётся в разметке — оболочка оставляет верхнюю полосу (app-shell.desktop.js). */
export const WELCOME_CSS = `
body.${WELCOME_BODY_CLASS} #main-bottom-nav,body.${WELCOME_BODY_CLASS} #header-dashboard,body.${WELCOME_BODY_CLASS} #header-data-block,
body.${WELCOME_BODY_CLASS} #header-checklist-container,body.${WELCOME_BODY_CLASS} #construction-warning-banner{display:none!important}
body.${WELCOME_BODY_CLASS} .app-sidebar-item.active:not(:hover){color:var(--text-muted);background:transparent}
@media (min-width:1280px){body.${WELCOME_BODY_CLASS}{--desk-nav2:0px;--desk-chrome:var(--desk-rail)}body.${WELCOME_BODY_CLASS} #app-nav2{visibility:hidden;overflow:hidden}}
.p2w{box-sizing:border-box;width:100%;max-width:880px;margin:0 auto;padding:20px 16px 40px;color:var(--text-main)}
.p2w *{box-sizing:border-box}
.p2w-eyebrow{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-text);display:flex;align-items:center;gap:10px;min-width:0}
.p2w-eyebrow::before{content:'';flex:none;width:28px;height:2px;border-radius:2px;background:var(--accent);transform-origin:left}
.p2w-h{font-size:26px;line-height:1.15;font-weight:700;margin:12px 0 8px;letter-spacing:-.01em;text-wrap:balance;overflow-wrap:anywhere}
.p2w-p{font-size:15px;line-height:1.5;color:var(--text-muted);margin:0 0 20px;max-width:60ch}
.p2w-grid{display:grid;gap:10px;grid-template-columns:minmax(0,1fr)}
.p2w-tile{display:flex;align-items:center;gap:14px;text-align:left;width:100%;min-height:76px;padding:14px;border-radius:16px;border:1px solid var(--card-border);
  background:var(--card-bg);box-shadow:var(--shadow-1);color:inherit;cursor:pointer;font:inherit;transition:border-color .15s,transform .15s,box-shadow .15s}
.p2w-tile:hover{border-color:var(--accent);transform:translateY(-1px);box-shadow:var(--shadow-2)}
.p2w-tile:focus-visible,.p2w-link:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.p2w-ico{flex:none;width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--sel-bg);color:var(--accent-text)}
.p2w-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.p2w-t{font-size:16px;font-weight:700}
.p2w-d{font-size:14px;line-height:1.4;color:var(--text-muted)}
.p2w-go{flex:none;color:var(--text-muted);display:flex}
.p2w-foot{margin-top:22px;padding-top:16px;border-top:1px solid var(--card-border);display:flex;flex-wrap:wrap;gap:0 24px}
.p2w-link{display:inline-flex;align-items:center;gap:8px;min-height:44px;font-size:15px;font-weight:600;color:var(--accent-text);text-decoration:none;background:none;border:0;padding:0;cursor:pointer;font-family:inherit}
@media (min-width:768px){.p2w{padding:64px 32px}.p2w-h{font-size:34px}.p2w-p{font-size:16px;margin-bottom:32px}
  .p2w-grid{gap:14px;grid-template-columns:repeat(2,minmax(0,1fr))}.p2w-grid.p2w-one{grid-template-columns:minmax(0,420px)}
  .p2w-tile{min-height:96px;padding:20px}.p2w-ico{width:52px;height:52px}.p2w-ico svg{width:26px;height:26px}.p2w-t{font-size:17px}
  .p2w-foot{margin-top:32px;padding-top:20px;gap:10px 24px}}
.p2w-anim .p2w-eyebrow,.p2w-anim .p2w-h,.p2w-anim .p2w-p,.p2w-anim .p2w-tile,.p2w-anim .p2w-foot{opacity:0;animation:p2w-in .5s cubic-bezier(.2,.7,.2,1) forwards}
.p2w-anim .p2w-eyebrow::before{transform:scaleX(0);animation:p2w-line .5s .1s ease-out forwards}
.p2w-anim .p2w-h{animation-delay:.08s}.p2w-anim .p2w-p{animation-delay:.18s}.p2w-anim .p2w-foot{animation-delay:.75s}
@keyframes p2w-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes p2w-line{to{transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.p2w-anim *,.p2w-anim .p2w-eyebrow::before{animation:none!important;opacity:1!important;transform:none!important}}`;

export interface WelcomeOptions {
  name: string;
  company: string | null;
  role: string | null;
  tiles: WelcomeTile[];
  animate: boolean;
  /** переход роутером оболочки (история, «последний раздел») */
  open: (path: string) => void;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function renderWelcome(host: HTMLElement, o: WelcomeOptions): void {
  const eyebrow = [o.company, o.role].filter(Boolean).join(' · ');
  const tiles = o.tiles.map((t, i) =>
    `<button type="button" class="p2w-tile" data-testid="p2-welcome-tile" data-module="${esc(t.id)}" data-path="${esc(t.path)}"` +
    (o.animate ? ` style="animation-delay:${(0.28 + i * 0.09).toFixed(2)}s"` : '') + `>` +
    `<span class="p2w-ico">${svg(ICONS[t.id] || '', 22)}</span>` +
    `<span class="p2w-txt"><span class="p2w-t">${esc(t.title)}</span><span class="p2w-d">${esc(t.summary)}</span></span>` +
    `<span class="p2w-go">${CHEVRON}</span></button>`).join('');
  host.innerHTML = `<section class="p2w${o.animate ? ' p2w-anim' : ''}" data-testid="p2-welcome" data-animate="${o.animate ? '1' : '0'}">` +
    (eyebrow ? `<div class="p2w-eyebrow">${esc(eyebrow)}</div>` : '') +
    `<h1 class="p2w-h">Добро пожаловать, ${esc(o.name)}</h1>` +
    `<p class="p2w-p">Здесь ваши разделы. Откройте нужный — в следующий раз приложение сразу откроет тот, где вы были.</p>` +
    `<div class="p2w-grid${o.tiles.length === 1 ? ' p2w-one' : ''}">${tiles}</div>` +
    `<div class="p2w-foot"><button type="button" class="p2w-link" data-testid="p2-welcome-help" data-path="${HELP_PATH}">${BOOK}Как тут всё устроено — обучение</button>` +
    `<button type="button" class="p2w-link" data-testid="p2-welcome-settings" data-path="#/settings">${GEAR}Настройки</button></div></section>`;
  // data-path без делегирования роутера оболочки (он ловит [data-path] на body): переход один, здесь
  host.querySelectorAll<HTMLElement>('[data-path]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    o.open(b.dataset.path || '');
  }));
}
