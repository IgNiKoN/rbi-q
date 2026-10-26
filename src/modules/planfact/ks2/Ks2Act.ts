/**
 * Акт КС-2 (P2-0008b): шапка-реквизиты и строки заказчика — «с начала работ», «выставлено ранее», «по системе» (с сервера)
 * и итог ПТО («в акт», цена, исключить). «Сохранить» — новая неизменяемая редакция; сервер пересчитывает предложение.
 * Выданный и аннулированный акт — только просмотр своей редакции. «История» — все редакции, скачать любую;
 * «Выдать» (с подтверждением) фиксирует последнюю редакцию; «Аннулировать» — с причиной, объём снова доступен следующим актам.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { Ks2ActData, Ks2Api, Ks2RevisionItem } from './ks2.service.ts';
import { actTotal, emptyKs2Header, isEdited, ks2FileName, ks2Problems, rowCost, ruDate, writeUnifiedKs2, type Ks2Header, type Ks2Row, type Ks2Snapshot } from './form.ts';
import { saveFile } from '../estimate/KpBlock.ts';
import { fillTemplate, fromBase64 } from './template.ts';
import { planOffer, offerFileName } from './offer.ts';
import { actHeader, actRowsOf, snapshotOf, STATUS_LABEL, toEdits } from './model.ts';
import { money } from '../estimate/prices.ts';
import { fmtQty, parseQty } from '../fact/fact.ts';

const FIELDS: { key: keyof Ks2Header; label: string; date?: boolean; wide?: boolean }[] = [
  { key: 'customer', label: 'Заказчик (генподрядчик)', wide: true }, { key: 'contractor', label: 'Подрядчик (субподрядчик)', wide: true },
  { key: 'investor', label: 'Инвестор', wide: true }, { key: 'construction', label: 'Стройка', wide: true }, { key: 'object', label: 'Объект', wide: true },
  { key: 'contract_no', label: 'Договор №' }, { key: 'contract_date', label: 'Дата договора', date: true },
  { key: 'act_no', label: '№ акта' }, { key: 'act_date', label: 'Дата акта', date: true },
  { key: 'contractor_signer', label: 'Сдал (должность, ФИО)', wide: true }, { key: 'customer_signer', label: 'Принял (должность, ФИО)', wide: true },
];
const numText = (v: number | null): string => (v === null ? '' : String(v).replace('.', ','));

export function Ks2Act(props: { api: Ks2Api; actId: string; canEdit: boolean; hasTemplate?: boolean; onBack: () => void; save?: (b: Uint8Array, n: string) => void }): ReactElement {
  const { api, actId, canEdit, onBack } = props;
  const saveBytes = props.save || saveFile;
  const [data, setData] = useState<Ks2ActData | null>(null);
  const [rows, setRows] = useState<Ks2Row[]>([]);
  const [header, setHeader] = useState<Ks2Header>(emptyKs2Header());
  const [text, setText] = useState<Record<string, { qty: string; price: string }>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Ks2RevisionItem[] | null>(null);
  const [confirm, setConfirm] = useState<'' | 'issue' | 'annul'>('');
  const [reason, setReason] = useState('');
  const [form, setForm] = useState<'template' | 'unified' | 'offer'>(props.hasTemplate ? 'template' : 'unified');
  // «В файл оферты» (P2-0012): какая редакция ждёт выбора файла заказчика.
  const [offerFor, setOfferFor] = useState<{ snapshot: Ks2Snapshot; revisionNo: number } | null>(null);

  async function load(): Promise<void> {
    const r = await api.act(actId);
    if (!r.ok) { setError(r.message); return; }
    const rs = actRowsOf(r.value);
    setData(r.value); setRows(rs); setHeader(actHeader(r.value)); setDirty(false);
    setText(Object.fromEntries(rs.map((x) => [x.source_row_id, { qty: numText(x.qty), price: numText(x.price) }])));
  }
  useEffect(() => { void load(); }, [actId]);

  if (!data) return h('div', { className: 'pj-tab' }, error ? h('div', { className: 'pf-error', role: 'alert' }, error) : h('div', { className: 'pf-muted' }, 'Загрузка…'));

  const act = data.act;
  const editable = canEdit && act.status === 'draft';
  const snap = snapshotOf(header, rows);
  const total = actTotal(snap);
  const problems = ks2Problems(snap);
  const edited = rows.filter(isEdited).length;

  const patchRow = (id: string, f: (r: Ks2Row) => Ks2Row): void => { setRows(rows.map((r) => (r.source_row_id === id ? f(r) : r))); setDirty(true); setNotice(''); };
  function onNum(id: string, field: 'qty' | 'price', value: string): void {
    setText({ ...text, [id]: { ...text[id], [field]: value } });
    const v = value.trim() === '' ? null : parseQty(value);
    if (field === 'qty') patchRow(id, (r) => ({ ...r, qty: v === null || v < 0 ? r.qty : v }));
    else patchRow(id, (r) => ({ ...r, price: value.trim() === '' ? null : v === null || v < 0 ? r.price : Math.round(v * 100) / 100 }));
  }
  function resetRow(r: Ks2Row): void {
    patchRow(r.source_row_id, (x) => ({ ...x, qty: x.sys_qty, price: x.sys_price, excluded: false }));
    setText({ ...text, [r.source_row_id]: { qty: numText(r.sys_qty), price: numText(r.sys_price) } });
  }

  async function save(): Promise<void> {
    if (busy) return;
    const bad = rows.find((r) => { const t = text[r.source_row_id]; return t && t.qty.trim() !== '' && parseQty(t.qty) === null; });
    if (bad) { setError(`Неверный объём в строке «${bad.name}»`); return; }
    setBusy(true); setError('');
    const r = await api.save(actId, header, toEdits(rows), '');
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    await load();
    setNotice(`Сохранена редакция ${r.value}`);
  }

  async function download(snapshot: Ks2Snapshot, revisionNo: number): Promise<void> {
    if (busy) return;
    if (form === 'offer') { setOfferFor({ snapshot, revisionNo }); setError(''); setNotice(''); return; }
    setBusy(true); setError('');
    try {
      let bytes: Uint8Array;
      if (form === 'template' && props.hasTemplate) {
        const t = await api.template(act.project_id);
        if (!t.ok || !t.value) throw new Error(t.ok ? 'Бланк проекта не найден — выберите унифицированную форму' : t.message);
        bytes = await fillTemplate(fromBase64(t.value.data), snapshot);
      } else bytes = await writeUnifiedKs2(snapshot);
      saveBytes(bytes, ks2FileName(snapshot.header.act_no || act.act_no, revisionNo));
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сформировать файл'); }
    setBusy(false);
  }
  /** Акт в файл оферты: объёмы акта — в «Кол-во» строк заказчика; формулы и строки КВР не трогаются. */
  async function toOffer(file: File): Promise<void> {
    if (!offerFor || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const { readWorkbook } = await import('../vor/xlsx-reader.ts');
      const { patchXlsx } = await import('../vor/xlsx-writer.ts');
      const plan = planOffer((await readWorkbook(buf)).sheets, offerFor.snapshot);
      if (plan.missing.length || !plan.sheets.length) {
        throw new Error(`Это другой файл: в нём нет строк акта (${plan.missing.length}) — например, ${plan.missing.slice(0, 3).join(', ')}. Выберите файл оферты, из которого загружен ВОР.`);
      }
      let bytes: Uint8Array = buf, written = 0, formulas = 0, zero = 0;
      for (const sh of plan.sheets) {
        const res = await patchXlsx(bytes, sh.sheet, sh.writes);
        bytes = res.bytes; written += res.written.length; formulas += res.skippedFormula.length; zero += sh.zero;
      }
      saveBytes(bytes, offerFileName(file.name, offerFor.snapshot.header.act_no || act.act_no, offerFor.revisionNo));
      setNotice(`КС-2 в файле оферты: объём вписан в ${written} строк${zero ? ` (из них ${zero} — 0, нет в акте)` : ''}${formulas ? `; формул заказчика не тронуто ${formulas}` : ''}`
        + `${plan.priceDiff.length ? `; цена в файле отличается от цены акта у ${plan.priceDiff.length} строк — выберите файл с договорным КП` : ''}. Файл скачан.`);
      setOfferFor(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось записать акт в файл'); }
    setBusy(false);
  }
  async function downloadRevision(id: string): Promise<void> {
    const r = await api.revision(id);
    if (!r.ok) { setError(r.message); return; }
    await download(r.value.snapshot, r.value.revision_no);
  }
  async function toggleHistory(): Promise<void> {
    if (history) { setHistory(null); return; }
    const r = await api.revisions(actId);
    if (r.ok) setHistory(r.value); else setError(r.message);
  }
  async function issue(): Promise<void> {
    if (busy) return;
    setBusy(true); setError('');
    const r = await api.issue(actId);
    setBusy(false); setConfirm('');
    if (!r.ok) { setError(r.message); return; }
    await load(); setHistory(null);
    setNotice('Акт выдан. Его объём не попадёт в следующие акты.');
  }
  async function annul(): Promise<void> {
    if (busy) return;
    if (!reason.trim()) { setError('Укажите причину аннулирования'); return; }
    setBusy(true); setError('');
    const r = await api.annul(actId, reason.trim());
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setConfirm(''); setReason(''); await load(); setHistory(null);
    setNotice('Акт аннулирован. Его объём снова доступен следующим актам.');
  }

  const headForm = h('details', { className: 'pf-card k2-head', 'data-testid': 'k2-head' },
    h('summary', null, h('b', null, 'Реквизиты шапки'), h('span', { className: header.customer ? 'pf-muted' : 'ft-warn' }, ` ${header.customer || 'заказчик не указан'} · договор ${header.contract_no || '—'}`)),
    h('div', { className: 'k2-head-grid' }, FIELDS.map((f) => h('label', { key: f.key, className: 'pf-field' + (f.wide ? ' k2-wide' : '') }, f.label,
      h('input', { className: 'pj-input', type: f.date ? 'date' : 'text', value: header[f.key], disabled: !editable, maxLength: 500, 'data-field': f.key,
        onChange: (e) => { setHeader({ ...header, [f.key]: (e.target as HTMLInputElement).value }); setDirty(true); setNotice(''); } })))),
    h('div', { className: 'pf-muted k2-hint' }, 'Реквизиты запоминаются для следующих актов проекта.'));

  const table = h('div', { className: 'pf-card k2-rows', 'data-testid': 'k2-rows' },
    h('div', { className: 'k2-row k2-row--head' }, h('span', null, '№'), h('span', null, 'Наименование (как у заказчика)'), h('span', null, 'ЕИ'),
      h('span', { className: 'pf-num' }, 'С начала работ'), h('span', { className: 'pf-num' }, 'Выставлено ранее'), h('span', { className: 'pf-num' }, 'По системе'),
      h('span', { className: 'pf-num' }, 'В акт'), h('span', { className: 'pf-num' }, 'Цена, ₽'), h('span', { className: 'pf-num' }, 'Сумма, ₽'), h('span', null)),
    rows.map((r) => {
      const ed = isEdited(r);
      const t = text[r.source_row_id] || { qty: '', price: '' };
      return h('div', { key: r.source_row_id, className: `k2-row k2-row--${r.kind}${ed ? ' k2-row--edited' : ''}${r.excluded ? ' k2-row--excluded' : ''}${r.price === null && !r.excluded && r.qty > 0 ? ' k2-row--unpriced' : ''}`, 'data-row': r.row_no },
        h('span', { className: 'k2-c-no' }, r.number || String(r.row_no)),
        h('span', { className: 'k2-c-name' }, r.name,
          ed ? h('span', { className: 'k2-edited', title: `система: ${fmtQty(r.sys_qty)} × ${r.sys_price === null ? 'нет цены' : money(r.sys_price)}`, 'data-testid': 'k2-edited' }, r.excluded ? 'исключена' : 'правка ПТО') : null,
          r.price === null && !r.excluded && r.qty > 0 ? h('span', { className: 'es-badge es-badge--none' }, 'без цены') : null),
        h('span', { className: 'k2-c-unit pf-unit' }, r.unit),
        h('span', { className: 'pf-num k2-c-total' }, fmtQty(r.total_qty)),
        h('span', { className: 'pf-num k2-c-prev' }, fmtQty(r.prev_qty)),
        h('span', { className: 'pf-num k2-c-sys' }, fmtQty(r.sys_qty)),
        h('span', { className: 'pf-num k2-c-qty' }, editable && !r.excluded
          ? h('input', { className: 'pj-input pf-num k2-in', inputMode: 'decimal', value: t.qty, 'aria-label': 'В акт', 'data-testid': 'k2-qty', onChange: (e) => onNum(r.source_row_id, 'qty', (e.target as HTMLInputElement).value) })
          : fmtQty(r.qty)),
        h('span', { className: 'pf-num k2-c-price' }, editable && !r.excluded
          ? h('input', { className: 'pj-input pf-num k2-in', inputMode: 'decimal', value: t.price, 'aria-label': 'Цена', 'data-testid': 'k2-price', onChange: (e) => onNum(r.source_row_id, 'price', (e.target as HTMLInputElement).value) })
          : (r.price === null ? '—' : money(r.price))),
        h('span', { className: 'pf-num k2-c-sum' }, r.excluded ? '—' : money(rowCost(r))),
        h('span', { className: 'k2-c-act' }, editable
          ? [h('button', { key: 'x', type: 'button', className: 'pf-btn pf-btn--ghost k2-small', 'data-testid': 'k2-exclude', onClick: () => patchRow(r.source_row_id, (x) => ({ ...x, excluded: !x.excluded })) }, r.excluded ? 'Вернуть' : 'Исключить'),
             ed && !r.excluded ? h('button', { key: 'r', type: 'button', className: 'pf-btn pf-btn--ghost k2-small', 'data-testid': 'k2-reset', title: 'Вернуть объём и цену системы', onClick: () => resetRow(r) }, 'Как система') : null]
          : null));
    }),
    !rows.length ? h('div', { className: 'pj-empty pf-muted', 'data-testid': 'k2-norows' }, 'Нет принятого факта по дату окончания периода, ещё не вошедшего в выданные акты.') : null,
    h('div', { className: 'k2-total', 'data-testid': 'k2-total' }, h('span', null, 'Итого по акту'), h('b', { className: 'pf-num' }, `${money(total)} ₽`)));

  return h('div', { className: 'pj-tab k2-act', 'data-testid': 'k2-act' },
    h('div', { className: 'k2-act-top' },
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'k2-back', onClick: onBack }, '← К списку актов'),
      h('h3', { className: 'k2-act-title' }, `Акт № ${act.act_no} от ${ruDate(act.act_date)}`,
        h('span', { className: 'pf-muted' }, ` · период ${ruDate(act.period_from)} — ${ruDate(act.period_to)} · `),
        h('span', { className: `k2-badge k2-badge--${act.status}` }, STATUS_LABEL[act.status])),
      h('div', { className: 'pf-muted' }, data.last_revision ? `Редакция ${data.last_revision.revision_no} от ${new Date(data.last_revision.created_at).toLocaleString('ru-RU')}` : 'Ещё не сохранён',
        edited ? ` · правок ПТО: ${edited}` : '', dirty ? ' · есть несохранённые изменения' : '')),
    act.status === 'annulled' && act.annul_reason ? h('div', { className: 'pf-error' }, `Аннулирован: ${act.annul_reason}`) : null,
    headForm, table,
    editable && problems.length ? h('div', { className: 'ft-warn', 'data-testid': 'k2-problems' }, problems.join(' ')) : null,
    notice ? h('div', { className: 'pj-notice', role: 'status', 'data-testid': 'k2-notice' }, notice) : null,
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    data.last_revision ? h('div', { className: 'pf-seg k2-form-seg', role: 'tablist', 'data-testid': 'k2-form' },
      props.hasTemplate ? h('button', { type: 'button', role: 'tab', 'aria-selected': form === 'template', className: 'pf-seg-btn' + (form === 'template' ? ' pf-seg-btn--active' : ''), 'data-testid': 'k2-form-template', onClick: () => { setForm('template'); setOfferFor(null); } }, 'Бланк проекта') : null,
      h('button', { type: 'button', role: 'tab', 'aria-selected': form === 'unified', className: 'pf-seg-btn' + (form === 'unified' ? ' pf-seg-btn--active' : ''), 'data-testid': 'k2-form-unified', onClick: () => { setForm('unified'); setOfferFor(null); } }, 'Унифицированная КС-2'),
      h('button', { type: 'button', role: 'tab', 'aria-selected': form === 'offer', className: 'pf-seg-btn' + (form === 'offer' ? ' pf-seg-btn--active' : ''), 'data-testid': 'k2-form-offer', onClick: () => setForm('offer') }, 'В файл оферты')) : null,
    offerFor ? h('div', { className: 'pf-card k2-confirm', 'data-testid': 'k2-offer' },
      h('b', null, `Акт, редакция ${offerFor.revisionNo}: выберите файл оферты заказчика (исходный или с ценами КП)`),
      h('div', { className: 'pf-muted' }, 'В «Кол-во» строк заказчика впишется объём акта; цены, формулы и строки КВР не меняются — Excel пересчитает суммы сам.'),
      h('div', { className: 'pj-actions' },
        h('label', { className: 'pf-btn k2-file' + (busy ? ' k2-file--busy' : '') }, busy ? 'Записываю…' : 'Выбрать файл (.xlsx)',
          h('input', { type: 'file', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', disabled: busy, 'data-testid': 'k2-offer-file',
            onChange: (e) => { const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; if (f) void toOffer(f); } })),
        h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setOfferFor(null) }, 'Отмена'))) : null,
    h('div', { className: 'pj-actions k2-actions' },
      editable ? h('button', { type: 'button', className: 'pf-btn', disabled: busy, 'data-testid': 'k2-save', onClick: () => { void save(); } }, 'Сохранить редакцию') : null,
      data.last_revision ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy || dirty, 'data-testid': 'k2-download', title: dirty ? 'Сначала сохраните изменения' : '',
        onClick: () => { void download(data.last_revision!.snapshot, data.last_revision!.revision_no); } }, 'Скачать Excel') : null,
      data.last_revision ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'k2-history-btn', onClick: () => { void toggleHistory(); } }, history ? 'Скрыть историю' : 'История') : null,
      editable && data.last_revision ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy || dirty, 'data-testid': 'k2-issue', title: dirty ? 'Сначала сохраните изменения' : '',
        onClick: () => { setConfirm('issue'); setError(''); } }, 'Выдать') : null,
      canEdit && act.status === 'issued' ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'k2-annul', onClick: () => { setConfirm('annul'); setError(''); } }, 'Аннулировать') : null),
    editable && !data.last_revision ? h('div', { className: 'pf-muted' }, 'Сохраните редакцию — после этого акт можно скачать и выдать.') : null,
    dirty && data.last_revision ? h('div', { className: 'pf-muted' }, 'Скачать и выдать можно сохранённую редакцию — сначала сохраните изменения.') : null,
    confirm === 'issue' ? h('div', { className: 'pf-card k2-confirm', role: 'dialog', 'data-testid': 'k2-issue-confirm' },
      h('b', null, `Выдать акт № ${act.act_no} (редакция ${data.last_revision?.revision_no}) на ${money(data.last_revision?.total ?? 0)} ₽?`),
      h('div', { className: 'pf-muted' }, 'Выданный акт изменить нельзя — только аннулировать с причиной. Его объём не войдёт в следующие акты.'),
      h('div', { className: 'pj-actions' },
        h('button', { type: 'button', className: 'pf-btn', disabled: busy, 'data-testid': 'k2-issue-yes', onClick: () => { void issue(); } }, 'Да, выдать'),
        h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setConfirm('') }, 'Отмена'))) : null,
    confirm === 'annul' ? h('div', { className: 'pf-card k2-confirm', role: 'dialog', 'data-testid': 'k2-annul-confirm' },
      h('label', { className: 'pf-field' }, 'Причина аннулирования', h('input', { className: 'pj-input', value: reason, maxLength: 1000, 'data-testid': 'k2-annul-reason', onChange: (e) => setReason((e.target as HTMLInputElement).value) })),
      h('div', { className: 'pj-actions' },
        h('button', { type: 'button', className: 'pf-btn', disabled: busy, 'data-testid': 'k2-annul-yes', onClick: () => { void annul(); } }, 'Аннулировать акт'),
        h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => { setConfirm(''); setReason(''); } }, 'Отмена'))) : null,
    history ? h('div', { className: 'pf-card k2-history', 'data-testid': 'k2-history' },
      history.map((v) => h('div', { key: v.id, className: 'k2-hrow', 'data-revision': v.revision_no },
        h('b', null, `Редакция ${v.revision_no}`, v.issued ? h('span', { className: 'k2-badge k2-badge--issued' }, ' выдана') : null),
        h('span', { className: 'pf-muted' }, `${new Date(v.created_at).toLocaleString('ru-RU')} · ${v.created_by_email || '—'}`),
        h('span', { className: 'pf-num' }, `${money(v.total)} ₽`),
        h('button', { type: 'button', className: 'pf-btn pf-btn--ghost k2-small', disabled: busy, 'data-testid': 'k2-rev-download', onClick: () => { void downloadRevision(v.id); } }, 'Скачать')))) : null);
}

export const KS2_ACT_CSS = `
.k2-file{position:relative;overflow:hidden;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-height:40px}
.k2-file input{position:absolute;inset:0;opacity:0;cursor:pointer}
.k2-file--busy{opacity:.7;cursor:progress}
.k2-act{container-type:inline-size;container-name:k2act}
.k2-act-top{display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.k2-act-title{margin:0;font-size:18px;overflow-wrap:anywhere}
.k2-head{padding:12px 14px;overflow:visible}
.k2-head summary{cursor:pointer;min-height:32px;display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center}
.k2-head-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:10px 0 6px}
.k2-head-grid .k2-wide{grid-column:span 2}
.k2-rows{display:flex;flex-direction:column;max-height:70vh;overflow:auto;overscroll-behavior:contain}
.k2-row{display:grid;grid-template-columns:56px minmax(240px,1fr) 48px 92px 92px 92px 104px 112px 120px 128px;gap:4px 8px;align-items:center;padding:6px 12px;border-bottom:1px solid var(--card-border);font-size:13px}
.k2-row--head{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);position:sticky;top:0;background:var(--card-bg);z-index:1}
.k2-row--material .k2-c-name{padding-left:14px;color:var(--text-muted)}
.k2-row--edited{box-shadow:inset 3px 0 0 var(--primary)}
.k2-row--unpriced{box-shadow:inset 3px 0 0 var(--color-yellow)}
.k2-row--excluded .k2-c-name,.k2-row--excluded .k2-c-qty{text-decoration:line-through;color:var(--text-muted)}
.k2-c-no{font-size:11px;color:var(--text-muted);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.k2-c-name{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;min-width:0;overflow-wrap:anywhere}
.k2-c-act{display:flex;flex-direction:column;gap:4px;align-items:stretch}
.k2-edited{font-size:10px;font-weight:700;text-transform:uppercase;padding:1px 6px;border-radius:6px;border:1px solid var(--primary);color:var(--primary)}
.k2-in{width:100%;min-height:32px;padding:4px 8px;font-size:14px;box-sizing:border-box}
.k2-small{min-height:30px;padding:3px 8px;font-size:12px}
.k2-form-seg{align-self:stretch;max-width:460px}
.k2-form-seg .pf-seg-btn{min-width:0;white-space:normal;letter-spacing:.04em;line-height:1.2}
.k2-confirm{display:flex;flex-direction:column;gap:10px;padding:12px 14px;overflow:visible}
.k2-history{display:flex;flex-direction:column}
.k2-hrow{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr) 150px auto;gap:6px 12px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--card-border);font-size:13px}
.k2-hrow:last-child{border-bottom:0}
.k2-total{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;font-size:15px;position:sticky;bottom:0;background:var(--card-bg);border-top:1px solid var(--card-border)}
@container k2act (max-width:1180px){
.k2-row{grid-template-columns:56px repeat(6,minmax(0,1fr)) 128px}
.k2-c-name{grid-column:2/-1}
.k2-row--head>span:nth-child(2){grid-column:2/-1}
}
@container k2act (max-width:700px){
.k2-rows{max-height:none;overflow:visible}
.k2-row--head{display:none}
.k2-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr);padding:10px 12px}
.k2-c-no,.k2-c-name,.k2-c-act{grid-column:1/-1}
.k2-c-act{flex-direction:row;flex-wrap:wrap}
.k2-row .pf-num{text-align:left}
.k2-c-unit::before{content:'ЕИ: '}
.k2-c-total::before{content:'С начала работ: '}
.k2-c-prev::before{content:'Выставлено ранее: '}
.k2-c-sys::before{content:'По системе: '}
.k2-c-sum::before{content:'Сумма: '}
.k2-c-qty,.k2-c-price{display:flex;flex-direction:column;gap:2px}
.k2-c-qty::before{content:'В акт';font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted)}
.k2-c-price::before{content:'Цена, ₽';font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted)}
.k2-head-grid .k2-wide{grid-column:1/-1}
.k2-hrow{grid-template-columns:minmax(0,1fr) auto}
.k2-hrow .pf-muted{grid-column:1/-1;order:3}
}
`;
