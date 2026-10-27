/**
 * P2-0048 этап 3: блок «Требует внимания» на главной «Настроек» (вариант В) — администратору компании.
 * Данные — те же, что у вкладки «Сотрудники»: pf_my_admin_companies + pf_list_company_members (через createCompanyService),
 * новых серверных вызовов нет. Нечего показать или нет права — блока нет (контейнер пустой).
 * Этап 5: «Места без ответственного за факт» — по тем же строкам (location_id, fact_owner) и дереву мест проекта (pf_project_places,
 * как «По проектам»): только проекты, где ответственные уже назначаются (есть хоть один fact_owner); проверяются секции и объекты без
 * секций — то же правило, что метка «нет ответственного за факт» во вкладке «По проектам».
 */
import type { CompanyApi, CompanyRef, MemberRow } from './company.service.ts';
import type { ProjectsApi } from '../core/projects.service.ts';
import type { LoadPlaces, PlaceItem } from './AssignWizard.ts';
import { placesLoader } from './CompanyMembers.ts';
import { hasFactOwner, whoByNode } from './participation.ts';

export interface Attention { noRole: number; mustChange: number; disabled: number }

/** Строки «сотрудник × назначение» → счётчики по людям (каждый человек считается один раз). */
export function attentionFrom(rows: MemberRow[]): Attention {
  const people = new Map<string, { role: boolean; must: boolean; off: boolean }>();
  for (const r of rows) {
    const p = people.get(r.user_id) || { role: false, must: false, off: false };
    if (r.role_id && r.is_active !== false) p.role = true;
    if (r.must_change_password) p.must = true;
    if (r.disabled_at) p.off = true;
    people.set(r.user_id, p);
  }
  const a: Attention = { noRole: 0, mustChange: 0, disabled: 0 };
  people.forEach((p) => {
    if (p.off) { a.disabled++; return; }
    if (!p.role) a.noRole++;
    if (p.must) a.mustChange++;
  });
  return a;
}

/** 1 сотрудник, 2 сотрудника, 5 сотрудников. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Счётчики → строки блока (пустые не показываются). */
export function attentionLines(a: Attention): { text: string; tone: 'bad' | 'warn' | 'muted' }[] {
  const out: { text: string; tone: 'bad' | 'warn' | 'muted' }[] = [];
  if (a.noRole) out.push({ text: `${a.noRole} ${plural(a.noRole, 'сотрудник', 'сотрудника', 'сотрудников')} без ролей`, tone: 'bad' });
  if (a.mustChange) out.push({ text: `${a.mustChange} ${plural(a.mustChange, 'не сменил', 'не сменили', 'не сменили')} временный пароль`, tone: 'warn' });
  if (a.disabled) out.push({ text: `${a.disabled} ${plural(a.disabled, 'сотрудник отключён', 'сотрудника отключены', 'сотрудников отключены')}`, tone: 'muted' });
  return out;
}

export interface PlaceGap { project: string; place: string }

/** Места без ответственного за факт в проектах, где строгость уже включена. Дерево — объекты и их секции (2 уровня). */
export async function placesWithoutOwner(rows: MemberRow[], load: LoadPlaces): Promise<PlaceGap[]> {
  const projects = new Map<string, string>();
  for (const r of rows) if (r.project_id && r.fact_owner && r.is_active && !r.disabled_at) projects.set(r.project_id, r.project_name || '');
  const out: PlaceGap[] = [];
  for (const [pid, pname] of projects) {
    const who = whoByNode(rows, pid);
    const nodes = new Map<string, PlaceItem>();
    const check: PlaceItem[] = [];
    for (const top of await load(pid, null)) {
      nodes.set(top.id, top);
      if (!top.hasKids) { check.push(top); continue; }
      for (const k of await load(pid, top.id)) { nodes.set(k.id, k); if (k.node_type === 'section') check.push(k); }
    }
    const parentOf = (id: string): string | null => nodes.get(id)?.parent_id || null;
    const gaps = check.filter((n) => !hasFactOwner(n.id, who, parentOf));
    const dup = (n: PlaceItem): boolean => gaps.some((x) => x !== n && x.name === n.name);
    for (const n of gaps) out.push({ project: pname, place: dup(n) ? n.path : n.name });
  }
  return out;
}

/** «Места без ответственного за факт: ЖК Альфа — Секция 3, …» (не больше 4 мест в строке, остальное — «и ещё N»). */
export function gapLine(gaps: PlaceGap[]): { text: string; tone: 'warn' } | null {
  if (!gaps.length) return null;
  const shown = gaps.slice(0, 4).map((g) => `${g.project} — ${g.place}`).join(', ');
  return { text: `Места без ответственного за факт: ${shown}${gaps.length > 4 ? ` и ещё ${gaps.length - 4}` : ''}`, tone: 'warn' };
}

const ALERT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17v.01"/></svg>';
const CHEV = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

/** Компания для счётчиков: выбранная во входе платформы, если она среди администрируемых; иначе первая (как в CompanyApp). */
function pickCompany(list: CompanyRef[]): string {
  const p2 = (window as unknown as { RBI?: { platform2?: { getState?: () => { companyId?: string } } } }).RBI?.platform2;
  const cur = p2 && typeof p2.getState === 'function' ? p2.getState().companyId : '';
  return list.some((c) => c.company_id === cur) ? String(cur) : (list[0] ? list[0].company_id : '');
}

const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

let seq = 0;
/** Рисует блок в el (разметка — классы главной «Настроек», css/settings.desktop.css). Пункт ведёт в «Сотрудники и доступ». */
export async function renderAttention(el: HTMLElement, api: CompanyApi | null, projects?: ProjectsApi | null): Promise<void> {
  const my = ++seq;
  if (!api) { el.replaceChildren(); return; }
  try {
    const list = await api.myAdminCompanies();
    const companyId = pickCompany(list);
    if (!companyId) { if (my === seq) el.replaceChildren(); return; }
    const rows = await api.listMembers(companyId);
    const lines: { text: string; tone: 'bad' | 'warn' | 'muted' }[] = attentionLines(attentionFrom(rows));
    const load = placesLoader(projects);
    if (load) {
      try { const g = gapLine(await placesWithoutOwner(rows, load)); if (g) lines.push(g); } catch { /* дерево не загрузилось — пункт не показываем */ }
    }
    if (my !== seq) return;
    if (!lines.length) { el.replaceChildren(); return; }
    el.innerHTML = '<div class="stv-h">Требует внимания</div><div class="stv-list stv-att" data-testid="settings-attention">'
      + lines.map((l) => `<button type="button" class="stv-it" data-settings-go="company/members"><span class="stv-ic stv-ic--${l.tone}">${ALERT}</span>`
        + `<span class="stv-x"><b>${esc(l.text)}</b></span><span class="stv-chev">${CHEV}</span></button>`).join('') + '</div>';
  } catch {
    if (my === seq) el.replaceChildren();
  }
}
