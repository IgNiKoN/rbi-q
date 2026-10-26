/**
 * Desktop-шахматка передачи construction-v2 (subview `transfer`, ≥1280px).
 * Тот же контракт вызова, что у mobile `renderTransferBoard` — переиспользует бизнес-хелперы
 * (`computeAcceptanceQualityB`/`pickLatestAcceptanceForB`, `openAcceptanceDetails`/`openCreateAcceptanceForm`/`APARTMENT_FULL_ZONE`,
 * `openApartmentPlan`/`closeApartmentPlan`, `openUnitCard`/`closeUnitCard`), не копирует их логику.
 * Собственный module-state и data-атрибуты — независимо от `transfer-board.ts` (см. прецедент `defects-registry-desktop.ts`).
 */

import type { ConstructionUnitV2, UnitStatusV2 } from '../../services/construction-units/types';
import { UNIT_STATUS_LABELS_RU } from '../../services/construction-units/types';
import type { LocationNode } from '../../services/locations/types';
import type { ConstructionAcceptanceV2 } from '../../services/construction-acceptance/types';
import {
  computeAcceptanceQualityB,
  pickLatestAcceptanceForB
} from './acceptance-checklist';
import {
  APARTMENT_FULL_ZONE,
  openAcceptanceDetails,
  openCreateAcceptanceForm
} from './acceptance-form';
import { closeApartmentPlan, openApartmentPlan } from './apartment-plan';
import { closeUnitCard, openUnitCard } from './unit-card';

type LocSvc = {
  init: () => Promise<boolean>;
  listNodes: (opts?: { nodeType?: string; parentId?: string | null }) => LocationNode[];
  getChildren: (parentId: string | null) => LocationNode[];
  getPath?: (id: string) => LocationNode[];
};

function _floorsForBuilding(buildingId: string, loc: LocSvc): LocationNode[] {
  if (!buildingId) return [];
  const sections = loc.getChildren(buildingId) || [];
  const floors: LocationNode[] = [];
  for (const sec of sections) {
    if (!sec?.id) continue;
    for (const fl of loc.getChildren(sec.id) || []) {
      if (!fl?.id) continue;
      if (fl.nodeType && fl.nodeType !== 'floor') continue;
      floors.push(fl);
    }
  }
  floors.sort((a, b) => Number(b.sort_order || 0) - Number(a.sort_order || 0));
  return floors;
}

type UnitsSvc = {
  init: () => Promise<boolean>;
  listForBuilding: (buildingId: string) => ConstructionUnitV2[];
  listForFloor: (locationId: string) => ConstructionUnitV2[];
  changeStatus: (id: string, status: string) => Promise<ConstructionUnitV2>;
  softDelete: (id: string) => Promise<ConstructionUnitV2>;
  generateGrid: (buildingId: string, perFloor?: number) => Promise<ConstructionUnitV2[]>;
  migrateUnitsToApartmentNodes?: (buildingId: string) => Promise<number>;
  ensureApartmentForUnit?: (unitId: string) => Promise<ConstructionUnitV2>;
  get: (id: string) => ConstructionUnitV2 | null;
};

type AccSvc = {
  init?: () => Promise<boolean>;
  list: (opts?: { locationId?: string }) => ConstructionAcceptanceV2[];
  listForLocation?: (locationId: string) => ConstructionAcceptanceV2[];
  get: (id: string) => ConstructionAcceptanceV2 | null;
  create: (input: Record<string, unknown>) => Promise<ConstructionAcceptanceV2>;
  changeStatus: (id: string, status: string) => Promise<ConstructionAcceptanceV2>;
  softDelete: (id: string) => Promise<ConstructionAcceptanceV2>;
};

function _loc(): LocSvc | null {
  return (window.RBI?.services?.locations as LocSvc) || null;
}

function _units(): UnitsSvc | null {
  return (window.RBI?.services?.constructionUnits as UnitsSvc) || null;
}

function _acc(): AccSvc | null {
  return (window.RBI?.services?.constructionAcceptance as AccSvc) || null;
}

function _listAccForLocation(locationId: string): ConstructionAcceptanceV2[] {
  const a = _acc();
  if (!a || !locationId) return [];
  if (typeof a.listForLocation === 'function') return a.listForLocation(locationId) || [];
  return a.list({ locationId }) || [];
}

function _bForUnit(unit: ConstructionUnitV2): { final: number; statusTxt: string } | null {
  const latest = pickLatestAcceptanceForB(_listAccForLocation(unit.locationId));
  if (!latest) return null;
  const b = computeAcceptanceQualityB(
    latest.template_key || latest.checklist_results?.template_key,
    latest.checklist_results
  );
  if (!b) return null;
  return { final: b.final, statusTxt: b.statusTxt };
}

function _permissions() {
  return window.RBI?.services?.permissions as
    | {
        getCurrentRole?: () => string;
        canManageHierarchy?: () => boolean;
        getCurrentEngineerName?: () => string;
      }
    | undefined;
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

function _toast(msg: string) {
  const fn = (window as unknown as { showToast?: (m: string) => void }).showToast;
  if (typeof fn === 'function') fn(msg);
  else console.info('[transfer-board-desktop]', msg);
}

function _isGuest(): boolean {
  const role = _permissions()?.getCurrentRole?.() || 'guest';
  return role === 'guest';
}

function _canManage(): boolean {
  const p = _permissions();
  if (p?.canManageHierarchy) return !!p.canManageHierarchy();
  const role = p?.getCurrentRole?.() || '';
  return ['manager', 'deputy_manager', 'director', 'admin'].includes(role);
}

function _canSoftDelete(u: ConstructionUnitV2): boolean {
  if (_canManage()) return true;
  const me = _permissions()?.getCurrentEngineerName?.() || '';
  return !!(me && u.created_by && me === u.created_by);
}

function _cellBg(status: string): string {
  const st = String(status || 'not_inspected');
  if (st === 'transferred' || st === 'accepted') {
    return 'bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:border-green-800';
  }
  if (st === 'has_defects' || st === 'defects') {
    return 'bg-danger-soft text-danger border-danger-soft';
  }
  if (st === 'shareholder_defects') {
    return 'bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:border-orange-800';
  }
  if (st === 'ready_for_transfer') {
    return 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:border-amber-700';
  }
  if (st === 'finishing' || st === 'ready') {
    return 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:border-blue-800';
  }
  return 'bg-surface text-ink border-surface';
}

let _objectId: string | null = null;
let _buildingId: string | null = null;
let _bound = false;

function _renderLegend(): string {
  const items: { st: UnitStatusV2; swatch: string }[] = [
    { st: 'not_inspected', swatch: 'bg-surface border border-surface' },
    { st: 'finishing', swatch: 'bg-blue-100 border border-blue-300' },
    { st: 'has_defects', swatch: 'bg-danger-soft border border-danger-soft' },
    { st: 'ready_for_transfer', swatch: 'bg-amber-100 border border-amber-300' },
    { st: 'transferred', swatch: 'bg-green-100 border border-green-300' },
    { st: 'shareholder_defects', swatch: 'bg-orange-100 border border-orange-300' }
  ];
  return `
    <div class="flex flex-wrap gap-3 mb-4 justify-center bg-surface p-2 rounded-xl border border-surface shadow-sm">
      ${items
        .map(
          (it) =>
            `<div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded ${it.swatch}"></span><span class="text-rbi-caption font-bold text-muted uppercase">${_escape(
              _unitStatusLabel(it.st)
            )}</span></div>`
        )
        .join('')}
    </div>`;
}

function _renderGrid(uSvc: UnitsSvc, loc: LocSvc): string {
  if (!_buildingId) {
    return `<div class="text-center py-10 text-muted font-bold text-rbi-label uppercase tracking-widest bg-surface rounded-xl border border-dashed border-surface shadow-sm">${_escape(_t('construction.v2.transfer.select_building', 'Выберите корпус для просмотра шахматки'))}</div>`;
  }
  const floors = _floorsForBuilding(_buildingId, loc);
  if (!floors.length) {
    return `<div class="text-center py-10 text-muted font-bold text-rbi-label uppercase tracking-widest bg-surface rounded-xl border border-dashed border-surface shadow-sm">${_escape(_t('construction.v2.transfer.no_floors', 'В этом корпусе ещё не созданы этажи'))}</div>`;
  }
  const bldUnits = uSvc.listForBuilding(_buildingId);
  let html = _renderLegend();
  html += `<div class="flex flex-col gap-1.5">`;
  for (const floor of floors) {
    const floorUnits = uSvc
      .listForFloor(floor.id)
      .slice()
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const floorLabel = floor.displayName || floor.id;
    html += `
      <div class="flex items-center gap-2">
        <div class="w-14 shrink-0 text-center font-black text-rbi-caption text-muted bg-[var(--hover-bg)] py-3.5 rounded-lg border border-[var(--card-border)] uppercase tracking-tight">${_escape(
          floorLabel
        )}</div>
        <div class="flex gap-1.5 flex-wrap flex-1">`;
    if (!floorUnits.length) {
      html += `<div class="text-rbi-caption text-muted italic py-3">${_escape(_t('construction.v2.transfer.no_rooms', 'Помещений нет'))}</div>`;
    } else {
      for (const u of floorUnits) {
        const bg = _cellBg(String(u.status || 'not_inspected'));
        const pdfDot = u.pdf_url ? `<span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-brand"></span>` : '';
        const b = _bForUnit(u);
        let bTint = '';
        let bBadge = '';
        if (b) {
          const ring =
            b.final < 70
              ? 'ring-2 ring-danger/70'
              : b.final < 85
                ? 'ring-2 ring-amber-400/70'
                : 'ring-2 ring-emerald-400/60';
          bTint = ` ${ring}`;
          bBadge = `<span class="absolute bottom-0 left-0 right-0 text-rbi-caption font-black leading-none py-0.5 ${
            b.final < 70
              ? 'bg-danger/90 text-white'
              : b.final < 85
                ? 'bg-amber-500/90 text-white'
                : 'bg-emerald-600/90 text-white'
          }" title="${_escape(b.statusTxt)}">${_escape(String(b.final))}</span>`;
        }
        html += `
          <button type="button" data-c2-tr-desk-unit-cell="${_escape(u.id)}"
            class="relative ${bg}${bTint} border rounded-lg w-[54px] h-[54px] flex flex-col items-center justify-center cursor-pointer shadow-sm hover:scale-105 transition-transform active:scale-95 overflow-hidden">
            ${pdfDot}
            ${bBadge}
            <span class="text-rbi-body font-black">${_escape(u.name)}</span>
            <span class="text-rbi-caption opacity-60 font-bold">${_escape(u.type || 'КВ')}</span>
          </button>`;
      }
    }
    html += `</div></div>`;
  }
  html += `</div>`;

  if (_canManage() && bldUnits.length === 0) {
    html += `
      <button type="button" data-c2-tr-desk-generate-grid
        class="mt-4 w-full bg-brand-soft text-brand border border-brand-soft py-3.5 rounded-xl text-rbi-caption font-black uppercase shadow-sm active:scale-95 transition-transform flex items-center justify-center gap-2">
        ${_escape(_t('construction.v2.transfer.generate_grid', 'Сгенерировать сетку квартир (8 на этаж)'))}
      </button>`;
  }
  return html;
}

function _selectorsHtml(loc: LocSvc): string {
  const objects = loc.listNodes({ nodeType: 'object', parentId: null });
  let objOpts = `<option value="">${_escape(_t('construction.v2.transfer.object_select', '— объект —'))}</option>`;
  for (const o of objects) {
    objOpts += `<option value="${_escape(o.id)}" ${_objectId === o.id ? 'selected' : ''}>${_escape(
      o.displayName
    )}</option>`;
  }
  let bldOpts = `<option value="">${_escape(_t('construction.v2.transfer.building_select', '— корпус —'))}</option>`;
  if (_objectId) {
    const buildings = loc.getChildren(_objectId).filter((b) => !b.nodeType || b.nodeType === 'building');
    for (const b of buildings) {
      bldOpts += `<option value="${_escape(b.id)}" ${_buildingId === b.id ? 'selected' : ''}>${_escape(
        b.displayName
      )}</option>`;
    }
  }
  return `
    <div class="flex gap-2 mb-4 max-w-xl">
      <select id="c2-tr-desk-object" class="flex-1 rounded-xl border border-surface bg-surface px-3 py-2.5 text-rbi-body font-bold">
        ${objOpts}
      </select>
      <select id="c2-tr-desk-building" class="flex-1 rounded-xl border border-surface bg-surface px-3 py-2.5 text-rbi-body font-bold" ${_objectId ? '' : 'disabled'}>
        ${bldOpts}
      </select>
    </div>`;
}

async function _refreshBoard() {
  const root = document.getElementById('construction-v2-root');
  if (root) await renderTransferBoardDesktop(root);
}

export async function renderTransferBoardDesktop(root: HTMLElement): Promise<void> {
  const loc = _loc();
  const uSvc = _units();
  if (!loc) {
    root.innerHTML = `<div class="p-6 text-danger text-rbi-body font-bold">${_escape(_t('construction.v2.svc_locations_missing', 'service.locations не загружен'))}</div>`;
    return;
  }
  if (!uSvc) {
    root.innerHTML = `<div class="p-6 text-danger text-rbi-body font-bold">${_escape(_t('construction.v2.svc_units_missing', 'service.constructionUnits не загружен'))}</div>`;
    return;
  }
  await loc.init();
  await uSvc.init();
  const aSvc = _acc();
  if (aSvc?.init) {
    try {
      await aSvc.init();
    } catch (_) { /* ignore */ }
  }
  if (_buildingId && typeof uSvc.migrateUnitsToApartmentNodes === 'function') {
    try {
      await uSvc.migrateUnitsToApartmentNodes(_buildingId);
    } catch (e) {
      console.warn('[transfer-board-desktop] migrateUnitsToApartmentNodes', e);
    }
  }
  closeUnitCard();

  root.innerHTML = `
    <div class="w-full">
      <div class="mb-3">
        <div class="text-rbi-caption font-black uppercase tracking-widest text-brand">${_escape(_t('construction.v2.transfer.title', 'Передача · шахматка v2'))}</div>
        <p class="text-rbi-label text-muted font-bold mt-0.5">${_escape(_t('construction.v2.transfer.hint', 'Клик по клетке — карточка квартиры{guest}', { guest: _isGuest() ? _t('construction.v2.transfer.guest_view', ' (только просмотр)') : '' }))}</p>
      </div>
      ${_selectorsHtml(loc)}
      <div id="c2-tr-desk-grid">${_renderGrid(uSvc, loc)}</div>
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
      if (!t) return;
      if (t.id === 'c2-tr-desk-object') {
        _objectId = (t as HTMLSelectElement).value || null;
        _buildingId = null;
        void _refreshBoard();
        return;
      }
      if (t.id === 'c2-tr-desk-building') {
        _buildingId = (t as HTMLSelectElement).value || null;
        void _refreshBoard();
      }
    },
    true
  );

  document.addEventListener(
    'click',
    (ev) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;

      const gen = t.closest?.('[data-c2-tr-desk-generate-grid]') as HTMLElement | null;
      if (gen) {
        ev.preventDefault();
        void _onGenerate();
        return;
      }

      const cell = t.closest?.('[data-c2-tr-desk-unit-cell]') as HTMLElement | null;
      if (cell) {
        ev.preventDefault();
        const id = cell.getAttribute('data-c2-tr-desk-unit-cell');
        const uSvc = _units();
        const loc = _loc();
        const u = id && uSvc ? uSvc.get(id) : null;
        if (u && uSvc) {
          openUnitCard(u, {
            loc,
            units: uSvc,
            cb: {
              onChanged: _refreshBoard,
              isGuest: _isGuest,
              canSoftDelete: _canSoftDelete,
              toast: _toast,
              onOpenApartmentPlan: async (unit) => {
                closeUnitCard();
                await openApartmentPlan(unit, {
                  isGuest: _isGuest,
                  toast: _toast,
                  onChanged: _refreshBoard
                });
              },
              onOpenAcceptance: async (unit) => {
                await _openUnitAcceptance(unit);
              }
            }
          });
        }
      }
    },
    true
  );
}

async function _openUnitAcceptance(unit: ConstructionUnitV2): Promise<void> {
  if (_isGuest()) {
    _toast(_t('construction.v2.transfer.guest_acceptance', 'Гости не могут открывать приёмку'));
    return;
  }
  const aSvc = _acc();
  const uSvc = _units();
  if (!aSvc) {
    _toast(_t('construction.v2.svc_acc_missing', 'service.constructionAcceptance не загружен'));
    return;
  }
  let fresh = unit;
  if (uSvc?.ensureApartmentForUnit) {
    try {
      fresh = await uSvc.ensureApartmentForUnit(unit.id);
    } catch (e) {
      console.warn('[transfer-board-desktop] ensureApartmentForUnit', e);
    }
  }
  const locationId = String(fresh.locationId || '').trim();
  if (!locationId) {
    _toast(_t('construction.v2.transfer.no_location', 'У квартиры нет locationId'));
    return;
  }

  const list = _listAccForLocation(locationId)
    .filter((a) => String(a.status) !== 'rejected')
    .slice()
    .sort((a, b) =>
      String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''))
    );
  const pending = list.find((a) => String(a.status) === 'pending');
  const openItem = pending || list[0] || null;

  const openDetails = (item: ConstructionAcceptanceV2) => {
    closeUnitCard();
    openAcceptanceDetails(item, {
      onChangeStatus: async (rid, status) => {
        await aSvc.changeStatus(rid, status);
        _toast(_t('construction.v2.status_updated', '✅ Статус обновлён'));
        await _refreshBoard();
      },
      onSoftDelete: async (rid) => {
        await aSvc.softDelete(rid);
        _toast(_t('construction.v2.acc_revoked', 'Заявка отозвана'));
        await _refreshBoard();
      },
      onChecklistChanged: async () => {
        await _refreshBoard();
      }
    });
  };

  if (openItem) {
    openDetails(openItem);
    return;
  }

  closeUnitCard();
  openCreateAcceptanceForm(
    { locationId, zone: { ...APARTMENT_FULL_ZONE }, mode: 'apartment' },
    async (input) => {
      const created = await aSvc.create(input);
      _toast(_t('construction.v2.acc_created', '✅ Приёмка создана'));
      await _refreshBoard();
      openDetails(created);
    }
  );
}

async function _onGenerate() {
  if (!_buildingId || !_canManage()) return;
  if (!confirm(_t('construction.v2.transfer.generate_confirm', 'Сгенерировать по 8 квартир на каждом этаже? (статус — не осматривалась)'))) return;
  const uSvc = _units();
  if (!uSvc) return;
  try {
    _toast(_t('construction.v2.transfer.generating', '⏳ Генерируем помещения…'));
    const created = await uSvc.generateGrid(_buildingId, 8);
    _toast(_t('construction.v2.transfer.generated', '✅ Создано: {count}', { count: created.length }));
    await _refreshBoard();
  } catch (e) {
    console.warn('[transfer-board-desktop] generateGrid', e);
    _toast(_t('construction.v2.error_prefix', 'Ошибка: {msg}', { msg: (e as Error)?.message || String(e) }));
  }
}
