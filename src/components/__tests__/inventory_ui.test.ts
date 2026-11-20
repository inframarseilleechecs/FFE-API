/**
 * Tests unitaires de l'interface Inventaire & Équipements (Étape 4)
 * Valide : renommage sans finances, RBAC lecture seule vs édition, KPIs, filtres et cohérence des menus déroulants.
 */

import { describe, it, expect } from "vitest";
import { ALL_TABS } from "../TabNavigation";
import { hasPermission } from "@/lib/auth/permissions";
import {
  computeInventoryKpis,
  filterInventoryMembers,
  buildEquipmentChangePatch,
} from "../sections/inventory_ui_helpers";
import { EquipmentItemRecord, EquipmentMemberRecord } from "@/lib/db/schema";

const now = new Date();

const SAMPLE_ITEMS: EquipmentItemRecord[] = [
  {
    id: 1,
    category: "POLO",
    type: "Polo Adulte M",
    quantitySinceLastInventory: 10,
    nbDistributed: 2,
    stockRemaining: 8,
    threshold: 3,
    isLowStock: false,
    usageCount: 3,
    canDelete: false,
    lastInventoryAt: now,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 2,
    category: "VESTE",
    type: "Veste Club L",
    quantitySinceLastInventory: 3,
    nbDistributed: 1,
    stockRemaining: 2,
    threshold: 3,
    isLowStock: true,
    usageCount: 1,
    canDelete: false,
    lastInventoryAt: now,
    createdAt: now,
    updatedAt: now,
  },
];

const SAMPLE_MEMBERS: EquipmentMemberRecord[] = [
  {
    id: 1,
    seasonYear: 2027,
    firstname: "Maxime",
    lastname: "CHUKHNO",
    birthDate: "15-05-2014",
    poloItemId: 1,
    poloDistributed: true,
    vesteItemId: 2,
    vesteDistributed: false, // En attente de remise !
    diversItemId: null,
    diversDistributed: false,
    paymentOk: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 2,
    seasonYear: 2027,
    firstname: "Alice",
    lastname: "MARTIN",
    birthDate: "12-03-2013",
    poloItemId: 1,
    poloDistributed: true,
    vesteItemId: null,
    vesteDistributed: false,
    diversItemId: null,
    diversDistributed: false,
    paymentOk: false,
    createdAt: now,
    updatedAt: now,
  },
];

describe("Inventory UI Logic & Navigation (Étape 4)", () => {
  it("renomme l'onglet en 'Inventaire & Équipements' sans aucune mention de Finances", () => {
    const invTab = ALL_TABS.find((t) => t.key === "inventory");
    expect(invTab).toBeDefined();
    expect(invTab?.label).toBe("Inventaire & Équipements");
    expect(invTab?.label.toLowerCase()).not.toContain("finance");
  });

  it("applique la distinction lecture seule (director) vs gestion complète (secretary, superadmin)", () => {
    expect(hasPermission("superadmin", "inventory:manage")).toBe(true);
    expect(hasPermission("secretary", "inventory:manage")).toBe(true);
    expect(hasPermission("director", "inventory:view")).toBe(true);
    expect(hasPermission("director", "inventory:manage")).toBe(false);
    expect(hasPermission("coach", "inventory:view")).toBe(false);
  });

  it("calcule exactement les KPIs 100 % inventaire (membres, paiements, distribués vs à remettre, alertes stock bas)", () => {
    const kpis = computeInventoryKpis(SAMPLE_MEMBERS, SAMPLE_ITEMS);
    expect(kpis).toEqual({
      totalMembers: 2,
      paidCount: 1,
      distributedCount: 2, // 2 polos distribués
      pendingCount: 1,     // 1 veste due et non remise
      lowStockCount: 1,    // Veste Club L en alerte
    });
  });

  it("filtre correctement les membres par pastille (ALL, PENDING, PAID, UNPAID) et recherche texte", () => {
    expect(filterInventoryMembers(SAMPLE_MEMBERS, "", "ALL")).toHaveLength(2);
    expect(filterInventoryMembers(SAMPLE_MEMBERS, "", "PENDING").map((m) => m.id)).toEqual([1]);
    expect(filterInventoryMembers(SAMPLE_MEMBERS, "", "PAID").map((m) => m.id)).toEqual([1]);
    expect(filterInventoryMembers(SAMPLE_MEMBERS, "", "UNPAID").map((m) => m.id)).toEqual([2]);

    // Recherche par prénom, nom ou date de naissance
    expect(filterInventoryMembers(SAMPLE_MEMBERS, "alice", "ALL").map((m) => m.id)).toEqual([2]);
    expect(filterInventoryMembers(SAMPLE_MEMBERS, "2014", "ALL").map((m) => m.id)).toEqual([1]);
    expect(filterInventoryMembers(SAMPLE_MEMBERS, "inexistant", "ALL")).toHaveLength(0);
  });

  it("remet automatiquement *_distributed à false quand on vide un menu déroulant d'équipement", () => {
    const clearPatch = buildEquipmentChangePatch("poloItemId", "poloDistributed", "");
    expect(clearPatch).toEqual({ poloItemId: null, poloDistributed: false });

    const selectPatch = buildEquipmentChangePatch("poloItemId", "poloDistributed", "2");
    expect(selectPatch).toEqual({ poloItemId: 2 });
  });
});
