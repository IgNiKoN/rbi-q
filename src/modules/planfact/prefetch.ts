/**
 * P2-0060: «держать без сети» План/Факта — заранее (с сетью, раз в сутки и по кнопке) скачать основные экраны моих проектов
 * в копию для просмотра, теми же вызовами, что делают экраны (ключи копии совпадают — без сети экран открывается, даже если не открывался).
 * Решение владельца 29.10 «Почти всё, без нагрузки» (вместо стоп-условия «> 40 чтений»): все экраны моих проектов — Сводка, Входящие,
 * ВОР (загрузки, позиции, строки загрузок), Факт (ожидания, позиции, журнал 30 дней, бригады), шахматка (дерево мест), КС-2 и сметы — по праву;
 * позиции по месту — на телефоне из всех позиций проекта (fact.service), отдельных запросов нет. Только открытое: история позиции, строки сметы,
 * акт КС-2 целиком, владельцы факта места. Объём на проект замеряется (stats).
 */
import type { SummaryApi } from './summary/summary.service.ts';
import type { VorApi } from './vor/vor.service.ts';
import type { FactApi } from './fact/fact.service.ts';
import type { ProjectsApi } from '../../platform/core/projects.service.ts';
import type { Ks2Api } from './ks2/ks2.service.ts';
import type { EstimateApi } from './estimate/estimate.service.ts';
import { KS2_EDIT, KS2_VIEW } from './ks2/ks2.service.ts';
import { ESTIMATE_MANAGE } from './estimate/estimate.service.ts';
import { JOURNAL_DAYS, JOURNAL_LIMIT, shiftDate } from './fact/FactJournal.ts';
import { todayMoscow } from './fact/fact.ts';
import { loadPlaces } from './fact/chessboard.ts';
import { FACT_VIEW } from './fact/fact.service.ts';
import { offlineNow, offlineReader } from '../../platform/services/offline/copy.ts';

export interface PrefetchDeps { summary: SummaryApi | null; vor: VorApi | null; fact: FactApi | null; projects: ProjectsApi | null; area?: (p: string) => Promise<unknown>;
  ks2?: Ks2Api | null; estimate?: EstimateApi | null; today?: string }
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
  if (d.summary) await Promise.all([count(d.summary.portfolio()), count(d.summary.inbox())]);
  const today = d.today || todayMoscow();
  const mine = await count(d.vor.listProjects());   // участие (pf_my_projects)
  for (const p of mine) {
    if (offlineNow()) { stats.stopped = 'связь пропала'; break; }
    const r0 = reads;
    const perms = await count(d.vor.permissions(p.id));
    if (d.area) await count(d.area(p.id));
    // ВОР: загрузки, позиции (реестр) и строки загрузок (подсказка «номер и раздел ВОР» при вводе факта)
    await Promise.all([count(d.vor.listImports(p.id)), count(d.vor.listProfiles(p.id))]);   // профили колонок — экран ВОР читает при выборе проекта
    const vp = await count(d.vor.positions(p.id, null));
    for (const imp of new Set(vp.map((x) => x.import_id).filter(Boolean))) await count(d.vor.importRows(imp));
    if (d.ks2 && (perms.includes(KS2_VIEW) || perms.includes(KS2_EDIT))) await Promise.all([count(d.ks2.settings(p.id)), count(d.ks2.acts(p.id))]);
    if (d.estimate && perms.includes(ESTIMATE_MANAGE)) await count(d.estimate.listEstimates(p.id));
    if (perms.includes(FACT_VIEW)) {
      // Сводка объекта — те же вызовы, что Dashboard и ProjectView
      if (d.summary) {
        const s = d.summary;
        await Promise.all([count(s.weekly(p.id, WEEKS)), count(s.places(p.id, null)), count(s.workTypes(p.id)), count(s.positions(p.id, null)),
          count(s.ks2Gap(p.id)), count(s.attention(p.id))]);
      }
      // Факт: ждут подтверждения, позиции (и по месту — из них), журнал 30 дней (как экран); шахматка — дерево мест целиком
      if (d.fact) await Promise.all([count(d.fact.pending(p.id)), count(d.fact.positions(p.id, null)),
        count(d.fact.journal(p.id, shiftDate(today, -(JOURNAL_DAYS - 1)), today, JOURNAL_LIMIT))]);
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
