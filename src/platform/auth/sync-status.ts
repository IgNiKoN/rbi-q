// P2-0059 (С8, С9): «Данные на устройстве» — карточка «Отправка» (что не ушло и почему, последняя успешная отправка,
// проверка связи) и «Журнал синхронизации» со «Скопировать отчёт для разработчика». Макет утверждён владельцем (этап 4).
// Список строится из записей устройства тем же правилом, что счётчик «не отправлено» (offline-rescue.ts) — своей очереди нет.
// Причины — чистыми функциями (unit-тесты — __tests__/sync-status.test.ts); рисует net-status.ts.
import { describe, RECORD_STORES } from './offline-rescue.ts';
import type { Rec } from './offline-rescue.ts';

export type Chip = 'net' | 'photo' | 'wait' | 'bad' | 'queue';
export interface Reason { chip: Chip; why: string; hint: string; act?: 'drop_photos' }
export interface ReasonCtx { offline: boolean; now: number; retryAfter: number; retryKind: string }
export interface Item { store: string; id: string; title: string; when: string; reason: Reason; rejected: boolean }
export interface JournalLine { t: string; text: string; tone: string }
export interface StatusData {
  offline: boolean; now: number; items: Item[]; lastOkAt: string; probe: string | null; probeAt: number;
  retryAfter: number; retryKind: string; journal: JournalLine[]; journalTotal: number;
}

export const SYNC_STYLE_ID = 'p2-sync-status-css';
export const SYNC_CSS = `
.p2s{background:var(--card-bg);color:var(--text-main);border:1px solid var(--card-border);border-radius:16px;overflow:hidden}
.p2s__head{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 16px}
.p2s__head>div:nth-child(2){flex:1 1 200px;min-width:0}
.p2s__ico{width:44px;height:44px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center}
.p2s__ico--warn{color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 14%,transparent)}
.p2s__ico--ok{color:var(--success,#3f8f5e);background:color-mix(in srgb,var(--success,#3f8f5e) 14%,transparent)}
.p2s__title{display:block;font-size:16px;font-weight:800;line-height:1.25}
.p2s__sub{display:block;font-size:13px;color:var(--text-muted);margin-top:2px}
.p2s__btn{flex:1 1 100%;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);font-weight:700;font-size:13px;cursor:pointer}
.p2s__list{list-style:none;margin:0;padding:0;border-top:1px solid var(--card-border)}
.p2s__row{display:grid;grid-template-columns:1fr;gap:4px 12px;padding:12px 16px;border-bottom:1px solid var(--card-border)}
.p2s__row:last-child{border-bottom:0}
.p2s__name{font-size:14px;font-weight:700;min-width:0;overflow-wrap:anywhere}
.p2s__when{font-size:12px;color:var(--text-muted)}
.p2s__why{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px}
.p2s__chip{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-weight:700;font-size:12px}
.p2s__chip--net,.p2s__chip--photo{color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 13%,transparent)}
.p2s__chip--bad{color:var(--danger,#b24a43);background:color-mix(in srgb,var(--danger,#b24a43) 12%,transparent)}
.p2s__chip--wait,.p2s__chip--queue{color:var(--text-muted);background:color-mix(in srgb,var(--text-muted) 14%,transparent)}
.p2s__hint{color:var(--text-muted);font-size:12.5px}
.p2s__act{min-height:36px;padding:0 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--warning,#b8844a) 45%,transparent);background:transparent;color:var(--text-main);font-weight:700;font-size:12.5px;cursor:pointer}
.p2s__group{padding:8px 16px;font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);background:color-mix(in srgb,var(--text-muted) 6%,transparent);border-top:1px solid var(--card-border)}
.p2s__foot{display:flex;flex-wrap:wrap;gap:6px 16px;padding:10px 16px;border-top:1px solid var(--card-border);font-size:12.5px;color:var(--text-muted)}
.p2j summary{list-style:none}.p2j summary::-webkit-details-marker{display:none}
.p2j__sum{display:flex;align-items:center;gap:10px;padding:14px 16px;min-height:48px;cursor:pointer;font-weight:800;font-size:14px}
.p2j__sum small{font-weight:600;color:var(--text-muted);font-size:12.5px}
.p2j__chev{margin-left:auto;color:var(--text-muted);transition:transform .2s}.p2j[open] .p2j__chev{transform:rotate(180deg)}
.p2j__tools{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px 16px;border-top:1px solid var(--card-border)}
.p2j__copy{min-height:44px;padding:0 14px;border-radius:12px;border:0;background:var(--accent,var(--primary,#c49a5f));color:#fff;font-weight:800;font-size:13px;cursor:pointer}
.p2j__ev{list-style:none;margin:0;padding:0;border-top:1px solid var(--card-border);font-size:12.5px}
.p2j__ev li{display:grid;grid-template-columns:minmax(48px,auto) 1fr;gap:10px;padding:8px 16px;border-bottom:1px solid var(--card-border)}
.p2j__ev li:last-child{border-bottom:0}
.p2j__t{color:var(--text-muted);font-variant-numeric:tabular-nums}
.p2j__k{font-weight:700;overflow-wrap:anywhere}.p2j__k--bad{color:var(--danger,#b24a43)}.p2j__k--warn{color:var(--warning,#b8844a)}.p2j__k--ok{color:var(--success,#3f8f5e)}
.p2j__more{padding:10px 16px;font-size:12.5px;color:var(--text-muted);border-top:1px solid var(--card-border)}
.p2s button:focus-visible,.p2j summary:focus-visible{outline:2px solid var(--warning,#b8844a);outline-offset:2px}
@media (min-width:768px){.p2s__btn{flex:none;margin-left:auto}}
@media (min-width:1024px){.p2s__row{grid-template-columns:minmax(0,1fr) 150px minmax(0,1.1fr);align-items:center}}`;

const ICON_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 2l20 20"/><path d="M5.8 10.1A5 5 0 0 0 7 18h10.5"/><path d="M20.9 16.6A4 4 0 0 0 19 10a5 5 0 0 0-7.6-4.3"/></svg>';
const ICON_UP = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
const ICON_OK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const pad = (n: number): string => String(n).padStart(2, '0');

export function hhmm(ts: number): string {
  const d = new Date(ts);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** «сегодня 14:05» / «вчера 17:12» / «26.10 09:30»; без даты — ''. */
export function whenLabel(iso: string, now: number): string {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const d = new Date(t); const n = new Date(now);
  const day = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(n) - day(d)) / 86400000);
  if (diff === 0) return 'сегодня ' + hhmm(t);
  if (diff === 1) return 'вчера ' + hhmm(t);
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + hhmm(t);
}

const REJECT_RU: [RegExp, string][] = [
  [/RLS|прав доступа|permission/i, 'нет прав'],
  [/не назначен/i, 'объект не назначен'],
  [/другим инженером/i, 'запись другого инженера'],
  [/Роль не подтверждена/i, 'роль не подтверждена'],
  [/роль не может/i, 'у роли нет права отправки']
];

/** Почему запись не ушла (С8). Отклонённая — «Сервер отклонил»; «нужно внимание» — нет фото; без связи; ждёт повтора; ждёт отправки. */
export function reasonFor(r: Rec, rejected: boolean, c: ReasonCtx): Reason {
  const st = String(r.syncStatus ?? r.sync_status ?? '');
  const block = String(r.syncBlockReason ?? r.sync_block_reason ?? '');
  if (rejected) {
    const hit = REJECT_RU.find(([re]) => re.test(block));
    return { chip: 'bad', why: 'Сервер отклонил: ' + (hit ? hit[1] : (block ? block.charAt(0).toLowerCase() + block.slice(1) : 'нет прав')),
      hint: 'запись осталась на телефоне; обратитесь к руководителю' };
  }
  if (st === 'needs_attention') {
    const text = block.replace(/^Не отправлено:\s*/i, '').replace(/^Нужно внимание:\s*/i, '');
    return { chip: 'photo', why: text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Нет фото на телефоне', hint: 'фото нет на телефоне', act: 'drop_photos' };
  }
  if (c.offline) return { chip: 'net', why: 'Нет связи', hint: 'отправим сами, как появится' };
  if (c.retryAfter > c.now) {
    return c.retryKind === 'server'
      ? { chip: 'wait', why: 'Сервер не ответил', hint: 'повтор в ' + hhmm(c.retryAfter) }
      : { chip: 'wait', why: 'Нет ответа сервера', hint: 'проверяем связь каждую минуту — отправим сразу' };
  }
  return { chip: 'queue', why: 'Ждёт отправки', hint: 'уйдёт в ближайшую минуту' };
}

/** «Осмотр · Кладка · ЖК Тестовый» — то, что человек узнаёт (только на его телефоне; в журнал не попадает). */
export function itemTitle(store: string, r: Rec): string {
  const d = describe(store, r);
  const tpl = typeof r.templateTitle === 'string' ? r.templateTitle : typeof r.template === 'string' ? r.template : '';
  const place = [r.section, r.floor].map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean).join(', ');
  return [RECORD_STORES[store] || d.type, tpl, d.object, place].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ');
}

export function toItems(rows: { store: string; rec: Rec; rejected: boolean }[], c: ReasonCtx): Item[] {
  return rows.map(({ store, rec, rejected }) => ({
    store, id: String(rec.id), rejected, title: itemTitle(store, rec),
    when: whenLabel(describe(store, rec).date, c.now), reason: reasonFor(rec, rejected, c)
  })).sort((a, b) => Number(a.rejected) - Number(b.rejected));
}

const PROBE_RU: Record<string, string> = { online: 'есть', offline: 'нет ответа', server: 'сервер не отвечает' };

/** Карточка «Отправка» + «Журнал синхронизации» (разметка; данные экранированы). */
export function statusHtml(d: StatusData, journalOpen: boolean): string {
  const unsent = d.items.filter((i) => !i.rejected);
  const rejected = d.items.filter((i) => i.rejected);
  const lastOk = d.lastOkAt ? whenLabel(d.lastOkAt, d.now) : '';
  let head: string;
  if (!unsent.length) {
    head = '<div class="p2s__head"><div class="p2s__ico p2s__ico--ok">' + ICON_OK + '</div><div><b class="p2s__title">Всё отправлено</b>' +
      '<span class="p2s__sub">' + (lastOk ? 'Последняя успешная отправка: ' + esc(lastOk) : 'На этом телефоне нет неотправленных записей') + '</span></div></div>';
  } else {
    const waitServer = !d.offline && d.retryAfter > d.now && d.retryKind === 'server';
    const sub = d.offline ? 'Всё сохранено на телефоне и уйдёт само, когда появится связь.'
      : waitServer ? 'Связь есть, сервер не ответил — отправим сами в ' + hhmm(d.retryAfter) + '.'
        : 'Всё сохранено на телефоне и уйдёт само.';
    head = '<div class="p2s__head"><div class="p2s__ico p2s__ico--warn">' + (d.offline ? ICON_OFF : ICON_UP) + '</div><div><b class="p2s__title">' +
      (d.offline ? 'Нет связи · ' : '') + 'не отправлено: ' + unsent.length + '</b><span class="p2s__sub">' + esc(sub) + '</span></div>' +
      '<button class="p2s__btn" type="button" data-act="sync" data-testid="p2-sync-now">Отправить сейчас</button></div>';
  }
  const row = (i: Item): string => '<li class="p2s__row" data-testid="p2-sync-item" data-id="' + esc(i.id) + '" data-chip="' + i.reason.chip + '">' +
    '<div class="p2s__name">' + esc(i.title) + '</div><div class="p2s__when">' + (i.when ? 'записано ' + esc(i.when) : '') + '</div>' +
    '<div class="p2s__why"><span class="p2s__chip p2s__chip--' + i.reason.chip + '">' + esc(i.reason.why) + '</span><span class="p2s__hint">' + esc(i.reason.hint) + '</span>' +
    (i.reason.act === 'drop_photos' && i.store === 'app_history' ? '<button class="p2s__act" type="button" data-act="drop" data-id="' + esc(i.id) + '">Отправить без этого фото</button>' : '') +
    '</div></li>';
  const list = unsent.length ? '<ul class="p2s__list">' + unsent.map(row).join('') + '</ul>' : '';
  const rej = rejected.length ? '<div class="p2s__group">Отклонено сервером: ' + rejected.length + '</div><ul class="p2s__list">' + rejected.map(row).join('') + '</ul>' : '';
  const footParts: string[] = [];
  if (unsent.length || rejected.length) footParts.push('Последняя успешная отправка: ' + (lastOk ? esc(lastOk) : 'ещё не было'));
  if (d.probe && d.probeAt) footParts.push('Проверка связи: ' + esc(PROBE_RU[d.probe] || d.probe) + ', ' + hhmm(d.probeAt));
  const foot = footParts.length ? '<div class="p2s__foot">' + footParts.map((x) => '<span>' + x + '</span>').join('') + '</div>' : '';
  const card = '<section class="p2s" role="status" data-testid="p2-net-device">' + head + list + rej + foot + '</section>';
  const ev = d.journal.length
    ? '<ul class="p2j__ev" data-testid="p2-sync-journal-list">' + d.journal.map((e) => '<li><span class="p2j__t">' + esc(e.t) + '</span><span class="p2j__k' + (e.tone ? ' p2j__k--' + e.tone : '') + '">' + esc(e.text) + '</span></li>').join('') + '</ul>' +
      '<div class="p2j__more">Показаны последние ' + d.journal.length + ' · хранится до 500 событий на этом телефоне</div>'
    : '<div class="p2j__more">Событий пока нет</div>';
  const journal = '<details class="p2s p2j" data-testid="p2-sync-journal"' + (journalOpen ? ' open' : '') + '><summary class="p2j__sum">Журнал синхронизации <small>· ' +
    d.journalTotal + ' ' + plural(d.journalTotal, 'событие', 'события', 'событий') + '</small><span class="p2j__chev" aria-hidden="true">▼</span></summary>' +
    '<div class="p2j__tools"><button class="p2j__copy" type="button" data-act="copy" data-testid="p2-sync-copy">Скопировать отчёт для разработчика</button>' +
    '<span class="p2s__hint">В отчёте нет содержимого записей и имён — только время, счётчики и ошибки.</span></div>' + ev + '</details>';
  return '<div class="space-y-3">' + card + journal + '</div>';
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100; const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
