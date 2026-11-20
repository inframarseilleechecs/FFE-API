# Documentation Détaillée des 18 Tests Unitaires — Parseur Excel Inventaire

> **Fichier de test :** [inventory_excel.test.ts](file:///Users/sergeychukhno/Desktop/RecupFFE/src/lib/parser/__tests__/inventory_excel.test.ts)  
> **Code testé :** [inventory_excel.ts](file:///Users/sergeychukhno/Desktop/RecupFFE/src/lib/parser/inventory_excel.ts)  
> **Commande d'exécution :** `npm test` (Vitest)  
> **Catalogue de référence utilisé dans les tests :**
> - `POLO` : `#1 Polo Enfant 10 ans`, `#2 Polo Adulte M`
> - `VESTE` : `#3 Veste Club M`, `#4 Veste Club L`
> - `DIVERS` : `#5 Sac Marseille-Échecs`

---

## Bloc 1 — Identité, colonnes & propreté des données (Tests 1 à 5)

### Test 1 — Fichier standard avec colonnes séparées
- **Objectif métier :** Valider le scénario nominal d'un fichier d'inscriptions de début de saison proprement formaté.
- **Données d'entrée :** 1 ligne avec `Prénom: "Maxime"`, `Nom: "Chukhno"`, `Date de naissance: "15/05/2014"`, `Paiement: "Oui"`, `Polo: "Polo Enfant 10 ans"`, `Veste: "Veste Club M"`, `Divers: "Sac Marseille-Échecs"`.
- **Résultat attendu & assertions :**
  - `summary`: `totalRows = 1`, `validCount = 1`, `warningCount = 0`, `errorCount = 0`, `unknownItems = []`.
  - Ligne Excel `rowNumber = 2`, `lastname` normalisé en `"CHUKHNO"`, `birthDate = "15-05-2014"`, `paymentOk = true`.
  - Équipements associés aux bons IDs (`poloItemId = 1`, `vesteItemId = 3`, `diversItemId = 5`) et **tous les statuts `*_distributed` initialisés à `false`** (équipements dus, non encore remis).

### Test 2 — Variations d'en-têtes (français/anglais, accents, casse)
- **Objectif métier :** Éviter que le responsable doive renommer les colonnes d'un export HelloAsso ou d'un tableau personnel.
- **Données d'entrée :** En-têtes variés : `FIRSTNAME`, `Nom de famille`, `Né(e) le`, `Règlement`, `Taille Polo`.
- **Résultat attendu & assertions :**
  - `detectedColumns` mappe exactement chaque en-tête source au bon rôle interne.
  - La ligne passe en `VALID` avec `Alice MARTIN`, `03-09-2012`, `paymentOk = true`, `poloItemId = 2`.

### Test 3 — Colonne combinée `Nom & Prénom` avec particules et noms composés
- **Objectif métier :** Gérer les fichiers qui regroupent le nom et le prénom dans une seule cellule.
- **Données d'entrée :** `"CHUKHNO Maxime"`, `"DE LA ROCHE Jean-Luc"`, `"ADJEROUD-SAADE Aksel"`.
- **Résultat attendu & assertions :**
  - Découpage exact sans perdre les particules ni les traits d'union :
    - `lastname: "CHUKHNO"`, `firstname: "Maxime"`
    - `lastname: "DE LA ROCHE"`, `firstname: "Jean-Luc"`
    - `lastname: "ADJEROUD-SAADE"`, `firstname: "Aksel"`
  - Toutes les lignes sont `VALID`.

### Test 4 — Caractères parasites Excel
- **Objectif métier :** Empêcher les échecs silencieux causés par des copier-coller depuis Word, mails ou exports web.
- **Données d'entrée :** `Prénom: "  Léo\u00A0"`, `Nom: "D’ARBOIS\r\n\t"`, `Polo: "Polo\u00A0Adulte\tM "` (espaces insécables, retours chariot, tabulations, apostrophe typographique courbe `’`).
- **Résultat attendu & assertions :**
  - Nettoyage en `"Léo"`, `"D'ARBOIS"`, et correspondance réussie sur `poloItemId = 2` en statut `VALID`.

### Test 5 — Lignes totalement vides & lignes incomplètes (`ERROR`)
- **Objectif métier :** Protéger la base de données contre les fiches sans identité complète sans bloquer l'import des autres joueurs du fichier.
- **Données d'entrée :** 4 lignes — 1 vide, 1 sans nom (`Lucas`), 1 sans prénom (`DURAND`), 1 complète (`Emma Petit`).
- **Résultat attendu & assertions :**
  - `ignoredEmptyRows = 1` (la ligne vide n'apparaît pas en erreur).
  - Les 2 lignes incomplètes passent en statut `ERROR` avec les messages `"Nom manquant"` et `"Prénom manquant"`.
  - `importableCount = 1` (seule `Emma PETIT` sera importée à la confirmation).

---

## Bloc 2 — Formats de dates de naissance (Tests 6 à 9)

### Test 6 — Formats texte usuels et jours/mois à 1 chiffre
- **Objectif métier :** Garantir un format uniforme `DD-MM-YYYY` quelle que soit la saisie manuelle dans Excel.
- **Données d'entrée :** `"15/05/2014"`, `"15-05-2014"`, `"15.05.2014"`, `"2014-05-15"`, `"5/3/2014"`.
- **Résultat attendu & assertions :**
  - Tous convertis en `"15-05-2014"` (et `"05-03-2014"` pour `"5/3/2014"`), sans aucun avertissement.

### Test 7 — Numéro de série numérique Excel & objet `Date` JS
- **Objectif métier :** Excel stocke nativement les dates en nombre de jours depuis le 30/12/1899 (ex. `41774`) ; le parseur doit les décoder sans décalage de fuseau horaire.
- **Données d'entrée :** `41774` (number), `"41774"` (string), et `new Date(Date.UTC(2014, 4, 15))`.
- **Résultat attendu & assertions :**
  - Tous convertis exactement en `"15-05-2014"`.

### Test 8 — Date de naissance vide
- **Objectif métier :** Permettre d'importer un joueur même si sa date de naissance n'a pas encore été collectée.
- **Données d'entrée :** `Date de naissance: ""`.
- **Résultat attendu & assertions :**
  - `birthDate = ""`, statut `VALID`, `warnings = []`.

### Test 9 — Date de naissance invalide
- **Objectif métier :** Détecter les fautes de frappe calendaires sans faire planter l'importation du joueur.
- **Données d'entrée :** `"32/13/2014"`, `"inconnue"`, `"31/02/2015"` (jour inexistant en février).
- **Résultat attendu & assertions :**
  - `birthDate` ramenée à `""`, ligne marquée `WARNING` avec un message explicite visible dans le prévisualiseur.

---

## Bloc 3 — Paiement & statut de distribution (Tests 10 à 12)

### Test 10 — Variantes booléennes vraies et fausses de paiement
- **Objectif métier :** Accepter toutes les habitudes de saisie humaine pour le champ `Paiement`.
- **Données d'entrée :**
  - Vraies : `"Oui"`, `"OUI"`, `"OK"`, `"Payé"`, `"Réglé"`, `"Validé"`, `"True"`, `"1"`, `"X"`, `true`, `1`.
  - Fausses : `"Non"`, `"NON"`, `"Impayé"`, `"En attente"`, `"False"`, `"0"`, `""`, `false`, `0`, `null`.
- **Résultat attendu & assertions :**
  - Toutes converties exactement en `true` ou `false` sans avertissement.

### Test 11 — Valeur de paiement ambiguë
- **Objectif métier :** Ne jamais valider un paiement à tort si la cellule contient un texte libre incertain.
- **Données d'entrée :** `Paiement: "Chèque en cours"`.
- **Résultat attendu & assertions :**
  - `paymentOk = false` par sécurité, statut `WARNING` avec le message signalant la valeur ambiguë.

### Test 12 — Colonnes optionnelles `* distribué` & cohérence métier
- **Objectif métier :** Permettre d'importer un fichier contenant déjà des remises effectuées, tout en empêchant de cocher « distribué » sans article valide.
- **Données d'entrée :** `Polo: "Polo Adulte M"` + `Polo distribué: "Oui"` ; `Veste: ""` + `Veste distribuée: "Oui"`.
- **Résultat attendu & assertions :**
  - `poloItemId = 2` et `poloDistributed = true`.
  - `vesteItemId = null` et `vesteDistributed` forcé à `false` avec `WARNING` explicite (`"sans article Veste valide"`).

---

## Bloc 4 — Correspondance catalogue d'équipements (Tests 13 à 15)

### Test 13 — Matching catalogue insensible à la casse, aux accents et aux espaces
- **Objectif métier :** Éviter les rejets pour une différence mineure d'écriture entre le fichier Excel et le catalogue.
- **Données d'entrée :** `Polo: "  polo   adulte  m "`, `Divers: "sac marseille echecs"`.
- **Résultat attendu & assertions :**
  - Correspondance exacte sur `poloItemId = 2` et `diversItemId = 5`, statut `VALID`.

### Test 14 — Valeurs signifiant « aucun équipement »
- **Objectif métier :** Éviter de polluer le prévisualiseur avec de faux avertissements « article inconnu » lorsqu'un joueur n'a pas commandé un équipement.
- **Données d'entrée :** `"Aucun"`, `"-"`, `"N/A"`, `"Non"`, `"RAS"`, `"0"`.
- **Résultat attendu & assertions :**
  - Tous convertis en `null`, `validCount = 2`, `warningCount = 0`, `unknownItems = []`.

### Test 15 — Article inconnu ou placé dans une mauvaise catégorie
- **Objectif métier :** Alerter le responsable dans le prévisualiseur s'il faut créer une nouvelle taille/article dans le catalogue avant d'importer (ou corriger une colonne inversée).
- **Données d'entrée :** `Polo: "Polo XXL"` (absent du catalogue) et `Polo: "Veste Club M"` (article existant mais dans la catégorie `VESTE`).
- **Résultat attendu & assertions :**
  - Les 2 lignes passent en `WARNING`, `poloItemId = null` (tandis que les autres colonnes valides de la ligne restent conservées).
  - `unknownItems` recense précisément `Polo XXL` et `Veste Club M` sous la catégorie `POLO` avec leur compteur d'occurrences.

---

## Bloc 5 — Doublons, fichiers limites & lecture binaire `.xlsx` (Tests 16 à 18)

### Test 16 — Détection des doublons internes au fichier
- **Objectif métier :** Prévenir le responsable si un adhérent apparaît deux fois dans le même export (ex. double inscription HelloAsso).
- **Données d'entrée :** `Chloé Dupont (10/04/2013)` puis `chloe DUPONT (10-04-2013)`.
- **Résultat attendu & assertions :**
  - `summary.duplicateInFileCount = 1`.
  - Première ligne `VALID` (`isDuplicateInFile = false`), seconde ligne `WARNING` (`isDuplicateInFile = true`, signalant la fusion à l'import).

### Test 17 — Fichier vide & colonnes parasites
- **Objectif métier :** Garantir la robustesse face à un fichier vierge ou un export contenant des dizaines de colonnes administratives inutiles.
- **Données d'entrée :** Un tableau vide `[]`, puis une ligne contenant `Téléphone`, `Adresse`, `Commentaire` en plus des colonnes inventaire.
- **Résultat attendu & assertions :**
  - Fichier vide : tous les compteurs du `summary` à `0`, aucune exception.
  - Colonnes parasites ignorées silencieusement, ligne reconnue en `VALID`.

### Test 18 — Lecture de bout en bout d'un vrai buffer binaire `.xlsx`
- **Objectif métier :** Valider la chaîne complète `Buffer .xlsx` → `SheetJS (XLSX.read)` → `parseInventoryRows` → `InventoryImportPreview`.
- **Données d'entrée :** Véritable classeur `.xlsx` généré en mémoire contenant 3 lignes (1 `VALID` avec date numérique Excel `41774`, 1 `WARNING` avec `"Polo Inconnu"`, 1 `ERROR` sans prénom).
- **Résultat attendu & assertions :**
  - `summary` exact : `totalRows = 3`, `validCount = 1`, `warningCount = 1`, `errorCount = 1`, `importableCount = 2`.
  - Numéros de lignes Excel exacts (`rowNumber = 2, 3, 4`), `birthDate = "15-05-2014"` décodée depuis le binaire, et `unknownItems` contenant `Polo Inconnu`.
