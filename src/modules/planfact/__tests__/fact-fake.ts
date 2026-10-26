/** Подставной сервер факта для тестов экранов P2-0007: те же правила, что в миграции 009 (допуск 2 %, ждущие, исправление, пачка);
 *  P2-0020 — решение пачкой (028: всё или ничего, ≤ 500, одна причина) и журнал объекта. opts.failBatch — отказ сервера на пачку. */
import type { Brigade, BatchResult, FactApi, FactBatchInput, FactEntryInput, FactHistoryRow, FactJournalRow, FactPendingRow, FactPosition } from '../fact/fact.service.ts';

export interface FakePos { id: string; ancestors: string[]; location_id: string; location_path: string; location_type: string; work: string; unit: string; plan: number }
interface Entry extends FactHistoryRow { position_id: string }

export function makeFakeFact(positions: FakePos[], opts: { canManage?: boolean; me?: string; tolerance?: number; failBatch?: string } = {}) {
  const tol = opts.tolerance ?? 2;
  const brigades: Brigade[] = [];
  const entries: Entry[] = [];
  const calls: { fn: string; args: unknown }[] = [];
  let seq = 0;
  const id = (p: string): string => `${p}${++seq}`;
  const canManage = opts.canManage !== false;
  const total = (pos: string, st: string): number => entries.filter((e) => e.position_id === pos && e.status === st).reduce((s, e) => s + e.qty, 0);
  const bname = (b: string): string => brigades.find((x) => x.id === b)?.name || '?';
  const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

  function insert(pos: FakePos, b: string, date: string, qty: number, workers: number | null, mh: number | null, note: string, batch: string | null, corrects: Entry | null, reason: string | null) {
    const sum = total(pos.id, 'accepted') - (corrects && corrects.status === 'accepted' ? corrects.qty : 0);
    const over = sum + qty > pos.plan * (1 + tol / 100) && !(corrects && qty <= corrects.qty);
    const e: Entry = { id: id('e'), position_id: pos.id, status: over ? 'pending_approval' : 'accepted', qty, work_date: date, brigade_name: bname(b), workers, man_hours: mh,
      note: note || null, corrects_id: corrects ? corrects.id : null, correction_reason: reason, batch_id: batch, created_by_email: opts.me || 'foreman@test.invalid',
      created_at: new Date(Date.UTC(2026, 9, 21, 10, 0, seq)).toISOString(), decided_by_email: null, decided_at: null, decision_note: null };
    entries.push(e);
    if (corrects && !over) { corrects.status = 'superseded'; corrects.decision_note = reason; corrects.decided_at = e.created_at; }
    return e;
  }

  const api: FactApi = {
    async listBrigades(_c, withArchived) { calls.push({ fn: 'listBrigades', args: withArchived }); return brigades.filter((b) => withArchived || !b.archived_at).map((b) => ({ ...b, can_manage: canManage })); },
    async saveBrigade(_c, bid, name, leader, phone) {
      calls.push({ fn: 'saveBrigade', args: { bid, name, leader, phone } });
      if (!canManage) return fail('Нет права вести справочник бригад');
      const nm = name.trim();
      if (brigades.some((b) => !b.archived_at && b.id !== bid && b.name.toLowerCase() === nm.toLowerCase())) return fail(`Бригада «${nm}» уже есть`);
      if (bid) { const b = brigades.find((x) => x.id === bid)!; b.name = nm; b.leader_name = leader || null; b.phone = phone || null; return { ok: true, value: bid }; }
      const nid = id('b'); brigades.push({ id: nid, name: nm, leader_name: leader || null, phone: phone || null, archived_at: null, can_manage: true }); return { ok: true, value: nid };
    },
    async archiveBrigade(bid, archived) { calls.push({ fn: 'archiveBrigade', args: { bid, archived } }); const b = brigades.find((x) => x.id === bid)!; b.archived_at = archived ? '2026-10-21' : null; return { ok: true, value: null }; },
    async positions(_p, loc) {
      calls.push({ fn: 'positions', args: loc });
      const rows: FactPosition[] = positions.filter((p) => !loc || p.ancestors.includes(loc)).map((p) => ({
        position_id: p.id, location_id: p.location_id, location_path: p.location_path, location_type: p.location_type, work_type_id: 'wt', work_name: p.work, unit_code: p.unit,
        plan_qty: p.plan, fact_qty: total(p.id, 'accepted'), pending_qty: total(p.id, 'pending_approval'), pending_count: entries.filter((e) => e.position_id === p.id && e.status === 'pending_approval').length,
        last_rejected_note: [...entries].reverse().find((e) => e.position_id === p.id && e.status === 'rejected')?.decision_note || null }));
      return { ok: true, value: rows };
    },
    async history(pos) { calls.push({ fn: 'history', args: pos }); return { ok: true, value: entries.filter((e) => e.position_id === pos).map((e) => ({ ...e })).reverse() }; },
    async pending() {
      return { ok: true, value: entries.filter((e) => e.status === 'pending_approval').map((e): FactPendingRow => {
        const p = positions.find((x) => x.id === e.position_id)!;
        return { id: e.id, position_id: p.id, location_path: p.location_path, work_name: p.work, unit_code: p.unit, plan_qty: p.plan, fact_qty: total(p.id, 'accepted'), qty: e.qty, work_date: e.work_date,
          brigade_name: e.brigade_name, note: e.note, corrects_id: e.corrects_id, correction_reason: e.correction_reason, created_by_email: e.created_by_email, created_at: e.created_at };
      }) };
    },
    async add(pos, e: FactEntryInput) {
      calls.push({ fn: 'add', args: { pos, ...e } });
      const p = positions.find((x) => x.id === pos);
      if (!p) return fail('Позиция не найдена');
      if (!e.brigadeId) return fail('Укажите бригаду');
      if (!(e.qty > 0)) return fail('Объём должен быть больше нуля');
      if (e.periodFrom && (e.periodFrom > e.date)) return fail('Начало периода позже конца');
      const r = insert(p, e.brigadeId, e.date, e.qty, e.workers, e.manHours, e.note, null, null, null);
      r.period_from = e.periodFrom ?? null;   // P2-0022 (030): запись «за период»
      return { ok: true, value: { id: r.id, status: r.status as 'accepted' | 'pending_approval' } };
    },
    async addBatch(b: FactBatchInput) {
      calls.push({ fn: 'addBatch', args: b });
      if (!b.brigadeId) return fail('Укажите бригаду');
      const batch = id('batch'); let acc = 0, pen = 0;
      for (const it of b.items) { const p = positions.find((x) => x.id === it.position_id)!; const r = insert(p, b.brigadeId, b.date, it.qty, b.workers, null, b.note, batch, null, null); if (r.status === 'accepted') acc++; else pen++; }
      return { ok: true, value: { batch_id: batch, accepted: acc, pending: pen } as BatchResult };
    },
    async correct(eid, qty, reason) {
      calls.push({ fn: 'correct', args: { eid, qty, reason } });
      const e = entries.find((x) => x.id === eid)!;
      if (!reason.trim()) return fail('Укажите причину исправления');
      if (e.status !== 'accepted' && e.status !== 'pending_approval') return fail('Эта запись уже закрыта — исправить её нельзя');
      if (qty === 0) { e.status = 'superseded'; e.decision_note = reason; return { ok: true, value: { id: eid, status: 'superseded' } }; }
      const p = positions.find((x) => x.id === e.position_id)!;
      const r = insert(p, 'b1', e.work_date, qty, e.workers, e.man_hours, e.note || '', e.batch_id, e, reason);
      r.period_from = e.period_from ?? null;   // исправление наследует период (030)
      return { ok: true, value: { id: r.id, status: r.status } };
    },
    async decide(eid, approve, note) {
      calls.push({ fn: 'decide', args: { eid, approve, note } });
      const e = entries.find((x) => x.id === eid)!;
      if (!approve && !note.trim()) return fail('Напишите причину отказа');
      decideOne(e, approve, note);
      return { ok: true, value: null };
    },
    async decideBatch(_p, ids, approve, note) {
      calls.push({ fn: 'decideBatch', args: { ids: [...ids], approve, note } });
      if (opts.failBatch) return fail(opts.failBatch);
      if (!ids.length) return fail('Не выбрано ни одной записи');
      if (ids.length > 500) return fail('В пачке не больше 500 записей');
      if (!approve && !note.trim()) return fail('Напишите причину отказа');
      const list = ids.map((x) => entries.find((e) => e.id === x));
      if (list.some((e) => !e || e.status !== 'pending_approval')) return fail('Не все записи ждут подтверждения в этом объекте — обновите список');
      for (const e of list) decideOne(e!, approve, note);
      return { ok: true, value: { approved: approve ? ids.length : 0, rejected: approve ? 0 : ids.length } };
    },
    async journal(_p, from, to, limit) {
      calls.push({ fn: 'journal', args: { from, to, limit } });
      const rows = entries.filter((e) => (!from || e.work_date >= from) && (!to || e.work_date <= to)).map((e): FactJournalRow => {
        const p = positions.find((x) => x.id === e.position_id)!;
        return { ...e, location_path: p.location_path, work_name: p.work, unit_code: p.unit };
      }).sort((a, b) => (a.work_date < b.work_date ? 1 : a.work_date > b.work_date ? -1 : a.created_at < b.created_at ? 1 : -1));
      return { ok: true, value: rows.slice(0, limit ?? 2000) };
    }
  };
  function decideOne(e: Entry, approve: boolean, note: string): void {
    e.status = approve ? 'accepted' : 'rejected'; e.decision_note = note.trim() || null; e.decided_by_email = 'pm@test.invalid'; e.decided_at = '2026-10-24T09:00:00Z';
    if (approve && e.corrects_id) { const old = entries.find((x) => x.id === e.corrects_id); if (old && old.status === 'accepted') old.status = 'superseded'; }
  }
  return { api, brigades, entries, calls, total };
}
