/**
 * Suite complète de 18 tests unitaires — Étape 2 : Parseur Excel & Prévisualiseur Inventaire
 * Couvre tous les edge cases identifiés (identités, dates, paiements, catalogue, doublons, .xlsx binaire).
 */

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseInventoryRows,
  parseInventoryExcelBuffer,
  parseExcelBirthDate,
  parseExcelBoolean,
  CatalogItemRef,
} from "../inventory_excel";

const MOCK_CATALOG: CatalogItemRef[] = [
  { id: 1, category: "POLO", type: "Polo Enfant 10 ans" },
  { id: 2, category: "POLO", type: "Polo Adulte M" },
  { id: 3, category: "VESTE", type: "Veste Club M" },
  { id: 4, category: "VESTE", type: "Veste Club L" },
  { id: 5, category: "DIVERS", type: "Sac Marseille-Échecs" },
];

describe("Inventory Excel Parser & Pre-Visualizer (18 tests)", () => {
  // --- BLOC 1 : Identité, colonnes & propreté des données (Tests 1 à 5) ---

  it("1. parse un fichier standard avec colonnes séparées en statut VALID et distributed=false par défaut", () => {
    const preview = parseInventoryRows(
      [
        {
          Prénom: "Maxime",
          Nom: "Chukhno",
          "Date de naissance": "15/05/2014",
          Paiement: "Oui",
          Polo: "Polo Enfant 10 ans",
          Veste: "Veste Club M",
          Divers: "Sac Marseille-Échecs",
        },
      ],
      MOCK_CATALOG
    );

    expect(preview.summary.totalRows).toBe(1);
    expect(preview.summary.validCount).toBe(1);
    expect(preview.summary.warningCount).toBe(0);
    expect(preview.summary.errorCount).toBe(0);
    expect(preview.unknownItems).toEqual([]);

    const row = preview.rows[0];
    expect(row.rowNumber).toBe(2);
    expect(row.firstname).toBe("Maxime");
    expect(row.lastname).toBe("CHUKHNO");
    expect(row.birthDate).toBe("15-05-2014");
    expect(row.paymentOk).toBe(true);
    expect(row.poloItemId).toBe(1);
    expect(row.poloDistributed).toBe(false);
    expect(row.vesteItemId).toBe(3);
    expect(row.vesteDistributed).toBe(false);
    expect(row.diversItemId).toBe(5);
    expect(row.diversDistributed).toBe(false);
    expect(row.status).toBe("VALID");
  });

  it("2. reconnaît les variations d'en-têtes (anglais/français, accents, casse)", () => {
    const preview = parseInventoryRows(
      [
        {
          FIRSTNAME: "Alice",
          "Nom de famille": "Martin",
          "Né(e) le": "2012-09-03",
          Règlement: "Payé",
          "Taille Polo": "Polo Adulte M",
        },
      ],
      MOCK_CATALOG
    );

    expect(preview.detectedColumns.firstname).toBe("FIRSTNAME");
    expect(preview.detectedColumns.lastname).toBe("Nom de famille");
    expect(preview.detectedColumns.birthDate).toBe("Né(e) le");
    expect(preview.detectedColumns.payment).toBe("Règlement");
    expect(preview.detectedColumns.polo).toBe("Taille Polo");

    const row = preview.rows[0];
    expect(row.status).toBe("VALID");
    expect(row.firstname).toBe("Alice");
    expect(row.lastname).toBe("MARTIN");
    expect(row.birthDate).toBe("03-09-2012");
    expect(row.paymentOk).toBe(true);
    expect(row.poloItemId).toBe(2);
  });

  it("3. découpe correctement une colonne combinée 'Nom & Prénom' avec particules et noms composés", () => {
    const preview = parseInventoryRows(
      [
        { "Nom & Prénom": "CHUKHNO Maxime" },
        { "Nom & Prénom": "DE LA ROCHE Jean-Luc" },
        { "Nom & Prénom": "ADJEROUD-SAADE Aksel" },
      ],
      MOCK_CATALOG
    );

    expect(preview.rows).toHaveLength(3);
    expect(preview.rows[0]).toMatchObject({ lastname: "CHUKHNO", firstname: "Maxime", status: "VALID" });
    expect(preview.rows[1]).toMatchObject({ lastname: "DE LA ROCHE", firstname: "Jean-Luc", status: "VALID" });
    expect(preview.rows[2]).toMatchObject({ lastname: "ADJEROUD-SAADE", firstname: "Aksel", status: "VALID" });
  });

  it("4. nettoie les caractères parasites Excel (espaces insécables, retours ligne, tabulations, apostrophes courbes)", () => {
    const preview = parseInventoryRows(
      [
        {
          Prénom: "  Léo\u00A0",
          Nom: "D’ARBOIS\r\n\t",
          Polo: "Polo\u00A0Adulte\tM ",
        },
      ],
      MOCK_CATALOG
    );

    const row = preview.rows[0];
    expect(row.firstname).toBe("Léo");
    expect(row.lastname).toBe("D'ARBOIS");
    expect(row.poloItemId).toBe(2);
    expect(row.status).toBe("VALID");
  });

  it("5. ignore les lignes totalement vides et marque les lignes incomplètes en ERROR sans bloquer le fichier", () => {
    const preview = parseInventoryRows(
      [
        { Prénom: "", Nom: "", Polo: "" },
        { Prénom: "Lucas", Nom: "", Polo: "Polo Adulte M" },
        { Prénom: "", Nom: "DURAND", Polo: "Polo Adulte M" },
        { Prénom: "Emma", Nom: "Petit", Polo: "Polo Adulte M" },
      ],
      MOCK_CATALOG
    );

    expect(preview.summary.ignoredEmptyRows).toBe(1);
    expect(preview.summary.totalRows).toBe(3);
    expect(preview.summary.errorCount).toBe(2);
    expect(preview.summary.validCount).toBe(1);
    expect(preview.summary.importableCount).toBe(1);

    expect(preview.rows[0].status).toBe("ERROR");
    expect(preview.rows[0].errors).toContain("Nom manquant");
    expect(preview.rows[1].status).toBe("ERROR");
    expect(preview.rows[1].errors).toContain("Prénom manquant");
    expect(preview.rows[2].status).toBe("VALID");
  });

  // --- BLOC 2 : Formats de dates de naissance (Tests 6 à 9) ---

  it("6. normalise les formats de dates texte usuels (/, -, ., ISO et 1 chiffre) en DD-MM-YYYY", () => {
    expect(parseExcelBirthDate("15/05/2014")).toEqual({ value: "15-05-2014" });
    expect(parseExcelBirthDate("15-05-2014")).toEqual({ value: "15-05-2014" });
    expect(parseExcelBirthDate("15.05.2014")).toEqual({ value: "15-05-2014" });
    expect(parseExcelBirthDate("2014-05-15")).toEqual({ value: "15-05-2014" });
    expect(parseExcelBirthDate("5/3/2014")).toEqual({ value: "05-03-2014" });
  });

  it("7. convertit un numéro de série numérique Excel et un objet Date JS en DD-MM-YYYY", () => {
    // 41774 dans le calendrier Excel 1900 correspond exactement au 15-05-2014
    expect(parseExcelBirthDate(41774)).toEqual({ value: "15-05-2014" });
    expect(parseExcelBirthDate("41774")).toEqual({ value: "15-05-2014" });
    expect(parseExcelBirthDate(new Date(Date.UTC(2014, 4, 15)))).toEqual({ value: "15-05-2014" });
  });

  it("8. accepte une date de naissance vide sans erreur ni avertissement", () => {
    const preview = parseInventoryRows(
      [{ Prénom: "Noé", Nom: "Bernard", "Date de naissance": "" }],
      MOCK_CATALOG
    );
    expect(preview.rows[0].birthDate).toBe("");
    expect(preview.rows[0].status).toBe("VALID");
    expect(preview.rows[0].warnings).toEqual([]);
  });

  it("9. signale une date de naissance invalide en WARNING sans faire planter l'import", () => {
    const r1 = parseExcelBirthDate("32/13/2014");
    expect(r1.value).toBe("");
    expect(r1.warning).toContain("invalide");

    const r2 = parseExcelBirthDate("inconnue");
    expect(r2.value).toBe("");
    expect(r2.warning).toContain("non reconnu");

    const preview = parseInventoryRows(
      [{ Prénom: "Lina", Nom: "Morel", "Date de naissance": "31/02/2015" }],
      MOCK_CATALOG
    );
    expect(preview.rows[0].status).toBe("WARNING");
    expect(preview.rows[0].birthDate).toBe("");
  });

  // --- BLOC 3 : Paiement & statut de distribution (Tests 10 à 12) ---

  it("10. reconnaît toutes les variantes vraies et fausses de paiement", () => {
    for (const val of ["Oui", "OUI", "OK", "Payé", "Réglé", "Validé", "True", "1", "X", true, 1]) {
      expect(parseExcelBoolean(val, "Paiement")).toEqual({ value: true });
    }
    for (const val of ["Non", "NON", "Impayé", "En attente", "False", "0", "", false, 0, null]) {
      expect(parseExcelBoolean(val, "Paiement")).toEqual({ value: false });
    }
  });

  it("11. traite une valeur de paiement ambiguë comme false avec un WARNING", () => {
    const preview = parseInventoryRows(
      [{ Prénom: "Hugo", Nom: "Roux", Paiement: "Chèque en cours" }],
      MOCK_CATALOG
    );
    expect(preview.rows[0].paymentOk).toBe(false);
    expect(preview.rows[0].status).toBe("WARNING");
    expect(preview.rows[0].warnings.some((w) => w.includes("ambiguë"))).toBe(true);
  });

  it("12. gère les colonnes optionnelles '* distribué' et force à false si aucun article valide n'est associé", () => {
    const preview = parseInventoryRows(
      [
        {
          Prénom: "Clara",
          Nom: "Simon",
          Polo: "Polo Adulte M",
          "Polo distribué": "Oui",
          Veste: "",
          "Veste distribuée": "Oui", // Incohérent : distribuée sans veste !
        },
      ],
      MOCK_CATALOG
    );

    const row = preview.rows[0];
    expect(row.poloItemId).toBe(2);
    expect(row.poloDistributed).toBe(true);
    expect(row.vesteItemId).toBeNull();
    expect(row.vesteDistributed).toBe(false);
    expect(row.status).toBe("WARNING");
    expect(row.warnings.some((w) => w.includes("sans article Veste valide"))).toBe(true);
  });

  // --- BLOC 4 : Correspondance catalogue d'équipements (Tests 13 à 15) ---

  it("13. associe les articles du catalogue indépendamment de la casse, des accents et des espaces multiples", () => {
    const preview = parseInventoryRows(
      [
        {
          Prénom: "Tom",
          Nom: "Laurent",
          Polo: "  polo   adulte  m ",
          Divers: "sac marseille echecs",
        },
      ],
      MOCK_CATALOG
    );

    expect(preview.rows[0].status).toBe("VALID");
    expect(preview.rows[0].poloItemId).toBe(2);
    expect(preview.rows[0].diversItemId).toBe(5);
  });

  it("14. traite 'Aucun', 'Non', '-', 'N/A', 'RAS', '0' comme null sans faux avertissement", () => {
    const preview = parseInventoryRows(
      [
        { Prénom: "A", Nom: "Un", Polo: "Aucun", Veste: "-", Divers: "N/A" },
        { Prénom: "B", Nom: "Deux", Polo: "Non", Veste: "RAS", Divers: "0" },
      ],
      MOCK_CATALOG
    );

    expect(preview.summary.validCount).toBe(2);
    expect(preview.summary.warningCount).toBe(0);
    expect(preview.unknownItems).toEqual([]);
    expect(preview.rows[0].poloItemId).toBeNull();
    expect(preview.rows[0].vesteItemId).toBeNull();
    expect(preview.rows[0].diversItemId).toBeNull();
  });

  it("15. remonte un WARNING et alimente unknownItems pour un article inconnu ou placé dans une mauvaise catégorie", () => {
    const preview = parseInventoryRows(
      [
        { Prénom: "Léo", Nom: "Garnier", Polo: "Polo XXL", Veste: "Veste Club M" },
        { Prénom: "Mia", Nom: "Faure", Polo: "Veste Club M" }, // Mauvaise catégorie !
      ],
      MOCK_CATALOG
    );

    expect(preview.summary.warningCount).toBe(2);
    expect(preview.rows[0].poloItemId).toBeNull();
    expect(preview.rows[0].vesteItemId).toBe(3);
    expect(preview.rows[1].poloItemId).toBeNull();

    expect(preview.unknownItems).toEqual([
      { category: "POLO", rawValue: "Polo XXL", count: 1 },
      { category: "POLO", rawValue: "Veste Club M", count: 1 },
    ]);
  });

  // --- BLOC 5 : Doublons, fichiers limites & lecture binaire .xlsx (Tests 16 à 18) ---

  it("16. détecte les doublons internes dans le même fichier même avec casse/accents différents", () => {
    const preview = parseInventoryRows(
      [
        { Prénom: "Chloé", Nom: "Dupont", "Date de naissance": "10/04/2013", Polo: "Polo Adulte M" },
        { Prénom: "chloe", Nom: "DUPONT", "Date de naissance": "10-04-2013", Polo: "Polo Adulte M" },
      ],
      MOCK_CATALOG
    );

    expect(preview.summary.duplicateInFileCount).toBe(1);
    expect(preview.rows[0].isDuplicateInFile).toBe(false);
    expect(preview.rows[0].status).toBe("VALID");
    expect(preview.rows[1].isDuplicateInFile).toBe(true);
    expect(preview.rows[1].status).toBe("WARNING");
  });

  it("17. gère proprement un fichier vide et ignore les colonnes parasites", () => {
    const empty = parseInventoryRows([], MOCK_CATALOG);
    expect(empty.summary).toEqual({
      totalRows: 0,
      validCount: 0,
      warningCount: 0,
      errorCount: 0,
      importableCount: 0,
      ignoredEmptyRows: 0,
      duplicateInFileCount: 0,
    });

    const withNoise = parseInventoryRows(
      [
        {
          Prénom: "Noah",
          Nom: "Blanc",
          Téléphone: "0600000000",
          Adresse: "12 rue de Marseille",
          Commentaire: "Allergie",
          Polo: "Polo Adulte M",
        },
      ],
      MOCK_CATALOG
    );
    expect(withNoise.rows[0].status).toBe("VALID");
    expect(withNoise.rows[0].poloItemId).toBe(2);
  });

  it("18. lit de bout en bout un vrai buffer binaire .xlsx généré par SheetJS", () => {
    const sheetData = [
      ["Prénom", "Nom", "Date de naissance", "Paiement", "Polo", "Veste", "Divers"],
      ["Maxime", "Chukhno", 41774, "Oui", "Polo Enfant 10 ans", "Veste Club M", "Aucun"],
      ["Sarah", "Benali", "20/11/2011", "Non", "Polo Inconnu", "", "Sac Marseille-Échecs"],
      ["", "Incomplet", "", "Oui", "", "", ""],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, "Inscriptions");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const preview = parseInventoryExcelBuffer(buffer, MOCK_CATALOG);

    expect(preview.summary).toEqual({
      totalRows: 3,
      validCount: 1,
      warningCount: 1,
      errorCount: 1,
      importableCount: 2,
      ignoredEmptyRows: 0,
      duplicateInFileCount: 0,
    });
    expect(preview.rows[0]).toMatchObject({
      rowNumber: 2,
      firstname: "Maxime",
      lastname: "CHUKHNO",
      birthDate: "15-05-2014",
      paymentOk: true,
      poloItemId: 1,
      poloDistributed: false,
      vesteItemId: 3,
      diversItemId: null,
      status: "VALID",
    });
    expect(preview.rows[1].status).toBe("WARNING");
    expect(preview.rows[2].status).toBe("ERROR");
    expect(preview.unknownItems).toEqual([{ category: "POLO", rawValue: "Polo Inconnu", count: 1 }]);
  });
});
