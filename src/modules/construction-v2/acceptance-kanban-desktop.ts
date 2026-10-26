/**
 * Desktop-канбан заявок на приёмку construction-v2 (subview `acceptance`, ≥1280px).
 * Тот же контракт вызова, что у mobile `renderAcceptanceKanban` — переиспользует бизнес-хелперы
 * (`filterAcceptancesForRole`, `listSlotOccupancy`/`slotBoardHtml`, `computeChecklistProgress`/`progressLine`,
 * `openAcceptanceDetails`, `focusAcceptanceOnPlan`), не копирует их логику. Собственный module-state
 * и data-атрибуты — независимо от `acceptance-kanban.ts` (см. прецедент `defects-registry-desktop.ts`).
 */

import type { ConstructionAcceptanceV2 } from '../../services/construction-acceptance/types';
import type { LocationNode } from '../../services/locations/types';
import { computeChecklistProgress, progressLine } from './acceptance-checklist';
import { openAcceptanceDetails } from './acceptance-form';
import { focusAcceptanceOnPlan } from './acceptance-kanban';
import { filterAcceptancesForRole } from './contractor-scope';
import { listSlotOccupancy, slotBoardHtml } from './acceptance-slots';

type AccSvc = {
  init: () => Promise<boolean>;
  list: (opts?: { includeDeleted?: boolean }) => ConstructionAcceptanceV2[];
  get: (id: string) => ConstructionAcceptanceV2 | null;
  changeStatus: (id: string, status: string) => Promise<ConstructionAcceptanceV2>;
  softDelete: (id: string) => Promise<ConstructionAcceptanceV2>;
};

type LocSvc = {
  init: () => Promise<boolean>;
  listNodes: (opts?: { nodeType?: string; parentId?: string | null }) => LocationNode[];
  getPath: (id: string) => LocationNode[];
  getNode: (id: string) => LocationNode | null;
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

function _acc(): AccSvc | null {
  return (window.RBI?.services?.constructionAcceptance as AccSvc) || null;
}

function _loc(): LocSvc | null {
  return (window.RBI?.services?.locations as LocSvc) || null;
}

let _filterObjectId: string | null = null;
let _slotsDate: string | null = null;
let _bound = false;

function _today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function _objectIdForFloor(loc: LocSvc, floorId: string): string | null {
  const path = loc.getPath(floorId);
  const obj = path.find((n) => n.nodeType === 'object');
  return obj?.id || path[0]?.id || null;
}

function _cardHtml(r: ConstructionAcceptanceV2, loc: LocSvc): string {
  const path = loc
    .getPath(r.locationId)
    .map((n) => n.displayName)
    .join(' · ');
  const overdue =
    r.status === 'pending' &&
    r.requested_date &&
    new Date(r.requested_date).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
  const progress = computeChecklistProgress(r.template_key, r.checklist_results);
  const progressHtml =
    progress.total > 0 && (r.checklist_results || progress.done > 0)
      ? `<div class="mt-2 text-rbi-caption font-black uppercase tracking-wide text-brand">${_escape(progressLine(progress))}${
          progress.fail ? ` · FAIL ${progress.fail}` : ''
        }</div>`
      : progress.total > 0
        ? `<div class="mt-2 text-rbi-caption font-bold text-muted">${_escape(_t('construction.v2.kanban.checklist_progress', 'Чек-лист 0/{total}', { total: progress.total }))}</div>`
        : '';
  return `
    <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3.5 mb-3 shadow-sm cursor-pointer hover:border-brand transition-colors"
         data-c2-acc-desk-card="${_escape(r.id)}">
      <div class="flex justify-between items-start gap-2 mb-1.5">
        <div class="text-rbi-body font-black text-ink leading-tight">${_escape(r.work_type || _t('construction.v2.kanban.no_work_type', 'Без вида работ'))}</div>
        ${overdue ? `<span class="text-rbi-caption font-black uppercase text-danger bg-danger-soft px-1.5 py-0.5 rounded shrink-0">${_escape(_t('construction.v2.registry.overdue', 'просрочено'))}</span>` : ''}
      </div>
      <div class="text-rbi-label text-muted font-bold mb-2">${_escape(path || r.locationId)}</div>
      <div class="flex justify-between items-center text-rbi-label">
        <span class="font-bold text-ink">${_escape(r.requested_date || '—')} ${_escape(r.requested_time || '')}</span>
        <button type="button" data-c2-acc-desk-plan="${_escape(r.id)}"
          class="text-brand bg-white border border-brand-soft px-2.5 py-1 rounded text-rbi-caption font-bold">${_escape(_t('construction.v2.kanban.plan_btn', 'План'))}</button>
      </div>
      ${r.volume ? `<div class="mt-1.5 text-rbi-caption text-muted font-bold">${_escape(r.volume)}</div>` : ''}
      ${progressHtml}
    </div>`;
}

function _column(title: string, color: string, items: ConstructionAcceptanceV2[], loc: LocSvc): string {
  return `
    <div class="bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-surface p-3">
      <div class="flex items-center justify-between px-1 mb-2.5">
        <span class="text-rbi-label font-black uppercase tracking-widest ${color}">${_escape(title)}</span>
        <span class="bg-surface text-ink px-2 py-0.5 rounded shadow-sm border border-surface text-rbi-label font-bold">${items.length}</span>
      </div>
      <div class="max-h-[65vh] overflow-y-auto">
        ${
          items.length
            ? items.map((r) => _cardHtml(r, loc)).join('')
            : `<div class="text-center py-6 text-rbi-label font-bold text-muted border border-dashed border-surface rounded-xl">${_escape(_t('construction.v2.kanban.no_requests', 'Заявок нет'))}</div>`
        }
      </div>
    </div>`;
}

export async function renderAcceptanceKanbanDesktop(root: HTMLElement): Promise<void> {
  const acc = _acc();
  const loc = _loc();
  if (!acc || !loc) {
    root.innerHTML = `<div class="p-6 text-danger text-rbi-body font-bold">${_escape(_t('construction.v2.kanban.svc_missing', 'constructionAcceptance / locations не загружены'))}</div>`;
    return;
  }
  await loc.init();
  await acc.init();

  const objects = loc.listNodes({ nodeType: 'object', parentId: null });
  const objOpts =
    `<option value="">${_escape(_t('construction.v2.kanban.all_objects', 'Все объекты'))}</option>` +
    objects
      .map(
        (o) =>
          `<option value="${_escape(o.id)}" ${_filterObjectId === o.id ? 'selected' : ''}>${_escape(o.displayName)}</option>`
      )
      .join('');

  let all = filterAcceptancesForRole(acc.list());
  if (_filterObjectId) {
    all = all.filter((r) => _objectIdForFloor(loc, r.locationId) === _filterObjectId);
  }
  const pending = all.filter((r) => r.status === 'pending');
  const rejected = all.filter((r) => r.status === 'rejected');
  const accepted = all.filter((r) => r.status === 'accepted');
  const slotsDate = _slotsDate || _today();
  const occupancy = listSlotOccupancy(all, { date: slotsDate });

  root.innerHTML = `
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="text-rbi-label font-black uppercase tracking-widest text-brand">${_escape(_t('construction.v2.kanban.title', 'Канбан приёмки (v2)'))}</div>
        <select id="c2-acc-desk-obj-filter" class="input-base text-rbi-body font-bold max-w-[240px]">${objOpts}</select>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <label class="text-rbi-label font-black uppercase text-muted" for="c2-acc-desk-slots-date">${_escape(_t('construction.v2.kanban.slots_day', 'Слоты дня'))}</label>
        <input type="date" id="c2-acc-desk-slots-date" class="input-base text-rbi-body font-bold max-w-[170px]" value="${_escape(
          slotsDate
        )}">
      </div>
      ${slotBoardHtml(occupancy, { title: _t('construction.v2.slots.occupancy', 'Занятость {date}', { date: slotsDate }) })}
      <div class="grid grid-cols-3 gap-3">
        ${_column(_t('construction.v2.kanban.col_pending', 'Ожидают'), 'text-blue-600', pending, loc)}
        ${_column(_t('construction.v2.kanban.col_rejected', 'Отклонены'), 'text-danger', rejected, loc)}
        ${_column(_t('construction.v2.kanban.col_accepted', 'Приняты'), 'text-green-600', accepted, loc)}
      </div>
    </div>`;

  _bindOnce();
}

function _bindOnce() {
  if (_bound) return;
  _bound = true;
  document.addEventListener(
    'change',
    (ev) => {
      const t = ev.target as HTMLElement | null;
      if (t?.id === 'c2-acc-desk-obj-filter') {
        _filterObjectId = (t as HTMLSelectElement).value || null;
        const root = document.getElementById('construction-v2-root');
        if (root) renderAcceptanceKanbanDesktop(root).catch(() => {});
      }
      if (t?.id === 'c2-acc-desk-slots-date') {
        _slotsDate = (t as HTMLInputElement).value || null;
        const root = document.getElementById('construction-v2-root');
        if (root) renderAcceptanceKanbanDesktop(root).catch(() => {});
      }
    },
    true
  );
  document.addEventListener(
    'click',
    (ev) => {
      const t = ev.target as HTMLElement | null;
      const planBtn = t?.closest?.('[data-c2-acc-desk-plan]') as HTMLElement | null;
      if (planBtn) {
        ev.stopPropagation();
        const id = planBtn.getAttribute('data-c2-acc-desk-plan');
        if (id) focusAcceptanceOnPlan(id);
        return;
      }
      const card = t?.closest?.('[data-c2-acc-desk-card]') as HTMLElement | null;
      if (card) {
        const id = card.getAttribute('data-c2-acc-desk-card');
        if (!id) return;
        const acc = _acc();
        const item = acc?.get(id);
        if (!item || !acc) return;
        openAcceptanceDetails(item, {
          onFocusPlan: (rid) => focusAcceptanceOnPlan(rid),
          onChangeStatus: async (rid, status) => {
            await acc.changeStatus(rid, status);
            window.showToast?.(_t('construction.v2.status_updated', '✅ Статус обновлён'));
            const root = document.getElementById('construction-v2-root');
            if (root) await renderAcceptanceKanbanDesktop(root);
          },
          onSoftDelete: async (rid) => {
            await acc.softDelete(rid);
            window.showToast?.(_t('construction.v2.acc_revoked', 'Заявка отозвана'));
            const root = document.getElementById('construction-v2-root');
            if (root) await renderAcceptanceKanbanDesktop(root);
          },
          onChecklistChanged: async () => {
            const root = document.getElementById('construction-v2-root');
            if (root) await renderAcceptanceKanbanDesktop(root);
          }
        });
      }
    },
    true
  );
}
