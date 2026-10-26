/**
 * Раздел «Администрирование платформы» (Vite-бандл → js/dist/platform-admin/platform-admin.js, без React и без своей копии клиента сервера).
 * Подключают Настройки (подраздел #/settings/platform-admin) только администратору платформы; вызовы — через вход платформы (RBI.platform2.rpc).
 */
import { createAdminService } from './admin.service.ts';
import type { Rpc } from './admin.service.ts';
import { ADMIN_CSS, renderAdminScreen } from './AdminScreen.ts';

const STYLE_ID = 'platform-admin-style';
type P2 = { RBI?: { platform2?: { rpc?: Rpc; refresh?: () => Promise<unknown> } } };

let cleanup: (() => void) | null = null;

export function mount(el: HTMLElement): void {
  unmount();
  const doc = el.ownerDocument;
  if (!doc.getElementById(STYLE_ID)) {
    const s = doc.createElement('style');
    s.id = STYLE_ID;
    s.textContent = ADMIN_CSS;
    doc.head.appendChild(s);
  }
  const p2 = (window as unknown as P2).RBI?.platform2;
  if (!p2 || typeof p2.rpc !== 'function') { el.textContent = 'Вход платформы не загружен.'; return; }
  cleanup = renderAdminScreen(el, { api: createAdminService(p2.rpc), onChanged: () => { if (p2.refresh) void p2.refresh(); } });
}

export function unmount(): void {
  if (cleanup) cleanup();
  cleanup = null;
}

export function isMounted(): boolean {
  return cleanup !== null;
}
