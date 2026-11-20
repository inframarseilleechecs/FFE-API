/**
 * Parseur intelligent d'import Excel / CSV pour le module Inventaire & Équipements
 * Produit un modèle complet de prévisualisation (InventoryImportPreview) sans écriture en base.
 * Auteur : Sergey CHUKHNO
 */

import * as XLSX from "xlsx";
import { EquipmentCategory, EquipmentItemRecord } from "../db/schema";
import { sanitizeExcelString, splitCombinedName } from "./excel_batch";

export type ImportRowStatus = "VALID" | "WARNING" | "ERROR";

export type CatalogItemRef = Pick<EquipmentItemRecord, "id" | "category" | "type">;

export interface InventoryPreviewRow {
  rowNumber: number; // Numéro de ligne Excel (1 = en-tête, données à partir de 2)
  firstname: string;
  lastname: string;
  birthDate: string; // Format DD-MM-YYYY ou ""
  paymentOk: boolean;
  poloItemId: number | null;
  poloLabel: string | null;
  poloDistributed: boolean;
  vesteItemId: number | null;
  vesteLabel: string | null;
  vesteDistributed: boolean;
  diversItemId: number | null;
  diversLabel: string | null;
  diversDistributed: boolean;
  status: ImportRowStatus;
  warnings: string[];
  errors: string[];
  isDuplicateInFile: boolean;
}

export interface UnknownEquipmentWarning {
  category: EquipmentCategory;
  rawValue: string;
  count: number;
}

export interface InventoryImportPreview {
  detectedColumns: {
    firstname?: string;
    lastname?: string;
    combinedName?: string;
    birthDate?: string;
    payment?: string;
    polo?: string;
    poloDistributed?: string;
    veste?: string;
    vesteDistributed?: string;
    divers?: string;
    diversDistributed?: string;
  };
  rows: InventoryPreviewRow[];
  unknownItems: UnknownEquipmentWarning[];
  summary: {
    totalRows: number;
    validCount: number;
    warningCount: number;
    errorCount: number;
    importableCount: number; // validCount + warningCount
    ignoredEmptyRows: number;
    duplicateInFileCount: number;
  };
}

/**
 * Normalise une chaîne pour comparaison insensible à la casse, aux accents et à la ponctuation.
 */
function normalizeKey(str: string): string {
  return sanitizeExcelString(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeCatalogText(str: string): string {
  return sanitizeExcelString(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NONE_EQUIPMENT_VALUES = new Set([
  "",
  "aucun",
  "aucune",
  "non",
  "no",
  "none",
  "neant",
  "ras",
  "na",
  "n/a",
  "-",
  "--",
  "0",
  "pasde",
  "sans",
]);

const TRUE_BOOL_VALUES = new Set([
  "oui",
  "o",
  "yes",
  "y",
  "ok",
  "paye",
  "payee",
  "regle",
  "reglee",
  "valide",
  "validee",
  "remis",
  "remise",
  "distribue",
  "distribuee",
  "true",
  "vrai",
  "1",
  "x",
  "✓",
  "✔",
]);

const FALSE_BOOL_VALUES = new Set([
  "",
  "non",
  "n",
  "no",
  "ko",
  "impaye",
  "impayee",
  "enattente",
  "attente",
  "nonpaye",
  "nonregle",
  "nondistribue",
  "false",
  "faux",
  "0",
  "-",
  "na",
  "n/a",
]);

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Convertit une valeur de date Excel (string, Date JS, ou numéro de série Excel)
 * vers le format canonique "DD-MM-YYYY".
 */
export function parseExcelBirthDate(raw: unknown): { value: string; warning?: string } {
  if (raw === null || raw === undefined) return { value: "" };

  // 1. Objet Date JavaScript natif
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) {
      return { value: "", warning: "Date de naissance invalide" };
    }
    const y = raw.getUTCFullYear();
    const m = raw.getUTCMonth() + 1;
    const d = raw.getUTCDate();
    return { value: `${pad2(d)}-${pad2(m)}-${y}` };
  }

  // 2. Numéro de série numérique Excel (ex: 41774 -> 15-05-2014)
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw < 1 || raw > 80000) {
      return { value: "", warning: `Date numérique Excel hors plage (${raw})` };
    }
    const excelEpochUtc = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpochUtc + Math.round(raw) * 86400000);
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    return { value: `${pad2(d)}-${pad2(m)}-${y}` };
  }

  const str = sanitizeExcelString(raw);
  if (!str) return { value: "" };

  // Si chaîne purement numérique (ex: "41774")
  if (/^\d{4,5}$/.test(str)) {
    const num = Number(str);
    if (num >= 1 && num <= 80000) {
      return parseExcelBirthDate(num);
    }
  }

  // 3. Format ISO : YYYY-MM-DD (ou YYYY/MM/DD ou ISO datetime)
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (isValidCalendarDate(year, month, day)) {
      return { value: `${pad2(day)}-${pad2(month)}-${year}` };
    }
    return { value: "", warning: `Date de naissance invalide : "${str}"` };
  }

  // 4. Format FR : DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const frMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (frMatch) {
    const day = Number(frMatch[1]);
    const month = Number(frMatch[2]);
    const year = Number(frMatch[3]);
    if (isValidCalendarDate(year, month, day)) {
      return { value: `${pad2(day)}-${pad2(month)}-${year}` };
    }
    return { value: "", warning: `Date de naissance invalide : "${str}"` };
  }

  return { value: "", warning: `Format de date non reconnu : "${str}"` };
}

/**
 * Interprète une valeur booléenne issue d'Excel (paiement, distribué).
 */
export function parseExcelBoolean(
  raw: unknown,
  fieldLabel: string
): { value: boolean; warning?: string } {
  if (raw === null || raw === undefined) return { value: false };
  if (typeof raw === "boolean") return { value: raw };
  if (typeof raw === "number") {
    if (raw === 1) return { value: true };
    if (raw === 0) return { value: false };
    return { value: false, warning: `Valeur ${fieldLabel} ambiguë : "${raw}"` };
  }

  const clean = sanitizeExcelString(raw);
  if (!clean) return { value: false };

  const norm = normalizeKey(clean);
  if (TRUE_BOOL_VALUES.has(norm) || TRUE_BOOL_VALUES.has(clean)) {
    return { value: true };
  }
  if (FALSE_BOOL_VALUES.has(norm) || FALSE_BOOL_VALUES.has(clean.toLowerCase())) {
    return { value: false };
  }

  return {
    value: false,
    warning: `Valeur ${fieldLabel} ambiguë : "${clean}" (traitée comme Non)`,
  };
}

/**
 * Associe un texte d'équipement issu d'Excel à un article du catalogue dans la catégorie attendue.
 */
function matchCatalogItem(
  rawVal: unknown,
  category: EquipmentCategory,
  catalogIndex: Map<string, CatalogItemRef>
): { itemId: number | null; label: string | null; unknownRaw?: string } {
  const clean = sanitizeExcelString(rawVal);
  if (!clean) return { itemId: null, label: null };

  const normKey = normalizeKey(clean);
  if (NONE_EQUIPMENT_VALUES.has(normKey) || NONE_EQUIPMENT_VALUES.has(clean.toLowerCase())) {
    return { itemId: null, label: null };
  }

  const lookupKey = `${category}::${normalizeCatalogText(clean)}`;
  const match = catalogIndex.get(lookupKey);
  if (match) {
    return { itemId: match.id, label: match.type };
  }

  return { itemId: null, label: null, unknownRaw: clean };
}

type ColumnRole =
  | "firstname"
  | "lastname"
  | "combinedName"
  | "birthDate"
  | "payment"
  | "polo"
  | "poloDistributed"
  | "veste"
  | "vesteDistributed"
  | "divers"
  | "diversDistributed";

function classifyHeader(rawHeader: string): ColumnRole | null {
  const key = normalizeKey(rawHeader);
  if (!key) return null;

  // 1. Colonnes de statut distribué (vérifiées EN PREMIER avant polo/veste/divers)
  const isDistCol =
    key.includes("distribue") ||
    key.includes("distributed") ||
    key.includes("remis");

  if (isDistCol && key.includes("polo")) return "poloDistributed";
  if (isDistCol && key.includes("veste")) return "vesteDistributed";
  if (isDistCol && key.includes("divers")) return "diversDistributed";

  // 2. Colonnes d'équipement
  if (key.includes("polo") || key.includes("tshirt") || key.includes("maillot")) return "polo";
  if (key.includes("veste") || key.includes("sweat") || key.includes("jacket")) return "veste";
  if (key.includes("divers") || key.includes("autre") || key.includes("accessoire")) return "divers";

  // 3. Date de naissance
  if (
    key.includes("naissance") ||
    key.includes("birthdate") ||
    key.includes("dob") ||
    key.includes("neele") ||
    key.includes("nele") ||
    key === "date"
  ) {
    return "birthDate";
  }

  // 4. Paiement
  if (
    key.includes("paiement") ||
    key.includes("payment") ||
    key.includes("reglement") ||
    key.includes("regle") ||
    key.includes("paye")
  ) {
    return "payment";
  }

  // 5. Identité (ordre strict : combiné avant prénom, et prénom avant nom)
  if (key.includes("prenom") || key.includes("firstname")) {
    if (key.replace("prenom", "").includes("nom")) {
      return "combinedName";
    }
    return "firstname";
  }

  if (
    key.includes("nomcomplet") ||
    key.includes("fullname") ||
    key.includes("joueur") ||
    key.includes("participant") ||
    key.includes("adherent") ||
    key.includes("membre")
  ) {
    return "combinedName";
  }

  if (key.includes("nom") || key.includes("lastname") || key.includes("famille")) {
    return "lastname";
  }

  return null;
}

/**
 * Analyse un tableau de lignes JSON (ex. issu de XLSX.utils.sheet_to_json)
 * et produit le modèle complet de prévisualisation (InventoryImportPreview).
 */
export function parseInventoryRows(
  rawRows: Record<string, unknown>[],
  catalogItems: CatalogItemRef[]
): InventoryImportPreview {
  const detectedColumns: InventoryImportPreview["detectedColumns"] = {};
  const rows: InventoryPreviewRow[] = [];
  const unknownMap = new Map<string, UnknownEquipmentWarning>();
  const seenPlayers = new Set<string>();

  let ignoredEmptyRows = 0;

  // Construction de l'index catalogue normalisé (O(1) par lookup)
  const catalogIndex = new Map<string, CatalogItemRef>();
  for (const item of catalogItems) {
    catalogIndex.set(`${item.category}::${normalizeCatalogText(item.type)}`, item);
  }

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return {
      detectedColumns,
      rows: [],
      unknownItems: [],
      summary: {
        totalRows: 0,
        validCount: 0,
        warningCount: 0,
        errorCount: 0,
        importableCount: 0,
        ignoredEmptyRows: 0,
        duplicateInFileCount: 0,
      },
    };
  }

  // Pré-détection des colonnes sur l'ensemble des clés rencontrées
  const headerRoleMap = new Map<string, ColumnRole>();
  for (const rawRow of rawRows) {
    for (const rawKey of Object.keys(rawRow)) {
      if (!headerRoleMap.has(rawKey)) {
        const role = classifyHeader(rawKey);
        if (role) {
          headerRoleMap.set(rawKey, role);
          if (!detectedColumns[role]) {
            detectedColumns[role] = rawKey;
          }
        }
      }
    }
  }

  const recordUnknown = (category: EquipmentCategory, rawValue: string) => {
    const k = `${category}::${normalizeCatalogText(rawValue)}`;
    const existing = unknownMap.get(k);
    if (existing) {
      existing.count++;
    } else {
      unknownMap.set(k, { category, rawValue, count: 1 });
    }
  };

  for (let idx = 0; idx < rawRows.length; idx++) {
    const rawRow = rawRows[idx];
    const rowNumber = idx + 2; // Ligne 1 = en-têtes Excel

    // Vérifier si la ligne est totalement vide
    const hasAnyValue = Object.values(rawRow).some((v) => {
      if (v === null || v === undefined) return false;
      if (typeof v === "string") return sanitizeExcelString(v).length > 0;
      return true;
    });
    if (!hasAnyValue) {
      ignoredEmptyRows++;
      continue;
    }

    let firstname = "";
    let lastname = "";
    let combinedName = "";
    let rawBirthDate: unknown = undefined;
    let rawPayment: unknown = undefined;
    let rawPolo: unknown = undefined;
    let rawPoloDist: unknown = undefined;
    let rawVeste: unknown = undefined;
    let rawVesteDist: unknown = undefined;
    let rawDivers: unknown = undefined;
    let rawDiversDist: unknown = undefined;

    for (const [rawKey, rawVal] of Object.entries(rawRow)) {
      const role = headerRoleMap.get(rawKey);
      if (!role) continue;

      switch (role) {
        case "firstname":
          firstname = sanitizeExcelString(rawVal);
          break;
        case "lastname":
          lastname = sanitizeExcelString(rawVal);
          break;
        case "combinedName":
          combinedName = sanitizeExcelString(rawVal);
          break;
        case "birthDate":
          rawBirthDate = rawVal;
          break;
        case "payment":
          rawPayment = rawVal;
          break;
        case "polo":
          rawPolo = rawVal;
          break;
        case "poloDistributed":
          rawPoloDist = rawVal;
          break;
        case "veste":
          rawVeste = rawVal;
          break;
        case "vesteDistributed":
          rawVesteDist = rawVal;
          break;
        case "divers":
          rawDivers = rawVal;
          break;
        case "diversDistributed":
          rawDiversDist = rawVal;
          break;
      }
    }

    if (combinedName && (!firstname || !lastname)) {
      const split = splitCombinedName(combinedName);
      if (!lastname) lastname = split.nom;
      if (!firstname) firstname = split.prenom;
    }

    lastname = lastname.toUpperCase();

    const warnings: string[] = [];
    const errors: string[] = [];

    if (!firstname) {
      errors.push("Prénom manquant");
    }
    if (!lastname) {
      errors.push("Nom manquant");
    }

    // Date de naissance
    const birthParsed = parseExcelBirthDate(rawBirthDate);
    if (birthParsed.warning) warnings.push(birthParsed.warning);

    // Paiement
    const paymentParsed = parseExcelBoolean(rawPayment, "Paiement");
    if (paymentParsed.warning) warnings.push(paymentParsed.warning);

    // Équipements & distributions
    const poloMatch = matchCatalogItem(rawPolo, "POLO", catalogIndex);
    if (poloMatch.unknownRaw) {
      warnings.push(`Polo inconnu dans le catalogue : "${poloMatch.unknownRaw}"`);
      recordUnknown("POLO", poloMatch.unknownRaw);
    }
    const poloDistParsed = parseExcelBoolean(rawPoloDist, "Polo distribué");
    if (poloDistParsed.warning) warnings.push(poloDistParsed.warning);
    let poloDistributed = poloDistParsed.value;
    if (poloDistributed && !poloMatch.itemId) {
      poloDistributed = false;
      warnings.push("Polo marqué distribué sans article Polo valide (forcé à Non)");
    }

    const vesteMatch = matchCatalogItem(rawVeste, "VESTE", catalogIndex);
    if (vesteMatch.unknownRaw) {
      warnings.push(`Veste inconnue dans le catalogue : "${vesteMatch.unknownRaw}"`);
      recordUnknown("VESTE", vesteMatch.unknownRaw);
    }
    const vesteDistParsed = parseExcelBoolean(rawVesteDist, "Veste distribuée");
    if (vesteDistParsed.warning) warnings.push(vesteDistParsed.warning);
    let vesteDistributed = vesteDistParsed.value;
    if (vesteDistributed && !vesteMatch.itemId) {
      vesteDistributed = false;
      warnings.push("Veste marquée distribuée sans article Veste valide (forcé à Non)");
    }

    const diversMatch = matchCatalogItem(rawDivers, "DIVERS", catalogIndex);
    if (diversMatch.unknownRaw) {
      warnings.push(`Article Divers inconnu dans le catalogue : "${diversMatch.unknownRaw}"`);
      recordUnknown("DIVERS", diversMatch.unknownRaw);
    }
    const diversDistParsed = parseExcelBoolean(rawDiversDist, "Divers distribué");
    if (diversDistParsed.warning) warnings.push(diversDistParsed.warning);
    let diversDistributed = diversDistParsed.value;
    if (diversDistributed && !diversMatch.itemId) {
      diversDistributed = false;
      warnings.push("Article Divers marqué distribué sans article valide (forcé à Non)");
    }

    // Détection doublon interne dans le même fichier
    let isDuplicateInFile = false;
    if (firstname && lastname) {
      const dedupKey = `${normalizeKey(firstname)}|${normalizeKey(lastname)}|${birthParsed.value}`;
      if (seenPlayers.has(dedupKey)) {
        isDuplicateInFile = true;
        warnings.push("Doublon détecté dans le fichier Excel (sera fusionné à l'import)");
      } else {
        seenPlayers.add(dedupKey);
      }
    }

    const status: ImportRowStatus =
      errors.length > 0 ? "ERROR" : warnings.length > 0 ? "WARNING" : "VALID";

    rows.push({
      rowNumber,
      firstname,
      lastname,
      birthDate: birthParsed.value,
      paymentOk: paymentParsed.value,
      poloItemId: poloMatch.itemId,
      poloLabel: poloMatch.label,
      poloDistributed,
      vesteItemId: vesteMatch.itemId,
      vesteLabel: vesteMatch.label,
      vesteDistributed,
      diversItemId: diversMatch.itemId,
      diversLabel: diversMatch.label,
      diversDistributed,
      status,
      warnings,
      errors,
      isDuplicateInFile,
    });
  }

  const validCount = rows.filter((r) => r.status === "VALID").length;
  const warningCount = rows.filter((r) => r.status === "WARNING").length;
  const errorCount = rows.filter((r) => r.status === "ERROR").length;
  const duplicateInFileCount = rows.filter((r) => r.isDuplicateInFile).length;

  return {
    detectedColumns,
    rows,
    unknownItems: Array.from(unknownMap.values()),
    summary: {
      totalRows: rows.length,
      validCount,
      warningCount,
      errorCount,
      importableCount: validCount + warningCount,
      ignoredEmptyRows,
      duplicateInFileCount,
    },
  };
}

/**
 * Lit un buffer binaire Excel (.xlsx / .xls / .csv) et produit directement la prévisualisation.
 */
export function parseInventoryExcelBuffer(
  buffer: Buffer | Uint8Array | ArrayBuffer,
  catalogItems: CatalogItemRef[]
): InventoryImportPreview {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return parseInventoryRows([], catalogItems);
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  return parseInventoryRows(rawRows, catalogItems);
}
