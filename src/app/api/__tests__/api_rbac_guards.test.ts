/**
 * Tests d'intégration pour les Route Handlers et les gardes RBAC (401 / 403)
 * Auteur : Sergey CHUKHNO
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as verifyBatchHandler } from "../verify-batch/route";
import { GET as playersSearchHandler } from "../players/search/route";
import { POST as syncClubHandler } from "../cron/sync-club/route";
import { NextRequest } from "next/server";
import { upsertPlayers, clearMemoryDb } from "@/lib/db/repository";
import { Player } from "@/lib/scraper/types";
import * as scraperService from "@/lib/scraper/service";

describe("API RBAC Guards Integration (Step 9)", () => {
  const mockMaxime: Player = {
    nrFFE: "X81304",
    nomPrenom: "CHUKHNO Maxime",
    nom: "CHUKHNO",
    prenom: "Maxime",
    af: "A",
    elo: "1471 F",
    rapide: "1472 F",
    blitz: "799 E",
    cat: "PouM",
    club: "Marseille-Echecs",
    idFFE: "1242503",
    statut: "ACTIF",
  };

  beforeEach(async () => {
    clearMemoryDb();
    vi.restoreAllMocks();
    vi.spyOn(scraperService, "fetchAllClubMembers").mockResolvedValue({
      players: [mockMaxime],
      totalPages: 1,
      pagesFetched: [1],
      missingPages: [],
      isPartial: false,
    });
    await upsertPlayers([mockMaxime]);
  });

  describe("POST /api/verify-batch - Protection RBAC", () => {
    const payload = JSON.stringify({
      licences: ["X81304"],
    });

    it("rejette les requêtes anonymes avec HTTP 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/verify-batch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-unauthenticated": "true",
        },
        body: payload,
      });

      const res = await verifyBatchHandler(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("UNAUTHORIZED");
    });

    it("bloque un entraîneur avec HTTP 403 (droit réservé au directeur)", async () => {
      const req = new NextRequest("http://localhost:3000/api/verify-batch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-role": "coach",
        },
        body: payload,
      });

      const res = await verifyBatchHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("FORBIDDEN");
    });

    it("bloque la secrétaire avec HTTP 403", async () => {
      const req = new NextRequest("http://localhost:3000/api/verify-batch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-role": "secretary",
        },
        body: payload,
      });

      const res = await verifyBatchHandler(req);
      expect(res.status).toBe(403);
    });

    it("autorise le Directeur Sportif avec HTTP 200", async () => {
      const req = new NextRequest("http://localhost:3000/api/verify-batch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-role": "director",
        },
        body: payload,
      });

      const res = await verifyBatchHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.totalProcessed).toBe(1);
    });

    it("autorise le Superadmin avec HTTP 200", async () => {
      const req = new NextRequest("http://localhost:3000/api/verify-batch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-role": "superadmin",
        },
        body: payload,
      });

      const res = await verifyBatchHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe("GET /api/players/search - Protection RBAC", () => {
    it("rejette les requêtes anonymes avec HTTP 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/players/search?nom=CHUKHNO", {
        method: "GET",
        headers: {
          "x-test-unauthenticated": "true",
        },
      });

      const res = await playersSearchHandler(req);
      expect(res.status).toBe(401);
    });

    it("autorise l'accès à la recherche pour l'entraîneur (HTTP 200)", async () => {
      const req = new NextRequest("http://localhost:3000/api/players/search?nom=CHUKHNO", {
        method: "GET",
        headers: {
          "x-test-role": "coach",
        },
      });

      const res = await playersSearchHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.count).toBe(1);
    });

    it("autorise l'accès à la recherche pour la secrétaire (HTTP 200)", async () => {
      const req = new NextRequest("http://localhost:3000/api/players/search?nom=CHUKHNO", {
        method: "GET",
        headers: {
          "x-test-role": "secretary",
        },
      });

      const res = await playersSearchHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe("POST /api/cron/sync-club - Protection RBAC", () => {
    it("rejette les anonymes sans secret avec HTTP 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/sync-club", {
        method: "POST",
        headers: {
          "x-test-unauthenticated": "true",
        },
      });

      const res = await syncClubHandler(req);
      expect(res.status).toBe(401);
    });

    it("bloque le coach sans secret avec HTTP 403", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/sync-club", {
        method: "POST",
        headers: {
          "x-test-role": "coach",
        },
      });

      const res = await syncClubHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toContain("FORBIDDEN");
    });

    it("autorise le directeur sportif même sans secret (HTTP 200)", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/sync-club", {
        method: "POST",
        headers: {
          "x-test-role": "director",
        },
      });

      const res = await syncClubHandler(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });
  });
});
