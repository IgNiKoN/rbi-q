/**
 * P2-0056: лист «Загрузка списка помещений» экрана «Объекты и места». Файл Excel → лист → столбцы (узнаны по подписям,
 * владелец поправляет) → строки → предпросмотр сервера (pf_import_places, dry_run): что будет создано, что уже есть,
 * где в файле иначе, где ошибка → «Создать» одной загрузкой. Ничего не пишется, пока не нажата «Создать»;
 * при ошибке хоть в одной строке создать нельзя. Чтение Excel — сервис платформы, подгружается лениво.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { newId } from '../core/projects.service.ts';
import type { ImportResult, ImportRow, PlaceNode, ProjectsApi } from '../core/projects.service.ts';
import { Sheet } from '../ui/index.ts';
import type { SheetData } from '../services/excel/xlsx-reader.ts';
import { createdText, createdTotal, findPlaceHeader, PLACE_ROLES, rowStatus, setRole, sheetRows } from './places-import.ts';
import type { PlaceHeader, PlaceRole, RowStatus } from './places-import.ts';

const SHOW = 200;
const STATUS: Record<RowStatus, string> = { new: 'Новое', exists: 'Уже есть', differs: 'Иначе', error: 'Ошибка' };
type Filter = 'all' | RowStatus;

export function PlacesImport(props: {
  api: ProjectsApi; projectId: string; file: File; objects: PlaceNode[];
  /** Корпус для строк без корпуса (файл брошен на объект или выбран объект). */
  defaultObject: string | null;
  onClose: () => void; onDone: (res: ImportResult, batch: string) => void;
}): ReactElement {
  const { api, file } = props;
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [si, setSi] = useState(0);
  const [head, setHead] = useState<PlaceHeader | null>(null);
  const [obj, setObj] = useState<string>(props.defaultObject || (props.objects[0] ? props.objects[0].name : 'Корпус 1'));
  const [res, setRes] = useState<ImportResult | null>(null);
  const [batch] = useState(newId);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // файл → листы; первый видимый лист, где узнан заголовок
  useEffect(() => {
    let off = false;
    void (async () => {
      try {
        const { readWorkbook } = await import('../services/excel/xlsx-reader.ts');
        const wb = await readWorkbook(await file.arrayBuffer());
        if (off) return;
        const order = wb.sheets.map((s, i) => ({ s, i })).sort((a, b) => Number(!!a.s.hidden) - Number(!!b.s.hidden));
        const hit = order.find((x) => findPlaceHeader(x.s.rows));
        const i = hit ? hit.i : 0;
        setSheets(wb.sheets); setSi(i); setHead(hit ? findPlaceHeader(hit.s.rows) : null);
        if (!hit) setBusy(false);
      } catch (e) {
        if (!off) { setError(e instanceof Error ? e.message : 'Не удалось открыть файл'); setBusy(false); }
      }
    })();
    return () => { off = true; };
  }, [file]);

  const sheet = sheets ? sheets[si] : null;
  const noObjectCol = !!head && !head.roles.includes('object');
  const rows: ImportRow[] = sheet && head ? sheetRows(sheet, head, noObjectCol ? obj : null) : [];
  const key = JSON.stringify([si, head ? head.roles : null, noObjectCol ? obj : '']);

  // предпросмотр сервера при каждом изменении листа, столбцов, корпуса
  useEffect(() => {
    if (!sheet || !head || !api.importPlaces) return undefined;
    if (!rows.length) { setRes(null); setBusy(false); return undefined; }
    let off = false;
    setBusy(true); setError('');
    void api.importPlaces(props.projectId, batch, rows, true).then((r) => {
      if (off) return;
      setBusy(false);
      if (r.ok) setRes(r.value); else { setRes(null); setError(r.message || 'Не удалось проверить файл'); }
    });
    return () => { off = true; };
  }, [key]);

  function pickSheet(i: number): void {
    if (!sheets) return;
    setSi(i); setHead(findPlaceHeader(sheets[i].rows)); setRes(null); setFilter('all');
  }
  async function create(): Promise<void> {
    if (!api.importPlaces || !res) return;
    setBusy(true); setError('');
    const r = await api.importPlaces(props.projectId, batch, rows, false);
    setBusy(false);
    if (!r.ok) { setError(r.message || 'Не удалось создать места'); return; }
    if (!r.value.ok) { setRes(r.value); setError('Сервер нашёл ошибки — ничего не создано'); return; }
    props.onDone(r.value, batch);
  }

  const total = res ? createdTotal(res.created) : 0;
  const errs = res ? res.errors : [];
  const stat = (n: number): { status: RowStatus; note: string } => (res ? rowStatus(res, n) : { status: 'new', note: '' });
  const counts = res ? { new: 0, exists: 0, differs: 0, error: 0 } as Record<RowStatus, number> : null;
  if (counts) for (const r of rows) counts[stat(r.row_no).status] += 1;
  const shown = rows.filter((r) => filter === 'all' || stat(r.row_no).status === filter);

  const roleSelect = (i: number, label: string, role: PlaceRole): ReactElement => h('label', { key: i, className: 'op-imp__col' + (role === 'ignore' ? ' is-off' : '') },
    h('span', { title: label }, label),
    h('select', { className: 'pj-input', value: role, 'data-testid': 'op-imp-role', 'aria-label': `Столбец «${label}»`, disabled: busy,
      onChange: (e: Event) => { if (head) setHead({ ...head, roles: setRole(head.roles, i, (e.target as HTMLSelectElement).value as PlaceRole) }); } },
      PLACE_ROLES.map((r) => h('option', { key: r.role, value: r.role }, r.label))));

  const summary = res ? h('div', { className: 'op-imp__sum' + (errs.length ? ' is-bad' : ''), role: 'status', 'data-testid': 'op-imp-sum' },
    h('b', null, errs.length ? 'Создать пока нельзя' : total ? `Будет создано: ${createdText(res.created)}` : 'Всё из файла уже есть — создавать нечего'),
    h('span', null, [`строк ${rows.length}`, counts && counts.exists ? `уже есть ${counts.exists}` : '', counts && counts.differs ? `в файле иначе ${counts.differs} (не меняется)` : '',
      errs.length ? `ошибок ${errs.length}` : ''].filter(Boolean).join(' · ')),
    errs.length ? h('span', { className: 'op-imp__fix' }, `Исправьте в файле строк${errs.length > 1 ? 'и' : 'у'} ${errs.slice(0, 8).map((e) => e.row_no).join(', ')}${errs.length > 8 ? '…' : ''} и загрузите снова — или поменяйте столбцы выше.`) : null)
    : null;

  const chips = counts ? h('div', { className: 'op-imp__chips', role: 'group', 'aria-label': 'Показать строки' },
    (['all', 'new', 'exists', 'differs', 'error'] as Filter[]).filter((f) => f === 'all' || counts[f as RowStatus]).map((f) => h('button', {
      key: f, type: 'button', 'aria-pressed': filter === f, className: 'op-imp__chip' + (f !== 'all' ? ' is-' + f : ''), onClick: () => setFilter(f) },
      f === 'all' ? `Все ${rows.length}` : `${STATUS[f as RowStatus]} ${counts[f as RowStatus]}`))) : null;

  const cell = (v: string | null): string => v || '—';
  const table = res && rows.length ? h('div', { className: 'op-imp__scroll' }, h('table', { className: 'op-imp__tbl', 'data-testid': 'op-imp-rows' },
    h('thead', null, h('tr', null, ['Стр.', 'Корпус', 'Секция', 'Этаж', 'Помещение', 'Стр. №', '№ БТИ', 'Площадь', 'Комнат', 'Итог'].map((t) => h('th', { key: t }, t)))),
    h('tbody', null, shown.slice(0, SHOW).map((r) => {
      const s = stat(r.row_no);
      return h('tr', { key: r.row_no, className: 'is-' + s.status, 'data-status': s.status },
        h('td', null, String(r.row_no)), h('td', null, cell(r.object)), h('td', null, cell(r.section)), h('td', null, cell(r.floor)),
        h('td', null, cell(r.name)), h('td', null, cell(r.build_no)), h('td', null, cell(r.bti_no)), h('td', null, cell(r.area && r.area.replace('.', ','))),
        h('td', null, r.rooms === '0' ? 'студия' : cell(r.rooms)),
        h('td', { className: 'op-imp__st' }, h('span', { className: 'op-imp__badge is-' + s.status }, STATUS[s.status]), s.status !== 'new' && s.status !== 'exists' ? h('small', null, s.note) : null));
    }))), shown.length > SHOW ? h('div', { className: 'op-imp__more' }, `Показаны первые ${SHOW} строк из ${shown.length} — счётчики выше по всему файлу.`) : null) : null;

  const footer = h('div', { className: 'op-foot' },
    h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: props.onClose }, 'Отмена'),
    h('button', { type: 'button', className: 'pf-btn op-gold', 'data-testid': 'op-imp-go', disabled: busy || !res || !!errs.length || !total,
      onClick: () => { void create(); } }, busy && sheets ? 'Проверяем…' : total ? `Создать ${total} ${total % 10 === 1 && total % 100 !== 11 ? 'место' : total % 10 >= 2 && total % 10 <= 4 && (total % 100 < 12 || total % 100 > 14) ? 'места' : 'мест'}` : 'Создать'));

  return h(Sheet, { title: 'Загрузка списка помещений', sub: file.name, testId: 'op-import', onClose: props.onClose, footer },
    h('div', { className: 'op-imp' },
      error ? h('div', { className: 'pf-error', role: 'alert', 'data-testid': 'op-imp-error' }, error) : null,
      !sheets && !error ? h('div', { className: 'pf-muted' }, 'Открываем файл…') : null,
      sheets && sheets.length > 1 ? h('label', { className: 'op-imp__line' }, h('span', null, 'Лист'),
        h('select', { className: 'pj-input', value: si, 'data-testid': 'op-imp-sheet', onChange: (e: Event) => pickSheet(Number((e.target as HTMLSelectElement).value)) },
          sheets.map((s, i) => h('option', { key: i, value: i }, s.name + (s.hidden ? ' (скрыт)' : ''))))) : null,
      sheets && !head ? h('div', { className: 'pj-led', role: 'note', 'data-testid': 'op-imp-nohead' },
        'На этом листе не нашлась строка заголовков (Этаж, Квартира…). Выберите другой лист или скачайте шаблон («⋯ → Скачать шаблон»).') : null,
      head ? h('div', { className: 'op-imp__cols' }, h('div', { className: 'op-imp__hint' }, 'Что в каком столбце — узнали по заголовкам; если не так, поправьте:'),
        h('div', { className: 'op-imp__grid', 'data-testid': 'op-imp-cols' }, head.labels.map((l, i) => roleSelect(i, l, head.roles[i])))) : null,
      noObjectCol ? h('label', { className: 'op-imp__line' }, h('span', null, 'Корпус для всех строк'),
        h('input', { className: 'pj-input', list: 'op-imp-objs', value: obj, maxLength: 200, 'data-testid': 'op-imp-obj',
          onChange: (e: Event) => setObj((e.target as HTMLInputElement).value) }),
        h('datalist', { id: 'op-imp-objs' }, props.objects.map((o) => h('option', { key: o.id, value: o.name })))) : null,
      summary, chips, table));
}

export const IMPORT_CSS = `
.op-imp{display:flex;flex-direction:column;gap:12px;min-width:0}
.op-imp__line{display:grid;grid-template-columns:minmax(120px,max-content) minmax(0,320px);align-items:center;gap:8px 12px;font-size:13.5px}
.op-imp__line .pj-input{width:100%;min-height:40px;box-sizing:border-box}
.op-imp__hint{font-size:13px;color:var(--text-muted);margin-bottom:6px}
.op-imp__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.op-imp__col{display:flex;flex-direction:column;gap:4px;min-width:0;font-size:12.5px}
.op-imp__col>span{color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.op-imp__col .pj-input{width:100%;min-height:38px;box-sizing:border-box}
.op-imp__col.is-off .pj-input{color:var(--text-muted)}
.op-imp__sum{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border-radius:12px;background:var(--p2-status-green-bg);color:var(--p2-status-green-fg);font-size:13.5px}
.op-imp__sum b{font-size:14.5px}
.op-imp__sum.is-bad{background:var(--p2-status-red-bg);color:var(--p2-status-red-fg)}
.op-imp__fix{font-weight:600}
.op-imp__chips{display:flex;flex-wrap:wrap;gap:6px}
.op-imp__chip{font:inherit;font-size:13px;min-height:34px;padding:0 12px;border-radius:999px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);cursor:pointer}
.op-imp__chip[aria-pressed="true"]{border-color:var(--accent,var(--primary));box-shadow:inset 0 0 0 1px var(--accent,var(--primary))}
.op-imp__scroll{overflow-x:auto;max-width:100%;border:1px solid var(--card-border);border-radius:12px}
.op-imp__tbl{border-collapse:collapse;width:100%;font-size:13px;min-width:760px}
.op-imp__tbl th{position:sticky;top:0;background:var(--card-bg);text-align:left;font-weight:600;color:var(--text-muted);font-size:12px;padding:8px;border-bottom:1px solid var(--card-border);white-space:nowrap}
.op-imp__tbl td{padding:6px 8px;border-bottom:1px solid var(--card-border);vertical-align:top;white-space:nowrap}
.op-imp__tbl tr.is-exists td{color:var(--text-muted)}
.op-imp__tbl tr.is-error td{background:var(--p2-status-red-bg)}
.op-imp__st{white-space:normal!important;min-width:150px}
.op-imp__st small{display:block;font-size:12px;margin-top:2px;color:inherit}
.op-imp__badge{display:inline-block;font-size:12px;font-weight:600;border-radius:999px;padding:1px 8px}
.op-imp__badge.is-new{background:var(--p2-status-green-bg);color:var(--p2-status-green-fg)}
.op-imp__badge.is-exists{background:var(--p2-status-grey-bg);color:var(--p2-status-grey-fg)}
.op-imp__badge.is-differs{background:var(--p2-status-yellow-bg);color:var(--p2-status-yellow-fg)}
.op-imp__badge.is-error{background:var(--p2-status-red-bg);color:var(--p2-status-red-fg);box-shadow:inset 0 0 0 1px var(--p2-status-red-line,transparent)}
.op-imp__more{font-size:12.5px;color:var(--text-muted);padding:8px}
.op-drop{position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;border:2px dashed var(--accent,var(--primary));
  border-radius:16px;background:color-mix(in srgb,var(--card-bg) 88%,transparent);font-size:16px;font-weight:600;color:var(--text-main);pointer-events:none}
.op-drop small{display:block;font-weight:400;font-size:13px;color:var(--text-muted);margin-top:6px}
/* лист загрузки шире обычного (таблица строк), кнопки внизу — всегда видны */
.p2-sheet[data-testid=op-import] .p2-sheet__foot{position:sticky;bottom:calc(-16px - env(safe-area-inset-bottom,0px));margin:0 -16px calc(-16px - env(safe-area-inset-bottom,0px));
  padding:10px 16px calc(12px + env(safe-area-inset-bottom,0px));background:var(--card-bg);border-top:1px solid var(--card-border);z-index:2}
@media (min-width:900px){.p2-sheet[data-testid=op-import]{width:min(1080px,calc(100vw - 64px))}}
@media (max-width:599.98px){.op-imp__line{grid-template-columns:1fr}.op-imp__grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
