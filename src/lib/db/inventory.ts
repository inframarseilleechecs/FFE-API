/**
 * Dépôt de données pour le module Inventaire & Équipements (Saisons, Polo/Veste/Divers, Membres)
 * Avec adaptateur de repli en mémoire pour tests isolés et CI.
 * Auteur : Sergey CHUKHNO
 */

import { getDbPool } from "./client";
import {
  EquipmentCategory,
  EquipmentItemRecord,
  EquipmentMemberRecord,
  InventorySeasonRecord,
} from "./schema";

export const EQUIPMENT_CATEGORIES: readonly EquipmentCategory[] = [
  "POLO",
  "VESTE",
  "DIVERS",
] as const;

export class InventoryError extends Error {
  code: "ITEM_IN_USE" | "DUPLICATE_ITEM" | "SEASON_EXISTS" | "NOT_FOUND" | "INVALID_INPUT";

  constructor(
    code: "ITEM_IN_USE" | "DUPLICATE_ITEM" | "SEASON_EXISTS" | "NOT_FOUND" | "INVALID_INPUT",
    message: string
  ) {
    super(message);
    this.name = "InventoryError";
    this.code = code;
  }
}

// --- État en mémoire (fallback pour CI & tests unitaires sans PostgreSQL) ---

interface MemoryEquipmentItem {
  id: number;
  category: EquipmentCategory;
  type: string;
  quantitySinceLastInventory: number;
  threshold: number;
  lastInventoryAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

let memorySeasons: InventorySeasonRecord[] = [];
let memoryItems: MemoryEquipmentItem[] = [];
let memoryMembers: EquipmentMemberRecord[] = [];
let nextItemId = 1;
let nextMemberId = 1;

function seedDefaultMemoryState(): void {
  const now = new Date();
  memorySeasons = [
    { year: 2026, label: "Saison 2025-2026", createdAt: now },
    { year: 2027, label: "Saison 2026-2027", createdAt: now },
  ];
  memoryItems = [
    {
      id: 1,
      category: "POLO",
      type: "Polo Enfant 10 ans",
      quantitySinceLastInventory: 20,
      threshold: 5,
      lastInventoryAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      category: "POLO",
      type: "Polo Adulte M",
      quantitySinceLastInventory: 15,
      threshold: 5,
      lastInventoryAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 3,
      category: "VESTE",
      type: "Veste Club M",
      quantitySinceLastInventory: 10,
      threshold: 3,
      lastInventoryAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 4,
      category: "VESTE",
      type: "Veste Club L",
      quantitySinceLastInventory: 3, // En alerte stock bas (3 <= 4)
      threshold: 4,
      lastInventoryAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 5,
      category: "DIVERS",
      type: "Sac Marseille-Échecs",
      quantitySinceLastInventory: 25,
      threshold: 5,
      lastInventoryAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ];
  memoryMembers = [];
  nextItemId = 6;
  nextMemberId = 1;
}

seedDefaultMemoryState();

export function resetMemoryInventory(empty = false): void {
  if (empty) {
    memorySeasons = [];
    memoryItems = [];
    memoryMembers = [];
    nextItemId = 1;
    nextMemberId = 1;
  } else {
    seedDefaultMemoryState();
  }
}

function hydrateMemoryItem(item: MemoryEquipmentItem): EquipmentItemRecord {
  let nbDistributed = 0;
  let usageCount = 0;

  for (const m of memoryMembers) {
    if (m.poloItemId === item.id) {
      usageCount++;
      if (m.poloDistributed) nbDistributed++;
    }
    if (m.vesteItemId === item.id) {
      usageCount++;
      if (m.vesteDistributed) nbDistributed++;
    }
    if (m.diversItemId === item.id) {
      usageCount++;
      if (m.diversDistributed) nbDistributed++;
    }
  }

  const stockRemaining = item.quantitySinceLastInventory - nbDistributed;

  return {
    id: item.id,
    category: item.category,
    type: item.type,
    quantitySinceLastInventory: item.quantitySinceLastInventory,
    nbDistributed,
    stockRemaining,
    threshold: item.threshold,
    isLowStock: stockRemaining <= item.threshold,
    usageCount,
    canDelete: usageCount === 0,
    lastInventoryAt: item.lastInventoryAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapSqlItemRow(r: Record<string, unknown>): EquipmentItemRecord {
  const quantitySinceLastInventory = Number(r.quantity_since_last_inventory ?? 0);
  const nbDistributed = Number(r.nb_distributed ?? 0);
  const usageCount = Number(r.usage_count ?? 0);
  const threshold = Number(r.threshold ?? 0);
  const stockRemaining = quantitySinceLastInventory - nbDistributed;

  return {
    id: Number(r.id),
    category: r.category as EquipmentCategory,
    type: String(r.type),
    quantitySinceLastInventory,
    nbDistributed,
    stockRemaining,
    threshold,
    isLowStock: stockRemaining <= threshold,
    usageCount,
    canDelete: usageCount === 0,
    lastInventoryAt: r.last_inventory_at as Date,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  };
}

function mapSqlMemberRow(r: Record<string, unknown>): EquipmentMemberRecord {
  return {
    id: Number(r.id),
    seasonYear: Number(r.season_year),
    firstname: String(r.firstname),
    lastname: String(r.lastname),
    birthDate: String(r.birth_date || ""),
    poloItemId: r.polo_item_id !== null && r.polo_item_id !== undefined ? Number(r.polo_item_id) : null,
    poloDistributed: Boolean(r.polo_distributed),
    vesteItemId: r.veste_item_id !== null && r.veste_item_id !== undefined ? Number(r.veste_item_id) : null,
    vesteDistributed: Boolean(r.veste_distributed),
    diversItemId: r.divers_item_id !== null && r.divers_item_id !== undefined ? Number(r.divers_item_id) : null,
    diversDistributed: Boolean(r.divers_distributed),
    paymentOk: Boolean(r.payment_ok),
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  };
}

// ============================================================================
// 1. SAISONS / ANNÉES D'INVENTAIRE
// ============================================================================

export async function getInventorySeasons(): Promise<InventorySeasonRecord[]> {
  const pool = getDbPool();
  if (!pool) {
    return [...memorySeasons].sort((a, b) => b.year - a.year);
  }

  const res = await pool.query(
    `SELECT year, label, created_at FROM inventory_seasons ORDER BY year DESC;`
  );

  return res.rows.map((r) => ({
    year: Number(r.year),
    label: String(r.label),
    createdAt: r.created_at as Date,
  }));
}

export async function createInventorySeason(
  year: number,
  label?: string
): Promise<InventorySeasonRecord> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new InventoryError("INVALID_INPUT", "Année invalide (attendue entre 2000 et 2100).");
  }

  const cleanLabel = (label || `Saison ${year - 1}-${year}`).trim();
  const pool = getDbPool();

  if (!pool) {
    if (memorySeasons.some((s) => s.year === year)) {
      throw new InventoryError("SEASON_EXISTS", `L'année ${year} existe déjà.`);
    }
    const season: InventorySeasonRecord = {
      year,
      label: cleanLabel,
      createdAt: new Date(),
    };
    memorySeasons.push(season);
    return season;
  }

  try {
    const res = await pool.query(
      `INSERT INTO inventory_seasons (year, label)
       VALUES ($1, $2)
       RETURNING year, label, created_at;`,
      [year, cleanLabel]
    );
    const r = res.rows[0];
    return {
      year: Number(r.year),
      label: String(r.label),
      createdAt: r.created_at as Date,
    };
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "23505") {
      throw new InventoryError("SEASON_EXISTS", `L'année ${year} existe déjà.`);
    }
    throw err;
  }
}

// ============================================================================
// 2. CATALOGUE D'ÉQUIPEMENTS (POLO, VESTE, DIVERS)
// ============================================================================

const SELECT_ITEMS_WITH_STATS_SQL = `
  SELECT
    i.id,
    i.category,
    i.type,
    i.quantity_since_last_inventory,
    i.threshold,
    i.last_inventory_at,
    i.created_at,
    i.updated_at,
    (
      SELECT COUNT(*)::int FROM equipment_members m
      WHERE (m.polo_item_id = i.id AND m.polo_distributed = TRUE)
         OR (m.veste_item_id = i.id AND m.veste_distributed = TRUE)
         OR (m.divers_item_id = i.id AND m.divers_distributed = TRUE)
    ) AS nb_distributed,
    (
      SELECT COUNT(*)::int FROM equipment_members m
      WHERE m.polo_item_id = i.id
         OR m.veste_item_id = i.id
         OR m.divers_item_id = i.id
    ) AS usage_count
  FROM equipment_items i
`;

export async function getAllEquipmentItems(
  category?: EquipmentCategory
): Promise<EquipmentItemRecord[]> {
  const pool = getDbPool();
  if (!pool) {
    const filtered = category
      ? memoryItems.filter((i) => i.category === category)
      : memoryItems;
    return filtered
      .map(hydrateMemoryItem)
      .sort((a, b) => a.category.localeCompare(b.category) || a.type.localeCompare(b.type));
  }

  const res = category
    ? await pool.query(
        `${SELECT_ITEMS_WITH_STATS_SQL} WHERE i.category = $1 ORDER BY i.type ASC;`,
        [category]
      )
    : await pool.query(
        `${SELECT_ITEMS_WITH_STATS_SQL} ORDER BY i.category ASC, i.type ASC;`
      );

  return res.rows.map(mapSqlItemRow);
}

export async function getEquipmentItemById(id: number): Promise<EquipmentItemRecord | null> {
  const pool = getDbPool();
  if (!pool) {
    const found = memoryItems.find((i) => i.id === id);
    return found ? hydrateMemoryItem(found) : null;
  }

  const res = await pool.query(`${SELECT_ITEMS_WITH_STATS_SQL} WHERE i.id = $1;`, [id]);
  if (res.rows.length === 0) return null;
  return mapSqlItemRow(res.rows[0]);
}

export async function createEquipmentItem(data: {
  category: EquipmentCategory;
  type: string;
  quantitySinceLastInventory: number;
  threshold?: number;
}): Promise<EquipmentItemRecord> {
  const cleanType = data.type.trim();
  if (!EQUIPMENT_CATEGORIES.includes(data.category)) {
    throw new InventoryError("INVALID_INPUT", "Catégorie invalide (POLO, VESTE ou DIVERS).");
  }
  if (!cleanType) {
    throw new InventoryError("INVALID_INPUT", "Le type/nom de l'article est obligatoire.");
  }

  const quantity = Math.max(0, Math.floor(data.quantitySinceLastInventory));
  const threshold = Math.max(0, Math.floor(data.threshold ?? 5));
  const pool = getDbPool();

  if (!pool) {
    const duplicate = memoryItems.some(
      (i) => i.category === data.category && i.type.toLowerCase() === cleanType.toLowerCase()
    );
    if (duplicate) {
      throw new InventoryError(
        "DUPLICATE_ITEM",
        `L'article "${cleanType}" existe déjà dans la catégorie ${data.category}.`
      );
    }
    const now = new Date();
    const item: MemoryEquipmentItem = {
      id: nextItemId++,
      category: data.category,
      type: cleanType,
      quantitySinceLastInventory: quantity,
      threshold,
      lastInventoryAt: now,
      createdAt: now,
      updatedAt: now,
    };
    memoryItems.push(item);
    return hydrateMemoryItem(item);
  }

  try {
    const res = await pool.query(
      `INSERT INTO equipment_items (category, type, quantity_since_last_inventory, threshold)
       VALUES ($1, $2, $3, $4)
       RETURNING id;`,
      [data.category, cleanType, quantity, threshold]
    );
    const created = await getEquipmentItemById(Number(res.rows[0].id));
    if (!created) throw new Error("Échec de relecture après création d'article.");
    return created;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "23505") {
      throw new InventoryError(
        "DUPLICATE_ITEM",
        `L'article "${cleanType}" existe déjà dans la catégorie ${data.category}.`
      );
    }
    throw err;
  }
}

export async function updateEquipmentItem(
  id: number,
  data: {
    type?: string;
    quantitySinceLastInventory?: number;
    threshold?: number;
    resetLastInventoryAt?: boolean;
  }
): Promise<EquipmentItemRecord | null> {
  const pool = getDbPool();

  if (!pool) {
    const item = memoryItems.find((i) => i.id === id);
    if (!item) return null;

    if (data.type !== undefined) {
      const cleanType = data.type.trim();
      if (!cleanType) {
        throw new InventoryError("INVALID_INPUT", "Le type/nom de l'article ne peut pas être vide.");
      }
      const duplicate = memoryItems.some(
        (i) => i.id !== id && i.category === item.category && i.type.toLowerCase() === cleanType.toLowerCase()
      );
      if (duplicate) {
        throw new InventoryError("DUPLICATE_ITEM", `L'article "${cleanType}" existe déjà.`);
      }
      item.type = cleanType;
    }
    if (data.quantitySinceLastInventory !== undefined) {
      item.quantitySinceLastInventory = Math.max(0, Math.floor(data.quantitySinceLastInventory));
    }
    if (data.threshold !== undefined) {
      item.threshold = Math.max(0, Math.floor(data.threshold));
    }
    if (data.resetLastInventoryAt) {
      item.lastInventoryAt = new Date();
    }
    item.updatedAt = new Date();
    return hydrateMemoryItem(item);
  }

  const existing = await getEquipmentItemById(id);
  if (!existing) return null;

  const nextType = data.type !== undefined ? data.type.trim() : existing.type;
  if (!nextType) {
    throw new InventoryError("INVALID_INPUT", "Le type/nom de l'article ne peut pas être vide.");
  }
  const nextQty =
    data.quantitySinceLastInventory !== undefined
      ? Math.max(0, Math.floor(data.quantitySinceLastInventory))
      : existing.quantitySinceLastInventory;
  const nextThreshold =
    data.threshold !== undefined
      ? Math.max(0, Math.floor(data.threshold))
      : existing.threshold;

  try {
    await pool.query(
      `UPDATE equipment_items
       SET type = $1,
           quantity_since_last_inventory = $2,
           threshold = $3,
           last_inventory_at = CASE WHEN $4 THEN NOW() ELSE last_inventory_at END,
           updated_at = NOW()
       WHERE id = $5;`,
      [nextType, nextQty, nextThreshold, Boolean(data.resetLastInventoryAt), id]
    );
    return getEquipmentItemById(id);
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "23505") {
      throw new InventoryError("DUPLICATE_ITEM", `L'article "${nextType}" existe déjà.`);
    }
    throw err;
  }
}

/**
 * Supprime un article UNIQUEMENT s'il n'a jamais été utilisé par un membre
 * (règle métier : DELETE ITEM IF NEVER USED).
 */
export async function deleteEquipmentItem(id: number): Promise<boolean> {
  const item = await getEquipmentItemById(id);
  if (!item) return false;

  if (!item.canDelete || item.usageCount > 0) {
    throw new InventoryError(
      "ITEM_IN_USE",
      `Impossible de supprimer "${item.type}" : cet article est référencé par ${item.usageCount} fiche(s) membre.`
    );
  }

  const pool = getDbPool();
  if (!pool) {
    const idx = memoryItems.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    memoryItems.splice(idx, 1);
    return true;
  }

  try {
    const res = await pool.query(`DELETE FROM equipment_items WHERE id = $1;`, [id]);
    return (res.rowCount ?? 0) > 0;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "23503") {
      throw new InventoryError(
        "ITEM_IN_USE",
        `Impossible de supprimer "${item.type}" : cet article est déjà utilisé.`
      );
    }
    throw err;
  }
}

export async function getLowStockEquipmentAlerts(): Promise<EquipmentItemRecord[]> {
  const items = await getAllEquipmentItems();
  return items.filter((i) => i.isLowStock);
}

// ============================================================================
// 3. MEMBRES & DISTRIBUTIONS PAR ANNÉE
// ============================================================================

export interface CreateEquipmentMemberInput {
  seasonYear: number;
  firstname: string;
  lastname: string;
  birthDate?: string;
  poloItemId?: number | null;
  poloDistributed?: boolean;
  vesteItemId?: number | null;
  vesteDistributed?: boolean;
  diversItemId?: number | null;
  diversDistributed?: boolean;
  paymentOk?: boolean;
}

export interface UpdateEquipmentMemberInput {
  firstname?: string;
  lastname?: string;
  birthDate?: string;
  poloItemId?: number | null;
  poloDistributed?: boolean;
  vesteItemId?: number | null;
  vesteDistributed?: boolean;
  diversItemId?: number | null;
  diversDistributed?: boolean;
  paymentOk?: boolean;
}

export async function getEquipmentMembersByYear(
  seasonYear: number
): Promise<EquipmentMemberRecord[]> {
  const pool = getDbPool();
  if (!pool) {
    return memoryMembers
      .filter((m) => m.seasonYear === seasonYear)
      .sort((a, b) => a.lastname.localeCompare(b.lastname) || a.firstname.localeCompare(b.firstname));
  }

  const res = await pool.query(
    `SELECT id, season_year, firstname, lastname, birth_date,
            polo_item_id, polo_distributed,
            veste_item_id, veste_distributed,
            divers_item_id, divers_distributed,
            payment_ok, created_at, updated_at
     FROM equipment_members
     WHERE season_year = $1
     ORDER BY lastname ASC, firstname ASC;`,
    [seasonYear]
  );

  return res.rows.map(mapSqlMemberRow);
}

export async function getEquipmentMemberById(
  id: number
): Promise<EquipmentMemberRecord | null> {
  const pool = getDbPool();
  if (!pool) {
    return memoryMembers.find((m) => m.id === id) || null;
  }

  const res = await pool.query(
    `SELECT id, season_year, firstname, lastname, birth_date,
            polo_item_id, polo_distributed,
            veste_item_id, veste_distributed,
            divers_item_id, divers_distributed,
            payment_ok, created_at, updated_at
     FROM equipment_members
     WHERE id = $1;`,
    [id]
  );
  if (res.rows.length === 0) return null;
  return mapSqlMemberRow(res.rows[0]);
}

export async function createEquipmentMember(
  data: CreateEquipmentMemberInput
): Promise<EquipmentMemberRecord> {
  const firstname = data.firstname.trim();
  const lastname = data.lastname.trim().toUpperCase();
  const birthDate = (data.birthDate || "").trim();

  if (!firstname || !lastname) {
    throw new InventoryError("INVALID_INPUT", "Le prénom et le nom du membre sont obligatoires.");
  }

  const poloItemId = data.poloItemId ?? null;
  const poloDistributed = poloItemId ? Boolean(data.poloDistributed) : false;
  const vesteItemId = data.vesteItemId ?? null;
  const vesteDistributed = vesteItemId ? Boolean(data.vesteDistributed) : false;
  const diversItemId = data.diversItemId ?? null;
  const diversDistributed = diversItemId ? Boolean(data.diversDistributed) : false;
  const paymentOk = Boolean(data.paymentOk);

  const pool = getDbPool();
  if (!pool) {
    if (!memorySeasons.some((s) => s.year === data.seasonYear)) {
      memorySeasons.push({
        year: data.seasonYear,
        label: `Saison ${data.seasonYear - 1}-${data.seasonYear}`,
        createdAt: new Date(),
      });
    }
    const now = new Date();
    const record: EquipmentMemberRecord = {
      id: nextMemberId++,
      seasonYear: data.seasonYear,
      firstname,
      lastname,
      birthDate,
      poloItemId,
      poloDistributed,
      vesteItemId,
      vesteDistributed,
      diversItemId,
      diversDistributed,
      paymentOk,
      createdAt: now,
      updatedAt: now,
    };
    memoryMembers.push(record);
    return record;
  }

  const res = await pool.query(
    `INSERT INTO equipment_members (
       season_year, firstname, lastname, birth_date,
       polo_item_id, polo_distributed,
       veste_item_id, veste_distributed,
       divers_item_id, divers_distributed,
       payment_ok
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, season_year, firstname, lastname, birth_date,
               polo_item_id, polo_distributed,
               veste_item_id, veste_distributed,
               divers_item_id, divers_distributed,
               payment_ok, created_at, updated_at;`,
    [
      data.seasonYear,
      firstname,
      lastname,
      birthDate,
      poloItemId,
      poloDistributed,
      vesteItemId,
      vesteDistributed,
      diversItemId,
      diversDistributed,
      paymentOk,
    ]
  );

  return mapSqlMemberRow(res.rows[0]);
}

export async function updateEquipmentMember(
  id: number,
  data: UpdateEquipmentMemberInput
): Promise<EquipmentMemberRecord | null> {
  const existing = await getEquipmentMemberById(id);
  if (!existing) return null;

  const firstname = data.firstname !== undefined ? data.firstname.trim() : existing.firstname;
  const lastname = data.lastname !== undefined ? data.lastname.trim().toUpperCase() : existing.lastname;
  const birthDate = data.birthDate !== undefined ? data.birthDate.trim() : existing.birthDate;

  if (!firstname || !lastname) {
    throw new InventoryError("INVALID_INPUT", "Le prénom et le nom ne peuvent pas être vides.");
  }

  const poloItemId = data.poloItemId !== undefined ? data.poloItemId : existing.poloItemId;
  const poloDistributed = poloItemId
    ? data.poloDistributed !== undefined
      ? Boolean(data.poloDistributed)
      : existing.poloDistributed
    : false;

  const vesteItemId = data.vesteItemId !== undefined ? data.vesteItemId : existing.vesteItemId;
  const vesteDistributed = vesteItemId
    ? data.vesteDistributed !== undefined
      ? Boolean(data.vesteDistributed)
      : existing.vesteDistributed
    : false;

  const diversItemId = data.diversItemId !== undefined ? data.diversItemId : existing.diversItemId;
  const diversDistributed = diversItemId
    ? data.diversDistributed !== undefined
      ? Boolean(data.diversDistributed)
      : existing.diversDistributed
    : false;

  const paymentOk = data.paymentOk !== undefined ? Boolean(data.paymentOk) : existing.paymentOk;

  const pool = getDbPool();
  if (!pool) {
    existing.firstname = firstname;
    existing.lastname = lastname;
    existing.birthDate = birthDate;
    existing.poloItemId = poloItemId;
    existing.poloDistributed = poloDistributed;
    existing.vesteItemId = vesteItemId;
    existing.vesteDistributed = vesteDistributed;
    existing.diversItemId = diversItemId;
    existing.diversDistributed = diversDistributed;
    existing.paymentOk = paymentOk;
    existing.updatedAt = new Date();
    return { ...existing };
  }

  const res = await pool.query(
    `UPDATE equipment_members
     SET firstname = $1,
         lastname = $2,
         birth_date = $3,
         polo_item_id = $4,
         polo_distributed = $5,
         veste_item_id = $6,
         veste_distributed = $7,
         divers_item_id = $8,
         divers_distributed = $9,
         payment_ok = $10,
         updated_at = NOW()
     WHERE id = $11
     RETURNING id, season_year, firstname, lastname, birth_date,
               polo_item_id, polo_distributed,
               veste_item_id, veste_distributed,
               divers_item_id, divers_distributed,
               payment_ok, created_at, updated_at;`,
    [
      firstname,
      lastname,
      birthDate,
      poloItemId,
      poloDistributed,
      vesteItemId,
      vesteDistributed,
      diversItemId,
      diversDistributed,
      paymentOk,
      id,
    ]
  );

  if (res.rows.length === 0) return null;
  return mapSqlMemberRow(res.rows[0]);
}

export async function deleteEquipmentMember(id: number): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) {
    const idx = memoryMembers.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    memoryMembers.splice(idx, 1);
    return true;
  }

  const res = await pool.query(`DELETE FROM equipment_members WHERE id = $1;`, [id]);
  return (res.rowCount ?? 0) > 0;
}

/**
 * Import en lot pour une année donnée (utilisé par l'upload Excel de début de saison).
 * Met à jour un membre existant si (seasonYear, firstname, lastname, birthDate) correspond,
 * sinon crée une nouvelle fiche.
 */
export async function bulkUpsertEquipmentMembers(
  seasonYear: number,
  members: Omit<CreateEquipmentMemberInput, "seasonYear">[]
): Promise<{ created: number; updated: number }> {
  const existingMembers = await getEquipmentMembersByYear(seasonYear);
  const keyOf = (firstname: string, lastname: string, birthDate: string) =>
    `${firstname.trim().toLowerCase()}|${lastname.trim().toLowerCase()}|${birthDate.trim()}`;

  const existingByKey = new Map<string, EquipmentMemberRecord>();
  for (const m of existingMembers) {
    existingByKey.set(keyOf(m.firstname, m.lastname, m.birthDate), m);
  }

  let created = 0;
  let updated = 0;

  for (const input of members) {
    const k = keyOf(input.firstname, input.lastname, input.birthDate || "");
    const existing = existingByKey.get(k);

    if (existing) {
      await updateEquipmentMember(existing.id, {
        poloItemId: input.poloItemId !== undefined ? input.poloItemId : existing.poloItemId,
        poloDistributed:
          input.poloDistributed !== undefined ? input.poloDistributed : existing.poloDistributed,
        vesteItemId: input.vesteItemId !== undefined ? input.vesteItemId : existing.vesteItemId,
        vesteDistributed:
          input.vesteDistributed !== undefined ? input.vesteDistributed : existing.vesteDistributed,
        diversItemId: input.diversItemId !== undefined ? input.diversItemId : existing.diversItemId,
        diversDistributed:
          input.diversDistributed !== undefined
            ? input.diversDistributed
            : existing.diversDistributed,
        paymentOk: input.paymentOk !== undefined ? input.paymentOk : existing.paymentOk,
      });
      updated++;
    } else {
      const createdRecord = await createEquipmentMember({
        ...input,
        seasonYear,
      });
      existingByKey.set(k, createdRecord);
      created++;
    }
  }

  return { created, updated };
}
