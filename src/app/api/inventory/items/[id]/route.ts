/**
 * API Article d'Équipement unitaire (/api/inventory/items/[id])
 * PATCH  : Modifie type, stock depuis dernier inventaire ou seuil (permission: inventory:manage)
 * DELETE : Supprime l'article UNIQUEMENT s'il n'a jamais été utilisé (409 Conflict sinon)
 * Auteur : Sergey CHUKHNO
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/auth/session";
import {
  updateEquipmentItem,
  deleteEquipmentItem,
  InventoryError,
} from "@/lib/db/inventory";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const authResult = await authenticateApi(request, "inventory:manage");
  if (authResult.errorResponse) return authResult.errorResponse;

  const id = parseInt(context.params.id, 10);
  if (Number.isNaN(id) || id <= 0) {
    return NextResponse.json({ success: false, error: "Identifiant d'article invalide." }, { status: 400 });
  }

  try {
    const body = await request.json();
    const updated = await updateEquipmentItem(id, {
      type: body?.type !== undefined ? String(body.type) : undefined,
      quantitySinceLastInventory:
        body?.quantitySinceLastInventory !== undefined
          ? Number(body.quantitySinceLastInventory)
          : undefined,
      threshold: body?.threshold !== undefined ? Number(body.threshold) : undefined,
      resetLastInventoryAt: Boolean(body?.resetLastInventoryAt),
    });

    if (!updated) {
      return NextResponse.json({ success: false, error: "Article introuvable." }, { status: 404 });
    }

    return NextResponse.json({ success: true, item: updated });
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
      { success: false, error: `Erreur mise à jour équipement : ${msg}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const authResult = await authenticateApi(request, "inventory:manage");
  if (authResult.errorResponse) return authResult.errorResponse;

  const id = parseInt(context.params.id, 10);
  if (Number.isNaN(id) || id <= 0) {
    return NextResponse.json({ success: false, error: "Identifiant d'article invalide." }, { status: 400 });
  }

  try {
    const deleted = await deleteEquipmentItem(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Article introuvable." }, { status: 404 });
    }
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: unknown) {
    if (err instanceof InventoryError && err.code === "ITEM_IN_USE") {
      return NextResponse.json(
        { success: false, code: err.code, error: err.message },
        { status: 409 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Erreur suppression équipement : ${msg}` },
      { status: 500 }
    );
  }
}
