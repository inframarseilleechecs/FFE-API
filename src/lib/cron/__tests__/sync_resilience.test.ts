import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, GET } from "@/app/api/cron/sync-club/route";
import { NextRequest } from "next/server";
import * as scraperService from "@/lib/scraper/service";
import * as repositoryModule from "@/lib/db/repository";
import { Player } from "@/lib/scraper/types";
import { SyncLogRecord } from "@/lib/db/schema";

describe("Sync Club API Resilience & Partial Fallback (/api/cron/sync-club)", () => {
  const SECRET = "recupffe_cron_secret_local";
  const originalEnv = process.env.CRON_SECRET;

  const mockPlayerA: Player = {
    nrFFE: "A12345",
    nomPrenom: "DUPONT Jean",
    nom: "DUPONT",
    prenom: "Jean",
    af: "A",
    elo: "1800",
    rapide: "1750",
    blitz: "1700",
    cat: "SenM",
    club: "Marseille-Echecs",
    idFFE: "11111",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.CRON_SECRET = SECRET;
    vi.stubEnv("NODE_ENV", "test");
  });

  it("handles PARTIAL sync result by saving acquired players and logging PARTIAL status without error 500", async () => {
    // Mock du scraper retournant un statut PARTIAL (ex: page 3 manquante)
    vi.spyOn(scraperService, "fetchAllClubMembers").mockResolvedValue({
      players: [mockPlayerA],
      totalPages: 3,
      pagesFetched: [1, 2],
      missingPages: [3],
      isPartial: true,
    });

    const upsertSpy = vi.spyOn(repositoryModule, "upsertPlayers").mockResolvedValue(1);
    const mockSyncLog: SyncLogRecord = {
      id: 1,
      clubCode: "U13095",
      status: "PARTIAL",
      playersSynced: 1,
      durationMs: 100,
      errorMessage: null,
      createdAt: new Date(),
    };
    const logSyncSpy = vi.spyOn(repositoryModule, "logSync").mockResolvedValue(mockSyncLog);

    const req = new NextRequest(`http://localhost:3000/api/cron/sync-club?secret=${SECRET}`, {
      method: "POST",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe("PARTIAL");
    expect(data.playersSynced).toBe(1);
    expect(data.totalPages).toBe(3);
    expect(data.missingPages).toEqual([3]);

    // Vérifie que les joueurs ont bien été sauvegardés malgré le statut partiel
    expect(upsertSpy).toHaveBeenCalledWith([mockPlayerA]);

    // Vérifie que la table sync_logs a bien consigné le statut PARTIAL
    expect(logSyncSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "PARTIAL",
        playersSynced: 1,
      })
    );
  });

  it("handles nominal SUCCESS result when all pages are acquired", async () => {
    vi.spyOn(scraperService, "fetchAllClubMembers").mockResolvedValue({
      players: [mockPlayerA],
      totalPages: 2,
      pagesFetched: [1, 2],
      missingPages: [],
      isPartial: false,
    });

    vi.spyOn(repositoryModule, "upsertPlayers").mockResolvedValue(1);
    const mockSuccessLog: SyncLogRecord = {
      id: 1,
      clubCode: "U13095",
      status: "SUCCESS",
      playersSynced: 1,
      durationMs: 100,
      errorMessage: null,
      createdAt: new Date(),
    };
    const logSyncSpy = vi.spyOn(repositoryModule, "logSync").mockResolvedValue(mockSuccessLog);

    const req = new NextRequest("http://localhost:3000/api/cron/sync-club", {
      method: "POST",
      headers: {
        authorization: `Bearer ${SECRET}`,
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe("SUCCESS");
    expect(data.missingPages).toEqual([]);

    expect(logSyncSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "SUCCESS",
        playersSynced: 1,
      })
    );
  });

  it("rejects unauthorized calls with 401 when neither CRON_SECRET nor session are provided", async () => {
    const req = new NextRequest("http://localhost:3000/api/cron/sync-club", {
      method: "POST",
      headers: {
        "x-test-unauthenticated": "true",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
