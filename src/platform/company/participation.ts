/**
 * P2-0048 этап 4: «Сотрудники и доступ» — чистые правила экрана (без React): люди из строк pf_list_company_members,
 * назначения человека, сгруппированные по «роль × проект» (так их меняет pf_set_participation), строка «где работает»,
 * фильтры-счётчики, итог мастера простыми словами, кто без ответственного за факт в дереве проекта.
 * Права и правила проверяет сервер (047); здесь — только подписи и подсказки.
 */
import type { MemberRow, ParticipationResult, QualityObjectRef, RoleRow } from './company.service.ts';
import { plural } from './CompanyHome.ts';

const DAY = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short' });
const SCOPE_CONTRACTOR = 'quality.scope.contractor';

export interface Person {
  user_id: string; email: string; name: string; items: MemberRow[];
  disabled: boolean; mustChange: boolean; managed: boolean;
}

/** Строки «сотрудник × назначение» → люди (порядок сервера сохраняется). */
export function people(rows: MemberRow[]): Person[] {
  const map = new Map<string, Person>();
  for (const r of rows) {
    const p = map.get(r.user_id) || { user_id: r.user_id, email: r.email || '—', name: r.full_name || '', items: [],
      disabled: !!r.disabled_at, mustChange: r.must_change_password === true, managed: r.managed === true };
    if (r.assignment_id) p.items.push(r);
    map.set(r.user_id, p);
  }
  return Array.from(map.values());
}

/** Инициалы для кружка: «Петров П. П.» → «ПП», почта → первая буква. */
export function initials(p: { name: string; email: string }): string {
  const w = (p.name || '').replace(/[.]/g, ' ').split(/\s+/).filter(Boolean);
  if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase();
  return ((w[0] || p.email || '?')[0] || '?').toUpperCase();
}

/** Срок назначения: до дд.мм.гг / бессрочно / истекло дд.мм.гг / с дд.мм.гг / не действует. */
export function status(r: MemberRow): string {
  if (r.is_active) return r.valid_to ? `до ${DAY.format(new Date(r.valid_to))}` : 'бессрочно';
  if (r.valid_to && new Date(r.valid_to) <= new Date()) return `истекло ${DAY.format(new Date(r.valid_to))}`;
  return r.valid_from ? `с ${DAY.format(new Date(r.valid_from))}` : 'не действует';
}

/** Что может роль: доступ к Качеству / План/Факту, нужна ли фирма подрядчика (как в 047: Качество = quality.* или construction.*). */
export function roleKind(r: RoleRow | null | undefined): { quality: boolean; planfact: boolean; qualityOnly: boolean; firm: boolean } {
  const a = r ? r.actions : [];
  const quality = a.some((x) => x.startsWith('quality.') || x.startsWith('construction.'));
  const planfact = a.some((x) => x.startsWith('planfact.'));
  return { quality, planfact, qualityOnly: quality && !planfact, firm: a.includes(SCOPE_CONTRACTOR) };
}

/** Назначения человека одной роли в одном проекте (или на всю компанию) — их вместе меняет и отзывает «Изменить». */
export interface Group {
  key: string; role_id: string; role_name: string; project_id: string | null; project_name: string | null;
  counterparty_id: string | null; counterparty_name: string | null; items: MemberRow[];
  /** Места (узлы дерева); пусто — весь проект / вся компания. */
  places: { id: string; path: string }[];
  factOwner: boolean; active: boolean; validTo: string | null; status: string; objects: QualityObjectRef[];
}

export function groupsOf(items: MemberRow[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of items) {
    if (!r.assignment_id || !r.role_id) continue;
    const key = r.role_id + '|' + (r.project_id || '');
    let g = map.get(key);
    if (!g) {
      g = { key, role_id: r.role_id, role_name: r.role_name || '', project_id: r.project_id, project_name: r.project_name,
        counterparty_id: r.counterparty_id || null, counterparty_name: r.counterparty_name || null, items: [], places: [],
        factOwner: false, active: false, validTo: null, status: '', objects: [] };
      map.set(key, g);
    }
    g.items.push(r);
    if (r.location_id) g.places.push({ id: r.location_id, path: r.location_path || '' });
    if (r.fact_owner && r.is_active) g.factOwner = true;
    if (r.quality_objects && r.quality_objects.length && !g.objects.length) g.objects = r.quality_objects;
  }
  for (const g of map.values()) {
    const act = g.items.find((x) => x.is_active);
    g.active = !!act;
    const lead = act || g.items[0];
    g.validTo = lead.valid_to; g.status = status(lead);
    if (!g.counterparty_id && act && act.counterparty_id) { g.counterparty_id = act.counterparty_id; g.counterparty_name = act.counterparty_name || null; }
  }
  return Array.from(map.values());
}

/** Пути мест без общего начала: «Корпус 1 · Секция 1», «Корпус 1 · Секция 2» → «Секция 1», «Секция 2». */
export function shortPlaces(paths: string[]): string[] {
  const split = paths.map((p) => p.split(' · '));
  if (!split.length) return [];
  let common = 0;
  const min = Math.min(...split.map((s) => s.length));
  while (common < min - 1 && split.every((s) => s[common] === split[0][common])) common++;
  return split.map((s) => s.slice(common).join(' · '));
}

/** Где действует группа: «Секция 1, Секция 2» / «весь проект» / «вся компания». */
/** P2-0071: назначение на проект-контейнер Качества — «Без объектов» (только общие разделы: база знаний, ИИ, справочники). */
export const NO_OBJECTS = 'Без объектов';

export function groupWhere(g: Group): string {
  if (g.project_name === NO_OBJECTS) return 'только общие разделы';
  if (g.places.length) return shortPlaces(g.places.map((p) => p.path)).join(', ');
  return g.project_id ? 'весь проект' : 'вся компания';
}

/** Одна строка «где работает» для списка: «Прораб · ЖК Альфа (Секция 1, Секция 2), ЖК Бета; Инженер СК · Качество: …». */
export function whereLine(p: Person): string {
  if (p.disabled) return 'доступ отключён';
  const gs = groupsOf(p.items).filter((g) => g.active);
  if (!gs.length) return 'нет ролей';
  const byRole = new Map<string, string[]>();
  for (const g of gs) {
    const part = g.project_id
      ? (g.project_name || 'проект') + (g.places.length ? ` (${groupWhere(g)})` : '')
      : g.objects.length ? 'Качество: ' + g.objects.map((o) => o.name).join(', ') : 'вся компания' + (g.counterparty_name ? ` (${g.counterparty_name})` : '');
    const list = byRole.get(g.role_name) || [];
    list.push(part);
    byRole.set(g.role_name, list);
  }
  return Array.from(byRole, ([role, parts]) => `${role} · ${parts.join(', ')}`).join('; ');
}

export type Filter = 'all' | 'norole' | 'mustchange' | 'disabled';
export function personFlags(p: Person): { noRole: boolean; mustChange: boolean; disabled: boolean; factOwner: boolean } {
  const active = p.items.some((r) => r.is_active !== false && r.role_id);
  return { noRole: !p.disabled && !active, mustChange: !p.disabled && p.mustChange, disabled: p.disabled,
    factOwner: !p.disabled && p.items.some((r) => r.is_active && r.fact_owner) };
}
export function matches(p: Person, f: Filter, q: string): boolean {
  const fl = personFlags(p);
  if (f === 'norole' && !fl.noRole) return false;
  if (f === 'mustchange' && !fl.mustChange) return false;
  if (f === 'disabled' && !fl.disabled) return false;
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [p.name, p.email, ...p.items.map((r) => (r.project_name || '') + ' ' + (r.role_name || '') + ' ' + (r.location_path || ''))].join(' ').toLowerCase();
  return s.split(/\s+/).every((w) => hay.includes(w));
}
export function counts(list: Person[]): Record<Filter, number> {
  const c: Record<Filter, number> = { all: list.length, norole: 0, mustchange: 0, disabled: 0 };
  for (const p of list) { const f = personFlags(p); if (f.noRole) c.norole++; if (f.mustChange) c.mustchange++; if (f.disabled) c.disabled++; }
  return c;
}

/** Итог мастера: «Петров П. П., Сидорова Е. В. → Прораб · ЖК Альфа · Секция 1, Секция 2 · отвечают за факт · бессрочно». */
export function wizardSummary(o: {
  names: string[]; role: string; project: string | null; places: string[]; factOwner: boolean; until: string;
  firm?: string | null; objects?: string[];
  /** P2-0071: сколько объектов выбрано (несколько — по назначению на каждый, целиком). */
  projects?: number;
}): { who: string; what: string; count: number; countText: string } {
  const many = o.names.length > 1;
  const parts = [o.role, o.project || 'вся компания'];
  if (o.project && o.project !== NO_OBJECTS) parts.push(o.places.length ? shortPlaces(o.places).join(', ') : (o.projects || 1) > 1 ? 'объекты целиком' : 'весь проект');
  if (!o.project && o.objects) parts.push(o.objects.length ? 'объекты Качества: ' + o.objects.join(', ') : 'все объекты Качества');
  if (o.firm) parts.push('фирма: ' + o.firm);
  if (o.project && o.factOwner) parts.push(many ? 'отвечают за факт' : 'отвечает за факт');
  parts.push(o.until ? `до ${DAY.format(new Date(`${o.until}T12:00:00`))}` : 'бессрочно');
  const count = o.names.length * Math.max(1, o.project ? o.places.length : 1) * Math.max(1, o.projects || 1);
  return { who: o.names.join(', '), what: parts.join(' · '), count,
    countText: `Будет ${count} ${plural(count, 'назначение', 'назначения', 'назначений')}` };
}

/** Ответ pf_set_participation → понятное сообщение. */
export function resultText(r: ParticipationResult): string {
  if (!r.added && !r.changed && !r.revoked) return 'Ничего не изменилось — такое участие уже действует';
  return `Добавлено ${r.added}, изменено ${r.changed}, отозвано ${r.revoked} — права действуют со следующего запроса`;
}

/** Дата из поля «Срок до» → конец этого дня по местному времени. Пусто → бессрочно. */
export function endOfDayIso(date: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
/** Срок назначения → значение поля даты (местный день); прошедший срок — пусто (сервер не примет прошедшую дату). */
export function dateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d <= new Date()) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Кто назначен на узел проекта (по строкам участников) и есть ли ответственный за факт на нём самом. */
export interface NodeWho { user_id: string; name: string; role: string; factOwner: boolean }
export function whoByNode(rows: MemberRow[], projectId: string): Map<string, NodeWho[]> {
  const out = new Map<string, NodeWho[]>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.project_id !== projectId || !r.is_active || r.disabled_at || !r.assignment_id) continue;
    const k = r.location_id || '';
    const id = k + '|' + r.user_id + '|' + r.role_id;
    if (seen.has(id)) continue;
    seen.add(id);
    const list = out.get(k) || [];
    list.push({ user_id: r.user_id, name: shortName(r.full_name || r.email || ''), role: r.role_name || '', factOwner: !!r.fact_owner });
    out.set(k, list);
  }
  return out;
}
/** «Петров Пётр Петрович» / «Петров П. П.» → «Петров». */
export function shortName(s: string): string {
  return (s.split(/\s+/)[0] || s).replace(/@.*$/, '');
}
/** Есть ли ответственный за факт на узле или выше (вплоть до «весь проект»). parentOf — родитель узла (из загруженного дерева). */
export function hasFactOwner(nodeId: string, who: Map<string, NodeWho[]>, parentOf: (id: string) => string | null): boolean {
  if ((who.get('') || []).some((w) => w.factOwner)) return true;
  let cur: string | null = nodeId;
  for (let guard = 0; cur && guard < 50; guard++) {
    if ((who.get(cur) || []).some((w) => w.factOwner)) return true;
    cur = parentOf(cur);
  }
  return false;
}

/** Намерение с главной «Настроек» («+ Назначить», «+ Сотрудник») — экран сотрудников открывает мастер или форму. */
export type Intent = 'assign' | 'add';
export function takeIntent(): Intent | null {
  const w = window as unknown as { RBI?: { companyIntent?: string } };
  const v = w.RBI ? w.RBI.companyIntent : undefined;
  if (w.RBI) w.RBI.companyIntent = undefined;
  return v === 'assign' || v === 'add' ? v : null;
}
