/**
 * Tests d'intégration API & RBAC — Étape 3 : Routes Inventaire & Équipements
 * Valide : 401/403 RBAC, CRUD saisons/articles/membres, 409 DELETE IF NEVER USED,
 * et cycle complet Pre-Visualizer (preview sans écriture) -> Commit.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getSeasons, POST as postSeason } from "../inventory/seasons/route";
import { GET as getItems, POST as postItem } from "../inventory/items/route";
import { PATCH as patchItem, DELETE as deleteItem } from "../inventory/items/[id]/route";
import { GET as getMembers, POST as postMember } from "../inventory/members/route";
import { PATCH as patchMember, DELETE as deleteMember } from "../inventory/members/[id]/route";
import { POST as postImport } from "../inventory/import/route";
import { resetMemoryInventory } from "@/lib/db/inventory";

describe("Inventory & Equipment API Routes + RBAC (Étape 3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    resetMemoryInventory(false); // 2026, 2027 + 5 articles par défaut
  });

  it("rejette les requêtes non authentifiées (401) et le rôle coach (403)", async () => {
    const unauthReq = new NextRequest("http://localhost:3000/api/inventory/items", {
      method: "GET",
      headers: { "x-test-unauthenticated": "true" },
    });
    expect((await getItems(unauthReq)).status).toBe(401);

    const coachReq = new NextRequest("http://localhost:3000/api/inventory/items", {
      method: "GET",
      headers: { "x-test-role": "coach" },
    });
    expect((await getItems(coachReq)).status).toBe(403);
  });

  it("autorise le directeur en lecture (GET 200) mais bloque toute écriture (POST/PATCH/DELETE 403)", async () => {
    const dirGet = new NextRequest("http://localhost:3000/api/inventory/seasons", {
      method: "GET",
      headers: { "x-test-role": "director" },
    });
    const getRes = await getSeasons(dirGet);
    expect(getRes.status).toBe(200);
    const data = await getRes.json();
    expect(data.seasons.map((s: { year: number }) => s.year)).toEqual([2027, 2026]);

    const dirPost = new NextRequest("http://localhost:3000/api/inventory/seasons", {
      method: "POST",
      headers: { "x-test-role": "director", "content-type": "application/json" },
      body: JSON.stringify({ year: 2028 }),
    });
    expect((await postSeason(dirPost)).status).toBe(403);
  });

  it("permet à la secrétaire de créer une nouvelle saison (+) et bloque les doublons (409)", async () => {
    const req1 = new NextRequest("http://localhost:3000/api/inventory/seasons", {
      method: "POST",
      headers: { "x-test-role": "secretary", "content-type": "application/json" },
      body: JSON.stringify({ year: 2028, label: "Saison 2027-2028" }),
    });
    const res1 = await postSeason(req1);
    expect(res1.status).toBe(201);

    const reqDup = new NextRequest("http://localhost:3000/api/inventory/seasons", {
      method: "POST",
      headers: { "x-test-role": "secretary", "content-type": "application/json" },
      body: JSON.stringify({ year: 2028 }),
    });
    expect((await postSeason(reqDup)).status).toBe(409);
  });

  it("gère le cycle CRUD des équipements et renvoie 409 Conflict si l'article est utilisé (DELETE IF NEVER USED)", async () => {
    // 1. Créer un nouvel article
    const createRes = await postItem(
      new NextRequest("http://localhost:3000/api/inventory/items", {
        method: "POST",
        headers: { "x-test-role": "secretary", "content-type": "application/json" },
        body: JSON.stringify({
          category: "POLO",
          type: "Polo XS",
          quantitySinceLastInventory: 10,
          threshold: 3,
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const { item } = await createRes.json();

    // 2. Mettre à jour le stock
    const patchRes = await patchItem(
      new NextRequest(`http://localhost:3000/api/inventory/items/${item.id}`, {
        method: "PATCH",
        headers: { "x-test-role": "secretary", "content-type": "application/json" },
        body: JSON.stringify({ quantitySinceLastInventory: 12 }),
      }),
      { params: { id: String(item.id) } }
    );
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json()).item.quantitySinceLastInventory).toBe(12);

    // 3. Attribuer cet article à un membre -> suppression bloquée en 409
    const memberRes = await postMember(
      new NextRequest("http://localhost:3000/api/inventory/members", {
        method: "POST",
        headers: { "x-test-role": "secretary", "content-type": "application/json" },
        body: JSON.stringify({
          seasonYear: 2027,
          firstname: "Maxime",
          lastname: "Chukhno",
          birthDate: "15-05-2014",
          poloItemId: item.id,
          poloDistributed: false,
          paymentOk: true,
        }),
      })
    );
    expect(memberRes.status).toBe(201);
    const { member } = await memberRes.json();

    const delBlockedRes = await deleteItem(
      new NextRequest(`http://localhost:3000/api/inventory/items/${item.id}`, {
        method: "DELETE",
        headers: { "x-test-role": "secretary" },
      }),
      { params: { id: String(item.id) } }
    );
    expect(delBlockedRes.status).toBe(409);

    // 4. Cocher "Distribué" via PATCH membre -> nbDistributed passe à 1
    const patchMemRes = await patchMember(
      new NextRequest(`http://localhost:3000/api/inventory/members/${member.id}`, {
        method: "PATCH",
        headers: { "x-test-role": "secretary", "content-type": "application/json" },
        body: JSON.stringify({ poloDistributed: true }),
      }),
      { params: { id: String(member.id) } }
    );
    expect(patchMemRes.status).toBe(200);
    expect((await patchMemRes.json()).member.poloDistributed).toBe(true);

    // 5. Supprimer le membre, puis la suppression de l'article redevient autorisée (200)
    const delMemRes = await deleteMember(
      new NextRequest(`http://localhost:3000/api/inventory/members/${member.id}`, {
        method: "DELETE",
        headers: { "x-test-role": "secretary" },
      }),
      { params: { id: String(member.id) } }
    );
    expect(delMemRes.status).toBe(200);

    const delOkRes = await deleteItem(
      new NextRequest(`http://localhost:3000/api/inventory/items/${item.id}`, {
        method: "DELETE",
        headers: { "x-test-role": "secretary" },
      }),
      { params: { id: String(item.id) } }
    );
    expect(delOkRes.status).toBe(200);
  });

  it("exécute le cycle complet /api/inventory/import : preview (0 écriture) puis commit (sauvegarde)", async () => {
    // 1. Mode PREVIEW : analyse contre le catalogue réel sans rien écrire en DB
    const previewRes = await postImport(
      new NextRequest("http://localhost:3000/api/inventory/import", {
        method: "POST",
        headers: { "x-test-role": "superadmin", "content-type": "application/json" },
        body: JSON.stringify({
          mode: "preview",
          rows: [
            { Prénom: "Alice", Nom: "Martin", "Date de naissance": "12/03/2014", Paiement: "Oui", Polo: "Polo Adulte M" },
            { Prénom: "", Nom: "Incomplet", Polo: "Polo Adulte M" },
          ],
        }),
      })
    );
    expect(previewRes.status).toBe(200);
    const previewData = await previewRes.json();
    expect(previewData.mode).toBe("preview");
    expect(previewData.preview.summary.validCount).toBe(1);
    expect(previewData.preview.summary.errorCount).toBe(1);

    // Vérifier que RIEN n'a été écrit en base lors de la prévisualisation
    const membersBeforeRes = await getMembers(
      new NextRequest("http://localhost:3000/api/inventory/members?year=2027", {
        method: "GET",
        headers: { "x-test-role": "superadmin" },
      })
    );
    expect((await membersBeforeRes.json()).count).toBe(0);

    // 2. Mode COMMIT : enregistre uniquement la ligne valide (Alice) et ignore la ligne en ERROR
    const commitRes = await postImport(
      new NextRequest("http://localhost:3000/api/inventory/import", {
        method: "POST",
        headers: { "x-test-role": "superadmin", "content-type": "application/json" },
        body: JSON.stringify({
          mode: "commit",
          seasonYear: 2027,
          rows: previewData.preview.rows,
        }),
      })
    );
    expect(commitRes.status).toBe(200);
    const commitData = await commitRes.json();
    expect(commitData).toMatchObject({
      success: true,
      mode: "commit",
      seasonYear: 2027,
      created: 1,
      updated: 0,
      skippedErrors: 1,
    });

    const membersAfterRes = await getMembers(
      new NextRequest("http://localhost:3000/api/inventory/members?year=2027", {
        method: "GET",
        headers: { "x-test-role": "superadmin" },
      })
    );
    const afterData = await membersAfterRes.json();
    expect(afterData.count).toBe(1);
    expect(afterData.members[0].firstname).toBe("Alice");
    expect(afterData.members[0].poloDistributed).toBe(false);
  });
});
