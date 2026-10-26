/**
 * «План/Факт → Смета» (P2-0006c): проект → сметы проекта; «Новая смета» по одной или нескольким подтверждённым загрузкам ВОР,
 * площадь S, м². Открытая смета — EstimateView. Доступ — право planfact.estimate.manage в проекте (сервер проверяет каждый вызов).
 */
import { createElement as h, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { VorApi, VorImport, VorProject } from '../vor/vor.service.ts';
import type { EstimateApi, EstimateItem } from './estimate.service.ts';
import { ESTIMATE_MANAGE } from './estimate.service.ts';
import { EstimateView } from './EstimateView.ts';
import { EstimateOverheads } from './OverheadsEditor.ts';
import { KpBlock } from './KpBlock.ts';
import { parsePriceInput } from './prices.ts';
import { firstProjectId, ProjectPicker } from '../ProjectPicker.ts';

const dateFmt = (iso: string): string => { try { return new Date(iso).toLocaleDateString('ru-RU'); } catch { return iso; } };

export function EstimateTab(props: { api: EstimateApi; vor: VorApi }): ReactElement {
  const { api, vor } = props;
  const [projects, setProjects] = useState<VorProject[] | null>(null);
  const [projectId, setProjectId] = useState('');
  const [list, setList] = useState<EstimateItem[] | null>(null);
  const [imports, setImports] = useState<VorImport[]>([]);
  const [openId, setOpenId] = useState('');
  const [creating, setCreating] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const all = await vor.listProjects();
      const ok: VorProject[] = [];
      for (const p of all) if ((await vor.permissions(p.id)).includes(ESTIMATE_MANAGE)) ok.push(p);
      setProjects(ok);
      if (ok.length) setProjectId(firstProjectId(ok));
    })();
  }, []);

  async function loadProject(id: string): Promise<void> {
    setList(null); setOpenId(''); setCreating(false); setChecked([]);
    const [l, imps] = await Promise.all([api.listEstimates(id), vor.listImports(id)]);
    setList(l); setImports(imps.filter((i) => i.status === 'confirmed'));
  }
  useEffect(() => { if (projectId) void loadProject(projectId); }, [projectId]);

  async function create(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    const f = ev.currentTarget as HTMLFormElement;
    const name = (f.elements.namedItem('name') as HTMLInputElement).value.trim();
    const area = parsePriceInput((f.elements.namedItem('area') as HTMLInputElement).value);
    if (!name) { setError('Введите название сметы'); return; }
    if (!checked.length) { setError('Выберите хотя бы одну подтверждённую загрузку ВОР'); return; }
    if (area !== null && (Number.isNaN(area) || area <= 0)) { setError('Площадь — положительное число'); return; }
    setBusy(true); setError('');
    const r = await api.createEstimate(projectId, name, checked, area);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    await loadProject(projectId);
    setOpenId(r.value);
  }

  if (projects === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  if (!projects.length) return h('div', { className: 'pf-muted', 'data-testid': 'es-noaccess' }, 'Нет права на сметы: раздел доступен ПТО, руководителю проекта и администратору.');
  const sheetName = (id: string): string => { const i = imports.find((x) => x.id === id); return i ? `«${i.sheet_name}»` : 'загрузка'; };
  const open = list?.find((e) => e.id === openId);

  return h('div', { className: 'pj-tab es-tab', 'data-testid': 'es-tab' },
    h(ProjectPicker, { list: projects, value: projectId, onChange: setProjectId }),
    open
      ? h(EstimateView, { key: open.id, api, vor, estimate: open, imports, companyId: projects.find((p) => p.id === projectId)?.company_id || '',
          extra: (rows, totals, area) => h('div', { className: 'pj-tab' },
            h(EstimateOverheads, { api, estimateId: open.id, companyId: projects.find((p) => p.id === projectId)?.company_id || '', base: totals, area }),
            h(KpBlock, { api, vor, estimate: open, imports, projectId, rows })), onBack: () => { setOpenId(''); void loadProject(projectId); } })
      : h('div', { className: 'pj-tab' },
          h('div', { className: 'pj-actions' },
            h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'es-new', onClick: () => setCreating(!creating) }, creating ? 'Отмена' : 'Новая смета')),
          creating
            ? h('form', { className: 'pf-card pj-form es-new', onSubmit: create, 'data-testid': 'es-create' },
                h('label', { className: 'pf-field pj-grow' }, 'Название', h('input', { name: 'name', type: 'text', className: 'pj-input', maxLength: 300, defaultValue: 'Тендерная смета' })),
                h('label', { className: 'pf-field' }, 'S, м² (для ₽/м²)', h('input', { name: 'area', type: 'text', inputMode: 'decimal', className: 'pj-input pf-num' })),
                h('div', { className: 'es-imports' },
                  h('div', { className: 'pr-field-label' }, 'Подтверждённые загрузки ВОР (можно несколько листов)'),
                  imports.length
                    ? imports.map((i) => h('label', { key: i.id, className: 'pr-check' },
                        h('input', { type: 'checkbox', checked: checked.includes(i.id), 'data-testid': 'es-import',
                          onChange: () => setChecked(checked.includes(i.id) ? checked.filter((x) => x !== i.id) : [...checked, i.id]) }),
                        `${i.file_name} · «${i.sheet_name}» (${i.works} работ)`))
                    : h('div', { className: 'pf-muted' }, 'В проекте нет подтверждённых загрузок ВОР — сначала загрузите и подтвердите ВОР.')),
                h('button', { type: 'submit', className: 'pf-btn', disabled: busy }, 'Создать смету'))
            : null,
          error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
          list === null ? h('div', { className: 'pf-muted' }, 'Загрузка…')
          : h('div', { className: 'pf-card pj-list', 'data-testid': 'es-list' },
              list.length
                ? list.map((e) => h('div', { key: e.id, className: 'pj-row', 'data-estimate-id': e.id },
                    h('div', { className: 'pj-name' }, h('b', null, e.name),
                      h('span', { className: 'pf-muted' }, e.import_ids.map(sheetName).join(', ')),
                      e.area_m2 ? h('span', { className: 'pj-badge' }, `S ${e.area_m2.toLocaleString('ru-RU')} м²`) : null,
                      h('span', { className: 'pf-muted' }, `${e.rows} строк${e.unpriced ? ` · без цены ${e.unpriced}` : ''}${e.revisions ? ` · КП ред. ${e.revisions}` : ''} · ${dateFmt(e.created_at)}`)),
                    h('span', { className: 'pj-actions' }, h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'es-open', onClick: () => setOpenId(e.id) }, 'Открыть'))))
                : h('div', { className: 'pj-empty pf-muted', 'data-testid': 'es-empty' }, 'Смет в этом проекте пока нет.'))));
}
