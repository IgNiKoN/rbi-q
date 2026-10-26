/** Подвкладки План/Факта в меню оболочки (window.RBI.platformNav): какие пункты манифеста показать. */
export interface NavItem { id: string; label: string; path: string; icon?: string; requiresAccess?: boolean | 'estimate' | 'ks2' }
export interface NavAccess { directories: boolean; estimate: boolean; ks2: boolean; demo: boolean }

/** С входом — по подтверждённому сервером доступу; P2-0026: в демо (без входа) — все разделы, в закрытых экран «Войдите». */
export function visibleNavItems(items: NavItem[], a: NavAccess): NavItem[] {
  if (a.demo) return items.slice();
  return items.filter((i) => !i.requiresAccess || (i.requiresAccess === 'estimate' ? a.estimate : i.requiresAccess === 'ks2' ? a.ks2 : a.directories));
}
