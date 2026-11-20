/**
 * Migration idempotente du schéma PostgreSQL RecupFFE v1.2.
 * Crée uniquement les tables et index manquants.
 * Ne crée aucun compte ni aucune donnée de démonstration.
 *
 * Usage :
 *   DATABASE_URL="postgresql://..." npm run db:migrate
 * Auteur : Sergey CHUKHNO
 */

import { closeDbPool, getDbPool } from "../src/lib/db/client";
import { initDatabase } from "../src/lib/db/repository";

const REQUIRED_TABLES = [
  "inventory_seasons",
  "equipment_items",
  "equipment_members",
] as const;

async function migrate(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL est absent. La migration est annulée.");
    process.exit(1);
  }

  console.log("🚀 Application du schéma PostgreSQL RecupFFE v1.2...");

  const initialized = await initDatabase();
  if (!initialized) {
    console.error("❌ Impossible d'appliquer le schéma. Vérifiez DATABASE_URL et la connectivité PostgreSQL.");
    process.exit(1);
  }

  const pool = getDbPool();
  if (!pool) {
    console.error("❌ Pool PostgreSQL indisponible après initialisation.");
    process.exit(1);
  }

  try {
    const result = await pool.query(
      `SELECT to_regclass('public.inventory_seasons') AS inventory_seasons,
              to_regclass('public.equipment_items') AS equipment_items,
              to_regclass('public.equipment_members') AS equipment_members;`
    );

    const row = result.rows[0] as Record<string, string | null>;
    let allPresent = true;

    for (const table of REQUIRED_TABLES) {
      const present = Boolean(row[table]);
      if (!present) allPresent = false;
      console.log(`${present ? "✅" : "❌"} Table ${table} : ${present ? "présente" : "absente"}`);
    }

    if (!allPresent) {
      console.error("❌ Migration incomplète : au moins une table requise est absente.");
      process.exit(1);
    }

    console.log("🎉 Migration terminée avec succès.");
  } finally {
    await closeDbPool();
  }
}

migrate().catch(async (err: unknown) => {
  console.error("❌ Échec de la migration :", err instanceof Error ? err.message : err);
  await closeDbPool().catch(() => undefined);
  process.exit(1);
});
