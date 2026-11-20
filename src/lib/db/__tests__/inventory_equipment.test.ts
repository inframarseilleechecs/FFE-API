/**
 * Suite de tests unitaires — Étape 1 : Dépôt Inventaire & Équipements
 * Valide : saisons, catalogue Polo/Veste/Divers, règle DELETE IF NEVER USED,
 * logique Option 2 (Dû vs Distribué), calcul stockRemaining/threshold et bulkUpsert.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  resetMemoryInventory,
  getInventorySeasons,
  createInventorySeason,
  getAllEquipmentItems,
  createEquipmentItem,
  updateEquipmentItem,
  deleteEquipmentItem,
  getLowStockEquipmentAlerts,
  getEquipmentMembersByYear,
  createEquipmentMember,
  updateEquipmentMember,
  deleteEquipmentMember,
  bulkUpsertEquipmentMembers,
  InventoryError,
} from "../inventory";

describe("Inventory & Equipment Repository (Étape 1)", () => {
  beforeEach(() => {
    resetMemoryInventory(true);
  });

  it("gère la création et la liste des saisons (bouton + et sélecteur ANNÉE)", async () => {
    await createInventorySeason(2026, "Saison 2025-2026");
    await createInventorySeason(2027, "Saison 2026-2027");

    const seasons = await getInventorySeasons();
    expect(seasons.map((s) => s.year)).toEqual([2027, 2026]);

    await expect(createInventorySeason(2027)).rejects.toThrow(InventoryError);
  });

  it("crée, filtre et met à jour les équipements sur les 3 catégories POLO, VESTE, DIVERS", async () => {
    const polo = await createEquipmentItem({
      category: "POLO",
      type: "Polo M",
      quantitySinceLastInventory: 12,
      threshold: 4,
    });
    const veste = await createEquipmentItem({
      category: "VESTE",
      type: "Veste L",
      quantitySinceLastInventory: 5,
      threshold: 2,
    });
    const divers = await createEquipmentItem({
      category: "DIVERS",
      type: "Gourde Club",
      quantitySinceLastInventory: 30,
      threshold: 5,
    });

    expect(polo.nbDistributed).toBe(0);
    expect(polo.stockRemaining).toBe(12);
    expect(polo.canDelete).toBe(true);
    expect(polo.isLowStock).toBe(false);

    expect((await getAllEquipmentItems("POLO")).map((i) => i.id)).toEqual([polo.id]);
    expect((await getAllEquipmentItems("VESTE")).map((i) => i.id)).toEqual([veste.id]);
    expect((await getAllEquipmentItems("DIVERS")).map((i) => i.id)).toEqual([divers.id]);

    // Mise à jour du stock d'inventaire
    const updated = await updateEquipmentItem(veste.id, {
      quantitySinceLastInventory: 2,
      resetLastInventoryAt: true,
    });
    expect(updated?.stockRemaining).toBe(2);
    expect(updated?.isLowStock).toBe(true);

    // Empêche les doublons dans la même catégorie
    await expect(
      createEquipmentItem({
        category: "POLO",
        type: "polo m",
        quantitySinceLastInventory: 5,
      })
    ).rejects.toThrow(InventoryError);
  });

  it("distingue équipement Dû (distributed=false) vs Distribué (distributed=true) et déclenche l'alerte stock bas", async () => {
    await createInventorySeason(2027);
    const polo = await createEquipmentItem({
      category: "POLO",
      type: "Polo S",
      quantitySinceLastInventory: 3,
      threshold: 2,
    });

    // Import / création en début de saison : Polo dû mais pas encore remis
    const m1 = await createEquipmentMember({
      seasonYear: 2027,
      firstname: "Alice",
      lastname: "Martin",
      birthDate: "12-03-2014",
      poloItemId: polo.id,
      poloDistributed: false,
      paymentOk: true,
    });

    let items = await getAllEquipmentItems("POLO");
    expect(items[0].nbDistributed).toBe(0);
    expect(items[0].stockRemaining).toBe(3);
    expect(items[0].isLowStock).toBe(false);
    expect(items[0].usageCount).toBe(1);
    expect(items[0].canDelete).toBe(false);

    // Le responsable remet le polo et coche "Distribué"
    await updateEquipmentMember(m1.id, { poloDistributed: true });

    items = await getAllEquipmentItems("POLO");
    expect(items[0].nbDistributed).toBe(1);
    expect(items[0].stockRemaining).toBe(2); // 3 - 1 = 2 <= threshold (2) -> alerte !
    expect(items[0].isLowStock).toBe(true);

    const alerts = await getLowStockEquipmentAlerts();
    expect(alerts.map((a) => a.id)).toEqual([polo.id]);

    // Si on retire l'article du membre, poloDistributed repasse automatiquement à false
    const cleared = await updateEquipmentMember(m1.id, { poloItemId: null });
    expect(cleared?.poloDistributed).toBe(false);

    items = await getAllEquipmentItems("POLO");
    expect(items[0].nbDistributed).toBe(0);
    expect(items[0].canDelete).toBe(true);
  });

  it("applique strictement la règle DELETE ITEM (IF NEVER USED)", async () => {
    await createInventorySeason(2026);
    const unusedItem = await createEquipmentItem({
      category: "DIVERS",
      type: "Porte-clés",
      quantitySinceLastInventory: 10,
    });
    const usedItem = await createEquipmentItem({
      category: "VESTE",
      type: "Veste S",
      quantitySinceLastInventory: 8,
    });

    const m = await createEquipmentMember({
      seasonYear: 2026,
      firstname: "Maxime",
      lastname: "Chukhno",
      birthDate: "01-01-2015",
      vesteItemId: usedItem.id,
      vesteDistributed: false, // Même non encore distribué, il est référencé !
    });

    // Suppression autorisée sur un article jamais utilisé
    expect(await deleteEquipmentItem(unusedItem.id)).toBe(true);

    // Suppression refusée sur un article référencé
    await expect(deleteEquipmentItem(usedItem.id)).rejects.toMatchObject({
      code: "ITEM_IN_USE",
    });

    // Une fois le membre supprimé, l'article redevient supprimable
    expect(await deleteEquipmentMember(m.id)).toBe(true);
    expect(await deleteEquipmentItem(usedItem.id)).toBe(true);
  });

  it("isole strictement les membres par année et déduplique lors d'un import en lot", async () => {
    await createInventorySeason(2026);
    await createInventorySeason(2027);
    const polo = await createEquipmentItem({
      category: "POLO",
      type: "Polo L",
      quantitySinceLastInventory: 20,
    });

    const firstImport = await bulkUpsertEquipmentMembers(2027, [
      {
        firstname: "Jean",
        lastname: "Dupont",
        birthDate: "10-04-2010",
        poloItemId: polo.id,
        poloDistributed: false,
        paymentOk: false,
      },
      {
        firstname: "Emma",
        lastname: "Durand",
        birthDate: "22-09-2011",
        poloItemId: polo.id,
        poloDistributed: false,
        paymentOk: true,
      },
    ]);

    expect(firstImport).toEqual({ created: 2, updated: 0 });
    expect(await getEquipmentMembersByYear(2026)).toHaveLength(0);
    expect(await getEquipmentMembersByYear(2027)).toHaveLength(2);

    // Ré-import de Jean Dupont avec paymentOk = true : mise à jour sans doublon
    const secondImport = await bulkUpsertEquipmentMembers(2027, [
      {
        firstname: "jean",
        lastname: "DUPONT",
        birthDate: "10-04-2010",
        paymentOk: true,
      },
    ]);

    expect(secondImport).toEqual({ created: 0, updated: 1 });
    const members2027 = await getEquipmentMembersByYear(2027);
    expect(members2027).toHaveLength(2);
    const jean = members2027.find((m) => m.lastname === "DUPONT");
    expect(jean?.paymentOk).toBe(true);
    expect(jean?.poloItemId).toBe(polo.id); // Conservé
  });
});
