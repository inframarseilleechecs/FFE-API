# Walkthrough de Livraison — Module Inventaire & Équipements (v1.2)

> **Projet :** RecupFFE — Marseille-Échecs  
> **Branche source :** `feat/inventory-equipment-module` (`sergey-chukhno`)  
> **Branche cible :** `v1.1-nextjs-scraper` (`inframarseilleechecs`)  
> **Étape :** 6 — Recette finale, vérification d'intégrité et livraison  
> **Auteur :** Sergey CHUKHNO  
> **Date :** Novembre 2026  
> **Statut :** Validé — typecheck, 144 tests, build de production et smoke tests HTTP au vert.

---

## 1. Synthèse Exécutive

L'**Étape 6** clôture le module Inventaire & Équipements. Le périmètre livré couvre :

| Étape | Livrable | Commit |
| :--- | :--- | :--- |
| 1 | Schéma PostgreSQL normalisé (3 tables), repository et tests | `9d95be8` |
| 2 | Parseur Excel intelligent + prévisualiseur (18 tests) | `79ad32f` |
| 3 | Routes API `/api/inventory/*` protégées RBAC + docs + tests | `3d9fa4b` |
| 4 | Tableau membres, édition inline, suppression de l'UI finances | `648c72d` |
| 5 | Catalogue équipements + modale d'import prévisualisé | `778da6f` |
| 6 | Recette finale, smoke tests, walkthrough et Pull Request | *(ce document)* |

Le module repose sur le modèle **Dû vs Distribué** : les articles sont importés en début de saison avec `*_distributed = false`, puis cochés au fil des remises. Le stock restant est calculé en temps réel (`quantity_since_last_inventory - nb_distributed`), sans table de stock intermédiaire, ce qui garantit l'absence de dérive entre la liste des membres et les compteurs.

---

## 2. Vérification d'Intégrité Automatisée

### 2.1 TypeScript

```bash
npm run typecheck
# > tsc --noEmit
# (aucune sortie => 0 erreur)
```

### 2.2 Tests unitaires & d'intégration

```bash
npm test
# Test Files  23 passed | 1 skipped (24)
#      Tests  144 passed | 2 skipped (146)
#   Duration  3.02s
```

Les 2 tests ignorés sont les tests d'intégration réseau live FFE (`live_integration.test.ts`), volontairement désactivés hors environnement autorisé.

Couverture notable :
- `inventory_excel.test.ts` : 18 tests (parseur, dates, doublons, catalogue).
- `inventory_equipment.test.ts` : repository, stock temps réel, protection `ITEM_IN_USE`.
- `inventory_api.test.ts` / `api_rbac_guards.test.ts` : 401/403 par rôle et cycle CRUD.
- `inventory_ui.test.ts` / `adaptive_navigation.test.ts` : helpers UI et masquage de l'onglet pour le coach.

### 2.3 Build de production

```bash
npm run build
# ✓ Compiled successfully
# ✓ Generating static pages (5/5)
```

Routes Inventaire compilées en dynamique :
`/api/inventory/seasons`, `/api/inventory/items`, `/api/inventory/items/[id]`,
`/api/inventory/members`, `/api/inventory/members/[id]`, `/api/inventory/import`.

---

## 3. Smoke Tests HTTP Réellement Exécutés

Environnement : build de production local (`npm run start -- -p 3002`), base PostgreSQL `localhost:5434`, seed `npm run seed` exécuté au préalable. Authentification Better-Auth via `/api/auth/sign-in/email` et cookies de session.

### 3.1 Matrice RBAC

| Scénario | Attendu | Obtenu |
| :--- | :---: | :---: |
| Anonyme → `GET /api/inventory/seasons` | `401` | ✅ `401 UNAUTHORIZED` |
| Secrétaire → `GET seasons/items/members` | `200` | ✅ `200` |
| Secrétaire → `POST` / `PATCH` / `DELETE` | `200`/`201` | ✅ `200`/`201` |
| Directeur → `GET /api/inventory/seasons` | `200` | ✅ `200` |
| Directeur → `POST /api/inventory/seasons` | `403` | ✅ `403 FORBIDDEN` |
| Directeur → `PATCH member`, `DELETE item`, import | `403` | ✅ `403 FORBIDDEN` |
| Coach → `GET /api/inventory/items` / `members` | `403` | ✅ `403 FORBIDDEN` |

### 3.2 Cycle métier Secrétaire

1. **Catalogue** — `POST /api/inventory/items` → `201` (`Smoke Test Échiquier`, stock 7).
2. **Modification** — `PATCH /api/inventory/items/6` (libellé, stock 9, seuil 3) → `200`.
3. **Membre** — `POST /api/inventory/members` saison 2027, polo + divers distribué → `201`.
4. **Protection suppression** — `DELETE /api/inventory/items/6` alors que l'article est affecté → **`409 ITEM_IN_USE`**.
5. **Cohérence** — `PATCH` du membre avec `diversItemId: null` → `diversDistributed` repasse automatiquement à `false` → `200`.
6. **Nettoyage** — `DELETE` du membre puis de l'article inutilisé → `200`.

### 3.3 Saisons

| Test | Attendu | Obtenu |
| :--- | :---: | :---: |
| `POST { year: 2099, label: "Saison Test 2098-2099" }` | `201` | ✅ `201` |
| Deuxième `POST { year: 2099 }` | `409` | ✅ `409 SEASON_EXISTS` |
| `POST { year: 1999 }` | `400` | ✅ `400 INVALID_INPUT` |

La saison de test 2099 a été supprimée en base après vérification.

### 3.4 Import Excel & Prévisualiseur

Fichier binaire `.xlsx` généré avec 3 lignes : 1 valide, 1 avec article inconnu et date invalide, 1 sans prénom.

| Mode | Résultat |
| :--- | :--- |
| `preview` | `200` — `validCount: 1`, `warningCount: 1`, `errorCount: 1`, `importableCount: 2`, `unknownItems: [{ POLO, "Polo Inconnu", 1 }]`. Colonnes `Prénom/Nom/Date de naissance/Paiement/Polo/Veste/Divers` correctement détectées. **Aucune écriture en base.** |
| `commit` (2026) | `200` — `{ created: 2, updated: 0, skippedErrors: 1 }`. La ligne `ERROR` est exclue. |
| `commit` rejoué | `200` — `{ created: 0, updated: 2, skippedErrors: 1 }`. Déduplication `(season_year, firstname, lastname, birth_date)` confirmée. |

Les membres de test ont été supprimés après vérification. L'import nécessite la permission `inventory:manage` (Directeur refusé en `403`).

---

## 4. Guide de Smoke Tests Manuels (UI)

### 4.1 Démarrage

```bash
docker compose up -d          # PostgreSQL sur localhost:5434
npm run seed                  # comptes de démo + saisons + catalogue
npm run dev                   # http://localhost:3000
```

Les identifiants de démonstration sont pré-remplissables via les boutons de rôle sur `/login`, **uniquement en mode développement** (`NODE_ENV=development`).

| Rôle | Email | Mot de passe |
| :--- | :--- | :--- |
| Secrétaire | `secretaire@marseille-echecs.com` | `Secretaire2026!` |
| Directeur | `directeur@marseille-echecs.com` | `Directeur2026!` |
| Entraîneur | `coach@marseille-echecs.com` | `Coach2026!` |
| Superadmin | `admin@marseille-echecs.com` | `MarseilleAdmin2026!` |

### 4.2 Parcours Secrétaire

1. Se connecter : l'onglet **Inventaire & Équipements** s'ouvre par défaut.
2. Vérifier le sélecteur `ANNÉE` (2026, 2027) et le bouton `+` de création de saison.
3. Tableau membres : modifier le **paiement**, les **tailles Polo/Veste/Divers**, basculer **Distribué** ; vérifier la mise à jour instantanée du stock et des badges de réassort.
4. Catalogue : ajouter une taille/stock, modifier un libellé/stock/seuil, supprimer un article inutilisé (`canDelete`), puis constater le **409** sur un article déjà affecté.
5. Import Excel : sélectionner un fichier, vérifier l'affichage **obligatoire** du prévisualiseur (VALID/WARNING/ERROR, articles inconnus, doublons), puis confirmer.

### 4.3 Parcours Directeur

1. Se connecter avec `directeur@marseille-echecs.com`.
2. Vérifier le badge **« Lecture seule »** et l'absence des actions d'écriture/import.
3. Toute tentative d'écriture côté API renvoie `403 FORBIDDEN`.

### 4.4 Parcours Entraîneur

1. Se connecter avec `coach@marseille-echecs.com`.
2. Vérifier que l'onglet **Inventaire & Équipements** est totalement masqué et que les API Inventaire renvoient `403` (couvert aussi par `adaptive_navigation.test.ts`).

---

## 5. Écarts Plan / Implémentation à Connaître

1. **« Modification de prix »** mentionnée dans le plan de recette : le modèle Équipements livré ne contient **pas de champ prix**. L'Étape 4 a volontairement retiré l'UI finances (`InventoryFinanceSection.tsx`) au profit du suivi **stock/seuil/distribution**. Les smoke tests couvrent donc la modification du libellé, du stock de référence et du seuil.
2. **CSV UTF-8 sans BOM** : le parseur lit les CSV via SheetJS avec le décodage par défaut (Windows-1252), adapté aux exports Excel francophones. Un CSV encodé en UTF-8 peut produire des en-têtes illisibles (`PrÃ©nom`) et des lignes en `ERROR`. **Recommandation : importer le fichier `.xlsx`** (format validé de bout en bout) ou réenregistrer le CSV en ANSI/Windows-1252. Ce point n'affecte pas le scénario Excel prévu par la recette.

---

## 6. Pull Request

- **Source :** `sergey-chukhno:feat/inventory-equipment-module`
- **Cible :** `inframarseilleechecs:v1.1-nextjs-scraper`
- **Contenu :** Étapes 1 à 6 du module Inventaire & Équipements, documentation (`docs/inventaire/*`), tests et walkthrough.

### Checklist de merge

- [x] `npm run typecheck` — 0 erreur
- [x] `npm test` — 144 tests verts (2 skips réseau assumés)
- [x] `npm run build` — succès
- [x] Smoke tests RBAC Secrétaire / Directeur / Entraîneur / Anonyme
- [x] CRUD catalogue, membres, saisons et protection `409 ITEM_IN_USE`
- [x] Import Excel : prévisualisation sans écriture, commit, déduplication
- [x] Documentation du module et walkthrough
