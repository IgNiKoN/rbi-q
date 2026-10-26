/**
 * Сводка → «Скачать Excel» (P2-0008, этап 5): листы «Сводка» (итоги объекта и виды работ), «Позиции» (каждая позиция с местом),
 * «КС-2» (сделано ↔ выставлено по строкам заказчика); P2-0010 — отставание (п.п., дни), светофор по ТЗ 8.2 с порогами, вердикт темпа,
 * лист «Требует внимания» (счётчики, строки, полнота данных). Числа — как пришли с сервера (те же, что на экране, до копеек), ничего не пересчитывается.
 * Без права money.view колонок и строк в ₽ нет (сервер их и не присылает). Excel (exceljs) подгружается лениво.
 */
import type { Ks2GapRow, SummaryAttention, SummaryPosition, SummaryProject, SummaryWorkType } from './summary.service.ts';
import { forecastView, LIGHT_LABEL, lightText, verdictText } from './model.ts';
import type { ForecastNumbers } from './model.ts';
import { ruDate } from '../ks2/form.ts';

export interface SummaryExport {
  project: SummaryProject; workTypes: SummaryWorkType[]; positions: SummaryPosition[];
  gap: Ks2GapRow[] | null; gapError: string; today: string; attention?: SummaryAttention | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadExcel(): Promise<{ Workbook: new () => any }> {
  const mod: any = await import('exceljs');
  return mod.default && mod.default.Workbook ? mod.default : mod;
}

const MONEY = '#,##0.00';
const QTY = '#,##0.###';
const PCT = '0.0';
/** P2-0022: прогноз (030) — те же три колонки, что на экране: дата / «нет темпа» / «выполнено», Δ к финишу (дн.), отклонение (план % − факт %, п.п.). */
const FC_HEAD = ['Прогноз окончания по объёму', 'Δ к финишу, дн.', '% отклонения (план − факт, п.п.)'];
const fcCells = (x: ForecastNumbers): (string | number | null)[] => [forecastView(x, { yellow: 0, red: 0 }).finish, x.delta_days, x.dev_pp];
const bold = { bold: true };

/** Имя файла: «Сводка <проект> <дата>.xlsx» без символов, запрещённых в именах файлов. */
export const summaryFileName = (p: SummaryProject, today: string): string =>
  `Сводка ${p.name} ${ruDate(today)}.xlsx`.replace(/[«»"]/g, '').replace(/[\\/:*?<>|]+/g, ' ').replace(/\s+/g, ' ');

export async function buildSummaryXlsx(x: SummaryExport): Promise<Uint8Array> {
  const { Workbook } = await loadExcel();
  const wb = new Workbook();
  const p = x.project;
  const m = p.can_money;

  // Лист «Сводка»
  const s = wb.addWorksheet('Сводка');
  s.columns = [{ width: 36 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 10 }, { width: 18 }, { width: 16 }, { width: 18 }];
  s.addRow([`Сводка: ${p.name}${p.code ? ` (${p.code})` : ''}`]).font = { bold: true, size: 14 };
  s.addRow([`Выгружено ${ruDate(x.today)}`]);
  s.addRow([]);
  const kv = (label: string, value: string | number | null, fmt?: string): void => {
    const r = s.addRow([label, value === null ? '—' : value]);
    r.getCell(1).font = bold;
    if (fmt && typeof value === 'number') r.getCell(2).numFmt = fmt;
  };
  kv('Светофор', `${LIGHT_LABEL[p.light]} — ${lightText(p)}`);
  kv('Плановое начало', p.planned_start ? ruDate(p.planned_start) : null);
  kv('Плановое окончание', p.planned_finish ? ruDate(p.planned_finish) : null);
  kv('Пороги светофора', `жёлтый ${p.light_yellow_pp} п.п., красный ${p.light_red_pp} п.п., дней ${p.light_overdue_days}`);
  kv('План на сегодня (равномерно), %', p.plan_pct_today, PCT);
  kv('Темп: вердикт (7 дней против 14)', verdictText(p.pace_verdict));
  if (m) {
    kv('Отставание от плана на сегодня, п.п.', p.lag_pp, PCT);
    kv('Отставание, дней', p.lag_days, PCT);
    kv('Готовность по деньгам договорной КП, %', p.pct_money, PCT);
    kv('Стоимость ВОР по договорной КП, ₽', p.plan_money, MONEY);
    kv('Сделано, ₽', p.done_money, MONEY);
    kv('Выставлено в КС-2, ₽', p.issued_money, MONEY);
    kv('Сделано, не выставлено в КС-2, ₽', p.gap_money, MONEY);
    kv('Темп за 7 дней, ₽/день', p.pace7, MONEY);
    kv('Темп за 14 дней, ₽/день', p.pace14, MONEY);
    kv('Нужный темп до окончания, ₽/день', p.need_pace, MONEY);
    kv('Прогноз окончания', p.forecast_finish ? ruDate(p.forecast_finish) : null);
    kv('Строк ВОР без цены в договорной КП', p.unpriced_rows);
  }
  kv('Позиций ВОР', p.positions);
  s.addRow([]);
  s.addRow(['Виды работ']).font = bold;
  const wtHead = ['Вид работ', 'ЕИ', 'План', 'Факт', '%', 'Остаток', 'Факт за 7 дн.', 'Факт за 14 дн.'].concat(m ? ['План, ₽', 'Сделано, ₽', '% по ₽'] : [], FC_HEAD);
  s.addRow(wtHead).font = bold;
  for (const w of x.workTypes) {
    const units = w.units.length ? w.units : [null];
    units.forEach((u, i) => {
      const row = [w.work_name, u ? u.unit : '', u ? u.plan : null, u ? u.fact : null, u ? u.pct : null, u ? u.rest : null, u ? u.fact7 : null, u ? u.fact14 : null];
      // ₽ вида работ — один раз, в первой строке (разные ЕИ — отдельные строки, деньги не дублируются)
      const money = m ? (i === 0 ? [w.plan_money, w.done_money, w.pct_money] : [null, null, null]) : [];
      const r = s.addRow([...row, ...money, ...(u ? fcCells(u) : [null, null, null])]);
      r.getCell(row.length + money.length + 3).numFmt = PCT;
      [3, 4, 6, 7, 8].forEach((c) => { r.getCell(c).numFmt = QTY; });
      r.getCell(5).numFmt = PCT;
      if (m) { r.getCell(9).numFmt = MONEY; r.getCell(10).numFmt = MONEY; r.getCell(11).numFmt = PCT; }
    });
  }

  // Лист «Позиции»
  const ps = wb.addWorksheet('Позиции');
  ps.columns = [{ width: 40 }, { width: 30 }, { width: 8 }, { width: 12 }, { width: 12 }, { width: 8 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 18 }];
  ps.addRow(['Место', 'Вид работ', 'ЕИ', 'План', 'Факт', '%', 'Остаток', 'Факт за 7 дн.', 'Факт за 14 дн.', 'Ждёт подтверждения', ...FC_HEAD]).font = bold;
  for (const q of x.positions) {
    const r = ps.addRow([q.location_path, q.work_name, q.unit_code, q.plan_qty, q.fact_qty, q.pct, q.rest_qty, q.fact7, q.fact14, q.pending_qty,
      ...fcCells({ plan: q.plan_qty, fact: q.fact_qty, forecast_finish: q.forecast_finish, delta_days: q.delta_days, dev_pp: q.dev_pp })]);
    r.getCell(13).numFmt = PCT;
    [4, 5, 7, 8, 9, 10].forEach((c) => { r.getCell(c).numFmt = QTY; });
    r.getCell(6).numFmt = PCT;
  }
  ps.views = [{ state: 'frozen', ySplit: 1 }];

  // Лист «КС-2»
  const ks = wb.addWorksheet('КС-2');
  ks.columns = [{ width: 8 }, { width: 10 }, { width: 44 }, { width: 28 }, { width: 8 }, { width: 12 }, { width: 12 }, { width: 12 }].concat(m ? [{ width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }] : []);
  if (!x.gap) {
    ks.addRow([x.gapError || 'Нет данных']);
  } else {
    ks.addRow(['Стр.', '№', 'Наименование', 'Вид работ', 'ЕИ', 'Сделано', 'Выставлено', 'Разрыв'].concat(m ? ['Цена, ₽', 'Сделано, ₽', 'Выставлено, ₽', 'Разрыв, ₽'] : [])).font = bold;
    for (const g of x.gap) {
      const cells: (string | number | null)[] = [g.row_no, g.number || '', g.kind === 'material' ? `${g.name} (материал)` : g.name, g.work_name || '', g.unit_text || '', g.done_qty, g.issued_qty, g.gap_qty];
      if (m) cells.push(g.price, g.done_money, g.issued_money, g.gap_money);
      const r = ks.addRow(cells);
      [6, 7, 8].forEach((c) => { r.getCell(c).numFmt = QTY; });
      if (m) [9, 10, 11, 12].forEach((c) => { r.getCell(c).numFmt = MONEY; });
    }
    if (m) {
      const t = ks.addRow(['', '', 'Итого по объекту: сделано, не выставлено в КС-2, ₽', '', '', '', '', '', '', '', '', p.gap_money]);
      t.font = bold; t.getCell(12).numFmt = MONEY;
    }
    ks.views = [{ state: 'frozen', ySplit: 1 }];
  }
  // Лист «Требует внимания»
  const a = x.attention;
  if (a) {
    const at = wb.addWorksheet('Требует внимания');
    at.columns = [{ width: 52 }, { width: 16 }, { width: 14 }, { width: 18 }];
    const c = a.counts;
    at.addRow(['Требует внимания', 'Количество'].concat(m ? ['₽'] : [])).font = bold;
    const line = (label: string, n: number | string, money?: number | null) => {
      const cells: (string | number | null)[] = [label, n];
      if (m && money !== undefined) cells.push(money);
      const r = at.addRow(cells);
      if (m) r.getCell(3).numFmt = MONEY;
    };
    line('Нет договорной КП', c.no_kp ? 'да' : 'нет');
    line('Не заданы плановые даты', c.no_dates ? 'да' : 'нет');
    line('Сделано, не выставлено в КС-2 (строк)', c.gap_rows, c.gap_money);
    line('Строк ВОР без цены в договорной КП', c.unpriced_rows);
    line(`Позиций без факта больше ${a.stale_days} дней`, c.stale_positions);
    line('Факт ждёт подтверждения (записей)', c.pending_entries);
    at.addRow([]);
    at.addRow(['Полнота данных', '%']).font = bold;
    const pr = (label: string, v: number | null) => { const r = at.addRow([label, v]); r.getCell(2).numFmt = PCT; };
    pr('Строки ВОР с ценой в договорной КП', a.completeness.priced_pct);
    pr('Плановые даты объекта', a.completeness.dates_pct);
    pr('Позиции с местом ниже корпуса', a.completeness.placed_pct);
    const block = (title: string, head: string[], rows: (string | number | null)[][]) => {
      if (!rows.length) return;
      at.addRow([]); at.addRow([title]).font = bold; at.addRow(head).font = bold;
      rows.forEach((r) => at.addRow(r));
    };
    block('Сделано, не выставлено (первые 20)', ['Строка заказчика', 'Объём', 'ЕИ'].concat(m ? ['₽'] : []),
      a.gap.map((g) => { const r: (string | number | null)[] = [`${g.number ? `${g.number} ` : ''}${g.name}`, g.qty, g.unit || '']; if (m) r.push(g.money); return r; }));
    block('Без цены в договорной КП (первые 20)', ['Строка заказчика', 'Объём', 'ЕИ'], a.unpriced.map((u) => [`${u.number ? `${u.number} ` : ''}${u.name}`, u.qty, u.unit || '']));
    block(`Без факта больше ${a.stale_days} дней (первые 20)`, ['Позиция · место', 'Факт', 'План', 'Дней без факта'],
      a.stale.map((t) => [`${t.work_name} · ${t.location_path}`, t.fact_qty, t.plan_qty, t.idle_days]));
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
