/**
 * Dépôt de données (Repository) pour les joueurs et les journaux de synchronisation.
 * Fournit les requêtes vectorielles haute performance (ex: vérification par lot de licences < 50ms)
 * avec bascule automatique entre PostgreSQL et l'adaptateur local résilient.
 * Auteur : Sergey CHUKHNO
 */

import { getDbPool } from "./client";
import {
  PlayerRecord,
  SyncLogRecord,
  SyncStatus,
  CREATE_TABLES_SQL,
  toPlayerRecord,
} from "./schema";
import { Player } from "../scraper/types";
import { normalizeForMatch } from "../scraper/normalization";

// Mémoire de repli locale pour CI et tests sans base active
const memoryPlayers = new Map<string, PlayerRecord>();
const memoryLogs: SyncLogRecord[] = [];
let nextLogId = 1;

/**
 * Initialise le schéma des tables et index dans PostgreSQL si disponible.
 */
export async function initDatabase(): Promise<boolean> {
  const pool = getDbPool();
  if (pool) {
    try {
      await pool.query(CREATE_TABLES_SQL);
      return true;
    } catch (err) {
      console.warn("PostgreSQL non joignable, bascule sur adaptateur local:", err);
      return false;
    }
  }
  return false;
}

/**
 * Insère ou met à jour par lot (UPSERT) les joueurs du club.
 * Préserve l'intégrité en une seule opération atomique sur conflit de licence FFE.
 */
export async function upsertPlayers(players: (Player | PlayerRecord)[]): Promise<number> {
  if (!players || players.length === 0) return 0;

  const records: PlayerRecord[] = players.map((p) => {
    if ("nrFfe" in p && "nomNormalized" in p) {
      return p as PlayerRecord;
    }
    const converted = toPlayerRecord(p as Player);
    return {
      ...converted,
      updatedAt: converted.updatedAt || new Date(),
    };
  });

  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const upsertQuery = `
          INSERT INTO players (
            nr_ffe, nom_prenom, nom, prenom, nom_normalized, prenom_normalized,
            af, elo, rapide, blitz, cat, club, id_ffe, id_fide, lien_ffe, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
          )
          ON CONFLICT (nr_ffe) DO UPDATE SET
            nom_prenom = EXCLUDED.nom_prenom,
            nom = EXCLUDED.nom,
            prenom = EXCLUDED.prenom,
            nom_normalized = EXCLUDED.nom_normalized,
            prenom_normalized = EXCLUDED.prenom_normalized,
            af = EXCLUDED.af,
            elo = EXCLUDED.elo,
            rapide = EXCLUDED.rapide,
            blitz = EXCLUDED.blitz,
            cat = EXCLUDED.cat,
            club = EXCLUDED.club,
            id_ffe = EXCLUDED.id_ffe,
            id_fide = EXCLUDED.id_fide,
            lien_ffe = EXCLUDED.lien_ffe,
            updated_at = NOW();
        `;

        for (const r of records) {
          await client.query(upsertQuery, [
            r.nrFfe,
            r.nomPrenom,
            r.nom,
            r.prenom,
            r.nomNormalized,
            r.prenomNormalized,
            r.af,
            r.elo,
            r.rapide,
            r.blitz,
            r.cat,
            r.club,
            r.idFfe,
            r.idFide,
            r.lienFfe,
            r.updatedAt || new Date(),
          ]);
        }

        await client.query("COMMIT");
        return records.length;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn("Échec requête Postgres upsert, bascule sur mémoire:", err);
    }
  }

  // Repli mémoire local
  for (const r of records) {
    memoryPlayers.set(r.nrFfe, r);
  }
  return records.length;
}

/**
 * Récupère en une seule requête SQL ultra-rapide un lot de joueurs par leurs numéros de licence.
 * Temps d'exécution ciblé : < 50 millisecondes pour un tournoi de 200 participants.
 */
export async function getPlayersByLicences(licences: string[]): Promise<PlayerRecord[]> {
  if (!licences || licences.length === 0) return [];

  const cleanLicences = Array.from(
    new Set(licences.map((l) => l.trim().toUpperCase()).filter((l) => l.length > 0))
  );

  if (cleanLicences.length === 0) return [];

  const pool = getDbPool();
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT 
          nr_ffe as "nrFfe",
          nom_prenom as "nomPrenom",
          nom,
          prenom,
          nom_normalized as "nomNormalized",
          prenom_normalized as "prenomNormalized",
          af,
          elo,
          rapide,
          blitz,
          cat,
          club,
          id_ffe as "idFfe",
          id_fide as "idFide",
          lien_ffe as "lienFfe",
          updated_at as "updatedAt"
        FROM players 
        WHERE nr_ffe = ANY($1);`,
        [cleanLicences]
      );
      return res.rows;
    } catch (err) {
      console.warn("Échec requête Postgres getPlayersByLicences, bascule sur mémoire:", err);
    }
  }

  // Repli mémoire local
  const results: PlayerRecord[] = [];
  for (const lic of cleanLicences) {
    const found = memoryPlayers.get(lic);
    if (found) {
      results.push(found);
    }
  }
  return results;
}

/**
 * Recherche instantanée locale par mot-clé (nom ou prénom) sans accents.
 */
export async function searchLocalPlayers(query: string, limit = 20): Promise<PlayerRecord[]> {
  if (!query || !query.trim()) return [];

  const normalized = normalizeForMatch(query);
  const pattern = `%${normalized}%`;

  const pool = getDbPool();
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT 
          nr_ffe as "nrFfe",
          nom_prenom as "nomPrenom",
          nom,
          prenom,
          nom_normalized as "nomNormalized",
          prenom_normalized as "prenomNormalized",
          af,
          elo,
          rapide,
          blitz,
          cat,
          club,
          id_ffe as "idFfe",
          id_fide as "idFide",
          lien_ffe as "lienFfe",
          updated_at as "updatedAt"
        FROM players 
        WHERE nom_normalized LIKE $1 OR prenom_normalized LIKE $1
        ORDER BY nom ASC, prenom ASC
        LIMIT $2;`,
        [pattern, limit]
      );
      return res.rows;
    } catch (err) {
      console.warn("Échec requête Postgres searchLocalPlayers, bascule sur mémoire:", err);
    }
  }

  // Repli mémoire local
  const results: PlayerRecord[] = [];
  for (const player of memoryPlayers.values()) {
    if (
      player.nomNormalized.includes(normalized) ||
      player.prenomNormalized.includes(normalized)
    ) {
      results.push(player);
      if (results.length >= limit) break;
    }
  }
  return results;
}

/**
 * Journalise une exécution de synchronisation (cron ou manuelle).
 */
export async function logSync(entry: {
  clubCode: string;
  status: SyncStatus;
  playersSynced: number;
  durationMs: number;
  errorMessage?: string | null;
}): Promise<SyncLogRecord> {
  const pool = getDbPool();
  if (pool) {
    try {
      const res = await pool.query(
        `INSERT INTO sync_logs (club_code, status, players_synced, duration_ms, error_message, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING 
           id,
           club_code as "clubCode",
           status,
           players_synced as "playersSynced",
           duration_ms as "durationMs",
           error_message as "errorMessage",
           created_at as "createdAt";`,
        [
          entry.clubCode,
          entry.status,
          entry.playersSynced,
          entry.durationMs,
          entry.errorMessage || null,
        ]
      );
      return res.rows[0];
    } catch (err) {
      console.warn("Échec enregistrement log Postgres, bascule sur mémoire:", err);
    }
  }

  // Repli mémoire local
  const logRecord: SyncLogRecord = {
    id: nextLogId++,
    clubCode: entry.clubCode,
    status: entry.status,
    playersSynced: entry.playersSynced,
    durationMs: entry.durationMs,
    errorMessage: entry.errorMessage || null,
    createdAt: new Date(),
  };
  memoryLogs.unshift(logRecord);
  return logRecord;
}

/**
 * Récupère le journal de synchronisation le plus récent pour l'affichage IHM.
 */
export async function getLatestSyncLog(): Promise<SyncLogRecord | null> {
  const pool = getDbPool();
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT 
           id,
           club_code as "clubCode",
           status,
           players_synced as "playersSynced",
           duration_ms as "durationMs",
           error_message as "errorMessage",
           created_at as "createdAt"
         FROM sync_logs
         ORDER BY created_at DESC
         LIMIT 1;`
      );
      return res.rows[0] || null;
    } catch (err) {
      console.warn("Échec lecture log Postgres, bascule sur mémoire:", err);
    }
  }

  return memoryLogs[0] || null;
}

/**
 * Retourne l'historique complet des synchronisations (pour la console d'administration).
 */
export async function getSyncLogs(limit = 50): Promise<SyncLogRecord[]> {
  const pool = getDbPool();
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT 
           id,
           club_code as "clubCode",
           status,
           players_synced as "playersSynced",
           duration_ms as "durationMs",
           error_message as "errorMessage",
           created_at as "createdAt"
         FROM sync_logs
         ORDER BY created_at DESC
         LIMIT $1;`,
        [limit]
      );
      return res.rows;
    } catch (err) {
      console.warn("Échec lecture sync_logs Postgres, bascule sur mémoire:", err);
    }
  }

  return memoryLogs.slice(0, limit);
}

/**
 * Retourne le nombre total de joueurs licenciés enregistrés en base.
 */
export async function getPlayersCount(): Promise<number> {
  const pool = getDbPool();
  if (pool) {
    try {
      const res = await pool.query(`SELECT COUNT(*)::int as count FROM players;`);
      return res.rows[0]?.count || 0;
    } catch (err) {
      console.warn("Échec count Postgres, bascule sur mémoire:", err);
    }
  }

  return memoryPlayers.size;
}

/**
 * Retourne les statistiques démographiques et fédérales complètes du club.
 */
export interface ClubDemographicStats {
  total: number;
  licenceA: number;
  licenceB: number;
  hommes: number;
  femmes: number;
  jeunes: number;
  seniors: number;
  veterans: number;
}

export async function getClubDemographicStats(): Promise<ClubDemographicStats> {
  const pool = getDbPool();
  if (pool) {
    try {
      const res = await pool.query(`
        SELECT 
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE af = 'A')::int as "licenceA",
          COUNT(*) FILTER (WHERE af = 'B')::int as "licenceB",
          COUNT(*) FILTER (WHERE cat LIKE '%F')::int as femmes,
          COUNT(*) FILTER (WHERE cat LIKE '%M')::int as hommes,
          COUNT(*) FILTER (WHERE cat LIKE 'Ppo%' OR cat LIKE 'Pou%' OR cat LIKE 'Pup%' OR cat LIKE 'Ben%' OR cat LIKE 'Min%' OR cat LIKE 'Cad%' OR cat LIKE 'Jun%')::int as jeunes,
          COUNT(*) FILTER (WHERE cat LIKE 'Sen%')::int as seniors,
          COUNT(*) FILTER (WHERE cat LIKE 'Sep%' OR cat LIKE 'Vet%')::int as veterans
        FROM players;
      `);
      if (res.rows[0]) {
        return res.rows[0];
      }
    } catch (err) {
      console.warn("Échec stats Postgres, bascule sur mémoire:", err);
    }
  }

  // Calcul sur repli mémoire
  let licenceA = 0;
  let licenceB = 0;
  let femmes = 0;
  let hommes = 0;
  let jeunes = 0;
  let seniors = 0;
  let veterans = 0;

  for (const p of memoryPlayers.values()) {
    if (p.af === "A") licenceA++;
    if (p.af === "B") licenceB++;
    if (p.cat.endsWith("F")) femmes++;
    if (p.cat.endsWith("M")) hommes++;
    const prefix = p.cat.slice(0, 3);
    if (["Ppo", "Pou", "Pup", "Ben", "Min", "Cad", "Jun"].includes(prefix)) {
      jeunes++;
    } else if (p.cat.startsWith("Sen")) {
      seniors++;
    } else if (p.cat.startsWith("Sep") || p.cat.startsWith("Vet")) {
      veterans++;
    }
  }

  return {
    total: memoryPlayers.size,
    licenceA,
    licenceB,
    hommes,
    femmes,
    jeunes,
    seniors,
    veterans,
  };
}

/**
 * Réinitialise l'état en mémoire (utilisé principalement pour les tests).
 */
export function clearMemoryDb(): void {
  memoryPlayers.clear();
  memoryLogs.length = 0;
  nextLogId = 1;
}
