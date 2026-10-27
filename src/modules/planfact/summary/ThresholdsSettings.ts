/**
 * P2-0038: «Настройки → Администрирование → Модули → План/Факт» — пороги светофора объектов (единственное место правки;
 * в «Сводке» — ссылка сюда). Объекты и право planfact.thresholds.edit — с сервера (pf_summary_portfolio, can_thresholds);
 * сохраняет pf_project_set_thresholds (сервер проверяет право заново), после сохранения «Сводка» считает светофор по новым порогам.
 * Адрес #/settings/modules/planfact?p=<объект> — сразу открыта форма этого объекта.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { SummaryApi, SummaryProject } from './summary.service.ts';
import { ThresholdsForm } from './SummaryTab.ts';
import { hashParam } from '../ProjectPicker.ts';

export function ThresholdsSettings(props: { api: SummaryApi }): ReactElement {
  const { api } = props;
  const [list, setList] = useState<SummaryProject[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(() => hashParam(window.location.hash, 'p') || '');

  async function load(): Promise<void> {
    const r = await api.portfolio();
    if (!r.ok) { setError(r.message); setList([]); return; }
    setError(''); setList(r.value.filter((p) => p.can_thresholds));
  }
  useEffect(() => { void load(); }, []);

  if (list === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  return h('div', { className: 'th-settings', 'data-testid': 'th-settings' },
    h('div', { className: 'sui-hint' }, 'Пороги светофора проекта для «Сводки»: когда проект жёлтый и когда красный. Меняет РП и руководство.'),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { className: 'sui-notice', role: 'status', 'data-testid': 'th-notice' }, notice) : null,
    !error && !list.length ? h('div', { className: 'pf-card pf-muted', 'data-testid': 'th-empty' }, 'Нет проектов, где вы можете менять пороги светофора.') : null,
    list.map((p) => h('div', { key: p.project_id, className: 'sui-card th-row', 'data-project-id': p.project_id },
      h('div', { className: 'sui-card-head' },
        h('div', { className: 'sui-card-main' },
          h('div', { className: 'sui-title' }, p.name),
          h('div', { className: 'sui-sub-meta', 'data-testid': 'th-values' },
            `Жёлтый — от ${p.light_yellow_pp} п.п. · Красный — от ${p.light_red_pp} п.п. · Отставание — ${p.light_overdue_days} дн.`)),
        h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'th-edit', 'aria-expanded': open === p.project_id,
          onClick: () => { setNotice(''); setOpen(open === p.project_id ? '' : p.project_id); } }, open === p.project_id ? 'Закрыть' : 'Изменить')),
      open === p.project_id ? h(ThresholdsForm, { api, p, onSaved: () => { setOpen(''); setNotice(`Пороги «${p.name}» сохранены — «Сводка» считает светофор по ним`); void load(); } }) : null)));
}

export const THRESHOLDS_SETTINGS_CSS = `
.th-settings{display:flex;flex-direction:column;gap:10px;max-width:1100px}
.th-row .sm-th{margin-top:10px;padding:12px 0 0;border:0;border-top:1px solid var(--card-border);border-radius:0;box-shadow:none;background:transparent;align-items:stretch;gap:10px}
.th-row .sm-dates{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;width:100%}
.th-row .sm-dates .pf-field,.th-row .sm-dates .pj-input{width:100%;min-width:0;box-sizing:border-box}
.th-row .pj-actions{display:flex;justify-content:flex-end}
`;
