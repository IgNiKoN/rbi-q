/**
 * Чек-лист приёмки (этаж/зона или квартира) — progress/gate/B/batch helpers + секция details.
 * Структура пунктов — из SYSTEM_TEMPLATES / userTemplates (тот же резолв, что defect-form).
 * УрК B — локально через window.getProductMetrics (math.utils), без DDL/sync-поля.
 */

import type {
  ChecklistItemStatusV2,
  ChecklistResultsV2,
  ConstructionAcceptanceV2
} from '../../services/construction-acceptance/types';

type TmplItem = { id: string | number; n: string; t?: string; w?: number; type?: string };
type TmplGroup = { group?: string; title?: string; items?: TmplItem[] };

export type ChecklistTemplateItem = {
  id: string;
  group: string;
  name: string;
  norm?: string;
  weight?: number | null;
};

export type ChecklistProgress = {
  total: number;
  done: number;
  ok: number;
  fail: number;
  na: number;
  unset: number;
};

/** Локальный УрК приёмки (как Quality audit). */
export type AcceptanceQualityB = {
  final: number;
  statusTxt: string;
  statusCls: string;
  isDanger: boolean;
  reason: string;
  checkedCount: number;
  n_B1_fail: number;
  n_B2_fail: number;
  n_B3_fail: number;
};

export type FailBatchCandidate = ChecklistTemplateItem & {
  status: 'fail' | 'fail_escalated';
  category: 'B1' | 'B2' | 'B3';
};

/** Активные дефекты, блокирующие повторный batch по item_id. */
export const ACTIVE_DEFECT_STATUSES_FOR_BATCH = new Set(['issued', 'in_progress', 'fixed']);

type DefectLike = {
  item_id?: string | null;
  locationId?: string;
  status?: string;
  is_deleted?: boolean;
  _deleted?: boolean;
};

function _t(key: string, fallback: string, vars?: Record<string, string | number>): string {
  try {
    const i18n = window.RBI?.services?.i18n as
      | { t?: (k: string, v?: Record<string, string | number>) => string }
      | undefined;
    if (i18n && typeof i18n.t === 'function') {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
    /* ignore */
  }
  if (!vars) return fallback;
  return String(fallback).replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}

function _escape(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _sysTemplates(): Record<string, { title?: string; groups?: TmplGroup[] }> {
  return (
    (window as unknown as { SYSTEM_TEMPLATES?: Record<string, { title?: string; groups?: TmplGroup[] }> })
      .SYSTEM_TEMPLATES || {}
  );
}

function _userTemplates(): Record<string, { title?: string; groups?: TmplGroup[] }> {
  return (
    (window as unknown as { userTemplates?: Record<string, { title?: string; groups?: TmplGroup[] }> })
      .userTemplates || {}
  );
}

export function resolveTemplateGroups(tmplKey: string): TmplGroup[] {
  if (!tmplKey) return [];
  const type = tmplKey.split('_')[0];
  const key = tmplKey.replace(type + '_', '');
  if (type === 'sys') return _sysTemplates()[key]?.groups || [];
  if (type === 'user') return _userTemplates()[key]?.groups || [];
  return [];
}

/** Плоский список пунктов шаблона с именем группы. */
export function listTemplateChecklistItems(tmplKey: string): ChecklistTemplateItem[] {
  const out: ChecklistTemplateItem[] = [];
  resolveTemplateGroups(tmplKey).forEach((g, gi) => {
    const groupName = String(g.group || g.title || `Группа ${gi + 1}`);
    (g.items || []).forEach((it) => {
      if (!it) return;
      const id = String(it.id ?? '').trim();
      const name = String(it.n || '').trim();
      if (!id || !name) return;
      const w = it.w != null ? Number(it.w) : null;
      out.push({
        id,
        group: groupName,
        name,
        norm: it.t ? String(it.t) : undefined,
        weight: w != null && Number.isFinite(w) ? w : null
      });
    });
  });
  return out;
}

export function statusLabel(st: ChecklistItemStatusV2 | string | null | undefined): string {
  if (st === 'ok') return 'OK';
  if (st === 'fail') return 'FAIL';
  if (st === 'fail_escalated') return 'FAIL↑';
  if (st === 'na') return 'N/A';
  return '—';
}

export function categoryFromWeight(w: number | null | undefined, escalated?: boolean): 'B1' | 'B2' | 'B3' {
  if (escalated) return 'B3';
  if (w === 1) return 'B1';
  if (w === 3) return 'B3';
  return 'B2';
}

export function computeChecklistProgress(
  tmplKey: string | null | undefined,
  results: ChecklistResultsV2 | null | undefined
): ChecklistProgress {
  const templateItems = listTemplateChecklistItems(String(tmplKey || results?.template_key || ''));
  const byId = new Map(
    (results?.items || []).map((it) => [String(it.id), it.status as ChecklistItemStatusV2])
  );
  const total = templateItems.length || (results?.items || []).length;
  let ok = 0;
  let fail = 0;
  let na = 0;
  let done = 0;
  const sourceIds =
    templateItems.length > 0
      ? templateItems.map((t) => t.id)
      : (results?.items || []).map((it) => String(it.id));
  sourceIds.forEach((id) => {
    const st = byId.get(String(id));
    if (!st) return;
    done += 1;
    if (st === 'ok') ok += 1;
    else if (st === 'fail' || st === 'fail_escalated') fail += 1;
    else if (st === 'na') na += 1;
  });
  return {
    total,
    done,
    ok,
    fail,
    na,
    unset: Math.max(0, total - done)
  };
}

export function progressLine(p: ChecklistProgress): string {
  if (!p.total) return '';
  return `${p.done}/${p.total}`;
}

/**
 * Локальный расчёт УрК B по шаблону + checklist_results (getProductMetrics).
 * Без DDL / sync-поля. null если метрик нет (нет данных / math не загружен).
 */
export function computeAcceptanceQualityB(
  tmplKey: string | null | undefined,
  results: ChecklistResultsV2 | null | undefined
): AcceptanceQualityB | null {
  const key = String(tmplKey || results?.template_key || '').trim();
  const groups = resolveTemplateGroups(key);
  if (!groups.length) return null;

  const getProductMetrics =
    (window as unknown as { getProductMetrics?: (s: Record<string, string>, c: unknown) => Record<string, unknown> | null })
      .getProductMetrics ||
    (
      window.RBI as
        | { utils?: { math?: { getProductMetrics?: (s: Record<string, string>, c: unknown) => Record<string, unknown> | null } } }
        | undefined
    )?.utils?.math?.getProductMetrics;

  if (typeof getProductMetrics !== 'function') return null;

  const productState: Record<string, string> = {};
  for (const it of results?.items || []) {
    if (!it?.id || !it.status) continue;
    productState[String(it.id)] = String(it.status);
  }
  if (!Object.keys(productState).length) return null;

  const m = getProductMetrics(productState, groups);
  if (!m || m.final == null) return null;

  return {
    final: Number(m.final) || 0,
    statusTxt: String(m.statusTxt || ''),
    statusCls: String(m.statusCls || ''),
    isDanger: m.isDanger === true,
    reason: String(m.reason || ''),
    checkedCount: Number(m.checkedCount) || 0,
    n_B1_fail: Number(m.n_B1_fail) || 0,
    n_B2_fail: Number(m.n_B2_fail) || 0,
    n_B3_fail: Number(m.n_B3_fail) || 0
  };
}

/** B последней релевантной приёмки локации (с checklist_results; не rejected). */
export function pickLatestAcceptanceForB(
  acceptances: ConstructionAcceptanceV2[]
): ConstructionAcceptanceV2 | null {
  const list = (acceptances || [])
    .filter((a) => a && !a.is_deleted && !a._deleted && String(a.status) !== 'rejected')
    .filter((a) => a.checklist_results && (a.checklist_results.items || []).length > 0)
    .slice()
    .sort((a, b) =>
      String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''))
    );
  return list[0] || null;
}

/**
 * FAIL / fail_escalated пункты без активного дефекта (issued|in_progress|fixed)
 * с тем же item_id + locationId.
 */
export function listFailBatchCandidates(
  acceptance: ConstructionAcceptanceV2,
  existingDefects: DefectLike[]
): FailBatchCandidate[] {
  const tmplKey = String(acceptance.template_key || acceptance.checklist_results?.template_key || '');
  const templateItems = listTemplateChecklistItems(tmplKey);
  const byId = new Map(templateItems.map((t) => [t.id, t]));
  const locationId = String(acceptance.locationId || '');

  const blockedIds = new Set<string>();
  for (const d of existingDefects || []) {
    if (!d || d.is_deleted || d._deleted) continue;
    if (String(d.locationId || '') !== locationId) continue;
    if (!ACTIVE_DEFECT_STATUSES_FOR_BATCH.has(String(d.status || ''))) continue;
    const iid = String(d.item_id || '').trim();
    if (iid) blockedIds.add(iid);
  }

  const out: FailBatchCandidate[] = [];
  for (const row of acceptance.checklist_results?.items || []) {
    const st = row?.status;
    if (st !== 'fail' && st !== 'fail_escalated') continue;
    const id = String(row.id || '').trim();
    if (!id || blockedIds.has(id)) continue;
    const tmpl = byId.get(id);
    const weight = tmpl?.weight ?? null;
    out.push({
      id,
      group: tmpl?.group || String(row.group || '') || '',
      name: tmpl?.name || String(row.name || id),
      norm: tmpl?.norm,
      weight,
      status: st,
      category: categoryFromWeight(weight, st === 'fail_escalated')
    });
  }
  return out;
}

export function acceptGateWarning(item: ConstructionAcceptanceV2): string | null {
  const tmplKey = String(item.template_key || item.checklist_results?.template_key || '');
  const progress = computeChecklistProgress(tmplKey, item.checklist_results);
  if (!tmplKey) return null;
  if (!item.checklist_results || progress.done === 0) {
    return _t('construction.v2.acc.gate_not_started', 'Чек-лист ещё не начат. Принять заявку anyway?');
  }
  if (progress.fail > 0) {
    return _t('construction.v2.acc.gate_fail', 'Есть {count} пункт(ов) FAIL. Принять заявку anyway?', { count: progress.fail });
  }
  if (progress.unset > 0) {
    return _t('construction.v2.acc.gate_unset', 'Не пройдено {count} пункт(ов) чек-листа. Принять anyway?', { count: progress.unset });
  }
  return null;
}

function _bBadgeHtml(b: AcceptanceQualityB | null): string {
  if (!b) return '';
  const tone =
    b.final < 70 || b.isDanger
      ? 'bg-danger-soft text-danger border-danger-soft'
      : b.final < 85
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-green-50 text-green-700 border-green-200';
  return `<div class="mt-2 px-2.5 py-2 rounded-xl border ${tone}" data-c2-cl-b>
      <div class="flex items-center justify-between gap-2">
        <span class="text-rbi-caption font-black uppercase">${_escape(_t('construction.v2.acc.quality_b', 'УрК B'))}</span>
        <span class="text-rbi-title font-black" data-c2-cl-b-final>${_escape(String(b.final))}%</span>
      </div>
      <div class="text-rbi-caption font-bold mt-0.5 opacity-80" data-c2-cl-b-status>${_escape(b.statusTxt || '')}</div>
    </div>`;
}

/**
 * Краткая секция чек-листа в details: progress + B + batch FAIL + «Пройти чек-лист».
 * data-c2-cl-open / data-c2-cl-batch-fail / data-c2-cl-section / data-c2-cl-progress
 */
export function renderChecklistSectionHtml(
  item: ConstructionAcceptanceV2,
  opts?: { editable?: boolean; batchFailCount?: number }
): string {
  const editable = opts?.editable !== false;
  const tmplKey = String(item.template_key || item.checklist_results?.template_key || '');
  if (!tmplKey) {
    return `<div class="mt-3 pt-3 border-t border-[var(--card-border)] text-rbi-caption font-bold text-muted">${_escape(_t('construction.v2.acc.checklist_no_work', 'Чек-лист: вид работ не выбран'))}</div>`;
  }
  const templateItems = listTemplateChecklistItems(tmplKey);
  if (!templateItems.length) {
    return `<div class="mt-3 pt-3 border-t border-[var(--card-border)] text-rbi-caption font-bold text-amber-600">${_escape(_t('construction.v2.acc.checklist_empty', 'Чек-лист шаблона пуст или не найден'))}</div>`;
  }
  const progress = computeChecklistProgress(tmplKey, item.checklist_results);
  const b = computeAcceptanceQualityB(tmplKey, item.checklist_results);
  const batchN =
    opts?.batchFailCount != null
      ? opts.batchFailCount
      : listFailBatchCandidates(item, []).length;
  const openBtn = editable
    ? `<button type="button" data-c2-cl-open
         class="w-full mt-2 bg-brand text-white py-2.5 rounded-xl text-rbi-label font-black uppercase shadow-md">
         ${_escape(_t('construction.v2.acc.run_checklist', 'Пройти чек-лист'))}</button>`
    : '';
  const batchBtn =
    editable && batchN > 0
      ? `<button type="button" data-c2-cl-batch-fail
           class="w-full mt-2 bg-danger-soft text-danger border border-danger-soft py-2.5 rounded-xl text-rbi-label font-black uppercase">
           ${_escape(_t('construction.v2.acc.batch_fail_btn', 'Создать замечания по FAIL ({count})', { count: batchN }))}</button>`
      : '';

  return `
    <div class="mt-3 pt-3 border-t border-[var(--card-border)]" data-c2-cl-section>
      <div class="flex items-center justify-between gap-2 mb-1">
        <div class="text-rbi-caption font-black uppercase text-brand">${_escape(_t('construction.v2.acc.checklist', 'Чек-лист'))}</div>
        <div class="text-rbi-caption font-bold text-muted" data-c2-cl-progress>
          ${progress.done}/${progress.total}
          · OK ${progress.ok} · FAIL ${progress.fail} · N/A ${progress.na}
        </div>
      </div>
      <div class="text-rbi-caption text-muted font-bold">
        ${_escape(_t('construction.v2.acc.checklist_summary', '{items} пункт(ов) · {groups} групп', {
          items: String(templateItems.length),
          groups: String(new Set(templateItems.map((t) => t.group)).size)
        }))}
      </div>
      ${_bBadgeHtml(b)}
      ${openBtn}
      ${batchBtn}
    </div>`;
}
