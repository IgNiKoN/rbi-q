/**
 * P2-0057: PDF-планы мест на экране «Компания → Объекты и места». PlanBlock — блок «План» карточки этажа / квартиры: текущая
 * версия («Открыть», «Заменить», «Снять»), «Версии» (номер, дата, кто загрузил, «Открыть», «Сделать текущей»); нет плана —
 * «Загрузить план» и подсказка про перетаскивание. PlansMatch — лист сопоставления нескольких PDF, брошенных на объект или
 * секцию: по имени файла (place-plans.ts: matchPlanFiles) с выбором «не нашлось — выберите», предпросмотр «что куда», «Загрузить».
 * Файл открывается внутри приложения (кэш приложения подставляет вход — закрытый бакет), без сети — если был скачан.
 */
import { createElement as h, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { PlaceNode, PlacePlan } from '../core/projects.service.ts';
import { Sheet } from '../ui/index.ts';
import { dateText, matchPlanFiles, sizeText } from './place-plans.ts';
import type { PlanSlot } from './place-plans.ts';

type PdfWin = {
  rbiLoadCloudPdfArrayBuffer?: (url: string) => Promise<ArrayBuffer>;
  rbiOpenPdfDocument?: (o: { title: string; fileName: string; arrayBuffer: ArrayBuffer; httpsUrl?: string }) => Promise<void>;
};

/** Открыть файл плана: предпросмотр приложения (как PDF Качества); без него — новая вкладка. */
export async function openPlan(p: PlacePlan, title: string): Promise<string | null> {
  const w = (typeof window !== 'undefined' ? window : {}) as PdfWin;
  try {
    if (w.rbiLoadCloudPdfArrayBuffer && w.rbiOpenPdfDocument) {
      const buf = await w.rbiLoadCloudPdfArrayBuffer(p.file_url);
      await w.rbiOpenPdfDocument({ title, fileName: p.file_name, arrayBuffer: buf });
      return null;
    }
    const res = await fetch(p.file_url);
    if (!res.ok) return 'Файл плана не открылся';
    const url = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'application/pdf' }));
    window.open(url, '_blank', 'noopener');
    return null;
  } catch (e) {
    return e instanceof Error && /кэширован|интернет/i.test(e.message) ? 'Без сети план открывается, если был скачан на устройство' : 'Файл плана не открылся';
  }
}

export function PlanBlock(props: {
  place: PlaceNode; current: PlacePlan | null; versions: PlacePlan[]; edit: boolean; busy: boolean; pc: boolean;
  onUpload: (f: File) => void; onSetCurrent: (p: PlacePlan) => void; onRemove: () => void; onError: (m: string) => void;
}): ReactElement {
  const { place, current, versions, edit, busy } = props;
  const [showAll, setShowAll] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const open = (p: PlacePlan): void => { void openPlan(p, `${place.name} · план, версия ${p.version_no}`).then((m) => { if (m) props.onError(m); }); };
  const pick = h('input', { ref: fileRef, type: 'file', accept: 'application/pdf,.pdf', hidden: true, 'data-testid': 'op-plan-file',
    onChange: (e: Event) => { const el = e.target as HTMLInputElement; const f = el.files && el.files[0]; el.value = ''; if (f) props.onUpload(f); } });
  const who = (p: PlacePlan): string => [dateText(p.created_at), p.author].filter(Boolean).join(' · ');
  return h('section', { className: 'op-plan', 'data-testid': 'op-plan', 'aria-label': 'План' },
    h('div', { className: 'op-plan__t' }, h('b', null, 'План'), versions.length ? h('span', { className: 'pf-tab-n' }, `версий ${versions.length}`) : null),
    current
      ? h('div', { className: 'op-plan__cur', 'data-testid': 'op-plan-current' },
          h('span', { className: 'op-plan__ico', 'aria-hidden': 'true' }, 'PDF'),
          h('div', { className: 'op-plan__file' }, h('b', { title: current.file_name }, current.file_name),
            h('small', null, [`версия ${current.version_no}`, sizeText(current.file_size), who(current)].filter(Boolean).join(' · '))))
      : h('div', { className: 'op-plan__none', 'data-testid': 'op-plan-none' }, versions.length
          ? 'План снят — прежние версии ниже, любую можно сделать текущей.'
          : edit ? (props.pc ? 'Плана нет. Загрузите PDF или перетащите файл на строку этого места в дереве.' : 'Плана нет. Загрузите PDF.') : 'Плана нет.'),
    h('div', { className: 'op-plan__acts' },
      current ? h('button', { type: 'button', className: 'pf-btn op-gold', 'data-testid': 'op-plan-open', onClick: () => open(current) }, 'Открыть') : null,
      edit ? h('button', { type: 'button', className: 'pf-btn' + (current ? ' pf-btn--ghost' : ' op-gold'), 'data-testid': 'op-plan-upload', disabled: busy,
        onClick: () => fileRef.current?.click() }, current ? 'Заменить' : 'Загрузить план') : null,
      edit && current ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'op-plan-remove', disabled: busy, onClick: props.onRemove }, 'Снять') : null),
    versions.length > (current ? 1 : 0) ? h('div', { className: 'op-plan__vers', 'data-testid': 'op-plan-versions' },
      h('button', { type: 'button', className: 'op-plan__more', 'aria-expanded': showAll, 'data-testid': 'op-plan-versions-toggle', onClick: () => setShowAll(!showAll) },
        (showAll ? '▾ ' : '▸ ') + `Версии (${versions.length})`),
      showAll ? h('ol', { className: 'op-plan__list' }, versions.map((p) => h('li', { key: p.id, className: p.is_current ? 'is-cur' : '', 'data-testid': 'op-plan-version' },
        h('div', { className: 'op-plan__vi' }, h('b', null, `№ ${p.version_no}`, p.is_current ? h('span', { className: 'op-plan__tag' }, 'текущая') : null),
          h('small', { title: p.file_name }, [p.file_name, who(p)].filter(Boolean).join(' · '))),
        h('div', { className: 'op-plan__va' },
          h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'op-plan-v-open', onClick: () => open(p) }, 'Открыть'),
          edit && !p.is_current ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'op-plan-v-current', disabled: busy,
            onClick: () => props.onSetCurrent(p) }, 'Сделать текущей') : null)))) : null) : null,
    pick);
}

export interface MatchRow { file: File; targets: string[] }

/** Лист: несколько PDF на объект / секцию — куда какой файл; «Загрузить» отдаёт пары файл → места. */
export function PlansMatch(props: {
  files: File[]; scope: PlaceNode; slots: PlanSlot[]; hasPlan: (id: string) => boolean; busy: boolean; progress: string;
  onClose: () => void; onUpload: (rows: MatchRow[]) => void;
}): ReactElement {
  const { files, slots } = props;
  const auto = useMemo(() => matchPlanFiles(files.map((f) => f.name), slots), [files, slots]);
  const [choice, setChoice] = useState<string[]>(() => auto.map((m) => m.targets.join(',')));
  const byId = new Map(slots.map((s) => [s.place.id, s]));
  const label = (ids: string[]): string => {
    if (!ids.length) return '';
    if (ids.length > 1) { const s = byId.get(ids[0]); return `${s ? s.place.name : ''} · все секции (${ids.length})`; }
    const s = byId.get(ids[0]); return s ? s.label : '';
  };
  const rows = files.map((f, i) => ({ file: f, m: auto[i], ids: choice[i] ? choice[i].split(',') : [] }));
  const taken = new Map<string, number>();
  rows.forEach((r) => r.ids.forEach((id) => taken.set(id, (taken.get(id) || 0) + 1)));
  const dupe = (ids: string[]): boolean => ids.some((id) => (taken.get(id) || 0) > 1);
  const ready = rows.filter((r) => r.ids.length && !dupe(r.ids));
  const places = ready.reduce((n, r) => n + r.ids.length, 0);
  const replace = ready.reduce((n, r) => n + r.ids.filter((id) => props.hasPlan(id)).length, 0);
  const optionList = (r: (typeof rows)[number]): string[][] => {
    const seen = new Set(r.m.options.map((o) => o.join(',')));
    return [...r.m.options, ...slots.filter((s) => !seen.has(s.place.id)).map((s) => [s.place.id])];
  };
  return h(Sheet, { title: 'Планы: куда какой файл', sub: `${props.scope.name} · файлов ${files.length}`, testId: 'op-plans-match', onClose: props.onClose,
    footer: h('div', { className: 'op-foot' },
      h('span', { className: 'op-pm__sum', 'data-testid': 'op-pm-sum' }, props.progress || (ready.length
        ? `Загрузим ${ready.length} из ${files.length} файлов на ${places} мест${replace ? ` · заменим план у ${replace}` : ''}` : 'Выберите места для файлов')),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: props.onClose, disabled: props.busy }, 'Отмена'),
      h('button', { type: 'button', className: 'pf-btn op-gold', 'data-testid': 'op-pm-go', disabled: props.busy || !ready.length,
        onClick: () => props.onUpload(ready.map((r) => ({ file: r.file, targets: r.ids }))) }, ready.length ? `Загрузить ${ready.length}` : 'Загрузить')) },
    h('p', { className: 'op-p' }, 'Сопоставили по имени файла: «Этаж 3», «3 этаж», «эт. -1», «Секция 2 этаж 5», «кв 45». Этаж с номером из имени в нескольких секциях — план получат все; можно выбрать одну.'),
    h('ul', { className: 'op-pm', 'data-testid': 'op-pm-list' }, rows.map((r, i) => {
      const bad = !r.ids.length || dupe(r.ids);
      return h('li', { key: i, className: 'op-pm__row' + (bad ? ' is-bad' : ''), 'data-testid': 'op-pm-row' },
        h('div', { className: 'op-pm__file' }, h('span', { className: 'op-plan__ico', 'aria-hidden': 'true' }, 'PDF'),
          h('div', null, h('b', { title: r.file.name }, r.file.name), h('small', null, sizeText(r.file.size)))),
        h('span', { className: 'op-pm__arrow', 'aria-hidden': 'true' }, '→'),
        h('div', { className: 'op-pm__to' },
          h('select', { className: 'pj-input', value: choice[i], 'aria-label': `Место для «${r.file.name}»`, 'data-testid': 'op-pm-select', disabled: props.busy,
            onChange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; setChoice((c) => c.map((x, k) => (k === i ? v : x))); } },
            h('option', { value: '' }, '— не загружать —'),
            optionList(r).map((o) => h('option', { key: o.join(','), value: o.join(',') }, label(o) + (o.some((id) => props.hasPlan(id)) ? ' · новая версия' : '')))),
          h('small', { className: bad ? 'op-pm__why' : 'op-pm__ok' }, !r.ids.length ? (r.m.reason || 'Не загружать') : dupe(r.ids) ? 'Это место выбрано и для другого файла' : 'Нашли по имени файла')));
    })));
}

export const PLANS_CSS = `
.op-plan{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--card-border);padding-top:12px}
.op-plan__t{display:flex;align-items:center;gap:8px;font-size:14px}
.op-plan__cur,.op-pm__file{display:flex;align-items:center;gap:10px;min-width:0}
.op-plan__ico{flex:none;display:inline-flex;align-items:center;justify-content:center;width:38px;height:44px;border-radius:6px;border:1px solid var(--card-border);
  background:var(--card-bg-2,var(--card-bg));font-size:10.5px;font-weight:700;letter-spacing:.04em;color:var(--bad-text,var(--color-red,#9f4c45))}
.op-plan__file,.op-pm__file>div{display:flex;flex-direction:column;min-width:0}
.op-plan__file b,.op-pm__file b{font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.op-plan__file small,.op-pm__file small,.op-plan__vi small{font-size:12.5px;color:var(--text-muted);overflow-wrap:anywhere}
.op-plan__none{font-size:13.5px;color:var(--text-muted);line-height:1.45}
.op-plan__acts{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px}
.op-plan__acts .pf-btn{min-height:42px;justify-content:center}
.op-plan__more{font:inherit;font-size:13.5px;align-self:flex-start;border:0;background:transparent;color:var(--accent-text,var(--primary));padding:6px 0;min-height:36px;cursor:pointer}
.op-plan__list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.op-plan__list li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 10px;padding:8px 10px;border:1px solid var(--card-border);border-radius:10px}
.op-plan__list li.is-cur{border-color:var(--accent,var(--primary))}
.op-plan__vi{display:flex;flex-direction:column;min-width:0;flex:1 1 160px}
.op-plan__vi b{font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:6px}
.op-plan__tag{font-size:11.5px;font-weight:600;color:var(--good-text,var(--new,#52705f));border:1px solid currentColor;border-radius:999px;padding:0 6px}
.op-plan__va{display:flex;gap:6px;flex-wrap:wrap}
.op-plan__va .pf-btn{min-height:36px}
.p2-tree__row.op-file-row,.op-chess__cell.op-file-row,.op-chess__row.op-file-row{outline:2px dashed var(--accent,var(--primary));outline-offset:-2px;background:var(--sel-bg,rgba(196,154,95,.12))}
.op-has-plan{font-size:11px;font-weight:700;letter-spacing:.03em;color:var(--bad-text,var(--color-red,#9f4c45))}
.op-chess__cell.has-plan{box-shadow:inset 0 -3px 0 var(--accent,var(--primary))}
.op-pm{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.op-pm__row{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:6px 8px;padding:8px 10px;border:1px solid var(--card-border);border-radius:12px}
.op-pm__file{grid-column:1/-1}
[data-testid=op-plans-match] .p2-sheet__foot{position:sticky;bottom:calc(-16px - env(safe-area-inset-bottom,0px));margin:0 -16px;padding:10px 16px calc(12px + env(safe-area-inset-bottom,0px));
  background:var(--card-bg);border-top:1px solid var(--card-border);align-items:center}
.op-pm__row.is-bad{border-style:dashed}
.op-pm__arrow{color:var(--text-muted)}
.op-pm__to{display:flex;flex-direction:column;gap:3px;min-width:0}
.op-pm__to .pj-input{width:100%;min-height:42px;box-sizing:border-box}
.op-pm__why{font-size:12.5px;color:var(--bad-text,var(--color-red,#9f4c45))}
.op-pm__ok{font-size:12.5px;color:var(--text-muted)}
.op-pm__sum{flex:1 1 220px;font-size:13px;color:var(--text-muted);align-self:center}
`;
