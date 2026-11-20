/**
 * Tests unitaires pour la conformité des schémas de base de données v1.2
 * Auteur : Sergey CHUKHNO
 */

import { describe, it, expect } from "vitest";
import { CREATE_TABLES_SQL } from "../../db/schema";

describe("DDL SQL v1.2 Schema Definitions", () => {
  it("contient la définition de la table user avec la colonne role", () => {
    expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS "user"');
    expect(CREATE_TABLES_SQL).toContain('"role" TEXT NOT NULL DEFAULT \'coach\'');
    expect(CREATE_TABLES_SQL).toContain('idx_user_role');
  });

  it("contient la définition de la table session avec clés étrangères", () => {
    expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS "session"');
    expect(CREATE_TABLES_SQL).toContain('"token" TEXT UNIQUE NOT NULL');
    expect(CREATE_TABLES_SQL).toContain('REFERENCES "user"("id") ON DELETE CASCADE');
  });

  it("contient la définition de la table account pour Better-Auth", () => {
    expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS "account"');
    expect(CREATE_TABLES_SQL).toContain('"providerId" TEXT NOT NULL');
    expect(CREATE_TABLES_SQL).toContain('idx_account_user_id');
  });

  it("contient la table classes avec contrainte sur coach_id", () => {
    expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS classes');
    expect(CREATE_TABLES_SQL).toContain('coach_id TEXT REFERENCES "user"(id)');
    expect(CREATE_TABLES_SQL).toContain('idx_classes_coach_id');
  });

  it("contient les tables inventory_seasons et equipment_items (POLO, VESTE, DIVERS)", () => {
    expect(CREATE_TABLES_SQL).toContain("CREATE TABLE IF NOT EXISTS inventory_seasons");
    expect(CREATE_TABLES_SQL).toContain("CREATE TABLE IF NOT EXISTS equipment_items");
    expect(CREATE_TABLES_SQL).toContain("CHECK (category IN ('POLO', 'VESTE', 'DIVERS'))");
    expect(CREATE_TABLES_SQL).toContain("quantity_since_last_inventory INTEGER NOT NULL DEFAULT 0");
    expect(CREATE_TABLES_SQL).toContain("threshold INTEGER NOT NULL DEFAULT 5");
    expect(CREATE_TABLES_SQL).toContain("idx_equipment_items_category");
  });

  it("contient la table equipment_members avec contraintes ON DELETE RESTRICT", () => {
    expect(CREATE_TABLES_SQL).toContain("CREATE TABLE IF NOT EXISTS equipment_members");
    expect(CREATE_TABLES_SQL).toContain("season_year INTEGER NOT NULL REFERENCES inventory_seasons(year)");
    expect(CREATE_TABLES_SQL).toContain("polo_item_id INTEGER REFERENCES equipment_items(id) ON DELETE RESTRICT");
    expect(CREATE_TABLES_SQL).toContain("veste_item_id INTEGER REFERENCES equipment_items(id) ON DELETE RESTRICT");
    expect(CREATE_TABLES_SQL).toContain("divers_item_id INTEGER REFERENCES equipment_items(id) ON DELETE RESTRICT");
    expect(CREATE_TABLES_SQL).toContain("payment_ok BOOLEAN NOT NULL DEFAULT FALSE");
  });
});
