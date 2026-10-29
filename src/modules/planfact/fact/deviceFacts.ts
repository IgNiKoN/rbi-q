/**
 * P2-0064: факт, записанный на этом телефоне и ещё не принятый сервером (записи устройства сервиса платформы, device-send.ts),
 * — для пометок «не отправлено» в списке работ места, шахматке и журнале. Одна строка (kind entry) и пачка (kind batch, строки items).
 * Отклонённая сервером — с причиной («Сервер отклонил: …»); в накопленный факт не входит (его считает сервер).
 */
import type { DeviceRecord } from '../../../platform/services/offline/device-records.ts';

export interface UnsentFact {
  /** запись устройства (пачка — одна запись на все строки) */
  recordId: string; positionId: string; qty: number; date: string; work: string; place: string; unit: string; brigade: string;
  /** '' — ждёт отправки; иначе причина («Сервер отклонил: …» / «Не отправлено: …») */
  problem: string; createdAt: string;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Строки факта из записей устройства План/Факта (не ушедшие). */
export function unsentFacts(records: DeviceRecord[]): UnsentFact[] {
  const out: UnsentFact[] = [];
  for (const r of records) {
    if (r.module !== 'planfact' || r.kind !== 'pf_fact' || r.syncStatus === 'synced') continue;
    const p = r.payload || {}; const v = r.view || {};
    const problem = r.syncStatus === 'blocked' ? str(r.syncBlockReason) || 'Не отправлено' : '';
    const base = { recordId: r.id, date: str(p.date), brigade: str(v.brigade), problem, createdAt: r.createdAt };
    if (p.kind === 'batch') {
      const names = (v.items && typeof v.items === 'object' ? v.items : {}) as Record<string, { work?: string; place?: string; unit?: string }>;
      for (const it of Array.isArray(p.items) ? p.items as { position_id?: string; qty?: unknown }[] : []) {
        const id = str(it.position_id); const n = names[id] || {};
        out.push({ ...base, positionId: id, qty: num(it.qty), work: str(n.work), place: str(n.place) || str(v.locationPath), unit: str(n.unit) });
      }
    } else {
      out.push({ ...base, positionId: str(p.position_id), qty: num(p.qty), work: str(v.workName), place: str(v.locationPath), unit: str(v.unit) });
    }
  }
  return out;
}

export interface UnsentSum { qty: number; n: number; problem: string }
/** По позициям: сколько ждёт отправки и есть ли отказ (первая причина). */
export function unsentByPosition(list: UnsentFact[]): Map<string, UnsentSum> {
  const m = new Map<string, UnsentSum>();
  for (const f of list) {
    const s = m.get(f.positionId) || { qty: 0, n: 0, problem: '' };
    s.qty += f.qty; s.n += 1; if (f.problem && !s.problem) s.problem = f.problem;
    m.set(f.positionId, s);
  }
  return m;
}

/** Текст пометки у работы: «Не отправлено: 3 м³» / «Сервер отклонил: …». */
export function unsentLabel(s: UnsentSum, unit: string, fmt: (n: number) => string): string {
  return s.problem ? s.problem : `Не отправлено: ${fmt(s.qty)} ${unit}`.trim();
}
