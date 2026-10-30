const ACCEPTANCE_STATUSES_V2 = ["pending", "rejected", "accepted"];
const CHECKLIST_ITEM_STATUSES = ["ok", "fail", "na", "fail_escalated"];
function _normalizeItemPhotos(raw) {
  if (raw == null) return void 0;
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? [raw] : [];
  const photos = arr.map((p) => String(p || "").trim()).filter(Boolean);
  return photos.length ? photos : void 0;
}
function _normalizeItemComment(raw) {
  if (raw == null) return void 0;
  const s = String(raw).trim();
  return s || void 0;
}
function _normalizeStatus(value, fallback = "pending") {
  const s = String(value || "").trim().toLowerCase();
  if (ACCEPTANCE_STATUSES_V2.includes(s)) return s;
  return fallback;
}
function _clampPct(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
function _normalizeZone(raw) {
  if (!raw || typeof raw !== "object") return null;
  const z = raw;
  const x = _clampPct(Number(z.x));
  const y = _clampPct(Number(z.y));
  const w = Math.max(0.1, _clampPct(Number(z.w)));
  const h = Math.max(0.1, _clampPct(Number(z.h)));
  if (!Number.isFinite(Number(z.x)) || !Number.isFinite(Number(z.y))) return null;
  const room = z.room != null ? String(z.room).trim() || null : null;
  return { x, y, w, h, room };
}
function _normalizeDate(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
function _normalizeItemStatus(value) {
  const s = String(value || "").trim().toLowerCase();
  if (CHECKLIST_ITEM_STATUSES.includes(s)) return s;
  return null;
}
function normalizeChecklistResults(raw) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw;
  const template_key = String(r.template_key || "").trim();
  if (!template_key) return null;
  const itemsRaw = Array.isArray(r.items) ? r.items : [];
  const items = [];
  for (const it of itemsRaw) {
    if (!it || typeof it !== "object") continue;
    const row = it;
    const id = String(row.id ?? "").trim();
    const name = String(row.name || "").trim();
    const status = _normalizeItemStatus(row.status);
    if (!id || !name || !status) continue;
    const comment = _normalizeItemComment(row.comment);
    const photos = _normalizeItemPhotos(row.photos);
    const next = {
      id,
      group: row.group != null ? String(row.group).trim() || null : null,
      name,
      status,
      updated_at: row.updated_at != null ? String(row.updated_at) : void 0
    };
    if (comment) next.comment = comment;
    if (photos) next.photos = photos;
    items.push(next);
  }
  return {
    template_key,
    updated_at: String(r.updated_at || (/* @__PURE__ */ new Date()).toISOString()),
    items
  };
}
function normalizeConstructionAcceptanceV2(raw) {
  const d = raw || {};
  return {
    ...d,
    locationId: String(d.locationId || d.location_id || ""),
    contractorId: d.contractorId || d.contractor_id || null,
    zone: _normalizeZone(d.zone),
    checklist_results: normalizeChecklistResults(d.checklist_results),
    status: _normalizeStatus(d.status),
    requested_date: _normalizeDate(d.requested_date) ?? d.requested_date ?? null,
    is_deleted: d.is_deleted === true || d._deleted === true,
    _deleted: d.is_deleted === true || d._deleted === true
  };
}
let _items = [];
let _ready = false;
function _storage() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.storage) || null;
}
function _stores() {
  var _a;
  const s = _storage();
  const fromSvc = (_a = s == null ? void 0 : s.stores) == null ? void 0 : _a.call(s);
  if (fromSvc && fromSvc.CONST_ACCEPTANCE_V2) return fromSvc;
  return window.STORES || {};
}
function _events() {
  var _a;
  return (_a = window.RBI) == null ? void 0 : _a.events;
}
function _now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function _uuid() {
  return globalThis.RbiIds.newId();
}
function _active() {
  return _items.filter((d) => d && !d.is_deleted && !d._deleted);
}
function _emit(extra) {
  var _a, _b;
  (_b = (_a = _events()) == null ? void 0 : _a.emit) == null ? void 0 : _b.call(_a, "construction-acceptance:changed", extra || {});
}
function _markDirty() {
  var _a, _b;
  const sync = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.sync;
  if (sync == null ? void 0 : sync.markDirty) {
    sync.markDirty(["constructionAcceptance"]);
  }
  if (typeof window.triggerSync === "function") {
    window.triggerSync("silent");
  }
}
async function _persist(item) {
  const storage = _storage();
  const stores = _stores();
  if (!storage || !stores.CONST_ACCEPTANCE_V2) {
    throw new Error("storage CONST_ACCEPTANCE_V2 недоступен");
  }
  await storage.put(stores.CONST_ACCEPTANCE_V2, item);
  const idx = _items.findIndex((d) => d.id === item.id);
  if (idx >= 0) _items[idx] = item;
  else _items.push(item);
}
const ConstructionAcceptanceService = {
  async init() {
    const storage = _storage();
    const stores = _stores();
    if (!storage || !stores.CONST_ACCEPTANCE_V2) {
      console.warn("[constructionAcceptance] storage not ready");
      return false;
    }
    try {
      const rows = await storage.getAll(stores.CONST_ACCEPTANCE_V2);
      _items = (Array.isArray(rows) ? rows : []).map((r) => normalizeConstructionAcceptanceV2(r));
      _ready = true;
      return true;
    } catch (e) {
      console.warn("[constructionAcceptance] init failed", e);
      return false;
    }
  },
  isReady() {
    return _ready;
  },
  /** Подмена in-memory после pull sync. */
  replaceCache(items) {
    _items = (Array.isArray(items) ? items : []).map((r) => normalizeConstructionAcceptanceV2(r));
    _ready = true;
    _emit({ reason: "replaceCache" });
  },
  list(opts) {
    let list = (opts == null ? void 0 : opts.includeDeleted) ? _items.slice() : _active();
    if (opts == null ? void 0 : opts.locationId) {
      list = list.filter((d) => d.locationId === opts.locationId);
    }
    if (opts == null ? void 0 : opts.status) {
      const st = _normalizeStatus(opts.status);
      list = list.filter((d) => _normalizeStatus(d.status) === st);
    }
    return list.slice().sort(
      (a, b) => String(a.requested_date || a.created_at || "").localeCompare(String(b.requested_date || b.created_at || ""))
    );
  },
  get(id) {
    return _active().find((d) => d.id === id) || null;
  },
  /** Активные заявки этажа (locationId = floor). */
  listForFloor(locationId) {
    return this.list({ locationId });
  },
  /** Активные заявки локации (floor или apartment). Alias к list({locationId}). */
  listForLocation(locationId) {
    return this.list({ locationId });
  },
  /**
   * Создание заявки. locationId = floor | apartment (тип узла не валидируется).
   * Для квартиры UI передаёт zone full-rect {x:0,y:0,w:100,h:100}.
   */
  async create(input) {
    var _a;
    const locationId = String(input.locationId || "").trim();
    if (!locationId) throw new Error("locationId обязателен");
    const zone = _normalizeZone(input.zone);
    if (!zone) throw new Error("zone обязательна");
    const status = _normalizeStatus(input.status, "pending");
    const item = {
      id: _uuid(),
      companyId: "rbi",
      locationId,
      zone,
      template_key: input.template_key != null ? String(input.template_key) || null : null,
      work_type: input.work_type != null ? String(input.work_type).trim() || null : null,
      volume: input.volume != null ? String(input.volume).trim() || null : null,
      requested_date: _normalizeDate(input.requested_date),
      requested_time: input.requested_time != null ? String(input.requested_time).trim() || null : null,
      contractorId: input.contractorId || null,
      checklist_results: normalizeChecklistResults(input.checklist_results),
      status,
      created_by: ((_a = window.syncConfig) == null ? void 0 : _a.engineerName) || "",
      is_deleted: false,
      deleted_at: null,
      created_at: _now(),
      updated_at: _now(),
      version: 1,
      syncStatus: "not_synced",
      source: "local"
    };
    await _persist(item);
    _markDirty();
    _emit({ reason: "create", id: item.id, locationId });
    return item;
  },
  async update(id, patch) {
    const cur = _items.find((d) => d.id === id);
    if (!cur || cur.is_deleted || cur._deleted) throw new Error("Заявка не найдена");
    let status = cur.status;
    if (patch.status != null) {
      status = _normalizeStatus(patch.status, _normalizeStatus(cur.status));
    }
    const next = {
      ...cur,
      locationId: patch.locationId != null ? String(patch.locationId).trim() || cur.locationId : cur.locationId,
      zone: patch.zone !== void 0 ? _normalizeZone(patch.zone) : cur.zone,
      template_key: patch.template_key !== void 0 ? patch.template_key : cur.template_key,
      work_type: patch.work_type !== void 0 ? patch.work_type : cur.work_type,
      volume: patch.volume !== void 0 ? patch.volume : cur.volume,
      requested_date: patch.requested_date !== void 0 ? _normalizeDate(patch.requested_date) : cur.requested_date ?? null,
      requested_time: patch.requested_time !== void 0 ? patch.requested_time : cur.requested_time,
      contractorId: patch.contractorId !== void 0 ? patch.contractorId : cur.contractorId,
      checklist_results: patch.checklist_results !== void 0 ? normalizeChecklistResults(patch.checklist_results) : cur.checklist_results ?? null,
      status,
      updated_at: _now(),
      version: (cur.version || 1) + 1,
      syncStatus: "not_synced",
      source: "local"
    };
    await _persist(next);
    _markDirty();
    _emit({ reason: "update", id, locationId: next.locationId });
    return next;
  },
  async changeStatus(id, newStatus) {
    return this.update(id, { status: _normalizeStatus(newStatus) });
  },
  /**
   * Заменить целиком checklist_results (или сбросить в null).
   * template_key в results должен совпадать с заявкой (если у заявки ключ задан).
   */
  async setChecklistResults(id, results) {
    const cur = _items.find((d) => d.id === id);
    if (!cur || cur.is_deleted || cur._deleted) throw new Error("Заявка не найдена");
    const normalized = normalizeChecklistResults(results);
    if (normalized && cur.template_key && normalized.template_key !== cur.template_key) {
      throw new Error("template_key чек-листа не совпадает с заявкой");
    }
    return this.update(id, { checklist_results: normalized });
  },
  /**
   * Upsert одного пункта в checklist_results.
   * Если results ещё нет — создаёт каркас из template_key заявки.
   */
  async setChecklistItem(id, item) {
    var _a;
    const cur = _items.find((d) => d.id === id);
    if (!cur || cur.is_deleted || cur._deleted) throw new Error("Заявка не найдена");
    const itemId = String(item.id || "").trim();
    const name = String(item.name || "").trim();
    const status = _normalizeItemStatus(item.status);
    if (!itemId || !name || !status) throw new Error("id, name и status пункта обязательны");
    const template_key = String(cur.template_key || ((_a = cur.checklist_results) == null ? void 0 : _a.template_key) || "").trim();
    if (!template_key) throw new Error("У заявки нет template_key для чек-листа");
    const now = _now();
    const prev = normalizeChecklistResults(cur.checklist_results) || {
      template_key,
      items: []
    };
    const idx = prev.items.findIndex((x) => String(x.id) === itemId);
    const existing = idx >= 0 ? prev.items[idx] : null;
    const nextItem = {
      id: itemId,
      group: item.group !== void 0 ? item.group != null ? String(item.group).trim() || null : null : (existing == null ? void 0 : existing.group) ?? null,
      name,
      status,
      updated_at: now
    };
    if (item.clearExtras) ;
    else {
      const comment = item.comment !== void 0 ? _normalizeItemComment(item.comment) : existing == null ? void 0 : existing.comment;
      const photos = item.photos !== void 0 ? _normalizeItemPhotos(item.photos) : existing == null ? void 0 : existing.photos;
      if (comment) nextItem.comment = comment;
      if (photos) nextItem.photos = photos;
    }
    const items = prev.items.slice();
    if (idx >= 0) items[idx] = nextItem;
    else items.push(nextItem);
    return this.update(id, {
      checklist_results: {
        template_key: prev.template_key || template_key,
        updated_at: now,
        items
      }
    });
  },
  async softDelete(id) {
    const cur = _items.find((d) => d.id === id);
    if (!cur) throw new Error("Заявка не найдена");
    const next = {
      ...cur,
      is_deleted: true,
      _deleted: true,
      deleted_at: _now(),
      updated_at: _now(),
      version: (cur.version || 1) + 1,
      syncStatus: "not_synced",
      source: "local"
    };
    await _persist(next);
    _markDirty();
    _emit({ reason: "softDelete", id, locationId: next.locationId });
    return next;
  }
};
function register() {
  window.RBI = window.RBI || { services: {} };
  window.RBI.services = window.RBI.services || {};
  window.RBI.services.constructionAcceptance = ConstructionAcceptanceService;
  if (window.RBI.registry && typeof window.RBI.registry.register === "function") {
    window.RBI.registry.register("service.constructionAcceptance", ConstructionAcceptanceService);
  }
  const tryInit = () => {
    var _a, _b;
    if ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.storage) {
      ConstructionAcceptanceService.init().catch((e) => console.warn("[constructionAcceptance] init", e));
      return true;
    }
    return false;
  };
  if (!tryInit()) {
    document.addEventListener("DOMContentLoaded", () => {
      if (!tryInit()) {
        setTimeout(() => tryInit(), 500);
        setTimeout(() => tryInit(), 2e3);
      }
    });
  }
  console.info("[constructionAcceptance] service.constructionAcceptance registered");
}
register();
export {
  ConstructionAcceptanceService
};
//# sourceMappingURL=rbi-construction-acceptance.js.map
