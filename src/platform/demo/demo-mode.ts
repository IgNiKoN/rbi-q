/**
 * P2-0053: кнопка «Демо» — заполненный «ЖК Демо» глазами любой роли, только смотреть (как демо-режим Качества, но на сервере).
 * Экран #/demo: роли на выбор (сервер — pf_demo_roles), вход ролью (pf_demo_enter) → выбранная компания — демо-компания;
 * плашка «Демо · смотрите как: роль · Выйти» и красная рамка, пока выбрана демо-компания; «Выйти из демо» (pf_demo_leave) —
 * назад в свою компанию (её база на устройстве и неотправленные записи не трогаются: база — на пару «компания + пользователь»).
 * Права не решаются здесь: что видно и что нельзя — сервер (057: демо-роли, сторож «Демо — только просмотр»).
 */

export const DEMO_PATH = '#/demo';
export const DEMO_BODY_CLASS = 'p2-demo-on';
export const DEMO_READONLY = 'Демо — только просмотр. Попробуйте это в своей компании';
/** Компания, из которой вошли в демо (вернуться в неё при «Выйти»). Ключ — у каждого вошедшего свой. */
export const DEMO_RETURN_PREFIX = 'platform2_demo_return_';
/** Экран, который открыть после входа в демо (страница перезапускается с базой демо — адрес запоминается до неё). */
export const DEMO_GO_KEY = 'platform2_demo_go';

export interface DemoCompany { id: string; name: string; is_demo?: boolean; roles: string[]; modules: string[] }
export interface DemoStateView { mode: string; email: string | null; companyId: string | null; companies: DemoCompany[]; offline?: boolean }
export interface DemoRole { code: string; title: string; hint: string | null; sort: number; area: string; current: boolean; company_id: string; company_name: string }

/** Выбрана ли сейчас демо-компания (вошёл почтой). */
export function demoCompanyOf(st: DemoStateView | null | undefined): DemoCompany | null {
  if (!st || st.mode !== 'email') return null;
  const cur = st.companies.find((c) => c.id === st.companyId);
  return cur && cur.is_demo ? cur : null;
}

/** Первый экран роли в демо: по работе роли (как приветствие P2-0074 — по разделам). */
export function demoHomeFor(role: string): string {
  // замечания на PDF-планах и приёмки «ЖК Демо» — в Стройконтроле 2.0
  if (role === 'qc_engineer' || role === 'contractor_rep') return '#/construction-v2';
  return '#/planfact';
}

/** Куда вернуться из демо: запомненная компания, если она ещё в списке; иначе первая не-демо с разделами, иначе первая не-демо. */
export function returnCompany(st: DemoStateView, saved: string | null): string | null {
  const own = st.companies.filter((c) => !c.is_demo);
  if (saved && own.some((c) => c.id === saved)) return saved;
  return (own.find((c) => c.modules.length > 0) || own[0] || null)?.id || null;
}

/** Компании для переключателя «Компания: …» — без демо-компании (в неё ведёт кнопка «Демо»), но выбранная остаётся. */
export function withoutDemo<T extends { id: string; is_demo?: boolean }>(list: T[], keepId: string | null): T[] {
  return list.filter((c) => !c.is_demo || c.id === keepId);
}

/** Роль в демо: название текущей демо-роли (сервер отдаёт роли компании: «Прораб — демо»). */
export function demoRoleTitle(c: DemoCompany): string {
  return String(c.roles[0] || '').replace(/\s+—\s+демо$/, '') || 'роль не выбрана';
}

export interface DemoDeps {
  getState(): DemoStateView;
  refresh(): Promise<unknown>;
  setCompany(id: string): void;
  rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  go(path: string): void;
  reload(): void;
  toast(text: string): void;
  online(): boolean;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  userKey(email: string): string;
}

const NEED_NET = 'Демо открывается только с интернетом — подключитесь к сети и попробуйте снова';

function store(d: DemoDeps, k: string, v?: string | null): string | null {
  try {
    if (!d.storage) return null;
    if (v === undefined) return d.storage.getItem(k);
    if (v === null) d.storage.removeItem(k); else d.storage.setItem(k, v);
  } catch { /* приватный режим — без запоминания */ }
  return null;
}

/** Роли на выбор (пусто — демо не готово / нет связи). */
export async function loadDemoRoles(d: DemoDeps): Promise<{ roles: DemoRole[]; error: string | null }> {
  if (!d.online()) return { roles: [], error: NEED_NET };
  const r = await d.rpc('pf_demo_roles');
  if (r.error) return { roles: [], error: /[А-Яа-яЁё]/.test(r.error.message) ? r.error.message : 'Не удалось загрузить демо. Попробуйте позже' };
  const roles = (Array.isArray(r.data) ? r.data : []) as DemoRole[];
  return { roles: roles.slice().sort((a, b) => a.sort - b.sort), error: roles.length ? null : 'Демо пока не готово — загляните позже' };
}

/** Войти в демо ролью (или сменить роль). Первый вход — переключение компании (страница перезапускается с базой демо). */
export async function enterDemo(d: DemoDeps, role: string, after?: { key: string; value: string }): Promise<string | null> {
  if (!d.online()) return NEED_NET;
  const st = d.getState();
  if (st.mode !== 'email' || !st.email) return 'Войдите своей учёткой, чтобы открыть демо';
  const was = demoCompanyOf(st);
  const r = await d.rpc('pf_demo_enter', { p_role: role });
  if (r.error) return /[А-Яа-яЁё]/.test(r.error.message) ? r.error.message : 'Не удалось открыть демо. Попробуйте позже';
  const company = String((r.data as { company_id?: unknown } | null)?.company_id || '');
  if (!was && st.companyId) store(d, DEMO_RETURN_PREFIX + d.userKey(st.email), st.companyId);
  await d.refresh();
  // после refresh: он перерисовывает экран, а это — для страницы после перезапуска
  store(d, DEMO_GO_KEY, demoHomeFor(role));
  if (after) store(d, after.key, after.value);
  d.go(demoHomeFor(role));
  if (was && was.id === company) d.reload();   // смена роли в демо: права и разделы — заново
  else d.setCompany(company);                   // вход: база демо на устройстве (мост Качества перезапустит страницу)
  return null;
}

/** После перезапуска страницы при входе в демо — открыть экран роли (один раз). */
export function takeDemoGo(d: Pick<DemoDeps, 'storage'>): string | null {
  const v = store(d as DemoDeps, DEMO_GO_KEY);
  if (v) store(d as DemoDeps, DEMO_GO_KEY, null);
  return v;
}

/** Выйти из демо: назад в свою компанию. */
export async function leaveDemo(d: DemoDeps): Promise<string | null> {
  if (!d.online()) return 'Чтобы выйти из демо, нужна сеть — подключитесь и нажмите ещё раз';
  const st = d.getState();
  const r = await d.rpc('pf_demo_leave');
  if (r.error) return /[А-Яа-яЁё]/.test(r.error.message) ? r.error.message : 'Не удалось выйти из демо. Попробуйте ещё раз';
  const key = st.email ? DEMO_RETURN_PREFIX + d.userKey(st.email) : '';
  const target = returnCompany(st, key ? store(d, key) : null);
  if (key) store(d, key, null);
  await d.refresh();
  d.go('#/welcome');
  if (target) d.setCompany(target); else d.reload();
  return null;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const svg = (inner: string, size: number): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const EYE = svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 22);
const CHEVRON = svg('<path d="M9 6l6 6-6 6"/>', 20);
const EXIT = svg('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>', 18);

/** Стили экрана #/demo и плашки — токены темы (как приветствие P2-0074); плашка — красная, как «Выйти из демо» Качества.
 *  В демо запись запрещена всем ролям (сторож 057) — кнопки создания Стройконтроля 2.0 («+ Замечание», «Зона» — заявка
 *  на приёмку, «Управление иерархией») скрыты, чтобы запись не копилась «не отправлено» (ТД 406). */
export const DEMO_CSS = `
body.${DEMO_BODY_CLASS}::after{content:'';position:fixed;inset:0;pointer-events:none;border:3px solid rgba(220,38,38,.35);z-index:9998}
.p2-demo-chip{position:fixed;z-index:9999;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 84px);display:flex;align-items:center;gap:4px;
  max-width:calc(100vw - 24px);padding:4px;border-radius:999px;background:#dc2626;color:#fff;box-shadow:0 6px 18px rgba(220,38,38,.35);font:600 13px/1.2 inherit;font-family:inherit}
.p2-demo-chip button{display:inline-flex;align-items:center;gap:6px;min-height:36px;border:0;border-radius:999px;padding:0 12px;font:inherit;cursor:pointer;white-space:nowrap}
.p2-demo-chip .p2-demo-role{background:transparent;color:#fff;min-width:0;overflow:hidden;text-overflow:ellipsis}
.p2-demo-chip .p2-demo-role b{font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:11px}
.p2-demo-chip .p2-demo-role span{overflow:hidden;text-overflow:ellipsis}
.p2-demo-chip .p2-demo-exit{background:#fff;color:#b91c1c;font-weight:700;flex:none}
.p2-demo-chip button:focus-visible{outline:2px solid #fff;outline-offset:2px}
@media (min-width:1280px){.p2-demo-chip{bottom:auto;top:12px;left:auto;right:16px;transform:none}}
body.p2-demo-page .p2-demo-chip{display:none}
body.${DEMO_BODY_CLASS} [data-c2-add-mode],body.${DEMO_BODY_CLASS} [data-c2-apt-add-mode],body.${DEMO_BODY_CLASS} [data-c2-zone-mode],
body.${DEMO_BODY_CLASS} [onclick^="window.ConstAdmin.openModal"]{display:none!important}
.p2d-roles .p2w-tile.p2d-cur{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent) inset}
.p2d-area{font-size:12px;color:var(--text-muted);margin-top:2px;overflow-wrap:anywhere}
.p2d-note{font-size:14px;line-height:1.45;color:var(--text-muted);margin:16px 0 0;padding:12px 14px;border-radius:12px;background:var(--sel-bg)}
.p2d-msg{font-size:15px;line-height:1.5;padding:16px;border-radius:14px;border:1px solid var(--card-border);background:var(--card-bg)}
.p2d-sec{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin:28px 0 10px}
.p2d-busy{opacity:.6;pointer-events:none}`;

export interface DemoScreenOptions {
  roles: DemoRole[];
  error: string | null;
  inDemo: boolean;
  /** дополнительный блок под ролями (обучение — этап 5) */
  extra?: string;
  choose: (role: string) => void;
  leave: () => void;
  back: () => void;
}

/** Экран #/demo: заголовок, что внутри «ЖК Демо», роли плитками (как приветствие), «Выйти из демо». */
export function renderDemoScreen(host: HTMLElement, o: DemoScreenOptions): void {
  const tiles = o.roles.map((r) =>
    `<button type="button" class="p2w-tile${r.current ? ' p2d-cur' : ''}" data-testid="p2-demo-role" data-role="${esc(r.code)}"${r.current ? ' aria-current="true"' : ''}>` +
    `<span class="p2w-ico">${EYE}</span>` +
    `<span class="p2w-txt"><span class="p2w-t">${esc(r.title)}${r.current ? ' · сейчас' : ''}</span>` +
    (r.hint ? `<span class="p2w-d">${esc(r.hint)}</span>` : '') + `<span class="p2d-area">Видит: ${esc(r.area)}</span></span>` +
    `<span class="p2w-go">${CHEVRON}</span></button>`).join('');
  const name = o.roles[0] ? o.roles[0].company_name : 'Девелопмент Демо';
  host.innerHTML = `<section class="p2w p2d" data-testid="p2-demo">` +
    `<div class="p2w-eyebrow">Демо · ${esc(name)} · только просмотр</div>` +
    `<h1 class="p2w-h">${o.inDemo ? 'Смотреть «ЖК Демо» другой ролью' : 'Посмотрите «ЖК Демо» глазами любой роли'}</h1>` +
    `<p class="p2w-p">Заполненный объект: три корпуса на разных стадиях — Корпус 1 старт, Корпус 2 в разгаре, Корпус 3 сдача. ` +
    `ВОР, смета и КП, факт прорабов, КС-2, проверки качества, замечания на PDF-планах этажей и приёмки.</p>` +
    (o.error ? `<div class="p2d-msg" data-testid="p2-demo-error">${esc(o.error)}</div>`
      : `<div class="p2w-grid p2d-roles">${tiles}</div>`) +
    `<p class="p2d-note">Демо — только просмотр: внести факт или выдать замечание здесь нельзя. Попробовать руками — в своей компании.</p>` +
    (o.extra || '') +
    `<div class="p2w-foot">` +
    (o.inDemo ? `<button type="button" class="p2w-link" data-testid="p2-demo-leave" data-act="leave">${EXIT}Выйти из демо</button>`
      : `<button type="button" class="p2w-link" data-act="back">${EXIT}Назад</button>`) +
    `</div></section>`;
  host.querySelectorAll<HTMLElement>('[data-role]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    host.querySelector('.p2d')?.classList.add('p2d-busy');
    o.choose(b.dataset.role || '');
  }));
  host.querySelector('[data-act=leave]')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); host.querySelector('.p2d')?.classList.add('p2d-busy'); o.leave(); });
  host.querySelector('[data-act=back]')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); o.back(); });
}

/** Плашка «Демо · Прораб · Выйти» (одна на страницу); null — убрать. */
export function syncDemoChip(doc: Document, c: { role: string } | null, act: { pick: () => void; leave: () => void }): void {
  let el = doc.getElementById('p2-demo-chip');
  doc.body.classList.toggle(DEMO_BODY_CLASS, !!c);
  if (!c) { if (el) el.remove(); return; }
  if (!el) {
    el = doc.createElement('div');
    el.id = 'p2-demo-chip';
    el.className = 'p2-demo-chip';
    el.setAttribute('role', 'status');
    el.innerHTML = `<button type="button" class="p2-demo-role" data-testid="p2-demo-chip-role" title="Сменить роль"><b>Демо</b><span></span></button>` +
      `<button type="button" class="p2-demo-exit" data-testid="p2-demo-chip-exit">Выйти</button>`;
    el.querySelector('.p2-demo-role')!.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); act.pick(); });
    el.querySelector('.p2-demo-exit')!.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); act.leave(); });
    doc.body.appendChild(el);
  }
  el.querySelector('.p2-demo-role span')!.textContent = c.role + ' ▾';
  el.querySelector('.p2-demo-role')!.setAttribute('title', 'Смотрите как: ' + c.role + ' — нажмите, чтобы сменить роль');
}
