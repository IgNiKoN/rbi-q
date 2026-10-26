/**
 * service.constructionDefects — замечания construction-v2 на координатах плана.
 * Не использует ConstManager / legacy construction_defects.
 */

import type {
  ConstructionDefectV2,
  DefectCategoryV2,
  DefectHistoryEntryV2,
  DefectStatusV2
} from './types';
import { DEFECT_STATUSES_V2 } from './types';

/** YYYY-MM-DD / ISO → date-string YYYY-MM-DD, иначе null. */
function _normalizeDeadline(value: unknown): string | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function _normalizeCategory(value: unknown, fallback: DefectCategoryV2 = 'B2'): DefectCategoryV2 {
  const raw = String(value || '').trim();
  const c = raw.toUpperCase();
  if (c === 'B1' || c === 'B2' || c === 'B3') return c;
  const low = raw.toLowerCase();
  if (low === 'critical') return 'B3';
  if (low === 'major') return 'B2';
  if (low === 'minor') return 'B1';
  return fallback;
}

function _normalizeStatus(value: unknown, fallback: DefectStatusV2 = 'issued'): DefectStatusV2 {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'open') return 'issued';
  if (s === 'cancelled') return 'rejected';
  if ((DEFECT_STATUSES_V2 as string[]).includes(s)) return s as DefectStatusV2;
  return fallback;
}

/** cloud `photo` text → photos[]; принимает массив, JSON-строку или одиночный URL. */
function _normalizePhotos(raw: unknown, legacyPhoto?: unknown): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== 'string') return;
    const t = v.trim();
    if (t) out.push(t);
  };
  if (Array.isArray(raw)) {
    raw.forEach(push);
  } else if (typeof raw === 'string' && raw.trim()) {
    const s = raw.trim();
    if (s.startsWith('[')) {
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

function _normalizeHistory(raw: unknown): DefectHistoryEntryV2[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((h) => {
    const entry = (h && typeof h === 'object' ? h : {}) as DefectHistoryEntryV2;
    const photos = _normalizePhotos(entry.photos, entry.photo);
    return {
      status: entry.status || '',
      date: entry.date || '',
      user: entry.user || '',
      comment: entry.comment ?? null,
      photo: photos[0] || entry.photo || null,
      photos: photos.length ? photos : undefined
    };
  });
}

/** Нормализация записи при чтении (статусы/категории/фото). */
export function normalizeConstructionDefectV2(raw: ConstructionDefectV2 | Record<string, unknown>): ConstructionDefectV2 {
  const d = (raw || {}) as ConstructionDefectV2;
  const photos = _normalizePhotos(d.photos, d.photo);
  return {
    ...d,
    category: _normalizeCategory(d.category),
    status: _normalizeStatus(d.status),
    photos,
    photo: photos[0] || d.photo || null,
    history: _normalizeHistory(d.history),
    deadline: _normalizeDeadline(d.deadline) ?? (d.deadline as string | null) ?? null
  };
}

let _items: ConstructionDefectV2[] = [];
let _ready = false;

function _storage() {
  return window.RBI?.services?.storage || null;
}

function _stores() {
  const s = _storage();
  const fromSvc = s?.stores?.();
  if (fromSvc && fromSvc.CONST_DEFECTS_V2) return fromSvc;
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
  return `cdef_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function _active() {
  return _items.filter((d) => d && !d.is_deleted && !d._deleted);
}

function _emit(extra?: Record<string, unknown>) {
  _events()?.emit?.('construction-defects:changed', extra || {});
}

function _markDirty() {
  const sync = window.RBI?.services?.sync as { markDirty?: (k: string | string[]) => void } | undefined;
  if (sync?.markDirty) {
    sync.markDirty(['constructionDefects']);
  }
  if (typeof window.triggerSync === 'function') {
    window.triggerSync('silent');
  }
}

function _clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

async function _persist(item: ConstructionDefectV2) {
  const storage = _storage();
  const stores = _stores();
  if (!storage || !stores.CONST_DEFECTS_V2) {
    throw new Error('storage CONST_DEFECTS_V2 недоступен');
  }
  await storage.put(stores.CONST_DEFECTS_V2, item);
  const idx = _items.findIndex((d) => d.id === item.id);
  if (idx >= 0) _items[idx] = item;
  else _items.push(item);
}

export type DefectCreateInput = {
  locationId: string;
  x: number;
  y: number;
  description: string;
  category?: DefectCategoryV2 | string;
  contractorId?: string | null;
  status?: string;
  deadline?: string | null;
  template_key?: string | null;
  item_id?: string | null;
  item_name?: string | null;
  norm_text?: string | null;
  photos?: string[];
};

export type DefectUpdatePatch = Partial<{
  description: string;
  category: string;
  contractorId: string | null;
  status: string;
  deadline: string | null;
  x: number;
  y: number;
  template_key: string | null;
  item_id: string | null;
  item_name: string | null;
  norm_text: string | null;
  photos: string[];
}>;

export type ChangeStatusOpts = {
  comment?: string | null;
  photos?: string[] | null;
  photo?: string | null;
};

export const ConstructionDefectsService = {
  async init(): Promise<boolean> {
    const storage = _storage();
    const stores = _stores();
    if (!storage || !stores.CONST_DEFECTS_V2) {
      console.warn('[constructionDefects] storage not ready');
      return false;
    }
    try {
      const rows = (await storage.getAll(stores.CONST_DEFECTS_V2)) as ConstructionDefectV2[];
      _items = (Array.isArray(rows) ? rows : []).map((r) => normalizeConstructionDefectV2(r));
      _ready = true;
      return true;
    } catch (e) {
      console.error('[constructionDefects] init failed', e);
      return false;
    }
  },

  isReady(): boolean {
    return _ready;
  },

  /** Подмена in-memory после pull sync. */
  replaceCache(items: ConstructionDefectV2[]) {
    _items = (Array.isArray(items) ? items : []).map((r) => normalizeConstructionDefectV2(r));
    _ready = true;
    _emit({ reason: 'replaceCache' });
  },

  list(opts?: { locationId?: string; includeDeleted?: boolean }): ConstructionDefectV2[] {
    let list = opts?.includeDeleted ? _items.slice() : _active();
    if (opts?.locationId) {
      list = list.filter((d) => d.locationId === opts.locationId);
    }
    return list.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  },

  get(id: string): ConstructionDefectV2 | null {
    return _active().find((d) => d.id === id) || null;
  },

  /** Активные дефекты этажа (locationId = floor). */
  listForFloor(locationId: string): ConstructionDefectV2[] {
    return this.list({ locationId });
  },

  /** Активные дефекты локации (floor или apartment). Alias к list({locationId}). */
  listForLocation(locationId: string): ConstructionDefectV2[] {
    return this.list({ locationId });
  },

  async create(input: DefectCreateInput): Promise<ConstructionDefectV2> {
    // locationId: floor (этажный pin) или apartment (квартирный pin) — без assert типа узла
    const locationId = String(input.locationId || '').trim();
    if (!locationId) throw new Error('locationId обязателен');
    const itemName = input.item_name != null ? String(input.item_name).trim() : '';
    const description = String(input.description || '').trim() || itemName;
    if (!description) throw new Error('description обязателен');

    const category = _normalizeCategory(input.category, 'B2');
    const photos = _normalizePhotos(input.photos, null);
    const status = _normalizeStatus(input.status, 'issued');

    const item: ConstructionDefectV2 = {
      id: _uuid(),
      companyId: 'rbi',
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
      created_by: window.syncConfig?.engineerName || '',
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

  async update(id: string, patch: DefectUpdatePatch): Promise<ConstructionDefectV2> {
    const cur = _items.find((d) => d.id === id);
    if (!cur || cur.is_deleted || cur._deleted) throw new Error('Замечание не найдено');

    const category =
      patch.category != null ? _normalizeCategory(patch.category, _normalizeCategory(cur.category)) : cur.category;

    const description =
      patch.description != null ? String(patch.description).trim() || cur.description : cur.description;

    let status = cur.status;
    if (patch.status != null) {
      status = _normalizeStatus(patch.status, _normalizeStatus(cur.status));
    }

    const photos = patch.photos !== undefined ? _normalizePhotos(patch.photos, null) : cur.photos || [];

    const next: ConstructionDefectV2 = {
      ...cur,
      description,
      text: description,
      category,
      contractorId: patch.contractorId !== undefined ? patch.contractorId : cur.contractorId,
      status,
      deadline: patch.deadline !== undefined ? _normalizeDeadline(patch.deadline) : cur.deadline ?? null,
      x: patch.x != null ? _clampPct(Number(patch.x)) : cur.x,
      y: patch.y != null ? _clampPct(Number(patch.y)) : cur.y,
      template_key: patch.template_key !== undefined ? patch.template_key : cur.template_key,
      item_id: patch.item_id !== undefined ? patch.item_id : cur.item_id,
      item_name: patch.item_name !== undefined ? patch.item_name : cur.item_name,
      norm_text: patch.norm_text !== undefined ? patch.norm_text : cur.norm_text,
      photos,
      photo: photos[0] || null,
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

  /**
   * Смена статуса с записью в history (как ConstDefectForm.applyStatusChange).
   * photos — фото устранения (несколько); дублируются в entry.photo (первое) и entry.photos.
   */
  async changeStatus(
    id: string,
    newStatus: DefectStatusV2 | string,
    opts?: ChangeStatusOpts
  ): Promise<ConstructionDefectV2> {
    const cur = _items.find((d) => d.id === id);
    if (!cur || cur.is_deleted || cur._deleted) throw new Error('Замечание не найдено');

    const status = _normalizeStatus(newStatus, _normalizeStatus(cur.status));
    const fixPhotos = _normalizePhotos(opts?.photos, opts?.photo);
    const history = _normalizeHistory(cur.history);
    const entry: DefectHistoryEntryV2 = {
      status,
      date: _now(),
      user: window.syncConfig?.engineerName || 'Пользователь',
      comment: opts?.comment != null ? String(opts.comment) : null,
      photo: fixPhotos[0] || null,
      photos: fixPhotos.length ? fixPhotos : undefined
    };
    history.push(entry);

    const next: ConstructionDefectV2 = {
      ...cur,
      status,
      history,
      updated_at: _now(),
      version: (cur.version || 1) + 1,
      syncStatus: 'not_synced',
      source: 'local'
    };
    await _persist(next);
    _markDirty();
    _emit({ reason: 'changeStatus', id, locationId: next.locationId, status });
    return next;
  },

  async softDelete(id: string): Promise<ConstructionDefectV2> {
    const cur = _items.find((d) => d.id === id);
    if (!cur) throw new Error('Замечание не найдено');
    const next: ConstructionDefectV2 = {
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
    return next;
  }
};

export type ConstructionDefectsServiceApi = typeof ConstructionDefectsService;
