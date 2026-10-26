/** Подставной сервер для реестра позиций (P2-0019): позиции, факт, история, пачка (в т. ч. «через РП»), срок объекта.
 *  Сводка и факт считаются из одних записей — как на сервере (pf_summary_positions и pf_fact_positions от planfact.fact_totals). */
import type { SummaryApi, SummaryPosition, SummaryProject } from '../summary/summary.service.ts';
import type { BatchResult, Brigade, FactApi, FactBatchInput, FactHistoryRow, FactPendingRow, FactPosition } from '../fact/fact.service.ts';
import { PTO_PROJECT } from './summary-fake.ts';

export interface StandPos { id: string; path: string; type: string; work: string; unit: string; plan: number }
interface Entry { id: string; position_id: string; qty: number; status: 'accepted' | 'pending_approval' | 'rejected' | 'superseded'; work_date: string; created_at: string; note: string | null; decided_at: string | null; decision_note: string | null; batch_id: string | null }

/** 600 позиций: 3 корпуса × 10 этажей × 20 работ (по умолчанию). */
export function standPositions(corps = 3, floors = 10, works = 20): StandPos[] {
  const out: StandPos[] = [];
  for (let c = 1; c <= corps; c++) for (let f = 1; f <= floors; f++) for (let w = 1; w <= works; w++)
    out.push({ id: `p${c}-${f}-${w}`, path: `Корпус ${c} · ${f} этаж`, type: 'floor', work: `Работа ${w}`, unit: w % 2 ? 'м²' : 'шт.', plan: 100 });
  return out;
}

export function makeStand(positions: StandPos[], o: { finish?: string | null; today?: string; planPctToday?: number | null; canCreate?: boolean; tolerance?: number; failBatchAt?: number; batchError?: string } = {}) {
  const today = o.today || '2026-10-24';
  const entries: Entry[] = [];
  const calls: { fn: string; args: unknown }[] = [];
  let n = 0; let batches = 0;
  const sum = (id: string, st: Entry['status'], from?: string) => entries.filter((e) => e.position_id === id && e.status === st && (!from || e.work_date >= from)).reduce((a, e) => a + e.qty, 0);
  const minus = (d: string, k: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - k); return t.toISOString().slice(0, 10); };
  const add = (pid: string, qty: number, date = today, status: Entry['status'] = 'accepted', note: string | null = null, batch: string | null = null) => {
    const e: Entry = { id: `e${++n}`, position_id: pid, qty, status, work_date: date, created_at: `${date}T10:00:00Z`, note, decided_at: null, decision_note: null, batch_id: batch };
    entries.push(e); return e;
  };
  const project: SummaryProject = { ...PTO_PROJECT, project_id: 'pr1', planned_finish: o.finish === undefined ? '2026-12-31' : o.finish };
  const summary: SummaryApi = {
    async portfolio() { calls.push({ fn: 'portfolio', args: null }); return { ok: true, value: [project] }; },
    async positions(p: string) {
      calls.push({ fn: 'summary.positions', args: p });
      return { ok: true, value: positions.map((x): SummaryPosition => {
        const fact = sum(x.id, 'accepted');
        return { position_id: x.id, location_id: 'l-' + x.path, location_path: x.path, work_type_id: 'w-' + x.work, work_name: x.work, unit_code: x.unit,
          plan_qty: x.plan, fact_qty: fact, pct: x.plan > 0 ? Math.round(fact / x.plan * 1000) / 10 : null, rest_qty: Math.max(0, x.plan - fact),
          fact7: sum(x.id, 'accepted', minus(today, 6)), fact14: sum(x.id, 'accepted', minus(today, 13)), pending_qty: sum(x.id, 'pending_approval'),
          ...fakeForecast(x.plan, fact, sum(x.id, 'accepted', minus(today, 13)), today, project.planned_finish, o.planPctToday ?? null) };
      }) };
    },
  } as unknown as SummaryApi;
  const brigades: Brigade[] = [{ id: 'b1', name: 'Иванов', leader_name: null, phone: null, archived_at: null, can_manage: false }];
  const fact: FactApi = {
    async listBrigades() { return brigades; },
    async positions(p: string) {
      calls.push({ fn: 'fact.positions', args: p });
      return { ok: true, value: positions.map((x): FactPosition => ({ position_id: x.id, location_id: 'l-' + x.path, location_path: x.path, location_type: x.type, work_type_id: 'w-' + x.work,
        work_name: x.work, unit_code: x.unit, plan_qty: x.plan, fact_qty: sum(x.id, 'accepted'), pending_qty: sum(x.id, 'pending_approval'),
        pending_count: entries.filter((e) => e.position_id === x.id && e.status === 'pending_approval').length,
        last_rejected_note: entries.filter((e) => e.position_id === x.id && e.status === 'rejected').map((e) => e.decision_note).pop() || null })) };
    },
    async history(pid: string) {
      calls.push({ fn: 'history', args: pid });
      return { ok: true, value: entries.filter((e) => e.position_id === pid).slice().reverse().map((e): FactHistoryRow => ({ id: e.id, status: e.status, qty: e.qty, work_date: e.work_date,
        brigade_name: 'Иванов', workers: null, man_hours: null, note: e.note, corrects_id: null, correction_reason: null, batch_id: e.batch_id, created_by_email: 'foreman@test',
        created_at: e.created_at, decided_by_email: e.decided_at ? 'rp@test' : null, decided_at: e.decided_at, decision_note: e.decision_note })) };
    },
    async pending() {
      return { ok: true, value: entries.filter((e) => e.status === 'pending_approval').map((e): FactPendingRow => {
        const p = positions.find((x) => x.id === e.position_id)!;
        return { id: e.id, position_id: p.id, location_path: p.path, work_name: p.work, unit_code: p.unit, plan_qty: p.plan, fact_qty: sum(p.id, 'accepted'), qty: e.qty,
          work_date: e.work_date, brigade_name: 'Иванов', note: e.note, corrects_id: null, correction_reason: null, created_by_email: 'foreman@test', created_at: e.created_at };
      }) };
    },
    async addBatch(b: FactBatchInput) {
      calls.push({ fn: 'addBatch', args: b });
      batches++;
      if (o.canCreate === false) return { ok: false, message: 'Нет права вносить факт' };
      if (o.failBatchAt && batches === o.failBatchAt) return { ok: false, message: o.batchError || 'Ошибка сервера' };
      if (b.items.length > 500) return { ok: false, message: 'В пачке не больше 500 строк' };
      let acc = 0, pen = 0; const batch = `batch${batches}`;
      for (const it of b.items) {
        const p = positions.find((x) => x.id === it.position_id)!;
        const over = sum(p.id, 'accepted') + it.qty > p.plan * (1 + (o.tolerance ?? 2) / 100);
        const status = b.requireApproval || over ? 'pending_approval' : 'accepted';
        add(p.id, it.qty, b.date, status, b.requireApproval ? ('Закрытие через РП' + (b.note ? '. ' + b.note : '')) : (b.note || null), batch);
        if (status === 'accepted') acc++; else pen++;
      }
      return { ok: true, value: { batch_id: batch, accepted: acc, pending: pen } as BatchResult };
    },
  } as unknown as FactApi;
  const decide = (id: string, approve: boolean, note: string | null = null) => { const e = entries.find((x) => x.id === id)!; e.status = approve ? 'accepted' : 'rejected'; e.decided_at = `${today}T12:00:00Z`; e.decision_note = note; };
  return { summary, fact, entries, calls, add, decide, minus, today };
}

/** Прогноз подставного сервера (как 030: остаток × 14 / факт14, выполнено — сегодня, Δ к финишу объекта, отклонение = план % − факт %). */
export function fakeForecast(plan: number, fact: number, f14: number, today: string, finish: string | null, ppl: number | null) {
  const rest = Math.max(0, plan - fact);
  const days = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  const shift = (d: string, k: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };
  const forecast_finish = !(plan > 0) ? null : rest === 0 ? today : f14 > 0 ? shift(today, Math.ceil(rest * 14 / f14)) : null;
  const delta_days = rest > 0 && forecast_finish && finish ? days(finish, forecast_finish) : null;
  return { forecast_finish, delta_days, plan_pct_today: ppl, dev_pp: ppl !== null && plan > 0 ? Math.round((ppl - fact / plan * 100) * 10) / 10 : null };
}
