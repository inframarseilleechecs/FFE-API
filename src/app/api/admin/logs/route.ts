/**
 * Point d'accès d'audit et de consultation des logs système (/api/admin/logs)
 * Réservé exclusivement au rôle Superadmin (permission: system:logs).
 * Auteur : Sergey CHUKHNO
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/auth/session";
import { getSyncLogs } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authResult = await authenticateApi(request, "system:logs");
  if (authResult.errorResponse) {
    return authResult.errorResponse;
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  try {
    const logs = await getSyncLogs(Math.min(limit, 100));

    return NextResponse.json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Erreur récupération logs: ${message}` },
      { status: 500 }
    );
  }
}

