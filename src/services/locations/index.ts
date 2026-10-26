/**
 * Entry бандла rbi-locations.js — регистрирует service.locations на платформе.
 */

import { LocationsService } from './locations.service';
export {
  resolveObjectLink,
  listUnlinkedObjects,
  ensureCanonicalLink,
  cleanObjectName,
  listObjectsAsOdShape,
  ensureObjectNode,
  locationNodeToOdShape
} from './object-bridge';
export type { ObjectLinkResult, OdObjectLite } from './object-bridge';
export { migrateOdCatalogToLocations, collectOdSynonyms } from './od-migrate';
export type { OdMigrateReport } from './od-migrate';

function register() {
  window.RBI = window.RBI || ({ services: {} } as Window['RBI']);
  window.RBI.services = window.RBI.services || {};
  window.RBI.services.locations = LocationsService;

  if (window.RBI.registry && typeof window.RBI.registry.register === 'function') {
    window.RBI.registry.register('service.locations', LocationsService);
  }

  // Ленивый init после появления storage (bootstrap может быть позже бандла)
  const tryInit = () => {
    if (window.RBI?.services?.storage) {
      LocationsService.init().catch((e) => console.warn('[locations] init', e));
      return true;
    }
    return false;
  };
  if (!tryInit()) {
    document.addEventListener('DOMContentLoaded', () => {
      if (!tryInit()) {
        setTimeout(() => tryInit(), 500);
        setTimeout(() => tryInit(), 2000);
      }
    });
  }

  console.info('[locations] service.locations registered');
}

register();

export { LocationsService };
