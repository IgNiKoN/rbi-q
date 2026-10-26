/**
 * «Структура проекта»: дерево локаций (корпус → секция → этаж → квартира, уровни можно пропускать) и генератор корпуса.
 * Дети грузятся лениво — при раскрытии узла (дерево на тысячи квартир не грузится целиком).
 * Без права planfact.projects.manage (can_manage) — только просмотр. Права проверяет сервер.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { PLAN_NODE_LABELS, PLAN_NODE_TYPES, SUGGESTED_CHILD } from '../../services/locations/types.ts';
import type { PlanNodeType } from '../../services/locations/types.ts';
import { GENERATE_LIMIT, generatedNodeCount } from '../core/projects.service.ts';
import type { LocationNode, ProjectItem, ProjectsApi } from '../core/projects.service.ts';

type Mode = { kind: 'add'; parent: LocationNode | null } | { kind: 'rename'; node: LocationNode } | { kind: 'delete'; node: LocationNode } | null;

function num(v: string, fallback: number): number {
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function LocationsTree(props: { api: ProjectsApi; project: ProjectItem; canManage: boolean; onBack: () => void }): ReactElement {
  const { api, project, canManage, onBack } = props;
  const manage = canManage && project.can_manage && !project.archived_at;
  const [kids, setKids] = useState<Record<string, LocationNode[]>>({});   // '' = корень
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<Mode>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [gen, setGen] = useState({ name: 'Корпус 1', sections: '1', floors: '5', apf: '4', first: '1' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadKids(parent: string | null): Promise<void> {
    const list = await api.listLocations(project.id, parent);
    setKids((k) => ({ ...k, [parent || '']: list }));
  }
  useEffect(() => { void loadKids(null); }, []);

  async function reload(parent: string | null): Promise<void> {
    await loadKids(parent);
    if (parent) {   // счётчик потомков у родителя родителя обновится при следующем раскрытии; обновим сам родитель в его списке
      const grand = Object.entries(kids).find(([, l]) => l.some((n) => n.id === parent));
      if (grand) await loadKids(grand[0] || null);
    }
  }

  async function toggle(n: LocationNode): Promise<void> {
    const next = !open[n.id];
    setOpen((o) => ({ ...o, [n.id]: next }));
    if (next && !kids[n.id]) await loadKids(n.id);
  }

  async function act(p: Promise<{ ok: boolean; message?: string }>, done: string, parent: string | null): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    const res = await p;
    setBusy(false);
    if (!res.ok) { setError(res.message || 'Не удалось выполнить'); return false; }
    setNotice(done);
    if (parent) setOpen((o) => ({ ...o, [parent]: true }));
    await reload(parent);
    return true;
  }

  async function add(ev: FormEvent, parent: LocationNode | null): Promise<void> {
    ev.preventDefault();
    if (busy) return;
    const f = ev.currentTarget as HTMLFormElement;
    const name = (f.elements.namedItem('name') as HTMLInputElement).value.trim();
    const type = (f.elements.namedItem('type') as HTMLSelectElement).value as PlanNodeType;
    if (!name) { setError('Введите название'); return; }
    if (await act(api.addLocation(project.id, parent ? parent.id : null, type, name), 'Узел добавлен', parent ? parent.id : null)) setMode(null);
  }

  async function rename(ev: FormEvent, n: LocationNode): Promise<void> {
    ev.preventDefault();
    if (busy) return;
    const name = ((ev.currentTarget as HTMLFormElement).elements.namedItem('name') as HTMLInputElement).value.trim();
    if (!name) { setError('Введите название'); return; }
    if (await act(api.renameLocation(n.id, name), 'Название сохранено', n.parent_id)) setMode(null);
  }

  async function remove(n: LocationNode): Promise<void> {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    const res = await api.deleteLocation(n.id, n.child_count > 0);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setMode(null); setNotice(`Удалено узлов: ${res.value}`);
    setKids((k) => { const c = { ...k }; delete c[n.id]; return c; });
    await reload(n.parent_id);
  }

  const total = generatedNodeCount(Math.max(num(gen.sections, 0), 0), Math.max(num(gen.floors, 0), 0), Math.max(num(gen.apf, 0), 0));
  const valid = num(gen.sections, 0) >= 1 && num(gen.floors, 0) >= 1 && num(gen.apf, -1) >= 0 && gen.name.trim() !== '';
  const tooMany = total > GENERATE_LIMIT;

  async function generate(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    if (busy || !valid || tooMany) return;
    setBusy(true); setError(''); setNotice('');
    const res = await api.generateBuilding({ projectId: project.id, parentId: null, name: gen.name.trim(), sections: num(gen.sections, 1),
      floors: num(gen.floors, 1), apartmentsPerFloor: num(gen.apf, 0), firstFloor: num(gen.first, 1) });
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setNotice(`Корпус создан: ${total} узлов`); setGenOpen(false);
    await loadKids(null);
  }

  function addForm(parent: LocationNode | null): ReactElement {
    const suggested = SUGGESTED_CHILD[parent ? parent.node_type : 'root'];
    return h('form', { className: 'lt-form', onSubmit: (e: FormEvent) => { void add(e, parent); }, 'data-testid': 'lt-add-form' },
      h('select', { name: 'type', className: 'pj-input', defaultValue: suggested, 'aria-label': 'Уровень' },
        PLAN_NODE_TYPES.map((t) => h('option', { key: t, value: t }, PLAN_NODE_LABELS[t] + (t === suggested ? ' (подсказка)' : '')))),
      h('input', { name: 'name', type: 'text', className: 'pj-input pj-grow', placeholder: 'Название', 'aria-label': 'Название', maxLength: 200, autoFocus: true }),
      h('button', { type: 'submit', className: 'pf-btn', disabled: busy }, 'Добавить'),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => { setMode(null); setError(''); } }, 'Отмена'));
  }

  function row(n: LocationNode): ReactElement {
    const isOpen = !!open[n.id];
    const editing = mode && mode.kind === 'rename' && mode.node.id === n.id;
    const deleting = mode && mode.kind === 'delete' && mode.node.id === n.id;
    const adding = mode && mode.kind === 'add' && mode.parent && mode.parent.id === n.id;
    return h('li', { key: n.id, className: 'lt-item', 'data-node-id': n.id },
      h('div', { className: 'lt-row' },
        n.child_count > 0
          ? h('button', { type: 'button', className: 'lt-toggle', 'aria-expanded': isOpen, 'aria-label': isOpen ? 'Свернуть' : 'Раскрыть', onClick: () => { void toggle(n); } }, isOpen ? '▾' : '▸')
          : h('span', { className: 'lt-toggle lt-toggle--leaf' }, '·'),
        editing
          ? h('form', { className: 'lt-form lt-grow', onSubmit: (e: FormEvent) => { void rename(e, n); } },
              h('input', { name: 'name', type: 'text', className: 'pj-input pj-grow', defaultValue: n.name, maxLength: 200, 'aria-label': 'Название', autoFocus: true }),
              h('button', { type: 'submit', className: 'pf-btn', disabled: busy }, 'Сохранить'),
              h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => { setMode(null); setError(''); } }, 'Отмена'))
          : h('div', { className: 'lt-name lt-grow' }, h('b', null, n.name), h('span', { className: 'pj-badge' }, PLAN_NODE_LABELS[n.node_type]),
              n.child_count > 0 ? h('span', { className: 'pf-muted lt-count' }, String(n.child_count)) : null),
        manage && !editing && !deleting ? h('div', { className: 'lt-actions' },
          h('button', { type: 'button', className: 'pf-btn pf-btn--ghost lt-btn', 'data-testid': 'lt-add', disabled: busy, onClick: () => { setMode({ kind: 'add', parent: n }); setError(''); } }, '+ Узел'),
          h('button', { type: 'button', className: 'pf-btn pf-btn--ghost lt-btn', 'data-testid': 'lt-rename', disabled: busy, onClick: () => { setMode({ kind: 'rename', node: n }); setError(''); } }, 'Переименовать'),
          h('button', { type: 'button', className: 'pf-btn pf-btn--ghost lt-btn', 'data-testid': 'lt-delete', disabled: busy, onClick: () => { setMode({ kind: 'delete', node: n }); setError(''); } }, 'Удалить')) : null),
      deleting ? h('div', { className: 'lt-confirm', 'data-testid': 'lt-confirm' },
        h('span', null, n.child_count > 0 ? `Удалить «${n.name}» вместе со всеми вложенными узлами?` : `Удалить «${n.name}»?`),
        h('button', { type: 'button', className: 'pf-btn lt-danger', 'data-testid': 'lt-delete-yes', disabled: busy, onClick: () => { void remove(n); } }, n.child_count > 0 ? 'Да, удалить ветку' : 'Да, удалить'),
        h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setMode(null) }, 'Нет')) : null,
      adding ? h('div', { className: 'lt-addrow' }, addForm(n)) : null,
      isOpen && kids[n.id] ? h('ul', { className: 'lt-list' }, kids[n.id].map(row)) : null);
  }

  const roots = kids[''];
  return h('div', { className: 'lt-root', 'data-testid': 'lt-root' },
    h('div', { className: 'lt-head' },
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: onBack }, '← К проектам'),
      h('h3', { className: 'pf-title lt-title' }, project.name)),
    project.archived_at ? h('div', { className: 'pf-muted' }, 'Проект в архиве — структура доступна только для просмотра.') : null,
    manage ? h('div', { className: 'lt-tools' },
      h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'lt-gen-open', disabled: busy, onClick: () => { setGenOpen(!genOpen); setError(''); } }, 'Сгенерировать корпус'),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'lt-add-root', disabled: busy, onClick: () => { setMode({ kind: 'add', parent: null }); setError(''); } }, '+ Узел в корень')) : null,
    genOpen && manage ? h('form', { className: 'pf-card lt-gen', onSubmit: generate, 'data-testid': 'lt-gen' },
      h('label', { className: 'pf-field pj-grow' }, 'Название корпуса', h('input', { className: 'pj-input', name: 'gname', type: 'text', value: gen.name, maxLength: 200, onChange: (e) => setGen({ ...gen, name: (e.target as HTMLInputElement).value }) })),
      h('label', { className: 'pf-field' }, 'Секций', h('input', { className: 'pj-input lt-num', name: 'sections', type: 'text', inputMode: 'numeric', value: gen.sections, onChange: (e) => setGen({ ...gen, sections: (e.target as HTMLInputElement).value }) })),
      h('label', { className: 'pf-field' }, 'Этажей в секции', h('input', { className: 'pj-input lt-num', name: 'floors', type: 'text', inputMode: 'numeric', value: gen.floors, onChange: (e) => setGen({ ...gen, floors: (e.target as HTMLInputElement).value }) })),
      h('label', { className: 'pf-field' }, 'Квартир на этаже', h('input', { className: 'pj-input lt-num', name: 'apf', type: 'text', inputMode: 'numeric', value: gen.apf, onChange: (e) => setGen({ ...gen, apf: (e.target as HTMLInputElement).value }) })),
      h('label', { className: 'pf-field' }, 'Первый этаж', h('input', { className: 'pj-input lt-num', name: 'first', type: 'text', inputMode: 'numeric', value: gen.first, onChange: (e) => setGen({ ...gen, first: (e.target as HTMLInputElement).value }) })),
      h('div', { className: 'lt-preview' + (tooMany ? ' lt-preview--bad' : ''), 'data-testid': 'lt-preview', role: 'status' },
        !valid ? 'Секций и этажей — от 1, квартир на этаже — от 0'
          : tooMany ? `Будет создано ${total} узлов — это больше ${GENERATE_LIMIT}, уменьшите числа`
          : `Будет создано ${total} узлов (корпус, ${num(gen.sections, 0)} секц., ${num(gen.sections, 0) * num(gen.floors, 0)} эт., ${num(gen.sections, 0) * num(gen.floors, 0) * num(gen.apf, 0)} кв.)`),
      h('button', { type: 'submit', className: 'pf-btn', 'data-testid': 'lt-gen-go', disabled: busy || !valid || tooMany }, busy ? 'Создаём…' : 'Создать'),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setGenOpen(false) }, 'Отмена')) : null,
    mode && mode.kind === 'add' && !mode.parent ? h('div', { className: 'pf-card lt-addrow lt-addroot' }, addForm(null)) : null,
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { className: 'pj-notice', role: 'status' }, notice) : null,
    h('div', { className: 'pf-card lt-card' },
      roots === undefined ? h('div', { className: 'pf-muted lt-empty' }, 'Загрузка…')
        : roots.length ? h('ul', { className: 'lt-list lt-list--root' }, roots.map(row))
        : h('div', { className: 'pf-muted lt-empty', 'data-testid': 'lt-empty' }, manage ? 'Структура пока пуста — сгенерируйте корпус или добавьте узел.' : 'Структура пока пуста.')));
}

export const LOCATIONS_CSS = `
.lt-root{display:flex;flex-direction:column;gap:12px}
.lt-head{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.lt-title{margin:0;overflow-wrap:anywhere}
.lt-tools{display:flex;flex-wrap:wrap;gap:8px}
.lt-gen{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;padding:14px}
.lt-num{width:110px}
.lt-preview{flex:1 1 100%;font-size:13px;color:var(--text-main)}
.lt-preview--bad{color:var(--color-red)}
.lt-card{padding:6px 4px;overflow-x:auto}
.lt-list{list-style:none;margin:0;padding:0 0 0 18px}
.lt-list--root{padding-left:4px}
.lt-row{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;padding:4px 6px;border-radius:10px;min-width:0}
.lt-row:hover{background:var(--hover-bg)}
.lt-toggle{flex:0 0 32px;height:32px;border:0;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;border-radius:8px}
.lt-toggle--leaf{display:inline-flex;align-items:center;justify-content:center;cursor:default}
.lt-grow{flex:1 1 180px;min-width:0}
.lt-name{display:flex;flex-wrap:wrap;gap:8px;align-items:center;overflow-wrap:anywhere}
.lt-count{font-size:11px}
.lt-actions{display:flex;flex-wrap:wrap;gap:4px}
.lt-btn{padding:6px 10px;font-size:12px;min-height:32px}
.lt-form{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.lt-addrow{padding:4px 6px 8px 44px}
.lt-addroot{padding:12px}
.lt-confirm{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 6px 8px 44px;font-size:13px}
.lt-empty{padding:18px 14px}
.lt-danger{background:var(--color-red);border-color:var(--color-red)}
@media (max-width:600px){.lt-list{padding-left:12px}.lt-addrow,.lt-confirm{padding-left:8px}.lt-actions{width:100%;padding-left:40px}.lt-num{width:90px}.lt-gen .pf-btn{flex:1 1 auto}}
`;
