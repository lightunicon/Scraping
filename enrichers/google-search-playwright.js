import { chromium } from "playwright";

/** Keywords that indicate business opening signals */
const SIGNAL_KEYWORDS = ["coming soon", "grand opening", "now open", "opening soon", "hiring", "we're hiring"];

/**
 * Parse organic result elements from a rendered Google SERP page.
 * @param {import("playwright").Page} page
 * @returns {Promise<Array<{ title: string, link: string, snippet: string }>>}
 */
async function parseResults(page) {
  return page.evaluate(() => {
    const results = [];
    // Each organic result lives in a <div> with data-hveid and a child <a>
    document.querySelectorAll("div.g, div[data-hveid]").forEach((el) => {
      const anchor  = el.querySelector("a[href]");
      const titleEl = el.querySelector("h3");
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
}

/**
 * Extract social links and opening signals from parsed result objects.
 * @param {Array<{ title: string, link: string, snippet: string }>} results
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
 * Run a Google search via Playwright and return parsed organic results.
 * @param {import("playwright").BrowserContext} ctx
 * @param {string} query
 * @returns {Promise<Array<{ title: string, link: string, snippet: string }>>}
 */
async function playwrightSearch(ctx, query) {
  const page = await ctx.newPage();
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=en&gl=us`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // Dismiss cookie / consent dialogs if present
    const consentBtn = page.locator("button:has-text('Accept all'), button:has-text('I agree')").first();
    if (await consentBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await consentBtn.click();
    }
    await page.waitForSelector("div.g, #search", { timeout: 15_000 });
    return parseResults(page);
  } finally {
    await page.close();
  }
}

/**
 * Enrich a permit record using Playwright Google searches (no API key needed).
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
  const { address, plazaName } = record;

  const queries = [
    `"${address}" new business`,
    `"${address}" coming soon`,
    ...(plazaName ? [`"${plazaName}" new tenant`] : []),
  ];

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const ctx = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    // Run all queries sequentially to avoid IP-level rate limiting
    const allResults = [];
    for (const q of queries) {
      const results = await playwrightSearch(ctx, q);
      allResults.push(...results);
      // Polite delay between requests
      await new Promise((r) => setTimeout(r, 1_500));
    }

    const { instagram, facebook, linkedin, signals } = extractFromResults(allResults);

    const nameResult = allResults.find((r) => {
      const link = (r.link ?? "").toLowerCase();
      return (
        !link.includes("instagram.com") &&
        !link.includes("facebook.com")  &&
        !link.includes("linkedin.com")  &&
        !link.includes("google.com/maps")
      );
    });

    return {
      businessName: nameResult?.title ?? "",
      website:      nameResult?.link  ?? "",
      instagram,
      facebook,
      linkedin,
      signals,
    };
  } finally {
    await browser.close();
  }
}

