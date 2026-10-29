/**
 * P2-0060 этап 6: «Настройки → Данные на устройстве → Офлайн по модулям» (макет утверждён владельцем 29.10.2026, reports/P2-0060/stage5).
 * Мои модули (по правам и модулям компании) — из манифестов: что умеют без сети (offline), размер на телефоне (код по описи версии
 * P2-0066, копия для просмотра, фото и PDF по реестру файлов), «Держать без сети», «Фото и PDF заранее», «Скачать сейчас»,
 * «Очистить скачанное» (только копии с сервера; неотправленное не трогается никогда). Без React — экран оболочки (обычный DOM).
 */
import { inputBlocked, offlineOf } from './offline-read.ts';
import type { ModuleOffline } from './offline-read.ts';
import { currentDocsScope, currentFilesScope, currentSlot, filesChoice, keepOffline, lastPrefetch, offlineReader, qualityRole, setFilesChoice, setKeepOffline } from './copy.ts';
import { defaultDocsScope, defaultFilesScope, FILES_SCOPE_LABEL, FILES_SCOPES } from './files-rule.ts';
import type { FilesScope } from './files-rule.ts';

/** Строка экрана: модуль (или Качество и Стройконтроль одной строкой — одна база и одни фото, решение владельца 29.10.2026). */
export interface ModuleRow { id: string; name: string; what: string; offline: ModuleOffline | null; files: 'quality' | 'knowledge' | null; code: string[] }
const ROWS: ModuleRow[] = [
  { id: 'quality', name: 'Качество и Стройконтроль', what: 'Осмотры, замечания, планы СК — одна база на телефоне', offline: null, files: 'quality', code: ['quality', 'construction', 'construction-v2'] },
  { id: 'planfact', name: 'План/Факт', what: 'Сводка, ВОР, Факт, шахматка, журнал, КС-2 и сметы — по моим проектам', offline: null, files: null, code: ['planfact'] },
  { id: 'company', name: 'Компания', what: 'Проекты и объекты, места, сотрудники и роли, контрагенты', offline: null, files: null, code: ['company'] },
  { id: 'knowledge', name: 'База знаний', what: 'Документы, TWI, тех. узлы, эталоны', offline: null, files: 'knowledge', code: [] },
  { id: 'ai', name: 'ИИ-помощник', what: 'Вопросы к базе знаний', offline: null, files: null, code: [] }
];
/** Виды файлов Базы знаний (реестр файлов, storage-cache-manager.js) — остальное в реестре относится к Качеству / СК. */
export const KNOWLEDGE_KINDS = ['twi_photo', 'twi_pdf', 'node_file', 'custom_doc_pdf', 'assistant_kb_file', 'etalon_file'];

type Loader = { getById?: (id: string) => { offline?: unknown } | null };
type Shell = { isPlatformModuleAllowed?: (id: string) => boolean; legacyModuleAllowed?: (id: string) => boolean };
type W = Window & { RBI?: { moduleLoader?: Loader; services?: { shell?: Shell }; platformMenuAccess?: Record<string, boolean>;
  offlinePrefetch?: Record<string, (force: boolean) => Promise<unknown>> }; downloadMissingCloudFiles?: (silent: boolean, scope: string) => Promise<void>;
  RbiStorageManager?: { runManualRecoverableCacheCleanup?: (o: Record<string, unknown>) => Promise<{ freedBytes?: number } | undefined> };
  showToast?: (m: string) => void; dbGetAll?: (store: string) => Promise<unknown[]>; STORES?: Record<string, string> };

/** Мои модули: модуль положен этому человеку (права сервера и модули компании). «Компания» — если раздел открыт ему. */
export function myRows(allowed: (id: string) => boolean, manifest: (id: string) => ModuleOffline | null): ModuleRow[] {
  return ROWS.filter((r) => r.id === 'quality' ? allowed('quality') || allowed('construction') : allowed(r.id))
    .map((r) => ({ ...r, offline: manifest(r.id === 'quality' ? 'quality' : r.id) }));
}
/** Что модуль умеет без сети — подпись по полю offline манифеста; поля нет — «Только онлайн». */
export function abilityLabel(o: ModuleOffline | null): { text: string; kind: 'rw' | 'ro' | 'on' } {
  if (!o || !o.view) return { text: 'Только онлайн', kind: 'on' };
  return inputBlocked(o, '*', true) ? { text: 'Без сети: смотреть', kind: 'ro' } : { text: 'Без сети: смотреть и вносить', kind: 'rw' };
}
/** Байты по описи версии (sw.js, P2-0066): путь → [отпечаток, размер, модуль]. */
export function codeBytesByModule(swText: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of swText.matchAll(/^\s*"[^"]+": \["[0-9a-f]+",(\d+),"([^"]*)"\]/gm)) out[m[2]] = (out[m[2]] || 0) + Number(m[1]);
  return out;
}
/** Файлы на телефоне по реестру: Качество / СК и База знаний отдельно (скачанные из облака и свои, ещё не отправленные). */
export function fileBytes(registry: Array<Record<string, unknown>>): { quality: number; knowledge: number } {
  const out = { quality: 0, knowledge: 0 };
  for (const r of registry) {
    const st = String(r.cache_status || r.cacheStatus || '');
    if (st !== 'cached_cloud' && st !== 'cached_local') continue;
    const n = Number(r.size_bytes || r.sizeBytes || 0) || 0;
    if (KNOWLEDGE_KINDS.includes(String(r.entity_type || r.entityType || ''))) out.knowledge += n; else out.quality += n;
  }
  return out;
}
/** Размер для человека: до 1 МБ — КБ, до 1 ГБ — МБ, дальше — ГБ (одна цифра после запятой у малых чисел). */
export const mb = (b: number): string => {
  if (!b) return '0 КБ';
  const f = (v: number, u: string): string => (v < 10 ? v.toFixed(1) : Math.round(v).toString()).replace('.', ',') + ' ' + u;
  return b < 1048576 ? f(b / 1024, 'КБ') : b < 1073741824 ? f(b / 1048576, 'МБ') : f(b / 1073741824, 'ГБ');
};
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const when = (iso: string): string => {
  const d = new Date(iso), t = new Date();
  const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const same = d.toDateString() === t.toDateString();
  const y = new Date(t); y.setDate(t.getDate() - 1);
  return (same ? 'сегодня ' : d.toDateString() === y.toDateString() ? 'вчера ' : String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + ' ') + hm;
};

export const OFFLINE_MODULES_CSS = `
.p2o{background:var(--card-bg);color:var(--text-main);border:1px solid var(--card-border);border-radius:16px;overflow:hidden;margin:12px 0}
.p2o__head{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 16px}
.p2o__ico{width:44px;height:44px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;color:var(--accent,var(--primary,#c49a5f));background:color-mix(in srgb,var(--accent,var(--primary,#c49a5f)) 14%,transparent)}
.p2o__title{display:block;font-size:16px;font-weight:800;line-height:1.25}
.p2o__sub{display:block;font-size:13px;color:var(--text-muted);margin-top:2px}
.p2o__total{margin-left:auto;font-size:12.5px;color:var(--text-muted);text-align:right}.p2o__total b{color:var(--text-main);font-size:14px}
.p2o__bar{height:6px;border-radius:999px;background:color-mix(in srgb,var(--text-muted) 16%,transparent);overflow:hidden;margin-top:6px;min-width:160px}
.p2o__bar i{display:block;height:100%;background:var(--accent,var(--primary,#c49a5f))}
.p2o__mod{border-top:1px solid var(--card-border);padding:14px 16px;display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:start}
.p2o__name{font-size:15px;font-weight:800}.p2o__what{display:block;font-size:12.5px;color:var(--text-muted);margin-top:2px}
.p2o__chip{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-weight:700;font-size:12px;margin-top:6px}
.p2o__chip--rw{color:var(--success,#3f8f5e);background:color-mix(in srgb,var(--success,#3f8f5e) 13%,transparent)}
.p2o__chip--ro{color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 13%,transparent)}
.p2o__chip--on{color:var(--text-muted);background:color-mix(in srgb,var(--text-muted) 14%,transparent)}
.p2o__sw{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;white-space:nowrap;cursor:pointer;min-height:44px}
.p2o__sw input{position:absolute;opacity:0;width:1px;height:1px}
.p2o__sw span{width:44px;height:26px;border-radius:999px;background:color-mix(in srgb,var(--text-muted) 35%,transparent);position:relative;display:inline-block;flex:none}
.p2o__sw span::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .15s}
.p2o__sw input:checked+span{background:var(--accent,var(--primary,#c49a5f))}.p2o__sw input:checked+span::after{left:21px}
.p2o__sw input:focus-visible+span{outline:2px solid var(--warning,#b8844a);outline-offset:2px}
.p2o__body{grid-column:1/-1;display:flex;flex-direction:column;gap:10px;min-width:0}
.p2o__size{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--text-muted)}.p2o__size b{color:var(--text-main)}
.p2o__field{display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:700;color:var(--text-muted)}
.p2o__sel{min-height:44px;border-radius:12px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);font-size:14px;font-weight:600;padding:0 12px;max-width:420px}
.p2o__last{font-size:12.5px;color:var(--text-muted)}
.p2o__btns{display:flex;flex-wrap:wrap;gap:8px}
.p2o__btn{min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);font-weight:700;font-size:13px;cursor:pointer}
.p2o__btn--main{background:var(--accent,var(--primary,#c49a5f));border-color:transparent;color:#fff}
.p2o__btn--danger{color:var(--danger,#b24a43);border-color:color-mix(in srgb,var(--danger,#b24a43) 40%,transparent)}
.p2o__btn:disabled{opacity:.55;cursor:default}
.p2o__btn:focus-visible,.p2o__sel:focus-visible{outline:2px solid var(--warning,#b8844a);outline-offset:2px}
.p2o__mod--online .p2o__name{color:var(--text-muted)}
.p2o__foot{border-top:1px solid var(--card-border);padding:12px 16px;font-size:12.5px;color:var(--text-muted);display:flex;gap:8px;align-items:flex-start}
.p2o-dlg{position:fixed;inset:0;z-index:12000;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.45);padding:16px}
.p2o-dlg__box{width:100%;max-width:440px;background:var(--card-bg);color:var(--text-main);border-radius:18px;border:1px solid var(--card-border);padding:18px;display:flex;flex-direction:column;gap:10px}
.p2o-dlg__t{font-size:17px;font-weight:800}.p2o-dlg__p{font-size:14px;color:var(--text-muted);line-height:1.45}
@media (min-width:768px){.p2o-dlg{align-items:center}.p2o__body{grid-column:1/2}}
@media (max-width:599px){.p2o__total{margin-left:0;text-align:left;flex:1 1 100%}.p2o__sel{max-width:none}}`;

export interface ModuleState { row: ModuleRow; keep: boolean; codeBytes: number; copyBytes: number; fileBytes: number; scope: string | null; roleScope: string | null; last: string }
const SCOPE_OPTIONS: Record<'quality' | 'knowledge', Array<[string, string]>> = {
  quality: FILES_SCOPES.map((s) => [s, FILES_SCOPE_LABEL[s]]),
  knowledge: [['all', 'Все'], ['none', 'Не скачивать заранее']]
};

/** Разметка блока по состоянию (чистая функция — для unit и для экрана). */
export function modulesHtml(rows: ModuleState[], total: { used: number; free: number }, roleLabel: string): string {
  const mod = (m: ModuleState): string => {
    const a = abilityLabel(m.row.offline);
    const online = a.kind === 'on';
    const sizes = [m.codeBytes ? `<span>Код <b>${mb(m.codeBytes)}</b></span>` : '', m.copyBytes || m.row.id === 'planfact' || m.row.id === 'company' ? `<span>Данные <b>${mb(m.copyBytes)}</b></span>` : '',
      m.row.files ? `<span>${m.row.files === 'knowledge' ? 'Документы и TWI' : 'Фото и PDF'} <b>${mb(m.fileBytes)}</b></span>` : ''].filter(Boolean).join('');
    const sel = m.row.files ? `<label class="p2o__field">${m.row.files === 'knowledge' ? 'Документы заранее' : 'Фото и PDF заранее'}<select class="p2o__sel" data-act="scope" data-mod="${m.row.files}" id="p2o-scope-${m.row.id}"${m.keep ? '' : ' disabled'}>` +
      SCOPE_OPTIONS[m.row.files].map(([v, t]) => `<option value="${v}"${v === m.scope ? ' selected' : ''}>${esc(t)}${v === m.roleScope ? ' · по роли' : ''}</option>`).join('') + '</select></label>' : '';
    return `<div class="p2o__mod${online ? ' p2o__mod--online' : ''}" data-mod="${m.row.id}" data-testid="p2o-mod-${m.row.id}">` +
      `<div><span class="p2o__name">${esc(m.row.name)}</span><span class="p2o__what">${esc(m.row.what)}</span><span class="p2o__chip p2o__chip--${a.kind}">${a.text}</span></div>` +
      (online ? '' : `<label class="p2o__sw"><input type="checkbox" data-act="keep" data-mod="${m.row.id}" id="p2o-keep-${m.row.id}"${m.keep ? ' checked' : ''}><span aria-hidden="true"></span>Держать без сети</label>` +
        `<div class="p2o__body"><div class="p2o__size" data-testid="p2o-size-${m.row.id}">${sizes}</div>${sel}<div class="p2o__last">${esc(m.last)}</div>` +
        `<div class="p2o__btns"><button type="button" class="p2o__btn p2o__btn--main" data-act="download" data-mod="${m.row.id}"${m.keep ? '' : ' disabled'}>Скачать сейчас</button>` +
        (m.row.id === 'quality' ? `<button type="button" class="p2o__btn" data-act="reports" data-mod="quality">Отчёты на телефон</button>` : '') +
        `<button type="button" class="p2o__btn p2o__btn--danger" data-act="clear" data-mod="${m.row.id}" data-testid="p2o-clear-${m.row.id}">Очистить скачанное</button></div></div>`) +
      '</div>';
  };
  const pct = total.used + total.free > 0 ? Math.max(1, Math.round(total.used * 100 / (total.used + total.free))) : 0;
  return `<section class="p2o" data-testid="p2-offline-modules"><div class="p2o__head"><div class="p2o__ico" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"/></svg></div>` +
    `<div style="flex:1 1 220px;min-width:0"><span class="p2o__title">Офлайн по модулям</span><span class="p2o__sub">Что телефон держит без сети. По умолчанию — по вашей роли: ${esc(roleLabel)}. Можно поменять у каждого модуля.</span></div>` +
    `<div class="p2o__total" data-testid="p2o-total">На телефоне <b>${mb(total.used)}</b> · свободно ${mb(total.free)}<div class="p2o__bar"><i style="width:${pct}%"></i></div></div></div>` +
    rows.map(mod).join('') +
    `<div class="p2o__foot"><span>Неотправленное («не отправлено: N») не удаляется никогда — ни очисткой, ни правилом по роли. Без сети раздел покажет то, что скачано заранее или открывалось.</span></div></section>`;
}

let codeCache: Record<string, number> | null = null;
const ROLE_LABEL: Record<string, string> = { engineer: 'инженер качества', contractor: 'подрядчик', manager: 'руководитель', director: 'руководство', guest: 'просмотр' };

/** Собрать состояние экрана из устройства (манифесты, права, опись версии, копия, реестр файлов, память). */
export async function readModules(win: W): Promise<{ rows: ModuleState[]; total: { used: number; free: number }; role: string }> {
  const r = win.RBI || {};
  const sh = r.services?.shell;
  const access = r.platformMenuAccess || {};
  const allowed = (id: string): boolean => (id === 'planfact' ? !!sh?.isPlatformModuleAllowed?.('planfact') : id === 'company' ? access.company === true
    : !!sh?.legacyModuleAllowed?.(id));
  const manifest = (id: string): ModuleOffline | null => offlineOf(r.moduleLoader?.getById?.(id) || null);
  const rows = myRows(allowed, manifest);
  // опись версии одна на открытую вкладку — читается один раз
  if (!codeCache) { try { codeCache = codeBytesByModule(await (await fetch('./sw.js')).text()); } catch { /* без описи — без кода */ } }
  const code = codeCache || {};
  let files = { quality: 0, knowledge: 0 };
  try { if (win.dbGetAll && win.STORES?.FILE_REGISTRY) files = fileBytes((await win.dbGetAll(win.STORES.FILE_REGISTRY)) as Array<Record<string, unknown>>); } catch { /* без реестра */ }
  let used = 0, free = 0;
  try { const e = await navigator.storage.estimate(); used = e.usage || 0; free = Math.max(0, (e.quota || 0) - used); } catch { /* без оценки */ }
  const role = qualityRole();
  const reader = offlineReader();
  const out: ModuleState[] = [];
  for (const row of rows) {
    const keep = keepOffline(row.id === 'quality' ? 'quality' : row.id);
    const copyBytes = row.id === 'planfact' || row.id === 'company' ? await reader.size(row.id) : 0;
    const scope = row.files === 'quality' ? (filesChoice('quality') || defaultFilesScope(role)) : row.files === 'knowledge' ? (filesChoice('knowledge') || defaultDocsScope(role)) : null;
    const roleScope = row.files === 'quality' ? defaultFilesScope(role) : row.files === 'knowledge' ? defaultDocsScope(role) : null;
    const lp = lastPrefetch(row.id);
    const last = !keep ? 'Заранее не скачивается — без сети раздел покажет то, что вы открывали'
      : row.files === 'quality' ? (currentFilesScope() === 'none' ? 'Фото заранее не скачиваются — открытые остаются на телефоне' : 'Фото и PDF заранее: ' + FILES_SCOPE_LABEL[currentFilesScope() as FilesScope].toLowerCase())
      : row.files === 'knowledge' ? (currentDocsScope() === 'none' ? 'Открытые документы остаются на телефоне' : 'Документы заранее: все')
      : lp ? 'Скачано заранее: ' + when(lp.at) : 'Заранее ещё не скачивалось — скачается, когда будет связь';
    out.push({ row, keep, codeBytes: row.code.reduce((a, g) => a + (code[g] || 0), 0), copyBytes,
      fileBytes: row.files === 'knowledge' ? files.knowledge : row.files === 'quality' ? files.quality : 0, scope, roleScope, last });
  }
  return { rows: out, total: { used, free }, role };
}

function ensureCss(doc: Document): void {
  if (doc.getElementById('p2o-css')) return;
  const s = doc.createElement('style'); s.id = 'p2o-css'; s.textContent = OFFLINE_MODULES_CSS; doc.head.appendChild(s);
}

function confirmBox(doc: Document, title: string, text: string, yes: string, danger: boolean): Promise<boolean> {
  return new Promise((res) => {
    const d = doc.createElement('div');
    d.className = 'p2o-dlg'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('data-testid', 'p2o-confirm');
    d.innerHTML = `<div class="p2o-dlg__box"><div class="p2o-dlg__t">${esc(title)}</div><div class="p2o-dlg__p">${esc(text)}</div>` +
      `<div class="p2o__btns"><button type="button" class="p2o__btn ${danger ? 'p2o__btn--danger' : 'p2o__btn--main'}" data-yes style="flex:1">${esc(yes)}</button>` +
      `<button type="button" class="p2o__btn" data-no style="flex:1">${danger ? 'Отмена' : 'Оставить'}</button></div></div>`;
    const done = (v: boolean): void => { d.remove(); res(v); };
    d.addEventListener('click', (e) => { const t = e.target as HTMLElement; if (t.closest('[data-yes]')) done(true); else if (t.closest('[data-no]') || t === d) done(false); });
    doc.body.appendChild(d);
    (d.querySelector('[data-yes]') as HTMLElement).focus();
  });
}

let busy = false;
let wired: HTMLElement | null = null;
let shownAt = 0;
/** Экран перерисовывается вместе с карточкой «Отправка» (раз в 15 с) — данные блока читаются не чаще раза в 10 с, после действия — сразу. */
const EVERY_MS = 10000;
/** Нарисовать блок в slot (вызывает «Данные на устройстве», net-status.ts). Только вошедшему почтой. */
export async function renderOfflineModules(slot: HTMLElement | null, force = false): Promise<void> {
  if (!slot || busy) return;
  if (!force && wired === slot && slot.firstChild && Date.now() - shownAt < EVERY_MS) return;
  const doc = slot.ownerDocument;
  if (!currentSlot()) { slot.replaceChildren(); return; }
  busy = true;
  try {
    ensureCss(doc);
    const win = doc.defaultView as unknown as W;
    const s = await readModules(win);
    const html = modulesHtml(s.rows, s.total, ROLE_LABEL[s.role] || 'просмотр');
    if (slot.dataset.p2o !== html) { slot.dataset.p2o = html; slot.innerHTML = html; }
    if (wired !== slot) { wired = slot; wire(slot, win); }
    (slot as HTMLElement & { __p2oRows?: ModuleState[] }).__p2oRows = s.rows;
    shownAt = Date.now();
  } finally { busy = false; }
}

function wire(slot: HTMLElement, win: W): void {
  const doc = slot.ownerDocument;
  const rowsNow = (): ModuleState[] => (slot as HTMLElement & { __p2oRows?: ModuleState[] }).__p2oRows || [];
  const rerender = (): void => { void renderOfflineModules(slot, true); };
  const toast = (m: string): void => { if (typeof win.showToast === 'function') win.showToast(m); };
  slot.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const mod = t.dataset.mod || '';
    if (t.dataset.act === 'scope') { setFilesChoice(mod, t.value as FilesScope); rerender(); return; }
    if (t.dataset.act !== 'keep') return;
    const box = t as HTMLInputElement;
    if (box.checked) { setKeepOffline(mod, true); rerender(); if (mod === 'planfact' || mod === 'company') void win.RBI?.offlinePrefetch?.[mod]?.(true); return; }
    box.checked = true;   // выключение — с подтверждением
    const name = rowsNow().find((r) => r.row.id === mod)?.row.name || '';
    const text = mod === 'quality' ? 'Записи останутся на телефоне — без них Качество не работает. Фото и PDF заранее скачиваться не будут, открытые останутся.'
      : 'Заранее ничего не будет скачиваться. Без сети раздел покажет только то, что вы открывали с интернетом.';
    void confirmBox(doc, `Не держать ${name} без сети?`, text, 'Выключить', false).then((ok) => { if (ok) { setKeepOffline(mod, false); rerender(); } });
  });
  slot.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button[data-act]') as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    const mod = b.dataset.mod || '';
    const act = b.dataset.act;
    if (act === 'download') {
      b.disabled = true;
      const run = mod === 'quality' ? win.downloadMissingCloudFiles?.(false, 'auto') : mod === 'knowledge' ? win.downloadMissingCloudFiles?.(false, 'knowledge')
        : win.RBI?.offlinePrefetch?.[mod]?.(true);
      if (mod === 'planfact' || mod === 'company') toast('⏳ Скачиваем ' + (mod === 'planfact' ? 'План/Факт' : '«Компанию»') + ' для работы без сети…');
      void Promise.resolve(run).catch(() => undefined).then(() => { if (mod === 'planfact' || mod === 'company') toast('✅ Скачано для работы без сети'); rerender(); });
      return;
    }
    if (act === 'reports') { void Promise.resolve(win.downloadMissingCloudFiles?.(false, 'reports')).then(rerender); return; }
    if (act === 'clear') {
      const m = rowsNow().find((r) => r.row.id === mod);
      const bytes = m ? m.copyBytes + m.fileBytes : 0;
      void confirmBox(doc, `Очистить скачанное: ${m ? m.row.name : ''}?`,
        `Освободится до ${mb(bytes)}. Неотправленные записи и фото останутся на телефоне и уйдут, когда будет связь. Открытое снова скачается, когда понадобится.`,
        'Очистить ' + mb(bytes), true).then(async (ok) => {
        if (!ok) return;
        let freed = 0;
        if (mod === 'planfact' || mod === 'company') { freed = m ? m.copyBytes : 0; await offlineReader().clear(mod); }
        else if (win.RbiStorageManager?.runManualRecoverableCacheCleanup) {
          const res = await win.RbiStorageManager.runManualRecoverableCacheCleanup({ only: mod === 'knowledge' ? 'knowledge' : 'quality', noRefill: true, silent: true });
          freed = (res && res.freedBytes) || 0;
        }
        toast(`✅ Освобождено ${mb(freed)}. Неотправленное на месте`);
        rerender();
      });
    }
  });
}
