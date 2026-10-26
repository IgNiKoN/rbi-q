/**
 * MVP-мост ObjectDirectory (плоский) ↔ locations.object (иерархия).
 * Ключ связи: canonical_key. Без DDL / третьего store.
 */

import type { LocationNode } from './types';

export type OdObjectLite = {
  id?: string;
  canonical_key?: string;
  display_name?: string;
  name?: string;
  _deleted?: boolean;
  is_deleted?: boolean;
  synonyms?: string[];
  project_code?: string;
  sync_status?: string;
  source?: string;
  updated_at?: string;
  created_by?: string;
};

export type ObjectLinkResult = {
  od: OdObjectLite | null;
  locationObject: LocationNode | null;
  linked: boolean;
};

export type ObjectBridgeApi = {
  listNodes: (opts?: {
    nodeType?: LocationNode['nodeType'];
    parentId?: string | null;
    includeDeleted?: boolean;
  }) => LocationNode[];
  getNode: (id: string) => LocationNode | null;
  updateNode: (
    id: string,
    patch: Partial<Pick<LocationNode, 'displayName' | 'sort_order' | 'canonical_key' | 'synonyms'>>
  ) => Promise<LocationNode>;
  createNode: (input: {
    nodeType: LocationNode['nodeType'];
    displayName: string;
    parentId?: string | null;
    sort_order?: number;
    canonical_key?: string;
    synonyms?: string[];
  }) => Promise<LocationNode>;
};

type OdGlobal = {
  objects?: OdObjectLite[];
  leftoverObjects?: OdObjectLite[];
  cleanString?: (s: string) => string;
  getObjectByKey?: (key: string) => OdObjectLite | null;
  rebuildFromLocations?: () => Promise<void> | void;
  createFromLocation?: (opts: {
    displayName: string;
    canonical_key?: string;
  }) => Promise<OdObjectLite | null> | OdObjectLite | null;
};

function _od(): OdGlobal | null {
  return (window as unknown as { ObjectDirectory?: OdGlobal }).ObjectDirectory || null;
}

/** Тот же cleanString, что ObjectDirectory (fallback — локальная копия). */
export function cleanObjectName(str: string): string {
  const od = _od();
  if (od && typeof od.cleanString === 'function') return od.cleanString(str);
  return String(str || '')
    .toLowerCase()
    .replace(/['"«»]/g, '')
    .replace(/жк\s+/gi, '')
    .trim();
}

/** C2b: OD-форма узла locations.object (проекция, без записи в project_objects). */
export function locationNodeToOdShape(n: LocationNode): OdObjectLite {
  const key = String(n.canonical_key || '').trim() || cleanObjectName(n.displayName || '');
  return {
    id: n.id,
    canonical_key: key,
    display_name: n.displayName || key,
    name: n.displayName || key,
    synonyms: Array.isArray(n.synonyms) ? n.synonyms.map((s) => String(s || '').trim()).filter(Boolean) : [],
    _deleted: false,
    is_deleted: false,
    sync_status: n.syncStatus || 'local',
    source: 'locations',
    updated_at: n.updated_at,
    created_by: n.created_by
  };
}

export function listObjectsAsOdShape(api: ObjectBridgeApi): OdObjectLite[] {
  return listLocationObjects(api).map(locationNodeToOdShape);
}

/**
 * C2b: ensure locations.object с canonical_key (+ synonyms).
 * Не пишет project_objects.
 */
export async function ensureObjectNode(
  api: ObjectBridgeApi,
  opts: { canonical_key: string; displayName: string; synonyms?: string[] }
): Promise<LocationNode> {
  const key = String(opts.canonical_key || '').trim();
  const displayName = String(opts.displayName || '').trim() || key;
  if (!key) throw new Error('canonical_key обязателен');

  let loc = findLocByKey(api, key) || findLocByDisplay(api, displayName);
  const syn = Array.isArray(opts.synonyms)
    ? opts.synonyms.map((s) => String(s || '').trim()).filter(Boolean)
    : [];

  if (!loc) {
    loc = await api.createNode({
      nodeType: 'object',
      displayName,
      parentId: null,
      canonical_key: key,
      synonyms: syn
    });
    return loc;
  }

  const patch: Partial<Pick<LocationNode, 'displayName' | 'canonical_key' | 'synonyms'>> = {};
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

function listOdActive(): OdObjectLite[] {
  const od = _od();
  const list = od && Array.isArray(od.objects) ? od.objects : [];
  return list.filter((o) => o && !o._deleted && !o.is_deleted);
}

/** Leftover IDB project_objects (C2b) — не SoT, только для banner/createLocationFromOd. */
function listOdLeftover(): OdObjectLite[] {
  const od = _od();
  const list = od && Array.isArray(od.leftoverObjects) ? od.leftoverObjects : [];
  return list.filter((o) => o && !o._deleted && !o.is_deleted);
}

function findOdByKey(key: string): OdObjectLite | null {
  if (!key) return null;
  const od = _od();
  if (od && typeof od.getObjectByKey === 'function') {
    const hit = od.getObjectByKey(key);
    if (hit && !hit._deleted && !hit.is_deleted) return hit;
  }
  const clean = cleanObjectName(key);
  const fromActive = listOdActive().find((o) => cleanObjectName(o.canonical_key || '') === clean);
  if (fromActive) return fromActive;
  return listOdLeftover().find((o) => cleanObjectName(o.canonical_key || '') === clean) || null;
}

function findOdByDisplay(name: string): OdObjectLite | null {
  const clean = cleanObjectName(name);
  if (!clean) return null;
  return (
    listOdActive().find((o) => cleanObjectName(o.display_name || o.name || '') === clean) || null
  );
}

function listLocationObjects(api: ObjectBridgeApi): LocationNode[] {
  return api.listNodes({ nodeType: 'object', parentId: null }) || [];
}

function findLocByKey(api: ObjectBridgeApi, key: string): LocationNode | null {
  if (!key) return null;
  const clean = cleanObjectName(key);
  return (
    listLocationObjects(api).find(
      (n) => cleanObjectName(n.canonical_key || '') === clean && !!n.canonical_key
    ) || null
  );
}

function findLocByDisplay(api: ObjectBridgeApi, name: string): LocationNode | null {
  const clean = cleanObjectName(name);
  if (!clean) return null;
  return listLocationObjects(api).find((n) => cleanObjectName(n.displayName || '') === clean) || null;
}

/**
 * Резолвер: 1) exact canonical_key; 2) clean display_name ↔ displayName; 3) null.
 */
export function resolveObjectLink(
  api: ObjectBridgeApi,
  input: { canonical_key?: string; displayName?: string; locationObjectId?: string } = {}
): ObjectLinkResult {
  let loc: LocationNode | null = null;
  let od: OdObjectLite | null = null;

  if (input.locationObjectId) {
    const n = api.getNode(input.locationObjectId);
    if (n && n.nodeType === 'object') loc = n;
  }

  const key = String(input.canonical_key || (loc && loc.canonical_key) || '').trim();
  const name = String(input.displayName || (loc && loc.displayName) || '').trim();

  if (key) {
    od = findOdByKey(key);
    if (!loc) loc = findLocByKey(api, key);
  }

  if (!od && name) od = findOdByDisplay(name);
  if (!loc && name) loc = findLocByDisplay(api, name);

  // Если нашли OD по имени, а loc ещё нет — попробуем key OD
  if (od && !loc && od.canonical_key) {
    loc = findLocByKey(api, od.canonical_key) || findLocByDisplay(api, od.display_name || od.name || '');
  }
  // Если loc есть с key — подтянуть OD по key
  if (loc && !od && loc.canonical_key) {
    od = findOdByKey(loc.canonical_key);
  }

  const linked = !!(
    od &&
    loc &&
    loc.canonical_key &&
    cleanObjectName(loc.canonical_key) === cleanObjectName(od.canonical_key || '')
  );

  return { od: od || null, locationObject: loc || null, linked };
}

export function listUnlinkedObjects(api: ObjectBridgeApi): {
  locationOnly: LocationNode[];
  odOnly: OdObjectLite[];
} {
  const locationOnly = listLocationObjects(api).filter((n) => {
    // C2b: «location only» = object без canonical_key (ещё не готов для quality)
    return !String(n.canonical_key || '').trim();
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

/** Проставить canonical_key на locations.object с выбранного OD (или matched). */
export async function linkLocationToOd(
  api: ObjectBridgeApi,
  locationObjectId: string,
  odCanonicalKey?: string
): Promise<ObjectLinkResult> {
  const loc = api.getNode(locationObjectId);
  if (!loc || loc.nodeType !== 'object') throw new Error('Нужен узел object');

  let key = String(odCanonicalKey || '').trim();
  if (!key) {
    const matched = resolveObjectLink(api, {
      locationObjectId,
      displayName: loc.displayName,
      canonical_key: loc.canonical_key
    });
    if (!matched.od || !matched.od.canonical_key) {
      throw new Error('Нет ObjectDirectory-peer для привязки');
    }
    key = matched.od.canonical_key;
  } else if (!findOdByKey(key)) {
    throw new Error('ObjectDirectory с таким canonical_key не найден');
  }

  await api.updateNode(locationObjectId, { canonical_key: key });
  return resolveObjectLink(api, { locationObjectId, canonical_key: key });
}

/**
 * C2b: «создать OD» = ensure canonical_key + rebuild facade-проекции.
 * Не пишет project_objects (OD — compatibility-facade над locations).
 */
export async function createOdFromLocation(
  api: ObjectBridgeApi,
  locationObjectId: string
): Promise<ObjectLinkResult> {
  const loc0 = api.getNode(locationObjectId);
  if (!loc0 || loc0.nodeType !== 'object') throw new Error('Нужен узел object');

  const displayName = String(loc0.displayName || '').trim();
  if (!displayName) throw new Error('displayName пуст');

  let key = String(loc0.canonical_key || '').trim() || cleanObjectName(displayName);
  if (!loc0.canonical_key || cleanObjectName(loc0.canonical_key) !== cleanObjectName(key)) {
    await api.updateNode(locationObjectId, { canonical_key: key });
  }

  const od = _od();
  if (od && typeof od.rebuildFromLocations === 'function') {
    await od.rebuildFromLocations();
  } else if (od && typeof od.createFromLocation === 'function') {
    // fallback: facade createFromLocation (no dirty OD write после C2b)
    await od.createFromLocation({ displayName, canonical_key: key });
  }

  return {
    od: locationNodeToOdShape(api.getNode(locationObjectId) || loc0),
    locationObject: api.getNode(locationObjectId) || loc0,
    linked: true
  };
}

/** Создать locations.object из OD (admin). */
export async function createLocationFromOd(
  api: ObjectBridgeApi,
  odCanonicalKey: string
): Promise<ObjectLinkResult> {
  const odObj = findOdByKey(odCanonicalKey);
  if (!odObj) throw new Error('ObjectDirectory не найден');

  const existing = resolveObjectLink(api, {
    canonical_key: odObj.canonical_key,
    displayName: odObj.display_name || odObj.name
  });
  if (existing.locationObject) {
    if (
      !existing.locationObject.canonical_key ||
      cleanObjectName(existing.locationObject.canonical_key) !==
        cleanObjectName(odObj.canonical_key || '')
    ) {
      await api.updateNode(existing.locationObject.id, {
        canonical_key: odObj.canonical_key || ''
      });
    }
    return resolveObjectLink(api, {
      locationObjectId: existing.locationObject.id,
      canonical_key: odObj.canonical_key
    });
  }

  const name = String(odObj.display_name || odObj.name || odObj.canonical_key || '').trim();
  if (!name) throw new Error('У OD нет display_name');
  const node = await api.createNode({
    nodeType: 'object',
    displayName: name,
    parentId: null,
    canonical_key: odObj.canonical_key || cleanObjectName(name)
  });
  return resolveObjectLink(api, {
    locationObjectId: node.id,
    canonical_key: node.canonical_key
  });
}

/** Универсальный ensure: link и/или create peer. */
export async function ensureCanonicalLink(
  api: ObjectBridgeApi,
  opts: {
    locationObjectId?: string;
    odCanonicalKey?: string;
    createMissing?: 'od' | 'location' | null;
  }
): Promise<ObjectLinkResult> {
  const createMissing = opts.createMissing || null;

  if (opts.locationObjectId && createMissing === 'od') {
    return createOdFromLocation(api, opts.locationObjectId);
  }
  if (opts.odCanonicalKey && createMissing === 'location') {
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
  throw new Error('Нужен locationObjectId или odCanonicalKey');
}

export function attachObjectBridge(api: ObjectBridgeApi) {
  return {
    resolveObjectLink: (input?: {
      canonical_key?: string;
      displayName?: string;
      locationObjectId?: string;
    }) => resolveObjectLink(api, input || {}),
    listUnlinkedObjects: () => listUnlinkedObjects(api),
    listObjectsAsOdShape: () => listObjectsAsOdShape(api),
    ensureObjectNode: (opts: { canonical_key: string; displayName: string; synonyms?: string[] }) =>
      ensureObjectNode(api, opts),
    ensureCanonicalLink: (opts: {
      locationObjectId?: string;
      odCanonicalKey?: string;
      createMissing?: 'od' | 'location' | null;
    }) => ensureCanonicalLink(api, opts),
    linkLocationToOd: (locationObjectId: string, odCanonicalKey?: string) =>
      linkLocationToOd(api, locationObjectId, odCanonicalKey),
    createOdFromLocation: (locationObjectId: string) => createOdFromLocation(api, locationObjectId),
    createLocationFromOd: (odCanonicalKey: string) => createLocationFromOd(api, odCanonicalKey),
    locationNodeToOdShape,
    cleanObjectName
  };
}
