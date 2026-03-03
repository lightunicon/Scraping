import { scrapeBocaBusinessFiles } from "../scrapers/boca-scraper.js";

/**
 Handles POST /api/boca/new-business-files
 @param {import("http").IncomingMessage} req
 @param {import("http").ServerResponse}  res
 @param {(res: import("http").ServerResponse, status: number, payload: object) => void} sendJson
 */
export async function handleNewBusinessFiles(req, res, sendJson) {
  try {
    const result = await scrapeBocaBusinessFiles({ headless: true });
    sendJson(res, 200, {
      success: true,
      links: result.links,
      savedPaths: result.savedPaths,
    });
  } catch (err) {
    console.error("Boca scrape failed:", err);
    sendJson(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
@param {import("http").IncomingMessage} req
@param {import("http").ServerResponse}  res
@param {(res: import("http").ServerResponse, status: number, payload: object) => void} sendJson
 */
export function handleHealthCheck(req, res, sendJson) {
  sendJson(res, 200, { ok: true, message: "Boca scraper API is running" });
}

