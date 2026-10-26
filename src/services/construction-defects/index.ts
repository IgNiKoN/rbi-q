/**
 * Entry бандла rbi-construction-defects.js — регистрирует service.constructionDefects.
 */

import { ConstructionDefectsService } from './construction-defects.service';

function register() {
  window.RBI = window.RBI || ({ services: {} } as Window['RBI']);
  window.RBI.services = window.RBI.services || {};
  window.RBI.services.constructionDefects = ConstructionDefectsService;

  if (window.RBI.registry && typeof window.RBI.registry.register === 'function') {
    window.RBI.registry.register('service.constructionDefects', ConstructionDefectsService);
  }

  const tryInit = () => {
    if (window.RBI?.services?.storage) {
      ConstructionDefectsService.init().catch((e) => console.warn('[constructionDefects] init', e));
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

  console.info('[constructionDefects] service.constructionDefects registered');
}

register();

export { ConstructionDefectsService };
