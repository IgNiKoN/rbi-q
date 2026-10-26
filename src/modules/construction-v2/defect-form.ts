/**
 * Модалка create/view замечания construction-v2 ≈ ConstDefectForm + мультифото.
 */

import type {
  ConstructionDefectV2,
  DefectCategoryV2,
  DefectHistoryEntryV2,
  DefectStatusV2
} from '../../services/construction-defects/types';
import { DEFECT_CATEGORIES_V2 } from '../../services/construction-defects/types';
import { isContractorRole, resolveMyContractorId } from './contractor-scope';

export type DefectFormCreateInput = {
  locationId: string;
  x: number;
  y: number;
  description: string;
  category: DefectCategoryV2;
  contractorId: string | null;
  deadline: string | null;
  template_key: string | null;
  item_id: string | null;
  item_name: string | null;
  norm_text: string | null;
  photos: string[];
};

export type DefectFormEditInput = {
  description: string;
  category: DefectCategoryV2;
  contractorId: string | null;
  deadline: string | null;
  template_key: string | null;
  item_id: string | null;
  item_name: string | null;
  norm_text: string | null;
  photos: string[];
};

export type DefectFormChangeStatusInput = {
  status: DefectStatusV2;
  comment?: string | null;
  photos?: string[];
};

type ContractorOpt = { id: string; label: string };
type TmplItem = { id: string; n: string; t?: string; w?: number; ndId?: string | null };
type TmplGroup = { items?: TmplItem[] };

type KnowledgeHelpSvc = {
  openItemHelp?: (
    itemId: string | number,
    ev?: Event,
    ctx?: { templateKey?: string; checklist?: unknown }
  ) => void;
  findAndOpenND?: (normText: string) => void;
  openDocViewer?: (id: string) => void;
};

function _knowledgeSvc(): KnowledgeHelpSvc | undefined {
  return window.RBI?.services?.knowledge as KnowledgeHelpSvc | undefined;
}

function _helpButtonsHtml(): string {
  return `<div class="flex gap-2 mt-2" data-c2-help-actions>
      <button type="button" data-c2-item-help
        class="flex-1 px-2 py-1.5 rounded-lg text-rbi-caption font-black uppercase tracking-wide bg-brand-soft text-brand border border-brand-soft">
        ${_escape(_t('construction.form.btn_help', 'Справка'))}
      </button>
      <button type="button" data-c2-item-norm
        class="flex-1 px-2 py-1.5 rounded-lg text-rbi-caption font-black uppercase tracking-wide bg-slate-100 text-ink border border-surface">
        ${_escape(_t('construction.form.btn_norm', 'Норматив'))}
      </button>
    </div>`;
}

function _openDefectItemHelp(panel: HTMLElement, event?: Event): void {
  const itemId =
    (panel.querySelector('[data-c2-item-id]') as HTMLInputElement)?.value?.trim() || '';
  if (!itemId) {
    window.showToast?.(
      _t('construction.form.toast_select_item_help', 'Выберите пункт чек-листа')
    );
    return;
  }
  const templateKey =
    (panel.querySelector('[data-c2-template]') as HTMLSelectElement)?.value || '';
  const groups = _resolveTemplateGroups(templateKey);
  const helpCtx = { templateKey: templateKey || undefined, checklist: groups };
  const svc = _knowledgeSvc();
  if (svc && typeof svc.openItemHelp === 'function') {
    svc.openItemHelp(itemId, event, helpCtx);
    return;
  }
  const openMenu = (
    window as unknown as {
      openItemHelpMenu?: (
        itemId: string | number,
        ev?: Event,
        ctx?: { templateKey?: string; checklist?: unknown }
      ) => void;
    }
  ).openItemHelpMenu;
  if (typeof openMenu === 'function') {
    openMenu(itemId, event, helpCtx);
    return;
  }
  window.showToast?.(
    _t('construction.v2.acc.knowledge_unavailable', 'База знаний недоступна')
  );
}

function _openDefectNorm(panel: HTMLElement): void {
  const templateKey =
    (panel.querySelector('[data-c2-template]') as HTMLSelectElement)?.value || '';
  const itemId =
    (panel.querySelector('[data-c2-item-id]') as HTMLInputElement)?.value?.trim() || '';
  const normText =
    (panel.querySelector('[data-c2-norm-text]') as HTMLElement)?.textContent?.trim() || '';
  const flat = _flatItems(_resolveTemplateGroups(templateKey));
  const item = flat.find((i) => String(i.id) === String(itemId));
  const ndId = item?.ndId ? String(item.ndId) : '';
  const svc = _knowledgeSvc();
  if (ndId && svc && typeof svc.openDocViewer === 'function') {
    svc.openDocViewer(ndId);
    return;
  }
  if (!normText) {
    window.showToast?.(
      _t('construction.form.toast_no_norm', 'Норматив не указан')
    );
    return;
  }
  if (svc && typeof svc.findAndOpenND === 'function') {
    svc.findAndOpenND(normText);
    return;
  }
  const findNd = (window as unknown as { findAndOpenND?: (t: string) => void }).findAndOpenND;
  if (typeof findNd === 'function') {
    findNd(normText);
    return;
  }
  window.showToast?.(
    _t('construction.v2.acc.knowledge_unavailable', 'База знаний недоступна')
  );
}

function _bindHelpActions(panel: HTMLElement): void {
  panel.querySelector('[data-c2-item-help]')?.addEventListener('click', (ev) => {
    _openDefectItemHelp(panel, ev);
  });
  panel.querySelector('[data-c2-item-norm]')?.addEventListener('click', () => {
    _openDefectNorm(panel);
  });
}

function _t(key: string, fallback: string, vars?: Record<string, string | number>): string {
  try {
    const i18n = window.RBI?.services?.i18n as
      | { t?: (k: string, v?: Record<string, string | number>) => string }
      | undefined;
    if (i18n && typeof i18n.t === 'function') {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
    /* ignore */
  }
  if (!vars) return fallback;
  return String(fallback).replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}

function _escape(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Срок по умолчанию при выдаче: сегодня + 14 дней (локальная дата). Инженер может изменить. */
function _defaultDeadline(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** formatNorms() даёт HTML — в textarea/описании нужны только текст (как legacy ConstDefectForm). */
function _stripHtml(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function _setNormDisplay(el: HTMLElement | null, raw: string): void {
  if (!el) return;
  const s = String(raw || '');
  if (/<[a-z][\s\S]*>/i.test(s)) el.innerHTML = s;
  else el.textContent = s;
}

function _autoDescription(name: string, normRaw: string): string {
  let auto = _t('construction.form.violation_prefix', 'Нарушение: {name}.', { name });
  const cleanNorm = _stripHtml(normRaw);
  const noNorm = _t('construction.form.no_norm', 'Без норматива');
  if (cleanNorm && cleanNorm !== noNorm) {
    auto += _t('construction.form.requirements_prefix', ' Требования: {norm}', { norm: cleanNorm });
  }
  return auto;
}

function _contractors(): ContractorOpt[] {
  const svc = window.RBI?.services?.contractors as
    | { list?: () => Array<{ id?: string; display_name?: string; displayName?: string }> }
    | undefined;
  const rows = typeof svc?.list === 'function' ? svc.list() : [];
  return (rows || [])
    .filter((r) => r && r.id)
    .map((r) => ({
      id: String(r.id),
      label: String(r.display_name || r.displayName || r.id)
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}

function _sysTemplates(): Record<string, { title?: string; groups?: TmplGroup[] }> {
  return (
    (window as unknown as { SYSTEM_TEMPLATES?: Record<string, { title?: string; groups?: TmplGroup[] }> })
      .SYSTEM_TEMPLATES || {}
  );
}

function _userTemplates(): Record<string, { title?: string; groups?: TmplGroup[] }> {
  return (
    (window as unknown as { userTemplates?: Record<string, { title?: string; groups?: TmplGroup[] }> })
      .userTemplates || {}
  );
}

function _flatItems(groups: TmplGroup[] | undefined): TmplItem[] {
  const items: TmplItem[] = [];
  (groups || []).forEach((g) => {
    if (g?.items) items.push(...g.items);
  });
  return items;
}

function _resolveTemplateGroups(tmplKey: string): TmplGroup[] {
  if (!tmplKey) return [];
  const type = tmplKey.split('_')[0];
  const key = tmplKey.replace(type + '_', '');
  if (type === 'sys') return _sysTemplates()[key]?.groups || [];
  if (type === 'user') return _userTemplates()[key]?.groups || [];
  return [];
}

function _catLabel(c: string): string {
  if (c === 'B1' || c === 'minor') return _t('construction.form.cat_b1', 'B1 (Мелкий)');
  if (c === 'B3' || c === 'critical') return _t('construction.form.cat_b3', 'B3 (Критика)');
  return _t('construction.form.cat_b2', 'B2 (Значимый)');
}

function _statusLabel(s: string): string {
  const map: Record<string, [string, string]> = {
    issued: ['construction.status.issued', 'Выдано'],
    in_progress: ['construction.status.in_progress', 'В работе'],
    fixed: ['construction.form.status_fixed', 'Устранено'],
    closed: ['construction.status.closed', 'Закрыто'],
    rejected: ['construction.status.rejected', 'Отклонено'],
    open: ['construction.status.issued', 'Выдано'],
    cancelled: ['construction.status.rejected', 'Отклонено']
  };
  const entry = map[s];
  return entry ? _t(entry[0], entry[1]) : s;
}

function _deadlineInputValue(v: unknown): string {
  if (v == null || v === '') return '';
  const m = String(v).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function _roleInfo() {
  const perms = window.RBI?.services?.permissions as
    | {
        getCurrentRole?: () => string;
        isEngineerOrAdmin?: () => boolean;
      }
    | undefined;
  const role = perms?.getCurrentRole?.() || 'guest';
  const isEngineer = perms?.isEngineerOrAdmin?.() ?? ['engineer', 'manager', 'deputy_manager', 'admin'].includes(role);
  const isContractor = role === 'contractor';
  return { role, isEngineer, isContractor };
}

function _photoSrc(ref: string): string {
  if (!ref) return '';
  const pm = (window as unknown as { PhotoManager?: { getDisplaySrc?: (u: string) => string; getSrc?: (u: string) => string } })
    .PhotoManager;
  if (pm?.getDisplaySrc) return pm.getDisplaySrc(ref) || ref;
  if (pm?.getSrc) return pm.getSrc(ref) || ref;
  const g =
    (window as unknown as { getPhotoThumbSrc?: (u: string) => string; getPhotoSrc?: (u: string) => string })
      .getPhotoThumbSrc ||
    (window as unknown as { getPhotoSrc?: (u: string) => string }).getPhotoSrc;
  return (typeof g === 'function' ? g(ref) : null) || ref;
}

function _openPhoto(ref: string) {
  const fn = (window as unknown as { openPhotoViewer?: (u: string) => void }).openPhotoViewer;
  if (typeof fn === 'function') fn(ref);
}

async function _fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error(_t('construction.form.file_read_error', 'Не удалось прочитать файл')));
    r.readAsDataURL(file);
  });
}

async function _savePhotoFiles(files: FileList | File[]): Promise<string[]> {
  const list = Array.from(files || []).filter((f) => f && f.type && f.type.startsWith('image/'));
  if (!list.length) return [];
  const pm = (window as unknown as { PhotoManager?: { saveLocal?: (data: string, prefix?: string, meta?: object) => Promise<string> } })
    .PhotoManager;
  const out: string[] = [];
  for (const file of list) {
    const dataUrl = await _fileToDataUrl(file);
    if (!dataUrl.startsWith('data:')) continue;
    if (pm?.saveLocal) {
      const id = await pm.saveLocal(dataUrl, 'cdef', { entityType: 'construction_defect_v2' });
      if (id) out.push(id);
    } else {
      out.push(dataUrl);
    }
  }
  return out;
}

function _ensureOverlay(): HTMLElement {
  let el = document.getElementById('c2-defect-modal');
  if (el) {
    el.style.zIndex = '1200';
    return el;
  }
  el = document.createElement('div');
  el.id = 'c2-defect-modal';
  // Inline z-index: выше plan fullscreen (1100); Tailwind CDN z-[N] ненадёжен
  el.className = 'fixed inset-0 hidden items-center justify-center bg-black/40 p-3';
  el.style.zIndex = '1200';
  el.innerHTML = `<div class="w-full max-w-md max-h-[92vh] overflow-y-auto bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-xl p-4" data-c2-defect-panel></div>`;
  document.body.appendChild(el);
  return el;
}

export function closeDefectForm() {
  const el = document.getElementById('c2-defect-modal');
  if (!el) return;
  el.classList.add('hidden');
  el.classList.remove('flex');
}

function _templateOptionsHtml(selected?: string | null): string {
  let html = `<option value="">${_escape(_t('construction.form.work_type_select', '— вид работ —'))}</option>`;
  const st = _sysTemplates();
  Object.keys(st)
    .sort()
    .forEach((k) => {
      const sel = selected === `sys_${k}` ? ' selected' : '';
      html += `<option value="sys_${_escape(k)}"${sel}>[СИС] ${_escape(st[k].title || k)}</option>`;
    });
  const ut = _userTemplates();
  Object.keys(ut)
    .sort()
    .forEach((k) => {
      const sel = selected === `user_${k}` ? ' selected' : '';
      html += `<option value="user_${_escape(k)}"${sel}>[МОЙ] ${_escape(ut[k].title || k)}</option>`;
    });
  return html;
}

function _contractorOptionsHtml(selected?: string | null): string {
  const opts = _contractors();
  return (
    `<option value="">${_escape(_t('construction.form.no_contractor', '— без подрядчика —'))}</option>` +
    opts
      .map((o) => {
        const sel = selected === o.id ? ' selected' : '';
        return `<option value="${_escape(o.id)}"${sel}>${_escape(o.label)}</option>`;
      })
      .join('')
  );
}

function _renderGallery(photos: string[]): string {
  if (!photos.length) {
    return `<div class="text-rbi-caption text-muted mb-2" data-c2-photo-empty>${_escape(_t('construction.form.no_photos', 'Нет фото'))}</div>`;
  }
  return `<div class="grid grid-cols-3 gap-2 mb-2" data-c2-photo-grid>
    ${photos
      .map(
        (p, i) => `<div class="relative aspect-square rounded-xl overflow-hidden border border-surface" data-c2-photo-idx="${i}">
      <img src="${_escape(_photoSrc(p))}" alt="" class="w-full h-full object-cover cursor-pointer" data-c2-photo-view="${_escape(p)}" />
      <button type="button" data-c2-photo-remove="${i}"
        class="absolute top-1 right-1 w-6 h-6 rounded-full bg-danger text-white text-rbi-label font-black">✕</button>
    </div>`
      )
      .join('')}
  </div>`;
}

function _bindGallery(
  panel: HTMLElement,
  photosRef: { current: string[] },
  onChange: () => void
) {
  const refresh = () => {
    const host = panel.querySelector('[data-c2-photo-host]') as HTMLElement | null;
    if (host) host.innerHTML = _renderGallery(photosRef.current);
    _bindGallery(panel, photosRef, onChange);
  };
  panel.querySelectorAll('[data-c2-photo-view]').forEach((el) => {
    el.addEventListener('click', () => {
      const ref = (el as HTMLElement).getAttribute('data-c2-photo-view') || '';
      if (ref) _openPhoto(ref);
    });
  });
  panel.querySelectorAll('[data-c2-photo-remove]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      const idx = Number((el as HTMLElement).getAttribute('data-c2-photo-remove'));
      if (!Number.isFinite(idx)) return;
      photosRef.current = photosRef.current.filter((_, i) => i !== idx);
      refresh();
      onChange();
    });
  });
  const input = panel.querySelector('[data-c2-photo-input]') as HTMLInputElement | null;
  if (input && !(input as HTMLInputElement & { _c2Bound?: boolean })._c2Bound) {
    (input as HTMLInputElement & { _c2Bound?: boolean })._c2Bound = true;
    input.addEventListener('change', async () => {
      try {
        const added = await _savePhotoFiles(input.files || []);
        if (added.length) {
          photosRef.current = photosRef.current.concat(added);
          refresh();
          onChange();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        window.showToast?.('❌ ' + msg);
      } finally {
        input.value = '';
      }
    });
  }
}

function _bindItemSearch(panel: HTMLElement) {
  const search = panel.querySelector('[data-c2-item-search]') as HTMLInputElement | null;
  const dd = panel.querySelector('[data-c2-item-dd]') as HTMLElement | null;
  const tmpl = panel.querySelector('[data-c2-template]') as HTMLSelectElement | null;
  const itemIdEl = panel.querySelector('[data-c2-item-id]') as HTMLInputElement | null;
  const itemNameEl = panel.querySelector('[data-c2-item-name]') as HTMLInputElement | null;
  const normBlock = panel.querySelector('[data-c2-norm-block]') as HTMLElement | null;
  const normText = panel.querySelector('[data-c2-norm-text]') as HTMLElement | null;
  const desc = panel.querySelector('[data-c2-defect-desc]') as HTMLTextAreaElement | null;
  const cat = panel.querySelector('[data-c2-defect-cat]') as HTMLSelectElement | null;

  const hideDd = () => dd?.classList.add('hidden');

  tmpl?.addEventListener('change', () => {
    if (itemIdEl) itemIdEl.value = '';
    if (itemNameEl) itemNameEl.value = '';
    if (search) search.value = '';
    normBlock?.classList.add('hidden');
    hideDd();
  });

  const runSearch = (query: string) => {
    if (!dd) return;
    const tmplKey = tmpl?.value || '';
    if (!tmplKey) {
      dd.innerHTML =
        `<div class="p-3 text-rbi-caption text-muted font-bold text-center">${_escape(_t('construction.form.select_work_first', 'Сначала выберите вид работ'))}</div>`;
      dd.classList.remove('hidden');
      return;
    }
    const flat = _flatItems(_resolveTemplateGroups(tmplKey));
    const q = query.toLowerCase().trim();
    const matched = flat.filter(
      (i) => i.n?.toLowerCase().includes(q) || (i.t && i.t.toLowerCase().includes(q))
    );
    if (!matched.length) {
      dd.innerHTML =
        `<div class="p-3 text-rbi-caption text-muted font-bold text-center">${_escape(_t('construction.form.search_empty', 'Ничего не найдено'))}</div>`;
      dd.classList.remove('hidden');
      return;
    }
    dd.innerHTML = matched
      .map((i) => {
        const w = Number(i.w) || 2;
        return `<button type="button" class="w-full text-left p-2 border-b border-slate-100 dark:border-slate-700 hover:bg-brand-soft"
          data-c2-pick-item data-id="${_escape(i.id)}" data-name="${_escape(i.n)}" data-w="${w}" data-norm="${_escape(i.t || '')}">
          <div class="text-rbi-label font-bold text-ink leading-tight">
            <span class="text-rbi-caption font-black text-white bg-slate-400 px-1 rounded mr-1">B${w}</span>${_escape(i.n)}
          </div>
        </button>`;
      })
      .join('');
    dd.classList.remove('hidden');
    dd.querySelectorAll('[data-c2-pick-item]').forEach((btn) => {
      btn.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        const el = btn as HTMLElement;
        const id = el.getAttribute('data-id') || '';
        const name = el.getAttribute('data-name') || '';
        const w = Number(el.getAttribute('data-w') || 2);
        const norm = el.getAttribute('data-norm') || '';
        if (itemIdEl) itemIdEl.value = id;
        if (itemNameEl) itemNameEl.value = name;
        if (search) search.value = name;
        if (normBlock) {
          _setNormDisplay(normText, norm || '');
          normBlock.classList.remove('hidden');
        }
        if (desc) desc.value = _autoDescription(name, norm || '');
        if (cat) {
          if (w === 1) cat.value = 'B1';
          else if (w === 3) cat.value = 'B3';
          else cat.value = 'B2';
        }
        hideDd();
      });
    });
  };

  search?.addEventListener('input', () => runSearch(search.value));
  search?.addEventListener('focus', () => runSearch(search.value));
  search?.addEventListener('blur', () => setTimeout(hideDd, 150));
}

function _readCommonFields(panel: HTMLElement) {
  const description =
    (panel.querySelector('[data-c2-defect-desc]') as HTMLTextAreaElement)?.value?.trim() || '';
  const category = ((panel.querySelector('[data-c2-defect-cat]') as HTMLSelectElement)?.value ||
    'B2') as DefectCategoryV2;
  const contractorId =
    (panel.querySelector('[data-c2-defect-contractor]') as HTMLSelectElement)?.value || '';
  const deadlineRaw =
    (panel.querySelector('[data-c2-defect-deadline]') as HTMLInputElement)?.value || '';
  const template_key =
    (panel.querySelector('[data-c2-template]') as HTMLSelectElement)?.value || '';
  const item_id = (panel.querySelector('[data-c2-item-id]') as HTMLInputElement)?.value || '';
  const item_name =
    (panel.querySelector('[data-c2-item-name]') as HTMLInputElement)?.value ||
    (panel.querySelector('[data-c2-item-search]') as HTMLInputElement)?.value ||
    '';
  const normEl = panel.querySelector('[data-c2-norm-text]') as HTMLElement | null;
  const norm_text = _stripHtml(normEl?.textContent || normEl?.innerHTML || '');
  return {
    description: _stripHtml(description) || description,
    category,
    contractorId: contractorId || null,
    deadline: deadlineRaw || null,
    template_key: template_key || null,
    item_id: item_id || null,
    item_name: item_name || null,
    norm_text: norm_text || null
  };
}

function _historyHtml(history: unknown): string {
  const list = Array.isArray(history) ? (history as DefectHistoryEntryV2[]) : [];
  if (!list.length) return '';
  const rows = [...list].reverse().map((h) => {
    const stName = _statusLabel(String(h.status || ''));
    let dDate = '';
    try {
      dDate = new Date(h.date).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      dDate = String(h.date || '');
    }
    const photos = Array.isArray(h.photos) && h.photos.length ? h.photos : h.photo ? [h.photo] : [];
    const photosHtml = photos
      .map(
        (p) =>
          `<img src="${_escape(_photoSrc(String(p)))}" class="w-10 h-10 object-cover rounded border cursor-pointer mt-1" data-c2-photo-view="${_escape(String(p))}" alt="" />`
      )
      .join('');
    return `<div class="bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800 text-rbi-caption">
      <div class="flex justify-between font-bold mb-1"><span class="text-brand">${_escape(stName)}</span><span class="text-muted">${_escape(dDate)}</span></div>
      <div class="text-ink">${_escape(h.user || '')}${h.comment ? ` — <i>${_escape(String(h.comment))}</i>` : ''}</div>
      <div class="flex gap-1 flex-wrap">${photosHtml}</div>
    </div>`;
  });
  return `<div class="w-full mt-3 pt-3 border-t border-surface flex flex-col gap-2 max-h-36 overflow-y-auto" data-c2-history>
    ${rows.join('')}
  </div>`;
}

export function openCreateDefectForm(
  coords: { locationId: string; x: number; y: number },
  onSave: (input: DefectFormCreateInput) => void | Promise<void>,
  onCancel?: () => void,
  prefill?: {
    template_key?: string | null;
    item_id?: string | null;
    item_name?: string | null;
    norm_text?: string | null;
    description?: string | null;
  }
): void {
  const root = _ensureOverlay();
  const panel = root.querySelector('[data-c2-defect-panel]') as HTMLElement;
  const photosRef = { current: [] as string[] };
  const catOpts = DEFECT_CATEGORIES_V2.map(
    (c) => `<option value="${c}"${c === 'B2' ? ' selected' : ''}>${_escape(_catLabel(c))}</option>`
  ).join('');
  const deadlineDefault = _defaultDeadline();
  const prefillNormRaw = prefill?.norm_text || '';
  const prefillDesc =
    prefill?.description != null && String(prefill.description).trim()
      ? _stripHtml(String(prefill.description))
      : prefill?.item_name
        ? _autoDescription(String(prefill.item_name), prefillNormRaw)
        : '';

  panel.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-rbi-body font-black uppercase tracking-tight">${_escape(_t('construction.form.new_defect', 'Новое замечание'))}</h3>
      <button type="button" data-c2-defect-close class="text-muted text-rbi-label font-bold uppercase">${_escape(_t('construction.form.close', 'Закрыть'))}</button>
    </div>
    <p class="text-rbi-caption text-muted mb-3">${_escape(_t('construction.form.coords', 'Координаты: {x}% × {y}%', { x: coords.x.toFixed(1), y: coords.y.toFixed(1) }))}</p>
    <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape(_t('construction.form.work_type_label', 'Вид работ (чек-лист) *'))}</label>
    <select data-c2-template class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body mb-3">
      ${_templateOptionsHtml(prefill?.template_key)}
    </select>
    <div class="relative mb-3">
      <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape(_t('construction.form.violation_label', 'Нарушение *'))}</label>
      <input type="text" data-c2-item-search autocomplete="off" placeholder="${_escape(_t('construction.form.violation_placeholder', 'Начните вводить нарушение...'))}"
        class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body"
        value="${_escape(prefill?.item_name || '')}" />
      <input type="hidden" data-c2-item-id value="${_escape(prefill?.item_id || '')}" />
      <input type="hidden" data-c2-item-name value="${_escape(prefill?.item_name || '')}" />
      <div data-c2-item-dd class="absolute top-[48px] left-0 right-0 bg-white dark:bg-slate-800 border border-surface shadow-2xl rounded-xl z-[150] hidden max-h-48 overflow-y-auto"></div>
    </div>
    <div data-c2-norm-block class="${prefillNormRaw || prefill?.item_id ? '' : 'hidden'} bg-slate-50 dark:bg-slate-900 border border-surface p-2.5 rounded-xl mb-3">
      <div class="text-rbi-caption font-black uppercase text-brand mb-1">${_escape(_t('construction.form.norm_ref', 'Справочно (Норматив)'))}</div>
      <div data-c2-norm-text class="text-rbi-caption text-muted font-medium"></div>
      ${_helpButtonsHtml()}
    </div>
    <div class="grid grid-cols-2 gap-2 mb-3">
      <div>
        <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape(_t('construction.form.category', 'Категория'))}</label>
        <select data-c2-defect-cat class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body">
          ${catOpts}
        </select>
      </div>
      <div>
        <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape(_t('construction.form.deadline', 'Срок'))}</label>
        <input type="date" data-c2-defect-deadline value="${_escape(deadlineDefault)}"
          class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body" />
      </div>
    </div>
    <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape(_t('construction.form.contractor', 'Подрядчик'))}</label>
    <select data-c2-defect-contractor class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body mb-3">
      ${_contractorOptionsHtml()}
    </select>
    <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape(_t('construction.form.description', 'Описание'))}</label>
    <textarea data-c2-defect-desc rows="3"
      class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body mb-3">${_escape(prefillDesc)}</textarea>
    <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape(_t('construction.form.photos', 'Фото'))}</label>
    <div data-c2-photo-host>${_renderGallery([])}</div>
    <input type="file" accept="image/*" multiple class="hidden" data-c2-photo-input />
    <button type="button" data-c2-photo-add
      class="w-full mb-4 bg-slate-50 dark:bg-slate-900 border border-dashed border-surface text-muted py-3 rounded-xl text-rbi-caption font-bold uppercase">
      + ${_escape(_t('construction.form.add_photo', '+ Добавить фото'))}
    </button>
    <div class="flex gap-2 justify-end">
      <button type="button" data-c2-defect-close class="px-3 py-2 rounded-xl text-rbi-label font-bold uppercase text-muted">${_escape(_t('construction.form.cancel', 'Отмена'))}</button>
      <button type="button" data-c2-defect-save class="px-4 py-2 rounded-xl text-rbi-label font-black uppercase bg-brand text-white">${_escape(_t('construction.form.save', 'Сохранить'))}</button>
    </div>`;

  root.classList.remove('hidden');
  root.classList.add('flex');

  if (prefillNormRaw) {
    _setNormDisplay(panel.querySelector('[data-c2-norm-text]') as HTMLElement | null, prefillNormRaw);
  }

  _bindItemSearch(panel);
  _bindHelpActions(panel);
  _bindGallery(panel, photosRef, () => {});
  panel.querySelector('[data-c2-photo-add]')?.addEventListener('click', () => {
    (panel.querySelector('[data-c2-photo-input]') as HTMLInputElement)?.click();
  });

  const cancel = () => {
    closeDefectForm();
    onCancel?.();
  };
  panel.querySelectorAll('[data-c2-defect-close]').forEach((btn) => {
    btn.addEventListener('click', cancel);
  });
  root.onclick = (ev) => {
    if (ev.target === root) cancel();
  };
  panel.querySelector('[data-c2-defect-save]')?.addEventListener('click', async () => {
    const fields = _readCommonFields(panel);
    if (!fields.template_key) {
      window.showToast?.(_t('construction.form.toast_select_work', 'Выберите вид работ (чек-лист)'));
      return;
    }
    if (!fields.item_id && !fields.item_name) {
      window.showToast?.(_t('construction.form.toast_select_violation', 'Выберите нарушение из списка'));
      return;
    }
    const description = fields.description || fields.item_name || '';
    if (!description) {
      window.showToast?.(_t('construction.form.toast_desc_required', 'Укажите описание замечания'));
      return;
    }
    try {
      await onSave({
        locationId: coords.locationId,
        x: coords.x,
        y: coords.y,
        description,
        category: fields.category,
        contractorId: fields.contractorId,
        deadline: fields.deadline,
        template_key: fields.template_key,
        item_id: fields.item_id,
        item_name: fields.item_name,
        norm_text: fields.norm_text,
        photos: photosRef.current.slice()
      });
      closeDefectForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.showToast?.('❌ ' + msg);
    }
  });
}

function _actionButtonsHtml(defect: ConstructionDefectV2): string {
  const { isEngineer, isContractor } = _roleInfo();
  const st = String(defect.status || 'issued');
  if (st === 'issued') {
    if (isContractor) {
      return `<button type="button" data-c2-status="in_progress" class="flex-1 bg-blue-50 text-blue-600 border border-blue-200 py-2.5 rounded-xl text-rbi-label font-bold uppercase">${_escape(_t('construction.form.action_in_progress', 'В работу'))}</button>
        <button type="button" data-c2-status="fixed" class="flex-[1.5] bg-green-600 text-white py-2.5 rounded-xl text-rbi-label font-black uppercase">${_escape(_t('construction.form.action_fixed_photo', 'Устранено (Фото)'))}</button>`;
    }
    if (isEngineer) {
      return `<button type="button" data-c2-defect-delete class="bg-danger-soft text-danger py-2.5 px-3 rounded-xl text-rbi-label font-bold uppercase border border-danger-soft">🗑️</button>
        <button type="button" data-c2-defect-save class="flex-1 bg-brand text-white py-2.5 rounded-xl text-rbi-label font-black uppercase">${_escape(_t('construction.form.action_update', '💾 Обновить'))}</button>`;
    }
  } else if (st === 'in_progress') {
    if (isContractor) {
      return `<button type="button" data-c2-status="fixed" class="w-full bg-green-600 text-white py-2.5 rounded-xl text-rbi-label font-black uppercase">${_escape(_t('construction.form.action_fixed_attach', 'Устранено (Приложить фото)'))}</button>`;
    }
    return `<div class="text-center w-full text-rbi-label font-bold text-blue-500 py-2">${_escape(_t('construction.form.contractor_working', 'Подрядчик взял в работу'))}</div>`;
  } else if (st === 'fixed') {
    if (isEngineer) {
      return `<button type="button" data-c2-status="rejected" class="flex-1 bg-danger-soft text-danger border border-danger-soft py-2.5 rounded-xl text-rbi-label font-bold uppercase">${_escape(_t('construction.form.action_reject', '❌ Отклонить'))}</button>
        <button type="button" data-c2-status="closed" class="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-rbi-label font-black uppercase">${_escape(_t('construction.form.action_accept', '✅ Принять'))}</button>`;
    }
    return `<div class="text-center w-full text-rbi-label font-bold text-green-500 py-2">${_escape(_t('construction.form.awaiting_review', 'Ожидает проверки инженером'))}</div>`;
  } else if (st === 'closed') {
    return `<div class="text-center w-full text-rbi-label font-black text-green-600 py-2">${_escape(_t('construction.form.defect_closed', 'Дефект закрыт'))}</div>`;
  } else if (st === 'rejected') {
    if (isContractor) {
      return `<button type="button" data-c2-status="fixed" class="w-full bg-orange-500 text-white py-2.5 rounded-xl text-rbi-label font-black uppercase">${_escape(_t('construction.form.resubmit_photo', 'Повторно предъявить (Фото)'))}</button>`;
    }
    if (isEngineer) {
      return `<button type="button" data-c2-defect-save class="flex-1 bg-brand text-white py-2.5 rounded-xl text-rbi-label font-black uppercase">${_escape(_t('construction.form.action_update', '💾 Обновить'))}</button>`;
    }
  }
  return `<button type="button" data-c2-defect-close class="px-3 py-2 rounded-xl text-rbi-label font-bold uppercase text-muted">${_escape(_t('construction.form.close', 'Закрыть'))}</button>`;
}

export function openViewDefectForm(
  defect: ConstructionDefectV2,
  onDelete: (id: string) => void | Promise<void>,
  onSave?: (id: string, patch: DefectFormEditInput) => void | Promise<void>,
  onChangeStatus?: (id: string, input: DefectFormChangeStatusInput) => void | Promise<void>
): void {
  if (isContractorRole()) {
    const myId = resolveMyContractorId();
    if (!myId || String(defect.contractorId || '').trim() !== myId) {
      window.showToast?.(_t('construction.form.no_access', '⚠️ Нет доступа к чужому замечанию'));
      return;
    }
  }
  const root = _ensureOverlay();
  const panel = root.querySelector('[data-c2-defect-panel]') as HTMLElement;
  const photosRef = {
    current: Array.isArray(defect.photos)
      ? defect.photos.slice()
      : defect.photo
        ? [String(defect.photo)]
        : []
  };
  const { isEngineer } = _roleInfo();
  const catOpts = DEFECT_CATEGORIES_V2.map((c) => {
    const sel = String(defect.category).toUpperCase() === c ? ' selected' : '';
    return `<option value="${c}"${sel}>${_escape(_catLabel(c))}</option>`;
  }).join('');
  const deadlineVal = _deadlineInputValue(defect.deadline);
  const canEditFields = isEngineer;
  const disabled = canEditFields ? '' : ' disabled';

  panel.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-rbi-body font-black uppercase tracking-tight">${_escape(_t('construction.form.defect_title', 'Замечание'))}</h3>
      <button type="button" data-c2-defect-close class="text-muted text-rbi-label font-bold uppercase">${_escape(_t('construction.form.close', 'Закрыть'))}</button>
    </div>
    <p class="text-rbi-caption text-muted mb-1">${_escape(_t('construction.form.status_line', 'Статус: {status}', { status: _statusLabel(String(defect.status)) }))}</p>
    <p class="text-rbi-caption text-muted mb-3">${_escape(_t('construction.form.coords', 'Координаты: {x}% × {y}%', { x: Number(defect.x).toFixed(1), y: Number(defect.y).toFixed(1) }))}</p>
    <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape(_t('construction.form.work_type_view', 'Вид работ'))}</label>
    <select data-c2-template class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body mb-3"${disabled}>
      ${_templateOptionsHtml(defect.template_key)}
    </select>
    <div class="relative mb-3">
      <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape(_t('construction.form.violation_view', 'Нарушение'))}</label>
      <input type="text" data-c2-item-search autocomplete="off" value="${_escape(defect.item_name || '')}"
        class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body"${disabled} />
      <input type="hidden" data-c2-item-id value="${_escape(defect.item_id || '')}" />
      <input type="hidden" data-c2-item-name value="${_escape(defect.item_name || '')}" />
      <div data-c2-item-dd class="absolute top-[48px] left-0 right-0 bg-white dark:bg-slate-800 border border-surface shadow-2xl rounded-xl z-[150] hidden max-h-48 overflow-y-auto"></div>
    </div>
    <div data-c2-norm-block class="${defect.norm_text || defect.item_id ? '' : 'hidden'} bg-slate-50 dark:bg-slate-900 border border-surface p-2.5 rounded-xl mb-3">
      <div class="text-rbi-caption font-black uppercase text-brand mb-1">${_escape(_t('construction.form.norm_ref', 'Справочно (Норматив)'))}</div>
      <div data-c2-norm-text class="text-rbi-caption text-muted font-medium"></div>
      ${_helpButtonsHtml()}
    </div>
    <div class="grid grid-cols-2 gap-2 mb-3">
      <div>
        <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape(_t('construction.form.category', 'Категория'))}</label>
        <select data-c2-defect-cat class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body"${disabled}>
          ${catOpts}
        </select>
      </div>
      <div>
        <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape(_t('construction.form.deadline', 'Срок'))}</label>
        <input type="date" data-c2-defect-deadline value="${_escape(deadlineVal)}"
          class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body"${disabled} />
      </div>
    </div>
    <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape(_t('construction.form.contractor', 'Подрядчик'))}</label>
    <select data-c2-defect-contractor class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body mb-3"${disabled}>
      ${_contractorOptionsHtml(defect.contractorId)}
    </select>
    <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape(_t('construction.form.description', 'Описание'))}</label>
    <textarea data-c2-defect-desc rows="3"
      class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body mb-3"${disabled}>${_escape(_stripHtml(String(defect.description || '')))}</textarea>
    <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape(_t('construction.form.photos', 'Фото'))}</label>
    <div data-c2-photo-host>${_renderGallery(photosRef.current)}</div>
    ${
      canEditFields
        ? `<input type="file" accept="image/*" multiple class="hidden" data-c2-photo-input />
    <button type="button" data-c2-photo-add
      class="w-full mb-3 bg-slate-50 dark:bg-slate-900 border border-dashed border-surface text-muted py-3 rounded-xl text-rbi-caption font-bold uppercase">
      + ${_escape(_t('construction.form.add_photo', '+ Добавить фото'))}
    </button>`
        : `<div class="mb-3"></div>`
    }
    ${_historyHtml(defect.history)}
    <div class="flex gap-2 justify-between mt-3 flex-wrap" data-c2-actions>
      ${_actionButtonsHtml(defect)}
    </div>`;

  root.classList.remove('hidden');
  root.classList.add('flex');

  if (defect.norm_text) {
    _setNormDisplay(panel.querySelector('[data-c2-norm-text]') as HTMLElement | null, String(defect.norm_text));
  }

  _bindHelpActions(panel);

  if (canEditFields) {
    _bindItemSearch(panel);
    _bindGallery(panel, photosRef, () => {});
    panel.querySelector('[data-c2-photo-add]')?.addEventListener('click', () => {
      (panel.querySelector('[data-c2-photo-input]') as HTMLInputElement)?.click();
    });
  } else {
    panel.querySelectorAll('[data-c2-photo-view]').forEach((el) => {
      el.addEventListener('click', () => {
        const ref = (el as HTMLElement).getAttribute('data-c2-photo-view') || '';
        if (ref) _openPhoto(ref);
      });
    });
  }

  panel.querySelectorAll('[data-c2-history] [data-c2-photo-view]').forEach((el) => {
    el.addEventListener('click', () => {
      const ref = (el as HTMLElement).getAttribute('data-c2-photo-view') || '';
      if (ref) _openPhoto(ref);
    });
  });

  panel.querySelectorAll('[data-c2-defect-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeDefectForm());
  });
  root.onclick = (ev) => {
    if (ev.target === root) closeDefectForm();
  };

  panel.querySelector('[data-c2-defect-save]')?.addEventListener('click', async () => {
    if (!onSave) {
      closeDefectForm();
      return;
    }
    const fields = _readCommonFields(panel);
    const description = fields.description || fields.item_name || defect.description;
    if (!description) {
      window.showToast?.(_t('construction.form.toast_desc_required', 'Укажите описание замечания'));
      return;
    }
    try {
      await onSave(defect.id, {
        description,
        category: fields.category,
        contractorId: fields.contractorId,
        deadline: fields.deadline,
        template_key: fields.template_key,
        item_id: fields.item_id,
        item_name: fields.item_name,
        norm_text: fields.norm_text,
        photos: photosRef.current.slice()
      });
      closeDefectForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.showToast?.('❌ ' + msg);
    }
  });

  panel.querySelector('[data-c2-defect-delete]')?.addEventListener('click', async () => {
    if (!confirm(_t('construction.form.confirm_delete', 'Удалить замечание?'))) return;
    try {
      await onDelete(defect.id);
      closeDefectForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.showToast?.('❌ ' + msg);
    }
  });

  panel.querySelectorAll('[data-c2-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!onChangeStatus) return;
      const status = (btn as HTMLElement).getAttribute('data-c2-status') as DefectStatusV2;
      let comment: string | null = null;
      let fixPhotos: string[] = [];
      if (status === 'rejected') {
        comment = prompt(_t('construction.form.prompt_reject', 'Укажите причину отклонения:')) || '';
        if (!comment) {
          window.showToast?.(_t('construction.form.toast_reject_comment', '⚠️ Для отклонения нужен комментарий'));
          return;
        }
      }
      if (status === 'fixed') {
        comment = prompt(_t('construction.form.prompt_fixed', 'Краткий комментарий об устранении:'));
        if (comment === null) return;
        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = 'image/*';
        picker.multiple = true;
        const picked = await new Promise<FileList | null>((resolve) => {
          picker.onchange = () => resolve(picker.files);
          picker.oncancel = () => resolve(null);
          picker.click();
        });
        if (!picked || !picked.length) {
          window.showToast?.(_t('construction.form.toast_fixed_photo', '⚠️ Для статуса «Устранено» нужно фото'));
          return;
        }
        try {
          fixPhotos = await _savePhotoFiles(picked);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          window.showToast?.('❌ ' + msg);
          return;
        }
        if (!fixPhotos.length) {
          window.showToast?.(_t('construction.form.toast_photo_save_fail', '⚠️ Не удалось сохранить фото'));
          return;
        }
      }
      try {
        await onChangeStatus(defect.id, { status, comment, photos: fixPhotos });
        closeDefectForm();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        window.showToast?.('❌ ' + msg);
      }
    });
  });
}
