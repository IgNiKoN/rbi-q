/**
 * P2-0060 этап 4: правило по умолчанию по роли и охват «фото и PDF заранее» (сервис «Офлайн и синхронизация»).
 * Роль — роль экрана Качества по правам сервера (roleFor, quality-bridge.ts), не название должности.
 * - Инженер, подрядчик (полевая работа: инженер СК, прораб, мастер, подрядчик): модули — держать без сети; фото — mine30
 *   (мои объекты за 30 дней + фото открытых замечаний моих объектов независимо от даты).
 * - Руководство (manager, director), гость: модули — держать без сети (только записи); фото — не скачивать заранее (открытое остаётся).
 * Применяется, пока человек сам не выбрал (выбор — у «компания + пользователь», copy.ts). Уже скачанные фото само правило не удаляет.
 */

export type FilesScope = 'mine30' | 'all30' | 'all' | 'none';
export const FILES_SCOPES: FilesScope[] = ['mine30', 'all30', 'all', 'none'];
export const FILES_SCOPE_LABEL: Record<FilesScope, string> = {
  mine30: 'Мои объекты за 30 дней', all30: 'Все за 30 дней', all: 'Все', none: 'Не скачивать заранее'
};
export const FIELD_ROLES: ReadonlySet<string> = new Set(['engineer', 'contractor']);
export const FILES_DAYS = 30;
const DAY_MS = 24 * 3600 * 1000;

export function defaultFilesScope(role: string): FilesScope {
  return FIELD_ROLES.has(role) ? 'mine30' : 'none';
}
/** База знаний (документы, TWI, тех. узлы, эталоны) заранее: полевым — все, руководству и гостю — не скачивать (решение владельца 29.10.2026). */
export type DocsScope = 'all' | 'none';
export function defaultDocsScope(role: string): DocsScope {
  return FIELD_ROLES.has(role) ? 'all' : 'none';
}
/** Выбор человека важнее правила по роли. */
export function filesScopeFor(choice: unknown, role: string): FilesScope {
  return FILES_SCOPES.includes(choice as FilesScope) ? (choice as FilesScope) : defaultFilesScope(role);
}

/** Осмотр Качества — только нужные правилу поля. state: пункт → 'ok' | 'fail' | …; photos: пункт → ссылки. */
export interface InspectionLike { id: string; date?: string; template?: string; project?: string; project_canonical_key?: string; object?: string; projectCode?: string;
  state?: Record<string, string>; photos?: Record<string, unknown> }

const ts = (r: InspectionLike): number => { const t = Date.parse(String(r.date || '')); return Number.isFinite(t) ? t : 0; };
/** Объект осмотра — те же поля, что сверка с закреплёнными объектами (object-directory.service: project_canonical_key, project). */
const objectOf = (r: InspectionLike): string => String(r.project_canonical_key || r.project || r.object || r.projectCode || '');

/**
 * Фото каких осмотров качать заранее для mine30: id осмотра → 'all' (все фото: мой объект, не старше 30 дней) или список пунктов
 * (фото открытых замечаний). Открытое замечание — пункт «не принят» (fail), который более поздний осмотр того же объекта и шаблона
 * не принял (отдельной отметки «закрыто» у осмотра нет). mine(r) — осмотр моего объекта (закреплённые объекты; не закреплено — все).
 */
export function mine30Photos(list: InspectionLike[], mine: (r: InspectionLike) => boolean, now: number, days = FILES_DAYS): Map<string, 'all' | string[]> {
  const out = new Map<string, 'all' | string[]>();
  const cutoff = now - days * DAY_MS;
  const my = list.filter((r) => r && mine(r));
  for (const r of my) if (ts(r) >= cutoff) out.set(r.id, 'all');
  // открытые замечания: по объекту и шаблону — последнее состояние каждого пункта
  const groups = new Map<string, InspectionLike[]>();
  for (const r of my) { const k = objectOf(r) + '|' + String(r.template || ''); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }
  for (const g of groups.values()) {
    g.sort((a, b) => ts(a) - ts(b));
    const last = new Map<string, { st: string; r: InspectionLike }>();
    for (const r of g) for (const [item, st] of Object.entries(r.state || {})) last.set(item, { st, r });
    for (const [item, { st, r }] of last) {
      if (st !== 'fail' || out.get(r.id) === 'all') continue;
      const cur = out.get(r.id);
      out.set(r.id, [...(Array.isArray(cur) ? cur : []), item]);
    }
  }
  return out;
}
