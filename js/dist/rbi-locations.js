const NODE_TYPES = ["object", "building", "section", "floor", "apartment"];
const CHILD_OF = {
  object: null,
  building: "object",
  section: "building",
  floor: "section",
  apartment: "floor"
};
function _od$1() {
  return window.ObjectDirectory || null;
}
function cleanObjectName(str) {
  const od = _od$1();
  if (od && typeof od.cleanString === "function") return od.cleanString(str);
  return String(str || "").toLowerCase().replace(/['"«»]/g, "").replace(/жк\s+/gi, "").trim();
}
function locationNodeToOdShape(n) {
  const key = String(n.canonical_key || "").trim() || cleanObjectName(n.displayName || "");
  return {
    id: n.id,
    canonical_key: key,
    display_name: n.displayName || key,
    name: n.displayName || key,
    synonyms: Array.isArray(n.synonyms) ? n.synonyms.map((s) => String(s || "").trim()).filter(Boolean) : [],
    _deleted: false,
    is_deleted: false,
    sync_status: n.syncStatus || "local",
    source: "locations",
    updated_at: n.updated_at,
    created_by: n.created_by
  };
}
function listObjectsAsOdShape(api) {
  return listLocationObjects(api).map(locationNodeToOdShape);
}
async function ensureObjectNode(api, opts) {
  const key = String(opts.canonical_key || "").trim();
  const displayName = String(opts.displayName || "").trim() || key;
  if (!key) throw new Error("canonical_key обязателен");
  let loc = findLocByKey(api, key) || findLocByDisplay(api, displayName);
  const syn = Array.isArray(opts.synonyms) ? opts.synonyms.map((s) => String(s || "").trim()).filter(Boolean) : [];
  if (!loc) {
    loc = await api.createNode({
      nodeType: "object",
      displayName,
      parentId: null,
      canonical_key: key,
      synonyms: syn
    });
    return loc;
  }
  const patch = {};
  if (!loc.canonical_key || cleanObjectName(loc.canonical_key) !== cleanObjectName(key)) {
    patch.canonical_key = key;
  }
  if (syn.length) {
    const cur = Array.isArray(loc.synonyms) ? loc.synonyms.map(String) : [];
    const merged = [...cur];
    for (const s of syn) {
      if (!merged.some((x) => cleanObjectName(x) === cleanObjectName(s))) merged.push(s);
    }
    if (merged.length !== cur.length) patch.synonyms = merged;
  }
  if (Object.keys(patch).length) {
    loc = await api.updateNode(loc.id, patch);
  }
  return loc;
}
function listOdActive$1() {
  const od = _od$1();
  const list = od && Array.isArray(od.objects) ? od.objects : [];
  return list.filter((o) => o && !o._deleted && !o.is_deleted);
}
function listOdLeftover() {
  const od = _od$1();
  const list = od && Array.isArray(od.leftoverObjects) ? od.leftoverObjects : [];
  return list.filter((o) => o && !o._deleted && !o.is_deleted);
}
function findOdByKey(key) {
  if (!key) return null;
  const od = _od$1();
  if (od && typeof od.getObjectByKey === "function") {
    const hit = od.getObjectByKey(key);
    if (hit && !hit._deleted && !hit.is_deleted) return hit;
  }
  const clean = cleanObjectName(key);
  const fromActive = listOdActive$1().find((o) => cleanObjectName(o.canonical_key || "") === clean);
  if (fromActive) return fromActive;
  return listOdLeftover().find((o) => cleanObjectName(o.canonical_key || "") === clean) || null;
}
function findOdByDisplay(name) {
  const clean = cleanObjectName(name);
  if (!clean) return null;
  return listOdActive$1().find((o) => cleanObjectName(o.display_name || o.name || "") === clean) || null;
}
function listLocationObjects(api) {
  return api.listNodes({ nodeType: "object", parentId: null }) || [];
}
function findLocByKey(api, key) {
  if (!key) return null;
  const clean = cleanObjectName(key);
  return listLocationObjects(api).find(
    (n) => cleanObjectName(n.canonical_key || "") === clean && !!n.canonical_key
  ) || null;
}
function findLocByDisplay(api, name) {
  const clean = cleanObjectName(name);
  if (!clean) return null;
  return listLocationObjects(api).find((n) => cleanObjectName(n.displayName || "") === clean) || null;
}
function resolveObjectLink(api, input = {}) {
  let loc = null;
  let od = null;
  if (input.locationObjectId) {
    const n = api.getNode(input.locationObjectId);
    if (n && n.nodeType === "object") loc = n;
  }
  const key = String(input.canonical_key || loc && loc.canonical_key || "").trim();
  const name = String(input.displayName || loc && loc.displayName || "").trim();
  if (key) {
    od = findOdByKey(key);
    if (!loc) loc = findLocByKey(api, key);
  }
  if (!od && name) od = findOdByDisplay(name);
  if (!loc && name) loc = findLocByDisplay(api, name);
  if (od && !loc && od.canonical_key) {
    loc = findLocByKey(api, od.canonical_key) || findLocByDisplay(api, od.display_name || od.name || "");
  }
  if (loc && !od && loc.canonical_key) {
    od = findOdByKey(loc.canonical_key);
  }
  const linked = !!(od && loc && loc.canonical_key && cleanObjectName(loc.canonical_key) === cleanObjectName(od.canonical_key || ""));
  return { od: od || null, locationObject: loc || null, linked };
}
function listUnlinkedObjects(api) {
  const locationOnly = listLocationObjects(api).filter((n) => {
    return !String(n.canonical_key || "").trim();
  });
  const leftover = listOdLeftover();
  const ods = leftover.length ? leftover : [];
  const odOnly = ods.filter((o) => {
    const r = resolveObjectLink(api, {
      canonical_key: o.canonical_key,
      displayName: o.display_name || o.name
    });
    return !r.locationObject;
  });
  return { locationOnly, odOnly };
}
async function linkLocationToOd(api, locationObjectId, odCanonicalKey) {
  const loc = api.getNode(locationObjectId);
  if (!loc || loc.nodeType !== "object") throw new Error("Нужен узел object");
  let key = String(odCanonicalKey || "").trim();
  if (!key) {
    const matched = resolveObjectLink(api, {
      locationObjectId,
      displayName: loc.displayName,
      canonical_key: loc.canonical_key
    });
    if (!matched.od || !matched.od.canonical_key) {
      throw new Error("Нет ObjectDirectory-peer для привязки");
    }
    key = matched.od.canonical_key;
  } else if (!findOdByKey(key)) {
    throw new Error("ObjectDirectory с таким canonical_key не найден");
  }
  await api.updateNode(locationObjectId, { canonical_key: key });
  return resolveObjectLink(api, { locationObjectId, canonical_key: key });
}
async function createOdFromLocation(api, locationObjectId) {
  const loc0 = api.getNode(locationObjectId);
  if (!loc0 || loc0.nodeType !== "object") throw new Error("Нужен узел object");
  const displayName = String(loc0.displayName || "").trim();
  if (!displayName) throw new Error("displayName пуст");
  let key = String(loc0.canonical_key || "").trim() || cleanObjectName(displayName);
  if (!loc0.canonical_key || cleanObjectName(loc0.canonical_key) !== cleanObjectName(key)) {
    await api.updateNode(locationObjectId, { canonical_key: key });
  }
  const od = _od$1();
  if (od && typeof od.rebuildFromLocations === "function") {
    await od.rebuildFromLocations();
  } else if (od && typeof od.createFromLocation === "function") {
    await od.createFromLocation({ displayName, canonical_key: key });
  }
  return {
    od: locationNodeToOdShape(api.getNode(locationObjectId) || loc0),
    locationObject: api.getNode(locationObjectId) || loc0,
    linked: true
  };
}
async function createLocationFromOd(api, odCanonicalKey) {
  const odObj = findOdByKey(odCanonicalKey);
  if (!odObj) throw new Error("ObjectDirectory не найден");
  const existing = resolveObjectLink(api, {
    canonical_key: odObj.canonical_key,
    displayName: odObj.display_name || odObj.name
  });
  if (existing.locationObject) {
    if (!existing.locationObject.canonical_key || cleanObjectName(existing.locationObject.canonical_key) !== cleanObjectName(odObj.canonical_key || "")) {
      await api.updateNode(existing.locationObject.id, {
        canonical_key: odObj.canonical_key || ""
      });
    }
    return resolveObjectLink(api, {
      locationObjectId: existing.locationObject.id,
      canonical_key: odObj.canonical_key
    });
  }
  const name = String(odObj.display_name || odObj.name || odObj.canonical_key || "").trim();
  if (!name) throw new Error("У OD нет display_name");
  const node = await api.createNode({
    nodeType: "object",
    displayName: name,
    parentId: null,
    canonical_key: odObj.canonical_key || cleanObjectName(name)
  });
  return resolveObjectLink(api, {
    locationObjectId: node.id,
    canonical_key: node.canonical_key
  });
}
async function ensureCanonicalLink(api, opts) {
  const createMissing = opts.createMissing || null;
  if (opts.locationObjectId && createMissing === "od") {
    return createOdFromLocation(api, opts.locationObjectId);
  }
  if (opts.odCanonicalKey && createMissing === "location") {
    return createLocationFromOd(api, opts.odCanonicalKey);
  }
  if (opts.locationObjectId) {
    return linkLocationToOd(api, opts.locationObjectId, opts.odCanonicalKey);
  }
  if (opts.odCanonicalKey) {
    const r = resolveObjectLink(api, { canonical_key: opts.odCanonicalKey });
    if (r.locationObject) {
      return linkLocationToOd(api, r.locationObject.id, opts.odCanonicalKey);
    }
    throw new Error('Нет locations.object для привязки — укажите createMissing:"location"');
  }
  throw new Error("Нужен locationObjectId или odCanonicalKey");
}
function attachObjectBridge(api) {
  return {
    resolveObjectLink: (input) => resolveObjectLink(api, input || {}),
    listUnlinkedObjects: () => listUnlinkedObjects(api),
    listObjectsAsOdShape: () => listObjectsAsOdShape(api),
    ensureObjectNode: (opts) => ensureObjectNode(api, opts),
    ensureCanonicalLink: (opts) => ensureCanonicalLink(api, opts),
    linkLocationToOd: (locationObjectId, odCanonicalKey) => linkLocationToOd(api, locationObjectId, odCanonicalKey),
    createOdFromLocation: (locationObjectId) => createOdFromLocation(api, locationObjectId),
    createLocationFromOd: (odCanonicalKey) => createLocationFromOd(api, odCanonicalKey),
    locationNodeToOdShape,
    cleanObjectName
  };
}
function _od() {
  return window.ObjectDirectory || null;
}
function listOdActive() {
  const od = _od();
  const leftover = od && Array.isArray(od.leftoverObjects) ? od.leftoverObjects : [];
  const list = leftover.length ? leftover : od && Array.isArray(od.objects) ? od.objects : [];
  return list.filter((o) => o && !o._deleted && !o.is_deleted);
}
function collectOdSynonyms(odObj) {
  var _a;
  const key = String(odObj.canonical_key || "").trim();
  const fromObj = Array.isArray(odObj.synonyms) ? odObj.synonyms.map((s) => String(s || "").trim()) : [];
  const fromAliases = [];
  const aliases = ((_a = _od()) == null ? void 0 : _a.aliases) || {};
  if (key) {
    for (const [raw, ck] of Object.entries(aliases)) {
      if (cleanObjectName(String(ck || "")) === cleanObjectName(key)) {
        fromAliases.push(String(raw || "").trim());
      }
    }
  }
  return uniqSynonymStrings([...fromObj, ...fromAliases]);
}
function uniqSynonymStrings(items) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const raw of items) {
    const t = String(raw || "").trim();
    if (!t) continue;
    const k = cleanObjectName(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}
function synonymsEqual(a, b) {
  const aa = uniqSynonymStrings(Array.isArray(a) ? a.map(String) : []);
  if (aa.length !== b.length) return false;
  const setB = new Set(b.map((s) => cleanObjectName(s)));
  return aa.every((s) => setB.has(cleanObjectName(s)));
}
async function migrateOdCatalogToLocations(api, opts = {}) {
  const dryRun = !!opts.dryRun;
  const report = {
    dryRun,
    created: 0,
    linked: 0,
    updatedSynonyms: 0,
    skipped: 0,
    errors: []
  };
  const ods = listOdActive();
  for (const odObj of ods) {
    const key = String(odObj.canonical_key || "").trim();
    if (!key) {
      report.errors.push({
        key: String(odObj.display_name || odObj.id || "?"),
        message: "нет canonical_key"
      });
      continue;
    }
    try {
      const wantedSyn = collectOdSynonyms(odObj);
      const before = resolveObjectLink(api, {
        canonical_key: key,
        displayName: odObj.display_name || odObj.name
      });
      let loc = before.locationObject;
      let didCreate = false;
      let didLink = false;
      if (!loc) {
        if (!dryRun) {
          const r = await createLocationFromOd(api, key);
          loc = r.locationObject;
        }
        didCreate = true;
        report.created += 1;
      } else {
        const locKey = String(loc.canonical_key || "").trim();
        if (!locKey || cleanObjectName(locKey) !== cleanObjectName(key)) {
          if (!dryRun) {
            loc = await api.updateNode(loc.id, { canonical_key: key });
          }
          didLink = true;
          report.linked += 1;
        }
      }
      if (!loc && dryRun) {
        if (wantedSyn.length) report.updatedSynonyms += 1;
        continue;
      }
      if (!loc) {
        report.errors.push({ key, message: "не удалось создать locations.object" });
        continue;
      }
      const curId = loc.id;
      const fresh = api.getNode(curId) || loc;
      if (!synonymsEqual(fresh.synonyms, wantedSyn)) {
        if (wantedSyn.length || Array.isArray(fresh.synonyms) && fresh.synonyms.length) {
          if (!dryRun) {
            await api.updateNode(curId, { synonyms: wantedSyn });
          }
          report.updatedSynonyms += 1;
        } else if (!didCreate && !didLink) {
          report.skipped += 1;
        }
      } else if (!didCreate && !didLink) {
        report.skipped += 1;
      }
    } catch (e) {
      report.errors.push({
        key,
        message: e instanceof Error ? e.message : String(e)
      });
    }
  }
  return report;
}
let _nodes = [];
let _plans = [];
let _ready = false;
function _storage() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.storage) || null;
}
function _stores() {
  var _a;
  const s = _storage();
  const fromSvc = (_a = s == null ? void 0 : s.stores) == null ? void 0 : _a.call(s);
  if (fromSvc && fromSvc.LOCATION_NODES) return fromSvc;
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
  return `loc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
function _activeNodes() {
  return _nodes.filter((n) => n && !n.is_deleted && !n._deleted);
}
function _activePlans() {
  return _plans.filter((p) => p && !p.is_deleted && !p._deleted);
}
function _emit(extra) {
  var _a, _b;
  (_b = (_a = _events()) == null ? void 0 : _a.emit) == null ? void 0 : _b.call(_a, "locations:changed", extra || {});
}
function _markDirty() {
  var _a, _b;
  const sync = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.sync;
  if (sync == null ? void 0 : sync.markDirty) {
    sync.markDirty(["locations"]);
  }
  if (typeof window.triggerSync === "function") {
    window.triggerSync("silent");
  }
}
function _assertParent(nodeType, parentId) {
  const expected = CHILD_OF[nodeType];
  if (expected === null) {
    if (parentId) throw new Error("object не должен иметь parentId");
    return;
  }
  if (!parentId) throw new Error(`${nodeType} требует parentId`);
  const parent = _activeNodes().find((n) => n.id === parentId);
  if (!parent) throw new Error("Родитель не найден");
  if (parent.nodeType !== expected) {
    throw new Error(`${nodeType} должен висеть на ${expected}, сейчас parent=${parent.nodeType}`);
  }
}
async function _persistNode(node) {
  const storage = _storage();
  const stores = _stores();
  if (!storage || !stores.LOCATION_NODES) throw new Error("storage LOCATION_NODES недоступен");
  await storage.put(stores.LOCATION_NODES, node);
  const idx = _nodes.findIndex((n) => n.id === node.id);
  if (idx >= 0) _nodes[idx] = node;
  else _nodes.push(node);
}
async function _persistPlan(plan) {
  const storage = _storage();
  const stores = _stores();
  if (!storage || !stores.CONST_FLOORS_V2) throw new Error("storage CONST_FLOORS_V2 недоступен");
  await storage.put(stores.CONST_FLOORS_V2, plan);
  const idx = _plans.findIndex((p) => p.id === plan.id);
  if (idx >= 0) _plans[idx] = plan;
  else _plans.push(plan);
}
const LocationsService = {
  async init() {
    const storage = _storage();
    const stores = _stores();
    if (!storage || !stores.LOCATION_NODES) {
      console.warn("[locations] storage not ready");
      return false;
    }
    try {
      const nodes = await storage.getAll(stores.LOCATION_NODES);
      const plans = stores.CONST_FLOORS_V2 ? await storage.getAll(stores.CONST_FLOORS_V2) : [];
      _nodes = Array.isArray(nodes) ? nodes : [];
      _plans = Array.isArray(plans) ? plans : [];
      _ready = true;
      return true;
    } catch (e) {
      console.error("[locations] init failed", e);
      return false;
    }
  },
  isReady() {
    return _ready;
  },
  /** Подмена in-memory после pull sync. */
  replaceCache(nodes, plans) {
    _nodes = Array.isArray(nodes) ? nodes.slice() : [];
    _plans = Array.isArray(plans) ? plans.slice() : [];
    _ready = true;
    _emit({ reason: "replaceCache" });
  },
  listNodes(opts) {
    let list = (opts == null ? void 0 : opts.includeDeleted) ? _nodes.slice() : _activeNodes();
    if (opts && "parentId" in (opts || {})) {
      const pid = opts.parentId ?? null;
      list = list.filter((n) => (n.parentId ?? null) === pid);
    }
    if (opts == null ? void 0 : opts.nodeType) list = list.filter((n) => n.nodeType === opts.nodeType);
    return list.slice().sort((a, b) => a.sort_order - b.sort_order || String(a.displayName).localeCompare(String(b.displayName), "ru"));
  },
  getNode(id) {
    return _activeNodes().find((n) => n.id === id) || null;
  },
  getChildren(parentId) {
    return this.listNodes({ parentId });
  },
  getPath(id) {
    const path = [];
    let cur = this.getNode(id);
    const guard = /* @__PURE__ */ new Set();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      path.unshift(cur);
      cur = cur.parentId ? this.getNode(cur.parentId) : null;
    }
    return path;
  },
  async createNode(input) {
    var _a;
    if (!NODE_TYPES.includes(input.nodeType)) throw new Error("Некорректный nodeType");
    const name = String(input.displayName || "").trim();
    if (!name) throw new Error("displayName обязателен");
    const parentId = input.parentId ?? null;
    _assertParent(input.nodeType, parentId);
    const siblings = this.listNodes({ parentId });
    const node = {
      id: _uuid(),
      companyId: "rbi",
      nodeType: input.nodeType,
      parentId,
      displayName: name,
      canonical_key: input.canonical_key || "",
      sort_order: input.sort_order != null ? input.sort_order : siblings.length + 1,
      synonyms: Array.isArray(input.synonyms) ? input.synonyms.map((s) => String(s || "").trim()).filter(Boolean) : [],
      created_by: ((_a = window.syncConfig) == null ? void 0 : _a.engineerName) || "",
      is_deleted: false,
      deleted_at: null,
      created_at: _now(),
      updated_at: _now(),
      version: 1,
      syncStatus: "not_synced",
      source: "local"
    };
    await _persistNode(node);
    _markDirty();
    _emit({ reason: "create", id: node.id });
    return node;
  },
  async updateNode(id, patch) {
    const cur = _nodes.find((n) => n.id === id);
    if (!cur || cur.is_deleted || cur._deleted) throw new Error("Узел не найден");
    const next = {
      ...cur,
      displayName: patch.displayName != null ? String(patch.displayName).trim() || cur.displayName : cur.displayName,
      sort_order: patch.sort_order != null ? patch.sort_order : cur.sort_order,
      canonical_key: patch.canonical_key != null ? patch.canonical_key : cur.canonical_key,
      synonyms: patch.synonyms !== void 0 ? Array.isArray(patch.synonyms) ? patch.synonyms.map((s) => String(s || "").trim()).filter(Boolean) : cur.synonyms : cur.synonyms,
      updated_at: _now(),
      version: (cur.version || 1) + 1,
      syncStatus: "not_synced",
      source: "local"
    };
    await _persistNode(next);
    _markDirty();
    _emit({ reason: "update", id });
    return next;
  },
  /**
   * Soft-delete узла + потомков.
   * floor → softDelete связанного PDF-плана.
   * apartment → softDelete связанного construction_units_v2 (locationId=apartment.id),
   *   без обратного каскада на этот же apartment (`skipLinkedUnit` / units.skipApartment).
   */
  async softDeleteNode(id, opts) {
    var _a, _b;
    const cur = _nodes.find((n) => n.id === id);
    if (!cur) throw new Error("Узел не найден");
    if (cur.is_deleted || cur._deleted) return cur;
    const kids = this.getChildren(id);
    for (const k of kids) {
      await this.softDeleteNode(k.id);
    }
    if (cur.nodeType === "floor") {
      const plan = this.getPlanForFloor(id);
      if (plan) await this.softDeletePlan(plan.id);
    }
    if (cur.nodeType === "apartment" && !(opts == null ? void 0 : opts.skipLinkedUnit)) {
      const unitsSvc = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.constructionUnits;
      if ((unitsSvc == null ? void 0 : unitsSvc.list) && (unitsSvc == null ? void 0 : unitsSvc.softDelete)) {
        const linked = unitsSvc.list({ locationId: id }) || [];
        for (const u of linked) {
          await unitsSvc.softDelete(u.id, { skipApartment: true });
        }
      }
    }
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
    await _persistNode(next);
    _markDirty();
    _emit({ reason: "softDelete", id });
    return next;
  },
  listPlans() {
    return _activePlans().slice();
  },
  getPlan(id) {
    return _activePlans().find((p) => p.id === id) || null;
  },
  getPlanForFloor(floorLocationId) {
    return _activePlans().find((p) => p.locationId === floorLocationId && p.is_active !== false) || null;
  },
  async attachPlan(input) {
    var _a;
    const floor = this.getNode(input.locationId);
    if (!floor || floor.nodeType !== "floor") throw new Error("План можно прикрепить только к floor");
    const url = String(input.pdf_url || "").trim();
    if (!url) throw new Error("pdf_url обязателен");
    const existing = this.getPlanForFloor(input.locationId);
    if (existing) {
      const next = {
        ...existing,
        pdf_url: url,
        pdf_name: input.pdf_name || existing.pdf_name || "",
        pdf_size: input.pdf_size || existing.pdf_size || "",
        name: input.name || existing.name || floor.displayName,
        is_active: true,
        updated_at: _now(),
        version: (existing.version || 1) + 1,
        syncStatus: "not_synced",
        source: "local"
      };
      await _persistPlan(next);
      _markDirty();
      _emit({ reason: "attachPlan", id: next.id });
      return next;
    }
    const plan = {
      id: _uuid(),
      companyId: "rbi",
      locationId: input.locationId,
      name: input.name || floor.displayName,
      sort_order: 1,
      pdf_url: url,
      pdf_name: input.pdf_name || "",
      pdf_size: input.pdf_size || "",
      is_active: true,
      created_by: ((_a = window.syncConfig) == null ? void 0 : _a.engineerName) || "",
      is_deleted: false,
      deleted_at: null,
      created_at: _now(),
      updated_at: _now(),
      version: 1,
      syncStatus: "not_synced",
      source: "local"
    };
    await _persistPlan(plan);
    _markDirty();
    _emit({ reason: "attachPlan", id: plan.id });
    return plan;
  },
  async softDeletePlan(id) {
    const cur = _plans.find((p) => p.id === id);
    if (!cur) throw new Error("План не найден");
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
    await _persistPlan(next);
    _markDirty();
    _emit({ reason: "softDeletePlan", id });
    return next;
  },
  /** Загрузка PDF в Supabase Storage (bucket custom-assets) + attachPlan. */
  async uploadFloorPdf(locationId, file) {
    var _a;
    const floor = this.getNode(locationId);
    if (!floor || floor.nodeType !== "floor") throw new Error("Нужен узел floor");
    const client = window.supabaseClient;
    if (!(client == null ? void 0 : client.storage)) throw new Error("supabaseClient недоступен (нужен онлайн для первой загрузки)");
    const safeName = `plan_${Date.now()}.pdf`;
    let path = `location_plans/${locationId}/${safeName}`;
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
    return this.attachPlan({
      locationId,
      pdf_url: publicUrl,
      pdf_name: file.name || safeName,
      pdf_size: String(file.size || ""),
      name: floor.displayName
    });
  },
  // --- ObjectDirectory ↔ locations.object bridge (C1) ---
  resolveObjectLink(input) {
    return _bridge().resolveObjectLink(input);
  },
  listUnlinkedObjects() {
    return _bridge().listUnlinkedObjects();
  },
  ensureCanonicalLink(opts) {
    return _bridge().ensureCanonicalLink(opts);
  },
  linkLocationToOd(locationObjectId, odCanonicalKey) {
    return _bridge().linkLocationToOd(locationObjectId, odCanonicalKey);
  },
  createOdFromLocation(locationObjectId) {
    return _bridge().createOdFromLocation(locationObjectId);
  },
  createLocationFromOd(odCanonicalKey) {
    return _bridge().createLocationFromOd(odCanonicalKey);
  },
  listObjectsAsOdShape() {
    return _bridge().listObjectsAsOdShape();
  },
  ensureObjectNode(opts) {
    return _bridge().ensureObjectNode(opts);
  },
  cleanObjectName(str) {
    return _bridge().cleanObjectName(str);
  },
  /** C2: идемпотентная миграция OD → locations.object (+ synonyms). C2b: leftover-only. */
  migrateOdCatalogToLocations(opts) {
    return migrateOdCatalogToLocations(
      {
        listNodes: (o) => LocationsService.listNodes(o),
        getNode: (id) => LocationsService.getNode(id),
        updateNode: (id, patch) => LocationsService.updateNode(id, patch),
        createNode: (input) => LocationsService.createNode(input)
      },
      opts || {}
    );
  }
};
function _bridge() {
  return attachObjectBridge({
    listNodes: (opts) => LocationsService.listNodes(opts),
    getNode: (id) => LocationsService.getNode(id),
    updateNode: (id, patch) => LocationsService.updateNode(id, patch),
    createNode: (input) => LocationsService.createNode(input)
  });
}
function register() {
  window.RBI = window.RBI || { services: {} };
  window.RBI.services = window.RBI.services || {};
  window.RBI.services.locations = LocationsService;
  if (window.RBI.registry && typeof window.RBI.registry.register === "function") {
    window.RBI.registry.register("service.locations", LocationsService);
  }
  const tryInit = () => {
    var _a, _b;
    if ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.storage) {
      LocationsService.init().catch((e) => console.warn("[locations] init", e));
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
  console.info("[locations] service.locations registered");
}
register();
export {
  LocationsService,
  cleanObjectName,
  collectOdSynonyms,
  ensureCanonicalLink,
  ensureObjectNode,
  listObjectsAsOdShape,
  listUnlinkedObjects,
  locationNodeToOdShape,
  migrateOdCatalogToLocations,
  resolveObjectLink
};
//# sourceMappingURL=rbi-locations.js.map
