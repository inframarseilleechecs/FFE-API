/**
 * Fonctions pures de logique UI pour le module Inventaire & Équipements.
 * Extraites pour être testées unitairement de manière déterministe.
 */

import {
  EquipmentCategory,
  EquipmentItemRecord,
  EquipmentMemberRecord,
} from "@/lib/db/schema";
import {
  ImportRowStatus,
  InventoryImportPreview,
  InventoryPreviewRow,
} from "@/lib/parser/inventory_excel";

export type MemberFilter = "ALL" | "PENDING" | "PAID" | "UNPAID";
export type PreviewStatusFilter = "ALL" | ImportRowStatus;

export interface InventoryUiKpis {
  totalMembers: number;
  paidCount: number;
  distributedCount: number;
  pendingCount: number;
  lowStockCount: number;
}

/**
 * Calcule les 3 KPIs affichés en haut de l'écran Inventaire (zéro finance).
 */
export function computeInventoryKpis(
  members: EquipmentMemberRecord[],
  items: EquipmentItemRecord[]
): InventoryUiKpis {
  let paidCount = 0;
  let distributedCount = 0;
  let pendingCount = 0;

  for (const m of members) {
    if (m.paymentOk) paidCount++;
    if (m.poloItemId) {
      if (m.poloDistributed) distributedCount++;
      else pendingCount++;
    }
    if (m.vesteItemId) {
      if (m.vesteDistributed) distributedCount++;
      else pendingCount++;
    }
    if (m.diversItemId) {
      if (m.diversDistributed) distributedCount++;
      else pendingCount++;
    }
  }

  return {
    totalMembers: members.length,
    paidCount,
    distributedCount,
    pendingCount,
    lowStockCount: items.filter((i) => i.isLowStock).length,
  };
}

/**
 * Filtre les membres selon la barre de recherche et la pastille active (ALL / PENDING / PAID / UNPAID).
 */
export function filterInventoryMembers(
  members: EquipmentMemberRecord[],
  searchQuery: string,
  filter: MemberFilter
): EquipmentMemberRecord[] {
  const q = searchQuery.trim().toLowerCase();

  return members.filter((m) => {
    if (q) {
      const full = `${m.firstname} ${m.lastname} ${m.birthDate}`.toLowerCase();
      if (!full.includes(q)) return false;
    }

    if (filter === "PAID") return m.paymentOk;
    if (filter === "UNPAID") return !m.paymentOk;
    if (filter === "PENDING") {
      const hasPendingPolo = Boolean(m.poloItemId && !m.poloDistributed);
      const hasPendingVeste = Boolean(m.vesteItemId && !m.vesteDistributed);
      const hasPendingDivers = Boolean(m.diversItemId && !m.diversDistributed);
      return hasPendingPolo || hasPendingVeste || hasPendingDivers;
    }

    return true;
  });
}

/**
 * Construit le patch PATCH /api/inventory/members/[id] lors d'un changement dans un menu déroulant
 * (garantit que vider un article remet automatiquement *_distributed à false).
 */
export function buildEquipmentChangePatch(
  fieldItem: "poloItemId" | "vesteItemId" | "diversItemId",
  fieldDist: "poloDistributed" | "vesteDistributed" | "diversDistributed",
  rawValue: string
): Record<string, number | boolean | null> {
  const nextId = rawValue ? Number(rawValue) : null;
  if (nextId === null) {
    return { [fieldItem]: null, [fieldDist]: false };
  }
  return { [fieldItem]: nextId };
}

/**
 * Regroupe les articles du catalogue en 3 tables distinctes (POLO, VESTE, DIVERS).
 */
export function groupEquipmentByCategory(
  items: EquipmentItemRecord[]
): Record<EquipmentCategory, EquipmentItemRecord[]> {
  return {
    POLO: items.filter((i) => i.category === "POLO"),
    VESTE: items.filter((i) => i.category === "VESTE"),
    DIVERS: items.filter((i) => i.category === "DIVERS"),
  };
}

/**
 * Filtre les lignes du Pre-Visualizer d'import Excel par statut (ALL / VALID / WARNING / ERROR).
 */
export function filterPreviewRows(
  rows: InventoryPreviewRow[],
  statusFilter: PreviewStatusFilter
): InventoryPreviewRow[] {
  if (statusFilter === "ALL") return rows;
  return rows.filter((r) => r.status === statusFilter);
}

/**
 * Détermine si le bouton "Confirmer et importer" doit être actif dans le Pre-Visualizer.
 */
export function canConfirmImport(preview: InventoryImportPreview | null): boolean {
  return Boolean(preview && preview.summary.importableCount > 0);
}
