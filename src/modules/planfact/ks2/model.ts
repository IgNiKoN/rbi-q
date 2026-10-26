/**
 * КС-2 на экране (P2-0008b): строки черновика = предложение системы с сервера + итог ПТО из последней редакции
 * (по source_row_id; строки, которых в предложении больше нет, не переносятся). Расчётов факта здесь нет — только сведение.
 */
import { emptyKs2Header, type Ks2Header, type Ks2Row, type Ks2Snapshot } from './form.ts';
import type { Ks2ActData, Ks2ProposalRow, Ks2RowEdit, Ks2Status } from './ks2.service.ts';
import { requisitesLine } from '../../../platform/core/counterparties.ts';

export const STATUS_LABEL: Record<Ks2Status, string> = { draft: 'черновик', issued: 'выдан', annulled: 'аннулирован' };

const HEADER_KEYS = Object.keys(emptyKs2Header()) as (keyof Ks2Header)[];

/**
 * Шапка: последняя редакция → иначе запомненные реквизиты проекта; номер, дата и период — всегда из акта.
 * P2-0015: без редакции пустые «Заказчик» и подпись заказчика берутся из карточки заказчика объекта (ядро); заполненное вручную сильнее.
 */
export function actHeader(d: Ks2ActData): Ks2Header {
  const src: Partial<Ks2Header> = d.last_revision ? d.last_revision.snapshot.header : d.requisites;
  const h = emptyKs2Header();
  for (const k of HEADER_KEYS) h[k] = String(src?.[k] ?? '');
  if (!d.last_revision && d.customer) {
    if (!h.customer.trim()) h.customer = requisitesLine(d.customer);
    if (!h.customer_signer.trim() && d.customer.requisites?.signer) h.customer_signer = d.customer.requisites.signer;
  }
  h.act_no = d.act.act_no; h.act_date = d.act.act_date; h.period_from = d.act.period_from; h.period_to = d.act.period_to;
  return h;
}

export function proposalRow(p: Ks2ProposalRow): Ks2Row {
  return { source_row_id: p.source_row_id, row_no: p.row_no, number: p.number || '', name: p.name, unit: p.unit_text || '', kind: p.kind,
    sys_qty: p.sys_qty, sys_price: p.price, qty: p.sys_qty, price: p.price, excluded: false, total_qty: p.total_qty, prev_qty: p.prev_qty };
}

/** Строки акта: черновик — предложение + правки ПТО последней редакции; выданный/аннулированный — снимок как есть. */
export function actRowsOf(d: Ks2ActData): Ks2Row[] {
  if (!d.proposal) return d.last_revision ? d.last_revision.snapshot.rows.map((r) => ({ ...r })) : [];
  const saved = new Map((d.last_revision?.snapshot.rows || []).map((r) => [r.source_row_id, r]));
  return d.proposal.map((p) => {
    const row = proposalRow(p);
    const s = saved.get(p.source_row_id);
    return s ? { ...row, qty: Number(s.qty), price: s.price === null ? null : Number(s.price), excluded: !!s.excluded } : row;
  });
}

export const toEdits = (rows: Ks2Row[]): Ks2RowEdit[] => rows.map((r) => ({ source_row_id: r.source_row_id, qty: r.qty, price: r.price, excluded: r.excluded }));
export const snapshotOf = (header: Ks2Header, rows: Ks2Row[]): Ks2Snapshot => ({ header, rows });

/** Первое число месяца и сегодня (Москва) — период нового акта по умолчанию. */
export function defaultPeriod(today: string): { from: string; to: string } {
  return { from: today.slice(0, 8) + '01', to: today };
}
