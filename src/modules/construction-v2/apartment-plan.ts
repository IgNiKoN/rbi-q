/**
 * Отдельный хост PlanViewer для PDF квартиры (не этажный #c2-plan).
 * Дефекты с locationId = apartment; без zone-mode / acceptance.
 */

import type { ConstructionDefectV2 } from '../../services/construction-defects/types';
import type { ConstructionUnitV2 } from '../../services/construction-units/types';
import { openCreateDefectForm, openViewDefectForm } from './defect-form';
import { PlanViewer } from './plan-viewer';
import {
  type PinCategory,
  filterDefectsByPins,
  pinFiltersState,
  renderPinFiltersHtml,
  setCategoryFilter,
  toggleStatusFilter
} from './pin-filters';

type LocNode = { id: string; nodeType?: string; displayName?: string };

type LocSvc = {
  getNode?: (id: string) => LocNode | null;
  getPath?: (id: string) => LocNode[];
};

type DefectsSvc = {
  init: () => Promise<boolean>;
  list: (opts?: { locationId?: string }) => ConstructionDefectV2[];
  listForLocation?: (locationId: string) => ConstructionDefectV2[];
  listForFloor: (locationId: string) => ConstructionDefectV2[];
  get: (id: string) => ConstructionDefectV2 | null;
  create: (input: Record<string, unknown>) => Promise<ConstructionDefectV2>;
  update: (id: string, patch: Record<string, unknown>) => Promise<ConstructionDefectV2>;
  changeStatus: (
    id: string,
    newStatus: string,
    opts?: { comment?: string | null; photos?: string[] | null; photo?: string | null }
  ) => Promise<ConstructionDefectV2>;
  softDelete: (id: string) => Promise<ConstructionDefectV2>;
};

type UnitsSvc = {
  get: (id: string) => ConstructionUnitV2 | null;
  ensureApartmentForUnit?: (unitId: string) => Promise<ConstructionUnitV2>;
  changeStatus: (id: string, status: string) => Promise<ConstructionUnitV2>;
};

export type ApartmentPlanCallbacks = {
  isGuest: () => boolean;
  toast: (msg: string) => void;
  onChanged?: () => void | Promise<void>;
};

let _viewer: PlanViewer | null = null;
let _openUnitId: string | null = null;
let _apartmentId: string | null = null;
let _addMode = false;

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

function _defects(): DefectsSvc | null {
  return (window.RBI?.services?.constructionDefects as DefectsSvc) || null;
}

function _units(): UnitsSvc | null {
  return (window.RBI?.services?.constructionUnits as UnitsSvc) || null;
}

function _loc(): LocSvc | null {
  return (window.RBI?.services?.locations as LocSvc) || null;
}

function _listForApartment(dSvc: DefectsSvc, apartmentId: string): ConstructionDefectV2[] {
  if (typeof dSvc.listForLocation === 'function') return dSvc.listForLocation(apartmentId);
  return dSvc.list({ locationId: apartmentId });
}

function _pathLabel(apartmentId: string): string {
  const loc = _loc();
  if (!loc?.getPath || !apartmentId) return apartmentId || '—';
  try {
    const path = loc.getPath(apartmentId) || [];
    if (!path.length) return apartmentId;
    return path.map((n) => n.displayName || n.id).join(' / ');
  } catch {
    return apartmentId;
  }
}

function _syncAddBtn() {
  const btn = document.querySelector('[data-c2-apt-add-mode]') as HTMLElement | null;
  if (!btn) return;
  btn.textContent = _addMode
    ? _t('construction.v2.add_picking', 'Кликни…')
    : _t('construction.v2.add_defect', '+ Замечание');
  btn.className = _addMode
    ? 'px-3 py-1.5 rounded-xl border text-rbi-caption font-black uppercase bg-brand text-white border-brand'
    : 'px-3 py-1.5 rounded-xl border text-rbi-caption font-black uppercase bg-transparent text-brand border-brand-soft';
}

async function _refreshPins(): Promise<void> {
  const dSvc = _defects();
  if (!_viewer || !_apartmentId || !dSvc) return;
  await dSvc.init();
  const all = _listForApartment(dSvc, _apartmentId);
  const filtered = filterDefectsByPins(all, pinFiltersState);
  const host = document.querySelector('#c2-apartment-plan [data-c2-pin-filters-host="apt"]') as HTMLElement | null;
  if (host) {
    host.innerHTML = renderPinFiltersHtml(all, pinFiltersState, { compact: true });
  }
  _viewer.setMarkers(filtered);
  const countEl = document.getElementById('c2-apt-overlay-count');
  if (countEl) countEl.textContent = _t('construction.v2.apt_overlay_count', 'Показано {shown} из {total}', { shown: filtered.length, total: all.length });
}

async function _maybeMarkHasDefects(unitId: string): Promise<void> {
  const uSvc = _units();
  if (!uSvc) return;
  const u = uSvc.get(unitId);
  if (!u) return;
  const st = String(u.status || 'not_inspected');
  if (st !== 'not_inspected' && st !== 'none') return;
  try {
    await uSvc.changeStatus(unitId, 'has_defects');
  } catch (e) {
    console.warn('[apartment-plan] changeStatus has_defects', e);
  }
}

export function closeApartmentPlan(): void {
  _viewer?.destroy();
  _viewer = null;
  _openUnitId = null;
  _apartmentId = null;
  _addMode = false;
  document.getElementById('c2-apartment-plan')?.remove();
}

export function isApartmentPlanOpen(): boolean {
  return !!_openUnitId;
}

/** Точечное обновление пинов (после sync / CRUD). */
export async function refreshApartmentPlanMarkers(): Promise<void> {
  if (!_openUnitId || !_apartmentId) return;
  await _refreshPins();
}

/**
 * Открыть полноэкранный PlanViewer на PDF квартиры.
 * locationId дефектов = canonical apartment (unit.locationId после ensure).
 */
export async function openApartmentPlan(
  unit: ConstructionUnitV2,
  cb: ApartmentPlanCallbacks
): Promise<void> {
  closeApartmentPlan();

  const pdfUrl = String(unit.pdf_url || '');
  if (!pdfUrl.startsWith('http')) {
    cb.toast(_t('construction.v2.apt_upload_pdf', 'Сначала загрузите PDF плана квартиры'));
    return;
  }

  const uSvc = _units();
  const dSvc = _defects();
  if (!dSvc) {
    cb.toast(_t('construction.v2.svc_defects_missing', 'service.constructionDefects не загружен'));
    return;
  }
  if (!uSvc) {
    cb.toast(_t('construction.v2.svc_units_missing', 'service.constructionUnits не загружен'));
    return;
  }

  let fresh = unit;
  try {
    if (typeof uSvc.ensureApartmentForUnit === 'function') {
      fresh = await uSvc.ensureApartmentForUnit(unit.id);
    }
  } catch (e) {
    cb.toast(_t('construction.v2.apt_migration_needed', 'Нужна миграция квартиры: {msg}', { msg: (e as Error)?.message || String(e) }));
    return;
  }

  const loc = _loc();
  const node = loc?.getNode?.(fresh.locationId);
  if (node && node.nodeType && node.nodeType !== 'apartment') {
    cb.toast(_t('construction.v2.apt_open_transfer', 'Сначала откройте Передачу — нужна привязка к квартире'));
    return;
  }

  const apartmentId = fresh.locationId;
  if (!apartmentId) {
    cb.toast(_t('construction.v2.apt_no_location', 'У помещения нет locationId'));
    return;
  }

  _openUnitId = fresh.id;
  _apartmentId = apartmentId;
  _addMode = false;
  const guest = cb.isGuest();
  const title = `${fresh.type || 'КВ'} ${fresh.name || ''}`.trim();
  const path = _pathLabel(apartmentId);

  const wrap = document.createElement('div');
  wrap.id = 'c2-apartment-plan';
  // Inline z-index: выше .bottom-nav (1000); Tailwind CDN z-[N] ненадёжен
  wrap.className = 'fixed inset-0 flex flex-col bg-slate-100 dark:bg-slate-900';
  wrap.style.zIndex = '1100';
  wrap.innerHTML = `
    <div class="shrink-0 flex flex-col gap-1.5 px-3 py-2.5 border-b border-surface bg-surface">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="text-rbi-caption font-black uppercase tracking-widest text-brand">${_escape(_t('construction.v2.apt_fs_title', 'Замечания на плане · весь экран'))}</div>
          <div class="text-rbi-title font-black text-ink truncate">${_escape(title)}</div>
          <div class="text-rbi-caption font-bold text-muted truncate">${_escape(path)}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0 flex-wrap">
          <span id="c2-apt-overlay-count" class="text-rbi-caption font-bold text-muted hidden sm:inline">${_escape(_t('construction.v2.apt_overlay_count', 'Показано {shown} из {total}', { shown: 0, total: 0 }))}</span>
          <div class="flex gap-0.5 p-0.5 rounded-xl bg-slate-100 dark:bg-slate-900/80">
            <button type="button" data-c2-apt-zoom-out
              class="w-8 h-8 rounded-lg text-[16px] font-black text-ink hover:bg-surface" title="${_escape(_t('construction.v2.zoom_out', 'Уменьшить'))}">−</button>
            <button type="button" data-c2-apt-zoom-in
              class="w-8 h-8 rounded-lg text-[16px] font-black text-ink hover:bg-surface" title="${_escape(_t('construction.v2.zoom_in', 'Увеличить'))}">+</button>
            <button type="button" data-c2-apt-zoom-fit
              class="px-2.5 h-8 rounded-lg text-rbi-caption font-bold uppercase text-ink hover:bg-surface" title="${_escape(_t('construction.v2.zoom_fit', 'По размеру'))}">Fit</button>
          </div>
          ${
            guest
              ? ''
              : `<button type="button" data-c2-apt-add-mode
                  class="px-3 py-1.5 rounded-xl border text-rbi-caption font-black uppercase bg-transparent text-brand border-brand-soft">${_escape(_t('construction.v2.add_defect', '+ Замечание'))}</button>`
          }
          <button type="button" data-c2-apt-close
            class="px-3 py-1.5 rounded-xl border text-rbi-caption font-black uppercase bg-slate-50 text-ink border-surface dark:bg-slate-900">${_escape(_t('construction.v2.fs_close', 'Закрыть'))}</button>
        </div>
      </div>
      <div data-c2-pin-filters-host="apt"></div>
    </div>
    <div id="c2-apt-plan-host" class="relative flex-1 min-h-0 overflow-hidden"></div>`;

  document.body.appendChild(wrap);

  wrap.querySelector('[data-c2-apt-close]')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    closeApartmentPlan();
    void cb.onChanged?.();
  });

  wrap.querySelector('[data-c2-apt-add-mode]')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (guest) return;
    _addMode = !_addMode;
    _viewer?.setAddMode(_addMode);
    _syncAddBtn();
  });

  wrap.querySelector('[data-c2-apt-zoom-in]')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    _viewer?.zoomIn();
  });
  wrap.querySelector('[data-c2-apt-zoom-out]')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    _viewer?.zoomOut();
  });
  wrap.querySelector('[data-c2-apt-zoom-fit]')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    _viewer?.fit();
  });

  wrap.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement | null;
    const statusChip = t?.closest?.('[data-c2-pin-status]') as HTMLElement | null;
    if (statusChip && wrap.contains(statusChip)) {
      ev.preventDefault();
      const key = statusChip.getAttribute('data-c2-pin-status');
      if (!key) return;
      toggleStatusFilter(pinFiltersState, key);
      void _refreshPins();
      return;
    }
    const catBtn = t?.closest?.('[data-c2-pin-category]') as HTMLElement | null;
    if (catBtn && wrap.contains(catBtn)) {
      ev.preventDefault();
      const key = catBtn.getAttribute('data-c2-pin-category') as PinCategory | null;
      if (!key) return;
      setCategoryFilter(pinFiltersState, key);
      void _refreshPins();
    }
  });

  const host = wrap.querySelector('#c2-apt-plan-host') as HTMLElement;
  _viewer = new PlanViewer(host, {
    onPlanClick: (x, y) => {
      if (!_apartmentId || guest) return;
      _viewer?.drawTempPin(x, y);
      openCreateDefectForm(
        { locationId: _apartmentId, x, y },
        async (input) => {
          await dSvc.create({
            locationId: input.locationId,
            x: input.x,
            y: input.y,
            description: input.description,
            category: input.category,
            contractorId: input.contractorId,
            deadline: input.deadline,
            template_key: input.template_key,
            item_id: input.item_id,
            item_name: input.item_name,
            norm_text: input.norm_text,
            photos: input.photos,
            status: 'issued'
          });
          if (_openUnitId) await _maybeMarkHasDefects(_openUnitId);
          _addMode = false;
          _viewer?.setAddMode(false);
          _viewer?.clearTempPin();
          _syncAddBtn();
          cb.toast(_t('construction.v2.defect_saved', 'Замечание сохранено'));
          await _refreshPins();
          await cb.onChanged?.();
        },
        () => _viewer?.clearTempPin()
      );
    },
    onMarkerClick: (id) => {
      const d = dSvc.get(id);
      if (!d) return;
      openViewDefectForm(
        d,
        async (defectId) => {
          await dSvc.softDelete(defectId);
          cb.toast(_t('construction.v2.defect_deleted', 'Замечание удалено'));
          await _refreshPins();
          await cb.onChanged?.();
        },
        async (defectId, patch) => {
          await dSvc.update(defectId, patch);
          cb.toast(_t('construction.v2.defect_updated', 'Замечание обновлено'));
          await _refreshPins();
        },
        async (defectId, input) => {
          await dSvc.changeStatus(defectId, input.status, {
            comment: input.comment,
            photos: input.photos
          });
          cb.toast(_t('construction.v2.status_updated', '✅ Статус обновлён'));
          await _refreshPins();
        }
      );
    }
  });

  try {
    await dSvc.init();
    await _viewer.load(pdfUrl);
    await _refreshPins();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    host.innerHTML = `<div class="p-6 text-danger text-rbi-body font-bold">${_escape(_t('construction.v2.plan_error', 'Ошибка плана: {msg}', { msg }))}</div>`;
    _viewer = null;
  }
}
