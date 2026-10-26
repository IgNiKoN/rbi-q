/**
 * Platform entry: construction-v2 (Vite bundle).
 * Legacy js/modules/construction/** не импортируется и не изменяется.
 */

import { ConstructionV2Manifest } from './manifest';
import { refreshApartmentPlanMarkers } from './apartment-plan';
import {
  mountConstructionV2Shell,
  refreshConstructionV2Markers,
  renderConstructionV2,
  requestFocusAcceptance,
  setConstructionV2Subview
} from './ui';
import { isContractorRole } from './contractor-scope';
import type { ConstructionAcceptanceV2 } from '../../services/construction-acceptance/types';
import type { ConstructionDefectV2 } from '../../services/construction-defects/types';

let _inited = false;

type AccSvcLoop = {
  list: (opts?: { locationId?: string }) => ConstructionAcceptanceV2[];
  listForLocation?: (locationId: string) => ConstructionAcceptanceV2[];
  setChecklistItem: (
    id: string,
    item: {
      id: string;
      group?: string | null;
      name: string;
      status: string;
    }
  ) => Promise<ConstructionAcceptanceV2>;
};

type DefSvcLoop = {
  get: (id: string) => ConstructionDefectV2 | null;
};

/**
 * B-петля: defect → closed (+ item_id) → FAIL/fail_escalated пункта той же locationId → OK.
 * Rejected приёмки не трогаем. Канон: closed (fixed не авто-OK).
 */
async function _syncChecklistOnDefectClosed(payload: {
  reason?: string;
  id?: string;
  locationId?: string;
  status?: string;
}): Promise<void> {
  if (payload?.reason !== 'changeStatus') return;
  if (String(payload.status || '') !== 'closed') return;
  const defectId = String(payload.id || '').trim();
  if (!defectId) return;

  const dSvc = window.RBI?.services?.constructionDefects as DefSvcLoop | undefined;
  const aSvc = window.RBI?.services?.constructionAcceptance as AccSvcLoop | undefined;
  if (!dSvc?.get || !aSvc?.setChecklistItem) return;

  const defect = dSvc.get(defectId);
  if (!defect || defect.is_deleted || defect._deleted) return;
  const itemId = String(defect.item_id || '').trim();
  const locationId = String(defect.locationId || payload.locationId || '').trim();
  if (!itemId || !locationId) return;

  const acceptances =
    (typeof aSvc.listForLocation === 'function'
      ? aSvc.listForLocation(locationId)
      : aSvc.list({ locationId })) || [];

  for (const acc of acceptances) {
    if (!acc || acc.is_deleted || acc._deleted) continue;
    if (String(acc.status) === 'rejected') continue;
    const row = (acc.checklist_results?.items || []).find((it) => String(it.id) === itemId);
    if (!row) continue;
    if (row.status !== 'fail' && row.status !== 'fail_escalated') continue;
    try {
      await aSvc.setChecklistItem(acc.id, {
        id: itemId,
        name: String(row.name || defect.item_name || itemId),
        group: row.group ?? null,
        status: 'ok'
      });
    } catch (e) {
      console.warn('[construction-v2] auto checklist OK on defect closed', e);
    }
  }
}

function _hashPath(): string {
  return (location.hash || '').replace(/^#/, '');
}

function _applyHashSubview() {
  const h = _hashPath();
  if (h.startsWith('/construction-v2/acceptance')) {
    setConstructionV2Subview('acceptance');
  } else if (h.startsWith('/construction-v2/transfer')) {
    setConstructionV2Subview('transfer');
  } else if (h.startsWith('/construction-v2/defects')) {
    setConstructionV2Subview('defects');
  } else if (h.startsWith('/construction-v2/metrics')) {
    setConstructionV2Subview('metrics');
  } else if (h.startsWith('/construction-v2/cabinet')) {
    setConstructionV2Subview('cabinet');
  } else if (h === '/construction-v2' || h === '/construction-v2/') {
    setConstructionV2Subview(isContractorRole() ? 'cabinet' : 'plan');
  } else if (h.startsWith('/construction-v2')) {
    setConstructionV2Subview(isContractorRole() ? 'cabinet' : 'plan');
  }
}

async function init(_ctx?: Record<string, unknown>) {
  if (_inited) {
    _applyHashSubview();
    await renderConstructionV2();
    return { ok: true, reentered: true };
  }
  mountConstructionV2Shell();
  _applyHashSubview();
  await renderConstructionV2();

  window.RBI?.events?.on?.('locations:changed', () => {
    const tab = document.getElementById('tab-construction-v2');
    if (tab && !tab.classList.contains('hidden')) {
      renderConstructionV2().catch(() => {});
    }
  });

  window.RBI?.events?.on?.('construction-defects:changed', (payload?: unknown) => {
    refreshConstructionV2Markers().catch(() => {});
    refreshApartmentPlanMarkers().catch(() => {});
    const p = (payload || {}) as {
      reason?: string;
      id?: string;
      locationId?: string;
      status?: string;
    };
    void _syncChecklistOnDefectClosed(p);
  });

  window.RBI?.events?.on?.('construction-acceptance:changed', () => {
    refreshConstructionV2Markers().catch(() => {});
    // Шахматка подхватывает B при следующем render transfer (hash/subview).
    const tab = document.getElementById('tab-construction-v2');
    if (tab && !tab.classList.contains('hidden')) {
      const transferRoot = document.getElementById('c2-transfer-grid');
      if (transferRoot) {
        renderConstructionV2().catch(() => {});
      }
    }
  });

  window.RBI?.events?.on?.('construction-units:changed', () => {
    refreshConstructionV2Markers().catch(() => {});
  });

  window.RBI?.events?.on?.('construction-acceptance:focus', (payload?: unknown) => {
    const p = (payload || {}) as { id?: string; locationId?: string };
    if (p.id && p.locationId) requestFocusAcceptance(p.id, p.locationId);
  });

  _registerAppRouter();
  if (_hashPath().startsWith('/construction-v2')) {
    showTab();
  }

  _inited = true;
  console.info('[construction-v2] init ok');
  return { ok: true };
}

function showTab() {
  // App Shell / AppRouter переключают вкладки через .active (не .hidden)
  document.querySelectorAll('.view-section').forEach((el) => {
    el.classList.remove('active');
  });
  const tab = document.getElementById('tab-construction-v2');
  if (tab) {
    tab.classList.remove('hidden');
    tab.classList.add('active');
  }
  // Construction-совместимая шапка (без checklist quality); bottom-nav остаётся видимым
  const modeMgr = (
    window as unknown as {
      AppModeManager?: {
        currentMode?: string;
        updateHeaderVisibility?: (show?: boolean) => void;
        renderBottomNav?: () => void;
      };
    }
  ).AppModeManager;
  if (modeMgr?.updateHeaderVisibility) {
    modeMgr.updateHeaderVisibility(true);
  } else {
    const header = document.getElementById('main-header');
    if (header) header.style.display = 'block';
  }
  if (modeMgr?.currentMode === 'construction-v2' && typeof modeMgr.renderBottomNav === 'function') {
    modeMgr.renderBottomNav();
  } else {
    const navEl = document.getElementById('main-bottom-nav');
    if (navEl && modeMgr?.currentMode === 'construction-v2') navEl.style.display = 'flex';
  }
  if (typeof window.updateBodyPadding === 'function') {
    setTimeout(() => window.updateBodyPadding?.(), 50);
  }
  _applyHashSubview();
  renderConstructionV2().catch(() => {});
}

function _registerAppRouter() {
  const router = (window as unknown as { AppRouter?: { addRoute?: (p: string, fn: () => void) => void } })
    .AppRouter;
  if (router && typeof router.addRoute === 'function') {
    router.addRoute('#/construction-v2', () => showTab());
    router.addRoute('#/construction-v2/acceptance', () => showTab());
    router.addRoute('#/construction-v2/transfer', () => showTab());
    router.addRoute('#/construction-v2/defects', () => showTab());
    router.addRoute('#/construction-v2/metrics', () => showTab());
    router.addRoute('#/construction-v2/cabinet', () => showTab());
  }
}

/** Регистрация модуля в registry (как classic modules). */
function registerModule() {
  window.RBI = window.RBI || ({ services: {} } as Window['RBI']);
  const mod = { init, showTab, manifest: ConstructionV2Manifest, render: renderConstructionV2 };
  if (window.RBI.registry?.register) {
    window.RBI.registry.register('module.construction-v2', mod);
  }
  (window as unknown as { ConstructionV2Module?: typeof mod }).ConstructionV2Module = mod;

  _registerAppRouter();

  // Hash-роутинг без ломки legacy #/construction
  window.addEventListener('hashchange', () => {
    const h = _hashPath();
    if (h.startsWith('/construction-v2')) showTab();
  });
  if (_hashPath().startsWith('/construction-v2')) {
    // после mount (и после возможного раннего AppRouter → 404-заглушки)
    setTimeout(() => showTab(), 0);
  }
}

registerModule();

export { init, showTab, ConstructionV2Manifest };
export default { init, showTab, manifest: ConstructionV2Manifest };
