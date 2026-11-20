# Documentation des API — Module Inventaire & Équipements

> **Dossier :** `src/app/api/inventory/`  
> **Tests d'intégration :** [inventory_api.test.ts](file:///Users/sergeychukhno/Desktop/RecupFFE/src/app/api/__tests__/inventory_api.test.ts)  
> **Sécurité :** Toutes les routes sont protégées par `authenticateApi()` (Better-Auth + matrice RBAC).

---

## 1. Matrice des Permissions RBAC

| Rôle | Lecture (`GET`, `inventory:view`) | Écriture / Import (`POST`, `PATCH`, `DELETE`, `inventory:manage`) |
| :--- | :---: | :---: |
| **`superadmin`** | ✅ Autorisé (`200`) | ✅ Autorisé (`200` / `201`) |
| **`secretary`** | ✅ Autorisé (`200`) | ✅ Autorisé (`200` / `201`) |
| **`director`** | ✅ Autorisé (`200`) | ❌ Refusé (`403 Forbidden`) |
| **`coach`** | ❌ Refusé (`403 Forbidden`) | ❌ Refusé (`403 Forbidden`) |
| *Non connecté* | ❌ Refusé (`401 Unauthorized`) | ❌ Refusé (`401 Unauthorized`) |

---

## 2. Saisons / Années (`/api/inventory/seasons`)

### `GET /api/inventory/seasons`
- **Permission :** `inventory:view`
- **Usage :** Alimente le sélecteur déroulant `ANNÉE` dans l'interface.
- **Réponse (`200 OK`) :**
  ```json
  {
    "success": true,
    "count": 2,
    "seasons": [
      { "year": 2027, "label": "Saison 2026-2027", "createdAt": "..." },
      { "year": 2026, "label": "Saison 2025-2026", "createdAt": "..." }
    ]
  }
  ```

### `POST /api/inventory/seasons`
- **Permission :** `inventory:manage`
- **Usage :** Bouton `+` pour créer une nouvelle année d'inventaire.
- **Corps JSON :** `{ "year": 2028, "label": "Saison 2027-2028" }` (`label` optionnel).
- **Codes :** `201 Created` | `400 Bad Request` (année hors plage 2000–2100) | `409 Conflict` (`SEASON_EXISTS`).

---

## 3. Catalogue d'Équipements (`/api/inventory/items` & `/api/inventory/items/[id]`)

### `GET /api/inventory/items`
- **Permission :** `inventory:view`
- **Paramètre optionnel :** `?category=POLO|VESTE|DIVERS`
- **Usage :** Alimente la vue `Équipements` (3 tables Polo/Veste/Divers) et les menus déroulants du tableau membres.
- **Réponse (`200 OK`) :** Liste des articles avec champs calculés en temps réel (`nbDistributed`, `stockRemaining`, `isLowStock`, `usageCount`, `canDelete`) et compteur global `lowStockCount`.

### `POST /api/inventory/items`
- **Permission :** `inventory:manage`
- **Usage :** Service `ADD ITEM`.
- **Corps JSON :**
  ```json
  {
    "category": "POLO",
    "type": "Polo Adulte M",
    "quantitySinceLastInventory": 15,
    "threshold": 5
  }
  ```
- **Codes :** `201 Created` | `400 Bad Request` | `409 Conflict` (`DUPLICATE_ITEM`).

### `PATCH /api/inventory/items/[id]`
- **Permission :** `inventory:manage`
- **Usage :** Modifie le libellé `type`, le stock de référence `quantitySinceLastInventory`, le seuil `threshold`, et/ou réinitialise `lastInventoryAt` (`resetLastInventoryAt: true`).
- **Codes :** `200 OK` | `400 Bad Request` | `404 Not Found` | `409 Conflict`.

### `DELETE /api/inventory/items/[id]`
- **Permission :** `inventory:manage`
- **Usage :** Service `DELETE ITEM (IF NEVER USED)`.
- **Règle métier :** Supprime l'article uniquement si `usageCount === 0` sur toutes les saisons.
- **Codes :** `200 OK` | `404 Not Found` | **`409 Conflict`** (`code: "ITEM_IN_USE"` si référencé par au moins un membre).

---

## 4. Membres & Distributions par Année (`/api/inventory/members` & `/api/inventory/members/[id]`)

### `GET /api/inventory/members?year=2027`
- **Permission :** `inventory:view`
- **Usage :** Charge le tableau des membres pour l'année sélectionnée dans le combo `ANNÉE`.
- **Réponse (`200 OK`) :** `{ "success": true, "seasonYear": 2027, "count": ..., "members": [...] }`.

### `POST /api/inventory/members`
- **Permission :** `inventory:manage`
- **Usage :** Service `ADD MEMBER`.
- **Corps JSON :**
  ```json
  {
    "seasonYear": 2027,
    "firstname": "Maxime",
    "lastname": "CHUKHNO",
    "birthDate": "15-05-2014",
    "poloItemId": 1,
    "poloDistributed": false,
    "vesteItemId": null,
    "vesteDistributed": false,
    "diversItemId": null,
    "diversDistributed": false,
    "paymentOk": true
  }
  ```
- **Codes :** `201 Created` | `400 Bad Request`.

### `PATCH /api/inventory/members/[id]`
- **Permission :** `inventory:manage`
- **Usage :** Service `EDIT MEMBER` — utilisé pour l'édition complète **et** les mises à jour instantanées au clic (menus déroulants Polo/Veste/Divers, coches `Distribué`, toggle `Paiement OK`).
- **Règle de cohérence :** Si `*_itemId` passe à `null`, `*_distributed` est automatiquement remis à `false`.
- **Codes :** `200 OK` | `400 Bad Request` | `404 Not Found`.

### `DELETE /api/inventory/members/[id]`
- **Permission :** `inventory:manage`
- **Usage :** Service `DELETE MEMBER`.
- **Codes :** `200 OK` | `404 Not Found`.

---

## 5. Import Excel & Prévisualiseur (`/api/inventory/import`)

### `POST /api/inventory/import`
- **Permission :** `inventory:manage`
- **Formats acceptés :**
  1. `multipart/form-data` avec champ `file` (`.xlsx` / `.csv`), `mode` (`"preview"` ou `"commit"`), et `seasonYear` (requis en `commit`).
  2. `application/json` avec `{ mode, seasonYear?, rows }`.
- **Comportement en `mode: "preview"` (Pre-Visualizer) :**
  - Analyse le fichier contre le catalogue réel en base.
  - **Aucune écriture en base de données.**
  - Retourne `{ success: true, mode: "preview", preview: InventoryImportPreview }`.
- **Comportement en `mode: "commit"` (Confirmation) :**
  - Exclut automatiquement les lignes en statut `ERROR`.
  - Exécute `bulkUpsertEquipmentMembers(seasonYear, ...)` sans créer de doublons.
  - Retourne `{ success: true, mode: "commit", seasonYear, created, updated, skippedErrors }`.
