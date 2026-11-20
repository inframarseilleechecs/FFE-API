/**
 * API Membres & Distributions par Année (/api/inventory/members)
 * GET  : Liste les membres d'une année (?year=2027) (permission: inventory:view)
 * POST : Ajoute un membre sur une année (permission: inventory:manage)
 * Auteur : Sergey CHUKHNO
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/auth/session";
import {
  getEquipmentMembersByYear,
  createEquipmentMember,
  InventoryError,
} from "@/lib/db/inventory";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authResult = await authenticateApi(request, "inventory:view");
  if (authResult.errorResponse) return authResult.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear() + 1;

    if (Number.isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { success: false, error: "Paramètre year invalide." },
        { status: 400 }
      );
    }

    const members = await getEquipmentMembersByYear(year);
    return NextResponse.json({
      success: true,
      seasonYear: year,
      count: members.length,
      members,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Erreur récupération membres : ${msg}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authResult = await authenticateApi(request, "inventory:manage");
  if (authResult.errorResponse) return authResult.errorResponse;

  try {
    const body = await request.json();
    const seasonYear = Number(body?.seasonYear);
    if (!Number.isInteger(seasonYear) || seasonYear < 2000 || seasonYear > 2100) {
      return NextResponse.json(
        { success: false, error: "seasonYear invalide." },
        { status: 400 }
      );
    }

    const member = await createEquipmentMember({
      seasonYear,
      firstname: String(body?.firstname || ""),
      lastname: String(body?.lastname || ""),
      birthDate: typeof body?.birthDate === "string" ? body.birthDate : "",
      poloItemId: body?.poloItemId !== undefined && body?.poloItemId !== null ? Number(body.poloItemId) : null,
      poloDistributed: Boolean(body?.poloDistributed),
      vesteItemId: body?.vesteItemId !== undefined && body?.vesteItemId !== null ? Number(body.vesteItemId) : null,
      vesteDistributed: Boolean(body?.vesteDistributed),
      diversItemId: body?.diversItemId !== undefined && body?.diversItemId !== null ? Number(body.diversItemId) : null,
      diversDistributed: Boolean(body?.diversDistributed),
      paymentOk: Boolean(body?.paymentOk),
    });

    return NextResponse.json({ success: true, member }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof InventoryError) {
      return NextResponse.json(
        { success: false, code: err.code, error: err.message },
        { status: 400 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Erreur création membre : ${msg}` },
      { status: 500 }
    );
  }
}
