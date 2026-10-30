/**
 * P2-0070: «Сотрудники и доступ → Кто что может» — только просмотр. Объект и место (весь объект, корпус, секция) → модуль на
 * едином механизме прав (Стройконтроль, План/Факт) → люди × действия. Колонки — группы и подписи каталога сервера (не код);
 * люди и их действия — один запрос сервера pf_who_can (то же правило, что core.can_at: участие на часть внутри места —
 * «только …»). Изменить — в «Ролях и правах» и «Сотрудниках». Телефон — карточки людей, от 760 px — таблица.
 * P2-0073: роль в строке человека ведёт в «Роли и права» (эта роль открыта), человек — в «Сотрудники» (его назначения); подсказка вверху.
 */
import { createElement as h, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { CatalogRow, CompanyApi, ProjectRef, WhoRow } from './company.service.ts';
import type { LoadPlaces, PlaceItem } from './AssignWizard.ts';
import { actionLabel, groupCatalog } from './action-groups.ts';
import type { ActionGroup } from './action-groups.ts';

/** Группы, которых нет на этом экране: прежние ключи (их читают Стройконтроль 1 и Качество, область к ним не относится). */
const SKIP_GROUPS = new Set(['Прежний доступ']);

/** Модули экрана: у модуля есть действия по участию (area_scoped) — он на едином механизме прав. */
export function whoModules(catalog: CatalogRow[]): { code: string; name: string; groups: ActionGroup[] }[] {
  const mods = new Map<string, { code: string; name: string; groups: ActionGroup[] }>();
  for (const g of groupCatalog(catalog)) {
    if (!g.module || SKIP_GROUPS.has(g.title)) continue;
    const m = mods.get(g.module) || { code: g.module, name: g.moduleName || g.module, groups: [] };
    m.groups.push(g);
    mods.set(g.module, m);
  }
  return Array.from(mods.values()).filter((m) => m.groups.some((g) => g.items.some((i) => i.area_scoped)));
}

/** Где у человека участие; у части объекта — «только Корпус 1 · Секция 2». */
export function whereText(r: WhoRow): string {
  return r.places.map((p) => (r.partial && p !== 'весь объект' && p !== 'вся компания' ? 'только ' + p : p)).join(', ');
}
/** «Роль · где». */
export function whoLine(r: WhoRow): string {
  return r.roles.join(', ') + ' · ' + whereText(r);
}

/** P2-0073: куда ведут нажатия — вкладка «Роли и права» / «Сотрудники» и id роли или человека (пусто — просто вкладка). */
export type OpenSetting = (tab: 'roles' | 'members', id: string) => void;

export function CompanyWho(props: { api: CompanyApi; companyId: string; loadPlaces: LoadPlaces | null; onOpen?: OpenSetting }): ReactElement {
  const { api, companyId, onOpen } = props;
  const loadRef = useRef(props.loadPlaces);   // загрузчик мест создаётся при каждой отрисовке раздела — берём последний
  loadRef.current = props.loadPlaces;
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [projects, setProjects] = useState<ProjectRef[] | null>(null);
  const [project, setProject] = useState('');
  const [places, setPlaces] = useState<(PlaceItem & { depth: number })[]>([]);
  const [place, setPlace] = useState('');
  const [mod, setMod] = useState('');
  const [rows, setRows] = useState<WhoRow[] | null>(null);
  const [error, setError] = useState('');
  const [roleIds, setRoleIds] = useState<Map<string, string>>(new Map());   // название роли → id (сервер отдаёт названия)

  useEffect(() => {
    void Promise.all([api.catalog(), api.listProjects()]).then(([c, p]) => {
      const mine = p.filter((x) => x.company_id === companyId && !x.archived_at);
      setCatalog(c); setProjects(mine); setProject((cur) => cur || (mine[0] ? mine[0].id : ''));
    });
    if (onOpen) void api.listRoles(companyId).then((r) => setRoleIds(new Map(r.map((x) => [x.name, x.id]))), () => undefined);
  }, [api, companyId]);
  // места выбора: корпуса и их секции (как в мастере участия — то же дерево мест проекта)
  useEffect(() => {
    setPlaces([]); setPlace('');
    const loadPlaces = loadRef.current;
    if (!project || !loadPlaces) return;
    let live = true;
    void (async () => {
      const roots = await loadPlaces(project, null).catch(() => [] as PlaceItem[]);
      const out: (PlaceItem & { depth: number })[] = [];
      for (const r of roots) {
        out.push({ ...r, depth: 1 });
        if (r.hasKids) for (const k of await loadPlaces(project, r.id).catch(() => [] as PlaceItem[])) out.push({ ...k, depth: 2 });
      }
      if (live) setPlaces(out);
    })();
    return () => { live = false; };
  }, [project]);
  useEffect(() => {
    if (!project) return;
    let live = true;
    setRows(null); setError('');
    void api.whoCan(companyId, project, place || null).then((r) => {
      if (!live) return;
      if (r.ok) setRows(r.value); else { setRows([]); setError(r.message); }
    });
    return () => { live = false; };
  }, [api, companyId, project, place]);

  const mods = whoModules(catalog);
  const cur = mods.find((m) => m.code === mod) || mods[0];
  if (projects && !projects.length) return h('div', { className: 'pf-muted', 'data-testid': 'co-who' }, 'В компании нет объектов — добавьте их в «Проекты и объекты».');
  const list = (rows || []).filter((r) => cur && r.actions.some((a) => a.startsWith(cur.code + '.')));
  const has = (r: WhoRow, a: string) => r.actions.includes(a);
  const firm = (r: WhoRow) => (r.firm ? h('span', { className: 'cw-tag' }, 'только записи фирмы ' + r.firm) : null);
  const items = cur ? cur.groups.flatMap((g) => g.items.map((it, i) => ({ g, it, first: i === 0 }))) : [];
  const tabLink = (t: 'roles' | 'members', text: string) => (onOpen
    ? h('button', { type: 'button', className: 'cw-link', 'data-testid': 'co-who-go-' + t, onClick: () => onOpen(t, '') }, '«' + text + '»') : '«' + text + '»');
  // человек → «Сотрудники» (его назначения); роль → «Роли и права» (эта роль); где — текстом
  const person = (r: WhoRow) => [
    onOpen ? h('button', { type: 'button', className: 'cw-link cw-name', 'data-testid': 'co-who-person', 'data-user': r.user_id, title: 'Открыть в «Сотрудниках»',
      onClick: () => onOpen('members', r.user_id) }, r.full_name || r.email) : h('b', null, r.full_name || r.email),
    h('span', null, r.roles.flatMap((name, i) => {
      const id = roleIds.get(name);
      const el = onOpen && id ? h('button', { key: name, type: 'button', className: 'cw-link cw-role', 'data-testid': 'co-who-role', 'data-role': id,
        title: 'Открыть в «Ролях и правах»', onClick: () => onOpen('roles', id) }, name) : name;
      return i ? [', ', el] : [el];
    }), ' · ' + whereText(r)),
    firm(r)];

  return h('div', { className: 'cw', 'data-testid': 'co-who' },
    h('div', { className: 'cw-bar' },
      h('label', { className: 'pf-field' }, 'Объект',
        h('select', { className: 'co-select', 'data-testid': 'co-who-project', value: project, onChange: (e: { target: { value: string } }) => setProject(e.target.value) },
          (projects || []).map((p) => h('option', { key: p.id, value: p.id }, p.name)))),
      h('label', { className: 'pf-field' }, 'Место',
        h('select', { className: 'co-select', 'data-testid': 'co-who-place', value: place, onChange: (e: { target: { value: string } }) => setPlace(e.target.value) },
          h('option', { value: '' }, 'Весь объект'),
          places.map((p) => h('option', { key: p.id, value: p.id }, (p.depth > 1 ? '— ' : '') + p.name))))),
    mods.length > 1 ? h('div', { className: 'co-tabs', role: 'tablist', 'data-testid': 'co-who-modules' },
      mods.map((m) => h('button', { key: m.code, type: 'button', role: 'tab', 'aria-selected': m === cur, 'data-mod': m.code,
        className: 'co-tab' + (m === cur ? ' co-tab--active' : ''), onClick: () => setMod(m.code) }, m.name))) : null,
    h('div', { className: 'cw-help', 'data-testid': 'co-who-help' }, 'Здесь только смотреть. Что может роль — ', tabLink('roles', 'Роли и права'),
      '; кому какая роль и где — ', tabLink('members', 'Сотрудники'), '.', onOpen ? ' Нажмите на роль или на человека — откроется его настройка.' : ''),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    rows === null ? h('div', { className: 'pf-muted' }, 'Загрузка…')
      : !cur || !list.length ? h('div', { className: 'cw-card cw-empty', 'data-testid': 'co-who-empty' }, 'Здесь никто не может ничего в этом модуле.')
      : h('div', null,
        h('div', { className: 'cw-card cw-wide' }, h('div', { className: 'cw-scroll' },
          h('table', { className: 'cw-t', 'data-testid': 'co-who-table' },
            h('thead', null,
              h('tr', null, h('th', { className: 'cw-who cw-head', rowSpan: 2 }, 'Сотрудник · роль · где'),
                cur.groups.map((g) => h('th', { key: g.key, className: 'cw-g', colSpan: g.items.length }, g.title))),
              h('tr', null, items.map(({ it, first }) => h('th', { key: it.action, className: 'cw-col' + (first ? ' cw-g' : ''), title: actionLabel(it) },
                h('span', { className: 'cw-v' }, actionLabel(it)))))),
            h('tbody', null, list.map((r) => h('tr', { key: r.user_id, 'data-user': r.user_id },
              h('td', { className: 'cw-who' }, ...person(r)),
              items.map(({ it, first }) => h('td', { key: it.action, className: first ? 'cw-g' : undefined, 'data-action': it.action },
                has(r, it.action) ? h('span', { className: 'cw-yes', title: actionLabel(it), 'aria-label': 'может' }, '✓')
                  : h('span', { className: 'cw-no', 'aria-label': 'не может' }, '—'))))))))),
        h('div', { className: 'cw-list' }, list.map((r) => h('div', { key: r.user_id, className: 'cw-p', 'data-user': r.user_id },
          h('div', { className: 'cw-who' }, ...person(r)),
          cur.groups.map((g) => h('div', { key: g.key, className: 'cw-pg' }, h('i', null, g.title),
            h('div', { className: 'cw-chips' }, g.items.map((it) => h('span', { key: it.action, className: 'cw-chip ' + (has(r, it.action) ? 'on' : 'off') },
              (has(r, it.action) ? '✓ ' : '') + actionLabel(it)))))))))));
}

export const COMPANY_WHO_CSS = `
.cw{display:flex;flex-direction:column;gap:12px;min-width:0}
.cw-bar{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:8px 12px;max-width:760px}
.cw-bar .co-select{width:100%}
.cw-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;box-shadow:var(--shadow-card);overflow:hidden}
.cw-empty{padding:16px;color:var(--text-muted);font-size:13px}
.cw-scroll{overflow-x:auto}
.cw-t{border-collapse:separate;border-spacing:0;font-size:13px;width:100%}
.cw-t th,.cw-t td{padding:6px 0;border-bottom:1px solid var(--card-border);text-align:center;vertical-align:middle}
.cw-t thead tr:first-child th{font-size:12px;font-weight:700;color:var(--text-main);border-bottom:0;padding:10px 4px 2px}
.cw-t th.cw-col{font-size:11.5px;font-weight:500;color:var(--text-muted);vertical-align:bottom;height:200px;width:34px;min-width:34px;padding:6px 0}
.cw-v{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;display:inline-block;max-height:195px;overflow:hidden;text-overflow:ellipsis}
.cw-t .cw-g{border-left:1px solid var(--card-border)}
.cw-t .cw-who{text-align:left;width:230px;min-width:200px;padding:8px 10px 8px 14px}
.cw-t .cw-head{vertical-align:bottom;font-size:12px;color:var(--text-muted);font-weight:600}
.cw-who b{display:block;font-size:14px;font-weight:600;color:var(--text-main)}
.cw-help{font-size:14px;line-height:1.5;color:var(--text-main);background:var(--card-bg);border:1px solid var(--card-border);border-radius:12px;padding:10px 14px;max-width:760px}
.cw-link{font:inherit;color:var(--primary);background:none;border:0;padding:0;margin:0;cursor:pointer;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;text-align:left}
.cw-link:hover{color:var(--accent,var(--primary))}
.cw-link:focus-visible{outline:2px solid var(--primary);outline-offset:2px;border-radius:4px}
.cw-who .cw-name{display:block;font-size:14px;font-weight:600}
.cw-p .cw-who .cw-name{font-size:15px;min-height:32px}
.cw-who span{display:block;font-size:12px;color:var(--text-muted)}
.cw-yes{display:inline-flex;width:20px;height:20px;border-radius:7px;align-items:center;justify-content:center;background:var(--accent,var(--primary));color:#fff;font-size:12px;font-weight:700}
.cw-no{color:var(--text-muted);opacity:.45}
.cw-who .cw-tag{display:inline-block;margin-top:3px;font-size:11.5px;padding:1px 6px;border-radius:6px;background:var(--hover-bg);color:var(--text-main)}
.cw-list{display:none;flex-direction:column;gap:10px}
.cw-p{background:var(--card-bg);border:1px solid var(--card-border);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px}
.cw-p .cw-who b{font-size:15px}
.cw-pg{display:flex;flex-direction:column;gap:5px}
.cw-pg i{font-style:normal;font-size:12px;font-weight:600;color:var(--text-muted)}
.cw-chips{display:flex;flex-wrap:wrap;gap:6px}
.cw-chip{font-size:12.5px;padding:5px 8px;border-radius:8px;border:1px solid var(--card-border);line-height:1.2}
.cw-chip.on{background:var(--accent,var(--primary));border-color:var(--accent,var(--primary));color:#fff}
.cw-chip.off{color:var(--text-muted);opacity:.6}
@media (max-width:760px){.cw-wide{display:none}.cw-list{display:flex}}
`;
