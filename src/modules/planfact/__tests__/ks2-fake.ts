/// <reference types="node" />
/** Подставной сервер КС-2 для тестов экрана: правила миграции 010 в памяти (факт по дату «по», материал = работа × норма,
 *  «выставлено ранее» = итог ПТО выданных актов, редакции неизменяемы, выдача без цен — отказ). Данные вымышленные. */
import type { Ks2ActData, Ks2ActItem, Ks2Api, Ks2ProposalRow, Ks2RevisionItem, Ks2SavedRevision, Ks2Settings, Ks2Status } from '../ks2/ks2.service.ts';
import type { Ks2Header, Ks2Row } from '../ks2/form.ts';
import { actTotal } from '../ks2/form.ts';

export interface FakeSrc { id: string; row_no: number; number: string; name: string; unit: string; kind: 'work' | 'material'; parent?: string; norm?: number; price: number | null }
export interface FakeFact { src: string; date: string; qty: number }
interface Act { id: string; act_no: string; act_date: string; period_from: string; period_to: string; status: Ks2Status; annul_reason: string | null; revs: Ks2SavedRevision[]; issued: string | null }

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

export function makeFakeKs2(src: FakeSrc[], facts: FakeFact[], opts: { canEdit?: boolean; contract?: boolean } = {}) {
  const acts: Act[] = [];
  const calls: string[] = [];
  let templ: { name: string; sha256: string; data: string } | null = null;
  let requisites: Partial<Ks2Header> = { customer: 'АО «Заказчик-Бета»', contract_no: 'Д-1' };
  let contract = opts.contract === false ? null : 'kp1';
  const canEdit = opts.canEdit !== false;
  const no = (msg: string) => ({ ok: false as const, message: msg });
  const ok = <T>(value: T) => ({ ok: true as const, value });

  function proposal(to: string, skip: string): Ks2ProposalRow[] {
    const prev = new Map<string, number>();
    for (const a of acts) if (a.status === 'issued' && a.id !== skip) {
      const rev = a.revs.find((r) => r.id === a.issued)!;
      for (const r of rev.snapshot.rows) if (!r.excluded) prev.set(r.source_row_id, (prev.get(r.source_row_id) || 0) + r.qty);
    }
    const work = (id: string): number => facts.filter((f) => f.src === id && f.date <= to).reduce((s, f) => s + f.qty, 0);
    const out: Ks2ProposalRow[] = [];
    for (const s of src) {
      const total = r3(s.kind === 'work' ? work(s.id) : work(s.parent!) * (s.norm || 0));
      const p = r3(prev.get(s.id) || 0);
      if (total <= 0 && p <= 0) continue;
      out.push({ source_row_id: s.id, import_id: 'imp1', row_no: s.row_no, number: s.number, name: s.name, unit_text: s.unit, kind: s.kind,
        total_qty: total, prev_qty: p, sys_qty: Math.max(0, r3(total - p)), price: s.price });
    }
    return out;
  }
  const item = (a: Act): Ks2ActItem => {
    const last = a.issued ? a.revs.find((r) => r.id === a.issued)! : a.revs[a.revs.length - 1];
    return { id: a.id, act_no: a.act_no, act_date: a.act_date, period_from: a.period_from, period_to: a.period_to, status: a.status, total: last ? last.total : null,
      revisions: a.revs.length, last_revision_id: last ? last.id : null, issued_at: null, issued_by_email: null, annul_reason: a.annul_reason, annulled_at: null, created_at: '2026-10-01T00:00:00Z' };
  };
  const find = (id: string): Act | undefined => acts.find((a) => a.id === id);

  const api: Ks2Api = {
    async settings() {
      calls.push('settings');
      const next = acts.filter((a) => a.status !== 'annulled').reduce((m, a) => Math.max(m, Number(a.act_no) || 0), 0) + 1;
      return ok<Ks2Settings>({ contract_kp_revision_id: contract, requisites, template_name: templ?.name ?? null, template_sha256: templ?.sha256 ?? null,
        template_size: templ ? 100 : null, can_edit: canEdit, next_act_no: String(next),
        kp_revisions: [{ id: 'kp1', estimate_name: 'Смета «Альфа»', revision_no: 1, total: 1000, created_at: '2026-10-01T00:00:00Z' }] });
    },
    async setContract(_p, kp) { calls.push('setContract'); if (!canEdit) return no('Нет права вести КС-2'); contract = kp; return ok(null); },
    async acts() { calls.push('acts'); return ok([...acts].reverse().map(item)); },
    async createAct(_p, actNo, date, from, to) {
      calls.push('createAct');
      if (!canEdit) return no('Нет права вести КС-2');
      if (!contract) return no('Выберите договорную редакцию КП проекта');
      if (acts.some((a) => a.status !== 'annulled' && a.act_no === actNo)) return no(`Акт № ${actNo} уже есть`);
      const id = 'a' + (acts.length + 1);
      acts.push({ id, act_no: actNo, act_date: date, period_from: from, period_to: to, status: 'draft', annul_reason: null, revs: [], issued: null });
      return ok(id);
    },
    async act(id) {
      calls.push('act');
      const a = find(id);
      if (!a) return no('Акт не найден');
      const last = a.issued ? a.revs.find((r) => r.id === a.issued)! : a.revs[a.revs.length - 1] || null;
      return ok<Ks2ActData>({ act: { id: a.id, project_id: 'pr1', act_no: a.act_no, act_date: a.act_date, period_from: a.period_from, period_to: a.period_to, status: a.status, kp_revision_id: 'kp1', annul_reason: a.annul_reason },
        requisites, proposal: a.status === 'draft' ? proposal(a.period_to, a.id) : null, last_revision: last ? JSON.parse(JSON.stringify(last)) : null });
    },
    async save(id, header, edits) {
      calls.push('save');
      const a = find(id);
      if (!a) return no('Акт не найден');
      if (!canEdit) return no('Нет права вести КС-2');
      if (a.status !== 'draft') return no('Акт уже выдан — изменить его нельзя');
      const rows: Ks2Row[] = proposal(a.period_to, a.id).map((p) => {
        const e = edits.find((x) => x.source_row_id === p.source_row_id);
        return { source_row_id: p.source_row_id, row_no: p.row_no, number: p.number || '', name: p.name, unit: p.unit_text || '', kind: p.kind, sys_qty: p.sys_qty, sys_price: p.price,
          qty: e ? e.qty : p.sys_qty, price: e ? e.price : p.price, excluded: e ? e.excluded : false, total_qty: p.total_qty, prev_qty: p.prev_qty };
      });
      const h = { ...header, act_no: header.act_no || a.act_no, period_from: a.period_from, period_to: a.period_to };
      a.act_no = h.act_no; a.act_date = h.act_date || a.act_date;
      const { act_no: _n, act_date: _d, period_from: _f, period_to: _t, ...req } = h; requisites = req;
      const snap = { header: h, rows };
      a.revs.push({ id: `${id}-r${a.revs.length + 1}`, revision_no: a.revs.length + 1, snapshot: snap, total: actTotal(snap), created_at: '2026-10-21T10:00:00Z' });
      return ok(a.revs.length);
    },
    async issue(id) {
      calls.push('issue');
      const a = find(id)!;
      if (a.status !== 'draft') return no('Акт уже выдан');
      const last = a.revs[a.revs.length - 1];
      if (!last) return no('Сначала сохраните акт');
      const live = last.snapshot.rows.filter((r) => !r.excluded && r.qty > 0);
      if (!live.length) return no('В акте нет ни одной строки с объёмом');
      const np = live.filter((r) => r.price === null).length;
      if (np) return no(`Нет цены у ${np} строк(и) — акт без цен выдать нельзя`);
      a.status = 'issued'; a.issued = last.id;
      return ok(null);
    },
    async annul(id, reason) {
      calls.push('annul');
      const a = find(id)!;
      if (a.status !== 'issued') return no('Аннулировать можно только выданный акт');
      if (!reason.trim()) return no('Укажите причину аннулирования');
      a.status = 'annulled'; a.annul_reason = reason.trim();
      return ok(null);
    },
    async revisions(id) {
      calls.push('revisions');
      const a = find(id)!;
      return ok<Ks2RevisionItem[]>([...a.revs].reverse().map((r) => ({ id: r.id, revision_no: r.revision_no, total: r.total, note: null, created_by_email: 'pto@test.invalid', created_at: r.created_at, issued: r.id === a.issued })));
    },
    async revision(id) { calls.push('revision'); for (const a of acts) { const r = a.revs.find((x) => x.id === id); if (r) return ok(JSON.parse(JSON.stringify(r))); } return no('Редакция не найдена'); },
    async template() { calls.push('template'); return ok(templ); },
    async saveTemplate(_p, name, data) { calls.push('saveTemplate'); templ = data ? { name: name!, sha256: 'f'.repeat(64), data } : null; return ok(templ ? templ.sha256 : ''); },
  };
  return { api, acts, calls };
}
