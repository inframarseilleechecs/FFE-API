/**
 * API Import Excel & Prévisualiseur Inventaire (/api/inventory/import)
 * POST (permission: inventory:manage) :
 *  - mode = "preview" : analyse un fichier (.xlsx/.csv via FormData) ou des lignes JSON
 *                       contre le catalogue réel SANS écrire en base -> retourne InventoryImportPreview.
 *  - mode = "commit"  : enregistre en lot (bulkUpsertEquipmentMembers) les lignes valides/confirmées
 *                       pour la saison donnée -> retourne { created, updated, skippedErrors }.
 * Auteur : Sergey CHUKHNO
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/auth/session";
import {
  getAllEquipmentItems,
  bulkUpsertEquipmentMembers,
  CreateEquipmentMemberInput,
} from "@/lib/db/inventory";
import {
  parseInventoryExcelBuffer,
  parseInventoryRows,
  InventoryPreviewRow,
} from "@/lib/parser/inventory_excel";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authResult = await authenticateApi(request, "inventory:manage");
  if (authResult.errorResponse) return authResult.errorResponse;

  try {
    const contentType = request.headers.get("content-type") || "";
    const catalogItems = await getAllEquipmentItems();

    // Cas 1 : Upload de fichier binaire (.xlsx / .csv) via multipart/form-data
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const mode = String(formData.get("mode") || "preview").toLowerCase();
      const yearParam = formData.get("seasonYear");
      const seasonYear = yearParam ? Number(yearParam) : NaN;

      if (!file || !(file instanceof Blob)) {
        return NextResponse.json(
          { success: false, error: "Aucun fichier Excel/CSV fourni (champ 'file')." },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const preview = parseInventoryExcelBuffer(Buffer.from(arrayBuffer), catalogItems);

      if (mode === "preview") {
        return NextResponse.json({
          success: true,
          mode: "preview",
          preview,
        });
      }

      if (mode === "commit") {
        if (!Number.isInteger(seasonYear) || seasonYear < 2000 || seasonYear > 2100) {
          return NextResponse.json(
            { success: false, error: "seasonYear valide obligatoire pour confirmer l'import." },
            { status: 400 }
          );
        }

        const importable = preview.rows.filter((r) => r.status !== "ERROR");
        const toInsert: Omit<CreateEquipmentMemberInput, "seasonYear">[] = importable.map((r) => ({
          firstname: r.firstname,
          lastname: r.lastname,
          birthDate: r.birthDate,
          poloItemId: r.poloItemId,
          poloDistributed: r.poloDistributed,
          vesteItemId: r.vesteItemId,
          vesteDistributed: r.vesteDistributed,
          diversItemId: r.diversItemId,
          diversDistributed: r.diversDistributed,
          paymentOk: r.paymentOk,
        }));

        const result = await bulkUpsertEquipmentMembers(seasonYear, toInsert);
        return NextResponse.json({
          success: true,
          mode: "commit",
          seasonYear,
          created: result.created,
          updated: result.updated,
          skippedErrors: preview.summary.errorCount,
        });
      }

      return NextResponse.json(
        { success: false, error: `Mode invalide : "${mode}" (attendu : preview ou commit).` },
        { status: 400 }
      );
    }

    // Cas 2 : Requête JSON (lignes brutes pour preview, ou lignes déjà prévisualisées pour commit)
    const body = await request.json();
    const mode = String(body?.mode || "preview").toLowerCase();

    if (mode === "preview") {
      if (!Array.isArray(body?.rows)) {
        return NextResponse.json(
          { success: false, error: "Le champ 'rows' (tableau) est requis en mode preview JSON." },
          { status: 400 }
        );
      }
      const preview = parseInventoryRows(body.rows, catalogItems);
      return NextResponse.json({
        success: true,
        mode: "preview",
        preview,
      });
    }

    if (mode === "commit") {
      const seasonYear = Number(body?.seasonYear);
      if (!Number.isInteger(seasonYear) || seasonYear < 2000 || seasonYear > 2100) {
        return NextResponse.json(
          { success: false, error: "seasonYear valide obligatoire pour confirmer l'import." },
          { status: 400 }
        );
      }

      if (!Array.isArray(body?.rows)) {
        return NextResponse.json(
          { success: false, error: "Le champ 'rows' (tableau) est requis en mode commit." },
          { status: 400 }
        );
      }

      const incomingRows = body.rows as Partial<InventoryPreviewRow>[];
      const validRows = incomingRows.filter(
        (r) => r.status !== "ERROR" && Boolean(r.firstname?.trim()) && Boolean(r.lastname?.trim())
      );
      const skippedErrors = incomingRows.length - validRows.length;

      const toInsert: Omit<CreateEquipmentMemberInput, "seasonYear">[] = validRows.map((r) => ({
        firstname: String(r.firstname),
        lastname: String(r.lastname),
        birthDate: String(r.birthDate || ""),
        poloItemId: r.poloItemId ?? null,
        poloDistributed: Boolean(r.poloDistributed),
        vesteItemId: r.vesteItemId ?? null,
        vesteDistributed: Boolean(r.vesteDistributed),
        diversItemId: r.diversItemId ?? null,
        diversDistributed: Boolean(r.diversDistributed),
        paymentOk: Boolean(r.paymentOk),
      }));

      const result = await bulkUpsertEquipmentMembers(seasonYear, toInsert);

      return NextResponse.json({
        success: true,
        mode: "commit",
        seasonYear,
        created: result.created,
        updated: result.updated,
        skippedErrors,
      });
    }

    return NextResponse.json(
      { success: false, error: `Mode invalide : "${mode}" (attendu : preview ou commit).` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Erreur import inventaire : ${msg}` },
      { status: 500 }
    );
  }
}
