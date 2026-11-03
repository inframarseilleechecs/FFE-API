/**
 * Service de haut niveau orchestrant le scraping FFE officiel.
 * Auteur : Sergey CHUKHNO
 */

import { fetchFfePage } from "./fetcher";
import { parseFfePlayersTable, parseFfeClubsTable, extractTotalPages, extractViewState } from "./parser";
import { buildSearchVariantes, normalizeForMatch, removeAccents } from "./normalization";
import { Player, Club, SearchOptions, SearchResult } from "./types";

const FFE_BASE_URL = "https://www.echecs.asso.fr";

/**
 * Recherche des joueurs FFE par nom, prénom et éventuellement club.
 * Gère les variantes de tirets/espaces/accents et retourne l'intégralité des homonymes.
 */
export async function searchFfePlayers(options: SearchOptions): Promise<SearchResult> {
  const { nom, prenom, club, strict = false } = options;

  if (!nom || !nom.trim()) {
    return {
      status: "ERROR",
      players: [],
      count: 0,
      error: "Paramètre 'nom' obligatoire.",
    };
  }

  const variantes = buildSearchVariantes(nom, strict);
  const prenomNormalized = strict
    ? (prenom || "").trim()
    : removeAccents((prenom || "").trim());

  const allPlayersMap = new Map<string, Player>();

  for (const n of variantes) {
    const url = `${FFE_BASE_URL}/ListeJoueurs.aspx?Action=FFE&JrNom=${encodeURIComponent(
      n
    )}&JrPrenom=${encodeURIComponent(prenomNormalized)}`;

    try {
      const html = await fetchFfePage(url);
      const players = parseFfePlayersTable(html);

      for (const p of players) {
        if (!allPlayersMap.has(p.nrFFE)) {
          allPlayersMap.set(p.nrFFE, p);
        }
      }
    } catch (err: unknown) {
      // Tolérance aux erreurs réseau sur une variante individuelle
      console.error(`Erreur recherche variante ${n}:`, err);
    }
  }

  let players = Array.from(allPlayersMap.values());

  // Filtrage par club si spécifié
  if (club && club.trim()) {
    const clubCible = normalizeForMatch(club);
    players = players.filter((p) =>
      normalizeForMatch(p.club).includes(clubCible)
    );
  }

  const count = players.length;

  if (count === 0) {
    return {
      status: "NOT_FOUND",
      players: [],
      count: 0,
      error: club ? "Joueur non trouvé dans ce club." : "Joueur non trouvé.",
    };
  }

  if (count === 1) {
    return {
      status: "EXACT",
      players,
      count: 1,
    };
  }

  return {
    status: "HOMONYMS",
    players,
    count,
  };
}

/**
 * Résout les clubs FFE à partir d'un mot-clé ou nom de club.
 */
export async function resolveClub(clubInput: string): Promise<Club[]> {
  if (!clubInput || !clubInput.trim()) return [];

  const variantes = buildSearchVariantes(clubInput);
  let clubs: Club[] = [];

  for (const v of variantes) {
    const url = `${FFE_BASE_URL}/ListeClubs.aspx?Action=CLUB`;
    const body = new URLSearchParams({ ClubNom: v });

    try {
      const html = await fetchFfePage(url, {
        method: "POST",
        body: body.toString(),
      });

      clubs = parseFfeClubsTable(html);
      if (clubs.length > 0) break;
    } catch (err) {
      console.error(`Erreur recherche club ${v}:`, err);
    }
  }

  // Enrichissement avec le code club (ex: N06013) depuis la fiche club
  for (const c of clubs) {
    try {
      const ficheUrl = `${FFE_BASE_URL}/FicheClub.aspx?Ref=${encodeURIComponent(c.ref)}`;
      const ficheHtml = await fetchFfePage(ficheUrl, { timeoutMs: 5000 });
      const match = ficheHtml.match(/FicheComite\.aspx\?Ref=[^"]+">([A-Z][A-Z0-9]{5})/i);
      if (match) {
        c.code = match[1];
      }
    } catch {
      // Ignorer si la fiche ne répond pas rapidement
    }
  }

  return clubs;
}

export interface FetchClubMembersOptions {
  concurrency?: number;
  maxTimeMs?: number;
  pageTimeoutMs?: number;
  onProgress?: (current: number, total: number) => void;
}

export interface FetchClubMembersResult {
  players: Player[];
  totalPages: number;
  pagesFetched: number[];
  missingPages: number[];
  isPartial: boolean;
}

/**
 * Télécharge la totalité des licenciés d'un club (ex: Marseille-Échecs)
 * en mode parallèle par lots concurrents de 4 pages (Promise.allSettled)
 * avec tolérance aux pannes (Graceful Partial Fallback) et budget temps strict.
 */
export async function fetchAllClubMembers(
  clubCode: string,
  options?: ((current: number, total: number) => void) | FetchClubMembersOptions
): Promise<FetchClubMembersResult> {
  if (!clubCode) {
    return {
      players: [],
      totalPages: 0,
      pagesFetched: [],
      missingPages: [],
      isPartial: false,
    };
  }

  const startTime = Date.now();
  const onProgress = typeof options === "function" ? options : options?.onProgress;
  const concurrency = (typeof options === "object" && options?.concurrency) || 4;
  const maxTimeMs = (typeof options === "object" && options?.maxTimeMs) || 45000;
  const pageTimeoutMs = (typeof options === "object" && options?.pageTimeoutMs) || 8000;

  const listUrl = `${FFE_BASE_URL}/ListeJoueurs.aspx?Action=CLUBCODE&ClubCode=${encodeURIComponent(
    clubCode
  )}`;

  // 1. Page 1 (GET) avec timeout maîtrisé de 12s
  const firstHtml = await fetchFfePage(listUrl, { timeoutMs: 12000, retries: 1 });
  const totalPages = extractTotalPages(firstHtml);
  const { viewState, viewStateGenerator } = extractViewState(firstHtml);

  const allPlayersMap = new Map<string, Player>();
  const pagesFetched: number[] = [1];
  const missingPages: number[] = [];

  // Parsing page 1
  for (const p of parseFfePlayersTable(firstHtml)) {
    allPlayersMap.set(p.nrFFE, p);
  }

  if (onProgress) {
    onProgress(1, totalPages);
  }

  // 2. Si page unique, terminer immédiatement
  if (totalPages <= 1) {
    return {
      players: Array.from(allPlayersMap.values()),
      totalPages: 1,
      pagesFetched: [1],
      missingPages: [],
      isPartial: false,
    };
  }

  // 3. Pages suivantes par vagues concurrentes de taille `concurrency` (défaut 4)
  const remainingPages: number[] = [];
  for (let p = 2; p <= totalPages; p++) {
    remainingPages.push(p);
  }

  for (let i = 0; i < remainingPages.length; i += concurrency) {
    // Garde-fou Vercel : Si le budget temps approche des 45s, on stoppe pour garantir la sauvegarde
    if (Date.now() - startTime > maxTimeMs) {
      console.warn(`Budget temps de ${maxTimeMs}ms atteint. Arrêt du scraping des pages restantes pour persistance.`);
      for (const p of remainingPages.slice(i)) {
        missingPages.push(p);
      }
      break;
    }

    const chunk = remainingPages.slice(i, i + concurrency);

    const chunkPromises = chunk.map(async (page) => {
      const postBody = new URLSearchParams({
        __VIEWSTATE: viewState,
        __VIEWSTATEGENERATOR: viewStateGenerator,
        __EVENTTARGET: "ctl00$ContentPlaceHolderMain$PagerHeader",
        __EVENTARGUMENT: page.toString(),
      });

      try {
        const pageHtml = await fetchFfePage(listUrl, {
          method: "POST",
          body: postBody.toString(),
          timeoutMs: pageTimeoutMs,
          retries: 0, // Pas de retry individuel pour ne pas bloquer le lot entier
          customHeaders: {
            Referer: listUrl,
          },
        });

        const pagePlayers = parseFfePlayersTable(pageHtml);
        return { page, players: pagePlayers, success: true as const };
      } catch (err) {
        console.error(`Erreur pagination club ${clubCode} page ${page}:`, err);
        return { page, error: err, success: false as const };
      }
    });

    const results = await Promise.all(chunkPromises);

    for (const res of results) {
      if (res.success) {
        pagesFetched.push(res.page);
        for (const p of res.players) {
          allPlayersMap.set(p.nrFFE, p);
        }
      } else {
        missingPages.push(res.page);
      }
      if (onProgress) {
        onProgress(pagesFetched.length, totalPages);
      }
    }
  }

  return {
    players: Array.from(allPlayersMap.values()),
    totalPages,
    pagesFetched: pagesFetched.sort((a, b) => a - b),
    missingPages: missingPages.sort((a, b) => a - b),
    isPartial: missingPages.length > 0,
  };
}
