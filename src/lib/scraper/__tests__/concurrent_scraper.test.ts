import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAllClubMembers } from "../service";
import * as fetcherModule from "../fetcher";

describe("Concurrent Scraper & Graceful Fallback Engine", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const createPlayerRow = (nrFFE: string, nomPrenom: string, id: string = "1") => `
    <tr class="liste_clair">
      <td>${nrFFE}</td>
      <td><a href="FicheJoueur.aspx?Id=${id}">${nomPrenom}</a></td>
      <td>A</td>
      <td></td>
      <td>1850</td>
      <td>1820</td>
      <td>1790</td>
      <td>SenM</td>
      <td>FRA</td>
      <td>Marseille-Échecs</td>
    </tr>
  `;

  it("handles single-page club gracefully without launching extra requests", async () => {
    const singlePageHtml = `
      <html>
        <input id="__VIEWSTATE" value="vs123" />
        <input id="__VIEWSTATEGENERATOR" value="gen123" />
        <table class="table-results">
          ${createPlayerRow("X81304", "CHUKHNO Maxime", "123")}
        </table>
      </html>
    `;

    vi.spyOn(fetcherModule, "fetchFfePage").mockResolvedValue(singlePageHtml);

    const result = await fetchAllClubMembers("U13095");
    expect(result.totalPages).toBe(1);
    expect(result.pagesFetched).toEqual([1]);
    expect(result.missingPages).toEqual([]);
    expect(result.isPartial).toBe(false);
    expect(result.players).toHaveLength(1);
    expect(result.players[0].nrFFE).toBe("X81304");
  });

  it("fetches multi-page clubs in concurrent batches of 4 and aggregates all players", async () => {
    // Page 1 avec pagination vers 4 pages
    const page1Html = `
      <html>
        <input id="__VIEWSTATE" value="vs_init" />
        <input id="__VIEWSTATEGENERATOR" value="gen_init" />
        <a href="javascript:__doPostBack('ctl00$ContentPlaceHolderMain$PagerHeader','2')">2</a>
        <a href="javascript:__doPostBack('ctl00$ContentPlaceHolderMain$PagerHeader','3')">3</a>
        <a href="javascript:__doPostBack('ctl00$ContentPlaceHolderMain$PagerHeader','4')">4</a>
        <table class="table-results">
          ${createPlayerRow("A00001", "Joueur Page1", "1")}
        </table>
      </html>
    `;

    const createPageHtml = (pageNum: number, lic: string) => `
      <html>
        <input id="__VIEWSTATE" value="vs_p${pageNum}" />
        <input id="__VIEWSTATEGENERATOR" value="gen_p${pageNum}" />
        <table class="table-results">
          ${createPlayerRow(lic, `Joueur Page${pageNum}`, pageNum.toString())}
        </table>
      </html>
    `;

    vi.spyOn(fetcherModule, "fetchFfePage").mockImplementation(async (url, options) => {
      if (options?.method === "POST") {
        const bodyStr = options.body?.toString() || "";
        if (bodyStr.includes("__EVENTARGUMENT=2")) return createPageHtml(2, "B00002");
        if (bodyStr.includes("__EVENTARGUMENT=3")) return createPageHtml(3, "C00003");
        if (bodyStr.includes("__EVENTARGUMENT=4")) return createPageHtml(4, "D00004");
      }
      return page1Html;
    });

    const progressCalls: number[] = [];
    const result = await fetchAllClubMembers("U13095", {
      concurrency: 4,
      onProgress: (current, total) => progressCalls.push(current),
    });

    expect(result.totalPages).toBe(4);
    expect(result.pagesFetched).toEqual([1, 2, 3, 4]);
    expect(result.missingPages).toEqual([]);
    expect(result.isPartial).toBe(false);
    expect(result.players).toHaveLength(4);
    expect(result.players.map((p) => p.nrFFE)).toEqual(["A00001", "B00002", "C00003", "D00004"]);
  });

  it("handles a failing page gracefully with fallback to PARTIAL status without throwing", async () => {
    const page1Html = `
      <html>
        <input id="__VIEWSTATE" value="vs_init" />
        <input id="__VIEWSTATEGENERATOR" value="gen_init" />
        <a href="javascript:__doPostBack('ctl00$ContentPlaceHolderMain$PagerHeader','2')">2</a>
        <a href="javascript:__doPostBack('ctl00$ContentPlaceHolderMain$PagerHeader','3')">3</a>
        <table class="table-results">
          ${createPlayerRow("A00001", "Joueur Page1", "1")}
        </table>
      </html>
    `;

    vi.spyOn(fetcherModule, "fetchFfePage").mockImplementation(async (url, options) => {
      if (options?.method === "POST") {
        const bodyStr = options.body?.toString() || "";
        // La page 2 réussit
        if (bodyStr.includes("__EVENTARGUMENT=2")) {
          return `
            <html>
              <table class="table-results">
                ${createPlayerRow("B00002", "Joueur Page2", "2")}
              </table>
            </html>
          `;
        }
        // La page 3 simule un timeout réseau fédéral
        if (bodyStr.includes("__EVENTARGUMENT=3")) {
          throw new Error("FFE_TIMEOUT: This operation was aborted");
        }
      }
      return page1Html;
    });

    const result = await fetchAllClubMembers("U13095");

    // L'aspiration ne crash pas : statut PARTIAL
    expect(result.totalPages).toBe(3);
    expect(result.pagesFetched).toEqual([1, 2]);
    expect(result.missingPages).toEqual([3]);
    expect(result.isPartial).toBe(true);
    expect(result.players).toHaveLength(2);
    expect(result.players.map((p) => p.nrFFE)).toEqual(["A00001", "B00002"]);
  });

  it("deduplicates players if a player appears across multiple pages", async () => {
    const page1Html = `
      <html>
        <input id="__VIEWSTATE" value="vs_init" />
        <input id="__VIEWSTATEGENERATOR" value="gen_init" />
        <a href="javascript:__doPostBack('ctl00$ContentPlaceHolderMain$PagerHeader','2')">2</a>
        <table class="table-results">
          ${createPlayerRow("X81304", "CHUKHNO Maxime", "1")}
        </table>
      </html>
    `;

    const page2Html = `
      <html>
        <table class="table-results">
          ${createPlayerRow("X81304", "CHUKHNO Maxime", "1")}
        </table>
      </html>
    `;

    vi.spyOn(fetcherModule, "fetchFfePage").mockImplementation(async (url, options) => {
      if (options?.method === "POST") return page2Html;
      return page1Html;
    });

    const result = await fetchAllClubMembers("U13095");
    expect(result.players).toHaveLength(1);
    expect(result.players[0].nrFFE).toBe("X81304");
  });
});
