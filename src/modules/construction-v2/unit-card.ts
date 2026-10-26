/**
 * Карточка квартиры (sheet поверх transfer-board).
 * PDF upload/clear — только из Настроек (location-directory); здесь open + pin.
 */

import type { ConstructionUnitV2, UnitStatusV2 } from '../../services/construction-units/types';
import { UNIT_STATUS_LABELS_RU, UNIT_STATUSES_V2 } from '../../services/construction-units/types';

type LocPathNode = { id: string; displayName?: string; nodeType?: string };

type LocSvc = {
  getPath?: (id: string) => LocPathNode[];
};

type UnitsSvc = {
  get: (id: string) => ConstructionUnitV2 | null;
  changeStatus: (id: string, status: string) => Promise<ConstructionUnitV2>;
  softDelete: (id: string) => Promise<ConstructionUnitV2>;
};

export type UnitCardCallbacks = {
  onChanged: () => void | Promise<void>;
  isGuest: () => boolean;
  canSoftDelete: (u: ConstructionUnitV2) => boolean;
  toast: (msg: string) => void;
  /** Открыть pin-UI на PDF квартиры (блок B). */
  onOpenApartmentPlan?: (unit: ConstructionUnitV2) => void | Promise<void>;
  /** Приёмка квартиры (locationId = apartment). */
  onOpenAcceptance?: (unit: ConstructionUnitV2) => void | Promise<void>;
};

let _openUnitId: string | null = null;

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

function _unitStatusLabel(st: UnitStatusV2): string {
  const key = `construction.v2.unit_status.${st}`;
  return _t(key, UNIT_STATUS_LABELS_RU[st]);
}

function _escape(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _pathLabel(loc: LocSvc | null, locationId: string): string {
  if (!loc?.getPath || !locationId) return locationId || '—';
  try {
    const path = loc.getPath(locationId) || [];
    if (!path.length) return locationId;
    return path.map((n) => n.displayName || n.id).join(' / ');
  } catch {
    return locationId;
  }
}

export function closeUnitCard() {
  _openUnitId = null;
  document.getElementById('c2-unit-card')?.remove();
}

export function isUnitCardOpen(): boolean {
  return !!_openUnitId;
}

export function openUnitCard(
  unit: ConstructionUnitV2,
  deps: { loc: LocSvc | null; units: UnitsSvc; cb: UnitCardCallbacks }
) {
  closeUnitCard();
  _openUnitId = unit.id;
  const guest = deps.cb.isGuest();
  const canDel = !guest && deps.cb.canSoftDelete(unit);
  const path = _pathLabel(deps.loc, unit.locationId);
  const status = String(unit.status || 'not_inspected') as UnitStatusV2;
  const hasPdf = !!(unit.pdf_url && String(unit.pdf_url).startsWith('http'));

  const statusOpts = UNIT_STATUSES_V2.map(
    (st) =>
      `<option value="${st}" ${status === st ? 'selected' : ''}>${_escape(_unitStatusLabel(st))}</option>`
  ).join('');

  const wrap = document.createElement('div');
  wrap.id = 'c2-unit-card';
  // Inline z-index: выше .bottom-nav (1000), ниже plan fullscreen (1100)
  wrap.className = 'fixed inset-0 flex items-end sm:items-center justify-center bg-black/40 p-3';
  wrap.style.zIndex = '1050';
  wrap.innerHTML = `
    <div data-c2-unit-card-panel class="w-full max-w-md bg-surface rounded-2xl shadow-2xl border border-surface overflow-hidden">
      <div class="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
        <div>
          <div class="text-rbi-caption font-black uppercase tracking-widest text-brand">${_escape(_t('construction.v2.unit.apartment', 'Квартира'))}</div>
          <div class="text-[18px] font-black text-ink">${_escape(unit.type || 'КВ')} ${_escape(
            unit.name
          )}</div>
          <div class="text-rbi-label font-bold text-muted mt-0.5">${_escape(path)}</div>
        </div>
        <button type="button" data-c2-unit-card-close class="text-muted hover:text-ink text-[20px] leading-none px-1" aria-label="${_escape(_t('construction.form.close', 'Закрыть'))}">×</button>
      </div>
      <div class="px-4 pb-4 space-y-3">
        <label class="block">
          <span class="text-rbi-caption font-black uppercase tracking-widest text-muted">${_escape(_t('construction.v2.unit.transfer_status', 'Статус передачи'))}</span>
          <select id="c2-unit-card-status" data-c2-unit-id="${_escape(unit.id)}"
            class="mt-1 w-full rounded-xl border border-surface bg-surface px-3 py-2.5 text-rbi-body font-bold"
            ${guest ? 'disabled' : ''}>
            ${statusOpts}
          </select>
        </label>
        <div class="rounded-xl border border-surface p-3 space-y-2">
          <div class="text-rbi-caption font-black uppercase tracking-widest text-muted">${_escape(_t('construction.v2.unit.plan_pdf', 'План квартиры (PDF)'))}</div>
          ${
            hasPdf
              ? `<div class="text-rbi-label font-bold text-ink truncate">${_escape(
                  unit.pdf_name || 'plan.pdf'
                )}${unit.pdf_size ? ` · ${_escape(String(unit.pdf_size))} B` : ''}</div>
                 <div class="flex flex-wrap gap-2">
                   <a href="${_escape(String(unit.pdf_url))}" target="_blank" rel="noopener"
                     class="inline-flex items-center px-3 py-2 rounded-lg bg-brand-soft text-brand text-rbi-caption font-black uppercase border border-brand-soft">${_escape(_t('construction.v2.unit.open', 'Открыть'))}</a>
                   <button type="button" data-c2-unit-apt-plan="${_escape(unit.id)}"
                     class="inline-flex items-center px-3 py-2 rounded-lg bg-brand text-white text-rbi-caption font-black uppercase border border-brand">${_escape(_t('construction.v2.unit.defects_on_plan', 'Замечания на плане'))}</button>
                 </div>`
              : `<div class="text-rbi-label text-muted font-bold">${_escape(_t('construction.v2.unit.plan_missing', 'План не загружен'))}</div>
                 <div class="text-rbi-caption text-muted font-bold">${_escape(_t('construction.v2.unit.plan_upload_hint', 'Загрузка PDF — в Настройках → справочник локаций'))}</div>
                 <button type="button" disabled
                   class="inline-flex items-center px-3 py-2 rounded-lg bg-slate-100 text-muted text-rbi-caption font-black uppercase border border-surface cursor-not-allowed opacity-70">${_escape(_t('construction.v2.unit.defects_on_plan', 'Замечания на плане'))}</button>`
          }
        </div>
        <button type="button" data-c2-unit-acceptance="${_escape(unit.id)}"
          class="w-full py-2.5 rounded-xl text-rbi-label font-black uppercase text-white bg-brand border border-brand ${guest ? 'opacity-50 cursor-not-allowed' : ''}"
          ${guest ? 'disabled' : ''}>${_escape(_t('construction.v2.unit.acceptance', 'Приёмка'))}</button>
        ${
          canDel
            ? `<button type="button" data-c2-unit-delete="${_escape(unit.id)}"
                class="w-full py-2.5 rounded-xl text-rbi-label font-black uppercase text-danger border border-danger-soft bg-danger-soft">${_escape(_t('construction.v2.unit.delete_room', 'Удалить помещение'))}</button>`
            : ''
        }
      </div>
    </div>`;

  document.body.appendChild(wrap);

  wrap.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (t === wrap || t.closest?.('[data-c2-unit-card-close]')) {
      closeUnitCard();
    }
  });

  const sel = wrap.querySelector('#c2-unit-card-status') as HTMLSelectElement | null;
  sel?.addEventListener('change', () => {
    if (guest || !sel) return;
    const id = sel.getAttribute('data-c2-unit-id');
    const st = sel.value;
    if (!id || !st) return;
    void (async () => {
      try {
        await deps.units.changeStatus(id, st);
        deps.cb.toast(_t('construction.v2.unit.status_updated', 'Статус обновлён'));
        await deps.cb.onChanged();
        const fresh = deps.units.get(id);
        if (fresh) openUnitCard(fresh, deps);
      } catch (e) {
        deps.cb.toast(_t('construction.v2.error_prefix', 'Ошибка: {msg}', { msg: (e as Error)?.message || String(e) }));
      }
    })();
  });

  wrap.querySelector('[data-c2-unit-apt-plan]')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    const id = (ev.currentTarget as HTMLElement).getAttribute('data-c2-unit-apt-plan');
    if (!id) return;
    const fresh = deps.units.get(id) || unit;
    if (!deps.cb.onOpenApartmentPlan) {
      deps.cb.toast(_t('construction.v2.unit.plan_open_unavailable', 'Открытие плана недоступно'));
      return;
    }
    void deps.cb.onOpenApartmentPlan(fresh);
  });

  wrap.querySelector('[data-c2-unit-acceptance]')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (guest) return;
    const id = (ev.currentTarget as HTMLElement).getAttribute('data-c2-unit-acceptance');
    if (!id) return;
    const fresh = deps.units.get(id) || unit;
    if (!deps.cb.onOpenAcceptance) {
      deps.cb.toast(_t('construction.v2.unit.acceptance_unavailable', 'Приёмка недоступна'));
      return;
    }
    void deps.cb.onOpenAcceptance(fresh);
  });

  wrap.querySelector('[data-c2-unit-delete]')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (guest) return;
    const id = (ev.currentTarget as HTMLElement).getAttribute('data-c2-unit-delete');
    if (!id || !confirm(_t('construction.v2.unit.confirm_delete', 'Удалить помещение?'))) return;
    void (async () => {
      try {
        await deps.units.softDelete(id);
        closeUnitCard();
        deps.cb.toast(_t('construction.v2.unit.deleted', 'Удалено'));
        await deps.cb.onChanged();
      } catch (e) {
        deps.cb.toast(_t('construction.v2.error_prefix', 'Ошибка: {msg}', { msg: (e as Error)?.message || String(e) }));
      }
    })();
  });
}
