// google-search-results-nodejs is a CommonJS module; use default import
import SerpApi from "google-search-results-nodejs";
const { getJson } = SerpApi;

import { SERPAPI_KEY } from "../config.js";

/** Keywords that indicate business opening signals */
const SIGNAL_KEYWORDS = ["coming soon", "grand opening", "now open", "opening soon", "hiring", "we're hiring"];

/**
 * Extract social media links and signals from a list of SerpAPI organic results.
 * @param {object[]} results
 * @returns {{ instagram: string, facebook: string, linkedin: string, signals: string[] }}
 */
function extractFromResults(results) {
  let instagram = "";
  let facebook  = "";
  let linkedin  = "";
  const signals = [];

  for (const r of results) {
    const link    = (r.link    ?? "").toLowerCase();
    const snippet = (r.snippet ?? "").toLowerCase();
    const title   = (r.title   ?? "").toLowerCase();

    if (!instagram && link.includes("instagram.com")) instagram = r.link;
    if (!facebook  && link.includes("facebook.com"))  facebook  = r.link;
    if (!linkedin  && link.includes("linkedin.com"))  linkedin  = r.link;

    for (const kw of SIGNAL_KEYWORDS) {
      if ((snippet.includes(kw) || title.includes(kw)) && !signals.includes(kw)) {
        signals.push(kw);
      }
    }
  }

  return { instagram, facebook, linkedin, signals };
}

/**
 * Run a single SerpAPI Google search and return organic results.
 * @param {string} query
 * @returns {Promise<object[]>}
 */
async function serpSearch(query) {
  return new Promise((resolve, reject) => {
    getJson(
      {
        engine:  "google",
        q:       query,
        num:     10,
        hl:      "en",
        gl:      "us",
        api_key: SERPAPI_KEY,
      },
      (json) => {
        if (json.error) return reject(new Error(`SerpAPI error: ${json.error}`));
        resolve(json.organic_results ?? []);
      }
    );
  });
}

/**
 * Enrich a permit record using SerpAPI Google searches.
 *
 * @param {{ address: string, plazaName?: string }} record
 * @returns {Promise<{
 *   businessName: string,
 *   website: string,
 *   instagram: string,
 *   facebook: string,
 *   linkedin: string,
 *   signals: string[]
 * }>}
 */
export async function googleSearch(record) {
  if (!SERPAPI_KEY) throw new Error("SERPAPI_KEY is not set in environment");

  const { address, plazaName } = record;

  const queries = [
    `"${address}" new business`,
    `"${address}" coming soon`,
    ...(plazaName ? [`"${plazaName}" new tenant`] : []),
  ];

  // Run all queries in parallel
  const resultSets = await Promise.all(queries.map((q) => serpSearch(q)));
  const allResults = resultSets.flat();

  const { instagram, facebook, linkedin, signals } = extractFromResults(allResults);

  // Best-guess business name: title of the first non-social, non-map result
  const nameResult = allResults.find((r) => {
    const link = (r.link ?? "").toLowerCase();
    return (
      !link.includes("instagram.com") &&
      !link.includes("facebook.com")  &&
      !link.includes("linkedin.com")  &&
      !link.includes("google.com/maps")
    );
  });

  const businessName = nameResult?.title ?? "";
  const website      = nameResult?.link  ?? "";

  return { businessName, website, instagram, facebook, linkedin, signals };
}

