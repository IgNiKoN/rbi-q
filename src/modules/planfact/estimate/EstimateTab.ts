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
import { initialProjectId, ProjectPicker } from '../ProjectPicker.ts';
import { InHead } from '../PageHead.ts';
import { StatusBadge } from '../../../platform/ui/index.ts';

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
      if (ok.length) setProjectId(initialProjectId(ok, window.location.hash));
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
          h(InHead, { slot: 'actions' },
            h('button', { type: 'button', className: creating ? 'pf-btn pf-btn--ghost' : 'pf-btn', 'data-testid': 'es-new', onClick: () => setCreating(!creating) }, creating ? 'Отмена' : 'Новая смета')),
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
                // P2-0046: смета — строка целиком открывается нажатием; сразу видно цены (все / без цены N), КП и когда меняли
                ? [h('div', { key: 'head', className: 'es-lrow es-lhead', 'aria-hidden': 'true' }, h('span', null, 'Смета'), h('span', null, 'Площадь'), h('span', null, 'Цены'), h('span', null, 'КП'), h('span', null, 'Изменена')),
                  ...list.map((e) => h('button', { key: e.id, type: 'button', className: 'es-lrow', 'data-estimate-id': e.id, 'data-testid': 'es-open', onClick: () => setOpenId(e.id) },
                    h('span', { className: 'es-lname' }, h('b', null, e.name), h('span', { className: 'pf-muted' }, `${e.import_ids.map(sheetName).join(', ')} · ${e.rows} строк`)),
                    h('span', { className: 'es-larea' }, e.area_m2 ? `${e.area_m2.toLocaleString('ru-RU')} м²` : '—'),
                    h('span', null, h(StatusBadge, { status: e.unpriced ? 'yellow' : 'green', label: e.unpriced ? `Без цены ${e.unpriced}` : 'Все цены' })),
                    h('span', { className: 'es-lkp' }, e.revisions ? `КП ред. ${e.revisions}` : 'КП нет'),
                    h('span', { className: 'pf-muted es-ldate' }, dateFmt(e.updated_at || e.created_at)),
                    h('span', { className: 'es-lchev', 'aria-hidden': 'true' })))]
                : h('div', { className: 'pj-empty pf-muted', 'data-testid': 'es-empty' }, 'Смет в этом проекте пока нет.'))));
}

/** P2-0046: список смет — строки-кнопки; на ПК — колонки «Смета · Площадь · Цены · КП · Изменена», на телефоне — по строкам. */
export const ESTIMATE_LIST_CSS = `
.es-lrow{font:inherit;color:inherit;text-align:left;width:100%;display:grid;grid-template-columns:minmax(0,2.4fr) minmax(90px,.8fr) minmax(120px,1fr) minmax(90px,.7fr) minmax(90px,.7fr) 12px;
  align-items:center;gap:8px 16px;padding:12px 14px;border:0;border-top:1px solid var(--card-border);background:transparent;cursor:pointer;font-size:13.5px}
.es-lrow:hover{background:var(--hover-bg)}
.es-lrow:focus-visible{outline:2px solid var(--accent,var(--primary));outline-offset:-2px}
.es-lhead{cursor:default;font-size:12px;font-weight:600;color:var(--text-muted);border-top:0;padding-top:10px;padding-bottom:8px}
.es-lhead:hover{background:transparent}
.es-lname{display:flex;flex-direction:column;gap:2px;min-width:0;overflow-wrap:anywhere}
.es-lname b{font-size:14.5px;font-weight:600}
.es-lname .pf-muted{font-size:12.5px}
.es-larea,.es-ldate{font-variant-numeric:tabular-nums;white-space:nowrap}
.es-lchev{width:8px;height:8px;border-right:2px solid var(--text-muted);border-bottom:2px solid var(--text-muted);transform:rotate(-45deg)}
@media (max-width:767.98px){
.es-lhead{display:none}
.es-lrow{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"name pill" "meta meta";gap:6px 10px}
.es-lrow:nth-child(2){border-top:0}
.es-lname{grid-area:name}
.es-lrow>span:nth-child(3){grid-area:pill;justify-self:end}
.es-larea,.es-lkp,.es-ldate{font-size:12.5px;color:var(--text-muted);display:inline}
.es-larea{grid-area:meta}
.es-lkp,.es-ldate,.es-lchev{display:none}
}
`;
