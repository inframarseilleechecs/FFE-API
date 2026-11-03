/**
 * Module de téléchargement HTTP pour le site officiel de la FFE (echecs.asso.fr)
 * Gestion native de l'encodage ISO-8859-1 et résilience réseau.
 * Auteur : Sergey CHUKHNO
 */

const FFE_BASE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Connection": "keep-alive",
  "Referer": "https://www.echecs.asso.fr/ListeJoueurs.aspx",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};

export interface FetchFfeOptions {
  method?: "GET" | "POST";
  body?: URLSearchParams | FormData | string;
  timeoutMs?: number;
  retries?: number;
  customHeaders?: Record<string, string>;
}

/**
 * Télécharge une page depuis echecs.asso.fr et décode le contenu en ISO-8859-1.
 * Par défaut : timeout de 20s et 1 retry rapide pour respecter la limite Vercel Hobby.
 */
export async function fetchFfePage(
  url: string,
  options: FetchFfeOptions = {}
): Promise<string> {
  const {
    method = "GET",
    body,
    timeoutMs = 20000,
    retries = 1,
    customHeaders = {},
  } = options;

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= retries) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const headers: Record<string, string> = {
        ...FFE_BASE_HEADERS,
        ...customHeaders,
      };

      if (method === "POST" && typeof body === "string") {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body instanceof URLSearchParams ? body.toString() : body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`FFE_HTTP_ERROR ${response.status}: ${response.statusText} (${url})`);
      }

      // Décodage du flux binaire en ISO-8859-1 (encodage officiel FFE)
      const arrayBuffer = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") || "";
      
      const encoding = contentType.toLowerCase().includes("utf-8")
        ? "utf-8"
        : "iso-8859-1";

      const decoder = new TextDecoder(encoding);
      return decoder.decode(arrayBuffer);
    } catch (err: unknown) {
      attempt++;
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt > retries) {
        break;
      }

      // Temporisation exponentielle avant nouvel essai (jitter)
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }

  throw lastError || new Error(`Impossible de contacter la FFE: ${url}`);
}
