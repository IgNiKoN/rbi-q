/**
 * Entry бандла rbi-construction-acceptance.js — регистрирует service.constructionAcceptance.
 */

import { ConstructionAcceptanceService } from './construction-acceptance.service';

function register() {
  window.RBI = window.RBI || ({ services: {} } as Window['RBI']);
  window.RBI.services = window.RBI.services || {};
  window.RBI.services.constructionAcceptance = ConstructionAcceptanceService;

  if (window.RBI.registry && typeof window.RBI.registry.register === 'function') {
    window.RBI.registry.register('service.constructionAcceptance', ConstructionAcceptanceService);
  }

  const tryInit = () => {
    if (window.RBI?.services?.storage) {
      ConstructionAcceptanceService.init().catch((e) => console.warn('[constructionAcceptance] init', e));
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

  console.info('[constructionAcceptance] service.constructionAcceptance registered');
}

register();

export { ConstructionAcceptanceService };
