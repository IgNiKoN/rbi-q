/**
 * Группы действий для экрана «Роли и права» — из каталога сервера (P2-0070: модуль, группа, порядок, подпись — данные
 * core.permission_catalog, pf_permission_catalog). Своего списка групп на клиенте нет: новое действие любого модуля появляется
 * на экране без правки кода. Действие без группы (сервер без 052) — в «Прочее», ключ каталога не теряется.
 */
import type { CatalogRow } from './company.service.ts';

export interface ActionGroup { key: string; title: string; module: string; moduleName: string; items: CatalogRow[] }

const OTHER = 'Прочее';

export function groupCatalog(catalog: CatalogRow[]): ActionGroup[] {
  const rows = catalog.map((c, i) => ({ c, i })).sort((a, b) => (a.c.sort ?? 1e9) - (b.c.sort ?? 1e9) || a.i - b.i);
  const groups = new Map<string, ActionGroup>();
  const rest: CatalogRow[] = [];
  for (const { c } of rows) {
    if (!c.group_name || c.group_name === OTHER) { rest.push(c); continue; }
    const key = (c.module || '') + '|' + c.group_name;
    const g = groups.get(key) || { key, title: c.group_name, module: c.module || '', moduleName: c.module_name || '', items: [] };
    g.items.push(c);
    groups.set(key, g);
  }
  const out = Array.from(groups.values());
  if (rest.length) out.push({ key: '|' + OTHER, title: OTHER, module: '', moduleName: '', items: rest });
  return out;
}

/** Подпись действия внутри группы (короткая, из каталога; нет — описание). */
export const actionLabel = (c: CatalogRow): string => c.label || c.description;

/** Что может роль: группы с отмеченным действием («Работы и план, Факт»); роль в нескольких модулях — названия модулей. */
export function abilities(actions: string[], catalog: CatalogRow[]): string[] {
  const has = new Set(actions);
  const groups = groupCatalog(catalog).filter((g) => g.items.some((i) => has.has(i.action)));
  const modules = Array.from(new Set(groups.map((g) => g.moduleName).filter(Boolean)));
  return modules.length > 1 ? modules : groups.map((g) => g.title);
}

/** P2-0071: «Доступ к модулю» — включён, если у роли есть хоть одно действие модуля. */
export const moduleOn = (actions: Set<string>, catalog: CatalogRow[], module: string): boolean =>
  catalog.some((c) => c.module === module && actions.has(c.action));

/** P2-0071: переключатель «Доступ к модулю»: выключить — снять все действия модуля; включить — поставить действия просмотра
 *  модуля (…view; нет таких — первое действие модуля), остальное администратор отметит сам. */
export function setModuleAccess(actions: Set<string>, catalog: CatalogRow[], module: string, on: boolean): Set<string> {
  const mine = catalog.filter((c) => c.module === module);
  const next = new Set(actions);
  if (!on) { for (const c of mine) next.delete(c.action); return next; }
  const views = mine.filter((c) => /\.view$/.test(c.action));
  for (const c of views.length ? views : mine.slice(0, 1)) next.add(c.action);
  return next;
}
