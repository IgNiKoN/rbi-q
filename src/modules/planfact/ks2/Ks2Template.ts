/**
 * «Бланк КС-2 проекта» (P2-0008b, этап 5): загрузить .xlsx заказчика с метками (проверка до отправки на сервер: читается,
 * одна строка-образец, неизвестные метки — списком, формулы ниже образца, ≤ 2 МБ), скачать текущий, убрать.
 * Список меток — на экране. Хранится в проекте на сервере (bytea, не Storage); сервер повторно проверяет право, размер и формат.
 */
import { createElement as h, useState } from 'react';
import type { ReactElement } from 'react';
import type { Ks2Api, Ks2Settings } from './ks2.service.ts';
import { HEADER_TAGS, ROW_TAGS, TEMPLATE_MAX_BYTES, checkTemplate, fromBase64, toBase64 } from './template.ts';
import { saveFile } from '../estimate/KpBlock.ts';

const HEADER_HINT: Record<string, string> = { акт_номер: '№ акта', акт_дата: 'дата акта', период_с: 'начало периода', период_по: 'конец периода', заказчик: 'заказчик',
  подрядчик: 'подрядчик', объект: 'объект', договор: '№ и дата договора', итого: 'итог акта, руб.' };
const ROW_HINT: Record<string, string> = { '№': '№ по порядку', номер: '№ позиции заказчика', наименование: 'наименование', ЕИ: 'единица', количество: 'объём', цена: 'цена за ед.', стоимость: 'стоимость' };

export function Ks2Template(props: { api: Ks2Api; projectId: string; settings: Ks2Settings; onChanged: () => void; save?: (b: Uint8Array, n: string) => void }): ReactElement {
  const { api, projectId, settings, onChanged } = props;
  const saveBytes = props.save || saveFile;
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const canEdit = settings.can_edit;

  async function upload(file: File): Promise<void> {
    setErrors([]); setNotice('');
    if (!/\.xlsx$/i.test(file.name)) { setErrors(['Бланк должен быть файлом .xlsx.']); return; }
    if (file.size > TEMPLATE_MAX_BYTES) { setErrors(['Бланк больше 2 МБ.']); return; }
    setBusy(true);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const c = await checkTemplate(bytes);
    if (!c.ok) { setBusy(false); setErrors(c.errors); return; }
    const r = await api.saveTemplate(projectId, file.name, toBase64(bytes));
    setBusy(false);
    if (!r.ok) { setErrors([r.message]); return; }
    setNotice(`Бланк «${file.name}» загружен: лист «${c.sheet}», строка-образец ${c.sampleRow}, метки: ${c.tags.map((t) => `{${t}}`).join(' ')}`);
    onChanged();
  }
  async function download(): Promise<void> {
    const r = await api.template(projectId);
    if (!r.ok || !r.value) { setErrors([r.ok ? 'Бланка нет' : r.message]); return; }
    saveBytes(fromBase64(r.value.data), r.value.name);
  }
  async function clear(): Promise<void> {
    if (busy) return;
    setBusy(true);
    const r = await api.saveTemplate(projectId, null, null);
    setBusy(false);
    if (!r.ok) { setErrors([r.message]); return; }
    setNotice('Бланк убран — акты скачиваются по унифицированной форме.'); onChanged();
  }

  const tagList = (tags: readonly string[], hint: Record<string, string>) => h('ul', { className: 'k2-tags' }, tags.map((t) => h('li', { key: t }, h('code', null, `{${t}}`), ` — ${hint[t]}`)));
  return h('details', { className: 'pf-card k2-card k2-tpl', 'data-testid': 'k2-template' },
    h('summary', null, h('b', null, 'Бланк КС-2 проекта'), h('span', { className: 'pf-muted' }, settings.template_name ? ` ${settings.template_name}` : ' не загружен — унифицированная форма')),
    settings.template_name
      ? h('div', { className: 'pj-actions' },
          h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'k2-tpl-download', onClick: () => { void download(); } }, 'Скачать бланк'),
          canEdit ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy, 'data-testid': 'k2-tpl-clear', onClick: () => { void clear(); } }, 'Убрать бланк') : null)
      : null,
    canEdit ? h('label', { className: 'pf-field' }, settings.template_name ? 'Заменить бланк (.xlsx, до 2 МБ)' : 'Загрузить бланк (.xlsx, до 2 МБ)',
      h('input', { type: 'file', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', className: 'pj-input', disabled: busy, 'data-testid': 'k2-tpl-file',
        onChange: (e) => { const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; if (f) void upload(f); } })) : null,
    busy ? h('div', { className: 'pf-muted' }, 'Проверяю бланк…') : null,
    errors.length ? h('ul', { className: 'pf-error k2-tpl-errors', role: 'alert', 'data-testid': 'k2-tpl-errors' }, errors.map((e, i) => h('li', { key: i }, e))) : null,
    notice ? h('div', { className: 'pj-notice', role: 'status', 'data-testid': 'k2-tpl-notice' }, notice) : null,
    h('div', { className: 'k2-tpl-help' },
      h('div', null, h('b', null, 'Как подготовить бланк. '), 'В любые ячейки шапки впишите метки — они заменятся данными акта:'),
      tagList(HEADER_TAGS, HEADER_HINT),
      h('div', null, 'В одной строке таблицы (строка-образец) расставьте метки строк — эта строка повторится для каждой строки акта с тем же оформлением:'),
      tagList(ROW_TAGS, ROW_HINT),
      h('div', { className: 'pf-muted' }, 'Ниже строки-образца не должно быть формул — для суммы используйте {итого}. Объединять ячейки в строке-образце можно только по горизонтали.')));
}

export const KS2_TPL_CSS = `
.k2-tpl summary{cursor:pointer;min-height:32px;display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center}
.k2-tpl-help{display:flex;flex-direction:column;gap:6px;font-size:13px;margin-top:4px;padding-top:10px;border-top:1px solid var(--card-border)}
.k2-tags{margin:0;padding-left:18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:2px 16px}
.k2-tags code{font-weight:700}
.k2-tpl-errors{margin:0;padding-left:18px;font-size:13px}
`;
