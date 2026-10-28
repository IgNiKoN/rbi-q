/**
 * P2-0058 (З5): «ничьи» записи. До P2-0058 запуск без связи переключал Качество на общую базу устройства PLATFORM2_DB
 * (без компании, синхронизация выключена): записанное там после возврата связи никуда не уходило.
 * При входе с сетью такие записи находятся и переносятся в базу «компания + пользователь» — только после подтверждения
 * человеком по списку (дата, тип, объект). В PLATFORM2_DB перенесённые помечаются, а не удаляются (правило 2);
 * id записи сохраняется (правило 1), запись, которая уже есть в базе компании, не перезаписывается — повтор не создаёт дубль.
 * Признак «не отправлено» — правило движка синхронизации (isUnsentLocal, sync-merge.policy.js) передаётся снаружи.
 * Демо-записи (id «demo…», признак isDemo) не переносятся.
 */

export type Rec = Record<string, unknown>;
export type IsUnsent = (rec: Rec) => boolean;

/** Пометка в PLATFORM2_DB: куда перенесена запись («компания:пользователь») и когда. */
export const MOVED_FIELD = 'p2_moved_to';
export const MOVED_AT_FIELD = 'p2_moved_at';
/** Пустой слот состояния синхронизации (ключи rbi_* «без компании»), который откладывает мост при переключении. */
export const EMPTY_SLOT_KEY = 'platform2_quality_state_';

/** Хранилища с записями работы человека (что он сам записал) и как их назвать в списке. Остальное (настройки, справочники,
 *  очередь, журналы) не переносится. */
export const RECORD_STORES: Record<string, string> = {
  app_history: 'Осмотр',
  rbi_tasks: 'Задача',
  rbi_meetings: 'Совещание',
  rbi_interventions: 'Вмешательство',
  rbi_practices: 'Практика',
  rbi_etalon_acts: 'Акт эталона',
  rbi_fmea: 'FMEA',
  rbi_schedule_stages: 'Этап графика',
  twi_cards: 'Карта TWI',
  sk_records: 'Запись СК',
  app_reports: 'Отчёт',
  custom_docs: 'Документ',
  construction_defects: 'Замечание',
  construction_defects_v2: 'Замечание',
  construction_acceptance: 'Приёмка',
  construction_acceptance_v2: 'Приёмка',
  construction_units: 'Помещение',
  construction_units_v2: 'Помещение'
};
/** Вложения: переносятся вместе с записью, если запись на них ссылается (фото, снимок чек-листа). */
export const ATTACHMENT_STORES = ['app_photos', 'checklist_snapshots'];

export interface Orphan { store: string; id: string; date: string; type: string; object: string }

export function isDemoRecord(r: Rec): boolean {
  return /^demo[_-]/i.test(String(r.id ?? '')) || r.isDemo === true || r.is_demo === true || r.demo === true;
}
/** Создано самим приложением (авто-задачи «Задача создана системой»), а не человеком. */
export function isSystemRecord(r: Rec): boolean {
  return r.type === 'auto' || r.source === 'ai' || r.source === 'system' || r.contractor === 'Системная';
}

/** Записи хранилища, которые можно предложить к переносу. */
export function pickOrphans(store: string, rows: Rec[], isUnsent: IsUnsent): Rec[] {
  if (!(store in RECORD_STORES)) return [];
  return rows.filter((r) => r && r.id != null && !r[MOVED_FIELD] && !String(r.id).startsWith('sys_') && !isDemoRecord(r) && !isSystemRecord(r) && isUnsent(r));
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

export function describe(store: string, r: Rec): Orphan {
  const data = (r.data && typeof r.data === 'object' ? r.data : {}) as Rec;
  const pick = (...keys: string[]): string => { for (const k of keys) { const v = str(r[k]) || str(data[k]); if (v) return v; } return ''; };
  return {
    store, id: String(r.id), type: RECORD_STORES[store] || store,
    date: pick('date', 'createdAt', 'created_at', 'updatedAt', 'updated_at'),
    object: pick('object', 'objectName', 'projectName', 'project_display_name', 'project', 'title', 'name')
  };
}

/** Вложение нужно переносить: его id упомянут в перенесённых записях или оно привязано к одной из них. */
export function isAttachmentOf(att: Rec, movedIds: Set<string>, movedText: string): boolean {
  if (att[MOVED_FIELD]) return false;
  const id = String(att.id ?? '');
  const owner = str(att.entityId) || str(att.entity_id);
  return (!!owner && movedIds.has(owner)) || (id.length > 3 && movedText.includes(id));
}

/** Подпись по умолчанию у записи без входа (normalizeSystemKeys: нет инженера — «Инженер»). */
const DEFAULT_AUTHOR = 'Инженер';
const AUTHOR_FIELDS = ['inspectorName', 'engineerName', 'engineer_name', 'owner', 'created_by'];

/** Копия записи для базы компании: id тот же; без объекта синхронизации («LOCAL» / пусто) — объект компании;
 *  без подписи (пусто / «Инженер») — подпись вошедшего: человек подтвердил, что записи его (иначе движок не отправит их как свои). */
export function forCompany(r: Rec, projectCode: string, author = ''): Rec {
  const c: Rec = { ...r };
  const pc = str(c.project_code);
  if (!pc || pc === 'LOCAL') c.project_code = projectCode;
  if (author) for (const k of AUTHOR_FIELDS) if (k in c && (!str(c[k]) || str(c[k]) === DEFAULT_AUTHOR)) c[k] = author;
  return c;
}

export function markMoved(r: Rec, slot: string, at: string): Rec {
  return { ...r, [MOVED_FIELD]: slot, [MOVED_AT_FIELD]: at };
}

// ---------- IndexedDB (проверка — на стенде tests/offline/) ----------

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

/** Открыть существующую базу, не создавая новую (нет базы — null). */
export function openExisting(idb: IDBFactory, name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let created = false;
    const r = idb.open(name);
    r.onupgradeneeded = () => { created = true; r.transaction?.abort(); };
    r.onsuccess = () => { if (created) { r.result.close(); resolve(null); } else resolve(r.result); };
    r.onerror = () => resolve(null);
    r.onblocked = () => resolve(null);
  });
}

export interface Found { orphans: Orphan[]; rows: Map<string, Rec[]>; attachments: Map<string, Rec[]> }

/** Найти «ничьи» записи в базе from (без изменений). */
export async function scanOrphans(idb: IDBFactory, from: string, isUnsent: IsUnsent): Promise<Found> {
  const found: Found = { orphans: [], rows: new Map(), attachments: new Map() };
  const db = await openExisting(idb, from);
  if (!db) return found;
  try {
    const names = Array.from(db.objectStoreNames);
    for (const store of names) {
      if (!(store in RECORD_STORES)) continue;
      const rows = pickOrphans(store, await req(db.transaction(store, 'readonly').objectStore(store).getAll()) as Rec[], isUnsent);
      if (!rows.length) continue;
      found.rows.set(store, rows);
      for (const r of rows) found.orphans.push(describe(store, r));
    }
    if (found.orphans.length) {
      const ids = new Set(found.orphans.map((o) => o.id));
      const text = JSON.stringify([...found.rows.values()]);
      for (const store of ATTACHMENT_STORES) {
        if (!names.includes(store)) continue;
        const all = await req(db.transaction(store, 'readonly').objectStore(store).getAll()) as Rec[];
        const att = all.filter((a) => isAttachmentOf(a, ids, text));
        if (att.length) found.attachments.set(store, att);
      }
    }
  } finally {
    db.close();
  }
  found.orphans.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return found;
}

/** Перенести найденное из from в to; в from — пометка. Возвращает число перенесённых записей (без вложений). */
export async function moveOrphans(idb: IDBFactory, from: string, to: string, found: Found,
  opts: { slot: string; projectCode: string; author?: string; now?: string }): Promise<number> {
  const at = opts.now || new Date().toISOString();
  const target = await openExisting(idb, to);
  const source = await openExisting(idb, from);
  if (!target || !source) { target?.close(); source?.close(); throw new Error('База устройства недоступна'); }
  let moved = 0;
  try {
    const groups: Array<[string, Rec[], boolean]> = [...[...found.rows].map(([s, r]): [string, Rec[], boolean] => [s, r, true]),
      ...[...found.attachments].map(([s, r]): [string, Rec[], boolean] => [s, r, false])];
    for (const [store, rows, counted] of groups) {
      if (!target.objectStoreNames.contains(store)) continue;
      const tx = target.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      const key = os.keyPath as string;
      const done: Rec[] = [];
      for (const r of rows) {
        const exists = await req(os.getKey(r[key] as IDBValidKey));
        if (exists === undefined) os.put(store in RECORD_STORES ? forCompany(r, opts.projectCode, opts.author) : r);
        done.push(r);
        if (counted) moved++;
      }
      await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
      const stx = source.transaction(store, 'readwrite');
      for (const r of done) stx.objectStore(store).put(markMoved(r, opts.slot, at));
      await new Promise<void>((res, rej) => { stx.oncomplete = () => res(); stx.onerror = () => rej(stx.error); stx.onabort = () => rej(stx.error); });
    }
  } finally {
    target.close();
    source.close();
  }
  return moved;
}

// ---------- Лист «Найдено N записей» (окончательный вид — по макету этапа 3) ----------

export const RESCUE_CSS = `
.p2-rescue-wrap{position:fixed;inset:0;z-index:1300}
.p2-rescue-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.35)}
.p2-rescue{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:12px;max-height:88vh;overflow-y:auto;
  padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));background:var(--card-bg);color:var(--text-main);
  border-top:1px solid var(--card-border);border-radius:16px 16px 0 0;box-shadow:0 -6px 24px rgba(0,0,0,.25)}
.p2-rescue b{font-size:16px;font-weight:600}
.p2-rescue p{margin:0;font-size:13px;color:var(--text-muted);overflow-wrap:anywhere}
.p2-rescue ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.p2-rescue li{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:13px;padding:8px 10px;border:1px solid var(--card-border);border-radius:10px;overflow-wrap:anywhere}
.p2-rescue li span{color:var(--text-muted)}
.p2-rescue__foot{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.p2-rescue__foot button{min-height:44px;padding:0 16px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main)}
.p2-rescue__foot button[data-primary]{border:0;background:var(--accent,var(--primary));color:#fff}
.p2-rescue__foot button:disabled{opacity:.6;cursor:default}
@media (min-width:900px){.p2-rescue{left:50%;right:auto;bottom:auto;top:50%;transform:translate(-50%,-50%);width:520px;border-radius:16px;border:1px solid var(--card-border)}}`;

const LIST_LIMIT = 50;

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return iso || 'без даты';
  const p = (n: number): string => String(n).padStart(2, '0');
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

export function renderRescueSheet(doc: Document, o: { companyName: string; orphans: Orphan[]; onMove: () => Promise<string | null>; onLater: () => void }): HTMLElement {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const wrap = el('div', { class: 'p2-rescue-wrap', 'data-testid': 'p2-rescue' });
  const back = el('div', { class: 'p2-rescue-backdrop', 'aria-hidden': 'true' });
  const box = el('div', { class: 'p2-rescue', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Записи без связи' });
  const n = o.orphans.length;
  box.append(el('b', {}, 'Найдено ' + n + ' ' + plural(n, 'запись', 'записи', 'записей') + ', сделанных без связи'),
    el('p', {}, 'Они остались на этом устройстве и не отправлены. Перенести в «' + o.companyName + '» и отправить?'));
  const ul = el('ul', { 'data-testid': 'p2-rescue-list' });
  for (const x of o.orphans.slice(0, LIST_LIMIT)) {
    const li = el('li');
    li.append(el('span', {}, fmtDate(x.date)), el('strong', {}, x.type), doc.createTextNode(x.object || 'без объекта'));
    ul.append(li);
  }
  if (n > LIST_LIMIT) ul.append(el('li', {}, 'и ещё ' + (n - LIST_LIMIT)));
  const msg = el('p', { 'data-testid': 'p2-rescue-msg', role: 'status' });
  const later = el('button', { type: 'button', 'data-testid': 'p2-rescue-later' }, 'Позже');
  const move = el('button', { type: 'button', 'data-primary': '', 'data-testid': 'p2-rescue-move' }, 'Перенести и отправить');
  const foot = el('div', { class: 'p2-rescue__foot' });
  foot.append(later, move);
  box.append(ul, msg, foot);
  wrap.append(back, box);
  const close = (): void => { wrap.remove(); };
  later.addEventListener('click', () => { close(); o.onLater(); });
  back.addEventListener('click', () => { close(); o.onLater(); });
  move.addEventListener('click', () => {
    move.disabled = true; later.disabled = true; msg.textContent = 'Переносим…';
    void o.onMove().then((err) => {
      if (err) { msg.textContent = err; move.disabled = false; later.disabled = false; } else close();
    });
  });
  return wrap;
}

function plural(n: number, one: string, few: string, many: string): string {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}
