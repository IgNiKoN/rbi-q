/**
 * Entry бандла rbi-construction-units.js — регистрирует service.constructionUnits.
 */

import { ConstructionUnitsService } from './construction-units.service';

function register() {
  window.RBI = window.RBI || ({ services: {} } as Window['RBI']);
  window.RBI.services = window.RBI.services || {};
  window.RBI.services.constructionUnits = ConstructionUnitsService;

  if (window.RBI.registry && typeof window.RBI.registry.register === 'function') {
    window.RBI.registry.register('service.constructionUnits', ConstructionUnitsService);
  }

  const tryInit = () => {
    if (window.RBI?.services?.storage) {
      ConstructionUnitsService.init().catch((e) => console.warn('[constructionUnits] init', e));
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

  console.info('[constructionUnits] service.constructionUnits registered');
}

register();

export { ConstructionUnitsService };
