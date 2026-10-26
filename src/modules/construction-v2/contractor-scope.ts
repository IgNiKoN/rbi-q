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

export function filterDefectsForRole<T extends { contractorId?: string | null }>(
  list: T[]
): T[] {
  if (!isContractorRole()) return list;
  const myId = resolveMyContractorId();
  if (!myId) return [];
  return (list || []).filter((d) => String(d.contractorId || '').trim() === myId);
}

export function filterAcceptancesForRole<T extends { contractorId?: string | null }>(
  list: T[]
): T[] {
  if (!isContractorRole()) return list;
  const myId = resolveMyContractorId();
  if (!myId) return [];
  return (list || []).filter((a) => String(a.contractorId || '').trim() === myId);
}

/** Удобный тип-алиас для callers. */
export type ScopedDefect = ConstructionDefectV2;
export type ScopedAcceptance = ConstructionAcceptanceV2;
