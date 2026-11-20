/**
 * Tests d'intégration pour les repositories v1.2 (Users, Classes, Inventory)
 * Auteur : Sergey CHUKHNO
 */

import { describe, it, expect } from "vitest";
import { getUserByEmail, getAllUsers } from "../users";
import { getAllClasses, getClassesByCoachId } from "../classes";
import {
  getAllEquipmentItems,
  getLowStockEquipmentAlerts,
  createEquipmentMember,
  updateEquipmentMember,
  deleteEquipmentMember,
} from "../inventory";

describe("Repositories v1.2 Integration", () => {
  it("récupère les utilisateurs officiels du seed", async () => {
    const admin = await getUserByEmail("admin@marseille-echecs.com");
    expect(admin).not.toBeNull();
    expect(admin?.role).toBe("superadmin");

    const director = await getUserByEmail("directeur@marseille-echecs.com");
    expect(director).not.toBeNull();
    expect(director?.role).toBe("director");

    const coach = await getUserByEmail("coach@marseille-echecs.com");
    expect(coach).not.toBeNull();
    expect(coach?.role).toBe("coach");

    const secretary = await getUserByEmail("secretaire@marseille-echecs.com");
    expect(secretary).not.toBeNull();
    expect(secretary?.role).toBe("secretary");

    const all = await getAllUsers();
    expect(all.length).toBeGreaterThanOrEqual(4);
  });

  it("récupère les cours assignés au coach", async () => {
    const coach = await getUserByEmail("coach@marseille-echecs.com");
    expect(coach).not.toBeNull();

    if (coach) {
      const coachClasses = await getClassesByCoachId(coach.id);
      expect(coachClasses.length).toBeGreaterThanOrEqual(2);
      expect(coachClasses.some((c) => c.name === "Poussins Débutants")).toBe(true);
      expect(coachClasses.some((c) => c.name === "Perfectionnement Jeunes")).toBe(true);
    }
  });

  it("récupère les équipements d'inventaire (Polo, Veste, Divers) et détecte les alertes stock bas", async () => {
    const items = await getAllEquipmentItems();
    expect(items.length).toBeGreaterThanOrEqual(5);

    const categories = new Set(items.map((i) => i.category));
    expect(categories.has("POLO")).toBe(true);
    expect(categories.has("VESTE")).toBe(true);
    expect(categories.has("DIVERS")).toBe(true);

    const lowStock = await getLowStockEquipmentAlerts();
    expect(lowStock.length).toBeGreaterThanOrEqual(1);
    expect(lowStock.some((i) => i.type.includes("Veste Club L"))).toBe(true);
  });

  it("met à jour nbDistributed lorsqu'un équipement dû passe à distribué", async () => {
    const items = await getAllEquipmentItems("POLO");
    const polo = items[0];
    expect(polo).toBeDefined();

    const initialDistributed = polo.nbDistributed;
    const member = await createEquipmentMember({
      seasonYear: 2027,
      firstname: "Lucas",
      lastname: "Test",
      birthDate: "15-05-2012",
      poloItemId: polo.id,
      poloDistributed: false,
      paymentOk: true,
    });

    // Dû mais non distribué -> nbDistributed inchangé
    const afterDue = (await getAllEquipmentItems("POLO")).find((i) => i.id === polo.id)!;
    expect(afterDue.nbDistributed).toBe(initialDistributed);

    // Coché "Distribué" -> nbDistributed + 1
    await updateEquipmentMember(member.id, { poloDistributed: true });
    const afterDist = (await getAllEquipmentItems("POLO")).find((i) => i.id === polo.id)!;
    expect(afterDist.nbDistributed).toBe(initialDistributed + 1);

    // Nettoyage
    await deleteEquipmentMember(member.id);
  });
});
