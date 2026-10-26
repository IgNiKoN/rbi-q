/**
 * «План/Факт → КС-2» (P2-0008b): проект → договорная редакция КП → список актов (P2-0020 — реестр Ks2Registry) → «Новый акт»
 * (номер, дата, период) → акт.
 * Предложение системы, «выставлено ранее» и права считает сервер; экран показывает и передаёт правки ПТО.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { VorApi, VorProject } from '../vor/vor.service.ts';
import type { Ks2ActItem, Ks2Api, Ks2Settings } from './ks2.service.ts';
import { KS2_EDIT, KS2_VIEW } from './ks2.service.ts';

const MONEY_VIEW = 'planfact.money.view';
import { defaultPeriod } from './model.ts';
import { money } from '../estimate/prices.ts';
import { Ks2Registry, KS2_REGISTRY_CSS } from './Ks2Registry.ts';
import { todayMoscow } from '../fact/fact.ts';
import { Ks2Act } from './Ks2Act.ts';
import { Ks2Template } from './Ks2Template.ts';
import { initialProjectId, ProjectPicker } from '../ProjectPicker.ts';

/** me — почта вошедшего (личные виды реестра актов). */
export function Ks2Tab(props: { api: Ks2Api; vor: VorApi; me?: string }): ReactElement {
  const { api, vor } = props;
  const [list, setList] = useState<VorProject[] | null>(null);
  const [perms, setPerms] = useState<Record<string, string[]>>({});
  const [projectId, setProjectId] = useState('');
  const [settings, setSettings] = useState<Ks2Settings | null>(null);
  const [acts, setActs] = useState<Ks2ActItem[] | null>(null);
  const [actId, setActId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const all = await vor.listProjects();
      const ok: VorProject[] = []; const map: Record<string, string[]> = {};
      for (const p of all) { const pr = await vor.permissions(p.id); if (pr.includes(KS2_VIEW) || pr.includes(KS2_EDIT)) { ok.push(p); map[p.id] = pr; } }
      setPerms(map); setList(ok);
      if (ok.length) setProjectId(initialProjectId(ok, window.location.hash));   // P2-0021: объект из перехода
    })();
  }, []);

  async function load(pid: string): Promise<void> {
    setSettings(null); setActs(null); setError('');
    const [s, a] = await Promise.all([api.settings(pid), api.acts(pid)]);
    if (!s.ok) { setError(s.message); return; }
    setSettings(s.value);
    if (a.ok) setActs(a.value); else { setActs([]); setError(a.message); }
  }
  useEffect(() => { if (projectId) { setActId(''); setCreating(false); void load(projectId); } }, [projectId]);

  async function chooseContract(kp: string): Promise<void> {
    if (!kp || busy) return;
    setBusy(true);
    const r = await api.setContract(projectId, kp);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    await load(projectId);
  }

  if (list === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  if (!list.length) return h('div', { className: 'pf-muted', 'data-testid': 'k2-noaccess' }, 'Нет доступа к КС-2: раздел доступен ПТО, руководителю проекта, экономисту (правка) и руководству (просмотр).');

  const picker = h(ProjectPicker, { list, value: projectId, onChange: setProjectId, testId: 'k2-project' });

  if (actId) {
    return h('div', { className: 'pj-tab k2-tab', 'data-testid': 'k2-tab' }, picker,
      h(Ks2Act, { api, actId, canEdit: !!settings?.can_edit, hasTemplate: !!settings?.template_name, onBack: () => { setActId(''); void load(projectId); } }));
  }

  const canEdit = !!settings?.can_edit;
  const contract = settings?.kp_revisions.find((k) => k.id === settings.contract_kp_revision_id) || null;
  const kpLabel = (k: { estimate_name: string; revision_no: number; total: number }): string => `${k.estimate_name} · ред. ${k.revision_no} · ${money(k.total)} ₽`;

  const contractCard = settings
    ? h('div', { className: 'pf-card k2-card', 'data-testid': 'k2-contract' },
        h('div', { className: 'pf-field' }, 'Договорная редакция КП (цены акта)'),
        canEdit && settings.kp_revisions.length
          ? h('select', { className: 'pj-input', value: settings.contract_kp_revision_id || '', disabled: busy, 'data-testid': 'k2-contract-select',
              onChange: (e) => { void chooseContract((e.target as HTMLSelectElement).value); } },
              settings.contract_kp_revision_id ? null : h('option', { value: '' }, '— выберите редакцию КП —'),
              settings.kp_revisions.map((k) => h('option', { key: k.id, value: k.id }, kpLabel(k))))
          : h('div', null, contract ? kpLabel(contract) : h('span', { className: 'pf-muted' }, 'не выбрана')),
        !settings.kp_revisions.length ? h('div', { className: 'pf-muted' }, 'В проекте ещё нет ни одной редакции КП — сформируйте КП в разделе «Смета».') : null,
        settings.kp_revisions.length && !contract && canEdit ? h('div', { className: 'ft-warn', 'data-testid': 'k2-need-contract' }, 'Выберите договорную редакцию КП — без неё акт не создать.') : null)
    : null;

  const rows = acts || [];
  return h('div', { className: 'pj-tab k2-tab', 'data-testid': 'k2-tab' }, picker,
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    settings === null && !error ? h('div', { className: 'pf-muted' }, 'Загрузка…') : null,
    contractCard,
    settings ? h(Ks2Template, { api, projectId, settings, onChanged: () => { void api.settings(projectId).then((r) => { if (r.ok) setSettings(r.value); }); } }) : null,
    settings && canEdit && contract && !creating
      ? h('div', { className: 'pj-actions' }, h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'k2-new', onClick: () => setCreating(true) }, 'Новый акт'))
      : null,
    creating && settings ? h(NewActForm, { api, projectId, nextNo: settings.next_act_no, onCancel: () => setCreating(false), onCreated: (id) => { setCreating(false); setActId(id); } }) : null,
    acts === null && settings ? h('div', { className: 'pf-muted' }, 'Загрузка…') : null,
    acts && !rows.length ? h('div', { className: 'pf-card pj-empty pf-muted', 'data-testid': 'k2-empty' }, 'Актов пока нет.') : null,
    rows.length
      ? h(Ks2Registry, { key: projectId, acts: rows, canMoney: (perms[projectId] || []).includes(MONEY_VIEW), onOpen: setActId,
          companyId: list.find((p) => p.id === projectId)?.company_id || '', user: props.me || '' })
      : null);
}

function NewActForm(props: { api: Ks2Api; projectId: string; nextNo: string; onCancel: () => void; onCreated: (id: string) => void }): ReactElement {
  const { api, projectId, nextNo, onCancel, onCreated } = props;
  const today = todayMoscow();
  const per = defaultPeriod(today);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    if (busy) return;
    const f = ev.currentTarget as HTMLFormElement;
    const val = (k: string): string => (f.elements.namedItem(k) as HTMLInputElement).value.trim();
    const no = val('no'), date = val('date'), from = val('from'), to = val('to');
    if (!no) { setError('Укажите номер акта'); return; }
    if (!date || !from || !to) { setError('Укажите дату акта и период'); return; }
    if (from > to) { setError('Начало периода позже конца'); return; }
    setBusy(true); setError('');
    const r = await api.createAct(projectId, no, date, from, to);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onCreated(r.value);
  }
  return h('form', { className: 'pf-card pj-form', onSubmit: (e: FormEvent) => { void submit(e); }, 'data-testid': 'k2-new-form' },
    h('label', { className: 'pf-field' }, '№ акта', h('input', { name: 'no', className: 'pj-input k2-no-input', defaultValue: nextNo, maxLength: 50, 'data-testid': 'k2-new-no' })),
    h('label', { className: 'pf-field' }, 'Дата акта', h('input', { name: 'date', type: 'date', className: 'pj-input', defaultValue: today })),
    h('label', { className: 'pf-field' }, 'Период с', h('input', { name: 'from', type: 'date', className: 'pj-input', defaultValue: per.from, 'data-testid': 'k2-new-from' })),
    h('label', { className: 'pf-field' }, 'по', h('input', { name: 'to', type: 'date', className: 'pj-input', defaultValue: per.to, 'data-testid': 'k2-new-to' })),
    h('div', { className: 'pf-muted k2-hint' }, 'В акт попадёт принятый факт по дату «по» включительно, ещё не вошедший в выданные акты.'),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    h('div', { className: 'pj-actions' },
      h('button', { type: 'submit', className: 'pf-btn', disabled: busy, 'data-testid': 'k2-new-create' }, 'Создать'),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: onCancel }, 'Отмена')));
}

export const KS2_CSS = KS2_REGISTRY_CSS + `
.k2-tab{max-width:1400px}
.k2-card{display:flex;flex-direction:column;gap:8px;padding:12px 14px;overflow:visible}
.k2-card .pj-input{max-width:560px}
.k2-hint{flex-basis:100%;font-size:12px}
.k2-no-input{width:110px}
.k2-reason{font-size:12px}
.k2-badge{font-size:10px;font-weight:700;text-transform:uppercase;padding:1px 6px;border-radius:6px;border:1px solid var(--card-border);white-space:nowrap}
.k2-badge--draft{color:var(--color-yellow);border-color:var(--color-yellow)}
.k2-badge--issued{color:var(--color-green);border-color:var(--color-green)}
.k2-badge--annulled{color:var(--text-muted)}
`;
