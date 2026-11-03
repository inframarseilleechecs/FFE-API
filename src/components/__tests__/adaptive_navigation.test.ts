import { describe, it, expect } from "vitest";
import {
  getAllowedTabsForRole,
  getDefaultTabForRole,
  ALL_TABS,
  TabKey,
} from "../TabNavigation";
import { hasPermission } from "@/lib/auth/permissions";

describe("Adaptive UI & RBAC Navigation - Automated Tests (Étape 10A)", () => {
  it("provides all tabs to director and superadmin including analytics and sync", () => {
    const directorTabs = getAllowedTabsForRole("director").map((t) => t.key);
    expect(directorTabs).toContain("verify");
    expect(directorTabs).toContain("search");
    expect(directorTabs).toContain("inventory");
    expect(directorTabs).toContain("classes");
    expect(directorTabs).toContain("teams");
    expect(directorTabs).toContain("analytics");
    expect(directorTabs).toHaveLength(6);

    const superadminTabs = getAllowedTabsForRole("superadmin").map((t) => t.key);
    expect(superadminTabs).toContain("logs");
    expect(superadminTabs).toHaveLength(7);

    // Droit de synchronisation FFE dans l'en-tête
    expect(hasPermission("director", "sync:execute")).toBe(true);
    expect(hasPermission("superadmin", "sync:execute")).toBe(true);

    // Onglet par défaut
    expect(getDefaultTabForRole("director")).toBe("verify");
    expect(getDefaultTabForRole("superadmin")).toBe("verify");
  });

  it("restricts secretary strictly to inventory & finances and player search", () => {
    const secretaryTabs = getAllowedTabsForRole("secretary").map((t) => t.key);
    expect(secretaryTabs).toEqual(["search", "inventory"]);

    // Interdictions strictes pour la secrétaire
    expect(secretaryTabs).not.toContain("verify");
    expect(secretaryTabs).not.toContain("classes");
    expect(secretaryTabs).not.toContain("teams");
    expect(secretaryTabs).not.toContain("analytics");

    // Bouton de synchronisation FFE masqué dans l'en-tête
    expect(hasPermission("secretary", "sync:execute")).toBe(false);

    // Onglet par défaut personnalisé pour la secrétaire
    expect(getDefaultTabForRole("secretary")).toBe("inventory");
  });

  it("restricts coach strictly to own classes, player search and teams read-only", () => {
    const coachTabs = getAllowedTabsForRole("coach").map((t) => t.key);
    expect(coachTabs).toEqual(["search", "classes", "teams"]);

    // Interdictions strictes pour l'entraîneur
    expect(coachTabs).not.toContain("verify");
    expect(coachTabs).not.toContain("inventory");
    expect(coachTabs).not.toContain("analytics");

    // Bouton de synchronisation FFE masqué dans l'en-tête
    expect(hasPermission("coach", "sync:execute")).toBe(false);

    // Onglet par défaut personnalisé pour l'entraîneur
    expect(getDefaultTabForRole("coach")).toBe("classes");
  });

  it("strictly reserves analytics module to director and superadmin", () => {
    const analyticsTab = ALL_TABS.find((t) => t.key === "analytics");
    expect(analyticsTab).toBeDefined();
    expect(analyticsTab?.allowedRoles).toEqual(["superadmin", "director"]);
    expect(analyticsTab?.allowedRoles).not.toContain("secretary");
    expect(analyticsTab?.allowedRoles).not.toContain("coach");
  });

  it("adapts classes tab label based on role (Cours & Entraînements vs Mes Cours & Entraînements)", () => {
    const coachTabs = getAllowedTabsForRole("coach");
    const coachClassTab = coachTabs.find((t) => t.key === "classes");
    expect(coachClassTab?.label).toBe("Mes Cours & Entraînements");

    const directorTabs = getAllowedTabsForRole("director");
    const directorClassTab = directorTabs.find((t) => t.key === "classes");
    expect(directorClassTab?.label).toBe("Cours & Entraînements");

    const superadminTabs = getAllowedTabsForRole("superadmin");
    const superadminClassTab = superadminTabs.find((t) => t.key === "classes");
    expect(superadminClassTab?.label).toBe("Cours & Entraînements");
  });

  it("handles fallback and undefined role gracefully", () => {
    const fallbackTabs = getAllowedTabsForRole(null).map((t) => t.key);
    expect(fallbackTabs).toEqual(["verify", "search"]);
    expect(getDefaultTabForRole(null)).toBe("verify");
  });
});
