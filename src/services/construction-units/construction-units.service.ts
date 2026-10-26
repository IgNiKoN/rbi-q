/**
 * service.constructionUnits — помещения / шахматка construction-v2.
 * Не использует TransferManager / legacy construction_units.
 */

import type { ConstructionUnitV2, UnitStatusV2 } from './types';
import { UNIT_STATUS_ALIASES, UNIT_STATUSES_V2 } from './types';

function _normalizeStatus(value: unknown, fallback: UnitStatusV2 = 'not_inspected'): UnitStatusV2 {
  const s = String(value || '')
    .trim()
    .toLowerCase();
  if (!s) return fallback;
  if ((UNIT_STATUSES_V2 as string[]).includes(s)) return s as UnitStatusV2;
  if (UNIT_STATUS_ALIASES[s]) return UNIT_STATUS_ALIASES[s];
  return fallback;
}

function _pdfField(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function normalizeConstructionUnitV2(
  raw: ConstructionUnitV2 | Record<string, unknown>
): ConstructionUnitV2 {
  const d = (raw || {}) as ConstructionUnitV2 & { location_id?: string };
  const sortRaw = d.sort_order;
  const sort_order = sortRaw == null || sortRaw === ('' as unknown) ? 0 : Number(sortRaw);
  return {
    ...d,
    locationId: String(d.locationId || d.location_id || ''),
    name: String(d.name || '').trim(),
    type: d.type != null ? String(d.type).trim() || 'КВ' : 'КВ',
    sort_order: Number.isFinite(sort_order) ? sort_order : 0,
    status: _normalizeStatus(d.status),
    pdf_url: _pdfField(d.pdf_url),
    pdf_name: _pdfField(d.pdf_name),
    pdf_size: _pdfField(d.pdf_size),
    is_deleted: d.is_deleted === true || d._deleted === true,
    _deleted: d.is_deleted === true || d._deleted === true
  };
}

let _items: ConstructionUnitV2[] = [];
let _ready = false;

function _storage() {
  return window.RBI?.services?.storage || null;
}

function _stores() {
  const s = _storage();
  const fromSvc = s?.stores?.();
  if (fromSvc && fromSvc.CONST_UNITS_V2) return fromSvc;
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
  return `cunit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function _active() {
  return _items.filter((d) => d && !d.is_deleted && !d._deleted);
}

function _emit(extra?: Record<string, unknown>) {
  _events()?.emit?.('construction-units:changed', extra || {});
}

function _markDirty() {
  const sync = window.RBI?.services?.sync as { markDirty?: (k: string | string[]) => void } | undefined;
  if (sync?.markDirty) {
    sync.markDirty(['constructionUnits']);
  }
  if (typeof window.triggerSync === 'function') {
    window.triggerSync('silent');
  }
}

async function _persist(item: ConstructionUnitV2) {
  const storage = _storage();
  const stores = _stores();
  if (!storage || !stores.CONST_UNITS_V2) {
    throw new Error('storage CONST_UNITS_V2 недоступен');
  }
  await storage.put(stores.CONST_UNITS_V2, item);
  const idx = _items.findIndex((d) => d.id === item.id);
  if (idx >= 0) _items[idx] = item;
  else _items.push(item);
}

type LocNode = {
  id: string;
  nodeType?: string;
  parentId?: string | null;
  sort_order?: number;
  displayName?: string;
};

type LocSvc = {
  getChildren?: (parentId: string | null) => LocNode[];
  listNodes?: (opts?: { nodeType?: string; parentId?: string | null }) => LocNode[];
  getPath?: (id: string) => LocNode[];
  getNode?: (id: string) => LocNode | null;
  createNode?: (input: {
    nodeType: string;
    displayName: string;
    parentId?: string | null;
    sort_order?: number;
  }) => Promise<LocNode>;
  softDeleteNode?: (id: string, opts?: { skipLinkedUnit?: boolean }) => Promise<unknown>;
};

function _locations(): LocSvc | undefined {
  return window.RBI?.services?.locations as LocSvc | undefined;
}

/** Ids квартир (apartment) под этажом. */
function _apartmentIdsForFloor(floorId: string): Set<string> {
  const loc = _locations();
  const ids = new Set<string>();
  if (!loc?.listNodes || !floorId) return ids;
  for (const a of loc.listNodes({ nodeType: 'apartment', parentId: floorId }) || []) {
    if (a?.id) ids.add(a.id);
  }
  return ids;
}

/** Этаж для unit: apartment.parentId или legacy locationId=floor. */
export function resolveFloorIdForUnit(unit: ConstructionUnitV2): string | null {
  const loc = _locations();
  const lid = String(unit?.locationId || '').trim();
  if (!lid) return null;
  const node = loc?.getNode?.(lid);
  if (!node) {
    // Legacy: node мог быть floor, уже удалён/не в кэше — считаем сам locationId этажом.
    return lid;
  }
  if (node.nodeType === 'apartment') return node.parentId || null;
  if (node.nodeType === 'floor') return node.id;
  return null;
}

/** Этажи корпуса: building → sections → floors (flatten). */
export function resolveFloorsForBuilding(buildingId: string): LocNode[] {
  const loc = _locations();
  if (!loc || !buildingId) return [];
  const sections = (typeof loc.getChildren === 'function' ? loc.getChildren(buildingId) : []) || [];
  const floors: LocNode[] = [];
  for (const sec of sections) {
    if (!sec?.id) continue;
    const kids = (typeof loc.getChildren === 'function' ? loc.getChildren(sec.id) : []) || [];
    for (const fl of kids) {
      if (!fl?.id) continue;
      if (fl.nodeType && fl.nodeType !== 'floor') continue;
      floors.push(fl);
    }
  }
  // Верхние этажи сверху — как legacy (b.sort_order - a)
  floors.sort((a, b) => Number(b.sort_order || 0) - Number(a.sort_order || 0));
  return floors;
}

export type UnitCreateInput = {
  locationId: string;
  name: string;
  type?: string | null;
  sort_order?: number;
  status?: string;
  pdf_url?: string | null;
  pdf_name?: string | null;
  pdf_size?: string | null;
};

export type UnitUpdatePatch = Partial<{
  locationId: string;
  name: string;
  type: string | null;
  sort_order: number;
  status: string;
  pdf_url: string | null;
  pdf_name: string | null;
  pdf_size: string | null;
}>;

export const ConstructionUnitsService = {
  async init(): Promise<boolean> {
    const storage = _storage();
    const stores = _stores();
    if (!storage || !stores.CONST_UNITS_V2) {
      console.warn('[constructionUnits] storage not ready');
      return false;
    }
    try {
      const rows = (await storage.getAll(stores.CONST_UNITS_V2)) as ConstructionUnitV2[];
      _items = (Array.isArray(rows) ? rows : []).map((r) => normalizeConstructionUnitV2(r));
      _ready = true;
      return true;
    } catch (e) {
      console.warn('[constructionUnits] init failed', e);
      return false;
    }
  },

  isReady(): boolean {
    return _ready;
  },

  replaceCache(items: ConstructionUnitV2[]) {
    _items = (Array.isArray(items) ? items : []).map((r) => normalizeConstructionUnitV2(r));
    _ready = true;
    _emit({ reason: 'replaceCache' });
  },

  list(opts?: { locationId?: string; status?: string; includeDeleted?: boolean }): ConstructionUnitV2[] {
    let list = opts?.includeDeleted ? _items.slice() : _active();
    if (opts?.locationId) {
      list = list.filter((d) => d.locationId === opts.locationId);
    }
    if (opts?.status) {
      const st = _normalizeStatus(opts.status);
      list = list.filter((d) => _normalizeStatus(d.status) === st);
    }
    return list.slice().sort((a, b) => {
      const so = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (so !== 0) return so;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ru', { numeric: true });
    });
  },

  get(id: string): ConstructionUnitV2 | null {
    return _active().find((d) => d.id === id) || null;
  },

  /**
   * Помещения этажа: canonical (locationId = apartment под floor)
   * + legacy (locationId = floor.id).
   */
  listForFloor(floorId: string): ConstructionUnitV2[] {
    const fid = String(floorId || '').trim();
    if (!fid) return [];
    const aptIds = _apartmentIdsForFloor(fid);
    return _active()
      .filter((u) => u.locationId === fid || aptIds.has(u.locationId))
      .slice()
      .sort((a, b) => {
        const so = Number(a.sort_order || 0) - Number(b.sort_order || 0);
        if (so !== 0) return so;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ru', { numeric: true });
      });
  },

  listForBuilding(buildingId: string): ConstructionUnitV2[] {
    const floors = resolveFloorsForBuilding(buildingId);
    const floorIds = new Set(floors.map((f) => f.id));
    const aptIds = new Set<string>();
    for (const fid of floorIds) {
      for (const id of _apartmentIdsForFloor(fid)) aptIds.add(id);
    }
    return _active()
      .filter((u) => floorIds.has(u.locationId) || aptIds.has(u.locationId))
      .slice()
      .sort((a, b) => {
        const so = Number(a.sort_order || 0) - Number(b.sort_order || 0);
        if (so !== 0) return so;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ru', { numeric: true });
      });
  },

  async create(input: UnitCreateInput): Promise<ConstructionUnitV2> {
    const locationId = String(input.locationId || '').trim();
    if (!locationId) throw new Error('locationId обязателен');
    const name = String(input.name || '').trim();
    if (!name) throw new Error('name обязателен');

    const status = _normalizeStatus(input.status, 'not_inspected');
    const sort_order =
      input.sort_order != null && Number.isFinite(Number(input.sort_order))
        ? Number(input.sort_order)
        : 0;
    const item: ConstructionUnitV2 = {
      id: _uuid(),
      companyId: 'rbi',
      locationId,
      name,
      type: input.type != null ? String(input.type).trim() || 'КВ' : 'КВ',
      sort_order,
      status,
      pdf_url: _pdfField(input.pdf_url),
      pdf_name: _pdfField(input.pdf_name),
      pdf_size: _pdfField(input.pdf_size),
      created_by:
        (window as unknown as { syncConfig?: { engineerName?: string } }).syncConfig?.engineerName || '',
      is_deleted: false,
      deleted_at: null,
      created_at: _now(),
      updated_at: _now(),
      version: 1,
      syncStatus: 'not_synced',
      source: 'local'
    };
    await _persist(item);
    _markDirty();
    _emit({ reason: 'create', id: item.id, locationId });
    return item;
  },

  async update(id: string, patch: UnitUpdatePatch): Promise<ConstructionUnitV2> {
    const cur = _items.find((d) => d.id === id);
    if (!cur || cur.is_deleted || cur._deleted) throw new Error('Помещение не найдено');

    let status = cur.status;
    if (patch.status != null) {
      status = _normalizeStatus(patch.status, _normalizeStatus(cur.status));
    }

    const next: ConstructionUnitV2 = {
      ...cur,
      locationId:
        patch.locationId != null ? String(patch.locationId).trim() || cur.locationId : cur.locationId,
      name: patch.name != null ? String(patch.name).trim() || cur.name : cur.name,
      type:
        patch.type !== undefined
          ? patch.type != null
            ? String(patch.type).trim() || 'КВ'
            : 'КВ'
          : cur.type,
      sort_order:
        patch.sort_order != null && Number.isFinite(Number(patch.sort_order))
          ? Number(patch.sort_order)
          : cur.sort_order,
      status,
      pdf_url: patch.pdf_url !== undefined ? _pdfField(patch.pdf_url) : cur.pdf_url,
      pdf_name: patch.pdf_name !== undefined ? _pdfField(patch.pdf_name) : cur.pdf_name,
      pdf_size: patch.pdf_size !== undefined ? _pdfField(patch.pdf_size) : cur.pdf_size,
      updated_at: _now(),
      version: (cur.version || 1) + 1,
      syncStatus: 'not_synced',
      source: 'local'
    };
    await _persist(next);
    _markDirty();
    _emit({ reason: 'update', id, locationId: next.locationId });
    return next;
  },

  async changeStatus(id: string, newStatus: UnitStatusV2 | string): Promise<ConstructionUnitV2> {
    return this.update(id, { status: _normalizeStatus(newStatus) });
  },

  /**
   * Загрузка PDF плана квартиры в Supabase Storage (bucket custom-assets) + update полей.
   * Повторный upload перезаписывает поля (старый объект в Storage не удаляется — YAGNI).
   */
  async uploadUnitPdf(unitId: string, file: File): Promise<ConstructionUnitV2> {
    const cur = this.get(unitId);
    if (!cur) throw new Error('Помещение не найдено');
    const client = window.supabaseClient;
    if (!client?.storage) {
      throw new Error('supabaseClient недоступен (нужен онлайн для первой загрузки)');
    }

    const safeName = `plan_${Date.now()}.pdf`;
    let path = `unit_plans/${unitId}/${safeName}`;
    const sanitize = (window as unknown as { sanitizeStoragePath?: (p: string) => string })
      .sanitizeStoragePath;
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

    return this.update(unitId, {
      pdf_url: publicUrl,
      pdf_name: file.name || safeName,
      pdf_size: String(file.size || '')
    });
  },

  /** Снять активный план квартиры (поля pdf_* → null). */
  async clearUnitPlan(unitId: string): Promise<ConstructionUnitV2> {
    return this.update(unitId, {
      pdf_url: null,
      pdf_name: null,
      pdf_size: null
    });
  },

  async softDelete(id: string, opts?: { skipApartment?: boolean }): Promise<ConstructionUnitV2> {
    const cur = _items.find((d) => d.id === id);
    if (!cur) throw new Error('Помещение не найдено');
    if (cur.is_deleted || cur._deleted) return cur;
    const next: ConstructionUnitV2 = {
      ...cur,
      is_deleted: true,
      _deleted: true,
      deleted_at: _now(),
      updated_at: _now(),
      version: (cur.version || 1) + 1,
      syncStatus: 'not_synced',
      source: 'local'
    };
    await _persist(next);
    _markDirty();
    _emit({ reason: 'softDelete', id, locationId: next.locationId });

    if (!opts?.skipApartment) {
      const loc = _locations();
      const node = loc?.getNode?.(cur.locationId);
      if (node?.nodeType === 'apartment' && loc?.softDeleteNode) {
        await loc.softDeleteNode(cur.locationId, { skipLinkedUnit: true });
      }
    }
    return next;
  },

  /**
   * Если unit ещё привязан к floor (legacy) — создать apartment и перепривязать.
   * Если уже apartment — no-op. Возвращает актуальный unit.
   */
  async ensureApartmentForUnit(unitId: string): Promise<ConstructionUnitV2> {
    const cur = this.get(unitId);
    if (!cur) throw new Error('Помещение не найдено');
    const loc = _locations();
    if (!loc?.getNode || !loc?.createNode) return cur;
    const node = loc.getNode(cur.locationId);
    if (node?.nodeType === 'apartment') return cur;
    const floorId =
      node?.nodeType === 'floor' ? node.id : node ? null : cur.locationId;
    if (!floorId) return cur;
    const floor = loc.getNode(floorId);
    if (!floor || floor.nodeType !== 'floor') return cur;

    const apt = await loc.createNode({
      nodeType: 'apartment',
      displayName: cur.name || 'КВ',
      parentId: floorId,
      sort_order: cur.sort_order != null ? Number(cur.sort_order) : undefined
    });
    return this.update(cur.id, { locationId: apt.id });
  },

  /**
   * Ленивая миграция: все legacy units корпуса (locationId=floor) → apartment nodes.
   * @returns число перепривязанных units
   */
  async migrateUnitsToApartmentNodes(buildingId: string): Promise<number> {
    const bid = String(buildingId || '').trim();
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
    if (migrated) _emit({ reason: 'migrateToApartment', buildingId: bid, count: migrated });
    return migrated;
  },

  /**
   * Сгенерировать N помещений на каждый этаж корпуса (все status=not_inspected).
   * На каждый unit создаётся узел apartment (parent=floor); locationId = apartment.id.
   */
  async generateGrid(buildingId: string, perFloor = 8): Promise<ConstructionUnitV2[]> {
    const bid = String(buildingId || '').trim();
    if (!bid) throw new Error('buildingId обязателен');
    const n = Math.max(1, Math.min(50, Number(perFloor) || 8));
    const floors = resolveFloorsForBuilding(bid);
    if (!floors.length) throw new Error('В корпусе нет этажей');
    const loc = _locations();
    if (!loc?.createNode) throw new Error('service.locations недоступен');

    // Сначала подтянуть legacy units этого корпуса в apartment-модель.
    await this.migrateUnitsToApartmentNodes(bid);

    // Нумерация снизу вверх (как legacy generateDemoGrid по возрастанию sort_order этажей)
    const floorsAsc = floors.slice().sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const created: ConstructionUnitV2[] = [];
    let count = 1;
    for (const fl of floorsAsc) {
      for (let i = 1; i <= n; i++) {
        const apt = await loc.createNode!({
          nodeType: 'apartment',
          displayName: String(count),
          parentId: fl.id,
          sort_order: i
        });
        const item = await this.create({
          locationId: apt.id,
          name: String(count),
          type: 'КВ',
          sort_order: i,
          status: 'not_inspected'
        });
        created.push(item);
        count += 1;
      }
    }
    _emit({ reason: 'generateGrid', buildingId: bid, count: created.length });
    return created;
  }
};

export type ConstructionUnitsServiceApi = typeof ConstructionUnitsService;
