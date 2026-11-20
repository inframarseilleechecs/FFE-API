/**
 * Schéma relationnel et types pour la persistance PostgreSQL
 * Auteur : Sergey CHUKHNO
 */

import { Player } from "../scraper/types";
import { normalizeForMatch, removeAccents } from "../scraper/normalization";

export interface PlayerRecord {
  nrFfe: string;              // Clé primaire (ex: "X81304")
  nomPrenom: string;          // Format officiel FFE (ex: "CHUKHNO Maxime")
  nom: string;                // Nom de famille en majuscules (ex: "CHUKHNO")
  prenom: string;             // Prénom (ex: "Maxime")
  nomNormalized: string;      // Nom sans accent/tiret pour index SQL B-Tree
  prenomNormalized: string;   // Prénom sans accent pour index SQL B-Tree
  af: string;                 // Type de licence / affiliation (ex: "A", "B", "")
  elo: string;                // Elo Standard
  rapide: string;             // Elo Rapide
  blitz: string;              // Elo Blitz
  cat: string;                // Catégorie (ex: "PouM", "SenM")
  club: string;               // Club (ex: "Marseille-Echecs")
  idFfe: string;              // Identifiant interne FFE (ex: "1242503")
  idFide: string | null;      // Identifiant FIDE international (optionnel)
  lienFfe: string | null;     // URL directe fiche FFE
  updatedAt: Date;            // Horodatage de dernière synchronisation
}

export type SyncStatus = "SUCCESS" | "PARTIAL" | "FAILED";

export interface SyncLogRecord {
  id: number;
  clubCode: string;
  status: SyncStatus;
  playersSynced: number;
  durationMs: number;
  errorMessage: string | null;
  createdAt: Date;
}

/**
 * Convertit un objet joueur issu du scraper vers la structure de persistance SQL.
 */
export function toPlayerRecord(player: Player): Omit<PlayerRecord, "updatedAt"> & { updatedAt?: Date } {
  return {
    nrFfe: player.nrFFE.toUpperCase().trim(),
    nomPrenom: player.nomPrenom || `${player.nom} ${player.prenom}`.trim(),
    nom: player.nom.toUpperCase().trim(),
    prenom: player.prenom.trim(),
    nomNormalized: normalizeForMatch(player.nom),
    prenomNormalized: normalizeForMatch(player.prenom),
    af: player.af || "",
    elo: player.elo || "0",
    rapide: player.rapide || "0",
    blitz: player.blitz || "0",
    cat: player.cat || "",
    club: player.club || "Marseille-Echecs",
    idFfe: player.idFFE || "",
    idFide: player.idFIDE || null,
    lienFfe: player.lienFFE || (player.idFFE ? `https://www.echecs.asso.fr/FicheJoueur.aspx?Id=${player.idFFE}` : null),
  };
}

export type UserRole = "superadmin" | "director" | "coach" | "secretary";

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: UserRole;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassRecord {
  id: number;
  name: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  level: string;
  coachId: string | null;
  active: boolean;
  createdAt: Date;
}

export type EquipmentCategory = "POLO" | "VESTE" | "DIVERS";

export interface InventorySeasonRecord {
  year: number;
  label: string;
  createdAt: Date;
}

export interface EquipmentItemRecord {
  id: number;
  category: EquipmentCategory;
  type: string;                       // Ex: "Polo M", "Veste 12 ans", "Sac club"
  quantitySinceLastInventory: number; // Stock de référence depuis le dernier inventaire
  nbDistributed: number;              // Nombre d'unités effectivement remises (calculé)
  stockRemaining: number;             // quantitySinceLastInventory - nbDistributed (calculé)
  threshold: number;                  // Seuil d'alerte stock bas
  isLowStock: boolean;                // stockRemaining <= threshold (calculé)
  usageCount: number;                 // Nombre total de références (dues ou distribuées)
  canDelete: boolean;                 // true uniquement si usageCount === 0 (DELETE IF NEVER USED)
  lastInventoryAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface EquipmentMemberRecord {
  id: number;
  seasonYear: number;
  firstname: string;
  lastname: string;
  birthDate: string;                  // Format DD-MM-YYYY (ou vide si non renseigné)
  poloItemId: number | null;
  poloDistributed: boolean;
  vesteItemId: number | null;
  vesteDistributed: boolean;
  diversItemId: number | null;
  diversDistributed: boolean;
  paymentOk: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Définition DDL SQL des tables et index de haute performance pour RecupFFE v1.2.
 */
export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS players (
  nr_ffe VARCHAR(20) PRIMARY KEY,
  nom_prenom VARCHAR(255) NOT NULL,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  nom_normalized VARCHAR(100) NOT NULL,
  prenom_normalized VARCHAR(100) NOT NULL,
  af VARCHAR(10) DEFAULT '',
  elo VARCHAR(20) DEFAULT '0',
  rapide VARCHAR(20) DEFAULT '0',
  blitz VARCHAR(20) DEFAULT '0',
  cat VARCHAR(20) DEFAULT '',
  club VARCHAR(255) NOT NULL DEFAULT 'Marseille-Echecs',
  id_ffe VARCHAR(50) DEFAULT '',
  id_fide VARCHAR(50),
  lien_ffe TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_players_nom_norm ON players(nom_normalized);
CREATE INDEX IF NOT EXISTS idx_players_prenom_norm ON players(prenom_normalized);
CREATE INDEX IF NOT EXISTS idx_players_club ON players(club);

CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  club_code VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  players_synced INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(created_at DESC);

-- Tables d'authentification Better-Auth v1.2
CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT UNIQUE NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  "image" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "role" TEXT NOT NULL DEFAULT 'coach',
  "phone" TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_role ON "user"("role");

CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "token" TEXT UNIQUE NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_user_id ON "session"("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_user_id ON "account"("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Modules Métier v1.2 (Classes & Inventaire)
CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  day_of_week VARCHAR(30) NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  level VARCHAR(50) NOT NULL DEFAULT 'Débutants',
  coach_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classes_coach_id ON classes(coach_id);

-- Module Inventaire & Équipements (Saisons, Catalogue Polo/Veste/Divers, Suivi Membres)
CREATE TABLE IF NOT EXISTS inventory_seasons (
  year INTEGER PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment_items (
  id SERIAL PRIMARY KEY,
  category VARCHAR(20) NOT NULL CHECK (category IN ('POLO', 'VESTE', 'DIVERS')),
  type VARCHAR(150) NOT NULL,
  quantity_since_last_inventory INTEGER NOT NULL DEFAULT 0,
  threshold INTEGER NOT NULL DEFAULT 5,
  last_inventory_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category, type)
);

CREATE INDEX IF NOT EXISTS idx_equipment_items_category ON equipment_items(category);

CREATE TABLE IF NOT EXISTS equipment_members (
  id SERIAL PRIMARY KEY,
  season_year INTEGER NOT NULL REFERENCES inventory_seasons(year) ON DELETE CASCADE,
  firstname VARCHAR(100) NOT NULL,
  lastname VARCHAR(100) NOT NULL,
  birth_date VARCHAR(20) NOT NULL DEFAULT '',
  polo_item_id INTEGER REFERENCES equipment_items(id) ON DELETE RESTRICT,
  polo_distributed BOOLEAN NOT NULL DEFAULT FALSE,
  veste_item_id INTEGER REFERENCES equipment_items(id) ON DELETE RESTRICT,
  veste_distributed BOOLEAN NOT NULL DEFAULT FALSE,
  divers_item_id INTEGER REFERENCES equipment_items(id) ON DELETE RESTRICT,
  divers_distributed BOOLEAN NOT NULL DEFAULT FALSE,
  payment_ok BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_members_season ON equipment_members(season_year);
CREATE INDEX IF NOT EXISTS idx_equipment_members_polo ON equipment_members(polo_item_id);
CREATE INDEX IF NOT EXISTS idx_equipment_members_veste ON equipment_members(veste_item_id);
CREATE INDEX IF NOT EXISTS idx_equipment_members_divers ON equipment_members(divers_item_id);
`;

