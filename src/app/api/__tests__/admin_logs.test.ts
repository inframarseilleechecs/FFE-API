import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as adminLogsHandler } from "../admin/logs/route";
import { NextRequest } from "next/server";
import * as repositoryModule from "@/lib/db/repository";
import { SyncLogRecord } from "@/lib/db/schema";

describe("GET /api/admin/logs - RBAC Protection & Audit Access", () => {
  const mockLogs: SyncLogRecord[] = [
    {
      id: 1,
      clubCode: "U13095",
      status: "SUCCESS",
      playersSynced: 1630,
      durationMs: 7500,
      errorMessage: null,
      createdAt: new Date("2026-11-03T03:00:00Z"),
    },
    {
      id: 2,
      clubCode: "U13095",
      status: "PARTIAL",
      playersSynced: 1530,
      durationMs: 14200,
      errorMessage: "Synchronisation partielle : 1530 joueurs sauvegardés sur 17 pages (pages en timeout: [12])",
      createdAt: new Date("2026-11-02T03:00:00Z"),
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("NODE_ENV", "test");
  });

  it("rejects unauthenticated requests with 401 Unauthorized", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/logs", {
      method: "GET",
      headers: {
        "x-test-unauthenticated": "true",
      },
    });

    const res = await adminLogsHandler(req);
    expect(res.status).toBe(401);
  });

  it("rejects non-superadmin roles (director, coach, secretary) with 403 Forbidden", async () => {
    const roles = ["director", "coach", "secretary"];

    for (const role of roles) {
      const req = new NextRequest("http://localhost:3000/api/admin/logs", {
        method: "GET",
        headers: {
          "x-test-role": role,
        },
      });

      const res = await adminLogsHandler(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Accès refusé");
    }
  });

  it("allows superadmin to retrieve system sync logs with HTTP 200", async () => {
    vi.spyOn(repositoryModule, "getSyncLogs").mockResolvedValue(mockLogs);

    const req = new NextRequest("http://localhost:3000/api/admin/logs?limit=10", {
      method: "GET",
      headers: {
        "x-test-role": "superadmin",
      },
    });

    const res = await adminLogsHandler(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(2);
    expect(data.logs).toHaveLength(2);
    expect(data.logs[0].status).toBe("SUCCESS");
    expect(data.logs[1].status).toBe("PARTIAL");
    expect(data.logs[1].errorMessage).toContain("pages en timeout: [12]");
  });
});
