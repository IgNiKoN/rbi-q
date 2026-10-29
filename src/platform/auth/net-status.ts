/**
 * P2-0058 (З4, З6): связь и неотправленное — значок в шапке, плашка при запуске без связи, строка в «Данные на устройстве».
 * Без связи значок «Нет связи · не отправлено: N» стоит на месте облачка синхронизации (оно рисует «всё отправлено» и без
 * сети); со связью, пока что-то ждёт отправки, — «не отправлено: N». Нажатие — «Настройки → Данные на устройстве».
 * N — записи работы текущей базы Качества / СК по правилу движка (isUnsentLocal); сама отправка — движок синхронизации.
 * Макет утверждён владельцем 28.10.2026 (reports/P2-0058/stage3/mockups/compare.html).
 */
import { countUnsent, listPending } from './offline-rescue.ts';
import { statusHtml, toItems, SYNC_CSS, SYNC_STYLE_ID } from './sync-status.ts';
import type { IsUnsent } from './offline-rescue.ts';

export const NET_STATUS_EVENT = 'rbi:net-status';
export const DEVICE_PATH = '#/settings/my/device';
const STYLE_ID = 'p2-net-style';
const BANNER_MS = 6000;

export const NET_CSS = `
.p2-offline #desk-sync-status,.p2-offline #header-sync-status{display:none!important}
.p2-net{display:inline-flex;align-items:center;gap:6px;margin-left:6px;height:26px;padding:0 10px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap;cursor:pointer;
  color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 14%,transparent);border:1px solid color-mix(in srgb,var(--warning,#b8844a) 35%,transparent)}
.p2-net:focus-visible{outline:2px solid var(--warning,#b8844a);outline-offset:2px}
.p2-net svg{flex:none}.p2-net b{font-weight:800}.p2-net__sep{opacity:.5}
.p2-net--row{margin-left:auto;height:32px;padding:0 12px}
.p2-net--rail{margin:8px auto;height:32px;padding:0 10px;justify-content:center}
.p2-banner{position:fixed;left:50%;transform:translateX(-50%);z-index:900;display:flex;align-items:center;gap:10px;max-width:min(560px,calc(100vw - 32px));width:max-content;
  padding:10px 12px 10px 14px;border-radius:14px;font-size:13.5px;font-weight:600;color:var(--text-main);background:var(--card-bg);
  border:1px solid color-mix(in srgb,var(--warning,#b8844a) 45%,transparent);box-shadow:0 8px 24px rgba(0,0,0,.14)}
.p2-banner svg{color:var(--warning,#b8844a);flex:none}
.p2-banner button{border:0;background:none;color:var(--text-muted);font-size:18px;line-height:1;width:36px;height:36px;cursor:pointer;flex:none}
.p2-need__ico{width:56px;height:56px;border-radius:16px;display:flex;align-items:center;justify-content:center;flex:none;color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 14%,transparent)}
.p2-need{max-width:520px;margin:24px auto;padding:28px 24px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;background:var(--card-bg);color:var(--text-main);border:1px solid var(--card-border);border-radius:20px}
.p2-need h2{margin:0;font-size:19px;font-weight:700}.p2-need p{margin:0;font-size:14px;line-height:1.45;color:var(--text-muted);max-width:420px}
.p2-need__btns{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:6px;width:100%}
.p2-nbtn{min-height:44px;padding:0 18px;border-radius:12px;font-size:14px;font-weight:600;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);cursor:pointer}
.p2-nbtn--primary{border:0;background:var(--accent,var(--primary));color:#fff}
@media (max-width:767px){.p2-need{margin:16px;padding:24px 16px}.p2-need__btns .p2-nbtn{flex:1 1 100%}}
.p2-dev-unsent{display:flex;gap:12px;align-items:center;padding:14px 16px;border-radius:16px;background:var(--card-bg);color:var(--text-main);border:1px solid color-mix(in srgb,var(--warning,#b8844a) 45%,transparent)}
.p2-dev-unsent .p2-need__ico{width:44px;height:44px;border-radius:12px}
.p2-dev-unsent b{display:block;font-size:15px}.p2-dev-unsent span{font-size:13px;color:var(--text-muted)}`;

export const ICON_OFF = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 2l20 20"/><path d="M5.8 10.1A5 5 0 0 0 7 18h10.5"/><path d="M20.9 16.6A4 4 0 0 0 19 10a5 5 0 0 0-7.6-4.3"/></svg>';
const ICON_UP = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 13v8"/><path d="M8 17l4-4 4 4"/><path d="M20 16.6A4 4 0 0 0 18 9h-1.3A7 7 0 1 0 4 15.3"/></svg>';

export function ensureNetCss(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = STYLE_ID; s.textContent = NET_CSS;
  doc.head.appendChild(s);
}

export interface NetStatus { offline: boolean; unsent: number }

/** Текст значка: без связи — «Нет связи · не отправлено: N»; со связью — только когда есть неотправленное. Телефон — число. */
export function chipView(s: NetStatus, phone: boolean): { show: boolean; label: string; html: string } {
  const label = (s.offline ? 'Нет связи, ' : '') + 'не отправлено: ' + s.unsent;
  if (!s.offline && s.unsent <= 0) return { show: false, label, html: '' };
  const icon = s.offline ? ICON_OFF : ICON_UP;
  if (phone) return { show: true, label, html: icon + '<b>' + s.unsent + '</b>' };
  return { show: true, label, html: icon + (s.offline ? '<span>Нет связи</span><span class="p2-net__sep">·</span>' : '') + '<span>не отправлено: <b>' + s.unsent + '</b></span>' };
}

/** Строка «Данные на устройстве»: пусто, когда связь есть и всё отправлено. */
export function deviceLine(s: NetStatus): { title: string; text: string } | null {
  if (!s.offline && s.unsent <= 0) return null;
  return {
    title: (s.offline ? 'Нет связи · ' : '') + 'не отправлено: ' + s.unsent,
    text: s.offline ? 'Записи сохранены на этом телефоне и уйдут на сервер сами, когда появится связь.'
      : 'Записи уйдут на сервер при ближайшей синхронизации.'
  };
}

/** «Нужен интернет» без React — для точек входа разделов, когда их код ещё не скачан на устройство (не открывали с сетью). */
export function renderNeedInternetDom(el: HTMLElement, section: string, o: { quality: boolean; go: (p: string) => void }): void {
  const doc = el.ownerDocument;
  ensureNetCss(doc);
  const box = doc.createElement('div');
  box.className = 'p2-need'; box.setAttribute('role', 'status'); box.setAttribute('data-testid', 'p2-need-internet');
  box.innerHTML = '<div class="p2-need__ico">' + ICON_OFF.replace(/15/g, '26') + '</div><h2>Нужен интернет</h2><p></p><div class="p2-need__btns"></div>';
  (box.querySelector('p') as HTMLElement).textContent = 'Раздел ' + section + ' работает только онлайн. Данные Качества и Стройконтроля доступны без связи — осмотры сохраняются на телефоне и отправятся сами.';
  const btns = box.querySelector('.p2-need__btns') as HTMLElement;
  const btn = (text: string, primary: boolean, onClick: () => void): void => {
    const b = doc.createElement('button');
    b.type = 'button'; b.className = 'p2-nbtn' + (primary ? ' p2-nbtn--primary' : ''); b.textContent = text;
    b.addEventListener('click', onClick);
    btns.appendChild(b);
  };
  if (o.quality) btn('Открыть Качество', true, () => o.go('#/quality'));
  btn('Повторить', !o.quality, () => window.dispatchEvent(new Event('platform2:refresh')));
  el.replaceChildren(box);
}

interface Deps {
  /** Платформа: вход почтой и «сервер не ответил». */
  platform: () => { mode: string; offline?: boolean };
  navigate: (path: string) => void;
}

type JournalEvent = Record<string, unknown> & { t: string };
type W = Window & { RBI?: Record<string, unknown>; RBI_DB_NAME?: string; RbiSyncMergePolicy?: { isUnsentLocal?: IsUnsent };
  // P2-0059: сеть, журнал синхронизации и действия (js/services/sync/*, История)
  RbiSyncNet?: { lastProbe: string | null; lastProbeAt: number };
  RbiSyncJournal?: { list: () => JournalEvent[]; lastOkAt: () => string; report: (meta: Record<string, unknown>) => string };
  RbiSyncJournalPolicy?: { eventLine: (e: JournalEvent) => string; eventTone: (e: JournalEvent) => string };
  triggerSync?: (mode: string) => unknown;
  HistoryActions?: { resolveSyncAttention?: (id: string) => unknown };
  APP_VERSION?: string; SW_VERSION?: string };

/** Время события журнала: «14:05», вчера и раньше — «27.10 14:05». */
function shortTime(iso: string, now: number): string {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const d = new Date(t); const p = (n: number): string => String(n).padStart(2, '0');
  const sameDay = new Date(now).toDateString() === d.toDateString();
  return (sameDay ? '' : p(d.getDate()) + '.' + p(d.getMonth() + 1) + ' ') + p(d.getHours()) + ':' + p(d.getMinutes());
}

let started = false;
/** Запустить значок, плашку и строку «Данные на устройстве» (один раз на страницу). */
export function startNetStatus(deps: Deps): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const win = window as W;
  const doc = document;
  ensureNetCss(doc);
  let st: NetStatus = { offline: false, unsent: 0 };
  let lastScan = 0;
  let bannerShown = false;

  const isOffline = (): boolean => { const p = deps.platform(); return p.mode === 'email' && (!!p.offline || navigator.onLine === false); };
  const goDevice = (): void => deps.navigate(DEVICE_PATH);

  function placeChip(): void {
    const v = chipView(st, window.innerWidth < 768);
    doc.body.classList.toggle('p2-offline', st.offline);
    let chip = doc.querySelector('.p2-net') as HTMLElement | null;
    if (!v.show) { if (chip) chip.remove(); return; }
    const visible = (e: Element | null): e is HTMLElement => !!e && (e as HTMLElement).getClientRects().length > 0;
    const syncs = [doc.getElementById('desk-sync-status'), doc.getElementById('header-sync-status')];
    // облачко скрыто классом p2-offline — место определяем по его строке (родителю)
    const sync = syncs.find((e) => e && visible(e.parentElement)) || null;
    const wrap = doc.querySelector('.mobile-module-menu-wrap');
    const row = !sync && wrap && visible(wrap) ? wrap.parentElement : null;
    // планшет: у раздела нет шапки — значок внизу полосы модулей (компактный, как на телефоне)
    const rail = !sync && !row ? doc.getElementById('app-sidebar') : null;
    const host = row || (rail && visible(rail) ? rail : null);
    const compact = window.innerWidth < 768 || !!rail;
    const view = compact !== (window.innerWidth < 768) ? chipView(st, true) : v;
    if (!chip) {
      chip = doc.createElement('span');
      chip.className = 'p2-net';
      chip.setAttribute('role', 'button');
      chip.tabIndex = 0;
      chip.dataset.testid = 'p2-net';
      chip.setAttribute('data-testid', 'p2-net');
      chip.addEventListener('click', goDevice);
      chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goDevice(); } });
    }
    if (host && chip.parentElement !== host) {
      chip.classList.toggle('p2-net--row', host === row); chip.classList.toggle('p2-net--rail', host !== row);
      host.appendChild(chip);
    } else if (!host && sync && chip.previousElementSibling !== sync) {
      chip.classList.remove('p2-net--row', 'p2-net--rail'); sync.insertAdjacentElement('afterend', chip);
    }
    if (chip.innerHTML !== view.html) chip.innerHTML = view.html;
    chip.setAttribute('aria-label', v.label);
    chip.title = v.label;
  }

  // P2-0059 (С8, С9): «Данные на устройстве» — карточка «Отправка» (что не ушло и почему) и «Журнал синхронизации» (sync-status.ts)
  let devBusy = false;
  let devWired = false;
  async function fillDevice(): Promise<void> {
    const slot = doc.getElementById('p2-net-status-slot');
    if (!slot || devBusy) return;
    if (deps.platform().mode !== 'email') { slot.replaceChildren(); return; }
    if (!String(location.hash || '').startsWith(DEVICE_PATH)) return;
    devBusy = true;
    try {
      if (!doc.getElementById(SYNC_STYLE_ID)) {
        const css = doc.createElement('style'); css.id = SYNC_STYLE_ID; css.textContent = SYNC_CSS; doc.head.appendChild(css);
      }
      const isUnsent = win.RbiSyncMergePolicy?.isUnsentLocal;
      const db = win.RBI_DB_NAME || '';
      const rows = isUnsent && db && typeof indexedDB !== 'undefined' ? await listPending(indexedDB, db, isUnsent).catch(() => []) : [];
      const now = Date.now();
      const ls = (k: string): string => { try { return window.localStorage.getItem(k) || ''; } catch { return ''; } };
      const net = win.RbiSyncNet;
      const probeFresh = !!net && !!net.lastProbeAt && now - net.lastProbeAt < 120000;
      const ctx = { offline: st.offline || (probeFresh && net!.lastProbe === 'offline'), now, retryAfter: Number(ls('rbi_sync_retry_after')) || 0, retryKind: ls('rbi_sync_retry_kind') };
      const J = win.RbiSyncJournal; const JP = win.RbiSyncJournalPolicy;
      const events = J ? J.list() : [];
      const journal = JP ? events.slice(-20).reverse().map((e) => ({ t: shortTime(e.t, now), text: JP.eventLine(e), tone: JP.eventTone(e) })) : [];
      const items = toItems(rows, ctx);
      // счётчик в шапке — то же число, что в карточке (раньше обновлялся раз в 15 с)
      const unsentNow = items.filter((i) => !i.rejected).length;
      if (unsentNow !== st.unsent) { st = { ...st, unsent: unsentNow }; placeChip(); }
      const html = statusHtml({ ...ctx, items, lastOkAt: J ? J.lastOkAt() : '', probe: net?.lastProbe ?? null, probeAt: net?.lastProbeAt || 0,
        journal, journalTotal: events.length }, !!slot.querySelector('details[open]'));
      if (slot.dataset.p2 !== html) { slot.dataset.p2 = html; slot.innerHTML = html; }
      if (!devWired) { devWired = true; slot.addEventListener('click', onDeviceClick); }
    } finally {
      devBusy = false;
    }
  }
  function onDeviceClick(e: Event): void {
    const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'sync' && typeof win.triggerSync === 'function') void win.triggerSync('manual');
    if (act === 'drop' && b.dataset.id && win.HistoryActions?.resolveSyncAttention) void Promise.resolve(win.HistoryActions.resolveSyncAttention(b.dataset.id)).then(() => fillDevice());
    if (act === 'copy') void copyReport(b);
  }
  async function copyReport(btn: HTMLElement): Promise<void> {
    const J = win.RbiSyncJournal;
    if (!J) return;
    const text = J.report({ now: new Date().toISOString(), version: win.APP_VERSION || win.SW_VERSION || '', ua: navigator.userAgent, onLine: navigator.onLine,
      unsent: st.unsent, lastOk: J.lastOkAt() || '' });
    let done = false;
    try { await navigator.clipboard.writeText(text); done = true; } catch { done = false; }
    if (!done) {
      const ta = doc.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      doc.body.appendChild(ta); ta.select();
      try { done = doc.execCommand('copy'); } catch { done = false; }
      ta.remove();
    }
    const label = btn.textContent;
    btn.textContent = done ? 'Отчёт скопирован' : 'Не удалось скопировать';
    setTimeout(() => { btn.textContent = label; }, 2500);
  }

  function banner(): void {
    if (bannerShown || !st.offline) return;
    bannerShown = true;
    const b = doc.createElement('div');
    b.className = 'p2-banner'; b.setAttribute('role', 'status'); b.setAttribute('data-testid', 'p2-net-banner');
    const hdr = doc.getElementById('app-desk-topbar') || doc.getElementById('main-header');
    const bottom = hdr && hdr.getClientRects().length ? hdr.getBoundingClientRect().bottom : 0;
    b.style.top = 'calc(' + Math.max(Math.round(bottom), 56) + 'px + 8px)';
    b.innerHTML = ICON_OFF + '<span>Нет связи — данные сохраняются на телефоне</span><button type="button" aria-label="Закрыть">×</button>';
    const close = (): void => { b.remove(); };
    (b.querySelector('button') as HTMLButtonElement).addEventListener('click', close);
    doc.body.appendChild(b);
    setTimeout(close, BANNER_MS);
  }

  function render(): void {
    placeChip(); void fillDevice(); banner();
    (win.RBI = win.RBI || {}).netStatus = {
      get: (): NetStatus => ({ ...st }),
      isOffline,
      needInternet: (el: HTMLElement, section: string): void => {
        const a = ((win.RBI || {}).platformMenuAccess || {}) as Record<string, boolean>;
        renderNeedInternetDom(el, section, { quality: a.quality === true || a.construction === true, go: deps.navigate });
      }
    };
    window.dispatchEvent(new Event(NET_STATUS_EVENT));
  }

  async function recount(force = false): Promise<void> {
    const offline = isOffline();
    const p = deps.platform();
    const isUnsent = win.RbiSyncMergePolicy?.isUnsentLocal;
    const db = win.RBI_DB_NAME || '';
    let unsent = st.unsent;
    // со связью и без признака «есть неотправленное» — раз в минуту; без связи или с неотправленным — каждый раз
    let dirty = false;
    try { dirty = window.localStorage.getItem('rbi_cloud_dirty') === '1'; } catch { dirty = false; }
    const due = force || offline || unsent > 0 || dirty || Date.now() - lastScan > 60000;
    if (p.mode !== 'email' || !isUnsent || !db || typeof indexedDB === 'undefined') unsent = 0;
    else if (due) {
      lastScan = Date.now();
      unsent = await countUnsent(indexedDB, db, isUnsent).catch(() => unsent);
    }
    st = { offline, unsent };
    render();
  }

  window.addEventListener('online', () => { void recount(true); });
  window.addEventListener('offline', () => { void recount(true); });
  window.addEventListener('rbi:platform-access', () => { void recount(); });
  window.addEventListener('rbi:platform-net', () => { void recount(); });   // P2-0060: сервер замолчал / ответил
  window.addEventListener('hashchange', () => { setTimeout(render, 300); });
  window.addEventListener('rbi:sync-journal', () => { void fillDevice(); });
  setInterval(() => { void recount(); }, 15000);
  setInterval(placeChip, 1500);   // шапку перерисовывают разделы — значок возвращается на место
  void recount(true);
}
