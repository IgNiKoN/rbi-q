/**
 * «Выгрузить в Excel» из реестра (P2-0019, приём 1.5): видимые колонки вида, выбранные строки или весь отфильтрованный список —
 * значения колонок как на экране (value колонки), без пересчёта. ExcelJS подгружается лениво — тот же путь, что «Сводка» и КП.
 */
import type { RegistryColumn } from './model.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadExcel(): Promise<{ Workbook: new () => any }> {
  const mod: any = await import('exceljs');
  return mod.default && mod.default.Workbook ? mod.default : mod;
}

export async function buildRegistryXlsx<T>(title: string, columns: RegistryColumn<T>[], rows: T[]): Promise<Uint8Array> {
  const { Workbook } = await loadExcel();
  const wb = new Workbook();
  const ws = wb.addWorksheet(title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Реестр');
  ws.columns = columns.map((c) => ({ header: c.label, key: c.id, width: Math.min(60, Math.max(10, c.label.length + 4)) }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(columns.map((c) => c.value(r)));
  columns.forEach((c, i) => { if (c.numFmt) ws.getColumn(i + 1).numFmt = c.numFmt; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/** Имя файла без символов, запрещённых в именах файлов. */
export const registryFileName = (title: string, date: string): string =>
  `${title} ${date}.xlsx`.replace(/[«»"]/g, '').replace(/[\\/:*?<>|]+/g, ' ').replace(/\s+/g, ' ');

/** Скачать байты как файл (подменяется в тестах). */
export function saveXlsx(bytes: Uint8Array, name: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
