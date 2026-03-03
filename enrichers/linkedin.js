import { SERPAPI_KEY, GOOGLE_SEARCH_BACKEND } from "../config.js";
// google-search-results-nodejs is a CommonJS module; use default import
import SerpApi from "google-search-results-nodejs";
const { getJson } = SerpApi;
import { chromium } from "playwright";

/**
 * Search for LinkedIn hiring posts via SerpAPI.
 * @param {string} query
 * @returns {Promise<Array<{ title: string, link: string, snippet: string }>>}
 */
async function serpLinkedInSearch(query) {
  return new Promise((resolve, reject) => {
    getJson(
      { engine: "google", q: query, num: 5, hl: "en", gl: "us", api_key: SERPAPI_KEY },
      (json) => {
        if (json.error) return reject(new Error(`SerpAPI error: ${json.error}`));
        resolve(json.organic_results ?? []);
      }
    );
  });
}

/**
 * Search for LinkedIn hiring posts via Playwright.
 * @param {string} query
 * @returns {Promise<Array<{ title: string, link: string, snippet: string }>>}
 */
async function playwrightLinkedInSearch(query) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const ctx  = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await ctx.newPage();
    const url  = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=5&hl=en&gl=us`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    const consentBtn = page.locator("button:has-text('Accept all'), button:has-text('I agree')").first();
    if (await consentBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await consentBtn.click();
    }
    await page.waitForSelector("div.g, #search", { timeout: 15_000 });

    return page.evaluate(() => {
      const results = [];
      document.querySelectorAll("div.g, div[data-hveid]").forEach((el) => {
        const anchor    = el.querySelector("a[href]");
        const titleEl   = el.querySelector("h3");
        const snippetEl = el.querySelector(".VwiC3b, div[data-sncf], span[class]");
        if (!anchor || !titleEl) return;
        results.push({
          title:   titleEl.innerText.trim(),
          link:    anchor.href,
          snippet: snippetEl ? snippetEl.innerText.trim() : "",
        });
      });
      return results;
    });
  } finally {
    await browser.close();
  }
}

/**
 * Detect whether any result is a LinkedIn job posting.
 * @param {Array<{ title: string, link: string, snippet: string }>} results
 * @returns {{ found: boolean, url: string, snippet: string }}
 */
function detectLinkedInHiring(results) {
  const hiringKeywords = ["hiring", "job", "jobs", "careers", "position", "opening"];

  for (const r of results) {
    const link    = (r.link    ?? "").toLowerCase();
    const snippet = (r.snippet ?? "").toLowerCase();
    const title   = (r.title   ?? "").toLowerCase();

    if (!link.includes("linkedin.com")) continue;

    const isJobRelated = hiringKeywords.some(
      (kw) => snippet.includes(kw) || title.includes(kw) || link.includes("/jobs/")
    );
    if (isJobRelated) {
      return { found: true, url: r.link, snippet: r.snippet };
    }
  }
  return { found: false, url: "", snippet: "" };
}

/**
 * Check LinkedIn for hiring signals for a given business and city.
 *
 * @param {{ businessName: string, city?: string }} record
 * @returns {Promise<{
 *   hiringSignalFound: boolean,
 *   linkedinUrl: string,
 *   signals: string[]
 * }>}
 */
export async function checkLinkedInHiring(record) {
  const { businessName, city = "Palm Beach County" } = record;
  if (!businessName) return { hiringSignalFound: false, linkedinUrl: "", signals: [] };

  const query = `"${businessName}" LinkedIn hiring "${city}"`;

  let results;
  if (GOOGLE_SEARCH_BACKEND === "serpapi" && SERPAPI_KEY) {
    results = await serpLinkedInSearch(query);
  } else {
    results = await playwrightLinkedInSearch(query);
  }

  const { found, url } = detectLinkedInHiring(results);

  return {
    hiringSignalFound: found,
    linkedinUrl:       url,
    signals:           found ? ["hiring"] : [],
  };
}

