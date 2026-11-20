/**
 * Script de Seeding pour RecupFFE v1.2 (Marseille-Échecs)
 * Initialise les 4 comptes de test, 2 cours et 5 articles d'inventaire avec alerte de réassort.
 * Usage : npx tsx scripts/seed-v1.2.ts
 * Auteur : Sergey CHUKHNO
 */

import { auth } from "../src/lib/auth/auth";
import { getDbPool, closeDbPool } from "../src/lib/db/client";
import { initDatabase } from "../src/lib/db/repository";
import { getUserByEmail } from "../src/lib/db/users";
import { createClass, getAllClasses } from "../src/lib/db/classes";
import {
  createEquipmentItem,
  createInventorySeason,
  getAllEquipmentItems,
  getInventorySeasons,
} from "../src/lib/db/inventory";

async function seed() {
  console.log("🌱 Démarrage du Seeding Marseille-Échecs v1.2...");

  // 1. Initialisation des tables DDL
  await initDatabase();
  const pool = getDbPool();
  if (!pool) {
    console.error("❌ Impossible de se connecter à PostgreSQL.");
    process.exit(1);
  }

  // 2. Création des 4 comptes officiels
  const demoUsers = [
    {
      email: "admin@marseille-echecs.com",
      password: "MarseilleAdmin2026!",
      name: "Sergey Superadmin",
      role: "superadmin" as const,
      phone: "06 00 00 00 01",
    },
    {
      email: "directeur@marseille-echecs.com",
      password: "Directeur2026!",
      name: "Directeur Sportif Marseille-Échecs",
      role: "director" as const,
      phone: "06 00 00 00 02",
    },
    {
      email: "coach@marseille-echecs.com",
      password: "Coach2026!",
      name: "Entraîneur Principal",
      role: "coach" as const,
      phone: "06 00 00 00 03",
    },
    {
      email: "secretaire@marseille-echecs.com",
      password: "Secretaire2026!",
      name: "Secrétariat Marseille-Échecs",
      role: "secretary" as const,
      phone: "06 00 00 00 04",
    },
  ];

  for (const u of demoUsers) {
    const existing = await getUserByEmail(u.email);
    if (!existing) {
      try {
        await auth.api.signUpEmail({
          body: {
            email: u.email,
            password: u.password,
            name: u.name,
            role: u.role,
            phone: u.phone,
          },
        });
        console.log(`✅ Compte créé : ${u.email} [${u.role}]`);
      } catch (err) {
        console.error(`Erreur création compte ${u.email}:`, err);
      }
    } else {
      console.log(`ℹ️ Compte existant : ${u.email} [${existing.role}]`);
    }
  }

  // 3. Récupération du coach pour assignation des cours
  const coachUser = await getUserByEmail("coach@marseille-echecs.com");
  const coachId = coachUser?.id || null;

  // 4. Seeding des Classes
  const existingClasses = await getAllClasses();
  if (existingClasses.length === 0) {
    await createClass({
      name: "Poussins Débutants",
      dayOfWeek: "Mercredi",
      startTime: "14:00",
      endTime: "15:30",
      level: "Débutants",
      coachId: coachId,
    });
    await createClass({
      name: "Perfectionnement Jeunes",
      dayOfWeek: "Samedi",
      startTime: "10:00",
      endTime: "12:00",
      level: "Initiés",
      coachId: coachId,
    });
    console.log("✅ 2 cours de démonstration créés pour le coach.");
  } else {
    console.log(`ℹ️ ${existingClasses.length} cours déjà présents.`);
  }

  // 5. Seeding des Saisons & Équipements d'Inventaire (Polo, Veste, Divers)
  const existingSeasons = await getInventorySeasons();
  if (existingSeasons.length === 0) {
    await createInventorySeason(2026, "Saison 2025-2026");
    await createInventorySeason(2027, "Saison 2026-2027");
    console.log("✅ 2 saisons d'inventaire créées (2026 et 2027).");
  } else {
    console.log(`ℹ️ ${existingSeasons.length} saisons d'inventaire déjà présentes.`);
  }

  const existingItems = await getAllEquipmentItems();
  if (existingItems.length === 0) {
    const items = [
      {
        category: "POLO" as const,
        type: "Polo Enfant 10 ans",
        quantitySinceLastInventory: 20,
        threshold: 5,
      },
      {
        category: "POLO" as const,
        type: "Polo Adulte M",
        quantitySinceLastInventory: 15,
        threshold: 5,
      },
      {
        category: "VESTE" as const,
        type: "Veste Club M",
        quantitySinceLastInventory: 10,
        threshold: 3,
      },
      {
        category: "VESTE" as const,
        type: "Veste Club L",
        quantitySinceLastInventory: 3, // ⚠️ En alerte stock bas (3 <= 4)
        threshold: 4,
      },
      {
        category: "DIVERS" as const,
        type: "Sac Marseille-Échecs",
        quantitySinceLastInventory: 25,
        threshold: 5,
      },
    ];

    for (const item of items) {
      await createEquipmentItem(item);
    }
    console.log("✅ 5 équipements d'inventaire créés (Polo, Veste, Divers — dont 1 en alerte stock bas).");
  } else {
    console.log(`ℹ️ ${existingItems.length} équipements d'inventaire déjà présents.`);
  }

  await closeDbPool();
  console.log("🎉 Seeding terminé avec succès !");
}

seed().catch((err) => {
  console.error("Erreur générale seeding:", err);
  process.exit(1);
});
