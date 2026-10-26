/**
 * knowledge.desktop.render.js
 * Desktop База знаний (≥1280): sticky subtabs + desk Ч/л + НД + TWI + Узлы + Практики.
 * Mobile reference.js / knowledge.module.js не переписывает (strangler).
 */

import {
  paintChecklistsChrome,
  clearChecklistsDesktopArtifacts,
  remountChecklistsItems,
  selectChecklist
} from './knowledge.desktop.checklists.js';
import {
  paintDocsChrome,
  clearDocsDesktopArtifacts,
  remountDocsList
} from './knowledge.desktop.docs.js';
import {
  paintTwiChrome,
  clearTwiDesktopArtifacts,
  remountTwiList
} from './knowledge.desktop.twi.js';
import {
  paintNodesChrome,
  clearNodesDesktopArtifacts,
  remountNodesList
} from './knowledge.desktop.nodes.js';
import {
  paintPracticesChrome,
  clearPracticesDesktopArtifacts,
  remountPracticesList
} from './knowledge.desktop.practices.js';

const DESKTOP_MIN = 1280;
const WIDE_CLASS = 'rbi-knowledge-desktop-wide';
const CSS_HREF = './css/knowledge.desktop.css';
const TAB_ID = 'tab-reference';
const SUBTABS_ID = 'reference-subtabs-block';

let _resizeBound = false;
let _hooksBound = false;
let _shellApplied = false;
let _afterPaintTimer = null;
let _origSwitch = null;
let _origRenderReferenceTab = null;
let _origRenderReferenceView = null;
let _origChangeRefTemplate = null;
let _origRenderDocsList = null;
let _origRenderTwiList = null;
let _origRenderNodesList = null;
let _origRenderPracticesTab = null;

function isDesktopViewport() {
  return typeof window !== 'undefined' && window.innerWidth >= DESKTOP_MIN;
}

function isQualityMode() {
  try {
    if (window.AppModeManager && window.AppModeManager.currentMode) {
      return window.AppModeManager.currentMode === 'quality';
    }
  } catch (_) { /* ignore */ }
  return /#\/quality\//i.test(String(location.hash || ''));
}

function isKnowledgeActive() {
  const hash = String(location.hash || '');
  if (hash && hash !== '#') {
    return /#\/(?:quality\/reference|knowledge)(\/|$|\?)/i.test(hash)
      || /^#\/(?:quality\/reference|knowledge)$/i.test(hash);
  }
  const tab = document.getElementById(TAB_ID);
  return !!(tab && tab.classList.contains('active'));
}

function visibleSubId() {
  const visible = document.querySelector('#tab-reference .ref-sub-section:not(.hidden)');
  return visible && visible.id ? visible.id : null;
}

function currentSubId() {
  return visibleSubId() || 'ref-sub-checklists';
}

function ensureDesktopCss() {
  if (document.querySelector('link[data-knowledge-desktop-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_HREF;
  link.setAttribute('data-knowledge-desktop-css', '1');
  document.head.appendChild(link);
}

function setWideLayout(on) {
  ensureDesktopCss();
  const root = document.getElementById('app-root');
  const body = document.body;
  if (on) {
    if (root) root.classList.add(WIDE_CLASS);
    if (body) body.classList.add(WIDE_CLASS);
  } else {
    if (root) root.classList.remove(WIDE_CLASS);
    if (body) body.classList.remove(WIDE_CLASS);
  }
}

function markSubSections() {
  const map = {
    'ref-sub-checklists': 'kb-desk-checklists-section',
    'ref-sub-docs': 'kb-desk-docs-section',
    'ref-sub-twi': 'kb-desk-twi-section',
    'ref-sub-nodes': 'kb-desk-nodes-section',
    'ref-sub-practices': 'kb-desk-practices-section'
  };
  Object.keys(map).forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.add(map[id]);
  });
}

/** Sync active: desktop = цвет; mobile = чип как в аналитике (bg-white + shadow). */
function syncSubtabActive(subId) {
  const id = subId || currentSubId();
  const deskChrome = isDesktopViewport() && _shellApplied;
  const btns = document.querySelectorAll('#reference-subtabs-block .sub-tab-btn');
  btns.forEach(function (btn) {
    const arg = btn.getAttribute('data-action-arg') || '';
    const on = arg === id;
    btn.classList.toggle('active', on);
    btn.classList.remove(
      'bg-white',
      'shadow-sm',
      'text-brand'
    );
    if (on) {
      if (deskChrome) {
        btn.classList.add('text-brand');
      } else {
        btn.classList.add(
          'bg-white',
          'shadow-sm',
          'text-brand'
        );
      }
      btn.classList.remove('text-[var(--text-muted)]');
    } else {
      btn.classList.add('text-[var(--text-muted)]');
    }
  });
}

function scheduleAfterSubPaint(subId) {
  if (_afterPaintTimer) clearTimeout(_afterPaintTimer);
  _afterPaintTimer = setTimeout(function () {
    _afterPaintTimer = null;
    afterSubPaint(subId || currentSubId());
  }, 100);
}

function afterSubPaint(subId) {
  if (!_shellApplied) return;
  markSubSections();
  const id = subId || currentSubId();
  const tab = document.getElementById(TAB_ID);
  if (tab) tab.setAttribute('data-kb-desk-sub', id);
  syncSubtabActive(id);

  if (id === 'ref-sub-checklists') {
    try {
      clearDocsDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearTwiDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearNodesDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearPracticesDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      paintChecklistsChrome();
    } catch (_) {
      /* ignore */
    }
  } else if (id === 'ref-sub-docs') {
    try {
      clearChecklistsDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearTwiDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearNodesDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearPracticesDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      paintDocsChrome();
    } catch (_) {
      /* ignore */
    }
  } else if (id === 'ref-sub-twi') {
    try {
      clearChecklistsDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearDocsDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearNodesDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearPracticesDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      paintTwiChrome();
    } catch (_) {
      /* ignore */
    }
  } else if (id === 'ref-sub-nodes') {
    try {
      clearChecklistsDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearDocsDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearTwiDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearPracticesDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      paintNodesChrome();
    } catch (_) {
      /* ignore */
    }
  } else if (id === 'ref-sub-practices') {
    try {
      clearChecklistsDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearDocsDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearTwiDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearNodesDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      paintPracticesChrome();
    } catch (_) {
      /* ignore */
    }
  } else {
    try {
      clearChecklistsDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearDocsDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearTwiDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearNodesDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
    try {
      clearPracticesDesktopArtifacts();
    } catch (_) {
      /* ignore */
    }
  }
}

function clearKnowledgeDesktopArtifacts() {
  clearChecklistsDesktopArtifacts();
  clearDocsDesktopArtifacts();
  clearTwiDesktopArtifacts();
  clearNodesDesktopArtifacts();
  clearPracticesDesktopArtifacts();
  [
    'kb-desk-checklists-section',
    'kb-desk-docs-section',
    'kb-desk-twi-section',
    'kb-desk-nodes-section',
    'kb-desk-practices-section'
  ].forEach(function (cls) {
    document.querySelectorAll('.' + cls).forEach(function (el) {
      el.classList.remove(cls);
    });
  });
}

function remountActiveSubTab() {
  const id = currentSubId();
  try {
    if (id === 'ref-sub-checklists' && typeof window.renderReferenceTab === 'function') {
      window.renderReferenceTab();
    } else if (id === 'ref-sub-docs') {
      const svc = window.RBI && window.RBI.services && window.RBI.services.knowledge;
      if (svc && typeof svc.renderDocsList === 'function') svc.renderDocsList();
      else if (typeof window.renderDocsList === 'function') window.renderDocsList();
    } else if (id === 'ref-sub-twi') {
      const svc = window.RBI && window.RBI.services && window.RBI.services.knowledge;
      if (svc && typeof svc.renderTwiList === 'function') svc.renderTwiList();
      else if (typeof window.renderTwiList === 'function') window.renderTwiList();
    } else if (id === 'ref-sub-nodes') {
      const svc = window.RBI && window.RBI.services && window.RBI.services.knowledge;
      if (svc && typeof svc.renderNodesList === 'function') svc.renderNodesList();
      else if (typeof window.renderNodesList === 'function') window.renderNodesList();
    } else if (id === 'ref-sub-practices') {
      if (typeof window.rbi_loadPractices === 'function') {
        Promise.resolve(window.rbi_loadPractices()).then(function () {
          if (typeof window.rbi_renderPracticesTab === 'function') window.rbi_renderPracticesTab();
        });
      }
    }
  } catch (_) {
    /* ignore */
  }
}

export function showKnowledgeDesktop() {
  if (!isDesktopViewport() || !isKnowledgeActive()) {
    teardownKnowledgeDesktop();
    return;
  }
  const tab = document.getElementById(TAB_ID);
  const subtabs = document.getElementById(SUBTABS_ID);
  if (!tab || !subtabs) return;

  const wasApplied = _shellApplied;
  setWideLayout(true);
  tab.classList.add('knowledge-desktop-active');
  subtabs.classList.remove('max-w-4xl', 'mx-auto');
  subtabs.classList.add('kb-desk-subtabs');
  markSubSections();
  _shellApplied = true;

  if (!wasApplied) {
    remountActiveSubTab();
    scheduleAfterSubPaint(currentSubId());
  } else {
    afterSubPaint(currentSubId());
  }
}

export function teardownKnowledgeDesktop() {
  const wasApplied = _shellApplied;
  _shellApplied = false;

  if (wasApplied) {
    clearKnowledgeDesktopArtifacts();
    remountActiveSubTab();
  }

  const tab = document.getElementById(TAB_ID);
  const subtabs = document.getElementById(SUBTABS_ID);
  if (tab) {
    tab.classList.remove('knowledge-desktop-active');
    tab.removeAttribute('data-kb-desk-sub');
  }
  if (subtabs) {
    subtabs.classList.add('max-w-4xl', 'mx-auto');
    subtabs.classList.remove('kb-desk-subtabs');
  }
  setWideLayout(false);
}

export function syncKnowledgeDesktop() {
  if (isDesktopViewport() && isKnowledgeActive()) showKnowledgeDesktop();
  else teardownKnowledgeDesktop();
}

function wrapKnowledgeFns() {
  if (typeof window.switchReferenceSubTab === 'function' && !_origSwitch) {
    _origSwitch = window.switchReferenceSubTab;
    window.switchReferenceSubTab = function (tabId, btnElement) {
      const r = _origSwitch.apply(this, arguments);
      Promise.resolve(r).finally(function () {
        syncSubtabActive(tabId);
        if (_shellApplied) scheduleAfterSubPaint(tabId);
        else syncKnowledgeDesktop();
      });
      return r;
    };
  }

  if (typeof window.renderReferenceTab === 'function' && !_origRenderReferenceTab) {
    _origRenderReferenceTab = window.renderReferenceTab;
    window.renderReferenceTab = function () {
      const r = _origRenderReferenceTab.apply(this, arguments);
      Promise.resolve(r).finally(function () {
        if (!_shellApplied || currentSubId() !== 'ref-sub-checklists') return;
        // Поиск / смена шаблона: только переложить тот же #reference-items в viewer
        if (document.querySelector('#ref-sub-checklists > .kb-desk-split')) {
          try {
            remountChecklistsItems();
          } catch (_) {
            /* ignore */
          }
        } else {
          scheduleAfterSubPaint('ref-sub-checklists');
        }
      });
      return r;
    };
  }

  if (typeof window.changeRefTemplate === 'function' && !_origChangeRefTemplate) {
    _origChangeRefTemplate = window.changeRefTemplate;
    window.changeRefTemplate = function () {
      const r = _origChangeRefTemplate.apply(this, arguments);
      Promise.resolve(r).finally(function () {
        if (!_shellApplied || currentSubId() !== 'ref-sub-checklists') return;
        if (document.querySelector('#ref-sub-checklists > .kb-desk-split')) {
          try {
            remountChecklistsItems();
          } catch (_) {
            /* ignore */
          }
        } else {
          scheduleAfterSubPaint('ref-sub-checklists');
        }
      });
      return r;
    };
  }

  if (typeof window.renderDocsList === 'function' && !_origRenderDocsList) {
    _origRenderDocsList = window.renderDocsList;
    window.renderDocsList = function () {
      const r = _origRenderDocsList.apply(this, arguments);
      Promise.resolve(r).finally(function () {
        if (!_shellApplied || currentSubId() !== 'ref-sub-docs') return;
        if (document.querySelector('#ref-sub-docs > .kb-desk-docs-split')) {
          try {
            remountDocsList();
          } catch (_) {
            /* ignore */
          }
        } else {
          scheduleAfterSubPaint('ref-sub-docs');
        }
      });
      return r;
    };
  }

  if (typeof window.renderTwiList === 'function' && !_origRenderTwiList) {
    _origRenderTwiList = window.renderTwiList;
    window.renderTwiList = function () {
      const r = _origRenderTwiList.apply(this, arguments);
      Promise.resolve(r).finally(function () {
        if (!_shellApplied || currentSubId() !== 'ref-sub-twi') return;
        if (document.querySelector('#ref-sub-twi .kb-desk-twi-split')) {
          try {
            remountTwiList();
          } catch (_) {
            /* ignore */
          }
        } else {
          scheduleAfterSubPaint('ref-sub-twi');
        }
      });
      return r;
    };
  }

  if (typeof window.renderNodesList === 'function' && !_origRenderNodesList) {
    _origRenderNodesList = window.renderNodesList;
    window.renderNodesList = function () {
      const r = _origRenderNodesList.apply(this, arguments);
      Promise.resolve(r).finally(function () {
        if (!_shellApplied || currentSubId() !== 'ref-sub-nodes') return;
        if (document.querySelector('#ref-sub-nodes .kb-desk-nodes-split')) {
          try {
            remountNodesList();
          } catch (_) {
            /* ignore */
          }
        } else {
          scheduleAfterSubPaint('ref-sub-nodes');
        }
      });
      return r;
    };
  }

  if (typeof window.rbi_renderPracticesTab === 'function' && !_origRenderPracticesTab) {
    _origRenderPracticesTab = window.rbi_renderPracticesTab;
    window.rbi_renderPracticesTab = function () {
      const r = _origRenderPracticesTab.apply(this, arguments);
      Promise.resolve(r).finally(function () {
        if (!_shellApplied || currentSubId() !== 'ref-sub-practices') return;
        if (document.querySelector('#ref-sub-practices .kb-desk-prac-split')) {
          try {
            remountPracticesList();
          } catch (_) {
            /* ignore */
          }
        } else {
          scheduleAfterSubPaint('ref-sub-practices');
        }
      });
      return r;
    };
  }

  if (window.AppViews && typeof window.AppViews.renderReference === 'function' && !_origRenderReferenceView) {
    _origRenderReferenceView = window.AppViews.renderReference;
    window.AppViews.renderReference = function () {
      const r = _origRenderReferenceView.apply(this, arguments);
      // Сразу, без 60ms — иначе sticky top «доезжает» 70→52
      if (isDesktopViewport()) setWideLayout(true);
      queueMicrotask(syncKnowledgeDesktop);
      return r;
    };
  }
}

function bindHooks() {
  if (_hooksBound) return;
  _hooksBound = true;
  wrapKnowledgeFns();
  setTimeout(wrapKnowledgeFns, 0);
  setTimeout(wrapKnowledgeFns, 500);
  setTimeout(wrapKnowledgeFns, 1500);

  window.addEventListener('hashchange', function () {
    if (isDesktopViewport() && /reference/i.test(location.hash || '')) {
      setWideLayout(true);
    }
    queueMicrotask(function () {
      setTimeout(syncKnowledgeDesktop, 0);
      setTimeout(syncKnowledgeDesktop, 80);
    });
  });

  // AppRouter.navigate использует replaceState — hashchange не всегда приходит.
  if (window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function') {
    window.RBI.events.on('appMode:changed', function () {
      queueMicrotask(function () {
        setTimeout(syncKnowledgeDesktop, 0);
        setTimeout(syncKnowledgeDesktop, 100);
      });
    });
  }

  document.addEventListener('click', function (e) {
    const subBtn = e.target.closest('#reference-subtabs-block .sub-tab-btn');
    if (subBtn) {
      const arg = subBtn.getAttribute('data-action-arg');
      if (arg) syncSubtabActive(arg);
    }
    const nav = e.target.closest(
      '.app-nav2-item, .nav-item, [data-path*="reference"], [href*="reference"], #reference-subtabs-block .sub-tab-btn'
    );
    if (nav) {
      const hint =
        (nav.getAttribute('data-path') || '') +
        (nav.getAttribute('href') || '') +
        (nav.textContent || '');
      if (isDesktopViewport() && /reference|база|знан|\bБЗ\b/i.test(hint)) {
        setWideLayout(true);
      }
      queueMicrotask(syncKnowledgeDesktop);
    }
  });
}

function bindResize() {
  if (_resizeBound) return;
  _resizeBound = true;
  let t = null;
  let lastDesktop = isDesktopViewport();
  window.addEventListener('resize', function () {
    if (t) clearTimeout(t);
    t = setTimeout(function () {
      if (!isKnowledgeActive()) {
        lastDesktop = isDesktopViewport();
        return;
      }
      const nowDesktop = isDesktopViewport();
      if (nowDesktop === lastDesktop) return;
      lastDesktop = nowDesktop;
      if (!nowDesktop) {
        try {
          teardownKnowledgeDesktop();
        } catch (_) {
          /* ignore */
        }
      } else {
        try {
          showKnowledgeDesktop();
        } catch (_) {
          /* ignore */
        }
      }
    }, 120);
  });
}

function boot() {
  bindHooks();
  bindResize();
  syncKnowledgeDesktop();
  setTimeout(syncKnowledgeDesktop, 400);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

window.__knowledgeDesktop = {
  show: showKnowledgeDesktop,
  teardown: teardownKnowledgeDesktop,
  sync: syncKnowledgeDesktop,
  afterSubPaint: afterSubPaint,
  remountPractices: remountPracticesList,
  selectChecklist: selectChecklist
};
