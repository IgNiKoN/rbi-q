/**
 * P2-0048 этап 5: «моя область» в проекте План/Факта — сервер (047) уже отдаёт только её; экран показывает плашку
 * «Ваша область: …», понятное «В вашей области нет позиций», выбор «За кого» у РП и имя ответственного в истории.
 * Данные — только функции 047 и прежние: pf_my_area, pf_place_fact_owners, путь места — через ядро (fetchLocationPath). Своих правил экран не вводит:
 * отказ сервера (чужое место, место с ответственным) показывается его текстом.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { getClient } from '../../platform/auth/auth.service.ts';
import { mapCompanyError } from '../../platform/company/company.service.ts';
import type { Result } from '../../platform/company/company.service.ts';
import { fetchLocationPath } from '../../platform/core/projects.service.ts';
import { copyCall, rpcRead } from '../../platform/services/offline/copy.ts';

/** P2-0060: моя область и владельцы факта места — через копию для просмотра. */
const AREA_READS: ReadonlySet<string> = new Set(['pf_my_area', 'pf_place_fact_owners']);

/** pf_my_area: full — весь проект; locations — узлы назначений; fact_owner — узлы, где я отвечаю за факт ('project' — весь проект). */
export interface MyArea { full: boolean; locations: string[]; fact_owner: string[]; can_on_behalf: boolean }
export interface FactOwner { user_id: string; full_name: string | null; email: string | null }
export interface AreaApi {
  myArea(projectId: string): Promise<MyArea | null>;
  locationPath(locationId: string): Promise<string | null>;
  /** Ответственные за факт по месту (только тому, кто подтверждает факт; иначе — отказ сервера). */
  placeOwners(locationId: string): Promise<Result<FactOwner[]>>;
}

export function normArea(v: unknown): MyArea | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const arr = (x: unknown): string[] => (Array.isArray(x) ? x.map(String) : []);
  return { full: o.full !== false, locations: arr(o.locations), fact_owner: arr(o.fact_owner), can_on_behalf: o.can_on_behalf === true };
}

export function createAreaService(): AreaApi | null {
  const c = getClient();
  if (!c) return null;
  return {
    async myArea(project) {
      const r = await copyCall('planfact', AREA_READS, 'pf_my_area', { p_project: project }, () => rpcRead<unknown>('pf_my_area', { p_project: project }));
      return r.ok ? normArea(r.value) : null;
    },
    locationPath: fetchLocationPath,   // мастер-данные — через ядро (один вход)
    async placeOwners(loc) {
      const r = await copyCall('planfact', AREA_READS, 'pf_place_fact_owners', { p_location: loc }, async () => {
        try {
          const { data, error } = await c.rpc('pf_place_fact_owners', { p_location: loc });
          return error ? { ok: false as const, message: mapCompanyError(error) } : { ok: true as const, value: Array.isArray(data) ? data as FactOwner[] : [] };
        } catch (e) { return { ok: false as const, message: mapCompanyError({ message: e instanceof Error ? e.message : '' }) }; }
      });
      return r;
    }
  };
}

// Один сервис и общий кэш на раздел: область проекта не меняется, пока открыт экран (права — со следующего входа в раздел).
let service: AreaApi | null | undefined;
const areas = new Map<string, Promise<MyArea | null>>();
const paths = new Map<string, Promise<string | null>>();
const owners = new Map<string, Promise<Result<FactOwner[]>>>();
const names = new Map<string, string>();   // почта → ФИО (из ответственных, уже загруженных на экране)

function api(): AreaApi | null {
  if (service === undefined) service = createAreaService();
  return service;
}
/** Для тестов и смены входа: свой сервис и пустой кэш. */
export function setAreaService(s: AreaApi | null | undefined): void {
  service = s; areas.clear(); paths.clear(); owners.clear(); names.clear();
}

export function loadMyArea(projectId: string): Promise<MyArea | null> {
  const s = api();
  if (!s || !projectId) return Promise.resolve(null);
  let p = areas.get(projectId);
  if (!p) { p = s.myArea(projectId); areas.set(projectId, p); }
  return p;
}
export function loadPath(loc: string): Promise<string | null> {
  const s = api();
  if (!s) return Promise.resolve(null);
  let p = paths.get(loc);
  if (!p) { p = s.locationPath(loc); paths.set(loc, p); }
  return p;
}
export function loadOwners(loc: string): Promise<Result<FactOwner[]>> {
  const s = api();
  if (!s) return Promise.resolve({ ok: true, value: [] });
  let p = owners.get(loc);
  if (!p) {
    p = s.placeOwners(loc).then((r) => {
      if (r.ok) for (const o of r.value) if (o.email && o.full_name) names.set(o.email, o.full_name);
      return r;
    });
    owners.set(loc, p);
  }
  return p;
}

/** Подпись человека: ФИО, если уже известно на экране, иначе почта. */
export function personName(email: string | null | undefined): string {
  if (!email) return '—';
  return names.get(email) || email;
}
export function ownerLabel(o: FactOwner): string { return (o.full_name && o.full_name.trim()) || o.email || o.user_id; }

/** Хук: область вошедшего в проекте; null — ещё не известна или полный доступ не проверялся (сервер не настроен). */
export function useMyArea(projectId: string | null | undefined): MyArea | null {
  const [area, setArea] = useState<MyArea | null>(null);
  useEffect(() => {
    let live = true;
    setArea(null);
    if (projectId) void loadMyArea(projectId).then((a) => { if (live) setArea(a); });
    return () => { live = false; };
  }, [projectId]);
  return area;
}

/** Часть проекта (не весь): плашка и «В вашей области нет позиций». */
export const isPartial = (a: MyArea | null): boolean => !!a && !a.full && a.locations.length > 0;

/** «Корпус 1 · Секция 1, Секция 2»: общий путь узлов — один раз, затем их имена. */
export function areaText(list: string[]): string {
  const parts = list.filter(Boolean).map((p) => p.split(' · '));
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0].join(' · ');
  let k = 0;
  while (parts.every((p) => p.length > k + 1 && p[k] === parts[0][k])) k++;
  const head = parts[0].slice(0, k).join(' · ');
  const tails = Array.from(new Set(parts.map((p) => p.slice(k).join(' · '))));
  return (head ? head + ' · ' : '') + tails.join(', ');
}

/** Текст пустого списка: в части проекта — «В вашей области нет позиций», иначе — прежний текст экрана. */
export function emptyText(area: MyArea | null, normal: string): string {
  return isPartial(area) ? 'В вашей области нет позиций.' : normal;
}

/** Плашка в шапке раздела: «Ваша область: Корпус 1 · Секция 1, Секция 2 · вы отвечаете за факт». Полный доступ — ничего. */
export function AreaBadge(props: { projectId: string }): ReactElement | null {
  const area = useMyArea(props.projectId);
  const [text, setText] = useState('');
  useEffect(() => {
    let live = true;
    setText('');
    if (area && isPartial(area)) void Promise.all(area.locations.map(loadPath)).then((l) => { if (live) setText(areaText(l.filter((x): x is string => !!x))); });
    return () => { live = false; };
  }, [area]);
  if (!area || !isPartial(area)) return null;
  const owner = area.fact_owner.length > 0;
  return h('div', { className: 'pf-area', 'data-testid': 'pf-area', title: 'Вы назначены на часть проекта: списки, сводка и ввод факта — только по ней' },
    h('span', null, 'Ваша область: ', h('b', null, text || '…')),
    owner ? h('span', { className: 'pf-area-own', 'data-testid': 'pf-area-owner' }, 'вы отвечаете за факт') : null);
}

/** Решение «за кого» для одной позиции или пачки (owners — ответственные по месту каждой позиции). */
export type OnBehalfPlan =
  | { kind: 'none' }                                     // ответственных нет или я сам ответственный — вносится как обычно
  | { kind: 'pick'; owners: FactOwner[] }                // выбрать, за кого (обязательно)
  | { kind: 'split'; message: string };                  // пачку нужно разделить
export function onBehalfPlan(perPlace: FactOwner[][], me: string): OnBehalfPlan {
  const mine = (l: FactOwner[]): boolean => l.some((o) => !!me && o.email === me);
  const need = perPlace.filter((l) => l.length > 0 && !mine(l));
  if (!need.length) return { kind: 'none' };
  if (need.length < perPlace.length) {
    return { kind: 'split', message: 'В пачке есть места с ответственным за факт и без него — разделите пачку: отдельно места ответственного, отдельно остальные.' };
  }
  const common = need[0].filter((o) => need.every((l) => l.some((x) => x.user_id === o.user_id)));
  if (!common.length) return { kind: 'split', message: 'У мест пачки разные ответственные за факт — разделите пачку по местам (по этажу или секции).' };
  return { kind: 'pick', owners: common.filter((o) => !me || o.email !== me) };
}

/**
 * Поле «За кого» в форме ввода факта. Только у того, кто подтверждает факт (pf_my_area.can_on_behalf), и только когда у места есть
 * ответственный, а вносящий им не является. value — выбранный ответственный (user_id); check() — подсказка до отправки.
 */
export function useOnBehalf(projectId: string | null | undefined, locationIds: string[], me: string, off?: boolean): {
  plan: OnBehalfPlan; value: string; field: ReactElement | null; check: () => string;
} {
  const area = useMyArea(off ? null : projectId);
  const [plan, setPlan] = useState<OnBehalfPlan>({ kind: 'none' });
  const [value, setValue] = useState('');
  const key = Array.from(new Set(locationIds)).sort().join(',');
  useEffect(() => {
    let live = true;
    setPlan({ kind: 'none' }); setValue('');
    if (!area || !area.can_on_behalf || !key) return () => { live = false; };
    void Promise.all(key.split(',').map(loadOwners)).then((rs) => {
      if (!live) return;
      const p = onBehalfPlan(rs.map((r) => (r.ok ? r.value : [])), me);
      setPlan(p);   // выбор — явно, даже при одном ответственном: «за кого» видно в истории навсегда
    });
    return () => { live = false; };
  }, [area, key, me]);
  const field = plan.kind === 'pick'
    ? h('label', { className: 'pf-field ft-behalf', 'data-testid': 'ft-behalf' }, 'За кого',
        h('select', { className: 'pj-input', value, 'data-testid': 'ft-behalf-select', onChange: (e) => setValue((e.target as HTMLSelectElement).value) },
          h('option', { value: '' }, '— укажите ответственного —'),
          plan.owners.map((o) => h('option', { key: o.user_id, value: o.user_id }, ownerLabel(o)))),
        h('span', { className: 'pf-muted ft-behalf-note' }, 'У места есть ответственный за факт — запись уйдёт с отметкой «внёс вы за него»'))
    : plan.kind === 'split'
      ? h('div', { className: 'ft-warn ft-behalf', role: 'note', 'data-testid': 'ft-behalf-split' }, plan.message)
      : null;
  const check = (): string => (plan.kind === 'pick' && !value ? 'Укажите, за кого вносите' : plan.kind === 'split' ? plan.message : '');
  return { plan, value: plan.kind === 'pick' ? value : '', field, check };
}

/** «внёс rp@… за Иванов А. И.» / «… за вас» — строка автора записи факта. */
export function authorText(createdBy: string | null | undefined, onBehalf: string | null | undefined, me: string): string {
  const who = createdBy ? personName(createdBy) : '—';
  if (!onBehalf) return who;
  return `внёс ${who} за ${onBehalf === me ? 'вас' : personName(onBehalf)}`;
}

export const AREA_CSS = `
.pf-area{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;min-height:32px;padding:4px 12px;border-radius:10px;background:var(--p2-status-blue-bg,var(--hover-bg));color:var(--p2-status-blue-fg,var(--text-main));font-size:13px;max-width:100%;overflow-wrap:anywhere}
.pf-area b{font-weight:600}
.pf-area-own{font-weight:600;padding:1px 8px;border-radius:999px;background:var(--card-bg);white-space:nowrap}
.ft-behalf{grid-column:1/-1}
.ft-behalf-note{font-size:12px;font-weight:400}
`;
