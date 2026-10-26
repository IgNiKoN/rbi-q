/**
 * service.constructionAcceptance — заявки на приёмку construction-v2.
 * Не использует ConstAcceptance / legacy construction_acceptance.
 */

import type {
  AcceptanceStatusV2,
  AcceptanceZoneV2,
  ChecklistItemStatusV2,
  ChecklistResultItemV2,
  ChecklistResultsV2,
  ConstructionAcceptanceV2
} from './types';
import { ACCEPTANCE_STATUSES_V2 } from './types';

const CHECKLIST_ITEM_STATUSES: ChecklistItemStatusV2[] = ['ok', 'fail', 'na', 'fail_escalated'];

function _normalizeItemPhotos(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  const arr = Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? [raw] : [];
  const photos = arr.map((p) => String(p || '').trim()).filter(Boolean);
  return photos.length ? photos : undefined;
}

function _normalizeItemComment(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  return s || undefined;
}

function _normalizeStatus(value: unknown, fallback: AcceptanceStatusV2 = 'pending'): AcceptanceStatusV2 {
  const s = String(value || '').trim().toLowerCase();
  if ((ACCEPTANCE_STATUSES_V2 as string[]).includes(s)) return s as AcceptanceStatusV2;
  return fallback;
}

function _clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function _normalizeZone(raw: unknown): AcceptanceZoneV2 | null {
  if (!raw || typeof raw !== 'object') return null;
  const z = raw as Record<string, unknown>;
  const x = _clampPct(Number(z.x));
  const y = _clampPct(Number(z.y));
  const w = Math.max(0.1, _clampPct(Number(z.w)));
  const h = Math.max(0.1, _clampPct(Number(z.h)));
  if (!Number.isFinite(Number(z.x)) || !Number.isFinite(Number(z.y))) return null;
  const room = z.room != null ? String(z.room).trim() || null : null;
  return { x, y, w, h, room };
}

/** YYYY-MM-DD / ISO → date-string YYYY-MM-DD, иначе null. */
function _normalizeDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function _normalizeItemStatus(value: unknown): ChecklistItemStatusV2 | null {
  const s = String(value || '').trim().toLowerCase();
  if ((CHECKLIST_ITEM_STATUSES as string[]).includes(s)) return s as ChecklistItemStatusV2;
  return null;
}

export function normalizeChecklistResults(raw: unknown): ChecklistResultsV2 | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const template_key = String(r.template_key || '').trim();
  if (!template_key) return null;
  const itemsRaw = Array.isArray(r.items) ? r.items : [];
  const items: ChecklistResultItemV2[] = [];
  for (const it of itemsRaw) {
    if (!it || typeof it !== 'object') continue;
    const row = it as Record<string, unknown>;
    const id = String(row.id ?? '').trim();
    const name = String(row.name || '').trim();
    const status = _normalizeItemStatus(row.status);
    if (!id || !name || !status) continue;
    const comment = _normalizeItemComment(row.comment);
    const photos = _normalizeItemPhotos(row.photos);
    const next: ChecklistResultItemV2 = {
      id,
      group: row.group != null ? String(row.group).trim() || null : null,
      name,
      status,
      updated_at: row.updated_at != null ? String(row.updated_at) : undefined
    };
    if (comment) next.comment = comment;
    if (photos) next.photos = photos;
    items.push(next);
  }
  return {
    template_key,
    updated_at: String(r.updated_at || new Date().toISOString()),
    items
  };
}

export function normalizeConstructionAcceptanceV2(
  raw: ConstructionAcceptanceV2 | Record<string, unknown>
): ConstructionAcceptanceV2 {
  const d = (raw || {}) as ConstructionAcceptanceV2 & {
    location_id?: string;
    contractor_id?: string;
  };
  return {
    ...d,
    locationId: String(d.locationId || d.location_id || ''),
    contractorId: d.contractorId || d.contractor_id || null,
    zone: _normalizeZone(d.zone),
    checklist_results: normalizeChecklistResults(d.checklist_results),
    status: _normalizeStatus(d.status),
    requested_date: _normalizeDate(d.requested_date) ?? d.requested_date ?? null,
    is_deleted: d.is_deleted === true || d._deleted === true,
    _deleted: d.is_deleted === true || d._deleted === true
  };
}

let _items: ConstructionAcceptanceV2[] = [];
let _ready = false;

function _storage() {
  return window.RBI?.services?.storage || null;
}

function _stores() {
  const s = _storage();
  const fromSvc = s?.stores?.();
  if (fromSvc && fromSvc.CONST_ACCEPTANCE_V2) return fromSvc;
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
  return `cacc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function _active() {
  return _items.filter((d) => d && !d.is_deleted && !d._deleted);
}

function _emit(extra?: Record<string, unknown>) {
  _events()?.emit?.('construction-acceptance:changed', extra || {});
}

function _markDirty() {
  const sync = window.RBI?.services?.sync as { markDirty?: (k: string | string[]) => void } | undefined;
  if (sync?.markDirty) {
    sync.markDirty(['constructionAcceptance']);
  }
  if (typeof window.triggerSync === 'function') {
    window.triggerSync('silent');
  }
}

async function _persist(item: ConstructionAcceptanceV2) {
  const storage = _storage();
  const stores = _stores();
  if (!storage || !stores.CONST_ACCEPTANCE_V2) {
    throw new Error('storage CONST_ACCEPTANCE_V2 недоступен');
  }
  await storage.put(stores.CONST_ACCEPTANCE_V2, item);
  const idx = _items.findIndex((d) => d.id === item.id);
  if (idx >= 0) _items[idx] = item;
  else _items.push(item);
}

export type AcceptanceCreateInput = {
  locationId: string;
  zone: AcceptanceZoneV2;
  template_key?: string | null;
  work_type?: string | null;
  volume?: string | null;
  requested_date?: string | null;
  requested_time?: string | null;
  contractorId?: string | null;
  status?: string;
  checklist_results?: ChecklistResultsV2 | null;
};

export type AcceptanceUpdatePatch = Partial<{
  locationId: string;
  zone: AcceptanceZoneV2 | null;
  template_key: string | null;
  work_type: string | null;
  volume: string | null;
  requested_date: string | null;
  requested_time: string | null;
  contractorId: string | null;
  status: string;
  checklist_results: ChecklistResultsV2 | null;
}>;

export const ConstructionAcceptanceService = {
  async init(): Promise<boolean> {
    const storage = _storage();
    const stores = _stores();
    if (!storage || !stores.CONST_ACCEPTANCE_V2) {
      console.warn('[constructionAcceptance] storage not ready');
      return false;
    }
    try {
      const rows = (await storage.getAll(stores.CONST_ACCEPTANCE_V2)) as ConstructionAcceptanceV2[];
      _items = (Array.isArray(rows) ? rows : []).map((r) => normalizeConstructionAcceptanceV2(r));
      _ready = true;
      return true;
    } catch (e) {
      // NotFoundError: обычно устаревшая схема до self-heal openAppDb — warn, не error-spam.
      console.warn('[constructionAcceptance] init failed', e);
      return false;
    }
  },

  isReady(): boolean {
    return _ready;
  },

  /** Подмена in-memory после pull sync. */
  replaceCache(items: ConstructionAcceptanceV2[]) {
    _items = (Array.isArray(items) ? items : []).map((r) => normalizeConstructionAcceptanceV2(r));
    _ready = true;
    _emit({ reason: 'replaceCache' });
  },

  list(opts?: { locationId?: string; status?: string; includeDeleted?: boolean }): ConstructionAcceptanceV2[] {
    let list = opts?.includeDeleted ? _items.slice() : _active();
    if (opts?.locationId) {
      list = list.filter((d) => d.locationId === opts.locationId);
    }
    if (opts?.status) {
      const st = _normalizeStatus(opts.status);
      list = list.filter((d) => _normalizeStatus(d.status) === st);
    }
    return list.slice().sort((a, b) =>
      String(a.requested_date || a.created_at || '').localeCompare(String(b.requested_date || b.created_at || ''))
    );
  },

  get(id: string): ConstructionAcceptanceV2 | null {
    return _active().find((d) => d.id === id) || null;
  },

  /** Активные заявки этажа (locationId = floor). */
  listForFloor(locationId: string): ConstructionAcceptanceV2[] {
    return this.list({ locationId });
  },

  /** Активные заявки локации (floor или apartment). Alias к list({locationId}). */
  listForLocation(locationId: string): ConstructionAcceptanceV2[] {
    return this.list({ locationId });
  },

  /**
   * Создание заявки. locationId = floor | apartment (тип узла не валидируется).
   * Для квартиры UI передаёт zone full-rect {x:0,y:0,w:100,h:100}.
   */
  async create(input: AcceptanceCreateInput): Promise<ConstructionAcceptanceV2> {
    const locationId = String(input.locationId || '').trim();
    if (!locationId) throw new Error('locationId обязателен');
    const zone = _normalizeZone(input.zone);
    if (!zone) throw new Error('zone обязательна');

    const status = _normalizeStatus(input.status, 'pending');
    const item: ConstructionAcceptanceV2 = {
      id: _uuid(),
      companyId: 'rbi',
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

  async update(id: string, patch: AcceptanceUpdatePatch): Promise<ConstructionAcceptanceV2> {
    const cur = _items.find((d) => d.id === id);
    if (!cur || cur.is_deleted || cur._deleted) throw new Error('Заявка не найдена');

    let status = cur.status;
    if (patch.status != null) {
      status = _normalizeStatus(patch.status, _normalizeStatus(cur.status));
    }

    const next: ConstructionAcceptanceV2 = {
      ...cur,
      locationId: patch.locationId != null ? String(patch.locationId).trim() || cur.locationId : cur.locationId,
      zone: patch.zone !== undefined ? _normalizeZone(patch.zone) : cur.zone,
      template_key: patch.template_key !== undefined ? patch.template_key : cur.template_key,
      work_type: patch.work_type !== undefined ? patch.work_type : cur.work_type,
      volume: patch.volume !== undefined ? patch.volume : cur.volume,
      requested_date:
        patch.requested_date !== undefined ? _normalizeDate(patch.requested_date) : cur.requested_date ?? null,
      requested_time: patch.requested_time !== undefined ? patch.requested_time : cur.requested_time,
      contractorId: patch.contractorId !== undefined ? patch.contractorId : cur.contractorId,
      checklist_results:
        patch.checklist_results !== undefined
          ? normalizeChecklistResults(patch.checklist_results)
          : cur.checklist_results ?? null,
      status,
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

  async changeStatus(id: string, newStatus: AcceptanceStatusV2 | string): Promise<ConstructionAcceptanceV2> {
    return this.update(id, { status: _normalizeStatus(newStatus) });
  },

  /**
   * Заменить целиком checklist_results (или сбросить в null).
   * template_key в results должен совпадать с заявкой (если у заявки ключ задан).
   */
  async setChecklistResults(
    id: string,
    results: ChecklistResultsV2 | null
  ): Promise<ConstructionAcceptanceV2> {
    const cur = _items.find((d) => d.id === id);
    if (!cur || cur.is_deleted || cur._deleted) throw new Error('Заявка не найдена');
    const normalized = normalizeChecklistResults(results);
    if (normalized && cur.template_key && normalized.template_key !== cur.template_key) {
      throw new Error('template_key чек-листа не совпадает с заявкой');
    }
    return this.update(id, { checklist_results: normalized });
  },

  /**
   * Upsert одного пункта в checklist_results.
   * Если results ещё нет — создаёт каркас из template_key заявки.
   */
  async setChecklistItem(
    id: string,
    item: {
      id: string;
      group?: string | null;
      name: string;
      status: ChecklistItemStatusV2 | string;
      comment?: string | null;
      photos?: string[] | null;
      /** Если true — сбросить comment/photos (повторный тап статуса / clear). */
      clearExtras?: boolean;
    }
  ): Promise<ConstructionAcceptanceV2> {
    const cur = _items.find((d) => d.id === id);
    if (!cur || cur.is_deleted || cur._deleted) throw new Error('Заявка не найдена');
    const itemId = String(item.id || '').trim();
    const name = String(item.name || '').trim();
    const status = _normalizeItemStatus(item.status);
    if (!itemId || !name || !status) throw new Error('id, name и status пункта обязательны');

    const template_key = String(cur.template_key || cur.checklist_results?.template_key || '').trim();
    if (!template_key) throw new Error('У заявки нет template_key для чек-листа');

    const now = _now();
    const prev = normalizeChecklistResults(cur.checklist_results) || {
      template_key,
      updated_at: now,
      items: [] as ChecklistResultItemV2[]
    };
    const idx = prev.items.findIndex((x) => String(x.id) === itemId);
    const existing = idx >= 0 ? prev.items[idx] : null;

    const nextItem: ChecklistResultItemV2 = {
      id: itemId,
      group:
        item.group !== undefined
          ? item.group != null
            ? String(item.group).trim() || null
            : null
          : existing?.group ?? null,
      name,
      status,
      updated_at: now
    };

    if (item.clearExtras) {
      // comment/photos intentionally omitted
    } else {
      const comment =
        item.comment !== undefined
          ? _normalizeItemComment(item.comment)
          : existing?.comment;
      const photos =
        item.photos !== undefined
          ? _normalizeItemPhotos(item.photos)
          : existing?.photos;
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

  async softDelete(id: string): Promise<ConstructionAcceptanceV2> {
    const cur = _items.find((d) => d.id === id);
    if (!cur) throw new Error('Заявка не найдена');
    const next: ConstructionAcceptanceV2 = {
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

export type ConstructionAcceptanceServiceApi = typeof ConstructionAcceptanceService;
