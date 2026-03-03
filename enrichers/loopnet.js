import { chromium } from "playwright";

const LOOPNET_SEARCH_BASE = "https://www.loopnet.com/search/commercial-real-estate";

/**
 * Build a LoopNet search URL for a given address.
 * LoopNet's public search accepts a ?sk= (search keyword) query parameter.
 * @param {string} address
 * @returns {string}
 */
function buildLoopNetUrl(address) {
  const url = new URL(LOOPNET_SEARCH_BASE);
  url.searchParams.set("sk", address);
  return url.toString();
}

/**
 * Parse tenant listing cards from a LoopNet search results page.
 * LoopNet renders results client-side; this targets the listing cards
 * that contain tenant / lease information.
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<Array<{ tenantName: string, leaseDate: string, businessType: string, url: string }>>}
 */
async function parseLoopNetResults(page) {
  return page.evaluate(() => {
    const listings = [];

    // LoopNet listing cards — selectors may shift across releases;
    // we target the most stable data-testid and class patterns.
    const cards = document.querySelectorAll(
      "[data-testid='listing-card'], .placard, .listing-item"
    );

    cards.forEach((card) => {
      const tenantEl      = card.querySelector(".placard-title, h4, [data-testid='listing-name']");
      const dateEl        = card.querySelector(".placard-tagline, [data-testid='available-date'], .lease-date");
      const typeEl        = card.querySelector(".placard-type, [data-testid='property-type'], .property-type");
      const anchorEl      = card.querySelector("a[href]");

      const tenantName  = tenantEl  ? tenantEl.innerText.trim()  : "";
      const leaseDate   = dateEl    ? dateEl.innerText.trim()    : "";
      const businessType = typeEl   ? typeEl.innerText.trim()    : "";
      const url         = anchorEl  ? anchorEl.href              : "";

      if (tenantName || url) {
        listings.push({ tenantName, leaseDate, businessType, url });
      }
    });

    return listings;
  });
}

/**
 * Scrape LoopNet for new tenant / lease information at a given address.
 *
 * @param {{ address: string }} record
 * @returns {Promise<{
 *   tenantName: string,
 *   leaseDate: string,
 *   businessType: string,
 *   loopnetUrl: string,
 *   signals: string[]
 * }>}
 */
export async function scrapeLoopNet(record) {
  const { address } = record;

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
    await page.setViewportSize({ width: 1280, height: 800 });

    const searchUrl = buildLoopNetUrl(address);
    await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 45_000 });

    // Dismiss cookie / GDPR banners if present
    const dismissBtn = page.locator("button:has-text('Accept'), button:has-text('OK')").first();
    if (await dismissBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await dismissBtn.click();
    }

    // Wait for listing cards or a "no results" indicator
    await page
      .waitForSelector("[data-testid='listing-card'], .placard, .no-results", { timeout: 20_000 })
      .catch(() => { /* no listings is acceptable */ });

    const listings = await parseLoopNetResults(page);

    if (!listings.length) {
      return { tenantName: "", leaseDate: "", businessType: "", loopnetUrl: searchUrl, signals: [] };
    }

    // Use the first (most relevant) result
    const best = listings[0];
    const signals = best.tenantName ? ["loopnet new tenant"] : [];

    return {
      tenantName:   best.tenantName,
      leaseDate:    best.leaseDate,
      businessType: best.businessType,
      loopnetUrl:   best.url || searchUrl,
      signals,
    };
  } finally {
    await browser.close();
  }
}

