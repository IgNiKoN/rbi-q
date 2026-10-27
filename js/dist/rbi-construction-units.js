const UNIT_STATUS_ALIASES = {
  none: "not_inspected",
  ready: "finishing",
  defects: "has_defects",
  accepted: "transferred"
};
const UNIT_STATUSES_V2 = [
  "not_inspected",
  "finishing",
  "has_defects",
  "ready_for_transfer",
  "transferred",
  "shareholder_defects"
];
function _normalizeStatus(value, fallback = "not_inspected") {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return fallback;
  if (UNIT_STATUSES_V2.includes(s)) return s;
  if (UNIT_STATUS_ALIASES[s]) return UNIT_STATUS_ALIASES[s];
  return fallback;
}
function _pdfField(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}
function normalizeConstructionUnitV2(raw) {
  const d = raw || {};
  const sortRaw = d.sort_order;
  const sort_order = sortRaw == null || sortRaw === "" ? 0 : Number(sortRaw);
  return {
    ...d,
    locationId: String(d.locationId || d.location_id || ""),
    name: String(d.name || "").trim(),
    type: d.type != null ? String(d.type).trim() || "КВ" : "КВ",
    sort_order: Number.isFinite(sort_order) ? sort_order : 0,
    status: _normalizeStatus(d.status),
    pdf_url: _pdfField(d.pdf_url),
    pdf_name: _pdfField(d.pdf_name),
    pdf_size: _pdfField(d.pdf_size),
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
  if (fromSvc && fromSvc.CONST_UNITS_V2) return fromSvc;
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
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cunit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
function _active() {
  return _items.filter((d) => d && !d.is_deleted && !d._deleted);
}
function _emit(extra) {
  var _a, _b;
  (_b = (_a = _events()) == null ? void 0 : _a.emit) == null ? void 0 : _b.call(_a, "construction-units:changed", extra || {});
}
function _markDirty() {
  var _a, _b;
  const sync = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.sync;
  if (sync == null ? void 0 : sync.markDirty) {
    sync.markDirty(["constructionUnits"]);
  }
  if (typeof window.triggerSync === "function") {
    window.triggerSync("silent");
  }
}
async function _persist(item) {
  const storage = _storage();
  const stores = _stores();
  if (!storage || !stores.CONST_UNITS_V2) {
    throw new Error("storage CONST_UNITS_V2 недоступен");
  }
  await storage.put(stores.CONST_UNITS_V2, item);
  const idx = _items.findIndex((d) => d.id === item.id);
  if (idx >= 0) _items[idx] = item;
  else _items.push(item);
}
function _locations() {
  var _a, _b;
  return (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.locations;
}
function _apartmentIdsForFloor(floorId) {
  const loc = _locations();
  const ids = /* @__PURE__ */ new Set();
  if (!(loc == null ? void 0 : loc.listNodes) || !floorId) return ids;
  for (const a of loc.listNodes({ nodeType: "apartment", parentId: floorId }) || []) {
    if (a == null ? void 0 : a.id) ids.add(a.id);
  }
  return ids;
}
function resolveFloorsForBuilding(buildingId) {
  const loc = _locations();
  if (!loc || !buildingId) return [];
  const sections = (typeof loc.getChildren === "function" ? loc.getChildren(buildingId) : []) || [];
  const floors = [];
  for (const sec of sections) {
    if (!(sec == null ? void 0 : sec.id)) continue;
    const kids = (typeof loc.getChildren === "function" ? loc.getChildren(sec.id) : []) || [];
    for (const fl of kids) {
      if (!(fl == null ? void 0 : fl.id)) continue;
      if (fl.nodeType && fl.nodeType !== "floor") continue;
      floors.push(fl);
    }
  }
  floors.sort((a, b) => Number(b.sort_order || 0) - Number(a.sort_order || 0));
  return floors;
}
const ConstructionUnitsService = {
  async init() {
    const storage = _storage();
    const stores = _stores();
    if (!storage || !stores.CONST_UNITS_V2) {
      console.warn("[constructionUnits] storage not ready");
      return false;
    }
    try {
      const rows = await storage.getAll(stores.CONST_UNITS_V2);
      _items = (Array.isArray(rows) ? rows : []).map((r) => normalizeConstructionUnitV2(r));
      _ready = true;
      return true;
    } catch (e) {
      console.warn("[constructionUnits] init failed", e);
      return false;
    }
  },
  isReady() {
    return _ready;
  },
  replaceCache(items) {
    _items = (Array.isArray(items) ? items : []).map((r) => normalizeConstructionUnitV2(r));
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
    return list.slice().sort((a, b) => {
      const so = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (so !== 0) return so;
      return String(a.name || "").localeCompare(String(b.name || ""), "ru", { numeric: true });
    });
  },
  get(id) {
    return _active().find((d) => d.id === id) || null;
  },
  /**
   * Помещения этажа: canonical (locationId = apartment под floor)
   * + legacy (locationId = floor.id).
   */
  listForFloor(floorId) {
    const fid = String(floorId || "").trim();
    if (!fid) return [];
    const aptIds = _apartmentIdsForFloor(fid);
    return _active().filter((u) => u.locationId === fid || aptIds.has(u.locationId)).slice().sort((a, b) => {
      const so = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (so !== 0) return so;
      return String(a.name || "").localeCompare(String(b.name || ""), "ru", { numeric: true });
    });
  },
  listForBuilding(buildingId) {
    const floors = resolveFloorsForBuilding(buildingId);
    const floorIds = new Set(floors.map((f) => f.id));
    const aptIds = /* @__PURE__ */ new Set();
    for (const fid of floorIds) {
      for (const id of _apartmentIdsForFloor(fid)) aptIds.add(id);
    }
    return _active().filter((u) => floorIds.has(u.locationId) || aptIds.has(u.locationId)).slice().sort((a, b) => {
      const so = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (so !== 0) return so;
      return String(a.name || "").localeCompare(String(b.name || ""), "ru", { numeric: true });
    });
  },
  async create(input) {
    var _a;
    const locationId = String(input.locationId || "").trim();
    if (!locationId) throw new Error("locationId обязателен");
    const name = String(input.name || "").trim();
    if (!name) throw new Error("name обязателен");
    const status = _normalizeStatus(input.status, "not_inspected");
    const sort_order = input.sort_order != null && Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 0;
    const item = {
      id: _uuid(),
      companyId: "rbi",
      locationId,
      name,
      type: input.type != null ? String(input.type).trim() || "КВ" : "КВ",
      sort_order,
      status,
      pdf_url: _pdfField(input.pdf_url),
      pdf_name: _pdfField(input.pdf_name),
      pdf_size: _pdfField(input.pdf_size),
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
    if (!cur || cur.is_deleted || cur._deleted) throw new Error("Помещение не найдено");
    let status = cur.status;
    if (patch.status != null) {
      status = _normalizeStatus(patch.status, _normalizeStatus(cur.status));
    }
    const next = {
      ...cur,
      locationId: patch.locationId != null ? String(patch.locationId).trim() || cur.locationId : cur.locationId,
      name: patch.name != null ? String(patch.name).trim() || cur.name : cur.name,
      type: patch.type !== void 0 ? patch.type != null ? String(patch.type).trim() || "КВ" : "КВ" : cur.type,
      sort_order: patch.sort_order != null && Number.isFinite(Number(patch.sort_order)) ? Number(patch.sort_order) : cur.sort_order,
      status,
      pdf_url: patch.pdf_url !== void 0 ? _pdfField(patch.pdf_url) : cur.pdf_url,
      pdf_name: patch.pdf_name !== void 0 ? _pdfField(patch.pdf_name) : cur.pdf_name,
      pdf_size: patch.pdf_size !== void 0 ? _pdfField(patch.pdf_size) : cur.pdf_size,
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
   * Загрузка PDF плана квартиры в Supabase Storage (bucket custom-assets) + update полей.
   * Повторный upload перезаписывает поля (старый объект в Storage не удаляется — YAGNI).
   */
  async uploadUnitPdf(unitId, file) {
    var _a;
    const cur = this.get(unitId);
    if (!cur) throw new Error("Помещение не найдено");
    const client = window.supabaseClient;
    if (!(client == null ? void 0 : client.storage)) {
      throw new Error("supabaseClient недоступен (нужен онлайн для первой загрузки)");
    }
    const safeName = `plan_${Date.now()}.pdf`;
    let path = `unit_plans/${unitId}/${safeName}`;
    const sanitize = window.sanitizeStoragePath;
    if (typeof sanitize === "function") {
      path = sanitize(path);
    } else {
      path = path.replace(/[^a-zA-Z0-9.\-_/]/g, "_");
    }
    const { error } = await client.storage.from("custom-assets").upload(path, file, {
      upsert: true,
      contentType: file.type || "application/pdf"
    });
    if (error) throw new Error(error.message || "upload failed");
    const pub = client.storage.from("custom-assets").getPublicUrl(path);
    const publicUrl = ((_a = pub == null ? void 0 : pub.data) == null ? void 0 : _a.publicUrl) || "";
    if (!publicUrl) throw new Error("Не получен publicUrl");
    return this.update(unitId, {
      pdf_url: publicUrl,
      pdf_name: file.name || safeName,
      pdf_size: String(file.size || "")
    });
  },
  /** Снять активный план квартиры (поля pdf_* → null). */
  async clearUnitPlan(unitId) {
    return this.update(unitId, {
      pdf_url: null,
      pdf_name: null,
      pdf_size: null
    });
  },
  async softDelete(id, opts) {
    var _a, _b;
    const cur = _items.find((d) => d.id === id);
    if (!cur) throw new Error("Помещение не найдено");
    if (cur.is_deleted || cur._deleted) return cur;
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
    if (!(opts == null ? void 0 : opts.skipApartment)) {
      const loc = _locations();
      const node = (_a = loc == null ? void 0 : loc.getNode) == null ? void 0 : _a.call(loc, cur.locationId);
      if ((node == null ? void 0 : node.nodeType) === "apartment" && (loc == null ? void 0 : loc.softDeleteNode) && !((_b = loc.isCoreLed) == null ? void 0 : _b.call(loc, cur.locationId))) {
        await loc.softDeleteNode(cur.locationId, { skipLinkedUnit: true });
      }
    }
    return next;
  },
  /**
   * Если unit ещё привязан к floor (legacy) — создать apartment и перепривязать.
   * Если уже apartment — no-op. Возвращает актуальный unit.
   */
  async ensureApartmentForUnit(unitId) {
    var _a;
    const cur = this.get(unitId);
    if (!cur) throw new Error("Помещение не найдено");
    const loc = _locations();
    if (!(loc == null ? void 0 : loc.getNode) || !(loc == null ? void 0 : loc.createNode)) return cur;
    if ((_a = loc.isCoreLed) == null ? void 0 : _a.call(loc, cur.locationId)) return cur;
    const node = loc.getNode(cur.locationId);
    if ((node == null ? void 0 : node.nodeType) === "apartment") return cur;
    const floorId = (node == null ? void 0 : node.nodeType) === "floor" ? node.id : node ? null : cur.locationId;
    if (!floorId) return cur;
    const floor = loc.getNode(floorId);
    if (!floor || floor.nodeType !== "floor") return cur;
    const apt = await loc.createNode({
      nodeType: "apartment",
      displayName: cur.name || "КВ",
      parentId: floorId,
      sort_order: cur.sort_order != null ? Number(cur.sort_order) : void 0
    });
    return this.update(cur.id, { locationId: apt.id });
  },
  /**
   * Ленивая миграция: все legacy units корпуса (locationId=floor) → apartment nodes.
   * @returns число перепривязанных units
   */
  async migrateUnitsToApartmentNodes(buildingId) {
    const bid = String(buildingId || "").trim();
    if (!bid) return 0;
    const floors = resolveFloorsForBuilding(bid);
    let migrated = 0;
    for (const fl of floors) {
      const legacy = _active().filter((u) => u.locationId === fl.id);
      for (const u of legacy) {
        await this.ensureApartmentForUnit(u.id);
        migrated += 1;
      }
    }
    if (migrated) _emit({ reason: "migrateToApartment", buildingId: bid, count: migrated });
    return migrated;
  },
  /**
   * Сгенерировать N помещений на каждый этаж корпуса (все status=not_inspected).
   * На каждый unit создаётся узел apartment (parent=floor); locationId = apartment.id.
   */
  async generateGrid(buildingId, perFloor = 8) {
    const bid = String(buildingId || "").trim();
    if (!bid) throw new Error("buildingId обязателен");
    const n = Math.max(1, Math.min(50, Number(perFloor) || 8));
    const floors = resolveFloorsForBuilding(bid);
    if (!floors.length) throw new Error("В корпусе нет этажей");
    const loc = _locations();
    if (!(loc == null ? void 0 : loc.createNode)) throw new Error("service.locations недоступен");
    await this.migrateUnitsToApartmentNodes(bid);
    const floorsAsc = floors.slice().sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const created = [];
    let count = 1;
    for (const fl of floorsAsc) {
      for (let i = 1; i <= n; i++) {
        const apt = await loc.createNode({
          nodeType: "apartment",
          displayName: String(count),
          parentId: fl.id,
          sort_order: i
        });
        const item = await this.create({
          locationId: apt.id,
          name: String(count),
          type: "КВ",
          sort_order: i,
          status: "not_inspected"
        });
        created.push(item);
        count += 1;
      }
    }
    _emit({ reason: "generateGrid", buildingId: bid, count: created.length });
    return created;
  }
};
function register() {
  window.RBI = window.RBI || { services: {} };
  window.RBI.services = window.RBI.services || {};
  window.RBI.services.constructionUnits = ConstructionUnitsService;
  if (window.RBI.registry && typeof window.RBI.registry.register === "function") {
    window.RBI.registry.register("service.constructionUnits", ConstructionUnitsService);
  }
  const tryInit = () => {
    var _a, _b;
    if ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.storage) {
      ConstructionUnitsService.init().catch((e) => console.warn("[constructionUnits] init", e));
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
  console.info("[constructionUnits] service.constructionUnits registered");
}
register();
export {
  ConstructionUnitsService
};
//# sourceMappingURL=rbi-construction-units.js.map
