/**
 * Реестр оболочки Platform 2.0 (P2-0019, пакет А): чистые функции списка — фильтры (чипы и панель), «Только просроченные»,
 * сортировка, группы со счётчиками статусов, видимые колонки, вид ↔ строка адреса. Данных не загружает и чисел модуля не считает:
 * значения колонок, статус и «просрочено» даёт модуль (единый источник — его функция статуса).
 */
import type { ReactNode } from 'react';
import type { Status } from '../primitives.ts';

/** Колонка: value — для сортировки и выгрузки; render — ячейка на экране (по умолчанию value). */
export interface RegistryColumn<T> {
  id: string; label: string;
  value: (r: T) => string | number | null;
  render?: (r: T) => ReactNode;
  align?: 'left' | 'right';
  /** Скрыта по умолчанию (включается в «Колонки»). */
  hidden?: boolean;
  /** Не скрывается (главная колонка строки). */
  fixed?: boolean;
  /** Формат числа в Excel (например '#,##0.###'). */
  numFmt?: string;
}

/** Фильтр-чип: значение строки (одно или несколько); варианты — из строк (с подписью label) или заданы явно (порядок задан). */
export interface RegistryFilter<T> {
  id: string; label: string;
  get: (r: T) => string | string[];
  options?: { value: string; label: string }[];
  optionLabel?: (value: string) => string;
}

export interface RegistrySort { id: string; dir: 'asc' | 'desc' }
/** Вид реестра: фильтры, «просроченные», сортировка, колонки (null — по умолчанию), группировка. */
export interface RegistryState {
  f: Record<string, string[]>;
  overdue: boolean;
  sort: RegistrySort | null;
  cols: string[] | null;
  group: boolean;
}
export const EMPTY_STATE: RegistryState = { f: {}, overdue: false, sort: null, cols: null, group: true };

const ru = (a: string, b: string): number => a.localeCompare(b, 'ru', { numeric: true });
const vals = (v: string | string[]): string[] => (Array.isArray(v) ? v : [v]);

/** Строки, прошедшие все фильтры (внутри фильтра — «или», между фильтрами — «и») и «Только просроченные». */
export function filterRows<T>(rows: T[], filters: RegistryFilter<T>[], s: RegistryState, isOverdue?: (r: T) => boolean): T[] {
  const active = filters.filter((d) => (s.f[d.id] || []).length);
  return rows.filter((r) => {
    if (s.overdue && !(isOverdue && isOverdue(r))) return false;
    for (const d of active) { const want = s.f[d.id]; if (!vals(d.get(r)).some((v) => want.includes(v))) return false; }
    return true;
  });
}

/** Сортировка по колонке (числа — как числа, строки — по-русски с номерами «Корпус 7» < «Корпус 10»; пустые — в конце). */
export function sortRows<T>(rows: T[], columns: RegistryColumn<T>[], sort: RegistrySort | null): T[] {
  const col = sort ? columns.find((c) => c.id === sort.id) : undefined;
  if (!col || !sort) return rows;
  const k = sort.dir === 'desc' ? -1 : 1;
  return rows.map((r, i) => ({ r, i, v: col.value(r) })).sort((a, b) => {
    if (a.v === null || a.v === '') return b.v === null || b.v === '' ? a.i - b.i : 1;
    if (b.v === null || b.v === '') return -1;
    const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : ru(String(a.v), String(b.v));
    return c ? c * k : a.i - b.i;
  }).map((x) => x.r);
}

export interface RegistryGroup<T> { key: string; rows: T[] }
/** Группы-аккордеоны по ключу строки, по порядку номеров («Корпус 2» раньше «Корпус 10»); порядок строк внутри — как пришёл. */
export function groupRows<T>(rows: T[], key: (r: T) => string): RegistryGroup<T>[] {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); const g = m.get(k); if (g) g.push(r); else m.set(k, [r]); }
  return Array.from(m.entries()).sort((a, b) => ru(a[0], b[0])).map(([k, rs]) => ({ key: k, rows: rs }));
}

/** Мини-счётчики статусов группы: тон → число строк. */
export function countTones<T>(rows: T[], toneOf: (r: T) => Status): Partial<Record<Status, number>> {
  const c: Partial<Record<Status, number>> = {};
  for (const r of rows) { const t = toneOf(r); c[t] = (c[t] || 0) + 1; }
  return c;
}

/** Варианты фильтра с числом строк (из всех строк — счётчик не зависит от других фильтров). */
export function filterOptions<T>(rows: T[], d: RegistryFilter<T>): { value: string; label: string; count: number }[] {
  const n = new Map<string, number>();
  for (const r of rows) for (const v of vals(d.get(r))) n.set(v, (n.get(v) || 0) + 1);
  if (d.options) return d.options.map((o) => ({ ...o, count: n.get(o.value) || 0 }));
  return Array.from(n.entries()).map(([v, c]) => ({ value: v, label: d.optionLabel ? d.optionLabel(v) : v, count: c })).sort((a, b) => ru(a.label, b.label));
}

export interface RegistryChip { filter: string; value: string; label: string }
/** Чипы активных фильтров над таблицей: «Корпус: Корпус 1 ×». */
export function chipsOf<T>(s: RegistryState, filters: RegistryFilter<T>[]): RegistryChip[] {
  const out: RegistryChip[] = [];
  for (const d of filters) for (const v of s.f[d.id] || []) {
    const o = d.options?.find((x) => x.value === v);
    out.push({ filter: d.id, value: v, label: `${d.label}: ${o ? o.label : d.optionLabel ? d.optionLabel(v) : v}` });
  }
  return out;
}

/** Видимые колонки вида: по умолчанию — без hidden; закреплённые — всегда; порядок — как в описании колонок. */
export function visibleColumns<T>(columns: RegistryColumn<T>[], s: RegistryState): RegistryColumn<T>[] {
  return columns.filter((c) => c.fixed || (s.cols ? s.cols.includes(c.id) : !c.hidden));
}

export function toggleValue(s: RegistryState, filter: string, value: string): RegistryState {
  const cur = s.f[filter] || [];
  const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  const f = { ...s.f };
  if (next.length) f[filter] = next; else delete f[filter];
  return { ...s, f };
}

/** Вид → параметры адреса: f.<фильтр>=a,b · overdue=1 · sort=<колонка>:<asc|desc> · cols=a,b · group=0. Пустой вид — пустая строка. */
export function stateToQuery(s: RegistryState): string {
  const p: string[] = [];
  const enc = (v: string): string => encodeURIComponent(v);
  for (const k of Object.keys(s.f).sort()) if (s.f[k].length) p.push(`f.${enc(k)}=${s.f[k].map(enc).join(',')}`);
  if (s.overdue) p.push('overdue=1');
  if (s.sort) p.push(`sort=${enc(s.sort.id)}:${s.sort.dir}`);
  if (s.cols) p.push(`cols=${s.cols.map(enc).join(',')}`);
  if (!s.group) p.push('group=0');
  return p.join('&');
}

/** Параметры адреса → вид (неизвестное пропускается; битое кодирование — без этого параметра). */
export function queryToState(q: string): RegistryState {
  const s: RegistryState = { f: {}, overdue: false, sort: null, cols: null, group: true };
  const dec = (v: string): string | null => { try { return decodeURIComponent(v); } catch { return null; } };
  for (const part of String(q || '').replace(/^\?/, '').split('&')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i), val = part.slice(i + 1);
    const list = (): string[] => val.split(',').map(dec).filter((v): v is string => v !== null && v !== '');
    if (key.startsWith('f.')) { const id = dec(key.slice(2)); const l = list(); if (id && l.length) s.f[id] = l; }
    else if (key === 'overdue') s.overdue = val === '1';
    else if (key === 'sort') { const [id, dir] = val.split(':'); const d = dec(id || ''); if (d && (dir === 'asc' || dir === 'desc')) s.sort = { id: d, dir }; }
    else if (key === 'cols') { const l = list(); if (l.length) s.cols = l; }
    else if (key === 'group') s.group = val !== '0';
  }
  return s;
}

/** Адрес с видом: база (#/planfact/vor/positions) + «?» + параметры. */
export const linkFor = (base: string, s: RegistryState): string => { const q = stateToQuery(s); return q ? `${base}?${q}` : base; };
/** Часть адреса после «?» (или пустая строка). */
export const queryOf = (hash: string): string => { const i = String(hash || '').indexOf('?'); return i < 0 ? '' : String(hash).slice(i + 1); };
