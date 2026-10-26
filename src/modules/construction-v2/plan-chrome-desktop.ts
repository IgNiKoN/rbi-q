/**
 * Desktop-вид subview «Планы» construction-v2 (≥1280px).
 * Тот же id/data-атрибут контракт, что у mobile `_renderTree`/`_renderPlanChrome` из `ui.ts`
 * (`id="c2-plan-host"`, `id="c2-overlay-count"`, `data-c2-pin-filters-host="plan"`,
 * `data-c2-add-mode`, `data-c2-zone-mode`, `data-c2-fullscreen`) — критично для совместимости
 * с `_mountViewerIfNeeded`/`_refreshOverlaysOnly`/`paintPinFilterHosts`/`_bindOnce()`, которые не
 * различают mobile/desktop. `PlanViewer` (canvas/panzoom/pin-роутинг) не изменяется и не
 * импортируется — desktop-адаптация только вокруг него (тулбар без переноса строк + инлайн
 * кнопки zoom, те же data-атрибуты, что уже слушает `_bindOnce()` в `ui.ts`).
 */

import type { FloorPlan, LocationNode } from '../../services/locations/types';

type LocSvc = {
  listNodes: (opts?: { nodeType?: string; parentId?: string | null }) => LocationNode[];
  getChildren: (parentId: string | null) => LocationNode[];
  getNode: (id: string) => LocationNode | null;
  getPlanForFloor: (id: string) => FloorPlan | null;
  getPath: (id: string) => LocationNode[];
};

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

export function renderPlanTreeDesktop(svc: LocSvc, selectedFloorId?: string | null): string {
  const objects = svc.listNodes({ nodeType: 'object', parentId: null });
  if (!objects.length) {
    return `<div class="p-6 text-center text-muted text-rbi-label font-bold uppercase tracking-widest">
      ${_t('construction.v2.tree_empty', 'Нет объектов. Создайте иерархию в Настройках → «Объекты и планы».')}
    </div>`;
  }
  let html = '<ul class="space-y-1.5 text-rbi-body">';
  for (const obj of objects) {
    html += `<li class="font-black text-ink">${_escape(obj.displayName)}`;
    const buildings = svc.getChildren(obj.id);
    html += '<ul class="ml-3 mt-1 space-y-1 border-l border-surface pl-3">';
    for (const b of buildings) {
      html += `<li><span class="font-bold text-ink">${_escape(b.displayName)}</span>`;
      const sections = svc.getChildren(b.id);
      html += '<ul class="ml-2 mt-0.5 space-y-0.5">';
      for (const sec of sections) {
        html += `<li class="text-muted">${_escape(sec.displayName)}`;
        const floors = svc.getChildren(sec.id);
        html += '<ul class="ml-2">';
        for (const fl of floors) {
          const plan = svc.getPlanForFloor(fl.id);
          const active =
            selectedFloorId === fl.id
              ? 'bg-brand-soft text-brand'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800';
          const mark = plan?.pdf_url ? '📄' : '⚠️';
          html += `<li>
            <button type="button" data-c2-floor="${_escape(fl.id)}"
              class="w-full text-left px-2.5 py-1.5 rounded-lg ${active} transition-colors">
              ${mark} ${_escape(fl.displayName)}
            </button>
          </li>`;
        }
        html += '</ul></li>';
      }
      html += '</ul></li>';
    }
    html += '</ul></li>';
  }
  html += '</ul>';
  return html;
}

function _zoomToolbarDesktopHtml(prefix: string): string {
  return `<div class="flex gap-1 shrink-0 items-center rounded-xl border border-surface p-0.5">
    <button type="button" data-c2-zoom-out="${prefix}"
      class="w-8 h-8 rounded-lg text-[16px] font-black text-ink hover:bg-slate-100 dark:hover:bg-slate-800" title="${_escape(_t('construction.v2.zoom_out', 'Уменьшить'))}">−</button>
    <button type="button" data-c2-zoom-in="${prefix}"
      class="w-8 h-8 rounded-lg text-[16px] font-black text-ink hover:bg-slate-100 dark:hover:bg-slate-800" title="${_escape(_t('construction.v2.zoom_in', 'Увеличить'))}">+</button>
    <button type="button" data-c2-zoom-fit="${prefix}"
      class="px-2.5 h-8 rounded-lg text-rbi-caption font-black uppercase text-ink hover:bg-slate-100 dark:hover:bg-slate-800" title="${_escape(_t('construction.v2.zoom_fit', 'По размеру'))}">Fit</button>
  </div>`;
}

function _fullscreenIconBtnDesktop(): string {
  const fs = _escape(_t('construction.v2.fullscreen', 'На весь экран'));
  return `<button type="button" data-c2-fullscreen
    class="w-9 h-9 rounded-xl border border-surface flex items-center justify-center shrink-0
           text-ink bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
    title="${fs}" aria-label="${fs}">
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/>
    </svg>
  </button>`;
}

export function renderPlanChromeDesktop(
  svc: LocSvc,
  opts: { selectedFloorId: string | null; addMode: boolean; zoneMode: boolean }
): string {
  if (!opts.selectedFloorId) {
    return `<div class="flex items-center justify-center h-full min-h-[240px] text-muted text-rbi-body font-medium px-4 text-center">
      ${_t('construction.v2.select_floor', 'Выберите этаж слева')}
    </div>`;
  }
  const floor = svc.getNode(opts.selectedFloorId);
  const plan = svc.getPlanForFloor(opts.selectedFloorId);
  const path = svc
    .getPath(opts.selectedFloorId)
    .map((n) => n.displayName)
    .join(' / ');
  if (!plan?.pdf_url) {
    return `<div class="p-6">
      <div class="text-rbi-label font-bold text-muted mb-2">${_escape(path)}</div>
      <div class="text-amber-600 font-bold text-rbi-body">${_t('construction.v2.no_pdf', 'Нет PDF-плана на этом этаже')}</div>
      <p class="text-rbi-label text-muted mt-2">${_t('construction.v2.no_pdf_hint', 'Загрузите план в Настройках → «Объекты и планы».')}</p>
    </div>`;
  }
  const addCls = opts.addMode
    ? 'bg-brand text-white border-brand'
    : 'bg-transparent text-brand border-brand-soft';
  const zoneCls = opts.zoneMode
    ? 'bg-emerald-600 text-white border-emerald-600'
    : 'bg-transparent text-emerald-700 border-emerald-200 dark:border-emerald-800';
  return `<div class="flex flex-col h-full min-h-[320px]" id="c2-plan-chrome">
    <div class="px-3 py-2 border-b border-surface flex items-center justify-between gap-2 flex-nowrap">
      <div class="text-rbi-body font-semibold text-ink min-w-0 truncate">
        ${_escape(path || floor?.displayName || '')}
      </div>
      <div class="flex gap-1.5 shrink-0 items-center flex-nowrap">
        ${_zoomToolbarDesktopHtml('desk')}
        <button type="button" data-c2-zone-mode
          class="px-2.5 py-1.5 rounded-xl border text-rbi-caption font-bold whitespace-nowrap ${zoneCls}">
          ${opts.zoneMode ? _t('construction.v2.zone_picking', '2 клика…') : _t('construction.v2.zone', 'Зона')}
        </button>
        <button type="button" data-c2-add-mode
          class="px-2.5 py-1.5 rounded-xl border text-rbi-caption font-bold whitespace-nowrap ${addCls}">
          ${opts.addMode ? _t('construction.v2.add_picking', 'Кликни…') : _t('construction.v2.add_defect', '+ Замечание')}
        </button>
        ${_fullscreenIconBtnDesktop()}
      </div>
    </div>
    <div class="px-3 py-1.5 border-b border-surface" data-c2-pin-filters-host="plan"></div>
    <div class="flex-1 relative bg-slate-100 dark:bg-slate-900 min-h-[280px]" id="c2-plan-host"></div>
    <div class="px-3 py-1.5 text-rbi-caption text-muted border-t border-surface flex justify-end">
      <span id="c2-overlay-count"></span>
    </div>
  </div>`;
}
