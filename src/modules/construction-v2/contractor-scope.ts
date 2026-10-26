/**
 * Scope подрядчика для construction-v2 — без DOM.
 * Канон: current_plan.md блок B.
 */

import type { ConstructionAcceptanceV2 } from '../../services/construction-acceptance/types';
import type { ConstructionDefectV2 } from '../../services/construction-defects/types';

type Perms = {
  getCurrentRole?: () => string;
  getAssignedContractor?: () => string;
};

type ContractorsSvc = {
  resolveIdFromNormalized?: (o: Record<string, string>) => string | null | undefined;
};

export function isContractorRole(): boolean {
  const perms = window.RBI?.services?.permissions as Perms | undefined;
  return (perms?.getCurrentRole?.() || '') === 'contractor';
}

/** UUID карточки из getAssignedContractor() → resolveIdFromNormalized. Пустой/pending → null. */
export function resolveMyContractorId(): string | null {
  const perms = window.RBI?.services?.permissions as Perms | undefined;
  const name = String(perms?.getAssignedContractor?.() || '').trim();
  if (!name) return null;
  const contractors = window.RBI?.services?.contractors as ContractorsSvc | undefined;
  if (!contractors?.resolveIdFromNormalized) return null;
  const id = String(
    contractors.resolveIdFromNormalized({
      display_name: name,
      contractor_name: name
    }) || ''
  ).trim();
  if (!id || id === 'pending') return null;
  return id;
}

/** P2-0044: id контрагента ядра фирмы подрядчика — из назначения роли (мост, quality.my_access). Пусто — не назначена. */
export function myCounterpartyId(): string {
  const s = (window as unknown as { appSettings?: { assignedCounterpartyId?: unknown } }).appSettings;
  return String(s?.assignedCounterpartyId || '').trim();
}

type ContractorRow = { contractorId?: string | null; core_counterparty_id?: string | null };

/** Запись своей фирмы: по номеру контрагента (сервер пишет core_counterparty_id, 043) — написание названия не важно;
 *  запись без номера (создана на устройстве, ещё не отправлена) — по карточке справочника, как раньше. */
export function ownsRecord(row: ContractorRow, myCp: string, myDirId: string | null): boolean {
  const cp = String(row?.core_counterparty_id || '').trim();
  if (myCp && cp) return cp === myCp;
  return !!myDirId && String(row?.contractorId || '').trim() === myDirId;
}

function _filterForRole<T extends ContractorRow>(list: T[]): T[] {
  if (!isContractorRole()) return list;
  const myCp = myCounterpartyId();
  const myDirId = resolveMyContractorId();
  if (!myCp && !myDirId) return [];
  return (list || []).filter((r) => ownsRecord(r, myCp, myDirId));
}

export function filterDefectsForRole<T extends ContractorRow>(list: T[]): T[] {
  return _filterForRole(list);
}

export function filterAcceptancesForRole<T extends ContractorRow>(list: T[]): T[] {
  return _filterForRole(list);
}

/** Удобный тип-алиас для callers. */
export type ScopedDefect = ConstructionDefectV2;
export type ScopedAcceptance = ConstructionAcceptanceV2;
