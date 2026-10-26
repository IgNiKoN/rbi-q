/**
 * Надбавки («Расчёт», P2-0006c): строки по разделам — название, способ (закрытый список), параметры, база, флажок «в итог»,
 * комментарий; добавить / удалить / переставить; итоги разделов, «Всего прямые затраты», ИТОГО, ₽/м² (calc.ts).
 * EstimateOverheads — копия в смете (шаблон не меняется; «Сбросить из шаблона», «Сохранить как шаблон компании»).
 * OverheadTemplateTab — «Справочники → Надбавки»: шаблон компании (по умолчанию — строки «Расчета» 0_СЕБЕС).
 */
import { createElement as h, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { CompanyAccess } from '../../../platform/core/projects.service.ts';
import type { EstimateApi, OverheadLine, OverheadMethod, OverheadSection } from './estimate.service.ts';
import { SECTIONS, calcOverheads } from './calc.ts';
import type { OverheadResult } from './calc.ts';
import { money, parsePriceInput } from './prices.ts';

const METHODS: { id: OverheadMethod; label: string }[] = [
  { id: 'percent_of', label: '% от базы' }, { id: 'qty_rate', label: 'Количество × ставка' },
  { id: 'fixed', label: 'Сумма' }, { id: 'gross_up', label: 'Досчёт до 100 % (÷ доля × 100)' }];
const secLabel = (s: OverheadSection): string => SECTIONS.find((x) => x.id === s)?.label || s;
const numText = (n: number | undefined): string => (n === undefined || n === null ? '' : String(n).replace('.', ','));
/** «5500 × 24 × 8 × 12» → [5500, 24, 8, 12]; ошибка → null. */
export function parseFactors(s: string): number[] | null {
  const parts = s.split(/[×x*хХ]/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts.length > 10) return null;
  const out = parts.map((p) => { const t = p.replace(/[\s ]/g, '').replace(',', '.'); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN; });
  return out.some((n) => Number.isNaN(n)) ? null : out;
}
const newKey = (): string => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Числовое поле: правится как текст, применяется при уходе с поля. */
function NumInput(props: { value: string; label: string; disabled: boolean; parse: (s: string) => boolean; wide?: boolean; testid?: string }): ReactElement {
  const [text, setText] = useState(props.value);
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(props.value); setBad(false); }, [props.value]);
  return h('input', { type: 'text', inputMode: 'decimal', className: 'pj-input oh-num' + (props.wide ? ' oh-num--wide' : '') + (bad ? ' pr-input--bad' : ''), value: text,
    disabled: props.disabled, 'aria-label': props.label, title: props.label, 'aria-invalid': bad, 'data-testid': props.testid,
    onChange: (e) => setText((e.target as HTMLInputElement).value),
    onBlur: () => { const ok = props.parse(text); setBad(!ok); if (!ok) return; },
    onKeyDown: (e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); } });
}

function baseSummary(l: OverheadLine, lines: OverheadLine[]): string {
  const parts: string[] = [];
  for (const t of l.base.totals || []) parts.push(t === 'labor' ? 'Работа по ВОР' : 'Материалы по ВОР');
  for (const s of l.base.sections || []) parts.push('раздел «' + secLabel(s) + '»');
  for (const k of l.base.lines || []) parts.push('«' + (lines.find((x) => x.key === k)?.name || '?') + '»');
  return parts.length ? parts.join(' + ') : 'не выбрана';
}

function BaseEditor(props: { line: OverheadLine; lines: OverheadLine[]; onChange: (b: OverheadLine['base']) => void }): ReactElement {
  const { line, lines, onChange } = props;
  const b = line.base;
  const toggle = <T extends string>(arr: T[] | undefined, v: T): T[] => (arr || []).includes(v) ? (arr || []).filter((x) => x !== v) : [...(arr || []), v];
  const box = (checked: boolean, label: string, on: () => void, key: string) => h('label', { key, className: 'pr-check oh-bcheck' }, h('input', { type: 'checkbox', checked, onChange: on }), label);
  return h('div', { className: 'oh-base', 'data-testid': 'oh-base' },
    h('div', { className: 'oh-bgroup' }, h('span', { className: 'pr-field-label' }, 'Итоги сметы'),
      box(!!b.totals?.includes('labor'), 'Работа по ВОР', () => onChange({ ...b, totals: toggle(b.totals, 'labor') }), 'tl'),
      box(!!b.totals?.includes('material'), 'Материалы по ВОР', () => onChange({ ...b, totals: toggle(b.totals, 'material') }), 'tm')),
    h('div', { className: 'oh-bgroup' }, h('span', { className: 'pr-field-label' }, 'Разделы (строки «в итог»)'),
      SECTIONS.map((s) => box(!!b.sections?.includes(s.id), s.label, () => onChange({ ...b, sections: toggle(b.sections, s.id) }), 's' + s.id))),
    h('div', { className: 'oh-bgroup' }, h('span', { className: 'pr-field-label' }, 'Строки'),
      lines.filter((x) => x.key !== line.key).map((x) => box(!!b.lines?.includes(x.key), x.name, () => onChange({ ...b, lines: toggle(b.lines, x.key) }), 'l' + x.key))));
}

/** Редактор строк надбавок с расчётом. editable = false — только просмотр. */
export function OverheadsEditor(props: { lines: OverheadLine[]; onChange: (lines: OverheadLine[]) => void; base: { labor: number; material: number }; area: number | null; editable: boolean; showValues: boolean }): ReactElement {
  const { lines, onChange, base, area, editable, showValues } = props;
  const [openBase, setOpenBase] = useState('');
  const calc = useMemo<{ r: OverheadResult | null; err: string }>(() => {
    try { return { r: calcOverheads(lines, base, area), err: '' }; } catch (e) { return { r: null, err: e instanceof Error ? e.message : String(e) }; }
  }, [lines, base.labor, base.material, area]);
  const set = (key: string, patch: Partial<OverheadLine>): void => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  function move(key: string, dir: -1 | 1): void {
    const i = lines.findIndex((l) => l.key === key);
    const sec = lines[i].section;
    let j = i + dir;
    while (j >= 0 && j < lines.length && lines[j].section !== sec) j += dir;
    if (j < 0 || j >= lines.length) return;
    const next = lines.slice(); [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  }
  function remove(key: string): void {
    onChange(lines.filter((l) => l.key !== key).map((l) => ({ ...l, base: { ...l.base, lines: (l.base.lines || []).filter((k) => k !== key) } })));
  }
  function add(sec: OverheadSection): void {
    const last = lines.map((l) => l.section).lastIndexOf(sec);
    const nl: OverheadLine = { key: newKey(), section: sec, name: 'Новая строка', comment: null, method: 'fixed', base: {}, params: { amount: 0 }, in_total: true };
    const next = lines.slice(); next.splice(last >= 0 ? last + 1 : next.length, 0, nl); onChange(next);
  }
  const val = (k: string): string => (calc.r && showValues ? money(calc.r.values.get(k) ?? 0) : '');

  return h('div', { className: 'oh-editor', 'data-testid': 'oh-editor' },
    calc.err ? h('div', { className: 'pf-error', role: 'alert', 'data-testid': 'oh-error' }, calc.err) : null,
    SECTIONS.map((s) => {
      const sl = lines.filter((l) => l.section === s.id);
      if (!sl.length && !editable) return null;
      return h('div', { key: s.id, className: 'oh-sec', 'data-section': s.id },
        h('div', { className: 'oh-sec-head' }, h('span', null, s.label),
          showValues && calc.r ? h('span', { className: 'pf-num', 'data-testid': 'oh-sec-' + s.id }, money(calc.r.sections[s.id])) : null),
        sl.map((l) => h('div', { key: l.key, className: 'oh-line' + (l.in_total ? '' : ' oh-line--out'), 'data-key': l.key },
          h('div', { className: 'oh-main' },
            editable ? h('input', { type: 'text', className: 'pj-input oh-name', value: l.name, maxLength: 300, 'aria-label': 'Название', onChange: (e) => set(l.key, { name: (e.target as HTMLInputElement).value }) })
              : h('b', { className: 'oh-name' }, l.name),
            h('label', { className: 'pr-check oh-intotal', title: 'Входит в итог раздела' },
              h('input', { type: 'checkbox', checked: l.in_total, disabled: !editable, 'data-testid': 'oh-intotal', onChange: () => set(l.key, { in_total: !l.in_total }) }), 'в итог'),
            h('span', { className: 'pf-num oh-val', 'data-testid': 'oh-val' }, val(l.key))),
          h('div', { className: 'oh-params' },
            h('select', { className: 'pj-input oh-method', value: l.method, disabled: !editable, 'aria-label': 'Способ расчёта',
              onChange: (e) => { const m = (e.target as HTMLSelectElement).value as OverheadMethod;
                set(l.key, { method: m, params: m === 'percent_of' ? { percent: 0 } : m === 'qty_rate' ? { factors: [0] } : m === 'fixed' ? { amount: 0 } : { share: 100 } }); } },
              METHODS.map((m) => h('option', { key: m.id, value: m.id }, m.label))),
            l.method === 'percent_of' ? h(NumInput, { value: numText(l.params.percent), label: 'Процент', disabled: !editable, testid: 'oh-percent',
              parse: (t) => { const v = parsePriceInput(t.replace('%', '')); if (v === null || Number.isNaN(v)) return false; set(l.key, { params: { percent: v } }); return true; } }) : null,
            l.method === 'percent_of' ? h('span', { className: 'oh-unit' }, '%') : null,
            l.method === 'gross_up' ? h(NumInput, { value: numText(l.params.share), label: 'Доля, %', disabled: !editable,
              parse: (t) => { const v = parsePriceInput(t.replace('%', '')); if (v === null || Number.isNaN(v) || v <= 0 || v > 100) return false; set(l.key, { params: { share: v } }); return true; } }) : null,
            l.method === 'gross_up' ? h('span', { className: 'oh-unit' }, '% доля') : null,
            l.method === 'fixed' ? h(NumInput, { value: numText(l.params.amount), label: 'Сумма, ₽', disabled: !editable, wide: true,
              parse: (t) => { const v = parsePriceInput(t); if (v === null || Number.isNaN(v)) return false; set(l.key, { params: { amount: v } }); return true; } }) : null,
            l.method === 'qty_rate' ? h(NumInput, { value: (l.params.factors || []).map((f) => numText(f)).join(' × '), label: 'Множители через ×', disabled: !editable, wide: true, testid: 'oh-factors',
              parse: (t) => { const f = parseFactors(t); if (!f) return false; set(l.key, { params: { factors: f } }); return true; } }) : null,
            l.method === 'percent_of' || l.method === 'gross_up'
              ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost oh-basebtn', 'data-testid': 'oh-basebtn', onClick: () => setOpenBase(openBase === l.key ? '' : l.key) },
                  'от: ' + baseSummary(l, lines))
              : null),
          openBase === l.key && editable ? h(BaseEditor, { line: l, lines, onChange: (b) => set(l.key, { base: b }) }) : null,
          editable || l.comment
            ? h('div', { className: 'oh-foot' },
                editable ? h('input', { type: 'text', className: 'pj-input oh-comment', value: l.comment || '', maxLength: 2000, placeholder: 'Комментарий', 'aria-label': 'Комментарий',
                  onChange: (e) => set(l.key, { comment: (e.target as HTMLInputElement).value || null }) }) : h('span', { className: 'pf-muted' }, l.comment),
                editable ? h('span', { className: 'oh-acts' },
                  h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'aria-label': 'Выше', onClick: () => move(l.key, -1) }, '↑'),
                  h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'aria-label': 'Ниже', onClick: () => move(l.key, 1) }, '↓'),
                  h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'aria-label': 'Удалить строку', 'data-testid': 'oh-del', onClick: () => remove(l.key) }, '✕')) : null)
            : null)),
        editable ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost oh-add', onClick: () => add(s.id) }, `+ строка в «${s.label}»`) : null);
    }),
    showValues && calc.r
      ? h('div', { className: 'oh-totals', 'data-testid': 'oh-totals' },
          h('div', null, h('span', null, 'Всего прямые затраты'), h('b', { className: 'pf-num', 'data-testid': 'oh-direct' }, money(calc.r.direct))),
          h('div', { className: 'oh-total' }, h('span', null, 'ИТОГО'), h('b', { className: 'pf-num', 'data-testid': 'oh-total' }, money(calc.r.total))),
          h('div', null, h('span', null, area ? `₽/м² (S = ${area.toLocaleString('ru-RU')} м²)` : '₽/м² — введите S, м² сметы'),
            h('b', { className: 'pf-num', 'data-testid': 'oh-perm2' }, calc.r.perM2 !== null ? money(calc.r.perM2) : '—')))
      : null);
}

/** Блок «Расчёт» сметы: своя копия строк (шаблон компании не меняется). */
export function EstimateOverheads(props: { api: EstimateApi; estimateId: string; companyId: string; base: { labor: number; material: number }; area: number | null }): ReactElement {
  const { api, estimateId, companyId, base, area } = props;
  const [lines, setLines] = useState<OverheadLine[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmTpl, setConfirmTpl] = useState(false);
  async function load(): Promise<void> { const r = await api.overheads(estimateId); if (!r.ok) { setError(r.message); setLines([]); return; } setLines(r.value); setDirty(false); }
  useEffect(() => { void load(); }, []);
  const valid = useMemo(() => { try { if (lines) calcOverheads(lines, base, area); return true; } catch { return false; } }, [lines]);

  async function act(fn: () => Promise<{ ok: boolean; message?: string }>, ok: string): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.message || 'Не удалось'); return false; }
    setNotice(ok); return true;
  }
  if (lines === null) return h('div', { className: 'pf-muted' }, 'Загрузка расчёта…');
  return h('div', { className: 'pf-card oh-box', 'data-testid': 'oh-estimate' },
    h('div', { className: 'oh-box-head' }, h('h3', { className: 'pf-title' }, 'Расчёт: надбавки и итог'),
      h('span', { className: 'pj-actions' },
        h('button', { type: 'button', className: 'pf-btn', disabled: busy || !dirty || !valid, 'data-testid': 'oh-save',
          onClick: () => { void act(() => api.saveOverheads(estimateId, lines), 'Расчёт сметы сохранён').then((ok) => { if (ok) setDirty(false); }); } }, dirty ? 'Сохранить расчёт' : 'Сохранено'),
        h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy, 'data-testid': 'oh-reset',
          onClick: () => { void (async () => { const r = await api.template(companyId); if (!r.ok) { setError(r.message); return; } setLines(r.value); setDirty(true); setNotice('Строки взяты из шаблона компании — нажмите «Сохранить расчёт»'); })(); } }, 'Сбросить из шаблона'),
        confirmTpl
          ? h('button', { type: 'button', className: 'pf-btn un-danger', disabled: busy || !valid, 'data-testid': 'oh-to-tpl-yes',
              onClick: () => { setConfirmTpl(false); void act(() => api.saveTemplate(companyId, lines), 'Шаблон компании заменён строками этой сметы'); } }, 'Да, заменить шаблон компании')
          : h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy || !valid, 'data-testid': 'oh-to-tpl', onClick: () => setConfirmTpl(true) }, 'Сохранить как шаблон компании'))),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { className: 'pj-notice', role: 'status' }, notice) : null,
    h(OverheadsEditor, { lines, onChange: (l) => { setLines(l); setDirty(true); }, base, area, editable: !busy, showValues: true }));
}

/** «Справочники → Надбавки»: шаблон надбавок компании. Значения видны в смете (здесь итогов ВОР нет). */
export function OverheadTemplateTab(props: { api: EstimateApi; company: CompanyAccess }): ReactElement {
  const { api, company } = props;
  const [lines, setLines] = useState<OverheadLine[] | null>(null);
  const [denied, setDenied] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function load(): Promise<void> { const r = await api.template(company.company_id); if (!r.ok) { setDenied(r.message); setLines([]); return; } setLines(r.value); setDirty(false); }
  useEffect(() => { void load(); }, []);
  const valid = useMemo(() => { try { if (lines) calcOverheads(lines, { labor: 0, material: 0 }, null); return true; } catch { return false; } }, [lines]);
  if (lines === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  if (denied) return h('div', { className: 'pf-muted', 'data-testid': 'oh-noaccess' }, 'Нет права на шаблон надбавок: он доступен ПТО, руководителю проекта и администратору.');
  return h('div', { className: 'pj-tab', 'data-testid': 'oh-template' },
    h('div', { className: 'pf-muted' }, 'Шаблон надбавок компании: копируется в каждую новую смету (в смете строки правятся отдельно). Суммы считаются в смете от итогов ВОР.'),
    h('div', { className: 'pj-actions' },
      h('button', { type: 'button', className: 'pf-btn', disabled: busy || !dirty || !valid, 'data-testid': 'oh-tpl-save',
        onClick: () => { void (async () => { setBusy(true); setError(''); setNotice(''); const r = await api.saveTemplate(company.company_id, lines); setBusy(false);
          if (!r.ok) { setError(r.message); return; } setNotice('Шаблон надбавок сохранён'); setDirty(false); })(); } }, dirty ? 'Сохранить шаблон' : 'Сохранено'),
      dirty ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy, onClick: () => { void load(); } }, 'Отменить изменения') : null),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { className: 'pj-notice', role: 'status' }, notice) : null,
    h('div', { className: 'pf-card oh-box' }, h(OverheadsEditor, { lines, onChange: (l) => { setLines(l); setDirty(true); }, base: { labor: 0, material: 0 }, area: null, editable: !busy, showValues: false })));
}

export const OVERHEADS_CSS = `
.oh-box{display:flex;flex-direction:column;gap:10px;padding:14px}
.oh-box-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.oh-editor{display:flex;flex-direction:column;gap:12px}
.oh-sec{display:flex;flex-direction:column;border:1px solid var(--card-border);border-radius:12px;overflow:hidden}
.oh-sec-head{display:flex;justify-content:space-between;gap:10px;padding:8px 12px;background:var(--hover-bg);font-size:12px;font-weight:900;text-transform:uppercase}
.oh-line{display:flex;flex-direction:row;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:8px 12px;border-top:1px solid var(--card-border)}
.oh-line--out{opacity:.7}
.oh-line--out .oh-val{text-decoration:line-through}
.oh-main{display:flex;flex-wrap:wrap;gap:8px;align-items:center;flex:1 1 420px;min-width:0}
.oh-name{flex:1 1 200px;min-width:0;font-size:13px;min-height:36px}
.oh-intotal{min-height:32px}
.oh-val{min-width:130px;font-weight:700}
.oh-params{display:flex;flex-wrap:wrap;gap:6px;align-items:center;flex:1 1 460px;min-width:0}
.oh-method{flex:0 1 220px;min-height:36px}
.oh-num{width:100px;min-height:36px;box-sizing:border-box;text-align:right}
.oh-num--wide{width:220px}
.oh-unit{font-size:12px;color:var(--text-muted)}
.oh-basebtn{flex:1 1 200px;text-align:left;white-space:normal;font-weight:400;font-size:12px;padding:6px 10px}
.oh-base{flex:1 1 100%;display:flex;flex-wrap:wrap;gap:12px;padding:8px;border-radius:10px;background:var(--hover-bg)}
.oh-bgroup{display:flex;flex-direction:column;gap:2px;flex:1 1 200px;max-height:220px;overflow-y:auto}
.oh-bcheck{min-height:28px;font-size:12px}
.oh-foot{flex:1 1 100%;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.oh-comment{flex:1 1 220px;font-size:12px;min-height:32px;padding:4px 8px}
.oh-acts{display:flex;gap:4px}
.oh-acts .pf-btn{padding:6px 10px}
.oh-add{align-self:flex-start;margin:6px 12px}
.oh-totals{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border:1px solid var(--card-border);border-radius:12px}
.oh-totals>div{display:flex;justify-content:space-between;gap:10px;font-size:13px}
.oh-total{font-size:16px!important;font-weight:900}
@media (max-width:600px){.oh-num,.oh-num--wide,.oh-method{width:100%;flex:1 1 100%}.oh-val{min-width:0;flex:1 1 100%;text-align:left}.oh-box-head .pj-actions .pf-btn{flex:1 1 auto}}
`;
