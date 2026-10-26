/**
 * «Настройки → Компания → Контрагенты» (P2-0015): заказчики, генподрядчики, подрядчики, поставщики компании.
 * Список с поиском по названию/ИНН, добавить, править, в архив / из архива. Без права core.counterparties.manage — только чтение.
 * Данные — только через сервис ядра (src/platform/core); дубль ИНН и права проверяет сервер.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { CoreApi } from '../core/core.service.ts';
import { COUNTERPARTY_KINDS, REQUISITE_FIELDS, counterpartyProblem, kindLabels } from '../core/counterparties.ts';
import type { Counterparty, CounterpartyDraft, CounterpartyKind, Requisites } from '../core/counterparties.ts';

const EMPTY: CounterpartyDraft = { name: '', inn: '', kpp: '', kinds: [], requisites: {} };
const draftOf = (c: Counterparty): CounterpartyDraft =>
  ({ name: c.name, inn: c.inn || '', kpp: c.kpp || '', kinds: [...c.kinds], requisites: { ...c.requisites } });

/** Поиск: часть названия (без регистра) или цифры ИНН. */
export function matchCounterparty(c: Counterparty, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return c.name.toLowerCase().includes(s) || (/^\d+$/.test(s.replace(/\s/g, '')) && (c.inn || '').includes(s.replace(/\s/g, '')));
}

export function CounterpartiesTab(props: { core: CoreApi; companyId: string }): ReactElement {
  const { core, companyId } = props;
  const [rows, setRows] = useState<Counterparty[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [archived, setArchived] = useState(false);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ id: string | null; d: CounterpartyDraft } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(withArchived = archived): Promise<void> { setRows(await core.listCounterparties(companyId, withArchived)); }
  useEffect(() => {
    void load();
    void core.myAccess().then((l) => setCanManage(!!l.find((c) => c.company_id === companyId)?.can_manage_counterparties));
  }, []);

  // Функциональные обновления: несколько правок подряд до перерисовки не теряются.
  function set<K extends keyof CounterpartyDraft>(k: K, v: CounterpartyDraft[K]): void { setEdit((e) => (e ? { ...e, d: { ...e.d, [k]: v } } : e)); }
  function setReq(k: keyof Requisites, v: string): void { setEdit((e) => (e ? { ...e, d: { ...e.d, requisites: { ...e.d.requisites, [k]: v } } } : e)); }
  function toggleKind(k: CounterpartyKind): void {
    setEdit((e) => (e ? { ...e, d: { ...e.d, kinds: e.d.kinds.includes(k) ? e.d.kinds.filter((x) => x !== k) : [...e.d.kinds, k] } } : e));
  }

  async function save(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    if (!edit || busy) return;
    const p = counterpartyProblem(edit.d);
    if (p) { setError(p); return; }
    setBusy(true); setError(''); setNotice('');
    const res = await core.saveCounterparty(companyId, edit.id, edit.d);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setNotice(edit.id ? 'Изменения сохранены' : 'Контрагент добавлен'); setEdit(null); await load();
  }

  async function archive(c: Counterparty, to: boolean): Promise<void> {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    const res = await core.archiveCounterparty(c.id, to);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setNotice(to ? `«${c.name}» — в архиве` : `«${c.name}» — возвращён из архива`); setEdit(null); await load();
  }

  if (rows === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  const list = rows.filter((c) => matchCounterparty(c, q));

  const form = edit ? h('form', { className: 'co-panel cp-form', onSubmit: save, 'data-testid': 'cp-form' },
    h('div', { className: 'pf-title cp-form-title' }, edit.id ? 'Карточка контрагента' : 'Новый контрагент'),
    h('label', { className: 'pf-field' }, 'Название',
      h('input', { type: 'text', className: 'co-input', name: 'name', value: edit.d.name, maxLength: 300, placeholder: 'ООО «Заказчик»', disabled: !canManage,
        onChange: (e) => set('name', (e.target as HTMLInputElement).value) })),
    h('div', { className: 'cp-pair' },
      h('label', { className: 'pf-field' }, 'ИНН',
        h('input', { type: 'text', className: 'co-input', name: 'inn', value: edit.d.inn, inputMode: 'numeric', maxLength: 14, placeholder: '10 или 12 цифр', disabled: !canManage,
          onChange: (e) => set('inn', (e.target as HTMLInputElement).value) })),
      h('label', { className: 'pf-field' }, 'КПП',
        h('input', { type: 'text', className: 'co-input', name: 'kpp', value: edit.d.kpp, maxLength: 11, placeholder: 'необязательно', disabled: !canManage,
          onChange: (e) => set('kpp', (e.target as HTMLInputElement).value) }))),
    h('fieldset', { className: 'co-group cp-kinds', 'data-testid': 'cp-kinds' }, h('legend', null, 'Кто это'),
      COUNTERPARTY_KINDS.map((k) => h('label', { key: k.id, className: 'co-check' },
        h('input', { type: 'checkbox', checked: edit.d.kinds.includes(k.id), disabled: !canManage, 'data-kind': k.id, onChange: () => toggleKind(k.id) }),
        h('span', null, k.label)))),
    h('div', { className: 'cp-req' },
      REQUISITE_FIELDS.map((f) => h('label', { key: f.key, className: 'pf-field' }, f.label,
        h('input', { type: 'text', className: 'co-input', name: f.key, value: edit.d.requisites[f.key] || '', placeholder: f.placeholder, maxLength: 500, disabled: !canManage,
          onChange: (e) => setReq(f.key, (e.target as HTMLInputElement).value) })))),
    h('div', { className: 'co-row' },
      canManage ? h('button', { type: 'submit', className: 'pf-btn', disabled: busy, 'data-testid': 'cp-save' }, edit.id ? 'Сохранить' : 'Добавить') : null,
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => { setEdit(null); setError(''); } }, canManage ? 'Отмена' : 'Закрыть'),
      canManage && edit.id
        ? (() => { const c = rows.find((x) => x.id === edit.id); return c ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost cp-archive', disabled: busy,
            'data-testid': 'cp-archive', onClick: () => { void archive(c, !c.archived_at); } }, c.archived_at ? 'Вернуть из архива' : 'В архив') : null; })()
        : null)) : null;

  return h('div', { className: 'cp-root', 'data-testid': 'cp-tab' },
    h('div', { className: 'co-row cp-tools' },
      h('input', { className: 'co-input co-grow', type: 'search', value: q, placeholder: 'Поиск по названию или ИНН', 'aria-label': 'Поиск контрагента',
        'data-testid': 'cp-search', onChange: (e) => setQ((e.target as HTMLInputElement).value) }),
      h('label', { className: 'co-check cp-arch-toggle' },
        h('input', { type: 'checkbox', checked: archived, 'data-testid': 'cp-show-archived',
          onChange: (e) => { const v = (e.target as HTMLInputElement).checked; setArchived(v); void load(v); } }),
        h('span', null, 'Показать архив')),
      canManage ? h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'cp-add', onClick: () => { setEdit({ id: null, d: { ...EMPTY, requisites: {} } }); setError(''); setNotice(''); } },
        'Добавить контрагента') : null),
    !canManage ? h('div', { className: 'co-hint', 'data-testid': 'cp-readonly' }, 'Только просмотр: нет права управлять контрагентами.') : null,
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { className: 'co-notice', role: 'status' }, notice) : null,
    form,
    h('div', { className: 'co-card cp-list', 'data-testid': 'cp-list' },
      list.length
        ? list.map((c) => h('button', { key: c.id, type: 'button', className: 'cp-row' + (edit?.id === c.id ? ' cp-row--active' : ''), 'data-cp-id': c.id,
            onClick: () => { setEdit({ id: c.id, d: draftOf(c) }); setError(''); setNotice(''); } },
            h('span', { className: 'cp-name' }, c.name, c.archived_at ? h('span', { className: 'co-badge cp-badge' }, 'архив') : null,
              c.draft ? h('span', { className: 'co-badge cp-badge', 'data-testid': 'cp-draft' }, 'из Качества · нужен ИНН') : null),
            h('span', { className: 'cp-inn' }, c.inn ? 'ИНН ' + c.inn + (c.kpp ? ' · КПП ' + c.kpp : '') : 'ИНН не указан'),
            h('span', { className: 'cp-kind' }, kindLabels(c.kinds))))
        : h('div', { className: 'pj-empty pf-muted cp-empty', 'data-testid': 'cp-empty' },
            rows.length ? 'Ничего не найдено.' : 'Контрагентов пока нет. Добавьте заказчика — потом его можно выбрать в карточке объекта.')));
}

export const COUNTERPARTIES_CSS = `
.cp-root{display:flex;flex-direction:column;gap:12px}
.cp-tools{align-items:center}
.cp-arch-toggle{white-space:nowrap}
.cp-form-title{font-size:13px}
.cp-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cp-req{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.cp-kinds{display:flex;flex-wrap:wrap;gap:4px 16px}
.cp-list{display:flex;flex-direction:column;padding:4px}
.cp-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1.3fr) minmax(0,1.2fr);gap:4px 12px;align-items:center;text-align:left;padding:12px;min-height:44px;border:0;border-bottom:1px solid var(--card-border);background:transparent;color:var(--text-main);cursor:pointer;font-size:13px}
.cp-row:last-child{border-bottom:0}
.cp-row:hover,.cp-row--active{background:var(--hover-bg)}
.cp-name{font-weight:700;overflow-wrap:anywhere}
.cp-badge{margin-left:6px;vertical-align:middle}
.cp-inn{font-variant-numeric:tabular-nums;color:var(--text-muted)}
.cp-kind{color:var(--text-muted)}
.cp-empty{padding:14px}
@media (max-width:600px){.cp-row{grid-template-columns:1fr}.cp-pair{grid-template-columns:1fr}.cp-tools>.co-input,.cp-tools>.pf-btn{flex-basis:100%;width:100%}}
`;
