/**
 * API Catalogue Équipements (/api/inventory/items)
 * GET  : Liste les équipements (filtrable par ?category=POLO|VESTE|DIVERS) avec nbDistributed & alertes
 * POST : Ajoute un nouvel équipement (permission: inventory:manage)
 * Auteur : Sergey CHUKHNO
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/auth/session";
import {
  getAllEquipmentItems,
  createEquipmentItem,
  EQUIPMENT_CATEGORIES,
  InventoryError,
} from "@/lib/db/inventory";
import { EquipmentCategory } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authResult = await authenticateApi(request, "inventory:view");
  if (authResult.errorResponse) return authResult.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const rawCat = searchParams.get("category")?.toUpperCase();

    if (rawCat && !EQUIPMENT_CATEGORIES.includes(rawCat as EquipmentCategory)) {
      return NextResponse.json(
        { success: false, error: "Catégorie invalide (POLO, VESTE ou DIVERS attendue)." },
        { status: 400 }
      );
    }

    const items = await getAllEquipmentItems(rawCat as EquipmentCategory | undefined);
    const lowStockCount = items.filter((i) => i.isLowStock).length;

    return NextResponse.json({
      success: true,
      count: items.length,
      lowStockCount,
      items,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Erreur récupération équipements : ${msg}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authResult = await authenticateApi(request, "inventory:manage");
  if (authResult.errorResponse) return authResult.errorResponse;

  try {
    const body = await request.json();
    const category = String(body?.category || "").toUpperCase() as EquipmentCategory;
    const type = String(body?.type || "");
    const quantitySinceLastInventory = Number(body?.quantitySinceLastInventory ?? 0);
    const threshold = body?.threshold !== undefined ? Number(body.threshold) : 5;

    if (Number.isNaN(quantitySinceLastInventory) || Number.isNaN(threshold)) {
      return NextResponse.json(
        { success: false, error: "Les quantités et seuils doivent être numériques." },
        { status: 400 }
      );
    }

    const item = await createEquipmentItem({
      category,
      type,
      quantitySinceLastInventory,
      threshold,
    });

    return NextResponse.json({ success: true, item }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof InventoryError) {
      const status = err.code === "DUPLICATE_ITEM" ? 409 : 400;
      return NextResponse.json(
        { success: false, code: err.code, error: err.message },
        { status }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Erreur création équipement : ${msg}` },
      { status: 500 }
    );
  }
}
