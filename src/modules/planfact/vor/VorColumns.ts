/**
 * Колонки формы ВОР (P2-0006, этап 3): какая колонка файла — «Наименование», «Ед. изм.», «Объём»… Правка сразу меняет разбор;
 * при сохранении черновика карта колонок запоминается в профиле формы и в следующий раз узнаётся по шапке.
 */
import { createElement as h } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import type { ColumnMap, EditableRole } from './parse.ts';

const ROLES: { id: EditableRole; label: string }[] = [
  { id: 'name', label: 'Наименование' }, { id: 'unit', label: 'Ед. изм.' }, { id: 'qty', label: 'Объём / количество' },
  { id: 'norm', label: 'Норма расхода' }, { id: 'number', label: '№ п/п' }, { id: 'type', label: 'Тип строки (Г/Р/М, КВР)' }
];

/** Буква колонки Excel: 0 → A, 25 → Z, 26 → AA. */
export function colLetter(i: number): string {
  let n = i + 1, s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

export function VorColumns(props: {
  labels: string[]; columns: ColumnMap; profileName: string | null; edited: boolean; name: string;
  onEdit: (role: EditableRole, col: number | null) => void; onName: (v: string) => void; onReset: () => void;
}): ReactElement {
  const { labels, columns, profileName, edited, name, onEdit, onName, onReset } = props;
  const width = Math.max(labels.length, ...[columns.name, columns.unit, columns.qty, columns.norm, columns.number, columns.type].map((c) => (c ?? -1) + 1));
  const options = Array.from({ length: width }, (_, i) => ({ value: String(i), label: `${colLetter(i)} · ${(labels[i] || 'без подписи').slice(0, 60)}` }));
  const status = profileName
    ? (edited ? `Форма «${profileName}» — карта колонок изменена, при сохранении запомнится` : `Форма узнана: «${profileName}»`)
    : (edited ? 'Новая форма — карта колонок изменена вручную' : 'Новая форма — колонки найдены по шапке');
  return h('div', { className: 'pf-card vor-cols', 'data-testid': 'vor-columns' },
    h('div', { className: 'vor-cols-head' },
      h('span', { className: profileName && !edited ? 'vor-stat--ok' : 'pf-muted', 'data-testid': 'vor-profile-status' }, status),
      edited ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'vor-cols-reset', onClick: onReset }, 'Вернуть как было') : null),
    h('div', { className: 'vor-cols-grid' },
      ROLES.map((r) => {
        const cur = columns[r.id];
        return h('label', { key: r.id, className: 'pf-field' }, r.label,
          h('select', { className: 'pj-input', value: cur === null ? '' : String(cur), 'data-role': r.id,
            onChange: (e: ChangeEvent<HTMLSelectElement>) => onEdit(r.id, e.currentTarget.value === '' ? null : Number(e.currentTarget.value)) },
            r.id === 'name' ? null : h('option', { value: '' }, '— нет —'),
            options.map((o) => h('option', { key: o.value, value: o.value }, o.label))));
      }),
      h('label', { className: 'pf-field' }, 'Название формы (заказчик / тип)',
        h('input', { type: 'text', className: 'pj-input', value: name, maxLength: 120, 'data-testid': 'vor-profile-name',
          onChange: (e: ChangeEvent<HTMLInputElement>) => onName(e.currentTarget.value) }))),
    columns.unitDefault ? h('div', { className: 'pf-muted' }, `Колонки ЕИ нет — ЕИ «${columns.unitDefault}» взята из подписи колонки объёма.`) : null,
    columns.prices.length ? h('div', { className: 'pf-muted' }, `Цены и стоимости: ${columns.prices.map((p) => colLetter(p.col)).join(', ')}`) : null);
}

export const VOR_COLUMNS_CSS = `
.vor-cols{padding:12px 14px;display:flex;flex-direction:column;gap:10px;font-size:12px}
.vor-cols-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.vor-cols-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.vor-cols-grid select,.vor-cols-grid input{width:100%;min-height:40px}
`;
