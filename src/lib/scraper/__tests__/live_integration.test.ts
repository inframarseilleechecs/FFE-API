import { describe, it, expect } from "vitest";
import { searchFfePlayers } from "../service";

// Dans GitHub Actions CI, les serveurs FFE bloquent ou limitent souvent les adresses IP des runners cloud
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

describe.skipIf(isCI)("Scraper - Live FFE Server Integration (Online)", () => {
  it("queries the live FFE website for CHUKHNO and extracts real data from Marseille-Echecs", async () => {
    const result = await searchFfePlayers({
      nom: "CHUKHNO",
      prenom: "Maxime",
    });

    expect(result.status).toBe("EXACT");
    expect(result.count).toBe(1);

    const player = result.players[0];
    expect(player.nom.toUpperCase()).toBe("CHUKHNO");
    expect(player.prenom).toBe("Maxime");
    expect(player.nrFFE).toBe("X81304");
    expect(player.club).toContain("Marseille");
    expect(player.lienFFE).toBe("https://www.echecs.asso.fr/FicheJoueur.aspx?Id=1242503");
  }, 15000);

  it("queries live FFE for homonyms (ex: MARTIN Louis) and retrieves multiple players without loss", async () => {
    const result = await searchFfePlayers({
      nom: "MARTIN",
      prenom: "Louis",
    });

    expect(result.status).toBe("HOMONYMS");
    expect(result.players.length).toBeGreaterThan(1);
    for (const p of result.players) {
      expect(p.nom.toUpperCase()).toContain("MARTIN");
      expect(p.nrFFE).toMatch(/^[A-Z][0-9]+/);
    }
  }, 15000);
});
