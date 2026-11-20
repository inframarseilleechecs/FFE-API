/**
 * API Membre d'Inventaire unitaire (/api/inventory/members/[id])
 * PATCH  : Édite un membre, ses menus déroulants Polo/Veste/Divers, ses coches Distribué et Paiement OK
 * DELETE : Supprime un membre (permission: inventory:manage)
 *
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/auth/session";
import {
  updateEquipmentMember,
  deleteEquipmentMember,
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
    return NextResponse.json(
      { success: false, error: "Identifiant de membre invalide." },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const updated = await updateEquipmentMember(id, {
      firstname: body?.firstname !== undefined ? String(body.firstname) : undefined,
      lastname: body?.lastname !== undefined ? String(body.lastname) : undefined,
      birthDate: body?.birthDate !== undefined ? String(body.birthDate) : undefined,
      poloItemId:
        body?.poloItemId !== undefined
          ? body.poloItemId === null || body.poloItemId === ""
            ? null
            : Number(body.poloItemId)
          : undefined,
      poloDistributed:
        body?.poloDistributed !== undefined ? Boolean(body.poloDistributed) : undefined,
      vesteItemId:
        body?.vesteItemId !== undefined
          ? body.vesteItemId === null || body.vesteItemId === ""
            ? null
            : Number(body.vesteItemId)
          : undefined,
      vesteDistributed:
        body?.vesteDistributed !== undefined ? Boolean(body.vesteDistributed) : undefined,
      diversItemId:
        body?.diversItemId !== undefined
          ? body.diversItemId === null || body.diversItemId === ""
            ? null
            : Number(body.diversItemId)
          : undefined,
      diversDistributed:
        body?.diversDistributed !== undefined ? Boolean(body.diversDistributed) : undefined,
      paymentOk: body?.paymentOk !== undefined ? Boolean(body.paymentOk) : undefined,
    });

    if (!updated) {
      return NextResponse.json({ success: false, error: "Membre introuvable." }, { status: 404 });
    }

    return NextResponse.json({ success: true, member: updated });
  } catch (err: unknown) {
    if (err instanceof InventoryError) {
      return NextResponse.json(
        { success: false, code: err.code, error: err.message },
        { status: 400 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Erreur mise à jour membre : ${msg}` },
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
    return NextResponse.json(
      { success: false, error: "Identifiant de membre invalide." },
      { status: 400 }
    );
  }

  try {
    const deleted = await deleteEquipmentMember(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Membre introuvable." }, { status: 404 });
    }
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Erreur suppression membre : ${msg}` },
      { status: 500 }
    );
  }
}
