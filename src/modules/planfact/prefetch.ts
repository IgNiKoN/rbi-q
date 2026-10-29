/**
 * P2-0060: «держать без сети» План/Факта — заранее (с сетью, раз в сутки и по кнопке) скачать основные экраны моих проектов
 * в копию для просмотра, теми же вызовами, что делают экраны (ключи копии совпадают — без сети экран открывается, даже если не открывался).
 * Стоп-условие карточки сработало (различных чтений больше 40): заранее — только Сводка, ВОР, Факт (журнал ожиданий, позиции)
 * и шахматка (дерево мест); остальное — то, что открывали (ТД). Объём на проект замеряется (stats).
 */
import type { SummaryApi } from './summary/summary.service.ts';
import type { VorApi } from './vor/vor.service.ts';
import type { FactApi } from './fact/fact.service.ts';
import type { ProjectsApi } from '../../platform/core/projects.service.ts';
import { loadPlaces } from './fact/chessboard.ts';
import { FACT_VIEW } from './fact/fact.service.ts';
import { offlineNow, offlineReader } from '../../platform/services/offline/copy.ts';

export interface PrefetchDeps { summary: SummaryApi | null; vor: VorApi | null; fact: FactApi | null; projects: ProjectsApi | null; area?: (p: string) => Promise<unknown> }
export interface PrefetchStats { projects: number; reads: number; bytes: number; perProject: { id: string; reads: number; bytes: number }[]; stopped?: string }

/** Период графиков Сводки по умолчанию (Dashboard) — тот же ключ копии. */
const WEEKS = 8;

export async function prefetchPlanfact(d: PrefetchDeps): Promise<PrefetchStats> {
  const stats: PrefetchStats = { projects: 0, reads: 0, bytes: 0, perProject: [] };
  if (!d.vor || offlineNow()) return { ...stats, stopped: 'нет связи' };
  let reads = 0;
  const count = async <T>(p: Promise<T>): Promise<T> => { reads++; return p; };
  const size = (): Promise<number> => Promise.all([offlineReader().size('planfact'), offlineReader().size('company')]).then(([a, b]) => a + b);
  const before = await size();   // всего на устройстве до — прирост этим проходом (первый раз — весь объём заранее)
  if (d.summary) await count(d.summary.portfolio());
  const mine = await count(d.vor.listProjects());   // участие (pf_my_projects)
  for (const p of mine) {
    if (offlineNow()) { stats.stopped = 'связь пропала'; break; }
    const r0 = reads;
    const perms = await count(d.vor.permissions(p.id));
    if (d.area) await count(d.area(p.id));
    // ВОР: загрузки и позиции (реестр)
    await count(d.vor.listImports(p.id));
    await count(d.vor.positions(p.id, null));
    if (perms.includes(FACT_VIEW)) {
      // Сводка объекта — те же вызовы, что Dashboard и ProjectView
      if (d.summary) {
        const s = d.summary;
        await Promise.all([count(s.weekly(p.id, WEEKS)), count(s.places(p.id, null)), count(s.workTypes(p.id)), count(s.positions(p.id, null)),
          count(s.ks2Gap(p.id)), count(s.attention(p.id))]);
      }
      // Факт: ждут подтверждения, позиции; шахматка — дерево мест целиком
      if (d.fact) await Promise.all([count(d.fact.pending(p.id)), count(d.fact.positions(p.id, null))]);
      if (d.projects) await loadPlaces((parent) => count(d.projects!.listLocations(p.id, parent)));
    }
    const bytes = (await offlineReader().size('planfact', p.id)) + (await offlineReader().size('company', p.id));
    stats.perProject.push({ id: p.id, reads: reads - r0, bytes });
    stats.projects++;
  }
  // бригады компаний — один раз на компанию (окно «Внести факт» их показывает)
  if (d.fact) for (const co of new Set(mine.map((p) => (p as { company_id?: string }).company_id).filter(Boolean) as string[])) await count(d.fact.listBrigades(co, false));
  stats.reads = reads;
  stats.bytes = (await size()) - before;
  return stats;
}
