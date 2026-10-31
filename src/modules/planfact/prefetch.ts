/**
 * P2-0060: «держать без сети» План/Факта — заранее (с сетью, раз в сутки и по кнопке) скачать основные экраны моих проектов
 * в копию для просмотра, теми же вызовами, что делают экраны (ключи копии совпадают — без сети экран открывается, даже если не открывался).
 * Решение владельца 29.10 «Почти всё, без нагрузки» (вместо стоп-условия «> 40 чтений»): все экраны моих проектов — Сводка, Входящие,
 * ВОР (загрузки, позиции, строки загрузок), Факт (ожидания, позиции, журнал 30 дней, бригады), шахматка (дерево мест), КС-2 и сметы — по праву;
 * позиции по месту — на телефоне из всех позиций проекта (fact.service), отдельных запросов нет. Только открытое: история позиции, строки сметы,
 * акт КС-2 целиком, владельцы факта места. Объём на проект замеряется (stats).
 * P2-0078: объекты — порциями по PREFETCH_PORTION одновременно (внутри объекта запросы по одному); между порциями — idle (не мешать
 * синхронизации Качества); права объектов — одним вызовом (vor.permissions берёт их из пакета pf_my_permissions_all).
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
  ks2?: Ks2Api | null; estimate?: EstimateApi | null; today?: string;
  /** P2-0078: перед следующей порцией объектов — дождаться, пока не идёт синхронизация Качества. */
  idle?: () => Promise<void> }
export interface PrefetchStats { projects: number; reads: number; bytes: number; perProject: { id: string; reads: number; bytes: number }[]; stopped?: string }

/** Период графиков Сводки по умолчанию (Dashboard) — тот же ключ копии. */
const WEEKS = 8;
/** P2-0078: объектов «заранее» одновременно (порция). */
export const PREFETCH_PORTION = 3;

export async function prefetchPlanfact(d: PrefetchDeps): Promise<PrefetchStats> {
  const stats: PrefetchStats = { projects: 0, reads: 0, bytes: 0, perProject: [] };
  if (!d.vor || offlineNow()) return { ...stats, stopped: 'нет связи' };
  let reads = 0;
  // по одному и до первого молчания сервера: висящие запросы держат соединения, нужные синхронизации Качества
  const silent = (): boolean => offlineNow() || offlineReader().serverSilent();
  const count = async <T>(p: Promise<T>): Promise<T> => { reads++; return p; };
  const size = (): Promise<number> => Promise.all([offlineReader().size('planfact'), offlineReader().size('company')]).then(([a, b]) => a + b);
  const before = await size();   // всего на устройстве до — прирост этим проходом (первый раз — весь объём заранее)
  if (d.summary) { await count(d.summary.portfolio()); await count(d.summary.inbox()); }
  const today = d.today || todayMoscow();
  const mine = await count(d.vor.listProjects());   // участие (pf_my_projects)
  const vor = d.vor;
  async function one(p: (typeof mine)[number]): Promise<void> {
    let own = 0;
    const cnt = async <T>(x: Promise<T>): Promise<T> => { own++; return count(x); };
    const perms = await cnt(vor.permissions(p.id));
    if (d.area) await cnt(d.area(p.id));
    // ВОР: загрузки, позиции (реестр) и строки загрузок (подсказка «номер и раздел ВОР» при вводе факта)
    await cnt(vor.listImports(p.id)); await cnt(vor.listProfiles(p.id));   // профили колонок — экран ВОР читает при выборе проекта
    const vp = await cnt(vor.positions(p.id, null));
    for (const imp of new Set(vp.map((x) => x.import_id).filter(Boolean))) { if (silent()) break; await cnt(vor.importRows(imp)); }
    if (d.ks2 && (perms.includes(KS2_VIEW) || perms.includes(KS2_EDIT))) { await cnt(d.ks2.settings(p.id)); await cnt(d.ks2.acts(p.id)); }
    if (d.estimate && perms.includes(ESTIMATE_MANAGE)) await cnt(d.estimate.listEstimates(p.id));
    if (perms.includes(FACT_VIEW) && !silent()) {
      // Сводка объекта — те же вызовы, что Dashboard и ProjectView
      if (d.summary) {
        const s = d.summary;
        const jobs: Array<() => Promise<unknown>> = [() => s.weekly(p.id, WEEKS), () => s.places(p.id, null), () => s.workTypes(p.id),
          () => s.positions(p.id, null), () => s.ks2Gap(p.id), () => s.attention(p.id)];
        for (const f of jobs) {
          if (silent()) break; await cnt(f());
        }
      }
      // Факт: ждут подтверждения, позиции (и по месту — из них), журнал 30 дней (как экран); шахматка — дерево мест целиком
      if (d.fact && !silent()) { await cnt(d.fact.pending(p.id)); await cnt(d.fact.positions(p.id, null));
        await cnt(d.fact.journal(p.id, shiftDate(today, -(JOURNAL_DAYS - 1)), today, JOURNAL_LIMIT)); }
      if (d.projects && !silent()) await loadPlaces((parent) => cnt(d.projects!.listLocations(p.id, parent)));
    }
    const bytes = (await offlineReader().size('planfact', p.id)) + (await offlineReader().size('company', p.id));
    stats.perProject.push({ id: p.id, reads: own, bytes });
    stats.projects++;
  }
  for (let i = 0; i < mine.length; i += PREFETCH_PORTION) {
    if (silent()) { stats.stopped = 'связь пропала'; break; }
    if (i > 0 && d.idle) await d.idle();
    await Promise.all(mine.slice(i, i + PREFETCH_PORTION).map(one));
  }
  // бригады компаний — один раз на компанию (окно «Внести факт» их показывает)
  if (d.fact) for (const co of new Set(mine.map((p) => (p as { company_id?: string }).company_id).filter(Boolean) as string[])) { if (silent()) break; await count(d.fact.listBrigades(co, false)); }
  if (silent() && !stats.stopped) stats.stopped = 'сервер не отвечает';
  stats.reads = reads;
  stats.bytes = (await size()) - before;
  return stats;
}
