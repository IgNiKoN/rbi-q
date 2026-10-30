const DEFECT_STATUSES_V2 = [
  "issued",
  "in_progress",
  "fixed",
  "closed",
  "rejected"
];
function _normalizeDeadline(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
function _normalizeCategory(value, fallback = "B2") {
  const raw = String(value || "").trim();
  const c = raw.toUpperCase();
  if (c === "B1" || c === "B2" || c === "B3") return c;
  const low = raw.toLowerCase();
  if (low === "critical") return "B3";
  if (low === "major") return "B2";
  if (low === "minor") return "B1";
  return fallback;
}
function _normalizeStatus(value, fallback = "issued") {
  const s = String(value || "").trim().toLowerCase();
  if (s === "open") return "issued";
  if (s === "cancelled") return "rejected";
  if (DEFECT_STATUSES_V2.includes(s)) return s;
  return fallback;
}
function _normalizePhotos(raw, legacyPhoto) {
  const out = [];
  const push = (v) => {
    if (typeof v !== "string") return;
    const t = v.trim();
    if (t) out.push(t);
  };
  if (Array.isArray(raw)) {
    raw.forEach(push);
  } else if (typeof raw === "string" && raw.trim()) {
    const s = raw.trim();
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) parsed.forEach(push);
        else push(s);
      } catch {
        push(s);
      }
    } else {
      push(s);
    }
  }
  if (!out.length && legacyPhoto != null) {
    return _normalizePhotos(legacyPhoto, null);
  }
  return out;
}
function _normalizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((h) => {
    const entry = h && typeof h === "object" ? h : {};
    const photos = _normalizePhotos(entry.photos, entry.photo);
    return {
      status: entry.status || "",
      date: entry.date || "",
      user: entry.user || "",
      comment: entry.comment ?? null,
      photo: photos[0] || entry.photo || null,
      photos: photos.length ? photos : void 0
    };
  });
}
function normalizeConstructionDefectV2(raw) {
  const d = raw || {};
  const photos = _normalizePhotos(d.photos, d.photo);
  return {
    ...d,
    category: _normalizeCategory(d.category),
    status: _normalizeStatus(d.status),
    photos,
    photo: photos[0] || d.photo || null,
    history: _normalizeHistory(d.history),
    deadline: _normalizeDeadline(d.deadline) ?? d.deadline ?? null
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
  if (fromSvc && fromSvc.CONST_DEFECTS_V2) return fromSvc;
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
  (_b = (_a = _events()) == null ? void 0 : _a.emit) == null ? void 0 : _b.call(_a, "construction-defects:changed", extra || {});
}
function _markDirty() {
  var _a, _b;
  const sync = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.sync;
  if (sync == null ? void 0 : sync.markDirty) {
    sync.markDirty(["constructionDefects"]);
  }
  if (typeof window.triggerSync === "function") {
    window.triggerSync("silent");
  }
}
function _clampPct(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
async function _persist(item) {
  const storage = _storage();
  const stores = _stores();
  if (!storage || !stores.CONST_DEFECTS_V2) {
    throw new Error("storage CONST_DEFECTS_V2 недоступен");
  }
  await storage.put(stores.CONST_DEFECTS_V2, item);
  const idx = _items.findIndex((d) => d.id === item.id);
  if (idx >= 0) _items[idx] = item;
  else _items.push(item);
}
const ConstructionDefectsService = {
  async init() {
    const storage = _storage();
    const stores = _stores();
    if (!storage || !stores.CONST_DEFECTS_V2) {
      console.warn("[constructionDefects] storage not ready");
      return false;
    }
    try {
      const rows = await storage.getAll(stores.CONST_DEFECTS_V2);
      _items = (Array.isArray(rows) ? rows : []).map((r) => normalizeConstructionDefectV2(r));
      _ready = true;
      return true;
    } catch (e) {
      console.error("[constructionDefects] init failed", e);
      return false;
    }
  },
  isReady() {
    return _ready;
  },
  /** Подмена in-memory после pull sync. */
  replaceCache(items) {
    _items = (Array.isArray(items) ? items : []).map((r) => normalizeConstructionDefectV2(r));
    _ready = true;
    _emit({ reason: "replaceCache" });
  },
  list(opts) {
    let list = (opts == null ? void 0 : opts.includeDeleted) ? _items.slice() : _active();
    if (opts == null ? void 0 : opts.locationId) {
      list = list.filter((d) => d.locationId === opts.locationId);
    }
    return list.slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  },
  get(id) {
    return _active().find((d) => d.id === id) || null;
  },
  /** Активные дефекты этажа (locationId = floor). */
  listForFloor(locationId) {
    return this.list({ locationId });
  },
  /** Активные дефекты локации (floor или apartment). Alias к list({locationId}). */
  listForLocation(locationId) {
    return this.list({ locationId });
  },
  async create(input) {
    var _a;
    const locationId = String(input.locationId || "").trim();
    if (!locationId) throw new Error("locationId обязателен");
    const itemName = input.item_name != null ? String(input.item_name).trim() : "";
    const description = String(input.description || "").trim() || itemName;
    if (!description) throw new Error("description обязателен");
    const category = _normalizeCategory(input.category, "B2");
    const photos = _normalizePhotos(input.photos, null);
    const status = _normalizeStatus(input.status, "issued");
    const item = {
      id: _uuid(),
      companyId: "rbi",
      locationId,
      x: _clampPct(Number(input.x)),
      y: _clampPct(Number(input.y)),
      template_key: input.template_key != null ? String(input.template_key) || null : null,
      item_id: input.item_id != null ? String(input.item_id) || null : null,
      item_name: itemName || null,
      norm_text: input.norm_text != null ? String(input.norm_text) || null : null,
      text: description,
      category,
      deadline: _normalizeDeadline(input.deadline),
      contractorId: input.contractorId || null,
      description,
      photos,
      photo: photos[0] || null,
      status,
      history: [],
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
    if (!cur || cur.is_deleted || cur._deleted) throw new Error("Замечание не найдено");
    const category = patch.category != null ? _normalizeCategory(patch.category, _normalizeCategory(cur.category)) : cur.category;
    const description = patch.description != null ? String(patch.description).trim() || cur.description : cur.description;
    let status = cur.status;
    if (patch.status != null) {
      status = _normalizeStatus(patch.status, _normalizeStatus(cur.status));
    }
    const photos = patch.photos !== void 0 ? _normalizePhotos(patch.photos, null) : cur.photos || [];
    const next = {
      ...cur,
      description,
      text: description,
      category,
      contractorId: patch.contractorId !== void 0 ? patch.contractorId : cur.contractorId,
      status,
      deadline: patch.deadline !== void 0 ? _normalizeDeadline(patch.deadline) : cur.deadline ?? null,
      x: patch.x != null ? _clampPct(Number(patch.x)) : cur.x,
      y: patch.y != null ? _clampPct(Number(patch.y)) : cur.y,
      template_key: patch.template_key !== void 0 ? patch.template_key : cur.template_key,
      item_id: patch.item_id !== void 0 ? patch.item_id : cur.item_id,
      item_name: patch.item_name !== void 0 ? patch.item_name : cur.item_name,
      norm_text: patch.norm_text !== void 0 ? patch.norm_text : cur.norm_text,
      photos,
      photo: photos[0] || null,
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
  /**
   * Смена статуса с записью в history (как ConstDefectForm.applyStatusChange).
   * photos — фото устранения (несколько); дублируются в entry.photo (первое) и entry.photos.
   */
  async changeStatus(id, newStatus, opts) {
    var _a;
    const cur = _items.find((d) => d.id === id);
    if (!cur || cur.is_deleted || cur._deleted) throw new Error("Замечание не найдено");
    const status = _normalizeStatus(newStatus, _normalizeStatus(cur.status));
    const fixPhotos = _normalizePhotos(opts == null ? void 0 : opts.photos, opts == null ? void 0 : opts.photo);
    const history = _normalizeHistory(cur.history);
    const entry = {
      status,
      date: _now(),
      user: ((_a = window.syncConfig) == null ? void 0 : _a.engineerName) || "Пользователь",
      comment: (opts == null ? void 0 : opts.comment) != null ? String(opts.comment) : null,
      photo: fixPhotos[0] || null,
      photos: fixPhotos.length ? fixPhotos : void 0
    };
    history.push(entry);
    const next = {
      ...cur,
      status,
      history,
      updated_at: _now(),
      version: (cur.version || 1) + 1,
      syncStatus: "not_synced",
      source: "local"
    };
    await _persist(next);
    _markDirty();
    _emit({ reason: "changeStatus", id, locationId: next.locationId, status });
    return next;
  },
  async softDelete(id) {
    const cur = _items.find((d) => d.id === id);
    if (!cur) throw new Error("Замечание не найдено");
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
  window.RBI.services.constructionDefects = ConstructionDefectsService;
  if (window.RBI.registry && typeof window.RBI.registry.register === "function") {
    window.RBI.registry.register("service.constructionDefects", ConstructionDefectsService);
  }
  const tryInit = () => {
    var _a, _b;
    if ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.storage) {
      ConstructionDefectsService.init().catch((e) => console.warn("[constructionDefects] init", e));
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
  console.info("[constructionDefects] service.constructionDefects registered");
}
register();
export {
  ConstructionDefectsService
};
//# sourceMappingURL=rbi-construction-defects.js.map
