/**
 * P2-0060: «держать без сети» ядра платформы («Компания») — заранее (с сетью, раз в сутки и по кнопке) скачать в копию для просмотра
 * экраны компаний, которыми человек управляет: сотрудники и роли, проекты и объекты, единицы, подразделения, контрагенты, справочники.
 * Теми же вызовами, что экраны (ключи копии совпадают). Места проекта (дерево) — заранее в План/Факте (шахматка); экран мест — открытое.
 */
import type { CompanyApi } from './company.service.ts';
import type { CoreApi } from '../core/core.service.ts';
import type { ProjectsApi } from '../core/projects.service.ts';
import { offlineNow, offlineReader } from '../services/offline/copy.ts';

export interface CorePrefetchDeps { api: CompanyApi | null; core: CoreApi | null; projects: ProjectsApi | null }
export interface CorePrefetchStats { companies: number; reads: number; bytes: number; stopped?: string }

export async function prefetchCore(d: CorePrefetchDeps): Promise<CorePrefetchStats> {
  const stats: CorePrefetchStats = { companies: 0, reads: 0, bytes: 0 };
  if (!d.api || offlineNow()) return { ...stats, stopped: 'нет связи' };
  let reads = 0;
  const count = async <T>(p: Promise<T>): Promise<T> => { reads++; return p; };
  const before = await offlineReader().size('company');
  const [admin, access] = await Promise.all([count(d.api.myAdminCompanies()), d.projects ? count(d.projects.myAccess()) : Promise.resolve([])]);
  await Promise.all([count(d.api.catalog()), count(d.api.listProjects())]);
  const ids = new Set<string>([...admin.map((c) => c.company_id), ...access.filter((c) => c.can_manage_projects || c.can_manage_units).map((c) => c.company_id)]);
  for (const co of ids) {
    if (offlineNow()) { stats.stopped = 'связь пропала'; break; }
    const isAdmin = admin.some((c) => c.company_id === co);
    const jobs: Promise<unknown>[] = [];
    if (isAdmin) jobs.push(d.api.listMembers(co), d.api.listRoles(co));
    if (isAdmin && d.api.listQualityObjects) jobs.push(d.api.listQualityObjects(co));
    const pr = d.projects;
    if (pr) {
      jobs.push(pr.listUnits(co));
      if (pr.projectCatalog) jobs.push(pr.projectCatalog(co));
      if (pr.listDivisions) jobs.push(pr.listDivisions(co));
    }
    if (d.core) jobs.push(d.core.listCounterparties(co, false));
    await Promise.all(jobs.map(count));
    stats.companies++;
  }
  if (d.projects && d.projects.dicts) await count(d.projects.dicts());
  stats.reads = reads;
  stats.bytes = (await offlineReader().size('company')) - before;
  return stats;
}
