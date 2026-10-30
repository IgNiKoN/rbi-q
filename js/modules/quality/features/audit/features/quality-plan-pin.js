/**
 * Quality plan pin — fullscreen PDF pin + object→building→floor picker.
 * ES-модуль без window.* assignments (публичный API через audit.module.js).
 * Паттерн координат % — как construction-v2 PlanViewer, без cross-import.
 */

import { collectFloorPinMarkers } from '../../shared/plan-pin-label.js';

let _mounted = false;
let _planPinI18nBound = false;

function _t(key, fallback, vars) {
  try {
    const i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
    if (i18n && typeof i18n.t === 'function') {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_) { /* ignore */ }
  if (vars && typeof fallback === 'string') {
    return fallback.replace(/\{(\w+)\}/g, function (_, name) {
      return vars[name] != null ? String(vars[name]) : '{' + name + '}';
    });
  }
  return fallback;
}

function _locations() {
  const rbi = window.RBI;
  return (rbi && rbi.services && rbi.services.locations) || null;
}

function _toast(msg) {
  const fn = window['showToast'];
  if (typeof fn === 'function') fn(msg);
}

function _planFooterHint(readOnly, mountEl, hasPin) {
  if (readOnly) {
    if (mountEl) {
      return _t(
        'quality.audit.plan.hint_view_fs',
        'Колёсико — прокрутка · Ctrl/⌘+колёсико или ± — зум · точка открывает проверку'
      );
    }
    return _t(
      'quality.audit.plan.hint_view',
      'Нажмите на точку, чтобы открыть проверку · Ctrl/⌘+колёсико или ± — зум'
    );
  }
  if (hasPin) {
    return _t('quality.audit.plan.hint_move', 'Перетащите точку или нажмите новое место');
  }
  return _t(
    'quality.audit.plan.hint_place',
    'Нажмите на план, чтобы поставить точку · pinch / ± для масштаба'
  );
}

function _stepLabelText(step) {
  if (step === 'building') return _t('quality.audit.plan.step_building', 'Корпус');
  if (step === 'section') return _t('quality.audit.plan.step_section', 'Секция');
  if (step === 'floor') return _t('quality.audit.plan.step_floor', 'Этаж');
  return _t('quality.audit.plan.step_object', 'Объект');
}

function _refreshOpenPlanPinI18n() {
  const overlay = document.getElementById('quality-plan-pin-overlay');
  if (!overlay) return;

  if (overlay.getAttribute('data-qpin-mode') === 'picker') {
    const step = overlay.getAttribute('data-qpin-step') || 'object';
    const stepLabel = overlay.querySelector('[data-qpin-step-label]');
    if (stepLabel) stepLabel.textContent = _stepLabelText(step);
    const pickTitle = overlay.querySelector('[data-qpin-pick-title]');
    if (pickTitle) {
      pickTitle.textContent = _t('quality.audit.plan.pick_floor_title', 'Выбор этажа для плана');
    }
    const emptyEl = overlay.querySelector('[data-qpin-empty-key]');
    if (emptyEl) {
      const ek = emptyEl.getAttribute('data-qpin-empty-key');
      const emptyMap = {
        floors: ['quality.audit.plan.empty_floors', 'Нет этажей'],
        sections: ['quality.audit.plan.empty_sections', 'Нет секций'],
        buildings: ['quality.audit.plan.empty_buildings', 'Нет корпусов'],
        objects: ['quality.audit.plan.empty_objects', 'Нет объектов в справочнике']
      };
      const pair = emptyMap[ek];
      if (pair) emptyEl.textContent = _t(pair[0], pair[1]);
    }
    return;
  }

  const readOnly = overlay.getAttribute('data-qpin-readonly') === '1';
  const mountEl = overlay.getAttribute('data-qpin-inline') === '1';
  const hasPin = overlay.getAttribute('data-qpin-has-temp') === '1';

  const titleEl = overlay.querySelector('[data-qpin-title]');
  if (titleEl) {
    titleEl.textContent = readOnly
      ? _t('quality.audit.plan.title_history', 'План этажа (история)')
      : _t('quality.audit.plan.title_edit', 'Точка на плане этажа');
  }

  const filterType = overlay.querySelector('[data-qpin-filter-type]');
  if (filterType) filterType.textContent = _t('quality.audit.plan.filter_type', 'Вид');
  const filterContr = overlay.querySelector('[data-qpin-filter-contractor]');
  if (filterContr) filterContr.textContent = _t('quality.audit.plan.filter_contractor', 'Подр.');
  overlay.querySelectorAll('[data-qpin-chip="__all__"], [data-qpin-cchip="__all__"]').forEach(function (btn) {
    btn.textContent = _t('quality.audit.plan.filter_all', 'Все');
  });

  const confirmBtn = overlay.querySelector('[data-qpin-confirm]');
  if (confirmBtn) confirmBtn.textContent = _t('quality.audit.plan.confirm', 'Подтвердить');
  const otherFloor = overlay.querySelector('[data-qpin-other-floor]');
  if (otherFloor) otherFloor.textContent = _t('quality.audit.plan.other_floor', 'Другой этаж');
  const cancelBtn = overlay.querySelector('[data-qpin-cancel]');
  if (cancelBtn) {
    cancelBtn.textContent = readOnly
      ? _t('quality.audit.plan.close', 'Закрыть')
      : _t('quality.audit.plan.cancel', 'Отмена');
  }
  const fsBtn = overlay.querySelector('[data-qpin-fullscreen]');
  if (fsBtn) {
    const fsLabel = _t('quality.audit.plan.fullscreen', 'На весь экран');
    fsBtn.setAttribute('title', fsLabel);
    fsBtn.setAttribute('aria-label', fsLabel);
  }
  const loader = overlay.querySelector('[data-qpin-loader]');
  if (loader) loader.textContent = _t('quality.audit.plan.loading', 'Загрузка плана…');
  const footer = overlay.querySelector('[data-qpin-footer]');
  if (footer) footer.textContent = _planFooterHint(readOnly, mountEl, hasPin);
}

function _bindPlanPinI18n() {
  if (_planPinI18nBound) return;
  _planPinI18nBound = true;
  if (window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function') {
    window.RBI.events.on('i18n:localeChanged', function () {
      try { _refreshOpenPlanPinI18n(); } catch (_) { /* ignore */ }
      try { updatePinIndicator(); } catch (_) { /* ignore */ }
    });
  }
}

async function _pdfjs() {
  try {
    return (window.rbiPdfjs ? await window.rbiPdfjs() : window.pdfjsLib) || null;
  } catch (_e) {
    return null;
  }
}

function _norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/^корпус\s+/i, '')
    .replace(/^этаж\s+/i, '')
    .replace(/^секция\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function _escape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function _getPin() {
  const st = window.AuditState;
  if (st && typeof st.getPlanPin === 'function') return st.getPlanPin();
  return null;
}

function _setPin(pin) {
  const st = window.AuditState;
  if (st && typeof st.setPlanPin === 'function') st.setPlanPin(pin);
}

function _clearPinState() {
  const st = window.AuditState;
  if (st && typeof st.clearPlanPin === 'function') st.clearPlanPin();
}

function _scheduleSave() {
  const actions = window.AuditActions;
  if (actions && typeof actions.scheduleSessionSave === 'function') {
    actions.scheduleSessionSave();
    return;
  }
  const fn = window['scheduleSessionSave'];
  if (typeof fn === 'function') fn();
}

function _updateLocationFromStructured() {
  const fn = window['updateLocationFromStructured'];
  if (typeof fn === 'function') fn();
}

/** Sections under a building. */
function _sectionsUnderBuilding(loc, buildingId) {
  return (loc.getChildren(buildingId) || []).filter(function (n) {
    return !n.nodeType || n.nodeType === 'section';
  });
}

/** Floors under one section. */
function _floorsUnderSection(loc, sectionId) {
  return (loc.getChildren(sectionId) || []).filter(function (n) {
    return n.nodeType === 'floor';
  });
}

/** Floors under a building (building → sections → floors). */
function _floorsUnderBuilding(loc, buildingId) {
  const sections = _sectionsUnderBuilding(loc, buildingId);
  const floors = [];
  for (let i = 0; i < sections.length; i++) {
    const kids = _floorsUnderSection(loc, sections[i].id);
    for (let j = 0; j < kids.length; j++) floors.push(kids[j]);
  }
  return floors;
}

function _isDefaultSection(sec) {
  if (!sec) return true;
  const n = _norm(sec.displayName);
  return !n || n === '1' || n === 'секция 1' || n === 'default' || n === 'основная' || n === 'осн';
}

/**
 * Resolve floor node from form fields (project / section=корпус / floor).
 * @returns {{ floor: object, path: object[] } | null}
 */
export function resolveFloorFromForm() {
  const loc = _locations();
  if (!loc || typeof loc.listNodes !== 'function') return null;

  const pin = _getPin();
  if (pin && pin.locationId) {
    const floor = loc.getNode(pin.locationId);
    if (floor && floor.nodeType === 'floor') {
      return { floor: floor, path: loc.getPath(floor.id) || [] };
    }
  }

  const projEl = document.getElementById('inp-project');
  const secEl = document.getElementById('inp-section');
  const floorEl = document.getElementById('inp-floor');
  const projName = _norm(projEl && projEl.value);
  const buildingName = _norm(secEl && secEl.value);
  const floorName = _norm(floorEl && floorEl.value);
  if (!projName || !buildingName || !floorName) return null;

  const objects = loc.listNodes({ nodeType: 'object', parentId: null }) || [];
  let obj = null;

  // Prefer linked locationObjectId from OD↔locations bridge when form has project name
  if (typeof loc.resolveObjectLink === 'function' && projName) {
    const projRaw = (projEl && projEl.value) || '';
    const link = loc.resolveObjectLink({ displayName: projRaw });
    if (link && link.locationObject) {
      obj = link.locationObject;
    }
  }
  if (!obj) {
    obj = objects.find(function (o) {
      return _norm(o.displayName) === projName || _norm(o.canonical_key) === projName;
    }) || null;
  }
  if (!obj) return null;

  const buildings = loc.getChildren(obj.id) || [];
  const building = buildings.find(function (b) {
    if (b.nodeType && b.nodeType !== 'building') return false;
    const bn = _norm(b.displayName);
    return bn === buildingName || buildingName.indexOf(bn) === 0 || bn.indexOf(buildingName) === 0;
  });
  if (!building) return null;

  const floors = _floorsUnderBuilding(loc, building.id);
  const floor = floors.find(function (f) {
    const fn = _norm(f.displayName);
    return fn === floorName || fn === 'этаж ' + floorName || floorName === fn.replace(/^этаж\s+/, '');
  });
  if (!floor) return null;
  return { floor: floor, path: loc.getPath(floor.id) || [] };
}

/** Seed smart-input suggestions from locations (merge, keep ObjectDirectory). */
export function seedLocationSuggestions() {
  const loc = _locations();
  if (!loc || typeof loc.listNodes !== 'function') return;
  try {
    let cache = {};
    try {
      cache = JSON.parse(localStorage.getItem('smart_input_cache') || '{}') || {};
    } catch (_e) {
      cache = {};
    }
    const clean = typeof loc.cleanObjectName === 'function'
      ? function (s) { return loc.cleanObjectName(s); }
      : function (s) {
        return String(s || '').toLowerCase().replace(/['"«»]/g, '').replace(/жк\s+/gi, '').trim();
      };
    const mergeUnique = function (field, names) {
      const prev = Array.isArray(cache[field]) ? cache[field] : [];
      const seen = new Set();
      const out = [];
      prev.concat(names).forEach(function (raw) {
        const v = String(raw || '').trim();
        if (!v) return;
        const k = clean(v);
        if (!k || seen.has(k)) return;
        seen.add(k);
        out.push(v);
      });
      cache[field] = out.slice(0, 60);
    };

    const objects = loc.listNodes({ nodeType: 'object', parentId: null }) || [];
    mergeUnique('projectName', objects.map(function (o) { return o.displayName; }));

    const buildings = loc.listNodes({ nodeType: 'building' }) || [];
    mergeUnique('section', buildings.map(function (b) { return b.displayName; }));

    const floors = loc.listNodes({ nodeType: 'floor' }) || [];
    mergeUnique('floor', floors.map(function (f) { return f.displayName; }));

    localStorage.setItem('smart_input_cache', JSON.stringify(cache));
    // Refresh in-memory smart-input cache object if already created (mutate, no global assign).
    const mem = window['_smartInputMemoryCache'];
    if (mem && typeof mem === 'object') {
      Object.keys(cache).forEach(function (k) {
        mem[k] = cache[k];
      });
    }
  } catch (e) {
    console.warn('[quality-plan-pin] seed suggestions failed', e);
  }
}

export function updatePinIndicator() {
  const el = document.getElementById('quality-plan-pin-indicator');
  const room = document.getElementById('inp-room');
  const pin = _getPin();
  if (el) {
    if (pin && pin.locationId != null && Number.isFinite(Number(pin.x)) && Number.isFinite(Number(pin.y))) {
      el.classList.remove('hidden');
      el.classList.add('flex');
    } else {
      el.classList.add('hidden');
      el.classList.remove('flex');
    }
  }
  if (room) {
    if (pin) {
      room.placeholder = _t('quality.audit.field.room_optional', 'Оси/Пом. (опц.)');
      room.removeAttribute('required');
    } else {
      room.placeholder = _t('quality.audit.field.room_required', 'Оси/Пом.*');
    }
  }
}

/**
 * Apply path texts to form + set planPin. Does not wipe inp-room.
 */
export function applyPinToForm(pin, floorId) {
  const loc = _locations();
  if (!loc || !pin || !floorId) return false;
  const path = loc.getPath(floorId) || [];
  const obj = path.find(function (n) { return n.nodeType === 'object'; });
  const building = path.find(function (n) { return n.nodeType === 'building'; });
  const section = path.find(function (n) { return n.nodeType === 'section'; });
  const floor = path.find(function (n) { return n.nodeType === 'floor'; }) || loc.getNode(floorId);
  if (!floor) return false;

  const proj = document.getElementById('inp-project');
  const sec = document.getElementById('inp-section');
  const floorEl = document.getElementById('inp-floor');

  if (proj && obj && !proj.readOnly && !proj.disabled) {
    proj.value = obj.displayName || '';
  }
  if (sec && building) {
    let secVal = building.displayName || '';
    if (section && !_isDefaultSection(section)) {
      secVal = secVal + ' / ' + section.displayName;
    }
    sec.value = secVal;
  }
  if (floorEl && floor) {
    floorEl.value = floor.displayName || '';
  }

  _setPin({
    locationId: String(floorId),
    x: Number(pin.x),
    y: Number(pin.y)
  });

  _updateLocationFromStructured();
  updatePinIndicator();
  _scheduleSave();
  return true;
}

export function clearPin() {
  _clearPinState();
  updatePinIndicator();
  _scheduleSave();
  document.dispatchEvent(new CustomEvent('quality:planPin:changed', { detail: { planPin: null } }));
}

function _removeOverlay() {
  const existing = document.getElementById('quality-plan-pin-overlay');
  if (existing) {
    try {
      const onWheel = existing._qpinOnWheel;
      if (onWheel) existing.removeEventListener('wheel', onWheel, true);
    } catch (_e0) { /* ignore */ }
    try {
      const pz = existing._qpinPanzoom;
      if (pz && typeof pz.destroy === 'function') pz.destroy();
    } catch (_e) { /* ignore */ }
    existing._qpinPanzoom = null;
    existing._qpinOnWheel = null;
    existing.remove();
  }
}

const _PIN_PALETTE = [
  '#4f46e5', '#059669', '#d97706', '#dc2626',
  '#0891b2', '#7c3aed', '#db2777', '#65a30d'
];

function _hashKey(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function _colorForTemplate(templateKey) {
  return _PIN_PALETTE[_hashKey(templateKey) % _PIN_PALETTE.length];
}

function _templateLabel(templateKey) {
  const key = String(templateKey || '');
  try {
    const sys = typeof window.SYSTEM_TEMPLATES !== 'undefined' ? window.SYSTEM_TEMPLATES : null;
    if (sys && sys[key] && sys[key].title) return String(sys[key].title);
  } catch (_e) { /* ignore */ }
  try {
    const ut = window.userTemplates;
    if (ut && ut[key] && ut[key].title) return String(ut[key].title);
  } catch (_e2) { /* ignore */ }
  return key || _t('quality.audit.plan.work_type_fallback', 'Вид работ');
}

function _getAllInspections() {
  try {
    if (window.RBI && window.RBI.services && window.RBI.services.inspections
      && typeof window.RBI.services.inspections.getAllSync === 'function') {
      return window.RBI.services.inspections.getAllSync() || [];
    }
  } catch (_e) { /* fall through */ }
  return Array.isArray(window.contractorArray) ? window.contractorArray : [];
}

/** Stable numbered history pins for floor — shared helper (нумерация A). */
function _collectFloorPins(floorId) {
  return collectFloorPinMarkers(_getAllInspections(), floorId, _templateLabel);
}

function _showPicker(onPickFloor) {
  _bindPlanPinI18n();
  const loc = _locations();
  if (!loc) {
    _toast(_t('quality.audit.plan.locations_unavailable', '⚠️ Справочник локаций недоступен'));
    return;
  }
  _removeOverlay();

  let step = 'object';
  let objectId = null;
  let buildingId = null;
  let sectionId = null;

  // Entry A: if form project is linked → start at building under that object
  const projEl = document.getElementById('inp-project');
  const projRaw = (projEl && projEl.value) || '';
  if (projRaw && typeof loc.resolveObjectLink === 'function') {
    const link = loc.resolveObjectLink({ displayName: projRaw });
    if (link && link.linked && link.locationObject) {
      objectId = link.locationObject.id;
      step = 'building';
    }
  }

  const overlay = document.createElement('div');
  overlay.id = 'quality-plan-pin-overlay';
  overlay.className = 'fixed inset-0 z-[12000] bg-black/50 flex items-end sm:items-center justify-center p-3';
  overlay.setAttribute('data-qpin-mode', 'picker');
  overlay.setAttribute('data-qpin-step', step);
  overlay.innerHTML = `
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col border border-surface">
      <div class="flex items-center justify-between px-4 py-3 border-b border-surface">
        <div>
          <div class="text-rbi-label font-black uppercase tracking-widest text-muted" data-qpin-step-label>${_escape(_stepLabelText(step))}</div>
          <div class="text-sm font-bold text-ink" data-qpin-pick-title>${_escape(_t('quality.audit.plan.pick_floor_title', 'Выбор этажа для плана'))}</div>
        </div>
        <button type="button" data-qpin-cancel class="text-muted hover:text-ink text-xl leading-none px-2">×</button>
      </div>
      <div class="overflow-y-auto p-2 flex-1" data-qpin-list></div>
    </div>`;
  document.body.appendChild(overlay);

  const listEl = overlay.querySelector('[data-qpin-list]');
  const stepLabel = overlay.querySelector('[data-qpin-step-label]');

  const setStep = function (next) {
    step = next;
    overlay.setAttribute('data-qpin-step', step);
    if (stepLabel) stepLabel.textContent = _stepLabelText(step);
  };

  const close = function () { _removeOverlay(); };
  overlay.querySelector('[data-qpin-cancel]').addEventListener('click', close);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });

  const showFloorsForSection = function (sid) {
    sectionId = sid;
    setStep('floor');
    renderList(_floorsUnderSection(loc, sectionId), 'floors');
  };

  /** After корпус: always offer секции when they exist; else flat floors. */
  const afterBuilding = function (bid) {
    buildingId = bid;
    const sections = _sectionsUnderBuilding(loc, buildingId);
    if (sections.length === 0) {
      setStep('floor');
      renderList(_floorsUnderBuilding(loc, buildingId), 'floors');
      return;
    }
    setStep('section');
    renderList(sections, 'sections');
  };

  const emptyPair = function (emptyKey) {
    if (emptyKey === 'floors') return [_t('quality.audit.plan.empty_floors', 'Нет этажей'), 'floors'];
    if (emptyKey === 'sections') return [_t('quality.audit.plan.empty_sections', 'Нет секций'), 'sections'];
    if (emptyKey === 'buildings') return [_t('quality.audit.plan.empty_buildings', 'Нет корпусов'), 'buildings'];
    return [_t('quality.audit.plan.empty_objects', 'Нет объектов в справочнике'), 'objects'];
  };

  const renderList = function (items, emptyKey) {
    if (!items.length) {
      const pair = emptyPair(emptyKey);
      listEl.innerHTML = `<div class="p-4 text-center text-rbi-label text-muted font-bold uppercase" data-qpin-empty-key="${pair[1]}">${_escape(pair[0])}</div>`;
      return;
    }
    listEl.innerHTML = items.map(function (it) {
      return `<button type="button" data-qpin-id="${_escape(it.id)}"
        class="w-full text-left px-3 py-2.5 rounded-xl mb-1 hover:bg-brand-soft
               text-rbi-body font-bold text-ink border border-transparent hover:border-brand-soft">
        ${_escape(it.displayName || it.id)}
      </button>`;
    }).join('');
    listEl.querySelectorAll('[data-qpin-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.getAttribute('data-qpin-id');
        if (step === 'object') {
          objectId = id;
          setStep('building');
          renderList(
            (loc.getChildren(objectId) || []).filter(function (n) { return !n.nodeType || n.nodeType === 'building'; }),
            'buildings'
          );
        } else if (step === 'building') {
          afterBuilding(id);
        } else if (step === 'section') {
          showFloorsForSection(id);
        } else if (step === 'floor') {
          close();
          onPickFloor(id);
        }
      });
    });
  };

  if (step === 'building' && objectId) {
    setStep('building');
    renderList(
      (loc.getChildren(objectId) || []).filter(function (n) { return !n.nodeType || n.nodeType === 'building'; }),
      'buildings'
    );
  } else {
    renderList(loc.listNodes({ nodeType: 'object', parentId: null }) || [], 'objects');
  }
}

async function _openPlanViewer(floorId, viewerOpts) {
  viewerOpts = viewerOpts || {};
  const readOnly = !!viewerOpts.readOnly;
  const filterItems = Array.isArray(viewerOpts.items) ? viewerOpts.items : null;
  const mountEl = viewerOpts.mountEl || null;
  _bindPlanPinI18n();

  const loc = _locations();
  if (!loc) {
    _toast(_t('quality.audit.plan.locations_unavailable', '⚠️ Справочник локаций недоступен'));
    return;
  }
  const plan = loc.getPlanForFloor(floorId);
  if (!plan || !plan.pdf_url) {
    _toast(_t('quality.audit.plan.no_pdf_settings', '⚠️ У этажа нет PDF-плана. Загрузите план в Настройках.'));
    return;
  }
  const pdfjs = await _pdfjs();
  if (!pdfjs || typeof pdfjs.getDocument !== 'function') {
    _toast(_t('quality.audit.plan.pdfjs_missing', '⚠️ PDF-библиотека недоступна'));
    return;
  }

  _removeOverlay();
  const existingPin = readOnly ? null : _getPin();
  let tempX = existingPin && String(existingPin.locationId) === String(floorId) ? Number(existingPin.x) : null;
  let tempY = existingPin && String(existingPin.locationId) === String(floorId) ? Number(existingPin.y) : null;

  // Numbers from full floor set; visible set may be filter intersection (History).
  const allFloorPins = _collectFloorPins(floorId);
  let historyPins = allFloorPins;
  if (filterItems) {
    const idSet = new Set(filterItems.map(function (it) { return String(it.id); }));
    historyPins = allFloorPins.filter(function (p) { return idSet.has(String(p.id)); });
  }
  // Enrich contractor for RO chips (markers from shared helper lack contractorName).
  const contractorLookup = new Map();
  (filterItems || _getAllInspections()).forEach(function (it) {
    if (it && it.id != null) {
      contractorLookup.set(String(it.id), it.contractorName || 'Не указан');
    }
  });
  historyPins = historyPins.map(function (p) {
    return Object.assign({}, p, {
      contractorName: contractorLookup.get(String(p.id)) || 'Не указан'
    });
  });
  const allKeys = [];
  const seenKeys = new Set();
  historyPins.forEach(function (p) {
    if (!seenKeys.has(p.templateKey)) {
      seenKeys.add(p.templateKey);
      allKeys.push(p.templateKey);
    }
  });
  const visibleKeys = new Set(allKeys);
  const allContractors = [];
  const seenContractors = new Set();
  if (readOnly) {
    historyPins.forEach(function (p) {
      const c = p.contractorName || 'Не указан';
      if (!seenContractors.has(c)) {
        seenContractors.add(c);
        allContractors.push(c);
      }
    });
  }
  const visibleContractors = new Set(allContractors);
  let panzoom = null;
  let lastPointer = null;
  let pointerDown = null;
  const PZ_MIN = 0.4;
  const PZ_MAX = 8;
  const pp = window.RbiPlanPanzoom;
  const PZ_PINCH_STEP = (pp && pp.PINCH_STEP) || 0.5;
  const PZ_BTN_STEP = (pp && pp.BTN_STEP) || 0.28;

  const filterAllLabel = _t('quality.audit.plan.filter_all', 'Все');
  const chipsHtml = allKeys.length
    ? `<div class="flex flex-wrap gap-1.5 px-3 py-1.5 bg-slate-950/80 border-b border-slate-800 shrink-0" data-qpin-chips>
        ${readOnly ? '<span class="text-rbi-caption font-black uppercase tracking-wider text-slate-400 self-center mr-0.5" data-qpin-filter-type>' + _escape(_t('quality.audit.plan.filter_type', 'Вид')) + '</span>' : ''}
        <button type="button" data-qpin-chip="__all__"
          class="panzoom-exclude px-2 py-0.5 rounded-full text-rbi-caption font-black uppercase tracking-wider
                 bg-brand text-white border border-brand">${_escape(filterAllLabel)}</button>
        ${allKeys.map(function (k) {
          const col = _colorForTemplate(k);
          return `<button type="button" data-qpin-chip="${_escape(k)}"
            class="panzoom-exclude px-2 py-0.5 rounded-full text-rbi-caption font-black uppercase tracking-wider
                   text-white border border-white/30"
            style="background:${col}" title="${_escape(_templateLabel(k))}">${_escape(_templateLabel(k))}</button>`;
        }).join('')}
      </div>`
    : '';

  const contractorChipsHtml = (readOnly && allContractors.length)
    ? `<div class="flex flex-wrap gap-1.5 px-3 py-1.5 bg-slate-950/80 border-b border-slate-800 shrink-0" data-qpin-chips-contractor>
        <span class="text-rbi-caption font-black uppercase tracking-wider text-slate-400 self-center mr-0.5" data-qpin-filter-contractor>${_escape(_t('quality.audit.plan.filter_contractor', 'Подр.'))}</span>
        <button type="button" data-qpin-cchip="__all__"
          class="panzoom-exclude px-2 py-0.5 rounded-full text-rbi-caption font-black uppercase tracking-wider
                 bg-brand text-white border border-brand">${_escape(filterAllLabel)}</button>
        ${allContractors.map(function (c) {
          return `<button type="button" data-qpin-cchip="${_escape(c)}"
            class="panzoom-exclude px-2 py-0.5 rounded-full text-rbi-caption font-black uppercase tracking-wider
                   text-white border border-white/30 bg-slate-600"
            title="${_escape(c)}">${_escape(c)}</button>`;
        }).join('')}
      </div>`
    : '';

  const titleText = readOnly
    ? _t('quality.audit.plan.title_history', 'План этажа (история)')
    : _t('quality.audit.plan.title_edit', 'Точка на плане этажа');
  const hasTempPin = tempX != null && tempY != null;
  const footerText = _planFooterHint(readOnly, !!mountEl, hasTempPin);
  const confirmHtml = readOnly
    ? ''
    : `<button type="button" data-qpin-confirm
          class="panzoom-exclude px-3 py-1.5 rounded-lg bg-brand text-rbi-caption font-black uppercase tracking-wider disabled:opacity-40"
          ${tempX == null ? 'disabled' : ''}>${_escape(_t('quality.audit.plan.confirm', 'Подтвердить'))}</button>`;

  const fsLabel = _t('quality.audit.plan.fullscreen', 'На весь экран');
  const trailingActionHtml = mountEl
    ? `<button type="button" data-qpin-fullscreen
          class="panzoom-exclude w-8 h-8 rounded-lg bg-slate-700 text-white inline-flex items-center justify-center hover:bg-slate-600"
          title="${_escape(fsLabel)}" aria-label="${_escape(fsLabel)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
          <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
        </svg>
      </button>`
    : `<button type="button" data-qpin-cancel
          class="panzoom-exclude px-3 py-1.5 rounded-lg bg-slate-700 text-rbi-caption font-black uppercase tracking-wider">${_escape(readOnly ? _t('quality.audit.plan.close', 'Закрыть') : _t('quality.audit.plan.cancel', 'Отмена'))}</button>`;

  const overlay = document.createElement('div');
  overlay.id = 'quality-plan-pin-overlay';
  if (mountEl) {
    overlay.className = 'relative w-full h-full min-h-[320px] bg-slate-900 flex flex-col rounded-xl border border-slate-700';
    overlay.setAttribute('data-qpin-inline', '1');
  } else {
    overlay.className = 'fixed inset-0 z-[12000] bg-slate-900 flex flex-col';
  }
  overlay.setAttribute('data-qpin-mode', 'viewer');
  overlay.setAttribute('data-qpin-floor', String(floorId));
  if (readOnly) overlay.setAttribute('data-qpin-readonly', '1');
  if (hasTempPin) overlay.setAttribute('data-qpin-has-temp', '1');
  overlay.innerHTML = `
    <div data-qpin-chrome class="shrink-0">
      <div data-qpin-toolbar class="flex items-center justify-between px-3 py-2 text-white gap-2">
        <div class="text-rbi-label font-black uppercase tracking-widest min-w-0 truncate" data-qpin-title>${_escape(titleText)}</div>
        <div class="flex gap-1.5 items-center shrink-0">
          ${mountEl ? '' : `<button type="button" data-qpin-other-floor
            class="panzoom-exclude px-2 py-1.5 rounded-lg bg-slate-700 text-rbi-caption font-black uppercase tracking-wider whitespace-nowrap">${_escape(_t('quality.audit.plan.other_floor', 'Другой этаж'))}</button>`}
          <button type="button" data-qpin-zoom-out
            class="panzoom-exclude w-8 h-8 rounded-lg bg-slate-700 text-sm font-black">−</button>
          <button type="button" data-qpin-zoom-in
            class="panzoom-exclude w-8 h-8 rounded-lg bg-slate-700 text-sm font-black">+</button>
          ${confirmHtml}
          ${trailingActionHtml}
        </div>
      </div>
      ${chipsHtml}
      ${contractorChipsHtml}
    </div>
    <div class="relative flex-1 min-h-0" data-qpin-host>
      <div class="absolute inset-0 overflow-hidden bg-slate-800 touch-none" data-qpin-wrap>
        <div class="absolute top-0 left-0 shadow-lg bg-white" data-qpin-stage style="touch-action:none">
          <canvas data-qpin-canvas class="block max-w-none"></canvas>
          <div data-qpin-pins class="absolute inset-0"></div>
        </div>
      </div>
      <div data-qpin-loader class="absolute inset-0 flex items-center justify-center bg-slate-900/70 text-rbi-label font-bold uppercase tracking-widest text-slate-300">
        ${_escape(_t('quality.audit.plan.loading', 'Загрузка плана…'))}
      </div>
    </div>
    <div data-qpin-footer class="px-3 py-2 text-rbi-caption text-slate-300 shrink-0">${_escape(footerText)}</div>`;
  if (mountEl) {
    mountEl.innerHTML = '';
    mountEl.appendChild(overlay);
  } else {
    document.body.appendChild(overlay);
  }

  const host = overlay.querySelector('[data-qpin-host]');
  const wrap = overlay.querySelector('[data-qpin-wrap]');
  const stage = overlay.querySelector('[data-qpin-stage]');
  const canvas = overlay.querySelector('[data-qpin-canvas]');
  const pins = overlay.querySelector('[data-qpin-pins]');
  const loader = overlay.querySelector('[data-qpin-loader]');
  const confirmBtn = overlay.querySelector('[data-qpin-confirm]');

  const close = function () {
    _removeOverlay();
    if (typeof viewerOpts.onClose === 'function') {
      try { viewerOpts.onClose(); } catch (_eClose) { /* ignore */ }
    }
  };
  const cancelBtn = overlay.querySelector('[data-qpin-cancel]');
  if (cancelBtn) cancelBtn.addEventListener('click', close);
  const fullscreenBtn = overlay.querySelector('[data-qpin-fullscreen]');
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (typeof viewerOpts.onFullscreen === 'function') {
        try { viewerOpts.onFullscreen(); } catch (_eFs) { /* ignore */ }
      }
    });
  }

  const otherFloorBtn = overlay.querySelector('[data-qpin-other-floor]');
  if (otherFloorBtn) {
    otherFloorBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      close();
      if (readOnly) {
        _showPicker(function (fid) {
          _openPlanViewer(fid, { readOnly: true, items: filterItems });
        });
      } else {
        _showPicker(function (fid) {
          _openPlanViewer(fid);
        });
      }
    });
  }

  function _currentScale() {
    return (panzoom && typeof panzoom.getScale === 'function') ? (panzoom.getScale() || 1) : 1;
  }

  let _lastPanzoomAt = 0;
  let _gestureMoved = false;
  let _gestureStart = null;

  function _renderPins(opts) {
    opts = opts || {};
    const scale = opts.scale != null ? opts.scale : _currentScale();
    if (!pins) return;
    const visible = historyPins.filter(function (p) {
      if (!visibleKeys.has(p.templateKey)) return false;
      if (readOnly && allContractors.length) {
        return visibleContractors.has(p.contractorName || 'Не указан');
      }
      return true;
    });
    const threshold = 4 / Math.max(scale, 0.01);
    const unclustered = visible.slice();
    const clusters = [];
    while (unclustered.length > 0) {
      const base = unclustered.shift();
      const current = [base];
      let i = 0;
      while (i < unclustered.length) {
        const p = unclustered[i];
        const dist = Math.hypot(base.x - p.x, base.y - p.y);
        if (dist < threshold) {
          current.push(p);
          unclustered.splice(i, 1);
        } else {
          i++;
        }
      }
      clusters.push(current);
    }

    /* Avoid class cursor-pointer: style.css .cursor-pointer:hover overrides transform.
       Hover grow: keep translate + scale in the same inline transform (beats style.css). */
    const PIN_TF = 'translate(-50%,-50%)';
    const PIN_TF_HOVER = 'translate(-50%,-50%) scale(1.15)';
    const histPointer = readOnly
      ? 'pointer-events-auto'
      : 'pointer-events-none';
    const histCursor = readOnly ? 'cursor:pointer;' : '';

    let html = clusters.map(function (cluster) {
      if (cluster.length === 1) {
        const d = cluster[0];
        const col = _colorForTemplate(d.templateKey);
        return `<div data-qpin-hist="${_escape(d.id)}"
          class="absolute w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center
                 text-white text-rbi-caption font-black z-20
                 ${histPointer} panzoom-exclude"
          style="left:${d.x}%;top:${d.y}%;background:${col};transform:${PIN_TF};transition:transform 150ms ease;${histCursor}"
          title="${_escape(d.title)} #${d.num}">${d.num}</div>`;
      }
      const total = cluster.length;
      const avgX = cluster.reduce(function (s, p) { return s + p.x; }, 0) / total;
      const avgY = cluster.reduce(function (s, p) { return s + p.y; }, 0) / total;
      const counts = {};
      cluster.forEach(function (p) {
        counts[p.templateKey] = (counts[p.templateKey] || 0) + 1;
      });
      const keys = Object.keys(counts);
      let deg = 0;
      const parts = [];
      keys.forEach(function (k) {
        const next = deg + (counts[k] / total) * 360;
        parts.push(_colorForTemplate(k) + ' ' + deg + 'deg ' + next + 'deg');
        deg = next;
      });
      const grad = 'conic-gradient(from 0deg, ' + parts.join(', ') + ')';
      return `<div data-qpin-cluster="${total}"
        class="absolute w-8 h-8 rounded-full shadow-[0_4px_10px_rgba(0,0,0,0.3)] flex items-center justify-center
               z-30 pointer-events-auto panzoom-exclude"
        style="left:${avgX}%;top:${avgY}%;background:${grad};padding:3px;transform:${PIN_TF};transition:transform 150ms ease;cursor:pointer"
        title="${_escape(_t('quality.audit.plan.checks_count', 'Проверок: {total}', { total: total }))}">
        <div class="w-full h-full bg-white text-slate-800 rounded-full flex items-center justify-center
                    text-rbi-body font-black border border-slate-200 pointer-events-none">${total}</div>
      </div>`;
    }).join('');

    if (!readOnly && tempX != null && tempY != null) {
      html += `<div class="absolute w-6 h-6 bg-danger rounded-full border-2 border-white shadow-lg
        flex items-center justify-center text-white text-rbi-caption font-black z-40
        pointer-events-none panzoom-exclude"
        style="left:${tempX}%;top:${tempY}%;transform:${PIN_TF}">+</div>`;
    }
    pins.innerHTML = html;
    function _bindHoverScale(el) {
      el.addEventListener('pointerenter', function () { el.style.transform = PIN_TF_HOVER; });
      el.addEventListener('pointerleave', function () { el.style.transform = PIN_TF; });
    }
    function _isTapNotGesture() {
      if (_gestureMoved) return false;
      if (Date.now() - _lastPanzoomAt < 320) return false;
      return true;
    }
    pins.querySelectorAll('[data-qpin-cluster]').forEach(function (el) {
      _bindHoverScale(el);
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (!_isTapNotGesture()) return;
        const n = el.getAttribute('data-qpin-cluster') || '?';
        _toast(_t('quality.audit.plan.zoom_for_checks', 'Приблизьте план, чтобы увидеть {n} проверок', { n: n }));
      });
    });
    if (readOnly) {
      pins.querySelectorAll('[data-qpin-hist]').forEach(function (el) {
        _bindHoverScale(el);
        el.addEventListener('click', function (ev) {
          ev.stopPropagation();
          if (!_isTapNotGesture()) return;
          const id = el.getAttribute('data-qpin-hist');
          if (!id) return;
          // Keep plan open under the inspection modal (do not teardown overlay).
          const ov = document.getElementById('quality-plan-pin-overlay');
          if (ov && ov.classList.contains('fixed')) {
            ov.style.zIndex = '4000';
            ov.setAttribute('data-qpin-under-modal', '1');
          }
          const showDetail = window['showHistoryDetail'];
          if (typeof showDetail === 'function') showDetail(id);
        });
      });
    }
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', function () {
      if (tempX == null || tempY == null) return;
      applyPinToForm({ x: tempX, y: tempY }, floorId);
      document.dispatchEvent(new CustomEvent('quality:planPin:changed', {
        detail: { planPin: _getPin() }
      }));
      _toast(_t('quality.audit.plan.pin_saved', '✅ Точка на плане сохранена'));
      close();
    });
  }

  const chipsRoot = overlay.querySelector('[data-qpin-chips]');
  if (chipsRoot) {
    chipsRoot.addEventListener('click', function (ev) {
      const btn = ev.target.closest('[data-qpin-chip]');
      if (!btn) return;
      const key = btn.getAttribute('data-qpin-chip');
      if (key === '__all__') {
        allKeys.forEach(function (k) { visibleKeys.add(k); });
      } else if (visibleKeys.has(key)) {
        visibleKeys.delete(key);
        if (visibleKeys.size === 0) {
          allKeys.forEach(function (k) { visibleKeys.add(k); });
        }
      } else {
        visibleKeys.add(key);
      }
      chipsRoot.querySelectorAll('[data-qpin-chip]').forEach(function (b) {
        const k = b.getAttribute('data-qpin-chip');
        if (k === '__all__') {
          const allOn = visibleKeys.size === allKeys.length;
          b.classList.toggle('opacity-40', !allOn);
          b.classList.toggle('bg-brand', allOn);
          b.classList.toggle('bg-surface', !allOn);
        } else {
          b.classList.toggle('opacity-40', !visibleKeys.has(k));
          b.style.outline = visibleKeys.has(k) ? '2px solid #fff' : 'none';
        }
      });
      _renderPins({ scale: _currentScale() });
    });
  }

  const cChipsRoot = overlay.querySelector('[data-qpin-chips-contractor]');
  if (cChipsRoot) {
    cChipsRoot.addEventListener('click', function (ev) {
      const btn = ev.target.closest('[data-qpin-cchip]');
      if (!btn) return;
      const key = btn.getAttribute('data-qpin-cchip');
      if (key === '__all__') {
        allContractors.forEach(function (c) { visibleContractors.add(c); });
      } else if (visibleContractors.has(key)) {
        visibleContractors.delete(key);
        if (visibleContractors.size === 0) {
          allContractors.forEach(function (c) { visibleContractors.add(c); });
        }
      } else {
        visibleContractors.add(key);
      }
      cChipsRoot.querySelectorAll('[data-qpin-cchip]').forEach(function (b) {
        const k = b.getAttribute('data-qpin-cchip');
        if (k === '__all__') {
          const allOn = visibleContractors.size === allContractors.length;
          b.classList.toggle('opacity-40', !allOn);
          b.classList.toggle('bg-brand', allOn);
          b.classList.toggle('bg-surface', !allOn);
        } else {
          b.classList.toggle('opacity-40', !visibleContractors.has(k));
          b.style.outline = visibleContractors.has(k) ? '2px solid #fff' : 'none';
        }
      });
      _renderPins({ scale: _currentScale() });
    });
  }

  function _zoomBy(dir) {
    if (!panzoom) return;
    const cur = panzoom.getScale() || 1;
    const next = dir > 0
      ? Math.min(PZ_MAX, cur * Math.exp(PZ_BTN_STEP))
      : Math.max(PZ_MIN, cur * Math.exp(-PZ_BTN_STEP));
    const wr = wrap.getBoundingClientRect();
    const focal = lastPointer || { clientX: wr.left + wr.width / 2, clientY: wr.top + wr.height / 2 };
    if (typeof panzoom.zoomToPoint === 'function') {
      panzoom.zoomToPoint(next, focal);
    } else if (typeof panzoom.zoom === 'function') {
      panzoom.zoom(next, { animate: true });
    }
    _renderPins({ scale: panzoom.getScale() });
  }

  overlay.querySelector('[data-qpin-zoom-in]').addEventListener('click', function (e) {
    e.stopPropagation();
    _lastPanzoomAt = Date.now();
    _gestureMoved = true;
    _zoomBy(1);
  });
  overlay.querySelector('[data-qpin-zoom-out]').addEventListener('click', function (e) {
    e.stopPropagation();
    _lastPanzoomAt = Date.now();
    _gestureMoved = true;
    _zoomBy(-1);
  });

  wrap.classList.add(readOnly ? 'cursor-grab' : 'cursor-crosshair');
  wrap.addEventListener('pointerdown', function (ev) {
    pointerDown = { x: ev.clientX, y: ev.clientY };
    _gestureStart = { x: ev.clientX, y: ev.clientY };
    _gestureMoved = false;
  });
  wrap.addEventListener('pointermove', function (ev) {
    lastPointer = { clientX: ev.clientX, clientY: ev.clientY };
    if (_gestureStart) {
      const dist = Math.hypot(ev.clientX - _gestureStart.x, ev.clientY - _gestureStart.y);
      if (dist > 6) _gestureMoved = true;
    }
  });
  wrap.addEventListener('pointerup', function () {
    _gestureStart = null;
  });
  wrap.addEventListener('pointercancel', function () {
    _gestureStart = null;
  });
  wrap.addEventListener('click', function (ev) {
    if (ev.target.closest('[data-qpin-cluster], [data-qpin-hist], [data-qpin-zoom-in], [data-qpin-zoom-out], [data-qpin-chip], [data-qpin-cchip], [data-qpin-other-floor], [data-qpin-fullscreen], [data-qpin-cancel]')) return;
    if (readOnly) return;
    if (pointerDown) {
      const moved = Math.hypot(ev.clientX - pointerDown.x, ev.clientY - pointerDown.y);
      pointerDown = null;
      if (moved > 5) return;
    }
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const xPercent = ((ev.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((ev.clientY - rect.top) / rect.height) * 100;
    if (xPercent < 0 || xPercent > 100 || yPercent < 0 || yPercent > 100) return;
    tempX = Math.round(xPercent * 100) / 100;
    tempY = Math.round(yPercent * 100) / 100;
    if (confirmBtn) confirmBtn.disabled = false;
    overlay.setAttribute('data-qpin-has-temp', '1');
    const footerEl = overlay.querySelector('[data-qpin-footer]');
    if (footerEl) footerEl.textContent = _planFooterHint(readOnly, !!mountEl, true);
    _renderPins({ scale: _currentScale() });
  });

  /** True while this overlay is still the active viewer (guards async PDF race). */
  function _viewerAlive() {
    return !!(overlay && overlay.isConnected
      && document.getElementById('quality-plan-pin-overlay') === overlay);
  }

  try {
    let buf = null;
    const pdfUrl = plan.pdf_url;
    const loadCloudPdf = window['rbiLoadCloudPdfArrayBuffer'];
    if (typeof loadCloudPdf === 'function') {
      buf = await loadCloudPdf(pdfUrl);
    } else {
      const pm = window['PhotoManager'];
      if (pm && typeof pm.getAsyncUrl === 'function') {
        try {
          const cached = await pm.getAsyncUrl(pdfUrl);
          if (cached && String(cached).startsWith('blob:')) {
            const res = await fetch(cached);
            buf = await res.arrayBuffer();
          }
        } catch (_e) { /* fall through */ }
      }
      if (!buf) {
        if (navigator.onLine === false) throw new Error('PDF не кэширован офлайн');
        const res = await fetch(pdfUrl);
        if (!res.ok) throw new Error('Не удалось скачать PDF');
        buf = await res.arrayBuffer();
      }
    }
    if (!_viewerAlive()) return;

    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    if (!_viewerAlive()) return;
    const page = await pdf.getPage(1);
    if (!_viewerAlive()) return;
    const hostW = Math.max(
      (mountEl && mountEl.clientWidth) || (host && host.clientWidth) || 640,
      320
    );
    const hostH = Math.max(
      (mountEl && Math.max(mountEl.clientHeight - 72, 200))
        || (host && host.clientHeight)
        || 400,
      240
    );
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.2, Math.max(0.8, Math.min((hostW - 24) / base.width, (hostH - 24) / base.height)));
    const viewport = page.getViewport({ scale: scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    stage.style.width = viewport.width + 'px';
    stage.style.height = viewport.height + 'px';
    stage.style.left = '0';
    stage.style.top = '0';
    stage.style.marginLeft = '0';
    stage.style.marginTop = '0';
    stage.style.removeProperty('transform-origin');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d недоступен');
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    if (!_viewerAlive()) return;
    if (loader) loader.remove();

    const factory = window.Panzoom;
    if (typeof factory === 'function') {
      const pzOpts = pp && typeof pp.baseOptions === 'function'
        ? pp.baseOptions({
            maxScale: PZ_MAX,
            minScale: PZ_MIN,
            startScale: 1,
            startX: 0,
            startY: 0
          })
        : {
            maxScale: PZ_MAX,
            minScale: PZ_MIN,
            step: PZ_PINCH_STEP,
            startScale: 1,
            startX: 0,
            startY: 0,
            pinchAndPan: true,
            touchAction: 'none',
            cursor: 'grab',
            excludeClass: 'panzoom-exclude'
          };
      panzoom = factory(stage, pzOpts);
      overlay._qpinPanzoom = panzoom;
      const fitCenter = function () {
        if (!_viewerAlive()) return;
        if (pp && panzoom) pp.center(panzoom, wrap, stage);
      };
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          fitCenter();
          if (mountEl) {
            setTimeout(fitCenter, 40);
            setTimeout(fitCenter, 160);
          }
        });
      });
      const onWheel = function (e) {
        if (!panzoom || !_viewerAlive()) return;
        // Trackpad pinch / Ctrl|⌘+wheel → zoom. Plain wheel → page/stage scroll.
        if (!(e.ctrlKey || e.metaKey)) return;
        _lastPanzoomAt = Date.now();
        _gestureMoved = true;
        if (pp) pp.wheelZoom(panzoom, e, PZ_MIN, PZ_MAX);
        else {
          e.preventDefault();
          e.stopPropagation();
          panzoom.zoomWithWheel(e, { step: 0.2 });
        }
        _renderPins({ scale: panzoom.getScale() });
      };
      // Capture only to catch pinch (ctrl+wheel) before the browser zooms the page.
      overlay.addEventListener('wheel', onWheel, { passive: false, capture: true });
      overlay._qpinOnWheel = onWheel;
      let pinZoomTimer = null;
      stage.addEventListener('panzoomchange', function () {
        _lastPanzoomAt = Date.now();
        _gestureMoved = true;
        clearTimeout(pinZoomTimer);
        pinZoomTimer = setTimeout(function () {
          if (!_viewerAlive()) return;
          try { _renderPins({ scale: _currentScale() }); } catch (_ePins) { /* ignore */ }
        }, 80);
      });
    }

    _renderPins({ scale: _currentScale() });
  } catch (e) {
    // Stale load after floor switch / fullscreen — do not toast or tear down the new viewer.
    if (!_viewerAlive()) return;
    console.error('[quality-plan-pin] load failed', e);
    _toast(_t('quality.audit.plan.open_failed', '⚠️ Не удалось открыть план этажа'));
    close();
  }
}

/** Entry: open plan if floor known + PDF, else path picker. */
export async function openPlanPinFlow(opts) {
  opts = opts || {};
  const forcedFloorId = opts.floorId || null;

  if (forcedFloorId) {
    await _openPlanViewer(forcedFloorId);
    return;
  }

  const resolved = resolveFloorFromForm();
  if (resolved && resolved.floor) {
    const loc = _locations();
    const plan = loc && loc.getPlanForFloor(resolved.floor.id);
    if (plan && plan.pdf_url) {
      await _openPlanViewer(resolved.floor.id);
      return;
    }
    if (resolved.floor) {
      _toast(_t('quality.audit.plan.no_pdf_other', '⚠️ У выбранного этажа нет PDF — выберите другой'));
    }
  }

  _showPicker(function (floorId) {
    _openPlanViewer(floorId);
  });
}

/** Read-only history plan viewer (markers/clusters/zoom, no place-pin).
 *  opts.mountEl — optional host for inline desktop preview (not fullscreen).
 *  opts.onClose — called after overlay is removed (e.g. restore inline preview).
 *  opts.onFullscreen — inline only: expand icon instead of collapse. */
export async function openHistoryPlanViewer(opts) {
  opts = opts || {};
  const floorId = opts.floorId;
  if (!floorId) {
    _toast(_t('quality.audit.plan.floor_not_selected', '⚠️ Этаж не выбран'));
    return;
  }
  await _openPlanViewer(floorId, {
    readOnly: true,
    items: Array.isArray(opts.items) ? opts.items : null,
    mountEl: opts.mountEl || null,
    onClose: typeof opts.onClose === 'function' ? opts.onClose : null,
    onFullscreen: typeof opts.onFullscreen === 'function' ? opts.onFullscreen : null
  });
}

export function repositionPlanPin() {
  const pin = _getPin();
  if (pin && pin.locationId) {
    return openPlanPinFlow({ floorId: pin.locationId });
  }
  return openPlanPinFlow();
}

/** Bind buttons in audit header; idempotent. */
export function mountControls() {
  _bindPlanPinI18n();
  if (_mounted) {
    updatePinIndicator();
    return;
  }
  _mounted = true;

  const btn = document.getElementById('btn-quality-plan-pin');
  if (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openPlanPinFlow();
    });
  }
  const ind = document.getElementById('quality-plan-pin-indicator');
  if (ind) {
    const repo = ind.querySelector('[data-qpin-reposition]');
    const clr = ind.querySelector('[data-qpin-clear]');
    if (repo) {
      repo.addEventListener('click', function (e) {
        e.preventDefault();
        repositionPlanPin();
      });
    }
    if (clr) {
      clr.addEventListener('click', function (e) {
        e.preventDefault();
        clearPin();
        _toast(_t('quality.audit.plan.pin_cleared', 'Точка на плане снята'));
      });
    }
  }

  // Contractor change → reset pin context keep project (spec follow-up).
  const contr = document.getElementById('inp-contractor');
  if (contr && !contr._qpinContractorHook) {
    contr._qpinContractorHook = true;
    let prevContr = contr.value;
    const onMaybeChange = function () {
      const next = contr.value;
      if (next === prevContr) return;
      prevContr = next;
      if (window.AuditActions && typeof window.AuditActions.resetPinContextKeepProject === 'function') {
        window.AuditActions.resetPinContextKeepProject({ clearContractor: false });
      }
    };
    contr.addEventListener('change', onMaybeChange);
    contr.addEventListener('blur', onMaybeChange);
  }

  seedLocationSuggestions();
  updatePinIndicator();

  document.addEventListener('locations:changed', function () {
    seedLocationSuggestions();
  });
}
