/**
 * Общий хелпер desktop-вида construction-v2 (волна `_ai/specs/2026-08-11-construction-v2-desktop-view-design.md`).
 * Паттерн порога 1280 повторяет `analytics.desktop.render.js` (`DESKTOP_MIN`/`isDesktopViewport`/resize watcher).
 */

export const DESKTOP_MIN = 1280;

export function isDesktopViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth >= DESKTOP_MIN;
}

let _bound = false;
let _onCross: (() => void) | null = null;

/**
 * Единая подписка на `resize` для всего construction-v2: вызывает `onCross`
 * только при пересечении порога `DESKTOP_MIN` (в любую сторону), не на каждый resize-тик.
 * Повторный вызов из другого subview просто обновляет callback — подписка одна на модуль.
 */
export function bindResizeWatcher(onCross: () => void): void {
  _onCross = onCross;
  if (_bound) return;
  _bound = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastDesktop = isDesktopViewport();
  window.addEventListener('resize', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const nowDesktop = isDesktopViewport();
      if (nowDesktop === lastDesktop) return;
      lastDesktop = nowDesktop;
      _onCross?.();
    }, 120);
  });
}
