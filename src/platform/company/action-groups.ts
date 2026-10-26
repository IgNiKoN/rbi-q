/**
 * Русские группы действий для экрана «Роли» — единственное место подписей групп на клиенте.
 * Ключи и описания действий приходят только из каталога сервера (pf_permission_catalog);
 * действие, которого нет в группах, попадает в «Прочее» — новый ключ каталога не теряется.
 */
import type { CatalogRow } from './company.service.ts';

export const ACTION_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Работы и план', keys: ['planfact.works.view', 'planfact.works.edit', 'planfact.wor.import', 'planfact.plan.approve', 'planfact.plan.change_request'] },
  { title: 'Факт', keys: ['planfact.fact.view', 'planfact.fact.create'] },
  { title: 'Чек-листы', keys: ['planfact.checklist.view', 'planfact.checklist.create'] },
  { title: 'Деньги и выплаты', keys: ['planfact.money.view', 'planfact.rates.plan.edit', 'planfact.rates.fact.edit', 'planfact.payments.review', 'planfact.payments.prepare', 'planfact.payments.sign'] },
  { title: 'КС-2', keys: ['planfact.ks2.edit'] },
  { title: 'Настройки и журнал', keys: ['planfact.thresholds.edit', 'planfact.audit.view'] },
  { title: 'Безопасность', keys: ['security.roles.assign'] }
];

export function groupCatalog(catalog: CatalogRow[]): { title: string; items: CatalogRow[] }[] {
  const byKey = new Map(catalog.map((c) => [c.action, c]));
  const used = new Set<string>();
  const groups = ACTION_GROUPS.map((g) => ({
    title: g.title,
    items: g.keys.filter((k) => byKey.has(k)).map((k) => { used.add(k); return byKey.get(k)!; })
  })).filter((g) => g.items.length);
  const rest = catalog.filter((c) => !used.has(c.action));
  if (rest.length) groups.push({ title: 'Прочее', items: rest });
  return groups;
}
