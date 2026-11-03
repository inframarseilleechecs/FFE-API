import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "../../../app/api/cron/sync-club/route";
import { NextRequest } from "next/server";
import * as scraperService from "../../scraper/service";
import { getLatestSyncLog, getPlayersCount, clearMemoryDb } from "../../db/repository";
import { Player } from "../../scraper/types";

describe("Cron 24h & Sync Club API Route (/api/cron/sync-club)", () => {
  const SECRET = "test-secret-token-123";

  beforeEach(() => {
    clearMemoryDb();
    vi.restoreAllMocks();
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("NODE_ENV", "production");
  });

  const mockPlayers: Player[] = [
    {
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
    },
    {
      nrFFE: "A99999",
      nomPrenom: "DUPONT Alice",
      nom: "DUPONT",
      prenom: "Alice",
      af: "A",
      elo: "1620",
      rapide: "1600",
      blitz: "1580",
      cat: "BenF",
      club: "Marseille-Echecs",
      idFFE: "99999",
      statut: "ACTIF",
    },
  ];

  it("rejects unauthorized calls with HTTP 401 when token is missing or invalid", async () => {
    // 1. Appel sans aucun token
    const reqNoAuth = new NextRequest("http://localhost:3000/api/cron/sync-club");
    const resNoAuth = await GET(reqNoAuth);
    const dataNoAuth = await resNoAuth.json();

    expect(resNoAuth.status).toBe(401);
    expect(dataNoAuth.success).toBe(false);
    expect(dataNoAuth.reason).toContain("AUTH_ERROR");

    // 2. Appel avec mauvais token
    const reqBadAuth = new NextRequest("http://localhost:3000/api/cron/sync-club", {
      headers: { authorization: "Bearer wrong-token" },
    });
    const resBadAuth = await GET(reqBadAuth);
    expect(resBadAuth.status).toBe(401);
  });

  it("successfully synchronizes club members and records SUCCESS log with Bearer token", async () => {
    vi.spyOn(scraperService, "fetchAllClubMembers").mockResolvedValue({
      players: mockPlayers,
      totalPages: 1,
      pagesFetched: [1],
      missingPages: [],
      isPartial: false,
    });

    const req = new NextRequest("http://localhost:3000/api/cron/sync-club?club=N06013", {
      headers: { authorization: `Bearer ${SECRET}` },
    });

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toBe("SUCCESS");
    expect(data.playersSynced).toBe(2);
    expect(data.clubCode).toBe("N06013");
    expect(data.durationMs).toBeGreaterThanOrEqual(0);

    // Vérification de la persistance en base
    expect(await getPlayersCount()).toBe(2);

    // Vérification du log de synchronisation
    const latestLog = await getLatestSyncLog();
    expect(latestLog).not.toBeNull();
    expect(latestLog?.status).toBe("SUCCESS");
    expect(latestLog?.playersSynced).toBe(2);
    expect(latestLog?.errorMessage).toBeNull();
  });

  it("supports manual trigger via POST with ?secret= parameter", async () => {
    vi.spyOn(scraperService, "fetchAllClubMembers").mockResolvedValue({
      players: mockPlayers,
      totalPages: 1,
      pagesFetched: [1],
      missingPages: [],
      isPartial: false,
    });

    const req = new NextRequest(`http://localhost:3000/api/cron/sync-club?secret=${SECRET}`, {
      method: "POST",
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toBe("SUCCESS");
    expect(data.playersSynced).toBe(2);
  });

  it("captures and categorizes error with explicit REASON when FFE times out", async () => {
    // Simulation d'une coupure / timeout du site fédéral
    vi.spyOn(scraperService, "fetchAllClubMembers").mockRejectedValue(
      new Error("Connection timeout after 12000ms on echecs.asso.fr")
    );

    const req = new NextRequest("http://localhost:3000/api/cron/sync-club", {
      headers: { authorization: `Bearer ${SECRET}` },
    });

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.status).toBe("FAILED");
    expect(data.reason).toContain("FFE_TIMEOUT");

    // Vérification que le log consigne la raison explicite
    const latestLog = await getLatestSyncLog();
    expect(latestLog).not.toBeNull();
    expect(latestLog?.status).toBe("FAILED");
    expect(latestLog?.playersSynced).toBe(0);
    expect(latestLog?.errorMessage).toContain("REASON: FFE_TIMEOUT");
  });
});
