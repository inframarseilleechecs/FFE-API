/**
 * API Saisons / Années d'Inventaire (/api/inventory/seasons)
 * GET  : Liste les saisons disponibles (permission: inventory:view)
 * POST : Crée une nouvelle saison via le bouton "+" (permission: inventory:manage)
 * Auteur : Sergey CHUKHNO
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/auth/session";
import {
  getInventorySeasons,
  createInventorySeason,
  InventoryError,
} from "@/lib/db/inventory";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authResult = await authenticateApi(request, "inventory:view");
  if (authResult.errorResponse) return authResult.errorResponse;

  try {
    const seasons = await getInventorySeasons();
    return NextResponse.json({ success: true, count: seasons.length, seasons });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Erreur récupération saisons : ${msg}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authResult = await authenticateApi(request, "inventory:manage");
  if (authResult.errorResponse) return authResult.errorResponse;

  try {
    const body = await request.json();
    const year = Number(body?.year);
    const label = typeof body?.label === "string" ? body.label : undefined;

    const season = await createInventorySeason(year, label);
    return NextResponse.json({ success: true, season }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof InventoryError) {
      const status =
        err.code === "SEASON_EXISTS" ? 409 : err.code === "INVALID_INPUT" ? 400 : 400;
      return NextResponse.json(
        { success: false, code: err.code, error: err.message },
        { status }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Erreur création saison : ${msg}` },
      { status: 500 }
    );
  }
}
