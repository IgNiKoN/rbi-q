/**
 * C2: идемпотентная миграция ObjectDirectory → locations.object.
 * Ключ связи — canonical_key; synonyms/aliases OD → LocationNode.synonyms.
 */

import type { LocationNode } from './types';
import {
  cleanObjectName,
  createLocationFromOd,
  resolveObjectLink,
  type ObjectBridgeApi,
  type OdObjectLite
} from './object-bridge';

export type OdMigrateReport = {
  dryRun: boolean;
  created: number;
  linked: number;
  updatedSynonyms: number;
  skipped: number;
  errors: { key: string; message: string }[];
};

export type OdMigrateApi = ObjectBridgeApi & {
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
  aliases?: Record<string, string>;
};

function _od(): OdGlobal | null {
  return (window as unknown as { ObjectDirectory?: OdGlobal }).ObjectDirectory || null;
}

function listOdActive(): OdObjectLite[] {
  const od = _od();
  // C2b: migrate leftover IDB; objects = locations-проекция
  const leftover = od && Array.isArray(od.leftoverObjects) ? od.leftoverObjects : [];
  const list = leftover.length
    ? leftover
    : od && Array.isArray(od.objects)
      ? od.objects
      : [];
  return list.filter((o) => o && !o._deleted && !o.is_deleted);
}

/** Уникальные synonyms: OD.synonyms + raw_name из aliases с этим key. */
export function collectOdSynonyms(odObj: OdObjectLite): string[] {
  const key = String(odObj.canonical_key || '').trim();
  const fromObj = Array.isArray(odObj.synonyms) ? odObj.synonyms.map((s) => String(s || '').trim()) : [];
  const fromAliases: string[] = [];
  const aliases = _od()?.aliases || {};
  if (key) {
    for (const [raw, ck] of Object.entries(aliases)) {
      if (cleanObjectName(String(ck || '')) === cleanObjectName(key)) {
        fromAliases.push(String(raw || '').trim());
      }
    }
  }
  return uniqSynonymStrings([...fromObj, ...fromAliases]);
}

function uniqSynonymStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const t = String(raw || '').trim();
    if (!t) continue;
    const k = cleanObjectName(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function synonymsEqual(a: unknown, b: string[]): boolean {
  const aa = uniqSynonymStrings(Array.isArray(a) ? a.map(String) : []);
  if (aa.length !== b.length) return false;
  const setB = new Set(b.map((s) => cleanObjectName(s)));
  return aa.every((s) => setB.has(cleanObjectName(s)));
}

/**
 * Миграция каталога OD → locations.object.
 * dryRun=true — только отчёт, без записи.
 * Повтор apply: created=0 (идемпотентно).
 */
export async function migrateOdCatalogToLocations(
  api: OdMigrateApi,
  opts: { dryRun?: boolean } = {}
): Promise<OdMigrateReport> {
  const dryRun = !!opts.dryRun;
  const report: OdMigrateReport = {
    dryRun,
    created: 0,
    linked: 0,
    updatedSynonyms: 0,
    skipped: 0,
    errors: []
  };

  const ods = listOdActive();
  for (const odObj of ods) {
    const key = String(odObj.canonical_key || '').trim();
    if (!key) {
      report.errors.push({
        key: String(odObj.display_name || odObj.id || '?'),
        message: 'нет canonical_key'
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
        const locKey = String(loc.canonical_key || '').trim();
        if (!locKey || cleanObjectName(locKey) !== cleanObjectName(key)) {
          if (!dryRun) {
            loc = await api.updateNode(loc.id, { canonical_key: key });
          }
          didLink = true;
          report.linked += 1;
        }
      }

      if (!loc && dryRun) {
        // dry-run create: synonyms посчитаем как updated если были бы
        if (wantedSyn.length) report.updatedSynonyms += 1;
        continue;
      }
      if (!loc) {
        report.errors.push({ key, message: 'не удалось создать locations.object' });
        continue;
      }

      // После createLocationFromOd узел мог остаться без synonyms — дописать
      const curId = loc.id;
      const fresh = api.getNode(curId) || loc;
      if (!synonymsEqual(fresh.synonyms, wantedSyn)) {
        if (wantedSyn.length || (Array.isArray(fresh.synonyms) && fresh.synonyms.length)) {
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
