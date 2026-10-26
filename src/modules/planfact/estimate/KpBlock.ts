/**
 * Блок «КП» сметы (P2-0006c, этап 6). «Сформировать КП»: ПТО выбирает исходный файл заказчика → листы сметы находятся
 * по имени → колонки формы (из профиля формы или угаданы; ПТО может поправить, профиль запоминает) → снимок цен (calc.ts) →
 * запись в файл (xlsx-writer: только ячейки без формулы, прочее байт-в-байт) → редакция на сервере (сервер сверяет SHA-256
 * с загрузками сметы; другой файл — отказ) → скачивание «<имя>_КП_ред<N>.xlsx». Редакции неизменяемы; «Скачать ещё раз» —
 * тот же файл (SHA-256 сверяется с редакцией) и цены редакции; «Сравнить» — строки с изменившимися ценами и разница итогов.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { VorApi, VorImport, VorProfile } from '../vor/vor.service.ts';
import { columnMapFrom, parseSheet } from '../vor/parse.ts';
import type { EstimateApi, EstimateItem, EstimateRow, KpRevision } from './estimate.service.ts';
import { KP_ROLES, buildSnapshot, diffSnapshots, guessKpColumns, kpFileName, kpWrites } from './kp.ts';
import type { KpColumns, KpSnapshot, RevDiff } from './kp.ts';
import { money } from './prices.ts';

interface SheetPlan { imp: VorImport; labels: { label: string; col: number }[]; cols: KpColumns; profile: VorProfile | null; fromProfile: boolean }
interface Pending { mode: 'new' | 'again'; file: File; buf: Uint8Array; sha: string; sheets: SheetPlan[]; rev: KpRevision | null }

const letters = (col: number): string => { let n = col + 1, s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const dt = (iso: string): string => { try { return new Date(iso).toLocaleString('ru-RU'); } catch { return iso; } };

/** Скачать байты как файл (вынесено для подмены в тестах). */
export function saveFile(bytes: Uint8Array, name: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export function KpBlock(props: { api: EstimateApi; vor: VorApi; estimate: EstimateItem; imports: VorImport[]; projectId: string; rows: EstimateRow[]; save?: (b: Uint8Array, n: string) => void }): ReactElement {
  const { api, vor, estimate, imports, projectId, rows } = props;
  const save = props.save || saveFile;
  const [revs, setRevs] = useState<KpRevision[] | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState('');
  const [againId, setAgainId] = useState('');
  const [cmp, setCmp] = useState<{ a: string; b: string }>({ a: '', b: '' });
  const [diff, setDiff] = useState<{ rows: RevDiff[]; direct: number; total: number | null; an: number; bn: number } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    const l = await api.listKp(estimate.id);
    setRevs(l);
    if (l.length >= 2) setCmp({ a: l[1].id, b: l[0].id });
  }
  useEffect(() => { void load(); }, []);

  const estImports = imports.filter((i) => estimate.import_ids.includes(i.id));
  const unpriced = rows.filter((r) => (r.kind === 'work' || r.kind === 'material') && r.price_labor === null && r.price_material === null).length;

  async function choose(file: File, mode: 'new' | 'again', rev: KpRevision | null): Promise<void> {
    setBusy(true); setError(''); setNotice(''); setDiff(null);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const { readWorkbook, sha256Hex } = await import('../vor/xlsx-reader.ts');
      const sha = await sha256Hex(buf);
      if (rev && sha !== rev.file_sha256) throw new Error('Это другой файл: он не совпадает с файлом этой редакции КП. Выберите тот же файл заказчика.');
      const wb = await readWorkbook(buf);
      const profiles = await vor.listProfiles(projectId);
      const sheets: SheetPlan[] = [];
      for (const imp of estImports) {
        const sh = wb.sheets.find((s) => s.name === imp.sheet_name);
        if (!sh) continue;
        const profile = profiles.find((p) => p.id === imp.profile_id) || null;
        const parsed = parseSheet(sh, profile ? columnMapFrom(profile.column_map) : null);
        const labels = parsed.columns ? parsed.columns.prices : [];
        const saved = profile && (profile.column_map as Record<string, unknown>).kp_columns as KpColumns | undefined;
        sheets.push({ imp, labels, profile, cols: saved ? { ...guessKpColumns([]), ...saved } : guessKpColumns(labels), fromProfile: !!saved });
      }
      if (!sheets.length) throw new Error('В этом файле нет листов этой сметы (' + estImports.map((i) => '«' + i.sheet_name + '»').join(', ') + '). Выберите исходный файл заказчика.');
      setPending({ mode, file, buf, sha, sheets, rev });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function generate(): Promise<void> {
    if (!pending) return;
    setBusy(true); setError(''); setNotice('');
    try {
      let snap: KpSnapshot;
      if (pending.mode === 'again' && pending.rev) {
        const r = await api.getKp(pending.rev.id);
        if (!r.ok) throw new Error(r.message);
        snap = r.value.snapshot as unknown as KpSnapshot;
      } else {
        const oh = await api.overheads(estimate.id);
        snap = buildSnapshot({ id: estimate.id, name: estimate.name, area_m2: estimate.area_m2 }, rows, oh.ok ? oh.value : null);
      }
      const { patchXlsx } = await import('../vor/xlsx-writer.ts');
      let bytes = pending.buf, written = 0, formulas = 0;
      for (const s of pending.sheets) {
        if (!Object.values(s.cols).some((c) => c !== null)) throw new Error(`Для листа «${s.imp.sheet_name}» не выбрана ни одна колонка цены.`);
        const res = await patchXlsx(bytes, s.imp.sheet_name, kpWrites(snap, s.imp.id, s.cols));
        bytes = res.bytes; written += res.written.length; formulas += res.skippedFormula.length;
      }
      let revNo: number;
      if (pending.mode === 'new') {
        const c = await api.createKp(estimate.id, pending.sha, snap as unknown as Record<string, unknown>, snap.totals.total, note.trim() || null);
        if (!c.ok) throw new Error(c.message);
        revNo = c.value.revision_no;
        // колонки, выбранные ПТО, запоминаются в профиле формы (если отличаются от сохранённых)
        for (const s of pending.sheets) {
          const saved = s.profile && (s.profile.column_map as Record<string, unknown>).kp_columns;
          if (s.profile && JSON.stringify(saved) !== JSON.stringify(s.cols)) {
            await vor.saveProfile(projectId, s.profile.name, s.profile.signature, { ...s.profile.column_map, kp_columns: s.cols });
          }
        }
      } else revNo = pending.rev!.revision_no;
      save(bytes, kpFileName(pending.file.name, revNo));
      setNotice(`КП, редакция ${revNo}: вписано ${written} ячеек${formulas ? `, формул заказчика не тронуто ${formulas}` : ''}${snap.totals.unpriced ? `; без цены строк: ${snap.totals.unpriced}` : ''}. Файл скачан.`);
      setPending(null); setNote(''); setAgainId('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function compare(): Promise<void> {
    if (!cmp.a || !cmp.b || cmp.a === cmp.b) { setError('Выберите две разные редакции'); return; }
    setBusy(true); setError('');
    const [a, b] = await Promise.all([api.getKp(cmp.a), api.getKp(cmp.b)]);
    setBusy(false);
    if (!a.ok || !b.ok) { setError(!a.ok ? a.message : (b as { message: string }).message); return; }
    const d = diffSnapshots(a.value.snapshot as unknown as KpSnapshot, b.value.snapshot as unknown as KpSnapshot);
    setDiff({ ...d, an: a.value.revision_no, bn: b.value.revision_no });
  }

  const fileInput = (mode: 'new' | 'again', rev: KpRevision | null, label: string, testid: string) => h('label', { className: 'pf-btn kp-file' + (mode === 'again' ? ' pf-btn--ghost' : ''), 'data-testid': testid },
    label, h('input', { type: 'file', accept: '.xlsx', hidden: true, disabled: busy, onChange: (e) => { const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; if (f) void choose(f, mode, rev); } }));
  const sheetName = (id: string): string => imports.find((i) => i.id === id)?.sheet_name || '';
  const pair = (r: { price_labor: number | null; price_material: number | null } | null): string => r ? `${r.price_labor === null ? '—' : money(r.price_labor)} / ${r.price_material === null ? '—' : money(r.price_material)}` : 'нет строки';

  return h('div', { className: 'pf-card oh-box', 'data-testid': 'kp-block' },
    h('div', { className: 'oh-box-head' }, h('h3', { className: 'pf-title' }, 'КП в форме заказчика'),
      h('span', { className: 'pj-actions' }, fileInput('new', null, 'Сформировать КП — выбрать файл заказчика', 'kp-new'))),
    h('div', { className: 'pf-muted' }, 'Выберите тот же файл заказчика, по которому загружен ВОР. В него впишутся цены сметы (формулы заказчика и всё остальное в файле не меняются), создастся редакция КП, файл скачается.'),
    unpriced ? h('div', { className: 'es-warn' }, `Без цены строк: ${unpriced} — в файле они останутся пустыми.`) : null,
    pending
      ? h('div', { className: 'pri-box kp-plan', 'data-testid': 'kp-plan' },
          h('div', { className: 'pri-step' }, `${pending.mode === 'new' ? 'Новая редакция' : `Редакция ${pending.rev?.revision_no} ещё раз`}: файл «${pending.file.name}». Колонки формы для записи (проверьте):`),
          pending.sheets.map((s, idx) => h('div', { key: s.imp.id, className: 'kp-sheet' },
            h('div', { className: 'pri-sheet' }, `Лист «${s.imp.sheet_name}»${s.fromProfile ? ' — колонки из профиля формы' : ''}`),
            h('div', { className: 'kp-cols' }, KP_ROLES.map((role) => h('label', { key: role.id, className: 'pf-field' }, role.label,
              h('select', { className: 'pj-input', value: s.cols[role.id] === null ? '' : String(s.cols[role.id]), disabled: busy, 'data-testid': 'kp-col-' + role.id,
                onChange: (e) => { const v = (e.target as HTMLSelectElement).value; const next = [...pending.sheets]; next[idx] = { ...s, cols: { ...s.cols, [role.id]: v === '' ? null : Number(v) } }; setPending({ ...pending, sheets: next }); } },
                h('option', { value: '' }, '— не заполнять —'),
                s.labels.map((l) => h('option', { key: l.col, value: String(l.col) }, `${letters(l.col)}: ${l.label}`)))))))),
          pending.mode === 'new' ? h('label', { className: 'pf-field' }, 'Примечание к редакции (необязательно)',
            h('input', { type: 'text', className: 'pj-input', maxLength: 2000, value: note, onChange: (e) => setNote((e.target as HTMLInputElement).value) })) : null,
          h('div', { className: 'pj-actions' },
            h('button', { type: 'button', className: 'pf-btn', disabled: busy, 'data-testid': 'kp-generate', onClick: () => { void generate(); } }, pending.mode === 'new' ? 'Сформировать и скачать' : 'Скачать'),
            h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy, onClick: () => setPending(null) }, 'Отмена')))
      : null,
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { className: 'pj-notice', role: 'status' }, notice) : null,
    h('div', { className: 'pri-step' }, 'Редакции КП'),
    revs === null ? h('div', { className: 'pf-muted' }, 'Загрузка…')
    : revs.length
      ? h('div', { className: 'pf-card pj-list', 'data-testid': 'kp-list' }, revs.map((r) => h('div', { key: r.id, className: 'pj-row', 'data-rev': r.revision_no },
          h('div', { className: 'pj-name' }, h('b', null, `Редакция ${r.revision_no}`), h('span', { className: 'pf-num' }, `сумма по файлу ${money(r.total)} ₽`),
            h('span', { className: 'pf-muted' }, `${dt(r.created_at)}${r.created_by_email ? ' · ' + r.created_by_email : ''}${r.note ? ' · ' + r.note : ''}`)),
          againId === r.id
            ? h('span', { className: 'pj-actions' }, fileInput('again', r, 'Выбрать файл заказчика', 'kp-again-file'),
                h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setAgainId('') }, 'Отмена'))
            : h('span', { className: 'pj-actions' }, h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy, 'data-testid': 'kp-again', onClick: () => setAgainId(r.id) }, 'Скачать ещё раз')))))
      : h('div', { className: 'pf-muted', 'data-testid': 'kp-empty' }, 'Редакций КП пока нет.'),
    revs && revs.length >= 2
      ? h('div', { className: 'kp-cmp' },
          h('label', { className: 'pf-field' }, 'Сравнить редакцию', h('select', { className: 'pj-input', value: cmp.a, 'data-testid': 'kp-cmp-a', onChange: (e) => setCmp({ ...cmp, a: (e.target as HTMLSelectElement).value }) },
            revs.map((r) => h('option', { key: r.id, value: r.id }, `ред. ${r.revision_no}`)))),
          h('label', { className: 'pf-field' }, 'с редакцией', h('select', { className: 'pj-input', value: cmp.b, 'data-testid': 'kp-cmp-b', onChange: (e) => setCmp({ ...cmp, b: (e.target as HTMLSelectElement).value }) },
            revs.map((r) => h('option', { key: r.id, value: r.id }, `ред. ${r.revision_no}`)))),
          h('button', { type: 'button', className: 'pf-btn', disabled: busy, 'data-testid': 'kp-compare', onClick: () => { void compare(); } }, 'Сравнить'))
      : null,
    diff
      ? h('div', { className: 'pri-box', 'data-testid': 'kp-diff' },
          h('div', { className: 'pri-step' }, `Ред. ${diff.an} → ред. ${diff.bn}: изменилось строк ${diff.rows.length}; сумма по ВОР ${diff.direct >= 0 ? '+' : ''}${money(diff.direct)} ₽${diff.total !== null ? `; итог расчёта ${diff.total >= 0 ? '+' : ''}${money(diff.total)} ₽` : ''}`),
          h('div', { className: 'pri-list' }, diff.rows.slice(0, 500).map((d) => h('div', { key: d.key, className: 'pri-row' },
            h('div', { className: 'pr-name' }, h('b', null, `стр. ${d.row_no}`), d.name, estimate.import_ids.length > 1 ? h('span', { className: 'pj-badge' }, sheetName(d.import_id)) : null),
            h('div', { className: 'pri-vals' }, h('span', { className: 'pf-muted' }, 'работа / материал: ' + pair(d.a)), h('span', null, '→ ' + pair(d.b)),
              h('span', { className: 'pf-muted' }, `сумма ${money((d.a?.labor || 0) + (d.a?.material || 0))} → ${money((d.b?.labor || 0) + (d.b?.material || 0))}`))))))
      : null);
}

export const KP_CSS = `
.kp-file{display:inline-flex;align-items:center;cursor:pointer}
.kp-plan{border:1px solid var(--card-border);border-radius:12px}
.kp-sheet{display:flex;flex-direction:column;gap:6px}
.kp-cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.kp-cols select{width:100%}
.kp-cmp{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
@media (max-width:600px){.kp-file{width:100%;justify-content:center}.kp-cmp .pf-btn{width:100%}}
`;
