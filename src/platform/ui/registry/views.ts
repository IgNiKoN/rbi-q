/**
 * Сохранённые виды реестра (P2-0019, приём 1.6): личные — на этом устройстве, отдельно для каждой компании и пользователя;
 * коллеге — ссылкой (параметры вида в адресе, см. model.ts linkFor). Сервер не участвует. Без хранилища (частный режим) — пусто, без ошибок.
 */
import type { RegistryState } from './model.ts';
import { queryToState, stateToQuery } from './model.ts';

export interface SavedView { name: string; query: string }
export interface ViewScope { registry: string; company: string; user: string }

const key = (s: ViewScope): string => `p2-registry-views:${s.registry}:${s.company}:${s.user}`;
const MAX = 20;

export function listViews(s: ViewScope): SavedView[] {
  try {
    const raw = window.localStorage.getItem(key(s));
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => x && typeof x.name === 'string' && typeof x.query === 'string') : [];
  } catch { return []; }
}

function write(s: ViewScope, list: SavedView[]): boolean {
  try { window.localStorage.setItem(key(s), JSON.stringify(list)); return true; } catch { return false; }
}

/** Сохранить вид под именем (то же имя — заменяет). false — хранилище недоступно или имя пустое. */
export function saveView(s: ViewScope, name: string, state: RegistryState): boolean {
  const n = name.trim().slice(0, 60);
  if (!n) return false;
  const rest = listViews(s).filter((v) => v.name !== n);
  return write(s, [...rest, { name: n, query: stateToQuery(state) }].slice(-MAX));
}

export function deleteView(s: ViewScope, name: string): boolean {
  return write(s, listViews(s).filter((v) => v.name !== name));
}

export const viewState = (v: SavedView): RegistryState => queryToState(v.query);

/**
 * Вид → адрес (P2-0020, общий для реестров модулей): base?параметры через history.replaceState, без перехода роутера, — ссылка из
 * адресной строки открывает тот же вид. Адрес не этого реестра (ушли в другой раздел) не трогается; без истории — вид только на экране.
 */
export function syncRegistryAddress(base: string, s: RegistryState): void {
  try {
    const cur = String(window.location.hash || '');
    if (cur !== base && !cur.startsWith(base + '?')) return;
    const q = stateToQuery(s);
    const next = q ? `${base}?${q}` : base;
    if (cur !== next) window.history.replaceState(window.history.state, '', next);
  } catch { /* без истории — вид остаётся только на экране */ }
}
