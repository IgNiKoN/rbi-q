/**
 * service.locations — иерархия LocationNode + планы этажей (v2).
 * Не использует ConstManager / legacy construction_* таблицы.
 */

import type { FloorPlan, LocationNode, NodeType } from './types';
import { CHILD_OF, NODE_TYPES } from './types';
import { attachObjectBridge } from './object-bridge';
import { migrateOdCatalogToLocations as runOdMigrate, type OdMigrateReport } from './od-migrate';

let _nodes: LocationNode[] = [];
let _plans: FloorPlan[] = [];
let _ready = false;

function _storage() {
  return window.RBI?.services?.storage || null;
}

function _stores() {
  const s = _storage();
  const fromSvc = s?.stores?.();
  if (fromSvc && fromSvc.LOCATION_NODES) return fromSvc;
  return (window.STORES || {}) as Record<string, string>;
}

function _events() {
  return window.RBI?.events;
}

function _now() {
  return new Date().toISOString();
}

function _uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
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

function _emit(extra?: Record<string, unknown>) {
  _events()?.emit?.('locations:changed', extra || {});
}

function _markDirty() {
  const sync = window.RBI?.services?.sync as { markDirty?: (k: string | string[]) => void } | undefined;
  if (sync?.markDirty) {
    sync.markDirty(['locations']);
  }
  if (typeof window.triggerSync === 'function') {
    window.triggerSync('silent');
  }
}

function _assertParent(nodeType: NodeType, parentId: string | null) {
  const expected = CHILD_OF[nodeType];
  if (expected === null) {
    if (parentId) throw new Error('object не должен иметь parentId');
    return;
  }
  if (!parentId) throw new Error(`${nodeType} требует parentId`);
  const parent = _activeNodes().find((n) => n.id === parentId);
  if (!parent) throw new Error('Родитель не найден');
  if (parent.nodeType !== expected) {
    throw new Error(`${nodeType} должен висеть на ${expected}, сейчас parent=${parent.nodeType}`);
  }
}

async function _persistNode(node: LocationNode) {
  const storage = _storage();
  const stores = _stores();
  if (!storage || !stores.LOCATION_NODES) throw new Error('storage LOCATION_NODES недоступен');
  await storage.put(stores.LOCATION_NODES, node);
  const idx = _nodes.findIndex((n) => n.id === node.id);
  if (idx >= 0) _nodes[idx] = node;
  else _nodes.push(node);
}

async function _persistPlan(plan: FloorPlan) {
  const storage = _storage();
  const stores = _stores();
  if (!storage || !stores.CONST_FLOORS_V2) throw new Error('storage CONST_FLOORS_V2 недоступен');
  await storage.put(stores.CONST_FLOORS_V2, plan);
  const idx = _plans.findIndex((p) => p.id === plan.id);
  if (idx >= 0) _plans[idx] = plan;
  else _plans.push(plan);
}

export const LocationsService = {
  async init(): Promise<boolean> {
    const storage = _storage();
    const stores = _stores();
    if (!storage || !stores.LOCATION_NODES) {
      console.warn('[locations] storage not ready');
      return false;
    }
    try {
      const nodes = (await storage.getAll(stores.LOCATION_NODES)) as LocationNode[];
      const plans = stores.CONST_FLOORS_V2
        ? ((await storage.getAll(stores.CONST_FLOORS_V2)) as FloorPlan[])
        : [];
      _nodes = Array.isArray(nodes) ? nodes : [];
      _plans = Array.isArray(plans) ? plans : [];
      _ready = true;
      return true;
    } catch (e) {
      console.error('[locations] init failed', e);
      return false;
    }
  },

  isReady(): boolean {
    return _ready;
  },

  /** Подмена in-memory после pull sync. */
  replaceCache(nodes: LocationNode[], plans: FloorPlan[]) {
    _nodes = Array.isArray(nodes) ? nodes.slice() : [];
    _plans = Array.isArray(plans) ? plans.slice() : [];
    _ready = true;
    _emit({ reason: 'replaceCache' });
  },

  listNodes(opts?: { nodeType?: NodeType; parentId?: string | null; includeDeleted?: boolean }): LocationNode[] {
    let list = opts?.includeDeleted ? _nodes.slice() : _activeNodes();
    if (opts && 'parentId' in (opts || {})) {
      const pid = opts!.parentId ?? null;
      list = list.filter((n) => (n.parentId ?? null) === pid);
    }
    if (opts?.nodeType) list = list.filter((n) => n.nodeType === opts.nodeType);
    return list.slice().sort((a, b) => (a.sort_order - b.sort_order) || String(a.displayName).localeCompare(String(b.displayName), 'ru'));
  },

  getNode(id: string): LocationNode | null {
    return _activeNodes().find((n) => n.id === id) || null;
  },

  getChildren(parentId: string | null): LocationNode[] {
    return this.listNodes({ parentId });
  },

  getPath(id: string): LocationNode[] {
    const path: LocationNode[] = [];
    let cur = this.getNode(id);
    const guard = new Set<string>();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      path.unshift(cur);
      cur = cur.parentId ? this.getNode(cur.parentId) : null;
    }
    return path;
  },

  async createNode(input: {
    nodeType: NodeType;
    displayName: string;
    parentId?: string | null;
    sort_order?: number;
    canonical_key?: string;
    synonyms?: string[];
  }): Promise<LocationNode> {
    if (!NODE_TYPES.includes(input.nodeType)) throw new Error('Некорректный nodeType');
    const name = String(input.displayName || '').trim();
    if (!name) throw new Error('displayName обязателен');
    const parentId = input.parentId ?? null;
    _assertParent(input.nodeType, parentId);

    const siblings = this.listNodes({ parentId });
    const node: LocationNode = {
      id: _uuid(),
      companyId: 'rbi',
      nodeType: input.nodeType,
      parentId,
      displayName: name,
      canonical_key: input.canonical_key || '',
      sort_order: input.sort_order != null ? input.sort_order : siblings.length + 1,
      synonyms: Array.isArray(input.synonyms) ? input.synonyms.map((s) => String(s || '').trim()).filter(Boolean) : [],
      created_by: window.syncConfig?.engineerName || '',
      is_deleted: false,
      deleted_at: null,
      created_at: _now(),
      updated_at: _now(),
      version: 1,
      syncStatus: 'not_synced',
      source: 'local'
    };
    await _persistNode(node);
    _markDirty();
    _emit({ reason: 'create', id: node.id });
    return node;
  },

  async updateNode(
    id: string,
    patch: Partial<Pick<LocationNode, 'displayName' | 'sort_order' | 'canonical_key' | 'synonyms'>>
  ): Promise<LocationNode> {
    const cur = _nodes.find((n) => n.id === id);
    if (!cur || cur.is_deleted || cur._deleted) throw new Error('Узел не найден');
    const next: LocationNode = {
      ...cur,
      displayName: patch.displayName != null ? String(patch.displayName).trim() || cur.displayName : cur.displayName,
      sort_order: patch.sort_order != null ? patch.sort_order : cur.sort_order,
      canonical_key: patch.canonical_key != null ? patch.canonical_key : cur.canonical_key,
      synonyms:
        patch.synonyms !== undefined
          ? Array.isArray(patch.synonyms)
            ? patch.synonyms.map((s) => String(s || '').trim()).filter(Boolean)
            : cur.synonyms
          : cur.synonyms,
      updated_at: _now(),
      version: (cur.version || 1) + 1,
      syncStatus: 'not_synced',
      source: 'local'
    };
    await _persistNode(next);
    _markDirty();
    _emit({ reason: 'update', id });
    return next;
  },

  /**
   * Soft-delete узла + потомков.
   * floor → softDelete связанного PDF-плана.
   * apartment → softDelete связанного construction_units_v2 (locationId=apartment.id),
   *   без обратного каскада на этот же apartment (`skipLinkedUnit` / units.skipApartment).
   */
  async softDeleteNode(id: string, opts?: { skipLinkedUnit?: boolean }): Promise<LocationNode> {
    const cur = _nodes.find((n) => n.id === id);
    if (!cur) throw new Error('Узел не найден');
    if (cur.is_deleted || cur._deleted) return cur;
    const kids = this.getChildren(id);
    for (const k of kids) {
      await this.softDeleteNode(k.id);
    }
    if (cur.nodeType === 'floor') {
      const plan = this.getPlanForFloor(id);
      if (plan) await this.softDeletePlan(plan.id);
    }
    if (cur.nodeType === 'apartment' && !opts?.skipLinkedUnit) {
      const unitsSvc = window.RBI?.services?.constructionUnits as
        | {
            list?: (o: { locationId: string }) => { id: string }[];
            softDelete?: (uid: string, o?: { skipApartment?: boolean }) => Promise<unknown>;
          }
        | undefined;
      if (unitsSvc?.list && unitsSvc?.softDelete) {
        const linked = unitsSvc.list({ locationId: id }) || [];
        for (const u of linked) {
          await unitsSvc.softDelete(u.id, { skipApartment: true });
        }
      }
    }
    const next: LocationNode = {
      ...cur,
      is_deleted: true,
      _deleted: true,
      deleted_at: _now(),
      updated_at: _now(),
      version: (cur.version || 1) + 1,
      syncStatus: 'not_synced',
      source: 'local'
    };
    await _persistNode(next);
    _markDirty();
    _emit({ reason: 'softDelete', id });
    return next;
  },

  listPlans(): FloorPlan[] {
    return _activePlans().slice();
  },

  getPlan(id: string): FloorPlan | null {
    return _activePlans().find((p) => p.id === id) || null;
  },

  getPlanForFloor(floorLocationId: string): FloorPlan | null {
    return _activePlans().find((p) => p.locationId === floorLocationId && p.is_active !== false) || null;
  },

  async attachPlan(input: {
    locationId: string;
    pdf_url: string;
    pdf_name?: string;
    pdf_size?: string;
    name?: string;
  }): Promise<FloorPlan> {
    const floor = this.getNode(input.locationId);
    if (!floor || floor.nodeType !== 'floor') throw new Error('План можно прикрепить только к floor');
    const url = String(input.pdf_url || '').trim();
    if (!url) throw new Error('pdf_url обязателен');

    const existing = this.getPlanForFloor(input.locationId);
    if (existing) {
      const next: FloorPlan = {
        ...existing,
        pdf_url: url,
        pdf_name: input.pdf_name || existing.pdf_name || '',
        pdf_size: input.pdf_size || existing.pdf_size || '',
        name: input.name || existing.name || floor.displayName,
        is_active: true,
        updated_at: _now(),
        version: (existing.version || 1) + 1,
        syncStatus: 'not_synced',
        source: 'local'
      };
      await _persistPlan(next);
      _markDirty();
      _emit({ reason: 'attachPlan', id: next.id });
      return next;
    }

    const plan: FloorPlan = {
      id: _uuid(),
      companyId: 'rbi',
      locationId: input.locationId,
      name: input.name || floor.displayName,
      sort_order: 1,
      pdf_url: url,
      pdf_name: input.pdf_name || '',
      pdf_size: input.pdf_size || '',
      is_active: true,
      created_by: window.syncConfig?.engineerName || '',
      is_deleted: false,
      deleted_at: null,
      created_at: _now(),
      updated_at: _now(),
      version: 1,
      syncStatus: 'not_synced',
      source: 'local'
    };
    await _persistPlan(plan);
    _markDirty();
    _emit({ reason: 'attachPlan', id: plan.id });
    return plan;
  },

  async softDeletePlan(id: string): Promise<FloorPlan> {
    const cur = _plans.find((p) => p.id === id);
    if (!cur) throw new Error('План не найден');
    const next: FloorPlan = {
      ...cur,
      is_deleted: true,
      _deleted: true,
      deleted_at: _now(),
      updated_at: _now(),
      version: (cur.version || 1) + 1,
      syncStatus: 'not_synced',
      source: 'local'
    };
    await _persistPlan(next);
    _markDirty();
    _emit({ reason: 'softDeletePlan', id });
    return next;
  },

  /** Загрузка PDF в Supabase Storage (bucket custom-assets) + attachPlan. */
  async uploadFloorPdf(locationId: string, file: File): Promise<FloorPlan> {
    const floor = this.getNode(locationId);
    if (!floor || floor.nodeType !== 'floor') throw new Error('Нужен узел floor');
    const client = window.supabaseClient;
    if (!client?.storage) throw new Error('supabaseClient недоступен (нужен онлайн для первой загрузки)');

    // Supabase Storage key — только ASCII (кириллица в ключе → 400 Invalid key).
    // Оригинальное имя файла сохраняем в pdf_name для UI.
    const safeName = `plan_${Date.now()}.pdf`;
    let path = `location_plans/${locationId}/${safeName}`;
    const sanitize = (window as unknown as { sanitizeStoragePath?: (p: string) => string }).sanitizeStoragePath;
    if (typeof sanitize === 'function') {
      path = sanitize(path);
    } else {
      path = path.replace(/[^a-zA-Z0-9.\-_/]/g, '_');
    }

    const { error } = await client.storage.from('custom-assets').upload(path, file, {
      upsert: true,
      contentType: file.type || 'application/pdf'
    });
    if (error) throw new Error(error.message || 'upload failed');
    const pub = client.storage.from('custom-assets').getPublicUrl(path);
    const publicUrl = pub?.data?.publicUrl || '';
    if (!publicUrl) throw new Error('Не получен publicUrl');

    return this.attachPlan({
      locationId,
      pdf_url: publicUrl,
      pdf_name: file.name || safeName,
      pdf_size: String(file.size || ''),
      name: floor.displayName
    });
  },

  // --- ObjectDirectory ↔ locations.object bridge (C1) ---
  resolveObjectLink(input?: {
    canonical_key?: string;
    displayName?: string;
    locationObjectId?: string;
  }) {
    return _bridge().resolveObjectLink(input);
  },

  listUnlinkedObjects() {
    return _bridge().listUnlinkedObjects();
  },

  ensureCanonicalLink(opts: {
    locationObjectId?: string;
    odCanonicalKey?: string;
    createMissing?: 'od' | 'location' | null;
  }) {
    return _bridge().ensureCanonicalLink(opts);
  },

  linkLocationToOd(locationObjectId: string, odCanonicalKey?: string) {
    return _bridge().linkLocationToOd(locationObjectId, odCanonicalKey);
  },

  createOdFromLocation(locationObjectId: string) {
    return _bridge().createOdFromLocation(locationObjectId);
  },

  createLocationFromOd(odCanonicalKey: string) {
    return _bridge().createLocationFromOd(odCanonicalKey);
  },

  listObjectsAsOdShape() {
    return _bridge().listObjectsAsOdShape();
  },

  ensureObjectNode(opts: { canonical_key: string; displayName: string; synonyms?: string[] }) {
    return _bridge().ensureObjectNode(opts);
  },

  cleanObjectName(str: string) {
    return _bridge().cleanObjectName(str);
  },

  /** C2: идемпотентная миграция OD → locations.object (+ synonyms). C2b: leftover-only. */
  migrateOdCatalogToLocations(opts?: { dryRun?: boolean }): Promise<OdMigrateReport> {
    return runOdMigrate(
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

export type LocationsServiceApi = typeof LocationsService;
